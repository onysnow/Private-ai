"""Alembic integration: where the database is relative to the migration
head, the history, an offline SQL plan, and a supervised upgrade."""

from __future__ import annotations

import io
from contextlib import redirect_stdout
from typing import Any

from sqlalchemy import inspect, text

from opsconsole.context import ConsoleContext, ConsoleError
from opsconsole.protocols import Principal

VERSION_TABLE = "alembic_version"


def _config(ctx: ConsoleContext) -> Any:
    from alembic.config import Config

    assert ctx.config.alembic_ini is not None
    cfg = Config(str(ctx.config.alembic_ini))
    if ctx.config.alembic_script_location is not None:
        cfg.set_main_option("script_location", str(ctx.config.alembic_script_location))
    url = ctx.config.engine.url.render_as_string(hide_password=False)
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    cfg.attributes["database_url_override"] = url
    return cfg


def migration_state(ctx: ConsoleContext) -> dict[str, Any] | None:
    if ctx.config.alembic_ini is None:
        return None
    try:
        from alembic.script import ScriptDirectory

        script = ScriptDirectory.from_config(_config(ctx))
        heads = list(script.get_heads())
        with ctx.config.engine.connect() as conn:
            current = None
            if VERSION_TABLE in inspect(conn).get_table_names():
                current = conn.execute(text(f"SELECT version_num FROM {VERSION_TABLE}")).scalar()
        history: list[dict[str, Any]] = []
        applied = current is not None
        behind = 0
        for rev in script.walk_revisions():
            entry = {"revision": rev.revision, "down_revision": rev.down_revision if isinstance(rev.down_revision, str) else list(rev.down_revision or []), "message": (rev.doc or "").splitlines()[0] if rev.doc else "", "applied": applied}
            history.append(entry)
            if rev.revision == current:
                applied = True
        for entry in history:
            if not entry["applied"]:
                behind += 1
        at_head = current in heads if current else False
        return {"current": current, "heads": heads, "at_head": at_head, "behind_by": 0 if at_head else behind, "history": history}
    except Exception as exc:
        return {"current": None, "heads": [], "at_head": False, "behind_by": None, "history": [], "error": f"{exc.__class__.__name__}: {str(exc)[:300]}"}


def plan(ctx: ConsoleContext, target: str) -> dict[str, Any]:
    if ctx.config.alembic_ini is None:
        raise ConsoleError(404, "not_configured", "Alembic is not configured for this host")
    from alembic import command

    state = migration_state(ctx) or {}
    start = state.get("current") or "base"
    buf = io.StringIO()
    try:
        with redirect_stdout(buf):
            command.upgrade(_config(ctx), f"{start}:{target}", sql=True)
    except Exception as exc:
        raise ConsoleError(400, "plan_failed", f"{exc.__class__.__name__}: {str(exc)[:500]}") from exc
    return {"from": start, "to": target, "sql": buf.getvalue()}


def upgrade(ctx: ConsoleContext, *, target: str, principal: Principal) -> dict[str, Any]:
    if ctx.config.alembic_ini is None:
        raise ConsoleError(404, "not_configured", "Alembic is not configured for this host")
    for kind in ("tests", "backup", "restore"):
        if ctx.supervisor.is_running(kind):
            raise ConsoleError(409, "busy", f"a {kind} run is in progress; wait for it before migrating")
    from alembic import command

    def fn(run: Any) -> tuple[str, dict[str, Any] | None, int | None]:
        before = migration_state(ctx) or {}
        run.log(f"alembic upgrade {target} (from {before.get('current')})")
        buf = io.StringIO()
        try:
            with redirect_stdout(buf):
                command.upgrade(_config(ctx), target)
        finally:
            for line in buf.getvalue().splitlines():
                run.log(line)
            ctx.introspector.invalidate()
        after = migration_state(ctx) or {}
        run.log(f"now at {after.get('current')} (head: {after.get('at_head')})")
        return ("passed" if after.get("at_head") or target != "head" else "failed"), {"from": before.get("current"), "to": after.get("current"), "at_head": after.get("at_head")}, 0

    result = ctx.supervisor.start("migration", fn, selection=target, principal_id=principal.id)
    ctx.audit(principal, None, section="schema", action="migration.upgrade", note=f"target={target}", run_id=result["id"])
    return result
