"""ConsoleConfig: everything the host tells the console at mount time."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Literal, Sequence

from fastapi.routing import APIRoute
from pydantic_settings import BaseSettings
from sqlalchemy import Engine, MetaData
from sqlalchemy.orm import Session

from opsconsole.protocols import (
    AuthPolicy,
    BackupProvider,
    Check,
    LogSource,
    Probe,
    RouteMeta,
    TestRunner,
    TileProvider,
    UserDirectory,
)


class WritePolicy(str, Enum):
    DISABLED = "disabled"
    CHANGESETS = "changesets"
    CHANGESETS_AND_SQL = "changesets_and_sql"


@dataclass
class Limits:
    rows: int = 200                 # default page size
    max_rows: int = 500             # hard cap for any row listing / query result
    export_rows: int = 100_000
    bulk_rows: int = 10_000
    query_seconds: int = 30
    result_bytes: int = 5 * 1024 * 1024
    response_body_bytes: int = 256 * 1024     # API playground response capture
    exact_count_rows: int = 50_000            # above this estimate, counts are estimated
    offset_max: int = 50_000
    log_lines: int = 2_000
    traffic_entries: int = 2_000
    output_lines: int = 2_000                 # supervisor ring buffer
    activity_days: int = 90
    query_history_rows: int = 500
    runs_per_kind: int = 50
    changeset_ttl_seconds: int = 30 * 60
    apply_timeout_seconds: int = 120
    sse_queue: int = 500
    secret_pattern: str = r"(key|token|password|secret|credential)"

    def is_secret(self, name: str) -> bool:
        return re.search(self.secret_pattern, name, re.IGNORECASE) is not None


@dataclass
class TablePolicy:
    hidden: frozenset[str] = frozenset()
    readonly: frozenset[str] = frozenset()
    masked_columns: frozenset[str] = frozenset()      # "table.column"
    volatile_columns: frozenset[str] = frozenset()    # "table.column" ignored by the optimistic guard

    def is_hidden(self, table: str) -> bool:
        return table in self.hidden

    def is_readonly(self, table: str) -> bool:
        return table in self.readonly

    def is_masked(self, table: str, column: str) -> bool:
        return f"{table}.{column}" in self.masked_columns

    def is_volatile(self, table: str, column: str) -> bool:
        return f"{table}.{column}" in self.volatile_columns


@dataclass(kw_only=True)
class ConsoleConfig:
    # required
    metadata: MetaData
    engine: Engine
    session_factory: Callable[[], Session]
    auth: AuthPolicy
    console_dir: Path

    # optional capabilities (absent => section not mounted)
    settings: BaseSettings | None = None
    env_file: Path | None = None
    env_example_file: Path | None = None
    alembic_ini: Path | None = None
    alembic_script_location: Path | None = None
    tests: TestRunner | None = None
    log_sources: Sequence[LogSource] = ()
    users: UserDirectory | None = None
    backups: Sequence[BackupProvider] = ()
    checks: Sequence[Check] = ()
    tiles: Sequence[TileProvider] = ()
    request_hook: bool = True
    api_probe_suite: Sequence[Probe] = ()
    mutable_flags: Sequence[str] = ()          # settings fields that may be changed at runtime through the console

    # behaviour
    writes: WritePolicy = WritePolicy.DISABLED
    table_policy: TablePolicy = field(default_factory=TablePolicy)
    limits: Limits = field(default_factory=Limits)
    store: Literal["sqlite", "host"] = "sqlite"
    route_prefix: str = "/api/console"
    ui_path: str | None = "/console"
    app_name: str = "Application"
    app_version: str = ""
    database_label: str = ""                  # shown in the top bar (e.g. a redacted URL); the console never prints the raw URL
    domain_of_table: Callable[[str], str] | None = None
    table_docs: Callable[[str], str | None] | None = None
    describe_route: Callable[[APIRoute], RouteMeta] | None = None
    links: dict[str, str] = field(default_factory=dict)   # extra links for the overview (docs, adminer, ...)
    frame_ancestors: Sequence[str] = ()            # origins allowed to embed the UI in an iframe (e.g. the app's frontend)
    ignore_tables: frozenset[str] = frozenset({"alembic_version"})

    def validate(self) -> None:
        if not self.route_prefix.startswith("/"):
            raise ValueError("route_prefix must start with '/'")
        if self.ui_path is not None and not self.ui_path.startswith("/"):
            raise ValueError("ui_path must start with '/'")
        if self.store not in ("sqlite", "host"):
            raise ValueError("store must be 'sqlite' or 'host'")
        seen: set[str] = set()
        for check in self.checks:
            if check.id in seen:
                raise ValueError(f"duplicate check id {check.id!r}")
            seen.add(check.id)
        kinds = [b.kind for b in self.backups]
        if len(kinds) != len(set(kinds)):
            raise ValueError("backup providers must have distinct kinds")

    def as_manifest_dict(self) -> dict[str, Any]:
        return {
            "writes": self.writes.value,
            "store": self.store,
            "limits": {k: v for k, v in vars(self.limits).items() if not k.startswith("_") and k != "secret_pattern"},
        }
