"""ConsoleContext: what every section router closes over."""

from __future__ import annotations

import logging
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Iterator

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from opsconsole.config import ConsoleConfig, WritePolicy
from opsconsole.core.events import EventBus
from opsconsole.core.introspect import SchemaIntrospector
from opsconsole.core.supervisor import TaskSupervisor
from opsconsole.core.traffic import TrafficBuffer
from opsconsole.protocols import Principal
from opsconsole.store import Store

log = logging.getLogger("opsconsole")


class ConsoleError(HTTPException):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(status_code=status, detail={"code": code, "message": message})
        self.code = code


class ConsoleContext:
    def __init__(self, config: ConsoleConfig, bus: EventBus, introspector: SchemaIntrospector, traffic: TrafficBuffer) -> None:
        self.config = config
        self.bus = bus
        self.introspector = introspector
        self.traffic = traffic
        self.supervisor = TaskSupervisor(self._store_now, bus, Path(config.console_dir), ring=config.limits.output_lines)
        self.mounted_at = time.time()
        self.interrupted_runs = 0
        self.interrupted_changesets = 0
        self.last_sweep: dict[str, Any] | None = None
        self._sweep_lock = threading.Lock()
        self._last_sweep_at = 0.0
        self._last_flush_at = 0.0
        self._store: Store | None = None
        self._store_lock = threading.Lock()
        self.on_store_open: list[Callable[["ConsoleContext"], None]] = []

    # --- store (opened on first use, so importing/mounting has no filesystem side effects) --

    @property
    def store(self) -> Store:
        return self._store_now()

    @property
    def store_opened(self) -> bool:
        return self._store is not None

    def _store_now(self) -> Store:
        if self._store is None:
            with self._store_lock:
                if self._store is None:
                    console_dir = Path(self.config.console_dir)
                    console_dir.mkdir(parents=True, exist_ok=True)
                    store = Store.open(console_dir, host_engine=self.config.engine if self.config.store == "host" else None)
                    self._store = store
                    self.interrupted_runs = store.runs_mark_interrupted(set(self.supervisor.running_ids()))
                    self.interrupted_changesets = store.changesets_reconcile_interrupted(self.config.limits.apply_timeout_seconds)
                    for hook in self.on_store_open:
                        try:
                            hook(self)
                        except Exception as exc:
                            log.warning("opsconsole store-open hook failed: %s", exc)
        return self._store

    def close(self) -> None:
        if self._store is not None:
            try:
                self.traffic.flush(self._store.traffic_flush)
            except Exception:
                pass
            self._store.close()

    # --- database ------------------------------------------------------------------------

    @contextmanager
    def db(self) -> Iterator[Session]:
        session = self.config.session_factory()
        try:
            yield session
        finally:
            session.close()

    # --- auth ----------------------------------------------------------------------------

    def read(self, request: Request) -> Principal:
        principal = self.config.auth.allow_read(request)
        if principal is None:
            raise ConsoleError(403, "forbidden", "The console is not available to this caller")
        request.state.console_principal = principal
        return principal

    def write(self, request: Request, *, need: WritePolicy = WritePolicy.CHANGESETS) -> Principal:
        principal = self.config.auth.allow_write(request)
        if principal is None:
            raise ConsoleError(403, "forbidden", "This caller may read the console but not change anything through it")
        order = [WritePolicy.DISABLED, WritePolicy.CHANGESETS, WritePolicy.CHANGESETS_AND_SQL]
        if order.index(self.config.writes) < order.index(need):
            raise ConsoleError(403, "writes_disabled", f"Console writes are set to {self.config.writes.value}; this action needs {need.value}")
        request.state.console_principal = principal
        return principal

    @staticmethod
    def confirm(request_confirm: str | None, expected: str) -> None:
        if request_confirm != expected:
            raise ConsoleError(400, "confirm_mismatch", f"confirm must equal {expected!r}")

    # --- audit ---------------------------------------------------------------------------

    def audit(self, principal: Principal, request: Request | None, *, section: str, action: str, target_table: str | None = None,
              target_pk: Any = None, before: Any = None, after: Any = None, changeset_id: str | None = None, run_id: str | None = None,
              note: str | None = None, state: str | None = None) -> str:
        rid = getattr(request.state, "request_id", None) if request is not None else None
        ids = self.store.activity_write([{
            "principal_id": principal.id, "principal_label": principal.label, "request_id": rid, "section": section, "action": action,
            "target_table": target_table, "target_pk": target_pk, "before": before, "after": after, "changeset_id": changeset_id,
            "run_id": run_id, "note": note, "state": state,
        }])
        self.bus.publish("activity", {"id": ids[0], "section": section, "action": action, "table": target_table, "principal": principal.label})
        return ids[0]

    # --- housekeeping (called opportunistically from requests) ----------------------------

    def housekeeping(self) -> None:
        now = time.monotonic()
        if now - self._last_flush_at > 60:
            self._last_flush_at = now
            try:
                self.traffic.flush(self.store.traffic_flush)
            except Exception as exc:
                log.warning("opsconsole traffic flush failed: %s", exc)
        if now - self._last_sweep_at > 3600 and self._sweep_lock.acquire(blocking=False):
            try:
                self._last_sweep_at = now
                self.last_sweep = self.store.sweep(activity_days=self.config.limits.activity_days, runs_per_kind=self.config.limits.runs_per_kind)
            except Exception as exc:
                log.warning("opsconsole sweep failed: %s", exc)
            finally:
                self._sweep_lock.release()

    @property
    def prefix(self) -> str:
        return self.config.route_prefix
