"""How a claim got here: its Chain of Custody, read left to right "from the file to the sentence" (research §3.11,
mockup CHECK_2).

One row per piece of evidence linked to the claim (supporting or against). Each row is the custodian steps the
records hold, in order: the file (with its fingerprint re-checked now), how the app read it, the passage the
quote stands in (and whether it says it), and the decision that put it on the claim. Each step names who acted
(a person, an app service, an outside service, an AI) and when, and the line into the next step carries what was
done, in the line style of the status grammar: confirmed by a person, proposed and not yet confirmed, worked out
by the app, against the claim, an AI step.

Nothing is invented. What the records do not hold is left out or said ("not recorded"): there is no stored OCR
legibility, so none is shown; the uploader comes only from the intake batch. The claim carries its Done checklist
for Supported, run by the same code a claim review is held to (app/services/claim_done.py). Read-only, except that it re-hashes
the files it shows (which writes nothing).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.reasoning import _find_citation_refs
from app.models.ai import AIAnalysisCandidate
from app.models.claims import Claim, ClaimEvidenceLink, ClaimReviewEvent
from app.models.documents import (
    Document,
    DocumentChunk,
    IngestionBatch,
    IngestionBatchItem,
)
from app.models.jobs import BackgroundJob
from app.models.patterns import PatternFlag
from app.models.relationships import RelationshipEdge, RelationshipEvidenceAttachment
from app.models.sources import Evidence, Source
from app.services.claim_done import _document_of, _file_matches, _norm, done_checks
from app.services.provenance import _record_extraction_lineage

READ_METHOD = {"ocr": "OCR", "native_pdf": "text layer", "native_text": "text"}


def _uploader(db: Session, doc: Document) -> str | None:
    batch = db.scalar(select(IngestionBatch).join(IngestionBatchItem, IngestionBatchItem.batch_id == IngestionBatch.id)
                      .where(IngestionBatchItem.document_id == doc.id).order_by(IngestionBatch.created_at))
    return batch.created_by if batch and batch.created_by else None


def _reading(db: Session, doc: Document) -> BackgroundJob | None:
    return db.scalar(select(BackgroundJob).where(BackgroundJob.subject_type == "document", BackgroundJob.subject_id == doc.id,
                                                 BackgroundJob.status == "succeeded").order_by(BackgroundJob.finished_at.desc()))


def _passage(db: Session, doc: Document, quote: str, chunk_id: str | None) -> DocumentChunk | None:
    if chunk_id:
        return db.get(DocumentChunk, chunk_id)
    wanted = _norm(quote)
    if not wanted:
        return None
    for chunk in db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc.id).order_by(DocumentChunk.ordinal)):
        if wanted in _norm(chunk.text):
            return chunk
    return None


def _proposer(payload: Any) -> str:
    prov = payload.get("provenance") if isinstance(payload, dict) else None
    if not isinstance(prov, dict):
        return "the app"
    if prov.get("ner_engine"):
        return "Name-finder"
    if prov.get("pattern"):
        return "a pattern"
    if prov.get("provider"):
        return str(prov["provider"])
    return "the app"


def _rests_on(db: Session, investigation_id: str, evidence_id: str, claim_id: str) -> list[dict[str, Any]]:
    """What falls if this evidence breaks: the claims it is linked to, the links (relationships) it is attached to,
    and the open Red Flags that name it or one of those claims (research §3.11 "What if this breaks?")."""
    out: list[dict[str, Any]] = []
    claim_ids = list(db.scalars(select(ClaimEvidenceLink.claim_id).where(ClaimEvidenceLink.evidence_id == evidence_id)))
    for c in list(db.scalars(select(Claim).where(Claim.id.in_(claim_ids)))) if claim_ids else []:
        out.append({"kind": "claim", "id": c.id, "label": c.text})
    edge_ids = list(db.scalars(select(RelationshipEvidenceAttachment.relationship_edge_id).where(RelationshipEvidenceAttachment.evidence_id == evidence_id)))
    for e in list(db.scalars(select(RelationshipEdge).where(RelationshipEdge.id.in_(edge_ids)))) if edge_ids else []:
        out.append({"kind": "link", "id": e.id, "label": f"{e.schema} link"})
    named = {evidence_id, *claim_ids, *edge_ids}
    for f in db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == investigation_id, PatternFlag.status == "open")):
        if named & set(f.links or []):
            out.append({"kind": "flag", "id": f.id, "label": f"Red Flag {f.indicator_id}", "level": f.level})
    return out


def _anchor(text: str | None, quote: str | None) -> dict[str, Any] | None:
    if not text or not quote:
        return None
    at = text.find(quote)
    if at >= 0:
        return {"start": at, "end": at + len(quote), "exact": True}
    at = text.lower().find(quote.lower())
    return {"start": at, "end": at + len(quote), "exact": False} if at >= 0 else None


def claim_custody_chain(db: Session, claim_id: str) -> dict[str, Any] | None:
    claim = db.get(Claim, claim_id)
    if claim is None:
        return None
    log: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []
    hashes: list[bool | None] = []
    links = list(db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.claim_id == claim.id).order_by(
        ClaimEvidenceLink.stance.desc(), ClaimEvidenceLink.created_at)))
    for link in links:
        if link.stance not in ("supports", "contradicts"):
            continue
        ev = db.get(Evidence, link.evidence_id)
        if ev is None:
            continue
        source = db.get(Source, ev.source_id) if ev.source_id else None
        doc = _document_of(db, ev, source)
        lineage = _record_extraction_lineage(db, "evidence", ev.id) or _record_extraction_lineage(db, "claim", claim.id)
        candidate = (lineage or {}).get("candidate") if lineage and lineage.get("document", {}) and doc and lineage["document"]["id"] == doc.id else None
        against = link.stance == "contradicts"
        cards: list[dict[str, Any]] = []
        if doc is not None:
            matches = _file_matches(doc)
            hashes.append(matches)
            who = _uploader(db, doc)
            cards.append({"id": f"file:{ev.id}", "kind": "file", "title": doc.filename,
                          "lines": [] if who else ["uploaded by: not recorded"],
                          "who": who, "actor": "person" if who else "app", "when": doc.created_at,
                          "checks": [{"label": "hash", "ok": matches}], "document_id": doc.id, "sha256": doc.sha256,
                          "wire": {"style": "worked_out", "words": "read"}})
            log.append({"when": doc.created_at, "who": who or "not recorded", "actor": "person" if who else "app",
                        "what": f"Uploaded {doc.filename} · SHA-256 recorded at intake", "card": f"file:{ev.id}"})
            job = _reading(db, doc)
            chunk = _passage(db, doc, ev.quote or "", (candidate or {}).get("chunk_id"))
            method = (lineage or {}).get("chunk", {}).get("extraction_method") if lineage and lineage.get("chunk") else None
            if method is None and chunk is not None:
                method = "ocr" if "(OCR)" in (chunk.locator or "") else "native_pdf" if doc.filename.lower().endswith(".pdf") else "native_text"
            # The last page the reading reached (pages with no text leave no passage, so counting passages undercounts).
            pages = max((c.page_number or 0 for c in db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc.id))), default=0)
            read_when = job.finished_at if job and job.finished_at else None
            how = READ_METHOD.get(method or "", "read")
            page = chunk.page_number if chunk else None
            cards.append({"id": f"read:{ev.id}", "kind": "reading", "title": f"Page {page} of {pages}" if page and pages else f"{pages or 'No'} pages read",
                          "lines": [f"read by {how}" if method else "how it was read is not recorded"],
                          "who": "App reader", "actor": "app", "when": read_when,
                          "checks": [{"label": "OCR" if method == "ocr" else "native", "ok": doc.extraction_status == "complete"}],
                          "wire": {"style": "worked_out", "words": f"p.{page}" if page else "passage"}})
            if read_when:
                log.append({"when": read_when, "who": "App reader", "actor": "app",
                            "what": f"Read {pages} page{'s' if pages != 1 else ''} of {doc.filename}{' by OCR' if method == 'ocr' else ''}", "card": f"read:{ev.id}"})
            says = chunk is not None and bool(ev.quote) and _norm(ev.quote or "") in _norm(chunk.text)
            cards.append({"id": f"passage:{ev.id}", "kind": "passage", "title": f"Passage · {chunk.locator}" if chunk else "Passage not found",
                          "lines": [], "text": chunk.text if chunk else None, "quote": ev.quote, "page": page,
                          "who": None, "actor": "app", "when": chunk.created_at if chunk else None,
                          "checks": [{"label": "says it", "ok": says if doc.extraction_status == "complete" else None}],
                          "wire": {"style": "proposed" if candidate else "confirmed", "words": "proposed" if candidate else "quoted"}})
        else:
            cards.append({"id": f"source:{ev.id}", "kind": "source", "title": source.title if source else "Typed in by hand",
                          "lines": [source.url] if source and source.url else ["no file behind it in the case"],
                          "who": None, "actor": "person", "when": None, "checks": [], "quote": ev.quote,
                          "wire": {"style": "confirmed", "words": "quoted"}})
        if candidate:
            accepted = candidate.get("review_status") == "accepted"
            proposer = _proposer(candidate.get("payload"))
            conf = candidate.get("confidence")
            cards.append({"id": f"decision:{ev.id}", "kind": "decision", "title": "Proposed",
                          "lines": [f"{proposer} · {candidate.get('candidate_type')}{f' · {conf:.2f}' if isinstance(conf, (int, float)) else ''}",
                                    "accepted by a person" if accepted else "not yet decided"],
                          "who": "a person" if accepted else proposer, "actor": "person" if accepted else "app",
                          "when": candidate.get("reviewed_at") or candidate.get("created_at"),
                          "checks": [{"label": "accepted", "ok": accepted}],
                          "wire": {"style": "against" if against else ("confirmed" if accepted else "proposed"),
                                   "words": "against" if against else "supports"}})
            log.append({"when": candidate.get("created_at"), "who": proposer, "actor": "app",
                        "what": f"Proposed this {candidate.get('candidate_type')}{f' ({conf:.2f})' if isinstance(conf, (int, float)) else ''}", "card": f"decision:{ev.id}"})
            if accepted and candidate.get("reviewed_at"):
                log.append({"when": candidate["reviewed_at"], "who": "a person", "actor": "person", "what": "Accepted the proposal", "card": f"decision:{ev.id}"})
        else:
            cards.append({"id": f"decision:{ev.id}", "kind": "decision", "title": "Answered" if against and link.note else "Quote saved",
                          "lines": [link.note] if link.note else ["typed in by a person"],
                          "who": "a person", "actor": "person", "when": link.created_at, "checks": [],
                          "wire": {"style": "against" if against else "confirmed", "words": "against" if against else "supports"}})
        log.append({"when": link.created_at, "who": "a person", "actor": "person",
                    "what": f"Linked as {'against' if against else 'supporting'} the claim{f': {link.note}' if link.note else ''}", "card": f"decision:{ev.id}"})
        passage_card = next((c for c in cards if c["kind"] == "passage"), None)
        rows.append({"evidence_id": ev.id, "stance": link.stance, "cards": cards,
                     "source": {"title": source.title, "source_type": source.source_type, "tier": source.source_tier, "issuer": source.issuer_or_author} if source else None,
                     "anchor": _anchor(passage_card.get("text") if passage_card else None, ev.quote),
                     "rests_on": _rests_on(db, claim.investigation_id, ev.id, claim.id)})

    for event in db.scalars(select(ClaimReviewEvent).where(ClaimReviewEvent.claim_id == claim.id).order_by(ClaimReviewEvent.created_at)):
        who = "a person" if (event.reviewer_type or "HUMAN").upper() == "HUMAN" else event.reviewer_type.lower()
        log.append({"when": event.created_at, "who": who, "actor": "person" if who == "a person" else "app",
                    "what": f"Set the claim {event.to_status}" + (f": {event.rationale}" if event.rationale else ""), "card": "claim"})
    ai = []
    # An AI answer that cites this claim or one of its pieces of evidence (not merely had it in its packet).
    mine = {("claim", claim.id), *(("evidence", r["evidence_id"]) for r in rows)}
    for cand in db.scalars(select(AIAnalysisCandidate).where(AIAnalysisCandidate.investigation_id == claim.investigation_id)):
        cited = {(str(c.get("record_type")), str(c.get("record_id"))) for c in _find_citation_refs(cand.payload or {})}
        if cited & mine:
            ai.append({"id": cand.id, "module": cand.module, "status": cand.review_status, "when": cand.created_at,
                       "run_id": (cand.trace or {}).get("run_id")})
            log.append({"when": cand.created_at, "who": f"AI · {cand.module}", "actor": "ai",
                        "what": "Quoted the claim in a draft" + (" (not accepted yet)" if cand.review_status != "accepted" else ""), "card": f"ai:{cand.id}"})
    log = sorted((e for e in log if e["when"] is not None), key=lambda e: e["when"])
    cards_all = [c for r in rows for c in r["cards"]]
    actors = {e["actor"] for e in log} | {c["actor"] for c in cards_all if c.get("who")}
    people = 1 if "person" in actors else 0
    # The app's services that acted: in the log, or on a step (a reading with no recorded job still had a reader).
    app_services = len({e["who"] for e in log if e["actor"] == "app"} | {c["who"] for c in cards_all if c["actor"] == "app" and c.get("who")})
    supports = [r for r in rows if r["stance"] == "supports"]
    return {
        "claim": {"id": claim.id, "text": claim.text, "status": claim.status, "confidence": claim.confidence},
        "rows": rows,
        "ai": ai,
        "log": log,
        "seal": {
            "steps": sum(len(r["cards"]) for r in rows) + 1,
            "people": people,
            "app_services": app_services,
            "outside_services": 0,
            "hashes_intact": None if not hashes else all(h is True for h in hashes),
            "hashes_checked": len(hashes),
            "ai_uses": len(ai),
            "sources_for": len(supports),
            "against": len(rows) - len(supports),
        },
        # The Done checklist for Supported, from the same rules a review to Supported is held to (claim_done.py):
        # each rule met, not met, or not checkable here, with what it waits on.
        "done": done_checks(db, claim, target="supported"),
        "checked_at": datetime.now(timezone.utc),
    }


def recheck_document_hash(db: Session, document_id: str) -> dict[str, Any] | None:
    doc = db.get(Document, document_id)
    if doc is None:
        return None
    return {"document_id": doc.id, "sha256": doc.sha256, "matches": _file_matches(doc), "checked_at": datetime.now(timezone.utc)}
