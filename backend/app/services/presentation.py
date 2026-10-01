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
validate_citations), so this module trusts its shape -- it only re-checks
the two things specific to promotion: the right module, and that a human
has actually accepted it.
"""
from __future__ import annotations

from app.models.domain import AIAnalysisCandidate, Deck, Writeup
from app.services.decks import create_deck
from app.services.writeups import create_writeup

PROMOTABLE_MODULE = "presentation_draft"


def _citation_node(ref: dict) -> dict:
    record_type, record_id = ref.get("record_type"), ref.get("record_id")
    return {
        "type": "citation",
        "attrs": {"recordType": record_type, "recordId": record_id, "label": f"{record_type}:{record_id}"},
    }


def _require_promotable(candidate: AIAnalysisCandidate) -> dict:
    if candidate.module != PROMOTABLE_MODULE:
        raise ValueError(f"only {PROMOTABLE_MODULE!r} candidates can be promoted to a writeup or deck, got module={candidate.module!r}")
    if candidate.review_status != "accepted":
        raise ValueError("candidate must be accepted (reviewed) before it can be promoted")
    payload = candidate.payload or {}
    if not payload.get("sections"):
        raise ValueError("candidate payload has no sections to promote")
    return payload


def _writeup_content_json(payload: dict) -> dict:
    content: list[dict] = [
        {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": payload.get("title") or "Untitled"}]},
    ]
    if payload.get("goal_restated"):
        content.append({"type": "paragraph", "content": [{"type": "text", "text": f"Goal: {payload['goal_restated']}"}]})
    if payload.get("executive_takeaway"):
        content.append({"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Executive takeaway"}]})
        content.append({"type": "paragraph", "content": [{"type": "text", "text": payload["executive_takeaway"]}]})

    for section in payload.get("sections") or []:
        content.append({"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": section.get("heading") or "Untitled section"}]})
        body_inline: list[dict] = [{"type": "text", "text": section.get("body") or ""}]
        for ref in section.get("evidence") or []:
            if ref.get("record_type") and ref.get("record_id"):
                body_inline.append(_citation_node(ref))
        content.append({"type": "paragraph", "content": body_inline})

    open_questions = payload.get("open_questions") or []
    if open_questions:
        content.append({"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Open questions"}]})
        content.append({
            "type": "bulletList",
            "content": [
                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": str(q)}]}]}
                for q in open_questions
            ],
        })

    return {"type": "doc", "content": content}


def _deck_slides(payload: dict) -> list[dict]:
    slides: list[dict] = []
    if payload.get("executive_takeaway"):
        slides.append({"heading": "Executive takeaway", "bullets": [payload["executive_takeaway"]], "evidence": []})

    for section in payload.get("sections") or []:
        slides.append({
            "heading": section.get("heading") or "Untitled section",
            "bullets": section.get("key_points") or [],
            "evidence": section.get("evidence") or [],
        })

    open_questions = payload.get("open_questions") or []
    if open_questions:
        slides.append({"heading": "Open questions", "bullets": [str(q) for q in open_questions], "evidence": []})

    return slides


def promote_candidate_to_writeup(db, candidate: AIAnalysisCandidate, *, title: str | None = None, created_by: str | None = None) -> Writeup:
    payload = _require_promotable(candidate)
    return create_writeup(
        db,
        investigation_id=candidate.investigation_id,
        title=title or payload.get("title") or "Untitled write-up",
        content_json=_writeup_content_json(payload),
        status="draft",
        source_ai_candidate_id=candidate.id,
        created_by=created_by,
    )


def promote_candidate_to_deck(db, candidate: AIAnalysisCandidate, *, title: str | None = None, created_by: str | None = None) -> Deck:
    payload = _require_promotable(candidate)
    return create_deck(
        db,
        investigation_id=candidate.investigation_id,
        title=title or payload.get("title") or "Untitled deck",
        slides=_deck_slides(payload),
        source_ai_candidate_id=candidate.id,
        created_by=created_by,
    )
