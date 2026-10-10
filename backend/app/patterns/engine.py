"""Run every rule on an investigation and keep the flags (system-design.md
§3.3; patterns.md "Ranking").

Ranking, with every part stored so the card shows why a flag ranks where it
does (never one opaque score):
- 1 for the flag (equal weights: Fazekas & Kocsis 2015; OCP 2024);
- +0.25 for each other open flag on any of the same parties (flags that
  agree; OCP 2024: in combination they "can signal a higher likelihood");
- -0.3 when it rests on a link not yet supported by reviewed claims or
  evidence, or on a contested one;
- -0.5 when the rule is marked weak.
"""

from __future__ import annotations

import hashlib
from functools import lru_cache
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.catalogue.loader import load
from app.catalogue.models import Indicator
from app.core.time import utcnow_naive
from app.models.domain import Lead, PatternFlag
from app.patterns import graph as case_graph
from app.patterns.rules import circular_ownership, circular_payments, ownership_layers, payment_no_purpose, shared_contact

RULES = [circular_ownership, ownership_layers, circular_payments, payment_no_purpose, shared_contact]
LEVELS = ("faint", "strong", "textbook")


@lru_cache(maxsize=1)
def _catalogue() -> dict[str, tuple[Indicator, str]]:
    return {i.id: (i, a.name) for a in load().areas for i in a.indicators}


@lru_cache(maxsize=1)
def _glossary() -> list[dict[str, Any]]:
    cat = load()
    merged: dict[str, dict[str, Any]] = {}
    for g in cat.glossaries:
        for t in g.terms:
            key = t.term.strip().lower()
            row = merged.setdefault(key, {**t.model_dump(mode="json"), "areas": []})
            row["areas"] = sorted(set(row["areas"]) | set(t.areas or [g.area]))
            for field in ("indicators", "related", "cases", "examples"):
                row[field] = list(dict.fromkeys([*row.get(field, []), *getattr(t, field)]))
    return sorted(merged.values(), key=lambda t: t["term"].lower())


def catalogue_glossary() -> list[dict[str, Any]]:
    return _glossary()


def catalogue_areas() -> list[dict[str, Any]]:
    cat = load()
    terms: dict[str, int] = {}
    for t in _glossary():
        for a in t["areas"]:
            terms[a] = terms.get(a, 0) + 1
    return [{"key": a.key, "name": a.name, "scope": a.scope, "indicators": len(a.indicators),
             "verified": sum(i.status.value == "verified" for i in a.indicators), "terms": terms.get(a.key, 0)} for a in cat.areas]


def indicator(indicator_id: str) -> tuple[Indicator, str] | None:
    return _catalogue().get(indicator_id)


def _name(indicator_id: str) -> str:
    found = indicator(indicator_id)
    return found[0].name if found else indicator_id


def _fingerprint(indicator_id: str, parties: list[str], links: list[str]) -> str:
    raw = "|".join([indicator_id, ",".join(sorted(parties)), ",".join(sorted(links))])
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def recompute(db: Session, investigation_id: str) -> None:
    graph = case_graph.build(db, investigation_id)
    certainty = {link.id: link.certainty for link in graph.links}
    now = utcnow_naive()
    existing = {f.fingerprint: f for f in db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == investigation_id))}
    seen: set[str] = set()
    for rule in RULES:
        for occ in rule.run(graph):
            fp = _fingerprint(rule.INDICATOR, occ.parties, occ.links)
            seen.add(fp)
            facts = {**occ.facts, "summary": occ.summary, "weak": rule.WEAK,
                     "unreviewed_links": [l for l in occ.links if certainty.get(l) != "supported"]}
            row = existing.get(fp)
            if row is None:
                row = PatternFlag(investigation_id=investigation_id, indicator_id=rule.INDICATOR, fingerprint=fp, first_seen_at=now, status="open")
                db.add(row)
                existing[fp] = row
            row.rule_version, row.level, row.parties, row.links, row.facts = rule.VERSION, occ.level, occ.parties, occ.links, facts
            row.last_seen_at, row.gone_at = now, None
    for fp, row in existing.items():
        if fp not in seen and row.gone_at is None:
            row.gone_at = now
    _rank([r for r in existing.values() if r.gone_at is None])
    db.commit()


def _rank(rows: list[PatternFlag]) -> None:
    open_rows = [r for r in rows if r.status == "open"]
    for row in rows:
        parts: list[dict[str, Any]] = [{"why": "one flag", "value": 1.0}]
        shared = [o for o in open_rows if o is not row and set(o.parties) & set(row.parties)]
        if shared:
            parts.append({"why": f"{len(shared)} other open flag{'s' if len(shared) != 1 else ''} on the same parties", "value": 0.25 * len(shared)})
        if (row.facts or {}).get("unreviewed_links"):
            parts.append({"why": "rests on a link not yet supported by reviewed claims or evidence", "value": -0.3})
        if (row.facts or {}).get("weak"):
            parts.append({"why": "the pattern is weak on its own", "value": -0.5})
        row.weight_parts = parts
        row.weight = round(sum(p["value"] for p in parts), 2)


def serialize(db: Session, row: PatternFlag, names: dict[str, tuple[str, str]]) -> dict[str, Any]:
    found = indicator(row.indicator_id)
    ind, area = found if found else (None, "")
    return {
        "id": row.id, "indicator_id": row.indicator_id, "rule_version": row.rule_version, "level": row.level,
        "status": row.status, "dismissed_reason": row.dismissed_reason, "lead_id": row.lead_id,
        "weight": row.weight, "weight_parts": row.weight_parts,
        "parties": [{"id": p, "name": names.get(p, (p, ""))[0], "schema": names.get(p, ("", "Thing"))[1]} for p in row.parties],
        "links": row.links, "facts": row.facts, "summary": (row.facts or {}).get("summary", ""),
        "first_seen_at": row.first_seen_at, "last_seen_at": row.last_seen_at, "gone_at": row.gone_at,
        "indicator": None if ind is None else {
            "id": ind.id, "name": ind.name, "definition": ind.definition, "area": ind.areas[0], "area_name": area,
            "levels": {"faint": ind.levels.faint, "strong": ind.levels.strong, "textbook": ind.levels.textbook,
                       "threshold_source": ind.levels.threshold_source},
            "sources": [{"title": s.title, "publisher": s.publisher, "url": s.url, "locator": s.locator, "quote": s.quote}
                        for s in ind.sources if s.quote_verified][:3],
            "innocent_explanations": ind.innocent_explanations,
            "cross_hints": [{"target_area": h.target_area, "reason": h.reason, "source_url": h.source_url} for h in ind.cross_hints],
            "version": ind.version,
        },
    }


def flags(db: Session, investigation_id: str, *, refresh: bool = True) -> dict[str, Any]:
    from app.models.domain import Entity

    from app.core.authorization import InvestigationAuthorizationError

    if refresh:
        try:
            recompute(db, investigation_id)
        except InvestigationAuthorizationError:
            # A reader without write access sees the flags as last computed.
            db.rollback()
    rows = list(db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == investigation_id)))
    party_ids = {p for r in rows for p in r.parties}
    names = {e.id: (e.caption or e.id, e.schema) for e in db.scalars(select(Entity).where(Entity.id.in_(party_ids)))} if party_ids else {}
    current = sorted((r for r in rows if r.gone_at is None), key=lambda r: (-r.weight, r.indicator_id, r.fingerprint))
    gone = sorted((r for r in rows if r.gone_at is not None), key=lambda r: r.gone_at or r.last_seen_at, reverse=True)
    return {
        "investigation_id": investigation_id,
        "rules": [{"indicator_id": r.INDICATOR, "version": r.VERSION, "name": _name(r.INDICATOR)} for r in RULES],
        "flags": [serialize(db, r, names) for r in current],
        "gone": [serialize(db, r, names) for r in gone],
    }


def dismiss(db: Session, row: PatternFlag, reason: str) -> None:
    if not reason.strip():
        raise ValueError("Say why it is not relevant, so the reason stays with the flag")
    row.status, row.dismissed_reason = "dismissed", reason.strip()
    db.commit()


def reopen(db: Session, row: PatternFlag) -> None:
    row.status, row.dismissed_reason = "open", None
    db.commit()


def make_lead(db: Session, row: PatternFlag) -> Lead:
    from app.schemas.api import LeadCreate, LeadLinkCreate
    from app.services.leads import create_lead, create_lead_link

    if row.lead_id:
        raise ValueError("This flag is already a lead")
    found = indicator(row.indicator_id)
    name = found[0].name if found else row.indicator_id
    summary = (row.facts or {}).get("summary") or name
    lead = create_lead(db, LeadCreate(investigation_id=row.investigation_id, title=f"Red Flag: {name}"[:500],
                                      detail=f"{summary} ({row.indicator_id}, {row.level}). A flag is a lead, not a finding.",
                                      provider="red_flags", provider_record_id=row.id))
    for party in row.parties:
        create_lead_link(db, lead, LeadLinkCreate(entity_id=party, note="A party the flag is on"))
    for link in row.links:
        create_lead_link(db, lead, LeadLinkCreate(relationship_id=link, note="A link the flag rests on"))
    row.status, row.lead_id = "made_lead", lead.id
    db.commit()
    return lead
