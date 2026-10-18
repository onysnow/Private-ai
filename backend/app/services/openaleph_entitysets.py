"""Diagrams, timelines and lists in OpenAleph from the investigation's
records (ADR-0006, Wave C: "Export the relationship graph and the timeline as
an OpenAleph diagram and timeline; save working sets as lists").

What goes in is what the corpus copy (Wave B, app/services/corpus_push.py)
already holds in the investigation's collection: the reporter-confirmed
entities and relationships, under their signed ids (``OpenAlephEntityLink``).
Nothing new is written to the collection: the set is created without
``entities`` (OpenAleph would upsert them, logic/entitysets.py
create_entityset) and each record is added as an item.

* **Diagram**: every entity of the copy is a vertex and every relationship an
  edge, in the layout format OpenAleph's diagram editor reads and writes
  (validation/schema/diagram.yml; the editor's Vertex.fromEntity and
  Edge.fromEntity in aleph-ui 5.3.1 give the ids: ``entity:<id>`` for a
  vertex, ``<edge id>(<source vertex>, <target vertex>)`` for an edge;
  positions in grid units, a vertex one unit across). New vertices are
  placed by networkx's spring layout (Fruchterman-Reingold) with a fixed
  seed; a vertex the set already holds keeps the place it has there, so a
  diagram a reporter arranged in OpenAleph is not scrambled when it is sent
  again.
* **Timeline**: every record of the copy with a date FollowTheMoney counts
  as its start (a payment's date, a person's birth date, a company's
  incorporation: ``schema.temporal_start_props``); OpenAleph's timeline reads
  the dates from the entities themselves. The Workbench's own timeline
  events are not sent: they are not part of the corpus copy, and OpenAleph
  would keep them after they were changed or removed here.
* **List**: the entities the reporter chose.

Sending a set again updates it in place: what is new is added, and only
what the Workbench itself added and no longer belongs is taken out.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import networkx as nx
from followthemoney import model
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import Entity, Investigation, OpenAlephEntityLink, OpenAlephEntitySetLink, RelationshipEdge
from app.services.corpus_push import RECORD_ENTITY, RECORD_RELATIONSHIP, pending_changes
from app.services.openaleph_corpus import get_binding
from app.services.openaleph_gateway import CorpusGateway, OpenAlephNotFound

KINDS = ("diagram", "timeline", "list")
MAX_ITEMS = 500           # records one set holds; more is not readable as a diagram
VERTEX_COLOR = "#215DB0"  # the editor's default vertex colour (Blueprint BLUE2, aleph-ui 5.3.1)
LAYOUT_SEED = 7


class EntitySetError(ValueError):
    """The set cannot be made; the message says why in plain words."""


@dataclass(frozen=True)
class Held:
    """A record the collection holds."""
    record_type: str
    entity: Entity
    signed_id: str


def _held(db: Session, investigation_id: str, collection_id: str) -> dict[str, Held]:
    links = db.scalars(select(OpenAlephEntityLink).where(OpenAlephEntityLink.investigation_id == investigation_id,
                                                         OpenAlephEntityLink.collection_id == collection_id))
    out: dict[str, Held] = {}
    for link in links:
        entity = db.get(Entity, link.record_id)
        if entity is not None and not entity.merged_into_entity_id:
            out[entity.id] = Held(link.record_type, entity, link.openaleph_entity_id)
    return out


def _vertex_id(signed_id: str) -> str:
    return f"entity:{signed_id}"


def diagram_layout(held: dict[str, Held], edges: list[RelationshipEdge], kept: dict[str, tuple[float, float]]) -> dict[str, Any]:
    """The diagram's vertices and edges, placed. ``kept`` holds positions
    (grid units) by signed entity id that the set already has."""
    nodes = [h for h in held.values() if h.record_type == RECORD_ENTITY]
    graph = nx.Graph()
    graph.add_nodes_from(sorted(h.signed_id for h in nodes))
    lines = []
    for edge in edges:
        rel, source, target = held.get(edge.relationship_entity_id), held.get(edge.source_entity_id), held.get(edge.target_entity_id)
        if rel is None or source is None or target is None or rel.record_type != RECORD_RELATIONSHIP:
            continue
        graph.add_edge(source.signed_id, target.signed_id)
        lines.append((rel, source, target))
    fixed = [node for node in graph.nodes if node in kept]
    positions: dict[str, Any] = {}
    if graph.number_of_nodes():
        scale = 6 * math.sqrt(graph.number_of_nodes()) + 4
        positions = nx.spring_layout(graph, seed=LAYOUT_SEED, scale=scale,
                                     pos={node: kept[node] for node in fixed} or None, fixed=fixed or None)
    vertices = [{
        "id": _vertex_id(h.signed_id), "type": "entity", "label": h.entity.caption, "fixed": True, "hidden": False,
        "color": VERTEX_COLOR, "radius": 1, "entityId": h.signed_id,
        "position": {"x": round(float(positions[h.signed_id][0])), "y": round(float(positions[h.signed_id][1]))},
    } for h in sorted(nodes, key=lambda h: h.signed_id)]
    edge_rows = []
    for rel, source, target in lines:
        schema = model.get(rel.entity.schema)
        directed = bool(schema is not None and schema.edge and schema.edge_directed)
        label = (schema.edge_label if schema is not None and schema.edge_label else rel.entity.schema)
        src, tgt = _vertex_id(source.signed_id), _vertex_id(target.signed_id)
        edge_rows.append({"id": f"{rel.signed_id}({src}, {tgt})", "type": "entity", "label": label,
                          "sourceId": src, "targetId": tgt, "entityId": rel.signed_id, "directed": directed})
    return {"vertices": vertices, "edges": edge_rows, "groupings": [], "settings": {"pivotTypes": []}}


def _dated(entity: Entity) -> bool:
    schema = model.get(entity.schema)
    if schema is None:
        return False
    props = entity.properties or {}
    return any(props.get(prop.name) for prop in schema.temporal_start_props)


def _kept_positions(layout: Any) -> dict[str, tuple[float, float]]:
    out: dict[str, tuple[float, float]] = {}
    for vertex in (layout or {}).get("vertices") or [] if isinstance(layout, dict) else []:
        position = vertex.get("position") if isinstance(vertex, dict) else None
        if isinstance(position, dict) and vertex.get("entityId") and isinstance(position.get("x"), (int, float)) and isinstance(position.get("y"), (int, float)):
            out[str(vertex["entityId"])] = (float(position["x"]), float(position["y"]))
    return out


def ui_url(kind: str, entityset_id: str) -> str:
    """The set in OpenAleph's UI (aleph-ui: ``/${type}s/${id}``)."""
    return f"{settings.openaleph_ui_url.rstrip('/')}/{kind}s/{entityset_id}"


def serialize_entityset(row: OpenAlephEntitySetLink) -> dict[str, Any]:
    return {"id": row.id, "kind": row.kind, "label": row.label, "openaleph_entityset_id": row.openaleph_entityset_id,
            "url": ui_url(row.kind, row.openaleph_entityset_id), "items": len(row.item_ids or []),
            "created_by": row.created_by, "created_at": row.created_at, "sent_at": row.sent_at}


def list_entitysets(db: Session, investigation_id: str) -> list[dict[str, Any]]:
    rows = db.scalars(select(OpenAlephEntitySetLink).where(OpenAlephEntitySetLink.investigation_id == investigation_id)
                      .order_by(OpenAlephEntitySetLink.sent_at.desc()))
    return [serialize_entityset(row) for row in rows]


def send_entityset(db: Session, investigation_id: str, *, kind: str, gateway: CorpusGateway, label: str | None = None,
                   entity_ids: list[str] | None = None, created_by: str | None = None) -> dict[str, Any]:
    """Make or update one set in OpenAleph. A diagram and a timeline are one
    per investigation; a list is one per label."""
    if kind not in KINDS:
        raise EntitySetError(f"OpenAleph has no {kind!r} set")
    investigation = db.get(Investigation, investigation_id)
    if investigation is None:
        raise LookupError("Investigation not found")
    if not settings.openaleph_enabled:
        raise EntitySetError("OpenAleph is not set up here")
    binding = get_binding(db, investigation_id)
    if binding is None or not binding.collection_id:
        raise EntitySetError("Nothing of this investigation is in OpenAleph yet; sync it first")
    collection_id = str(binding.collection_id)
    held = _held(db, investigation_id, collection_id)

    if kind == "diagram":
        chosen = list(held.values())
        default_label = f"{investigation.name}: relationships"
    elif kind == "timeline":
        chosen = [h for h in held.values() if _dated(h.entity)]
        default_label = f"{investigation.name}: timeline"
    else:
        wanted = list(dict.fromkeys(entity_ids or []))
        if not wanted:
            raise EntitySetError("Choose the entities for the list")
        missing = [i for i in wanted if i not in held]
        if missing:
            names = [e.caption for e in (db.get(Entity, i) for i in missing[:3]) if e is not None]
            raise EntitySetError(f"Not in OpenAleph yet: {', '.join(names) or 'some of the entities'}; sync the investigation first")
        chosen = [held[i] for i in wanted]
        default_label = f"{investigation.name}: list"
    label = " ".join((label or default_label).split())[:512]
    if not chosen:
        raise EntitySetError("Nothing to put in it: no record in OpenAleph has a date" if kind == "timeline"
                             else "Nothing to put in it: no record of this investigation is in OpenAleph yet")
    if len(chosen) > MAX_ITEMS:
        raise EntitySetError(f"More than {MAX_ITEMS} records; OpenAleph's {kind} would not be readable")

    query = select(OpenAlephEntitySetLink).where(OpenAlephEntitySetLink.investigation_id == investigation_id,
                                                 OpenAlephEntitySetLink.kind == kind, OpenAlephEntitySetLink.collection_id == collection_id)
    if kind == "list":
        query = query.where(OpenAlephEntitySetLink.label == label)
    row = db.scalars(query).first()
    summary = f"Sent from the Journalism Workbench: the reporter-confirmed records of “{investigation.name}”."

    edges = list(db.scalars(select(RelationshipEdge).where(RelationshipEdge.investigation_id == investigation_id)))
    existing_layout: Any = None
    if row is not None:
        try:
            existing_layout = gateway.get_entityset(row.openaleph_entityset_id).get("layout")
        except OpenAlephNotFound:
            row = None     # removed in OpenAleph: made again
    if kind == "diagram":
        layout = diagram_layout({h.entity.id: h for h in chosen}, edges, _kept_positions(existing_layout))
    else:
        layout = {"vertices": [], "edges": []}
    if row is None:
        made = gateway.create_entityset(collection_id, kind=kind, label=label, summary=summary, layout=layout)
        if not made.get("id"):
            raise EntitySetError("OpenAleph did not say which set it made")
        row = OpenAlephEntitySetLink(investigation_id=investigation_id, kind=kind, label=label, collection_id=collection_id,
                                     openaleph_entityset_id=str(made["id"]), item_ids=[], created_by=created_by)
        db.add(row)
        db.flush()
    else:
        gateway.update_entityset(row.openaleph_entityset_id, kind=kind, label=label, summary=summary, layout=layout)
    wanted_ids = [h.signed_id for h in chosen]
    before = set(row.item_ids or [])
    added = 0
    for signed in wanted_ids:
        if signed not in before:
            gateway.set_entityset_item(row.openaleph_entityset_id, signed, keep=True)
            added += 1
    removed = 0
    for signed in sorted(before - set(wanted_ids)):
        try:
            gateway.set_entityset_item(row.openaleph_entityset_id, signed, keep=False)
        except OpenAlephNotFound:
            pass            # OpenAleph no longer holds the entity
        removed += 1
    row.item_ids = wanted_ids
    row.label = label
    row.sent_at = utcnow_naive()
    db.commit()
    db.refresh(row)
    waiting = pending_changes(db, investigation_id).get("to_send", 0)
    return {"entityset": serialize_entityset(row), "added": added, "removed": removed, "waiting_for_sync": waiting}
