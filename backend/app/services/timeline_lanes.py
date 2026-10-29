"""The timeline as the Lanes view draws it (mockup TIME_1; research §2.9): the case's events, each with the parties it
is about, where it comes from, its amount, and one mark for whether it is shown; the parties as lanes; the reporter's
named periods; the sequence checks; the records not on the timeline yet; and the sources with no date.

One mark per event (research §2.9, "One certainty mark per event"): whether the event is shown, never three
vocabularies. The date's own exactness is the band, drawn from its precision.
  shown       the reporter graded it confirmed or likely, its claim is supported or confirmed, its date is verified,
              or it comes from a source the reporter rated Tier A (an authority's own record or an admission)
  disputed    its date is disputed, or its claim is
  worked_out  its date is approximate or estimated: reasoned, not read
  not_yet     everything else; a reporter's weak, unsubstantiated or unknown grade says why in its note
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import (
    Entity,
    Evidence,
    RelationshipEdge,
    Source,
    Statement,
    TimelineEvent,
    TimelinePeriod,
)
from app.services import sequence_rules
from app.services.timeline import (
    SOURCE_DATE_KEYS,
    _normalize_date,
    investigation_timeline,
)

FILMSTRIP = 40
UNDATED = 40
GRADE_NOTE = {"weak": "Graded weak: a single source says it happened",
              "unsubstantiated": "Graded unsubstantiated: no conclusion for lack of evidence",
              "unknown": "Graded unknown: what happened cannot be identified"}


def fact_of(event: dict[str, Any], tier_a: bool = False) -> tuple[str, str | None]:
    """Whether the event is shown, and the reason in words."""
    claim = (event.get("context") or {}).get("claim") or {}
    status = event.get("verification_status")
    if status == "disputed" or claim.get("status") == "disputed":
        return "disputed", "Its date is disputed" if status == "disputed" else "Its claim is disputed"
    grade = event.get("grade")
    if grade in ("confirmed", "likely"):
        return "shown", f"Graded {grade}"
    if claim.get("status") in ("supported", "confirmed"):
        return "shown", f"Its claim is {claim['status']}"
    if status in ("verified", "reporter_reviewed"):
        return "shown", "Its date is verified" if status == "verified" else "You reviewed this date"
    if tier_a:
        return "shown", "From a Tier A source: an authority's own record or an admission"
    if status == "approximate" or event.get("precision") == "estimated":
        return "worked_out", "Its date is worked out, not read"
    return "not_yet", GRADE_NOTE.get(grade or "") or ("A placeholder: no evidence attached yet" if event.get("placeholder")
                                                     else "Nothing shows it yet")


def _number(text: str | None) -> float | None:
    try:
        return float(str(text).replace(",", "").strip()) if text not in (None, "") else None
    except ValueError:
        return None


def lanes(db: Session, investigation_id: str) -> dict[str, Any]:
    whole = investigation_timeline(db, investigation_id)
    events: list[dict[str, Any]] = whole["events"]

    entities = {e.id: e for e in db.scalars(select(Entity).where(Entity.investigation_id == investigation_id))}
    edges = {e.relationship_entity_id: e for e in db.scalars(
        select(RelationshipEdge).where(RelationshipEdge.investigation_id == investigation_id))}
    sources = {s.id: s for s in db.scalars(select(Source).where(Source.investigation_id == investigation_id))}
    statement_ids = [str(e["refs"]["statement_id"]) for e in events if e.get("refs", {}).get("statement_id")]
    statements = {s.id: s for s in db.scalars(select(Statement).where(Statement.id.in_(statement_ids or ["__none__"])))}
    link_values: dict[str, dict[str, str]] = {}
    for st in db.scalars(select(Statement).where(Statement.entity_id.in_(list(edges) or ["__none__"]),
                                                 Statement.prop.in_(("amount", "amountEur", "currency")))):
        link_values.setdefault(st.entity_id, {}).setdefault(st.prop, st.value)
    evidence_source = {ev.id: ev.source_id for ev in db.scalars(select(Evidence).where(Evidence.id.in_(
        [str(e["refs"]["evidence_id"]) for e in events if e.get("refs", {}).get("evidence_id")] or ["__none__"])))}

    def ends(entity_id: str | None) -> list[str]:
        if not entity_id:
            return []
        edge = edges.get(entity_id)
        return [edge.source_entity_id, edge.target_entity_id] if edge else [entity_id]

    def source_of(event: dict[str, Any], statement: Statement | None) -> tuple[str, str]:
        refs = event.get("refs") or {}
        sid = refs.get("source_id") or evidence_source.get(str(refs.get("evidence_id") or ""))
        if not sid and statement is not None and (statement.origin or "").startswith("source:"):
            sid = (statement.origin or "")[len("source:"):]
        if sid and sid in sources:
            return f"source:{sid}", sources[sid].title
        dataset = (event.get("provenance") or {}).get("dataset") or (statement.dataset if statement else None)
        if event.get("kind") == "reporter_event" or dataset == "reporter":
            return "you", "Typed by you"
        return f"dataset:{dataset or 'unknown'}", str(dataset or "Where it came from is not recorded")

    out_events = []
    for event in events:
        refs = event.get("refs") or {}
        statement = statements.get(str(refs.get("statement_id") or ""))
        parties: list[str] = []
        for ref in (refs.get("relationship_entity_id"), refs.get("entity_id")):
            for pid in ends(ref):
                if pid not in parties and pid in entities and pid not in edges:
                    parties.append(pid)
        edge = edges.get(str(refs.get("relationship_entity_id") or refs.get("entity_id") or ""))
        values = link_values.get(edge.relationship_entity_id, {}) if edge else {}
        source_key, source_label = source_of(event, statement)
        tier_a = source_key.startswith("source:") and sources[source_key[7:]].source_tier == "A"
        fact, note = fact_of(event, tier_a)
        out_events.append({
            **event, "parties": parties, "schema": edge.schema if edge else None,
            "prop": statement.prop if statement is not None else None,
            "amount": _number(values.get("amount")), "currency": values.get("currency"),
            "amount_eur": _number(values.get("amountEur")),
            "source_key": source_key, "source_label": source_label, "fact": fact, "fact_note": note,
        })

    # Lanes: each party an event names, in the order they first appear.
    first_seen: dict[str, str] = {}
    counts: Counter[str] = Counter()
    for e in out_events:
        for pid in e["parties"]:
            first_seen.setdefault(pid, e["sort_key"])
            counts[pid] += 1
    party_rows: list[dict[str, Any]] = []
    for pid in sorted(first_seen, key=lambda p: (first_seen[p], entities[p].caption.lower())):
        ent = entities[pid]
        props = ent.properties or {}
        country = next((v for key in ("country", "jurisdiction", "nationality") for v in (props.get(key) or [])), None)
        party_rows.append({"id": pid, "caption": ent.caption, "schema": ent.schema, "country": country, "events": counts[pid]})

    periods = [{"id": p.id, "name": p.name, "date_start": p.date_start, "date_end": p.date_end, "summary": p.summary,
                "made_by": p.made_by} for p in db.scalars(select(TimelinePeriod).where(
                    TimelinePeriod.investigation_id == investigation_id).order_by(TimelinePeriod.date_start))]

    # Not on the timeline yet: documents whose own date says when they were made, not yet placed by the reporter.
    placed = {row.source_id for row in db.scalars(select(TimelineEvent).where(
        TimelineEvent.investigation_id == investigation_id, TimelineEvent.source_id.is_not(None)))}
    film, undated = [], []
    for s in sorted(sources.values(), key=lambda s: s.created_at):
        meta = s.metadata_json or {}
        found = next(((key, read) for key in SOURCE_DATE_KEYS if key in meta
                      for read in [_normalize_date(meta.get(key))] if read is not None), None)
        if found is None:
            undated.append({"source_id": s.id, "title": s.title, "kind": s.source_type,
                            "why": "Its details hold no date" if not any(k in meta for k in SOURCE_DATE_KEYS)
                            else "Its date could not be read"})
        elif s.id not in placed:
            key, (date_text, precision) = found
            film.append({"source_id": s.id, "title": s.title, "kind": s.source_type, "date": date_text,
                         "precision": precision, "date_key": key.replace("_", " ")})
    film.sort(key=lambda f: f["date"])

    dated = [e for e in out_events if e.get("date_start")]
    years = Counter(str(e["date_start"])[:4] for e in dated)
    unresolved = [e for e in out_events if e["fact"] != "shown" and not e.get("placeholder")]
    return {
        "investigation_id": investigation_id,
        "events": out_events,
        "parties": party_rows,
        "periods": periods,
        "sequence": sequence_rules.check(out_events),
        "not_placed": film[:FILMSTRIP], "not_placed_total": len(film),
        "undated": undated[:UNDATED], "undated_total": len(undated),
        "facts": dict(Counter(e["fact"] for e in out_events)),
        "span": {"first": min(years) if years else None, "last": max(years) if years else None,
                 "busiest": years.most_common(1)[0][0] if years else None},
        "opens_on": unresolved[0]["id"] if unresolved else None,
    }


def save_period(db: Session, investigation_id: str, *, name: str, date_start: str, date_end: str, summary: str = "",
                actor: str | None = None, period: TimelinePeriod | None = None) -> TimelinePeriod:
    """Name a stretch of the case's time (or change one). Dates as on an event: a year, a month or a day."""
    name = name.strip()
    if not name:
        raise ValueError("Give the period a name")
    a, b = _normalize_date(date_start), _normalize_date(date_end)
    if a is None or b is None:
        raise ValueError("Dates are a year, a month or a day: 2019, 2019-05 or 2019-05-02")
    if sequence_rules._bounds(b[0])[1] < sequence_rules._bounds(a[0])[0]:
        raise ValueError("The period ends before it starts")
    row = period or TimelinePeriod(investigation_id=investigation_id, made_by=actor)
    row.name, row.date_start, row.date_end, row.summary = name[:120], a[0], b[0], summary.strip()
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
