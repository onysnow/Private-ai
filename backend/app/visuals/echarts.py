"""The drawing: an ECharts option in the house style, plus the words that
go with it (alt text, a longer description, the data table).

House style, from the design doc's reference gallery (BBC Visual and Data
Journalism cookbook; Datawrapper; Urban Institute): the title states the
finding, the subtitle gives the unit, only horizontal gridlines where a
chart has axes, a dark zero line, values written on the marks, no 3D, a
zero baseline for bars and areas, at most eight colours with the rest
folded into "Other", and every chart carries a source line. Colours and
fonts come from the deck theme (app/services/presentation_style.py), never
from here.

One builder per kind, all reading the same rows:

* bar, column: values and record counts written on the bars (pass 2).
* line, area: a time series on a zero baseline; the last value written at
  the end of the line (BBC: label lines directly), every point's value and
  record count in its tooltip and the data table; a point that rests on one
  record is drawn hollow (rule 20 by shape, which rule 12 accepts).
* stacked_bar_100: one bar that adds up to 100% (the Reuters replacement
  for small pies), each part labelled with its name and share.
* donut: at most four slices (rule 5, checked), labelled outside, with the
  total in the centre; never pulled out, never a rose.
* treemap: one rectangle per part, sized by value, labelled inside in black
  or white, whichever reads.
* histogram: bins from app/visuals/stats.py drawn as touching bars (no
  gaps: the amounts are continuous).
* scatter: two numbers per party; every point named when there are few,
  otherwise the outliers (Tukey's fences).
* sankey (pass 4, money flows): one band per payer-recipient pair, as wide
  as the money, each written with its amount and how many payments make it;
  every party named. Parties in one colour and bands in grey (a highlight
  colours the flows it picks), since the colour carries no second meaning.
  ECharts draws a sankey only when the money never comes back round (it
  refuses a cycle: "Sankey is a DAG"); when it does (A pays B, B pays A),
  payers are drawn in one column and recipients in the other, and the
  subtitle says so, rather than dropping the flow that closes the circle.
* timeline (pass 4, the FT Visual Vocabulary's "Priestley timeline"): one
  row per event in date order, earliest at the top, named on the axis; a
  dot on the day of an event known to the day, a line from start to end
  for one that lasted, and a dashed line across the month or year for a
  date known only that far (the timeline never fills in a missing day).
  Every event's date and verification status are written beside it.
* map (pass 5): every place a dot on the self-hosted base map, named beside
  it. Not drawn by ECharts: the option carries the places under "map", and
  the app (MapLibre GL JS) and the render service (MapLibre Native) draw
  them in one style (ADR-0005, line 18). The frame (title, source line,
  alt text) is the same as every chart's.

The numbers the drawing needs beyond the query's own (shares, bins,
outliers) come from app/visuals/stats.py; the drawing only places them.

The option is built from the spec, the data and the draw options alone
and is deterministic: rows are sorted the same way whatever order they
arrive in (the metamorphic tests in tests/test_visuals_echarts.py hold
every kind to that). Animation is off because the option is drawn on a
server with no frames (render/server.mjs) and in a browser that should show
the finished chart. Text that a chart writes is passed as literal strings:
ECharts reads braces as a template, so none are used, and tooltips render
as rich text, never HTML, because labels come from the records.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from app.services.presentation_style import INK_DARK, INK_LIGHT, Theme, contrast_ratio, font_stack
from app.visuals.data_service import DataRow, RecordRef, VisualData, date_bounds, event_span
from app.visuals.layout import LABEL_GAP, TEXT_SLACK, block_width, place_on_line, wrapped_lines
from app.visuals.spec import (
    COLOUR_PER_CATEGORY_KINDS, DRAWN_KINDS, PART_OF_WHOLE_KINDS, SERIES_FOR_KIND, ChartKind, Scale, SortOrder, VisualSpec,
)
from app.visuals.stats import BINNING_RULES, DEFAULT_BINNING, format_share, histogram_bins, outlier_indexes, part_shares

DEFAULT_WIDTH, DEFAULT_HEIGHT = 960, 540   # 16:9, the deck's own ratio
MIN_FONT_PX = 12                           # design rule 14
MAX_COLOURS = 8                            # design rule 10
OTHER_LABEL = "Other"
SINGLE_RECORD_MARK = "†"                   # design rule 20: a value resting on one record
FILLED_SYMBOL, HOLLOW_SYMBOL = "circle", "emptyCircle"   # rule 20 for points: hollow = one record
POINT_LABEL_LIMIT = 12                     # a scatter names every point up to this many
GRAPHIC_CONTRAST = 3.0                     # WCAG 1.4.11: a line or a point against the page
TREEMAP_LABEL_PADDING = 5                  # ECharts' own default for a treemap label, written out for the checker

_CURRENCY_SYMBOLS = {"USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "CHF": "CHF ", "CAD": "C$", "AUD": "A$"}
KIND_LABELS = {
    ChartKind.bar: "Bar chart", ChartKind.column: "Column chart", ChartKind.line: "Line chart", ChartKind.area: "Area chart",
    ChartKind.stacked_bar_100: "100% bar", ChartKind.donut: "Donut chart", ChartKind.treemap: "Treemap",
    ChartKind.histogram: "Histogram", ChartKind.scatter: "Scatter plot", ChartKind.timeline: "Timeline", ChartKind.sankey: "Flow diagram",
    ChartKind.map: "Map", ChartKind.heatmap: "Grid",
}
_AXIS_LABEL_WIDTH = 220                    # px: a category name longer than this is cut short (the data table has it whole)
BOLD_SLACK = math.ceil(_AXIS_LABEL_WIDTH * 0.1)   # px: how much wider a bold name may run than its regular-weight cut
_BAR_WIDTH = {"thin": 18, "regular": 36, "thick": 56}
_BAR_GAP = {"thin": "60%", "regular": "35%", "thick": "15%"}
_WHOLE_BAR_WIDTH = {"thin": 36, "regular": 56, "thick": 84}
_LINE_WIDTH = {"thin": 1.5, "regular": 2.5, "thick": 4.0}


class UnsupportedChartKind(ValueError):
    """The spec names a kind this pass does not draw yet."""


class ChartDoesNotFit(ValueError):
    """The order slip asks a kind to draw rows it cannot show (a scatter plot
    of one number, a histogram of periods, two numbers on a bar chart), or
    asks for a sort or a limit the kind has no use for."""


@dataclass(frozen=True)
class DrawOptions:
    """How a chart is drawn beyond its order slip: the style layer's
    options (app/services/presentation_style.py, chart presets). The
    defaults are the house style. Nothing here can change a value, a label
    or a record."""
    thickness: str = "regular"      # bar, column, 100% bar
    axis_line: bool = True          # bar, column: the dark zero line
    gridlines: bool = True          # column, line, area, histogram, scatter: horizontal gridlines
    line_width: str = "regular"     # line, area
    markers: bool = True            # line, area: a marker on every point (hollow single-record markers always show)
    value_labels: bool = False      # line, area: write every value, not only the last
    smooth: bool = False            # line, area: a curve through the points (the checker warns: it can overshoot)
    centre_total: bool = True       # donut
    # A donut's labels always sit outside the ring: a name and a share are
    # wider than the ring is thick, so a label on a slice spilled over its
    # neighbours (checked with the render service), and a thin slice could
    # not hold one at all.
    binning: str = DEFAULT_BINNING  # histogram: the rule that sets the number of bins
    label_points: str = "auto"      # scatter: "auto" (every point when few, else outliers) | "outliers"
    stages: bool = False            # sankey: the parties at each place in the chain of payments grouped into one stage


@dataclass
class BuiltChart:
    option: dict[str, Any]
    alt_text: str
    description: str
    data_table: dict[str, Any]
    source_line: str
    rows: list[DataRow]                    # as drawn: sorted, folded, binned
    highlighted_labels: list[str] = field(default_factory=list)
    single_record_labels: list[str] = field(default_factory=list)
    width: int = DEFAULT_WIDTH
    height: int = DEFAULT_HEIGHT
    kind: ChartKind = ChartKind.bar        # the kind drawn
    draw: DrawOptions = field(default_factory=DrawOptions)
    shares: list[float] = field(default_factory=list)          # part-of-whole kinds: each row's share, in %
    total: float | None = None                                   # part-of-whole kinds: the whole
    bins: list[tuple[float, float]] = field(default_factory=list)  # histogram: each row's [start, end)
    labelled_points: list[str] = field(default_factory=list)   # scatter: the points named on the chart
    stages: dict[str, list[str]] = field(default_factory=dict)   # a staged flow: each stage and the parties in it

    def text(self) -> dict[str, Any]:
        """The words stored beside the chart in a draft (rule 13)."""
        return {"alt_text": self.alt_text, "description": self.description, "data_table": self.data_table, "source_line": self.source_line}


# --- values and words --------------------------------------------------------------

def singular(noun: str) -> str:
    specials = {"entities": "entity", "evidence records": "evidence record"}
    if noun in specials:
        return specials[noun]
    return noun[:-1] if noun.endswith("s") else noun


def _money(value: float, code: str) -> str:
    prefix = _CURRENCY_SYMBOLS.get(code, "")
    suffix = "" if prefix or not code else f" {code}"
    magnitude = abs(value)
    if magnitude >= 1_000_000:
        text = f"{value / 1_000_000:,.1f}M"
    elif magnitude >= 10_000:
        text = f"{value / 1_000:,.0f}K"
    elif float(value).is_integer():
        text = f"{value:,.0f}"
    else:
        text = f"{value:,.2f}"
    return f"{prefix}{text}{suffix}"


def format_value(value: float, data: VisualData) -> str:
    """'$2.4M', '285K', '1,200' for amounts; '3' for counts. Compact on
    purpose: a label on a bar is read at a glance, the data table has the
    exact figure."""
    if data.unit_kind == "count":
        return f"{int(round(value)):,}"
    return _money(value, (data.currency or data.unit or "").upper())


def format_exact(value: float, data: VisualData) -> str:
    """'$12.5K', '$2.5M', '$750': compact but never rounded, for bin edges,
    where '$12K' for 12,500 would put a payment in the wrong range."""
    code = (data.currency or data.unit or "").upper() if data.unit_kind == "amount" else ""
    prefix = _CURRENCY_SYMBOLS.get(code, "")
    suffix = "" if prefix or not code else f" {code}"
    exact = Decimal(repr(float(value)))
    for size, mark in ((Decimal(1_000_000), "M"), (Decimal(1_000), "K")):
        if abs(exact) >= size:
            number = exact / size
            break
    else:
        number, mark = exact, ""
    text = f"{number:,f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return f"{prefix}{text}{mark}{suffix}"


def count_phrase(row: DataRow, data: VisualData) -> str:
    noun = data.record_noun if row.record_count != 1 else singular(data.record_noun)
    return f"{row.record_count} {noun}"


def format_x(row: DataRow, data: VisualData) -> str:
    """A pairs row's x as it is written: a whole number for a count."""
    x = row.x or 0.0
    if data.x_unit_kind == "count":
        return f"{int(round(x)):,}"
    return _money(x, (data.x_unit or "").upper()) if data.x_unit_kind == "amount" else f"{x:,g}"


def _literal(text: str) -> str:
    """A label as ECharts must be given it: a literal, with no braces for its
    template syntax to read."""
    return text.replace("{", "(").replace("}", ")")


def value_label(row: DataRow, data: VisualData) -> str:
    """What is written on a bar: the value, how many records sit behind it
    (rule 16) and the single-record mark (rule 20)."""
    text = format_value(row.value, data)
    if data.unit_kind == "amount":
        text += f" · {count_phrase(row, data)}"
    if row.record_count == 1:
        text += f" {SINGLE_RECORD_MARK}"
    return text


def source_line(data: VisualData, rows: list[DataRow], kind: ChartKind | None = None) -> str:
    parts = [f"Source: {data.record_count} {data.record_noun if data.record_count != 1 else singular(data.record_noun)} in this investigation's records ({data.query})"]
    if kind not in (ChartKind.timeline, ChartKind.map, ChartKind.heatmap) and any(row.record_count == 1 for row in rows):
        # (A timeline's mark is one event and a map's one place, always one record, and a grid's
        # cell counts the claims themselves: nothing to flag.)
        parts.append(f"{SINGLE_RECORD_MARK} hollow markers rest on one record" if kind in (ChartKind.line, ChartKind.area, ChartKind.scatter)
                     else f"{SINGLE_RECORD_MARK} rests on one record")
    other = [o for o in data.omitted if o.get("reason") == "other currency"]
    if other:
        parts.append("not shown: " + ", ".join(f"{o['record_count']} in {o['currency']}" for o in other))
    ungraded = [o for o in data.omitted if o.get("reason") == "not graded"]
    if ungraded:
        parts.append(f"not shown: {len(ungraded)} not graded yet")
    if kind == ChartKind.map:
        # The base map's data is OpenStreetMap's (ODbL): every map says so.
        parts.append(MAP_ATTRIBUTION)
    return " · ".join(parts)


# --- rows as drawn ------------------------------------------------------------------

def _sort_rows(rows: list[DataRow], order: SortOrder) -> list[DataRow]:
    if order == SortOrder.time:
        return sorted(rows, key=lambda r: (r.key, r.label))
    if order == SortOrder.label:
        return sorted(rows, key=lambda r: (r.label.lower(), r.key))
    if order == SortOrder.value_asc:
        return sorted(rows, key=lambda r: (r.value, r.label.lower(), r.key))
    return sorted(rows, key=lambda r: (-r.value, r.label.lower(), r.key))


def _fold(rows: list[DataRow], keep: int) -> list[DataRow]:
    """Keep the first `keep` rows and fold the rest into one "Other" row,
    adding their values and keeping every record ref, so a limit never
    makes money or records disappear (rules 10 and 15)."""
    if len(rows) <= keep:
        return rows
    head, tail = rows[:keep], rows[keep:]
    refs: list[RecordRef] = []
    for row in tail:
        for ref in row.record_refs:
            if ref not in refs:
                refs.append(ref)
    other = DataRow(OTHER_LABEL, round(sum(r.value for r in tail), 2), refs, sum(r.record_count for r in tail), OTHER_LABEL)
    return head + [other]


def check_fit(spec: VisualSpec, data: VisualData) -> None:
    """Refuse an order whose kind or query does not answer the question it
    names, or whose kind cannot draw the query's rows at all, in plain
    words that name what would fit (ChartDoesNotFit). A line over
    categories can be drawn and is left to the checker (rule 8)."""
    kind = spec.kind
    answer = spec.question_problem()
    if answer:
        raise ChartDoesNotFit(answer)
    needs = SERIES_FOR_KIND.get(kind)
    if needs and data.series_kind not in needs:
        wanted = {"distribution": "one value per record, such as payment_amounts", "pairs": "two numbers per party, such as payments_count_and_total_by_party",
                  "flows": "money moving between parties, such as payment_flows", "events": "dated events, such as events_in_order",
                  "places": "records with coordinates, such as places_on_map",
                  "grid": "a grid of two graded scales, such as claims_by_strength"}
        raise ChartDoesNotFit(f"a {kind.value} needs {' or '.join(wanted[n] for n in needs)}; the query {data.query!r} has {data.series_kind} rows")
    if data.series_kind == "pairs" and kind != ChartKind.scatter:
        raise ChartDoesNotFit(f"the query {data.query!r} holds two numbers per party; draw it as a scatter plot")
    if data.series_kind == "flows" and kind not in (ChartKind.sankey, ChartKind.bar):
        raise ChartDoesNotFit(f"the query {data.query!r} holds money moving from one party to another; draw it as a flow diagram (sankey) "
                              "or rank the flows as bars")
    if kind == ChartKind.sankey:
        if spec.limit is not None:
            raise ChartDoesNotFit("limit folds ranked rows into 'Other', which has no payer or recipient to draw a flow between; "
                                  "leave limit out, or rank the flows as bars")
        if spec.sort is not None:
            raise ChartDoesNotFit("sort does not apply to a flow diagram: each flow sits between its payer and its recipient; leave sort out")
    if data.series_kind == "grid" and kind != ChartKind.heatmap:
        raise ChartDoesNotFit(f"the query {data.query!r} holds a grid of two graded scales; draw it as a grid (heatmap)")
    if kind == ChartKind.heatmap and (spec.sort is not None or spec.limit is not None or spec.scale == Scale.log):
        raise ChartDoesNotFit("a grid puts each cell where its two grades meet; sort, limit and a log scale do not apply, so leave them out")
    if data.series_kind == "places" and kind != ChartKind.map:
        raise ChartDoesNotFit(f"the query {data.query!r} holds places; draw them on a map")
    if kind == ChartKind.map and (spec.sort is not None or spec.limit is not None or spec.scale == Scale.log):
        raise ChartDoesNotFit("a map puts each place where its record says; sort, limit and a log scale do not apply, so leave them out")
    if data.series_kind == "events" and kind != ChartKind.timeline:
        raise ChartDoesNotFit(f"the query {data.query!r} holds dated events; draw them as a timeline, or count them by period with events_over_time")
    if kind == ChartKind.timeline:
        if spec.sort is not None and spec.sort != SortOrder.time:
            raise ChartDoesNotFit("a timeline runs in date order; leave sort out")
        if spec.scale == Scale.log:
            raise ChartDoesNotFit("a timeline's axis is time; a log scale does not apply to it")
    if kind in (ChartKind.histogram, ChartKind.scatter):
        if spec.limit is not None:
            raise ChartDoesNotFit(f"limit folds ranked categories into 'Other'; a {kind.value} has none to fold, so leave limit out")
        if spec.sort is not None:
            reason = "its bins run in order of amount" if kind == ChartKind.histogram else "its points sit where their two numbers put them"
            raise ChartDoesNotFit(f"sort does not apply to a {kind.value}: {reason}; leave sort out")


def _histogram_rows(data: VisualData, rule: str) -> tuple[list[DataRow], list[tuple[float, float]]]:
    """One row per bin: its range as the label, how many records fall in it
    as the value, and those records' refs (rules 15, 16 and 20 hold for a
    bin as for a bar)."""
    values = [row.value for row in data.rows]
    bins = histogram_bins(values, rule)
    out: list[DataRow] = []
    for position, b in enumerate(bins):
        refs: list[RecordRef] = []
        for index in b.indexes:
            for ref in data.rows[index].record_refs:
                if ref not in refs:
                    refs.append(ref)
        refs.sort(key=lambda r: (r.record_type, r.record_id))
        label = f"{format_exact(b.start, data)}–{format_exact(b.end, data)}"
        # The key keeps bin order, as a period key keeps time order.
        out.append(DataRow(label, float(len(b.indexes)), refs, len(b.indexes), f"{position:04d}"))
    return out, [(b.start, b.end) for b in bins]


def prepare_rows(spec: VisualSpec, data: VisualData, draw: DrawOptions | None = None) -> list[DataRow]:
    """The rows in drawing order: sorted as the spec asks (largest first
    unless it says otherwise, time order for a time series) and folded past
    the spec's limit (the top N plus "Other"), or, for a kind that colours
    each category, past seven categories so that "Other" makes eight
    colours (rule 10). A histogram's rows are its bins; a scatter plot's
    are its points in label order (their place comes from their numbers)."""
    if spec.kind == ChartKind.histogram and data.series_kind == "distribution":
        return _histogram_rows(data, (draw or DrawOptions()).binning)[0]
    if spec.kind == ChartKind.scatter:
        return sorted(data.rows, key=lambda r: (r.label.lower(), r.key))
    if spec.kind == ChartKind.heatmap:
        # A cell's place is its meaning: the rows keep the grid's own order.
        return sorted(data.rows, key=lambda r: r.key)
    rows = _sort_rows(list(data.rows), spec.effective_sort())
    if data.series_kind in ("category", "distribution") or (data.series_kind == "flows" and spec.kind != ChartKind.sankey):
        keep = spec.limit if spec.limit is not None else (MAX_COLOURS - 1 if spec.kind in COLOUR_PER_CATEGORY_KINDS else None)
        if keep is not None:
            rows = _fold(rows, keep)
    return rows


# --- shared option parts --------------------------------------------------------------

def _hex(colour: str) -> str:
    return colour if colour.startswith("#") else f"#{colour}"


def _text_style(theme: Theme, size: int, *, colour: str | None = None, bold: bool = False, heading: bool = False) -> dict[str, Any]:
    # A font list, not a bare name: without a generic family at its end, an
    # export drawn on a host without the theme's face loses its words
    # (presentation_style.font_stack says why).
    family = font_stack(theme.heading_font if heading else theme.body_font)
    style: dict[str, Any] = {"fontFamily": family, "fontSize": size, "color": _hex(colour or theme.text)}
    if bold:
        style["fontWeight"] = "bold"
    return style


def label_room(texts: list[str], *, half: bool = False, size: int = MIN_FONT_PX) -> int:
    """Pixels to leave beside the plot for the widest of `texts` (or half of
    it, for a label centred on the plot's edge), padded for browser fonts
    (layout.TEXT_SLACK) and a gap."""
    widest = max((block_width(text, size) for text in texts), default=0.0) * TEXT_SLACK
    return math.ceil((widest / 2 if half else widest) + LABEL_GAP)


def mark_colour(theme: Theme) -> str:
    """The colour of a line or a point: the theme's accent when it stands
    3:1 against the page (WCAG 1.4.11), else the accent made for text,
    since nothing is written on a line to carry its value instead."""
    return theme.accent if contrast_ratio(theme.accent, theme.page) >= GRAPHIC_CONTRAST else theme.accent_text


def ink_on(fill: str) -> str:
    """Black or white text, whichever reads better on `fill` (rule 11)."""
    plain = fill.lstrip("#")
    return INK_DARK if contrast_ratio(INK_DARK, plain) >= contrast_ratio(INK_LIGHT, plain) else INK_LIGHT


def part_colours(rows: list[DataRow], theme: Theme, highlighted: set[str]) -> list[str]:
    """One palette colour per part, in order; "Other" and, when some parts
    are highlighted, the rest, in the theme's grey (Datawrapper: highlight
    one, grey the others)."""
    out: list[str] = []
    named = 0
    for row in rows:
        if row.label == OTHER_LABEL or (highlighted and row.label not in highlighted):
            out.append(theme.bar_muted)
        else:
            out.append(theme.palette[named % len(theme.palette)])
        if row.label != OTHER_LABEL:
            named += 1
    return out


def _frame(spec: VisualSpec, theme: Theme, subtitle: str, source: str, alt_text: str, width: int, *, colours: list[str]) -> dict[str, Any]:
    text_width = width - 48
    return {
        "animation": False,
        "backgroundColor": _hex(theme.page),
        "color": [_hex(c) for c in colours],
        "textStyle": _text_style(theme, MIN_FONT_PX),
        "title": [
            {"id": "title", "text": spec.title, "subtext": subtitle, "left": 0, "top": 0,
             "textStyle": {**_text_style(theme, 18, bold=True, heading=True), "width": text_width, "overflow": "break"},
             "subtextStyle": {**_text_style(theme, 13, colour=theme.muted), "width": text_width, "overflow": "break"}},
            {"id": "source", "text": source, "left": 0, "bottom": 0,
             "textStyle": {**_text_style(theme, MIN_FONT_PX, colour=theme.muted), "width": text_width, "overflow": "break"}},
        ],
        "aria": {"enabled": True, "label": {"enabled": True, "description": alt_text}},
    }


def _tooltip(theme: Theme) -> dict[str, Any]:
    # Rich text, not HTML: the text comes from the records, so it is never
    # read as markup in the browser.
    return {"show": True, "trigger": "item", "renderMode": "richText", "textStyle": _text_style(theme, MIN_FONT_PX)}


def _axis_category(theme: Theme, rows: list[DataRow], highlighted: set[str], *, axis_line: bool = True, boundary_gap: bool = True,
                   all_labels: bool = True) -> dict[str, Any]:
    axis: dict[str, Any] = {
        "type": "category",
        "data": [{"value": row.label, "textStyle": {"fontWeight": "bold" if row.label in highlighted else "normal"}} for row in rows],
        # The dark zero line (BBC style): the category axis sits at zero.
        "axisLine": {"show": axis_line, "lineStyle": {"color": _hex(theme.text), "width": 1.5}},
        "axisTick": {"show": False},
        "axisLabel": {**_text_style(theme, MIN_FONT_PX), "width": _AXIS_LABEL_WIDTH, "overflow": "truncate"},
        "splitLine": {"show": False},
    }
    if all_labels:
        axis["axisLabel"]["interval"] = 0
    if not boundary_gap:
        axis["boundaryGap"] = False
    return axis


def _axis_value(theme: Theme, rows: list[DataRow], *, gridlines: bool, labels: bool = False, log: bool = False) -> dict[str, Any]:
    if log:
        # A log axis has no zero; rule 2 keeps it off bars and areas and off
        # data with zeros, so only a line or a scatter plot gets here.
        return {
            "type": "log", "logBase": 10, "axisLine": {"show": False}, "axisTick": {"show": False},
            "axisLabel": {"show": labels, **_text_style(theme, MIN_FONT_PX, colour=theme.muted)},
            "splitLine": {"show": gridlines, "lineStyle": {"color": _hex(theme.rule), "width": 1}},
        }
    floor = min(0.0, min((row.value for row in rows), default=0.0))
    return {
        "type": "value",
        "min": floor,                      # bars and areas start at zero (rule 1)
        "scale": False,
        "axisLine": {"show": False},
        "axisTick": {"show": False},
        "axisLabel": {"show": labels, **_text_style(theme, MIN_FONT_PX, colour=theme.muted)} if labels else {"show": False},
        "splitLine": {"show": gridlines, "lineStyle": {"color": _hex(theme.rule), "width": 1}},
    }


# --- one builder per kind ----------------------------------------------------------------

@dataclass
class _Parts:
    """What every builder is given."""
    spec: VisualSpec
    data: VisualData
    theme: Theme
    rows: list[DataRow]
    highlighted: set[str]
    draw: DrawOptions
    width: int
    height: int


def _bars(p: _Parts, frame: dict[str, Any]) -> dict[str, Any]:
    """bar and column (pass 2's drawing, with the style layer's thickness,
    axis line and gridlines)."""
    theme, data, rows, highlighted = p.theme, p.data, p.rows, p.highlighted
    horizontal = p.spec.kind == ChartKind.bar
    # ECharts draws the first category of a horizontal bar chart at the bottom;
    # reversing the rows keeps the first row first, without inverting an axis.
    drawn = list(reversed(rows)) if horizontal else rows
    muted = bool(highlighted)
    points = []
    for row in drawn:
        picked = row.label in highlighted
        colour = theme.accent if (picked or not muted) else theme.bar_muted
        points.append({
            "name": row.label, "value": row.value, "itemStyle": {"color": _hex(colour)},
            "label": {"show": True, "position": "right" if horizontal else "top", "formatter": _literal(value_label(row, data)),
                      **_text_style(theme, MIN_FONT_PX, bold=picked)},
        })
    category_axis = _axis_category(theme, drawn, highlighted, axis_line=p.draw.axis_line)
    # House style: only horizontal gridlines, so a horizontal bar chart (whose
    # value axis runs across) never has them.
    value_axis = _axis_value(theme, drawn, gridlines=p.draw.gridlines and not horizontal)
    # The value is written past the end of each bar, and the longest bar
    # reaches the plot's edge: `containLabel` keeps only axis labels in
    # view, so the grid leaves room for the widest value (it was cut off).
    right = max(24, label_room([value_label(row, data) for row in drawn])) if horizontal else 8
    # A picked bar's name is bold: the axis cuts a long name to its width at
    # the regular weight, and `containLabel` keeps that width in view, so the
    # bold name, about a tenth wider, needs the difference as room on the left.
    left = BOLD_SLACK if horizontal and highlighted else 0
    option = {
        **frame,
        "grid": {"left": left, "right": right, "top": 84 if horizontal else 96, "bottom": 44, "containLabel": True},
        "xAxis": value_axis if horizontal else category_axis,
        "yAxis": category_axis if horizontal else value_axis,
        "series": [{"type": "bar", "name": p.spec.title, "barMaxWidth": _BAR_WIDTH[p.draw.thickness], "barCategoryGap": _BAR_GAP[p.draw.thickness], "data": points}],
    }
    return option


def _point_tooltip(row: DataRow, data: VisualData, extra: str = "") -> dict[str, Any]:
    return {"formatter": _literal(f"{row.label}: {extra}{value_label(row, data)}")}


def _lines(p: _Parts, frame: dict[str, Any]) -> dict[str, Any]:
    """line and area: periods in time order, the last value written at the
    end, single-record points hollow."""
    theme, data, rows, highlighted, draw = p.theme, p.data, p.rows, p.highlighted, p.draw
    colour = mark_colour(theme)
    area = p.spec.kind == ChartKind.area
    log = p.spec.scale == Scale.log and not area
    points = []
    shown: list[str] = []   # the values written on the line, in order
    for i, row in enumerate(rows):
        picked = row.label in highlighted
        single = row.record_count == 1
        symbol = HOLLOW_SYMBOL if single else (FILLED_SYMBOL if draw.markers or picked else "none")
        show = draw.value_labels or picked or i == len(rows) - 1
        if show:
            shown.append(value_label(row, data))
        points.append({
            "name": row.label, "value": row.value, "symbol": symbol, "symbolSize": 11 if picked else 8,
            "itemStyle": {"color": _hex(colour), "borderColor": _hex(colour), "borderWidth": 2},
            "label": {"show": show, "position": "top", "formatter": _literal(value_label(row, data)), **_text_style(theme, MIN_FONT_PX, bold=picked)},
            "tooltip": _point_tooltip(row, data),
        })
    series: dict[str, Any] = {
        "type": "line", "name": p.spec.title, "data": points, "smooth": draw.smooth, "showSymbol": True,
        "lineStyle": {"width": _LINE_WIDTH[draw.line_width], "color": _hex(colour)}, "itemStyle": {"color": _hex(colour)},
    }
    if area:
        series["areaStyle"] = {"color": _hex(colour), "opacity": 0.22}
    # The first and last points sit on the plot's edges and their labels are
    # centred over them, so the grid leaves half a label's room on each side
    # that has one (the end label was cut off at the right). With every
    # value written on its point the value axis's own numbers say nothing
    # more and would sit under the first label, so they go, as on a column
    # chart.
    right = max(24, label_room(shown[-1:], half=True)) if shown else 24
    left = label_room(shown[:1], half=True) if draw.value_labels and shown else 0
    return {
        **frame,
        "tooltip": _tooltip(theme),
        "grid": {"left": left, "right": right, "top": 96, "bottom": 44, "containLabel": True},
        "xAxis": _axis_category(theme, rows, highlighted, boundary_gap=False, all_labels=False),
        "yAxis": _axis_value(theme, rows, gridlines=draw.gridlines, labels=not draw.value_labels, log=log),
        "series": [series],
    }


def part_value_text(row: DataRow, share: float, data: VisualData) -> str:
    """'88.6% · $2.4M · 1 payment †' or '41.7% · 5 claims': the share, the
    value, how many records sit behind it (rule 16) and the single-record
    mark (rule 20). For counts the value is the number of records."""
    if data.unit_kind == "count":
        text = f"{format_share(share)} · {count_phrase(row, data)}"
        return text + (f" {SINGLE_RECORD_MARK}" if row.record_count == 1 else "")
    return f"{format_share(share)} · {value_label(row, data)}"


def _part_label(row: DataRow, share: float, data: VisualData) -> str:
    return f"{row.label}\n{part_value_text(row, share, data)}"


WHOLE_BAR_MARGIN = 8   # px between the 100% bar and the picture's sides


def whole_bar_centres(values: list[float], width: int) -> list[float]:
    """Where each part of a 100% bar has its middle, in px from the
    picture's left edge (the bar spans the grid, WHOLE_BAR_MARGIN in from
    each side)."""
    total = math.fsum(values)
    span = width - 2 * WHOLE_BAR_MARGIN
    centres, before = [], 0.0
    for value in values:
        centres.append(WHOLE_BAR_MARGIN + ((before + value / 2) / total * span if total > 0 else 0.0))
        before += value
    return centres


def _whole_bar_offsets(labels: list[str], centres: list[float], width: int) -> list[float]:
    """How far to slide each part's label sideways: labels go above and
    below the bar in turn, and on each side they are moved apart and into
    the picture as little as they need (layout.place_on_line); a label over
    a narrow part at either end otherwise ran off the picture. When one
    side cannot hold its labels at all they stay centred, and the checker
    reports the clash (rule 12)."""
    offsets = [0.0] * len(labels)
    for side in (0, 1):
        idx = [i for i in range(len(labels)) if i % 2 == side]
        widths = [block_width(labels[i], MIN_FONT_PX) * TEXT_SLACK for i in idx]
        lefts = place_on_line([centres[i] for i in idx], widths, LABEL_GAP / 2, width - LABEL_GAP / 2)
        if lefts is None:
            continue
        for i, left, w in zip(idx, lefts, widths):
            offsets[i] = round(left + w / 2 - centres[i], 1)
    return offsets


def _whole_bar(p: _Parts, frame: dict[str, Any], shares: list[float], total: float) -> dict[str, Any]:
    """stacked_bar_100: one bar across the plot that adds up to the whole,
    each part a segment labelled with its name and share, labels above and
    below in turn and slid apart so narrow neighbours do not collide."""
    theme, data, rows, highlighted = p.theme, p.data, p.rows, p.highlighted
    colours = part_colours(rows, theme, highlighted)
    labels = [_part_label(row, share, data) for row, share in zip(rows, shares)]
    offsets = _whole_bar_offsets(labels, whole_bar_centres([row.value for row in rows], p.width), p.width)
    series = []
    for i, (row, colour, text, offset) in enumerate(zip(rows, colours, labels, offsets)):
        picked = row.label in highlighted
        series.append({
            "type": "bar", "stack": "whole", "name": row.label, "barWidth": _WHOLE_BAR_WIDTH[p.draw.thickness],
            "data": [{"name": row.label, "value": row.value, "itemStyle": {"color": _hex(colour), "borderColor": _hex(theme.page), "borderWidth": 1}}],
            "label": {"show": True, "position": "top" if i % 2 == 0 else "bottom", "distance": 10, "offset": [offset, 0],
                      "formatter": _literal(text), "align": "center", "lineHeight": 16, **_text_style(theme, MIN_FONT_PX, bold=picked)},
        })
    return {
        **frame,
        "grid": {"left": WHOLE_BAR_MARGIN, "right": WHOLE_BAR_MARGIN, "top": 150, "bottom": 120, "containLabel": False},
        "xAxis": {"type": "value", "min": 0, "max": total, "scale": False, "show": False, "splitLine": {"show": False}},
        "yAxis": {"type": "category", "data": [data.record_noun], "show": False},
        "series": series,
    }


def _donut(p: _Parts, frame: dict[str, Any], shares: list[float], total: float) -> dict[str, Any]:
    """donut: slices from twelve o'clock, labelled outside with leader lines,
    the whole in the centre; never pulled out (selected mode off) and never
    a rose (angles only, no radius encoding)."""
    theme, data, rows, highlighted, draw = p.theme, p.data, p.rows, p.highlighted, p.draw
    colours = part_colours(rows, theme, highlighted)
    items = []
    for row, share, colour in zip(rows, shares, colours):
        picked = row.label in highlighted
        label: dict[str, Any] = {"formatter": _literal(_part_label(row, share, data))}
        if picked:
            label["fontWeight"] = "bold"
        items.append({"name": row.label, "value": row.value, "itemStyle": {"color": _hex(colour), "borderColor": _hex(theme.page), "borderWidth": 2},
                      "label": label})
    centre = ["50%", "56%"]
    option = {
        **frame,
        "series": [{
            "type": "pie", "radius": ["40%", "64%"], "center": centre, "startAngle": 90, "clockwise": True,
            "selectedMode": False, "selectedOffset": 0, "avoidLabelOverlap": True, "emphasis": {"scale": False},
            "label": {"show": True, "position": "outside", "lineHeight": 16, **_text_style(theme, MIN_FONT_PX)},
            "labelLine": {"show": True, "length": 14, "length2": 10, "lineStyle": {"color": _hex(theme.muted)}},
            "data": items,
        }],
    }
    if draw.centre_total:
        option["title"] = [*option["title"], {
            "id": "centre", "text": format_value(total, data), "subtext": "in total", "left": centre[0], "top": centre[1],
            "textAlign": "center", "textVerticalAlign": "middle",
            "textStyle": _text_style(theme, 22, bold=True, heading=True), "subtextStyle": _text_style(theme, MIN_FONT_PX, colour=theme.muted),
        }]
    return option


def _treemap(p: _Parts, frame: dict[str, Any], shares: list[float]) -> dict[str, Any]:
    """treemap: one rectangle per part, sized by value, its name, share and
    value written inside in black or white, whichever reads on its fill."""
    theme, data, rows, highlighted = p.theme, p.data, p.rows, p.highlighted
    colours = part_colours(rows, theme, highlighted)
    items = []
    for row, share, colour in zip(rows, shares, colours):
        picked = row.label in highlighted
        items.append({
            "name": row.label, "value": row.value, "itemStyle": {"color": _hex(colour)},
            "label": {"formatter": _literal(_part_label(row, share, data)), "color": _hex(ink_on(colour)), "fontWeight": "bold" if picked else "normal"},
            "tooltip": {"formatter": _literal(f"{row.label}: {part_value_text(row, share, data)}")},
        })
    return {
        **frame,
        "tooltip": _tooltip(theme),
        "series": [{
            "type": "treemap", "roam": False, "nodeClick": False, "breadcrumb": {"show": False}, "sort": "desc",
            "left": 0, "right": 0, "top": 84, "bottom": 40, "visibleMin": 0,
            # ECharts fits a treemap label inside its rectangle and drops the
            # lines that do not fit; the checker works out what is left
            # (layout.treemap_rects) from these same numbers, padding included.
            "label": {"show": True, "position": "insideTopLeft", "padding": TREEMAP_LABEL_PADDING, "lineHeight": 16, "overflow": "break",
                      **_text_style(theme, MIN_FONT_PX)},
            "upperLabel": {"show": False},
            "itemStyle": {"borderColor": _hex(theme.page), "borderWidth": 2, "gapWidth": 2},
            "data": items,
        }],
    }


def _histogram(p: _Parts, frame: dict[str, Any]) -> dict[str, Any]:
    """histogram: touching bars, one per bin, the count written on each."""
    theme, data, rows, highlighted = p.theme, p.data, p.rows, p.highlighted
    muted = bool(highlighted)
    points = []
    for row in rows:
        picked = row.label in highlighted
        colour = theme.accent if (picked or not muted) else theme.bar_muted
        text = f"{int(row.value)}" + (f" {SINGLE_RECORD_MARK}" if row.record_count == 1 else "")
        points.append({
            "name": row.label, "value": row.value,
            # A hairline in the page colour tells the bars apart without a gap between them.
            "itemStyle": {"color": _hex(colour), "borderColor": _hex(theme.page), "borderWidth": 1},
            "label": {"show": True, "position": "top", "formatter": _literal(text), **_text_style(theme, MIN_FONT_PX, bold=picked)},
        })
    unit = (data.currency or data.unit or "").upper()
    axis = _axis_category(theme, rows, highlighted)
    axis["name"] = f"{data.record_noun.capitalize()} by amount" + (f" ({unit})" if unit else "")
    axis.update({"nameLocation": "middle", "nameGap": 34, "nameTextStyle": _text_style(theme, MIN_FONT_PX, colour=theme.muted)})
    if len(rows) > 6:
        axis["axisLabel"]["rotate"] = 30
    return {
        **frame,
        "grid": {"left": 8, "right": 8, "top": 96, "bottom": 76, "containLabel": True},
        "xAxis": axis,
        "yAxis": _axis_value(theme, rows, gridlines=p.draw.gridlines),
        "series": [{"type": "bar", "name": p.spec.title, "barCategoryGap": "0%", "barGap": "0%", "data": points}],
    }


def _scatter(p: _Parts, frame: dict[str, Any], labelled: set[str]) -> dict[str, Any]:
    """scatter: one point per party, x and y from the query's two numbers,
    the named points labelled, single-record points hollow."""
    theme, data, rows, highlighted = p.theme, p.data, p.rows, p.highlighted
    colour = mark_colour(theme)
    log = p.spec.scale == Scale.log
    x_count = data.x_unit_kind == "count"
    names = data.measure_labels
    points = []
    named: list[str] = []   # the names written beside their points
    for row in rows:
        picked = row.label in highlighted
        single = f" {SINGLE_RECORD_MARK}" if row.record_count == 1 else ""
        tip = (f"{row.label}: {names.get('x', 'x')} {format_x(row, data)}; {names.get('y', 'y')} {format_value(row.value, data)}; "
               f"from {count_phrase(row, data)}{single}")
        if row.label in labelled or picked:
            named.append(row.label + single)
        points.append({
            "name": row.label, "value": [row.x, row.value],
            "symbol": HOLLOW_SYMBOL if row.record_count == 1 else FILLED_SYMBOL, "symbolSize": 15 if picked else 11,
            "itemStyle": {"color": _hex(colour), "borderColor": _hex(colour), "borderWidth": 2},
            "label": {"show": row.label in labelled or picked, "position": "right", "formatter": _literal(row.label + single),
                      **_text_style(theme, MIN_FONT_PX, bold=picked)},
            "tooltip": {"formatter": _literal(tip)},
        })
    x_axis: dict[str, Any] = {
        "type": "log" if log else "value", "name": names.get("x", "x"), "nameLocation": "middle", "nameGap": 30,
        "nameTextStyle": _text_style(theme, MIN_FONT_PX, colour=theme.muted),
        "axisLine": {"show": True, "lineStyle": {"color": _hex(theme.text), "width": 1.5}}, "axisTick": {"show": True},
        "axisLabel": _text_style(theme, MIN_FONT_PX, colour=theme.muted), "splitLine": {"show": False},
    }
    # y keeps the axis floor (zero, or the lowest value when one is negative).
    y_axis = _axis_value(theme, rows, gridlines=p.draw.gridlines, labels=True, log=log)
    if not log:
        x_axis.update({"min": min(0.0, min((row.x or 0.0 for row in rows), default=0.0)), "scale": False})
        if x_count:
            x_axis["minInterval"] = 1
    # Names are written to the right of their points; the grid leaves room
    # for the widest, so a point at the far right keeps its name in view.
    right = max(24, label_room(named) + 12)
    return {
        **frame,
        "tooltip": _tooltip(theme),
        "grid": {"left": 8, "right": right, "top": 96, "bottom": 70, "containLabel": True},
        "xAxis": x_axis,
        "yAxis": y_axis,
        "series": [{"type": "scatter", "name": p.spec.title, "data": points, "labelLayout": {"moveOverlap": "shiftY"}}],
    }


SANKEY_NODE_WIDTH = 14
SANKEY_NODE_GAP = 12
SANKEY_EDGE_OPACITY = 0.45
SANKEY_LABEL_LIMIT = 12      # past this many flows, the amounts live in the tooltips and the data table only
SANKEY_LABEL_BAND = MIN_FONT_PX + 6   # px: a band must be this thick to hold its amount


def flows_circle(rows: list[DataRow]) -> bool:
    """Whether following the money from party to party can come back to
    where it started (A pays B and B pays A, or a longer round). ECharts
    cannot draw such flows as one chain (it refuses: "Sankey is a DAG")."""
    graph: dict[str, set[str]] = {}
    for row in rows:
        if row.source is not None and row.target is not None:
            graph.setdefault(row.source, set()).add(row.target)
    state: dict[str, int] = {}     # 1: being followed, 2: done

    def visit(node: str) -> bool:
        state[node] = 1
        for nxt in sorted(graph.get(node, ())):
            if state.get(nxt) == 1 or (state.get(nxt) is None and visit(nxt)):
                return True
        state[node] = 2
        return False

    return any(state.get(node) is None and visit(node) for node in sorted(graph))


def sankey_node_ids(rows: list[DataRow]) -> tuple[dict[str, tuple[str, str]], bool]:
    """flow label -> (source node id, target node id), and whether payers
    and recipients are drawn as two columns (when the money runs in a
    circle). In two columns a party that pays and receives is two nodes,
    "pays: X" and "receives: X", each labelled X."""
    split = flows_circle(rows)
    out: dict[str, tuple[str, str]] = {}
    for row in rows:
        source, target = row.source or "", row.target or ""
        out[row.label] = (f"pays: {source}", f"receives: {target}") if split else (source, target)
    return out, split


@dataclass(frozen=True)
class SankeyLayout:
    """Where the flow diagram puts things, decided here rather than left to
    ECharts, so the checker and the labels can rely on it: each node's
    column (`depth`), and the pixels per unit of money (`ky`, as ECharts
    computes it: the tightest column decides, sankeyLayout.js
    initializeNodeDepth), from which each band's thickness follows."""
    depth: dict[str, int]
    ky: float

    def band(self, value: float) -> float:
        return value * self.ky


def sankey_layout(rows: list[DataRow], ids: dict[str, tuple[str, str]], plot_height: float) -> SankeyLayout:
    """Columns from the left: a party's column is the longest chain of
    payments leading to it; a party that pays no one goes in the last
    column (ECharts' "justify"). Run only on flows with no circle (two
    columns are fixed otherwise)."""
    edges = [ids[row.label] for row in rows]
    nodes = sorted({n for pair in edges for n in pair})
    incoming: dict[str, list[str]] = {n: [] for n in nodes}
    for a, b in edges:
        incoming[b].append(a)
    depth: dict[str, int] = {}

    def depth_of(node: str) -> int:
        if node not in depth:
            depth[node] = 1 + max((depth_of(a) for a in incoming[node]), default=-1)
        return depth[node]

    for node in nodes:
        depth_of(node)
    sources = {a for a, _b in edges}
    last = max(depth.values(), default=0)
    for node in nodes:
        if node not in sources:
            depth[node] = last
    flow_in: dict[str, float] = {n: 0.0 for n in nodes}
    flow_out: dict[str, float] = {n: 0.0 for n in nodes}
    for row, (a, b) in zip(rows, edges):
        flow_out[a] += row.value
        flow_in[b] += row.value
    ky = math.inf
    for column in sorted(set(depth.values())):
        members = [n for n in nodes if depth[n] == column]
        total = math.fsum(max(flow_in[n], flow_out[n]) for n in members)
        if total > 0:
            ky = min(ky, (plot_height - (len(members) - 1) * SANKEY_NODE_GAP) / total)
    return SankeyLayout(depth, ky if math.isfinite(ky) else 0.0)


STAGE_NAMES_SHOWN = 3   # a stage names its parties up to this many; past it, says how many
STAGE_LABEL_WIDTH = 300 # px: a stage's words wrap at this width, or at the room between columns when that is less


def flow_stages(rows: list[DataRow]) -> tuple[list[DataRow], dict[str, list[str]]]:
    """The flows grouped into stages, for a slide or print (the design doc,
    after OCCRP's Russian Laundromat: "for a slide or print, simplify the
    flow into stages"). A party's stage is its column in the full flow
    diagram (sankey_layout: the longest chain of payments leading to it; a
    party that pays no one, the last), so the grouping comes from the
    records alone. The money between two stages is the sum of the flows
    between their parties, with every payment behind it, so nothing is
    left out or counted twice. Only for flows with no circle: money that
    comes back round gives the parties no order."""
    ids, _split = sankey_node_ids(rows)
    depth = sankey_layout(rows, ids, 1.0).depth
    columns = sorted(set(depth.values()))
    members: dict[int, list[str]] = {c: sorted((n for n in depth if depth[n] == c), key=str.lower) for c in columns}
    names: dict[int, str] = {}
    for position, column in enumerate(columns, start=1):
        parties = members[column]
        shown = ", ".join(parties) if len(parties) <= STAGE_NAMES_SHOWN else f"{len(parties)} parties"
        names[column] = f"Stage {position}: {shown}"
    totals: dict[tuple[int, int], DataRow] = {}
    for row in rows:
        a, b = depth[row.source or ""], depth[row.target or ""]
        staged = totals.get((a, b))
        if staged is None:
            label = f"{names[a]} → {names[b]}"
            staged = totals[(a, b)] = DataRow(label, 0.0, [], 0, label, source=names[a], target=names[b])
        staged.value = round(staged.value + row.value, 2)
        staged.record_count += row.record_count
        for ref in row.record_refs:
            if ref not in staged.record_refs:
                staged.record_refs.append(ref)
    out = sorted(totals.values(), key=lambda r: (-r.value, r.label.lower()))
    for row in out:
        row.record_refs.sort(key=lambda r: (r.record_type, r.record_id))
    return out, {names[c]: members[c] for c in columns}


def sankey_labelled(rows: list[DataRow], ids: dict[str, tuple[str, str]], layout: SankeyLayout) -> set[str]:
    """The flows whose amount is written on their band: a band from one
    column to the next (one reaching further passes behind a party's bar,
    where its words would sit on the bar) and thick enough to hold a line of
    text. Every flow's amount and payments are in its tooltip and the data
    table whatever this says (rule 16)."""
    if len(rows) > SANKEY_LABEL_LIMIT:
        return set()
    return {row.label for row in rows
            if layout.depth[ids[row.label][1]] - layout.depth[ids[row.label][0]] == 1 and layout.band(row.value) >= SANKEY_LABEL_BAND}


def _sankey(p: _Parts, frame: dict[str, Any]) -> dict[str, Any]:
    """sankey: one band per flow, as wide as its amount; every flow's
    amount and payments in its tooltip, and written on its band where it
    fits (sankey_labelled); every party named beside its bar."""
    theme, data, rows, highlighted = p.theme, p.data, p.rows, p.highlighted
    ids, split = sankey_node_ids(rows)
    staged = p.draw.stages and not split
    top, bottom = 84, 44
    stage_width = 0
    if staged:
        # A staged flow names each stage above its bar ("Stage 2", then its
        # parties wrapped to the room between two columns): its names are
        # long and its columns few and wide, and beside the bar they ran over
        # the bands. The space above the bars is as tall as the longest name.
        columns = max(1, len({row.source for row in rows} | {row.target for row in rows}) - 1)
        stage_width = int(min((p.width - 16) / columns - 2 * LABEL_GAP, STAGE_LABEL_WIDTH))
        lines = max((1 + len(wrapped_lines(name.partition(": ")[2], MIN_FONT_PX, stage_width) or [name])
                     for row in rows for name in (row.source or "", row.target or "")), default=2)
        top += lines * (MIN_FONT_PX + 4) + 8
    if split:
        names_by_id = {n: n.split(": ", 1)[1] for pair in ids.values() for n in pair}
        layout = SankeyLayout({n: (0 if n.startswith("pays: ") else 1) for n in names_by_id}, 0.0)
        flow_in = {n: 0.0 for n in names_by_id}
        flow_out = dict(flow_in)
        for row in rows:
            a, b = ids[row.label]
            flow_out[a] += row.value
            flow_in[b] += row.value
        height = p.height - top - bottom
        kys = []
        for column in (0, 1):
            members = [n for n in names_by_id if layout.depth[n] == column]
            total = math.fsum(max(flow_in[n], flow_out[n]) for n in members)
            if total > 0:
                kys.append((height - (len(members) - 1) * SANKEY_NODE_GAP) / total)
        layout = SankeyLayout(layout.depth, min(kys) if kys else 0.0)
    else:
        layout = sankey_layout(rows, ids, p.height - top - bottom)
    written = sankey_labelled(rows, ids, layout)
    picked_parties = set(p.spec.highlight)
    node_colour = mark_colour(theme)
    names: dict[str, str] = {}            # node id -> the party's name
    outgoing: set[str] = set()
    for row in rows:
        source_id, target_id = ids[row.label]
        names[source_id], names[target_id] = row.source or "", row.target or ""
        outgoing.add(source_id)
    nodes = []
    last_column = max(layout.depth.values(), default=0)
    for node_id in sorted(names, key=lambda n: (layout.depth.get(n, 0), names[n].lower(), n)):
        bold = names[node_id] in picked_parties
        label: dict[str, Any] = {"show": True, "position": "right" if node_id in outgoing else "left", "formatter": _literal(names[node_id]),
                                 **_text_style(theme, MIN_FONT_PX, bold=bold)}
        if staged:
            column = layout.depth.get(node_id, 0)
            head, _, parties = names[node_id].partition(": ")
            # Over the bar, wrapped to the room between two columns; the first
            # stage's words run right from its bar and the last's left, so
            # neither leaves the picture.
            label.update({"position": "top", "formatter": _literal(f"{head}\n{parties}"), "width": stage_width,
                          "overflow": "break", "lineHeight": MIN_FONT_PX + 4,
                          "align": "left" if column == 0 else ("right" if column == last_column else "center")})
        nodes.append({
            "name": node_id, "depth": layout.depth.get(node_id, 0), "itemStyle": {"color": _hex(node_colour)},
            # A party that pays no one sits in the last column: its name goes
            # on its left, inside the picture.
            "label": label,
            "tooltip": {"formatter": _literal(names[node_id])},
        })
    any_pick = bool(highlighted or picked_parties)
    links = []
    for row in rows:
        source_id, target_id = ids[row.label]
        picked = any_pick and (row.label in highlighted or bool({row.source, row.target} & picked_parties))
        links.append({
            "name": row.label, "source": source_id, "target": target_id, "value": row.value,
            "lineStyle": {"color": _hex(theme.accent if picked else theme.bar_muted), "opacity": 0.75 if picked else SANKEY_EDGE_OPACITY},
            # A picked flow always shows its amount, in bold: its colour is not the only cue (rule 12).
            "edgeLabel": {"show": row.label in written or picked, "formatter": _literal(value_label(row, data)),
                          **_text_style(theme, MIN_FONT_PX, bold=picked)},
            "tooltip": _point_tooltip(row, data),
        })
    return {
        **frame,
        "tooltip": _tooltip(theme),
        "series": [{
            "type": "sankey", "name": p.spec.title, "left": 8, "right": 8, "top": top, "bottom": bottom,
            "nodeWidth": SANKEY_NODE_WIDTH, "nodeGap": SANKEY_NODE_GAP, "nodeAlign": "justify", "layoutIterations": 32,
            "draggable": False, "emphasis": {"focus": "adjacency"},
            "lineStyle": {"curveness": 0.5},
            "data": nodes, "links": links,
        }],
    }

TIMELINE_TOP, TIMELINE_BOTTOM = 96, 70     # px: the title block above, the source line and the date axis below
TIMELINE_AXIS = 24                         # px the date labels take under the plot
TIMELINE_ROW_MIN = MIN_FONT_PX + 6         # px: a row must be this tall to hold its name and its date (rule 14)
_STATUS_WORDS = {"reporter_reviewed": "reporter reviewed", "system_recorded": "system recorded"}
# A map's marks, as the app and the render service draw them
# (frontend/lib/basemap-style.ts, render/map.mjs): a dark brick red, 3.3:1
# against the grayscale base map's water (#a3a3a3) and 5.2:1 against its
# land (#cccccc), ringed in white; every place named at 13 px.
MAP_PLACE_COLOUR = "#8A2F1E"
MAP_LABEL_PX = 13
MAP_RADIUS, MAP_PICKED_RADIUS = 7, 10    # px: a place's dot, and a picked place's
MAP_ATTRIBUTION = "Map data © OpenStreetMap contributors"
# px of the picture the title and unit, and the source line, take above and
# below the map: the same room the other kinds' grids leave them. The option
# carries them, so the export (render_client.py) and the app
# (frontend/components/presentation/chart-map.tsx) place the map alike.
MAP_TOP, MAP_BOTTOM = 84, 44
_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def status_words(row: DataRow) -> str:
    """An event's verification status in plain words."""
    status = row.status or "asserted"
    return _STATUS_WORDS.get(status, status)


def _date_words(text: str | None) -> str:
    bounds = date_bounds(text)
    if bounds is None:
        return str(text or "")
    day, _last, precision = bounds
    if precision == "day":
        return f"{day.day} {_MONTH_NAMES[day.month - 1]} {day.year}"
    if precision == "month":
        return f"{_MONTH_NAMES[day.month - 1]} {day.year}"
    return str(day.year)


def when_text(row: DataRow) -> str:
    """An event's date as recorded, in words: '4 Mar 2021', 'Mar 2021
    (month only)', '4 Mar 2021 – 9 Jun 2022'."""
    start = date_bounds(row.start)
    if not row.end:
        if start is not None and start[2] != "day":
            return f"{_date_words(row.start)} ({start[2]} only)"
        return _date_words(row.start)
    span = event_span(row.start, row.end)
    text = f"{_date_words(row.start)} – {_date_words(row.end)}"
    return text if span is None or span[2] else f"{text} (not known to the day)"


def timeline_text(row: DataRow) -> str:
    """What is written beside an event: its date and how far it is verified."""
    return f"{when_text(row)} · {status_words(row)}"


def _utc_ms(day: date) -> int:
    return int(datetime(day.year, day.month, day.day, tzinfo=timezone.utc).timestamp() * 1000)


def timeline_marks(row: DataRow) -> tuple[int, ...]:
    """Where an event is drawn, in ms since 1970 (UTC): (day,) for a dot on
    an event known to the day, or (from, to) for a line from the start of
    its first day to the end of its last, so a month known only as a month
    covers the whole month. Empty when the row has no date."""
    span = event_span(row.start, row.end)
    if span is None:
        return ()
    lo, hi, exact = span
    if exact and not row.end:
        return (_utc_ms(lo),)
    return (_utc_ms(lo), _utc_ms(hi) + 86_400_000)


def timeline_exact(row: DataRow) -> bool:
    span = event_span(row.start, row.end)
    return bool(span and span[2])


def timeline_row_room(rows: int, height: int) -> float:
    """The height each event's row gets, in px."""
    return (height - TIMELINE_TOP - TIMELINE_BOTTOM - TIMELINE_AXIS) / max(rows, 1)


def _timeline(p: _Parts, frame: dict[str, Any]) -> dict[str, Any]:
    """timeline: one row per event, earliest at the top (the rows are given
    to the axis latest first, since a category axis runs upward; no axis is
    turned upside down, rule 7). A dot for a day, a line from start to end
    for an event that lasted (dashed when either end is known only to the
    month or year), and the date and status written beside every event."""
    theme, rows, highlighted = p.theme, p.rows, p.highlighted
    base = mark_colour(theme)
    points: list[dict[str, Any]] = []
    series: list[dict[str, Any]] = []
    ticks: list[int] = []
    for row in rows:
        marks = timeline_marks(row)
        if not marks:
            continue
        ticks.extend(marks)
        picked = row.label in highlighted
        colour = _hex(base if picked or not highlighted else theme.bar_muted)
        text = timeline_text(row)
        label = {"show": True, "position": "right", "formatter": _literal(text), **_text_style(theme, MIN_FONT_PX, bold=picked)}
        tip = {"formatter": _literal(f"{row.label}: {text}")}
        if len(marks) == 1:
            # Opaque, as the lines are (ECharts draws scatter points at 0.8 unless told).
            points.append({"name": row.label, "value": [marks[0], row.label], "symbol": FILLED_SYMBOL, "symbolSize": 12 if picked else 10,
                           "itemStyle": {"color": colour, "opacity": 1}, "label": label, "tooltip": tip})
            continue
        exact = timeline_exact(row)
        series.append({
            "type": "line", "name": row.label, "z": 2,
            "symbol": FILLED_SYMBOL, "symbolSize": 7, "showSymbol": True,
            "lineStyle": {"color": colour, "width": 6 if exact else 4, "type": "solid" if exact else "dashed"},
            "itemStyle": {"color": colour},
            # The date is written at the end of the line, inside the picture (the grid leaves it room).
            "data": [{"name": row.label, "value": [marks[0], row.label], "itemStyle": {"color": colour}, "label": {"show": False}, "tooltip": tip},
                     {"name": row.label, "value": [marks[1], row.label], "itemStyle": {"color": colour}, "label": label, "tooltip": tip}],
        })
    if points:
        series.append({"type": "scatter", "name": p.spec.title, "z": 3, "data": points})
    lo, hi = (min(ticks), max(ticks)) if ticks else (0, 0)
    # A little room either side of the first and last date (4% of the span,
    # or a month when there is one date), so no mark sits on the plot's edge.
    pad = max((hi - lo) * 0.04, 30 * 86_400_000 if hi == lo else 86_400_000)
    # A picked event is marked in bold beside its mark; its name on the axis
    # stays regular, since the axis cuts a long name to fit at the regular
    # weight and a bold one then runs off the picture's left edge.
    y_axis = _axis_category(theme, list(reversed(rows)), set(), axis_line=False)
    x_axis = {
        "type": "time", "min": int(lo - pad), "max": int(hi + pad),
        "axisLine": {"show": True, "lineStyle": {"color": _hex(theme.text), "width": 1.5}}, "axisTick": {"show": True},
        "axisLabel": {**_text_style(theme, MIN_FONT_PX, colour=theme.muted), "hideOverlap": True},
        # Only horizontal gridlines in the house style; a timeline's rows are its lines.
        "splitLine": {"show": False},
    }
    right = max(24, label_room([timeline_text(row) for row in rows]) + 12)
    return {
        **frame,
        # Dates are placed and written in UTC, as the data service reads them.
        "useUTC": True,
        "tooltip": _tooltip(theme),
        "grid": {"left": 8, "right": right, "top": TIMELINE_TOP, "bottom": TIMELINE_BOTTOM, "containLabel": True},
        "xAxis": x_axis,
        "yAxis": y_axis,
        "series": series,
    }


def coordinates_text(row: DataRow) -> str:
    """Where a place is, in words: 35.3364° N, 33.3199° E."""
    lat, lon = row.latitude or 0.0, row.longitude or 0.0
    return f"{abs(lat):g}° {'N' if lat >= 0 else 'S'}, {abs(lon):g}° {'E' if lon >= 0 else 'W'}"


def _map(p: _Parts, frame: dict[str, Any]) -> dict[str, Any]:
    """map: the places for MapLibre to draw on the base map, each named.
    A highlight makes the picked places' dots larger and their names bold;
    the others keep their colour, since a grey dot would vanish into the
    grayscale base map."""
    highlighted = p.highlighted
    places = []
    for row in p.rows:
        picked = row.label in highlighted
        places.append({
            "name": row.label, "longitude": row.longitude, "latitude": row.latitude, "colour": MAP_PLACE_COLOUR,
            "radius": MAP_PICKED_RADIUS if picked else MAP_RADIUS,
            "label": {"text": row.label, "fontSize": MAP_LABEL_PX, "fontWeight": "bold" if picked else "normal"},
        })
    return {**frame, "map": {"places": places, "flavor": "grayscale", "attribution": MAP_ATTRIBUTION, "top": MAP_TOP, "bottom": MAP_BOTTOM}}


# The grid (heatmap): the design doc's claim-strength grid. Each cell is
# shaded by how many claims sit in it, in HEATMAP_STEPS equal steps of the
# largest count from the page colour to the theme's accent (Axis Maps,
# "Data classification": equal intervals suit small whole counts; 3 to 7
# steps, as the design's rule 17 asks of a shaded map), an empty cell left
# the page colour with an outline. Every cell writes its count in black or
# white, whichever reads better on its shade (rule 11).
HEATMAP_STEPS = 4
HEATMAP_LABEL_PX = 14
HEATMAP_TOP, HEATMAP_BOTTOM = 96, 80


def _mix(page: str, accent: str, share: float) -> str:
    """A colour `share` of the way from `page` to `accent`, in sRGB."""
    a, b = page.lstrip("#"), accent.lstrip("#")
    channels = [round(int(a[i:i + 2], 16) * (1 - share) + int(b[i:i + 2], 16) * share) for i in (0, 2, 4)]
    return "#" + "".join(f"{c:02X}" for c in channels)


def heatmap_step(value: float, largest: float) -> int:
    """Which of the HEATMAP_STEPS shades a count takes: 0 for an empty
    cell, else 1 to HEATMAP_STEPS in equal intervals of the largest count."""
    if value <= 0 or largest <= 0:
        return 0
    return max(1, min(HEATMAP_STEPS, math.ceil(HEATMAP_STEPS * value / largest)))


def heatmap_fill(theme: Theme, step: int) -> str:
    return _hex(theme.page) if step == 0 else _mix(_hex(theme.page), _hex(theme.accent), step / HEATMAP_STEPS)


def heatmap_axes(rows: list[DataRow]) -> tuple[list[str], list[str]]:
    """The grid's columns and rows, in the order the data gives them."""
    return list(dict.fromkeys(r.across or "" for r in rows)), list(dict.fromkeys(r.down or "" for r in rows))


def heatmap_cell_text(row: DataRow, data: VisualData) -> str:
    count = int(row.value)
    return f"{count} {data.record_noun if count != 1 else singular(data.record_noun)}"


def _heatmap(p: _Parts, frame: dict[str, Any]) -> dict[str, Any]:
    """heatmap: one cell per pair of grades, evidence across (limited to
    robust) and agreement up (low to high), so confidence rises toward the
    top right as on the IPCC's grid. A highlight outlines the picked cells
    and writes their counts bold; the shading stays, since it carries the
    counts."""
    theme, rows = p.theme, p.rows
    across, down = heatmap_axes(rows)
    largest = max((r.value for r in rows), default=0.0)
    data = []
    for row in rows:
        fill = heatmap_fill(theme, heatmap_step(row.value, largest))
        picked = row.label in p.highlighted
        label: dict[str, Any] = {"show": True, "formatter": _literal(heatmap_cell_text(row, p.data)),
                                 **_text_style(theme, HEATMAP_LABEL_PX, colour=ink_on(fill), bold=picked)}
        data.append({
            "name": row.label, "value": [across.index(row.across or ""), down.index(row.down or ""), row.value],
            "itemStyle": {"color": fill, "borderColor": _hex(theme.text) if picked else _hex(theme.rule), "borderWidth": 3 if picked else 1},
            "label": label,
        })
    names = p.data.measure_labels
    axis_text = _text_style(theme, MIN_FONT_PX)
    return {
        **frame,
        "tooltip": _tooltip(theme),
        # Room on the left for the rotated "Agreement" name, which containLabel does not count.
        "grid": {"left": 40, "right": 24, "top": HEATMAP_TOP, "bottom": HEATMAP_BOTTOM, "containLabel": True},
        "xAxis": {"type": "category", "data": [a.capitalize() for a in across], "name": names.get("x", "Evidence →"), "nameLocation": "middle",
                  "nameGap": 32, "nameTextStyle": axis_text, "axisLabel": axis_text, "axisTick": {"show": False}, "splitArea": {"show": False}},
        "yAxis": {"type": "category", "data": [d.capitalize() for d in down], "name": names.get("y", "Agreement →"), "nameLocation": "middle",
                  "nameGap": 80, "nameRotate": 90, "nameTextStyle": axis_text, "axisLabel": axis_text, "axisTick": {"show": False}},
        # ECharts draws a heatmap only with a visualMap: its pieces are the
        # same steps as the cells' own colours (heatmap_step), kept off the
        # picture since every cell writes its count.
        "visualMap": {"type": "piecewise", "show": False, "dimension": 2, "seriesIndex": 0,
                      "pieces": [{"value": 0, "color": heatmap_fill(theme, 0)}] + [
                          {"gt": largest * (step - 1) / HEATMAP_STEPS, "lte": largest * step / HEATMAP_STEPS, "color": heatmap_fill(theme, step)}
                          for step in range(1, HEATMAP_STEPS + 1)] if largest > 0 else [{"value": 0, "color": heatmap_fill(theme, 0)}]},
        "series": [{"type": "heatmap", "name": p.spec.title, "data": data, "emphasis": {"disabled": True}}],
    }


def scatter_labels(rows: list[DataRow], label_points: str) -> set[str]:
    """Which points a scatter plot names: all of them when there are few
    (POINT_LABEL_LIMIT), else the outliers by Tukey's fences, unless the
    style asks for the outliers only."""
    if label_points != "outliers" and len(rows) <= POINT_LABEL_LIMIT:
        return {row.label for row in rows}
    picked = outlier_indexes([row.x or 0.0 for row in rows], [row.value for row in rows])
    return {rows[i].label for i in picked}


# --- the chart ------------------------------------------------------------------------

def build_option(spec: VisualSpec, data: VisualData, theme: Theme, *, width: int = DEFAULT_WIDTH, height: int = DEFAULT_HEIGHT,
                 draw: DrawOptions | None = None) -> dict[str, Any]:
    return build_chart(spec, data, theme, width=width, height=height, draw=draw).option


def _lower_first(text: str) -> str:
    """'Total received (USD)' -> 'total received (USD)': lower-cases the
    first letter only, so a currency code keeps its capitals."""
    return text[:1].lower() + text[1:]


def _subtitle(spec: VisualSpec, data: VisualData, kind: ChartKind) -> str:
    if spec.subtitle:
        return spec.subtitle
    unit = data.unit or spec.unit or ""
    if kind == ChartKind.histogram:
        return f"Number of {data.record_noun} in each amount range" + (f" ({unit})" if unit else "")
    if kind == ChartKind.scatter:
        names = data.measure_labels
        return f"{names.get('y', 'y')} against {_lower_first(names.get('x', 'x'))}"
    if kind == ChartKind.sankey:
        base = f"Money paid from left to right, band width by amount in {unit}" if unit else "Money paid from left to right"
        if flows_circle(data.rows):
            base += ("; the money also runs back the other way, so payers are drawn on the left and recipients on the right, "
                     "and a party can appear on both sides")
        return base
    if kind == ChartKind.map:
        return "Each place where its record puts it; nothing is looked up"
    if kind == ChartKind.heatmap:
        return (f"Number of {data.record_noun} in each cell, darker for more; "
                "the further right and up, the more evidence and the more it agrees")
    if kind == ChartKind.timeline:
        base = "Each event at its date, earliest first; a line runs from start to end"
        if any(timeline_marks(row) and not timeline_exact(row) for row in data.rows):
            base += ", dashed where a date is known only to the month or year"
        return base
    if kind in PART_OF_WHOLE_KINDS:
        base = f"Share of the total, amounts in {unit}" if data.unit_kind == "amount" and unit else f"Share of all {data.record_noun}"
        return base
    return f"{data.unit_kind.capitalize()}s in {unit}" if data.unit_kind == "amount" and unit else f"Number of {data.record_noun}"


def build_chart(spec: VisualSpec, data: VisualData, theme: Theme, *, width: int = DEFAULT_WIDTH, height: int = DEFAULT_HEIGHT,
                draw: DrawOptions | None = None) -> BuiltChart:
    """The option and its words for one chart. Raises UnsupportedChartKind
    for a kind not drawn yet and ChartDoesNotFit for a kind that cannot
    draw this query's rows."""
    if spec.kind not in DRAWN_KINDS:
        raise UnsupportedChartKind(f"chart kind {spec.kind.value!r} is not drawn yet; this pass draws {', '.join(sorted(k.value for k in DRAWN_KINDS))}")
    draw = draw or DrawOptions()
    if draw.binning not in BINNING_RULES:
        raise ChartDoesNotFit(f"unknown binning rule {draw.binning!r}; the rules are: {', '.join(BINNING_RULES)}")
    check_fit(spec, data)
    kind = spec.kind
    bins: list[tuple[float, float]] = []
    stages: dict[str, list[str]] = {}
    if kind == ChartKind.histogram:
        rows, bins = _histogram_rows(data, draw.binning)
    elif kind == ChartKind.sankey and draw.stages:
        if flows_circle(data.rows):
            raise ChartDoesNotFit("the money runs in a circle, so the parties have no order to group into stages; draw the full flow diagram")
        rows, stages = flow_stages(data.rows)
        # A party picked out picks out its stage; a staged flow can be picked by its own label.
        stage_of = {party: stage for stage, parties in stages.items() for party in parties}
        picked = [stage_of.get(name, name) for name in spec.highlight]
        spec = spec.model_copy(update={"highlight": list(dict.fromkeys(picked))})
    else:
        rows = prepare_rows(spec, data, draw)
    highlighted = {label for label in spec.highlight if any(row.label == label for row in rows)}
    shares: list[float] = []
    total: float | None = None
    if kind in PART_OF_WHOLE_KINDS:
        total = math.fsum(row.value for row in rows)
        shares = part_shares([row.value for row in rows]) or [0.0 for _ in rows]
    labelled = scatter_labels(rows, draw.label_points) if kind == ChartKind.scatter else set()
    source = source_line(data, rows, kind)
    words = _words(spec, data, rows, highlighted, kind, shares=shares, total=total, bins=bins, labelled=labelled, stages=stages)
    colours = part_colours(rows, theme, highlighted) if kind in PART_OF_WHOLE_KINDS else (
        [MAP_PLACE_COLOUR] if kind == ChartKind.map
        else [mark_colour(theme) if kind in (ChartKind.line, ChartKind.area, ChartKind.scatter, ChartKind.timeline) else theme.accent])
    subtitle = _subtitle(spec, data, kind)
    if stages and not spec.subtitle:
        unit = data.unit or spec.unit or ""
        subtitle = ("Money paid from stage to stage" + (f", band width by amount in {unit}" if unit else "")
                    + "; a stage groups the parties at the same place in the chain of payments")
    frame = _frame(spec, theme, subtitle, source, words["alt_text"], width, colours=colours)
    parts = _Parts(spec, data, theme, rows, highlighted, draw, width, height)
    if kind in (ChartKind.bar, ChartKind.column):
        option = _bars(parts, frame)
    elif kind in (ChartKind.line, ChartKind.area):
        option = _lines(parts, frame)
    elif kind == ChartKind.stacked_bar_100:
        option = _whole_bar(parts, frame, shares, total or 0.0)
    elif kind == ChartKind.donut:
        option = _donut(parts, frame, shares, total or 0.0)
    elif kind == ChartKind.treemap:
        option = _treemap(parts, frame, shares)
    elif kind == ChartKind.histogram:
        option = _histogram(parts, frame)
    elif kind == ChartKind.sankey:
        option = _sankey(parts, frame)
    elif kind == ChartKind.timeline:
        option = _timeline(parts, frame)
    elif kind == ChartKind.map:
        option = _map(parts, frame)
    elif kind == ChartKind.heatmap:
        option = _heatmap(parts, frame)
    else:
        option = _scatter(parts, frame, labelled)
    return BuiltChart(
        option=option, alt_text=words["alt_text"], description=words["description"], data_table=words["data_table"],
        source_line=source, rows=rows, highlighted_labels=sorted(highlighted),
        single_record_labels=[row.label for row in rows if row.record_count == 1], width=width, height=height,
        kind=kind, draw=draw, shares=shares, total=total, bins=bins, labelled_points=sorted(labelled), stages=stages,
    )


# --- the words beside the chart (rule 13) -------------------------------------------------

def _table_row(row: DataRow, data: VisualData) -> dict[str, Any]:
    return {"label": row.label, "value": row.value, "formatted": format_value(row.value, data), "record_count": row.record_count,
            "record_refs": [ref.as_dict() for ref in row.record_refs]}


def _words(spec: VisualSpec, data: VisualData, rows: list[DataRow], highlighted: set[str], kind: ChartKind, *,
           shares: list[float], total: float | None, bins: list[tuple[float, float]], labelled: set[str],
           stages: dict[str, list[str]] | None = None) -> dict[str, Any]:
    name = KIND_LABELS.get(kind, kind.value)
    unit = data.unit or spec.unit or ""
    columns = ["Label", f"Value ({unit})", "Records"]
    if not rows:
        alt = f"{name}: {spec.title}. No data."
        return {"alt_text": alt, "description": alt, "data_table": {"columns": columns, "rows": []}}
    by_value = sorted(rows, key=lambda r: (-r.value, r.label.lower()))
    largest, smallest = by_value[0], by_value[-1]
    count = len(rows)
    table_rows = [_table_row(row, data) for row in rows]
    lines: list[str] = []
    if kind == ChartKind.histogram:
        records = int(sum(row.value for row in rows))
        step = bins[0][1] - bins[0][0] if bins else 0.0
        alt = (f"{name}: {spec.title}. {records} {data.record_noun if records != 1 else singular(data.record_noun)} in {count} "
               f"bin{'s' if count != 1 else ''} of {format_exact(step, data)} from {format_exact(bins[0][0], data)} to {format_exact(bins[-1][1], data)}. "
               f"Most in {largest.label} ({int(largest.value)}).")
        columns = [f"Amount range ({unit})" if unit else "Range", f"Number of {data.record_noun}", "Records"]
        for row, table_row in zip(rows, table_rows):
            table_row["formatted"] = f"{int(row.value):,}"
            mark = f" ({SINGLE_RECORD_MARK} one record)" if row.record_count == 1 else ""
            lines.append(f"{row.label}: {int(row.value)} {data.record_noun if row.value != 1 else singular(data.record_noun)}{mark}.")
    elif kind == ChartKind.scatter:
        names = data.measure_labels
        alt = (f"{name}: {spec.title}. {count} part{'ies' if count != 1 else 'y'}, {_lower_first(names.get('y', 'y'))} against {_lower_first(names.get('x', 'x'))}. "
               f"Highest: {largest.label} at {format_value(largest.value, data)} from {count_phrase(largest, data)}.")
        columns = ["Label", names.get("x", "x"), names.get("y", f"Value ({unit})"), "Records"]
        for row, table_row in zip(rows, table_rows):
            table_row["x"] = row.x
            table_row["x_formatted"] = format_x(row, data)
            mark = f" ({SINGLE_RECORD_MARK} one record)" if row.record_count == 1 else ""
            lines.append(f"{row.label}: {table_row['x_formatted']} and {format_value(row.value, data)}, from {count_phrase(row, data)}{mark}.")
        named = sorted(labelled)
        if named and len(named) < count:
            lines.append("Named on the chart: " + ", ".join(named) + ".")
    elif kind in PART_OF_WHOLE_KINDS:
        whole = format_value(total or 0.0, data)
        top_share = shares[rows.index(largest)] if shares else 0.0
        alt = (f"{name}: {spec.title}. {count} part{'s' if count != 1 else ''} of {whole} {unit if data.unit_kind == 'count' else ''}".rstrip()
               + f". Largest: {largest.label} at {format_share(top_share)} ({format_value(largest.value, data)}).")
        columns = ["Label", f"Value ({unit})", "Share", "Records"]
        for row, share, table_row in zip(rows, shares, table_rows):
            table_row["share"] = round(share, 1)
            lines.append(f"{row.label}: {part_value_text(row, share, data)}.")
    elif kind == ChartKind.heatmap:
        filled = [row for row in rows if row.value > 0]
        alt = (f"{name}: {spec.title}. {int(sum(r.value for r in rows))} {data.record_noun} in {len(filled)} of {count} cells"
               + (f"; most in {largest.label} ({heatmap_cell_text(largest, data)})." if filled else "."))
        columns = ["Cell", f"Number of {data.record_noun}", "Records"]
        for row, table_row in zip(rows, table_rows):
            table_row["formatted"] = f"{int(row.value):,}"
            table_row["across"], table_row["down"] = row.across, row.down
            lines.append(f"{row.label}: {heatmap_cell_text(row, data)}.")
    elif kind == ChartKind.map:
        shown = ", ".join(row.label for row in rows[:8]) + (f", and {count - 8} more" if count > 8 else "")
        alt = f"{name}: {spec.title}. {count} place{'s' if count != 1 else ''}: {shown}."
        columns = ["Place", "Where", "Records"]
        for row, table_row in zip(rows, table_rows):
            table_row["formatted"] = coordinates_text(row)
            table_row["latitude"], table_row["longitude"] = row.latitude, row.longitude
            lines.append(f"{row.label}: {coordinates_text(row)}.")
    elif kind == ChartKind.timeline:
        first, last = rows[0], rows[-1]
        alt = (f"{name}: {spec.title}. {count} event{'s' if count != 1 else ''} from {when_text(first)} ({first.label}) "
               f"to {when_text(last)} ({last.label}).")
        columns = ["Event", "When", "Status", "Records"]
        for row, table_row in zip(rows, table_rows):
            table_row["formatted"] = when_text(row)
            table_row["start"], table_row["status"] = row.start, status_words(row)
            if row.end:
                table_row["end"] = row.end
            lines.append(f"{row.label}: {timeline_text(row)}.")
    elif data.series_kind == "flows":
        parties = {row.source for row in rows} | {row.target for row in rows}
        alt = (f"{name}: {spec.title}. {count} flow{'s' if count != 1 else ''} between {len(parties)} parties, amounts in {unit}. "
               f"Largest: {largest.label} at {format_value(largest.value, data)}; smallest: {smallest.label} at {format_value(smallest.value, data)}.")
        if stages:
            parties_in = sum(len(p) for p in stages.values())
            alt = (f"{name}: {spec.title}. {count} flow{'s' if count != 1 else ''} between {len(stages)} stages of {parties_in} parties, "
                   f"amounts in {unit}. Largest: {largest.label} at {format_value(largest.value, data)}.")
            lines.extend(f"{stage.split(':', 1)[0]}: {', '.join(parties)}." for stage, parties in stages.items())
        elif kind == ChartKind.sankey and flows_circle(rows):
            alt += " The money also runs back the other way, so payers are drawn on the left and recipients on the right."
        columns = ["Flow", "From", "To", f"Value ({unit})", "Records"]
        for row, table_row in zip(rows, table_rows):
            table_row["source"], table_row["target"] = row.source, row.target
            mark = f" ({SINGLE_RECORD_MARK} one record)" if row.record_count == 1 else ""
            lines.append(f"{row.label}: {format_value(row.value, data)}, from {count_phrase(row, data)}{mark}.")
    else:
        if data.series_kind == "time":
            span = f"from {rows[0].label} to {rows[-1].label}"
            alt = (f"{name}: {spec.title}. {count} period{'s' if count != 1 else ''} {span}, {data.unit_kind}s in {unit}. "
                   f"Highest: {largest.label} at {format_value(largest.value, data)}.")
        else:
            alt = (f"{name}: {spec.title}. {count} group{'s' if count != 1 else ''} ranked by {unit}. "
                   f"Largest: {largest.label} at {format_value(largest.value, data)}; smallest: {smallest.label} at {format_value(smallest.value, data)}.")
        for row in rows:
            mark = f" ({SINGLE_RECORD_MARK} one record)" if row.record_count == 1 else ""
            lines.append(f"{row.label}: {format_value(row.value, data)}, from {count_phrase(row, data)}{mark}.")
    sentences = [alt]
    if highlighted:
        sentences.append("Highlighted: " + ", ".join(sorted(highlighted)) + ".")
    sentences.extend(lines)
    sentences.append(source_line(data, rows, kind) + ".")
    for item in data.omitted:
        if item.get("reason") != "other currency":
            sentences.append(f"Left out ({item.get('reason')}): {item.get('detail') or item.get('record_id')}.")
    return {"alt_text": alt, "description": " ".join(sentences), "data_table": {"columns": columns, "rows": table_rows}}
