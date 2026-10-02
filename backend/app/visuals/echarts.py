"""The drawing: an ECharts option in the house style, plus the words that
go with it (alt text, a longer description, the data table).

House style, from the design doc's reference gallery (BBC Visual and Data
Journalism cookbook; Datawrapper; Urban Institute): the title states the
finding, the subtitle gives the unit, only horizontal gridlines, a dark zero
line, values written on the bars, no 3D, a zero baseline, at most eight
colours with the rest folded into "Other", and every chart carries a source
line. Colours and fonts come from the deck theme
(app/services/presentation_style.py), never from here.

The option is built from the spec and the data alone and is deterministic:
the rows are sorted the same way whatever order they arrive in (the
metamorphic tests in tests/test_visuals_echarts.py hold it to that).
Animation is off because the option is drawn on a server with no frames
(render/server.mjs) and in a browser that should show the finished chart.

Pass 2 draws bar and column charts. `build_chart` raises
UnsupportedChartKind for the rest; pass 3 adds them here without touching
the spec, the data service or the checker.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.services.presentation_style import Theme
from app.visuals.data_service import DataRow, RecordRef, VisualData
from app.visuals.spec import COLOUR_PER_CATEGORY_KINDS, DRAWN_KINDS, ChartKind, SortOrder, VisualSpec

DEFAULT_WIDTH, DEFAULT_HEIGHT = 960, 540   # 16:9, the deck's own ratio
MIN_FONT_PX = 12                           # design rule 14
MAX_COLOURS = 8                            # design rule 10
OTHER_LABEL = "Other"
SINGLE_RECORD_MARK = "†"                   # design rule 20: a value resting on one record

_CURRENCY_SYMBOLS = {"USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "CHF": "CHF ", "CAD": "C$", "AUD": "A$"}
_KIND_LABELS = {
    ChartKind.bar: "Bar chart", ChartKind.column: "Column chart", ChartKind.line: "Line chart", ChartKind.area: "Area chart",
    ChartKind.stacked_bar_100: "100% bar", ChartKind.donut: "Donut chart", ChartKind.treemap: "Treemap",
    ChartKind.histogram: "Histogram", ChartKind.scatter: "Scatter plot", ChartKind.timeline: "Timeline", ChartKind.sankey: "Flow diagram",
}


class UnsupportedChartKind(ValueError):
    """The spec names a kind this pass does not draw yet."""


@dataclass
class BuiltChart:
    option: dict[str, Any]
    alt_text: str
    description: str
    data_table: dict[str, Any]
    source_line: str
    rows: list[DataRow]                    # as drawn: sorted, folded
    highlighted_labels: list[str] = field(default_factory=list)
    single_record_labels: list[str] = field(default_factory=list)
    width: int = DEFAULT_WIDTH
    height: int = DEFAULT_HEIGHT

    def text(self) -> dict[str, Any]:
        """The words stored beside the chart in a draft (rule 13)."""
        return {"alt_text": self.alt_text, "description": self.description, "data_table": self.data_table, "source_line": self.source_line}


# --- values and words --------------------------------------------------------------

def singular(noun: str) -> str:
    specials = {"entities": "entity", "evidence records": "evidence record"}
    if noun in specials:
        return specials[noun]
    return noun[:-1] if noun.endswith("s") else noun


def format_value(value: float, data: VisualData) -> str:
    """'$2.4M', '285K', '1,200' for amounts; '3' for counts. Compact on
    purpose: a label on a bar is read at a glance, the data table has the
    exact figure."""
    if data.unit_kind == "count":
        return f"{int(round(value)):,}"
    code = (data.currency or data.unit or "").upper()
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


def _count_phrase(row: DataRow, data: VisualData) -> str:
    noun = data.record_noun if row.record_count != 1 else singular(data.record_noun)
    return f"{row.record_count} {noun}"


def value_label(row: DataRow, data: VisualData) -> str:
    """What is written on the bar: the value, how many records sit behind
    it (rule 16) and the single-record mark (rule 20)."""
    text = format_value(row.value, data)
    if data.unit_kind == "amount":
        text += f" · {_count_phrase(row, data)}"
    if row.record_count == 1:
        text += f" {SINGLE_RECORD_MARK}"
    return text


def source_line(data: VisualData, rows: list[DataRow]) -> str:
    parts = [f"Source: {data.record_count} {data.record_noun if data.record_count != 1 else singular(data.record_noun)} in this investigation's records ({data.query})"]
    if any(row.record_count == 1 for row in rows):
        parts.append(f"{SINGLE_RECORD_MARK} rests on one record")
    other = [o for o in data.omitted if o.get("reason") == "other currency"]
    if other:
        parts.append("not shown: " + ", ".join(f"{o['record_count']} in {o['currency']}" for o in other))
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


def prepare_rows(spec: VisualSpec, data: VisualData) -> list[DataRow]:
    """The rows in drawing order: sorted as the spec asks (largest first
    unless it says otherwise, time order for a time series) and folded past
    the spec's limit (the top N plus "Other"), or, for a kind that colours
    each category, past seven categories so that "Other" makes eight
    colours (rule 10)."""
    rows = _sort_rows(list(data.rows), spec.effective_sort())
    if data.series_kind == "category":
        keep = spec.limit if spec.limit is not None else (MAX_COLOURS - 1 if spec.kind in COLOUR_PER_CATEGORY_KINDS else None)
        if keep is not None:
            rows = _fold(rows, keep)
    return rows


# --- the option ----------------------------------------------------------------------

def _hex(colour: str) -> str:
    return colour if colour.startswith("#") else f"#{colour}"


def _text_style(theme: Theme, size: int, *, colour: str | None = None, bold: bool = False, heading: bool = False) -> dict[str, Any]:
    style: dict[str, Any] = {"fontFamily": theme.heading_font if heading else theme.body_font, "fontSize": size, "color": _hex(colour or theme.text)}
    if bold:
        style["fontWeight"] = "bold"
    return style


def _axis_category(theme: Theme, rows: list[DataRow], highlighted: set[str]) -> dict[str, Any]:
    return {
        "type": "category",
        "data": [{"value": row.label, "textStyle": {"fontWeight": "bold" if row.label in highlighted else "normal"}} for row in rows],
        # The dark zero line (BBC style): the category axis sits at zero.
        "axisLine": {"show": True, "lineStyle": {"color": _hex(theme.text), "width": 1.5}},
        "axisTick": {"show": False},
        "axisLabel": {**_text_style(theme, MIN_FONT_PX), "interval": 0, "width": 220, "overflow": "truncate"},
        "splitLine": {"show": False},
    }


def _axis_value(theme: Theme, rows: list[DataRow], *, gridlines: bool) -> dict[str, Any]:
    floor = min(0.0, min((row.value for row in rows), default=0.0))
    return {
        "type": "value",
        "min": floor,                      # bars start at zero (rule 1)
        "scale": False,
        "axisLine": {"show": False},
        "axisTick": {"show": False},
        "axisLabel": {"show": False},      # the values are written on the bars
        "splitLine": {"show": gridlines, "lineStyle": {"color": _hex(theme.rule), "width": 1}},
    }


def _series(spec: VisualSpec, data: VisualData, theme: Theme, rows: list[DataRow], highlighted: set[str], *, horizontal: bool) -> dict[str, Any]:
    muted_bars = bool(highlighted)
    points = []
    for row in rows:
        picked = row.label in highlighted
        colour = theme.accent if (picked or not muted_bars) else theme.bar_muted
        points.append({
            "name": row.label,
            "value": row.value,
            "itemStyle": {"color": _hex(colour)},
            "label": {
                "show": True,
                "position": "right" if horizontal else "top",
                # A literal string; ECharts reads braces as a template, so none are used.
                "formatter": value_label(row, data).replace("{", "(").replace("}", ")"),
                **_text_style(theme, MIN_FONT_PX, bold=picked),
            },
        })
    return {"type": "bar", "name": spec.title, "barMaxWidth": 36, "barCategoryGap": "35%", "data": points}


def build_option(spec: VisualSpec, data: VisualData, theme: Theme, *, width: int = DEFAULT_WIDTH, height: int = DEFAULT_HEIGHT) -> dict[str, Any]:
    return build_chart(spec, data, theme, width=width, height=height).option


def build_chart(spec: VisualSpec, data: VisualData, theme: Theme, *, width: int = DEFAULT_WIDTH, height: int = DEFAULT_HEIGHT) -> BuiltChart:
    """The option and its words for a bar or column chart."""
    if spec.kind not in DRAWN_KINDS:
        raise UnsupportedChartKind(f"chart kind {spec.kind.value!r} is not drawn yet; pass 2 draws {', '.join(sorted(k.value for k in DRAWN_KINDS))}")
    rows = prepare_rows(spec, data)
    highlighted = {label for label in spec.highlight if any(row.label == label for row in rows)}
    horizontal = spec.kind == ChartKind.bar
    unit = data.unit or spec.unit or ""
    subtitle = spec.subtitle or (f"{data.unit_kind.capitalize()}s in {unit}" if data.unit_kind == "amount" and unit else f"Number of {data.record_noun}")
    source = source_line(data, rows)
    words = _words(spec, data, rows, highlighted)
    text_width = width - 48

    # ECharts draws the first category of a horizontal bar chart at the bottom;
    # reversing the rows keeps the first row first, without inverting an axis.
    drawn = list(reversed(rows)) if horizontal else rows
    category_axis = _axis_category(theme, drawn, highlighted)
    value_axis = _axis_value(theme, drawn, gridlines=not horizontal)
    option: dict[str, Any] = {
        "animation": False,
        "backgroundColor": _hex(theme.page),
        "color": [_hex(theme.accent)],
        "textStyle": _text_style(theme, MIN_FONT_PX),
        "title": [
            {"id": "title", "text": spec.title, "subtext": subtitle, "left": 0, "top": 0,
             "textStyle": {**_text_style(theme, 18, bold=True, heading=True), "width": text_width, "overflow": "break"},
             "subtextStyle": {**_text_style(theme, 13, colour=theme.muted), "width": text_width, "overflow": "break"}},
            {"id": "source", "text": source, "left": 0, "bottom": 0,
             "textStyle": {**_text_style(theme, MIN_FONT_PX, colour=theme.muted), "width": text_width, "overflow": "break"}},
        ],
        "grid": {"left": 0, "right": 24 if horizontal else 8, "top": 84, "bottom": 44, "containLabel": True},
        "xAxis": value_axis if horizontal else category_axis,
        "yAxis": category_axis if horizontal else value_axis,
        "series": [_series(spec, data, theme, drawn, highlighted, horizontal=horizontal)],
        "aria": {"enabled": True, "label": {"enabled": True, "description": words["alt_text"]}},
    }
    if not horizontal:
        # Column labels stand on the columns; give the tallest one head room.
        option["grid"]["top"] = 96
    return BuiltChart(
        option=option, alt_text=words["alt_text"], description=words["description"], data_table=words["data_table"],
        source_line=source, rows=rows, highlighted_labels=sorted(highlighted),
        single_record_labels=[row.label for row in rows if row.record_count == 1], width=width, height=height,
    )


def _words(spec: VisualSpec, data: VisualData, rows: list[DataRow], highlighted: set[str]) -> dict[str, Any]:
    kind = _KIND_LABELS.get(spec.kind, spec.kind.value)
    unit = data.unit or spec.unit or ""
    if not rows:
        alt = f"{kind}: {spec.title}. No data."
        return {"alt_text": alt, "description": alt, "data_table": {"columns": ["Label", f"Value ({unit})", "Records"], "rows": []}}
    by_value = sorted(rows, key=lambda r: (-r.value, r.label.lower()))
    largest, smallest = by_value[0], by_value[-1]
    count = len(rows)
    if data.series_kind == "time":
        span = f"from {rows[0].label} to {rows[-1].label}"
        alt = (f"{kind}: {spec.title}. {count} period{'s' if count != 1 else ''} {span}, {data.unit_kind}s in {unit}. "
               f"Highest: {largest.label} at {format_value(largest.value, data)}.")
    else:
        alt = (f"{kind}: {spec.title}. {count} group{'s' if count != 1 else ''} ranked by {unit}. "
               f"Largest: {largest.label} at {format_value(largest.value, data)}; smallest: {smallest.label} at {format_value(smallest.value, data)}.")
    sentences = [alt]
    if highlighted:
        sentences.append("Highlighted: " + ", ".join(sorted(highlighted)) + ".")
    for row in rows:
        mark = f" ({SINGLE_RECORD_MARK} one record)" if row.record_count == 1 else ""
        sentences.append(f"{row.label}: {format_value(row.value, data)}, from {_count_phrase(row, data)}{mark}.")
    sentences.append(source_line(data, rows) + ".")
    for item in data.omitted:
        if item.get("reason") != "other currency":
            sentences.append(f"Left out ({item.get('reason')}): {item.get('detail') or item.get('record_id')}.")
    table = {
        "columns": ["Label", f"Value ({unit})", "Records"],
        "rows": [{"label": row.label, "value": row.value, "formatted": format_value(row.value, data), "record_count": row.record_count,
                  "record_refs": [ref.as_dict() for ref in row.record_refs]} for row in rows],
    }
    return {"alt_text": alt, "description": " ".join(sentences), "data_table": table}
