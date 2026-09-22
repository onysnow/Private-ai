"""Structured application log (operator console).

One JSON object per line at `settings.app_log_file`: timestamp, level, logger,
message, request_id (from the access-guard middleware's contextvar) and, for
errors, the traceback. The console reads it back with filters; nothing here is
ever returned to a remote client. Bodies, headers and credentials are never
logged -- only what the audit log already records plus durations and errors.
"""

from __future__ import annotations

import json
import logging
import os
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

current_request_id: ContextVar[str | None] = ContextVar("jw_request_id", default=None)

_HANDLER_NAME = "jw-app-jsonl"


class JsonLineFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None) or current_request_id.get(),
        }
        for key in ("method", "path", "status_code", "duration_ms", "client_host", "event"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info and record.exc_info[0] is not None:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_app_logging(path: str | Path, *, level: int = logging.INFO) -> Path:
    """Attach the JSONL handler to the root logger (idempotent per path) so the
    app's own loggers AND uvicorn's error logger land in one file."""
    log_path = Path(path)
    root = logging.getLogger()
    for handler in list(root.handlers):
        if handler.get_name() == _HANDLER_NAME:
            if getattr(handler, "baseFilename", None) == str(log_path.resolve()):
                return log_path
            root.removeHandler(handler)
            handler.close()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    handler = logging.FileHandler(log_path, encoding="utf-8")
    handler.set_name(_HANDLER_NAME)
    handler.setFormatter(JsonLineFormatter())
    handler.setLevel(level)
    root.addHandler(handler)
    if root.level == logging.NOTSET or root.level > level:
        root.setLevel(level)
    # Belt and braces against any logging.config call that disabled existing
    # loggers before we got here (alembic's fileConfig used to).
    for name in ("journalism", "journalism.request", "uvicorn", "uvicorn.error"):
        logging.getLogger(name).disabled = False
    try:
        os.chmod(log_path, 0o600)
    except OSError:
        pass
    return log_path


def read_app_log(
    path: str | Path,
    *,
    limit: int = 200,
    level: str | None = None,
    request_id: str | None = None,
    contains: str | None = None,
    max_scan_bytes: int = 8 * 1024 * 1024,
) -> dict[str, Any]:
    """Newest-first tail of the JSONL log with optional filters. Scans at most the
    last `max_scan_bytes` so a huge file cannot pin the request."""
    log_path = Path(path)
    if not log_path.exists():
        return {"records": [], "returned": 0, "file_bytes": 0, "scanned_bytes": 0, "truncated": False}
    size = log_path.stat().st_size
    start = max(0, size - max_scan_bytes)
    with log_path.open("rb") as handle:
        handle.seek(start)
        raw = handle.read()
    text = raw.decode("utf-8", errors="replace")
    lines = text.split("\n")
    if start > 0 and lines:
        lines = lines[1:]  # first line is a partial record
    wanted_level = (level or "").upper() or None
    needle = (contains or "").lower() or None
    records: list[dict[str, Any]] = []
    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if wanted_level and str(record.get("level", "")).upper() != wanted_level:
            continue
        if request_id and record.get("request_id") != request_id:
            continue
        if needle and needle not in line.lower():
            continue
        records.append(record)
        if len(records) >= limit:
            break
    return {"records": records, "returned": len(records), "file_bytes": size, "scanned_bytes": size - start, "truncated": start > 0}
