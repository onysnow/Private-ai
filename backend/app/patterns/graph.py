"""The case graph the rules read: the parties and links the network draws
(the reconciled view: a reviewed duplicate counts once), with each party's
properties and each link's properties and how sure it is."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import networkx as nx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Entity
from app.services.paths import certainty_of
from app.services.relationships import investigation_graph


@dataclass
class Party:
    id: str
    name: str
    schema: str
    properties: dict[str, list[str]]


@dataclass
class Link:
    id: str
    schema: str
    source: str
    target: str
    properties: dict[str, list[str]]
    certainty: str  # supported | unsupported | contested


@dataclass
class CaseGraph:
    parties: dict[str, Party] = field(default_factory=dict)
    links: list[Link] = field(default_factory=list)

    def directed(self, *schemas: str) -> nx.MultiDiGraph:
        """The links of these schemas as a directed multigraph, keyed by link id."""
        g: nx.MultiDiGraph = nx.MultiDiGraph()
        g.add_nodes_from(self.parties)
        for link in self.links:
            if link.schema in schemas:
                g.add_edge(link.source, link.target, key=link.id, link=link)
        return g

    def name(self, party_id: str) -> str:
        p = self.parties.get(party_id)
        return p.name if p else party_id


def build(db: Session, investigation_id: str) -> CaseGraph:
    graph = investigation_graph(db, investigation_id)
    out = CaseGraph()
    ids = {n["id"] for n in graph["nodes"]}
    # Every party of the investigation (a shared address needs no link), not only the linked ones.
    for e in db.scalars(select(Entity).where(Entity.investigation_id == investigation_id, Entity.merged_into_entity_id.is_(None))):
        if e.schema in RELATIONSHIP_CARRIERS and e.id not in ids:
            continue
        out.parties[e.id] = Party(e.id, e.caption or e.id, e.schema, dict(e.properties or {}))
    for edge in graph["edges"]:
        if not (edge.get("source") and edge.get("target")):
            continue
        out.links.append(Link(edge["id"], edge["schema"], edge["source"]["id"], edge["target"]["id"],
                              dict(edge.get("properties") or {}), certainty_of(edge.get("advisory"))))
    return out


# FollowTheMoney schemas that are links, not parties: their interstitial
# entities are not parties of their own.
RELATIONSHIP_CARRIERS = {"Ownership", "Directorship", "Employment", "Membership", "Representation", "Payment", "Debt",
                         "Family", "Associate", "UnknownLink", "Succession", "Occupancy"}


def first(props: dict[str, list[Any]], key: str) -> Any:
    values = props.get(key) or []
    return values[0] if values else None
