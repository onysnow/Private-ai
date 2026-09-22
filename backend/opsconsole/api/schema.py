"""Schema section: ER map, data dictionary, migrations."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from opsconsole.context import ConsoleContext
from opsconsole.core import migrations


class PlanIn(BaseModel):
    target: str = Field(default="head", max_length=64, pattern=r"^[A-Za-z0-9_\-+@:^~]+$")


class UpgradeIn(PlanIn):
    confirm: str = Field(max_length=64)


def router(ctx: ConsoleContext) -> APIRouter:
    r = APIRouter()
    intro = ctx.introspector

    @r.get("/schema/map", response_model=None)
    def schema_map(request: Request) -> Any:
        ctx.read(request)
        with ctx.config.engine.connect() as conn:
            tables = [intro.table_summary(conn, t) for t in intro.model_tables()]
        return {"tables": tables, "edges": intro.edges(), "drift": intro.drift(), "domains": sorted({t["domain"] for t in tables if t["domain"]})}

    @r.get("/schema/dictionary", response_model=None)
    def dictionary(request: Request) -> Any:
        ctx.read(request)
        return {"tables": [intro.table_detail(t) for t in intro.model_tables()], "unindexed_foreign_keys": intro.unindexed_foreign_keys()}

    if ctx.config.alembic_ini is not None:

        @r.get("/schema/migrations", response_model=None)
        def migration_state(request: Request) -> Any:
            ctx.read(request)
            return migrations.migration_state(ctx)

        @r.post("/schema/migrations/plan", response_model=None)
        def plan(request: Request, body: PlanIn) -> Any:
            ctx.read(request)
            return migrations.plan(ctx, body.target)

        @r.post("/schema/migrations/upgrade", response_model=None)
        def upgrade(request: Request, body: UpgradeIn) -> Any:
            principal = ctx.write(request)
            ctx.confirm(body.confirm, "upgrade")
            return migrations.upgrade(ctx, target=body.target, principal=principal)

    return r
