"""A chart's style (app/visuals/style.py, presets and options in
app/services/presentation_style.py): presets and options per chart family
after the Visual Editor design, the controls it refuses never offered, the
data never touched, and every styled chart checked again."""

import copy
import json

import pytest

from app.services.presentation_style import CHART_FAMILIES, CHART_OPTIONS, CHART_PRESETS, catalog, theme as theme_for
from app.visuals.checker import check_visual
from app.visuals.data_service import DataRow, RecordRef, VisualData
from app.visuals.echarts import ChartDoesNotFit, DrawOptions, build_chart
from app.visuals.spec import DRAWN_KINDS, ChartKind, Scale, SortOrder, parse_spec
from app.visuals.style import (
    applicable_options, available_presets, default_preset, normalize_chart_style, resolved_options, style_warnings, styled_chart,
)

DARK = theme_for("dark_academia")


def _parts(n: int = 3) -> VisualData:
    names = ["Meridian Holdings Ltd", "Alaric Voss", "Harborline Civic Trust", "Priya Kavanagh", "Orrin Ltd", "Bellcastle Trading Group"]
    rows = [DataRow(names[i], float(1_000_000 - 150_000 * i), [RecordRef("relationship", f"r{i}-{k}") for k in range(i + 1)], i + 1, names[i])
            for i in range(n)]
    return VisualData("inv", "payments_by_party", {"direction": "received"}, "USD", "amount", "category", "payments", rows, "USD",
                      sum(r.record_count for r in rows))


def _months() -> VisualData:
    rows = [DataRow(label, float(value), [RecordRef("relationship", f"m{i}")], 1, key)
            for i, (label, key, value) in enumerate((("Nov 2023", "2023-11", 2400000), ("Dec 2023", "2023-12", 5000), ("Jan 2024", "2024-01", 52000)))]
    return VisualData("inv", "payments_over_time", {"granularity": "month"}, "USD", "amount", "time", "payments", rows, "USD", 3)


def _spec(kind: str = "bar", query: str = "payments_by_party", **extra):
    return parse_spec({"kind": kind, "title": "Meridian received most of the money", "query": {"name": query}, **extra})


def test_the_catalogue_offers_presets_and_options_per_family_and_nothing_the_design_refuses():
    served = catalog()
    assert served["chart_families"] == CHART_FAMILIES and served["chart_presets"] == CHART_PRESETS and served["chart_options"] == CHART_OPTIONS
    assert set(CHART_FAMILIES) == {kind.value for kind in DRAWN_KINDS}
    # Every preset draws a kind of its own family.
    for family, presets in CHART_PRESETS.items():
        assert presets and all(CHART_FAMILIES[p["kind"]] == family for p in presets), family
    # The design's refused controls are simply absent (Visual Editor design,
    # "Presets and options per chart type"): no axis start, no 3D, no second
    # axis, no pulled-out slice, no gap between bins.
    names = {name for options in CHART_OPTIONS.values() for name in options}
    assert names == {"sort", "thickness", "axis_line", "gridlines", "highlight", "line_width", "markers", "value_labels", "smooth",
                     "log_scale", "other_after", "centre_total", "binning", "label_points"}
    assert {name for options in CHART_OPTIONS.values() for name, spec in options.items() if spec.get("warning")} == {"smooth", "log_scale"}
    json.dumps(served)


def test_no_style_is_the_chart_as_it_was_ordered():
    spec, data = _spec(), _parts()
    assert styled_chart(spec, data, None) == (spec, DrawOptions())
    assert normalize_chart_style(spec, data, {}) is None
    assert normalize_chart_style(spec, data, {"preset": "three_d", "options": {"axis_min": 100, "thickness": "huge"}}) is None
    assert normalize_chart_style(spec, data, "ranked") is None
    assert default_preset(spec) == "horizontal" and default_preset(_spec("column")) == "column" and default_preset(_spec("donut")) == "donut"


@pytest.mark.parametrize("kind, query, make", [
    ("bar", "payments_by_party", _parts), ("column", "payments_over_time", _months), ("line", "payments_over_time", _months),
    ("stacked_bar_100", "payments_by_party", _parts), ("donut", "payments_by_party", _parts), ("treemap", "payments_by_party", _parts),
])
def test_a_style_never_changes_the_data(kind, query, make):
    data = make()
    before = copy.deepcopy(data.as_dict())
    spec = _spec(kind, query)
    family = CHART_FAMILIES[kind]
    styles = [{"preset": p["id"]} for p in CHART_PRESETS[family]]
    for name, option in CHART_OPTIONS[family].items():
        if option["type"] == "choice":
            styles += [{"options": {name: value}} for value in option["values"]]
        elif option["type"] == "bool":
            styles += [{"options": {name: value}} for value in (True, False)]
        else:
            styles.append({"options": {name: [data.rows[0].label]}})
    for style in styles:
        styled, draw = styled_chart(spec, data, style)
        built = build_chart(styled, data, DARK, draw=draw)
        # The same records behind the same total, whatever the look.
        drawn = sorted(ref.record_id for row in built.rows for ref in row.record_refs)
        assert drawn == sorted(ref.record_id for row in data.rows for ref in row.record_refs), style
        if kind != "histogram":
            assert sum(row.value for row in built.rows) == pytest.approx(sum(row.value for row in data.rows)), style
        assert data.as_dict() == before, style


def test_presets_move_a_chart_within_its_family_and_only_to_kinds_that_answer_its_question():
    assert [p["id"] for p in available_presets(_spec(question="ranking"), _parts())] == ["horizontal", "ranked", "column", "minimal"]
    # A column chart over time answers "change over time"; a horizontal bar does not.
    over_time = _spec("column", "payments_over_time", question="change_over_time")
    assert [p["id"] for p in available_presets(over_time, _months())] == ["column"]
    assert [p["id"] for p in available_presets(_spec("donut", question="part_of_whole"), _parts())] == ["bar_100", "donut", "treemap"]
    styled, _ = styled_chart(_spec(question="ranking"), _parts(), {"preset": "column"})
    assert styled.kind == ChartKind.column and styled.question == "ranking"
    # A preset the chart cannot take is dropped, not applied.
    assert styled_chart(over_time, _months(), {"preset": "horizontal"})[0].kind == ChartKind.column


def test_options_follow_the_kind_and_the_data():
    assert "gridlines" in applicable_options(ChartKind.column, _parts()) and "gridlines" not in applicable_options(ChartKind.bar, _parts())
    assert "sort" in applicable_options(ChartKind.bar, _parts()) and "sort" not in applicable_options(ChartKind.column, _months())
    assert "centre_total" in applicable_options(ChartKind.donut, _parts()) and "centre_total" not in applicable_options(ChartKind.treemap, _parts())
    assert "thickness" in applicable_options(ChartKind.stacked_bar_100, _parts()) and "thickness" not in applicable_options(ChartKind.donut, _parts())
    assert "log_scale" in applicable_options(ChartKind.line, _months()) and "log_scale" not in applicable_options(ChartKind.area, _months())
    styled, draw = styled_chart(_spec(), _parts(), {"options": {"sort": "label", "thickness": "thick", "highlight": ["Alaric Voss", "Nobody"]}})
    assert styled.sort == SortOrder.label and draw.thickness == "thick" and styled.highlight == ["Alaric Voss"]
    assert resolved_options(styled, _parts(), draw) == {"sort": "label", "thickness": "thick", "axis_line": True, "highlight": ["Alaric Voss"]}


def test_a_styled_chart_is_checked_again():
    six = _parts(6)
    # The donut preset folds the smallest into "Other" after three: four slices, which rule 5 allows.
    styled, draw = styled_chart(_spec("donut"), six, {"preset": "donut"})
    assert styled.limit == 3 and check_visual(styled, six, DARK, build_chart(styled, six, DARK, draw=draw)).ok
    assert style_warnings(styled, six, draw) == []
    # Every part as its own slice: the panel warns, and the checker refuses it.
    styled, draw = styled_chart(_spec("donut"), six, {"preset": "donut", "options": {"other_after": "all"}})
    report = check_visual(styled, six, DARK, build_chart(styled, six, DARK, draw=draw))
    assert not report.ok and 5 in {e.rule for e in report.errors}
    assert [w["option"] for w in style_warnings(styled, six, draw)] == ["other_after"]


def test_smoothing_and_a_log_scale_carry_their_warnings():
    styled, draw = styled_chart(_spec("line", "payments_over_time"), _months(), {"options": {"smooth": True, "log_scale": True}})
    assert draw.smooth is True and styled.scale == Scale.log
    assert {w["option"] for w in style_warnings(styled, _months(), draw)} == {"smooth", "log_scale"}
    built = build_chart(styled, _months(), DARK, draw=draw)
    assert 0 in {w.rule for w in check_visual(styled, _months(), DARK, built).warnings}   # the smoothed line, checked again


def test_a_style_that_would_break_the_order_is_refused_in_plain_words(monkeypatch):
    # Folding a time series into "Other" is not something the order slip allows;
    # the option is not offered for periods, so it is dropped before it can be.
    styled, _ = styled_chart(_spec("column", "payments_over_time"), _months(), {"options": {"other_after": "1"}})
    assert styled.limit is None
    # Even an option that slipped past the catalogue cannot draw a broken order.
    from app.visuals import style as style_module
    original = style_module.applicable_options
    monkeypatch.setattr(style_module, "applicable_options",
                        lambda kind, data: {**original(kind, data), "other_after": CHART_OPTIONS["parts"]["other_after"]})
    with pytest.raises(ChartDoesNotFit, match="limit cannot cut a time series"):
        styled_chart(_spec("column", "payments_over_time"), _months(), {"options": {"other_after": "1"}})
