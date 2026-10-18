"""The statistical kinds (visuals pass 3) in app/visuals/echarts.py: each
drawn in the house style, with the words beside it, refused when it cannot
draw the query's rows, and held to the metamorphic tests from the design
doc (McNutt et al., "Surfacing Visualization Mirages", CHI 2020): shuffle
the rows and the picture must not change; nudge a value and it must."""

import copy
import json
import os
import random
from pathlib import Path

import pytest

from app.services.presentation_style import CATEGORICAL_PALETTE, contrast_ratio, theme as theme_for
from app.visuals.checker import check_visual
from app.visuals.data_service import DataRow, RecordRef, VisualData
from app.visuals.echarts import (
    FILLED_SYMBOL, HOLLOW_SYMBOL, MIN_FONT_PX, OTHER_LABEL, SINGLE_RECORD_MARK, ChartDoesNotFit, DrawOptions, build_chart, ink_on, mark_colour,
)
from app.visuals.layout import text_width
from app.visuals.spec import DRAWN_KINDS, parse_spec

DARK = theme_for("dark_academia")
NEWSPRINT = theme_for("newsprint")


def _refs(label: str, count: int) -> list[RecordRef]:
    return [RecordRef("relationship", f"{label}-{n}") for n in range(count)]


def category(values=(("Meridian Holdings Ltd", 2400000, 1), ("Arden Partners", 285000, 4), ("Harborline Civic Trust", 40000, 2)), *,
             unit_kind="amount", query="payments_by_party") -> VisualData:
    rows = [DataRow(label, float(value), _refs(label, count), count, label) for label, value, count in values]
    amount = unit_kind == "amount"
    return VisualData("inv", query, {}, "USD" if amount else "claims", unit_kind, "category", "payments" if amount else "claims", rows,
                      "USD" if amount else None, sum(c for _, _, c in values))


def parts() -> VisualData:
    """Parts big enough for a treemap to name each one (40, 30, 20 and 10%)."""
    return category((("Meridian Holdings Ltd", 1200000, 3), ("Arden Partners", 900000, 4), ("Harborline Civic Trust", 600000, 2),
                     ("Orrin Ltd", 300000, 2)))


def over_time(values=(("2023-11", 2400000, 1), ("2023-12", 0, 0), ("2024-01", 50000, 2), ("2024-02", 75000, 3))) -> VisualData:
    months = {"11": "Nov", "12": "Dec", "01": "Jan", "02": "Feb", "03": "Mar"}
    rows = [DataRow(f"{months[key[5:]]} {key[:4]}", float(value), _refs(key, count), count, key) for key, value, count in values]
    return VisualData("inv", "payments_over_time", {}, "USD", "amount", "time", "payments", rows, "USD", sum(c for _, _, c in values))


AMOUNTS = (5000, 7000, 12000, 15000, 18000, 22000, 30000, 45000, 250000, 2400000)


def amounts(values=AMOUNTS) -> VisualData:
    rows = [DataRow(f"Payment {i:02d}", float(v), [RecordRef("relationship", f"pay-{i}")], 1, f"Payment {i:02d}") for i, v in enumerate(values)]
    return VisualData("inv", "payment_amounts", {}, "USD", "amount", "distribution", "payments", rows, "USD", len(rows))


def pairs(points=(("Meridian Holdings Ltd", 1, 2400000), ("Arden Partners", 4, 285000), ("Harborline Civic Trust", 2, 40000))) -> VisualData:
    rows = [DataRow(label, float(total), _refs(label, count), count, label, x=float(count)) for label, count, total in points]
    return VisualData("inv", "payments_count_and_total_by_party", {}, "USD", "amount", "pairs", "payments", rows, "USD",
                      sum(c for _, c, _ in points), x_unit="payments", x_unit_kind="count",
                      measure_labels={"x": "Number of payments received", "y": "Total received (USD)"})


def spec(kind: str, query: str, **overrides):
    raw = {"kind": kind, "title": "Meridian received most of the money", "query": {"name": query}}
    raw.update(overrides)
    return parse_spec(raw)


def _font_sizes(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "fontSize":
                yield value
            else:
                yield from _font_sizes(value)
    elif isinstance(node, list):
        for item in node:
            yield from _font_sizes(item)


# Every statistical kind with data it can draw.
KINDS = [
    ("line", "payments_over_time", over_time),
    ("area", "payments_over_time", over_time),
    ("stacked_bar_100", "payments_by_party", category),
    ("donut", "payments_by_party", category),
    ("treemap", "payments_by_party", parts),
    ("histogram", "payment_amounts", amounts),
    ("scatter", "payments_count_and_total_by_party", pairs),
]


@pytest.mark.parametrize("kind, query, make", KINDS)
def test_every_kind_keeps_the_house_style_and_passes_its_check(kind, query, make):
    built = build_chart(spec(kind, query), make(), DARK)
    option = built.option
    assert option["animation"] is False and option["backgroundColor"] == "#F7F2E8"
    assert option["title"][0]["text"] == "Meridian received most of the money" and option["title"][0]["subtext"]
    assert option["title"][1]["text"].startswith("Source: ")
    assert min(_font_sizes(option)) >= MIN_FONT_PX
    assert option["aria"]["label"]["description"] == built.alt_text and built.description and built.data_table["rows"]
    json.dumps(option)   # plain JSON: what the render service and the app draw
    report = check_visual(spec(kind, query), make(), DARK, built)
    assert report.ok, report.errors
    # Every rule is either judged for this kind, not applicable to it, or left to a later pass.
    judged, na, later = set(report.checked_rules), set(report.not_applicable), set(report.not_checked)
    assert not judged & na and judged | na | later == set(range(0, 21))   # check 0 and rules 1-20
    assert later == {17, 18}


def test_line_runs_through_time_on_a_zero_baseline_with_the_last_value_written():
    built = build_chart(spec("line", "payments_over_time"), over_time(), DARK)
    option = built.option
    assert option["xAxis"]["type"] == "category" and option["xAxis"]["boundaryGap"] is False
    assert [item["value"] for item in option["xAxis"]["data"]] == ["Nov 2023", "Dec 2023", "Jan 2024", "Feb 2024"]
    assert option["yAxis"]["min"] == 0 and option["yAxis"]["axisLabel"]["show"] is True
    assert option["yAxis"]["splitLine"]["show"] is True and option["xAxis"]["splitLine"]["show"] is False   # horizontal gridlines only
    series = option["series"][0]
    assert series["type"] == "line" and series["smooth"] is False and "areaStyle" not in series
    # Dark Academia's brass is 2.72:1 on its paper, under WCAG 1.4.11's 3:1 for a
    # line, so the line takes the accent made for text.
    assert mark_colour(DARK) == DARK.accent_text and series["lineStyle"]["color"] == "#8A6420"
    points = series["data"]
    assert [p["label"]["show"] for p in points] == [False, False, False, True]   # the end label
    assert points[-1]["label"]["formatter"] == "$75K · 3 payments"
    # Rule 20 by shape: the single-record point is hollow; the rest are filled.
    assert [p["symbol"] for p in points] == [HOLLOW_SYMBOL, FILLED_SYMBOL, FILLED_SYMBOL, FILLED_SYMBOL]
    # Rule 16: each point's tooltip says how many records hold it up.
    assert points[2]["tooltip"]["formatter"] == "Jan 2024: $50K · 2 payments"
    assert option["tooltip"]["renderMode"] == "richText"   # record text is never read as HTML
    assert "† hollow markers rest on one record" in built.source_line


def test_area_fills_down_to_zero_and_newsprint_keeps_its_red():
    built = build_chart(spec("area", "payments_over_time"), over_time(), NEWSPRINT)
    series = built.option["series"][0]
    assert series["areaStyle"]["color"] == "#C8102E" and built.option["yAxis"]["min"] == 0
    assert mark_colour(NEWSPRINT) == NEWSPRINT.accent   # 5.88:1 on white: the accent itself


def test_line_draw_options_change_the_look_never_the_values():
    reference = build_chart(spec("line", "payments_over_time"), over_time(), DARK)
    styled = build_chart(spec("line", "payments_over_time"), over_time(), DARK,
                         draw=DrawOptions(line_width="thick", markers=False, value_labels=True, smooth=True, gridlines=False))
    series = styled.option["series"][0]
    assert series["lineStyle"]["width"] == 4.0 and series["smooth"] is True
    assert styled.option["yAxis"]["splitLine"]["show"] is False
    assert all(p["label"]["show"] for p in series["data"])
    # Markers off hides the filled markers only: the hollow single-record marker stays (rule 20).
    assert [p["symbol"] for p in series["data"]] == [HOLLOW_SYMBOL, "none", "none", "none"]
    assert [p["value"] for p in series["data"]] == [p["value"] for p in reference.option["series"][0]["data"]]
    assert styled.data_table == reference.data_table


def test_a_100_percent_bar_is_one_bar_of_labelled_parts_that_fills_the_axis():
    built = build_chart(spec("stacked_bar_100", "payments_by_party"), category(), DARK)
    option = built.option
    assert option["yAxis"]["type"] == "category" and len(option["yAxis"]["data"]) == 1
    assert option["xAxis"]["min"] == 0 and option["xAxis"]["max"] == 2725000
    assert [s["stack"] for s in option["series"]] == ["whole"] * 3
    labels = [s["label"]["formatter"] for s in option["series"]]
    assert labels == ["Meridian Holdings Ltd\n88.1% · $2.4M · 1 payment †", "Arden Partners\n10.5% · $285K · 4 payments",
                      "Harborline Civic Trust\n1.5% · $40K · 2 payments"]
    assert [s["label"]["position"] for s in option["series"]] == ["top", "bottom", "top"]   # neighbours alternate
    assert [s["data"][0]["itemStyle"]["color"] for s in option["series"]] == [f"#{c}" for c in CATEGORICAL_PALETTE[:3]]
    assert [round(s, 1) for s in built.shares] == [88.1, 10.5, 1.5]
    assert built.data_table["columns"] == ["Label", "Value (USD)", "Share", "Records"]
    assert [row["share"] for row in built.data_table["rows"]] == [88.1, 10.5, 1.5]


def test_parts_past_seven_fold_into_a_grey_other():
    ten = category(tuple((f"Party {i}", 1000 * (10 - i), 1) for i in range(10)))
    built = build_chart(spec("stacked_bar_100", "payments_by_party"), ten, DARK)
    names = [s["name"] for s in built.option["series"]]
    assert len(names) == 8 and names[-1] == OTHER_LABEL
    assert built.option["series"][-1]["data"][0]["itemStyle"]["color"] == f"#{DARK.bar_muted}"
    assert built.rows[-1].record_count == 3 and built.rows[-1].value == 1000 + 2000 + 3000


def test_a_donut_has_four_slices_at_most_the_total_in_the_centre_and_nothing_pulled_out():
    built = build_chart(spec("donut", "payments_by_party"), category(), DARK)
    pie = built.option["series"][0]
    assert pie["type"] == "pie" and pie["radius"] == ["40%", "64%"]   # a ring, not a pie
    assert pie["selectedMode"] is False and pie["selectedOffset"] == 0 and "roseType" not in pie
    assert pie["label"]["position"] == "outside" and pie["labelLine"]["show"] is True
    assert [d["name"] for d in pie["data"]] == ["Meridian Holdings Ltd", "Arden Partners", "Harborline Civic Trust"]
    centre = next(t for t in built.option["title"] if t.get("id") == "centre")
    assert centre["text"] == "$2.7M" and centre["subtext"] == "in total"
    assert built.alt_text.startswith("Donut chart: Meridian received most of the money. 3 parts of $2.7M. Largest: Meridian Holdings Ltd at 88.1%")


def test_a_donut_without_its_centre_total_keeps_its_labels_outside():
    built = build_chart(spec("donut", "payments_by_party"), category(), DARK, draw=DrawOptions(centre_total=False))
    pie = built.option["series"][0]
    assert pie["label"]["position"] == "outside" and not any(t.get("id") == "centre" for t in built.option["title"])
    assert check_visual(spec("donut", "payments_by_party"), category(), DARK, built).ok


def test_count_parts_name_their_records():
    claims = category((("Supported", 5, 5), ("Disputed", 4, 4), ("Unverified", 3, 3)), unit_kind="count", query="claims_by_status")
    built = build_chart(spec("donut", "claims_by_status"), claims, DARK)
    assert built.option["series"][0]["data"][0]["label"]["formatter"] == "Supported\n41.7% · 5 claims"


def test_a_treemap_writes_each_part_inside_in_ink_that_reads():
    built = build_chart(spec("treemap", "payments_by_party"), category(), DARK)
    tree = built.option["series"][0]
    assert tree["type"] == "treemap" and tree["roam"] is False and tree["breadcrumb"]["show"] is False
    for item in tree["data"]:
        fill = item["itemStyle"]["color"].lstrip("#")
        assert item["label"]["color"].lstrip("#") == ink_on(fill)
        assert contrast_ratio(item["label"]["color"].lstrip("#"), fill) >= 4.5
    assert tree["data"][0]["tooltip"]["formatter"] == "Meridian Holdings Ltd: 88.1% · $2.4M · 1 payment †"


def test_a_treemap_part_too_small_for_its_words_fails_rules_12_and_16():
    # At 0.4% Harborline gets a sliver 14 px high that ECharts writes nothing
    # in (layout.treemap_rects, checked against ECharts in test_visuals_layout.py).
    lopsided = category((("Meridian Holdings Ltd", 2400000, 1), ("Alaric Voss", 295000, 2), ("Harborline Civic Trust", 12000, 2)))
    report = check_visual(spec("treemap", "payments_by_party"), lopsided, DARK)
    assert not report.ok and {e.rule for e in report.errors} == {12}
    assert "'Harborline Civic Trust' is too small in a treemap to show its name" in report.errors[0].message
    # At 1.5% its name fits on two lines, but not the share and count under it.
    report = check_visual(spec("treemap", "payments_by_party"), category(), DARK)
    assert [(e.rule, e.message.split(" is ")[0]) for e in report.errors] == [(16, "'Harborline Civic Trust'")]
    assert check_visual(spec("treemap", "payments_by_party"), parts(), DARK).ok


def test_a_treemap_part_that_shows_its_name_but_not_its_count_fails_rule_16():
    # A picture so short that every rectangle holds one line: the names, not the counts.
    short = build_chart(spec("treemap", "payments_by_party"), parts(), DARK, height=84 + 40 + 40)
    report = check_visual(spec("treemap", "payments_by_party"), parts(), DARK, short)
    assert {e.rule for e in report.errors} == {16}
    assert all("too small in a treemap to show its share" in e.message for e in report.errors)


def test_a_100_percent_bar_slides_its_labels_into_the_picture():
    built = build_chart(spec("stacked_bar_100", "payments_by_party"), category(), DARK)
    # Harborline's 1.5% ends the bar at the right edge: its label slides left to end inside the picture.
    label = built.option["series"][2]["label"]
    assert label["offset"][0] < 0
    centre = 8 + (1 - 0.0147 / 2) * (built.width - 16)
    assert centre + label["offset"][0] + text_width("1.5% · $40K · 2 payments", MIN_FONT_PX) / 2 <= built.width
    assert check_visual(spec("stacked_bar_100", "payments_by_party"), category(), DARK, built).ok


def test_a_100_percent_bar_whose_labels_cannot_fit_fails_rule_12():
    crowd = category(tuple((f"The Long-named Holding Company of the Northern Region Number {i}", 1000, 2) for i in range(8)))
    report = check_visual(spec("stacked_bar_100", "payments_by_party"), crowd, DARK)
    assert any(e.rule == 12 and "run into each other" in e.message for e in report.errors)


def test_values_written_closer_than_they_are_wide_are_flagged():
    rows = [DataRow(f"M{i:02d}", 100000.0 + i, _refs(f"m{i}", 2), 2, f"{2022 + i // 12}-{i % 12 + 1:02d}") for i in range(24)]
    months = VisualData("inv", "payments_over_time", {}, "USD", "amount", "time", "payments", rows, "USD", 48)
    report = check_visual(spec("column", "payments_over_time"), months, DARK)
    assert report.ok and any(w.rule == 14 and "may run" in w.message for w in report.warnings)
    assert not any(w.rule == 14 for w in check_visual(spec("column", "payments_over_time"), over_time(), DARK).warnings)


def test_end_labels_and_bar_values_have_room_inside_the_picture():
    line = build_chart(spec("line", "payments_over_time"), over_time(), DARK)
    end = line.option["series"][0]["data"][-1]["label"]["formatter"]
    assert line.option["grid"]["right"] >= text_width(end, MIN_FONT_PX) / 2
    bar = build_chart(spec("bar", "payments_by_party"), category(), DARK)
    widest = max(text_width(p["label"]["formatter"], MIN_FONT_PX) for p in bar.option["series"][0]["data"])
    assert bar.option["grid"]["right"] >= widest + 5   # ECharts writes a bar's label 5 px past its end
    scatter = build_chart(spec("scatter", "payments_count_and_total_by_party"), pairs(), DARK)
    names = [p["label"]["formatter"] for p in scatter.option["series"][0]["data"]]
    assert scatter.option["grid"]["right"] >= max(text_width(n, MIN_FONT_PX) for n in names) + 12


def test_a_histogram_draws_touching_bins_with_round_edges():
    built = build_chart(spec("histogram", "payment_amounts"), amounts(), DARK)
    option = built.option
    series = option["series"][0]
    assert series["barCategoryGap"] == "0%" and series["barGap"] == "0%"
    assert built.bins == [(0.0, 500000.0), (500000.0, 1000000.0), (1000000.0, 1500000.0), (1500000.0, 2000000.0), (2000000.0, 2500000.0)]
    assert [item["value"] for item in option["xAxis"]["data"]] == ["$0–$500K", "$500K–$1M", "$1M–$1.5M", "$1.5M–$2M", "$2M–$2.5M"]
    assert [p["value"] for p in series["data"]] == [9.0, 0.0, 0.0, 0.0, 1.0]
    assert [p["label"]["formatter"] for p in series["data"]] == ["9", "0", "0", "0", f"1 {SINGLE_RECORD_MARK}"]
    assert option["yAxis"]["min"] == 0 and option["xAxis"]["name"] == "Payments by amount (USD)"
    assert built.rows[0].record_count == 9 and len(built.rows[0].record_refs) == 9
    assert built.alt_text.startswith("Histogram: Meridian received most of the money. 10 payments in 5 bins of $500K from $0 to $2.5M.")
    assert built.data_table["columns"] == ["Amount range (USD)", "Number of payments", "Records"]


def test_the_binning_rule_is_a_style_choice_and_sturges_draws_fewer_bins_here():
    doane = build_chart(spec("histogram", "payment_amounts"), amounts(), DARK)
    sturges = build_chart(spec("histogram", "payment_amounts"), amounts(), DARK, draw=DrawOptions(binning="sturges"))
    assert len(sturges.bins) <= len(doane.bins)
    assert sum(p["value"] for p in sturges.option["series"][0]["data"]) == len(AMOUNTS)
    with pytest.raises(ChartDoesNotFit, match="unknown binning rule"):
        build_chart(spec("histogram", "payment_amounts"), amounts(), DARK, draw=DrawOptions(binning="fd"))


def test_a_scatter_plot_names_every_point_when_there_are_few():
    built = build_chart(spec("scatter", "payments_count_and_total_by_party"), pairs(), DARK)
    option = built.option
    assert option["xAxis"]["type"] == "value" and option["xAxis"]["name"] == "Number of payments received" and option["xAxis"]["minInterval"] == 1
    assert option["yAxis"]["type"] == "value" and option["yAxis"]["splitLine"]["show"] is True and option["xAxis"]["splitLine"]["show"] is False
    points = {p["name"]: p for p in option["series"][0]["data"]}
    assert points["Meridian Holdings Ltd"]["value"] == [1.0, 2400000.0] and points["Meridian Holdings Ltd"]["symbol"] == HOLLOW_SYMBOL
    assert points["Arden Partners"]["symbol"] == FILLED_SYMBOL
    assert all(p["label"]["show"] for p in points.values())
    assert points["Meridian Holdings Ltd"]["label"]["formatter"] == f"Meridian Holdings Ltd {SINGLE_RECORD_MARK}"
    assert points["Arden Partners"]["tooltip"]["formatter"] == "Arden Partners: Number of payments received 4; Total received (USD) $285K; from 4 payments"
    assert option["title"][0]["subtext"] == "Total received (USD) against number of payments received"
    assert built.data_table["columns"] == ["Label", "Number of payments received", "Total received (USD)", "Records"]
    assert {row["label"]: row["x_formatted"] for row in built.data_table["rows"]}["Arden Partners"] == "4"


def test_a_crowded_scatter_plot_names_only_its_outliers():
    crowd = [(f"Party {i:02d}", 2 + i % 3, 10000 + 500 * i) for i in range(20)] + [("Outlier Corp", 3, 2400000)]
    built = build_chart(spec("scatter", "payments_count_and_total_by_party"), pairs(crowd), DARK)
    assert built.labelled_points == ["Outlier Corp"]
    shown = [p["name"] for p in built.option["series"][0]["data"] if p["label"]["show"]]
    assert shown == ["Outlier Corp"]
    assert "Named on the chart: Outlier Corp." in built.description


@pytest.mark.parametrize("kind, query, make, fragment", [
    ("histogram", "payments_by_party", category, "a histogram needs one value per record"),
    ("scatter", "payments_by_party", category, "a scatter needs two numbers per party"),
    ("bar", "payments_count_and_total_by_party", pairs, "draw it as a scatter plot"),
    ("histogram", "payments_over_time", over_time, "has time rows"),
])
def test_a_kind_that_cannot_draw_the_rows_is_refused_in_plain_words(kind, query, make, fragment):
    with pytest.raises(ChartDoesNotFit, match=fragment):
        build_chart(spec(kind, query), make(), DARK)


def test_sort_and_limit_are_refused_where_they_mean_nothing():
    with pytest.raises(ChartDoesNotFit, match="limit"):
        build_chart(spec("histogram", "payment_amounts", limit=3), amounts(), DARK)
    with pytest.raises(ChartDoesNotFit, match="sort does not apply to a scatter"):
        build_chart(spec("scatter", "payments_count_and_total_by_party", sort="value_desc"), pairs(), DARK)


def test_highlight_marks_parts_and_points_beyond_colour():
    donut = build_chart(spec("donut", "payments_by_party", highlight=["Arden Partners"]), category(), DARK)
    items = {d["name"]: d for d in donut.option["series"][0]["data"]}
    assert items["Arden Partners"]["label"]["fontWeight"] == "bold"
    assert items["Meridian Holdings Ltd"]["itemStyle"]["color"] == f"#{DARK.bar_muted}"
    line = build_chart(spec("line", "payments_over_time", highlight=["Jan 2024"]), over_time(), DARK)
    point = next(p for p in line.option["series"][0]["data"] if p["name"] == "Jan 2024")
    assert point["label"]["show"] is True and point["label"]["fontWeight"] == "bold" and point["symbolSize"] == 11


# --- metamorphic tests (McNutt et al. 2020), for every kind ------------------------------

def _shuffled(data: VisualData, seed: int) -> VisualData:
    rows = list(data.rows)
    random.Random(seed).shuffle(rows)
    out = copy.deepcopy(data)
    out.rows = rows
    return out


@pytest.mark.parametrize("kind, query, make", KINDS)
def test_shuffling_the_rows_never_changes_the_picture(kind, query, make):
    data = make()
    reference = build_chart(spec(kind, query), data, DARK)
    for seed in range(10):
        again = build_chart(spec(kind, query), _shuffled(data, seed), DARK)
        assert json.dumps(again.option, sort_keys=True) == json.dumps(reference.option, sort_keys=True)
        assert (again.alt_text, again.description, again.data_table) == (reference.alt_text, reference.description, reference.data_table)


@pytest.mark.parametrize("kind, query, make, nudge", [
    ("line", "payments_over_time", over_time, lambda d: setattr(d.rows[2], "value", d.rows[2].value + 1)),
    ("area", "payments_over_time", over_time, lambda d: setattr(d.rows[3], "value", d.rows[3].value + 1)),
    ("stacked_bar_100", "payments_by_party", category, lambda d: setattr(d.rows[1], "value", d.rows[1].value + 1000)),
    ("donut", "payments_by_party", category, lambda d: setattr(d.rows[2], "value", d.rows[2].value + 1000)),
    ("treemap", "payments_by_party", category, lambda d: setattr(d.rows[0], "value", d.rows[0].value + 1)),
    # A histogram counts records per bin: a nudge that stays inside its bin
    # rightly changes nothing, so the nudge here carries a payment across an edge.
    ("histogram", "payment_amounts", amounts, lambda d: setattr(d.rows[8], "value", 600000.0)),
    ("scatter", "payments_count_and_total_by_party", pairs, lambda d: setattr(d.rows[1], "value", d.rows[1].value + 1)),
])
def test_nudging_a_value_changes_the_picture(kind, query, make, nudge):
    data = make()
    reference = build_chart(spec(kind, query), data, DARK)
    nudged = copy.deepcopy(data)
    nudge(nudged)
    again = build_chart(spec(kind, query), nudged, DARK)
    assert again.option != reference.option
    assert again.data_table != reference.data_table


def test_a_nudge_inside_a_bin_leaves_the_histogram_as_it_was():
    data = amounts()
    reference = build_chart(spec("histogram", "payment_amounts"), data, DARK)
    nudged = copy.deepcopy(data)
    nudged.rows[3].value += 1   # 15,000 -> 15,001: still in $0–$500K
    assert build_chart(spec("histogram", "payment_amounts"), nudged, DARK).option == reference.option


# --- the app's copy of each kind ------------------------------------------------------------
# frontend/test-support/chart-kinds.json holds one stored chart of every drawn
# kind (order slip, data, option, words) for the app's tests: the preview
# shows each one, and test-echarts-kinds.test.ts draws each option with the
# app's own registered ECharts parts. It must be what this drawing makes
# today; after a deliberate change to the drawing, rewrite it with
#   UPDATE_CHART_FIXTURES=1 TZ=UTC PYTHONPATH=. python -m pytest tests/test_visuals_kinds.py -k fixture

CHART_FIXTURES = Path(__file__).resolve().parents[2] / "frontend" / "test-support" / "chart-kinds.json"


def _fixture_orders() -> dict[str, tuple[str, VisualData]]:
    def ref(*ids: str) -> list[RecordRef]:
        return [RecordRef("relationship", i) for i in ids]

    parties = [DataRow("Meridian Holdings Ltd", 2400000, ref("r1"), 1, "Meridian Holdings Ltd"),
               DataRow("Alaric Voss", 295000, ref("r2", "r3"), 2, "Alaric Voss"),
               DataRow("Harborline Civic Trust", 12000, ref("r4", "r5"), 2, "Harborline Civic Trust")]
    by_party = VisualData("inv", "payments_by_party", {"direction": "received"}, "USD", "amount", "category", "payments", parties, "USD", 5)
    # A treemap names every part only when each is big enough (rule 12).
    shares = [DataRow("Meridian Holdings Ltd", 1200000, ref("t0", "t1", "t2"), 3, "Meridian Holdings Ltd"),
              DataRow("Alaric Voss", 900000, ref("t3", "t4"), 2, "Alaric Voss"),
              DataRow("Harborline Civic Trust", 600000, ref("t5", "t6"), 2, "Harborline Civic Trust"),
              DataRow("Orrin Ltd", 300000, ref("t7"), 1, "Orrin Ltd")]
    by_share = VisualData("inv", "payments_by_party", {"direction": "received"}, "USD", "amount", "category", "payments", shares, "USD", 8)
    months = [DataRow("Nov 2023", 2400000, ref("r1"), 1, "2023-11"), DataRow("Dec 2023", 5000, ref("r4"), 1, "2023-12"),
              DataRow("Jan 2024", 52000, ref("r2", "r5"), 2, "2024-01")]
    by_month = VisualData("inv", "payments_over_time", {"granularity": "month"}, "USD", "amount", "time", "payments", months, "USD", 4)
    paid = [DataRow(f"Payment {i}", float(v), ref(f"p{i}"), 1, f"Payment {i}") for i, v in enumerate((5000, 7000, 12000, 45000, 250000, 2400000))]
    spread = VisualData("inv", "payment_amounts", {}, "USD", "amount", "distribution", "payments", paid, "USD", 6)
    twos = [DataRow(r.label, r.value, r.record_refs, r.record_count, r.key, x=float(r.record_count)) for r in parties]
    two_numbers = VisualData("inv", "payments_count_and_total_by_party", {"direction": "received"}, "USD", "amount", "pairs", "payments", twos,
                             "USD", 5, x_unit="payments", x_unit_kind="count",
                             measure_labels={"x": "Number of payments received", "y": "Total received (USD)"})
    flowing = [DataRow("Meridian Holdings Ltd → Bellcastle Trading Group", 2400000, ref("f1", "f2"), 2, "Meridian Holdings Ltd → Bellcastle Trading Group",
                       source="Meridian Holdings Ltd", target="Bellcastle Trading Group"),
               DataRow("Bellcastle Trading Group → Orrin Ltd", 900000, ref("f3"), 1, "Bellcastle Trading Group → Orrin Ltd",
                       source="Bellcastle Trading Group", target="Orrin Ltd"),
               DataRow("Meridian Holdings Ltd → Orrin Ltd", 150000, ref("f4", "f5", "f6"), 3, "Meridian Holdings Ltd → Orrin Ltd",
                       source="Meridian Holdings Ltd", target="Orrin Ltd")]
    flows = VisualData("inv", "payment_flows", {}, "USD", "amount", "flows", "payments", flowing, "USD", 6)
    happened = [DataRow("Alaric Voss appointed director", 1.0, [RecordRef("timeline_event", "e1")], 1, "2019-06-11", start="2019-06-11", status="verified"),
                DataRow("Bellcastle becomes sole owner", 1.0, [RecordRef("timeline_event", "e2")], 1, "2021-02-01", start="2021-02", status="verified"),
                DataRow("Consulting contract runs", 1.0, [RecordRef("timeline_event", "e3")], 1, "2022-03-01", start="2022-03-01", end="2023-08-31",
                        status="asserted"),
                DataRow("Disputed $2.4M payment", 1.0, [RecordRef("timeline_event", "e4")], 1, "2023-11-14", start="2023-11-14", status="disputed")]
    events = VisualData("inv", "events_in_order", {}, "events", "count", "events", "events", happened, record_count=4)
    located = [DataRow("Meridian registered office", 1.0, [RecordRef("entity", "office")], 1, "meridian registered office|office",
                       latitude=51.5072, longitude=-0.1276),
               DataRow("Villa Kyrenia", 1.0, [RecordRef("entity", "villa")], 1, "villa kyrenia|villa", latitude=35.3364, longitude=33.3199)]
    places = VisualData("inv", "places_on_map", {}, "places", "count", "places", "places", located, record_count=2)
    graded = {("medium", "medium"): 1, ("robust", "high"): 2}
    cells = [DataRow(f"{e} evidence, {a} agreement", float(graded.get((e, a), 0)),
                     [RecordRef("claim", f"claim-{e}-{a}-{n}") for n in range(graded.get((e, a), 0))], graded.get((e, a), 0), f"{i}{j}",
                     across=e, down=a)
             for i, e in enumerate(("limited", "medium", "robust")) for j, a in enumerate(("low", "medium", "high"))]
    grid = VisualData("inv", "claims_by_strength", {}, "claims", "count", "grid", "claims", cells, record_count=3)
    taken = [DataRow("The market hall, intact", 1.0, [RecordRef("evidence", "p1")], 1, "2023-10-03|p1", start="2023-10-03", picture="doc-1"),
             DataRow("The market hall, destroyed", 1.0, [RecordRef("evidence", "p2")], 1, "2023-11-14|p2", start="2023-11-14", picture="doc-2")]
    pictures = VisualData("inv", "pictures_compared", {"before": "p1", "after": "p2"}, "pictures", "count", "pictures", "pictures", taken,
                          record_count=2)
    return {
        "before_after": ("The market hall was destroyed within six weeks", pictures),
        "heatmap": ("Most claims rest on robust, agreeing evidence", grid),
        "map": ("The money ended up in a villa in Cyprus", places),
        "timeline": ("The payment came two years after Bellcastle took control", events),
        "sankey": ("Most of Meridian's money went to Bellcastle", flows),
        "bar": ("Meridian received most of the money", by_party),
        "column": ("Payments fell after the November transfer", by_month),
        "line": ("Payments fell after the November transfer", by_month),
        "area": ("Payments fell after the November transfer", by_month),
        "stacked_bar_100": ("Meridian received most of the money", by_party),
        "donut": ("Meridian received most of the money", by_party),
        "treemap": ("Meridian received the largest share", by_share),
        "histogram": ("Most payments were small", spread),
        "scatter": ("Meridian took one large payment", two_numbers),
    }


def _fixture(kind: str, title: str, data: VisualData) -> dict:
    order = parse_spec({"kind": kind, "title": title, "query": {"name": data.query}})
    built = build_chart(order, data, theme_for(order.theme))
    report = check_visual(order, data, theme_for(order.theme), built)
    assert report.ok, (kind, report.errors)   # the app's copy is a chart that passed its check
    return {"spec": order.model_dump(mode="json"), "data": data.as_dict(), "option": built.option, "text": built.text(),
            "width": built.width, "height": built.height}


def test_the_apps_chart_fixture_is_what_the_backend_draws():
    made = {kind: _fixture(kind, title, data) for kind, (title, data) in _fixture_orders().items()}
    # A round trip through JSON, as the file holds it.
    made = json.loads(json.dumps(made, ensure_ascii=False, sort_keys=True))
    assert set(made) == {kind.value for kind in DRAWN_KINDS}
    if os.environ.get("UPDATE_CHART_FIXTURES") == "1":
        CHART_FIXTURES.write_text(json.dumps(made, indent=1, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    stored = json.loads(CHART_FIXTURES.read_text(encoding="utf-8"))
    for kind in made:
        assert stored.get(kind) == made[kind], f"{kind}: the drawing drifted from {CHART_FIXTURES.name}; see the comment above to rewrite it"
    # Each stored chart rebuilds from its own order slip and data.
    for kind, fixture in stored.items():
        order, data = parse_spec(fixture["spec"]), VisualData.from_dict(fixture["data"])
        assert build_chart(order, data, theme_for(order.theme)).option == fixture["option"], kind
