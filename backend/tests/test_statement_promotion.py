from fastapi.testclient import TestClient
from app.main import app
from app.connectors.base import Connector, ExternalFinding
from app.connectors.registry import registry

class PromotionConnector(Connector):
    async def search(self, query: str):
        return [ExternalFinding(
            provider="promotionfake", record_id="company-p1", caption="NiSource Inc.", schema="Company",
            url="https://example.test/company-p1",
            properties={"name": ["NiSource Inc."], "jurisdiction": ["us-in"], "address": ["123 Main St"]},
            raw={"id": "company-p1", "dataset": "corporate_registry_test"},
        )]

def test_explicit_promotion_adds_only_accepted_value_with_provenance():
    registry.register("promotionfake", PromotionConnector())
    client = TestClient(app)
    inv = client.post("/api/investigations", json={"name":"Promotion test"}).json()
    entity = client.post("/api/entities", json={
        "investigation_id":inv["id"], "schema":"Company", "caption":"NiSource Inc.",
        "properties":{"name":["NiSource Inc."]}, "dataset":"reporter"
    }).json()
    finding = client.post("/api/connectors/promotionfake/search", json={"investigation_id":inv["id"], "query":"NiSource"}).json()[0]
    client.post(f"/api/connector-findings/{finding['id']}/resolution", json={
        "entity_id":entity["id"], "decision":"positive", "confidence":0.99, "rationale":"Same legal entity"
    })
    assessment = client.post(f"/api/connector-findings/{finding['id']}/assessments", json={
        "entity_id":entity["id"], "prop":"jurisdiction", "value":"us-in", "status":"accepted", "note":"Verified against registry"
    }).json()

    before = client.get(f"/api/entities/{entity['id']}/statements").json()
    assert all(s["value"] != "us-in" for s in before)

    promoted = client.post(f"/api/statement-assessments/{assessment['id']}/promote", json={"note":"Reporter approved"})
    assert promoted.status_code == 200
    p = promoted.json()
    assert p["provider"] == "promotionfake"
    assert p["dataset"] == "corporate_registry_test"
    assert p["source_url"] == "https://example.test/company-p1"
    assert p["original_value"] == "us-in"

    statements = client.get(f"/api/entities/{entity['id']}/statements").json()
    jurisdiction = [s for s in statements if s["prop"] == "jurisdiction" and s["value"] == "us-in"]
    assert len(jurisdiction) == 1
    assert jurisdiction[0]["dataset"] == "corporate_registry_test"
    assert jurisdiction[0]["origin"] == "https://example.test/company-p1"
    assert all(s["value"] != "123 Main St" for s in statements)

    canonical = client.get(f"/api/investigations/{inv['id']}/entities").json()
    canonical_entity = next(x for x in canonical if x["id"] == entity["id"])
    assert canonical_entity["properties"]["jurisdiction"] == ["us-in"]
    assert "address" not in canonical_entity["properties"]

    promotions = client.get(f"/api/entities/{entity['id']}/promotions").json()
    assert len([x for x in promotions if x["assessment_id"] == assessment["id"]]) == 1

    duplicate = client.post(f"/api/statement-assessments/{assessment['id']}/promote", json={})
    assert duplicate.status_code == 200
    assert duplicate.json()["id"] == p["id"]


def test_promotion_requires_accepted_assessment_and_positive_identity():
    registry.register("promotionfake2", PromotionConnector())
    client = TestClient(app)
    inv = client.post("/api/investigations", json={"name":"Promotion guard test"}).json()
    entity = client.post("/api/entities", json={
        "investigation_id":inv["id"], "schema":"Company", "caption":"NiSource Inc.",
        "properties":{"name":["NiSource Inc."]}, "dataset":"reporter"
    }).json()
    finding = client.post("/api/connectors/promotionfake2/search", json={"investigation_id":inv["id"], "query":"NiSource"}).json()[0]
    unresolved = client.post(f"/api/connector-findings/{finding['id']}/assessments", json={
        "entity_id":entity["id"], "prop":"jurisdiction", "value":"us-in", "status":"unresolved"
    }).json()
    r = client.post(f"/api/statement-assessments/{unresolved['id']}/promote", json={})
    assert r.status_code == 409

    accepted = client.post(f"/api/connector-findings/{finding['id']}/assessments", json={
        "entity_id":entity["id"], "prop":"jurisdiction", "value":"us-in", "status":"accepted"
    }).json()
    r = client.post(f"/api/statement-assessments/{accepted['id']}/promote", json={})
    assert r.status_code == 409
    assert "positive identity resolution" in r.json()["detail"].lower()
