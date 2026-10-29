"""The 1MDB demo case: a real, closed investigation built from 11 core public records
(app/demo/one_mdb/documents.json) so every part of the app can be checked on
real material (Ony, 11 Oct 2026).

Loading it:

1. downloads each document from its public address (US court filings, the
   Goldman Sachs agreement, a Federal Reserve order, MAS and FINMA releases);
   PDFs must match their pinned sha256, so the case is the same everywhere;
2. saves each one as a document of a new investigation, the way an upload is;
3. adds the records drawn from them (app/demo/one_mdb/case.json): parties,
   companies, accounts and assets; ownership, roles and payments; dated events;
   claims with the evidence for and against them; leads and a watchlist. Every
   piece of evidence is an exact quote with its page or paragraph;
4. reads the documents as background jobs, as an upload does, so their pages,
   proposals and To check passages arrive while the reporter looks around.

The records are the documents' own: allegations in the civil complaints stay
"not yet shown"; what Goldman admitted, Leissner pleaded to, or a regulator found
is "supported". No conclusion goes beyond them.

More of the case (app/demo/one_mdb/more.json and files/, 11 Oct 2026) gives every
part of the app real material: pictures with the day they were taken (the
Equanimity before and after), a news video and a podcast, news articles (some
against the case's account), social posts (leads only), French, German and Malay
documents, scanned Malaysian judgments for OCR, Swiss and Singapore judgments,
emails rebuilt word for word from the US filings' quotes (with a .zip and an
.mbox thread), a Word conversion, the DOJ payments table (mapped to proposals),
and the records drawn from them: registry values on the parties, places with
coordinates, payments in five currencies, ranged and disputed dates, graded
claims, disputed and superseded links, and leads with next actions.

Copyrighted material is fetched from its own address at load and never stored
with the app; files/ holds only public-domain text and pictures and the
Workbench's own transcriptions. A file that does not arrive, or is not the file
expected, stays in the case as a link with a note saying why: the extra material
never stops the case from loading.
"""

from __future__ import annotations

import functools
import hashlib
import json
import logging
import re
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.domain import (
    Claim,
    Document,
    Entity,
    Evidence,
    Investigation,
    Lead,
    Source,
    Statement,
)
from app.schemas.api import (
    ClaimCreate,
    EntityCreate,
    InvestigationCreate,
    LeadCreate,
    LeadLinkCreate,
    TimelineEventCreate,
)

logger = logging.getLogger("journalism.demo")

ROOT = Path(__file__).resolve().parents[1] / "demo" / "one_mdb"
NAME = "1MDB"
# Wikimedia's robot policy (https://w.wiki/4wJS) refuses a client that does not say where it comes from.
USER_AGENT = "JournalismWorkbench/1.0 (demo case loader; public records; https://github.com/onysnow/Private-ai)"

Fetch = Callable[[str], bytes]


def manifest() -> list[dict[str, Any]]:
    return list(json.loads((ROOT / "documents.json").read_text(encoding="utf-8"))["documents"])


def records() -> dict[str, Any]:
    data: dict[str, Any] = json.loads((ROOT / "case.json").read_text(encoding="utf-8"))
    return data


def more() -> dict[str, Any]:
    """The rest of the case (app/demo/one_mdb/more.json): its documents and the records drawn from them."""
    return _more()


@functools.lru_cache(maxsize=1)
def _more() -> dict[str, Any]:
    data: dict[str, Any] = json.loads((ROOT / "more.json").read_text(encoding="utf-8"))
    return data


def more_manifest() -> list[dict[str, Any]]:
    return list(more()["documents"])


FILES = ROOT / "files"


# Hosts that refuse bursts (Wikimedia's image servers answer 429 to a client
# that asks too fast): one request at a time, a few seconds apart.
SLOW_HOSTS = {"upload.wikimedia.org": 3.0}
_host_locks: dict[str, threading.Lock] = {host: threading.Lock() for host in SLOW_HOSTS}
_host_last: dict[str, float] = {}


def download(url: str) -> bytes:
    """The file at a fixed public address, recorded in the log of what leaves this computer (only the request for a
    public file goes out; nothing from a case)."""
    from app.services.outbound import record_platform_request

    try:
        data = _download(url)
    except Exception as exc:
        record_platform_request(None, kind="download", service="demo case", destination=url, sent=f"a request for {url}",
                        outcome="failed", detail=str(exc))
        raise
    record_platform_request(None, kind="download", service="demo case", destination=url, sent=f"a request for {url}")
    return data


def _download(url: str) -> bytes:
    """The file at a fixed public address. A busy server (HTTP 429 or 503) is
    asked again, a few times, after the wait it asks for."""
    from urllib.parse import urlparse

    host = urlparse(url).hostname or ""
    for attempt in range(5):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            if host in SLOW_HOSTS:
                with _host_locks[host]:
                    pause = SLOW_HOSTS[host] - (time.monotonic() - _host_last.get(host, 0.0))
                    if pause > 0:
                        time.sleep(pause)
                    try:
                        with urllib.request.urlopen(request, timeout=120) as reply:  # noqa: S310 - fixed public addresses
                            data: bytes = reply.read()
                    finally:
                        _host_last[host] = time.monotonic()
            else:
                with urllib.request.urlopen(request, timeout=120) as reply:  # noqa: S310 - fixed public addresses from documents.json / more.json
                    data = reply.read()
            return data
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 503) or attempt == 4:
                raise
            wait = exc.headers.get("Retry-After") if exc.headers else None
            time.sleep(min(float(wait) if wait and wait.isdigit() else 10.0 * (attempt + 1), 60.0))
    raise RuntimeError("unreachable")


class DemoDownloadError(RuntimeError):
    """A document could not be fetched, or was not the pinned file."""


def _quotes_by_document() -> dict[str, list[str]]:
    case = records()
    out: dict[str, list[str]] = {}
    groups = [e.get("evidence") or [] for e in case["entities"]] + [r.get("evidence") or [] for r in case["relationships"]] \
        + [[ev["evidence"]] for ev in case["events"]] + [c.get("evidence") or [] for c in case["claims"]]
    for quotes in groups:
        for q in quotes:
            out.setdefault(q["doc"], []).append(q["quote"])
    return out


def _squash(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def is_expected_page(doc: dict[str, Any], data: bytes, quotes: list[str]) -> bool:
    """A web page has no fixed fingerprint (sites re-render them), so it is the
    page we expect when it still says what the case quotes from it. Found on the
    1MDB case: mas.gov.sg sometimes answers an automated download with a "Sorry,
    this service is currently unavailable" page, which was read in as the
    document."""
    from app.services.html_reader import html_blocks
    text = _squash(" ".join(html_blocks(data.decode("utf-8", "replace"))))
    return bool(text) and all(_squash(q) in text for q in quotes)


def fetch_documents(fetch: Fetch = download, on_fetched: Callable[[], None] = lambda: None) -> list[tuple[dict[str, Any], bytes | None]]:
    """Every document's bytes. A PDF must match its pinned hash or loading
    stops. A web page that did not arrive as the expected page comes back as
    None: the case keeps it as a link to the publisher, and its quotes still
    stand, but there is nothing to read. ``on_fetched`` is called once per
    document, whether it arrived or not, for the screen's loading bar."""
    quotes = _quotes_by_document()
    out: list[tuple[dict[str, Any], bytes | None]] = []
    for doc in manifest():
        on_fetched()
        pinned = bool(doc.get("sha256"))
        try:
            data = fetch(doc["url"])
        except Exception as exc:  # network, HTTP error
            if not pinned:
                logger.warning("1MDB demo: %s could not be downloaded (%s); kept as a link", doc["url"], exc)
                out.append((doc, None))
                continue
            raise DemoDownloadError(f"Could not download {doc['title']} from {doc['url']}: {exc}") from exc
        if pinned and hashlib.sha256(data).hexdigest() != doc["sha256"]:
            raise DemoDownloadError(f"{doc['url']} is not the expected file (its fingerprint differs); the publisher may have replaced it")
        if not data and pinned:
            raise DemoDownloadError(f"{doc['url']} answered with an empty file")
        if not pinned and not is_expected_page(doc, data, quotes.get(doc["id"], [])):
            logger.warning("1MDB demo: %s did not answer with the expected page; kept as a link", doc["url"])
            out.append((doc, None))
            continue
        out.append((doc, data))
    return out + fetch_more(fetch, on_fetched)


def _fetch_one(doc: dict[str, Any], fetch: Fetch) -> tuple[dict[str, Any], bytes | None]:
    """One document of more.json: shipped with the app, fetched from its
    address, or a link. Never raises: a file that is missing, too large, not
    the pinned file or not the expected page comes back as None, with the
    reason in ``_why`` for the record's note."""
    from app.core.config import settings

    meta = {**doc, "_more": True}
    if doc["mode"] == "link":
        return meta, None
    if doc["mode"] == "ship":
        path = FILES / (doc.get("path") or doc["filename"])
        try:
            data = path.read_bytes()
        except OSError as exc:
            meta["_why"] = f"The file shipped with the app is missing ({exc.__class__.__name__})."
            return meta, None
        if doc.get("sha256") and hashlib.sha256(data).hexdigest() != doc["sha256"]:
            meta["_why"] = "The file shipped with the app is not the one recorded (its fingerprint differs)."
            return meta, None
        return meta, data
    try:
        data = fetch(doc["url"])
    except Exception as exc:  # network, HTTP error: the case loads without it
        meta["_why"] = f"Could not be downloaded when the case was loaded ({exc}); open it at its address."
        logger.warning("1MDB demo: %s could not be downloaded (%s); kept as a link", doc["url"], exc)
        return meta, None
    if not data:
        meta["_why"] = "The address answered with an empty file; open it at its address."
        return meta, None
    if len(data) > settings.max_document_bytes:
        meta["_why"] = f"The file is {len(data) // 1_000_000} MB, more than the app's document limit; open it at its address."
        return meta, None
    if doc.get("mime") == "application/pdf" and not data.startswith(b"%PDF"):
        meta["_why"] = "The address answered with something that is not a PDF (a block or error page); open it at its address."
        return meta, None
    digest = hashlib.sha256(data).hexdigest()
    if doc.get("hash") == "pin" and doc.get("sha256") and digest != doc["sha256"]:
        meta["_why"] = "The address answered with a different file from the one this case was built on (its fingerprint differs); open it at its address."
        return meta, None
    if doc.get("hash") == "record":
        meta["_fetched_sha256"] = digest
        if doc.get("sha256") and digest != doc["sha256"]:
            meta["_hash_note"] = (f"Fingerprint when the case was built: {doc['sha256']}; fetched now: {digest}. "
                                  "Pages and transcodes change, so the fetched one is recorded rather than checked.")
    if doc.get("mime") == "text/html" and doc.get("check_quotes") and not is_expected_page(doc, data, doc["check_quotes"]):
        meta["_why"] = "The publisher did not answer with the page when the case was loaded (the quoted words are not on it); open it at its address."
        return meta, None
    return meta, data


def fetch_more(fetch: Fetch = download, on_fetched: Callable[[], None] = lambda: None) -> list[tuple[dict[str, Any], bytes | None]]:
    """Every more.json document, fetched a few at a time, in manifest order."""
    def one(doc: dict[str, Any]) -> tuple[dict[str, Any], bytes | None]:
        try:
            return _fetch_one(doc, fetch)
        finally:
            on_fetched()
    with ThreadPoolExecutor(max_workers=4) as pool:
        return list(pool.map(one, more_manifest()))


def to_fetch() -> int:
    """How many documents a load goes through, for the loading bar."""
    return len(manifest()) + len(more_manifest())


# What the last build had to adjust (a record the app refused), for the log and the tests.
LAST_PROBLEMS: list[str] = []


def existing(db: Session) -> Investigation | None:
    return db.scalar(select(Investigation).where(Investigation.name == NAME, Investigation.is_demo.is_(True)))


def _origin(document: Document, locator: str) -> str:
    return f"document:{document.id}#{locator}"


def build(db: Session, documents: list[tuple[dict[str, Any], bytes | None]], *, storage_dir: Path) -> tuple[Investigation, list[str]]:
    """Make the investigation, its documents and its records. Returns the
    investigation and the ids of the documents still to be read."""
    from app.services.claims import create_claim, link_claim_evidence, review_claim
    from app.services.documents import store_document
    from app.services.entities import create_entity
    from app.services.evidence import create_evidence
    from app.services.investigations import create_investigation
    from app.services.leads import create_lead, update_lead
    from app.services.relationships import (
        attach_relationship_evidence,
        create_relationship,
        review_relationship_evidence,
    )
    from app.services.timeline import create_timeline_event
    from app.services.watchlists import add_entry

    case = records()
    inv = create_investigation(db, InvestigationCreate(name=NAME, description=case["investigation"]["description"],
                                                       question=case["investigation"]["question"]))
    inv.is_demo = True
    db.commit()

    docs: dict[str, Document] = {}
    source_ids: dict[str, str] = {}
    where_of: dict[str, str] = {}
    admitted: set[str] = set()
    extra: list[tuple[dict[str, Any], bytes | None]] = []
    for meta, data in documents:
        if meta.get("_more"):
            extra.append((meta, data))
            continue
        where_of[meta["id"]] = meta["filename"] if data is not None else meta["url"]
        if meta.get("admitted"):
            admitted.add(meta["id"])
        if data is None:  # not downloaded: the publisher's page stands as the source
            link = Source(investigation_id=inv.id, title=meta["title"], url=meta["url"], source_type=meta.get("source_type", "public_record"),
                         metadata_json={"publisher": meta["publisher"], "date": meta["date"], "licence": meta["licence_note"], "demo": "1mdb",
                                        "not_downloaded": "The publisher did not answer with the page when the case was loaded; open it at its address."})
            db.add(link)
            db.flush()
            source_ids[meta["id"]] = link.id
            continue
        mime = "text/html" if meta["filename"].endswith(".html") else "application/pdf"
        doc = store_document(db, investigation_id=inv.id, title=meta["title"], filename=meta["filename"], mime_type=mime, data=data,
                             storage_dir=storage_dir, source_metadata={"url": meta["url"], "publisher": meta["publisher"], "date": meta["date"],
                                                                       "licence": meta["licence_note"], "demo": "1mdb"})
        source = db.get(Source, doc.source_id)
        if source is not None:
            source.url = meta["url"]
            source.source_type = meta.get("source_type", "public_record")
            # The suite's tier (TAS): the record of an authority's own action, or an admission, is a primary official
            # record (A); a complaint, indictment or affidavit is a party's sworn assertion, testimony to corroborate
            # (B). So an allegation alone can make a claim Supported but never Confirmed (DECISIONS_LOG, 29 Oct).
            source.source_tier = "A" if meta.get("admitted") else "B"
        docs[meta["id"]] = doc
        source_ids[meta["id"]] = doc.source_id
    db.commit()
    pictures = _store_more(db, inv, extra, storage_dir=storage_dir, docs=docs, source_ids=source_ids, where_of=where_of)

    def origin(q: dict[str, str] | None) -> str | None:
        if not q:
            return None
        if q["doc"] in docs:
            return _origin(docs[q["doc"]], q["locator"])
        return f"source:{source_ids[q['doc']]}#{q['locator']}" if q["doc"] in source_ids else None

    evidence_cache: dict[tuple[str, str, str], str] = {}

    def evidence(q: dict[str, str]) -> str:
        key = (q["doc"], q["locator"], q["quote"])
        if key not in evidence_cache:
            where = docs[q["doc"]].filename if q["doc"] in docs else where_of.get(q["doc"]) or q["doc"]
            row = create_evidence(db, {"source_id": source_ids[q["doc"]], "quote": q["quote"], "locator": q["locator"],
                                       "notes": f"Quoted from {where}, {q['locator']}." + (f" {q['match']}." if q.get("match") else "")})
            evidence_cache[key] = row.id
        return evidence_cache[key]

    problems: list[str] = []
    entities: dict[str, Entity] = {}
    for e in case["entities"]:
        first = (e.get("evidence") or [None])[0]
        props = {k: [str(v) for v in vs] for k, vs in (e.get("properties") or {}).items()}
        try:
            row = create_entity(db, EntityCreate(investigation_id=inv.id, schema=e["schema"], caption=e["caption"], properties=props,
                                                 dataset="1mdb-demo", origin=origin(first)))
        except Exception as exc:  # a property the schema does not take: keep the record, drop the property
            db.rollback()
            problems.append(f"{e['caption']}: {exc}")
            row = create_entity(db, EntityCreate(investigation_id=inv.id, schema=e["schema"], caption=e["caption"], properties={},
                                                 dataset="1mdb-demo", origin=origin(first)))
        entities[e["key"]] = row
        for q in e.get("evidence") or []:
            evidence(q)

    edges: list[Any] = []
    for r in case["relationships"]:
        edges.append(None)
        props = {k: [str(v) for v in vs] for k, vs in (r.get("properties") or {}).items()}
        quotes = r.get("evidence") or []
        try:
            edge = create_relationship(db, investigation_id=inv.id, schema=r["schema"], source_entity_id=entities[r["source"]].id,
                                       target_entity_id=entities[r["target"]].id, properties=props, dataset="1mdb-demo",
                                       origin=origin(quotes[0] if quotes else None))
        except Exception as exc:
            db.rollback()
            problems.append(f"{r['schema']} {r['source']} → {r['target']}: {exc}")
            continue
        edges[-1] = edge
        for q in quotes:
            ev_id = evidence(q)
            attach_relationship_evidence(db, edge, evidence_id=ev_id, note=r.get("note"))
            kind = "admitted or found by a regulator" if q["doc"] in admitted else "alleged in a public court filing"
            review_relationship_evidence(db, edge, evidence_id=ev_id, stance="supports",
                                         rationale=f"Demo case: the quoted passage states this link ({kind}).")

    for ev in case["events"]:
        q = ev["evidence"]
        precision = ev.get("precision") or "day"
        status = "approximate" if precision != "day" else ("verified" if q["doc"] in admitted else "asserted")
        try:
            create_timeline_event(db, TimelineEventCreate(
                investigation_id=inv.id, title=ev["title"], description=ev.get("description"), date_start=ev["date"], precision=precision,
                verification_status=status, entity_id=entities[ev["entity"]].id if ev.get("entity") in entities else None,
                source_id=source_ids[q["doc"]], evidence_id=evidence(q), dataset="1mdb-demo"))
        except Exception as exc:
            db.rollback()
            problems.append(f"event {ev['title']}: {exc}")

    claim_rows: list[Claim] = []
    for c in case["claims"]:
        claim = create_claim(db, ClaimCreate(investigation_id=inv.id, text=c["text"], status="lead" if c["status"] == "lead" else "unverified",
                                             confidence=0.0))
        claim_rows.append(claim)
        for q in c.get("evidence") or []:
            ev_row = db.get(Evidence, evidence(q))
            assert ev_row is not None
            note = c["rationale"] if q.get("stance") == "contradicts" else None
            link_claim_evidence(db, claim, ev_row, stance=q.get("stance", "supports"), note=note)
        if c["status"] in ("supported", "disputed"):
            try:
                review_claim(db, claim, status=c["status"], confidence=0.8 if c["status"] == "supported" else 0.4,
                             rationale=f"Demo case: {c['rationale']}")
            except ValueError as exc:  # a Done rule the stored records cannot meet yet
                problems.append(f"claim {c['text'][:60]}: {exc}")

    lead_rows: dict[str, Lead] = {}
    for item in case.get("leads") or []:
        lead = create_lead(db, LeadCreate(investigation_id=inv.id, title=item["title"], detail=item.get("detail")))
        lead_rows[item["title"]] = lead
        if item.get("priority"):
            update_lead(db, lead, {"priority": item["priority"]})

    for name in case.get("watchlist") or []:
        add_entry(db, inv.id, query=name, note="1MDB demo watchlist", created_by=None)

    _build_more(db, inv, docs=docs, source_ids=source_ids, entities=entities, edges=edges, claim_rows=claim_rows, lead_rows=lead_rows,
                pictures=pictures, evidence=evidence, origin=origin, problems=problems)

    LAST_PROBLEMS[:] = problems
    if problems:
        logger.warning("1MDB demo: %d record(s) adjusted: %s", len(problems), "; ".join(problems[:10]))
    db.commit()
    # Read the small files first: the 810-page scanned judgment goes last, so OCR on it does not hold up the rest.
    ordered = sorted(docs.values(), key=lambda d: (d.parent_document_id is not None, _size(d)))
    return inv, [d.id for d in ordered]


def _size(doc: Document) -> int:
    try:
        return Path(doc.storage_path).stat().st_size
    except OSError:
        return 0


# --- The rest of the case (more.json) ------------------------------------------------------------------

# The DOJ payments table, mapped as a reporter would map it (app/services/table_mappings.py):
# a payer and a payee per row and the Payment between them. What it makes are proposals to review.
TABLE_MAPPING = {
    "payer": {"schema": "LegalEntity", "keys": ["payer"], "properties": {"name": {"column": "payer"}}},
    "payee": {"schema": "LegalEntity", "keys": ["payee"], "properties": {"name": {"column": "payee"}}},
    "payment": {"schema": "Payment", "keys": ["date", "payer", "payee", "amount"],
                "properties": {"payer": {"entity": "payer"}, "beneficiary": {"entity": "payee"}, "amount": {"column": "amount"},
                               "currency": {"column": "currency"}, "date": {"column": "date"}, "purpose": {"column": "purpose"}}},
}
CONFIDENCE = {"confirmed": 0.9, "supported": 0.8, "disputed": 0.4, "rejected": 0.05}
OVERRIDE = ("Demo case: graded from the records when the case was loaded, before its documents were read; "
            "a reporter's own review runs the Done rules again.")


def _source_metadata(meta: dict[str, Any]) -> dict[str, Any]:
    """What the app has no column for (a document's kind and language, a
    picture's licence and place, a page's fingerprint when fetched), kept on
    its Source."""
    keep = ("kind", "language", "publisher", "date", "author", "licence", "licence_url", "landing_url", "caption", "place", "captured_on",
            "stance", "stance_note", "text", "live", "scanned", "pages", "rebuilt_from")
    out = {k: meta[k] for k in keep if meta.get(k) not in (None, "", [])}
    out["demo"] = "1mdb"
    if meta.get("url"):
        out["url"] = meta["url"]
    notes = [x for x in (meta.get("note"), meta.get("_hash_note")) if x]
    if notes:
        out["note"] = " ".join(notes)
    if meta.get("_fetched_sha256"):
        out["fetched_sha256"] = meta["_fetched_sha256"]
    return out


def _store_more(db: Session, inv: Investigation, extra: list[tuple[dict[str, Any], bytes | None]], *, storage_dir: Path,
                docs: dict[str, Document], source_ids: dict[str, str], where_of: dict[str, str]) -> dict[str, str]:
    """Save more.json's documents (or keep them as links) and its web
    sources. Returns the evidence id of each picture (its caption, and the
    day it was taken when the picture itself is held)."""
    from app.services.documents import store_document
    from app.services.image_reader import NotAPicture, picture_of

    given = {meta["id"]: (meta, data) for meta, data in extra}
    pictures: dict[str, str] = {}
    for doc in more_manifest():
        meta, data = given.get(doc["id"], ({**doc, "_more": True, "_why": None if doc["mode"] == "link" else "Not fetched for this load."}, None))
        metadata = _source_metadata(meta)
        if data is None:
            if meta.get("_why"):
                metadata["not_downloaded"] = meta["_why"]
            else:
                metadata["link_only"] = meta.get("note") or "Kept as a link to its address."
            link = Source(investigation_id=inv.id, title=meta["title"], url=meta.get("url") or meta.get("landing_url"),
                          source_type=meta.get("source_type", "web"), metadata_json=metadata)
            db.add(link)
            db.flush()
            source_ids[meta["id"]] = link.id
            where_of[meta["id"]] = meta.get("url") or meta["title"]
        else:
            row = store_document(db, investigation_id=inv.id, title=meta["title"], filename=meta["filename"], mime_type=meta.get("mime"), data=data,
                                 storage_dir=storage_dir, source_metadata=metadata)
            source = db.get(Source, row.source_id)
            if source is not None:
                source.url = meta.get("url") or meta.get("landing_url")
                source.source_type = meta.get("source_type", "web")
                if meta.get("email"):
                    # The headers as OpenAleph keeps them (jobs/handlers.py), so the email shows them before it is read.
                    source.metadata_json = {**(source.metadata_json or {}), "email": meta["email"]}
            docs[meta["id"]] = row
            source_ids[meta["id"]] = row.source_id
            where_of[meta["id"]] = meta["filename"]
        if meta["kind"] == "photo":
            held = False
            if data is not None:
                try:
                    picture_of(data)
                    held = True
                except NotAPicture:
                    held = False
            notes = " ".join(x for x in (f"{meta.get('licence')}, {meta.get('author')}." if meta.get("licence") else None,
                                         f"Place: {meta['place']}." if meta.get("place") else None, meta.get("note")) if x)
            ev_row = Evidence(source_id=source_ids[meta["id"]], quote=meta["caption"], locator="the picture", notes=notes or None,
                              document_id=docs[meta["id"]].id if held else None, captured_on=meta.get("captured_on") if held else None)
            db.add(ev_row)
            db.flush()
            pictures[meta["id"]] = ev_row.id
    for web in more()["web_sources"]:
        link = Source(investigation_id=inv.id, title=web["title"], url=web["url"], source_type=web["source_type"],
                      metadata_json={"kind": web["kind"], "publisher": web["publisher"], "demo": "1mdb", "link_only": web["note"]})
        db.add(link)
        db.flush()
        source_ids[web["id"]] = link.id
        where_of[web["id"]] = web["url"]
    db.commit()
    return pictures


def _build_more(db: Session, inv: Investigation, *, docs: dict[str, Document], source_ids: dict[str, str], entities: dict[str, Entity],
                edges: list[Any], claim_rows: list[Claim], lead_rows: dict[str, Lead], pictures: dict[str, str],
                evidence: Callable[[dict[str, str]], str], origin: Callable[[dict[str, str] | None], str | None], problems: list[str]) -> None:
    """more.json's records, on top of the case's own."""
    from app.services.claims import create_claim, link_claim_evidence, review_claim
    from app.services.entities import create_entity
    from app.services.leads import create_lead, create_lead_link, update_lead
    from app.services.relationships import (
        attach_relationship_evidence,
        create_relationship,
        review_relationship_evidence,
    )
    from app.services.table_mappings import run_mapping
    from app.services.timeline import create_timeline_event

    data = more()

    def ev_id(ref: dict[str, Any]) -> str:
        if "picture" in ref:
            return pictures[ref["picture"]]
        return evidence(ref)

    def source_of(ref: dict[str, Any]) -> str:
        if "picture" in ref:
            return source_ids[ref["picture"]]
        return source_ids[ref["doc"]]

    # Parties: the new records, then every researched value with the quote that gives it.
    for e in data["entities"]:
        first = (e.get("evidence") or [None])[0]
        try:
            row = create_entity(db, EntityCreate(investigation_id=inv.id, schema=e["schema"], caption=e["caption"], properties=e["properties"],
                                                 dataset="1mdb-demo", origin=origin(first)))
        except Exception as exc:
            db.rollback()
            problems.append(f"{e['caption']}: {exc}")
            continue
        entities[e["key"]] = row
        for q in e.get("evidence") or []:
            evidence(q)
    for v in data["values"]:
        holder = entities.get(v["entity"])
        if holder is None:
            continue
        evidence_id = evidence(v["evidence"])
        row = holder
        props = {k: list(vs) for k, vs in (row.properties or {}).items()}
        if v["value"] not in props.setdefault(v["prop"], []):
            props[v["prop"]].append(v["value"])
            row.properties = props
        db.add(Statement(entity_id=row.id, prop=v["prop"], value=v["value"], dataset="1mdb-demo", origin=origin(v["evidence"]),
                         original_value=v["value"]))
        ev_row = db.get(Evidence, evidence_id)
        if ev_row is not None and v.get("note") and v["note"] not in (ev_row.notes or ""):
            ev_row.notes = f"{ev_row.notes or ''} {v['note']}".strip()
    db.commit()

    def link(schema: str, source_key: str, target_key: str, props: dict[str, list[str]], quotes: list[dict[str, Any]], note: str | None) -> Any:
        try:
            edge = create_relationship(db, investigation_id=inv.id, schema=schema, source_entity_id=entities[source_key].id,
                                       target_entity_id=entities[target_key].id, properties=props, dataset="1mdb-demo",
                                       origin=origin(next((q for q in quotes if "doc" in q), None)))
        except Exception as exc:
            db.rollback()
            problems.append(f"{schema} {source_key} → {target_key}: {exc}")
            return None
        attach(edge, quotes, note)
        return edge

    def attach(edge: Any, quotes: list[dict[str, Any]], note: str | None, rationale: str | None = None) -> None:
        for q in quotes:
            evidence_id = ev_id(q)
            attach_relationship_evidence(db, edge, evidence_id=evidence_id, note=note)
            review_relationship_evidence(db, edge, evidence_id=evidence_id, stance=q.get("stance", "supports"),
                                         rationale=q.get("rationale") or rationale or f"Demo case: the quoted passage {'states' if q.get('stance', 'supports') == 'supports' else 'bears on'} this link.")

    # Places: an address with its coordinates, and what is there.
    for place in data["places"]:
        try:
            row = create_entity(db, EntityCreate(investigation_id=inv.id, schema="Address", caption=place["caption"], properties=place["properties"],
                                                 dataset="1mdb-demo", origin=origin((place.get("evidence") or [None])[0])))
        except Exception as exc:
            db.rollback()
            problems.append(f"place {place['caption']}: {exc}")
            continue
        entities[place["key"]] = row
        for q in place.get("evidence") or []:
            evidence(q)
        if place.get("link") and place["link"]["entity"] in entities and place["link"]["evidence"]:
            q = dict(place["link"]["evidence"], stance="supports")
            link("UnknownLink", place["link"]["entity"], place["key"], {"role": [place["link"]["role"]]}, [q], None)

    # Payments and other links, then the case's own links' further evidence (disputed, superseded).
    by_id: dict[str, Any] = {}
    for r in data["relationships"]:
        edge = link(r["schema"], r["source"], r["target"], r["properties"], r["evidence"], r.get("note"))
        if r.get("id") and edge is not None:
            by_id[r["id"]] = edge
    for item in data["link_evidence"]:
        edge = edges[item["case_index"]] if item["case_index"] < len(edges) else None
        if edge is not None:
            attach(edge, item["evidence"], None, item.get("rationale"))

    # Dated events: ranges, months and years as their sources give them; versions that disagree are disputed.
    for ev in data["events"]:
        ref = ev["evidence"]
        try:
            create_timeline_event(db, TimelineEventCreate(
                investigation_id=inv.id, title=ev["title"], description=ev.get("description"), date_start=ev["date"], date_end=ev.get("date_end"),
                precision=ev["precision"], verification_status=ev["status"], entity_id=entities[ev["entity"]].id if ev.get("entity") in entities else None,
                source_id=source_of(ref), evidence_id=ev_id(ref), dataset="1mdb-demo"))
        except Exception as exc:
            db.rollback()
            problems.append(f"event {ev['title']}: {exc}")

    # Claims: new ones graded, inferred identities left unverified or as leads, the case's own regraded.
    claims_by_ref: dict[str, Claim] = {f"case:{i}": c for i, c in enumerate(claim_rows)}

    def link_quotes(claim: Claim, quotes: list[dict[str, Any]]) -> None:
        for q in quotes:
            ev_row = db.get(Evidence, evidence(q))
            if ev_row is not None:
                link_claim_evidence(db, claim, ev_row, stance=q.get("stance") or "context", note=q.get("note"))

    def review(claim: Claim, status: str, rationale: str, evidence_grade: str | None, agreement_grade: str | None) -> None:
        try:
            review_claim(db, claim, status=status, confidence=CONFIDENCE[status], rationale=f"Demo case: {rationale}",
                         evidence_grade=evidence_grade, agreement_grade=agreement_grade, override_reason=OVERRIDE)
        except ValueError as exc:
            problems.append(f"claim {claim.text[:60]}: {exc}")

    for c in data["claims"] + data["inferred_claims"]:
        status = c["status"]
        claim = create_claim(db, ClaimCreate(investigation_id=inv.id, text=c["text"], status=status if status in ("lead", "unverified") else "unverified",
                                             confidence=0.0))
        claims_by_ref[c["id"]] = claim
        link_quotes(claim, c.get("evidence") or [])
        if status not in ("lead", "unverified"):
            review(claim, status, c["rationale"], c.get("evidence_grade"), c.get("agreement_grade"))
    for r in data["claim_reviews"]:
        reviewed = claims_by_ref.get(f"case:{r['index']}")
        if reviewed is None:
            continue
        link_quotes(reviewed, r.get("add_evidence") or [])
        if r["status"] in ("lead", "unverified"):
            reviewed.status = r["status"]
            db.commit()
        else:
            review(reviewed, r["status"], r["rationale"], r["evidence_grade"], r["agreement_grade"])
    for q in data["article_evidence"] + data["social_evidence"]:
        evidence_id = evidence(q)
        target = claims_by_ref.get(q.get("claim") or "")
        ev_row = db.get(Evidence, evidence_id)
        if target is not None and ev_row is not None:
            link_claim_evidence(db, target, ev_row, stance=q["stance"], note=q.get("note"))
    for q in data["document_quotes"]:
        evidence(q)

    # The payments table goes through the app's own mapping, as a reporter would map it.
    for doc_meta in more_manifest():
        if doc_meta.get("table_mapping") and doc_meta["id"] in docs:
            try:
                run_mapping(db, docs[doc_meta["id"]], TABLE_MAPPING, sheet=None, created_by=None)
            except Exception as exc:
                db.rollback()
                problems.append(f"table mapping {doc_meta['filename']}: {exc}")

    # Leads: new ones and the case's own, linked to what they are about, with a next action.
    def lead_links(lead: Lead, item: dict[str, Any]) -> None:
        for key in item.get("entities") or []:
            if key in entities:
                create_lead_link(db, lead, LeadLinkCreate(entity_id=entities[key].id))
        for ref in item.get("claims") or []:
            if ref in claims_by_ref:
                create_lead_link(db, lead, LeadLinkCreate(claim_id=claims_by_ref[ref].id))

    for item in data["leads"]:
        lead = create_lead(db, LeadCreate(investigation_id=inv.id, title=item["title"], detail=item.get("detail")))
        update_lead(db, lead, {"priority": item.get("priority"), "next_action": item.get("next_action")})
        lead_links(lead, item)
    for item in data["lead_updates"]:
        found = lead_rows.get(item["title"])
        if found is not None:
            update_lead(db, found, {"next_action": item["next_action"]})
            lead_links(found, item)
    db.commit()

# --- Progress, for the screen ---------------------------------------------------------------------------

_state: dict[str, Any] = {"state": "idle"}
_lock = threading.Lock()


def progress(db: Session) -> dict[str, Any]:
    inv = existing(db)
    out = {**_state}
    if inv is not None:
        docs = list(db.scalars(select(Document).where(Document.investigation_id == inv.id, Document.parent_document_id.is_(None))))
        out.update(investigation_id=inv.id, documents=len(docs), read=sum(d.extraction_status == "complete" for d in docs),
                   failed=sum(d.extraction_status == "failed" for d in docs),
                   claims=db.scalar(select(func.count()).select_from(Claim).where(Claim.investigation_id == inv.id)),
                   leads=db.scalar(select(func.count()).select_from(Lead).where(Lead.investigation_id == inv.id)),
                   not_downloaded=[{"title": s.title, "url": s.url} for s in db.scalars(select(Source).where(Source.investigation_id == inv.id))
                                   if (s.metadata_json or {}).get("not_downloaded")])
        if out["state"] == "idle":
            out["state"] = "ready" if out["read"] + out["failed"] >= len(docs) else "reading"
    return out


def set_state(**fields: Any) -> None:
    with _lock:
        _state.clear()
        _state.update(fields)


def count_fetched() -> None:
    """One more document downloaded (or given up on), for the loading bar.
    Called from the download threads."""
    with _lock:
        _state["fetched"] = _state.get("fetched", 0) + 1
