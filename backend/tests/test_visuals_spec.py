"""The order slip (app/visuals/spec.py): what the AI may ask for, and what
it is refused with a plain message."""

import pytest

from app.visuals.spec import (
    DRAWN_KINDS, QUERY_CATALOG, ChartKind, QueryRef, SortOrder, VisualSpec, parse_spec, spec_errors,
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


def test_every_chart_kind_is_accepted_but_only_bars_are_drawn():
    for kind in ChartKind:
        query = {"name": "events_over_time"} if kind in (ChartKind.line, ChartKind.area) else {"name": "links_by_type"}
        spec = parse_spec({"kind": kind.value, "title": "Something happened over time", "query": query})
        assert spec.drawable == (kind in DRAWN_KINDS)
    assert {k.value for k in DRAWN_KINDS} == {"bar", "column"}


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
        assert entry.series_kind in {"category", "time"}
        assert entry.unit_kind in {"amount", "count"}
        assert entry.record_noun and entry.description
    assert QueryRef(name="payments_by_party").resolved_params() == {"direction": "received"}


def test_highlight_labels_are_trimmed_and_blanks_dropped():
    spec = parse_spec(_bar(highlight=["  Meridian Holdings Ltd ", "", "Bellcastle Trading Group"]))
    assert spec.highlight == ["Meridian Holdings Ltd", "Bellcastle Trading Group"]
    assert VisualSpec.model_validate(_bar()).model_dump(mode="json")["kind"] == "bar"
