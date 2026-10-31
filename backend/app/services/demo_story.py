"""The 1MDB demo case's story (Act › Story, mockup ACT_2), so the screen shows what it is for: a thesis about how the
money was diverted, three sections, each holding claims the case already has, and a short write-up that cites them.

The claims are looked up in the case by their exact text (the demo's own records.json and more.json), never made up
here; a claim the case does not have is left out of its section, and a citation to it is dropped from the text. The
sections mix shown, disputed and not-yet-shown claims, so the tree has every kind of branch, and one sentence of the
write-up has no source yet, so the "every sentence has a source" gate is open, as it would be in a draft.

Seeding is idempotent: a case whose story already has a thesis or a section is left alone. Nothing is fetched.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Claim, StoryClaim, StorySection
from app.services.stories import story_of

THESIS = ("Billions raised for 1MDB were diverted through look-alike companies to Jho Low, his partners and "
          "Malaysia's prime minister.")
TITLE = "Where 1MDB's money went"

# Each section: its title and its claims' exact texts, in the order they sit under it.
SECTIONS: list[tuple[str, list[str]]] = [
    ("The PetroSaudi money went to Jho Low", [
        "Jho Low owned/controlled Good Star Limited, the company that received US$700m in 2009 instead of PetroSaudi.",
        "Jho Low was the beneficial owner of Good Star Limited, the company that received $1.03 billion meant for the PetroSaudi joint venture.",
        "Two PetroSaudi managers defrauded 1MDB of US$1bn and laundered the proceeds.",
        "The \"PETROSAUDI CO-FOUNDER\" who sent $20 million to Malaysian Official 1 in 2011 is Tarek Obaid.",
    ]),
    ("The bond money went to a fake Aabar", [
        "Goldman underwrote three bond offerings in 2012 and 2013 that raised about $6.5 billion for 1MDB and earned it more than $600 million in fees and revenue.",
        "A day after Project Magnolia closed, about $577 million of the proceeds went to a BVI company named to look like Aabar but not associated with it.",
        "The $1.367 billion 1MDB paid to Aabar-BVI in 2012 was a refundable deposit held as collateral for IPIC's guarantee.",
        "Khadem al-Qubaisi received $472.75 million of 2012 bond money through the Blackstone account.",
        "\"Shell Company Account 2\" in the Goldman DPA is the Blackstone account at Standard Chartered Singapore.",
    ]),
    ("Where the money ended up", [
        "About $681 million of Project Catalyze money reached an account of Malaysian Official 1 in March 2013.",
        "Malaysian Official 1 in the US filings is Najib Razak, then prime minister.",
        "Aabar-BVI sent $238 million to Riza Aziz's Red Granite Capital, money that helped fund Red Granite Pictures and \"The Wolf of Wall Street\".",
        "Jho Low used more than $250 million diverted from 1MDB to buy the superyacht Equanimity.",
    ]),
]

# The write-up: paragraphs of text pieces and citations (a claim's text, cited where it stands). The last sentence, on
# who Malaysian Official 1 is, has no citation yet: the claim that would carry it is not yet shown.
WRITEUP: list[list[str | dict[str, str]]] = [
    ["In 2009 1MDB put $700 million into a joint venture with PetroSaudi, but the money went to Good Star Limited, a "
     "company Jho Low owned ", {"cite": SECTIONS[0][1][0]}, ". In all, Good Star received $1.03 billion meant for the venture ",
     {"cite": SECTIONS[0][1][1]}, "."],
    ["In 2012 and 2013 Goldman Sachs underwrote three bond offerings that raised about $6.5 billion for 1MDB ",
     {"cite": SECTIONS[1][1][0]}, ". A day after the first of them closed, about $577 million went to a company in the British "
     "Virgin Islands named to look like Aabar, part of the Abu Dhabi fund that guaranteed that bond, but not associated with it ",
     {"cite": SECTIONS[1][1][1]}, ". The $1.367 billion 1MDB paid that company has been described as a refundable deposit "
     "held as collateral ", {"cite": SECTIONS[1][1][2]}, "."],
    ["About $681 million of the 2013 bond money reached an account of the man the US filings call Malaysian Official 1 ",
     {"cite": SECTIONS[2][1][0]}, ". Who that is, the filings do not say by name."],
]


def _doc(texts: dict[str, Claim], numbers: dict[str, int]) -> dict[str, Any]:
    paragraphs: list[dict[str, Any]] = [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": TITLE}]}]
    for parts in WRITEUP:
        content: list[dict[str, Any]] = []
        for part in parts:
            if isinstance(part, str):
                if content and content[-1]["type"] == "text":
                    content[-1]["text"] += part
                else:
                    content.append({"type": "text", "text": part})
                continue
            claim = texts.get(part["cite"])
            if claim is None:
                continue
            if content and content[-1]["type"] == "text":
                content[-1]["text"] = content[-1]["text"].rstrip() + " "
            content.append({"type": "citation", "attrs": {"recordType": "claim", "recordId": claim.id, "label": str(numbers[claim.id])}})
        paragraphs.append({"type": "paragraph", "content": content})
    return {"type": "doc", "content": paragraphs}


def seed_story(db: Session, investigation_id: str) -> bool:
    """Give the case the demo's story. Returns False when the case already has a story with a thesis or a section."""
    from app.services.writeups import create_writeup

    story = story_of(db, investigation_id, create=True)
    assert story is not None
    if story.thesis or db.scalar(select(StorySection.id).where(StorySection.story_id == story.id)):
        return False
    wanted = {text for _, texts in SECTIONS for text in texts}
    texts = {c.text: c for c in db.scalars(select(Claim).where(Claim.investigation_id == investigation_id, Claim.text.in_(wanted)))}
    story.thesis = THESIS
    numbers: dict[str, int] = {}
    for position, (title, claim_texts) in enumerate(SECTIONS):
        section = StorySection(story_id=story.id, title=title, position=position)
        db.add(section)
        db.flush()
        placed = 0
        for text in claim_texts:
            claim = texts.get(text)
            if claim is None or claim.id in numbers:
                continue
            db.add(StoryClaim(section_id=section.id, claim_id=claim.id, position=placed))
            placed += 1
            numbers[claim.id] = len(numbers) + 1  # the claim's number in the tree, as the citation chips show it
    db.flush()
    if not story.writeup_id:
        row = create_writeup(db, investigation_id=investigation_id, title=TITLE, content_json=_doc(texts, numbers), created_by="1MDB demo")
        story.writeup_id = row.id
    db.commit()
    return True
