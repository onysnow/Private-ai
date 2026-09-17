from __future__ import annotations

from threading import Lock
from time import monotonic


class FixedWindowRateLimiter:
    """Small in-process limiter for repeated authentication failures.

    This is intentionally best-effort for the current single-user/local-first runtime;
    a multi-worker or multi-user deployment should use shared state at the edge.
    """

    def __init__(self, limit: int, window_seconds: int = 60):
        self.limit = max(1, int(limit))
        self.window_seconds = max(1, int(window_seconds))
        self._lock = Lock()
        self._windows: dict[str, tuple[float, int]] = {}

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
            return allowed, retry_after

    def reset(self, key: str) -> None:
        with self._lock:
            self._windows.pop(key, None)
