"""The years a case's records touch (Case home's year rail; mockup HOME_1).

A link's years come from its own dates (date, startDate, endDate; a span fills the
years between). A Red Flag lights the years of its links. A party lights the years of
its dated events and of its links."""

from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.domain import Entity, PatternFlag, RelationshipEdge, TimelineEvent

DATE_PROPS = ("date", "startDate", "endDate")
MAX_SPAN = 40  # a span longer than this is shown by its ends only


def _year(value: Any) -> int | None:
    text = str(value or "")[:4]
    return int(text) if text.isdigit() else None


def years_of_properties(props: dict[str, Any] | None) -> set[int]:
    props = props or {}
    found = {y for key in DATE_PROPS for v in (props.get(key) or []) if (y := _year(v)) is not None}
    start = min((y for v in props.get("startDate") or [] if (y := _year(v))), default=None)
    end = max((y for v in props.get("endDate") or [] if (y := _year(v))), default=None)
    if start and end and 0 < end - start <= MAX_SPAN:
        found.update(range(start, end + 1))
    return found


def link_years(db: Session, investigation_id: str) -> dict[str, set[int]]:
    """Each link's years, by link id."""
    rows = db.execute(select(RelationshipEdge.id, Entity.properties)
                      .join(Entity, Entity.id == RelationshipEdge.relationship_entity_id)
                      .where(RelationshipEdge.investigation_id == investigation_id))
    return {edge_id: ys for edge_id, props in rows if (ys := years_of_properties(props))}


def flag_years(flag: PatternFlag, by_link: dict[str, set[int]]) -> list[int]:
    return sorted({y for link in flag.links or [] for y in by_link.get(link, ())})


def party_years(db: Session, investigation_id: str, entity_id: str) -> list[int]:
    years = {y for (start,) in db.execute(select(TimelineEvent.date_start).where(
        TimelineEvent.investigation_id == investigation_id,
        or_(TimelineEvent.entity_id == entity_id, TimelineEvent.relationship_entity_id == entity_id)))
        if (y := _year(start)) is not None}
    rows = db.execute(select(Entity.properties).join(RelationshipEdge, Entity.id == RelationshipEdge.relationship_entity_id)
                      .where(RelationshipEdge.investigation_id == investigation_id,
                             or_(RelationshipEdge.source_entity_id == entity_id, RelationshipEdge.target_entity_id == entity_id)))
    for (props,) in rows:
        years |= years_of_properties(props)
    return sorted(years)
