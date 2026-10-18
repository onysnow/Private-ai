"""How are these two connected? (app/services/paths.py)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _party(inv: str, name: str, schema: str = "Company") -> str:
    return ok(client.post("/api/entities", json={"investigation_id": inv, "schema": schema, "caption": name, "properties": {"name": [name]}}))["id"]


def _link(inv: str, schema: str, a: str, b: str) -> str:
    return ok(client.post("/api/relationships", json={"investigation_id": inv, "schema": schema, "source_entity_id": a, "target_entity_id": b}))["id"]


def test_every_chain_shortest_first_with_its_weakest_link():
    inv = ok(client.post("/api/investigations", json={"name": "Chains"}))["id"]
    jane, alpha, beta, gamma = _party(inv, "Jane", "Person"), _party(inv, "Alpha"), _party(inv, "Beta"), _party(inv, "Gamma")
    direct = _link(inv, "Directorship", jane, gamma)
    one = _link(inv, "Ownership", jane, alpha)
    two = _link(inv, "Ownership", alpha, beta)
    three = _link(inv, "Payment", gamma, beta)  # followed against its direction from Beta's side
    body = ok(client.get(f"/api/investigations/{inv}/paths", params={"from": jane, "to": beta}))
    chains = [[step["id"] for step in c["links"]] for c in body["chains"]]
    assert chains == sorted(chains, key=len)
    assert set(map(tuple, chains)) == {(one, two), (direct, three)}
    first = body["chains"][0]
    assert [p["name"] for p in first["parties"]][0] == "Jane" and [p["name"] for p in first["parties"]][-1] == "Beta"
    assert first["weakest"] == "unsupported"
    # A chain longer than max_len is not walked.
    assert ok(client.get(f"/api/investigations/{inv}/paths", params={"from": jane, "to": beta, "max_len": 1}))["chains"] == []
    assert ok(client.get(f"/api/investigations/{inv}/paths", params={"from": jane, "to": gamma, "max_len": 1}))["chains"][0]["links"][0]["id"] == direct


def test_two_different_parties_with_links_are_needed():
    inv = ok(client.post("/api/investigations", json={"name": "Chains 2"}))["id"]
    a, b, lone = _party(inv, "A"), _party(inv, "B"), _party(inv, "Lone")
    _link(inv, "Ownership", a, b)
    assert client.get(f"/api/investigations/{inv}/paths", params={"from": a, "to": a}).status_code == 400
    assert client.get(f"/api/investigations/{inv}/paths", params={"from": a, "to": lone}).status_code == 400


def test_all_record_tags_for_the_tag_layer():
    inv = ok(client.post("/api/investigations", json={"name": "Tag layer"}))["id"]
    a = _party(inv, "A")
    tag = ok(client.post(f"/api/investigations/{inv}/tags", json={"name": "Shell", "colour": "#89352a"}))["tags"][0]["id"]
    ok(client.post(f"/api/investigations/{inv}/record-tags", json={"tag_id": tag, "record_type": "entity", "record_id": a}))
    rows = ok(client.get(f"/api/investigations/{inv}/record-tags"))["rows"]
    assert rows == [{"tag_id": tag, "name": "Shell", "colour": "#89352a", "record_type": "entity", "record_id": a}]
