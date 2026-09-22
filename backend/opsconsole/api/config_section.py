"""Config section: effective settings with provenance; runtime flags the host allows."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from opsconsole.context import ConsoleContext, ConsoleError
from opsconsole.core.configview import effective_config, set_flag


class FlagIn(BaseModel):
    value: Any
    confirm: str = Field(max_length=128)


def router(ctx: ConsoleContext) -> APIRouter:
    r = APIRouter()
    settings = ctx.config.settings
    assert settings is not None
    mutable = set(ctx.config.mutable_flags)

    @r.get("/config", response_model=None)
    def config(request: Request) -> Any:
        ctx.read(request)
        return effective_config(settings, env_file=ctx.config.env_file, example_file=ctx.config.env_example_file, limits=ctx.config.limits, mutable=mutable)

    @r.post("/config/flags/{name}", response_model=None)
    def flag(request: Request, name: str, body: FlagIn) -> Any:
        principal = ctx.write(request)
        ctx.confirm(body.confirm, name)
        try:
            result = set_flag(settings, name, body.value, mutable=mutable)
        except PermissionError as exc:
            raise ConsoleError(403, "not_mutable", str(exc)) from exc
        except (KeyError, ValueError, TypeError) as exc:
            raise ConsoleError(400, "bad_value", f"{exc.__class__.__name__}: {exc}") from exc
        ctx.audit(principal, request, section="config", action="flag.set", target_table=None, target_pk={"name": name}, before=result["before"], after=result["after"], note="runtime only; not persisted")
        ctx.bus.publish("config", {"name": name, "value": result["after"]})
        return result

    return r
