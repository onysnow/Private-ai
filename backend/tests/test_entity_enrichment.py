from fastapi.testclient import TestClient
from app.main import app
from app.connectors.base import Connector, ExternalFinding
from app.connectors.registry import registry


class EntityAwareConnector(Connector):
    def __init__(self):
        self.seen = None

    async def search(self, query: str):
        return []

    async def enrich(self, entity: dict):
        self.seen = entity
        return [ExternalFinding(
            provider="entityfake", record_id="match-1", caption="NiSource Inc.", schema="Company",
            url="https://example.test/match-1",
            properties={"name": ["NiSource Inc."], "jurisdiction": ["us-in"]},
            raw={"score": 0.99, "mode": "entity-match"},
        )]


def test_entity_driven_enrichment_persists_findings_and_run():
    connector = EntityAwareConnector()
    registry.register("entityfake", connector)
    client = TestClient(app)
    inv = client.post("/api/investigations", json={"name": "Entity enrichment"}).json()
    entity = client.post("/api/entities", json={
        "investigation_id": inv["id"], "schema": "Company", "caption": "NiSource Inc.",
        "properties": {"name": ["NiSource Inc."], "jurisdiction": ["us-in"]}, "dataset": "reporter",
    }).json()

    response = client.post(f"/api/entities/{entity['id']}/enrich/entityfake")
    assert response.status_code == 200
    finding = response.json()[0]
    assert finding["provider"] == "entityfake"
    assert finding["raw"]["mode"] == "entity-match"
    assert connector.seen["schema"] == "Company"
    assert connector.seen["properties"]["jurisdiction"] == ["us-in"]

    runs = client.get(f"/api/investigations/{inv['id']}/connector-runs").json()
    assert any(r["provider"] == "entityfake" and r["query"].startswith("entity:") and r["status"] == "completed" for r in runs)

    findings = client.get(f"/api/investigations/{inv['id']}/connector-findings").json()
    assert any(f["provider"] == "entityfake" and f["provider_record_id"] == "match-1" for f in findings)
