from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def test_capabilities_distinguish_openaleph_platform_from_external_connectors(monkeypatch):
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    client = TestClient(app)
    body = client.get("/api/capabilities").json()
    assert body["mode"] == "integrated_preview"
    assert body["platforms"]["openaleph"]["enabled"] is True
    assert body["platforms"]["openaleph"]["role"] == "local_corpus_search_ingestion_platform"
    assert body["core"]["connectors"] is True


def test_openaleph_status_endpoint_reports_real_probe_result(monkeypatch):
    async def fake_probe():
        class Status:
            def to_dict(self):
                return {
                    "configured": True,
                    "base_url": "http://api:8000",
                    "ui_url": "http://localhost:8080",
                    "reachable": True,
                    "api_usable": True,
                    "http_status": 200,
                    "detail": "OpenAleph search API is reachable",
                }
        return Status()

    monkeypatch.setattr("app.api.routes_system.probe_openaleph", fake_probe)
    client = TestClient(app)
    response = client.get("/api/integrations/openaleph/status")
    assert response.status_code == 200
    body = response.json()
    assert body["reachable"] is True
    assert body["api_usable"] is True
    assert body["http_status"] == 200
