"""LogSource over a JSON-lines file (one object per line). Field names are
configurable so any structured log fits; unknown keys ride along in `extra`."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Iterator

from opsconsole.protocols import LogFilter, LogLine


class JsonlLogSource:
    def __init__(self, path: str | Path, *, id: str, title: str | None = None, ts_key: str = "ts", level_key: str = "level", message_key: str = "message",
                 logger_key: str = "logger", request_id_key: str = "request_id", max_scan_bytes: int = 8 * 1024 * 1024) -> None:
        self.path = Path(path)
        self._id = id
        self._title = title or id
        self.keys = {"ts": ts_key, "level": level_key, "message": message_key, "logger": logger_key, "request_id": request_id_key}
        self.max_scan_bytes = max_scan_bytes

    @property
    def id(self) -> str:
        return self._id

    @property
    def title(self) -> str:
        return self._title

    def available(self) -> tuple[bool, str | None]:
        if not self.path.exists():
            return False, f"{self.path} does not exist yet"
        return True, None

    def _parse(self, line: str) -> LogLine | None:
        line = line.strip()
        if not line:
            return None
        try:
            record = json.loads(line)
        except ValueError:
            return LogLine(ts="", level="RAW", message=line[:2000], raw=line)
        if not isinstance(record, dict):
            return LogLine(ts="", level="RAW", message=line[:2000], raw=line)
        k = self.keys
        known = set(k.values())
        return LogLine(ts=str(record.get(k["ts"], "")), level=str(record.get(k["level"], "INFO")).upper(), message=str(record.get(k["message"], "")),
                       logger=record.get(k["logger"]), request_id=record.get(k["request_id"]), extra={kk: v for kk, v in record.items() if kk not in known}, raw=line)

    def _matches(self, entry: LogLine, f: LogFilter) -> bool:
        if f.level and entry.level != f.level.upper():
            return False
        if f.request_id and entry.request_id != f.request_id:
            return False
        if f.logger and (entry.logger or "") != f.logger and not (entry.logger or "").startswith(f.logger + "."):
            return False
        if f.since and entry.ts and entry.ts < f.since:
            return False
        if f.contains and f.contains.lower() not in (entry.raw or entry.message).lower():
            return False
        return True

    def tail(self, *, limit: int, filters: LogFilter) -> list[LogLine]:
        if not self.path.exists():
            return []
        size = self.path.stat().st_size
        start = max(0, size - self.max_scan_bytes)
        with self.path.open("rb") as fh:
            fh.seek(start)
            raw = fh.read()
        lines = raw.decode("utf-8", errors="replace").split("\n")
        if start > 0 and lines:
            lines = lines[1:]
        out: list[LogLine] = []
        for line in reversed(lines):
            entry = self._parse(line)
            if entry is None or not self._matches(entry, filters):
                continue
            out.append(entry)
            if len(out) >= limit:
                break
        return out

    def follow(self, *, from_end: bool = True) -> Iterator[LogLine | None]:
        position = self.path.stat().st_size if (from_end and self.path.exists()) else 0
        inode = self.path.stat().st_ino if self.path.exists() else None
        buffer = ""
        while True:
            if not self.path.exists():
                yield None
                time.sleep(1.0)
                continue
            st = self.path.stat()
            if inode is not None and st.st_ino != inode or st.st_size < position:  # rotated or truncated
                position, inode, buffer = 0, st.st_ino, ""
            if st.st_size == position:
                yield None
                time.sleep(0.5)
                continue
            with self.path.open("rb") as fh:
                fh.seek(position)
                chunk = fh.read(min(st.st_size - position, 1 << 20))
                position += len(chunk)
            buffer += chunk.decode("utf-8", errors="replace")
            *complete, buffer = buffer.split("\n")
            for line in complete:
                entry = self._parse(line)
                if entry is not None:
                    yield entry
            inode = st.st_ino if os.name != "nt" else inode
