"""Change-sets: every row mutation through the console is previewed (before /
after / warnings), confirmed by id, applied under an optimistic guard in one
transaction, audited row by row (two-phase, so audit and data never
disagree), and undoable from the activity log."""

from __future__ import annotations

from typing import Any, Mapping, Sequence

from fastapi import Request
from sqlalchemy import Table, delete, insert, select, update
from sqlalchemy.engine import Connection

from opsconsole.context import ConsoleContext, ConsoleError
from opsconsole.core.ids import now_iso
from opsconsole.core.introspect import coerce_value, json_safe
from opsconsole.core.paging import apply_filters, pk_condition, raw_row, row_dict
from opsconsole.protocols import Principal

OPS = {"insert", "update", "delete"}


def _table_for_write(ctx: ConsoleContext, name: str) -> Table:
    try:
        table = ctx.introspector.table(name)
    except LookupError as exc:
        raise ConsoleError(404, "unknown_table", str(exc)) from exc
    if ctx.config.table_policy.is_readonly(name):
        raise ConsoleError(403, "readonly_table", f"{name} is read-only by policy")
    if not list(table.primary_key.columns):
        raise ConsoleError(400, "no_primary_key", f"{name} has no primary key and cannot be edited")
    return table


def _coerce_set(table: Table, values: Mapping[str, Any], *, ctx: ConsoleContext) -> tuple[dict[str, Any], list[str]]:
    out: dict[str, Any] = {}
    warnings: list[str] = []
    for name, raw in values.items():
        if name not in table.c:
            raise ConsoleError(400, "unknown_column", f"{table.name} has no column {name!r}")
        if ctx.config.table_policy.is_masked(table.name, name):
            raise ConsoleError(403, "masked_column", f"{table.name}.{name} is masked and cannot be edited")
        try:
            out[name] = coerce_value(table.c[name], raw)
        except ValueError as exc:
            raise ConsoleError(400, "bad_value", str(exc)) from exc
    return out, warnings


def _fk_warnings(conn: Connection, table: Table, values: Mapping[str, Any]) -> list[str]:
    warnings: list[str] = []
    for name, value in values.items():
        if value is None:
            continue
        for fk in table.c[name].foreign_keys:
            target = fk.column
            exists = conn.execute(select(target).where(target == value).limit(1)).first()
            if exists is None:
                warnings.append(f"{name}={value!r}: no {target.table.name}.{target.name} row with that value")
    return warnings


def _pk_of(table: Table, row: Mapping[Any, Any]) -> dict[str, Any]:
    return {c.name: json_safe(row[c.name]) for c in table.primary_key.columns}


def preview(ctx: ConsoleContext, *, table_name: str, ops: Sequence[Mapping[str, Any]], principal: Principal, origin: str = "inline") -> dict[str, Any]:
    table = _table_for_write(ctx, table_name)
    if not ops:
        raise ConsoleError(400, "empty", "no operations")
    if len(ops) > ctx.config.limits.bulk_rows:
        raise ConsoleError(400, "too_many", f"at most {ctx.config.limits.bulk_rows} operations per change-set")
    policy = ctx.config.table_policy
    prepared: list[dict[str, Any]] = []
    with ctx.config.engine.connect() as conn:
        for op in ops:
            kind = str(op.get("op", ""))
            if kind not in OPS:
                raise ConsoleError(400, "bad_op", f"op must be one of {sorted(OPS)}")
            values, warnings = _coerce_set(table, dict(op.get("set") or {}), ctx=ctx)
            entry: dict[str, Any] = {"op": kind, "pk": None, "set": {k: json_safe(v) for k, v in values.items()}, "before": None, "after": None, "warnings": warnings, "error": None}
            if kind == "insert":
                missing = [c.name for c in table.columns if not c.nullable and c.default is None and c.server_default is None and not c.primary_key and c.name not in values]
                if missing:
                    entry["error"] = f"required column(s) missing: {missing}"
                entry["warnings"] += _fk_warnings(conn, table, values)
                entry["after"] = {c.name: json_safe(values.get(c.name)) for c in table.columns if c.name in values}
                entry["pk"] = {c.name: json_safe(values[c.name]) for c in table.primary_key.columns if c.name in values} or None
            else:
                try:
                    pk = dict(op.get("pk") or {})
                    before = raw_row(conn, table, pk)
                except ValueError as exc:
                    raise ConsoleError(400, "bad_pk", str(exc)) from exc
                entry["pk"] = pk
                if before is None:
                    entry["error"] = "row not found"
                else:
                    entry["before"] = row_dict(table, before, policy)
                    if kind == "update":
                        if not values:
                            entry["error"] = "nothing to change"
                        entry["warnings"] += _fk_warnings(conn, table, values)
                        merged = dict(before)
                        merged.update(values)
                        entry["after"] = row_dict(table, merged, policy)
                        entry["changed"] = [k for k in values if json_safe(values[k]) != json_safe(before.get(k))]
            prepared.append(entry)
    errors = sum(1 for p in prepared if p["error"])
    row = ctx.store.changeset_create(principal_id=principal.id, table=table.name, ops=prepared, origin=origin, ttl_seconds=ctx.config.limits.changeset_ttl_seconds)
    row["errors"] = errors
    row["warnings"] = sum(len(p["warnings"]) for p in prepared)
    ctx.bus.publish("changesets", {"id": row["id"], "status": "pending", "table": table.name, "ops": len(prepared)})
    return row


def _guard_differs(table: Table, before: Mapping[str, Any], current: Mapping[str, Any], ctx: ConsoleContext) -> list[str]:
    diff: list[str] = []
    for c in table.columns:
        if ctx.config.table_policy.is_volatile(table.name, c.name) or ctx.config.table_policy.is_masked(table.name, c.name):
            continue
        if json_safe(before.get(c.name)) != json_safe(current.get(c.name)):
            diff.append(c.name)
    return diff


def apply(ctx: ConsoleContext, *, cid: str, principal: Principal, request: Request | None) -> dict[str, Any]:
    row = ctx.store.changeset_get(cid)
    if row is None:
        raise ConsoleError(404, "unknown_changeset", "no such change-set")
    if row["status"] == "applied":
        raise ConsoleError(409, "already_applied", "this change-set was already applied")
    if row["status"] != "pending":
        raise ConsoleError(409, "not_pending", f"change-set is {row['status']}")
    if any(op.get("error") for op in row["ops"]):
        raise ConsoleError(400, "has_errors", "fix or remove the operations marked with an error, then preview again")
    table = _table_for_write(ctx, row["target_table"])
    if not ctx.store.changeset_claim(cid):
        raise ConsoleError(409, "not_pending", "change-set is no longer pending")
    policy = ctx.config.table_policy
    # Phase 1 of the audit: pending activity rows before any data changes.
    planned = [{
        "principal_id": principal.id, "principal_label": principal.label,
        "request_id": getattr(request.state, "request_id", None) if request is not None else None,
        "section": "data", "action": f"row.{op['op']}", "target_table": table.name, "target_pk": op.get("pk"),
        "before": op.get("before"), "after": op.get("after"), "changeset_id": cid, "state": "pending",
    } for op in row["ops"]]
    activity_ids = ctx.store.activity_write(planned)
    applied: list[dict[str, Any]] = []
    try:
        with ctx.config.engine.begin() as conn:
            for op, act_id in zip(row["ops"], activity_ids):
                kind = op["op"]
                values, _ = _coerce_set(table, dict(op.get("set") or {}), ctx=ctx)
                if kind == "insert":
                    conn.execute(insert(table).values(**values))
                    after = raw_row(conn, table, op["pk"]) if op.get("pk") else None
                    applied.append({"op": kind, "pk": op.get("pk"), "after": row_dict(table, after, policy) if after else op.get("after")})
                    continue
                current = raw_row(conn, table, op["pk"])
                if current is None:
                    raise ConsoleError(409, "changed_underneath", f"row {op['pk']} no longer exists")
                before_now = row_dict(table, current, policy)
                diff = _guard_differs(table, op.get("before") or {}, before_now, ctx)
                if diff:
                    raise ConsoleError(409, "changed_underneath", f"row {op['pk']} changed since preview in column(s) {diff}; preview again")
                if kind == "update":
                    conn.execute(update(table).where(pk_condition(table, op["pk"])).values(**values))
                    after = raw_row(conn, table, {**op["pk"], **{k: values[k] for k in values if k in op["pk"]}})
                    applied.append({"op": kind, "pk": op["pk"], "after": row_dict(table, after, policy) if after else None})
                else:
                    conn.execute(delete(table).where(pk_condition(table, op["pk"])))
                    applied.append({"op": kind, "pk": op["pk"], "after": None})
    except ConsoleError as exc:
        ctx.store.activity_set_state(activity_ids, "failed")
        ctx.store.changeset_update(cid, status="rejected", error=str(exc.detail))
        ctx.bus.publish("changesets", {"id": cid, "status": "rejected"})
        raise
    except Exception as exc:
        ctx.store.activity_set_state(activity_ids, "failed")
        message = f"{exc.__class__.__name__}: {str(exc).splitlines()[0][:500]}"
        ctx.store.changeset_update(cid, status="rejected", error=message)
        ctx.bus.publish("changesets", {"id": cid, "status": "rejected"})
        raise ConsoleError(409, "database_error", message) from exc
    ctx.store.activity_set_state(activity_ids, "committed")
    ctx.store.changeset_update(cid, status="applied", applied_at=now_iso())
    ctx.introspector.invalidate_counts(table.name)
    ctx.bus.publish("changesets", {"id": cid, "status": "applied", "table": table.name})
    ctx.bus.publish("data", {"table": table.name, "changed": len(applied), "changeset_id": cid})
    return {"id": cid, "status": "applied", "applied": len(applied), "activity_ids": activity_ids, "results": applied}


def discard(ctx: ConsoleContext, *, cid: str) -> dict[str, Any]:
    row = ctx.store.changeset_get(cid)
    if row is None:
        raise ConsoleError(404, "unknown_changeset", "no such change-set")
    if row["status"] not in ("pending", "rejected", "expired"):
        raise ConsoleError(409, "not_pending", f"change-set is {row['status']}")
    ctx.store.changeset_update(cid, status="discarded")
    ctx.bus.publish("changesets", {"id": cid, "status": "discarded"})
    return {"id": cid, "status": "discarded"}


def undo(ctx: ConsoleContext, *, activity_id: str, principal: Principal) -> dict[str, Any]:
    act = ctx.store.activity_get(activity_id)
    if act is None:
        raise ConsoleError(404, "unknown_activity", "no such activity entry")
    if act.get("undone_by"):
        raise ConsoleError(409, "already_undone", "already undone")
    if act.get("state") != "committed" or not act.get("target_table"):
        raise ConsoleError(409, "not_undoable", "only committed row changes can be undone")
    table = _table_for_write(ctx, act["target_table"])
    action = act["action"]
    op: dict[str, Any]
    if action == "row.update" and act.get("before") and act.get("after"):
        changed = {k: v for k, v in act["before"].items() if act["after"].get(k) != v and not ctx.config.table_policy.is_masked(table.name, k)}
        op = {"op": "update", "pk": act["target_pk"], "set": changed}
    elif action == "row.delete" and act.get("before"):
        op = {"op": "insert", "set": {k: v for k, v in act["before"].items() if not ctx.config.table_policy.is_masked(table.name, k)}}
    elif action == "row.insert" and act.get("target_pk"):
        op = {"op": "delete", "pk": act["target_pk"]}
    else:
        raise ConsoleError(409, "not_undoable", f"{action} cannot be undone automatically")
    result = preview(ctx, table_name=table.name, ops=[op], principal=principal, origin="undo")
    result["undoes"] = activity_id
    return result


def bulk(ctx: ConsoleContext, *, table_name: str, op: str, values: Mapping[str, Any] | None, pks: Sequence[Mapping[str, Any]] | None,
         filters: Sequence[tuple[str, str, str]], q: str | None, principal: Principal) -> dict[str, Any]:
    if op not in ("update", "delete"):
        raise ConsoleError(400, "bad_op", "bulk op must be update or delete")
    table = _table_for_write(ctx, table_name)
    limit = ctx.config.limits.bulk_rows
    pk_cols = list(table.primary_key.columns)
    with ctx.config.engine.connect() as conn:
        if pks:
            rows = [dict(pk) for pk in pks]
        else:
            if not filters and not q:
                raise ConsoleError(400, "unbounded", "a bulk operation needs a selection: primary keys, filters or a search")
            try:
                stmt = apply_filters(select(*pk_cols), table, filters, q, ctx.config.table_policy).limit(limit + 1)
            except ValueError as exc:
                raise ConsoleError(400, "bad_filter", str(exc)) from exc
            fetched = conn.execute(stmt).mappings().all()
            if len(fetched) > limit:
                raise ConsoleError(400, "too_many", f"selection matches more than {limit} rows; narrow it")
            rows = [_pk_of(table, r) for r in fetched]
    ops = [{"op": op, "pk": pk, "set": dict(values or {})} for pk in rows]
    if not ops:
        raise ConsoleError(400, "empty", "selection matched no rows")
    return preview(ctx, table_name=table.name, ops=ops, principal=principal, origin="bulk")
