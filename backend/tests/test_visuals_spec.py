"""The order slip (app/visuals/spec.py): what the AI may ask for, and what
it is refused with a plain message."""

import pytest

from app.visuals.spec import (
    DRAWN_KINDS, QUERY_CATALOG, QUESTIONS, SERIES_KINDS, ChartKind, QueryRef, SortOrder, VisualSpec, parse_spec, spec_errors,
)


def _bar(**overrides):
    raw = {"kind": "bar", "title": "Meridian received most of the money",
           "query": {"name": "payments_by_party", "params": {"direction": "received"}}}
    raw.update(overrides)
    return raw


def test_a_valid_order_parses_with_sensible_defaults():
    spec = parse_spec(_bar())
    assert spec.kind == ChartKind.bar
    assert spec.theme == "dark_academia"
    assert spec.sort is None and spec.effective_sort() == SortOrder.value_desc
    assert spec.drawable
    assert spec.query.resolved_params() == {"direction": "received"}
    assert spec_errors(_bar()) == []


def test_time_queries_default_to_time_order_and_currency_is_upper_cased():
    spec = parse_spec({"kind": "column", "title": "Payments peaked in late 2023",
                       "query": {"name": "payments_over_time", "params": {"currency": "usd"}}})
    assert spec.effective_sort() == SortOrder.time
    assert spec.query.resolved_params() == {"granularity": "month", "currency": "USD"}


def test_every_chart_kind_is_accepted_and_the_statistical_kinds_are_drawn():
    for kind in ChartKind:
        query = {"name": "events_over_time"} if kind in (ChartKind.line, ChartKind.area) else {"name": "links_by_type"}
        spec = parse_spec({"kind": kind.value, "title": "Something happened over time", "query": query})
        assert spec.drawable == (kind in DRAWN_KINDS)
    # Pass 3 drew the statistical kinds, pass 4 the flow diagram and the timeline: every kind is drawn.
    assert {k.value for k in DRAWN_KINDS} == {k.value for k in ChartKind}


def test_each_question_names_the_kinds_and_query_shapes_that_answer_it():
    # The FT Visual Vocabulary categories the chooser offers (design doc, "Picking the right chart").
    assert list(QUESTIONS) == ["ranking", "change_over_time", "part_of_whole", "distribution", "correlation", "flow", "place"]
    assert QUESTIONS["distribution"].kinds == (ChartKind.histogram,)
    assert QUESTIONS["correlation"].series_kinds == ("pairs",)
    assert QUESTIONS["flow"].series_kinds == ("flows",)
    assert QUERY_CATALOG["payment_flows"].questions == ("flow",)
    assert QUERY_CATALOG["payment_flows"].kinds == (ChartKind.sankey, ChartKind.bar)
    for question in QUESTIONS.values():
        assert all(shape in SERIES_KINDS for shape in question.series_kinds)
    assert QUERY_CATALOG["payment_amounts"].questions == ("ranking", "distribution")
    assert QUERY_CATALOG["payments_count_and_total_by_party"].questions == ("correlation",)
    assert QUERY_CATALOG["events_over_time"].questions == ("change_over_time",)
    # The FT Visual Vocabulary's "Priestley timeline" sits under change over time.
    assert QUESTIONS["change_over_time"].kinds[-1] == ChartKind.timeline and "events" in QUESTIONS["change_over_time"].series_kinds
    assert QUERY_CATALOG["events_in_order"].questions == ("change_over_time",)
    assert QUERY_CATALOG["events_in_order"].kinds == (ChartKind.timeline,)
    assert QUERY_CATALOG["payment_amounts"].kinds[0] == ChartKind.histogram
    assert QUERY_CATALOG["payments_count_and_total_by_party"].kinds == (ChartKind.scatter,)
    # The FT Visual Vocabulary's "Spatial": where things are, on a map.
    assert QUESTIONS["place"].kinds == (ChartKind.map,) and QUESTIONS["place"].series_kinds == ("places",)
    assert QUERY_CATALOG["places_on_map"].questions == ("place",)
    assert QUERY_CATALOG["places_on_map"].kinds == (ChartKind.map,)


def test_an_order_may_name_the_question_and_its_kind_and_query_must_answer_it():
    assert parse_spec(_bar(question="ranking")).question == "ranking"
    assert parse_spec(_bar(question="part_of_whole", kind="donut")).question == "part_of_whole"
    assert parse_spec({"kind": "histogram", "question": "distribution", "title": "Most payments were small",
                       "query": {"name": "payment_amounts"}}).kind == ChartKind.histogram
    assert parse_spec(_bar()).question is None   # orders stored before the question still parse


def test_an_unknown_question_is_a_malformed_order():
    problems = spec_errors(_bar(question="trend"))
    assert any("unknown question 'trend'; the questions are: ranking, change_over_time" in p for p in problems), problems


@pytest.mark.parametrize("raw, fragment", [
    (_bar(question="part_of_whole"), "a bar does not answer 'part of a whole'; the kinds that do: stacked_bar_100, donut, treemap"),
    (_bar(question="change_over_time", kind="line"),
     "the query 'payments_by_party' cannot answer 'change over time'; the queries that can: payments_over_time, events_over_time"),
    (_bar(question="correlation", kind="scatter"), "the queries that can: payments_count_and_total_by_party"),
])
def test_a_kind_or_query_that_does_not_answer_the_question_is_a_choice_to_fix(raw, fragment):
    # Well formed, so it parses; the drawing refuses it (ChartDoesNotFit),
    # which sends the model back with the reason instead of failing the draft.
    spec = parse_spec(raw)
    assert spec_errors(raw) == []
    assert fragment in (spec.question_problem() or "")


@pytest.mark.parametrize("raw, fragment", [
    (_bar(kind="pie"), "kind"),
    (_bar(query={"name": "payments_by_payee"}), "unknown query 'payments_by_payee'; the catalogue has: "),
    (_bar(query={"name": "payments_by_party", "params": {"direction": "sideways"}}), "must be one of received, paid"),
    (_bar(query={"name": "payments_by_party", "params": {"colour": "red"}}), "has no parameter 'colour'"),
    (_bar(query={"name": "payments_by_party", "params": {"currency": "dollars"}}), "not valid"),
    (_bar(query={"name": "links_by_type", "params": {"granularity": "month"}}), "its parameters are: none"),
    (_bar(theme="neon"), "unknown theme 'neon'"),
    (_bar(title="   "), "title"),
    (_bar(title="12345"), "words that state the finding"),
    (_bar(sort="time"), "sort 'time' needs a time query"),
    ({"kind": "column", "title": "Payments fell every year", "query": {"name": "payments_over_time"}, "limit": 3}, "limit cannot cut a time series"),
    (_bar(limit=0), "limit"),
    (_bar(highlight="Meridian"), "highlight must be a list of labels"),
    ("not an object", "spec must be an object"),
])
def test_bad_orders_are_refused_with_a_plain_message(raw, fragment):
    problems = spec_errors(raw)
    assert problems, raw
    assert any(fragment in p for p in problems), problems
    with pytest.raises(ValueError):
        parse_spec(raw)


@pytest.mark.parametrize("extra", [{"values": [1, 2]}, {"items": [{"label": "a", "value": 1}]}, {"data": {"rows": []}}, {"total": 2400000}])
def test_the_order_never_carries_numbers(extra):
    problems = spec_errors(_bar(**extra))
    assert problems and any("Extra inputs are not permitted" in p for p in problems), problems


def test_query_params_must_be_text_values():
    problems = spec_errors(_bar(query={"name": "payments_over_time", "params": {"granularity": 12}}))
    assert problems and any("granularity" in p for p in problems), problems
    assert spec_errors(_bar(query={"name": "payments_by_party", "params": "received"})) == ["query.params: params must be an object of parameter names to values"]


def test_catalogue_entries_declare_what_the_data_service_needs():
    for name, entry in QUERY_CATALOG.items():
        assert entry.name == name
        assert entry.series_kind in SERIES_KINDS
        assert entry.unit_kind in {"amount", "count"}
        assert entry.record_noun and entry.description
    assert QueryRef(name="payments_by_party").resolved_params() == {"direction": "received"}


def test_highlight_labels_are_trimmed_and_blanks_dropped():
    spec = parse_spec(_bar(highlight=["  Meridian Holdings Ltd ", "", "Bellcastle Trading Group"]))
    assert spec.highlight == ["Meridian Holdings Ltd", "Bellcastle Trading Group"]
    assert VisualSpec.model_validate(_bar()).model_dump(mode="json")["kind"] == "bar"
