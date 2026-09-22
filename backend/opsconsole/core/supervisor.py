"""One mechanism for every long task (tests, checks, backups, restores,
migrations, probes): a thread per run, single-flight per kind, a ring buffer
of output plus a log file on disk, live lines on the event bus, cooperative
cancel, and reconciliation of runs interrupted by a process restart."""

from __future__ import annotations

import threading
import traceback
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from opsconsole.core.events import EventBus
from opsconsole.core.ids import new_id
from opsconsole.store import Store

RunFn = Callable[["Run"], tuple[str, dict[str, Any] | None, int | None]]


class Run:
    """The RunHandle handed to adapters."""

    def __init__(self, run_id: str, kind: str, log_path: Path, bus: EventBus, ring: int) -> None:
        self._id = run_id
        self.kind = kind
        self.log_path = log_path
        self.bus = bus
        self.lines: deque[str] = deque(maxlen=ring)
        self.total_lines = 0
        self._cancel = threading.Event()
        self._file = log_path.open("a", encoding="utf-8")
        self._lock = threading.Lock()
        self.process_pid: int | None = None   # adapters running a subprocess set this so cancel can escalate
        self.on_cancel: Callable[[], None] | None = None

    @property
    def id(self) -> str:
        return self._id

    @property
    def cancelled(self) -> bool:
        return self._cancel.is_set()

    def log(self, line: str) -> None:
        line = line.rstrip("\n")
        with self._lock:
            self.lines.append(line)
            self.total_lines += 1
            try:
                self._file.write(line + "\n")
                self._file.flush()
            except ValueError:  # closed
                pass
        self.bus.publish(f"run:{self.kind}", {"run_id": self._id, "line": line, "n": self.total_lines})

    def cancel(self) -> None:
        self._cancel.set()
        if self.on_cancel is not None:
            try:
                self.on_cancel()
            except Exception:
                pass

    def close(self) -> None:
        with self._lock:
            try:
                self._file.close()
            except Exception:
                pass


class TaskSupervisor:
    def __init__(self, store: Callable[[], Store], bus: EventBus, console_dir: Path, *, ring: int = 2000) -> None:
        self._store = store
        self.bus = bus
        self.runs_dir = console_dir / "runs"
        self.ring = ring
        # RLock, not Lock: start() calls self.store.run_create(...) while holding this
        # lock, and if this is the process's first-ever store access, ConsoleContext
        # lazily opens the store right there and reconciles interrupted runs by calling
        # back into self.running_ids() -- on the SAME thread, while the lock above is
        # still held. A plain Lock would self-deadlock in that case; RLock allows the
        # same thread to re-enter while still excluding other threads.
        self._lock = threading.RLock()
        self._live: dict[str, tuple[Run, threading.Thread]] = {}   # run_id -> (run, thread)
        self._by_kind: dict[str, str] = {}                          # kind -> run_id while running

    @property
    def store(self) -> Store:
        return self._store()

    # --- lifecycle ---------------------------------------------------------------------

    def shutdown(self) -> None:
        with self._lock:
            live = list(self._live.values())
        for run, thread in live:
            run.cancel()
        for run, thread in live:
            thread.join(timeout=5)

    # --- starting ----------------------------------------------------------------------

    def start(self, kind: str, fn: RunFn, *, selection: str | None, principal_id: str) -> dict[str, Any]:
        with self._lock:
            current = self._by_kind.get(kind)
            if current is not None and current in self._live:
                raise RuntimeError(f"a {kind} run is already in progress ({current})")
            self.runs_dir.joinpath(kind).mkdir(parents=True, exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            run_id = new_id()
            log_path = self.runs_dir / kind / f"{stamp}-{run_id}.log"
            row = self.store.run_create(kind=kind, selection=selection, principal_id=principal_id, log_path=str(log_path), run_id=run_id)
            run = Run(run_id, kind, log_path, self.bus, self.ring)
            thread = threading.Thread(target=self._execute, args=(run, fn), name=f"opsconsole-{kind}-{run_id}", daemon=True)
            self._live[run_id] = (run, thread)
            self._by_kind[kind] = run_id
        self.bus.publish(f"run:{kind}", {"run_id": run_id, "event": "started", "selection": selection})
        thread.start()
        return self.status(run_id)

    def _execute(self, run: Run, fn: RunFn) -> None:
        status, summary, exit_code = "error", None, None
        try:
            status, summary, exit_code = fn(run)
            if run.cancelled and status not in ("passed", "failed"):
                status = "cancelled"
        except Exception as exc:
            run.log("".join(traceback.format_exception(type(exc), exc, exc.__traceback__)))
            summary = {"error": f"{exc.__class__.__name__}: {str(exc)[:500]}"}
            status = "error"
        finally:
            run.close()
            self.store.run_finish(run.id, status=status, summary=summary, exit_code=exit_code)
            with self._lock:
                self._live.pop(run.id, None)
                if self._by_kind.get(run.kind) == run.id:
                    del self._by_kind[run.kind]
            self.bus.publish(f"run:{run.kind}", {"run_id": run.id, "event": "finished", "status": status, "summary": summary})

    # --- reading -----------------------------------------------------------------------

    def is_running(self, kind: str) -> bool:
        with self._lock:
            rid = self._by_kind.get(kind)
            return rid is not None and rid in self._live

    def running_ids(self) -> list[str]:
        with self._lock:
            return list(self._live)

    def cancel(self, run_id: str) -> dict[str, Any]:
        with self._lock:
            entry = self._live.get(run_id)
        if entry is None:
            raise LookupError("run is not in progress")
        entry[0].cancel()
        entry[0].log("[console] cancel requested")
        return self.status(run_id)

    def status(self, run_id: str, *, tail: int = 60) -> dict[str, Any]:
        row = self.store.run_get(run_id)
        if row is None:
            raise LookupError("unknown run")
        with self._lock:
            entry = self._live.get(run_id)
        if entry is not None:
            run = entry[0]
            with run._lock:
                lines = list(run.lines)[-tail:]
                total = run.total_lines
            row["live"] = True
        else:
            lines, total = self.read_log(row["log_path"], tail)
            row["live"] = False
        row["tail"] = lines
        row["lines"] = total
        return row

    @staticmethod
    def read_log(path: str, tail: int | None) -> tuple[list[str], int]:
        p = Path(path) if path else None
        if p is None or not p.exists():
            return [], 0
        lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
        return (lines[-tail:] if tail else lines), len(lines)
