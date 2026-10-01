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

from app.models.domain import AIAnalysisCandidate, Deck, Writeup
from app.services.assistant_context import describe_record_refs
from app.services.decks import _normalize_slides, create_deck, normalize_visual
from app.services.writeups import create_writeup

PROMOTABLE_MODULE = "presentation_draft"


def payload_citation_refs(payload: dict | None) -> list[dict]:
    """Every {record_type, record_id} the draft cites (section evidence and
    visual items), first-appearance order, de-duplicated."""
    seen, refs = set(), []

    def visit(node):
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
    label = detail.get("locator") or detail.get("label") or ref["record_id"][:8]
    return label if len(label) <= 60 else label[:59] + "…"


def _citation_node(ref: dict, labels: dict[tuple[str, str], dict]) -> dict:
    record_type, record_id = ref.get("record_type"), ref.get("record_id")
    detail = labels.get((record_type, record_id))
    # Citation nodes use the reporter-facing "task" spelling, like every other
    # citation in a write-up (see app/services/writeups.py).
    trace_type = "task" if record_type == "reporting_task" else record_type
    return {"type": "citation", "attrs": {"recordType": trace_type, "recordId": record_id, "label": _short_label(detail, ref)}}


def _text(text: str) -> list[dict]:
    return [{"type": "text", "text": text}] if text else []


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
            content.append({"type": "paragraph", "content": inline})
        visual = normalize_visual(section.get("visual"))
        if visual:
            content.append({"type": "evidenceVisual", "attrs": {"visual": visual}})

    open_questions = payload.get("open_questions") or []
    if open_questions:
        content.append({"type": "callout", "attrs": {"tone": "questions", "title": "Open questions"}, "content": [{
            "type": "bulletList",
            "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": _text(str(q))}]} for q in open_questions],
        }]})
    return {"type": "doc", "content": content}


def deck_slides_from_payload(payload: dict) -> list[dict]:
    """title -> takeaway statement -> one content slide per section (the
    section's prose goes to speaker notes) -> open questions. Normalized
    with the same rules a saved deck gets."""
    slides: list[dict] = [{
        "kind": "title", "heading": payload.get("title") or "Untitled", "bullets": [payload["goal_restated"]] if payload.get("goal_restated") else [],
        "evidence": [], "notes": "",
    }]
    if payload.get("executive_takeaway"):
        slides.append({"kind": "statement", "heading": "The takeaway", "bullets": [payload["executive_takeaway"]],
                       "evidence": [], "notes": payload["executive_takeaway"]})

    for section in payload.get("sections") or []:
        slides.append({
            "kind": "content",
            "heading": section.get("heading") or "Untitled section",
            "bullets": section.get("key_points") or [],
            "evidence": section.get("evidence") or [],
            "notes": section.get("body") or "",
            "visual": section.get("visual"),
        })

    open_questions = payload.get("open_questions") or []
    if open_questions:
        slides.append({"kind": "questions", "heading": "What the record doesn't yet show", "bullets": [str(q) for q in open_questions],
                       "evidence": [], "notes": ""})
    return _normalize_slides(slides)


def _labels(db, candidate: AIAnalysisCandidate, payload: dict) -> dict[tuple[str, str], dict]:
    details = describe_record_refs(db, investigation_id=candidate.investigation_id, refs=payload_citation_refs(payload))
    return {(d["record_type"], d["record_id"]): d for d in details}


def promote_candidate_to_writeup(db, candidate: AIAnalysisCandidate, *, title: str | None = None, created_by: str | None = None) -> Writeup:
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


def promote_candidate_to_deck(db, candidate: AIAnalysisCandidate, *, title: str | None = None, created_by: str | None = None) -> Deck:
    payload = _require_promotable(candidate)
    slides = deck_slides_from_payload(payload)
    if title:
        slides[0]["heading"] = title
    return create_deck(
        db,
        investigation_id=candidate.investigation_id,
        title=title or payload.get("title") or "Untitled deck",
        slides=slides,
        source_ai_candidate_id=candidate.id,
        created_by=created_by,
    )
