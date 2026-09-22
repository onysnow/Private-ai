"""The console's own state: activity log, change-sets, saved queries, query
history, run history, check results, traffic snapshots, request collections.

Kept apart from the host's data. `store="sqlite"` (default) is a file under
`console_dir`; `store="host"` puts the same tables, prefixed `opsconsole_`,
in the host database. Either way the tables are created here at mount --
they are the console's, versioned by `STORE_VERSION`, never by the host's
Alembic.
"""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Sequence

from sqlalchemy import (
    Boolean,
    Column,
    Engine,
    Float,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    delete,
    event,
    func,
    insert,
    select,
    text,
    update,
)

from opsconsole.core.ids import new_id, now_iso

STORE_VERSION = 1


def _tables(prefix: str) -> tuple[MetaData, dict[str, Table]]:
    md = MetaData()
    t: dict[str, Table] = {}
    t["activity_log"] = Table(
        f"{prefix}activity_log", md,
        Column("id", String(32), primary_key=True),
        Column("at", String(40), nullable=False, index=True),
        Column("principal_id", String(255), nullable=False, index=True),
        Column("principal_label", String(255), nullable=False),
        Column("request_id", String(64)),
        Column("section", String(32), nullable=False),
        Column("action", String(64), nullable=False),
        Column("target_table", String(255), index=True),
        Column("target_pk", Text),
        Column("before", Text),
        Column("after", Text),
        Column("changeset_id", String(32)),
        Column("run_id", String(32)),
        Column("note", Text),
        Column("undone_by", String(32)),
        Column("state", String(16), nullable=False, default="committed"),
    )
    t["change_sets"] = Table(
        f"{prefix}change_sets", md,
        Column("id", String(32), primary_key=True),
        Column("created_at", String(40), nullable=False),
        Column("principal_id", String(255), nullable=False),
        Column("status", String(16), nullable=False, index=True),
        Column("target_table", String(255), nullable=False),
        Column("ops", Text, nullable=False),
        Column("origin", String(16), nullable=False, default="inline"),
        Column("applied_at", String(40)),
        Column("error", Text),
        Column("expires_at", String(40), nullable=False),
    )
    t["saved_queries"] = Table(
        f"{prefix}saved_queries", md,
        Column("id", String(32), primary_key=True),
        Column("name", String(255), nullable=False, unique=True),
        Column("sql", Text, nullable=False),
        Column("params", Text, nullable=False, default="[]"),
        Column("created_by", String(255), nullable=False),
        Column("updated_at", String(40), nullable=False),
        Column("pinned", Boolean, nullable=False, default=False),
    )
    t["query_history"] = Table(
        f"{prefix}query_history", md,
        Column("id", String(32), primary_key=True),
        Column("at", String(40), nullable=False, index=True),
        Column("principal_id", String(255), nullable=False),
        Column("sql", Text, nullable=False),
        Column("mode", String(8), nullable=False),
        Column("rows", Integer),
        Column("ms", Integer),
        Column("error", Text),
    )
    t["runs"] = Table(
        f"{prefix}runs", md,
        Column("id", String(32), primary_key=True),
        Column("kind", String(32), nullable=False, index=True),
        Column("selection", Text),
        Column("principal_id", String(255), nullable=False),
        Column("started_at", String(40), nullable=False),
        Column("finished_at", String(40)),
        Column("status", String(16), nullable=False),
        Column("summary", Text),
        Column("log_path", String(1024), nullable=False),
        Column("exit_code", Integer),
    )
    t["check_results"] = Table(
        f"{prefix}check_results", md,
        Column("run_id", String(32), primary_key=True),
        Column("check_id", String(128), primary_key=True),
        Column("status", String(8), nullable=False),
        Column("count", Integer),
        Column("samples", Text),
        Column("hint", Text),
        Column("ms", Integer),
    )
    t["traffic_snapshots"] = Table(
        f"{prefix}traffic_snapshots", md,
        Column("at", String(40), primary_key=True),
        Column("route", String(512), primary_key=True),
        Column("method", String(16), primary_key=True),
        Column("count", Integer, nullable=False),
        Column("p50_ms", Float),
        Column("p95_ms", Float),
        Column("max_ms", Float),
        Column("status_4xx", Integer, nullable=False, default=0),
        Column("status_5xx", Integer, nullable=False, default=0),
    )
    t["api_collections"] = Table(
        f"{prefix}api_collections", md,
        Column("id", String(32), primary_key=True),
        Column("name", String(255), nullable=False, unique=True),
        Column("requests", Text, nullable=False),
        Column("updated_at", String(40), nullable=False),
    )
    t["store_meta"] = Table(
        f"{prefix}store_meta", md,
        Column("key", String(64), primary_key=True),
        Column("value", Text, nullable=False),
    )
    return md, t


def _dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def _loads(value: str | None) -> Any:
    if value is None:
        return None
    try:
        return json.loads(value)
    except ValueError:
        return value


class Store:
    def __init__(self, engine: Engine, *, prefix: str = "") -> None:
        self.engine = engine
        self.metadata, self.t = _tables(prefix)
        self._lock = threading.RLock()
        self.path: str | None = None
        self.created_at: str | None = None

    # --- lifecycle ---------------------------------------------------------------------

    @classmethod
    def open(cls, console_dir: Path, *, host_engine: Engine | None = None) -> "Store":
        if host_engine is not None:
            store = cls(host_engine, prefix="opsconsole_")
        else:
            console_dir.mkdir(parents=True, exist_ok=True)
            path = console_dir / "opsconsole.db"
            engine = create_engine(f"sqlite:///{path.as_posix()}", connect_args={"check_same_thread": False, "timeout": 5})

            @event.listens_for(engine, "connect")
            def _pragmas(dbapi_connection: Any, _record: Any) -> None:
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA busy_timeout=5000")
                cursor.close()

            store = cls(engine)
            store.path = str(path)
        store.migrate()
        return store

    def migrate(self) -> None:
        self.metadata.create_all(self.engine)
        with self.engine.begin() as conn:
            meta = self.t["store_meta"]
            row = conn.execute(select(meta.c.value).where(meta.c.key == "schema_version")).scalar_one_or_none()
            if row is None:
                conn.execute(insert(meta).values(key="schema_version", value=str(STORE_VERSION)))
                conn.execute(insert(meta).values(key="created_at", value=now_iso()))
            created = conn.execute(select(meta.c.value).where(meta.c.key == "created_at")).scalar_one_or_none()
            self.created_at = created

    def ping(self) -> tuple[bool, str | None]:
        try:
            with self.engine.begin() as conn:
                conn.execute(text("SELECT 1"))
                conn.execute(update(self.t["store_meta"]).where(self.t["store_meta"].c.key == "schema_version").values(value=str(STORE_VERSION)))
            return True, None
        except Exception as exc:  # any driver error: the tile shows it
            return False, f"{exc.__class__.__name__}: {str(exc)[:200]}"

    def size_bytes(self) -> int | None:
        if self.path and Path(self.path).exists():
            return Path(self.path).stat().st_size
        return None

    def close(self) -> None:
        if self.path is not None:
            self.engine.dispose()

    # --- activity ------------------------------------------------------------------------

    def activity_write(self, rows: Sequence[dict[str, Any]]) -> list[str]:
        ids: list[str] = []
        with self.engine.begin() as conn:
            for row in rows:
                rid = new_id()
                payload = {
                    "id": rid, "at": now_iso(), "state": "committed",
                    "principal_id": row.get("principal_id", "?"), "principal_label": row.get("principal_label", "?"),
                    "request_id": row.get("request_id"), "section": row["section"], "action": row["action"],
                    "target_table": row.get("target_table"), "target_pk": _dumps(row["target_pk"]) if row.get("target_pk") is not None else None,
                    "before": _dumps(row["before"]) if row.get("before") is not None else None,
                    "after": _dumps(row["after"]) if row.get("after") is not None else None,
                    "changeset_id": row.get("changeset_id"), "run_id": row.get("run_id"), "note": row.get("note"),
                }
                if row.get("state"):
                    payload["state"] = row["state"]
                conn.execute(insert(self.t["activity_log"]).values(**payload))
                ids.append(rid)
        return ids

    def activity_set_state(self, ids: Sequence[str], state: str) -> None:
        if not ids:
            return
        with self.engine.begin() as conn:
            conn.execute(update(self.t["activity_log"]).where(self.t["activity_log"].c.id.in_(list(ids))).values(state=state))

    def activity_mark_undone(self, activity_id: str, undone_by: str) -> None:
        with self.engine.begin() as conn:
            conn.execute(update(self.t["activity_log"]).where(self.t["activity_log"].c.id == activity_id).values(undone_by=undone_by))

    def activity_get(self, activity_id: str) -> dict[str, Any] | None:
        t = self.t["activity_log"]
        with self.engine.begin() as conn:
            row = conn.execute(select(t).where(t.c.id == activity_id)).mappings().first()
        return self._activity_row(row) if row else None

    def activity_list(self, *, limit: int, principal: str | None = None, section: str | None = None, table: str | None = None,
                      since: str | None = None, changeset_id: str | None = None) -> list[dict[str, Any]]:
        t = self.t["activity_log"]
        stmt = select(t).order_by(t.c.at.desc(), t.c.id.desc()).limit(limit)
        if principal:
            stmt = stmt.where(t.c.principal_id == principal)
        if section:
            stmt = stmt.where(t.c.section == section)
        if table:
            stmt = stmt.where(t.c.target_table == table)
        if since:
            stmt = stmt.where(t.c.at >= since)
        if changeset_id:
            stmt = stmt.where(t.c.changeset_id == changeset_id)
        with self.engine.begin() as conn:
            rows = conn.execute(stmt).mappings().all()
        return [self._activity_row(r) for r in rows]

    def activity_pending(self) -> list[dict[str, Any]]:
        t = self.t["activity_log"]
        with self.engine.begin() as conn:
            rows = conn.execute(select(t).where(t.c.state == "pending")).mappings().all()
        return [self._activity_row(r) for r in rows]

    @staticmethod
    def _activity_row(row: Any) -> dict[str, Any]:
        d = dict(row)
        for k in ("target_pk", "before", "after"):
            d[k] = _loads(d.get(k))
        return d

    # --- change-sets ---------------------------------------------------------------------

    def changeset_create(self, *, principal_id: str, table: str, ops: list[dict[str, Any]], origin: str, ttl_seconds: int) -> dict[str, Any]:
        cid = new_id()
        now = datetime.now(timezone.utc)
        row: dict[str, Any] = {
            "id": cid, "created_at": now.isoformat(), "principal_id": principal_id, "status": "pending", "target_table": table,
            "ops": _dumps(ops), "origin": origin, "applied_at": None, "error": None,
            "expires_at": (now + timedelta(seconds=ttl_seconds)).isoformat(),
        }
        with self.engine.begin() as conn:
            conn.execute(insert(self.t["change_sets"]).values(**row))
        row["ops"] = ops
        return row

    def changeset_get(self, cid: str) -> dict[str, Any] | None:
        t = self.t["change_sets"]
        with self.engine.begin() as conn:
            row = conn.execute(select(t).where(t.c.id == cid)).mappings().first()
        if row is None:
            return None
        d = dict(row)
        d["ops"] = _loads(d["ops"])
        return d

    def changeset_update(self, cid: str, **values: Any) -> None:
        if "ops" in values:
            values["ops"] = _dumps(values["ops"])
        with self.engine.begin() as conn:
            conn.execute(update(self.t["change_sets"]).where(self.t["change_sets"].c.id == cid).values(**values))

    def changeset_claim(self, cid: str) -> bool:
        """pending -> applying atomically; False if it was not pending."""
        t = self.t["change_sets"]
        with self.engine.begin() as conn:
            result = conn.execute(update(t).where(t.c.id == cid, t.c.status == "pending").values(status="applying"))
        return bool(result.rowcount)

    def changesets_list(self, *, status: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        t = self.t["change_sets"]
        stmt = select(t).order_by(t.c.created_at.desc()).limit(limit)
        if status:
            stmt = stmt.where(t.c.status == status)
        with self.engine.begin() as conn:
            rows = conn.execute(stmt).mappings().all()
        out = []
        for r in rows:
            d = dict(r)
            d["ops"] = _loads(d["ops"])
            out.append(d)
        return out

    def changesets_expire(self) -> int:
        t = self.t["change_sets"]
        with self.engine.begin() as conn:
            result = conn.execute(update(t).where(t.c.status == "pending", t.c.expires_at < now_iso()).values(status="expired"))
        return int(result.rowcount or 0)

    def changesets_reconcile_interrupted(self, older_than_seconds: int) -> int:
        t = self.t["change_sets"]
        cutoff = (datetime.now(timezone.utc) - timedelta(seconds=older_than_seconds)).isoformat()
        with self.engine.begin() as conn:
            result = conn.execute(update(t).where(t.c.status == "applying", t.c.created_at < cutoff).values(status="rejected", error="interrupted"))
        return int(result.rowcount or 0)

    # --- saved queries and history -------------------------------------------------------

    def saved_list(self) -> list[dict[str, Any]]:
        t = self.t["saved_queries"]
        with self.engine.begin() as conn:
            rows = conn.execute(select(t).order_by(t.c.pinned.desc(), t.c.name)).mappings().all()
        return [dict(r) | {"params": _loads(r["params"])} for r in rows]

    def saved_upsert(self, *, name: str, sql: str, params: list[dict[str, Any]], created_by: str, pinned: bool, qid: str | None = None) -> dict[str, Any]:
        t = self.t["saved_queries"]
        with self.engine.begin() as conn:
            existing = None
            if qid:
                existing = conn.execute(select(t.c.id).where(t.c.id == qid)).scalar_one_or_none()
            else:
                existing = conn.execute(select(t.c.id).where(t.c.name == name)).scalar_one_or_none()
            values = {"name": name, "sql": sql, "params": _dumps(params), "updated_at": now_iso(), "pinned": pinned}
            if existing:
                conn.execute(update(t).where(t.c.id == existing).values(**values))
                qid = existing
            else:
                qid = new_id()
                conn.execute(insert(t).values(id=qid, created_by=created_by, **values))
        return {"id": qid, **values, "params": params}

    def saved_delete(self, qid: str) -> bool:
        with self.engine.begin() as conn:
            result = conn.execute(delete(self.t["saved_queries"]).where(self.t["saved_queries"].c.id == qid))
        return bool(result.rowcount)

    def history_add(self, *, principal_id: str, sql: str, mode: str, rows: int | None, ms: int, error: str | None, keep: int) -> None:
        t = self.t["query_history"]
        with self.engine.begin() as conn:
            conn.execute(insert(t).values(id=new_id(), at=now_iso(), principal_id=principal_id, sql=sql[:20000], mode=mode, rows=rows, ms=ms, error=(error or None)))
            total = conn.execute(select(func.count()).select_from(t)).scalar_one()
            if total > keep:
                old = conn.execute(select(t.c.id).order_by(t.c.at.asc()).limit(total - keep)).scalars().all()
                conn.execute(delete(t).where(t.c.id.in_(list(old))))

    def history_list(self, limit: int) -> list[dict[str, Any]]:
        t = self.t["query_history"]
        with self.engine.begin() as conn:
            rows = conn.execute(select(t).order_by(t.c.at.desc()).limit(limit)).mappings().all()
        return [dict(r) for r in rows]

    # --- runs ----------------------------------------------------------------------------

    def run_create(self, *, kind: str, selection: str | None, principal_id: str, log_path: str, run_id: str | None = None) -> dict[str, Any]:
        rid = run_id or new_id()
        row = {"id": rid, "kind": kind, "selection": selection, "principal_id": principal_id, "started_at": now_iso(), "finished_at": None,
               "status": "running", "summary": None, "log_path": log_path, "exit_code": None}
        with self.engine.begin() as conn:
            conn.execute(insert(self.t["runs"]).values(**row))
        return row

    def run_running(self, kind: str) -> dict[str, Any] | None:
        t = self.t["runs"]
        with self.engine.begin() as conn:
            row = conn.execute(select(t).where(t.c.kind == kind, t.c.status == "running").order_by(t.c.started_at.desc())).mappings().first()
        return self._run_row(row) if row else None

    def run_finish(self, rid: str, *, status: str, summary: dict[str, Any] | None, exit_code: int | None) -> None:
        with self.engine.begin() as conn:
            conn.execute(update(self.t["runs"]).where(self.t["runs"].c.id == rid).values(
                status=status, finished_at=now_iso(), summary=_dumps(summary) if summary is not None else None, exit_code=exit_code))

    def run_get(self, rid: str) -> dict[str, Any] | None:
        t = self.t["runs"]
        with self.engine.begin() as conn:
            row = conn.execute(select(t).where(t.c.id == rid)).mappings().first()
        return self._run_row(row) if row else None

    def runs_list(self, *, kind: str | None, limit: int) -> list[dict[str, Any]]:
        t = self.t["runs"]
        stmt = select(t).order_by(t.c.started_at.desc()).limit(limit)
        if kind:
            stmt = stmt.where(t.c.kind == kind)
        with self.engine.begin() as conn:
            rows = conn.execute(stmt).mappings().all()
        return [self._run_row(r) for r in rows]

    def runs_last(self, kind: str) -> dict[str, Any] | None:
        rows = self.runs_list(kind=kind, limit=1)
        return rows[0] if rows else None

    def runs_mark_interrupted(self, live_ids: set[str]) -> int:
        t = self.t["runs"]
        with self.engine.begin() as conn:
            rows = conn.execute(select(t.c.id).where(t.c.status == "running")).scalars().all()
            stale = [r for r in rows if r not in live_ids]
            if stale:
                conn.execute(update(t).where(t.c.id.in_(stale)).values(status="error", finished_at=now_iso(), summary=_dumps({"error": "interrupted"})))
        return len(stale)

    def runs_trim(self, keep_per_kind: int) -> None:
        t = self.t["runs"]
        with self.engine.begin() as conn:
            kinds = conn.execute(select(t.c.kind).distinct()).scalars().all()
            for kind in kinds:
                ids = conn.execute(select(t.c.id).where(t.c.kind == kind).order_by(t.c.started_at.desc()).offset(keep_per_kind)).scalars().all()
                if ids:
                    conn.execute(delete(self.t["check_results"]).where(self.t["check_results"].c.run_id.in_(list(ids))))
                    conn.execute(delete(t).where(t.c.id.in_(list(ids))))

    @staticmethod
    def _run_row(row: Any) -> dict[str, Any]:
        d = dict(row)
        d["summary"] = _loads(d.get("summary"))
        return d

    # --- check results -------------------------------------------------------------------

    def check_results_write(self, run_id: str, results: Sequence[dict[str, Any]]) -> None:
        with self.engine.begin() as conn:
            for r in results:
                conn.execute(insert(self.t["check_results"]).values(
                    run_id=run_id, check_id=r["id"], status=r["status"], count=r.get("count"),
                    samples=_dumps(r.get("samples", [])), hint=r.get("hint"), ms=r.get("ms")))

    def check_results_for(self, run_id: str) -> list[dict[str, Any]]:
        t = self.t["check_results"]
        with self.engine.begin() as conn:
            rows = conn.execute(select(t).where(t.c.run_id == run_id)).mappings().all()
        return [dict(r) | {"samples": _loads(r["samples"])} for r in rows]

    def check_last_status(self) -> dict[str, dict[str, Any]]:
        """Latest status per check id across runs."""
        runs = self.runs_list(kind="checks", limit=20)
        out: dict[str, dict[str, Any]] = {}
        for run in runs:
            for r in self.check_results_for(run["id"]):
                if r["check_id"] not in out:
                    out[r["check_id"]] = {"status": r["status"], "count": r["count"], "run_id": run["id"], "at": run["finished_at"] or run["started_at"]}
        return out

    # --- traffic snapshots ---------------------------------------------------------------

    def traffic_flush(self, at: str, rows: Sequence[dict[str, Any]]) -> None:
        if not rows:
            return
        with self.engine.begin() as conn:
            for r in rows:
                conn.execute(insert(self.t["traffic_snapshots"]).values(at=at, **r))

    def traffic_history(self, *, route: str | None, limit: int) -> list[dict[str, Any]]:
        t = self.t["traffic_snapshots"]
        stmt = select(t).order_by(t.c.at.desc()).limit(limit)
        if route:
            stmt = stmt.where(t.c.route == route)
        with self.engine.begin() as conn:
            rows = conn.execute(stmt).mappings().all()
        return [dict(r) for r in rows]

    # --- collections ---------------------------------------------------------------------

    def collections_list(self) -> list[dict[str, Any]]:
        t = self.t["api_collections"]
        with self.engine.begin() as conn:
            rows = conn.execute(select(t).order_by(t.c.name)).mappings().all()
        return [dict(r) | {"requests": _loads(r["requests"])} for r in rows]

    def collection_upsert(self, *, name: str, requests: list[dict[str, Any]], cid: str | None = None) -> dict[str, Any]:
        t = self.t["api_collections"]
        with self.engine.begin() as conn:
            existing = conn.execute(select(t.c.id).where((t.c.id == cid) if cid else (t.c.name == name))).scalar_one_or_none()
            values = {"name": name, "requests": _dumps(requests), "updated_at": now_iso()}
            if existing:
                conn.execute(update(t).where(t.c.id == existing).values(**values))
                cid = existing
            else:
                cid = new_id()
                conn.execute(insert(t).values(id=cid, **values))
        return {"id": cid, "name": name, "requests": requests, "updated_at": values["updated_at"]}

    def collection_delete(self, cid: str) -> bool:
        with self.engine.begin() as conn:
            result = conn.execute(delete(self.t["api_collections"]).where(self.t["api_collections"].c.id == cid))
        return bool(result.rowcount)

    # --- retention -----------------------------------------------------------------------

    def sweep(self, *, activity_days: int, runs_per_kind: int) -> dict[str, int]:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=activity_days)).isoformat()
        with self.engine.begin() as conn:
            a = conn.execute(delete(self.t["activity_log"]).where(self.t["activity_log"].c.at < cutoff)).rowcount
            s = conn.execute(delete(self.t["traffic_snapshots"]).where(self.t["traffic_snapshots"].c.at < cutoff)).rowcount
        expired = self.changesets_expire()
        self.runs_trim(runs_per_kind)
        return {"activity_deleted": int(a or 0), "snapshots_deleted": int(s or 0), "changesets_expired": expired, "at": int(time.time())}
