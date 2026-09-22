"""Users & Roles section over the host's UserDirectory."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from opsconsole.context import ConsoleContext, ConsoleError


class RolesIn(BaseModel):
    roles: list[str] = Field(max_length=50)
    confirm: str = Field(max_length=255)


class DisabledIn(BaseModel):
    disabled: bool
    confirm: str = Field(max_length=255)


class ConfirmIn(BaseModel):
    confirm: str = Field(max_length=255)


class IssueIn(ConfirmIn):
    ttl_seconds: int = Field(default=30 * 24 * 3600, ge=60, le=365 * 24 * 3600)


def router(ctx: ConsoleContext) -> APIRouter:
    r = APIRouter()
    users = ctx.config.users
    assert users is not None

    def _call(fn: Any, *args: Any, **kwargs: Any) -> Any:
        try:
            return fn(*args, **kwargs)
        except LookupError as exc:
            raise ConsoleError(404, "unknown_user", str(exc)) from exc
        except (ValueError, PermissionError) as exc:
            raise ConsoleError(400, "refused", str(exc)) from exc

    @r.get("/users", response_model=None)
    def list_users(request: Request) -> Any:
        ctx.read(request)
        return {"items": [asdict(u) for u in users.list()]}

    @r.get("/users/roles", response_model=None)
    def roles(request: Request) -> Any:
        ctx.read(request)
        return {"items": [asdict(x) for x in users.roles()]}

    @r.post("/users/{uid}/roles", response_model=None)
    def set_roles(request: Request, uid: str, body: RolesIn) -> Any:
        principal = ctx.write(request)
        ctx.confirm(body.confirm, uid)
        before = next((asdict(u) for u in users.list() if u.id == uid), None)
        _call(users.set_roles, uid, body.roles, actor=principal)
        ctx.audit(principal, request, section="users", action="roles.set", target_pk={"user": uid}, before=(before or {}).get("roles"), after=body.roles)
        return {"user": uid, "roles": body.roles}

    @r.post("/users/{uid}/disabled", response_model=None)
    def set_disabled(request: Request, uid: str, body: DisabledIn) -> Any:
        principal = ctx.write(request)
        ctx.confirm(body.confirm, uid)
        _call(users.set_disabled, uid, body.disabled, actor=principal)
        ctx.audit(principal, request, section="users", action="user.disable" if body.disabled else "user.enable", target_pk={"user": uid})
        return {"user": uid, "disabled": body.disabled}

    @r.post("/users/tokens/{tid}/revoke", response_model=None)
    def revoke(request: Request, tid: str, body: ConfirmIn) -> Any:
        principal = ctx.write(request)
        ctx.confirm(body.confirm, tid)
        _call(users.revoke_token, tid, actor=principal)
        ctx.audit(principal, request, section="users", action="token.revoke", target_pk={"token": tid})
        return {"token": tid, "revoked": True}

    if hasattr(users, "issue_token"):

        @r.post("/users/{uid}/tokens", response_model=None)
        def issue(request: Request, uid: str, body: IssueIn) -> Any:
            principal = ctx.write(request)
            ctx.confirm(body.confirm, uid)
            issued = _call(getattr(users, "issue_token"), uid, actor=principal, ttl_seconds=body.ttl_seconds)
            ctx.audit(principal, request, section="users", action="token.issue", target_pk={"user": uid, "token": issued.token_id})
            return {"user": uid, "token_id": issued.token_id, "plaintext": issued.plaintext, "expires_at": issued.expires_at, "note": "shown once; the console does not store it"}

    return r
