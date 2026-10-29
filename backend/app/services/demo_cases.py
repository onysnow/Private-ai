"""Small real demo cases (Ony, 11 Oct 2026): three closed public cases, each
loaded as its own investigation, so the red-flag rules the 1MDB case cannot
trigger are tried on real records too.

- us-v-anise-structuring: a federal indictment listing 144 cash deposits just
  under $10,000 into five accounts (ML-021);
- vekselberg-shell-network: a civil forfeiture complaint, a seizure-warrant
  affidavit and an OFAC notice: chains of five and six wholly owned shell
  companies (BO-002), nominee directors shared across companies and an Isle of
  Man address shared by an organisation and a bank account (BO-032), dollar and
  euro payments, and sanctions identifiers;
- deripaska-en-rusal: the same OFAC notice and Treasury's December 2018 letter
  to Congress: one Jersey address written two ways and a Moscow one written three ways (BO-032), ownership
  percentages, sanctions and politically exposed persons;

Each case is app/demo/<case-id>/case.json and documents.json, in the same form
as the 1MDB case (app/demo/one_mdb, app/services/demo_1mdb.py), and loads the
same way: the documents are downloaded from their public addresses and must
match their pinned sha256; the records drawn from them are added, every piece
of evidence an exact quote with its page; then the documents are read as
background jobs. None of them holds an ownership loop (BO-001): that one is
kept for the tutorial (docs/project-notes/TUTORIAL_NOTES.md), not as a case.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
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
from app.services.demo_1mdb import DemoDownloadError, Fetch, download

logger = logging.getLogger("journalism.demo")

ROOT = Path(__file__).resolve().parents[1] / "demo"
CASE_IDS = ("us-v-anise-structuring", "vekselberg-shell-network", "deripaska-en-rusal")

__all__ = ["CASE_IDS", "DemoDownloadError", "build", "existing", "fetch_documents", "manifest", "progress", "records", "set_state", "summary"]


def _dir(case_id: str) -> Path:
    if case_id not in CASE_IDS:
        raise KeyError(case_id)
    return ROOT / case_id


def manifest(case_id: str) -> list[dict[str, Any]]:
    return list(json.loads((_dir(case_id) / "documents.json").read_text(encoding="utf-8"))["documents"])


def records(case_id: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((_dir(case_id) / "case.json").read_text(encoding="utf-8"))
    return data


def summary(case_id: str) -> dict[str, Any]:
    """What the screen shows before a case is loaded."""
    case, docs = records(case_id), manifest(case_id)
    return {"id": case_id, "title": case["investigation"]["name"], "question": case["investigation"]["question"],
            "description": case["investigation"]["description"], "documents": len(docs),
            "bytes": sum(int(d.get("bytes") or 0) for d in docs),
            "publishers": sorted({d["url"].split("/")[2] for d in docs})}


def fetch_documents(case_id: str, fetch: Fetch = download, on_fetched: Callable[[], None] = lambda: None) -> list[tuple[dict[str, Any], bytes]]:
    """Every document's bytes; each is a PDF pinned by its sha256, so a
    document that cannot be fetched or is not the pinned file stops the load.
    ``on_fetched`` is called before each download, for the loading bar."""
    out: list[tuple[dict[str, Any], bytes]] = []
    for doc in manifest(case_id):
        on_fetched()
        try:
            data = fetch(doc["url"])
        except Exception as exc:  # network, HTTP error
            raise DemoDownloadError(f"Could not download {doc['title']} from {doc['url']}: {exc}") from exc
        if not data:
            raise DemoDownloadError(f"{doc['url']} answered with an empty file")
        if hashlib.sha256(data).hexdigest() != doc["sha256"]:
            raise DemoDownloadError(f"{doc['url']} is not the expected file (its fingerprint differs); the publisher may have replaced it")
        out.append((doc, data))
    return out


def existing(db: Session, case_id: str) -> Investigation | None:
    name = records(case_id)["investigation"]["name"]
    return db.scalar(select(Investigation).where(Investigation.name == name, Investigation.is_demo.is_(True)))


def build(db: Session, case_id: str, documents: list[tuple[dict[str, Any], bytes]], *, storage_dir: Path) -> tuple[Investigation, list[str]]:
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

    case = records(case_id)
    dataset = f"{case_id}-demo"
    inv = create_investigation(db, InvestigationCreate(name=case["investigation"]["name"], description=case["investigation"]["description"],
                                                       question=case["investigation"]["question"]))
    inv.is_demo = True
    db.commit()

    docs: dict[str, Document] = {}
    admitted = {meta["id"] for meta, _ in documents if meta.get("admitted")}
    for meta, data in documents:
        doc = store_document(db, investigation_id=inv.id, title=meta["title"], filename=meta["filename"], mime_type="application/pdf", data=data,
                             storage_dir=storage_dir, source_metadata={"url": meta["url"], "publisher": meta["publisher"], "date": meta["date"],
                                                                       "licence": meta["licence_note"], "demo": case_id,
                                                                       **({"part": meta["part"]} if meta.get("part") else {})})
        source = db.get(Source, doc.source_id)
        if source is not None:
            source.url = meta["url"]
            source.source_type = meta.get("source_type", "public_record")
            # The suite's tier (TAS): the record of an authority's own action, or an admission, is a primary official
            # record (A); a complaint, indictment or affidavit is a party's sworn assertion, testimony to corroborate
            # (B). So an allegation alone can make a claim Supported but never Confirmed (DECISIONS_LOG, 29 Oct).
            source.source_tier = "A" if meta.get("admitted") else "B"
        docs[meta["id"]] = doc
    db.commit()

    def origin(q: dict[str, str] | None) -> str | None:
        return f"document:{docs[q['doc']].id}#{q['locator']}" if q else None

    evidence_cache: dict[tuple[str, str, str], str] = {}

    def evidence(q: dict[str, str]) -> str:
        key = (q["doc"], q["locator"], q["quote"])
        if key not in evidence_cache:
            row = create_evidence(db, {"source_id": docs[q["doc"]].source_id, "quote": q["quote"], "locator": q["locator"],
                                       "notes": f"Quoted from {docs[q['doc']].filename}, {q['locator']}."})
            evidence_cache[key] = row.id
        return evidence_cache[key]

    problems: list[str] = []
    entities: dict[str, Entity] = {}
    for e in case["entities"]:
        first = (e.get("evidence") or [None])[0]
        props = {k: [str(v) for v in vs] for k, vs in (e.get("properties") or {}).items()}
        try:
            row = create_entity(db, EntityCreate(investigation_id=inv.id, schema=e["schema"], caption=e["caption"], properties=props,
                                                 dataset=dataset, origin=origin(first)))
        except Exception as exc:  # a property the schema does not take: keep the record, drop the property
            db.rollback()
            problems.append(f"{e['caption']}: {exc}")
            row = create_entity(db, EntityCreate(investigation_id=inv.id, schema=e["schema"], caption=e["caption"], properties={},
                                                 dataset=dataset, origin=origin(first)))
        entities[e["key"]] = row
        for q in e.get("evidence") or []:
            evidence(q)

    for r in case["relationships"]:
        props = {k: [str(v) for v in vs] for k, vs in (r.get("properties") or {}).items()}
        quotes = r.get("evidence") or []
        try:
            edge = create_relationship(db, investigation_id=inv.id, schema=r["schema"], source_entity_id=entities[r["source"]].id,
                                       target_entity_id=entities[r["target"]].id, properties=props, dataset=dataset,
                                       origin=origin(quotes[0] if quotes else None))
        except Exception as exc:
            db.rollback()
            problems.append(f"{r['schema']} {r['source']} → {r['target']}: {exc}")
            continue
        for q in quotes:
            ev_id = evidence(q)
            attach_relationship_evidence(db, edge, evidence_id=ev_id, note=r.get("note"))
            kind = "published by the authority that took the action" if q["doc"] in admitted else "alleged in a public court filing"
            review_relationship_evidence(db, edge, evidence_id=ev_id, stance="supports",
                                         rationale=f"Demo case: the quoted passage states this link ({kind}).")

    for ev in case["events"]:
        q = ev["evidence"]
        precision = ev.get("precision") or "day"
        status = "approximate" if precision != "day" else ("verified" if q["doc"] in admitted else "asserted")
        try:
            create_timeline_event(db, TimelineEventCreate(
                investigation_id=inv.id, title=ev["title"], description=ev.get("description") or None, date_start=ev["date"],
                date_end=ev.get("date_end"), precision=precision, verification_status=status,
                entity_id=entities[ev["entity"]].id if ev.get("entity") in entities else None,
                source_id=docs[q["doc"]].source_id, evidence_id=evidence(q), dataset=dataset))
        except Exception as exc:
            db.rollback()
            problems.append(f"event {ev['title']}: {exc}")

    for c in case.get("claims") or []:
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
        add_entry(db, inv.id, query=name, note=f"{case['investigation']['name']}: watchlist", created_by=None)

    if problems:
        logger.warning("%s demo: %d record(s) adjusted: %s", case_id, len(problems), "; ".join(problems[:10]))
    db.commit()
    return inv, [d.id for d in docs.values()]


# --- Progress, for the screen ---------------------------------------------------------------------------

_states: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def progress(db: Session, case_id: str) -> dict[str, Any]:
    inv = existing(db, case_id)
    out = {**_states.get(case_id, {"state": "idle"})}
    if inv is not None:
        docs = list(db.scalars(select(Document).where(Document.investigation_id == inv.id, Document.parent_document_id.is_(None))))
        out.update(investigation_id=inv.id, documents=len(docs), read=sum(d.extraction_status == "complete" for d in docs),
                   failed=sum(d.extraction_status == "failed" for d in docs),
                   claims=db.scalar(select(func.count()).select_from(Claim).where(Claim.investigation_id == inv.id)),
                   leads=db.scalar(select(func.count()).select_from(Lead).where(Lead.investigation_id == inv.id)))
        if out["state"] == "idle":
            out["state"] = "ready" if out["read"] + out["failed"] >= len(docs) else "reading"
    return out


def set_state(case_id: str, **fields: Any) -> None:
    with _lock:
        _states[case_id] = dict(fields)


def count_fetched(case_id: str) -> None:
    """One more document being downloaded, for the loading bar."""
    with _lock:
        state = _states.setdefault(case_id, {"state": "downloading"})
        state["fetched"] = state.get("fetched", 0) + 1
