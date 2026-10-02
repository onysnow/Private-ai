"""The fact-checker: tests a chart against its data and the design rules.

Every finding carries the rule number from the design doc ("How every chart
gets checked", 20 rules, numbers fixed) and a plain-words message. An error
keeps the chart out of a draft; a warning travels with it so the reviewer
sees it.

Rule 0 is not a design rule but the design's first automatic check ("do
the numbers match?", after VisEval): every point in the drawn option must
carry a value the data service produced, under its own label. Reading the
values back out of the rendered image itself is pass-3 work.

What each rule is judged from:

* the order slip alone: 2 (log scale), 3 (negative sizes), 4 (stacking),
  5 (donut slices), 8 (lines over categories), 13 (the title);
* the data: 15 (records behind every value), 16 (how many records, and
  groups more than ten times apart), 19 (currencies), 20 (values resting on
  one record);
* the theme: 11 (text and colour contrast, WCAG ratios);
* the drawn option, when the kind can be drawn: 1 (zero baseline), 6 (one
  value axis), 7 (no 3D, no inverted axis), 9 (no random colours on an
  order), 10 (at most eight colours), 12 (a non-colour mark on highlighted
  bars), 13 (alt text, description and data table present), 14 (text at
  least 12 px), 15 (the source line), 16 (counts written on the chart),
  20 (the single-record mark).

Not checkable here, and reported as such: rule 17 (shaded maps: rates not
counts, three to seven steps, a fair-area projection) belongs to the maps
pass, and rule 18 (a grid view for networks over about twenty nodes,
crossing counts) to the networks pass. Rule 4's second half (never group
and total the same field twice) needs a second series, which no query
returns until pass 3. Rules that need the drawn option are reported as not
checked for a kind this pass cannot draw yet.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.services.presentation_style import Theme, contrast_ratio
from app.visuals.data_service import DataRow, VisualData
from app.visuals.echarts import MIN_FONT_PX, SINGLE_RECORD_MARK, BuiltChart, UnsupportedChartKind, build_chart, prepare_rows
from app.visuals.spec import (
    COLOUR_PER_CATEGORY_KINDS, LENGTH_KINDS, LINE_KINDS, QUERY_CATALOG, SIZE_KINDS, STACKABLE_KINDS, ChartKind, Scale, SortOrder,
    VisualSpec,
)

MAX_PIE_SLICES = 4            # rule 5 (Datawrapper)
MAX_COLOURS, HARD_MAX_COLOURS = 8, 20   # rule 10 (VizLinter; Okabe-Ito)
MAX_PERIODS = 36              # rule 7: three years of months still labels; past that, ask for years
RECORD_COUNT_SPREAD = 10      # rule 16 (our own threshold)
TEXT_CONTRAST, LARGE_TEXT_CONTRAST, GRAPHIC_CONTRAST = 4.5, 3.0, 3.0   # rule 11 (WCAG 1.4.3, 1.4.11)
MIN_TITLE_WORDS = 3           # rule 13: "Payments" names the data; a finding takes a sentence

NOT_CHECKABLE_HERE = {
    17: "shaded maps are judged in the maps pass",
    18: "network layouts are judged in the networks pass",
}


@dataclass(frozen=True)
class CheckItem:
    rule: int
    message: str

    def as_dict(self) -> dict[str, Any]:
        return {"rule": self.rule, "message": self.message}


@dataclass
class CheckReport:
    ok: bool
    errors: list[CheckItem] = field(default_factory=list)
    warnings: list[CheckItem] = field(default_factory=list)
    checked_rules: list[int] = field(default_factory=list)
    not_checked: dict[int, str] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "errors": [e.as_dict() for e in self.errors],
            "warnings": [w.as_dict() for w in self.warnings],
            "checked_rules": sorted(self.checked_rules),
            "not_checked": {str(k): v for k, v in sorted(self.not_checked.items())},
        }

    def error_rules(self) -> list[int]:
        return sorted({e.rule for e in self.errors})


class _Checker:
    def __init__(self, spec: VisualSpec, data: VisualData, theme: Theme, built: BuiltChart | None):
        self.spec, self.data, self.theme, self.built = spec, data, theme, built
        self.rows: list[DataRow] = built.rows if built else prepare_rows(spec, data)
        self.option: dict[str, Any] | None = built.option if built else None
        self.errors: list[CheckItem] = []
        self.warnings: list[CheckItem] = []
        self.checked: set[int] = set()
        self.not_checked: dict[int, str] = dict(NOT_CHECKABLE_HERE)

    def error(self, rule: int, message: str) -> None:
        self.errors.append(CheckItem(rule, message))
        self.checked.add(rule)

    def warn(self, rule: int, message: str) -> None:
        self.warnings.append(CheckItem(rule, message))
        self.checked.add(rule)

    def passed(self, rule: int) -> None:
        self.checked.add(rule)

    def needs_option(self, rule: int) -> bool:
        if self.option is None:
            self.not_checked[rule] = f"needs the drawn option; chart kind {self.spec.kind.value!r} is not drawn yet"
            return False
        return True

    # --- option helpers ---------------------------------------------------------
    def axes(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for key in ("xAxis", "yAxis"):
            axis = (self.option or {}).get(key)
            if isinstance(axis, list):
                out.extend(a for a in axis if isinstance(a, dict))
            elif isinstance(axis, dict):
                out.append(axis)
        return out

    def value_axes(self) -> list[dict[str, Any]]:
        return [a for a in self.axes() if a.get("type") in ("value", "log")]

    def series(self) -> list[dict[str, Any]]:
        series = (self.option or {}).get("series") or []
        return [s for s in (series if isinstance(series, list) else [series]) if isinstance(s, dict)]

    def item_colours(self) -> list[str]:
        colours: list[str] = []
        for series in self.series():
            for item in series.get("data") or []:
                colour = ((item.get("itemStyle") or {}).get("color") if isinstance(item, dict) else None)
                if colour is None:
                    colour = (series.get("itemStyle") or {}).get("color") or ((self.option or {}).get("color") or ["default"])[0]
                colours.append(str(colour).lower())
        return colours

    def titles(self) -> list[dict[str, Any]]:
        title = (self.option or {}).get("title") or []
        return [t for t in (title if isinstance(title, list) else [title]) if isinstance(t, dict)]

    def category_axis_labels(self) -> dict[str, dict[str, Any]]:
        """label -> the axis data item (a dict or a bare string)."""
        out: dict[str, dict[str, Any]] = {}
        for axis in self.axes():
            if axis.get("type") != "category":
                continue
            for item in axis.get("data") or []:
                if isinstance(item, dict):
                    out[str(item.get("value"))] = item
                else:
                    out[str(item)] = {"value": item}
        return out

    def bar_label_text(self) -> dict[str, str]:
        """category name -> the text written on its bar."""
        out: dict[str, str] = {}
        for series in self.series():
            for item in series.get("data") or []:
                if isinstance(item, dict):
                    formatter = (item.get("label") or {}).get("formatter")
                    if isinstance(formatter, str):
                        out[str(item.get("name"))] = formatter
        return out

    def values_labelled(self) -> bool:
        """True when every bar carries its value, on the item or the series."""
        for series in self.series():
            series_label = series.get("label") or {}
            for item in series.get("data") or []:
                label = (item.get("label") or {}) if isinstance(item, dict) else {}
                if not label.get("show", series_label.get("show", False)):
                    return False
        return bool(self.series())

    # --- the rules -----------------------------------------------------------------
    def run(self) -> CheckReport:
        spec, data, rows = self.spec, self.data, self.rows
        kind = spec.kind
        values = [row.value for row in rows]
        drawn = [row for row in rows if row.value != 0 or row.record_count]

        # Nothing to draw is caught first; the other rules assume rows.
        if not rows or not any(values):
            self.error(15, f"the query {data.query!r} returned no records for this investigation; there is nothing to chart")

        # 0. The numbers match (the design's first check, after VisEval): every
        # point drawn carries a value the data service produced, under that
        # value's own label, and nothing is drawn twice or left out.
        if self.option is not None:
            drawn_points = sorted(((str(p.get("name")), float(p.get("value", 0))) for s in self.series() for p in (s.get("data") or []) if isinstance(p, dict)), key=str)
            expected = sorted(((row.label, float(row.value)) for row in rows), key=str)
            if drawn_points != expected:
                self.error(0, f"the values drawn do not match the data: drawn {drawn_points}, data {expected}")
            self.passed(0)
        else:
            self.not_checked[0] = f"needs the drawn option; chart kind {kind.value!r} is not drawn yet"

        # 1. Bars and areas start at zero.
        if kind in LENGTH_KINDS or kind in (ChartKind.area, ChartKind.stacked_bar_100):
            if self.needs_option(1):
                floor = min(0.0, min(values, default=0.0))
                for axis in self.value_axes():
                    if axis.get("min") != floor or axis.get("scale"):
                        self.error(1, f"the value axis must start at {floor:g} so bar lengths are honest; it starts at {axis.get('min')!r}")
                if not self.value_axes():
                    self.error(1, "the option has no value axis, so the zero baseline cannot be confirmed")
                self.passed(1)
        else:
            self.passed(1)

        # 2. No log scale on bars or areas, or on data with zero or negative values.
        if spec.scale == Scale.log:
            if kind in LENGTH_KINDS or kind in SIZE_KINDS:
                self.error(2, f"a log scale would misstate {kind.value} lengths; use a linear scale")
            if any(v <= 0 for v in values):
                self.error(2, "a log scale cannot show zero or negative values; this data has them")
        if self.option is not None and any(a.get("type") == "log" for a in self.axes()) and (kind in LENGTH_KINDS or kind in SIZE_KINDS):
            self.error(2, "the drawn option uses a log axis on a bar or area chart")
        self.passed(2)

        # 3. Never show a negative value as a size.
        negatives = [row.label for row in rows if row.value < 0]
        if negatives and kind in SIZE_KINDS:
            self.error(3, f"a {kind.value} shows each value as an area or angle, which cannot show a negative value: {', '.join(negatives)}")
        elif negatives:
            self.warn(3, f"negative values draw as bars pointing the other way; make sure the axis makes that clear: {', '.join(negatives)}")
        self.passed(3)

        # 4. Stack only bars and areas.
        if spec.stack and kind not in STACKABLE_KINDS:
            self.error(4, f"only bars and areas can be stacked, not a {kind.value}")
        self.passed(4)

        # 5. Pie or donut: four slices at most, adding to 100%. The slices add
        # up by construction here (shares are computed from the values the
        # data service summed), so only the count can fail.
        if kind == ChartKind.donut and len(rows) > MAX_PIE_SLICES:
            self.error(5, f"a donut holds at most {MAX_PIE_SLICES} slices; this one would have {len(rows)}. Use a 100% bar (stacked_bar_100) or bars instead")
        self.passed(5)

        # 6. No second value axis.
        if self.needs_option(6):
            if len(self.value_axes()) > 1:
                self.error(6, "the chart has two value axes; use two charts side by side instead")
            if any(s.get("yAxisIndex") or s.get("xAxisIndex") for s in self.series()):
                self.error(6, "a series is drawn against a second axis; use two charts side by side instead")
            self.passed(6)

        # 7. No 3D, no upside-down axes, evenly spaced ticks.
        if self.needs_option(7):
            if any(k.endswith("3D") for k in (self.option or {})) or any("3D" in str(s.get("type", "")) for s in self.series()):
                self.error(7, "3D charts distort every comparison; draw it flat")
            for axis in self.axes():
                if axis.get("inverse"):
                    self.error(7, "an axis is drawn upside down (inverse); keep up meaning more")
            self.passed(7)
        if data.series_kind == "time" and len(rows) > 1:
            keys = [row.key for row in rows]
            if keys != sorted(keys) or len(set(keys)) != len(keys) or not _consecutive_periods(keys):
                self.error(7, "the periods are not consecutive, so the ticks would not be evenly spaced; a quiet period must still appear as zero")
            if len(rows) > MAX_PERIODS:
                self.warn(7, f"{len(rows)} periods is too many to label; ask for granularity=year, or a narrower question")
            self.passed(7)

        # 8. Never join unrelated categories with a line.
        if kind in LINE_KINDS and data.series_kind != "time":
            self.error(8, f"a {kind.value} joins its points with a line, which suggests an order the categories of {data.query!r} do not have; use bars")
        self.passed(8)

        # 9. Length and position first; never an order with random colours.
        if kind in COLOUR_PER_CATEGORY_KINDS and spec.effective_sort() in (SortOrder.value_desc, SortOrder.value_asc):
            self.warn(9, f"a ranking reads better as bars than as a {kind.value}: lengths are easier to compare than angles or areas")
        if self.needs_option(9):
            colours = set(self.item_colours())
            allowed = 2 if spec.highlight else 1
            if kind in LENGTH_KINDS and len(colours) > allowed:
                self.error(9, f"the bars are ordered but drawn in {len(colours)} colours, which reads as a second meaning; use one colour, or a highlight and grey")
            self.passed(9)

        # 10. Eight colours at most; fold the rest into "Other".
        if kind in COLOUR_PER_CATEGORY_KINDS and len(rows) > MAX_COLOURS:
            self.error(10, f"{len(rows)} categories would need {len(rows)} colours; keep {MAX_COLOURS} and fold the rest into 'Other'")
        elif data.series_kind == "category" and len(rows) > HARD_MAX_COLOURS:
            self.warn(10, f"{len(rows)} bars is a list, not a chart; set a limit to keep the top few and fold the rest into 'Other'")
        if self.needs_option(10):
            distinct = len(set(self.item_colours()))
            if distinct > MAX_COLOURS:
                self.error(10, f"the chart uses {distinct} colours; the limit is {MAX_COLOURS} (never more than {HARD_MAX_COLOURS})")
            self.passed(10)

        # 11. Contrast: text 4.5:1 (3:1 large), neighbouring colours 3:1 or labelled directly.
        theme = self.theme
        for name, colour, floor in (("text", theme.text, TEXT_CONTRAST), ("muted text", theme.muted, TEXT_CONTRAST)):
            ratio = contrast_ratio(colour, theme.page)
            if ratio < floor:
                self.error(11, f"the theme's {name} (#{colour}) on its page (#{theme.page}) is {ratio:.2f}:1; text needs {floor}:1")
        if self.option is not None and not self.values_labelled():
            # Without a value on every bar, the bar's own edge against the page
            # is what a reader measures, so it needs the 3:1 of WCAG 1.4.11.
            bar_ratio = contrast_ratio(theme.accent, theme.page)
            if bar_ratio < GRAPHIC_CONTRAST:
                self.error(11, f"the bar colour (#{theme.accent}) is {bar_ratio:.2f}:1 against the page, under 3:1, and the values are not written on the bars")
            if spec.highlight and contrast_ratio(theme.accent, theme.bar_muted) < GRAPHIC_CONTRAST:
                self.error(11, "highlighted and grey bars are under 3:1 apart and the values are not written on the bars")
        self.passed(11)

        # 12. Never rely on colour alone.
        if spec.highlight and self.needs_option(12):
            axis_items = self.category_axis_labels()
            for label in spec.highlight:
                if label not in axis_items:
                    continue
                weight = (axis_items[label].get("textStyle") or {}).get("fontWeight")
                if weight != "bold":
                    self.error(12, f"'{label}' is picked out by colour only; its label must also be marked (bold)")
        self.passed(12)

        # 13. A title that states the finding; alt text, description and data table.
        title_words = re.findall(r"[A-Za-z0-9€$£%]+", spec.title)
        entry = QUERY_CATALOG.get(data.query)
        generic = {data.query.lower(), data.query.replace("_", " ").lower()} | ({entry.label.lower()} if entry else set())
        if len(title_words) < MIN_TITLE_WORDS:
            self.error(13, f"the title '{spec.title}' names the data; it must state the finding in a sentence (at least {MIN_TITLE_WORDS} words)")
        elif spec.title.strip().lower().rstrip(".") in generic:
            self.error(13, f"the title '{spec.title}' is the query's generic name; it must state what the chart shows")
        if self.built is not None:
            if not self.built.alt_text.strip():
                self.error(13, "the chart has no alt text")
            if not self.built.description.strip():
                self.error(13, "the chart has no longer description")
            if len(self.built.data_table.get("rows") or []) != len(rows):
                self.error(13, "the data table does not list every row the chart draws")
        elif self.option is None:
            self.not_checked[13] = f"alt text, description and data table need the drawn chart; kind {kind.value!r} is not drawn yet"
        self.passed(13)

        # 14. Chart text at least 12 px.
        if self.needs_option(14):
            small = sorted({size for size in _font_sizes(self.option) if size < MIN_FONT_PX})
            if small:
                self.error(14, f"text of {', '.join(f'{s:g}px' for s in small)} is under the {MIN_FONT_PX}px minimum")
            self.passed(14)

        # 15. A source line; every value links to a record.
        unsourced = [row.label for row in drawn if row.value != 0 and not row.record_refs]
        if unsourced:
            self.error(15, "these values link to no record: " + ", ".join(unsourced))
        if self.needs_option(15):
            if not any(str(t.get("text", "")).lower().startswith("source") for t in self.titles()):
                self.error(15, "the chart has no source line")
            self.passed(15)

        # 16. Show how many records sit behind each group; flag groups more than 10x apart.
        counts = [row.record_count for row in drawn if row.record_count]
        if len(counts) > 1 and max(counts) > RECORD_COUNT_SPREAD * min(counts):
            self.warn(16, f"the groups rest on very different numbers of records ({min(counts)} to {max(counts)}, more than {RECORD_COUNT_SPREAD}x apart); say so when comparing them")
        if self.built is not None and len(self.built.data_table.get("rows") or []) == len(rows):
            if any("record_count" not in r for r in self.built.data_table["rows"]):
                self.error(16, "the data table does not show how many records sit behind each value")
        if data.unit_kind == "amount" and self.needs_option(16):
            labels = self.bar_label_text()
            for row in drawn:
                text = labels.get(row.label, "")
                if str(row.record_count) not in text:
                    self.error(16, f"the bar for '{row.label}' does not say how many records sit behind it")
        self.passed(16)

        # 19. Never add up different currencies.
        if data.unit_kind == "amount":
            other = [o for o in data.omitted if o.get("reason") == "other currency"]
            if other:
                self.warn(19, "payments in other currencies are left out, not added in: " + ", ".join(f"{o['record_count']} in {o['currency']}" for o in other))
            if spec.unit and re.fullmatch(r"[A-Za-z]{3}", spec.unit) and data.currency and spec.unit.upper() != data.currency.upper():
                self.error(19, f"the order says {spec.unit.upper()} but the data is in {data.currency}; the data's currency is the one shown")
        self.passed(19)

        # 20. A value that rests on one record is visibly flagged.
        singles = [row.label for row in drawn if row.record_count == 1]
        if singles:
            self.warn(20, "these values rest on one record each: " + ", ".join(singles))
            if self.needs_option(20):
                labels = self.bar_label_text()
                for label in singles:
                    if SINGLE_RECORD_MARK not in labels.get(label, ""):
                        self.error(20, f"'{label}' rests on one record but carries no mark ({SINGLE_RECORD_MARK}) on the chart")
        self.passed(20)

        return CheckReport(ok=not self.errors, errors=self.errors, warnings=self.warnings,
                           checked_rules=sorted(self.checked), not_checked=self.not_checked)


def _consecutive_periods(keys: list[str]) -> bool:
    """True when sorted period keys ('2023' or '2023-11') step by exactly
    one year or one month each time."""
    try:
        if all(len(k) == 4 for k in keys):
            years = [int(k) for k in keys]
            return all(b - a == 1 for a, b in zip(years, years[1:]))
        if all(len(k) == 7 and k[4] == "-" for k in keys):
            months = [int(k[:4]) * 12 + int(k[5:7]) for k in keys]
            return all(b - a == 1 for a, b in zip(months, months[1:]))
    except ValueError:
        return False
    return False


def _font_sizes(node: Any) -> list[float]:
    out: list[float] = []
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "fontSize" and isinstance(value, (int, float)) and not isinstance(value, bool):
                out.append(float(value))
            else:
                out.extend(_font_sizes(value))
    elif isinstance(node, list):
        for item in node:
            out.extend(_font_sizes(item))
    return out


def check_visual(spec: VisualSpec, data: VisualData, theme: Theme, built: BuiltChart | None = None) -> CheckReport:
    """Check one chart. When the kind can be drawn and no drawing is given,
    the chart is built here first so the option-level rules run too."""
    if built is None and spec.drawable:
        try:
            built = build_chart(spec, data, theme)
        except UnsupportedChartKind:
            built = None
    return _Checker(spec, data, theme, built).run()
