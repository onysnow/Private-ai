"""What the story needs (research Act §7, mockup ACT_2): the thesis, its sections, each section's claims and their
evidence, worked out into a readiness picture: a branch is only as strong as its weakest claim, the gates say what
must be true before it runs, and "Ready to run" can be recorded only when every gate passes.

The gates:
  sources      every sentence of the write-up has a citation (counted from its citation nodes)
  innocent     every open Red Flag's innocent explanations have been looked at (the "Before you call it" checklist)
  single       statements resting on one supporting record, to be marked as such in the text
  reply        right of reply sent (to whom, on what day), recorded by a person
  legal        legal read (by whom, on what day), recorded by a person
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import Claim, ClaimEvidenceLink, Evidence, PatternFlag, Source, Story, StoryClaim, StorySection, Writeup

SHOWN = {"supported", "confirmed"}
RECORDED_GATES = ("right_of_reply", "legal_read")


def claim_state(status: str) -> str:
    return "shown" if status in SHOWN else "disputed" if status == "disputed" else "ruled_out" if status == "rejected" else "unshown"


def story_of(db: Session, investigation_id: str, create: bool = False) -> Story | None:
    story = db.scalar(select(Story).where(Story.investigation_id == investigation_id))
    if story is None and create:
        story = Story(investigation_id=investigation_id, thesis="", gates={})
        db.add(story)
        db.flush()
    return story


# A sentence ends at . ! or ? and a space, but not after a short title or abbreviation ("Dr.", "e.g.") or an initial
# ("M. Ross"): those stay inside their sentence. A capital letter is read as an initial only at the start of a sentence,
# after another initial or after a word that is not capitalised ("paid M. Ross"); after a capitalised word it is a
# label that can end a sentence ("Schedule A."), so a missing source is never hidden. frontend/features/story/sentences.ts
# reads sentences the same way.
_END = re.compile(r"(?<=[.!?])(?<!\bMr\.)(?<!\bMrs\.)(?<!\bMs\.)(?<!\bDr\.)(?<!\bSt\.)(?<!\bNo\.)(?<!\be\.g\.)(?<!\bi\.e\.)\s+")
_LETTER = re.compile(r"[A-Z]\.")


def _ends_with_initial(text: str) -> bool:
    words = text.split()
    if not words or not _LETTER.fullmatch(words[-1]):
        return False
    before = words[-2] if len(words) > 1 else ""
    return not before or not before[:1].isupper() or bool(_LETTER.fullmatch(before))


def _split_sentences(text: str) -> list[str]:
    """``text`` cut at each sentence end; the last part is the sentence still open."""
    parts = _END.split(text)
    out = [parts[0]]
    for part in parts[1:]:
        if _ends_with_initial(out[-1]):
            out[-1] = f"{out[-1]} {part}"
        else:
            out.append(part)
    return out
_WORDS = re.compile(r"\w")


def sentences_without_source(content: dict | None) -> tuple[int, int]:
    """(sentences, sentences with no citation) in a TipTap document. A citation belongs to the sentence it follows,
    including one placed just after the sentence's full stop."""
    total = uncited = 0

    def paragraph(node: dict) -> None:
        nonlocal total, uncited
        pieces: list[tuple[str, str]] = []
        for child in node.get("content") or []:
            if child.get("type") == "text":
                pieces.append(("text", child.get("text") or ""))
            elif child.get("type") == "citation":
                pieces.append(("cite", ""))
        sentences: list[bool] = []  # cited?
        open_text = ""
        for kind, text in pieces:
            if kind == "cite":
                if open_text.strip():
                    sentences.append(True)
                    open_text = ""
                elif sentences:
                    sentences[-1] = True
                continue
            parts = _split_sentences(open_text + text)
            for done in parts[:-1]:
                # Punctuation straight after a citation ("… Nominees [3].") ends that sentence, not a new one.
                if done.strip() and not (sentences and not _WORDS.search(done)):
                    sentences.append(False)
            open_text = parts[-1] if _WORDS.search(parts[-1]) or not sentences else ""
        if open_text.strip():
            sentences.append(False)
        total += len(sentences)
        uncited += sentences.count(False)

    def walk(node: dict) -> None:
        if node.get("type") in ("paragraph", "heading"):
            if node.get("type") == "paragraph":
                paragraph(node)
            return
        for child in node.get("content") or []:
            walk(child)

    walk(content or {})
    return total, uncited


def story_tree(db: Session, investigation_id: str) -> dict[str, Any]:
    story = story_of(db, investigation_id)
    sections_out: list[dict[str, Any]] = []
    placed: set[str] = set()
    single: list[str] = []
    counts = {"claims": 0, "shown": 0, "disputed": 0, "unshown": 0}
    if story is not None:
        sections = list(db.scalars(select(StorySection).where(StorySection.story_id == story.id).order_by(StorySection.position, StorySection.title)))
        for section in sections:
            rows = list(db.scalars(select(StoryClaim).where(StoryClaim.section_id == section.id).order_by(StoryClaim.position)))
            claims_out = []
            for row in rows:
                claim = db.get(Claim, row.claim_id)
                if claim is None:
                    continue
                placed.add(claim.id)
                state = claim_state(claim.status)
                links = list(db.scalars(select(ClaimEvidenceLink).where(ClaimEvidenceLink.claim_id == claim.id).order_by(ClaimEvidenceLink.created_at)))
                evidence = []
                for link in links:
                    ev = db.get(Evidence, link.evidence_id)
                    if ev is None:
                        continue
                    src = db.get(Source, ev.source_id) if ev.source_id else None
                    evidence.append({"id": ev.id, "stance": link.stance, "label": (src.title if src else "Typed in"), "locator": ev.locator,
                                     "quote": ev.quote})
                supporting = sum(1 for e in evidence if e["stance"] == "supports")
                if state == "shown" and supporting == 1:
                    single.append(claim.id)
                counts["claims"] += 1
                counts[state if state in counts else "unshown"] += 1 if state != "ruled_out" else 0
                claims_out.append({"id": claim.id, "text": claim.text, "status": claim.status, "state": state, "evidence": evidence,
                                   "single_source": state == "shown" and supporting == 1})
            states = [c["state"] for c in claims_out if c["state"] != "ruled_out"]
            status = "empty" if not states else "disputed" if "disputed" in states else "unshown" if "unshown" in states else "shown"
            sections_out.append({"id": section.id, "title": section.title, "position": section.position, "status": status,
                                 "shown": states.count("shown"), "total": len(states), "claims": claims_out})
    # Critical path: the branch with the most claims not yet shown, its unshown claims in order.
    critical_section = max((s for s in sections_out if s["status"] in ("unshown", "disputed")),
                           key=lambda s: (s["total"] - s["shown"], -s["position"]), default=None)
    critical = [] if critical_section is None else [
        {"claim_id": c["id"], "text": c["text"], "section": critical_section["title"]}
        for c in critical_section["claims"] if c["state"] in ("unshown", "disputed")]

    writeup = db.get(Writeup, story.writeup_id) if story and story.writeup_id else None
    total_sentences, uncited = sentences_without_source(writeup.content_json if writeup else None)
    flags = list(db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == investigation_id, PatternFlag.status == "open",
                                                      PatternFlag.gone_at.is_(None))))
    from app.patterns.engine import indicator

    def unlooked(flag: PatternFlag) -> int:
        found = indicator(flag.indicator_id)
        texts = found[0].innocent_explanations if found else []
        return sum(1 for t in texts if t not in (flag.innocent or {}))
    open_innocent = [f for f in flags if unlooked(f)]
    recorded = story.gates if story else {}
    gates = [
        {"key": "sources", "label": "Every sentence has a source",
         "state": "pending" if writeup is None or total_sentences == 0 else "passed" if uncited == 0 else "open",
         "detail": "no write-up yet" if writeup is None else "no sentences yet" if total_sentences == 0 else
                   "all sentences cited" if uncited == 0 else f"{uncited} sentence{'s' if uncited != 1 else ''} left"},
        {"key": "innocent", "label": "Innocent explanations addressed", "state": "passed" if not open_innocent else "open",
         "detail": "every open flag's explanations looked at" if not open_innocent else
                   ", ".join(f"{f.indicator_id}: {unlooked(f)} open" for f in open_innocent[:3]) + (" …" if len(open_innocent) > 3 else "")},
        {"key": "single", "label": "Single-source statements marked", "state": "passed" if not single else "warning",
         "detail": "none rests on one record" if not single else f"{len(single)} claim{'s' if len(single) != 1 else ''} rest on one record"},
        {"key": "right_of_reply", "label": "Right of reply sent", "state": "passed" if recorded.get("right_of_reply") else "open",
         "detail": (f"to {recorded['right_of_reply'].get('to')} · {recorded['right_of_reply'].get('on')}" if recorded.get("right_of_reply") else "not recorded")},
        {"key": "legal_read", "label": "Legal read", "state": "passed" if recorded.get("legal_read") else "open",
         "detail": (f"{recorded['legal_read'].get('by')} · {recorded['legal_read'].get('on')}" if recorded.get("legal_read") else "no one assigned")},
    ]
    unplaced = [{"id": c.id, "text": c.text, "status": c.status, "state": claim_state(c.status)}
                for c in db.scalars(select(Claim).where(Claim.investigation_id == investigation_id).order_by(Claim.created_at)) if c.id not in placed]
    return {
        "id": story.id if story else None,
        "investigation_id": investigation_id,
        "thesis": story.thesis if story else "",
        "writeup_id": story.writeup_id if story else None,
        "sections": sections_out,
        "counts": counts,
        "critical": critical,
        "gates": gates,
        "gates_passed": sum(1 for g in gates if g["state"] == "passed"),
        "sentences": {"total": total_sentences, "uncited": uncited},
        "ready": {"by": story.ready_by, "at": story.ready_at} if story and story.ready_at else None,
        "can_ready": all(g["state"] == "passed" for g in gates),
        "unplaced": unplaced,
        "version": _named(db, writeup),
    }


def _named(db: Session, writeup: Writeup | None) -> dict[str, Any] | None:
    from app.services.writeup_versions import latest_named, serialize_version

    row = latest_named(db, writeup) if writeup is not None else None
    return serialize_version(row) if row is not None else None


def set_thesis(db: Session, investigation_id: str, thesis: str) -> None:
    story = story_of(db, investigation_id, create=True)
    assert story is not None
    story.thesis = thesis.strip()
    story.ready_by = story.ready_at = None  # a changed story is no longer the one decided ready
    db.commit()


def add_section(db: Session, investigation_id: str, title: str) -> None:
    story = story_of(db, investigation_id, create=True)
    assert story is not None
    last = db.scalar(select(StorySection.position).where(StorySection.story_id == story.id).order_by(StorySection.position.desc()))
    db.add(StorySection(story_id=story.id, title=title.strip(), position=(last if last is not None else -1) + 1))
    db.commit()


def section_of(db: Session, investigation_id: str, section_id: str) -> StorySection | None:
    section = db.get(StorySection, section_id)
    story = db.get(Story, section.story_id) if section else None
    return section if story is not None and story.investigation_id == investigation_id else None


def update_section(db: Session, section: StorySection, title: str | None, position: int | None) -> None:
    if title is not None:
        section.title = title.strip()
    if position is not None:
        section.position = position
    db.commit()


def delete_section(db: Session, section: StorySection) -> None:
    for row in db.scalars(select(StoryClaim).where(StoryClaim.section_id == section.id)):
        db.delete(row)
    db.delete(section)
    db.commit()


def place_claim(db: Session, investigation_id: str, section: StorySection, claim_id: str) -> None:
    claim = db.get(Claim, claim_id)
    if claim is None or claim.investigation_id != investigation_id:
        raise ValueError("That claim is not in this case")
    story = db.get(Story, section.story_id)
    assert story is not None
    # A claim sits in one section: moving it takes it out of any other.
    for row in db.scalars(select(StoryClaim).join(StorySection, StorySection.id == StoryClaim.section_id)
                          .where(StorySection.story_id == story.id, StoryClaim.claim_id == claim_id)):
        db.delete(row)
    db.flush()
    last = db.scalar(select(StoryClaim.position).where(StoryClaim.section_id == section.id).order_by(StoryClaim.position.desc()))
    db.add(StoryClaim(section_id=section.id, claim_id=claim_id, position=(last if last is not None else -1) + 1))
    db.commit()


def remove_claim(db: Session, section: StorySection, claim_id: str) -> None:
    for row in db.scalars(select(StoryClaim).where(StoryClaim.section_id == section.id, StoryClaim.claim_id == claim_id)):
        db.delete(row)
    db.commit()


def record_gate(db: Session, investigation_id: str, gate: str, who: str | None, on: str | None) -> None:
    if gate not in RECORDED_GATES:
        raise ValueError(f"gate must be one of {', '.join(RECORDED_GATES)}")
    story = story_of(db, investigation_id, create=True)
    assert story is not None
    gates = dict(story.gates or {})
    if who and on:
        gates[gate] = {"to" if gate == "right_of_reply" else "by": who.strip(), "on": on}
    else:
        gates.pop(gate, None)
        story.ready_by = story.ready_at = None
    story.gates = gates
    db.commit()


def mark_ready(db: Session, investigation_id: str, by: str) -> None:
    tree = story_tree(db, investigation_id)
    if not tree["can_ready"]:
        left = [g["label"] for g in tree["gates"] if g["state"] != "passed"]
        raise ValueError("Not every gate has passed: " + "; ".join(left))
    story = story_of(db, investigation_id)
    assert story is not None
    story.ready_by, story.ready_at = by.strip(), utcnow_naive()
    db.commit()


def ensure_writeup(db: Session, investigation_id: str) -> None:
    from app.services.writeups import create_writeup

    story = story_of(db, investigation_id, create=True)
    assert story is not None
    if story.writeup_id and db.get(Writeup, story.writeup_id):
        return
    row = create_writeup(db, investigation_id=investigation_id, title=story.thesis or "The story")
    story.writeup_id = row.id
    db.commit()


def story_writeup(db: Session, investigation_id: str) -> Writeup | None:
    """The write-up this case's story is told in, if started."""
    story = story_of(db, investigation_id)
    return db.get(Writeup, story.writeup_id) if story is not None and story.writeup_id else None
