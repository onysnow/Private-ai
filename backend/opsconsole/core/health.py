"""Built-in checks and tiles (app-agnostic), the check runner, and the
health board that merges built-in tiles with the host's."""

from __future__ import annotations

import shutil
import time
from datetime import timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import exists, func, select, text
from sqlalchemy.orm import Session

from opsconsole.context import ConsoleContext
from opsconsole.core.ids import now_iso
from opsconsole.core.metrics import server_metrics
from opsconsole.protocols import (
    Check,
    CheckResult,
    Principal,
    State,
    Tile,
    TileProvider,
)

STATE_ORDER = {"ok": 0, "warn": 1, "fail": 2, "error": 3}


def _worst(states: list[str]) -> str:
    return max(states, key=lambda s: STATE_ORDER.get(s, 3)) if states else "ok"


# --- built-in checks ------------------------------------------------------------------------

def builtin_checks(ctx: ConsoleContext) -> list[Check]:
    intro = ctx.introspector

    def tables_present(db: Session) -> CheckResult:
        drift = intro.drift()
        return CheckResult(count=len(drift["missing_tables"]), samples=drift["missing_tables"], hint="Modeled tables missing from the database: the schema bootstrap or migration did not run here.")

    def schema_drift(db: Session) -> CheckResult:
        drift = intro.drift()
        samples = [f"{t}: -{v['missing_in_db']} +{v['extra_in_db']}" for t, v in drift["columns"].items()] + [f"extra table {t}" for t in drift["extra_tables"]]
        return CheckResult(count=len(samples), samples=samples[:20], hint="Columns or tables that differ between the models and the live database.")

    def fks_indexed(db: Session) -> CheckResult:
        missing = intro.unindexed_foreign_keys()
        return CheckResult(count=len(missing), samples=missing[:20], hint="Foreign keys without an index: joins and cascades scan the table. Add index=True in the model and a migration.")

    def orphaned_rows(db: Session) -> CheckResult:
        """Every FK whose target row is missing -- schema-wide, derived from MetaData."""
        samples: list[str] = []
        total = 0
        live = intro.live()["tables"]
        conn = db.connection()
        for table in intro.model_tables():
            if table.name not in live:
                continue
            for col in table.columns:
                for fk in col.foreign_keys:
                    target = fk.column
                    if target.table.name not in live:
                        continue
                    stmt = select(func.count()).select_from(table).where(col.is_not(None)).where(~exists().where(target == col))
                    n = int(conn.execute(stmt).scalar_one())
                    if n:
                        total += n
                        samples.append(f"{table.name}.{col.name} -> {target.table.name}: {n}")
        return CheckResult(count=total, samples=samples[:20], hint="Rows whose foreign key points at a row that no longer exists. Browse the table with filter[<column>]=notnull and fix or delete them.")

    def store_writable(db: Session) -> CheckResult:
        ok, err = ctx.store.ping()
        return CheckResult(count=0 if ok else 1, samples=[err] if err else [], hint="The console's own state store must be writable for audit and change-sets.")

    def runs_interrupted(db: Session) -> CheckResult:
        n = ctx.interrupted_runs
        return CheckResult(count=n, samples=[f"{n} run(s) were marked interrupted at mount"] if n else [], hint="Runs that were in progress when the process last stopped.", severity="info")

    def disk_free(db: Session) -> CheckResult:
        usage = shutil.disk_usage(str(ctx.config.console_dir))
        free_gb = usage.free / 1e9
        return CheckResult(count=1 if free_gb < 2 else 0, samples=[f"{free_gb:.1f} GB free on {ctx.config.console_dir}"] if free_gb < 2 else [], hint="Less than 2 GB free where the console (and probably the app) writes.", severity="warn")

    def migrations(db: Session) -> CheckResult:
        from opsconsole.core.migrations import migration_state

        state = migration_state(ctx)
        if state is None:
            return CheckResult(count=0, hint="Alembic not configured for this host.")
        if state["at_head"]:
            return CheckResult(count=0, hint="Database schema is at the latest migration.")
        return CheckResult(count=1, samples=[f"current={state['current']} heads={state['heads']}"], hint="The database is behind the migration head. Use Schema → Migrations to plan and upgrade.")

    checks = [
        Check(id="tables_present", title="Every modeled table exists", run=tables_present, section="schema"),
        Check(id="schema_drift", title="Models and database agree", run=schema_drift, section="schema", severity="warn"),
        Check(id="foreign_keys_indexed", title="Foreign keys are indexed", run=fks_indexed, section="schema", severity="info"),
        Check(id="orphaned_rows", title="No foreign key points at a missing row", run=orphaned_rows, section="data"),
        Check(id="console_store_writable", title="Console state store is writable", run=store_writable, section="overview"),
        Check(id="console_runs_interrupted", title="No runs were interrupted by a restart", run=runs_interrupted, section="tests", severity="info"),
        Check(id="disk_free", title="Disk has headroom", run=disk_free, section="overview", severity="warn"),
    ]
    if ctx.config.alembic_ini is not None:
        checks.insert(0, Check(id="migrations_at_head", title="Database schema is at the latest migration", run=migrations, section="schema"))
    return checks


def all_checks(ctx: ConsoleContext) -> list[Check]:
    return builtin_checks(ctx) + list(ctx.config.checks)


def list_checks(ctx: ConsoleContext) -> list[dict[str, Any]]:
    last = ctx.store.check_last_status()
    return [{"id": c.id, "title": c.title, "severity": c.severity, "section": c.section, "builtin": c.id in {b.id for b in builtin_checks(ctx)}, "last": last.get(c.id)} for c in all_checks(ctx)]


def run_checks(ctx: ConsoleContext, *, only: list[str] | None, principal: Principal) -> dict[str, Any]:
    """Runs synchronously inside a supervised run so history and streaming are uniform."""
    wanted = [c for c in all_checks(ctx) if not only or c.id in only]

    def fn(run: Any) -> tuple[str, dict[str, Any] | None, int | None]:
        results: list[dict[str, Any]] = []
        summary = {"pass": 0, "info": 0, "warn": 0, "fail": 0, "error": 0}
        with ctx.db() as db:
            for check in wanted:
                if run.cancelled:
                    break
                started = time.perf_counter()
                entry: dict[str, Any]
                try:
                    result = check.run(db)
                    severity = result.severity or check.severity
                    status = "pass" if result.count == 0 else severity
                    entry = {"id": check.id, "title": check.title, "status": status, "count": result.count, "samples": [str(s) if not isinstance(s, (list, tuple)) else list(s) for s in result.samples],
                             "hint": result.hint or check.hint, "table": result.table, "section": check.section}
                except Exception as exc:
                    db.rollback()
                    entry = {"id": check.id, "title": check.title, "status": "error", "count": None, "samples": [f"{exc.__class__.__name__}: {str(exc)[:300]}"], "hint": "", "table": None, "section": check.section}
                entry["ms"] = int((time.perf_counter() - started) * 1000)
                summary[entry["status"]] = summary.get(entry["status"], 0) + 1
                results.append(entry)
                run.log(f"{entry['status']:5} {check.id} ({entry['count']}) {entry['ms']}ms")
                ctx.bus.publish("checks", {"run_id": run.id, "check": entry})
        ctx.store.check_results_write(run.id, results)
        status = "failed" if summary["fail"] or summary["error"] else "passed"
        return status, {"summary": summary, "checked": len(results)}, None

    return ctx.supervisor.start("checks", fn, selection=",".join(only) if only else None, principal_id=principal.id)


# --- built-in tiles -------------------------------------------------------------------------

def builtin_tiles(ctx: ConsoleContext) -> list[TileProvider]:
    intro = ctx.introspector

    def database(db: Session) -> Tile:
        drift = intro.drift()
        bind = db.get_bind()
        try:
            db.execute(text("SELECT 1"))
        except Exception as exc:
            return Tile(state="fail", headline=f"unreachable: {exc.__class__.__name__}", details={"error": str(exc)[:300]}, section="schema")
        modeled = len(intro.model_tables())
        present = modeled - len(drift["missing_tables"])
        state: State = "ok" if not drift["missing_tables"] else "fail"
        if state == "ok" and (drift["columns"] or drift["extra_tables"]):
            state = "warn"
        return Tile(state=state, headline=f"{bind.dialect.name} · {present}/{modeled} tables" + (" · drift" if drift["columns"] else ""),
                    details={"dialect": bind.dialect.name, "label": ctx.config.database_label, **drift}, section="schema")

    def migrations(db: Session) -> Tile:
        from opsconsole.core.migrations import migration_state

        state = migration_state(ctx)
        if state is None:
            return Tile(state="ok", headline="Alembic not configured", details={}, section="schema")
        if state.get("error"):
            return Tile(state="error", headline=state["error"], details=state, section="schema")
        return Tile(state="ok" if state["at_head"] else "fail", headline="at head" if state["at_head"] else f"{state['behind_by']} migration(s) behind",
                    details={k: state[k] for k in ("current", "heads", "behind_by")}, section="schema")

    def server(db: Session) -> Tile:
        m = server_metrics(paths={"console_dir": str(ctx.config.console_dir)})
        disk = m["disks"].get("console_dir", {})
        warn = bool(disk.get("free_gb") is not None and disk["free_gb"] < 2)
        return Tile(state="warn" if warn else "ok",
                    headline=f"up {timedelta(seconds=m['uptime_seconds'])} · {m['rss_mb'] or '?'} MB RSS · {'Docker' if m['in_docker'] else 'host'} · {disk.get('free_gb', '?')} GB free",
                    details=m, section="config")

    def console(db: Session) -> Tile:
        ok, err = ctx.store.ping()
        pending = len(ctx.store.changesets_list(status="pending", limit=100))
        fill, cap = ctx.traffic.fill()
        details = {"store": ctx.store.path or "host database", "store_bytes": ctx.store.size_bytes(), "store_error": err, "pending_changesets": pending,
                   "sse_subscribers": ctx.bus.subscribers, "traffic_buffer": f"{fill}/{cap}", "running": ctx.supervisor.running_ids(),
                   "interrupted_runs_at_mount": ctx.interrupted_runs, "last_sweep": ctx.last_sweep, "mounted_at": ctx.mounted_at, "writes": ctx.config.writes.value}
        state: State = "fail" if not ok else ("warn" if pending or ctx.interrupted_runs else "ok")
        return Tile(state=state, headline=("store unwritable" if not ok else f"{pending} pending change-set(s) · writes {ctx.config.writes.value} · {ctx.bus.subscribers} live viewer(s)"), details=details, section="activity")

    def tests(db: Session) -> Tile:
        last = ctx.store.runs_last("tests")
        if last is None:
            return Tile(state="warn", headline="never run", details={}, section="tests")
        state_map: dict[str, State] = {"passed": "ok", "failed": "fail", "error": "fail", "cancelled": "warn", "running": "warn"}
        state: State = state_map.get(last["status"], "warn")
        summary = last.get("summary") or {}
        return Tile(state=state, headline=f"{last['status']} · {summary.get('line') or ''} · {(last.get('finished_at') or last['started_at'])[:16].replace('T', ' ')}",
                    details={"run_id": last["id"], **summary}, section="tests")

    def checks(db: Session) -> Tile:
        last = ctx.store.runs_last("checks")
        if last is None:
            return Tile(state="warn", headline="never run", details={}, section="checks")
        summary = (last.get("summary") or {}).get("summary") or {}
        state: State = "fail" if summary.get("fail") or summary.get("error") else ("warn" if summary.get("warn") else "ok")
        return Tile(state=state, headline=" · ".join(f"{summary.get(k, 0)} {k}" for k in ("pass", "warn", "fail", "error")), details={"run_id": last["id"], **summary}, section="checks")

    tiles = [
        TileProvider(id="database", title="Database", run=database, section="schema", refresh_seconds=5),
        TileProvider(id="server", title="Server", run=server, section="config", refresh_seconds=5),
        TileProvider(id="console", title="Console", run=console, section="activity", refresh_seconds=10),
    ]
    if ctx.config.alembic_ini is not None:
        tiles.insert(1, TileProvider(id="migrations", title="Migrations", run=migrations, section="schema", refresh_seconds=60))
    if ctx.config.tests is not None:
        tiles.append(TileProvider(id="tests", title="Tests", run=tests, section="tests", refresh_seconds=10))
    tiles.append(TileProvider(id="checks", title="Checks", run=checks, section="checks", refresh_seconds=10))
    return tiles


def health_board(ctx: ConsoleContext, *, only: set[str] | None = None) -> dict[str, Any]:
    providers = builtin_tiles(ctx) + list(ctx.config.tiles)
    out: list[dict[str, Any]] = []
    with ctx.db() as db:
        for p in providers:
            if only and p.id not in only:
                continue
            started = time.perf_counter()
            entry: dict[str, Any]
            try:
                tile = p.run(db)
                entry = {"id": p.id, "title": p.title, "state": tile.state, "headline": tile.headline, "details": tile.details, "section": tile.section or p.section}
            except Exception as exc:
                try:
                    db.rollback()
                except Exception:
                    pass
                entry = {"id": p.id, "title": p.title, "state": "error", "headline": f"{exc.__class__.__name__}: {str(exc)[:200]}", "details": {}, "section": p.section}
            entry["refresh_seconds"] = p.refresh_seconds
            entry["ms"] = int((time.perf_counter() - started) * 1000)
            out.append(entry)
    return {"at": now_iso(), "overall": _worst([t["state"] for t in out]), "tiles": out}


def storage_summary(path: Path) -> dict[str, Any]:
    files = 0
    size = 0
    if path.exists():
        for p in path.rglob("*"):
            if p.is_file():
                files += 1
                try:
                    size += p.stat().st_size
                except OSError:
                    pass
    return {"path": str(path), "exists": path.exists(), "files": files, "bytes": size}
