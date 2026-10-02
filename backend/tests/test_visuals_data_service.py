"""The kitchen (app/visuals/data_service.py) on the demo investigation:
every value is a sum or count of real records, tagged with them, in a
canonical order, with currencies never mixed."""

import random

import pytest

from app.db.session import SessionLocal
from app.models.domain import Entity, Investigation
from app.services.demo_seed import seed_demo_investigation
from app.services.relationships import create_relationship
from app.visuals.data_service import (
    QueryError, RecordRef, VisualData, _category_rows, describe_catalog, period_key, period_label, run_query,
)
from app.visuals.spec import QueryRef


@pytest.fixture()
def demo():
    with SessionLocal() as db:
        inv, created = seed_demo_investigation(db)
        assert created
        yield db, inv.id


def _rows(data: VisualData) -> list[tuple[str, float, int]]:
    return [(r.label, r.value, r.record_count) for r in data.rows]


def test_payments_by_party_sums_amounts_and_cites_the_payment_relationships(demo):
    db, inv_id = demo
    received = run_query(db, inv_id, QueryRef(name="payments_by_party"))
    assert received.unit == "USD" and received.currency == "USD" and received.unit_kind == "amount"
    assert _rows(received) == [("Meridian Holdings Ltd", 2400000.0, 1)]
    assert [ref.record_type for ref in received.rows[0].record_refs] == ["relationship"]
    assert received.record_count == 1 and received.omitted == []

    paid = run_query(db, inv_id, QueryRef(name="payments_by_party", params={"direction": "paid"}))
    assert _rows(paid) == [("Bellcastle Trading Group", 2400000.0, 1)]
    assert paid.rows[0].record_refs == received.rows[0].record_refs


def test_payments_over_time_groups_by_month_or_year(demo):
    db, inv_id = demo
    month = run_query(db, inv_id, QueryRef(name="payments_over_time"))
    assert month.series_kind == "time"
    assert [(r.key, r.label, r.value) for r in month.rows] == [("2023-11", "Nov 2023", 2400000.0)]
    year = run_query(db, inv_id, QueryRef(name="payments_over_time", params={"granularity": "year"}))
    assert [(r.key, r.label) for r in year.rows] == [("2023", "2023")]


def test_events_over_time_fills_quiet_years_with_zero_and_cites_the_events(demo):
    db, inv_id = demo
    data = run_query(db, inv_id, QueryRef(name="events_over_time", params={"granularity": "year"}))
    assert data.unit_kind == "count" and data.record_noun == "events"
    assert [(r.key, r.value) for r in data.rows] == [("2019", 1.0), ("2020", 0.0), ("2021", 1.0), ("2022", 0.0), ("2023", 2.0), ("2024", 2.0)]
    quiet = data.rows[1]
    assert quiet.record_refs == [] and quiet.record_count == 0
    late_2023 = data.rows[4]
    # The reporter's event and the Payment relationship's own date both fall in 2023.
    assert {ref.record_type for ref in late_2023.record_refs} == {"timeline_event", "relationship"}
    assert data.record_count == 6


def test_events_dated_only_to_a_year_are_left_out_of_a_monthly_series_with_the_reason(demo):
    db, inv_id = demo
    from app.schemas.api import TimelineEventCreate
    from app.services.timeline import create_timeline_event

    create_timeline_event(db, TimelineEventCreate(investigation_id=inv_id, title="Audit year", date_start="2022", precision="year"))
    monthly = run_query(db, inv_id, QueryRef(name="events_over_time"))
    assert any(o["reason"] == "date not known to the month" and "Audit year" in o["detail"] for o in monthly.omitted)
    yearly = run_query(db, inv_id, QueryRef(name="events_over_time", params={"granularity": "year"}))
    assert next(r for r in yearly.rows if r.key == "2022").value == 1.0


def test_count_queries_rank_groups_largest_first_then_by_label(demo):
    db, inv_id = demo
    links = run_query(db, inv_id, QueryRef(name="links_by_type"))
    assert _rows(links) == [("Ownership", 2.0, 2), ("Directorship", 1.0, 1), ("Employment", 1.0, 1), ("Payment", 1.0, 1)]
    assert all(ref.record_type == "relationship" for row in links.rows for ref in row.record_refs)

    claims = run_query(db, inv_id, QueryRef(name="claims_by_status"))
    assert _rows(claims) == [("Disputed", 1.0, 1), ("Supported", 1.0, 1), ("Unverified", 1.0, 1)]

    entities = run_query(db, inv_id, QueryRef(name="entities_by_schema"))
    # Six things; the five relationship entities behind the links are not counted.
    assert _rows(entities) == [("Company", 2.0, 2), ("Person", 2.0, 2), ("Asset", 1.0, 1), ("Organization", 1.0, 1)]
    assert entities.record_count == 6

    evidence = run_query(db, inv_id, QueryRef(name="evidence_by_stance"))
    assert _rows(evidence) == [("Supports", 2.0, 2), ("Contradicts", 1.0, 1)]
    assert all(ref.record_type == "evidence" for row in evidence.rows for ref in row.record_refs)

    leads = run_query(db, inv_id, QueryRef(name="leads_by_status"))
    assert _rows(leads) == [("Unreviewed", 2.0, 2), ("Active", 1.0, 1)]

    documents = run_query(db, inv_id, QueryRef(name="documents_by_status"))
    assert documents.rows == [] and documents.record_count == 0


def test_describe_catalog_lists_every_query_and_whether_it_has_data(demo):
    db, inv_id = demo
    catalog = describe_catalog(db, inv_id)
    by_name = {q["name"]: q for q in catalog["queries"]}
    assert set(by_name) == {"payments_by_party", "payments_over_time", "events_over_time", "links_by_type", "claims_by_status",
                            "entities_by_schema", "evidence_by_stance", "documents_by_status", "leads_by_status"}
    assert by_name["payments_by_party"]["has_data"] and by_name["payments_by_party"]["currencies"] == ["USD"]
    assert by_name["payments_by_party"]["params"]["direction"] == {"description": "Rank who received the money, or who paid it.", "choices": ["received", "paid"], "default": "received"}
    assert by_name["documents_by_status"]["has_data"] is False
    assert catalog["drawn_kinds"] == ["bar", "column"]
    assert "sankey" in catalog["kinds"]


def _add_payment(db, inv_id: str, payer: str, beneficiary: str, props: dict) -> str:
    ids = {e.caption: e.id for e in db.query(Entity).filter_by(investigation_id=inv_id).all()}
    return create_relationship(db, investigation_id=inv_id, schema="Payment", source_entity_id=ids[payer], target_entity_id=ids[beneficiary], properties=props).id


def test_currencies_are_never_added_together(demo):
    db, inv_id = demo
    _add_payment(db, inv_id, "Meridian Holdings Ltd", "Harborline Civic Trust", {"amount": ["5000"], "currency": ["EUR"], "date": ["2024-01-10"]})
    _add_payment(db, inv_id, "Meridian Holdings Ltd", "Harborline Civic Trust", {"amount": ["7000"], "currency": ["EUR"], "date": ["2024-02-10"]})

    # No currency asked for: the one with the most payments is charted and the other is reported, not mixed in.
    default = run_query(db, inv_id, QueryRef(name="payments_by_party"))
    assert default.currency == "EUR"
    assert _rows(default) == [("Harborline Civic Trust", 12000.0, 2)]
    assert [(o["reason"], o["currency"], o["record_count"]) for o in default.omitted] == [("other currency", "USD", 1)]

    usd = run_query(db, inv_id, QueryRef(name="payments_by_party", params={"currency": "usd"}))
    assert usd.currency == "USD" and _rows(usd) == [("Meridian Holdings Ltd", 2400000.0, 1)]
    assert [(o["currency"], o["record_count"]) for o in usd.omitted] == [("EUR", 2)]

    over_time = run_query(db, inv_id, QueryRef(name="payments_over_time", params={"currency": "EUR"}))
    assert [(r.key, r.value, r.record_count) for r in over_time.rows] == [("2024-01", 5000.0, 1), ("2024-02", 7000.0, 1)]


def test_incomplete_payments_are_listed_not_guessed(demo):
    db, inv_id = demo
    edge_id = _add_payment(db, inv_id, "Bellcastle Trading Group", "Harborline Civic Trust", {"currency": ["USD"], "date": ["2024-05-01"]})
    data = run_query(db, inv_id, QueryRef(name="payments_by_party"))
    assert _rows(data) == [("Meridian Holdings Ltd", 2400000.0, 1)]
    omitted = next(o for o in data.omitted if o.get("record_id") == edge_id)
    assert omitted["reason"] == "incomplete payment" and "amount missing" in omitted["detail"]


def test_row_order_does_not_depend_on_insertion_order():
    groups = {"b": [RecordRef("claim", "1")], "a": [RecordRef("claim", "2")], "c": [RecordRef("claim", "3"), RecordRef("claim", "4"), RecordRef("claim", "3")]}
    expected = [("c", 2.0, 2), ("a", 1.0, 1), ("b", 1.0, 1)]
    for _ in range(5):
        keys = list(groups)
        random.shuffle(keys)
        rows = _category_rows({k: groups[k] for k in keys})
        assert [(r.label, r.value, r.record_count) for r in rows] == expected
        assert [ref.record_id for ref in rows[0].record_refs] == ["3", "4"]  # distinct, sorted


def test_period_helpers():
    assert period_key("2023-11-14", "month") == "2023-11"
    assert period_key("2023-11-14", "year") == "2023"
    assert period_key("2023", "month") is None
    assert period_key("", "year") is None
    assert period_label("2023-11") == "Nov 2023" and period_label("2023") == "2023"


def test_visual_data_round_trips_through_plain_dicts(demo):
    db, inv_id = demo
    data = run_query(db, inv_id, QueryRef(name="links_by_type"))
    again = VisualData.from_dict(data.as_dict())
    assert again == data


def test_unknown_investigation_is_a_query_error():
    with SessionLocal() as db:
        with pytest.raises(QueryError):
            run_query(db, "nope", QueryRef(name="links_by_type"))
        with pytest.raises(QueryError):
            describe_catalog(db, "nope")
        db.add(Investigation(name="empty"))
        db.commit()
        empty = db.query(Investigation).filter_by(name="empty").one()
        assert all(not q["has_data"] for q in describe_catalog(db, empty.id)["queries"])
