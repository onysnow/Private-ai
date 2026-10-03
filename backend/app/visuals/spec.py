"""The order slip: what the AI may ask a chart to show.

A VisualSpec names a chart kind, a title that states the finding, and one
query from the fixed catalogue below, with that query's parameters. It never
carries a number. Every value a chart shows comes from the data service
running the named query against the investigation's own records
(app/visuals/data_service.py), so a number with no record behind it cannot
exist (design doc, "What the AI's order looks like").

The catalogue of queries is declared here, beside the spec, so the spec can
refuse an unknown query name or a bad parameter with a plain message
before anything touches the database. The code that runs each query lives
in data_service.py and must cover every entry in QUERY_CATALOG.

Pass 2 drew bar and column charts end to end; pass 3 draws the statistical
kinds (line, area, 100% bar, donut, treemap, histogram, scatter); pass 4
draws money flows (sankey) and the timeline of events; pass 5 draws places
on a map. DRAWN_KINDS says which kinds can be drawn today.

QUESTIONS is the chart chooser: the question a chart answers, after the
FT Visual Vocabulary (https://ft-interactive.github.io/visual-vocabulary/),
which sorts chart forms by the relationship in the data they show. A
question names the kinds that answer it and the query shapes (`series_kind`)
that hold that relationship, so the AI and the chart builder pick the chart
by the question first, as the design doc's chooser does.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from app.services.presentation_style import DEFAULT_THEME, THEMES


class ChartKind(str, Enum):
    bar = "bar"                      # horizontal, ranked
    column = "column"                # vertical, in time order or as ranked
    line = "line"
    area = "area"
    stacked_bar_100 = "stacked_bar_100"
    donut = "donut"
    treemap = "treemap"
    histogram = "histogram"
    scatter = "scatter"
    timeline = "timeline"
    sankey = "sankey"
    map = "map"                      # places on the self-hosted base map (pass 5)


# What app/visuals/echarts.py draws. The sankey and the timeline came with
# pass 4, the map with pass 5 (drawn by MapLibre, not ECharts: the option
# carries the places, and the app and the render service draw them on the
# self-hosted base map; ADR-0005, line 18).
DRAWN_KINDS: frozenset[ChartKind] = frozenset({
    ChartKind.bar, ChartKind.column, ChartKind.line, ChartKind.area, ChartKind.stacked_bar_100, ChartKind.donut,
    ChartKind.treemap, ChartKind.histogram, ChartKind.scatter, ChartKind.sankey, ChartKind.timeline, ChartKind.map,
})

# Kinds that show a value as a length (rule 9: the easiest to read) ...
LENGTH_KINDS: frozenset[ChartKind] = frozenset({ChartKind.bar, ChartKind.column, ChartKind.histogram})
# ... as an area or angle, where a negative value has no honest picture (rule 3) ...
SIZE_KINDS: frozenset[ChartKind] = frozenset({ChartKind.donut, ChartKind.treemap, ChartKind.stacked_bar_100, ChartKind.area, ChartKind.sankey})
# ... as a line joining the points, which only makes sense along an ordered axis (rule 8).
LINE_KINDS: frozenset[ChartKind] = frozenset({ChartKind.line, ChartKind.area})
# Kinds whose categories each get their own colour (rule 10 counts them).
COLOUR_PER_CATEGORY_KINDS: frozenset[ChartKind] = frozenset({ChartKind.donut, ChartKind.treemap, ChartKind.stacked_bar_100})
# Kinds that show parts of one whole: the parts must not overlap (rule 4)
# and their shares must add up to 100% (rule 5).
PART_OF_WHOLE_KINDS: frozenset[ChartKind] = COLOUR_PER_CATEGORY_KINDS
# Kinds that may be stacked (rule 4).
STACKABLE_KINDS: frozenset[ChartKind] = frozenset({ChartKind.bar, ChartKind.column, ChartKind.area, ChartKind.stacked_bar_100})
# Kinds whose zero baseline is part of the picture (rule 1: bars and areas).
ZERO_BASELINE_KINDS: frozenset[ChartKind] = frozenset({ChartKind.bar, ChartKind.column, ChartKind.histogram, ChartKind.area, ChartKind.stacked_bar_100})
# Kinds drawn as marks along axes (points), where values are not written on
# every mark: record counts go in each point's tooltip and the data table.
POINT_KINDS: frozenset[ChartKind] = frozenset({ChartKind.line, ChartKind.area, ChartKind.scatter})

# What a query's rows are, and which kinds can draw them. "category": one
# row per group (ranked or compared); "time": one row per period, in
# order; "distribution": one row per record, whose values a histogram bins;
# "pairs": one row per group with two numbers, x and y, for a scatter plot;
# "flows": one row per pair of parties, from one (`source`) to the other
# (`target`), for a flow diagram, or ranked as bars; "events": one row per
# dated event, with its `start`, its `end` when it has one, and its
# verification `status`, for a timeline; "places": one row per record with
# a `latitude` and a `longitude`, for a map.
SERIES_KINDS = ("category", "time", "distribution", "pairs", "flows", "events", "places")
KINDS_FOR_SERIES: dict[str, tuple[ChartKind, ...]] = {
    "category": (ChartKind.bar, ChartKind.column, ChartKind.stacked_bar_100, ChartKind.donut, ChartKind.treemap),
    "time": (ChartKind.line, ChartKind.column, ChartKind.area, ChartKind.bar),
    "distribution": (ChartKind.histogram, ChartKind.bar, ChartKind.column),
    "pairs": (ChartKind.scatter,),
    "flows": (ChartKind.sankey, ChartKind.bar),
    "events": (ChartKind.timeline,),
    "places": (ChartKind.map,),
}
# The shapes a kind needs; any other shape cannot be drawn by it at all (a
# histogram of periods, a scatter plot of one number). A line over
# categories CAN be drawn, which is why rule 8 exists: that is the
# checker's call, not this table's.
SERIES_FOR_KIND: dict[ChartKind, tuple[str, ...]] = {
    ChartKind.histogram: ("distribution",),
    ChartKind.scatter: ("pairs",),
    ChartKind.sankey: ("flows",),
    ChartKind.timeline: ("events",),
    ChartKind.map: ("places",),
}


class SortOrder(str, Enum):
    value_desc = "value_desc"
    value_asc = "value_asc"
    label = "label"
    time = "time"


class Scale(str, Enum):
    linear = "linear"
    log = "log"


@dataclass(frozen=True)
class ParamSpec:
    description: str
    choices: tuple[str, ...] | None = None   # None: free text checked against `pattern`
    default: str | None = None
    pattern: str | None = None


@dataclass(frozen=True)
class QuerySpec:
    name: str
    label: str            # the generic title a lazy order would reuse (rule 13 warns on it)
    description: str
    params: dict[str, ParamSpec]
    series_kind: str      # one of SERIES_KINDS
    unit_kind: str        # "amount" (a sum in a currency) | "count" (records counted)
    record_noun: str      # what one record is, in plain words, for labels and the source line

    @property
    def kinds(self) -> tuple[ChartKind, ...]:
        """The chart kinds that can draw this query's rows, best first."""
        return KINDS_FOR_SERIES[self.series_kind]

    @property
    def questions(self) -> tuple[str, ...]:
        """The questions (QUESTIONS) this query can answer."""
        return tuple(q.id for q in QUESTIONS.values() if self.series_kind in q.series_kinds)


_CURRENCY = ParamSpec("ISO 4217 currency code, e.g. USD. Each currency is its own series; omit it to get the currency with the most payments.",
                      pattern=r"^[A-Za-z]{3}$")
_GRANULARITY = ParamSpec("How to group dates.", choices=("month", "year"), default="month")
# A date as the timeline records it: a year, a month or a day (app/services/timeline.py).
_PARTIAL_DATE = r"^\d{4}(-\d{2}(-\d{2})?)?$"
# The verification statuses a timeline event can carry (app/services/timeline.py:
# the reporter's own five, and the two it gives the dates it reads from records).
EVENT_STATUSES = ("asserted", "verified", "approximate", "disputed", "unresolved", "reporter_reviewed", "system_recorded")

QUERY_CATALOG: dict[str, QuerySpec] = {q.name: q for q in (
    QuerySpec(
        "payments_by_party", "Payments by party",
        "Total amount paid or received by each person or company, from the Payment records.",
        {"direction": ParamSpec("Rank who received the money, or who paid it.", choices=("received", "paid"), default="received"),
         "currency": _CURRENCY},
        series_kind="category", unit_kind="amount", record_noun="payments",
    ),
    QuerySpec(
        "payments_over_time", "Payments over time",
        "Total amount paid in each month or year, from the Payment records.",
        {"granularity": _GRANULARITY, "currency": _CURRENCY},
        series_kind="time", unit_kind="amount", record_noun="payments",
    ),
    QuerySpec(
        "events_over_time", "Events over time",
        "How many dated events fall in each month or year, from the timeline.",
        {"granularity": _GRANULARITY},
        series_kind="time", unit_kind="count", record_noun="events",
    ),
    QuerySpec(
        "events_in_order", "Events in order",
        "Every dated event on the timeline, in date order, with its start, its end when it has one, and how far it is verified: "
        "one row per event, for a timeline.",
        {"from": ParamSpec("Only events that end on or after this date (YYYY, YYYY-MM or YYYY-MM-DD).", pattern=_PARTIAL_DATE),
         "to": ParamSpec("Only events that start on or before this date (YYYY, YYYY-MM or YYYY-MM-DD).", pattern=_PARTIAL_DATE),
         "status": ParamSpec("Only events with this verification status.", choices=EVENT_STATUSES)},
        series_kind="events", unit_kind="count", record_noun="events",
    ),
    QuerySpec(
        "places_on_map", "Places on a map",
        "Every record with a latitude and a longitude (addresses, properties), where its record puts it: one row per place, for a map. "
        "Nothing is looked up; a record without coordinates is not on the map.",
        {}, series_kind="places", unit_kind="count", record_noun="places",
    ),
    QuerySpec(
        "links_by_type", "Links by type",
        "How many relationship links of each kind (ownership, directorship, payment, ...) the investigation holds.",
        {}, series_kind="category", unit_kind="count", record_noun="links",
    ),
    QuerySpec(
        "claims_by_status", "Claims by status",
        "How many claims sit at each verification status.",
        {}, series_kind="category", unit_kind="count", record_noun="claims",
    ),
    QuerySpec(
        "entities_by_schema", "Entities by type",
        "How many people, companies, organisations and other entities the investigation holds.",
        {}, series_kind="category", unit_kind="count", record_noun="entities",
    ),
    QuerySpec(
        "evidence_by_stance", "Evidence by stance",
        "How many evidence records support, contradict or give context to a claim.",
        {}, series_kind="category", unit_kind="count", record_noun="evidence records",
    ),
    QuerySpec(
        "documents_by_status", "Documents by status",
        "How many uploaded documents have been read, are waiting, or failed.",
        {}, series_kind="category", unit_kind="count", record_noun="documents",
    ),
    QuerySpec(
        "leads_by_status", "Leads by status",
        "How many leads are unreviewed, active, blocked, resolved or rejected.",
        {}, series_kind="category", unit_kind="count", record_noun="leads",
    ),
    QuerySpec(
        "payment_amounts", "Payment amounts",
        "The amount of every payment, one row per Payment record: what a histogram bins to show how the amounts are spread.",
        {"currency": _CURRENCY},
        series_kind="distribution", unit_kind="amount", record_noun="payments",
    ),
    QuerySpec(
        "payments_count_and_total_by_party", "Number and total of payments by party",
        "For each person or company, how many payments it received (or made) and their total: two numbers per party, for a scatter plot.",
        {"direction": ParamSpec("Count and total what each party received, or what it paid.", choices=("received", "paid"), default="received"),
         "currency": _CURRENCY},
        series_kind="pairs", unit_kind="amount", record_noun="payments",
    ),
    QuerySpec(
        "payment_flows", "Payment flows",
        "How much money went from each payer to each recipient: one row per pair of parties, totalling their Payment records, "
        "for a flow diagram (or ranked as bars).",
        {"currency": _CURRENCY},
        series_kind="flows", unit_kind="amount", record_noun="payments",
    ),
)}


@dataclass(frozen=True)
class Question:
    """One question a chart can answer (FT Visual Vocabulary category)."""
    id: str
    label: str
    description: str
    kinds: tuple[ChartKind, ...]     # the kinds that answer it, best first
    series_kinds: tuple[str, ...]     # the query shapes that hold the relationship


# The FT Visual Vocabulary's categories this pass can answer from the
# records, in its own words where they fit. "Flow" is answered by the
# payment_flows query, drawn as a sankey (pass 4).
QUESTIONS: dict[str, Question] = {q.id: q for q in (
    Question("ranking", "Ranking", "Where an item sits in an ordered list: who received the most, which status holds the most claims.",
             (ChartKind.bar, ChartKind.column), ("category", "distribution")),
    # The FT Visual Vocabulary puts the timeline here too ("Priestley
    # timeline: great when date and duration are key elements of the story").
    Question("change_over_time", "Change over time", "How a value rises and falls across periods: payments by month, events by year; "
             "or what happened when, and for how long: the events themselves on a timeline.",
             (ChartKind.line, ChartKind.column, ChartKind.area, ChartKind.timeline), ("time", "events")),
    Question("part_of_whole", "Part of a whole", "How a total splits into parts that do not overlap: each recipient's share of the money.",
             (ChartKind.stacked_bar_100, ChartKind.donut, ChartKind.treemap), ("category",)),
    Question("distribution", "Distribution", "How the values are spread: how many payments are small, middling or very large.",
             (ChartKind.histogram,), ("distribution",)),
    Question("correlation", "Correlation", "How two numbers about the same party move together: how many payments against how much money.",
             (ChartKind.scatter,), ("pairs",)),
    Question("flow", "Flow", "Where money moves from and to: who paid whom, and how much.",
             (ChartKind.sankey,), ("flows",)),
    # The FT Visual Vocabulary's "Spatial": "used only when precise locations
    # or geographical patterns in data are more important to the reader than
    # anything else".
    Question("place", "Place", "Where things are: the addresses and properties the records place on the globe.",
             (ChartKind.map,), ("places",)),
)}


class QueryRef(BaseModel):
    """One catalogued query and its parameters, as the AI writes them."""
    model_config = ConfigDict(extra="forbid")

    name: str
    params: dict[str, str] = Field(default_factory=dict)

    @field_validator("params", mode="before")
    @classmethod
    def _params_as_text(cls, value: Any) -> Any:
        # A model that writes {"granularity": "month"} and one that writes a
        # number for a code both get a readable error, not a type dump.
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise ValueError("params must be an object of parameter names to values")
        return {str(k): v for k, v in value.items()}

    @model_validator(mode="after")
    def _known_query_and_params(self) -> QueryRef:
        query = QUERY_CATALOG.get(self.name)
        if query is None:
            raise ValueError(f"unknown query {self.name!r}; the catalogue has: {', '.join(sorted(QUERY_CATALOG))}")
        for key, value in self.params.items():
            if key not in query.params:
                allowed = ", ".join(sorted(query.params)) or "none"
                raise ValueError(f"query {self.name!r} has no parameter {key!r}; its parameters are: {allowed}")
            if not isinstance(value, str):
                raise ValueError(f"parameter {key!r} of query {self.name!r} must be text")
            spec = query.params[key]
            if spec.choices is not None and value not in spec.choices:
                raise ValueError(f"parameter {key!r} of query {self.name!r} must be one of {', '.join(spec.choices)}, not {value!r}")
            if spec.pattern is not None and not re.fullmatch(spec.pattern, value):
                raise ValueError(f"parameter {key!r} of query {self.name!r} is not valid: {value!r} ({spec.description})")
        return self

    @property
    def catalog_entry(self) -> QuerySpec:
        return QUERY_CATALOG[self.name]

    def resolved_params(self) -> dict[str, str]:
        """The given parameters with the catalogue's defaults filled in,
        currency codes upper-cased. What the data service actually runs."""
        out: dict[str, str] = {}
        for key, spec in self.catalog_entry.params.items():
            value = self.params.get(key, spec.default)
            if value is None:
                continue
            out[key] = value.upper() if key == "currency" else value
        return out


class VisualSpec(BaseModel):
    """The order slip. `extra="forbid"` is what keeps numbers out: a model
    that tries to add `values` or `items` is refused, not silently
    tolerated."""
    model_config = ConfigDict(extra="forbid")

    kind: ChartKind
    # The question the chart answers (QUESTIONS, after the FT Visual
    # Vocabulary). Optional, so orders stored before it existed still parse;
    # when it is given, the kind must be one that answers it and the query
    # must hold that relationship, so the choice of chart is checked rather
    # than taken on trust.
    question: str | None = Field(default=None, description="The question the chart answers: ranking, change_over_time, part_of_whole, distribution, correlation, flow or place.")
    title: str = Field(min_length=1, max_length=200, description="States the finding, e.g. 'Meridian received most of the money'.")
    subtitle: str | None = Field(default=None, max_length=300)
    unit: str | None = Field(default=None, max_length=40, description="Optional unit label; the data's own unit always wins.")
    query: QueryRef
    sort: SortOrder | None = None
    limit: int | None = Field(default=None, ge=1, le=50, description="Keep the top N; the rest are folded into 'Other'.")
    highlight: list[str] = Field(default_factory=list, max_length=8, description="Labels to pick out; the others turn grey.")
    scale: Scale = Scale.linear
    stack: bool = False
    theme: str = DEFAULT_THEME

    @field_validator("title", "subtitle", "unit", mode="before")
    @classmethod
    def _strip(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("title")
    @classmethod
    def _title_is_words(cls, value: str) -> str:
        if not re.search(r"[A-Za-z]", value):
            raise ValueError("the title must be words that state the finding")
        return value

    @field_validator("highlight", mode="before")
    @classmethod
    def _highlight_labels(cls, value: Any) -> Any:
        if value is None:
            return []
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise ValueError("highlight must be a list of labels")
        return [v.strip() for v in value if v.strip()]

    @field_validator("theme")
    @classmethod
    def _known_theme(cls, value: str) -> str:
        if value not in THEMES:
            raise ValueError(f"unknown theme {value!r}; the themes are: {', '.join(sorted(THEMES))}")
        return value

    @model_validator(mode="after")
    def _order_fits_the_query(self) -> VisualSpec:
        query = self.query.catalog_entry
        if self.sort == SortOrder.time and query.series_kind not in ("time", "events"):
            raise ValueError(f"sort 'time' needs a time query; {self.query.name!r} is grouped by category")
        if self.limit is not None and query.series_kind in ("time", "events"):
            raise ValueError("limit cannot cut a time series or a list of events; it only folds ranked categories into 'Other'")
        # An unknown question is a malformed order. A kind or query that does
        # not answer a known question is a choice the model can fix, so it
        # is refused when the chart is drawn (echarts.check_fit), which asks
        # the model again with the reason.
        if self.question is not None and self.question not in QUESTIONS:
            raise ValueError(f"unknown question {self.question!r}; the questions are: {', '.join(QUESTIONS)}")
        return self

    def question_problem(self) -> str | None:
        """Why this order's kind or query does not answer its question, or
        None when it does (or names no question)."""
        question = QUESTIONS.get(self.question or "")
        if question is None:
            return None
        if self.kind not in question.kinds:
            kinds = ", ".join(k.value for k in question.kinds)
            return f"a {self.kind.value} does not answer '{question.label.lower()}'; the kinds that do: {kinds}"
        if self.query.catalog_entry.series_kind not in question.series_kinds:
            fits = [name for name, q in QUERY_CATALOG.items() if q.series_kind in question.series_kinds]
            return f"the query {self.query.name!r} cannot answer '{question.label.lower()}'; the queries that can: {', '.join(fits) or 'none yet'}"
        return None

    @property
    def catalog_entry(self) -> QuerySpec:
        return self.query.catalog_entry

    @property
    def drawable(self) -> bool:
        return self.kind in DRAWN_KINDS

    def effective_sort(self) -> SortOrder:
        """The order the chart is drawn in when the order slip names none:
        time series in time order, everything else largest first."""
        if self.sort is not None:
            return self.sort
        return SortOrder.time if self.catalog_entry.series_kind in ("time", "events") else SortOrder.value_desc


def spec_errors(raw: Any) -> list[str]:
    """Plain-words problems with a raw order slip; empty means valid."""
    if not isinstance(raw, dict):
        return ["spec must be an object"]
    try:
        VisualSpec.model_validate(raw)
    except ValidationError as exc:
        out = []
        for error in exc.errors():
            where = ".".join(str(p) for p in error["loc"])
            message = error["msg"]
            if message.startswith("Value error, "):
                message = message[len("Value error, "):]
            out.append(f"{where}: {message}" if where else message)
        return out
    return []


def parse_spec(raw: Any) -> VisualSpec:
    """A validated spec, or a ValueError carrying every problem."""
    problems = spec_errors(raw)
    if problems:
        raise ValueError("; ".join(problems))
    return VisualSpec.model_validate(raw)
