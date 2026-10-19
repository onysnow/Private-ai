"""DESIGN.md §12: the app-side half of the opsconsole migration. The package's
own suite (tests/test_opsconsole_package.py) exercises the package against
fakes; this is the small host-side test that `mount_console(app,
build_console_config(...))` in app/main.py actually wires up the real
Journalism Workbench adapters -- WorkbenchUsers, the app-specific Checks,
WorkbenchBackups, PytestRunner, the log sources, and the UI bundle -- rather
than mounting an empty/misconfigured console. It replaces the old
tests/test_console.py, which tested the deleted v1 console.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


def test_manifest_reflects_the_real_host_wiring():
    client = TestClient(app)
    r = client.get("/api/console/manifest")
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["app_name"] == "Journalism Workbench"
    assert body["ui_path"] == "/console"
    assert body["prefix"] == "/api/console"
    # A loopback TestClient request must read as local, or every read-only
    # section below would 403 instead of reflecting real wiring.
    assert body["principal"]["is_local"] is True

    section_ids = {s["id"] for s in body["sections"]}
    # These sections only appear when their adapter is not None -- so their
    # presence proves build_console_config actually wired WorkbenchUsers(),
    # WorkbenchBackups(), and PytestRunner(...) into the mounted instance,
    # not just that the package mounted with everything absent.
    assert {"overview", "data", "schema", "query", "api", "users", "backups", "tests", "logs", "checks", "config", "activity"} <= section_ids


def test_checks_registry_includes_the_app_specific_checks():
    client = TestClient(app)
    r = client.get("/api/console/checks")
    assert r.status_code == 200, r.text
    ids = {item["id"] for item in r.json()["items"]}
    # A sample from each of console_adapters.CHECKS -- confirms the app's own
    # Check objects (not just the package's generic built-ins) reached the
    # running instance.
    assert {"evidence_has_source", "claims_backed_by_evidence", "accepted_candidates_materialized", "revoked_users_tidy"} <= ids


def test_console_ui_is_served_at_console_and_allows_the_workbench_to_frame_it():
    client = TestClient(app)
    r = client.get("/console")
    assert r.status_code == 200, r.text
    assert "text/html" in r.headers["content-type"]
    assert "Journalism Workbench" in r.text
    # The Next.js /console page embeds this bundle in an iframe (DESIGN.md §8);
    # the CSP must allow that, or the migration this test is guarding breaks
    # the frontend page silently at the browser level.
    assert "frame-ancestors" in r.headers.get("content-security-policy", "")


def test_console_ui_assets_are_served():
    client = TestClient(app)
    for asset in ("console.js", "console.css"):
        r = client.get(f"/console/{asset}")
        assert r.status_code == 200, (asset, r.text)


def test_workbench_backups_exports_lists_blocks_conflicts_and_restores(tmp_path):
    """Direct unit test of app.console_adapters.WorkbenchBackups (DESIGN.md §12's
    `backups = WorkbenchBackups()` over app/services/exports.py), bypassing the
    supervisor/HTTP layer so the adapter's own logic is verified without threading.
    Nothing in app/api/routes_backups.py persists an export to disk -- it is purely
    upload-based -- so this is also the only place create()'s zip-to-disk behavior
    is exercised at all.
    """
    from app.console_adapters import WorkbenchBackups
    from app.core.config import Settings
    from app.db.session import SessionLocal

    class _Handle:
        def __init__(self):
            self.lines: list[str] = []

        def log(self, line: str) -> None:
            self.lines.append(line)

    client = TestClient(app)
    inv = client.post("/api/investigations", json={"name": "Backup test"}).json()
    source = client.post("/api/sources", json={"investigation_id": inv["id"], "title": "Doc", "source_type": "minutes", "url": "https://example.test/x"}).json()
    assert client.post("/api/evidence", json={"source_id": source["id"], "quote": "A quote", "locator": "p1"}).status_code == 200

    backups_dir = tmp_path / "backups"
    provider = WorkbenchBackups(backups_dir, SessionLocal, tmp_path / "docs", Settings(enable_restore_api=True))
    handle = _Handle()

    record = provider.create(handle, selection=inv["id"])
    assert record.kind == "investigation_export"
    assert record.label == "Backup test"
    assert record.bytes > 0
    assert (backups_dir / f"{record.id}.zip").is_file()
    assert any("exporting" in line for line in handle.lines)

    listed = provider.list()
    assert [b.id for b in listed] == [record.id]
    assert listed[0].verified is True
    assert listed[0].label == "Backup test"

    assert provider.path_for_download(record.id) == str(backups_dir / f"{record.id}.zip")
    assert provider.path_for_download("no-such-backup") is None

    # The investigation still exists, so every row in the archive collides on primary
    # key: the restore must be reported as blocked, never silently skipped.
    blocked_plan = provider.restore_plan(record.id)
    assert blocked_plan.backup_id == record.id
    assert "Backup test" in blocked_plan.summary
    assert blocked_plan.will_replace == []
    assert any("BLOCKED" in w for w in blocked_plan.warnings)

    # A provider built with restores disabled (the default) must refuse to restore,
    # matching the same ENABLE_RESTORE_API gate the /api/backups/restore route enforces.
    disabled_provider = WorkbenchBackups(backups_dir, SessionLocal, tmp_path / "docs", Settings(enable_restore_api=False))
    with pytest.raises(RuntimeError, match="disabled"):
        disabled_provider.restore(record.id, handle)

    # Delete the investigation, then restore from the backup and confirm it comes back.
    assert client.delete(f"/api/investigations/{inv['id']}", params={"confirmation": inv["id"]}).status_code == 200
    assert inv["id"] not in {i["id"] for i in client.get("/api/investigations").json()}

    # preview_investigation_restore reports restore_api_enabled from the process-wide
    # app.core.config.settings singleton (untouched here), not this provider's own
    # Settings instance -- so the "disabled" warning is expected to remain; what must
    # be gone is the earlier BLOCKED-by-conflicts warning, now that the row is deleted.
    clear_plan = provider.restore_plan(record.id)
    assert not any("BLOCKED" in w for w in clear_plan.warnings)

    provider.restore(record.id, handle)
    assert any("restored" in line for line in handle.lines)
    restored = next(i for i in client.get("/api/investigations").json() if i["id"] == inv["id"])
    assert restored["name"] == "Backup test"
