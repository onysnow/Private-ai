"""The type of an investigation: one or more of the catalogue's areas
(indicators.md, "Vague words, partial matches, investigation type": decided
10 October 2026). The app fills it in from two things and shows why for each
area; the reporter can change it at any time, and then the app stops
changing it (Investigation.type_areas holds the reporter's choice; None means
the app chooses).

1. Red Flags: each open flag puts its indicator's own area in.
2. The kinds of records: a kind of record (an FtM schema) points to an area
   only when it says something about the case. Kinds that most areas need
   (Person, Company, Payment, Address, Organization) point nowhere. A kind
   needed by indicators in at most 8 of the 22 areas points to the area where
   the largest share of indicators needs it, if that share is at least 15%
   (and to any other area within 80% of that share): Security points to
   securities market abuse, ContractAward to corruption and procurement,
   Vessel to sanctions evasion. Share = the area's verified indicators whose
   data needed names the kind. MAX_AREAS, MIN_SHARE and NEAR are design
   choices, not published figures; the reason shown gives the share.
"""

from __future__ import annotations

import re
from collections import defaultdict
from functools import lru_cache
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Entity, Investigation, PatternFlag, RelationshipEdge

# The safety area (SA) is about danger to the reporter, sources and witnesses,
# never about the subject (indicators.md), so it is not a type of investigation.
NOT_A_TYPE = {"SA"}
MAX_AREAS = 8  # a kind needed in more areas than this points nowhere
MIN_SHARE = 0.15
NEAR = 0.8


@lru_cache(maxsize=1)
def _needs() -> tuple[dict[str, dict[str, float]], dict[str, set[str]], dict[str, str]]:
    """(share[area][schema], areas needing each schema, area names) from the catalogue's verified indicators."""
    try:
        from followthemoney import model
        schemata = set(model.schemata)
    except Exception:  # pragma: no cover - FtM is always installed with the backend
        schemata = set()
    from app.patterns.engine import catalogue

    cat = catalogue()
    share: dict[str, dict[str, float]] = {}
    users: dict[str, set[str]] = defaultdict(set)
    for area in cat.areas:
        verified = [i for i in area.indicators if i.status.value == "verified"]
        counts: dict[str, int] = defaultdict(int)
        for ind in verified:
            named = {w for d in ind.data_needed for w in re.findall(r"\b[A-Z][A-Za-z]+\b", d) if w in schemata}
            for schema in named:
                counts[schema] += 1
                users[schema].add(area.key)
        share[area.key] = {s: n / len(verified) for s, n in counts.items()} if verified else {}
    return share, dict(users), {a.key: a.name for a in cat.areas if a.key not in NOT_A_TYPE}


def _held_schemas(db: Session, investigation_id: str) -> set[str]:
    entities = db.scalars(select(Entity.schema).where(Entity.investigation_id == investigation_id, Entity.merged_into_entity_id.is_(None)))
    links = db.scalars(select(RelationshipEdge.schema).where(RelationshipEdge.investigation_id == investigation_id))
    return set(entities) | set(links)


def suggested(db: Session, investigation_id: str) -> list[dict[str, Any]]:
    """The areas the app would choose, each with the reasons, flags first."""
    from app.patterns.engine import indicator

    share, users, names = _needs()
    reasons: dict[str, list[str]] = defaultdict(list)
    open_flags = db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == investigation_id,
                                                      PatternFlag.gone_at.is_(None), PatternFlag.status != "dismissed"))
    for flag in open_flags:
        found = indicator(flag.indicator_id)
        if found and found[0].areas[0] in names:
            why = f"Red Flag: {found[0].name} ({flag.indicator_id})"
            if why not in reasons[found[0].areas[0]]:
                reasons[found[0].areas[0]].append(why)
    pointed: dict[str, float] = {}
    for kind in sorted(_held_schemas(db, investigation_id)):
        needing = users.get(kind, set())
        if not needing or len(needing) > MAX_AREAS:
            continue
        shares = {a: share[a].get(kind, 0.0) for a in needing}
        top = max(shares.values())
        if top < MIN_SHARE:
            continue
        for area, value in shares.items():
            if value >= NEAR * top and area in names:
                reasons[area].append(f"Records hold {kind}, which {round(100 * value)}% of this area's indicators need")
                pointed[area] = max(pointed.get(area, 0.0), value)
    order = sorted(reasons, key=lambda a: (not any(r.startswith("Red Flag") for r in reasons[a]), -pointed.get(a, 0.0), a))
    return [{"key": a, "name": names.get(a, a), "reasons": reasons[a]} for a in order]


def current(db: Session, investigation: Investigation) -> dict[str, Any]:
    _, _, names = _needs()
    picks = suggested(db, investigation.id)
    if investigation.type_areas is not None:
        return {"set_by": "reporter", "suggested": picks,
                "areas": [{"key": a, "name": names.get(a, a), "reasons": ["Chosen by the reporter"]} for a in investigation.type_areas]}
    return {"set_by": "app", "areas": picks, "suggested": picks}


def set_areas(db: Session, investigation: Investigation, areas: list[str] | None) -> None:
    """The reporter's choice; None hands the choice back to the app."""
    _, _, names = _needs()
    if areas is not None:
        unknown = [a for a in areas if a not in names]
        if unknown:
            raise ValueError(f"Unknown area: {', '.join(unknown)}")
        areas = list(dict.fromkeys(areas))
    investigation.type_areas = areas
    db.commit()
