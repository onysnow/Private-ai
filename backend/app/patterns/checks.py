"""To check (docs/discovery/detection-design.md, "Decided" 4): the work a
person does that the records cannot do.

Two kinds of item, kept per case by fingerprint so a decision stays with its
item when the case changes:

- **checklist**: something a person confirms. Every flag whose records cannot
  show part of its indicator (the spec's ``not_shown``) gives one item per
  part, on the flag's parties and linked to the flag; a check spec of kind
  ``checklist`` gives one item per party of a kind (or one for the case).
- **passage**: a part of a document that holds an indicator's words. A check
  spec of kind ``passage`` lists the words; every document chunk in the case
  that holds enough of them is an item, with the words found, a short excerpt
  around the first one and the case's parties named in it. A person decides
  whether the passage shows the indicator; the app never decides.

A third kind is added by a person, not called for by the records:

- **money**: a money check (app/services/money_checks.py: grey hole, miracle,
  black hole, round trip) a person chose to keep in To check from See › Money.
  It holds the check's numbers as they were when added; a recompute never marks
  it gone, because no rule asked for it.

Check specs live in catalogue/detection/checks/*.yaml. The words are matched
in Python, whole words and phrases, ignoring case, so the same search runs on
SQLite and Postgres."""

from __future__ import annotations

import hashlib
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import yaml  # type: ignore[import-untyped,unused-ignore]
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import CheckItem, Document, DocumentChunk, Entity, PatternFlag

ROOT = Path(__file__).resolve().parents[3] / "catalogue" / "detection" / "checks"
STATUSES = ("open", "shows", "does_not", "unclear")
# A missing value's answers (app/patterns/missing.py).
MISSING_STATUSES = ("open", "chasing", "unknowable", "not_needed")
# The money checks a person can keep in To check, with the line each card reads (mockup SEE_2).
MONEY_KINDS = {"grey_hole": ("Grey hole", "more out than in"), "miracle": ("Miracle", "out with nothing in"),
               "black_hole": ("Black hole", "in with nothing out"), "round_trip": ("Round trip", "money back to where it started")}
EXCERPT = 160  # characters either side of the first word found


class PassageExample(BaseModel):
    text: str
    expect: bool  # whether the passage becomes an item


class CheckSpec(BaseModel):
    indicator: str
    version: int = 1
    kind: Literal["passage", "checklist"]
    question: str = Field(min_length=1, description="what the person decides")
    terms: list[str] = []  # passage: words and phrases
    min_terms: int = Field(default=1, ge=1)  # passage: how many different terms a chunk must hold
    for_each: str | None = None  # checklist: one item per party of this kind (Person, Company…); none: one for the case
    examples: list[PassageExample] = []

    @model_validator(mode="after")
    def shape(self) -> "CheckSpec":
        if self.kind == "passage" and not self.terms:
            raise ValueError(f"{self.indicator}: a passage check needs terms")
        if self.kind == "passage" and self.min_terms > len(self.terms):
            raise ValueError(f"{self.indicator}: min_terms is more than the terms given")
        if self.kind == "checklist" and self.terms:
            raise ValueError(f"{self.indicator}: a checklist item has no terms")
        return self

    def found(self, text: str) -> list[str]:
        """The spec's terms in the text, in the order given; [] unless at least min_terms."""
        hits = [t for t in self.terms if _pattern(t).search(text)]
        return hits if len(hits) >= self.min_terms else []


@lru_cache(maxsize=4096)
def _pattern(term: str) -> re.Pattern[str]:
    words = [re.escape(w) for w in term.split()]
    return re.compile(r"(?<!\w)" + r"\s+".join(words) + r"(?!\w)", re.IGNORECASE)


@lru_cache(maxsize=1)
def load(root: Path = ROOT) -> tuple[CheckSpec, ...]:
    if not root.is_dir():
        return ()
    specs: list[CheckSpec] = []
    for path in sorted(root.glob("*.yaml")):
        specs += [CheckSpec.model_validate(x) for x in (yaml.safe_load(path.read_text(encoding="utf-8")) or [])]
    return tuple(specs)


def problems(specs: tuple[CheckSpec, ...], known_indicators: dict[str, Any]) -> list[str]:
    """Lint: unknown indicator, two specs for one indicator, a passage check without
    an example of each outcome, an example that does not come out as expected."""
    out: list[str] = []
    seen: set[str] = set()
    for s in specs:
        if s.indicator in seen:
            out.append(f"{s.indicator}: two check specs")
        seen.add(s.indicator)
        if s.indicator not in known_indicators:
            out.append(f"{s.indicator}: not in the catalogue")
        if s.kind == "passage":
            if {e.expect for e in s.examples} != {True, False}:
                out.append(f"{s.indicator}: needs an example that is found and one that is not")
            for e in s.examples:
                if bool(s.found(e.text)) != e.expect:
                    out.append(f"{s.indicator}: example {e.text[:40]!r} should {'' if e.expect else 'not '}be found")
    return out


def as_question(part: str) -> str:
    """A spec's "whether ..." clause as the question a person answers:
    "whether there was a business reason for the payments" -> "Was there a
    business reason for the payments?"."""
    text = part.strip().rstrip(".?")
    m = re.fullmatch(r"whether there (is|was|are|were) (.+)", text, re.I)
    if m:
        return f"{m.group(1).capitalize()} there {m.group(2)}?"
    m = re.fullmatch(r"whether (it|they|the [\w-]+|this [\w-]+|these [\w-]+) (is|was|are|were) (.+)", text, re.I)
    if m:
        return f"{m.group(2).capitalize()} {m.group(1)} {m.group(3)}?"
    return f"{text[:1].upper()}{text[1:]}?" if text else text


def _fp(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:32]


def _excerpt(text: str, first: str) -> str:
    m = _pattern(first).search(text)
    start = max(0, (m.start() if m else 0) - EXCERPT)
    end = min(len(text), (m.end() if m else 0) + EXCERPT)
    return ("…" if start else "") + " ".join(text[start:end].split()) + ("…" if end < len(text) else "")


def _wanted(db: Session, investigation_id: str, specs: tuple[CheckSpec, ...]) -> dict[str, dict[str, Any]]:
    """Every item the case calls for now, by fingerprint."""
    out: dict[str, dict[str, Any]] = {}
    flags = db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == investigation_id, PatternFlag.gone_at.is_(None),
                                                 PatternFlag.status != "dismissed"))
    for flag in flags:
        for part in (flag.facts or {}).get("not_shown") or []:
            fp = _fp("flag", flag.fingerprint, part)
            out[fp] = {"indicator_id": flag.indicator_id, "kind": "checklist", "question": part, "parties": list(flag.parties),
                       "flag_id": flag.id, "document_id": None, "locator": None, "excerpt": None, "terms": []}
    entities = list(db.scalars(select(Entity).where(Entity.investigation_id == investigation_id)))
    for spec in specs:
        if spec.kind != "checklist":
            continue
        if spec.for_each is None:
            out[_fp("case", spec.indicator)] = {"indicator_id": spec.indicator, "kind": "checklist", "question": spec.question, "parties": [],
                                                "flag_id": None, "document_id": None, "locator": None, "excerpt": None, "terms": []}
            continue
        for e in entities:
            if e.schema == spec.for_each:
                out[_fp("party", spec.indicator, e.id)] = {"indicator_id": spec.indicator, "kind": "checklist", "question": spec.question,
                                                           "parties": [e.id], "flag_id": None, "document_id": None, "locator": None,
                                                           "excerpt": None, "terms": []}
    passage = [s for s in specs if s.kind == "passage"]
    if passage:
        named = [(e.id, _pattern(e.caption)) for e in entities if e.caption and len(e.caption.strip()) >= 4]
        chunks = db.execute(select(DocumentChunk).join(Document, Document.id == DocumentChunk.document_id)
                            .where(Document.investigation_id == investigation_id)).scalars()
        for chunk in chunks:
            for spec in passage:
                hits = spec.found(chunk.text)
                if not hits:
                    continue
                out[_fp("passage", spec.indicator, chunk.id)] = {
                    "indicator_id": spec.indicator, "kind": "passage", "question": spec.question,
                    "parties": [pid for pid, pat in named if pat.search(chunk.text)], "flag_id": None,
                    "document_id": chunk.document_id, "locator": chunk.locator, "excerpt": _excerpt(chunk.text, hits[0]), "terms": hits}
    from app.patterns.missing import gaps

    for gap in gaps(db, investigation_id):
        out[_fp("missing", gap.rule, gap.record_id)] = {
            "indicator_id": gap.rule, "kind": "missing", "question": gap.question, "parties": list(gap.parties), "flag_id": None,
            "document_id": None, "locator": None, "excerpt": gap.label, "terms": [], "record_type": gap.record_type,
            "record_id": gap.record_id, "blocks": gap.blocks}
    return out


def recompute(db: Session, investigation_id: str, specs: tuple[CheckSpec, ...] | None = None) -> None:
    """Brings the case's items up to date: new ones open, ones no longer called
    for are marked gone (decisions kept), ones that come back lose the mark."""
    wanted = _wanted(db, investigation_id, load() if specs is None else specs)
    now = utcnow_naive()
    # A money check is kept by a person, not called for by the records: a recompute leaves it as it is.
    existing = {c.fingerprint: c for c in db.scalars(select(CheckItem).where(CheckItem.investigation_id == investigation_id,
                                                                              CheckItem.kind != "money"))}
    for fp, fields in wanted.items():
        row = existing.get(fp)
        if row is None:
            row = CheckItem(investigation_id=investigation_id, fingerprint=fp, first_seen_at=now, status="open")
            db.add(row)
        for key, value in fields.items():
            setattr(row, key, value)
        row.gone_at = None
    for fp, row in existing.items():
        if fp not in wanted and row.gone_at is None:
            row.gone_at = now
    db.commit()


def money_fingerprint(currency: str, kind: str, party_id: str, payment_id: str | None = None) -> str:
    """A money check's identity in To check: the currency, the kind, the party and, for a round trip, the
    payment that returns (one party can be at the end of more than one trip)."""
    return _fp("money", currency, kind, party_id, payment_id or "")


def _money(amount: float, currency: str) -> str:
    return f"{amount:,.0f} {currency}"


def _money_numbers(kind: str, check: dict[str, Any], currency: str) -> str:
    """The check's numbers in the words its card uses in See › Money."""
    if kind == "round_trip":
        return f"{' → '.join(check['path'])}: {_money(check['gap'], currency)} comes back."
    if kind == "grey_hole":
        return (f"{_money(check['amount_in'], currency)} recorded in, {_money(check['amount_out'], currency)} out: "
                f"{_money(check['gap'], currency)} has no recorded source.")
    if kind == "miracle":
        return f"Pays {_money(check['amount_out'], currency)}. Nothing is recorded coming in."
    return f"Receives {_money(check['amount_in'], currency)}. Nothing is recorded leaving."


def add_money_check(db: Session, investigation_id: str, currency: str, kind: str, party_id: str,
                    payment_id: str | None = None, as_of: int | None = None) -> CheckItem:
    """Keeps a money check in To check, once. The check is run again here, so only one the case's own
    ledger finds can be kept, with its numbers as they are now; a second add returns the same item.
    Raises LookupError when the check finds nothing (the ledger or the year changed)."""
    from app.services.money_checks import investigation_money_checks

    ledger = next((c for c in investigation_money_checks(db, investigation_id, as_of)["currencies"] if c["currency"] == currency), None)
    pool = (ledger or {}).get("round_trips" if kind == "round_trip" else "checks", [])
    check = next((c for c in pool if c["kind"] == kind and c["party_id"] == party_id
                  and (kind != "round_trip" or c["returning_payment_id"] == payment_id)), None)
    if check is None:
        raise LookupError("This check finds nothing now: the ledger or the year has changed")
    fp = money_fingerprint(currency, kind, party_id, payment_id if kind == "round_trip" else None)
    row = db.scalar(select(CheckItem).where(CheckItem.investigation_id == investigation_id, CheckItem.fingerprint == fp))
    if row is not None:
        return row
    word, line = MONEY_KINDS[kind]
    year = f" Up to the end of {as_of}." if as_of is not None else ""
    row = CheckItem(investigation_id=investigation_id, fingerprint=fp, kind="money", indicator_id=kind, status="open",
                    question=f"{word} at {check['party']}: {line}", parties=[party_id], terms=[], locator=f"{currency} ledger",
                    excerpt=f"{_money_numbers(kind, check, currency)}{year} Could be innocent: {check['innocent']}. "
                            f"Lead idea: {check['lead_idea']}.",
                    first_seen_at=utcnow_naive())
    db.add(row)
    db.commit()
    return row


def decide(db: Session, row: CheckItem, status: str, note: str | None) -> None:
    allowed = MISSING_STATUSES if row.kind == "missing" else STATUSES
    if status not in allowed:
        raise ValueError(f"Status is one of {', '.join(allowed)}")
    if row.kind == "missing" and status == "chasing" and not row.lead_id:
        row.lead_id = _lead_for_missing(db, row, note).id
    row.status = status
    row.note = (note or "").strip() or None
    row.decided_at = None if status == "open" else utcnow_naive()
    db.commit()


def _lead_for_missing(db: Session, row: CheckItem, note: str | None) -> Any:
    """Chasing a missing value makes a lead pointing at the record it is missing from."""
    from app.patterns.missing import rule_name
    from app.schemas.api import LeadCreate, LeadLinkCreate
    from app.services.leads import create_lead, create_lead_link

    lead = create_lead(db, LeadCreate(investigation_id=row.investigation_id, title=f"Find: {row.question}"[:500],
                                      detail=f"Missing value ({rule_name(row.indicator_id)}) on {row.excerpt}. {row.blocks or ''}"
                                             + (f" Note: {note.strip()}" if note and note.strip() else ""),
                                      provider="missing_values", provider_record_id=row.id))
    field = {"entity": "entity_id", "relationship": "relationship_id", "evidence": "evidence_id", "claim": "claim_id", "source": "source_id"}.get(row.record_type or "")
    if field and row.record_id:
        create_lead_link(db, lead, LeadLinkCreate(**{field: row.record_id}, note="The record the value is missing from"))
    for party in row.parties or []:
        if field != "entity_id" or party != row.record_id:
            create_lead_link(db, lead, LeadLinkCreate(entity_id=party, note="A party on the record"))
    return lead


def serialize_missing(row: CheckItem, names: dict[str, tuple[str, str]]) -> dict[str, Any]:
    from app.patterns.missing import rule_name

    return {
        "id": row.id, "rule": row.indicator_id, "rule_name": rule_name(row.indicator_id), "question": row.question, "record_label": row.excerpt or "",
        "record_type": row.record_type or "", "record_id": row.record_id or "", "blocks": row.blocks or "", "status": row.status, "note": row.note,
        "lead_id": row.lead_id, "decided_at": row.decided_at, "first_seen_at": row.first_seen_at, "gone_at": row.gone_at,
        "parties": [{"id": p, "name": names.get(p, (p, ""))[0], "schema": names.get(p, ("", "Thing"))[1]} for p in row.parties],
    }


def serialize(row: CheckItem, names: dict[str, tuple[str, str]], indicator_names: dict[str, str],
              documents: dict[str, str], flags_on_parties: dict[str, list[str]]) -> dict[str, Any]:
    return {
        "id": row.id, "indicator_id": row.indicator_id, "indicator_name": indicator_names.get(row.indicator_id, row.indicator_id),
        "kind": row.kind, "question": row.question, "status": row.status, "note": row.note, "decided_at": row.decided_at,
        "parties": [{"id": p, "name": names.get(p, (p, ""))[0], "schema": names.get(p, ("", "Thing"))[1]} for p in row.parties],
        "flag_id": row.flag_id,
        "related_flags": sorted({f for p in row.parties for f in flags_on_parties.get(p, [])} - ({row.flag_id} if row.flag_id else set())),
        "document": None if row.document_id is None else {"id": row.document_id, "filename": documents.get(row.document_id, row.document_id)},
        "locator": row.locator, "excerpt": row.excerpt, "terms": list(row.terms or []),
        "first_seen_at": row.first_seen_at, "gone_at": row.gone_at,
    }


def items(db: Session, investigation_id: str) -> dict[str, Any]:
    from app.patterns.engine import _name

    rows = list(db.scalars(select(CheckItem).where(CheckItem.investigation_id == investigation_id)))
    party_ids = {p for r in rows for p in r.parties}
    names = {e.id: (e.caption or e.id, e.schema) for e in db.scalars(select(Entity).where(Entity.id.in_(party_ids)))} if party_ids else {}
    doc_ids = {r.document_id for r in rows if r.document_id}
    documents = {d.id: d.filename for d in db.scalars(select(Document).where(Document.id.in_(doc_ids)))} if doc_ids else {}
    flags_on_parties: dict[str, list[str]] = {}
    for f in db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == investigation_id, PatternFlag.gone_at.is_(None))):
        for p in f.parties:
            flags_on_parties.setdefault(p, []).append(f.id)
    indicator_names = {r.indicator_id: MONEY_KINDS[r.indicator_id][0] if r.kind == "money" and r.indicator_id in MONEY_KINDS
                       else _name(r.indicator_id) for r in rows if r.kind != "missing"}
    order = {"open": 0, "unclear": 1, "chasing": 1, "shows": 2, "does_not": 3}
    missing = sorted((r for r in rows if r.kind == "missing" and r.gone_at is None), key=lambda r: (order.get(r.status, 9), r.indicator_id, r.first_seen_at))
    rows = [r for r in rows if r.kind != "missing"]
    current = sorted((r for r in rows if r.gone_at is None), key=lambda r: (order.get(r.status, 9), r.indicator_id, r.first_seen_at))
    gone = sorted((r for r in rows if r.gone_at is not None), key=lambda r: r.gone_at or r.first_seen_at, reverse=True)
    return {
        "investigation_id": investigation_id,
        "items": [serialize(r, names, indicator_names, documents, flags_on_parties) for r in current],
        "gone": [serialize(r, names, indicator_names, documents, flags_on_parties) for r in gone],
        "missing": [serialize_missing(r, names) for r in missing],
    }
