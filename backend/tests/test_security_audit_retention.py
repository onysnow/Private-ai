import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.core.audit_log import (
    SecurityAuditLogger,
    apply_security_audit_retention,
    preview_security_audit_retention,
    read_security_audit,
    summarize_security_audit,
)


def _record(ts: datetime, request_id: str, *, event: str = "api_request", status: int = 200) -> dict:
    return {
        "timestamp": ts.astimezone(timezone.utc).isoformat(),
        "event": event,
        "request_id": request_id,
        "method": "POST",
        "path": "/api/investigations/demo",
        "status_code": status,
        "client_host": "203.0.113.9",
        "local_request": False,
        # Fields below must never survive the reader's public-field allowlist.
        "authorization": "Bearer secret",
        "body": {"claim": "sensitive reporter material"},
        "query_string": "token=secret",
    }


def test_read_security_audit_is_bounded_newest_first_and_redacted(tmp_path: Path):
    path = tmp_path / "security.jsonl"
    now = datetime(2026, 9, 13, tzinfo=timezone.utc)
    rows = [_record(now + timedelta(seconds=i), f"r{i}") for i in range(3)]
    path.write_text("".join(json.dumps(r) + "\n" for r in rows) + "not-json\n", encoding="utf-8")

    result = read_security_audit(path, limit=2)
    assert [row["request_id"] for row in result["records"]] == ["r2", "r1"]
    assert result["malformed_lines"] == 1
    assert all("authorization" not in row and "body" not in row and "query_string" not in row for row in result["records"])


def test_read_security_audit_filters_without_exposing_secret_fields(tmp_path: Path):
    path = tmp_path / "security.jsonl"
    now = datetime(2026, 9, 13, tzinfo=timezone.utc)
    rows = [
        _record(now, "ok", event="api_request", status=200),
        _record(now + timedelta(seconds=1), "denied", event="access_denied", status=401),
    ]
    path.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    result = read_security_audit(path, event="access_denied", method="post", status_code=401)
    assert [row["request_id"] for row in result["records"]] == ["denied"]


def test_retention_preview_and_apply_keep_recent_tail_and_malformed_lines(tmp_path: Path):
    path = tmp_path / "security.jsonl"
    now = datetime(2026, 9, 13, 12, tzinfo=timezone.utc)
    old = _record(now - timedelta(days=120), "old")
    recent = [_record(now - timedelta(days=2) + timedelta(seconds=i), f"recent-{i}") for i in range(105)]
    path.write_text(json.dumps(old) + "\n" + "MALFORMED KEEP ME\n" + "".join(json.dumps(r) + "\n" for r in recent), encoding="utf-8")

    preview = preview_security_audit_retention(path, keep_days=90, max_records=100, now=now)
    assert preview["would_remove"] == 6  # one old + five excess valid recent records
    assert preview["malformed_lines"] == 1

    with pytest.raises(ValueError):
        apply_security_audit_retention(path, keep_days=90, max_records=100, confirmation="wrong", now=now)

    result = apply_security_audit_retention(
        path, keep_days=90, max_records=100, confirmation="PRUNE SECURITY AUDIT", now=now
    )
    assert result["removed"] == 6
    text = path.read_text(encoding="utf-8")
    assert "MALFORMED KEEP ME" in text
    assert '"request_id": "old"' not in text
    assert '"request_id": "recent-104"' in text
    if os.name == "posix":
        assert (path.stat().st_mode & 0o777) == 0o600


def test_audit_logger_output_is_compatible_with_reader(tmp_path: Path):
    path = tmp_path / "security.jsonl"
    logger = SecurityAuditLogger(path)
    logger.write(
        request_id="req-1", method="DELETE", path="/api/investigations/x",
        status_code=200, client_host="127.0.0.1", local_request=True,
    )
    result = read_security_audit(path)
    assert result["returned"] == 1
    assert result["records"][0]["request_id"] == "req-1"
    assert set(result["records"][0]).issubset({
        "timestamp", "event", "request_id", "method", "path", "status_code", "client_host", "local_request"
    })


def test_security_audit_paginates_newest_first_without_overlap(tmp_path: Path):
    path = tmp_path / "security.jsonl"
    now = datetime(2026, 9, 13, tzinfo=timezone.utc)
    rows = [_record(now + timedelta(seconds=i), f"r{i}") for i in range(7)]
    path.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")

    first = read_security_audit(path, limit=3, offset=0)
    second = read_security_audit(path, limit=3, offset=first["next_offset"])
    third = read_security_audit(path, limit=3, offset=second["next_offset"])

    assert [r["request_id"] for r in first["records"]] == ["r6", "r5", "r4"]
    assert [r["request_id"] for r in second["records"]] == ["r3", "r2", "r1"]
    assert [r["request_id"] for r in third["records"]] == ["r0"]
    assert first["total_matched"] == second["total_matched"] == third["total_matched"] == 7
    assert first["has_more"] is True and first["next_offset"] == 3
    assert second["has_more"] is True and second["next_offset"] == 6
    assert third["has_more"] is False and third["next_offset"] is None


def test_security_audit_summary_counts_only_allowlisted_valid_records(tmp_path: Path):
    path = tmp_path / "security.jsonl"
    now = datetime(2026, 9, 13, tzinfo=timezone.utc)
    local = _record(now, "local", event="api_request", status=200)
    local["local_request"] = True
    local["client_host"] = "127.0.0.1"
    remote = _record(now + timedelta(seconds=1), "remote", event="access_denied", status=401)
    remote["method"] = "GET"
    path.write_text(json.dumps(local) + "\n" + json.dumps(remote) + "\n" + "not-json\n", encoding="utf-8")

    summary = summarize_security_audit(path)
    assert summary["total_records"] == 2
    assert summary["local_records"] == 1
    assert summary["remote_records"] == 1
    assert summary["malformed_lines"] == 1
    assert summary["by_event"] == {"api_request": 1, "access_denied": 1}
    assert summary["by_method"] == {"POST": 1, "GET": 1}
    assert summary["by_status"] == {"200": 1, "401": 1}
    assert "authorization" not in json.dumps(summary).lower()
