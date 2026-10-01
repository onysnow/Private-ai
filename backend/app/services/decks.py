"""Presentation decks: CRUD and .pptx export. See app/models/decks.py for
the slides_json shape -- a plain list of {heading, bullets, evidence}, no
rich text, so export is a direct, mechanical render into python-pptx shapes.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import Deck

MAX_BULLETS_PER_SLIDE = 8


def _normalize_slides(slides: list[dict] | None) -> list[dict]:
    normalized = []
    for slide in slides or []:
        normalized.append({
            "heading": str(slide.get("heading") or "Untitled slide")[:300],
            "bullets": [str(b)[:500] for b in (slide.get("bullets") or [])][:MAX_BULLETS_PER_SLIDE],
            "evidence": [
                {"record_type": e.get("record_type"), "record_id": e.get("record_id")}
                for e in (slide.get("evidence") or [])
                if e.get("record_type") and e.get("record_id")
            ],
        })
    return normalized


def serialize_deck(row: Deck) -> dict:
    return {
        "id": row.id,
        "investigation_id": row.investigation_id,
        "title": row.title,
        "slides": row.slides_json or [],
        "slide_count": len(row.slides_json or []),
        "source_ai_candidate_id": row.source_ai_candidate_id,
        "created_by": row.created_by,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def create_deck(db: Session, *, investigation_id: str, title: str, slides: list[dict] | None = None,
                 source_ai_candidate_id: str | None = None, created_by: str | None = None) -> Deck:
    row = Deck(
        investigation_id=investigation_id, title=title.strip() or "Untitled deck",
        slides_json=_normalize_slides(slides), source_ai_candidate_id=source_ai_candidate_id,
        created_by=created_by, created_at=utcnow_naive(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_deck(db: Session, row: Deck, data: dict) -> Deck:
    if "title" in data and data["title"] is not None:
        row.title = data["title"].strip() or row.title
    if "slides_json" in data and data["slides_json"] is not None:
        row.slides_json = _normalize_slides(data["slides_json"])
    db.commit()
    db.refresh(row)
    return row


def list_decks(db: Session, investigation_id: str) -> list[Deck]:
    query = select(Deck).where(Deck.investigation_id == investigation_id)
    return list(db.scalars(query.order_by(Deck.updated_at.desc())).all())


def delete_deck(db: Session, row: Deck) -> None:
    db.delete(row)
    db.commit()


def render_deck_pptx(row: Deck):
    """A clean, legible default: one title+bullets layout per slide, a
    references slide at the end listing every cited record once. Reporters
    can restyle the result in PowerPoint/Keynote -- this isn't trying to be
    a design tool, just a correct, immediately-usable starting deck."""
    from pptx import Presentation
    from pptx.util import Pt

    prs = Presentation()
    title_slide_layout = prs.slide_layouts[0]
    bullet_layout = prs.slide_layouts[1]

    title_slide = prs.slides.add_slide(title_slide_layout)
    title_slide.shapes.title.text = row.title
    if len(title_slide.placeholders) > 1:
        title_slide.placeholders[1].text = "Prepared from reviewed investigation evidence"

    all_citations: dict[tuple[str, str], int] = {}
    for slide_data in row.slides_json or []:
        slide = prs.slides.add_slide(bullet_layout)
        slide.shapes.title.text = slide_data.get("heading") or "Untitled slide"
        body = slide.placeholders[1].text_frame
        body.clear()
        bullets = slide_data.get("bullets") or []
        for i, bullet in enumerate(bullets):
            p = body.paragraphs[0] if i == 0 else body.add_paragraph()
            p.text = str(bullet)
            p.font.size = Pt(20)
        for ev in slide_data.get("evidence") or []:
            key = (ev.get("record_type"), ev.get("record_id"))
            if key[0] and key[1] and key not in all_citations:
                all_citations[key] = len(all_citations) + 1

    if all_citations:
        refs_slide = prs.slides.add_slide(bullet_layout)
        refs_slide.shapes.title.text = "References"
        body = refs_slide.placeholders[1].text_frame
        body.clear()
        for (record_type, record_id), n in sorted(all_citations.items(), key=lambda kv: kv[1]):
            p = body.paragraphs[0] if n == 1 else body.add_paragraph()
            p.text = f"[{n}] {record_type}:{record_id}"
            p.font.size = Pt(14)

    return prs
