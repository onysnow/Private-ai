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

Pass 2 draws bar and column charts end to end. The other kinds are accepted
by the spec, the data service and the checker already, so pass 3 adds
drawing, not plumbing; DRAWN_KINDS says which kinds can be drawn today.
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


# What pass 2 can draw (app/visuals/echarts.py). The rest wait for pass 3.
DRAWN_KINDS: frozenset[ChartKind] = frozenset({ChartKind.bar, ChartKind.column})

# Kinds that show a value as a length (rule 9: the easiest to read) ...
LENGTH_KINDS: frozenset[ChartKind] = frozenset({ChartKind.bar, ChartKind.column, ChartKind.histogram})
# ... as an area or angle, where a negative value has no honest picture (rule 3) ...
SIZE_KINDS: frozenset[ChartKind] = frozenset({ChartKind.donut, ChartKind.treemap, ChartKind.stacked_bar_100, ChartKind.area, ChartKind.sankey})
# ... as a line joining the points, which only makes sense along an ordered axis (rule 8).
LINE_KINDS: frozenset[ChartKind] = frozenset({ChartKind.line, ChartKind.area})
# Kinds whose categories each get their own colour (rule 10 counts them).
COLOUR_PER_CATEGORY_KINDS: frozenset[ChartKind] = frozenset({ChartKind.donut, ChartKind.treemap, ChartKind.stacked_bar_100})
# Kinds that may be stacked (rule 4).
STACKABLE_KINDS: frozenset[ChartKind] = frozenset({ChartKind.bar, ChartKind.column, ChartKind.area, ChartKind.stacked_bar_100})


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
    series_kind: str      # "category" (parts ranked or compared) | "time" (periods in order)
    unit_kind: str        # "amount" (a sum in a currency) | "count" (records counted)
    record_noun: str      # what one record is, in plain words, for labels and the source line


_CURRENCY = ParamSpec("ISO 4217 currency code, e.g. USD. Each currency is its own series; omit it to get the currency with the most payments.",
                      pattern=r"^[A-Za-z]{3}$")
_GRANULARITY = ParamSpec("How to group dates.", choices=("month", "year"), default="month")

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
        if self.sort == SortOrder.time and query.series_kind != "time":
            raise ValueError(f"sort 'time' needs a time query; {self.query.name!r} is grouped by category")
        if self.limit is not None and query.series_kind == "time":
            raise ValueError("limit cannot cut a time series; it only folds ranked categories into 'Other'")
        return self

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
        return SortOrder.time if self.catalog_entry.series_kind == "time" else SortOrder.value_desc


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
