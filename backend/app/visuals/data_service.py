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

import calendar
import re
from collections import defaultdict
from contextvars import ContextVar
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Claim, ClaimEvidenceLink, Document, Entity, Investigation, Lead, RelationshipEdge
from app.visuals.spec import DRAWN_KINDS, QUERY_CATALOG, QUESTIONS, ChartKind, QueryRef, QuerySpec

# While the catalogue runs every query, the money ledger and the timeline are built once and shared: five queries
# read the ledger and three the timeline, and each build walks every relationship. Outside the catalogue nothing is kept.
_shared: ContextVar[dict[Any, Any] | None] = ContextVar("visual_shared", default=None)


def _once(key: Any, build: Callable[[], Any]) -> Any:
    memo = _shared.get()
    if memo is None:
        return build()
    if key not in memo:
        memo[key] = build()
    return memo[key]

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
    start: str | None = None    # an "events" row: its date as recorded (a year, a month or a day) ...
    end: str | None = None      # ... the date it ended, when it has one ...
    status: str | None = None   # ... and how far it is verified (app/services/timeline.py) ...
    grade: str | None = None    # ... and, once graded, how well it is substantiated (Bellingcat's scale)
    latitude: float | None = None    # a "places" row: where its record puts it
    longitude: float | None = None
    across: str | None = None        # a "grid" row: its column (an evidence grade) ...
    down: str | None = None          # ... and its row (an agreement grade)
    # A "places" row: the dated events at the place, each an "events" row,
    # earliest first (for the map with its timeline beside it).
    events: list[DataRow] | None = None
    # A "pictures" row: the uploaded picture (a document) its evidence record
    # is; `start` is the date it was taken.
    picture: str | None = None

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"label": self.label, "value": self.value, "record_refs": [r.as_dict() for r in self.record_refs],
                               "record_count": self.record_count, "key": self.key}
        if self.x is not None:
            # Only pairs rows carry it, so every other row keeps its pass-2 shape.
            out["x"] = self.x
        if self.source is not None and self.target is not None:
            # Likewise only flows rows.
            out["source"], out["target"] = self.source, self.target
        if self.start is not None:
            # And only events rows (an end only when the event has one), and
            # pictures rows, whose date taken has no verification status.
            out["start"] = self.start
            if self.status is not None:
                out["status"] = self.status
            if self.end is not None:
                out["end"] = self.end
            if self.grade is not None:
                out["grade"] = self.grade
        if self.latitude is not None and self.longitude is not None:
            # And only places rows.
            out["latitude"], out["longitude"] = self.latitude, self.longitude
            if self.events is not None:
                out["events"] = [event.as_dict() for event in self.events]
        if self.across is not None and self.down is not None:
            # And only grid rows.
            out["across"], out["down"] = self.across, self.down
        if self.picture is not None:
            # And only pictures rows (with the date each was taken, as `start`).
            out["picture"] = self.picture
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
        rows = [_row_from_dict(r) for r in (data.get("rows") or []) if isinstance(r, dict)]
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


def _row_from_dict(r: dict[str, Any]) -> DataRow:
    """One stored row, keeping only the fields its kind of row carries."""
    row = DataRow(label=str(r.get("label", "")), value=float(r.get("value", 0)),
                  record_refs=[RecordRef(str(ref["record_type"]), str(ref["record_id"])) for ref in (r.get("record_refs") or [])
                               if isinstance(ref, dict) and ref.get("record_type") and ref.get("record_id")],
                  record_count=int(r.get("record_count", 0)), key=str(r.get("key", "")),
                  x=float(r["x"]) if isinstance(r.get("x"), (int, float)) and not isinstance(r.get("x"), bool) else None,
                  source=str(r["source"]) if isinstance(r.get("source"), str) and isinstance(r.get("target"), str) else None,
                  target=str(r["target"]) if isinstance(r.get("source"), str) and isinstance(r.get("target"), str) else None,
                  start=str(r["start"]) if isinstance(r.get("start"), str) else None,
                  end=str(r["end"]) if isinstance(r.get("start"), str) and isinstance(r.get("end"), str) else None,
                  status=str(r["status"]) if isinstance(r.get("start"), str) and isinstance(r.get("status"), str) else None,
                  grade=str(r["grade"]) if isinstance(r.get("start"), str) and isinstance(r.get("grade"), str) else None,
                  latitude=_coordinate(r, "latitude"), longitude=_coordinate(r, "longitude"),
                  across=str(r["across"]) if isinstance(r.get("across"), str) and isinstance(r.get("down"), str) else None,
                  down=str(r["down"]) if isinstance(r.get("across"), str) and isinstance(r.get("down"), str) else None)
    if isinstance(r.get("picture"), str):
        row.picture = r["picture"]
    if row.latitude is not None and isinstance(r.get("events"), list):
        row.events = [_row_from_dict(e) for e in r["events"] if isinstance(e, dict) and isinstance(e.get("start"), str)]
    return row


def _coordinate(row: dict[str, Any], name: str) -> float | None:
    """A stored row's latitude or longitude, when it holds both as numbers."""
    pair = (row.get("latitude"), row.get("longitude"))
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in pair):
        return None
    return float(row[name])


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

    ledger = _once(("ledger", investigation_id), lambda: investigation_financial_ledger(db, investigation_id))
    omitted: list[dict[str, Any]] = [
        {"reason": "incomplete payment", "record_type": "relationship", "record_id": row["id"], "detail": "; ".join(row.get("problems") or [])}
        for row in ledger["incomplete"]
    ]
    # An agreed price, a fine or an order is an amount owed, not money that moved (app/services/payment_kinds.py).
    omitted.extend({"reason": "an amount owed, not a payment", "record_type": "relationship", "record_id": row["id"],
                    "detail": f"{row.get('paymentKind')}: {row.get('amount')} {row.get('currency')}"} for row in ledger.get("owed") or [])
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
    events = _once(("timeline", investigation_id, None), lambda: investigation_timeline(db, investigation_id))["events"]
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


_PARTIAL = re.compile(r"^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$")


def date_bounds(text: str | None) -> tuple[date, date, str] | None:
    """The first and last day a recorded date can mean, and how precise it
    is: '2021' -> 1 Jan to 31 Dec 2021 ("year"), '2021-03' -> 1 to 31 March
    ("month"), '2021-03-04' -> that day ("day"). None for anything else. The
    timeline keeps dates at the precision they were recorded at and never
    fills in a missing day (app/services/timeline.py), so neither does a chart
    of it: a date known only to the month covers the month."""
    match = _PARTIAL.match((text or "").strip()[:10])
    if not match:
        return None
    year, month, day = match.groups()
    try:
        if day:
            one = date(int(year), int(month), int(day))
            return one, one, "day"
        if month:
            last = calendar.monthrange(int(year), int(month))[1]
            return date(int(year), int(month), 1), date(int(year), int(month), last), "month"
        return date(int(year), 1, 1), date(int(year), 12, 31), "year"
    except ValueError:
        return None


def event_span(start: str | None, end: str | None) -> tuple[date, date, bool] | None:
    """The days an event covers: from the first day its start can mean to the
    last day its end (or, with no end, its start) can mean, and whether both
    are known to the day. None when the start is not a date, or the end is
    given but is not one."""
    first = date_bounds(start)
    if first is None:
        return None
    if end in (None, ""):
        return first[0], first[1], first[2] == "day"
    last = date_bounds(end)
    if last is None:
        return None
    return first[0], last[1], first[2] == "day" and last[2] == "day"


def _event_rows(db: Session, kept: list[tuple[date, date, dict]]) -> list[DataRow]:
    """One "events" row per timeline event, in date order: the days it
    covers, its verification status and grade, and the records behind it."""
    # A category axis joins rows of the same name, so two events with the same
    # title are told apart by their date, then by their id.
    titles: dict[str, int] = defaultdict(int)
    for _lo, _hi, event in kept:
        titles[str(event.get("title") or "Untitled event").strip() or "Untitled event"] += 1
    rows: list[DataRow] = []
    used: set[str] = set()
    for lo, hi, event in kept:
        title = str(event.get("title") or "Untitled event").strip() or "Untitled event"
        label = title if titles[title] == 1 else f"{title} ({event.get('date_start')})"
        if label in used:
            label = f"{label} [{str(event['id'])[:8]}]"
        used.add(label)
        refs = sorted(set(_event_refs(db, event)), key=lambda r: (r.record_type, r.record_id))
        # One event is one record: its value is 1. The key orders the rows by
        # date, then by title, so events on the same day keep one order.
        rows.append(DataRow(label, 1.0, refs, 1, f"{lo.isoformat()}|{hi.isoformat()}|{label.lower()}|{event['id']}",
                            start=str(event.get("date_start")), end=str(event["date_end"]) if event.get("date_end") else None,
                            status=str(event.get("verification_status") or "asserted"),
                            grade=str(event["grade"]) if event.get("grade") else None))
    rows.sort(key=lambda r: (r.key, r.label))
    return rows


def events_in_order(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    """Every dated event on the investigation's timeline, one row each, in
    date order: its title, its date as recorded, its end when it has one, its
    verification status, and the records behind it (the event itself for a
    reporter's event, otherwise the record whose date it is, and the evidence,
    source, claim or lead it points to). `from` and `to` keep the events that
    overlap that stretch of time; `status` keeps one verification status.
    An event with no usable date, or one that ends before it starts, is
    listed under ``omitted``, never placed by a guess."""
    from app.services.timeline import investigation_timeline

    statuses = {params["status"]} if params.get("status") else None
    events = _once(("timeline", investigation_id, frozenset(statuses) if statuses else None),
                   lambda: investigation_timeline(db, investigation_id, verification_statuses=statuses))["events"]
    window_from = date_bounds(params.get("from"))
    window_to = date_bounds(params.get("to"))
    omitted: list[dict[str, Any]] = []
    kept: list[tuple[date, date, dict]] = []
    for event in sorted(events, key=lambda e: str(e["id"])):
        record_type = "timeline_event" if event.get("kind") == "reporter_event" else str(event.get("kind"))
        span = event_span(event.get("date_start"), event.get("date_end"))
        if span is None:
            omitted.append({"reason": "date not known", "record_type": record_type, "record_id": str(event["id"]),
                            "detail": f"{event.get('title')}: {event.get('date_start') or 'no date'}"
                                      + (f" to {event.get('date_end')}" if event.get("date_end") else "")})
            continue
        lo, hi, _exact = span
        if hi < lo:
            omitted.append({"reason": "ends before it starts", "record_type": record_type, "record_id": str(event["id"]),
                            "detail": f"{event.get('title')}: {event.get('date_start')} to {event.get('date_end')}"})
            continue
        if (window_from and hi < window_from[0]) or (window_to and lo > window_to[1]):
            continue
        kept.append((lo, hi, event))
    rows = _event_rows(db, kept)
    return VisualData(
        investigation_id=investigation_id, query="events_in_order", params=params,
        unit="events", unit_kind="count", series_kind="events", record_noun="events",
        rows=rows, record_count=len(rows), omitted=omitted,
    )


def _place_event_rows(db: Session, place: dict[str, Any], timeline: dict[str, dict]) -> list[DataRow]:
    """The dated events at one place (app/services/places.py: an event about
    the place's record, or about a relationship linking something to it), as
    "events" rows."""
    kept: list[tuple[date, date, dict]] = []
    for at in place.get("events") or []:
        event = timeline.get(str(at["id"]))
        span = event_span(event.get("date_start"), event.get("date_end")) if event else None
        if event is not None and span is not None and span[1] >= span[0]:
            kept.append((span[0], span[1], event))
    return _event_rows(db, kept)


def places_on_map(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    """Every record with a latitude and a longitude, one row each, where its
    record puts it (app/services/places.py: nothing is looked up). A place is
    one record, cited as itself; the records linked to it are context, not
    the source of where it is. Records whose coordinates cannot be used are
    listed under ``omitted`` with why. Each place carries the dated events at
    it, each cited by its own records, for the map with its timeline."""
    from app.services.places import investigation_places
    from app.services.timeline import investigation_timeline

    found = investigation_places(db, investigation_id)
    timeline = {str(event["id"]): event for event in _once(("timeline", investigation_id, None), lambda: investigation_timeline(db, investigation_id))["events"]} if found["places"] else {}
    # Two places of one name are told apart by their record id, as each is
    # named on the map and checked by its name.
    names: dict[str, int] = defaultdict(int)
    for place in found["places"]:
        names[place["caption"]] += 1
    rows = [DataRow(place["caption"] if names[place["caption"]] == 1 else f"{place['caption']} [{place['entity_id'][:8]}]",
                    1.0, [RecordRef("entity", place["entity_id"])], 1, f"{place['caption'].lower()}|{place['entity_id']}",
                    latitude=place["latitude"], longitude=place["longitude"], events=_place_event_rows(db, place, timeline))
            for place in found["places"]]
    rows.sort(key=lambda r: r.key)
    omitted = [{"reason": "coordinates not usable", "record_type": "entity", "record_id": o["entity_id"], "detail": f"{o['caption']}: {o['reason']}"}
               for o in found["omitted"]]
    return VisualData(
        investigation_id=investigation_id, query="places_on_map", params=params,
        unit="places", unit_kind="count", series_kind="places", record_noun="places",
        rows=rows, record_count=len(rows), omitted=omitted,
    )


def pictures_compared(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    """The pictures held as evidence (an evidence record with a picture
    document) with the date each was taken, earliest first, each one record
    cited as itself. `before` and `after` keep the two to compare, in that
    order; a picture with no date, or none of this investigation, cannot be
    one of them. A picture with no date is listed under ``omitted``."""
    from app.models.domain import Evidence, Source

    pictures = db.execute(select(Evidence, Source).join(Source, Evidence.source_id == Source.id).where(
        Source.investigation_id == investigation_id, Evidence.document_id.is_not(None)).order_by(Evidence.id)).all()
    omitted: list[dict[str, Any]] = []
    dated: dict[str, tuple[date, Evidence, Source]] = {}
    for evidence, source in pictures:
        bounds = date_bounds(evidence.captured_on)
        if bounds is None:
            omitted.append({"reason": "date not known", "record_type": "evidence", "record_id": evidence.id,
                            "detail": f"{evidence.quote or source.title}: no date taken recorded"})
            continue
        dated[evidence.id] = (bounds[0], evidence, source)
    picked = [params[key] for key in ("before", "after") if params.get(key)]
    if picked:
        if len(picked) != 2:
            raise QueryError("pictures_compared needs both before and after, or neither")
        missing = [i for i in picked if i not in dated]
        if missing:
            raise QueryError(f"no dated picture of this investigation has the evidence id {missing[0]}")
        chosen = [dated[i] for i in picked]
    else:
        chosen = sorted(dated.values(), key=lambda item: (item[0], item[1].id))
    captions = [str(evidence.quote or source.title).strip() for _day, evidence, source in chosen]
    rows: list[DataRow] = []
    for (day, evidence, _source), caption in zip(chosen, captions):
        label = caption if captions.count(caption) == 1 else f"{caption} ({evidence.captured_on})"
        if any(row.label == label for row in rows):
            label = f"{label} [{evidence.id[:8]}]"
        rows.append(DataRow(label, 1.0, [RecordRef("evidence", evidence.id)], 1, f"{day.isoformat()}|{evidence.id}",
                            start=evidence.captured_on, picture=evidence.document_id))
    return VisualData(investigation_id=investigation_id, query="pictures_compared", params=params, unit="pictures", unit_kind="count",
                      series_kind="pictures", record_noun="pictures", rows=rows, record_count=len(rows), omitted=omitted)


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


def claims_by_strength(db: Session, investigation_id: str, params: dict[str, str]) -> VisualData:
    """The claims on the IPCC AR5 evidence-by-agreement grid (ADR-0005,
    line 5; app/services/claims.py): one row per cell, every cell present
    (an empty cell too: its place on the grid is what it says), evidence
    across from limited to robust and agreement from low to high, each with
    the claims the reporter graded there. A claim not graded yet is left out
    and listed under ``omitted``."""
    from app.services.claims import AGREEMENT_GRADES, EVIDENCE_GRADES

    cells: dict[tuple[str, str], list[RecordRef]] = {(e, a): [] for e in EVIDENCE_GRADES for a in AGREEMENT_GRADES}
    omitted: list[dict[str, Any]] = []
    claims = db.scalars(select(Claim).where(Claim.investigation_id == investigation_id).order_by(Claim.created_at, Claim.id)).all()
    for claim in claims:
        cell = (claim.evidence_grade or "", claim.agreement_grade or "")
        if cell in cells:
            cells[cell].append(RecordRef("claim", claim.id))
        else:
            omitted.append({"reason": "not graded", "record_type": "claim", "record_id": claim.id, "detail": claim.text[:120]})
    rows = [DataRow(f"{evidence} evidence, {agreement} agreement", float(len(refs)), refs, len(refs), f"{i}{j}", across=evidence, down=agreement)
            for i, evidence in enumerate(EVIDENCE_GRADES) for j, agreement in enumerate(AGREEMENT_GRADES)
            for refs in [cells[(evidence, agreement)]]]
    return VisualData(investigation_id=investigation_id, query="claims_by_strength", params=params, unit="claims", unit_kind="count",
                      series_kind="grid", record_noun="claims", rows=rows, record_count=sum(len(r) for r in cells.values()), omitted=omitted)


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
    "events_in_order": events_in_order,
    "places_on_map": places_on_map,
    "pictures_compared": pictures_compared,
    "claims_by_strength": claims_by_strength,
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
    token = _shared.set({})
    try:
        ran = {name: QUERIES[name](db, investigation_id, QueryRef(name=name).resolved_params()) for name in QUERY_CATALOG}
    finally:
        _shared.reset(token)
    for name, spec in QUERY_CATALOG.items():
        data = ran[name]
        currencies = sorted({str(o["currency"]) for o in data.omitted if o.get("reason") == "other currency"} | ({data.currency} if data.currency else set()))
        queries.append({
            "name": name, "label": spec.label, "description": spec.description,
            "params": {key: {"description": p.description, "choices": list(p.choices) if p.choices else None, "default": p.default}
                       for key, p in spec.params.items()},
            "series_kind": spec.series_kind, "unit_kind": spec.unit_kind, "record_noun": spec.record_noun,
            # Two pictures make a pair; one is nothing to compare.
            "has_data": len(data.rows) >= 2 if spec.series_kind == "pictures" else any(row.value for row in data.rows),
            "record_count": data.record_count,
            "row_count": len(data.rows), "currencies": currencies,
            "kinds": [kind.value for kind in spec.kinds if kind in DRAWN_KINDS],
            "questions": list(spec.questions),
            **({"picks": [{"evidence_id": row.record_refs[0].record_id, "caption": row.label, "taken": row.start}
                          for row in data.rows]} if spec.series_kind == "pictures" else {}),
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
