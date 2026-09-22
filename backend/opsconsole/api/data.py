"""Data section: browse, row detail, export, change-sets, bulk."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from opsconsole.config import WritePolicy
from opsconsole.context import ConsoleContext, ConsoleError
from opsconsole.core import changesets
from opsconsole.core.paging import (
    browse,
    count,
    export_rows,
    get_row,
    parse_filters,
    parse_pk,
    related_counts,
)


class ChangeSetIn(BaseModel):
    table: str = Field(max_length=255)
    ops: list[dict[str, Any]] = Field(min_length=1, max_length=10_000)


class ApplyIn(BaseModel):
    confirm: str = Field(max_length=64)


class BulkIn(BaseModel):
    op: str = Field(pattern="^(update|delete)$")
    set: dict[str, Any] | None = None
    pks: list[dict[str, Any]] | None = Field(default=None, max_length=10_000)
    filters: dict[str, str] | None = None     # {"column": "op:value"}
    q: str | None = Field(default=None, max_length=200)


def router(ctx: ConsoleContext) -> APIRouter:
    r = APIRouter()
    limits = ctx.config.limits
    policy = ctx.config.table_policy

    def _table(name: str) -> Any:
        try:
            return ctx.introspector.table(name)
        except LookupError as exc:
            raise ConsoleError(404, "unknown_table", str(exc)) from exc

    @r.get("/data/tables", response_model=None)
    def tables(request: Request) -> Any:
        ctx.read(request)
        with ctx.config.engine.connect() as conn:
            items = [ctx.introspector.table_summary(conn, t) for t in ctx.introspector.model_tables()]
        drift = ctx.introspector.drift()
        return {"items": items, "extra_tables": drift["extra_tables"], "domains": sorted({i["domain"] for i in items if i["domain"]})}

    @r.get("/data/tables/{name}", response_model=None)
    def table_detail(request: Request, name: str) -> Any:
        ctx.read(request)
        return ctx.introspector.table_detail(_table(name))

    @r.get("/data/tables/{name}/rows", response_model=None)
    def rows(request: Request, name: str, limit: int = Query(default=None, ge=1, le=10_000), cursor: str | None = Query(default=None, max_length=2000),
             offset: int = Query(0, ge=0), sort: str | None = Query(default=None, max_length=128), order: str = Query("desc", pattern="^(asc|desc)$"),
             q: str | None = Query(default=None, max_length=200), with_count: bool = Query(True)) -> Any:
        ctx.read(request)
        table = _table(name)
        filters = parse_filters(list(request.query_params.multi_items()))
        try:
            with ctx.config.engine.connect() as conn:
                page = browse(conn, table, policy=policy, limits=limits, filters=filters, q=q, sort=sort, order=order,
                              limit=limit or limits.rows, cursor=cursor, offset=offset)
                total = None
                estimated = False
                if with_count:
                    if filters or q:
                        total = count(conn, table, policy=policy, filters=filters, q=q)
                    else:
                        total, estimated = ctx.introspector.row_count(conn, table)
        except ValueError as exc:
            raise ConsoleError(400, "bad_request", str(exc)) from exc
        return {"table": name, **page, "total": total, "estimated": estimated, "filters": [{"column": c, "op": o, "value": v} for c, o, v in filters], "q": q}

    @r.get("/data/tables/{name}/rows/{pk}", response_model=None)
    def row(request: Request, name: str, pk: str) -> Any:
        ctx.read(request)
        table = _table(name)
        try:
            pk_values = parse_pk(table, pk)
            with ctx.config.engine.connect() as conn:
                found = get_row(conn, table, pk_values, policy=policy)
                if found is None:
                    raise ConsoleError(404, "row_not_found", "no such row")
                related = related_counts(conn, table, {**found, **pk_values}, ctx.introspector.model_tables())
        except ValueError as exc:
            raise ConsoleError(400, "bad_pk", str(exc)) from exc
        refs = {c.name: [{"table": fk.column.table.name, "column": fk.column.name} for fk in c.foreign_keys] for c in table.columns if c.foreign_keys}
        return {"table": name, "pk": pk_values, "row": found, "related": related, "references": refs}

    @r.get("/data/tables/{name}/export", response_model=None)
    def export(request: Request, name: str, fmt: str = Query("csv", pattern="^(csv|json)$"), q: str | None = Query(default=None, max_length=200)) -> Any:
        principal = ctx.read(request)
        table = _table(name)
        filters = parse_filters(list(request.query_params.multi_items()))
        ctx.audit(principal, request, section="data", action="export", target_table=name, note=f"{fmt} filters={len(filters)} q={bool(q)}")

        def body() -> Any:
            with ctx.config.engine.connect() as conn:
                try:
                    yield from export_rows(conn, table, policy=policy, filters=filters, q=q, fmt=fmt, max_rows=limits.export_rows)
                except ValueError as exc:
                    yield f"\n# error: {exc}\n"

        media = "text/csv" if fmt == "csv" else "application/json"
        return StreamingResponse(body(), media_type=media, headers={"Content-Disposition": f'attachment; filename="{name}.{fmt}"'})

    # --- writes ---------------------------------------------------------------------------

    @r.post("/data/changesets", response_model=None)
    def create_changeset(request: Request, body: ChangeSetIn) -> Any:
        principal = ctx.write(request)
        return changesets.preview(ctx, table_name=body.table, ops=body.ops, principal=principal)

    @r.get("/data/changesets", response_model=None)
    def list_changesets(request: Request, status: str | None = Query(default=None, max_length=16), limit: int = Query(50, ge=1, le=500)) -> Any:
        ctx.read(request)
        return {"items": ctx.store.changesets_list(status=status, limit=limit)}

    @r.get("/data/changesets/{cid}", response_model=None)
    def get_changeset(request: Request, cid: str) -> Any:
        ctx.read(request)
        row = ctx.store.changeset_get(cid)
        if row is None:
            raise ConsoleError(404, "unknown_changeset", "no such change-set")
        return row

    @r.post("/data/changesets/{cid}/apply", response_model=None)
    def apply_changeset(request: Request, cid: str, body: ApplyIn) -> Any:
        principal = ctx.write(request)
        ctx.confirm(body.confirm, cid)
        return changesets.apply(ctx, cid=cid, principal=principal, request=request)

    @r.post("/data/changesets/{cid}/discard", response_model=None)
    def discard_changeset(request: Request, cid: str) -> Any:
        ctx.write(request)
        return changesets.discard(ctx, cid=cid)

    @r.post("/data/tables/{name}/bulk", response_model=None)
    def bulk(request: Request, name: str, body: BulkIn = Body(...)) -> Any:
        principal = ctx.write(request, need=WritePolicy.CHANGESETS)
        filters = parse_filters([(f"filter[{k}]", v) for k, v in (body.filters or {}).items()])
        return changesets.bulk(ctx, table_name=name, op=body.op, values=body.set, pks=body.pks, filters=filters, q=body.q, principal=principal)

    return r
