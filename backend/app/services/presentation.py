"""Promotion of an accepted `presentation_draft` AIAnalysisCandidate into a
canonical Writeup (brief) and/or Deck -- the second half of the
presentation-generator workflow (see app/ai/presentation_modules/PRESENTATION_DRAFT.md
and app/services/assistant_context.py:build_selected_record_context for the
first half, which produces the candidate).

A single accepted candidate can be promoted to a Writeup, a Deck, both, or
neither -- Ony's "both, picked per use" requirement means this is NOT a
one-shot/idempotent operation the way StatementPromotion is (see
app/services/promotion.py): each call creates a new row. The reporter might
promote to a brief now and a deck for a client meeting later, from the same
underlying draft.

The candidate's payload has already passed schema and citation validation
in run_reasoning_module() (see app/ai/reasoning.py's OUTPUT_SCHEMAS /
validate_output_shape / validate_citations), so this module trusts its
shape -- it only re-checks the two things specific to promotion: the right
module, and that a human has actually accepted it.

deck_slides_from_payload() is also what the review panel's slide preview
renders (GET /api/ai-analysis-candidates/{id} returns it as
`deck_preview`), so what a reporter previews is exactly what gets promoted.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.ai.writing_check import SINGLE_SOURCE_MARK, key_point_refs, single_source
from app.models.domain import AIAnalysisCandidate, Deck, Writeup
from app.services.assistant_context import describe_record_refs
from app.services.decks import _normalize_slides, create_deck, normalize_visual
from app.services.writeups import create_writeup

PROMOTABLE_MODULE = "presentation_draft"


def payload_citation_refs(payload: dict | None) -> list[dict]:
    """Every {record_type, record_id} the draft cites (section evidence and
    visual items), first-appearance order, de-duplicated."""
    seen, refs = set(), []

    def visit(node: Any) -> None:
        if isinstance(node, dict):
            rt, rid = node.get("record_type"), node.get("record_id")
            if isinstance(rt, str) and isinstance(rid, str) and (rt, rid) not in seen:
                seen.add((rt, rid))
                refs.append({"record_type": rt, "record_id": rid})
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for item in node:
                visit(item)

    visit((payload or {}).get("sections") or [])
    return refs


def _require_promotable(candidate: AIAnalysisCandidate) -> dict:
    if candidate.module != PROMOTABLE_MODULE:
        raise ValueError(f"only {PROMOTABLE_MODULE!r} candidates can be promoted to a writeup or deck, got module={candidate.module!r}")
    if candidate.review_status != "accepted":
        raise ValueError("candidate must be accepted (reviewed) before it can be promoted")
    payload = candidate.payload or {}
    if not payload.get("sections"):
        raise ValueError("candidate payload has no sections to promote")
    return payload


def _short_label(detail: dict | None, ref: dict) -> str:
    if not detail:
        return f"{ref['record_type']}:{ref['record_id'][:8]}"
    label = str(detail.get("locator") or detail.get("label") or ref["record_id"][:8])
    return label if len(label) <= 60 else label[:59] + "…"


def _citation_node(ref: dict, labels: dict[tuple[str, str], dict]) -> dict:
    record_type, record_id = ref.get("record_type"), ref.get("record_id")
    detail = labels.get((str(record_type), str(record_id)))
    # Citation nodes use the reporter-facing "task" spelling, like every other
    # citation in a write-up (see app/services/writeups.py).
    trace_type = "task" if record_type == "reporting_task" else record_type
    return {"type": "citation", "attrs": {"recordType": trace_type, "recordId": record_id, "label": _short_label(detail, ref)}}


def _text(text: str) -> list[dict]:
    return [{"type": "text", "text": text}] if text else []


_RECORD_NOUNS = {"evidence": ("evidence record", "evidence records"), "source": ("source", "sources"), "entity": ("entity", "entities"),
                 "relationship": ("relationship", "relationships"), "claim": ("claim", "claims"), "document": ("document", "documents"),
                 "lead": ("lead", "leads"), "reporting_task": ("reporting task", "reporting tasks"), "timeline_event": ("timeline event", "timeline events")}


def how_we_know(payload: dict) -> str:
    """The brief's and the deck's "how we know" line: how many records the
    draft rests on, of which kinds, and what the single-record mark means
    (The Markup, "Show your work": the data links up front)."""
    refs = payload_citation_refs(payload)
    counts: dict[str, int] = {}
    for ref in refs:
        counts[ref["record_type"]] = counts.get(ref["record_type"], 0) + 1
    kinds = ", ".join(f"{n} {_RECORD_NOUNS.get(t, (t, t + 's'))[0 if n == 1 else 1]}" for t, n in counts.items())
    line = f"This rests on {len(refs)} record{'s' if len(refs) != 1 else ''} in the investigation" + (f": {kinds}." if kinds else ".")
    return line + f" {SINGLE_SOURCE_MARK} marks a statement that rests on one record."


def _limits(payload: dict) -> list[str]:
    return [str(limit) for limit in payload.get("limits") or [] if str(limit).strip()]


def writeup_content_from_payload(payload: dict, labels: dict[tuple[str, str], dict] | None = None) -> dict:
    """The brief as a TipTap/ProseMirror document. The write-up's title is
    its own field (Writeup.title), so it is not repeated as a heading here.

    Two non-core node types carry the draft's structure into the editor and
    the .docx export: `callout` (the executive takeaway; attrs.tone) and
    `evidenceVisual` (a section's figures/timeline/bar data, attrs.visual,
    every item still carrying its evidence refs -- see
    app/services/writeups.py for how both are rendered and how their refs
    are counted as citations).
    """
    labels = labels or {}
    content: list[dict] = []
    if payload.get("goal_restated"):
        content.append({"type": "paragraph", "content": [{"type": "text", "text": payload["goal_restated"], "marks": [{"type": "italic"}]}]})
    if payload.get("executive_takeaway"):
        content.append({"type": "callout", "attrs": {"tone": "takeaway", "title": "The takeaway"},
                        "content": [{"type": "paragraph", "content": _text(payload["executive_takeaway"])}]})

    for section in payload.get("sections") or []:
        content.append({"type": "heading", "attrs": {"level": 2}, "content": _text(section.get("heading") or "Untitled section")})
        paragraphs = [p.strip() for p in (section.get("body") or "").split("\n\n") if p.strip()] or [""]
        refs = [r for r in (section.get("evidence") or []) if r.get("record_type") and r.get("record_id")]
        for i, paragraph in enumerate(paragraphs):
            inline = _text(paragraph)
            if i == len(paragraphs) - 1:
                inline.extend(_citation_node(r, labels) for r in refs)
                if single_source(refs):
                    # Clear attribution: a section resting on one record says so (Reuters Handbook).
                    inline.append({"type": "text", "text": f" {SINGLE_SOURCE_MARK}"})
            content.append({"type": "paragraph", "content": inline})
        # The document beside the claim (ICIJ, Luanda Leaks): each key point with the
        # words its record says, as the quote check found them, and its citation.
        excerpts = []
        for point, refs_for_point in zip(section.get("key_points") or [], key_point_refs(section)):
            for ref in refs_for_point or []:
                quote = str(ref.get("matched_text") or ref.get("quote") or "").strip() if isinstance(ref, dict) else ""
                if quote:
                    excerpts.append({"type": "paragraph", "content": [*_text(f"{point}: “{quote}”"), _citation_node(ref, labels)]})
        if excerpts:
            content.append({"type": "blockquote", "content": excerpts})
        visual = normalize_visual(section.get("visual"))
        if visual:
            content.append({"type": "evidenceVisual", "attrs": {"visual": visual}})

    # How we know, and our limits (The Markup's "Show your work": the data up front, and what it cannot show).
    limits = _limits(payload)
    known: list[dict] = [{"type": "paragraph", "content": _text(how_we_know(payload))}]
    if limits:
        known.append({"type": "bulletList", "content": [
            {"type": "listItem", "content": [{"type": "paragraph", "content": _text(limit)}]} for limit in limits]})
    content.append({"type": "callout", "attrs": {"tone": "limits", "title": "How we know, and our limits"}, "content": known})

    open_questions = payload.get("open_questions") or []
    if open_questions:
        content.append({"type": "callout", "attrs": {"tone": "questions", "title": "Open questions"}, "content": [{
            "type": "bulletList",
            "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": _text(str(q))}]} for q in open_questions],
        }]})
    return {"type": "doc", "content": content}


DECK_KINDS = ("presenting", "slidedoc")


def deck_slides_from_payload(payload: dict, visual_styles: dict | None = None, deck_kind: str = "presenting") -> list[dict]:
    """title -> takeaway statement -> one content slide per section (the
    section's prose goes to speaker notes) -> open questions. Normalized
    with the same rules a saved deck gets.

    `visual_styles` maps a section's index ("0", "1", ...) to the
    {"preset", "options"} the reporter picked in the preview; it only
    changes how that section's visual is drawn, never its data.

    `deck_kind` is one of Duarte's two kinds of deck ("Slidedocs"): a deck
    for presenting keeps each slide to its bullets, the prose in the notes;
    a slidedoc, read without a presenter, puts the section's prose on the
    slide in place of the bullets."""
    visual_styles = visual_styles or {}
    slides: list[dict] = [{
        "kind": "title", "heading": payload.get("title") or "Untitled", "bullets": [payload["goal_restated"]] if payload.get("goal_restated") else [],
        "evidence": [], "notes": "",
    }]
    if payload.get("executive_takeaway"):
        slides.append({"kind": "statement", "heading": "The takeaway", "bullets": [payload["executive_takeaway"]],
                       "evidence": [], "notes": payload["executive_takeaway"]})

    for index, section in enumerate(payload.get("sections") or []):
        visual = section.get("visual")
        style = visual_styles.get(str(index))
        if isinstance(visual, dict) and isinstance(style, dict):
            visual = {**visual, "style": style}
        # A key point resting on one record carries the mark (clear attribution).
        bullets = [f"{point} {SINGLE_SOURCE_MARK}" if single_source(refs) else str(point)
                   for point, refs in zip(section.get("key_points") or [], key_point_refs(section))]
        slides.append({
            "kind": "content",
            "heading": section.get("heading") or "Untitled section",
            "bullets": bullets,
            "evidence": section.get("evidence") or [],
            "notes": section.get("body") or "",
            "visual": visual,
            **({"prose": section.get("body") or ""} if deck_kind == "slidedoc" else {}),
        })

    slides.append({"kind": "questions", "heading": "How we know, and our limits", "bullets": [how_we_know(payload), *_limits(payload)],
                   "evidence": [], "notes": ""})
    open_questions = payload.get("open_questions") or []
    if open_questions:
        slides.append({"kind": "questions", "heading": "What the record doesn't yet show", "bullets": [str(q) for q in open_questions],
                       "evidence": [], "notes": ""})
    return _normalize_slides(slides)


def _labels(db: Session, candidate: AIAnalysisCandidate, payload: dict) -> dict[tuple[str, str], dict]:
    details = describe_record_refs(db, investigation_id=candidate.investigation_id, refs=payload_citation_refs(payload))
    return {(d["record_type"], d["record_id"]): d for d in details}


def promote_candidate_to_writeup(db: Session, candidate: AIAnalysisCandidate, *, title: str | None = None, created_by: str | None = None) -> Writeup:
    payload = _require_promotable(candidate)
    return create_writeup(
        db,
        investigation_id=candidate.investigation_id,
        title=title or payload.get("title") or "Untitled write-up",
        content_json=writeup_content_from_payload(payload, _labels(db, candidate, payload)),
        status="draft",
        source_ai_candidate_id=candidate.id,
        created_by=created_by,
    )


def promote_candidate_to_deck(db: Session, candidate: AIAnalysisCandidate, *, title: str | None = None, created_by: str | None = None,
                              style: dict | None = None, visual_styles: dict | None = None, deck_kind: str = "presenting") -> Deck:
    payload = _require_promotable(candidate)
    slides = deck_slides_from_payload(payload, visual_styles, deck_kind)
    if title:
        slides[0]["heading"] = title
    return create_deck(
        db,
        investigation_id=candidate.investigation_id,
        title=title or payload.get("title") or "Untitled deck",
        slides=slides,
        source_ai_candidate_id=candidate.id,
        created_by=created_by,
        style=style,
    )
