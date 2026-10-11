"""The 1MDB demo case: a real, closed investigation built from 11 public records
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
"""

from __future__ import annotations

import hashlib
import json
import re
import logging
import threading
import urllib.request
from collections.abc import Callable
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
)
from app.schemas.api import (
    ClaimCreate,
    EntityCreate,
    InvestigationCreate,
    LeadCreate,
    TimelineEventCreate,
)

logger = logging.getLogger("journalism.demo")

ROOT = Path(__file__).resolve().parents[1] / "demo" / "one_mdb"
NAME = "1MDB"
USER_AGENT = "JournalismWorkbench/1.0 (demo case loader; public records)"

Fetch = Callable[[str], bytes]


def manifest() -> list[dict[str, Any]]:
    return list(json.loads((ROOT / "documents.json").read_text(encoding="utf-8"))["documents"])


def records() -> dict[str, Any]:
    data: dict[str, Any] = json.loads((ROOT / "case.json").read_text(encoding="utf-8"))
    return data


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as reply:  # noqa: S310 - fixed public addresses from documents.json
        data: bytes = reply.read()
    return data


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


def fetch_documents(fetch: Fetch = download) -> list[tuple[dict[str, Any], bytes | None]]:
    """Every document's bytes. A PDF must match its pinned hash or loading
    stops. A web page that did not arrive as the expected page comes back as
    None: the case keeps it as a link to the publisher, and its quotes still
    stand, but there is nothing to read."""
    quotes = _quotes_by_document()
    out: list[tuple[dict[str, Any], bytes | None]] = []
    for doc in manifest():
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
    return out


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
    admitted: set[str] = set()
    for meta, data in documents:
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
        docs[meta["id"]] = doc
        source_ids[meta["id"]] = doc.source_id
    db.commit()

    def origin(q: dict[str, str] | None) -> str | None:
        return _origin(docs[q["doc"]], q["locator"]) if q and q["doc"] in docs else None

    evidence_cache: dict[tuple[str, str, str], str] = {}

    def evidence(q: dict[str, str]) -> str:
        key = (q["doc"], q["locator"], q["quote"])
        if key not in evidence_cache:
            where = docs[q["doc"]].filename if q["doc"] in docs else next(m["url"] for m, _ in documents if m["id"] == q["doc"])
            row = create_evidence(db, {"source_id": source_ids[q["doc"]], "quote": q["quote"], "locator": q["locator"],
                                       "notes": f"Quoted from {where}, {q['locator']}."})
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

    for r in case["relationships"]:
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

    for c in case["claims"]:
        claim = create_claim(db, ClaimCreate(investigation_id=inv.id, text=c["text"], status="lead" if c["status"] == "lead" else "unverified",
                                             confidence=0.0))
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

    for item in case.get("leads") or []:
        lead = create_lead(db, LeadCreate(investigation_id=inv.id, title=item["title"], detail=item.get("detail")))
        if item.get("priority"):
            update_lead(db, lead, {"priority": item["priority"]})

    for name in case.get("watchlist") or []:
        add_entry(db, inv.id, query=name, note="1MDB demo watchlist", created_by=None)

    if problems:
        logger.warning("1MDB demo: %d record(s) adjusted: %s", len(problems), "; ".join(problems[:10]))
    db.commit()
    return inv, [d.id for d in docs.values()]


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
