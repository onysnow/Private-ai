"""Does the quote state the value? (app/ai/value_check.py): a figure, bar or
timeline item in an AI presentation draft keeps its place only when its
found quotes state the number or date it shows."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.ai.quote_check import check_presentation_quotes
from app.ai.value_check import date_stated, number_stated, text_stated, unstated_value
from app.db.session import SessionLocal
from app.main import app

client = TestClient(app)


def test_a_number_matches_a_quote_that_states_it_to_the_precision_written():
    assert number_stated("$2.4M", ["Bank records show a transfer of $2,400,000.00"])
    assert number_stated("$2.4M", ["about 2.43 million dollars"])               # rounds to 2.4 million
    assert number_stated("€1.2bn", ["a loan of 1.2 billion euros"])
    assert number_stated("12 companies", ["registered 12 shell companies"])
    assert not number_stated("$2.4M", ["a transfer of $2,500,000"])
    assert not number_stated("$2.4M", ["a transfer of 2.4 thousand dollars"])
    assert not number_stated("$2.40M", ["about 2.43 million dollars"])           # written to a finer precision
    assert not number_stated("40%", ["40 staff were let go"])                    # a share is not a count
    assert number_stated("40%", ["a 40 % stake"])
    # A chart value is drawn with exactly its digits; its unit says whether it is a share.
    assert number_stated(2400000, ["$2.4M wired"]) and number_stated(1250.5, ["a fee of 1,250.50 USD"])
    assert not number_stated(1250.5, ["a fee of 1,250 USD"])
    assert number_stated(40, ["a 40% stake"], percent=True) and not number_stated(40, ["a 40% stake"])


def test_a_date_matches_a_quote_that_states_every_part_written():
    assert date_stated("2023-11", ["wired on 14 November 2023"])
    assert date_stated("2023-11-14", ["wired on 2023-11-14."]) and date_stated("2023-11-14", ["on Nov. 14th, 2023"])
    assert date_stated("Nov 2023", ["in November 2023"]) and date_stated("2023", ["filed on 2023-03-01"])
    assert date_stated("2023-11-14", ["dated 11/14/2023"]) and date_stated("2023-11-14", ["dated 14/11/2023"])
    assert not date_stated("2023-11-14", ["in November 2023"])                 # more precise than the source
    assert not date_stated("2023-12", ["on 14 November 2023"])
    assert not date_stated("2023-11", ["2,023 transfers"])


def test_a_figure_without_a_number_must_be_in_its_quote():
    assert text_stated("Panama", ["registered in  panama city"]) and not text_stated("Panama", ["registered in Belize"])
    assert unstated_value("figures", {"value": "Panama"}, ["registered in Belize"]) == "the value 'Panama' is not stated in its quotes"
    assert unstated_value("bar", {"value": 900000}, ["Corvo was paid 900,000 USD"], unit="USD") is None
    assert unstated_value("timeline", {"date": "2023-11-03"}, ["paid on 2023-11-14"]) == "the date '2023-11-03' is not stated in its quotes"


def test_the_quote_check_removes_an_item_whose_quote_does_not_state_its_value():
    inv = client.post("/api/investigations", json={"name": "Value check"}).json()
    source = client.post("/api/sources", json={"investigation_id": inv["id"], "title": "Wire log", "source_type": "filing"}).json()
    evidence = client.post("/api/evidence", json={"source_id": source["id"], "locator": "row 41",
                                                  "quote": "$2.4M wired to Bellcastle Holdings on 2023-11-14."}).json()
    ref = {"record_type": "evidence", "record_id": evidence["id"], "quote": "$2.4M wired to Bellcastle Holdings"}
    dated = {"record_type": "evidence", "record_id": evidence["id"], "quote": "Bellcastle Holdings on 2023-11-14"}
    payload = {"sections": [
        {"heading": "The fee", "key_points": [{"text": "$2.4M", "evidence": [ref]}], "evidence": [ref],
         "visual": {"type": "figures", "items": [{"value": "$2.4M", "label": "to Bellcastle", "evidence": [ref]},
                                                 {"value": "$3.1M", "label": "in total", "evidence": [ref]}]}},
        {"heading": "When", "key_points": [{"text": "Wired in November", "evidence": [dated]}], "evidence": [dated],
         "visual": {"type": "timeline", "items": [{"date": "2023-11-14", "label": "Wired", "evidence": [dated]},
                                                  {"date": "2023-11-03", "label": "Signed", "evidence": [dated]}]}},
    ]}
    with SessionLocal() as db:
        checked, report = check_presentation_quotes(db, payload)
    figures, timeline = checked["sections"][0]["visual"], checked["sections"][1]["visual"]
    assert [item["value"] for item in figures["items"]] == ["$2.4M"]
    assert timeline is None   # one dated item left; a timeline needs two
    reasons = [(r["where"], r["reason"]) for r in report["removed"]]
    assert ("The fee: figures item 2", "the value '$3.1M' is not stated in its quotes") in reasons
    assert ("When: timeline item 2", "the date '2023-11-03' is not stated in its quotes") in reasons
    assert ("When: timeline", "fewer than 2 item(s) left with a found quote stating the value") in reasons
