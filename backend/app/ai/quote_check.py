"""The quote check (Foundation Fixes fix 4): every key point, figure and
cited record in an AI presentation draft must bring the page.

Each reference the model makes carries a short ``quote``. The check looks
for that quote, word for word, in the cited record's own text -- an
evidence quote, a claim, a document's extracted chunks, and so on -- and
ignores only differences in whitespace. A match is kept with where it was
found (the field or document chunk, and character offsets into that text)
so the review screen can highlight it. Anything without a matching quote is
removed before the draft reaches the review queue, and the removals are
recorded with their reasons. A figure, bar or timeline item must also have
its value or date stated in its found quotes (app/ai/value_check.py), or it
is removed the same way.

Applies to presentation drafts only: their output format is the
Workbench's own. The two TAS analysis modules follow the suite's spec.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.value_check import unstated_value

MIN_QUOTE_WORDS = 3            # "the board" proves nothing about where a point came from
MAX_RECORD_TEXT_CHARS = 12000  # per record, in the prompt; quotes are searched in the full text
_WS = re.compile(r"\s+")


@dataclass(frozen=True)
class TextSource:
    """One quotable text of a record: its own field, or one document chunk."""
    record_type: str
    record_id: str
    field: str            # e.g. "quote", "text", "chunk"
    text: str
    chunk_id: str | None = None
    locator: str | None = None


def record_texts(db: Session, record_type: str, record_id: str) -> list[TextSource]:
    """Every text a draft may quote for one cited record."""
    from app.models.domain import (
        Claim, Document, DocumentChunk, Entity, Evidence, Lead, RelationshipEdge, ReportingTask, Source,
    )

    def fields(row: Any, names: tuple[str, ...]) -> list[TextSource]:
        return [TextSource(record_type, record_id, name, str(getattr(row, name)))
                for name in names if row is not None and getattr(row, name, None)]

    if record_type == "evidence":
        return fields(db.get(Evidence, record_id), ("quote", "notes"))
    if record_type == "claim":
        return fields(db.get(Claim, record_id), ("text",))
    if record_type == "entity":
        entity = db.get(Entity, record_id)
        if entity is None:
            return []
        out = fields(entity, ("caption",))
        for prop, values in (entity.properties or {}).items():
            for value in values or []:
                out.append(TextSource(record_type, record_id, f"properties.{prop}", str(value)))
        return out
    if record_type == "relationship":
        edge = db.get(RelationshipEdge, record_id)
        rel_entity = db.get(Entity, edge.relationship_entity_id) if edge is not None and edge.relationship_entity_id else None
        out = []
        for prop, values in ((rel_entity.properties if rel_entity else None) or {}).items():
            for value in values or []:
                out.append(TextSource(record_type, record_id, f"properties.{prop}", str(value)))
        return out
    if record_type == "source":
        return fields(db.get(Source, record_id), ("title",))
    if record_type == "lead":
        return fields(db.get(Lead, record_id), ("title", "detail"))
    if record_type in ("task", "reporting_task"):
        return fields(db.get(ReportingTask, record_id), ("title", "detail"))
    if record_type == "document":
        if db.get(Document, record_id) is None:
            return []
        chunks = db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == record_id).order_by(DocumentChunk.ordinal)).all()
        return [TextSource(record_type, record_id, "chunk", chunk.text or "", chunk_id=chunk.id, locator=chunk.locator) for chunk in chunks]
    return []


def prompt_record_texts(db: Session, citations: list[dict]) -> list[dict]:
    """The quotable text of each cited record, for the model to quote from."""
    out = []
    for citation in citations:
        sources = record_texts(db, citation["record_type"], citation["record_id"])
        if not sources:
            continue
        parts = [f"[{s.locator}] {s.text}" if s.locator else s.text for s in sources]
        text = "\n".join(parts)
        out.append({"record_type": citation["record_type"], "record_id": citation["record_id"],
                    "text": text[:MAX_RECORD_TEXT_CHARS], "truncated": len(text) > MAX_RECORD_TEXT_CHARS})
    return out


def _normalized_with_map(text: str) -> tuple[str, list[int]]:
    """Collapse whitespace runs to one space; map each normalized character
    back to its index in the original text."""
    out: list[str] = []
    index: list[int] = []
    in_space = False
    for i, ch in enumerate(text):
        if ch.isspace():
            if not in_space and out:
                out.append(" ")
                index.append(i)
            in_space = True
            continue
        in_space = False
        out.append(ch)
        index.append(i)
    if out and out[-1] == " ":
        out.pop()
        index.pop()
    return "".join(out), index


def find_quote(quote: str, sources: list[TextSource]) -> dict | None:
    """Where ``quote`` appears word for word (whitespace aside), or None."""
    needle = _WS.sub(" ", quote or "").strip()
    if len(needle.split(" ")) < MIN_QUOTE_WORDS:
        return None
    for source in sources:
        haystack, index = _normalized_with_map(source.text)
        at = haystack.find(needle)
        if at < 0:
            continue
        start, end = index[at], index[at + len(needle) - 1] + 1
        match = {"field": source.field, "start_char": start, "end_char": end, "matched_text": source.text[start:end]}
        if source.chunk_id:
            match.update({"chunk_id": source.chunk_id, "locator": source.locator})
        return match
    return None


def _verify_refs(db: Session, refs: Any, where: str, removed: list[dict], cache: dict) -> list[dict]:
    kept: list[dict] = []
    for ref in refs if isinstance(refs, list) else []:
        if not isinstance(ref, dict) or not isinstance(ref.get("record_type"), str) or not isinstance(ref.get("record_id"), str):
            continue
        key = (ref["record_type"], ref["record_id"])
        if key not in cache:
            cache[key] = record_texts(db, *key)
        quote = ref.get("quote")
        if not isinstance(quote, str) or not quote.strip():
            removed.append({"where": where, "record": list(key), "reason": "no quote given"})
            continue
        match = find_quote(quote, cache[key])
        if match is None:
            short = len(_WS.sub(" ", quote).strip().split(" ")) < MIN_QUOTE_WORDS
            removed.append({"where": where, "record": list(key), "quote": quote,
                            "reason": f"quote shorter than {MIN_QUOTE_WORDS} words" if short else "quote not found in the cited record"})
            continue
        kept.append({"record_type": key[0], "record_id": key[1], "quote": quote, **match})
    return kept


def check_presentation_quotes(db: Session, payload: dict) -> tuple[dict, dict]:
    """Return (checked payload, report). The checked payload keeps the
    format the rest of the app reads: ``key_points`` stays a list of
    strings, with each kept point's verified quotes in the parallel
    ``key_point_evidence`` list; every kept reference gains its match."""
    checked = copy.deepcopy(payload)
    removed: list[dict] = []
    cache: dict[tuple[str, str], list[TextSource]] = {}
    verified = 0
    sections_out = []
    for i, section in enumerate(checked.get("sections") or []):
        if not isinstance(section, dict):
            continue
        heading = section.get("heading") or f"section {i + 1}"
        points: list[str] = []
        point_evidence: list[list[dict]] = []
        for j, point in enumerate(section.get("key_points") or []):
            text = point.get("text") if isinstance(point, dict) else point
            refs = point.get("evidence") if isinstance(point, dict) else []
            kept = _verify_refs(db, refs, f"{heading}: key point {j + 1}", removed, cache)
            if kept:
                points.append(str(text))
                point_evidence.append(kept)
                verified += len(kept)
            else:
                removed.append({"where": f"{heading}: key point {j + 1}", "text": text, "reason": "no cited quote could be found"})
        section["key_points"] = points
        section["key_point_evidence"] = point_evidence
        section["evidence"] = _verify_refs(db, section.get("evidence"), f"{heading}: evidence", removed, cache)
        verified += len(section["evidence"])

        visual = section.get("visual")
        if isinstance(visual, dict) and isinstance(visual.get("items"), list):
            items = []
            for k, item in enumerate(visual["items"]):
                label = item.get("label") if isinstance(item, dict) else None
                kept = _verify_refs(db, item.get("evidence") if isinstance(item, dict) else None,
                                    f"{heading}: {visual.get('type')} item {k + 1}", removed, cache)
                unstated = unstated_value(str(visual.get("type")), item, [ref["quote"] for ref in kept],
                                          unit=visual.get("unit")) if kept else None
                if kept and unstated is None:
                    items.append({**item, "evidence": kept})
                    verified += len(kept)
                elif kept:
                    removed.append({"where": f"{heading}: {visual.get('type')} item {k + 1}", "text": label, "reason": unstated})
                else:
                    removed.append({"where": f"{heading}: {visual.get('type')} item {k + 1}", "text": label,
                                    "reason": "no cited quote could be found"})
            from app.ai.reasoning import VISUAL_TYPES

            low = VISUAL_TYPES.get(str(visual.get("type")), (1, 99))[0]
            if len(items) < low:
                section["visual"] = None
                removed.append({"where": f"{heading}: {visual.get('type')}", "reason": f"fewer than {low} item(s) left with a found quote stating the value"})
            else:
                section["visual"] = {**visual, "items": items}

        if not section["key_points"] and not section["evidence"]:
            removed.append({"where": heading, "reason": "nothing in this section kept a found quote"})
            continue
        sections_out.append(section)
    checked["sections"] = sections_out
    report = {"verified_quotes": verified, "removed": removed, "min_quote_words": MIN_QUOTE_WORDS}
    return checked, report
