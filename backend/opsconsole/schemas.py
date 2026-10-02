"""Response models: what each console endpoint sends back.

The console is a package of its own (ADR-0003), so the shapes of its
replies live here, beside its routes, and never import the host. A host
that publishes an OpenAPI schema publishes these too, because the console's
routes are mounted on the host's app (the Journalism Workbench's
frontend/openapi.json lists every /api/console route). Every name starts
with "Console" so it cannot collide with a host model of the same name.

Where a reply carries the host's own data -- a table row, a tile's
details, a setting's value, a check's samples -- that part stays open
(`Any`), because only the host knows its shape; everything the console
builds itself is declared. FastAPI drops any field a response model does
not list, so each model is checked against its route's real reply
(backend/tests/test_opsconsole_response_models.py).
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ConsoleModel(BaseModel):
    # Read from dataclasses and mappings as well as dicts.
    model_config = ConfigDict(from_attributes=True)


def _absent_when_none(value: Any) -> bool:
    """A key the console adds only in some replies is left out, not sent as null."""
    return value is None


# --- errors ------------------------------------------------------------------------------

class ConsoleErrorDetailOut(ConsoleModel):
    code: str
    message: str
    request_id: str | None


class ConsoleErrorOut(ConsoleModel):
    """Every refusal the console makes itself (ConsoleError): a machine
    code, a sentence, and the request id to look the request up by. `detail`
    repeats the sentence for clients that read FastAPI's usual key."""
    error: ConsoleErrorDetailOut
    detail: str


class ConsoleRequestErrorOut(ConsoleModel):
    """A request refused before the console saw it, so in FastAPI's usual
    shape: a body that is not valid JSON (400, fastapi/routing.py), or one of
    the host's own checks in front of every route (its access checks answer
    403)."""
    detail: str


# The statuses the console refuses with (every ConsoleError(4xx) in the package),
# declared for all its routes (mount.py). A 400 or a 403 can also come from
# before the console (ConsoleRequestErrorOut). FastAPI adds its own 422 entry
# for input that does not match a route, unless the host declares one for every
# route.
CONSOLE_REFUSALS: dict[int | str, dict[str, Any]] = {
    400: {"model": ConsoleErrorOut | ConsoleRequestErrorOut,
          "description": "Refused: the request cannot be carried out as it is, or its body is not valid JSON"},
    403: {"model": ConsoleErrorOut | ConsoleRequestErrorOut,
          "description": "Not allowed: for this caller, with writes set as they are, or on this table or setting"},
    404: {"model": ConsoleErrorOut, "description": "Not found"},
    409: {"model": ConsoleErrorOut, "description": "In conflict with what is there now, or with a run in progress"},
}


# --- manifest, health, server ---------------------------------------------------------------

class ConsolePrincipalOut(ConsoleModel):
    id: str
    label: str
    roles: list[str]
    is_local: bool
    can_write: bool


class ConsoleSectionOut(ConsoleModel):
    """A section the UI may show and what it can do on this host. Backups
    name their provider kinds and logs their sources; other sections leave
    both keys out."""
    id: str
    title: str
    capabilities: list[str]
    kinds: list[str] | None = Field(default=None, exclude_if=_absent_when_none)
    sources: list[str] | None = Field(default=None, exclude_if=_absent_when_none)


class ConsoleLimitsOut(ConsoleModel):
    rows: int
    max_rows: int
    export_rows: int
    bulk_rows: int
    query_seconds: int
    result_bytes: int
    response_body_bytes: int
    exact_count_rows: int
    offset_max: int
    log_lines: int
    traffic_entries: int
    output_lines: int
    activity_days: int
    query_history_rows: int
    runs_per_kind: int
    changeset_ttl_seconds: int
    apply_timeout_seconds: int
    sse_queue: int


class ConsoleManifestOut(ConsoleModel):
    """What this console can do here, so the UI renders only what exists."""
    app_name: str
    app_version: str
    console_version: str
    database_label: str
    principal: ConsolePrincipalOut
    sections: list[ConsoleSectionOut]
    prefix: str
    ui_path: str | None
    sse: bool
    links: dict[str, str]
    writes: Literal["disabled", "changesets", "changesets_and_sql"]
    store: Literal["sqlite", "host"]
    limits: ConsoleLimitsOut


TileState = Literal["ok", "warn", "fail", "error"]


class ConsoleTileOut(ConsoleModel):
    """One health tile. `details` is the tile's own: a host tile puts what it likes there."""
    id: str
    title: str
    state: TileState
    headline: str
    details: dict[str, Any]
    section: str
    refresh_seconds: int
    ms: int


class ConsoleHealthOut(ConsoleModel):
    at: str
    overall: TileState
    tiles: list[ConsoleTileOut]


class ConsoleDiskUsageOut(ConsoleModel):
    path: str
    free_gb: float
    total_gb: float
    used_pct: float | None


class ConsoleDiskErrorOut(ConsoleModel):
    """A watched directory whose disk could not be read."""
    path: str
    error: str


class ConsoleServerMetricsOut(ConsoleModel):
    """The process and its machine. Numbers that need psutil are null without it."""
    uptime_seconds: int
    started_at: float
    pid: int
    python: str
    platform: str
    cpu_count: int | None
    load_average: list[float] | None
    cpu_percent: float | None
    rss_mb: float | None
    threads: int
    in_docker: bool
    disks: dict[str, ConsoleDiskUsageOut | ConsoleDiskErrorOut]
    psutil: bool


# --- data: tables, rows, change-sets -------------------------------------------------------------

class ConsoleTableSummaryOut(ConsoleModel):
    name: str
    domain: str
    live: bool
    rows: int
    estimated: bool
    columns: int
    primary_key: list[str]
    readonly: bool
    references: list[str]
    referenced_by: list[str]


class ConsoleTablesOut(ConsoleModel):
    items: list[ConsoleTableSummaryOut]
    extra_tables: list[str]
    domains: list[str]


class ConsoleColumnRefOut(ConsoleModel):
    table: str
    column: str


class ConsoleColumnOut(ConsoleModel):
    name: str
    type: str
    kind: str  # text | integer | number | boolean | datetime | date | json | enum | binary | other
    nullable: bool
    primary_key: bool
    indexed: bool
    # The model's default: a plain value, "(callable)", or a server default's SQL text.
    default: str | int | float | bool | None
    references: list[ConsoleColumnRefOut]
    masked: bool
    unique: bool
    enum: list[str] | None
    live: bool | None


class ConsoleIndexOut(ConsoleModel):
    name: str | None
    columns: list[str]
    unique: bool


class ConsoleUniqueConstraintOut(ConsoleModel):
    name: str | None
    columns: list[str]


class ConsoleColumnDriftOut(ConsoleModel):
    missing_in_db: list[str]
    extra_in_db: list[str]


class ConsoleOutboundRefOut(ConsoleModel):
    column: str
    table: str
    target_column: str


class ConsoleTableDetailOut(ConsoleModel):
    """One table: the model's columns and indexes next to the live database's."""
    name: str
    domain: str
    doc: str | None
    live: bool
    readonly: bool
    primary_key: list[str]
    columns: list[ConsoleColumnOut]
    indexes: list[ConsoleIndexOut]
    live_indexes: list[ConsoleIndexOut]
    unique_constraints: list[ConsoleUniqueConstraintOut]
    drift: ConsoleColumnDriftOut | None
    references: list[ConsoleOutboundRefOut]
    referenced_by: list[ConsoleColumnRefOut]


class ConsoleFilterOut(ConsoleModel):
    column: str
    op: str
    value: str


class ConsoleRowsOut(ConsoleModel):
    """One page of a table's rows. Each row is the host's own (column -> value;
    masked columns read "••••"). `next` is the cursor for the following page."""
    table: str
    items: list[dict[str, Any]]
    next: str | None
    sort: str
    order: Literal["asc", "desc"]
    keyset: bool
    limit: int
    total: int | None
    estimated: bool
    filters: list[ConsoleFilterOut]
    q: str | None


class ConsoleRelatedCountOut(ConsoleModel):
    table: str
    column: str
    count: int
    filter: str


class ConsoleRowOut(ConsoleModel):
    """One row, how many rows elsewhere point at it, and what its columns point at."""
    table: str
    pk: dict[str, Any]
    row: dict[str, Any]
    related: list[ConsoleRelatedCountOut]
    references: dict[str, list[ConsoleColumnRefOut]]


ChangeKind = Literal["insert", "update", "delete"]


class ConsoleChangeOpOut(ConsoleModel):
    """One operation of a change-set as previewed: the row before and after
    (the host's columns) and what to look at before applying. `changed`
    names the columns an update changes and is sent for updates only."""
    op: ChangeKind
    pk: dict[str, Any] | None
    set: dict[str, Any]
    before: dict[str, Any] | None
    after: dict[str, Any] | None
    warnings: list[str]
    error: str | None
    changed: list[str] | None = Field(default=None, exclude_if=_absent_when_none)


class ConsoleChangeSetOut(ConsoleModel):
    """A change-set as the console keeps it."""
    id: str
    created_at: str
    principal_id: str
    status: str  # pending | applying | applied | rejected | expired | discarded
    target_table: str
    ops: list[ConsoleChangeOpOut]
    origin: str  # inline | bulk | undo
    applied_at: str | None
    error: str | None
    expires_at: str
    # The activity entry this change-set reverses, for an undo.
    undoes: str | None


class ConsoleChangeSetPreviewOut(ConsoleChangeSetOut):
    """A new change-set, with how many operations carry an error and how many warnings."""
    errors: int
    warnings: int


class ConsoleChangeSetsOut(ConsoleModel):
    items: list[ConsoleChangeSetOut]


class ConsoleAppliedOpOut(ConsoleModel):
    op: ChangeKind
    pk: dict[str, Any] | None
    after: dict[str, Any] | None


class ConsoleChangeSetAppliedOut(ConsoleModel):
    id: str
    status: Literal["applied"]
    applied: int
    activity_ids: list[str]
    results: list[ConsoleAppliedOpOut]


class ConsoleChangeSetDiscardedOut(ConsoleModel):
    id: str
    status: Literal["discarded"]


# --- schema: map, dictionary, migrations ------------------------------------------------------------

class ConsoleSchemaEdgeOut(ConsoleModel):
    from_table: str
    from_column: str
    to_table: str
    to_column: str


class ConsoleDriftOut(ConsoleModel):
    """Where the models and the live database disagree."""
    missing_tables: list[str]
    extra_tables: list[str]
    columns: dict[str, ConsoleColumnDriftOut]


class ConsoleSchemaMapOut(ConsoleModel):
    tables: list[ConsoleTableSummaryOut]
    edges: list[ConsoleSchemaEdgeOut]
    drift: ConsoleDriftOut
    domains: list[str]


class ConsoleDataDictionaryOut(ConsoleModel):
    tables: list[ConsoleTableDetailOut]
    unindexed_foreign_keys: list[str]


class ConsoleMigrationOut(ConsoleModel):
    revision: str
    # One parent, or several for a merge revision (none for the first).
    down_revision: str | list[str]
    message: str
    applied: bool


class ConsoleMigrationStateOut(ConsoleModel):
    """Where the database is relative to the migration head. `error` is sent
    only when Alembic could not be read."""
    current: str | None
    heads: list[str]
    at_head: bool
    behind_by: int | None
    history: list[ConsoleMigrationOut]
    error: str | None = Field(default=None, exclude_if=_absent_when_none)


class ConsoleMigrationPlanOut(ConsoleModel):
    """The SQL an upgrade would run, without running it."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    from_: str = Field(alias="from")
    to: str
    sql: str


# --- supervised runs (tests, checks, backups, restores, migrations, probes) ----------------------------

class ConsoleRunOut(ConsoleModel):
    """A run as the console's store keeps it. `summary` is what the run
    reported, in its kind's own shape (a test run's counts, a probe run's
    results), or the error that stopped it."""
    id: str
    kind: str
    selection: str | None
    principal_id: str
    started_at: str
    finished_at: str | None
    status: str  # running | passed | failed | cancelled | error
    summary: dict[str, Any] | None
    log_path: str
    exit_code: int | None


class ConsoleRunStatusOut(ConsoleRunOut):
    """A run with its latest output lines, and whether it is still going."""
    live: bool
    tail: list[str]
    lines: int


class ConsoleRunsOut(ConsoleModel):
    items: list[ConsoleRunOut]


class ConsoleRunLogOut(ConsoleModel):
    id: str
    lines: list[str]
    count: int


# --- query workbench ---------------------------------------------------------------------------------

class ConsoleReadResultOut(ConsoleModel):
    """A read query's result (rolled back; capped by rows, bytes and time)."""
    mode: Literal["read"]
    columns: list[str]
    rows: list[list[Any]]
    returned: int
    truncated: bool
    byte_capped: bool
    ms: float


class ConsoleWriteResultOut(ConsoleModel):
    """A write statement's result: rows changed, and any rows it returned (at most 500)."""
    mode: Literal["write"]
    rowcount: int
    columns: list[str]
    rows: list[list[Any]]
    ms: float


ConsoleQueryResultOut = Annotated[ConsoleReadResultOut | ConsoleWriteResultOut, Field(discriminator="mode")]


class ConsoleExplainOut(ConsoleModel):
    """A query plan: PostgreSQL's JSON plan, or another dialect's plan as text."""
    dialect: str
    plan: list[dict[str, Any]] | None
    text: str | None


class ConsoleSavedQueryOut(ConsoleModel):
    id: str
    name: str
    sql: str
    params: list[dict[str, Any]]
    updated_at: str
    pinned: bool


class ConsoleSavedQueryRowOut(ConsoleSavedQueryOut):
    created_by: str


class ConsoleSavedQueriesOut(ConsoleModel):
    items: list[ConsoleSavedQueryRowOut]


class ConsoleDeletedOut(ConsoleModel):
    """The id of what was deleted."""
    deleted: str


class ConsoleQueryHistoryRowOut(ConsoleModel):
    id: str
    at: str
    principal_id: str
    sql: str
    mode: str  # read | write
    rows: int | None
    ms: int | None
    error: str | None


class ConsoleQueryHistoryOut(ConsoleModel):
    items: list[ConsoleQueryHistoryRowOut]


# --- API playground ------------------------------------------------------------------------------------

class ConsoleRouteParamOut(ConsoleModel):
    """A route parameter as the host's OpenAPI schema describes it."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    name: str | None
    in_: str | None = Field(alias="in")
    required: bool
    schema_: dict[str, Any] | None = Field(alias="schema")


class ConsoleRouteTrafficOut(ConsoleModel):
    count: int
    p50_ms: float
    p95_ms: float
    status_4xx: int
    status_5xx: int
    last_seen: float


class ConsoleRouteOut(ConsoleModel):
    """One route of the host: its parameters, who may call it, and the traffic it has had."""
    method: str
    path: str
    name: str
    summary: str
    tags: list[str]
    params: list[ConsoleRouteParamOut]
    body: str | None
    console: bool
    auth: str
    roles: list[str]
    notes: str
    traffic: ConsoleRouteTrafficOut | None


class ConsoleRoutesOut(ConsoleModel):
    items: list[ConsoleRouteOut]


class ConsoleSentOut(ConsoleModel):
    """What this server answered a replayed request. `body` is the reply
    parsed when it is JSON, and its text otherwise."""
    status: int
    headers: dict[str, str]
    body: Any
    truncated: bool
    bytes: int
    ms: float
    request_id: str | None


class ConsoleTrafficSummaryOut(ConsoleModel):
    method: str
    route: str
    count: int
    p50_ms: float
    p95_ms: float
    max_ms: float
    status_4xx: int
    status_5xx: int
    last_seen: float


class ConsoleTrafficBufferOut(ConsoleModel):
    fill: int
    capacity: int
    total: int


class ConsoleTrafficSnapshotOut(ConsoleModel):
    at: str
    route: str
    method: str
    count: int
    p50_ms: float | None
    p95_ms: float | None
    max_ms: float | None
    status_4xx: int
    status_5xx: int


class ConsoleTrafficOut(ConsoleModel):
    items: list[ConsoleTrafficSummaryOut]
    buffer: ConsoleTrafficBufferOut
    history: list[ConsoleTrafficSnapshotOut]


class ConsoleTrafficEntryOut(ConsoleModel):
    t: float
    method: str
    route: str
    path: str
    status: int
    ms: float
    request_id: str | None
    principal: str | None


class ConsoleTrafficRecentOut(ConsoleModel):
    items: list[ConsoleTrafficEntryOut]


class ConsoleCollectionOut(ConsoleModel):
    """A saved list of requests to replay; each request is as the UI saved it."""
    id: str
    name: str
    requests: list[dict[str, Any]]
    updated_at: str


class ConsoleCollectionsOut(ConsoleModel):
    items: list[ConsoleCollectionOut]


# --- users and roles (the host's directory) ----------------------------------------------------------------

class ConsoleTokenOut(ConsoleModel):
    id: str
    issued_at: str | None
    expires_at: str | None
    last_used_at: str | None
    revoked_at: str | None


class ConsoleUserOut(ConsoleModel):
    """A user as the host's directory describes it; `extra` is the host's own."""
    id: str
    label: str
    roles: list[str]
    disabled: bool
    last_seen_at: str | None
    tokens: list[ConsoleTokenOut]
    extra: dict[str, Any]


class ConsoleUsersOut(ConsoleModel):
    items: list[ConsoleUserOut]


class ConsoleRoleOut(ConsoleModel):
    name: str
    description: str
    grants: list[str]


class ConsoleRolesOut(ConsoleModel):
    items: list[ConsoleRoleOut]


class ConsoleUserRolesOut(ConsoleModel):
    user: str
    roles: list[str]


class ConsoleUserDisabledOut(ConsoleModel):
    user: str
    disabled: bool


class ConsoleTokenRevokedOut(ConsoleModel):
    token: str
    revoked: bool


class ConsoleTokenIssuedOut(ConsoleModel):
    """A new token, shown this once: the console does not keep it."""
    user: str
    token_id: str
    plaintext: str
    expires_at: str | None
    note: str


# --- backups ------------------------------------------------------------------------------------------

class ConsoleBackupOut(ConsoleModel):
    id: str
    created_at: str
    bytes: int
    kind: str
    label: str
    verified: bool | None


class ConsoleBackupProviderOut(ConsoleModel):
    """One provider's backups, or why they could not be listed."""
    kind: str
    items: list[ConsoleBackupOut]
    error: str | None


class ConsoleBackupsRunningOut(ConsoleModel):
    backup: bool
    restore: bool


class ConsoleBackupsOut(ConsoleModel):
    providers: list[ConsoleBackupProviderOut]
    running: ConsoleBackupsRunningOut


class ConsoleRestorePlanOut(ConsoleModel):
    backup_id: str
    summary: str
    will_replace: list[str]
    warnings: list[str]


# --- tests ---------------------------------------------------------------------------------------------

class ConsoleTestNodeOut(ConsoleModel):
    id: str
    kind: Literal["file", "class", "test"]
    parent: str | None
    title: str


class ConsoleTestTreeOut(ConsoleModel):
    items: list[ConsoleTestNodeOut]
    # How many of the nodes are tests.
    count: int


class ConsoleTestRunsOut(ConsoleModel):
    items: list[ConsoleRunOut]
    # The id of the run in progress, if one is.
    running: str | None


# --- logs ----------------------------------------------------------------------------------------------

class ConsoleLogSourceOut(ConsoleModel):
    id: str
    title: str
    available: bool
    reason: str | None


class ConsoleLogSourcesOut(ConsoleModel):
    items: list[ConsoleLogSourceOut]


class ConsoleLogLineOut(ConsoleModel):
    """One log line. A source adds keys of its own: a JSONL line keeps every
    field it had, and the console's activity adds the principal and the
    activity id."""
    model_config = ConfigDict(from_attributes=True, extra="allow")

    ts: str
    level: str
    message: str
    logger: str | None
    request_id: str | None


class ConsoleLogTailOut(ConsoleModel):
    """The newest lines of one source. `available` is left out for the
    console's own activity, which is always there; `reason` is sent only
    when a source cannot be read."""
    source: str
    items: list[ConsoleLogLineOut]
    returned: int
    available: bool | None = Field(default=None, exclude_if=_absent_when_none)
    reason: str | None = Field(default=None, exclude_if=_absent_when_none)


# --- checks --------------------------------------------------------------------------------------------

class ConsoleCheckLastOut(ConsoleModel):
    status: str  # pass | info | warn | fail | error
    count: int | None
    run_id: str
    at: str


class ConsoleCheckOut(ConsoleModel):
    id: str
    title: str
    severity: Literal["info", "warn", "fail"]
    section: str
    builtin: bool
    last: ConsoleCheckLastOut | None


class ConsoleChecksOut(ConsoleModel):
    items: list[ConsoleCheckOut]
    last_run: ConsoleRunOut | None


class ConsoleCheckResultOut(ConsoleModel):
    """One check's result in a run. A sample is a row id, a "table.column"
    string, or a (table, key) pair, as the check reported it."""
    run_id: str
    check_id: str
    status: str  # pass | info | warn | fail | error
    count: int | None
    samples: list[str | list[Any]]
    hint: str | None
    ms: int | None


class ConsoleCheckRunOut(ConsoleRunStatusOut):
    results: list[ConsoleCheckResultOut]


# --- config ---------------------------------------------------------------------------------------------

class ConsoleConfigRowOut(ConsoleModel):
    """One setting: its value (masked when it is a secret), where the value
    came from, and its default. The value is the host's own."""
    name: str
    field: str
    value: Any
    secret: bool
    source: Literal["environment", "env_file", "default"]
    default: Any
    is_default: bool
    documented: bool | None
    mutable: bool
    type: str
    description: str | None


class ConsoleConfigOut(ConsoleModel):
    env_file: str | None
    example_file: str | None
    rows: list[ConsoleConfigRowOut]
    undocumented: list[str]
    unknown_in_env_file: list[str]


class ConsoleFlagSetOut(ConsoleModel):
    """A setting changed at runtime (not persisted), with its value before and after."""
    name: str
    before: Any
    after: Any


# --- activity --------------------------------------------------------------------------------------------

class ConsoleActivityOut(ConsoleModel):
    """One thing someone did through the console. `target_pk`, `before` and
    `after` are the host's own values, as they were recorded."""
    id: str
    at: str
    principal_id: str
    principal_label: str
    request_id: str | None
    section: str
    action: str
    target_table: str | None
    target_pk: Any
    before: Any
    after: Any
    changeset_id: str | None
    run_id: str | None
    note: str | None
    undone_by: str | None
    state: str  # pending | committed | failed


class ConsoleActivityListOut(ConsoleModel):
    items: list[ConsoleActivityOut]


def file_response(media_types: dict[str, dict[str, Any]], description: str) -> dict[int | str, dict[str, Any]]:
    """The OpenAPI entry for a route that streams or sends a file instead of
    JSON. Use it with `response_class=Response`, which FastAPI documents only
    when it names a media type (fastapi/openapi/utils.py get_openapi_path)."""
    return {200: {"description": description, "content": {media: {"schema": schema} for media, schema in media_types.items()}}}


BINARY: dict[str, Any] = {"type": "string", "format": "binary"}
TEXT: dict[str, Any] = {"type": "string"}
