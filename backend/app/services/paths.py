"""How are these two connected? (docs/discovery/README.md, "Overlays";
system-design.md §3.2 /paths).

Every simple chain of links between two parties, up to ``max_len`` links,
over the same links the network draws (the reconciled view: a reviewed
duplicate counts once). Links are followed in either direction: a chain says
that the two are connected, and each step keeps its own direction. Each chain
carries how sure its weakest link is, read from the same review advisory the
network's line pattern uses (frontend lib/viz-tokens.ts certaintyOf).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.services.relationships import investigation_graph

# Weakest first: a chain is only as sure as its least sure link.
CERTAINTY_ORDER = ["contested", "unsupported", "supported"]
MAX_CHAINS = 50
# The walk stops once this many chains are found, so a dense network cannot
# keep it searching; the reply then says it was cut short.
STOP_AFTER = 1000


def certainty_of(advisory: dict[str, Any] | None) -> str:
    """The same rule as frontend lib/viz-tokens.ts certaintyOf."""
    if not advisory:
        return "unsupported"
    counts = advisory.get("relationship_evidence_review_counts") or {}
    if advisory.get("needs_review") or (counts.get("contradicts") or 0) > 0:
        return "contested"
    if advisory.get("has_independent_support") or (counts.get("supports") or 0) > 0:
        return "supported"
    return "unsupported"


def connections(db: Session, investigation_id: str, from_id: str, to_id: str, max_len: int = 4) -> dict[str, Any]:
    """Every simple chain from ``from_id`` to ``to_id``: shortest first, then
    surest first; at most MAX_CHAINS (``truncated`` says when there were more)."""
    if from_id == to_id:
        raise ValueError("Pick two different parties")
    graph = investigation_graph(db, investigation_id)
    names = {n["id"]: n["caption"] for n in graph["nodes"]}
    if from_id not in names or to_id not in names:
        raise ValueError("Both parties must have at least one link in this investigation")
    adjacency: dict[str, list[tuple[str, dict[str, Any]]]] = {}
    for edge in graph["edges"]:
        if not (edge.get("source") and edge.get("target")):
            continue
        a, b = edge["source"]["id"], edge["target"]["id"]
        if a == b:
            continue
        step = {"id": edge["id"], "schema": edge["schema"], "from": a, "to": b, "certainty": certainty_of(edge.get("advisory"))}
        adjacency.setdefault(a, []).append((b, step))
        adjacency.setdefault(b, []).append((a, step))

    found: list[dict[str, Any]] = []
    limit = max(1, min(max_len, 6))

    def walk(at: str, seen: list[str], steps: list[dict[str, Any]]) -> None:
        if at == to_id:
            weakest = min((s["certainty"] for s in steps), key=CERTAINTY_ORDER.index)
            found.append({"parties": [{"id": p, "name": names.get(p, p)} for p in seen], "links": list(steps), "weakest": weakest})
            return
        if len(steps) >= limit or len(found) >= STOP_AFTER:
            return
        for nxt, step in adjacency.get(at, []):
            if nxt in seen:
                continue
            walk(nxt, [*seen, nxt], [*steps, step])

    walk(from_id, [from_id], [])
    found.sort(key=lambda c: (len(c["links"]), -CERTAINTY_ORDER.index(c["weakest"]), [s["id"] for s in c["links"]]))
    return {"from_id": from_id, "to_id": to_id, "max_len": limit, "total": len(found),
            "truncated": len(found) > MAX_CHAINS, "chains": found[:MAX_CHAINS]}
