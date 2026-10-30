"""What a decision unlocks (CHECK_1, Decide › "by what it unlocks"; research §06 Innovation 1).

A dry run, with nothing written: for each answer that can change what the case shows, what a Yes would change.

- A link proposal (from a passage or a table's rows): the detection rules run on the case's graph with the link
  added, as the rules would read it once accepted (not yet reviewed), and every Red Flag that would appear or
  rise is named. A table link's ends that are not yet decided count as the records "Add it" would make, or as the
  case's record of that exact name.
- A claim proposal: the Definition of done (app/services/claim_done.py) runs on the claim as keeping it would
  make it, its passage linked as supporting evidence, and says whether it would meet Supported's rules, and
  Confirmed's. The rules depend on the document, not the sentence (the sentence is the document's own words),
  so they run once per document.

Nothing else in Decide unlocks anything here: a To check answer is kept on its flag without changing its level,
a missing value needs the value itself, an outside match is recorded without merging, an AI draft never makes a
record, and a watchlist hit opens a lead.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import (
    Document,
    DocumentChunk,
    Entity,
    Evidence,
    ExtractionCandidate,
)
from app.patterns import engine
from app.patterns import graph as case_graph
from app.patterns import specs as detection
from app.services.claim_done import judge
from app.services.entity_signals import norm_name

LEVELS = {"faint": 1, "strong": 2, "textbook": 3}
LEVEL_WORD = {"faint": "Faint", "strong": "Strong", "textbook": "Textbook"}
# How much each unlock weighs in the order: a flag by its level, above a claim made ready.
SCORE_FLAG = 100
SCORE_CONFIRMED = 60
SCORE_SUPPORTED = 40


def _flags(graph: case_graph.CaseGraph) -> dict[str, tuple[str, str]]:
    """Every flag the rules raise on this graph: fingerprint → (indicator, level)."""
    out: dict[str, tuple[str, str]] = {}
    for spec in detection.load():
        results = engine._run_spec(spec, graph)
        if isinstance(results, str):
            continue
        for res in results:
            out[engine._fingerprint(spec.indicator, res.parties, res.links)] = (spec.indicator, res.level)
    return out


def _survivor(db: Session, entity_id: str | None) -> str | None:
    seen: set[str] = set()
    while entity_id and entity_id not in seen:
        seen.add(entity_id)
        row = db.get(Entity, entity_id)
        if row is None:
            return None
        if not row.merged_into_entity_id:
            return row.id
        entity_id = row.merged_into_entity_id
    return None


class Links:
    """The case graph once, and each link proposal's dry run against it."""

    def __init__(self, db: Session, inv: str) -> None:
        self.db = db
        self.graph = case_graph.build(db, inv)
        self.before = _flags(self.graph)
        self.by_name = {norm_name(p.name): pid for pid, p in self.graph.parties.items()}

    def _end(self, candidate_id: Any) -> tuple[str, case_graph.Party | None] | None:
        """A table link's end: the record its proposal became, the case's record of that name, or the record
        "Add it" would make (returned as a party to add)."""
        end = self.db.get(ExtractionCandidate, str(candidate_id)) if candidate_id else None
        if end is None or end.review_status == "rejected":
            return None
        if end.review_status == "accepted" and end.accepted_record_type == "entity":
            pid = _survivor(self.db, end.accepted_record_id)
            return (pid, None) if pid else None
        p = end.payload or {}
        caption = str(p.get("caption") or "").strip()
        if not caption:
            return None
        if norm_name(caption) in self.by_name:
            return self.by_name[norm_name(caption)], None
        pid = f"proposal:{end.id}"
        return pid, case_graph.Party(pid, caption, str(p.get("suggested_schema") or "LegalEntity"), {})

    def run(self, row: ExtractionCandidate) -> list[dict[str, Any]]:
        p = row.payload or {}
        added: list[case_graph.Party] = []
        if p.get("source_candidate_id"):
            ends = [self._end(p.get("source_candidate_id")), self._end(p.get("target_candidate_id"))]
            if None in ends:
                return []
            source, target = ends[0][0], ends[1][0]  # type: ignore[index]
            added = [party for _, party in ends if party is not None]  # type: ignore[misc]
        else:
            source, target = _survivor(self.db, p.get("source_entity_id")), _survivor(self.db, p.get("target_entity_id"))
            if not source or not target:
                return []
        return self.run_link(str(p.get("schema") or ""), source, target, p.get("properties") or {}, added, f"proposal:{row.id}")

    def run_link(self, schema: str, source: str, target: str, properties: dict[str, Any],
                 added: list[case_graph.Party] | None = None, link_id: str = "new-link",
                 payment_kind: str | None = None) -> list[dict[str, Any]]:
        """The Red Flags a link not yet in the case would raise or lift, as the rules would read it unreviewed. A
        payment that is an amount owed (app/services/payment_kinds.py) is not read by the rules: it raises none."""
        from app.services.payment_kinds import is_owed

        if schema == "Payment" and is_owed(payment_kind):
            return []
        props = {k: [str(v) for v in (vs if isinstance(vs, list) else [vs])] for k, vs in properties.items()}
        graph = case_graph.CaseGraph(parties={**self.graph.parties, **{party.id: party for party in added or []}},
                                     links=[*self.graph.links, case_graph.Link(link_id, schema, source, target, props, "unsupported")])
        out = []
        for fp, (indicator, level) in _flags(graph).items():
            was = self.before.get(fp)
            if was is not None and LEVELS.get(level, 0) <= LEVELS.get(was[1], 0):
                continue
            name = engine._name(indicator)
            text = (f"Raises the Red Flag “{name}” from {LEVEL_WORD.get(was[1], was[1])} to {LEVEL_WORD.get(level, level)}" if was
                    else f"Raises the Red Flag “{name}” ({LEVEL_WORD.get(level, level)})")
            out.append({"text": text, "score": SCORE_FLAG * LEVELS.get(level, 1)})
        return sorted(out, key=lambda u: -u["score"])


def _claim(db: Session, row: ExtractionCandidate, cache: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    if row.document_id in cache:
        return cache[row.document_id]
    doc = db.get(Document, row.document_id)
    out: list[dict[str, Any]] = []
    if doc is not None:
        # As review_candidate keeps it: the sentence as a supporting quote of the document's source, with its place.
        chunk = db.get(DocumentChunk, row.chunk_id) if row.chunk_id else None
        ev = Evidence(source_id=doc.source_id, quote=str((row.payload or {}).get("text") or ""), locator=chunk.locator if chunk else (row.payload or {}).get("locator"))
        supported = judge(db, None, [("supports", ev, None)], target="supported")
        confirmed = judge(db, None, [("supports", ev, None)], target="confirmed")
        if confirmed["met"]:
            out = [{"text": "Kept, the claim meets every rule for Confirmed (a primary official record says it)", "score": SCORE_CONFIRMED}]
        elif supported["met"]:
            out = [{"text": "Kept, the claim meets every rule for Supported; Confirmed needs a second, independent source", "score": SCORE_SUPPORTED}]
    cache[row.document_id] = out
    return out


def unlocks(db: Session, inv: str, items: list[dict[str, Any]]) -> None:
    """Sets ``unlocks`` (what a Yes would change, in words) and ``unlock_score`` on each item."""
    ids = [i["id"] for i in items if i["kind"] == "proposal"]
    rows = {r.id: r for r in db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.id.in_(ids)))} if ids else {}
    links: Links | None = None
    claims: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        found: list[dict[str, Any]] = []
        row = rows.get(item["id"]) if item["kind"] == "proposal" else None
        if row is not None and row.candidate_type == "relationship":
            links = links or Links(db, inv)
            found = links.run(row)
        elif row is not None and row.candidate_type == "claim":
            found = _claim(db, row, claims)
        item["unlocks"] = [u["text"] for u in found]
        item["unlock_score"] = sum(u["score"] for u in found)
