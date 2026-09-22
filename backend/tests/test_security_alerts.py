"""STRUCT-0035: the passive security surface and the persisted auth-failure limiter.

- recent_security_denials() turns the audit log into counts / busiest hosts /
  latest examples for a window, with a needs_attention flag;
- /settings/status carries a compact copy and /settings/security/alerts the
  full one;
- FixedWindowRateLimiter(state_file=...) survives a process restart: a
  lockout in progress is still in force in a fresh instance, and an expired
  window is dropped on load.
"""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.audit_log import SecurityAuditLogger, recent_security_denials
from app.core.config import settings
from app.core.rate_limiter import FixedWindowRateLimiter
from app.main import app


def _write(path: Path, *, when: datetime, event: str, host: str = "203.0.113.9", local: bool = False) -> None:
    record = {
        "timestamp": when.isoformat(), "event": event, "request_id": "r", "method": "POST",
        "path": "/api/investigations", "status_code": 401, "client_host": host, "local_request": local,
    }
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record) + "\n")


def test_recent_denials_counts_window_hosts_and_flags_attention(tmp_path: Path):
    log = tmp_path / "security.jsonl"
    now = datetime(2026, 9, 22, 12, 0, tzinfo=timezone.utc)
    for i in range(5):
        _write(log, when=now - timedelta(minutes=i), event="access_denied")
    _write(log, when=now - timedelta(minutes=1), event="access_denied", host="198.51.100.4")
    _write(log, when=now - timedelta(hours=30), event="access_denied")  # outside the window
    _write(log, when=now - timedelta(minutes=2), event="api_request")  # not a denial
    _write(log, when=now - timedelta(minutes=3), event="browser_write_denied", host="127.0.0.1", local=True)
    log.open("a").write("not json\n")

    view = recent_security_denials(log, window_hours=24, attention_threshold=100, now=now)
    assert view["total_denials"] == 7
    assert view["by_event"] == {"access_denied": 6, "auth_rate_limited": 0, "browser_write_denied": 1, "request_rejected": 0}
    assert view["remote_hosts"] == [{"client_host": "203.0.113.9", "count": 5}, {"client_host": "198.51.100.4", "count": 1}], "local requests are not counted as hosts"
    assert view["recent"][0]["timestamp"] == (now).isoformat() and len(view["recent"]) == 7
    assert view["malformed_lines"] == 1 and view["needs_attention"] is False

    assert recent_security_denials(log, window_hours=24, attention_threshold=7, now=now)["needs_attention"] is True
    _write(log, when=now, event="auth_rate_limited")
    assert recent_security_denials(log, window_hours=24, attention_threshold=1000, now=now)["needs_attention"] is True, "any lockout is worth attention on its own"
    assert recent_security_denials(tmp_path / "missing.jsonl", now=now)["total_denials"] == 0


def test_settings_status_and_alerts_endpoint_expose_the_surface(tmp_path: Path, monkeypatch):
    log = tmp_path / "security.jsonl"
    monkeypatch.setattr(settings, "audit_log_file", str(log))
    monkeypatch.setattr(settings, "security_alert_denials_per_day", 3)
    logger = SecurityAuditLogger(log)
    for _ in range(3):
        logger.write(request_id="r", method="POST", path="/api/investigations", status_code=401, client_host="203.0.113.9", local_request=False, event="access_denied")

    client = TestClient(app)
    status = client.get("/api/settings/status").json()["security"]
    assert status["total_denials"] == 3 and status["needs_attention"] is True and status["recent"] == []
    alerts = client.get("/api/settings/security/alerts", params={"window_hours": 1, "max_examples": 2}).json()
    assert alerts["total_denials"] == 3 and len(alerts["recent"]) == 2 and alerts["window_hours"] == 1.0
    assert alerts["remote_hosts"] == [{"client_host": "203.0.113.9", "count": 3}]
    assert client.get("/api/settings/security/alerts", params={"window_hours": 0}).status_code == 422


def test_rate_limiter_state_survives_restart_and_drops_expired_windows(tmp_path: Path):
    state = tmp_path / "auth-failures.json"
    first = FixedWindowRateLimiter(2, 60, state_file=state)
    assert first.hit("h1")[0] is True and first.hit("h1")[0] is True  # two hits reach the limit
    allowed, _ = first.hit("h1")
    assert allowed is False, "third hit is locked out"
    assert state.exists() and json.loads(state.read_text())["h1"][1] == 3

    # "Restart": a fresh instance built from the same file is still locked out.
    second = FixedWindowRateLimiter(2, 60, state_file=state)
    allowed, retry_after = second.hit("h1")
    assert allowed is False and 1 <= retry_after <= 60
    second.reset("h1")
    assert "h1" not in json.loads(state.read_text())

    # An expired window on disk is not resurrected.
    state.write_text(json.dumps({"old": [datetime.now(timezone.utc).timestamp() - 3600, 99]}))
    third = FixedWindowRateLimiter(2, 60, state_file=state)
    assert third.hit("old")[0] is True

    # Corrupt state is ignored, not fatal; an in-memory limiter never writes.
    state.write_text("{not json")
    assert FixedWindowRateLimiter(2, 60, state_file=state).hit("x")[0] is True
    FixedWindowRateLimiter(2, 60).hit("y")
    assert not (tmp_path / "nothing.json").exists()
