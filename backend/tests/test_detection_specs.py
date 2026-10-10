"""Detection specs (catalogue/detection/; docs/discovery/detection-design.md):
every spec's examples give the level it says, every spec passes the lint, and
the families measure what they claim."""

from __future__ import annotations

import pytest

from app.patterns.detectors import families
from app.patterns.engine import _catalogue
from app.patterns.graph import CaseGraph, Link, Party
from app.patterns.specs import Example, Spec, load, problems, run


def graph_of(example: Example) -> CaseGraph:
    g = CaseGraph()
    for p in example.parties:
        g.parties[p["id"]] = Party(p["id"], p.get("name", p["id"]), p["schema"], dict(p.get("properties", {})))
    for i, l in enumerate(example.links):
        g.links.append(Link(l.get("id", f"l{i}"), l["schema"], l["source"], l["target"], dict(l.get("properties", {})), "supported"))
    return g


def top_level(spec: Spec, example: Example) -> str | None:
    got = run(spec, graph_of(example))
    assert not isinstance(got, str), f"{spec.indicator} could not run on {example.name!r}: {got}"
    order = ["faint", "strong", "textbook"]
    return max((r.level for r in got), key=order.index, default=None)


SPECS = load()


def test_the_specs_pass_the_lint():
    assert SPECS, "no specs loaded"
    assert problems(SPECS, _catalogue()) == []


@pytest.mark.parametrize("spec,example", [(s, e) for s in SPECS for e in s.examples], ids=lambda x: getattr(x, "indicator", getattr(x, "name", "")))
def test_each_example_gives_its_level(spec, example):
    assert top_level(spec, example) == example.expect


def test_a_spec_that_lacks_its_records_says_why():
    spec = next(s for s in SPECS if s.indicator == "ML-021")
    assert run(spec, CaseGraph()) == "Needs Payment records; none in this case yet."


def test_bands_pick_the_highest_level_that_holds_and_say_why():
    spec = next(s for s in SPECS if s.indicator == "BO-002")
    assert spec.level_for(3.0) is None
    assert spec.level_for(5.0)[0] == "faint"
    level, reason = spec.level_for(9.0)
    assert level == "strong" and "Tax Justice Network" in reason


def test_the_lint_catches_a_bad_spec():
    bad = Spec(indicator="XX-999", family="no_such", level="faint", summary="x")
    found = problems((bad, bad), _catalogue())
    assert any("two specs" in p for p in found) and any("not in the catalogue" in p for p in found) and any("unknown family" in p for p in found)
    unreached = Spec(indicator="BO-001", family="cycle", params={"link": "Ownership"}, level="textbook", summary="x")
    assert any("no examples" in p for p in problems((unreached,), _catalogue()))


def test_window_sequence_and_threshold_families_measure():
    fam = families()
    g = graph_of(Example(name="x", expect=None, parties=[{"id": "a", "schema": "Company"}, {"id": "b", "schema": "Company"}, {"id": "p", "schema": "Person"}], links=[
        {"schema": "Payment", "source": "a", "target": "b", "properties": {"amount": ["100"], "date": ["2024-01-01"]}},
        {"schema": "Payment", "source": "a", "target": "b", "properties": {"amount": ["200"], "date": ["2024-01-05"]}},
        {"schema": "Payment", "source": "a", "target": "b", "properties": {"amount": ["300"], "date": ["2024-03-01"]}},
        {"schema": "Payment", "source": "a", "target": "b", "properties": {"amount": ["50"], "date": ["2024"]}},
        {"schema": "Ownership", "source": "p", "target": "a", "properties": {"date": ["2023-12-28"]}},
    ]))
    win = fam["count_in_window"].measure(g, fam["count_in_window"].Params(days=10))[0]
    assert win.value == 2 and win.facts["first_date"] == "2024-01-01" and win.facts["left_out_undated"] == 1
    total = fam["count_in_window"].measure(g, fam["count_in_window"].Params(days=10, measure="sum"))[0]
    assert total.value == 300
    seq = fam["sequence_within"].measure(g, fam["sequence_within"].Params(first="Ownership", then="Payment", days=7))
    assert [m.value for m in seq] == [4.0], "bought on 28 Dec, paying out on 1 Jan; 5 Jan is 8 days on"
    big = fam["property_threshold"].measure(g, fam["property_threshold"].Params(record="Payment", property="amount"))
    assert sorted(m.value for m in big) == [50, 100, 200, 300]


def test_attribute_missing_link_and_conflicting_values_families():
    fam = families()
    g = graph_of(Example(name="x", expect=None, parties=[
        {"id": "a", "schema": "Company", "properties": {"jurisdiction": ["VG"], "incorporationDate": ["2019-01-01", "2020-05-05"]}},
        {"id": "b", "schema": "Company", "properties": {"jurisdiction": ["GB"]}},
        {"id": "c", "schema": "Company"},
        {"id": "p", "schema": "Person"},
    ], links=[{"schema": "Directorship", "source": "p", "target": "b"}, {"schema": "Payment", "source": "a", "target": "b"}]))
    hit = fam["attribute_in_set"].measure(g, fam["attribute_in_set"].Params(record="Company", property="jurisdiction", values=["vg", "KY"]))
    assert [m.parties for m in hit] == [["a"]] and hit[0].facts["listed_as"] == "vg"
    missing = fam["missing_link"].measure(g, fam["missing_link"].Params(record="Company", links=["Directorship", "Ownership"]))
    assert [m.parties for m in missing] == [["a"]], "b has a director; c appears in no link at all"
    both = fam["conflicting_values"].measure(g, fam["conflicting_values"].Params(record="Company", property="incorporationDate"))
    assert both[0].value == 2 and both[0].facts["values"] == "2019-01-01 and 2020-05-05"


def test_baseline_change_compares_a_party_with_its_own_past():
    fam = families()
    links = [{"schema": "Payment", "source": "a", "target": "b", "properties": {"amount": ["100"], "date": [f"2024-0{m}-10"]}} for m in range(1, 7)]
    links.append({"schema": "Payment", "source": "a", "target": "b", "properties": {"amount": ["900"], "date": ["2024-07-01"]}})
    g = graph_of(Example(name="x", expect=None, parties=[{"id": "a", "schema": "Company"}, {"id": "b", "schema": "Company"}], links=links))
    [m] = fam["baseline_change"].measure(g, fam["baseline_change"].Params(recent_days=30))
    assert 8 <= m.value <= 11, m.value
    alone = graph_of(Example(name="x", expect=None, parties=[{"id": "a", "schema": "Company"}, {"id": "b", "schema": "Company"}], links=links[-1:]))
    assert fam["baseline_change"].measure(alone, fam["baseline_change"].Params()) == [], "nothing earlier to compare with"


def test_amount_statistic_needs_enough_amounts():
    fam = families()
    round_links = [{"schema": "Payment", "source": "a", "target": "b", "properties": {"amount": [str(1000 * (i + 1))]}} for i in range(20)]
    odd_links = [{"schema": "Payment", "source": "a", "target": "b", "properties": {"amount": [str(1234 + i)]}} for i in range(20)]
    g = graph_of(Example(name="x", expect=None, parties=[{"id": "a", "schema": "Company"}, {"id": "b", "schema": "Company"}], links=round_links + odd_links))
    [m] = fam["amount_statistic"].measure(g, fam["amount_statistic"].Params(test="round_share", min_count=30))
    assert m.value == 0.5 and m.facts["share_text"] == "50%"
    assert fam["amount_statistic"].measure(g, fam["amount_statistic"].Params(test="round_share", min_count=100)) == []
    benford = fam["amount_statistic"].measure(g, fam["amount_statistic"].Params(test="benford_mad", min_count=30))[0]
    assert benford.value > 0.015, "amounts piled on 1s and 2s stray far from Benford"
