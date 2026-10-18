"""The investigation's places: records that say where they are (maps pass;
ADR-0005, line 18).

A place is an entity whose record holds a latitude and a longitude:
FollowTheMoney gives them to Address and RealEstate (Address.yaml,
RealEstate.yaml), and any entity of another schema that holds both is taken
as it is. Nothing is geocoded: a place is only where its record says. What
is at a place is what the investigation links to it, through its
relationship edges (an owner of a property, a company registered at an
address), each with the link that says so.

When things happened at a place is read off the investigation's timeline
(app/services/timeline.py): an event belongs to a place when it points at
the place's own record, or at one of the relationships linking something to
it (an ownership of the property starting on a date). The app links the map
to a strip of those events, so a stretch of time picks the places
(Bellingcat's map of civilian harm in Ukraine and Forensic Architecture's
TimeMap: one filter drives both views; design doc, "Timelines and maps").
Nothing is dated by a guess: an event whose date cannot be read is left
off the strip, as it is left off the timeline chart.

A record whose coordinates are missing one half, are not numbers, lie
outside the globe, or disagree (two latitudes recorded) is listed under
`omitted` with the reason, never placed by a guess. A merged-away record is
left out; its surviving record stands for it.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.domain import Entity, RelationshipEdge
from app.services.timeline import investigation_timeline
from app.visuals.data_service import event_span

_RANGES = {"latitude": (-90.0, 90.0), "longitude": (-180.0, 180.0)}


def _first_text(properties: Any, name: str) -> str | None:
    values = properties.get(name) if isinstance(properties, dict) else None
    for value in values if isinstance(values, list) else []:
        text = str(value).strip()
        if text:
            return text
    return None


def _coordinate(properties: Any, name: str) -> tuple[float | None, str | None]:
    """A latitude or longitude as recorded, or why there is none."""
    values = properties.get(name) if isinstance(properties, dict) else None
    texts = sorted({str(v).strip() for v in (values if isinstance(values, list) else []) if str(v).strip()})
    if not texts:
        return None, f"no {name} recorded"
    numbers = set()
    for text in texts:
        try:
            numbers.add(float(text.replace(",", ".")))
        except ValueError:
            return None, f"the {name} {text!r} is not a number"
    if len(numbers) > 1:
        return None, f"{len(numbers)} different values of {name} are recorded ({', '.join(texts)}); the reporter decides which holds"
    value = numbers.pop()
    low, high = _RANGES[name]
    if not low <= value <= high:
        return None, f"the {name} {value:g} lies outside {low:g} to {high:g}"
    return value, None


def investigation_places(db: Session, investigation_id: str) -> dict[str, Any]:
    entities = db.scalars(select(Entity).where(Entity.investigation_id == investigation_id, Entity.merged_into_entity_id.is_(None))
                          .order_by(Entity.caption, Entity.id)).all()
    places: list[dict[str, Any]] = []
    omitted: list[dict[str, Any]] = []
    for entity in entities:
        props = entity.properties or {}
        if not (isinstance(props, dict) and ({"latitude", "longitude"} & set(props))):
            continue
        latitude, why_lat = _coordinate(props, "latitude")
        longitude, why_lon = _coordinate(props, "longitude")
        if latitude is None or longitude is None:
            omitted.append({"entity_id": entity.id, "caption": entity.caption, "schema": entity.schema,
                            "reason": "; ".join(r for r in (why_lat, why_lon) if r)})
            continue
        places.append({"entity_id": entity.id, "caption": entity.caption, "schema": entity.schema, "latitude": latitude, "longitude": longitude,
                       "address": _first_text(props, "full"), "country": _first_text(props, "country"), "links": []})
    if places:
        by_id = {place["entity_id"]: place for place in places}
        edges = db.scalars(select(RelationshipEdge).where(
            RelationshipEdge.investigation_id == investigation_id,
            or_(RelationshipEdge.source_entity_id.in_(by_id), RelationshipEdge.target_entity_id.in_(by_id)),
        ).order_by(RelationshipEdge.schema, RelationshipEdge.id)).all()
        others = {e.id: e for e in db.scalars(select(Entity).where(Entity.id.in_(
            {edge.source_entity_id for edge in edges} | {edge.target_entity_id for edge in edges}))).all()}
        for edge in edges:
            for here, there, direction in ((edge.source_entity_id, edge.target_entity_id, "outgoing"),
                                           (edge.target_entity_id, edge.source_entity_id, "incoming")):
                if here in by_id and there in others:
                    other = others[there]
                    by_id[here]["links"].append({"relationship_id": edge.id, "schema": edge.schema, "direction": direction,
                                                 "entity_id": other.id, "caption": other.caption, "entity_schema": other.schema})
        _place_events(db, investigation_id, places, edges)
    return {"investigation_id": investigation_id, "places": places, "omitted": omitted}


def _place_events(db: Session, investigation_id: str, places: list[dict[str, Any]], edges: Sequence[RelationshipEdge]) -> None:
    """Each place's dated events, earliest first: the timeline's events that
    point at the place's record ("place") or at a relationship linking
    something to it ("link", with that relationship), with the days each
    covers as the timeline chart reads them (data_service.event_span)."""
    by_id = {place["entity_id"]: place for place in places}
    for place in places:
        place["events"] = []
    links_of: dict[str, list[tuple[str, str]]] = {}   # relationship record -> [(place id, edge id)]
    for edge in edges:
        for end in (edge.source_entity_id, edge.target_entity_id):
            if end in by_id:
                links_of.setdefault(edge.relationship_entity_id, []).append((end, edge.id))
    for event in investigation_timeline(db, investigation_id)["events"]:
        refs = event.get("refs") or {}
        span = event_span(event.get("date_start"), event.get("date_end"))
        if span is None:
            continue
        at: list[tuple[str, str | None]] = []
        if refs.get("entity_id") in by_id:
            at.append((refs["entity_id"], None))
        at.extend(links_of.get(refs.get("relationship_entity_id") or "", []))
        for place_id, relationship_id in dict.fromkeys(at):
            by_id[place_id]["events"].append({
                "id": event["id"], "kind": event["kind"], "title": event["title"],
                "date_start": event["date_start"], "date_end": event.get("date_end"),
                "first_day": span[0].isoformat(), "last_day": span[1].isoformat(), "exact": span[2],
                "verification_status": event["verification_status"],
                "via": "place" if relationship_id is None else "link", "relationship_id": relationship_id,
            })
