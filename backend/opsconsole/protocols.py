"""The adapter contract between a host application and the console.

Every host-specific capability is one of these Protocols or dataclasses. The
console calls them; it never imports the host. A host implements only the
ones it wants -- a section whose adapter is absent is simply not mounted.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import (
    Any,
    Callable,
    Iterator,
    List,
    Literal,
    Mapping,
    Protocol,
    Sequence,
    runtime_checkable,
)

from fastapi import Request
from sqlalchemy.orm import Session

State = Literal["ok", "warn", "fail", "error"]
Severity = Literal["info", "warn", "fail"]


# --- identity ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Principal:
    """Who is acting. `is_local` is true for loopback callers; `roles` is whatever
    the host's authorization model calls them (e.g. ("admin",))."""

    id: str
    label: str
    roles: tuple[str, ...] = ()
    is_local: bool = False


class AuthPolicy(Protocol):
    """The host's security boundary. Return a Principal to allow, None to refuse."""

    def allow_read(self, request: Request) -> Principal | None: ...

    def allow_write(self, request: Request) -> Principal | None: ...


@runtime_checkable
class ActAsPolicy(Protocol):
    """Optional: headers that make an API playground request run as `subject`.
    The console never sees a credential -- the host derives the headers."""

    def act_as(self, request: Request, subject: str) -> Mapping[str, str] | None: ...


# --- checks and tiles -------------------------------------------------------------------

@dataclass
class CheckResult:
    count: int = 0
    samples: list[Any] = field(default_factory=list)   # ids, "table.column" strings, or (table, pk) tuples
    hint: str = ""
    table: str | None = None
    severity: Severity | None = None                     # overrides the Check's declared severity for this run


@dataclass(frozen=True)
class Check:
    id: str
    title: str
    run: Callable[[Session], CheckResult]
    severity: Severity = "fail"
    section: str = "data"
    hint: str = ""


@dataclass
class Tile:
    state: State
    headline: str
    details: dict[str, Any] = field(default_factory=dict)
    section: str | None = None


@dataclass(frozen=True)
class TileProvider:
    id: str
    title: str
    run: Callable[[Session], Tile]
    section: str = "overview"
    refresh_seconds: int = 30


# --- background tasks -------------------------------------------------------------------

class RunHandle(Protocol):
    """Handed to adapters that produce streamed output (tests, backups, migrations)."""

    @property
    def id(self) -> str: ...

    @property
    def cancelled(self) -> bool: ...

    def log(self, line: str) -> None: ...


@dataclass(frozen=True)
class TestNode:
    id: str                 # e.g. "tests/test_x.py::TestY::test_z"
    kind: Literal["file", "class", "test"]
    parent: str | None = None
    title: str = ""


@dataclass
class TestSummary:
    passed: int = 0
    failed: int = 0
    errors: int = 0
    skipped: int = 0
    line: str | None = None
    failed_ids: list[str] = field(default_factory=list)


class TestRunner(Protocol):
    def collect(self) -> list[TestNode]: ...

    def run(self, selection: str | None, handle: RunHandle) -> int:
        """Run tests, streaming lines through `handle.log`; return the exit code.
        Must return promptly after `handle.cancelled` becomes true."""
        ...

    def parse_summary(self, lines: Sequence[str]) -> TestSummary: ...


# --- logs -------------------------------------------------------------------------------

@dataclass
class LogLine:
    ts: str
    level: str
    message: str
    logger: str | None = None
    request_id: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)
    raw: str | None = None


@dataclass(frozen=True)
class LogFilter:
    level: str | None = None
    request_id: str | None = None
    logger: str | None = None
    contains: str | None = None
    since: str | None = None


class LogSource(Protocol):
    @property
    def id(self) -> str: ...

    @property
    def title(self) -> str: ...

    def available(self) -> tuple[bool, str | None]: ...

    def tail(self, *, limit: int, filters: LogFilter) -> list[LogLine]: ...

    def follow(self, *, from_end: bool = True) -> Iterator[LogLine | None]:
        """Blocking generator run on a console thread. Yield None when there is
        nothing new (so the console can check for shutdown) and LogLines as they
        arrive."""
        ...


# --- users and roles --------------------------------------------------------------------

@dataclass
class TokenRecord:
    id: str
    issued_at: str | None = None
    expires_at: str | None = None
    last_used_at: str | None = None
    revoked_at: str | None = None


@dataclass
class UserRecord:
    id: str
    label: str
    roles: list[str] = field(default_factory=list)
    disabled: bool = False
    last_seen_at: str | None = None
    tokens: list[TokenRecord] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class RoleRecord:
    name: str
    description: str = ""
    grants: list[str] = field(default_factory=list)


@dataclass
class IssuedToken:
    token_id: str
    plaintext: str
    expires_at: str | None = None


@runtime_checkable
class UserDirectory(Protocol):
    def list(self) -> list[UserRecord]: ...

    # List[...], not list[...]: this class's own `list` method above shadows the
    # builtin `list` name for every subsequent line in this class body (a Python
    # scoping quirk -- `def list(...)` binds `list` in the class namespace as
    # soon as it completes), which would otherwise break this annotation.
    def roles(self) -> List[RoleRecord]: ...

    def set_roles(self, user_id: str, roles: Sequence[str], *, actor: Principal) -> None: ...

    def set_disabled(self, user_id: str, disabled: bool, *, actor: Principal) -> None: ...

    def revoke_token(self, token_id: str, *, actor: Principal) -> None: ...


@runtime_checkable
class TokenIssuer(Protocol):
    def issue_token(self, user_id: str, *, actor: Principal, ttl_seconds: int) -> IssuedToken: ...


# --- backups ----------------------------------------------------------------------------

@dataclass
class BackupRecord:
    id: str
    created_at: str
    bytes: int
    kind: str
    label: str = ""
    verified: bool | None = None


@dataclass
class RestorePlan:
    backup_id: str
    summary: str
    will_replace: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class BackupProvider(Protocol):
    @property
    def kind(self) -> str: ...

    def list(self) -> list[BackupRecord]: ...

    def create(self, handle: RunHandle, *, selection: str | None) -> BackupRecord: ...

    def restore_plan(self, backup_id: str) -> RestorePlan: ...

    def restore(self, backup_id: str, handle: RunHandle) -> None: ...

    def path_for_download(self, backup_id: str) -> str | None: ...


# --- API playground ---------------------------------------------------------------------

@dataclass(frozen=True)
class Probe:
    method: str
    path: str
    expect: tuple[int, ...] = (200,)
    title: str = ""


@dataclass(frozen=True)
class RouteMeta:
    auth: str = ""          # free text shown next to the route ("local only", "admin", "token")
    roles: tuple[str, ...] = ()
    notes: str = ""
