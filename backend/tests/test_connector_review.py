from fastapi.testclient import TestClient
from app.main import app
from app.connectors.base import Connector, ExternalFinding
from app.connectors.registry import registry

class FakeConnector(Connector):
    async def search(self, query: str):
        return [ExternalFinding(
            provider="fake", record_id="company-1", caption="Acme Holdings Inc.", schema="Company",
            url="https://example.test/company-1",
            properties={"name": ["Acme Holdings Inc."], "jurisdiction": ["us-in"], "address": ["123 Main St"]},
            raw={"id": "company-1", "dataset": "fake_registry"},
        )]

def test_non_destructive_resolution_and_statement_assessment():
    registry.register("fake", FakeConnector())
    client = TestClient(app)
    inv = client.post("/api/investigations", json={"name":"Test investigation"}).json()
    entity = client.post("/api/entities", json={
        "investigation_id":inv["id"], "schema":"Company", "caption":"Acme Holdings Inc.",
        "properties":{"name":["Acme Holdings Inc."]}, "dataset":"reporter"
    }).json()

    res = client.post("/api/connectors/fake/search", json={"investigation_id":inv["id"], "query":"Acme Holdings"})
    assert res.status_code == 200
    finding = res.json()[0]
    assert finding["properties"]["jurisdiction"] == ["us-in"]

    candidates = client.get(f"/api/connector-findings/{finding['id']}/candidates").json()
    assert candidates[0]["entity_id"] == entity["id"]

    decision = client.post(f"/api/connector-findings/{finding['id']}/resolution", json={
        "entity_id":entity["id"], "decision":"positive", "confidence":0.95, "rationale":"Exact name and schema"
    })
    assert decision.status_code == 200

    assessment = client.post(f"/api/connector-findings/{finding['id']}/assessments", json={
        "entity_id":entity["id"], "prop":"jurisdiction", "value":"us-in", "status":"accepted", "note":"Matches filing"
    })
    assert assessment.status_code == 200
    assert assessment.json()["status"] == "accepted"

    statements = client.get(f"/api/entities/{entity['id']}/statements").json()
    assert all(s["value"] != "us-in" for s in statements), "identity resolution must not silently promote external values"

    assessments = client.get(f"/api/connector-findings/{finding['id']}/assessments").json()
    assert assessments[0]["prop"] == "jurisdiction"
    assert assessments[0]["status"] == "accepted"
