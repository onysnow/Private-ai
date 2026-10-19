"""Answer once, apply to the batch (reading room, research §8): once a name's question is answered on one
card ("Harbour Nominees Ltd is Harbour Nominees Limited"), the other waiting proposals of the same name are
offered the same answer, shown as a list, and nothing is applied until a person says so.

"The same name" is resolution.py's strong tier (the same words, or FollowTheMoney's name comparison at 0.9 or
more, which reads "Ltd" and "Limited" as one). The batch is the drop the document came in (its ingestion batch,
with the files found inside the files it saved); a document brought in on its own is compared with the whole
case."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Document, DocumentChunk, ExtractionCandidate, IngestionBatch, IngestionBatchItem
from app.services.resolution import same_name

LIMIT = 50


def _caption(row: ExtractionCandidate) -> str:
    payload = row.payload if isinstance(row.payload, dict) else {}
    return str(payload.get("caption") or "").strip()


def same_answer_candidates(db: Session, candidate: ExtractionCandidate) -> dict[str, Any]:
    if candidate.candidate_type != "entity":
        raise ValueError("Only a name proposal asks a question another name can share")
    doc = db.get(Document, candidate.document_id)
    if doc is None:
        raise ValueError("Candidate document is missing")
    docs = {d.id: d for d in db.scalars(select(Document).where(Document.investigation_id == doc.investigation_id))}
    children: dict[str, list[str]] = defaultdict(list)
    for d in docs.values():
        if d.parent_document_id:
            children[d.parent_document_id].append(d.id)
    top = doc
    while top.parent_document_id and top.parent_document_id in docs:
        top = docs[top.parent_document_id]
    item = db.scalar(select(IngestionBatchItem).where(IngestionBatchItem.document_id == top.id, IngestionBatchItem.outcome == "saved").limit(1))
    batch = db.get(IngestionBatch, item.batch_id) if item is not None else None
    if batch is not None:
        saved = [str(i) for i in db.scalars(select(IngestionBatchItem.document_id).where(
            IngestionBatchItem.batch_id == batch.id, IngestionBatchItem.outcome == "saved")) if i]
        scope: set[str] = set()
        stack = list(saved)
        while stack:
            one = stack.pop()
            if one not in scope:
                scope.add(one)
                stack.extend(children.get(one, []))
    else:
        scope = set(docs)
    caption = _caption(candidate)
    rows = db.scalars(select(ExtractionCandidate).where(
        ExtractionCandidate.investigation_id == doc.investigation_id, ExtractionCandidate.candidate_type == "entity",
        ExtractionCandidate.review_status == "proposed", ExtractionCandidate.id != candidate.id,
        ExtractionCandidate.document_id.in_(scope)).order_by(ExtractionCandidate.created_at)).all() if scope else []
    alike = [r for r in rows if same_name(caption, _caption(r))][:LIMIT]
    chunk_ids = {r.chunk_id for r in alike if r.chunk_id}
    chunks = {c.id: c.locator for c in db.scalars(select(DocumentChunk).where(DocumentChunk.id.in_(chunk_ids)))} if chunk_ids else {}
    return {
        "candidate_id": candidate.id, "caption": caption, "scope": "drop" if batch is not None else "case",
        "label": batch.label if batch is not None else None,
        "candidates": [{
            "candidate_id": r.id, "caption": _caption(r), "document_id": r.document_id,
            "filename": docs[r.document_id].filename if r.document_id in docs else "",
            "locator": chunks.get(r.chunk_id or "") or str((r.payload or {}).get("locator") or "") or None,
        } for r in alike],
    }
