"""GET /manifest: what this console can do, so the UI renders only what exists."""

from __future__ import annotations

from typing import Any

from opsconsole.config import WritePolicy
from opsconsole.context import ConsoleContext
from opsconsole.protocols import Principal, TokenIssuer
from opsconsole.version import __version__ as package_version


def sections(ctx: ConsoleContext) -> list[dict[str, Any]]:
    c = ctx.config
    writes = c.writes != WritePolicy.DISABLED
    out: list[dict[str, Any]] = [
        {"id": "overview", "title": "Overview", "capabilities": ["health", "server", "events"]},
        {"id": "data", "title": "Data", "capabilities": ["browse", "export"] + (["changesets", "bulk"] if writes else [])},
        {"id": "schema", "title": "Schema", "capabilities": ["map", "dictionary"] + (["migrations"] if c.alembic_ini else []) + (["migrations.upgrade"] if c.alembic_ini and writes else [])},
        {"id": "query", "title": "Query", "capabilities": ["read", "explain", "saved", "history"] + (["write"] if c.writes == WritePolicy.CHANGESETS_AND_SQL else [])},
        {"id": "api", "title": "API", "capabilities": ["routes", "send", "collections"] + (["traffic"] if c.request_hook else []) + (["probes"])},
    ]
    if c.users is not None:
        caps = ["list", "roles", "set_roles", "disable", "revoke"]
        if isinstance(c.users, TokenIssuer) or hasattr(c.users, "issue_token"):
            caps.append("issue_token")
        out.append({"id": "users", "title": "Users & Roles", "capabilities": caps})
    if c.backups:
        out.append({"id": "backups", "title": "Backups", "capabilities": ["list", "create", "restore", "download"], "kinds": [b.kind for b in c.backups]})
    if c.tests is not None:
        out.append({"id": "tests", "title": "Tests", "capabilities": ["tree", "run", "history", "cancel", "rerun_failed"]})
    if c.log_sources:
        out.append({"id": "logs", "title": "Logs", "capabilities": ["tail", "follow"], "sources": [s.id for s in c.log_sources] + ["activity"]})
    out.append({"id": "checks", "title": "Checks", "capabilities": ["registry", "run", "history"]})
    if c.settings is not None:
        out.append({"id": "config", "title": "Config", "capabilities": ["effective"] + (["flags"] if c.mutable_flags and writes else [])})
    out.append({"id": "activity", "title": "Activity", "capabilities": ["list"] + (["undo"] if writes else [])})
    return out


def build_manifest(ctx: ConsoleContext, principal: Principal, *, can_write: bool) -> dict[str, Any]:
    c = ctx.config
    return {
        "app_name": c.app_name, "app_version": c.app_version, "console_version": package_version, "database_label": c.database_label,
        "principal": {"id": principal.id, "label": principal.label, "roles": list(principal.roles), "is_local": principal.is_local,
                      "can_write": can_write},
        "sections": sections(ctx), "prefix": c.route_prefix, "ui_path": c.ui_path, "sse": True, "links": c.links,
        **c.as_manifest_dict(),
    }
