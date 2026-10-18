"""What stands out in an investigation's corpus, from OpenAleph (ADR-0006,
Wave C: "Collection insights -- significant names and terms as suggested
leads").

``GET /api/2/collections/{id}/discover`` (aleph/views/collections_api.py,
aleph/logic/discover.py; checked on the live 5.3.1 stack, 2026-10-03)
answers with the names its analysis found most often across the
collection's documents -- under peopleMentioned, companiesMentioned,
locationMentioned and namesMentioned -- and, for each, the names that stand
out in the documents that mention it (Elasticsearch significant terms).
OpenAleph computes it once and caches it, and returns names in lower case,
with a title-cased ``label``.

Each name is shown with how many documents mention it and what it is
mentioned alongside, and marked when the investigation already holds a
record of that name or already made a lead of it. Making a lead is the
reporter's choice; nothing here creates one.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import Entity, Lead
from app.services.entity_signals import norm_name
from app.services.openaleph_corpus import get_binding

logger = logging.getLogger("journalism.openaleph")

PROVIDER = "openaleph"
# OpenAleph's discovery properties, in the order the screen lists them.
GROUPS = (
    ("peopleMentioned", "people", "People"),
    ("companiesMentioned", "companies", "Companies"),
    ("locationMentioned", "places", "Places"),
    ("namesMentioned", "names", "Other names"),
)
ALONGSIDE = 5


def lead_key(kind: str, name: str) -> str:
    """The provider_record_id of a lead made from a discovered name: the same
    name of the same kind is the same lead, however often discovery runs."""
    return f"discover:{kind}:{norm_name(name)}"


def _term(raw: Any) -> tuple[str, str, int] | None:
    if not isinstance(raw, dict) or not raw.get("name"):
        return None
    name = str(raw["name"])
    label = str(raw.get("label") or name)
    count = raw.get("count")
    return name, label, int(count) if isinstance(count, int) else 0


def corpus_insights(db: Session, investigation_id: str, *, transport: httpx.BaseTransport | None = None) -> dict[str, Any]:
    from app.services import openaleph_http

    out: dict[str, Any] = {"investigation_id": investigation_id, "state": "ok", "detail": None, "collection_id": None, "groups": []}
    if not settings.openaleph_enabled:
        out.update(state="disabled", detail="OpenAleph is turned off here.")
        return out
    binding = get_binding(db, investigation_id)
    if binding is None:
        out.update(state="no_collection", detail="No document of this investigation has been sent to OpenAleph yet.")
        return out
    out["collection_id"] = binding.collection_id
    try:
        payload = openaleph_http.get_json(f"/api/2/collections/{binding.collection_id}/discover", transport=transport)
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("OpenAleph discover failed", exc_info=True, extra={"investigation_id": investigation_id})
        out.update(state="unavailable", detail=f"OpenAleph could not be asked ({type(exc).__name__}).")
        return out
    if not isinstance(payload, dict):
        payload = {}

    records = {norm_name(row.caption): row.id for row in db.scalars(select(Entity).where(
        Entity.investigation_id == investigation_id, Entity.merged_into_entity_id.is_(None)))}
    leads = {str(row.provider_record_id): row.id for row in db.scalars(select(Lead).where(
        Lead.investigation_id == investigation_id, Lead.provider == PROVIDER))}

    for prop, kind, label in GROUPS:
        terms = []
        for entry in payload.get(prop) or []:
            head = _term(entry.get("term")) if isinstance(entry, dict) else None
            if head is None:
                continue
            name, shown, documents = head
            alongside: list[dict[str, Any]] = []
            for other_prop, other_kind, _other_label in GROUPS:
                for raw in entry.get(other_prop) or []:
                    term = _term(raw)
                    if term is not None and norm_name(term[0]) != norm_name(name):
                        alongside.append({"kind": other_kind, "name": term[1], "documents": term[2]})
            alongside.sort(key=lambda row: -int(row["documents"]))
            key = lead_key(kind, name)
            terms.append({
                "name": shown, "documents": documents, "alongside": alongside[:ALONGSIDE],
                "record_id": records.get(norm_name(name)), "lead_id": leads.get(key), "lead_key": key,
            })
        if terms:
            out["groups"].append({"kind": kind, "label": label, "terms": terms})
    return out
