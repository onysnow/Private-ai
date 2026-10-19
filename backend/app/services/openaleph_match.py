"""OpenAleph's /match for a name awaiting review (ADR-0006: "Match against
everything indexed ... part of the possible-duplicate check when an entity
proposal is reviewed").

``POST /api/2/match`` takes an entity (schema and properties) and answers
with the entities OpenAleph holds that look like it, across every collection
it can read, each with its collection and an Elasticsearch relevance
``score`` (checked on the live 5.3.1 stack, 2026-10-03: aleph/views/
entities_api.py ``match``, MatchQuery). The score only ranks; it is not a
probability, so the screen shows the order and never a percentage.

Like cross-referencing, /match reads every collection, because OpenAleph runs
single-user behind the Workbench. So a match in a collection that belongs to
another investigation is shown only to someone who may read that
investigation (ADR-0002); one in this investigation's own collection is
mapped back to the Workbench record it was pushed from, so the reporter can
say the name is that record.

Nothing here decides anything: the matches are shown beside the proposal,
and only the reporter's identity choice changes the investigation.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from followthemoney import model
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.authorization import AuthorizationScope
from app.core.config import settings
from app.models.domain import (
    Document, Entity, ExtractionCandidate, InvestigationCorpusBinding, OpenAlephEntityLink,
)

logger = logging.getLogger("journalism.openaleph")

MATCH_LIMIT = 10
# A name with no type yet is matched as "some legal entity": Thing itself is
# not matchable in FollowTheMoney (schema.matchable is False).
FALLBACK_SCHEMA = "LegalEntity"


def _match_schema(name: str | None) -> str:
    schema = model.get(name) if name else None
    return schema.name if schema is not None and schema.matchable else FALLBACK_SCHEMA


def _strings(properties: Any) -> dict[str, list[str]]:
    if not isinstance(properties, dict):
        return {}
    return {str(k): [str(v) for v in values if str(v).strip()] for k, values in properties.items() if isinstance(values, list)}


def _query_entity(candidate: ExtractionCandidate) -> dict[str, Any]:
    payload = candidate.payload if isinstance(candidate.payload, dict) else {}
    caption = str(payload.get("caption") or "").strip()
    schema = _match_schema(payload.get("suggested_schema"))
    known = model.get(schema)
    properties = {key: values for key, values in _strings(payload.get("properties")).items()
                  if known is not None and key in known.properties}
    properties["name"] = sorted({caption, *properties.get("name", [])} - {""})
    return {"schema": schema, "properties": properties}


def openaleph_matches(db: Session, candidate: ExtractionCandidate, *, scope: AuthorizationScope | None,
                      transport: httpx.BaseTransport | None = None) -> dict[str, Any]:
    """The entities OpenAleph holds that look like this proposed name."""
    from app.services import openaleph_http
    from app.services.cross_references import openaleph_url

    if candidate.candidate_type != "entity":
        raise ValueError("Candidate is not an entity proposal")
    doc = db.get(Document, candidate.document_id)
    if doc is None:
        raise ValueError("Candidate document is missing")
    query = _query_entity(candidate)
    out: dict[str, Any] = {"candidate_id": candidate.id, "schema": query["schema"], "state": "ok", "detail": None,
                           "hidden": 0, "results": []}
    if not settings.openaleph_enabled:
        out.update(state="disabled", detail="OpenAleph is turned off here.")
        return out
    if not query["properties"]["name"]:
        out.update(state="ok", detail="The proposal has no name to look for.")
        return out
    try:
        response = openaleph_http.post("/api/2/match", json=query, params={"limit": MATCH_LIMIT}, transport=transport)
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("OpenAleph /match failed", exc_info=True, extra={"candidate_id": candidate.id})
        out.update(state="unavailable", detail=f"OpenAleph could not be asked ({type(exc).__name__}).")
        return out

    rows = [row for row in (payload.get("results") if isinstance(payload, dict) else None) or []
            if isinstance(row, dict) and row.get("id")]
    collection_ids = {str((row.get("collection") or {}).get("id") or row.get("collection_id") or "") for row in rows} - {""}
    bound = {b.collection_id: b.investigation_id for b in db.scalars(
        select(InvestigationCorpusBinding).where(InvestigationCorpusBinding.collection_id.in_(collection_ids)))} if collection_ids else {}
    links = {link.openaleph_entity_id: link.record_id for link in db.scalars(select(OpenAlephEntityLink).where(
        OpenAlephEntityLink.openaleph_entity_id.in_([str(row["id"]) for row in rows]),
        OpenAlephEntityLink.investigation_id == doc.investigation_id))} if rows else {}

    for row in rows:
        raw_collection = row.get("collection")
        collection: dict[str, Any] = raw_collection if isinstance(raw_collection, dict) else {}
        collection_id = str(collection.get("id") or row.get("collection_id") or "") or None
        investigation_id = bound.get(collection_id or "")
        if scope is not None and investigation_id is not None and not scope.allows(investigation_id):
            out["hidden"] += 1
            continue
        record_id = links.get(str(row["id"]))
        entity = db.get(Entity, record_id) if record_id else None
        if entity is not None and entity.merged_into_entity_id:
            entity = db.get(Entity, entity.merged_into_entity_id)
        score = row.get("score")
        out["results"].append({
            "openaleph_id": str(row["id"]),
            "caption": str(row.get("caption") or row["id"])[:512],
            "schema": str(row.get("schema") or ""),
            "properties": _strings(row.get("properties")),
            "score": float(score) if isinstance(score, (int, float)) else None,
            "collection_id": collection_id,
            "collection_label": str(collection.get("label") or "") or None,
            "investigation_id": investigation_id,
            "in_this_investigation": investigation_id == doc.investigation_id,
            "workbench_entity_id": entity.id if entity is not None else None,
            "url": openaleph_url(str(row["id"])),
        })
    return out
