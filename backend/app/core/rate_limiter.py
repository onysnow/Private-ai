from __future__ import annotations

import json
import os
from pathlib import Path
from threading import Lock
from time import monotonic, time


class FixedWindowRateLimiter:
    """Small in-process limiter for repeated authentication failures.

    Best-effort by design for the single-user/local-first runtime; a
    multi-worker or multi-user deployment should also limit at the edge.

    STRUCT-0035: with `state_file` set, window state is written after every
    hit and reloaded on construction, so a process restart no longer resets an
    in-progress lockout. Windows are stored against wall-clock time for that
    purpose (monotonic time does not survive a restart); a corrupt or
    unreadable file is ignored, never fatal.
    """

    def __init__(self, limit: int, window_seconds: int = 60, *, state_file: str | Path | None = None):
        self.limit = max(1, int(limit))
        self.window_seconds = max(1, int(window_seconds))
        self._lock = Lock()
        self._windows: dict[str, tuple[float, int]] = {}
        self._state_file = Path(state_file) if state_file else None
        self._load()

    # --- persistence -----------------------------------------------------------------
    def _load(self) -> None:
        if self._state_file is None or not self._state_file.exists():
            return
        try:
            raw = json.loads(self._state_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        if not isinstance(raw, dict):
            return
        wall_now = time()
        skew = monotonic() - wall_now  # convert stored wall-clock starts back to this process's monotonic clock
        for key, value in raw.items():
            if not (isinstance(key, str) and isinstance(value, list) and len(value) == 2):
                continue
            start_wall, count = value
            if not isinstance(start_wall, (int, float)) or not isinstance(count, int):
                continue
            if wall_now - start_wall >= self.window_seconds:
                continue  # expired while the process was down
            self._windows[key] = (float(start_wall) + skew, count)

    def _save(self) -> None:
        if self._state_file is None:
            return
        skew = time() - monotonic()
        payload = {key: [start + skew, count] for key, (start, count) in self._windows.items()}
        try:
            self._state_file.parent.mkdir(parents=True, exist_ok=True)
            tmp = self._state_file.with_suffix(self._state_file.suffix + ".tmp")
            tmp.write_text(json.dumps(payload), encoding="utf-8")
            os.replace(tmp, self._state_file)
            try:
                os.chmod(self._state_file, 0o600)
            except OSError:
                pass
        except OSError:
            pass  # persistence is best-effort; the in-memory limiter still works

    # --- limiting --------------------------------------------------------------------
    def hit(self, key: str, now: float | None = None) -> tuple[bool, int]:
        current = monotonic() if now is None else float(now)
        with self._lock:
            start, count = self._windows.get(key, (current, 0))
            if current - start >= self.window_seconds:
                start, count = current, 0
            count += 1
            self._windows[key] = (start, count)
            allowed = count <= self.limit
            retry_after = max(1, int(self.window_seconds - (current - start)))
            self._save()
            return allowed, retry_after

    def reset(self, key: str) -> None:
        with self._lock:
            if self._windows.pop(key, None) is not None:
                self._save()
