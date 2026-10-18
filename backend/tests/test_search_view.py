"""The redesigned search (app/services/search_view.py): one result per thing,
names for ids, kind, parties, how sure, matched fields, tags, facets and
filters."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _case() -> dict[str, str]:
    inv = ok(client.post("/api/investigations", json={"name": "Search view"}))["id"]
    owner = ok(client.post("/api/entities", json={"investigation_id": inv, "schema": "Person", "caption": "Jane Quarry",
                                                  "properties": {"name": ["Jane Quarry"]}}))
    company = ok(client.post("/api/entities", json={"investigation_id": inv, "schema": "Company", "caption": "Quarry Holdings",
                                                    "properties": {"name": ["Quarry Holdings"]}}))
    rel = ok(client.post("/api/relationships", json={"investigation_id": inv, "schema": "Ownership",
                                                     "source_entity_id": owner["id"], "target_entity_id": company["id"],
                                                     "properties": {"role": ["Quarry shareholder"]}}))
    claim = ok(client.post("/api/claims", json={"investigation_id": inv, "text": "Jane Quarry controls Quarry Holdings.",
                                                "status": "disputed"}))
    ok(client.post("/api/timeline-events", json={"investigation_id": inv, "title": "Quarry Holdings registered",
                                                 "date_start": "2019-04-02", "verification_status": "verified"}))
    return {"inv": inv, "owner": owner["id"], "company": company["id"], "rel": rel["id"], "claim": claim["id"]}


def test_one_result_per_thing_with_names_kind_parties_and_how_sure():
    ids = _case()
    body = ok(client.get("/api/search", params={"q": "Quarry", "investigation_id": ids["inv"]}))
    results = body["results"]
    # The link is found once, as a link, not again as the FtM entity that carries it.
    links = [r for r in results if r["kind"] == "link"]
    assert [r["id"] for r in links] == [ids["rel"]]
    assert not any(r["type"] == "entity" and r["metadata"].get("schema") == "Ownership" for r in results)
    assert {p["name"] for p in links[0]["parties"]} == {"Jane Quarry", "Quarry Holdings"}
    party = next(r for r in results if r["type"] == "entity" and r["id"] == ids["owner"])
    assert party["kind"] == "party"
    assert party["parties"] == [{"id": ids["owner"], "name": "Jane Quarry", "schema": "Person"}]
    assert "name" in party["matched_fields"]
    claim = next(r for r in results if r["type"] == "claim")
    assert (claim["kind"], claim["sure"]) == ("claim_event", "disputed")
    event = next(r for r in results if r["type"] == "timeline_event")
    assert (event["sure"], event["date"]) == ("supported", "2019-04-02")
    # No raw FtM ids in what the reader sees.
    import re
    for r in results:
        assert not re.search(r"\b[0-9a-f]{32,}\b", r["title"] + " " + r["snippet"]), (r["title"], r["snippet"])


def test_facets_count_everything_found_and_filters_narrow_it():
    ids = _case()
    base = {"q": "Quarry", "investigation_id": ids["inv"]}
    body = ok(client.get("/api/search", params=base))
    assert body["facets"]["kind"]["party"] >= 2
    assert body["facets"]["party_kind"] == {"person": body["facets"]["party_kind"]["person"], "company": body["facets"]["party_kind"]["company"]}
    assert body["facets"]["sure"]["disputed"] >= 1
    people = ok(client.get("/api/search", params={**base, "kind": "party", "party_kind": "person"}))["results"]
    assert people and all(r["kind"] == "party" and r["parties"][0]["schema"] == "Person" for r in people)
    # The facets stay those of the whole search when a filter is on.
    assert ok(client.get("/api/search", params={**base, "kind": "party"}))["facets"] == body["facets"]
    dated = ok(client.get("/api/search", params={**base, "date_from": "2019", "date_to": "2019"}))["results"]
    assert [r["type"] for r in dated] == ["timeline_event"]
    assert ok(client.get("/api/search", params={**base, "date_from": "2020"}))["results"] == []


def test_tags_and_notes_show_on_results_and_filter_them():
    ids = _case()
    inv = ids["inv"]
    tag = ok(client.post(f"/api/investigations/{inv}/tags", json={"name": "Owner", "colour": "#314d65"}))["tags"][0]
    ok(client.post(f"/api/investigations/{inv}/record-tags", json={"tag_id": tag["id"], "record_type": "entity", "record_id": ids["owner"]}))
    ok(client.post(f"/api/investigations/{inv}/notes", json={"text": "Check her other companies.", "record_type": "entity", "record_id": ids["owner"]}))
    body = ok(client.get("/api/search", params={"q": "Quarry", "investigation_id": inv}))
    owner = next(r for r in body["results"] if r["id"] == ids["owner"])
    assert [t["name"] for t in owner["tags"]] == ["Owner"]
    assert owner["note_count"] == 1
    assert body["facets"]["tag"] == {tag["id"]: 1}
    tagged = ok(client.get("/api/search", params={"q": "Quarry", "investigation_id": inv, "tag": tag["id"]}))["results"]
    assert [r["id"] for r in tagged] == [ids["owner"]]


def test_peek_shows_linked_parties_and_the_latest_event():
    ids = _case()
    inv = ids["inv"]
    ok(client.post("/api/timeline-events", json={"investigation_id": inv, "title": "Jane Quarry appointed",
                                                 "date_start": "2021-06-01", "entity_id": ids["owner"]}))
    ok(client.post("/api/timeline-events", json={"investigation_id": inv, "title": "Jane Quarry resigned",
                                                 "date_start": "2023-01-15", "entity_id": ids["owner"]}))
    card = ok(client.get(f"/api/investigations/{inv}/peek", params={"record_type": "entity", "record_id": ids["owner"]}))
    assert card["caption"] == "Jane Quarry"
    assert card["link_count"] == 1
    assert card["neighbours"] == [{"id": ids["company"], "name": "Quarry Holdings", "schema": "Company", "link": "Ownership", "outgoing": True}]
    assert card["latest_event"]["title"] == "Jane Quarry resigned"
    link = ok(client.get(f"/api/investigations/{inv}/peek", params={"record_type": "relationship", "record_id": ids["rel"]}))
    assert {n["name"] for n in link["neighbours"]} == {"Jane Quarry", "Quarry Holdings"}
    assert client.get(f"/api/investigations/{inv}/peek", params={"record_type": "entity", "record_id": "nope"}).status_code == 404
