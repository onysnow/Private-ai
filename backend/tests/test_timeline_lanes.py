"""Timeline › Lanes (app/services/timeline_lanes.py, mockup TIME_1): each event with the parties it is about, its
amount, where it comes from and one mark for whether it is shown; the sequence check (a payment before any recorded
award); named periods; documents not on the timeline yet and sources with no date."""

from __future__ import annotations

from app.db.session import SessionLocal
from app.models.domain import Claim, Source
from tests.test_red_flags import _inv, _link, _party, client, ok


def _event(inv: str, title: str, date: str, **extra) -> str:
    body = {"investigation_id": inv, "title": title, "date_start": date, "precision": extra.pop("precision", "day"), **extra}
    return ok(client.post("/api/timeline-events", json=body))["id"]


def _lanes(inv: str) -> dict:
    return ok(client.get(f"/api/investigations/{inv}/timeline/lanes"))


def test_a_payment_before_any_recorded_award_is_said_and_its_lanes_and_amount_are_given():
    inv = _inv("Harbour land")
    fern, kestrel = _party(inv, "Fernhill Ltd"), _party(inv, "Kestrel SA")
    council = _party(inv, "Harbour Council", schema="PublicBody")
    _link(inv, "Payment", fern, kestrel, date=["2019-05"], amount=["42000"], currency=["EUR"])
    _event(inv, "Tender opens", "2019-01-15", entity_id=council)
    _event(inv, "Contract awarded to Kestrel SA", "2019-09-02", entity_id=council)

    view = _lanes(inv)
    pay = next(e for e in view["events"] if e["schema"] == "Payment")
    assert set(pay["parties"]) == {fern, kestrel}
    assert (pay["amount"], pay["currency"], pay["precision"]) == (42000.0, "EUR", "month")
    assert pay["fact"] == "not_yet" and pay["source_key"] == "you"  # a link typed in the app
    [found] = view["sequence"]
    assert found["event_id"] == pay["id"] and found["missing"] == "award" and found["rule"] == "procurement"
    tender = next(e for e in view["events"] if e["title"] == "Tender opens")
    awarded = next(e for e in view["events"] if e["title"].startswith("Contract awarded"))
    assert found["after_id"] == tender["id"] and found["found_later_id"] == awarded["id"]
    assert [p["caption"] for p in view["parties"]][:1] == ["Harbour Council"]
    assert view["span"] == {"first": "2019", "last": "2019", "busiest": "2019"}
    assert view["opens_on"] == view["events"][0]["id"]

    # An award recorded before the payment: nothing is out of order.
    _event(inv, "Award announced", "2019-03-04", entity_id=council)
    assert _lanes(inv)["sequence"] == []


def test_a_month_only_date_that_overlaps_is_not_said_to_be_out_of_order():
    inv = _inv("Overlap")
    fern, kestrel = _party(inv, "Fernhill Ltd"), _party(inv, "Kestrel SA")
    _link(inv, "Payment", fern, kestrel, date=["2019-05"], amount=["9800"], currency=["EUR"])
    _event(inv, "Tender opens", "2019-01-15")
    _event(inv, "Award announced", "2019-05-20")
    assert _lanes(inv)["sequence"] == []


def test_one_mark_per_event_from_grade_status_tier_and_placeholder():
    inv = _inv("Marks")
    with SessionLocal() as db:
        register = Source(investigation_id=inv, title="Company register extract", source_type="document", source_tier="A")
        db.add(register)
        db.commit()
        register_id = register.id
    _event(inv, "Board meeting", "2018-02-01", grade="likely")
    _event(inv, "Emails about the filing", "2020-01-10", verification_status="disputed")
    _event(inv, "Owned by Kestrel SA", "2017", precision="year", verification_status="approximate")
    _event(inv, "Kestrel SA registered", "2016-03-01", source_id=register_id)
    _event(inv, "Meeting with Fernhill", "2017", precision="year", placeholder=True)
    _event(inv, "A lunch", "2018-06-01", grade="weak")
    marks = {e["title"]: (e["fact"], e["fact_note"]) for e in _lanes(inv)["events"]}
    assert marks["Board meeting"] == ("shown", "Graded likely")
    assert marks["Emails about the filing"][0] == "disputed"
    assert marks["Owned by Kestrel SA"][0] == "worked_out"
    assert marks["Kestrel SA registered"][0] == "shown"
    assert marks["Meeting with Fernhill"] == ("not_yet", "A placeholder: no evidence attached yet")
    assert marks["A lunch"] == ("not_yet", "Graded weak: a single source says it happened")
    placeholder = next(e for e in _lanes(inv)["events"] if e["title"] == "Meeting with Fernhill")
    assert placeholder["placeholder"] is True and placeholder["source_key"] == "you"


def test_documents_not_on_the_timeline_yet_and_sources_with_no_date():
    inv = _inv("Filmstrip")
    with SessionLocal() as db:
        dated = Source(investigation_id=inv, title="Loop Two BV annual accounts", source_type="filing",
                       metadata_json={"filing_date": "2020"})
        bare = Source(investigation_id=inv, title="A photo of the fence", source_type="photo", metadata_json={})
        torn = Source(investigation_id=inv, title="A torn note", source_type="document", metadata_json={"date": "last spring"})
        db.add_all([dated, bare, torn])
        db.commit()
        dated_id = dated.id
    view = _lanes(inv)
    assert [(f["title"], f["date"], f["precision"], f["date_key"]) for f in view["not_placed"]] == [
        ("Loop Two BV annual accounts", "2020", "year", "filing date")]
    assert {u["title"]: u["why"] for u in view["undated"]} == {
        "A photo of the fence": "Its details hold no date", "A torn note": "Its date could not be read"}
    _event(inv, "Loop Two BV files its accounts", "2020", precision="year", source_id=dated_id)
    after = _lanes(inv)
    assert after["not_placed"] == [] and after["not_placed_total"] == 0
    placed = next(e for e in after["events"] if e["title"] == "Loop Two BV files its accounts")
    assert (placed["source_key"], placed["source_label"]) == (f"source:{dated_id}", "Loop Two BV annual accounts")


def test_named_periods_are_kept_changed_and_taken_away():
    inv = _inv("Periods")
    made = client.post(f"/api/investigations/{inv}/timeline/periods",
                       json={"name": "The money", "date_start": "2018", "date_end": "2018-12", "summary": "Three payments"})
    assert made.status_code == 201, made.text
    period = made.json()
    assert (period["date_start"], period["date_end"]) == ("2018", "2018-12")
    bad = client.post(f"/api/investigations/{inv}/timeline/periods", json={"name": "Back", "date_start": "2019", "date_end": "2018"})
    assert bad.status_code == 422 and "ends before it starts" in bad.json()["detail"]
    moved = ok(client.put(f"/api/investigations/{inv}/timeline/periods/{period['id']}",
                          json={"name": "The money", "date_start": "2018-01", "date_end": "2018-06"}))
    assert moved["date_end"] == "2018-06" and moved["summary"] == ""
    assert [p["name"] for p in _lanes(inv)["periods"]] == ["The money"]
    other = _inv("Elsewhere")
    assert client.delete(f"/api/investigations/{other}/timeline/periods/{period['id']}").status_code == 404
    assert client.delete(f"/api/investigations/{inv}/timeline/periods/{period['id']}").status_code == 204
    assert _lanes(inv)["periods"] == []


def test_replay_steps_are_the_story_claims_in_the_order_things_happened():
    inv = _inv("Replay")
    assert _lanes(inv)["steps"] == [] and _lanes(inv)["steps_from"] == "events"
    early = ok(client.post("/api/claims", json={"investigation_id": inv, "text": "Kestrel SA is set up"}))["id"]
    with SessionLocal() as db:  # as if reviewed Supported (the review itself is tested with the Done rules)
        db.get(Claim, early).status = "supported"
        db.commit()
    late = ok(client.post("/api/claims", json={"investigation_id": inv, "text": "A deposit, with no award recorded", "status": "unverified"}))["id"]
    bare = ok(client.post("/api/claims", json={"investigation_id": inv, "text": "Nothing dates this"}))["id"]
    story = ok(client.post(f"/api/investigations/{inv}/story/sections", json={"title": "The money"}))
    section = story["sections"][0]["id"]
    for claim in (late, early, bare):  # placed in the story out of date order
        ok(client.post(f"/api/investigations/{inv}/story/sections/{section}/claims", json={"claim_id": claim}))
    _event(inv, "Deposit email", "2019-05", precision="month", claim_id=late)
    _event(inv, "Registered", "2016-03-01", claim_id=early, grade="confirmed")
    _event(inv, "Director appointed", "2017-07-03", claim_id=early, grade="likely")
    view = _lanes(inv)
    assert view["steps_from"] == "story" and view["steps_undated"] == 1
    assert [(s["title"], s["date_start"], s["date_end"], s["unresolved"]) for s in view["steps"]] == [
        ("Kestrel SA is set up", "2016-03-01", "2017-07-03", False),
        ("A deposit, with no award recorded", "2019-05", None, True)]
    assert len(view["steps"][0]["event_ids"]) == 2


def test_a_built_timeline_is_the_owners_order_of_this_cases_events():
    inv = _inv("Built")
    a = _event(inv, "Council opens the tender", "2019-01-15")
    b = _event(inv, "The deposit went across", "2019-05", precision="month")
    made = client.post(f"/api/investigations/{inv}/built-timelines", json={"name": "For the editor", "items": [b, a, b]})
    assert made.status_code == 201, made.text
    built = made.json()
    assert built["items"] == [b, a] and built["owner"] == "local-owner"
    bad = client.put(f"/api/investigations/{inv}/built-timelines/{built['id']}", json={"name": "For the editor", "items": ["relationship:nope"]})
    assert bad.status_code == 422 and "Not an event in this case" in bad.json()["detail"]
    ok(client.put(f"/api/investigations/{inv}/built-timelines/{built['id']}", json={"name": "Ross's year", "items": [a]}))
    assert [(t["name"], t["items"]) for t in ok(client.get(f"/api/investigations/{inv}/built-timelines"))] == [("Ross's year", [a])]
    # The events themselves are untouched.
    assert {e["title"] for e in _lanes(inv)["events"]} == {"Council opens the tender", "The deposit went across"}
    other = _inv("Elsewhere")
    assert client.delete(f"/api/investigations/{other}/built-timelines/{built['id']}").status_code == 404
    assert client.delete(f"/api/investigations/{inv}/built-timelines/{built['id']}").status_code == 204
    assert ok(client.get(f"/api/investigations/{inv}/built-timelines")) == []
