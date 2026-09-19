"""Covers STRUCT-0019: PUT/DELETE /api/settings/connectors/{provider}/credential
had zero test coverage. tests/test_connector_credentials.py only exercises the
lower-level app/services/credentials.py store directly; this exercises the
save_connector_credential/delete_connector_credential wrapper functions (and
the routes that call them) across the three branches they were written to
distinguish: unknown provider (404), blank credential (400), and a forced
store failure (500).
"""
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)


def test_save_unknown_provider_returns_404(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "connector_credentials_file", str(tmp_path / "connectors.json"))
    r = client.put("/api/settings/connectors/not-a-real-provider/credential", json={"credential": "secret-value"})
    assert r.status_code == 404, r.text


def test_delete_unknown_provider_returns_404(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "connector_credentials_file", str(tmp_path / "connectors.json"))
    r = client.delete("/api/settings/connectors/not-a-real-provider/credential")
    assert r.status_code == 404, r.text


def test_save_blank_credential_returns_400(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "connector_credentials_file", str(tmp_path / "connectors.json"))
    r = client.put("/api/settings/connectors/aleph/credential", json={"credential": "   "})
    assert r.status_code == 400, r.text


def test_save_missing_credential_field_returns_400(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "connector_credentials_file", str(tmp_path / "connectors.json"))
    r = client.put("/api/settings/connectors/aleph/credential", json={})
    assert r.status_code == 400, r.text


def test_save_and_delete_round_trip_returns_200(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "connector_credentials_file", str(tmp_path / "connectors.json"))
    saved = client.put("/api/settings/connectors/aleph/credential", json={"credential": "aleph-secret"})
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["provider"] == "aleph"
    assert body["configured"] is True
    assert "aleph-secret" not in saved.text

    deleted = client.delete("/api/settings/connectors/aleph/credential")
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["removed"] is True


def test_save_store_failure_returns_500(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "connector_credentials_file", str(tmp_path / "connectors.json"))

    def _boom(path, provider, secret):
        raise RuntimeError("disk full")

    monkeypatch.setattr("app.services.settings.set_secret", _boom)
    r = client.put("/api/settings/connectors/aleph/credential", json={"credential": "secret-value"})
    assert r.status_code == 500, r.text


def test_delete_store_failure_returns_500(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "connector_credentials_file", str(tmp_path / "connectors.json"))

    def _boom(path, provider):
        raise RuntimeError("disk full")

    monkeypatch.setattr("app.services.settings.remove_secret", _boom)
    r = client.delete("/api/settings/connectors/aleph/credential")
    assert r.status_code == 500, r.text
