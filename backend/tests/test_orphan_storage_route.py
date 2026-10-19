"""The 'Preview retained orphan files' button on the workbench page calls
GET /api/settings/storage/orphans, which had never actually been wired up:
app/services/lifecycle.py's preview_orphan_document_files() existed and was
unit-tested directly (tests/test_orphan_storage_preview.py), and
tests/test_api_access_guard.py's bearer-guard test even listed this exact
path as "sensitive" -- but only against a synthetic stub app with a
catch-all probe route, so it never actually asserted the real route
existed. It didn't: every click 404'd. Found live-testing the app end to
end and fixed by adding the route in routes_settings.py. This test exercises
the real route end to end rather than the service function in isolation.
"""
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)


def test_orphan_storage_preview_route_reports_unreferenced_files(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path))
    (tmp_path / "referenced-but-absent-from-db.bin").write_bytes(b"12345")

    r = client.get("/api/settings/storage/orphans")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["storage_root"] == str(tmp_path.resolve())
    assert body["orphan_file_count"] == 1
    assert body["orphan_files"][0]["relative_path"] == "referenced-but-absent-from-db.bin"
    assert body["orphan_bytes"] == 5
    # Nothing is removed by looking; the reporter decides per file (Keep, Add back, Delete: test_housekeeping.py).
    assert body["cleanup_available"] is True and body["kept_file_count"] == 0
    assert body["policy"] == "retain_until_reporter_decides"


def test_orphan_storage_preview_route_is_local_only(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path))
    r = client.get(
        "/api/settings/storage/orphans",
        headers={"X-Forwarded-For": "203.0.113.9"},
    )
    assert r.status_code == 403, r.text
