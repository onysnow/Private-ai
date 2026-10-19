"""Missing values: a value a record needs and does not have (Ony, 10 Oct 2026:
"If there are any values that need to exist but don't we need a flag for that
as well").

A missing value is not a Red Flag. A Red Flag is a pattern the records show;
a missing value is a gap in a record, named with what the gap stops: a chart
that cannot place it, a Red Flag rule that cannot read it, a claim that
cannot be Supported. Each one is a To check item of kind ``missing`` on its
record, so it is kept by fingerprint like the others: it goes by itself when
the value is filled in, and a person can answer it before then:

- ``chasing``: chase it (a lead is made, pointing at the record);
- ``unknowable``: it cannot be known (say why);
- ``not_needed``: it does not apply to this record.

Rules are plain Python over the stored records, so the same check runs on
SQLite and Postgres. Each rule's key is the item's indicator id (MV-…)."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Claim, ClaimEvidenceLink, Entity, Evidence, RelationshipEdge, Source, TimelineEvent

ANSWERS = ("chasing", "unknowable", "not_needed")
COMPANIES = {"Company", "Organization", "LegalEntity", "PublicBody"}
DATED_LINKS = {"Ownership", "Directorship", "Employment", "Membership", "Representation", "Succession"}


@dataclass(frozen=True)
class Gap:
    rule: str
    record_type: str  # entity | relationship | evidence | claim | event | source
    record_id: str
    label: str  # the record, in words
    question: str  # what is missing, as a question a person can answer
    blocks: str  # what the gap stops
    parties: tuple[str, ...] = ()
    rank: int = 10


def _has(props: dict[str, Any] | None, *names: str) -> bool:
    props = props or {}
    return any(any(str(v).strip() for v in (props.get(n) or [])) for n in names)


def _first(props: dict[str, Any] | None, name: str) -> str:
    values = (props or {}).get(name) or []
    return str(values[0]) if values else ""


def _relationship_gaps(db: Session, inv: str) -> Iterator[Gap]:
    rows = db.execute(select(RelationshipEdge, Entity).join(Entity, Entity.id == RelationshipEdge.relationship_entity_id)
                      .where(RelationshipEdge.investigation_id == inv)).all()
    ids = {e.source_entity_id for e, _ in rows} | {e.target_entity_id for e, _ in rows}
    names = {x.id: x.caption for x in db.scalars(select(Entity).where(Entity.id.in_(ids)))} if ids else {}
    for edge, rel in rows:
        props = rel.properties or {}
        a, b = names.get(edge.source_entity_id, "?"), names.get(edge.target_entity_id, "?")
        parties = (edge.source_entity_id, edge.target_entity_id)
        if edge.schema == "Payment":
            label = f"Payment {a} → {b}"
            if not _has(props, "amount"):
                yield Gap("MV-PAY-AMT", "relationship", edge.id, label, f"How much did {a} pay {b}?",
                          "Money traced leaves it out, and the payment rules (amounts near a threshold, round sums) cannot read it.", parties, 40)
            elif not _has(props, "currency"):
                yield Gap("MV-PAY-CUR", "relationship", edge.id, label, f"In what currency is the payment of {_first(props, 'amount')} from {a} to {b}?",
                          "It cannot be added to money traced or compared with other payments.", parties, 35)
            if not _has(props, "date", "startDate"):
                yield Gap("MV-PAY-DATE", "relationship", edge.id, label, f"When did {a} pay {b}?",
                          "The timeline cannot place it, and rules about timing (a run of payments, a payment before a contract) cannot read it.", parties, 35)
        elif edge.schema == "Ownership":
            label = f"Ownership {a} → {b}"
            if not _has(props, "percentage", "sharesCount", "sharesValue"):
                yield Gap("MV-OWN-PCT", "relationship", edge.id, label, f"How much of {b} does {a} own?",
                          "Control and the beneficial-ownership thresholds (25%, 10%) cannot be judged.", parties, 30)
        if edge.schema in DATED_LINKS and not _has(props, "startDate", "date"):
            yield Gap("MV-LINK-DATE", "relationship", edge.id, f"{edge.schema} {a} → {b}", f"Since when has {a} been linked to {b} ({edge.schema.lower()})?",
                      "The year slider cannot say whether the link held at a given time.", parties, 20)


def _entity_gaps(db: Session, inv: str) -> Iterator[Gap]:
    for e in db.scalars(select(Entity).where(Entity.investigation_id == inv, Entity.merged_into_entity_id.is_(None),
                                             Entity.schema.in_(COMPANIES))):
        if not _has(e.properties, "jurisdiction", "country"):
            yield Gap("MV-CO-JUR", "entity", e.id, e.caption, f"Where is {e.caption} registered?",
                      "Rules about secrecy jurisdictions and offshore layers cannot read it, and registries cannot be searched for it.", (e.id,), 25)
        if not _has(e.properties, "registrationNumber", "leiCode", "taxNumber", "vatCode", "ogrnCode", "innCode"):
            yield Gap("MV-CO-REG", "entity", e.id, e.caption, f"What is {e.caption}'s registration number?",
                      "Without an identifier, a same-name company elsewhere cannot be told apart from this one.", (e.id,), 15)


def _evidence_gaps(db: Session, inv: str) -> Iterator[Gap]:
    rows = db.execute(select(Evidence, Source).join(Source, Source.id == Evidence.source_id).where(Source.investigation_id == inv)).all()
    for ev, src in rows:
        label = f"Evidence from {src.title}"
        if not (ev.locator or "").strip():
            yield Gap("MV-EV-LOC", "evidence", ev.id, label, f"Where in {src.title} is this (page, paragraph, timestamp)?",
                      "A claim it supports cannot be Supported: every supporting item needs an exact locator.", (), 30)
        if not (ev.quote or "").strip() and not ev.document_id:
            yield Gap("MV-EV-QUOTE", "evidence", ev.id, label, f"What exactly does {src.title} say here?",
                      "Without the words, nobody can check that the source says what it is cited for.", (), 20)
    for src in db.scalars(select(Source).where(Source.investigation_id == inv, Source.source_type.in_(("web", "social")))):
        if not (src.url or "").strip():
            yield Gap("MV-SRC-URL", "source", src.id, src.title, f"What is the address of {src.title}?",
                      "Nobody can open it again or capture a copy before it changes.", (), 15)


def _claim_gaps(db: Session, inv: str) -> Iterator[Gap]:
    supported = {cid for (cid,) in db.execute(select(ClaimEvidenceLink.claim_id).join(Claim, Claim.id == ClaimEvidenceLink.claim_id)
                                              .where(Claim.investigation_id == inv, ClaimEvidenceLink.stance == "supports"))}
    for c in db.scalars(select(Claim).where(Claim.investigation_id == inv, Claim.status.in_(("supported", "confirmed")))):
        if c.id not in supported:
            yield Gap("MV-CLM-EV", "claim", c.id, c.text[:120], f"What shows “{c.text[:120]}”?",
                      f"It is marked {c.status.capitalize()} with no supporting evidence linked: it cannot be defended as it stands.", (), 60)


def _event_gaps(db: Session, inv: str) -> Iterator[Gap]:
    for ev in db.scalars(select(TimelineEvent).where(TimelineEvent.investigation_id == inv, TimelineEvent.source_id.is_(None),
                                                     TimelineEvent.evidence_id.is_(None), TimelineEvent.claim_id.is_(None))):
        yield Gap("MV-EVT-SRC", "event", ev.id, ev.title, f"What shows that “{ev.title}” happened on {ev.date_start}?",
                  "The timeline shows it as asserted only; nobody can trace where the date comes from.",
                  tuple(p for p in (ev.entity_id, ev.relationship_entity_id) if p), 20)


RULES: tuple[Callable[[Session, str], Iterator[Gap]], ...] = (_relationship_gaps, _entity_gaps, _evidence_gaps, _claim_gaps, _event_gaps)
RULE_NAMES = {
    "MV-PAY-AMT": "Payment amount", "MV-PAY-CUR": "Payment currency", "MV-PAY-DATE": "Payment date", "MV-OWN-PCT": "Ownership share",
    "MV-LINK-DATE": "Link start date", "MV-CO-JUR": "Company jurisdiction", "MV-CO-REG": "Company identifier",
    "MV-EV-LOC": "Evidence locator", "MV-EV-QUOTE": "Evidence words", "MV-SRC-URL": "Source address", "MV-CLM-EV": "Evidence for a Supported claim",
    "MV-EVT-SRC": "Source of an event",
}


RULE_RANK = {"MV-CLM-EV": 60, "MV-PAY-AMT": 40, "MV-PAY-CUR": 35, "MV-PAY-DATE": 35, "MV-OWN-PCT": 30, "MV-EV-LOC": 30,
             "MV-CO-JUR": 25, "MV-LINK-DATE": 20, "MV-EV-QUOTE": 20, "MV-EVT-SRC": 20, "MV-CO-REG": 15, "MV-SRC-URL": 15}


def gaps(db: Session, investigation_id: str) -> list[Gap]:
    return [g for rule in RULES for g in rule(db, investigation_id)]


def rule_name(key: str) -> str:
    return RULE_NAMES.get(key, key)
