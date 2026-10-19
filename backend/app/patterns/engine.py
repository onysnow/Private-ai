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

from app.services.case_years import link_years
from app.catalogue.loader import Catalogue, load
from app.catalogue.models import AREA_SUMMARIES, Indicator
from app.core.time import utcnow_naive
from app.models.domain import CheckItem, Investigation, Lead, PatternFlag
from app.patterns import checks as check_items
from app.patterns import graph as case_graph
from app.patterns import investigation_type
from app.patterns import specs as detection

LEVELS = ("faint", "strong", "textbook")


@lru_cache(maxsize=1)
def catalogue() -> Catalogue:
    """The catalogue, parsed once per process (parsing every file takes seconds)."""
    return load()


@lru_cache(maxsize=1)
def _catalogue() -> dict[str, tuple[Indicator, str]]:
    return {i.id: (i, a.name) for a in catalogue().areas for i in a.indicators}


@lru_cache(maxsize=1)
def _glossary() -> list[dict[str, Any]]:
    cat = catalogue()
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


# Glossary areas with no indicators: the app's own names (catalogue/glossary/app.yaml).
GLOSSARY_ONLY = {"APP": ("The app's own names", "Names the app gives its own tools and levels.")}


def catalogue_areas() -> list[dict[str, Any]]:
    cat = catalogue()
    terms: dict[str, int] = {}
    for t in _glossary():
        for a in t["areas"]:
            terms[a] = terms.get(a, 0) + 1
    areas = [{"key": a.key, "name": a.name, "scope": a.scope, "summary": AREA_SUMMARIES.get(a.key, ""), "indicators": len(a.indicators),
              "verified": sum(i.status.value == "verified" for i in a.indicators), "terms": terms.get(a.key, 0)} for a in cat.areas]
    return areas + [{"key": k, "name": n, "scope": s, "summary": s, "indicators": 0, "verified": 0, "terms": terms.get(k, 0)}
                    for k, (n, s) in GLOSSARY_ONLY.items() if terms.get(k)]


def _acronym(text: str) -> bool:
    return " " not in text and sum(c.isupper() for c in text) >= 2


def _names(term: str) -> list[str]:
    """The ways a term is written in text. "3T / 3TG" is found as either. A part in
    brackets is a second name only when one side is an acronym of the other kind:
    "Bank Secrecy Act (BSA)", "HFC (hydrofluorocarbon)". Otherwise it says which
    sense is meant ("Loitering (vessel)", "Travel Act (US)") and is not searched for.
    Names under three letters, and under four unless in capitals, are left out."""
    head, _, rest = term.partition(" (")
    rest = rest.rstrip(")").strip()
    parts = [head, rest] if rest and (_acronym(head) or _acronym(rest)) else [head]
    out = [n.strip() for part in parts for n in part.split(" / ")]
    return list(dict.fromkeys(n for n in out if len(n) >= 4 or (len(n) >= 3 and n.isupper())))


@lru_cache(maxsize=1)
def catalogue_term_hints() -> list[dict[str, Any]]:
    """Every term with the names it is found by in text, for hover cards
    (indicators.md: "a term written anywhere in the app shows a hover card").
    A name is matched exactly as written when it is an acronym or one of the
    app's own names (so "Strong" is not found in "strong"); otherwise in any case."""
    out = []
    for t in _glossary():
        own = "APP" in t["areas"]
        out.append({"term": t["term"], "definition": t["definition"], "areas": t["areas"],
                    "names": [{"text": n, "exact": own or n.isupper()} for n in _names(t["term"])]})
    return out


def indicator(indicator_id: str) -> tuple[Indicator, str] | None:
    return _catalogue().get(indicator_id)


def _name(indicator_id: str) -> str:
    found = indicator(indicator_id)
    return found[0].name if found else indicator_id


def _fingerprint(indicator_id: str, parties: list[str], links: list[str]) -> str:
    raw = "|".join([indicator_id, ",".join(sorted(parties)), ",".join(sorted(links))])
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


class _Crashed(str):
    """A rule that raised instead of answering; its earlier flags are kept."""


def _run_spec(spec: Any, graph: Any) -> Any:
    """Run one detection rule. A rule that raises is reported as unable to run,
    so one bad amount or date cannot take every other flag in the case with it."""
    try:
        return detection.run(spec, graph)
    except Exception as exc:  # noqa: BLE001 - isolate each rule from the others
        return _Crashed(f"This rule failed on this case ({exc.__class__.__name__}); the other rules still ran.")


def recompute(db: Session, investigation_id: str) -> list[dict[str, str]]:
    """Runs every detection spec (catalogue/detection/) on the case and keeps the
    flags; returns the specs that could not run, each with its reason."""
    graph = case_graph.build(db, investigation_id)
    certainty = {link.id: link.certainty for link in graph.links}
    now = utcnow_naive()
    existing = {f.fingerprint: f for f in db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == investigation_id))}
    seen: set[str] = set()
    cannot: list[dict[str, str]] = []
    crashed: set[str] = set()
    for spec in detection.load():
        results = _run_spec(spec, graph)
        if isinstance(results, str):
            if isinstance(results, _Crashed):
                crashed.add(spec.indicator)
            cannot.append({"indicator_id": spec.indicator, "name": _name(spec.indicator), "reason": results})
            continue
        family = spec.family_module()
        for res in results:
            fp = _fingerprint(spec.indicator, res.parties, res.links)
            seen.add(fp)
            facts = {**res.facts, "summary": res.summary, "weak": spec.weak, "not_shown": spec.not_shown, "band_reason": res.band_reason,
                     "family": spec.family, "family_version": family.VERSION,
                     "unreviewed_links": [l for l in res.links if certainty.get(l) != "supported"]}
            row = existing.get(fp)
            if row is None:
                row = PatternFlag(investigation_id=investigation_id, indicator_id=spec.indicator, fingerprint=fp, first_seen_at=now, status="open")
                db.add(row)
                existing[fp] = row
            row.rule_version, row.level, row.parties, row.links, row.facts = spec.version, res.level, res.parties, res.links, facts
            row.last_seen_at, row.gone_at = now, None
    for fp, row in existing.items():
        if fp not in seen and row.gone_at is None and row.indicator_id not in crashed:
            row.gone_at = now
    _rank([r for r in existing.values() if r.gone_at is None])
    db.commit()
    return cannot


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


def serialize(db: Session, row: PatternFlag, names: dict[str, tuple[str, str]],
              checks: dict[str, list[dict[str, str]]] | None = None, by_link: dict[str, set[int]] | None = None) -> dict[str, Any]:
    from app.services.case_years import flag_years

    found = indicator(row.indicator_id)
    ind, area = found if found else (None, "")
    return {
        "id": row.id, "indicator_id": row.indicator_id, "rule_version": row.rule_version, "level": row.level,
        "status": row.status, "dismissed_reason": row.dismissed_reason, "lead_id": row.lead_id,
        "weight": row.weight, "weight_parts": row.weight_parts,
        "parties": [{"id": p, "name": names.get(p, (p, ""))[0], "schema": names.get(p, ("", "Thing"))[1]} for p in row.parties],
        "links": row.links, "facts": row.facts, "summary": (row.facts or {}).get("summary", ""),
        "not_shown": list((row.facts or {}).get("not_shown") or []),
        "checks": (checks or {}).get(row.id, []),
        "years": flag_years(row, by_link or {}),
        "first_seen_at": row.first_seen_at, "last_seen_at": row.last_seen_at, "gone_at": row.gone_at,
        # Before you call it: each innocent explanation with what a person found (not looked at until they say).
        "innocent": [{"text": text, "state": (row.innocent or {}).get(text, {}).get("state", "not_looked_at"),
                      "note": (row.innocent or {}).get(text, {}).get("note")} for text in (ind.innocent_explanations if ind else [])],
        "indicator": None if ind is None else {
            "id": ind.id, "name": ind.name, "definition": ind.definition, "area": ind.areas[0], "area_name": area,
            "levels": {"faint": ind.levels.faint, "strong": ind.levels.strong, "textbook": ind.levels.textbook,
                       "threshold_source": ind.levels.threshold_source, "threshold_note": ind.levels.threshold_note},
            "sources": [{"title": s.title, "publisher": s.publisher, "url": s.url, "locator": s.locator, "quote": s.quote}
                        for s in ind.sources if s.quote_verified][:3],
            "innocent_explanations": ind.innocent_explanations,
            "cross_hints": [{"target_area": h.target_area, "reason": h.reason, "source_url": h.source_url} for h in ind.cross_hints],
            "version": ind.version,
        },
    }


def bring_up_to_date(db: Session, investigation_id: str) -> list[dict[str, str]] | None:
    """Brings the flags and To check items (missing values too) up to date. Two
    requests may do this at the same moment (Case home asks for flags, checks and
    decisions together): the one that loses the race on a new item's fingerprint
    starts again from what the other wrote. Returns what could not run, or None
    for a reader without write access, who sees them as last computed."""
    from sqlalchemy.exc import IntegrityError

    from app.core.authorization import InvestigationAuthorizationError

    for attempt in range(3):
        try:
            cannot = recompute(db, investigation_id)
            check_items.recompute(db, investigation_id)
            return cannot
        except InvestigationAuthorizationError:
            db.rollback()
            return None
        except IntegrityError:
            db.rollback()
            if attempt == 2:
                raise
    return None


def flags(db: Session, investigation_id: str, *, refresh: bool = True) -> dict[str, Any]:
    from app.models.domain import Entity

    cannot: list[dict[str, str]] = []
    if refresh:
        refreshed = bring_up_to_date(db, investigation_id)
        if refreshed is not None:
            cannot = refreshed
        else:
            # A reader without write access sees the flags as last computed.
            graph = case_graph.build(db, investigation_id)
            cannot = [{"indicator_id": s.indicator, "name": _name(s.indicator), "reason": r}
                      for s in detection.load() if isinstance(r := _run_spec(s, graph), str)]
    rows = list(db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == investigation_id)))
    party_ids = {p for r in rows for p in r.parties}
    names = {e.id: (e.caption or e.id, e.schema) for e in db.scalars(select(Entity).where(Entity.id.in_(party_ids)))} if party_ids else {}
    current = sorted((r for r in rows if r.gone_at is None), key=lambda r: (-r.weight, r.indicator_id, r.fingerprint))
    gone = sorted((r for r in rows if r.gone_at is not None), key=lambda r: r.gone_at or r.last_seen_at, reverse=True)
    inv = db.get(Investigation, investigation_id)
    by_link = link_years(db, investigation_id)
    linked: dict[str, list[dict[str, str]]] = {}
    for c in db.scalars(select(CheckItem).where(CheckItem.investigation_id == investigation_id, CheckItem.flag_id.is_not(None),
                                                CheckItem.gone_at.is_(None))):
        linked.setdefault(c.flag_id or "", []).append({"id": c.id, "question": c.question, "status": c.status})
    return {
        "investigation_id": investigation_id,
        "rules": [{"indicator_id": s.indicator, "version": s.version, "name": _name(s.indicator)} for s in detection.load()],
        "cannot_run": cannot,
        "flags": [serialize(db, r, names, linked, by_link) for r in current],
        "gone": [serialize(db, r, names, by_link=by_link) for r in gone],
        "investigation_type": investigation_type.current(db, inv) if inv else {"set_by": "app", "areas": [], "suggested": []},
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


INNOCENT_STATES = ("not_looked_at", "ruled_out", "could_apply")


def mark_innocent(db: Session, row: PatternFlag, text: str, state: str, note: str | None) -> None:
    """Records what a person found about one innocent explanation. Ruling one out needs a note."""
    found = indicator(row.indicator_id)
    if found is None or text not in found[0].innocent_explanations:
        raise ValueError("That is not one of this flag's innocent explanations")
    if state not in INNOCENT_STATES:
        raise ValueError(f"state must be one of {', '.join(INNOCENT_STATES)}")
    if state == "ruled_out" and not (note or "").strip():
        raise ValueError("Say what ruled it out")
    current = dict(row.innocent or {})
    if state == "not_looked_at":
        current.pop(text, None)
    else:
        current[text] = {"state": state, "note": (note or "").strip() or None, "at": utcnow_naive().isoformat()}
    row.innocent = current
    db.commit()
