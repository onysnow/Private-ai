"""The fact-checker (app/visuals/checker.py): every design rule it judges
has a failing case and a passing case, by the rule's number in the design
doc. Data is built by hand so each case isolates one rule."""

import copy
from dataclasses import replace

import pytest

from app.services.presentation_style import THEMES, Theme, theme as theme_for
from app.visuals.checker import NOT_CHECKABLE_HERE, CheckReport, check_visual
from app.visuals.data_service import DataRow, RecordRef, VisualData
from app.visuals.echarts import build_chart
from app.visuals.spec import ChartKind, VisualSpec, parse_spec
from visuals_helpers import withhold_kind

DARK = theme_for("dark_academia")


def _data(values: list[tuple[str, float, int]], *, unit_kind="amount", series_kind="category", query="payments_by_party",
          currency="USD", omitted=None) -> VisualData:
    rows = []
    for i, (label, value, count) in enumerate(values):
        refs = [RecordRef("relationship", f"rel-{label}-{n}") for n in range(count)]
        rows.append(DataRow(label, value, refs, count, key=f"{2020 + i}" if series_kind == "time" else label))
    unit = currency if unit_kind == "amount" else "records"
    return VisualData(investigation_id="inv", query=query, params={}, unit=unit, unit_kind=unit_kind, series_kind=series_kind,
                      record_noun="payments" if unit_kind == "amount" else "records", rows=rows,
                      currency=currency if unit_kind == "amount" else None, record_count=sum(c for _, _, c in values), omitted=omitted or [])


def _spec(kind="bar", query="payments_by_party", **overrides) -> VisualSpec:
    raw = {"kind": kind, "title": "Meridian received most of the money", "query": {"name": query}}
    raw.update(overrides)
    return parse_spec(raw)


GOOD = _data([("Meridian Holdings Ltd", 2400000, 3), ("Arden Partners", 285000, 2), ("Harborline Civic Trust", 40000, 2)])


def _rules(items) -> set[int]:
    return {item.rule for item in items}


def _check_with_option(spec: VisualSpec, data: VisualData, mutate) -> CheckReport:
    """Build the house-style chart, let the test damage the option, check."""
    built = build_chart(spec, data, DARK)
    built.option = copy.deepcopy(built.option)
    mutate(built.option)
    return check_visual(spec, data, DARK, built)


def test_the_house_style_chart_passes_every_rule_it_can_check():
    report = check_visual(_spec(), GOOD, DARK)
    assert report.ok and report.errors == []
    # Rules 5 (slices) and 8 (lines) are about other kinds of chart: a bar
    # chart is not judged on them, so they are not listed as checked.
    assert set(report.checked_rules) == (set(range(0, 17)) | {19, 20}) - {5, 8}
    assert set(report.not_applicable) == {5, 8}
    assert set(report.not_checked) == {17, 18}
    assert report.as_dict()["not_checked"] == {"17": NOT_CHECKABLE_HERE[17], "18": NOT_CHECKABLE_HERE[18]}


def test_check_0_the_numbers_drawn_match_the_data():
    def tamper(option):
        option["series"][0]["data"][0]["value"] = 1
    report = _check_with_option(_spec(), GOOD, tamper)
    assert 0 in _rules(report.errors) and "do not match the data" in next(e.message for e in report.errors if e.rule == 0)

    def drop_a_bar(option):
        option["series"][0]["data"].pop()
    assert 0 in _rules(_check_with_option(_spec(), GOOD, drop_a_bar).errors)

    def swap_labels(option):
        points = option["series"][0]["data"]
        points[0]["name"], points[1]["name"] = points[1]["name"], points[0]["name"]
    assert 0 in _rules(_check_with_option(_spec(), GOOD, swap_labels).errors)
    assert 0 not in _rules(check_visual(_spec(), GOOD, DARK).errors)


# --- honest scales ------------------------------------------------------------------

def test_rule_1_bars_start_at_zero():
    def lift(option):
        option["xAxis"]["min"] = 100000
    assert 1 in _rules(_check_with_option(_spec(), GOOD, lift).errors)
    assert 1 not in _rules(check_visual(_spec(), GOOD, DARK).errors)


def test_rule_2_no_log_scale_on_bars_or_on_data_with_zero():
    assert 2 in _rules(check_visual(_spec(scale="log"), GOOD, DARK).errors)
    with_zero = _data([("2020", 0, 0), ("2021", 5, 1)], series_kind="time", query="payments_over_time")
    line = _spec(kind="line", query="payments_over_time", scale="log")
    assert 2 in _rules(check_visual(line, with_zero, DARK).errors)
    assert 2 not in _rules(check_visual(_spec(kind="line", query="payments_over_time"), with_zero, DARK).errors)


def test_rule_3_negative_values_are_never_a_size():
    negative = _data([("Refund", -500, 1), ("Fee", 900, 1)])
    assert 3 in _rules(check_visual(_spec(kind="donut"), negative, DARK).errors)
    bars = check_visual(_spec(), negative, DARK)
    assert 3 not in _rules(bars.errors) and 3 in _rules(bars.warnings)
    assert 3 not in _rules(check_visual(_spec(), GOOD, DARK).warnings)


def test_rule_4_stack_only_bars_and_areas():
    assert 4 in _rules(check_visual(_spec(kind="line", query="payments_over_time", stack=True), GOOD, DARK).errors)
    assert 4 not in _rules(check_visual(_spec(stack=True), GOOD, DARK).errors)


def test_rule_5_donuts_hold_four_slices_that_add_to_100():
    five = _data([(f"Party {i}", 100 * (i + 1), 1) for i in range(5)])
    report = check_visual(_spec(kind="donut"), five, DARK)
    assert 5 in _rules(report.errors)
    assert "stacked_bar_100" in next(e.message for e in report.errors if e.rule == 5)
    assert 5 not in _rules(check_visual(_spec(kind="donut"), GOOD, DARK).errors)
    # A limit folds the rest into "Other": four slices again, so the donut passes.
    assert 5 not in _rules(check_visual(_spec(kind="donut", limit=3), five, DARK).errors)


def test_rule_6_no_second_value_axis():
    def second_axis(option):
        option["xAxis"] = [option["xAxis"], {"type": "value", "min": 0}]
    assert 6 in _rules(_check_with_option(_spec(), GOOD, second_axis).errors)

    def second_series(option):
        option["series"].append({**option["series"][0], "yAxisIndex": 1})
    assert 6 in _rules(_check_with_option(_spec(), GOOD, second_series).errors)
    assert 6 not in _rules(check_visual(_spec(), GOOD, DARK).errors)


def test_rule_7_no_3d_no_inverted_axis_even_periods():
    def inverted(option):
        option["xAxis"]["inverse"] = True
    assert 7 in _rules(_check_with_option(_spec(), GOOD, inverted).errors)

    def three_d(option):
        option["series"][0]["type"] = "bar3D"
    assert 7 in _rules(_check_with_option(_spec(), GOOD, three_d).errors)

    # A missing year would make the ticks unevenly spaced; the data service
    # fills quiet periods with zero, so a gap means something went wrong.
    gappy = _data([("2020", 5, 1), ("2022", 3, 1)], series_kind="time", query="payments_over_time")
    gappy.rows[1].key = "2022"
    report = check_visual(_spec(kind="column", query="payments_over_time"), gappy, DARK)
    assert 7 in _rules(report.errors) and "consecutive" in next(e.message for e in report.errors if e.rule == 7)
    consecutive = _data([("2020", 5, 1), ("2021", 3, 1)], series_kind="time", query="payments_over_time")
    assert 7 not in _rules(check_visual(_spec(kind="column", query="payments_over_time"), consecutive, DARK).errors)
    assert 7 not in _rules(check_visual(_spec(), GOOD, DARK).errors)

    many = _data([(f"m{i}", 1, 1) for i in range(40)], series_kind="time", query="events_over_time", unit_kind="count")
    for i, row in enumerate(many.rows):
        row.key = f"{2000 + i // 12}-{i % 12 + 1:02d}"
    assert 7 in _rules(check_visual(_spec(kind="column", query="events_over_time"), many, DARK).warnings)


def test_rule_8_never_join_categories_with_a_line():
    assert 8 in _rules(check_visual(_spec(kind="line"), GOOD, DARK).errors)
    over_time = _data([("2020", 5, 1), ("2021", 7, 2)], series_kind="time", query="payments_over_time")
    assert 8 not in _rules(check_visual(_spec(kind="line", query="payments_over_time"), over_time, DARK).errors)


def test_rule_19_currencies_are_never_mixed():
    left_out = _data(GOOD.rows and [("Meridian Holdings Ltd", 2400000, 3)], omitted=[{"reason": "other currency", "currency": "EUR", "record_count": 2}])
    report = check_visual(_spec(), left_out, DARK)
    assert 19 in _rules(report.warnings) and "2 in EUR" in next(w.message for w in report.warnings if w.rule == 19)
    assert 19 in _rules(check_visual(_spec(unit="EUR"), GOOD, DARK).errors)
    assert 19 not in _rules(check_visual(_spec(unit="USD"), GOOD, DARK).errors)


# --- clear design ------------------------------------------------------------------------

def test_rule_9_no_random_colours_on_an_order():
    def rainbow(option):
        for i, item in enumerate(option["series"][0]["data"]):
            item["itemStyle"]["color"] = ["#ff0000", "#00ff00", "#0000ff"][i % 3]
    assert 9 in _rules(_check_with_option(_spec(), GOOD, rainbow).errors)
    assert 9 not in _rules(check_visual(_spec(highlight=["Meridian Holdings Ltd"]), GOOD, DARK).errors)
    assert 9 in _rules(check_visual(_spec(kind="treemap", sort="value_desc"), GOOD, DARK).warnings)
    # Parts in size order are a ranking in disguise only when the order says
    # nothing else: one that answers "part of a whole" gets no such warning.
    assert 9 not in _rules(check_visual(_spec(kind="donut", question="part_of_whole"), GOOD, DARK).warnings)
    assert 9 in _rules(check_visual(_spec(kind="donut"), GOOD, DARK).warnings)


def test_rule_10_eight_colours_at_most():
    thirty = _data([(f"Party {i}", 100 * (30 - i), 1) for i in range(30)])
    # An order that keeps twenty categories on a treemap would need 21 colours.
    report = check_visual(_spec(kind="treemap", limit=20), thirty, DARK)
    assert 10 in _rules(report.errors) and "21 categories" in next(e.message for e in report.errors if e.rule == 10)
    # With no limit the builder folds past seven, so "Other" makes eight.
    assert 10 not in _rules(check_visual(_spec(kind="treemap"), thirty, DARK).errors)
    assert 10 not in _rules(check_visual(_spec(kind="treemap", limit=7), thirty, DARK).errors)

    def many_colours(option):
        for i, item in enumerate(option["series"][0]["data"]):
            item["itemStyle"]["color"] = f"#{i:02x}{i:02x}{i:02x}"
    twelve = _data([(f"Party {i}", 100 * (12 - i), 1) for i in range(12)])
    report = _check_with_option(_spec(), twelve, many_colours)
    assert 10 in _rules(report.errors)
    assert 10 in _rules(check_visual(_spec(), thirty, DARK).warnings)


def test_rule_11_contrast_of_text_and_bars():
    faint = replace(DARK, muted="BBBBBB")
    report = check_visual(_spec(), GOOD, faint)
    assert 11 in _rules(report.errors)
    assert "muted text" in next(e.message for e in report.errors if e.rule == 11)
    for theme in THEMES.values():
        assert 11 not in _rules(check_visual(_spec(), GOOD, theme).errors), theme.id

    # Bars without their values written on them need 3:1 against the page;
    # dark academia's brass is under that.
    def no_labels(option):
        for item in option["series"][0]["data"]:
            item["label"]["show"] = False
    assert 11 in _rules(_check_with_option(_spec(), GOOD, no_labels).errors)


def test_rule_12_never_colour_alone():
    picked = _spec(highlight=["Arden Partners"])
    assert 12 not in _rules(check_visual(picked, GOOD, DARK).errors)

    def plain_labels(option):
        for item in option["yAxis"]["data"]:
            item["textStyle"]["fontWeight"] = "normal"
    assert 12 in _rules(_check_with_option(picked, GOOD, plain_labels).errors)


def test_rule_13_title_states_a_finding_and_the_words_are_there():
    assert 13 in _rules(check_visual(_spec(title="Payments"), GOOD, DARK).errors)
    assert 13 in _rules(check_visual(_spec(title="Payments by party"), GOOD, DARK).errors)
    assert 13 not in _rules(check_visual(_spec(title="Meridian took in 88% of the money"), GOOD, DARK).errors)

    built = build_chart(_spec(), GOOD, DARK)
    built.alt_text = ""
    assert 13 in _rules(check_visual(_spec(), GOOD, DARK, built).errors)
    built = build_chart(_spec(), GOOD, DARK)
    built.data_table = {"columns": [], "rows": []}
    assert 13 in _rules(check_visual(_spec(), GOOD, DARK, built).errors)


def test_rule_14_text_at_least_12px():
    def tiny(option):
        option["title"][1]["textStyle"]["fontSize"] = 9
    report = _check_with_option(_spec(), GOOD, tiny)
    assert 14 in _rules(report.errors) and "9px" in next(e.message for e in report.errors if e.rule == 14)
    assert 14 not in _rules(check_visual(_spec(), GOOD, DARK).errors)


# --- traceable to the records ---------------------------------------------------------------

def test_rule_15_source_line_and_a_record_behind_every_value():
    empty = _data([])
    assert 15 in _rules(check_visual(_spec(), empty, DARK).errors)
    unsourced = _data([("Meridian Holdings Ltd", 2400000, 3), ("Ghost Ltd", 9000, 0)])
    unsourced.rows[1].value = 9000
    report = check_visual(_spec(), unsourced, DARK)
    assert 15 in _rules(report.errors) and "Ghost Ltd" in next(e.message for e in report.errors if e.rule == 15)

    def no_source(option):
        option["title"] = option["title"][:1]
    assert 15 in _rules(_check_with_option(_spec(), GOOD, no_source).errors)
    assert 15 not in _rules(check_visual(_spec(), GOOD, DARK).errors)


def test_rule_16_record_counts_shown_and_lopsided_groups_flagged():
    lopsided = _data([("Meridian Holdings Ltd", 2400000, 40), ("Arden Partners", 285000, 2)])
    report = check_visual(_spec(), lopsided, DARK)
    assert 16 in _rules(report.warnings) and "40" in next(w.message for w in report.warnings if w.rule == 16)
    assert 16 not in _rules(check_visual(_spec(), GOOD, DARK).warnings)

    def drop_counts(option):
        for item in option["series"][0]["data"]:
            item["label"]["formatter"] = "$$$"
    assert 16 in _rules(_check_with_option(_spec(), GOOD, drop_counts).errors)
    built = build_chart(_spec(), GOOD, DARK)
    for row in built.data_table["rows"]:
        del row["record_count"]
    assert 16 in _rules(check_visual(_spec(), GOOD, DARK, built).errors)


def test_rule_20_values_resting_on_one_record_are_flagged():
    single = _data([("Meridian Holdings Ltd", 2400000, 1), ("Arden Partners", 285000, 2)])
    report = check_visual(_spec(), single, DARK)
    assert report.ok and 20 in _rules(report.warnings)
    assert "Meridian Holdings Ltd" in next(w.message for w in report.warnings if w.rule == 20)

    def unmarked(option):
        option["series"][0]["data"][-1]["label"]["formatter"] = "$2.4M · 1 payment"
    assert 20 in _rules(_check_with_option(_spec(), single, unmarked).errors)
    assert 20 not in _rules(check_visual(_spec(), GOOD, DARK).warnings)


def test_a_kind_that_is_not_drawn_yet_is_checked_on_spec_and_data_only(monkeypatch):
    withhold_kind(monkeypatch, ChartKind.timeline)
    over_time = _data([("2020", 5, 1), ("2021", 7, 2)], series_kind="time", query="payments_over_time")
    report = check_visual(_spec(kind="timeline", query="payments_over_time"), over_time, DARK)
    assert report.ok
    # Rule 12 needs the option only when something is highlighted.
    assert {0, 6, 7, 9, 10, 13, 14, 15} <= set(report.not_checked)
    assert "not drawn yet" in report.not_checked[6]
    # What the order slip, the data and the theme can tell is judged ...
    assert {2, 4, 11, 19} <= set(report.checked_rules)
    # ... and rules about other kinds of chart are not applicable, not "checked".
    # (A timeline's mark is one event, one record: rules 16 and 20 are about groups of records.)
    assert {1, 3, 5, 8, 16, 20} <= set(report.not_applicable)
    assert not set(report.not_applicable) & set(report.checked_rules)


def test_report_serializes_for_storage():
    report = check_visual(_spec(title="Payments"), GOOD, DARK)
    data = report.as_dict()
    assert data["ok"] is False
    assert data["errors"][0] == {"rule": 13, "message": data["errors"][0]["message"]}
    assert report.error_rules() == [13]
    assert isinstance(data["checked_rules"], list) and all(isinstance(r, int) for r in data["checked_rules"])


def test_kinds_are_the_design_docs_list():
    assert {k.value for k in ChartKind} == {"bar", "column", "line", "area", "stacked_bar_100", "donut", "treemap", "histogram", "scatter", "timeline", "sankey", "map", "heatmap", "before_after"}
    assert isinstance(DARK, Theme)
    with pytest.raises(ValueError):
        parse_spec({"kind": "pie", "title": "A finding stated", "query": {"name": "links_by_type"}})


# --- the statistical kinds (pass 3): each rule a kind adds, failing and passing -----------

def _time_data() -> VisualData:
    rows = [DataRow("Nov 2023", 2400000, [RecordRef("relationship", "a")], 1, "2023-11"),
            DataRow("Dec 2023", 0, [], 0, "2023-12"),
            DataRow("Jan 2024", 50000, [RecordRef("relationship", "b"), RecordRef("relationship", "c")], 2, "2024-01")]
    return VisualData("inv", "payments_over_time", {}, "USD", "amount", "time", "payments", rows, "USD", 3)


def _amounts() -> VisualData:
    values = (5000, 7000, 12000, 15000, 18000, 22000, 30000, 45000, 250000, 2400000)
    rows = [DataRow(f"Payment {i}", float(v), [RecordRef("relationship", f"p{i}")], 1, f"Payment {i}") for i, v in enumerate(values)]
    return VisualData("inv", "payment_amounts", {}, "USD", "amount", "distribution", "payments", rows, "USD", len(rows))


def _pairs() -> VisualData:
    rows = [DataRow("Meridian", 2400000, [RecordRef("relationship", "a")], 1, "Meridian", x=1.0),
            DataRow("Arden", 285000, [RecordRef("relationship", f"b{n}") for n in range(4)], 4, "Arden", x=4.0)]
    return VisualData("inv", "payments_count_and_total_by_party", {}, "USD", "amount", "pairs", "payments", rows, "USD", 5,
                      x_unit="payments", x_unit_kind="count", measure_labels={"x": "Number of payments received", "y": "Total received (USD)"})


def _damaged(spec: VisualSpec, data: VisualData, mutate) -> CheckReport:
    """Build the house-style chart, let the test damage the drawing, check."""
    built = build_chart(spec, data, DARK)
    built.option = copy.deepcopy(built.option)
    mutate(built)
    return check_visual(spec, data, DARK, built)


def test_rule_0_reads_back_shares_the_donut_total_and_histogram_counts():
    donut = _spec(kind="donut")

    def wrong_share(built):
        built.option["series"][0]["data"][0]["label"]["formatter"] = "Meridian Holdings Ltd\n90.0% · $2.4M · 3 payments"
    report = _damaged(donut, GOOD, wrong_share)
    assert 0 in _rules(report.errors) and "90.0%" in next(e.message for e in report.errors if e.rule == 0)

    def wrong_total(built):
        next(t for t in built.option["title"] if t.get("id") == "centre")["text"] = "$9M"
    assert 0 in _rules(_damaged(donut, GOOD, wrong_total).errors)
    assert 0 not in _rules(check_visual(donut, GOOD, DARK).errors)

    histogram = _spec(kind="histogram", query="payment_amounts")

    def miscount(built):
        built.option["series"][0]["data"][0]["value"] = 8.0
        built.rows[0].value = 8.0   # the drawing and its rows agree; the records do not
    report = _damaged(histogram, _amounts(), miscount)
    assert 0 in _rules(report.errors) and "do not count the records" in " ".join(e.message for e in report.errors if e.rule == 0)
    assert check_visual(histogram, _amounts(), DARK).ok


def test_rule_0_warns_that_a_smoothed_line_follows_no_record():
    line = _spec(kind="line", query="payments_over_time")
    assert 0 in _rules(_damaged(line, _time_data(), lambda b: b.option["series"][0].update(smooth=True)).warnings)
    assert 0 not in _rules(check_visual(line, _time_data(), DARK).warnings)


def test_rule_1_holds_areas_and_100_percent_bars_and_not_lines():
    def lift(built):
        built.option["yAxis"]["min"] = 10000
    assert 1 in _rules(_damaged(_spec(kind="area", query="payments_over_time"), _time_data(), lift).errors)
    line = check_visual(_spec(kind="line", query="payments_over_time"), _time_data(), DARK)
    assert 1 in line.not_applicable and 1 not in line.checked_rules

    def short_whole(built):
        built.option["xAxis"]["max"] = 1000000
    assert 1 in _rules(_damaged(_spec(kind="stacked_bar_100"), GOOD, short_whole).errors)


def test_rule_4_refuses_parts_that_share_records():
    overlapping = _data([("Supports", 2, 2), ("Contradicts", 1, 1)], unit_kind="count", query="evidence_by_stance")
    overlapping.rows[1].record_refs = [overlapping.rows[0].record_refs[0]]   # one evidence record under both stances
    report = check_visual(_spec(kind="donut", query="evidence_by_stance"), overlapping, DARK)
    assert 4 in _rules(report.errors) and "more than one part" in next(e.message for e in report.errors if e.rule == 4)
    # Bars compare groups and total nothing, so the same records may sit under two bars.
    assert 4 not in _rules(check_visual(_spec(kind="bar", query="evidence_by_stance"), overlapping, DARK).errors)
    assert 4 not in _rules(check_visual(_spec(kind="donut"), GOOD, DARK).errors)


def test_rule_5_shares_written_on_a_100_percent_bar_add_to_100():
    def off(built):
        built.option["series"][0]["label"]["formatter"] = "Meridian Holdings Ltd\n80.0% · $2.4M · 3 payments"
    report = _damaged(_spec(kind="stacked_bar_100"), GOOD, off)
    assert 5 in _rules(report.errors) and "add up to" in next(e.message for e in report.errors if e.rule == 5)
    assert 5 not in _rules(check_visual(_spec(kind="stacked_bar_100"), GOOD, DARK).errors)
    assert 5 in check_visual(_spec(kind="treemap"), GOOD, DARK).not_applicable


def test_rule_6_lets_a_scatter_plot_keep_one_axis_each_way():
    scatter = _spec(kind="scatter", query="payments_count_and_total_by_party")
    assert 6 not in _rules(check_visual(scatter, _pairs(), DARK).errors)

    def second_y(built):
        built.option["yAxis"] = [built.option["yAxis"], {"type": "value"}]
    assert 6 in _rules(_damaged(scatter, _pairs(), second_y).errors)


def test_rule_7_no_pulled_out_slices_no_rose_and_no_gaps_between_bins():
    def pull(built):
        built.option["series"][0]["data"][0]["selected"] = True
    assert 7 in _rules(_damaged(_spec(kind="donut"), GOOD, pull).errors)

    def rose(built):
        built.option["series"][0]["roseType"] = "radius"
    assert 7 in _rules(_damaged(_spec(kind="donut"), GOOD, rose).errors)

    histogram = _spec(kind="histogram", query="payment_amounts")

    def gaps(built):
        built.option["series"][0]["barCategoryGap"] = "20%"
    assert 7 in _rules(_damaged(histogram, _amounts(), gaps).errors)

    def uneven(built):
        built.bins = [(0.0, 500000.0), (500000.0, 750000.0)] + built.bins[2:]
    assert 7 in _rules(_damaged(histogram, _amounts(), uneven).errors)
    assert 7 not in _rules(check_visual(histogram, _amounts(), DARK).errors)


def test_rule_9_refuses_parts_of_a_whole_drawn_over_time():
    report = check_visual(_spec(kind="donut", query="payments_over_time"), _time_data(), DARK)
    assert 9 in _rules(report.errors) and "periods are an order" in next(e.message for e in report.errors if e.rule == 9)

    def two_colours(built):
        built.option["series"][0]["data"][0]["itemStyle"]["color"] = "#ff0000"
    assert 9 in _rules(_damaged(_spec(kind="line", query="payments_over_time"), _time_data(), two_colours).errors)


def test_rule_11_lines_need_3_to_1_and_text_inside_a_part_4_5_to_1():
    def faint_line(built):
        for item in built.option["series"][0]["data"]:
            item["itemStyle"]["color"] = "#B98D34"   # Dark Academia's brass: 2.72:1 on its paper
    assert 11 in _rules(_damaged(_spec(kind="line", query="payments_over_time"), _time_data(), faint_line).errors)

    def grey_ink(built):
        built.option["series"][0]["data"][0]["label"]["color"] = "#777777"
    report = _damaged(_spec(kind="treemap"), GOOD, grey_ink)
    assert 11 in _rules(report.errors) and "inside 'Meridian Holdings Ltd'" in next(e.message for e in report.errors if e.rule == 11)
    assert 11 not in _rules(check_visual(_spec(kind="treemap"), GOOD, DARK).errors)


def test_rule_12_every_part_carries_its_name_and_a_highlight_is_bold():
    def nameless(built):
        built.option["series"][0]["data"][1]["label"]["formatter"] = "10.5% · $285K · 2 payments"
    assert 12 in _rules(_damaged(_spec(kind="donut"), GOOD, nameless).errors)

    picked = _spec(kind="scatter", query="payments_count_and_total_by_party", highlight=["Arden"])
    assert 12 not in _rules(check_visual(picked, _pairs(), DARK).errors)

    def plain(built):
        for item in built.option["series"][0]["data"]:
            item["label"]["fontWeight"] = "normal"
    assert 12 in _rules(_damaged(picked, _pairs(), plain).errors)


def test_rule_16_points_say_their_record_counts_in_their_tooltips():
    def silent(built):
        for item in built.option["series"][0]["data"]:
            item["tooltip"]["formatter"] = item["name"]
    report = _damaged(_spec(kind="line", query="payments_over_time"), _time_data(), silent)
    assert 16 in _rules(report.errors) and "the point for" in next(e.message for e in report.errors if e.rule == 16)

    def no_count(built):
        built.option["series"][1]["label"]["formatter"] = "Arden Partners\n10.5% · $285K"
    assert 16 in _rules(_damaged(_spec(kind="stacked_bar_100"), GOOD, no_count).errors)


def test_rule_19_does_not_apply_to_counts():
    claims = _data([("Supported", 2, 2), ("Disputed", 1, 1)], unit_kind="count", query="claims_by_status")
    report = check_visual(_spec(kind="donut", query="claims_by_status"), claims, DARK)
    assert 19 in report.not_applicable and 19 not in report.checked_rules
    assert 19 in check_visual(_spec(kind="donut"), GOOD, DARK).checked_rules


def test_rule_20_points_resting_on_one_record_are_hollow():
    def filled(built):
        for item in built.option["series"][0]["data"]:
            item["symbol"] = "circle"
    report = _damaged(_spec(kind="scatter", query="payments_count_and_total_by_party"), _pairs(), filled)
    assert 20 in _rules(report.errors) and "not hollow" in next(e.message for e in report.errors if e.rule == 20)
    assert 20 not in _rules(check_visual(_spec(kind="scatter", query="payments_count_and_total_by_party"), _pairs(), DARK).errors)


def test_report_lists_rules_about_other_kinds_as_not_applicable():
    report = check_visual(_spec(kind="scatter", query="payments_count_and_total_by_party"), _pairs(), DARK)
    assert {1, 3, 5, 8} <= set(report.not_applicable)
    assert report.as_dict()["not_applicable"]["5"].startswith("a scatter has no slices")
