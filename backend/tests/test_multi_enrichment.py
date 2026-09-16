from fastapi.testclient import TestClient
from app.db.session import Base, engine
from app.main import app
from app.connectors.registry import registry
from app.connectors.base import Connector, ExternalFinding


class GoodConnector(Connector):
    async def search(self, query: str):
        return []

    async def enrich(self, entity: dict):
        return [ExternalFinding(provider="good", record_id="g-1", caption=entity["caption"], schema=entity["schema"], properties={"name": [entity["caption"]]}, raw={"ok": True})]


class BadConnector(Connector):
    async def search(self, query: str):
        return []

    async def enrich(self, entity: dict):
        raise RuntimeError("provider unavailable")


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    registry.register("good", GoodConnector())
    registry.register("bad", BadConnector())


def test_multi_provider_enrichment_session_tracks_partial_failure():
    client = TestClient(app)
    inv = client.post("/api/investigations", json={"name": "Multi enrich"}).json()
    entity = client.post("/api/entities", json={
        "investigation_id": inv["id"], "schema": "Company", "caption": "NiSource Inc.",
        "properties": {"name": ["NiSource Inc."]},
    }).json()

    response = client.post(f'/api/entities/{entity["id"]}/enrich', json={"providers": ["good", "bad"]})
    assert response.status_code == 200
    session = response.json()
    assert session["status"] == "partial"
    assert session["total_results"] == 1
    assert {r["provider"]: r["status"] for r in session["runs"]} == {"good": "completed", "bad": "failed"}

    detail = client.get(f'/api/enrichment-sessions/{session["id"]}')
    assert detail.status_code == 200
    assert len(detail.json()["runs"]) == 2

    findings = client.get(f'/api/investigations/{inv["id"]}/connector-findings').json()
    assert any(f["provider"] == "good" and f["provider_record_id"] == "g-1" for f in findings)

    sessions = client.get(f'/api/entities/{entity["id"]}/enrichment-sessions').json()
    assert sessions[0]["id"] == session["id"]


def test_multi_provider_rejects_unknown_connector():
    client = TestClient(app)
    inv = client.post("/api/investigations", json={"name": "Unknown provider"}).json()
    entity = client.post("/api/entities", json={
        "investigation_id": inv["id"], "schema": "Person", "caption": "Example Person",
        "properties": {"name": ["Example Person"]},
    }).json()
    response = client.post(f'/api/entities/{entity["id"]}/enrich', json={"providers": ["missing"]})
    assert response.status_code == 400
