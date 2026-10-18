"""The drawing (app/visuals/echarts.py): the house style, the words beside
the chart, and the metamorphic tests from the design doc (McNutt et al.,
"Surfacing Visualization Mirages", CHI 2020): shuffle the rows and the
picture must not change; nudge a value and it must."""

import copy
import json
import random

import pytest

from app.services.presentation_style import resolved_theme, theme as theme_for
from app.visuals.data_service import DataRow, RecordRef, VisualData
from app.visuals.echarts import (
    BOLD_SLACK, MIN_FONT_PX, OTHER_LABEL, SINGLE_RECORD_MARK, UnsupportedChartKind, build_chart, build_option, format_value, prepare_rows,
    singular,
)
from app.visuals.spec import ChartKind, parse_spec
from visuals_helpers import withhold_kind

DARK = theme_for("dark_academia")


def _data(values, *, unit_kind="amount", series_kind="category", query="payments_by_party", currency="USD") -> VisualData:
    rows = [DataRow(label, value, [RecordRef("relationship", f"{label}-{n}") for n in range(count)], count,
                    key=f"{2018 + i}" if series_kind == "time" else label)
            for i, (label, value, count) in enumerate(values)]
    return VisualData(investigation_id="inv", query=query, params={}, unit=currency if unit_kind == "amount" else "events",
                      unit_kind=unit_kind, series_kind=series_kind, record_noun="payments" if unit_kind == "amount" else "events",
                      rows=rows, currency=currency if unit_kind == "amount" else None, record_count=sum(c for _, _, c in values))


RANKED = _data([("Meridian Holdings Ltd", 2400000, 1), ("Arden Partners", 285000, 4), ("Harborline Civic Trust", 40000, 2)])
OVER_TIME = _data([("2018", 4, 4), ("2019", 0, 0), ("2020", 9, 9)], unit_kind="count", series_kind="time", query="events_over_time")


def _spec(**overrides):
    raw = {"kind": "bar", "title": "Meridian received most of the money", "query": {"name": "payments_by_party"}}
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


def test_bar_chart_follows_the_house_style():
    built = build_chart(_spec(), RANKED, DARK)
    option = built.option
    assert option["animation"] is False
    assert option["backgroundColor"] == "#F7F2E8"
    assert option["title"][0]["text"] == "Meridian received most of the money"
    assert option["title"][0]["subtext"] == "Amounts in USD"
    assert option["title"][0]["textStyle"]["fontFamily"] == "'Georgia', serif, sans-serif"
    assert option["title"][1]["text"].startswith("Source: 7 payments")
    assert f"{SINGLE_RECORD_MARK} rests on one record" in option["title"][1]["text"]
    # Zero baseline, no vertical gridlines, a dark zero line on the category axis.
    assert option["xAxis"]["type"] == "value" and option["xAxis"]["min"] == 0 and option["xAxis"]["splitLine"]["show"] is False
    assert option["yAxis"]["axisLine"]["lineStyle"]["color"] == "#1F1B16"
    assert not any(axis.get("inverse") for axis in (option["xAxis"], option["yAxis"]))
    # Ranked largest first, read top-down: ECharts stacks categories bottom-up, so the data is reversed.
    assert [item["value"] for item in option["yAxis"]["data"]] == ["Harborline Civic Trust", "Arden Partners", "Meridian Holdings Ltd"]
    labels = [point["label"]["formatter"] for point in option["series"][0]["data"]]
    assert labels == ["$40K · 2 payments", "$285K · 4 payments", f"$2.4M · 1 payment {SINGLE_RECORD_MARK}"]
    assert all(point["itemStyle"]["color"] == "#B98D34" for point in option["series"][0]["data"])
    assert min(_font_sizes(option)) >= MIN_FONT_PX
    assert option["aria"]["label"]["description"] == built.alt_text


def test_column_chart_keeps_time_order_with_horizontal_gridlines():
    option = build_option(parse_spec({"kind": "column", "title": "Events rose sharply in 2020", "query": {"name": "events_over_time"}}), OVER_TIME, DARK)
    assert option["xAxis"]["type"] == "category"
    assert [item["value"] for item in option["xAxis"]["data"]] == ["2018", "2019", "2020"]
    assert option["yAxis"]["type"] == "value" and option["yAxis"]["min"] == 0
    assert option["yAxis"]["splitLine"]["show"] is True and option["yAxis"]["splitLine"]["lineStyle"]["color"] == "#D9CDB6"
    assert option["xAxis"]["axisLine"]["lineStyle"]["width"] == 1.5
    assert [p["label"]["formatter"] for p in option["series"][0]["data"]] == ["4", "0", "9"]
    assert option["title"][0]["subtext"] == "Number of events"


def test_highlight_colours_the_picked_bar_and_marks_its_label_without_colour():
    built = build_chart(_spec(highlight=["Arden Partners", "Nobody Here"]), RANKED, DARK)
    points = {p["name"]: p for p in built.option["series"][0]["data"]}
    assert points["Arden Partners"]["itemStyle"]["color"] == "#B98D34"
    assert points["Meridian Holdings Ltd"]["itemStyle"]["color"] == "#CDBFA6"
    assert points["Arden Partners"]["label"]["fontWeight"] == "bold"
    axis = {item["value"]: item["textStyle"]["fontWeight"] for item in built.option["yAxis"]["data"]}
    assert axis == {"Arden Partners": "bold", "Meridian Holdings Ltd": "normal", "Harborline Civic Trust": "normal"}
    assert built.highlighted_labels == ["Arden Partners"]
    assert "Highlighted: Arden Partners." in built.description
    # The bold name is wider than the regular-weight cut the axis keeps in view;
    # the grid leaves the difference on the left (it was cut off, seen in the render service).
    assert built.option["grid"]["left"] == BOLD_SLACK
    assert build_chart(_spec(), RANKED, DARK).option["grid"]["left"] == 0


def test_a_limit_folds_the_rest_into_other_keeping_every_record():
    many = _data([(f"Party {i:02d}", 1000 * (10 - i), i + 1) for i in range(10)])
    rows = prepare_rows(_spec(limit=3), many)
    assert [r.label for r in rows] == ["Party 00", "Party 01", "Party 02", OTHER_LABEL]
    other = rows[-1]
    assert other.value == sum(1000 * (10 - i) for i in range(3, 10))
    assert other.record_count == sum(i + 1 for i in range(3, 10))
    assert len(other.record_refs) == other.record_count


def test_theme_colours_and_fonts_come_from_the_style_layer():
    option = build_option(_spec(theme="ledger"), RANKED, theme_for("ledger"))
    assert option["backgroundColor"] == "#FBFCFD"
    assert option["color"] == ["#13837A"]
    assert option["title"][0]["textStyle"]["fontFamily"] == "'IBM Plex Serif', serif, sans-serif"
    assert option["textStyle"]["fontFamily"] == "'IBM Plex Sans', sans-serif"
    paired = resolved_theme({"theme": "dark_academia", "fonts": "modern"})
    assert build_option(_spec(), RANKED, paired)["title"][0]["textStyle"]["fontFamily"] == "'Newsreader', serif, sans-serif"


def test_every_font_a_chart_names_ends_in_a_generic_family():
    # The export's PNG is drawn where the theme's face may not be installed;
    # a list that ends in a generic family still finds one (font_stack).
    themes = [theme_for(name) for name in ("dark_academia", "newsprint", "ledger", "high_contrast")]
    themes += [resolved_theme({"theme": "dark_academia", "fonts": pair}) for pair in ("classic", "modern", "technical", "traditional",
                                                                                     "expressive", "bookish", "multilingual", "editorial")]
    parts = _data([("A", 30, 3), ("B", 20, 2)])
    pairs = _data([("A", 30, 3), ("B", 20, 2)], series_kind="pairs", query="payments_count_and_total_by_party")
    pairs.rows = [DataRow(r.label, r.value, r.record_refs, r.record_count, key=r.key, x=float(r.record_count)) for r in pairs.rows]
    for theme in themes:
        for kind, data in (("bar", parts), ("donut", parts), ("scatter", pairs)):
            families = set(_font_families(build_option(_spec(kind=kind, query={"name": data.query}), data, theme)))
            assert families, theme.id
            for family in families:
                assert family.endswith(", sans-serif") and family.startswith("'"), (theme.id, kind, family)
                assert '"' not in family   # it goes into a double-quoted SVG attribute unescaped


def _font_families(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "fontFamily":
                yield value
            else:
                yield from _font_families(value)
    elif isinstance(node, list):
        for item in node:
            yield from _font_families(item)


def test_words_beside_the_chart():
    built = build_chart(_spec(), RANKED, DARK)
    assert built.alt_text == ("Bar chart: Meridian received most of the money. 3 groups ranked by USD. "
                              "Largest: Meridian Holdings Ltd at $2.4M; smallest: Harborline Civic Trust at $40K.")
    assert "Meridian Holdings Ltd: $2.4M, from 1 payment († one record)." in built.description
    assert built.description.endswith("Source: 7 payments in this investigation's records (payments_by_party) · † rests on one record.")
    assert built.data_table["columns"] == ["Label", "Value (USD)", "Records"]
    assert built.data_table["rows"][0] == {"label": "Meridian Holdings Ltd", "value": 2400000, "formatted": "$2.4M", "record_count": 1,
                                           "record_refs": [{"record_type": "relationship", "record_id": "Meridian Holdings Ltd-0"}]}
    assert built.single_record_labels == ["Meridian Holdings Ltd"]
    assert set(built.text()) == {"alt_text", "description", "data_table", "source_line"}
    assert build_chart(_spec(), _data([]), DARK).alt_text.endswith("No data.")


def test_format_value_is_compact_and_honest():
    usd = _data([("a", 1, 1)])
    assert format_value(2400000, usd) == "$2.4M"
    assert format_value(285000, usd) == "$285K"
    assert format_value(1200, usd) == "$1,200"
    assert format_value(12.5, usd) == "$12.50"
    assert format_value(5000, _data([("a", 1, 1)], currency="SEK")) == "5,000 SEK"
    assert format_value(3, OVER_TIME) == "3"
    assert singular("entities") == "entity" and singular("payments") == "payment" and singular("evidence records") == "evidence record"


def test_kinds_not_drawn_yet_raise_a_clear_error(monkeypatch):
    withhold_kind(monkeypatch, ChartKind.timeline)
    with pytest.raises(UnsupportedChartKind, match="not drawn yet"):
        build_chart(parse_spec({"kind": "timeline", "title": "The payments came in one burst", "query": {"name": "payments_by_party"}}), RANKED, DARK)


# --- metamorphic tests (McNutt et al. 2020) ------------------------------------------

def _shuffled(data: VisualData, seed: int) -> VisualData:
    rows = list(data.rows)
    random.Random(seed).shuffle(rows)
    shuffled = copy.deepcopy(data)
    shuffled.rows = rows
    return shuffled


@pytest.mark.parametrize("spec_kwargs, data", [
    ({}, RANKED),
    ({"sort": "label"}, RANKED),
    ({"sort": "value_asc", "highlight": ["Arden Partners"]}, RANKED),
    ({"limit": 2}, RANKED),
    ({"kind": "column", "query": {"name": "events_over_time"}, "title": "Events rose sharply in 2020"}, OVER_TIME),
])
def test_shuffling_the_rows_does_not_change_the_picture(spec_kwargs, data):
    spec = _spec(**spec_kwargs)
    reference = build_chart(spec, data, DARK)
    for seed in range(12):
        again = build_chart(spec, _shuffled(data, seed), DARK)
        assert again.option == reference.option
        assert json.dumps(again.option, sort_keys=True) == json.dumps(reference.option, sort_keys=True)
        assert (again.alt_text, again.description, again.data_table) == (reference.alt_text, reference.description, reference.data_table)


def test_nudging_a_value_changes_the_picture():
    reference = build_option(_spec(), RANKED, DARK)
    nudged = copy.deepcopy(RANKED)
    nudged.rows[1].value += 1
    option = build_option(_spec(), nudged, DARK)
    assert option != reference
    assert [p["value"] for p in option["series"][0]["data"]] != [p["value"] for p in reference["series"][0]["data"]]

    # A nudge big enough to change the ranking changes the order too.
    reranked = copy.deepcopy(RANKED)
    reranked.rows[2].value = 9_000_000
    assert [i["value"] for i in build_option(_spec(), reranked, DARK)["yAxis"]["data"]][-1] == "Harborline Civic Trust"


def test_a_nudge_to_the_records_behind_a_value_changes_the_words_on_the_chart():
    reference = build_chart(_spec(), RANKED, DARK)
    more_records = copy.deepcopy(RANKED)
    more_records.rows[0].record_count = 2
    more_records.rows[0].record_refs.append(RecordRef("relationship", "extra"))
    again = build_chart(_spec(), more_records, DARK)
    assert again.option != reference.option
    assert SINGLE_RECORD_MARK not in again.option["title"][1]["text"]
