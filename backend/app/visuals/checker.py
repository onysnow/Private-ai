"""The fact-checker: tests a chart against its data and the design rules.

Every finding carries the rule number from the design doc ("How every chart
gets checked", 20 rules, numbers fixed) and a plain-words message. An error
keeps the chart out of a draft; a warning travels with it so the reviewer
sees it.

Rule 0 is not a design rule but the design's first automatic check ("do
the numbers match?", after VisEval): every mark in the drawn option must
carry a value the data service produced, under its own label, and what the
chart writes beside its marks (a donut's total, a part's share, a
histogram's bins) must be what the data says. Reading the values back out
of the rendered image itself is still to come.

The report says, rule by rule, what was judged for this kind of chart:

* ``checked_rules``: judged against this chart and its data, for its kind.
  Each option-level rule reads what that kind actually draws: a bar's
  label, a slice's label, a point's tooltip, a segment's series.
* ``not_applicable``: rules about a different kind of chart (a zero
  baseline for a donut, slices for a bar chart, currencies for a count),
  with the reason. They were not judged, so they are not listed as checked.
* ``not_checked``: rules that do apply but cannot be judged here: 17
  (shaded maps) belongs to the maps pass, 18 (networks over about twenty
  nodes) to the networks pass, and the option-level rules of a kind not
  drawn yet.

What each rule is judged from:

* the order slip: 2 (log scale), 3 (negative sizes), 4 (stacking), 5
  (donut slices), 8 (lines over categories), 13 (the title);
* the data: 4 (parts that overlap cannot make a whole), 15 (records behind
  every value), 16 (how many records, and groups more than ten times
  apart), 19 (currencies), 20 (values resting on one record);
* the theme: 11 (text and colour contrast, WCAG ratios);
* the drawn option: 0, 1 (zero baseline), 5 (shares add up to 100%), 6
  (one value axis), 7 (no 3D, no inverted axis, no pulled-out slices,
  evenly spaced periods and bins), 9 (no random colours on an order), 10
  (at most eight colours), 11 (marks against the page, text inside marks),
  12 (a non-colour cue), 13 (alt text, description, data table), 14 (text
  at least 12 px), 15 (the source line), 16 (counts on the chart or in each
  point's tooltip), 20 (the single-record mark, or a hollow marker).
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any

from app.services.presentation_style import Theme, contrast_ratio
from app.visuals.data_service import DataRow, VisualData
from app.visuals.echarts import (
    GRAPHIC_CONTRAST, HOLLOW_SYMBOL, MIN_FONT_PX, SINGLE_RECORD_MARK, BuiltChart, UnsupportedChartKind, build_chart, count_phrase,
    format_value, prepare_rows,
)
from app.visuals.spec import (
    COLOUR_PER_CATEGORY_KINDS, LENGTH_KINDS, LINE_KINDS, PART_OF_WHOLE_KINDS, POINT_KINDS, QUERY_CATALOG, SIZE_KINDS, STACKABLE_KINDS,
    ZERO_BASELINE_KINDS, ChartKind, Scale, SortOrder, VisualSpec,
)

MAX_PIE_SLICES = 4            # rule 5 (Datawrapper)
SHARE_TOLERANCE = 0.5         # rule 5: the shares written on the chart add to 100 within half a point
MAX_COLOURS, HARD_MAX_COLOURS = 8, 20   # rule 10 (VizLinter; Okabe-Ito)
MAX_PERIODS = 36              # rule 7: three years of months still labels; past that, ask for years
RECORD_COUNT_SPREAD = 10      # rule 16 (our own threshold)
TEXT_CONTRAST, LARGE_TEXT_CONTRAST = 4.5, 3.0   # rule 11 (WCAG 1.4.3)
MIN_TITLE_WORDS = 3           # rule 13: "Payments" names the data; a finding takes a sentence

NOT_CHECKABLE_HERE = {
    17: "shaded maps are judged in the maps pass",
    18: "network layouts are judged in the networks pass",
}
_PERCENT = re.compile(r"(-?\d+(?:\.\d+)?)%")


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
    not_applicable: dict[int, str] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "errors": [e.as_dict() for e in self.errors],
            "warnings": [w.as_dict() for w in self.warnings],
            "checked_rules": sorted(self.checked_rules),
            "not_checked": {str(k): v for k, v in sorted(self.not_checked.items())},
            "not_applicable": {str(k): v for k, v in sorted(self.not_applicable.items())},
        }

    def error_rules(self) -> list[int]:
        return sorted({e.rule for e in self.errors})


class _Checker:
    def __init__(self, spec: VisualSpec, data: VisualData, theme: Theme, built: BuiltChart | None):
        self.spec, self.data, self.theme, self.built = spec, data, theme, built
        self.kind: ChartKind = built.kind if built else spec.kind
        self.rows: list[DataRow] = built.rows if built else prepare_rows(spec, data)
        self.option: dict[str, Any] | None = built.option if built else None
        self.errors: list[CheckItem] = []
        self.warnings: list[CheckItem] = []
        self.checked: set[int] = set()
        self.not_checked: dict[int, str] = dict(NOT_CHECKABLE_HERE)
        self.not_applicable: dict[int, str] = {}

    def error(self, rule: int, message: str) -> None:
        self.errors.append(CheckItem(rule, message))
        self.checked.add(rule)

    def warn(self, rule: int, message: str) -> None:
        self.warnings.append(CheckItem(rule, message))
        self.checked.add(rule)

    def passed(self, rule: int) -> None:
        self.checked.add(rule)

    def does_not_apply(self, rule: int, reason: str) -> None:
        self.not_applicable[rule] = reason

    def needs_option(self, rule: int) -> bool:
        if self.option is None:
            self.not_checked[rule] = f"needs the drawn option; chart kind {self.kind.value!r} is not drawn yet"
            return False
        return True

    # --- reading the drawn option, kind by kind -----------------------------------------
    def axes_of(self, key: str) -> list[dict[str, Any]]:
        axis = (self.option or {}).get(key)
        if isinstance(axis, list):
            return [a for a in axis if isinstance(a, dict)]
        return [axis] if isinstance(axis, dict) else []

    def axes(self) -> list[dict[str, Any]]:
        return self.axes_of("xAxis") + self.axes_of("yAxis")

    def value_axes(self) -> list[dict[str, Any]]:
        return [a for a in self.axes() if a.get("type") in ("value", "log")]

    def series(self) -> list[dict[str, Any]]:
        series = (self.option or {}).get("series") or []
        return [s for s in (series if isinstance(series, list) else [series]) if isinstance(s, dict)]

    def items(self) -> list[tuple[dict[str, Any], dict[str, Any]]]:
        """Every drawn mark with its series: (series, data item)."""
        return [(s, item) for s in self.series() for item in (s.get("data") or []) if isinstance(item, dict)]

    def item_colours(self) -> list[str]:
        colours: list[str] = []
        for series, item in self.items():
            colour = (item.get("itemStyle") or {}).get("color")
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

    def label_of(self, series: dict[str, Any], item: dict[str, Any]) -> dict[str, Any]:
        """A mark's label settings: the item's own over its series' (a 100%
        bar's segments carry their label on the series, one per part)."""
        return {**(series.get("label") or {}), **(item.get("label") or {})}

    def labels(self) -> dict[str, dict[str, Any]]:
        """mark name -> its label settings, for every drawn mark."""
        return {str(item.get("name")): self.label_of(series, item) for series, item in self.items()}

    def label_text(self) -> dict[str, str]:
        """mark name -> the text written beside it."""
        return {name: str(label.get("formatter", "")) for name, label in self.labels().items() if isinstance(label.get("formatter"), str)}

    def tooltip_text(self) -> dict[str, str]:
        out: dict[str, str] = {}
        for _series, item in self.items():
            formatter = (item.get("tooltip") or {}).get("formatter")
            if isinstance(formatter, str):
                out[str(item.get("name"))] = formatter
        return out

    def values_labelled(self) -> bool:
        """True when every mark carries its value, on the item or the series
        (a chart with no marks has none left unlabelled)."""
        return bool(self.series()) and all(label.get("show", False) for label in self.labels().values())

    def drawn_points(self) -> list[tuple[Any, ...]]:
        """(name, value) per mark; (name, x, y) for a scatter plot."""
        out: list[tuple[Any, ...]] = []
        for _series, item in self.items():
            value = item.get("value")
            name = str(item.get("name"))
            if self.kind == ChartKind.scatter:
                pair = value if isinstance(value, list) and len(value) == 2 else [None, None]
                out.append((name, _number(pair[0]), _number(pair[1])))
            else:
                out.append((name, _number(value)))
        return out

    # --- the rules -----------------------------------------------------------------
    def run(self) -> CheckReport:
        rows = self.rows
        values = [row.value for row in rows]
        # Nothing to draw is caught first; the other rules assume rows.
        if not rows or not any(values):
            self.error(15, f"the query {self.data.query!r} returned no records for this investigation; there is nothing to chart")
        for rule in (self.rule_0, self.rule_1, self.rule_2, self.rule_3, self.rule_4, self.rule_5, self.rule_6, self.rule_7,
                     self.rule_8, self.rule_9, self.rule_10, self.rule_11, self.rule_12, self.rule_13, self.rule_14, self.rule_15,
                     self.rule_16, self.rule_19, self.rule_20):
            rule()
        return CheckReport(ok=not self.errors, errors=self.errors, warnings=self.warnings, checked_rules=sorted(self.checked),
                           not_checked=self.not_checked, not_applicable=self.not_applicable)

    def drawn_rows(self) -> list[DataRow]:
        return [row for row in self.rows if row.value != 0 or row.record_count]

    # 0. The numbers match (the design's first check, after VisEval).
    def rule_0(self) -> None:
        if self.option is None:
            self.not_checked[0] = f"needs the drawn option; chart kind {self.kind.value!r} is not drawn yet"
            return
        expected: list[tuple[Any, ...]]
        if self.kind == ChartKind.scatter:
            expected = sorted(((row.label, _number(row.x), _number(row.value)) for row in self.rows), key=str)
        else:
            expected = sorted(((row.label, float(row.value)) for row in self.rows), key=str)
        drawn = sorted(self.drawn_points(), key=str)
        if drawn != expected:
            self.error(0, f"the values drawn do not match the data: drawn {drawn}, data {expected}")
        if self.kind == ChartKind.histogram:
            self._recount_bins()
        if self.kind in PART_OF_WHOLE_KINDS:
            self._read_back_shares()
        if self.kind == ChartKind.donut:
            centre = next((t for t in self.titles() if t.get("id") == "centre"), None)
            total = format_value(math.fsum(row.value for row in self.data.rows), self.data)
            if centre is not None and str(centre.get("text")) != total:
                self.error(0, f"the donut's centre says {centre.get('text')!r}, but the parts add up to {total}")
        if any(s.get("smooth") for s in self.series()):
            self.warn(0, "the line is smoothed: a curve between the points follows no record and can overshoot them (Datawrapper); a straight line shows only what was recorded")
        self.passed(0)

    def _recount_bins(self) -> None:
        """Count every record into the drawn bins again, with plain
        comparisons: [start, end) for each bin, [start, end] for the last."""
        bins = self.built.bins if self.built else []
        drawn = [count for _name, count in self.drawn_points()]
        if len(bins) != len(drawn):
            self.error(0, f"the histogram draws {len(drawn)} bars for {len(bins)} bins")
            return
        values = [row.value for row in self.data.rows]
        counts = [sum(1 for v in values if start <= v < end or (i == len(bins) - 1 and v == end)) for i, (start, end) in enumerate(bins)]
        if counts != [int(c or 0) for c in drawn]:
            self.error(0, f"the histogram's bars do not count the records in their bins: drawn {drawn}, counted {counts}")
        if sum(counts) != len(values):
            self.error(0, f"{len(values) - sum(counts)} record(s) fall outside every bin")

    def _read_back_shares(self) -> None:
        """Every part says its share of the whole; read it back off the label
        and compare it with the value drawn over the sum of all parts."""
        points = self.drawn_points()
        whole = math.fsum(value or 0.0 for _name, value in points)
        texts = self.label_text()
        for name, value in points:
            written = _PERCENT.findall(texts.get(name, ""))
            expected = f"{100.0 * (value or 0.0) / whole:.1f}" if whole > 0 else None
            if expected is None or not written:
                self.error(0, f"'{name}' does not say its share of the whole")
            elif written[0] != expected:
                self.error(0, f"'{name}' says {written[0]}% of the whole, but its value is {expected}% of it")

    # 1. Bars and areas start at zero.
    def rule_1(self) -> None:
        if self.kind not in ZERO_BASELINE_KINDS:
            self.does_not_apply(1, f"a {self.kind.value} has no bars or areas measured from a baseline")
            return
        if not self.needs_option(1):
            return
        floor = min(0.0, min((row.value for row in self.rows), default=0.0))
        axes = self.value_axes()
        if not axes:
            self.error(1, "the option has no value axis, so the zero baseline cannot be confirmed")
        for axis in axes:
            if axis.get("min") != floor or axis.get("scale"):
                self.error(1, f"the value axis must start at {floor:g} so lengths are honest; it starts at {axis.get('min')!r}")
        if self.kind == ChartKind.stacked_bar_100:
            whole = math.fsum(row.value for row in self.rows)
            for axis in axes:
                if axis.get("max") != whole:
                    self.error(1, f"a 100% bar must run from zero to the whole ({whole:g}); its axis ends at {axis.get('max')!r}")
        self.passed(1)

    # 2. No log scale on bars or areas, or on data with zero or negative values.
    def rule_2(self) -> None:
        kind = self.kind
        values = [row.value for row in self.rows]
        if kind == ChartKind.scatter:
            values += [row.x or 0.0 for row in self.rows]
        if self.spec.scale == Scale.log:
            if kind in LENGTH_KINDS or kind in SIZE_KINDS:
                self.error(2, f"a log scale would misstate {kind.value} lengths and areas; use a linear scale")
            if any(v <= 0 for v in values):
                self.error(2, "a log scale cannot show zero or negative values; this data has them")
        if self.option is not None and any(a.get("type") == "log" for a in self.axes()) and (kind in LENGTH_KINDS or kind in SIZE_KINDS):
            self.error(2, "the drawn option uses a log axis on a bar or area chart")
        self.passed(2)

    # 3. Never show a negative value as a size.
    def rule_3(self) -> None:
        kind = self.kind
        negatives = [row.label for row in self.rows if row.value < 0]
        if kind in SIZE_KINDS:
            if negatives:
                self.error(3, f"a {kind.value} shows each value as an area or angle, which cannot show a negative value: {', '.join(negatives)}")
            self.passed(3)
        elif kind in LENGTH_KINDS:
            if negatives:
                self.warn(3, f"negative values draw as bars pointing the other way; make sure the axis makes that clear: {', '.join(negatives)}")
            self.passed(3)
        else:
            self.does_not_apply(3, f"a {kind.value} shows values as positions, not sizes")

    # 4. Stack only bars and areas; never group and total the same field twice.
    def rule_4(self) -> None:
        if self.spec.stack and self.kind not in STACKABLE_KINDS:
            self.error(4, f"only bars and areas can be stacked, not a {self.kind.value}")
        if self.kind in PART_OF_WHOLE_KINDS:
            # Parts of a whole must not share records: a record counted in two
            # parts is totalled twice, and the parts add up to more than the whole.
            owners: dict[tuple[str, str], list[str]] = {}
            for row in self.rows:
                for ref in row.record_refs:
                    owners.setdefault((ref.record_type, ref.record_id), []).append(row.label)
            shared = sorted({label for labels in owners.values() if len(labels) > 1 for label in labels})
            if shared:
                count = sum(1 for labels in owners.values() if len(labels) > 1)
                self.error(4, f"{count} record(s) sit in more than one part ({', '.join(shared)}), so the parts total some records twice and "
                              f"do not make one whole; compare them with bars instead")
        self.passed(4)

    # 5. Pie or donut: four slices at most, adding to 100%.
    def rule_5(self) -> None:
        if self.kind not in (ChartKind.donut, ChartKind.stacked_bar_100):
            self.does_not_apply(5, f"a {self.kind.value} has no slices or shares")
            return
        if self.kind == ChartKind.donut and len(self.rows) > MAX_PIE_SLICES:
            self.error(5, f"a donut holds at most {MAX_PIE_SLICES} slices; this one would have {len(self.rows)}. "
                          "Use a 100% bar (stacked_bar_100) or bars instead")
        if self.option is not None:
            shares = [float(found[0]) for found in (_PERCENT.findall(text) for text in self.label_text().values()) if found]
            if shares and abs(math.fsum(shares) - 100.0) > SHARE_TOLERANCE:
                self.error(5, f"the shares written on the chart add up to {math.fsum(shares):.1f}%, not 100% (within {SHARE_TOLERANCE})")
        self.passed(5)

    # 6. No second value axis.
    def rule_6(self) -> None:
        if not self.needs_option(6):
            return
        per_side = [sum(1 for a in self.axes_of(key) if a.get("type") in ("value", "log")) for key in ("xAxis", "yAxis")]
        # A scatter plot has a value axis across and one up: two dimensions,
        # not two scales for one measure. Two on one side is what rule 6 refuses.
        allowed = 2 if self.kind == ChartKind.scatter else 1
        if len(self.value_axes()) > allowed or max(per_side) > 1:
            self.error(6, "the chart has two value axes for one measure; use two charts side by side instead")
        if any(s.get("yAxisIndex") or s.get("xAxisIndex") for s in self.series()):
            self.error(6, "a series is drawn against a second axis; use two charts side by side instead")
        self.passed(6)

    # 7. No 3D, no upside-down axes, evenly spaced ticks.
    def rule_7(self) -> None:
        data, rows = self.data, self.rows
        if self.needs_option(7):
            if any(k.endswith("3D") for k in (self.option or {})) or any("3D" in str(s.get("type", "")) for s in self.series()):
                self.error(7, "3D charts distort every comparison; draw it flat")
            for axis in self.axes():
                if axis.get("inverse"):
                    self.error(7, "an axis is drawn upside down (inverse); keep up meaning more")
            for series in self.series():
                if series.get("type") == "pie":
                    if series.get("roseType"):
                        self.error(7, "a rose (Nightingale) chart sizes slices by radius, which misstates them; keep slices by angle only")
                    if series.get("selectedMode") not in (False, None) or series.get("selectedOffset") or any(
                            isinstance(i, dict) and i.get("selected") for i in series.get("data") or []):
                        self.error(7, "a slice is pulled out of the donut, which distorts its share; keep every slice in the ring")
            if self.kind == ChartKind.histogram:
                self._even_bins()
            self.passed(7)
        if data.series_kind == "time" and len(rows) > 1:
            keys = [row.key for row in rows]
            if keys != sorted(keys) or len(set(keys)) != len(keys) or not _consecutive_periods(keys):
                self.error(7, "the periods are not consecutive, so the ticks would not be evenly spaced; a quiet period must still appear as zero")
            if len(rows) > MAX_PERIODS:
                self.warn(7, f"{len(rows)} periods is too many to label; ask for granularity=year, or a narrower question")
            self.passed(7)

    def _even_bins(self) -> None:
        """A histogram's bins are its ticks: touching, all the same width,
        drawn with no gap between the bars (the amounts are continuous)."""
        bins = self.built.bins if self.built else []
        widths = {round(end - start, 9) for start, end in bins}
        if len(widths) > 1:
            self.error(7, "the histogram's bins are not all the same width, so their bars cannot be compared")
        if any(bins[i][1] != bins[i + 1][0] for i in range(len(bins) - 1)):
            self.error(7, "the histogram's bins leave gaps between them; every amount must fall in a bin")
        for series in self.series():
            if str(series.get("barCategoryGap", "")).rstrip("%") not in ("0", "0.0"):
                self.error(7, "the histogram's bars have gaps between them; the bars of a histogram touch, because the amounts are continuous")

    # 8. Never join unrelated categories with a line.
    def rule_8(self) -> None:
        if self.kind not in LINE_KINDS:
            self.does_not_apply(8, f"a {self.kind.value} joins no points with a line")
            return
        if self.data.series_kind != "time":
            self.error(8, f"a {self.kind.value} joins its points with a line, which suggests an order the categories of {self.data.query!r} do not have; use bars")
        self.passed(8)

    # 9. Length and position first; never an order with random colours.
    def rule_9(self) -> None:
        kind, spec = self.kind, self.spec
        if kind in COLOUR_PER_CATEGORY_KINDS:
            if self.data.series_kind == "time":
                self.error(9, f"periods are an order; a {kind.value} gives each one its own colour, which reads as unrelated groups. "
                              "Use a column or line chart for change over time")
            elif spec.effective_sort() in (SortOrder.value_desc, SortOrder.value_asc):
                self.warn(9, f"a ranking reads better as bars than as a {kind.value}: lengths are easier to compare than angles or areas")
        if self.needs_option(9):
            colours = set(self.item_colours())
            allowed = 2 if spec.highlight else 1
            if kind in LENGTH_KINDS and len(colours) > allowed:
                self.error(9, f"the bars are ordered but drawn in {len(colours)} colours, which reads as a second meaning; use one colour, or a highlight and grey")
            if kind in POINT_KINDS and len(colours) > 1:
                self.error(9, f"the points are drawn in {len(colours)} colours, which reads as groups the data does not have; use one colour")
            self.passed(9)

    # 10. Eight colours at most; fold the rest into "Other".
    def rule_10(self) -> None:
        kind, data, rows = self.kind, self.data, self.rows
        if kind in COLOUR_PER_CATEGORY_KINDS and len(rows) > MAX_COLOURS:
            self.error(10, f"{len(rows)} categories would need {len(rows)} colours; keep {MAX_COLOURS} and fold the rest into 'Other'")
        elif data.series_kind in ("category", "distribution") and kind in (ChartKind.bar, ChartKind.column) and len(rows) > HARD_MAX_COLOURS:
            self.warn(10, f"{len(rows)} bars is a list, not a chart; set a limit to keep the top few and fold the rest into 'Other'")
        if self.needs_option(10):
            distinct = len(set(self.item_colours()))
            if distinct > MAX_COLOURS:
                self.error(10, f"the chart uses {distinct} colours; the limit is {MAX_COLOURS} (never more than {HARD_MAX_COLOURS})")
            self.passed(10)

    # 11. Contrast: text 4.5:1 (3:1 large), neighbouring colours 3:1 or labelled directly.
    def rule_11(self) -> None:
        theme, kind = self.theme, self.kind
        for name, colour in (("text", theme.text), ("muted text", theme.muted)):
            ratio = contrast_ratio(colour, theme.page)
            if ratio < TEXT_CONTRAST:
                self.error(11, f"the theme's {name} (#{colour}) on its page (#{theme.page}) is {ratio:.2f}:1; text needs {TEXT_CONTRAST}:1")
        if self.option is not None:
            if kind in LENGTH_KINDS and not self.values_labelled():
                # Without a value on every bar, the bar's own edge against the page
                # is what a reader measures, so it needs the 3:1 of WCAG 1.4.11.
                bar_ratio = contrast_ratio(theme.accent, theme.page)
                if bar_ratio < GRAPHIC_CONTRAST:
                    self.error(11, f"the bar colour (#{theme.accent}) is {bar_ratio:.2f}:1 against the page, under 3:1, and the values are not written on the bars")
                if self.spec.highlight and contrast_ratio(theme.accent, theme.bar_muted) < GRAPHIC_CONTRAST:
                    self.error(11, "highlighted and grey bars are under 3:1 apart and the values are not written on the bars")
            if kind in POINT_KINDS:
                # Nothing is written on most points, so the line and the points
                # themselves carry the values: 3:1 against the page (WCAG 1.4.11).
                for colour in sorted(set(self.item_colours())):
                    ratio = contrast_ratio(colour.lstrip("#"), theme.page)
                    if ratio < GRAPHIC_CONTRAST:
                        self.error(11, f"the line and points ({colour}) are {ratio:.2f}:1 against the page; marks that carry values need 3:1")
            if kind in COLOUR_PER_CATEGORY_KINDS:
                self._part_contrast()
        self.passed(11)

    def _part_contrast(self) -> None:
        """Parts in their own colours: every part labelled directly (rule 11
        accepts that instead of 3:1 between neighbours), and text written
        inside a part readable on its fill (4.5:1)."""
        labels = self.labels()
        unlabelled = [name for name, label in labels.items() if not label.get("show", True) or not label.get("formatter")]
        if unlabelled:
            colours = self.item_colours()
            for a, b in zip(colours, colours[1:]):
                if contrast_ratio(a.lstrip("#"), b.lstrip("#")) < GRAPHIC_CONTRAST:
                    self.error(11, f"neighbouring parts ({a}, {b}) are under 3:1 apart and not every part is labelled directly")
                    break
        for series, item in self.items():
            label = self.label_of(series, item)
            inside = label.get("position") in ("inside", "insideTopLeft", "insideLeft", "insideRight", "insideTop", "insideBottom") or series.get("type") == "treemap"
            fill = (item.get("itemStyle") or {}).get("color")
            ink = label.get("color")
            if inside and isinstance(fill, str) and isinstance(ink, str):
                ratio = contrast_ratio(ink.lstrip("#"), fill.lstrip("#"))
                if ratio < TEXT_CONTRAST:
                    self.error(11, f"the label inside '{item.get('name')}' ({ink} on {fill}) is {ratio:.2f}:1; text needs {TEXT_CONTRAST}:1")
            elif inside and isinstance(fill, str) and not isinstance(ink, str):
                self.error(11, f"the label inside '{item.get('name')}' has no colour of its own, so its contrast with {fill} is not known")

    # 12. Never rely on colour alone.
    def rule_12(self) -> None:
        kind = self.kind
        if kind in COLOUR_PER_CATEGORY_KINDS and self.needs_option(12):
            # Each part has its own colour; a reader must not need a colour key
            # to know which part is which, so every part carries its name.
            for name, settings in self.labels().items():
                if not settings.get("show", True) or name not in str(settings.get("formatter", "")):
                    self.error(12, f"'{name}' is told apart by its colour only; label it with its name")
        if self.spec.highlight and self.needs_option(12):
            picked = [name for name in self.spec.highlight if any(row.label == name for row in self.rows)]
            if kind in (ChartKind.bar, ChartKind.column, ChartKind.histogram):
                axis_items = self.category_axis_labels()
                for name in picked:
                    weight = ((axis_items.get(name) or {}).get("textStyle") or {}).get("fontWeight")
                    if weight != "bold":
                        self.error(12, f"'{name}' is picked out by colour only; its label must also be marked (bold)")
            else:
                labels = self.labels()
                for name in picked:
                    settings = labels.get(name) or {}
                    if not settings.get("show", kind in COLOUR_PER_CATEGORY_KINDS) or settings.get("fontWeight") != "bold":
                        self.error(12, f"'{name}' is picked out but not marked beyond its colour; show its label in bold")
        self.passed(12)

    # 13. A title that states the finding; alt text, description and data table.
    def rule_13(self) -> None:
        spec, data = self.spec, self.data
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
            if len(self.built.data_table.get("rows") or []) != len(self.rows):
                self.error(13, "the data table does not list every row the chart draws")
        elif self.option is None:
            self.not_checked[13] = f"alt text, description and data table need the drawn chart; kind {self.kind.value!r} is not drawn yet"
        self.passed(13)

    # 14. Chart text at least 12 px.
    def rule_14(self) -> None:
        if self.needs_option(14):
            small = sorted({size for size in _font_sizes(self.option) if size < MIN_FONT_PX})
            if small:
                self.error(14, f"text of {', '.join(f'{s:g}px' for s in small)} is under the {MIN_FONT_PX}px minimum")
            self.passed(14)

    # 15. A source line; every value links to a record.
    def rule_15(self) -> None:
        unsourced = [row.label for row in self.drawn_rows() if row.value != 0 and not row.record_refs]
        if unsourced:
            self.error(15, "these values link to no record: " + ", ".join(unsourced))
        if self.needs_option(15):
            if not any(str(t.get("text", "")).lower().startswith("source") for t in self.titles()):
                self.error(15, "the chart has no source line")
            self.passed(15)

    # 16. Show how many records sit behind each group; flag groups more than 10x apart.
    def rule_16(self) -> None:
        kind, data = self.kind, self.data
        drawn = self.drawn_rows()
        counts = [row.record_count for row in drawn if row.record_count]
        if len(counts) > 1 and max(counts) > RECORD_COUNT_SPREAD * min(counts):
            self.warn(16, f"the groups rest on very different numbers of records ({min(counts)} to {max(counts)}, more than {RECORD_COUNT_SPREAD}x apart); say so when comparing them")
        if self.built is not None and len(self.built.data_table.get("rows") or []) == len(self.rows):
            if any("record_count" not in r for r in self.built.data_table["rows"]):
                self.error(16, "the data table does not show how many records sit behind each value")
        if self.needs_option(16):
            if kind in POINT_KINDS:
                # Values are not written on every point, so each point's
                # tooltip says how many records hold it up (and the data table does).
                where, texts = "point", self.tooltip_text()
            else:
                where, texts = _mark_noun(kind), self.label_text()
            for row in drawn:
                if not _states_count(texts.get(row.label, ""), row, data, kind):
                    self.error(16, f"the {where} for '{row.label}' does not say how many records sit behind it")
        self.passed(16)

    # 19. Never add up different currencies.
    def rule_19(self) -> None:
        spec, data = self.spec, self.data
        if data.unit_kind != "amount":
            self.does_not_apply(19, f"the query {data.query!r} counts records; there is no currency to mix")
            return
        other = [o for o in data.omitted if o.get("reason") == "other currency"]
        if other:
            self.warn(19, "payments in other currencies are left out, not added in: " + ", ".join(f"{o['record_count']} in {o['currency']}" for o in other))
        if spec.unit and re.fullmatch(r"[A-Za-z]{3}", spec.unit) and data.currency and spec.unit.upper() != data.currency.upper():
            self.error(19, f"the order says {spec.unit.upper()} but the data is in {data.currency}; the data's currency is the one shown")
        self.passed(19)

    # 20. A value that rests on one record is visibly flagged.
    def rule_20(self) -> None:
        singles = [row.label for row in self.drawn_rows() if row.record_count == 1]
        if singles:
            self.warn(20, "these values rest on one record each: " + ", ".join(singles))
            if self.needs_option(20):
                if self.kind in POINT_KINDS:
                    symbols = {str(item.get("name")): item.get("symbol") for _series, item in self.items()}
                    for label in singles:
                        if symbols.get(label) != HOLLOW_SYMBOL:
                            self.error(20, f"'{label}' rests on one record but its marker is not hollow")
                else:
                    texts = self.label_text()
                    for label in singles:
                        if SINGLE_RECORD_MARK not in texts.get(label, ""):
                            self.error(20, f"'{label}' rests on one record but carries no mark ({SINGLE_RECORD_MARK}) on the chart")
        self.passed(20)


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _mark_noun(kind: ChartKind) -> str:
    if kind in PART_OF_WHOLE_KINDS:
        return "part"
    return "bar"


def _states_count(text: str, row: DataRow, data: VisualData, kind: ChartKind) -> bool:
    """Whether the text written for a mark says how many records sit behind
    it: '4 payments' beside an amount or a share; for a count of records
    (a bar of claims, a histogram bin, a point of events) the value written
    first is that count."""
    if kind == ChartKind.histogram or (data.unit_kind == "count" and kind not in PART_OF_WHOLE_KINDS):
        # A tooltip reads "label: value"; the value follows the last ": ".
        written = text.rsplit(": ", 1)[-1].split(" ", 1)[0]
        return written.replace(",", "") == str(row.record_count)
    return count_phrase(row, data) in text


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
    the chart is built here first (in the house style) so the option-level
    rules run too. A kind that cannot draw the query's rows at all raises
    ChartDoesNotFit from the drawing: there is no chart to check."""
    if built is None and spec.drawable:
        try:
            built = build_chart(spec, data, theme)
        except UnsupportedChartKind:
            built = None
    return _Checker(spec, data, theme, built).run()
