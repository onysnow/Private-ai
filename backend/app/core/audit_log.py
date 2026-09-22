from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

SENSITIVE_GET_PREFIXES = (
    "/api/backups/",
    "/api/settings/",
)
SENSITIVE_GET_SUFFIXES = (
    "/export",
    "/deletion-preview",
)


def should_audit_request(method: str, path: str) -> bool:
    if not path.startswith("/api"):
        return False
    if method.upper() not in {"GET", "HEAD", "OPTIONS"}:
        return True
    if any(path.startswith(prefix) for prefix in SENSITIVE_GET_PREFIXES):
        return True
    return any(path.endswith(suffix) for suffix in SENSITIVE_GET_SUFFIXES)


class SecurityAuditLogger:
    """Minimal local JSONL audit trail that never records bodies or credentials."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._lock = Lock()

    def write(
        self,
        *,
        request_id: str,
        method: str,
        path: str,
        status_code: int,
        client_host: str | None,
        local_request: bool,
        event: str = "api_request",
    ) -> None:
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event": event,
            "request_id": request_id,
            "method": method.upper(),
            "path": path,
            "status_code": int(status_code),
            "client_host": client_host or "",
            "local_request": bool(local_request),
        }
        encoded = (json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            fd = os.open(self.path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            try:
                os.write(fd, encoded)
                fsync = getattr(os, "fsync", None)
                if fsync is not None:
                    try:
                        fsync(fd)
                    except OSError:
                        pass
            finally:
                os.close(fd)
            try:
                os.chmod(self.path, 0o600)
            except OSError:
                pass


def new_request_id() -> str:
    return uuid4().hex

AUDIT_PUBLIC_FIELDS = (
    "timestamp",
    "event",
    "request_id",
    "method",
    "path",
    "status_code",
    "client_host",
    "local_request",
)


def _safe_audit_record(value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    out: dict = {}
    for field in AUDIT_PUBLIC_FIELDS:
        if field in value:
            out[field] = value[field]
    required = {"timestamp", "event", "request_id", "method", "path", "status_code", "local_request"}
    if not required.issubset(out):
        return None
    if not isinstance(out["timestamp"], str) or not isinstance(out["event"], str):
        return None
    if not isinstance(out["request_id"], str) or not isinstance(out["method"], str) or not isinstance(out["path"], str):
        return None
    if not isinstance(out["status_code"], int) or not isinstance(out["local_request"], bool):
        return None
    if "client_host" in out and not isinstance(out["client_host"], str):
        out["client_host"] = ""
    return out


def read_security_audit(
    path: str | Path,
    *,
    limit: int = 100,
    offset: int = 0,
    event: str | None = None,
    method: str | None = None,
    status_code: int | None = None,
) -> dict:
    """Return a bounded newest-first page of the metadata-only security audit log.

    Offset is counted from the newest matching record. The implementation still
    scans the local JSONL file once so filters and malformed-line reporting remain
    exact, but responses are capped to 500 records and never expose raw lines.
    """
    audit_path = Path(path)
    bounded_limit = max(1, min(int(limit), 500))
    bounded_offset = max(0, int(offset))
    if not audit_path.exists():
        return {
            "records": [], "returned": 0, "total_matched": 0,
            "offset": bounded_offset, "has_more": False, "next_offset": None,
            "malformed_lines": 0, "file_bytes": 0,
        }

    malformed = 0
    matched: list[dict] = []
    try:
        with audit_path.open("r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                raw = line.strip()
                if not raw:
                    continue
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    malformed += 1
                    continue
                record = _safe_audit_record(parsed)
                if record is None:
                    malformed += 1
                    continue
                if event is not None and record.get("event") != event:
                    continue
                if method is not None and record.get("method") != method.upper():
                    continue
                if status_code is not None and record.get("status_code") != int(status_code):
                    continue
                matched.append(record)
    except OSError:
        return {
            "records": [], "returned": 0, "total_matched": 0,
            "offset": bounded_offset, "has_more": False, "next_offset": None,
            "malformed_lines": 0, "file_bytes": 0, "read_error": True,
        }

    newest_first = list(reversed(matched))
    records = newest_first[bounded_offset:bounded_offset + bounded_limit]
    total_matched = len(newest_first)
    next_offset = bounded_offset + len(records)
    has_more = next_offset < total_matched
    try:
        file_bytes = audit_path.stat().st_size
    except OSError:
        file_bytes = 0
    return {
        "records": records,
        "returned": len(records),
        "total_matched": total_matched,
        "offset": bounded_offset,
        "has_more": has_more,
        "next_offset": next_offset if has_more else None,
        "malformed_lines": malformed,
        "file_bytes": file_bytes,
    }


def summarize_security_audit(path: str | Path) -> dict:
    """Return metadata-only aggregate counts for the complete local audit file."""
    audit_path = Path(path)
    counters: dict[str, int] = {"total_records": 0, "malformed_lines": 0, "local_records": 0, "remote_records": 0, "file_bytes": 0}
    buckets: dict[str, dict[str, int]] = {"by_event": {}, "by_method": {}, "by_status": {}}
    extra: dict[str, Any] = {}

    def summary() -> dict[str, Any]:
        return {**counters, **buckets, **extra}

    if not audit_path.exists():
        return summary()
    try:
        with audit_path.open("r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                raw = line.strip()
                if not raw:
                    continue
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    counters["malformed_lines"] += 1
                    continue
                record = _safe_audit_record(parsed)
                if record is None:
                    counters["malformed_lines"] += 1
                    continue
                counters["total_records"] += 1
                locality = "local_records" if record["local_request"] else "remote_records"
                counters[locality] += 1
                for key, value in (("by_event", record["event"]), ("by_method", record["method"]), ("by_status", str(record["status_code"]))):
                    bucket = buckets[key]
                    bucket[value] = bucket.get(value, 0) + 1
    except OSError:
        extra["read_error"] = True
        return summary()
    try:
        counters["file_bytes"] = audit_path.stat().st_size
    except OSError:
        pass
    return summary()


def _parse_audit_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def preview_security_audit_retention(
    path: str | Path,
    *,
    keep_days: int = 90,
    max_records: int = 5000,
    now: datetime | None = None,
) -> dict:
    """Compute retention impact without mutating the audit file.

    Valid records are retained when they are within the age window and within the
    newest max_records cap. Malformed lines are retained rather than silently
    destroyed, and are reported for manual review.
    """
    if keep_days < 1 or keep_days > 3650:
        raise ValueError("keep_days must be between 1 and 3650")
    if max_records < 100 or max_records > 1_000_000:
        raise ValueError("max_records must be between 100 and 1000000")

    audit_path = Path(path)
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    cutoff = current.timestamp() - (int(keep_days) * 86400)
    if not audit_path.exists():
        return {
            "keep_days": int(keep_days),
            "max_records": int(max_records),
            "total_lines": 0,
            "valid_records": 0,
            "malformed_lines": 0,
            "would_keep": 0,
            "would_remove": 0,
            "file_bytes": 0,
        }

    lines: list[tuple[str, dict | None, datetime | None]] = []
    malformed = 0
    with audit_path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            raw = line.rstrip("\n")
            if not raw.strip():
                continue
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = None
            record = _safe_audit_record(parsed)
            stamp = _parse_audit_timestamp(record.get("timestamp") if record else None)
            if record is None or stamp is None:
                malformed += 1
                lines.append((raw, None, None))
            else:
                lines.append((raw, record, stamp))

    valid_indexes = [
        index for index, (_, record, stamp) in enumerate(lines)
        if record is not None and stamp is not None and stamp.timestamp() >= cutoff
    ]
    retained_valid = set(valid_indexes[-int(max_records):])
    # Fail safe: malformed lines are never silently deleted by automated retention.
    keep_indexes = {
        index for index, (_, record, _) in enumerate(lines)
        if record is None
    } | retained_valid
    removable = len(lines) - len(keep_indexes)
    return {
        "keep_days": int(keep_days),
        "max_records": int(max_records),
        "total_lines": len(lines),
        "valid_records": len(lines) - malformed,
        "malformed_lines": malformed,
        "would_keep": len(keep_indexes),
        "would_remove": removable,
        "file_bytes": audit_path.stat().st_size,
        "_lines": lines,
        "_keep_indexes": keep_indexes,
    }


def apply_security_audit_retention(
    path: str | Path,
    *,
    keep_days: int = 90,
    max_records: int = 5000,
    confirmation: str,
    now: datetime | None = None,
) -> dict:
    """Apply an explicitly confirmed retention policy using atomic replacement."""
    if confirmation != "PRUNE SECURITY AUDIT":
        raise ValueError("Exact confirmation text is required")
    audit_path = Path(path)
    preview = preview_security_audit_retention(
        audit_path, keep_days=keep_days, max_records=max_records, now=now
    )
    lines = preview.pop("_lines", [])
    keep_indexes = preview.pop("_keep_indexes", set())
    if not audit_path.exists() or preview["would_remove"] == 0:
        return {**preview, "removed": 0, "applied": True}

    audit_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = audit_path.with_name(f".{audit_path.name}.{uuid4().hex}.tmp")
    encoded = "".join(lines[index][0] + "\n" for index in sorted(keep_indexes)).encode("utf-8")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.write(fd, encoded)
        fsync = getattr(os, "fsync", None)
        if fsync is not None:
            try:
                fsync(fd)
            except OSError:
                pass
    finally:
        os.close(fd)
    os.replace(tmp, audit_path)
    try:
        os.chmod(audit_path, 0o600)
    except OSError:
        pass
    return {**preview, "removed": preview["would_remove"], "applied": True}
