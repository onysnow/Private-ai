"""The deck editor (mockups DECK_1 and DECK_2; research §9; DECISIONS_LOG 13): a deck made without an AI draft, from the
case's story tree or blank, and each slide's checks.

A slide remembers the status each claim it cites had when it was made (`made_with`), so the editor and the present
bar can say which slides moved since. The checks:
- a slide citing a claim not yet shown (neither supported nor confirmed) carries a Draft band: warned, never blocked;
- 7×7: at most seven bullets of at most seven words (a longer bullet's words belong in the notes);
- 5-5-5's run: more than five text-only slides in a row lose the room; a picture or a statement breaks the run;
- changed since made: a cited claim's status now differs from when the slide was made.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.claims import Claim
from app.models.decks import Deck
from app.models.investigations import Investigation
from app.models.stories import Story, StoryClaim, StorySection
from app.services.decks import create_deck

SHOWN = {"supported", "confirmed"}
MAX_LINES = 7
MAX_WORDS = 7
TEXT_RUN = 5
STATUS_WORDS = {"lead": "a lead", "unverified": "not yet shown", "supported": "supported", "confirmed": "confirmed",
                "disputed": "disputed", "rejected": "ruled out"}


def _claim_slide(heading: str, claims: list[Claim]) -> dict[str, Any]:
    return {"kind": "content", "heading": heading, "bullets": [c.text for c in claims[:MAX_LINES]],
            "evidence": [{"record_type": "claim", "record_id": c.id} for c in claims],
            "notes": "", "made_with": {c.id: c.status for c in claims}}


def new_deck(db: Session, investigation_id: str, *, title: str, source: str, actor: str | None) -> Deck:
    """A deck from the story tree (a title slide, then a slide per section with its claims, each cited) or blank."""
    case = db.get(Investigation, investigation_id)
    if case is None:
        raise LookupError("Investigation not found")
    story = db.scalar(select(Story).where(Story.investigation_id == investigation_id))
    name = title.strip() or (story.thesis.strip()[:120] if story and story.thesis.strip() else case.name)
    slides: list[dict[str, Any]] = [{"kind": "title", "heading": name, "bullets": [case.name] if name != case.name else []}]
    if source == "story" and story is not None:
        for section in db.scalars(select(StorySection).where(StorySection.story_id == story.id).order_by(StorySection.position)):
            ids = [sc.claim_id for sc in db.scalars(select(StoryClaim).where(StoryClaim.section_id == section.id)
                                                    .order_by(StoryClaim.position))]
            claims = [c for c in (db.get(Claim, i) for i in ids) if c is not None and c.status != "rejected"]
            slides.append(_claim_slide(section.title, claims) if claims else
                          {"kind": "statement", "heading": section.title, "bullets": []})
    return create_deck(db, investigation_id=investigation_id, title=name, slides=slides, created_by=actor)


def _words(text: str) -> int:
    return len(text.split())


def slide_checks(db: Session, deck: Deck) -> dict[str, Any]:
    """Each slide's problems, in words, with what a fix would do; and which slides are drafts or changed since made."""
    slides = deck.slides_json or []
    claim_ids = {ref["record_id"] for s in slides for ref in (s.get("evidence") or []) if ref.get("record_type") == "claim"}
    claims = {c.id: c for c in db.scalars(select(Claim).where(Claim.id.in_(claim_ids)))} if claim_ids else {}
    out, run = [], 0
    for n, slide in enumerate(slides, start=1):
        problems: list[dict[str, Any]] = []
        draft = changed = False
        for ref in slide.get("evidence") or []:
            if ref.get("record_type") != "claim":
                continue
            claim = claims.get(ref.get("record_id"))
            if claim is None:
                problems.append({"kind": "gone", "text": "Cites a claim that is no longer in the case", "fix": "remove_citation",
                                 "claim_id": ref.get("record_id")})
                continue
            if claim.status not in SHOWN:
                draft = True
                problems.append({"kind": "draft", "claim_id": claim.id,
                                 "text": f"Cites a claim not yet shown ({STATUS_WORDS.get(claim.status, claim.status)}): “{claim.text[:90]}”"})
            then = (slide.get("made_with") or {}).get(claim.id)
            if then and then != claim.status:
                changed = True
                problems.append({"kind": "changed", "claim_id": claim.id,
                                 "text": f"“{claim.text[:70]}” was {STATUS_WORDS.get(then, then)} when the slide was made; now "
                                         f"{STATUS_WORDS.get(claim.status, claim.status)}", "fix": "accept_change"})
        bullets = slide.get("bullets") or []
        if slide.get("kind") == "content" and len(bullets) > MAX_LINES:
            problems.append({"kind": "7x7", "text": f"{len(bullets)} lines: at most {MAX_LINES} (7×7)", "fix": "lines_to_notes"})
        for i, bullet in enumerate(bullets, start=1):
            if slide.get("kind") == "content" and _words(bullet) > MAX_WORDS:
                problems.append({"kind": "7x7", "line": i, "text": f"Line {i} has {_words(bullet)} words: at most {MAX_WORDS} (7×7)",
                                 "fix": "words_to_notes"})
        text_only = slide.get("kind") == "content" and not slide.get("visual")
        run = run + 1 if text_only else 0
        if run > TEXT_RUN:
            problems.append({"kind": "5-5-5", "text": f"{run} text slides in a row: a picture or a statement gives the room a rest"})
        out.append({"slide": n, "problems": problems, "draft": draft, "changed": changed})
    return {"deck_id": deck.id, "slides": out, "drafts": [s["slide"] for s in out if s["draft"]],
            "changed": [s["slide"] for s in out if s["changed"]]}
