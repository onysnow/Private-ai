"""The kitchen: a fixed catalogue of read-only queries that turn an order
slip into chart-ready numbers, each tagged with the records it came from.

Every query here is scoped to one investigation, reads canonical records
only, and returns rows in a canonical (sorted) order, so the same records
give the same rows whatever order the database handed them back in. The
AI never sees this code: it sees `describe_catalog()`, the menu, and writes
a query name and parameters (app/visuals/spec.py).

Rules kept here:

* A value is a sum or a count of real records, never an estimate. Records
  the query could not use (a payment with no amount, an event dated only to
  the year when months were asked for) are listed under ``omitted`` with the
  reason, never guessed at.
* Currencies are never added together (design rule 19). A payments query
  returns one currency; the others are reported in ``omitted`` so the
  checker can say they were left out.
* Every row carries ``record_refs``, the {record_type, record_id} pairs the
  citation layer already understands, and ``record_count``, how many
  records sit behind the value (design rules 15, 16 and 20).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict, dataclass, field
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Claim, ClaimEvidenceLink, Document, Entity, Investigation, Lead, RelationshipEdge
from app.visuals.spec import DRAWN_KINDS, QUERY_CATALOG, QUESTIONS, ChartKind, QueryRef, QuerySpec

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


@dataclass(frozen=True)
class RecordRef:
    record_type: str
    record_id: str

    def as_dict(self) -> dict[str, str]:
        return {"record_type": self.record_type, "record_id": self.record_id}


@dataclass
class DataRow:
    label: str
    value: float
    record_refs: list[RecordRef]
    record_count: int
    key: str = ""      # what the row is sorted by within its kind: a period for time series, the label otherwise
    x: float | None = None   # the second number of a "pairs" row (a scatter plot's x); `value` is its y
    source: str | None = None   # a "flows" row: who the money came from ...
    target: str | None = None   # ... and who it went to; `label` is "source → target"

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"label": self.label, "value": self.value, "record_refs": [r.as_dict() for r in self.record_refs],
                               "record_count": self.record_count, "key": self.key}
        if self.x is not None:
            # Only pairs rows carry it, so every other row keeps its pass-2 shape.
            out["x"] = self.x
        if self.source is not None and self.target is not None:
            # Likewise only flows rows.
            out["source"], out["target"] = self.source, self.target
        return out


@dataclass
class VisualData:
    """What one query produced for one investigation."""
    investigation_id: str
    query: str
    params: dict[str, str]
    unit: str                 # "USD" for an amount, the record noun for a count
    unit_kind: str            # "amount" | "count"
    series_kind: str          # one of spec.SERIES_KINDS
    record_noun: str
    rows: list[DataRow]
    currency: str | None = None
    record_count: int = 0     # records behind all rows together
    omitted: list[dict[str, Any]] = field(default_factory=list)
    # A "pairs" query's second number (x): its unit and kind, and the names
    # of both numbers ({"x": ..., "y": ...}) for the axes. Empty otherwise.
    x_unit: str | None = None
    x_unit_kind: str | None = None
    measure_labels: dict[str, str] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["rows"] = [row.as_dict() for row in self.rows]
        # Left out when the query has one number, so a stored pass-2 chart and
        # a new one of the same query look the same.
        for key in ("x_unit", "x_unit_kind"):
            if data[key] is None:
                del data[key]
        if not data["measure_labels"]:
            del data["measure_labels"]
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> VisualData:
        rows = [
            DataRow(label=str(r.get("label", "")), value=float(r.get("value", 0)),
                    record_refs=[RecordRef(str(ref["record_type"]), str(ref["record_id"])) for ref in (r.get("record_refs") or [])
                                 if isinstance(ref, dict) and ref.get("record_type") and ref.get("record_id")],
                    record_count=int(r.get("record_count", 0)), key=str(r.get("key", "")),
                    x=float(r["x"]) if isinstance(r.get("x"), (int, float)) and not isinstance(r.get("x"), bool) else None,
                    source=str(r["source"]) if isinstance(r.get("source"), str) and isinstance(r.get("target"), str) else None,
                    target=str(r["target"]) if isinstance(r.get("source"), str) and isinstance(r.get("target"), str) else None)
            for r in (data.get("rows") or []) if isinstance(r, dict)
        ]
        labels = data.get("measure_labels")
        return cls(
            investigation_id=str(data.get("investigation_id", "")), query=str(data.get("query", "")),
            params={str(k): str(v) for k, v in (data.get("params") or {}).items()},
            unit=str(data.get("unit", "")), unit_kind=str(data.get("unit_kind", "count")),
            series_kind=str(data.get("series_kind", "category")), record_noun=str(data.get("record_noun", "records")),
            # A currency is a code like "USD"; anything else a stored chart carries is dropped.
            rows=rows, currency=data.get("currency") if isinstance(data.get("currency"), str) else None,
            record_count=int(data.get("record_count", 0)),
            omitted=[o for o in (data.get("omitted") or []) if isinstance(o, dict)],
            x_unit=str(data["x_unit"]) if data.get("x_unit") is not None else None,
            x_unit_kind=str(data["x_unit_kind"]) if data.get("x_unit_kind") is not None else None,
            measure_labels={str(k): str(v) for k, v in labels.items()} if isinstance(labels, dict) else {},
        )

    @property
    def catalog_entry(self) -> QuerySpec:
        return QUERY_CATALOG[self.query]


class QueryError(ValueError):
    """The order named a query or parameter the kitchen cannot cook."""


# --- helpers -----------------------------------------------------------------

def _humanize(value: str) -> str:
    return value.replace("_", " ").strip().capitalize() or "Unknown"


def period_key(date_text: str | None, granularity: str) -> str | None:
    """'2023-11-14' -> '2023-11' (month) or '2023' (year); None when the
    date is not known finely enough for the granularity asked for."""
    text = (date_text or "").strip()
    if len(text) < 4 or not text[:4].isdigit():
        return None
    if granularity == "year":
        return text[:4]
    if len(text) >= 7 and text[4] == "-" and text[5:7].isdigit():
        return text[:7]
    return None


def period_label(key: str) -> str:
    if len(key) == 7:
        try:
            return f"{_MONTHS[int(key[5:7]) - 1]} {key[:4]}"
        except (ValueError, IndexError):
            return key
    return key


def _fill_periods(rows: dict[str, DataRow], granularity: str) -> list[DataRow]:
    """Every period between the first and the last, so a quiet month shows as
    zero instead of vanishing (rule 7: evenly spaced ticks)."""
    if not rows:
        return []
    keys = sorted(rows)
    out: list[DataRow] = []
    if granularity == "year":
        for year in range(int(keys[0]), int(keys[-1]) + 1):
            key = str(year)
            out.append(rows.get(key) or DataRow(period_label(key), 0.0, [], 0, key))
        return out
    year, month = int(keys[0][:4]), int(keys[0][5:7])
    last_year, last_month = int(keys[-1][:4]), int(keys[-1][5:7])
    while (year, month) <= (last_year, last_month):
        key = f"{year:04d}-{month:02d}"
        out.append(rows.get(key) or DataRow(period_label(key), 0.0, [], 0, key))
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return out


def _category_rows(groups: dict[str, list[RecordRef]], *, labels: dict[str, str] | None = None) -> list[DataRow]:
    """One row per group, counting distinct records; sorted largest first,
    then by label, so the order never depends on insertion order."""
    rows = []
    for key, refs in groups.items():
        distinct = sorted(set(refs), key=lambda r: (r.record_type, r.record_id))
        label = (labels or {}).get(key, key)
        rows.append(DataRow(label, float(len(distinct)), distinct, len(distinct), key))
    rows.sort(key=lambda r: (-r.value, r.label.lower(), r.key))
    return rows


def _pick_currency(by_currency: dict[str, list[dict]], wanted: str | None) -> tuple[str | None, list[dict[str, Any]]]:
    """The currency to chart and the ones left out (rule 19: never mixed)."""
    if not by_currency:
        return wanted, []
    if wanted is None:
        # Most payments first; alphabetical on a tie, so the choice is stable.
        wanted = sorted(by_currency, key=lambda c: (-len(by_currency[c]), c))[0]
    omitted = [
        {"reason": "other currency", "currency": code, "record_count": len(rows),
         "detail": f"{len(rows)} payment(s) in {code} not shown; ask for currency={code} to chart them"}
        for code, rows in sorted(by_currency.items()) if code != wanted
    ]
    return wanted, omitted


def _ledger(db: Session, investigation_id: str, currency: str | None) -> tuple[list[dict], str | None, list[dict[str, Any]]]:
    from app.services.financial_flows import investigation_financial_ledger

    ledger = investigation_financial_ledger(db, investigation_id)
    omitted: list[dict[str, Any]] = [
        {"reason": "incomplete payment", "record_type": "relationship", "record_id": row["id"], "detail": "; ".join(row.get("problems") or [])}
        for row in ledger["incomplete"]
    ]
    by_currency: dict[str, list[dict]] = defaultdict(list)
    for tx in ledger["transactions"]:
        by_currency[tx["currency"]].append(tx)
    chosen, other = _pick_currency(by_currency, currency)
    omitted.extend(other)
    return list(by_currency.get(chosen or "", [])), chosen, omitted


# --- the queries ----------------------------------------------------------------

def payments_by_party(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    transactions, currency, omitted = _ledger(db, investigation_id, params.get("currency"))
    received = params.get("direction", "received") == "received"
    totals: dict[str, float] = defaultdict(float)
    refs: dict[str, list[RecordRef]] = defaultdict(list)
    labels: dict[str, str] = {}
    for tx in transactions:
        party_id = tx["to_entity_id"] if received else tx["from_entity_id"]
        labels[party_id] = (tx["to"] if received else tx["from"]) or party_id
        totals[party_id] += float(tx["amount"])
        refs[party_id].append(RecordRef("relationship", tx["relationship_id"]))
    rows = [DataRow(labels[pid], round(totals[pid], 2), sorted(set(refs[pid]), key=lambda r: r.record_id), len(refs[pid]), labels[pid])
            for pid in totals]
    rows.sort(key=lambda r: (-r.value, r.label.lower()))
    return VisualData(
        investigation_id=investigation_id, query="payments_by_party", params=params,
        unit=currency or "", unit_kind="amount", series_kind="category", record_noun="payments",
        rows=rows, currency=currency, record_count=len(transactions), omitted=omitted,
    )


def payment_amounts(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    """One row per payment: its amount, resting on that one Payment record.
    A histogram bins these values (app/visuals/stats.py); a bar chart ranks
    them. Labels name the payer, the beneficiary and the date, and are made
    unique ("#2", "#3") when two payments would read the same, so every row
    can be told apart on a chart and in its data table."""
    transactions, currency, omitted = _ledger(db, investigation_id, params.get("currency"))
    ordered = sorted(transactions, key=lambda t: (t.get("dateTime") or "", t.get("from") or "", t.get("to") or "", float(t["amount"]), t["relationship_id"]))
    rows: list[DataRow] = []
    seen: dict[str, int] = defaultdict(int)
    for tx in ordered:
        base = f"{tx['from'] or tx['from_entity_id']} → {tx['to'] or tx['to_entity_id']}, {tx.get('dateTime') or 'undated'}"
        seen[base] += 1
        label = base if seen[base] == 1 else f"{base} #{seen[base]}"
        rows.append(DataRow(label, round(float(tx["amount"]), 2), [RecordRef("relationship", tx["relationship_id"])], 1, label))
    rows.sort(key=lambda r: (-r.value, r.label.lower()))
    return VisualData(
        investigation_id=investigation_id, query="payment_amounts", params=params,
        unit=currency or "", unit_kind="amount", series_kind="distribution", record_noun="payments",
        rows=rows, currency=currency, record_count=len(rows), omitted=omitted,
    )


def payments_count_and_total_by_party(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    """For each party, how many payments it received (or made) and their
    total: x is the number of Payment records, y (`value`) their sum in one
    currency. The records behind a row are exactly the payments counted."""
    transactions, currency, omitted = _ledger(db, investigation_id, params.get("currency"))
    received = params.get("direction", "received") == "received"
    totals: dict[str, float] = defaultdict(float)
    refs: dict[str, list[RecordRef]] = defaultdict(list)
    labels: dict[str, str] = {}
    for tx in transactions:
        party_id = tx["to_entity_id"] if received else tx["from_entity_id"]
        labels[party_id] = (tx["to"] if received else tx["from"]) or party_id
        totals[party_id] += float(tx["amount"])
        refs[party_id].append(RecordRef("relationship", tx["relationship_id"]))
    rows = [DataRow(labels[pid], round(totals[pid], 2), sorted(set(refs[pid]), key=lambda r: r.record_id), len(refs[pid]), labels[pid],
                    x=float(len(refs[pid])))
            for pid in totals]
    rows.sort(key=lambda r: (-r.value, r.label.lower()))
    verb = "received" if received else "paid"
    return VisualData(
        investigation_id=investigation_id, query="payments_count_and_total_by_party", params=params,
        unit=currency or "", unit_kind="amount", series_kind="pairs", record_noun="payments",
        rows=rows, currency=currency, record_count=len(transactions), omitted=omitted,
        x_unit="payments", x_unit_kind="count",
        measure_labels={"x": f"Number of payments {verb}", "y": f"Total {verb}" + (f" ({currency})" if currency else "")},
    )


def payment_flows(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    """How much went from each payer to each recipient, in one currency: one
    row per (payer, recipient) pair, totalling their Payment records, which
    are the row's records. Parties are named as the ledger names them; two
    parties that share a name are told apart by their record id, since a
    flow diagram joins its ends by name."""
    transactions, currency, omitted = _ledger(db, investigation_id, params.get("currency"))
    names: dict[str, str] = {}
    for tx in transactions:
        for side in ("from", "to"):
            names.setdefault(tx[f"{side}_entity_id"], tx[side] or tx[f"{side}_entity_id"])
    taken: dict[str, list[str]] = defaultdict(list)
    for entity_id, name in sorted(names.items()):
        taken[name].append(entity_id)
    shown = {entity_id: (name if len(taken[name]) == 1 else f"{name} ({entity_id[:8]})") for entity_id, name in names.items()}
    totals: dict[tuple[str, str], float] = defaultdict(float)
    refs: dict[tuple[str, str], list[RecordRef]] = defaultdict(list)
    for tx in transactions:
        pair = (tx["from_entity_id"], tx["to_entity_id"])
        totals[pair] += float(tx["amount"])
        refs[pair].append(RecordRef("relationship", tx["relationship_id"]))
    rows = []
    for (payer, recipient), total in totals.items():
        source, target = shown[payer], shown[recipient]
        label = f"{source} → {target}"
        rows.append(DataRow(label, round(total, 2), sorted(set(refs[(payer, recipient)]), key=lambda r: r.record_id),
                            len(refs[(payer, recipient)]), label, source=source, target=target))
    rows.sort(key=lambda r: (-r.value, r.label.lower()))
    return VisualData(
        investigation_id=investigation_id, query="payment_flows", params=params,
        unit=currency or "", unit_kind="amount", series_kind="flows", record_noun="payments",
        rows=rows, currency=currency, record_count=len(transactions), omitted=omitted,
    )


def payments_over_time(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    transactions, currency, omitted = _ledger(db, investigation_id, params.get("currency"))
    granularity = params.get("granularity", "month")
    periods: dict[str, DataRow] = {}
    used = 0
    for tx in sorted(transactions, key=lambda t: t["relationship_id"]):
        key = period_key(tx.get("dateTime"), granularity)
        if key is None:
            omitted.append({"reason": "date not known to the " + granularity, "record_type": "relationship",
                            "record_id": tx["relationship_id"], "detail": f"date {tx.get('dateTime') or 'missing'}"})
            continue
        row = periods.get(key) or DataRow(period_label(key), 0.0, [], 0, key)
        row.value = round(row.value + float(tx["amount"]), 2)
        row.record_refs.append(RecordRef("relationship", tx["relationship_id"]))
        row.record_count += 1
        periods[key] = row
        used += 1
    return VisualData(
        investigation_id=investigation_id, query="payments_over_time", params=params,
        unit=currency or "", unit_kind="amount", series_kind="time", record_noun="payments",
        rows=_fill_periods(periods, granularity), currency=currency, record_count=used, omitted=omitted,
    )


def _event_refs(db: Session, event: dict) -> list[RecordRef]:
    """The citable records behind one timeline event: the event row itself
    for a reporter-authored event, otherwise the record whose date it is."""
    refs = event.get("refs") or {}
    if event.get("kind") == "reporter_event":
        return [RecordRef("timeline_event", str(event["id"]))]
    out: list[RecordRef] = []
    if refs.get("relationship_entity_id"):
        edge = db.scalar(select(RelationshipEdge).where(RelationshipEdge.relationship_entity_id == refs["relationship_entity_id"]))
        if edge is not None:
            out.append(RecordRef("relationship", edge.id))
    elif refs.get("entity_id"):
        out.append(RecordRef("entity", str(refs["entity_id"])))
    for key, record_type in (("evidence_id", "evidence"), ("source_id", "source"), ("claim_id", "claim"), ("lead_id", "lead")):
        if refs.get(key):
            out.append(RecordRef(record_type, str(refs[key])))
    return out


def events_over_time(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    from app.services.timeline import investigation_timeline

    granularity = params.get("granularity", "month")
    events = investigation_timeline(db, investigation_id)["events"]
    periods: dict[str, DataRow] = {}
    omitted: list[dict[str, Any]] = []
    used = 0
    for event in sorted(events, key=lambda e: str(e["id"])):
        key = period_key(event.get("date_start"), granularity)
        if key is None:
            omitted.append({"reason": "date not known to the " + granularity, "record_type": "timeline_event" if event.get("kind") == "reporter_event" else event.get("kind"),
                            "record_id": str(event["id"]), "detail": f"{event.get('title')}: {event.get('date_start')}"})
            continue
        row = periods.get(key) or DataRow(period_label(key), 0.0, [], 0, key)
        row.value += 1
        row.record_count += 1
        for ref in _event_refs(db, event):
            if ref not in row.record_refs:
                row.record_refs.append(ref)
        periods[key] = row
        used += 1
    for row in periods.values():
        row.record_refs.sort(key=lambda r: (r.record_type, r.record_id))
    return VisualData(
        investigation_id=investigation_id, query="events_over_time", params=params,
        unit="events", unit_kind="count", series_kind="time", record_noun="events",
        rows=_fill_periods(periods, granularity), record_count=used, omitted=omitted,
    )


def links_by_type(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    from app.services.relationships import RELATIONSHIP_SCHEMAS, investigation_relationships

    groups: dict[str, list[RecordRef]] = defaultdict(list)
    rows_in = investigation_relationships(db, investigation_id, include_reconciled_duplicates=False)
    for row in rows_in:
        groups[row["schema"]].append(RecordRef("relationship", row["id"]))
    labels = {schema: info["label"] for schema, info in RELATIONSHIP_SCHEMAS.items()}
    rows = _category_rows(groups, labels=labels)
    return VisualData(investigation_id=investigation_id, query="links_by_type", params=params, unit="links", unit_kind="count",
                      series_kind="category", record_noun="links", rows=rows, record_count=len(rows_in))


def claims_by_status(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    groups: dict[str, list[RecordRef]] = defaultdict(list)
    claims = db.scalars(select(Claim).where(Claim.investigation_id == investigation_id)).all()
    for claim in claims:
        groups[claim.status or "unknown"].append(RecordRef("claim", claim.id))
    rows = _category_rows(groups, labels={k: _humanize(k) for k in groups})
    return VisualData(investigation_id=investigation_id, query="claims_by_status", params=params, unit="claims", unit_kind="count",
                      series_kind="category", record_noun="claims", rows=rows, record_count=len(claims))


def entities_by_schema(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    # Relationship entities (the FtM interstitials behind each edge) are
    # links, not things; merged entities live on in their target.
    link_entities = set(db.scalars(select(RelationshipEdge.relationship_entity_id).where(RelationshipEdge.investigation_id == investigation_id)).all())
    groups: dict[str, list[RecordRef]] = defaultdict(list)
    counted = 0
    for entity in db.scalars(select(Entity).where(Entity.investigation_id == investigation_id)).all():
        if entity.id in link_entities or entity.merged_into_entity_id:
            continue
        groups[entity.schema].append(RecordRef("entity", entity.id))
        counted += 1
    rows = _category_rows(groups)
    return VisualData(investigation_id=investigation_id, query="entities_by_schema", params=params, unit="entities", unit_kind="count",
                      series_kind="category", record_noun="entities", rows=rows, record_count=counted)


def evidence_by_stance(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    groups: dict[str, list[RecordRef]] = defaultdict(list)
    links = db.execute(
        select(ClaimEvidenceLink.stance, ClaimEvidenceLink.evidence_id)
        .join(Claim, Claim.id == ClaimEvidenceLink.claim_id)
        .where(Claim.investigation_id == investigation_id)
    ).all()
    seen: set[str] = set()
    for stance, evidence_id in links:
        groups[stance or "unknown"].append(RecordRef("evidence", evidence_id))
        seen.add(evidence_id)
    rows = _category_rows(groups, labels={k: _humanize(k) for k in groups})
    return VisualData(investigation_id=investigation_id, query="evidence_by_stance", params=params, unit="evidence records", unit_kind="count",
                      series_kind="category", record_noun="evidence records", rows=rows, record_count=len(seen))


def documents_by_status(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    groups: dict[str, list[RecordRef]] = defaultdict(list)
    documents = db.scalars(select(Document).where(Document.investigation_id == investigation_id)).all()
    for document in documents:
        groups[document.extraction_status or "unknown"].append(RecordRef("document", document.id))
    rows = _category_rows(groups, labels={k: _humanize(k) for k in groups})
    return VisualData(investigation_id=investigation_id, query="documents_by_status", params=params, unit="documents", unit_kind="count",
                      series_kind="category", record_noun="documents", rows=rows, record_count=len(documents))


def leads_by_status(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    groups: dict[str, list[RecordRef]] = defaultdict(list)
    leads = db.scalars(select(Lead).where(Lead.investigation_id == investigation_id)).all()
    for lead in leads:
        groups[lead.status or "unknown"].append(RecordRef("lead", lead.id))
    rows = _category_rows(groups, labels={k: _humanize(k) for k in groups})
    return VisualData(investigation_id=investigation_id, query="leads_by_status", params=params, unit="leads", unit_kind="count",
                      series_kind="category", record_noun="leads", rows=rows, record_count=len(leads))


QueryRunner = Callable[[Session, str, dict[str, str]], VisualData]

QUERIES: dict[str, QueryRunner] = {
    "payments_by_party": payments_by_party,
    "payments_over_time": payments_over_time,
    "events_over_time": events_over_time,
    "links_by_type": links_by_type,
    "claims_by_status": claims_by_status,
    "entities_by_schema": entities_by_schema,
    "evidence_by_stance": evidence_by_stance,
    "documents_by_status": documents_by_status,
    "leads_by_status": leads_by_status,
    "payment_amounts": payment_amounts,
    "payments_count_and_total_by_party": payments_count_and_total_by_party,
    "payment_flows": payment_flows,
}

# The menu and the kitchen must agree, or an order could name a dish nobody cooks.
_missing = set(QUERY_CATALOG) ^ set(QUERIES)
assert not _missing, f"QUERY_CATALOG and QUERIES disagree on: {sorted(_missing)}"


def run_query(db: Session, investigation_id: str, query: QueryRef) -> VisualData:
    """Run one catalogued query for one investigation. Raises QueryError for
    an unknown investigation; the query and params were validated by the
    spec, so a wrong name here is a programming error."""
    if db.get(Investigation, investigation_id) is None:
        raise QueryError("Investigation not found")
    runner = QUERIES.get(query.name)
    if runner is None:
        raise QueryError(f"unknown query {query.name!r}")
    return runner(db, investigation_id, query.resolved_params())


def describe_catalog(db: Session, investigation_id: str) -> dict[str, Any]:
    """The menu the AI and the chart builder see: every query, its
    parameters, whether this investigation has data for it (each query is
    run once with its defaults), the kinds that can draw it and the
    questions it answers; the questions (FT Visual Vocabulary) with the
    kinds that answer each; all chart kinds, and which can be drawn today."""
    if db.get(Investigation, investigation_id) is None:
        raise QueryError("Investigation not found")
    queries = []
    for name, spec in QUERY_CATALOG.items():
        data = QUERIES[name](db, investigation_id, QueryRef(name=name).resolved_params())
        currencies = sorted({str(o["currency"]) for o in data.omitted if o.get("reason") == "other currency"} | ({data.currency} if data.currency else set()))
        queries.append({
            "name": name, "label": spec.label, "description": spec.description,
            "params": {key: {"description": p.description, "choices": list(p.choices) if p.choices else None, "default": p.default}
                       for key, p in spec.params.items()},
            "series_kind": spec.series_kind, "unit_kind": spec.unit_kind, "record_noun": spec.record_noun,
            "has_data": any(row.value for row in data.rows), "record_count": data.record_count,
            "row_count": len(data.rows), "currencies": currencies,
            "kinds": [kind.value for kind in spec.kinds if kind in DRAWN_KINDS],
            "questions": list(spec.questions),
        })
    return {
        "investigation_id": investigation_id,
        "queries": queries,
        "questions": [
            {"id": q.id, "label": q.label, "description": q.description, "kinds": [k.value for k in q.kinds],
             "drawn_kinds": [k.value for k in q.kinds if k in DRAWN_KINDS],
             "queries": [name for name, spec in QUERY_CATALOG.items() if spec.series_kind in q.series_kinds]}
            for q in QUESTIONS.values()
        ],
        "kinds": [kind.value for kind in ChartKind],
        "drawn_kinds": sorted(kind.value for kind in DRAWN_KINDS),
    }
