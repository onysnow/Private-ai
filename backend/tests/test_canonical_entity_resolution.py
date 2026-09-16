from fastapi.testclient import TestClient
from app.main import app

def _inv(client, name="Canonical resolution"):
    return client.post("/api/investigations", json={"name": name}).json()["id"]

def _entity(client, inv, caption, schema="Person"):
    return client.post("/api/entities", json={"investigation_id": inv, "schema": schema, "caption": caption, "properties": {"name": [caption]}}).json()

def test_canonical_duplicate_review_is_non_destructive_and_auditable():
    client = TestClient(app)
    inv = _inv(client)
    a = _entity(client, inv, "Todd Hansen")
    b = _entity(client, inv, "Todd C. Hansen")
    rows = client.get(f"/api/entities/{a['id']}/duplicate-candidates").json()
    candidate = next(x for x in rows if x["entity_id"] == b["id"])
    assert candidate["score"] > 0
    assert candidate["latest_decision"] is None

    r = client.post(f"/api/entities/{a['id']}/canonical-resolution", json={
        "other_entity_id": b["id"], "decision": "same", "confidence": 0.91,
        "rationale": "Names and identifiers require a reporter-controlled merge later.",
    })
    assert r.status_code == 200
    assert r.json()["decision"] == "same"

    # Review does not silently mutate, delete or combine canonical records.
    entities = client.get(f"/api/investigations/{inv}/entities").json()
    assert {x["id"] for x in entities} >= {a["id"], b["id"]}
    rows = client.get(f"/api/entities/{b['id']}/duplicate-candidates").json()
    reverse = next(x for x in rows if x["entity_id"] == a["id"])
    assert reverse["latest_decision"]["decision"] == "same"
    assert reverse["latest_decision"]["confidence"] == 0.91

def test_canonical_resolution_rejects_cross_investigation_and_self():
    client = TestClient(app)
    inv1 = _inv(client, "one"); inv2 = _inv(client, "two")
    a = _entity(client, inv1, "Acme Holdings", "Company")
    b = _entity(client, inv2, "Acme Holdings", "Company")
    r = client.post(f"/api/entities/{a['id']}/canonical-resolution", json={"other_entity_id": b["id"], "decision": "same"})
    assert r.status_code == 409
    r = client.post(f"/api/entities/{a['id']}/canonical-resolution", json={"other_entity_id": a["id"], "decision": "same"})
    assert r.status_code == 409
