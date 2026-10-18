import json
import os
from pathlib import Path

from app.core.request_limits import RequestLimitPolicy, validate_content_length, validate_request_envelope
from app.core.rate_limiter import FixedWindowRateLimiter
from app.core.audit_log import SecurityAuditLogger, should_audit_request


def test_request_limits_are_route_specific_and_content_length_is_validated():
    policy = RequestLimitPolicy(default_bytes=100, document_bytes=200, backup_bytes=300)
    assert policy.for_path("/api/claims") == 100
    assert policy.for_path("/api/documents/upload") == 200
    assert policy.for_path("/api/backups/restore") == 300

    assert validate_content_length("100", 100) == (True, "")
    ok, detail = validate_content_length("101", 100)
    assert not ok and "100-byte" in detail
    assert validate_content_length("-1", 100)[0] is False
    assert validate_content_length("not-a-number", 100)[0] is False
    assert validate_content_length(None, 100) == (True, "")


def test_security_audit_records_metadata_without_secrets_or_query_strings(tmp_path: Path):
    path = tmp_path / "audit" / "security.jsonl"
    logger = SecurityAuditLogger(path)
    logger.write(
        request_id="req-1",
        method="DELETE",
        path="/api/investigations/inv-1",
        status_code=200,
        client_host="127.0.0.1",
        local_request=True,
    )
    raw = path.read_text()
    record = json.loads(raw)
    assert record["request_id"] == "req-1"
    assert record["path"] == "/api/investigations/inv-1"
    assert "authorization" not in raw.lower()
    assert "bearer" not in raw.lower()
    assert "confirmation=" not in raw.lower()
    if os.name == "posix":
        assert (path.stat().st_mode & 0o777) == 0o600


def test_sensitive_operation_audit_selection():
    assert should_audit_request("DELETE", "/api/investigations/inv-1")
    assert should_audit_request("POST", "/api/backups/restore")
    assert should_audit_request("PUT", "/api/settings/connectors/aleph/credential")
    assert should_audit_request("GET", "/api/investigations/inv-1/export")
    assert should_audit_request("GET", "/api/investigations/inv-1/deletion-preview")
    assert should_audit_request("GET", "/api/settings/status")
    assert not should_audit_request("GET", "/api/investigations")


def test_unknown_length_body_is_rejected_instead_of_bypassing_limit():
    ok, status, detail = validate_request_envelope(
        method="POST",
        content_length=None,
        content_type="application/json",
        transfer_encoding="chunked",
        limit=100,
    )
    assert not ok
    assert status == 411
    assert "Content-Length" in detail

    ok, status, detail = validate_request_envelope(
        method="POST",
        content_length="101",
        content_type="application/json",
        transfer_encoding=None,
        limit=100,
    )
    assert not ok and status == 413

    # Bodyless unsafe actions remain usable.
    assert validate_request_envelope(
        method="DELETE",
        content_length=None,
        content_type=None,
        transfer_encoding=None,
        limit=100,
    )[0]


def test_auth_failure_rate_limiter_blocks_after_threshold_and_resets():
    limiter = FixedWindowRateLimiter(limit=2, window_seconds=60)
    assert limiter.hit("client", now=0)[0]
    assert limiter.hit("client", now=1)[0]
    allowed, retry_after = limiter.hit("client", now=2)
    assert not allowed
    assert retry_after == 58

    limiter.reset("client")
    assert limiter.hit("client", now=3)[0]
    # A new window also clears the previous count.
    assert limiter.hit("other", now=0)[0]
    assert limiter.hit("other", now=61)[0]
