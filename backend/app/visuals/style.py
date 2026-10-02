"""A chart's style: the presets and options the style panel offers for each
family of chart (app/services/presentation_style.py, after "Presets and
options per chart type" in the Visual Editor design), applied to an order
slip.

Style changes how a chart looks, never what it says. A preset may move a
chart to another kind of its family (a ranking as bars or columns; parts of
a whole as a 100% bar, a donut or a treemap), and an option may sort the
parts, fold the smallest into "Other", pick some out, or change how the
marks are drawn. None of it touches the data: the stored rows stay exactly
as the data service cooked them, and a styled chart is drawn and checked
again, all 20 rules, before it is shown or exported ("Keeping it honest":
the checker judges the merged style, not just the AI's draft).

The controls the design refuses are not here at all, so there is nothing
to misuse: no axis that starts above zero, no 3D, no second value axis, no
pulled-out slice, no gap between a histogram's bins. Two allowed choices
carry a warning beside their control: a smoothed line and a log scale; a
donut with more than four slices is warned about too, and refused by the
checker (rule 5).

No style means the chart as it was ordered: `styled_chart(spec, data,
None)` is the order slip itself with the house style's defaults, so a
checked draft looks the same until someone styles it.
"""

from __future__ import annotations

from dataclasses import fields
from typing import Any

from pydantic import ValidationError

from app.services.presentation_style import CHART_FAMILIES, CHART_OPTIONS, CHART_PRESETS
from app.visuals.data_service import VisualData
from app.visuals.echarts import ChartDoesNotFit, DrawOptions, check_fit, prepare_rows
from app.visuals.spec import ChartKind, Scale, SortOrder, VisualSpec

MAX_DONUT_SLICES = 4                     # rule 5 (Datawrapper)
_DRAW_FIELDS = {f.name for f in fields(DrawOptions)}


def chart_family(kind: ChartKind) -> str | None:
    return CHART_FAMILIES.get(kind.value)


def _as_kind(spec: VisualSpec, kind: str) -> VisualSpec | None:
    try:
        return VisualSpec.model_validate({**spec.model_dump(mode="json"), "kind": kind})
    except ValidationError:
        return None


def available_presets(spec: VisualSpec, data: VisualData) -> list[dict[str, Any]]:
    """The presets of the chart's family that it can take: their kind
    answers the order's question, when it names one, and can draw its data
    (echarts.check_fit), so a preset never offers a chart that would be
    refused for its shape."""
    out = []
    for preset in CHART_PRESETS.get(chart_family(spec.kind) or "", []):
        candidate = _as_kind(spec, preset["kind"])
        if candidate is None:
            continue
        try:
            check_fit(candidate, data)
        except ChartDoesNotFit:
            continue
        out.append(preset)
    return out


def default_preset(spec: VisualSpec) -> str:
    """The preset that draws the chart as it was ordered: the first of its
    family with the order's own kind."""
    presets = CHART_PRESETS.get(chart_family(spec.kind) or "", [])
    return next((p["id"] for p in presets if p["kind"] == spec.kind.value), presets[0]["id"] if presets else "")


def applicable_options(kind: ChartKind, data: VisualData) -> dict[str, dict[str, Any]]:
    """The options a chart of this kind offers for this data: an option
    marked with `kinds` is for those kinds only (a donut's centre total),
    one marked with `series` for those query shapes only (sorting makes no
    sense for periods, whose order is time)."""
    family = chart_family(kind) or ""
    return {name: spec for name, spec in CHART_OPTIONS.get(family, {}).items()
            if kind.value in spec.get("kinds", [kind.value]) and data.series_kind in spec.get("series", [data.series_kind])}


def normalize_chart_style(spec: VisualSpec, data: VisualData, style: Any) -> dict[str, Any] | None:
    """{"preset", "options"} with every unknown or inapplicable value
    dropped (never raised on: a deck must always export); None when the
    style asks for nothing. `highlight` keeps only labels the data has."""
    if not isinstance(style, dict):
        return None
    presets = {p["id"]: p for p in available_presets(spec, data)}
    preset_id = style.get("preset") if style.get("preset") in presets else None
    kind = ChartKind(presets[preset_id]["kind"]) if preset_id else spec.kind
    allowed = applicable_options(kind, data)
    raw_options = style.get("options")
    raw: dict[str, Any] = raw_options if isinstance(raw_options, dict) else {}
    labels = [row.label for row in data.rows]
    options: dict[str, Any] = {}
    for name, value in raw.items():
        option = allowed.get(name)
        if option is None:
            continue
        if option["type"] == "bool" and isinstance(value, bool):
            options[name] = value
        elif option["type"] == "choice" and value in option["values"]:
            options[name] = value
        elif option["type"] == "labels" and isinstance(value, list):
            options[name] = [label for label in labels if label in value][:8]
    if preset_id is None and not options:
        return None
    return {"preset": preset_id or "", "options": options}


def styled_chart(spec: VisualSpec, data: VisualData, style: Any) -> tuple[VisualSpec, DrawOptions]:
    """The order slip and draw options a styled chart is drawn from. The
    data is not an argument to change: it is read only to know which
    presets and options apply. Raises ChartDoesNotFit when the merged
    order is not one the order slip allows (it is then refused in plain
    words, like any order that cannot be drawn)."""
    clean = normalize_chart_style(spec, data, style)
    if clean is None:
        return spec, DrawOptions()
    preset = next((p for p in CHART_PRESETS.get(chart_family(spec.kind) or "", []) if p["id"] == clean["preset"]), None)
    kind = ChartKind(preset["kind"]) if preset else spec.kind
    allowed = applicable_options(kind, data)
    # A preset's own defaults apply only to the options this kind has.
    options = {**{k: v for k, v in (preset["options"] if preset else {}).items() if k in allowed}, **clean["options"]}
    update: dict[str, Any] = {"kind": kind.value}
    if "sort" in options:
        update["sort"] = None if options["sort"] == "as_ordered" else SortOrder(options["sort"]).value
    if "other_after" in options:
        update["limit"] = None if options["other_after"] == "all" else int(options["other_after"])
    if "log_scale" in options:
        update["scale"] = (Scale.log if options["log_scale"] else Scale.linear).value
    if "highlight" in options:
        update["highlight"] = options["highlight"]
    try:
        styled = VisualSpec.model_validate({**spec.model_dump(mode="json"), **update})
    except ValidationError as exc:
        raise ChartDoesNotFit("; ".join(str(e.get("msg", e)) for e in exc.errors())) from exc
    draw = DrawOptions(**{name: value for name, value in options.items() if name in _DRAW_FIELDS})
    return styled, draw


def resolved_options(spec: VisualSpec, data: VisualData, draw: DrawOptions) -> dict[str, Any]:
    """The value every option of a styled chart has, as the style panel
    shows it: from the order slip for the options that live there (sort,
    the fold into "Other", the scale, the highlight), from the draw options
    for the rest."""
    out: dict[str, Any] = {}
    for name, option in applicable_options(spec.kind, data).items():
        if name == "sort":
            out[name] = spec.sort.value if spec.sort and spec.sort.value in option["values"] else "as_ordered"
        elif name == "other_after":
            # Past seven the drawing folds into "Other" itself (rule 10), so a larger limit reads as "all".
            out[name] = str(spec.limit) if spec.limit is not None and str(spec.limit) in option["values"] else "all"
        elif name == "log_scale":
            out[name] = spec.scale == Scale.log
        elif name == "highlight":
            out[name] = list(spec.highlight)
        else:
            out[name] = getattr(draw, name)
    return out


def style_warnings(spec: VisualSpec, data: VisualData, draw: DrawOptions) -> list[dict[str, str]]:
    """The warnings the style panel shows beside a control: allowed, but
    risky ("Keeping it honest": warnings appear in place)."""
    warnings: list[dict[str, str]] = []
    if spec.kind == ChartKind.donut:
        slices = len(prepare_rows(spec, data, draw))
        if slices > MAX_DONUT_SLICES:
            warnings.append({"option": "other_after", "message": (
                f"A donut reads best with four slices at most; this one has {slices}, and the check refuses it (rule 5). "
                "Fold the rest into Other after three, or show the parts as a 100% bar.")})
    if draw.smooth and spec.kind in (ChartKind.line, ChartKind.area):
        warnings.append({"option": "smooth", "message": (
            "A smoothed curve passes through values no record holds between the points; the check notes it (check 0).")})
    if spec.scale == Scale.log:
        warnings.append({"option": "log_scale", "message": (
            "A log scale has no zero and is easy to misread; the check refuses it for data with a zero or a negative value (rule 2).")})
    return warnings
