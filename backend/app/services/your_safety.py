"""Your safety (research §13, mockup KEEP-safety-and-data, right top; DECISIONS_LOG 9): signs that the story itself
raises the danger to the reporter, their sources or witnesses, shown apart from Red Flags so they are never read as
findings about anyone, and never blocking work.

Two kinds of sign (catalogue/indicators/sa.yaml):
- from the case's records, read here with nothing sent anywhere: the story concerns organised crime (SA-007),
  corruption by officials or politically exposed people (SA-008) or environmental crime (SA-009), from the case's open
  Red Flags in those areas and the parties' PEP topic; and a source could be identified from the traces in the case's
  files (SA-033), from what the photos say about where and with what they were taken;
- only you can say: direct threats (SA-013), being followed (SA-014), pressure on family (SA-015), doxxing (SA-018),
  asked as plain questions. Their answers stay in the reporter's browser and never reach this server, a backup or a
  team, so they are not here.

A sign from the records carries no level: the catalogue's Faint and Strong for SA are still "To be set by Ony", and a
level is not made up here. A Yes to a question meets that indicator's published definition as worded (its Textbook).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Document, PatternFlag
from app.models.entities import Entity
from app.patterns.engine import _catalogue

AREA_SIGNS = {"OC": "SA-007", "CO": "SA-008", "EN": "SA-009"}
QUESTIONS = {
    "SA-013": "Have you, or anyone working on this story with you, been threatened or warned off it?",
    "SA-014": "Have you noticed being watched or followed, in person or online?",
    "SA-015": "Has anyone close to you, or to a source or witness, been threatened or pressured?",
    "SA-018": "Has your home address or other private detail been posted, or is online abuse growing?",
}
GUIDES = [
    {"title": "Make a risk assessment", "publisher": "Rory Peck Trust",
     "url": "https://rorypecktrust.org/get-help/safety/risk-assessment/getting-started-and-security-protocol/"},
    {"title": "Protect a source", "publisher": "Freedom of the Press Foundation",
     "url": "https://freedom.press/digisec/blog/threat-modeling-sources-module/"},
    {"title": "Protect against online harassment", "publisher": "Committee to Protect Journalists",
     "url": "https://cpj.org/2018/11/digital-safety-protecting-against-online-harassment/"},
    {"title": "What metadata gives away", "publisher": "Freedom of the Press Foundation",
     "url": "https://freedom.press/digisec/blog/metadata-101/"},
]
TRACES = (("gps", "where it was taken"), ("serial_number", "the camera's serial number"), ("make", "the camera"),
          ("software", "the software"), ("owner_name", "the owner's name"), ("artist", "who took it"))


def _indicator(indicator_id: str) -> dict[str, Any]:
    indicator, _area = _catalogue()[indicator_id]
    return {"id": indicator.id, "name": indicator.name, "definition": indicator.definition,
            "innocent": list(indicator.innocent_explanations),
            "source": {"title": indicator.sources[0].title, "publisher": indicator.sources[0].publisher, "url": indicator.sources[0].url},
            "textbook": indicator.levels.textbook}


def _from_flags(db: Session, investigation_id: str) -> list[dict[str, Any]]:
    flags = db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == investigation_id, PatternFlag.status == "open",
                                                 PatternFlag.gone_at.is_(None)))
    by_area: dict[str, list[PatternFlag]] = {}
    for flag in flags:
        area = flag.indicator_id.split("-")[0]
        if area in AREA_SIGNS:
            by_area.setdefault(area, []).append(flag)
    peps = [e for e in db.scalars(select(Entity).where(Entity.investigation_id == investigation_id, Entity.merged_into_entity_id.is_(None)))
            if "role.pep" in ((e.properties or {}).get("topics") or [])]
    signs = []
    for area, sign in AREA_SIGNS.items():
        found = by_area.get(area, [])
        evidence = []
        if found:
            names = {f.indicator_id for f in found}
            evidence.append(f"{len(found)} open Red {'Flag' if len(found) == 1 else 'Flags'} in this area ({', '.join(sorted(names)[:4])}"
                            f"{'…' if len(names) > 4 else ''})")
        if sign == "SA-008" and peps:
            listed = ", ".join(e.caption for e in peps[:3])
            evidence.append(f"{len(peps)} {'party is a politically exposed person' if len(peps) == 1 else 'parties are politically exposed people'}: "
                            f"{listed}{'…' if len(peps) > 3 else ''}")
        if evidence:
            signs.append({**_indicator(sign), "from": "records", "evidence": "From your records: " + "; ".join(evidence) + ".",
                          "level": None, "documents": []})
    return signs


def _from_traces(db: Session, investigation_id: str) -> list[dict[str, Any]]:
    """SA-033: the case's photos that say where, with what or by whom they were taken, each a trace that could lead to
    whoever took or passed them on."""
    from app.models.derived import DocumentPhoto

    found = []
    for photo, document in db.execute(select(DocumentPhoto, Document).join(Document, Document.id == DocumentPhoto.document_id)
                                      .where(DocumentPhoto.investigation_id == investigation_id)):
        claims = photo.claims or {}
        said = [words for key, words in TRACES if claims.get(key)]
        if said:
            found.append({"document_id": document.id, "filename": document.filename, "traces": said})
    if not found:
        return []
    first = found[0]
    return [{**_indicator("SA-033"), "from": "records", "level": None, "documents": found[:20],
             "evidence": f"From your files: {len(found)} {'photo says' if len(found) == 1 else 'photos say'} more than the picture, "
                         f"e.g. {first['filename']} ({', '.join(first['traces'])}). A copy with its metadata removed is one click on its Picture."}]


def your_safety(db: Session, investigation_id: str) -> dict[str, Any]:
    """The panel's content: signs from the case's records, the questions only the reporter can answer, the guides."""
    return {"investigation_id": investigation_id, "signs": _from_flags(db, investigation_id) + _from_traces(db, investigation_id),
            "questions": [{**_indicator(i), "question": q} for i, q in QUESTIONS.items()], "guides": GUIDES,
            "levels_set": False}
