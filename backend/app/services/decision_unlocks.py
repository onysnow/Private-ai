"""What answering Yes would unlock (Workbench-redesign-2026.pdf, Check §3.1,
Innovation 1, "Sort by what it unlocks"): each pending decision "is scored by
what it would change: claims that would reach "supported", Red Flags that
would rise, links that would complete a chain."

A dry run on what the records hold now; nothing is written.

- Claims that would reach Supported: a claim proposal's Yes makes the claim
  with its passage linked as supporting evidence (documents.review_candidate).
  The Done rules for Supported (claim_done.done_checks) are run on that claim
  as it would be: one supporting item, the claim's words as its quote, the
  passage's locator, the document's file and source. It counts when no rule
  would be unmet.
- Red Flags that would rise: the detection rules (app/patterns) run in memory
  on the case graph with the new link (a link proposal) or the new record (a
  name proposal) added, against the same rules on the graph as it is. A flag
  rises when it is new, or when its level goes up on parties a flag already had.
- Links that would complete a chain: a link whose two ends are each already
  linked to something, in two groups no chain of links joins yet.

Other answers change none of these: a To check answer is kept on its flag and
leaves its level alone, a missing value's Yes opens a lead, a match, an AI
draft and a watchlist hit change no record. Bounded: at most ``MAX_DRY_RUNS``
proposals are dry-run through the rules per request (the rest say so), and
each document's text and file check is read once."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Document, DocumentChunk, ExtractionCandidate, Source
from app.patterns import graph as case_graph
from app.patterns import specs as detection
from app.patterns.graph import CaseGraph, Link, Party

MAX_DRY_RUNS = 60
LEVEL_ORDER = {"faint": 1, "strong": 2, "textbook": 3}
METER = {0: "▯▯▯", 1: "▮▯▯", 2: "▮▮▯", 3: "▮▮▮"}


def _results(graph: CaseGraph) -> list[tuple[str, str, frozenset[str]]]:
    """Every flag the rules raise on this graph: (indicator, level, parties)."""
    from app.patterns.engine import _run_spec

    out: list[tuple[str, str, frozenset[str]]] = []
    for spec in detection.load():
        found = _run_spec(spec, graph)
        if isinstance(found, str):
            continue
        out.extend((spec.indicator, r.level, frozenset(r.parties)) for r in found)
    return out


def _risen(base: list[tuple[str, str, frozenset[str]]], after: list[tuple[str, str, frozenset[str]]],
           graph: CaseGraph) -> list[dict[str, Any]]:
    """The flags that are new or higher after the change, each with its level before and after."""
    from app.patterns.engine import _name

    out: list[dict[str, Any]] = []
    seen: set[tuple[str, frozenset[str]]] = set()
    for indicator, level, parties in after:
        before = max((LEVEL_ORDER[lv] for i, lv, ps in base if i == indicator and ps & parties), default=0)
        now = LEVEL_ORDER[level]
        if now <= before or (indicator, parties) in seen:
            continue
        seen.add((indicator, parties))
        names = ", ".join(graph.name(p) for p in sorted(parties, key=graph.name)[:3])
        out.append({"indicator_id": indicator, "name": _name(indicator), "from_level": next((k for k, v in LEVEL_ORDER.items() if v == before), None),
                    "to_level": level, "text": f"{METER[before]} → {METER[now]} {_name(indicator)}" + (f" ({names})" if names else "")})
    return out


class _Groups:
    """Which parties a chain of links already joins (union-find over the case's links)."""

    def __init__(self, graph: CaseGraph) -> None:
        self.up: dict[str, str] = {}
        self.size: dict[str, int] = {}
        self.linked: set[str] = set()
        for link in graph.links:
            self.join(link.source, link.target)
            self.linked |= {link.source, link.target}

    def find(self, x: str) -> str:
        self.up.setdefault(x, x)
        self.size.setdefault(x, 1)
        while self.up[x] != x:
            self.up[x] = self.up[self.up[x]]
            x = self.up[x]
        return x

    def join(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.up[ra] = rb
            self.size[rb] += self.size[ra]


class Unlocks:
    """One request's dry runs: the graph, its flags and its groups are worked out once."""

    def __init__(self, db: Session, inv: str) -> None:
        self.db, self.inv = db, inv
        self._graph: CaseGraph | None = None
        self._base: list[tuple[str, str, frozenset[str]]] | None = None
        self._groups: _Groups | None = None
        self._names: set[str] | None = None
        self._docs: dict[str, tuple[Document | None, Source | None, str | None, bool | None]] = {}
        self.dry_runs = 0

    @property
    def graph(self) -> CaseGraph:
        if self._graph is None:
            self._graph = case_graph.build(self.db, self.inv)
        return self._graph

    @property
    def base(self) -> list[tuple[str, str, frozenset[str]]]:
        if self._base is None:
            self._base = _results(self.graph)
        return self._base

    @property
    def names(self) -> set[str]:
        if self._names is None:
            self._names = {p.name.strip().casefold() for p in self.graph.parties.values()}
        return self._names

    @property
    def groups(self) -> _Groups:
        if self._groups is None:
            self._groups = _Groups(self.graph)
        return self._groups

    # --- claims -------------------------------------------------------------------------------------------------

    def _document(self, document_id: str) -> tuple[Document | None, Source | None, str | None, bool | None]:
        """The document, its source, its text (None while it is being read) and whether its file still matches."""
        if document_id not in self._docs:
            from app.services.claim_done import _file_matches, _norm

            doc = self.db.get(Document, document_id)
            src = self.db.get(Source, doc.source_id) if doc else None
            text = None
            if doc is not None and doc.extraction_status == "complete":
                text = _norm(" ".join(self.db.scalars(select(DocumentChunk.text).where(DocumentChunk.document_id == doc.id)
                                                      .order_by(DocumentChunk.ordinal))))
            self._docs[document_id] = (doc, src, text, _file_matches(doc) if doc is not None else None)
        return self._docs[document_id]

    def claim_reaches_supported(self, row: ExtractionCandidate) -> bool:
        """The Done rules for Supported on the claim Yes would make (claim_done.done_checks, rule by rule)."""
        from app.services.claim_done import _leads_only, _norm

        doc, src, text, file_ok = self._document(row.document_id)
        payload = row.payload if isinstance(row.payload, dict) else {}
        quote = _norm(str(payload.get("text") or ""))
        # The evidence's locator as review_candidate writes it: the passage's place, or its character span.
        chunk = self.db.get(DocumentChunk, row.chunk_id) if row.chunk_id else None
        span = payload.get("span")
        locator = (chunk.locator if chunk else None) or ("document" if isinstance(span, dict) and isinstance(span.get("start_char"), int) else None)
        if doc is None or src is None or not quote:
            return False
        says = None if text is None else quote in text  # unknown while the document is still being read
        return says is not False and bool((locator or "").strip()) and file_ok is not False and not _leads_only(src)

    # --- flags and chains ---------------------------------------------------------------------------------------

    def _dry_run(self, *, party: Party | None = None, link: Link | None = None) -> list[dict[str, Any]] | None:
        if self.dry_runs >= MAX_DRY_RUNS:
            return None
        self.dry_runs += 1
        base = self.graph
        changed = CaseGraph(parties=dict(base.parties), links=list(base.links))
        if party is not None:
            changed.parties[party.id] = party
        if link is not None:
            changed.links.append(link)
        return _risen(self.base, _results(changed), changed)

    def link_ends(self, row: ExtractionCandidate, payload: dict[str, Any]) -> tuple[str, str] | None:
        """The records a link proposal joins, when both exist (a table link's ends are accepted first)."""
        if payload.get("source_candidate_id"):
            ends = []
            for key in ("source_candidate_id", "target_candidate_id"):
                end = self.db.get(ExtractionCandidate, payload.get(key))
                if end is None or end.review_status != "accepted" or end.accepted_record_type != "entity" or not end.accepted_record_id:
                    return None
                ends.append(str(end.accepted_record_id))
            source, target = ends
        else:
            source, target = str(payload.get("source_entity_id") or ""), str(payload.get("target_entity_id") or "")
        if source not in self.graph.parties or target not in self.graph.parties:
            return None
        return source, target

    def for_link(self, row: ExtractionCandidate, payload: dict[str, Any]) -> dict[str, Any] | None:
        ends = self.link_ends(row, payload)
        if ends is None:
            return None
        source, target = ends
        raw = payload.get("properties")
        props = {str(k): [str(x) for x in v] for k, v in raw.items() if isinstance(v, list)} if isinstance(raw, dict) else {}
        risen = self._dry_run(link=Link(f"dry-run:{row.id}", str(payload.get("schema") or ""), source, target, props, "supported"))
        if risen is None:
            return None
        groups = self.groups
        chains = []
        if (source != target and source in groups.linked and target in groups.linked
                and groups.find(source) != groups.find(target)):
            g = self.graph
            chains.append(f"Joins {g.name(source)}'s group ({groups.size[groups.find(source)]} parties) "
                          f"to {g.name(target)}'s ({groups.size[groups.find(target)]}), which no chain of links joins yet")
        return {"flags": risen, "chains": chains}

    def for_entity(self, row: ExtractionCandidate, payload: dict[str, Any]) -> list[dict[str, Any]] | None:
        caption = str(payload.get("caption") or "").strip()
        schema = str(payload.get("suggested_schema") or "Thing")
        raw = payload.get("properties")
        props = {str(k): [str(x) for x in v if str(x).strip()] for k, v in raw.items() if isinstance(v, list)} if isinstance(raw, dict) else {}
        props.setdefault("name", [caption])
        return self._dry_run(party=Party(f"dry-run:{row.id}", caption, schema, props))


def _words(claims: int, flags: int, chains: int) -> str:
    parts = []
    if claims:
        parts.append(f"{claims} claim{'s' if claims != 1 else ''} supported")
    if flags:
        parts.append(f"{flags} Red Flag{'s' if flags != 1 else ''} rise{'' if flags != 1 else 's'}")
    if chains:
        parts.append(f"{chains} chain{'s' if chains != 1 else ''} complete{'' if chains != 1 else 'd'}")
    return f"unlocks: {', '.join(parts)}" if parts else ""


def _set(item: dict[str, Any], *, claims: list[str] | None = None, flags: list[dict[str, Any]] | None = None,
         chains: list[str] | None = None, counted: bool = True) -> None:
    claims, flags, chains = claims or [], flags or [], chains or []
    item["unlocks"] = {"score": len(claims) + len(flags) + len(chains), "claims": len(claims), "flags": len(flags),
                       "chains": len(chains), "counted": counted, "words": _words(len(claims), len(flags), len(chains)),
                       "lines": claims + [f["text"] for f in flags] + chains, "flag_changes": flags}


def none(item: dict[str, Any]) -> None:
    """An answer that unlocks none of these."""
    _set(item)


def score(db: Session, inv: str, items: list[dict[str, Any]]) -> None:
    """Sets ``unlocks`` on each item (the answer Yes, dry-run). Proposals are tried by rank, so when there are more
    than ``MAX_DRY_RUNS`` to run through the rules, the ones the list puts first are the ones counted."""
    work = Unlocks(db, inv)
    for item in sorted(items, key=lambda i: -i["rank"]):
        row: ExtractionCandidate | None = item.get("_row")
        if item["kind"] != "proposal" or row is None:
            _set(item)
            continue
        payload = row.payload if isinstance(row.payload, dict) else {}
        if row.candidate_type == "claim":
            ok = work.claim_reaches_supported(row)
            _set(item, claims=["The claim would meet every Done rule for Supported, with this passage as its support"] if ok else [])
        elif row.candidate_type == "relationship":
            found = work.for_link(row, payload)
            if found is None:
                _set(item, counted=work.link_ends(row, payload) is None)
            else:
                _set(item, flags=found["flags"], chains=found["chains"])
        elif row.candidate_type == "entity":
            # A name the case already holds asks same-or-new first; its Yes adds no record (decisions() checks the
            # ones shown with the real match preview).
            caption = str(payload.get("caption") or "").strip().casefold()
            if caption in work.names:
                _set(item)
                continue
            risen = work.for_entity(row, payload)
            _set(item, flags=risen or [], counted=risen is not None)
        else:
            _set(item)
