"""Spend and worker-thread guard rails for the reasoning endpoints.

A reasoning run is the only request in this app that (a) costs money per
call and (b) blocks a threadpool worker for as long as the provider takes.
Neither the generic request-envelope middleware nor the auth-failure
limiter covers that, so this module does:

- a per-actor fixed window (`ai_runs_per_minute`): one token, persisted
  user, or the local owner cannot fire runs faster than this;
- a per-process concurrency cap (`ai_max_concurrent_runs`): however many
  actors there are, no more than this many provider calls are in flight,
  so a burst cannot exhaust Starlette's sync worker pool.

Both are best-effort and in-process, exactly like FixedWindowRateLimiter
for auth failures; a multi-worker deployment needs an edge limiter too.
Limits are read from Settings at each call so tests (and a live config
reload) see the current values without rebuilding the singleton.
"""

from __future__ import annotations

from contextlib import contextmanager
from threading import Lock
from typing import Iterator

from app.core.config import Settings, settings as default_settings
from app.core.rate_limiter import FixedWindowRateLimiter


class ReasoningThrottled(RuntimeError):
    """The run was refused before any provider call was made. The route
    turns this into 429 with a Retry-After header."""

    def __init__(self, message: str, *, retry_after_seconds: int):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class ReasoningRunGovernor:
    def __init__(self) -> None:
        self._lock = Lock()
        self._in_flight = 0
        self._limiter: FixedWindowRateLimiter | None = None
        self._limiter_limit: int | None = None

    def _limiter_for(self, limit: int) -> FixedWindowRateLimiter:
        # Rebuild only when the configured limit changes; the window state is
        # deliberately dropped then (a changed limit is a deploy-time event).
        if self._limiter is None or self._limiter_limit != limit:
            self._limiter = FixedWindowRateLimiter(limit, 60)
            self._limiter_limit = limit
        return self._limiter

    @contextmanager
    def acquire(self, actor_id: str, settings: Settings = default_settings) -> Iterator[None]:
        """Reserve a run slot for `actor_id` or raise ReasoningThrottled.

        Order matters: the per-actor window is checked first so a throttled
        actor never consumes a concurrency slot, and the concurrency slot is
        released on every exit path (success, provider error, validation
        failure) so a failed run can never leak capacity.
        """
        with self._lock:
            allowed, retry_after = self._limiter_for(settings.ai_runs_per_minute).hit(actor_id)
            if not allowed:
                raise ReasoningThrottled(
                    f"AI reasoning is limited to {settings.ai_runs_per_minute} run(s) per minute per user; retry in {retry_after}s",
                    retry_after_seconds=retry_after,
                )
            if self._in_flight >= max(1, settings.ai_max_concurrent_runs):
                raise ReasoningThrottled(
                    f"{settings.ai_max_concurrent_runs} AI reasoning run(s) already in progress on this server; retry shortly",
                    retry_after_seconds=5,
                )
            self._in_flight += 1
        try:
            yield
        finally:
            with self._lock:
                self._in_flight -= 1

    def reset(self) -> None:
        """Test hook: forget all windows and in-flight counts."""
        with self._lock:
            self._in_flight = 0
            self._limiter = None
            self._limiter_limit = None

    @property
    def in_flight(self) -> int:
        with self._lock:
            return self._in_flight


governor = ReasoningRunGovernor()
