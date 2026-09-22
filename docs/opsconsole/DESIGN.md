# opsconsole — a reusable operator console for web backends

Status: design, v1.1 (2026-09-22; Part II deep dive added). Supersedes the v1 console that shipped in
fa79215 (`app/services/console.py`, `/api/console/*`, `static/console.html`,
`frontend/app/console/page.tsx`).

## 0. One paragraph

`opsconsole` is a self-contained package (one Python package + one HTML/JS
bundle) that any FastAPI + SQLAlchemy backend mounts in a few lines and gets
a full admin/ops surface: a health board, visual CRUD over every table with
audited and reviewable changes, an ER diagram and data dictionary, migrations,
a query workbench, an API playground with per-route traffic, user/role
administration, backups, an in-app test runner, live logs, an integrity-check
registry, effective configuration with provenance, and an activity log of
everything anyone did through it. It knows nothing about any one application:
every app-specific fact (which tables are important, what "healthy" means,
which users exist, how backups are made, what a test run is) enters through a
typed adapter that the host app supplies at mount time. Journalism Workbench
is the first host; the package has no import of `app.*` and lives at
`backend/opsconsole/` so it can be lifted into its own repository unchanged.

## 1. Goals, non-goals, constraints

### Goals

1. **Everything the backend is doing is visible from one page**, and every
   direct intervention an operator would otherwise do with `psql`, Adminer,
   `pytest`, `tail -f`, `curl` or `alembic` can be done there, with less risk
   (previews, dry runs, row caps, confirmation, audit).
2. **Portable.** Drop it into a second app and get the same console. The only
   integration cost is writing adapters for the things that differ per app.
3. **Degrades by capability.** Every section is optional. The UI reads a
   manifest and renders only what the host wired up; nothing is stubbed with
   "coming soon".
4. **Safe by default.** Read-only unless the host enables writes; writes need
   an explicit principal, a confirmation token and are always audited; the
   console cannot be reached from a non-loopback address unless the host's
   auth policy says otherwise.
5. **Zero new infrastructure.** No Redis, no message broker, no separate
   process, no build step for the UI. Works against SQLite and Postgres.

### Non-goals

- Not a general admin CMS for end users (no per-model forms, permissions, or
  workflows for the application's own users). It is for the operator.
- Not a metrics/observability platform (no time-series storage, no alerting
  pipeline). It shows the live state and a short ring buffer of history; a
  real APM stays external.
- Not a schema editor. Migrations are applied through Alembic; the console
  does not create or alter tables ad hoc ("extensible schema" in the
  back4app sense is a host-app concern; the console *shows* whatever schema
  the host has).

### Constraints

- Python 3.12, FastAPI, SQLAlchemy 2.0, pydantic v2. Optional: Alembic,
  pytest, psutil (for richer server metrics; falls back to `os` when absent).
- One browser bundle, framework-free (vanilla ES modules + CSS custom
  properties), no npm build. It must be embeddable in a React/Next page by
  iframe or by mounting into a div.
- mypy `disallow_untyped_defs`, ruff clean, both under the host's config.
- Must run inside the Windows launcher (`Start Journalism Workbench.bat`) and
  inside the Docker Compose deployment without changes.

## 2. Requirements

### Functional (by section)

| Section | Must | Should |
|---|---|---|
| Overview | Health tiles (db, server, migrations, storage, host tiles), overall state, last check run, last test run, recent errors | SSE-refreshed tiles, one-click "run all checks" |
| Data | Browse any table: paging, sort, column filter, full-text `contains`, FK hover/navigate, row detail; CRUD with pending change-set → review diff → apply; bulk delete/update by selection or filter; CSV/JSON export | Live mode (poll for new rows), column visibility, per-table saved views |
| Schema | ER diagram (auto-layout, domains as colour groups), data dictionary (columns, types, nullability, defaults, FKs, indexes, docstrings), migration state (current/head/history), unindexed-FK check | "Upgrade to head" with dry-run SQL preview, drift detection (model vs live DB) |
| Query | SQL editor with history, saved queries, EXPLAIN, read-only by default, row cap, CSV download | Parameterised saved queries, Postgres `EXPLAIN ANALYZE` opt-in, write mode behind confirmation |
| API | Route list with auth/role tags, request builder (method/path/params/body/headers), "act as" a user token, response viewer, per-route traffic (count, p50/p95, error rate) from an in-process ring buffer, golden-path probe suite | Save requests as collections, replay a logged request by id, OpenAPI diff since last run |
| Users & Roles | List principals and roles (via adapter), grant/revoke role, revoke tokens, disable user, see last activity | Role matrix view, impersonate (act-as) with audit |
| Backups | List, create, restore (dry run + confirm), download, schedule status | Verify backup integrity check |
| Tests | Collect test tree, run selection, live stream, history with pass/fail counts, re-run failed, cancel | Flaky detection over history |
| Logs | Live tail (SSE), filter by level/request id/logger/text, group by request, multiple sources (app log, security audit, activity log) | Jump from a log line to the API traffic entry and vice versa |
| Checks | Registry of integrity checks with severity, run all/one, samples with links into Data, history | Scheduled runs, badge in nav |
| Config | Effective settings with source (env / .env / default), masked secrets, undocumented keys, feature flags | Edit non-secret flags at runtime where the host allows (audited, non-persistent) |
| Activity | Every console action: who, when, what, before/after, request id | Undo for reversible row changes |

### Non-functional

- Any list endpoint is bounded (row caps, byte caps, time caps) so the console
  cannot take the host down by accident.
- p95 < 300 ms for browse/overview on a 100k-row table on Postgres (uses
  estimated counts and keyset paging above a threshold).
- Nothing the console does holds a database lock longer than one statement;
  long tasks (tests, checks, backups) run in a supervised background thread
  with single-flight per task kind.
- No state in the host schema unless the host asks for it; the console's own
  state lives in a SQLite file in `console_dir` by default.
- Every write path is exercised by the package's own test suite against both
  SQLite and Postgres.

## 3. Architecture

```
┌──────────────────────────── Host application (e.g. Journalism Workbench) ────────────────────────────┐
│                                                                                                        │
│   create_app():                                                                                        │
│      console = opsconsole.mount(app, ConsoleConfig(                                                    │
│          metadata=Base.metadata, engine=engine, session_factory=SessionLocal,                          │
│          auth=LoopbackAndAdmin(...), settings=settings, alembic_ini=..., console_dir=...,               │
│          checks=[...], tiles=[...], users=WorkbenchUsers(), backups=WorkbenchBackups(),                 │
│          tests=PytestRunner(...), log_sources=[JsonlLog(...), SecurityAudit(...)],                      │
│          route_prefix="/api/console", ui_path="/console"))                                             │
│                                                                                                        │
└──────────────┬────────────────────────────────┬────────────────────────────────────────────────────────┘
               │ adapters (typed Protocols)     │ ASGI                                            ┌──────────────┐
               ▼                                ▼                                                 │  Browser     │
┌──────────────────────────────── opsconsole (package, no host imports) ───────────────────────┐   │  bundle      │
│                                                                                              │   │  (single     │
│  api/            router factory: one APIRouter per section, mounted only if capability on    │◄──┤  index.html  │
│   ├ manifest     GET /manifest  → sections, capabilities, limits, principal                  │   │  + es module)│
│   ├ health       tiles, server metrics, SSE                                                  │   │              │
│   ├ data         browse / row / changeset / apply / bulk / export                            │   │  reads       │
│   ├ schema       map / dictionary / migrations / upgrade                                     │   │  /manifest,  │
│   ├ query        run / explain / history / saved                                             │   │  renders     │
│   ├ apiplay      routes / send / traffic / probes                                            │   │  what exists │
│   ├ users        principals / roles / tokens                                                 │   └──────────────┘
│   ├ backups      list / create / restore / download                                          │
│   ├ tests        collect / run / stream / history                                            │
│   ├ logs         tail (SSE) / search                                                         │
│   ├ checks       registry / run / history                                                    │
│   ├ config       effective / flags                                                           │
│   └ activity     list / undo                                                                 │
│                                                                                              │
│  core/           introspection (SQLAlchemy MetaData + Inspector), sql screening, paging,      │
│                  change-sets, activity log, ring buffers, background TaskSupervisor, SSE bus  │
│  adapters/       Protocols + reference implementations (pytest runner, jsonl log source,      │
│                  alembic migrations, pg_dump/sqlite backup, in-memory users)                 │
│  store/          console's own state (SQLite via SQLAlchemy): activity_log, change_sets,      │
│                  saved_queries, query_history, test_runs, check_runs, api_traffic_snapshots   │
│  ui/             index.html (the bundle) + assets, served by the host at ui_path              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Three rules keep it portable:

1. **The package never imports the host.** Everything host-specific arrives
   through `ConsoleConfig`. If a section needs something the host didn't
   provide, the section is absent from the manifest and its router is not
   mounted (404, not 501).
2. **The package never writes to the host schema** unless
   `ConsoleConfig.store="host"` is set, in which case its tables are
   prefixed `opsconsole_` and created by the host's migrations, not by the
   console.
3. **The UI is data-driven by the manifest.** Adding a host capability never
   requires a UI change; the UI has one renderer per section and discovers
   which to show at load.

### 3.1 Data flow (one CRUD edit, end to end)

```
UI: edit cell in table "claims" row id=… ─► POST /data/changesets  {table, ops:[{op:"update", pk:{…}, set:{…}}]}
   opsconsole.data.changeset.create → validates table/columns against MetaData, coerces types,
   computes "before" snapshot per op (SELECT by pk), stores ChangeSet(status=pending) in store
◄─ {changeset_id, ops:[{before:{…}, after:{…}, warnings:[…]}]}
UI: shows diff; operator clicks Apply ─► POST /data/changesets/{id}/apply {confirm:"<changeset_id>"}
   auth.allow_write(request) → Principal (or 403)
   one transaction on the host engine: for each op, re-read row, compare to "before" (optimistic
   guard: abort if changed underneath), execute UPDATE/INSERT/DELETE, collect "after"
   activity_log ← one entry per op (principal, table, pk, before, after, changeset_id, request_id)
   ChangeSet.status=applied; SSE bus emits activity + data.changed(table)
◄─ {applied: n, activity_ids:[…]}
```

### 3.2 Background work

`TaskSupervisor` (core) owns every long task: test runs, check runs, backups,
migrations. One thread per task, single-flight per `kind`, status snapshot
readable at any time, cancel via a cooperative flag plus process kill for
subprocess-backed tasks, output ring buffer (last N lines) plus a file in
`console_dir/runs/<kind>/<run_id>.log`. This generalises the v1
`TestRunner` (RLock single-flight, isolated env) into one mechanism reused by
four sections.

### 3.3 Real-time

An in-process `EventBus` (asyncio queue per subscriber, bounded) feeds one
SSE endpoint `GET /events?topics=logs,tests,health,activity,traffic`. Producers:
the request-logging hook (traffic + logs), TaskSupervisor (task output and
state), change-set apply (activity, data.changed), health poller (tile state
changes). The UI opens one EventSource and fans out. If SSE fails (proxy,
old browser), sections fall back to polling the same JSON endpoints —
polling remains the source of truth; SSE only accelerates it.

## 4. The contract: `ConsoleConfig` and adapters

```python
# opsconsole/config.py
@dataclass(kw_only=True)
class ConsoleConfig:
    # --- required ---
    metadata: sqlalchemy.MetaData            # what tables/columns/FKs exist (from Base.metadata)
    engine: sqlalchemy.Engine                # host database
    session_factory: Callable[[], Session]
    auth: AuthPolicy                          # who may read / write (Protocol below)
    console_dir: Path                         # console state, run logs, exports

    # --- optional capabilities (absent => section not mounted) ---
    settings: pydantic_settings.BaseSettings | None = None       # Config section
    env_file: Path | None = None                                   # provenance for Config
    alembic_ini: Path | None = None                                # Migrations (Schema section)
    tests: TestRunner | None = None                                # Tests section
    log_sources: Sequence[LogSource] = ()                          # Logs section (≥1 to mount)
    users: UserDirectory | None = None                             # Users & Roles section
    backups: Sequence[BackupProvider] = ()                         # Backups section (≥1 to mount; each labelled by kind)
    checks: Sequence[Check] = ()                                   # added to built-in checks
    tiles: Sequence[TileProvider] = ()                             # added to built-in tiles
    request_hook: bool = True                                      # install traffic/log middleware
    api_probe_suite: Sequence[Probe] = ()                          # golden-path probes for API section

    # --- behaviour ---
    writes: WritePolicy = WritePolicy.DISABLED    # DISABLED | CHANGESETS | CHANGESETS_AND_SQL
    table_policy: TablePolicy = TablePolicy()     # hide/readonly/pk-only-display per table, mask columns
    limits: Limits = Limits()                     # rows, bytes, seconds, ring buffer sizes
    store: Literal["sqlite", "host"] = "sqlite"   # where the console keeps its own state
    route_prefix: str = "/api/console"
    ui_path: str | None = "/console"              # None => host serves the bundle itself
    app_name: str = "Application"
    domain_of_table: Callable[[str], str] | None = None   # colour groups in the ER diagram
    table_docs: Callable[[str], str | None] | None = None # docstring for the data dictionary
    describe_route: Callable[[APIRoute], RouteMeta] | None = None  # auth/role tags per route
```

Every adapter is a `typing.Protocol` so hosts can implement them with plain
classes and tests can use fakes:

```python
class AuthPolicy(Protocol):
    def allow_read(self, request: Request) -> Principal | None: ...   # None => 403
    def allow_write(self, request: Request) -> Principal | None: ...  # None => 403
    def act_as(self, request: Request, subject: str) -> Headers | None: ...  # optional; API playground

@dataclass(frozen=True)
class Principal:
    id: str; label: str; roles: tuple[str, ...]; is_local: bool

class TestRunner(Protocol):
    def collect(self) -> list[TestNode]: ...                       # tree of files/classes/tests
    def start(self, selection: str | None, *, on_line: Callable[[str], None]) -> RunHandle: ...
    def cancel(self, handle: RunHandle) -> None: ...
    def parse_result(self, log: str) -> TestSummary: ...           # passed/failed/errors/skipped + failed ids

class LogSource(Protocol):
    id: str; title: str; fields: tuple[str, ...]                    # e.g. ("ts","level","logger","request_id","msg")
    def tail(self, *, limit: int, filters: LogFilter) -> list[LogLine]: ...
    def follow(self) -> Iterator[LogLine]: ...                     # blocking generator; run on a thread

class UserDirectory(Protocol):
    def list(self) -> list[UserRecord]: ...                         # id, label, roles, disabled, last_seen, tokens
    def roles(self) -> list[RoleRecord]: ...                        # name, description, grants
    def set_roles(self, user_id: str, roles: Sequence[str], *, actor: Principal) -> None: ...
    def set_disabled(self, user_id: str, disabled: bool, *, actor: Principal) -> None: ...
    def revoke_token(self, token_id: str, *, actor: Principal) -> None: ...
    def issue_token(self, user_id: str, *, actor: Principal, ttl_seconds: int) -> IssuedToken: ...  # optional

class BackupProvider(Protocol):
    def list(self) -> list[BackupRecord]: ...                       # id, created_at, bytes, kind, verified
    def create(self, *, on_line: Callable[[str], None]) -> BackupRecord: ...
    def restore_plan(self, backup_id: str) -> RestorePlan: ...      # what will happen (dry run)
    def restore(self, backup_id: str, *, on_line: Callable[[str], None]) -> None: ...
    def open(self, backup_id: str) -> BinaryIO: ...                 # for download
    def schedule_status(self) -> ScheduleStatus | None: ...

@dataclass(frozen=True)
class Check:
    id: str; title: str; severity: Literal["info","warn","fail"]; section: str
    run: Callable[[Session], CheckResult]      # count, samples[(table, pk)], hint

@dataclass(frozen=True)
class TileProvider:
    id: str; title: str; section: str
    run: Callable[[Session], Tile]             # state ok/warn/fail, headline, details, refresh_seconds
```

Reference implementations ship in `opsconsole/adapters/`:
`PytestRunner(root, env)`, `JsonlLogSource(path)`, `PlainTextLogSource(path)`,
`AlembicMigrations(ini)`, `PgDumpBackups(dir)`, `SqliteFileBackups(dir)`,
`StaticUsers({...})`, `LoopbackOnly()` and `LoopbackOrRole(role)` auth
policies. A host with a bespoke user model writes a 40-line `UserDirectory`.

### 4.1 Mounting

```python
console = opsconsole.mount(app, config)   # returns ConsoleHandle
```

`mount` (a) validates the config, (b) opens/creates the console store,
(c) installs the request hook middleware if enabled, (d) builds a manifest,
(e) includes one router per available section under `route_prefix`, (f)
serves `ui/index.html` at `ui_path` with `<base href>` and the prefix injected,
(g) registers a shutdown hook that stops the TaskSupervisor and flushes ring
buffers. `ConsoleHandle` exposes `.manifest`, `.events` (publish), `.checks`
(register late), `.supervisor` — for host code that wants to emit its own
activity or run its own supervised task.

## 5. Console state (the store)

Kept separate from the host's data. SQLite file `console_dir/opsconsole.db`
by default, via SQLAlchemy so the same models work in `store="host"` mode.

| Table | Purpose | Key columns |
|---|---|---|
| `activity_log` | Every console action | id, at, principal_id, principal_label, request_id, section, action, target_table, target_pk (json), before (json), after (json), changeset_id, note |
| `change_sets` | Pending/applied/rejected CRUD batches | id, created_at, principal_id, status, table, ops (json), applied_at, error |
| `saved_queries` | Operator's named SQL | id, name, sql, params (json), created_by, updated_at, pinned |
| `query_history` | Last N executed queries | id, at, principal_id, sql, rows, ms, error, mode (read/write) |
| `runs` | TaskSupervisor history (tests, checks, backups, migrations) | id, kind, selection, started_at, finished_at, status, summary (json), log_path, principal_id |
| `check_results` | Per-check outcome per run | run_id, check_id, status, count, samples (json), ms |
| `traffic_snapshots` | Periodic flush of the API traffic ring buffer | at, route, method, count, p50_ms, p95_ms, errors |
| `api_collections` | Saved playground requests | id, name, requests (json) |

Retention: `Limits.activity_days` (default 90), `query_history_rows` (500),
`runs_per_kind` (50). A daily sweep in the supervisor trims them.

## 6. API contract

All routes under `route_prefix`. Every handler runs `auth.allow_read`; write
handlers additionally run `auth.allow_write` and require `confirm` equal to
the id of the thing being acted on (a changeset id, a backup id, the string
`"upgrade"` for migrations) so a replayed or mis-targeted request cannot act.
Errors are `{"error": {"code": "...", "message": "...", "request_id": "..."}}`.
Every list endpoint accepts `limit` (capped by `Limits`) and returns
`{"items": [...], "total": n | null, "estimated": bool, "next": cursor | null}`.

### Manifest

`GET /manifest` → `{app_name, version, principal, sections:[{id, title, capabilities:[…]}], limits, writes, store, prefix, sse: bool}`

### Overview / health

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{at, overall, tiles:[{id,title,state,headline,details,section,refresh_seconds}]}`; built-in tiles: database, migrations, server, storage, console-store, tests (last run), checks (last run) |
| GET | `/health/server` | uptime, pid, python, platform, cpu_count, load, rss_mb, cpu_pct (psutil), disk, in_docker, threads |
| GET | `/events` | SSE; `topics` query param |

### Data

| Method | Path | Notes |
|---|---|---|
| GET | `/data/tables` | name, domain, row estimate, exact (bool), columns summary, policy (readonly/hidden) |
| GET | `/data/tables/{t}` | full column metadata + FKs in/out + indexes (same shape as Schema dictionary) |
| GET | `/data/tables/{t}/rows` | `limit, cursor, sort, order, filter[col]=op:value, q` (contains across text columns); FK columns carry `{value, ref:{table, pk, label}}`; keyset paging when sorted by pk, offset otherwise (capped) |
| GET | `/data/tables/{t}/rows/{pk}` | one row + related rows count per inbound FK |
| GET | `/data/tables/{t}/export` | CSV or JSON stream, same filters, `Limits.export_rows` cap |
| POST | `/data/changesets` | `{table, ops:[{op:insert|update|delete, pk?, set?}]}` → preview with before/after and warnings (type coercion, FK targets missing, not-null) |
| GET | `/data/changesets/{id}` | |
| POST | `/data/changesets/{id}/apply` | `{confirm}`; optimistic guard against concurrent change |
| POST | `/data/changesets/{id}/discard` | |
| POST | `/data/tables/{t}/bulk` | `{op: delete|update, set?, selection:{pks:[…]} | {filter…}, dry_run: bool}` → creates a changeset from the resolved rows (capped by `Limits.bulk_rows`); apply as above |

Type coercion is derived from the SQLAlchemy column type (json → parsed,
datetime → ISO, bool, enum → validated), so the UI can render the right editor
per column without knowing the app.

### Schema

| Method | Path | Notes |
|---|---|---|
| GET | `/schema/map` | tables (with domain), edges (FKs), plus `drift`: columns in models but not DB and vice versa |
| GET | `/schema/dictionary` | per table: columns (type, nullable, default, pk, indexed, references), indexes (model + live), unique constraints, docstring |
| GET | `/schema/migrations` | current, heads, at_head, behind_by, history[{rev, down, message, applied}] |
| POST | `/schema/migrations/plan` | `{target:"head"|rev}` → offline SQL (`alembic upgrade --sql`) for preview |
| POST | `/schema/migrations/upgrade` | `{target, confirm:"upgrade"}` → supervised run (kind=migration); refuses if a test run or backup is active |

### Query

| Method | Path | Notes |
|---|---|---|
| POST | `/query/run` | `{sql, params?, max_rows, mode:"read"|"write"}`; read mode = v1 screen (SELECT/WITH/EXPLAIN, keyword denylist, READ ONLY tx, rollback); write mode only with `writes=CHANGESETS_AND_SQL` + `allow_write` + `confirm:"write"`, runs in one tx, returns rowcount, audited with the SQL text |
| POST | `/query/explain` | EXPLAIN (Postgres: `FORMAT JSON`; SQLite: `EXPLAIN QUERY PLAN`), `analyze: bool` opt-in on Postgres |
| GET/POST/DELETE | `/query/saved`, `/query/saved/{id}` | |
| GET | `/query/history` | |

### API playground

| Method | Path | Notes |
|---|---|---|
| GET | `/api/routes` | method, path, name, tags, params schema (from OpenAPI), auth (from `describe_route`), traffic summary |
| POST | `/api/send` | `{method, path, query, headers, body, act_as?}` → server-side request against `request.base_url` (never external), response status/headers/body (byte-capped), ms; `act_as` resolved by `auth.act_as` (audited) |
| GET | `/api/traffic` | ring-buffer summary per route: count, p50/p95/max ms, 4xx/5xx, last seen; `since` |
| GET | `/api/traffic/recent` | last N requests (route, status, ms, request_id, principal) |
| POST | `/api/probes/run` | golden-path suite (`api_probe_suite` + built-in `/health`, `/openapi.json`); supervised, results per probe |
| GET/POST | `/api/collections` | saved requests |

### Users & Roles (when `users` adapter present)

| Method | Path | Notes |
|---|---|---|
| GET | `/users` | id, label, roles, disabled, last_seen, tokens[{id, issued, expires, last_used}] |
| GET | `/users/roles` | role matrix |
| POST | `/users/{id}/roles` | `{roles, confirm:id}` |
| POST | `/users/{id}/disabled` | `{disabled, confirm:id}` |
| POST | `/users/tokens/{tid}/revoke` | `{confirm:tid}` |
| POST | `/users/{id}/tokens` | `{ttl_seconds, confirm:id}` (only if adapter implements `issue_token`) |

### Backups (when `backups` adapter present)

| Method | Path | Notes |
|---|---|---|
| GET | `/backups` | + `schedule` |
| POST | `/backups` | supervised run (kind=backup) |
| GET | `/backups/{id}/download` | streamed |
| POST | `/backups/{id}/restore/plan` | dry run: what will be replaced, row counts now vs in backup where computable |
| POST | `/backups/{id}/restore` | `{confirm:id}`; refuses while tests/migrations run; takes an automatic pre-restore backup first if the provider supports it |

### Tests (when `tests` adapter present)

| Method | Path | Notes |
|---|---|---|
| GET | `/tests/tree` | collected nodes (cached, `refresh=true` to recollect) |
| POST | `/tests/run` | `{selection?}` → run id; single-flight |
| GET | `/tests/runs`, `/tests/runs/{id}` | history with summary; `/tests/runs/{id}/log` full log |
| POST | `/tests/runs/{id}/cancel` | |
| POST | `/tests/rerun-failed` | selection built from the last run's failed ids |

### Logs

| Method | Path | Notes |
|---|---|---|
| GET | `/logs/sources` | from `log_sources` + built-in `activity` |
| GET | `/logs/{source}` | `limit, level, request_id, logger, contains, since`; server-side filter |
| SSE | `/events?topics=logs:{source}` | follow |

### Checks

| Method | Path | Notes |
|---|---|---|
| GET | `/checks` | registry: id, title, severity, section, last status |
| POST | `/checks/run` | `{only?:[ids]}` → supervised run; results stream over SSE |
| GET | `/checks/runs/{id}` | |

Built-in checks (app-agnostic): `migrations_at_head`, `tables_present`,
`schema_drift`, `foreign_keys_indexed`, `orphaned_rows` (every nullable FK
whose target row is missing, per FK — derived from MetaData, so it covers
the whole schema without per-app code), `console_store_writable`,
`disk_free`, `storage_dir_present`.

### Config

| Method | Path | Notes |
|---|---|---|
| GET | `/config` | rows: name, value (masked if name matches `Limits.secret_pattern` or field is `SecretStr`), source env/.env/default, default, documented (present in `.env.example`), undocumented keys in `.env` |
| POST | `/config/flags/{name}` | `{value, confirm:name}` only for fields the host lists in `settings.model_config["console_mutable"]`; applies to the live settings object; audited; not persisted |

### Activity

| Method | Path | Notes |
|---|---|---|
| GET | `/activity` | filters: principal, section, table, since |
| POST | `/activity/{id}/undo` | only for row update/delete with a stored `before`; creates and applies a reverse changeset (itself audited) |

## 7. Permission model

Two tiers, both decided by the host's `AuthPolicy`:

| Tier | Who (reference policy `LoopbackOrRole("admin")`) | What |
|---|---|---|
| read | loopback requests; or authenticated principal with the named role | every GET, SSE, query in read mode, test/check runs, probes |
| write | loopback **and** an authenticated principal with the role (so a browser on the same machine with no token still cannot write); or the host's own stricter rule | changesets, bulk, write-mode SQL, migrations, restore, user/role changes, config flags, undo |

Mechanics that apply regardless of the policy:

- `writes` in config must be enabled at all; the default is `DISABLED`, so a
  fresh mount is a read-only console.
- Every write carries `confirm` bound to the target id.
- Every write is recorded in `activity_log` with the principal and request id
  before the response is sent; a failed audit write fails the action.
- `TablePolicy` can mark tables hidden (never listed, not even in the ER
  diagram), read-only, or mask columns (value rendered as `••••`; never
  exported; excluded from `q` search) — the host lists its secret-bearing
  tables/columns here (e.g. connector credentials, auth tokens).
- The console is mounted with the host's global request guards still in
  front of it (rate limits, body limits, security audit).
- Act-as in the playground returns headers the host derived; the console
  never sees or stores a user's credential.

## 8. UI architecture

`ui/index.html` + `ui/console.js` + `ui/console.css` (one bundle, ~150 KB,
no build). Vanilla ES modules; each section is a module with
`mount(el, ctx)` / `unmount()`; a tiny router (hash-based so it works under
any `ui_path` and inside an iframe); one `api` client that adds the prefix
and handles the error envelope; one `events` client for SSE with automatic
fallback to polling.

Layout: left nav (sections from the manifest, with badges: failing checks,
running task, pending changesets, unread errors), top bar (app name,
principal, environment/db label, global search, ⌘K command palette that
jumps to a table, route, saved query or section), content pane, and a
bottom drawer that hosts streaming output (test run, check run, backup,
migration) without leaving the current page.

Design tokens: colour, spacing, radius and font are CSS custom properties on
`:root`, with light/dark following `prefers-color-scheme` and a
`data-theme` override; a host can restyle by injecting a stylesheet that
redefines the tokens. Component set is deliberately small: table (virtualised
rows, sticky header, resizable columns, cell editors by column type), key
value list, diff viewer, code editor (textarea with line numbers and SQL
keyword highlighting; no CodeMirror dependency), tile, drawer, toast,
confirm dialog (types the target id), tree.

UX rules: every destructive action is preview → diff → confirm; every long
task shows live output; every id that is a foreign key is a link; every
error shows its request id and a "open in Logs" link; every list has
export; keyboard-first (j/k rows, e edit, / search).

The Next.js `/console` page becomes a thin wrapper: it embeds the bundle in an
iframe pointed at the backend's `ui_path`, so the frontend has no console
logic to keep in sync (and the API's loopback rule still applies).

## 9. Scale and reliability

- Row counts: exact `COUNT(*)` for tables under `Limits.exact_count_rows`
  (default 50k rows by estimate), otherwise Postgres `pg_class.reltuples` /
  SQLite `sqlite_stat1` marked `estimated: true`.
- Paging: keyset on primary key by default; offset paging only when sorting by
  a non-unique column and capped at `Limits.offset_max`.
- Query workbench: statement timeout set per session on Postgres
  (`SET LOCAL statement_timeout`), thread-side timeout on SQLite; row and
  byte caps; results streamed for export.
- Traffic ring buffer: fixed-size deque per route (default 2,000 entries
  total), flushed to `traffic_snapshots` every 60 s; memory bounded.
- Supervisor: one task per kind, cancellable; a crash of a task thread is
  recorded as `status=error` with the traceback in the run log, never
  propagated into the request path.
- SSE: bounded per-subscriber queues; slow consumers drop oldest events and
  receive a `gap` event so the UI re-syncs by polling.
- Failure isolation: any exception inside a tile/check/adapter is caught and
  rendered as that tile/check in `error` state; the console page always loads.

## 10. Trade-offs made explicit

| Decision | Alternative | Why this way |
|---|---|---|
| Own SQLite store in `console_dir` | Tables in the host DB | Zero migration burden on hosts; console works before the host's first migration; host DB stays exactly the app's. Cost: two DBs to back up; `store="host"` exists for hosts that want one. |
| Vanilla JS single bundle | React/Next component library | No build, embeddable anywhere (Flask/Django hosts later), no version coupling to the host's frontend. Cost: fewer off-the-shelf widgets; we write a table and a diff viewer once. |
| Change-sets with preview and optimistic guard | Direct inline save | Turns CRUD into reviewable, auditable, undoable batches; the same path serves single edits and bulk ops. Cost: two round trips per edit. |
| Adapters as Protocols | Plugin discovery / entry points | Explicit wiring in `create_app` is greppable and typed; no magic. Cost: a host must write adapters rather than install plugins — acceptable at 1–5 hosts. |
| SSE + polling fallback | WebSockets | Works through every proxy, one-directional is all we need, trivial to fall back. |
| Alembic-only migrations | Console-driven DDL | "Extensible schema" through the UI would bypass code review and break models; the console previews and applies *declared* migrations only. |
| Loopback default, host-defined escalation | Console-owned auth | Auth already exists in every host; duplicating users/tokens here would be a second security surface to get wrong. |
| Generic orphan check from MetaData | Per-app integrity checks only | Gives every host schema-wide referential coverage for free; app semantics (e.g. "accepted candidate must be materialised") are still per-app `Check`s. |

## 11. Phasing

| Phase | Delivers | Replaces |
|---|---|---|
| 1 — Skeleton + read | package layout, `mount`, manifest, store, auth tiers, request hook + traffic buffer, EventBus/SSE, TaskSupervisor; sections: Overview (tiles + server), Schema (map, dictionary, migrations read-only), Data (browse/filter/export, FK links), Query (read, history, saved, explain), Logs (sources, tail, SSE), Checks (built-ins + host registry), Config; UI bundle with nav/palette/drawer | all of v1 except tests |
| 2 — Write | `writes` policy, changesets (preview/apply/discard), bulk, activity log + undo, write-mode SQL, config flags | — |
| 3 — Operate | Tests via `TestRunner` adapter (tree, stream, history, re-run failed), API playground (send, act-as, probes, collections), migrations plan/upgrade | v1 test runner, v1 endpoint probe |
| 4 — Administer | Users & Roles adapter + section, Backups adapter + section (create/restore/download/schedule) | host's existing `/backups` UI stays; console adds the operator view |
| 5 — Extract | move `backend/opsconsole` to its own repo, publish, second host adopts; ER auto-layout polish, live mode, flaky-test detection | — |

Phase 1 is the port of what exists today plus the read half of the new
sections; nothing user-visible regresses at the end of it.

## 12. Adoption by Journalism Workbench

What the host supplies (all in `app/console_adapters.py`, ~200 lines):

- `auth = LoopbackOrRole("admin")` wrapped so that `allow_write` also
  requires `request_is_local_request` — the existing rule, kept.
- `checks`: the app-specific checks now in `console_health.py`
  (`evidence_has_source`, `claim_links_intact`, `claims_backed_by_evidence`,
  `accepted_candidates_materialized`, `document_files_present`,
  `chunks_have_document`, `relationship_endpoints_exist`,
  `ai_candidates_reviewed`, `ai_citations_exist`, `revoked_users_tidy`) become
  `Check` objects; the generic ones (`migrations_at_head`, `tables_present`,
  `foreign_keys_indexed`) are dropped in favour of the package's built-ins.
- `tiles`: openaleph (probe), connectors, ai (governor state), security
  (denials, limiter state) — each a `TileProvider` over existing services.
- `tests = PytestRunner(root=BACKEND_ROOT, env={"DATABASE_URL": "sqlite:///…/console-tests.db"})`.
- `log_sources = [JsonlLogSource(settings.app_log_file, id="app"),
  JsonlLogSource(settings.audit_log_file, id="security")]`.
- `users = WorkbenchUsers()` over `app.models.identity`: `app_users`
  (`global_role` member/admin, `disabled`, one persisted bearer token per
  user as `token_digest` with created/last-used/rotated/revoked timestamps)
  and `investigation_memberships` (`role` viewer/reporter/admin). So the
  adapter implements `list()` (roles = global role + per-investigation
  memberships), `set_roles`, `set_disabled`, `revoke_token` (sets
  `token_revoked_at`) and `issue_token` as a rotation (new digest, returns
  the plaintext once). The process-wide shared `API_AUTH_TOKEN` (ADR-0002's
  first tier) is not a user; it is shown on the security tile only.
- `backups = WorkbenchBackups()` over `app/services/exports.py`
  (`inspect_export`, `preview_investigation_restore`,
  `restore_investigation_export`, which today back `/backups/*`). Those are
  per-investigation export archives, not whole-database dumps, so the
  adapter's `list()` enumerates archives in the storage root, `create()`
  exports an investigation (selection passed as the run's `selection`), and
  `restore_plan()` is `preview_investigation_restore`. A whole-database
  `PgDumpBackups`/`SqliteFileBackups` provider can be added alongside as a
  second `BackupProvider` (the section supports several, labelled by kind).
- `table_policy`: hide nothing; read-only `alembic_version`; mask
  `app_users.token_digest` (a SHA-256 digest, but still not something to
  export or search). Connector credentials are file-based
  (`app/services/credentials.py`), not rows, so nothing else needs masking
  today; the Config section masks `API_AUTH_TOKEN` and every
  `*_KEY`/`*_SECRET`/`*_TOKEN` setting.
- `domain_of_table` from the models package split
  (investigations/entities/sources/claims/leads/connectors/relationships/documents/ai/identity);
  `table_docs` from each model class docstring.
- `describe_route` reads the existing `authorize_request_resource`
  dependency markers to tag routes with their authorization requirement.

What gets deleted once phase 1 ships: `app/services/console.py`,
`app/services/console_health.py` (its generic halves move into the package,
its app halves into `console_adapters.py`), `app/api/routes_console.py`,
`app/static/console.html`, the body of `frontend/app/console/page.tsx`
(replaced by an iframe wrapper). `tests/test_console.py` is replaced by the
package's suite plus a small host-side test that `mount` produced the
expected manifest.

Config keys stay: `CONSOLE_ENABLED`, `CONSOLE_DIR`, `APP_LOG_FILE`; new:
`CONSOLE_WRITES` (`disabled|changesets|changesets_and_sql`, default
`disabled` in prod, `changesets` in the Windows launcher).

## 13. Package layout

```
backend/opsconsole/
  __init__.py          mount(), ConsoleHandle, __version__
  config.py            ConsoleConfig, Limits, TablePolicy, WritePolicy
  protocols.py         AuthPolicy, Principal, TestRunner, LogSource, UserDirectory, BackupProvider, Check, TileProvider, Probe
  manifest.py
  core/
    introspect.py      MetaData + Inspector → tables/columns/fks/indexes/drift/domains
    paging.py          keyset/offset, filters, coercion
    sqlscreen.py       read-mode screen (from v1), statement timeouts
    changesets.py      preview/apply/undo
    activity.py        ActivityLog writer/reader
    supervisor.py      TaskSupervisor, RunHandle, run logs
    events.py          EventBus, SSE response
    traffic.py         request hook middleware, ring buffer, snapshots
    metrics.py         server metrics (psutil optional)
    configview.py      effective settings with provenance
    checks_builtin.py
    tiles_builtin.py
  store/
    models.py          console tables (SQLAlchemy)
    session.py         sqlite-or-host engine
  api/
    manifest.py health.py data.py schema.py query.py apiplay.py users.py backups.py tests.py logs.py checks.py config.py activity.py
  adapters/
    pytest_runner.py jsonl_log.py plain_log.py alembic_migrations.py pg_backups.py sqlite_backups.py static_users.py auth_policies.py
  ui/
    index.html console.js console.css
  tests/               package suite: fixture app with 4 tables (two FKs, one json column), run on sqlite and postgres (CI matrix), every endpoint, both auth tiers, changeset guard, SSE fallback
```

## 14. Testing the package

- Fixture host: a 60-line FastAPI app with `Base` of four tables, an
  in-memory `StaticUsers`, a fake `TestRunner` that emits scripted lines, a
  temp `JsonlLogSource`, `LoopbackOrRole("admin")`.
- Contract tests per adapter Protocol (a host can run them against its own
  implementation: `opsconsole.testing.check_user_directory(impl)`).
- Property tests for coercion (round-trip every column type through
  preview → apply → read).
- Concurrency tests: two apply calls on the same changeset, apply after the
  row changed underneath, cancel during a run, SSE slow consumer.
- The host's CI runs the package suite on both engines and its own adapter
  contract tests.

## 15. What to revisit as it grows

- If a host needs multi-operator concurrency at scale, the SQLite store
  becomes the bottleneck: switch that host to `store="host"`.
- If traffic history beyond a ring buffer is wanted, add an OTLP exporter
  rather than growing `traffic_snapshots`.
- If a non-FastAPI host appears (Django/Flask), split `api/` behind a thin
  framework shim; `core/`, `store/`, `adapters/` and `ui/` are already
  framework-free.
- If the UI outgrows vanilla modules (a real ER layout engine, a rich SQL
  editor), introduce a build step for the UI package only; the API contract
  does not change.
- Live Queries in the back4app sense (subscribe to row changes) would need
  DB-level change capture (Postgres `LISTEN/NOTIFY` triggers); the current
  "live mode" is poll-based by design.

---

# Part II — Deep dive

Part I fixed the shape. Part II fixes the details an implementer needs on
day one: the store's DDL, the change-set state machine, what is cached and
for how long, how each failure is handled and retried, the load the design
is sized for, and how the console watches itself.

## 16. Store DDL

SQLite by default (`console_dir/opsconsole.db`, WAL mode, `busy_timeout=5000`);
identical models under `store="host"` with the `opsconsole_` prefix. All ids
are ULIDs (sortable, no coordination). JSON columns are `TEXT` with a
`json_valid` check on SQLite and `JSONB` on Postgres.

```sql
CREATE TABLE activity_log (
  id              TEXT PRIMARY KEY,              -- ULID
  at              TEXT NOT NULL,                 -- ISO-8601 UTC
  principal_id    TEXT NOT NULL,
  principal_label TEXT NOT NULL,
  request_id      TEXT,
  section         TEXT NOT NULL,                 -- data|query|schema|users|backups|config|tests|checks|activity
  action          TEXT NOT NULL,                 -- row.insert|row.update|row.delete|sql.write|migration.upgrade|...
  target_table    TEXT,
  target_pk       TEXT,                          -- json: {"id": "..."} (composite keys supported)
  before          TEXT,                          -- json row or null
  after           TEXT,                          -- json row or null
  changeset_id    TEXT,
  run_id          TEXT,
  note            TEXT,
  undone_by       TEXT REFERENCES activity_log(id),
  state           TEXT NOT NULL DEFAULT 'committed'  -- pending|committed|failed (two-phase audit, §19)
);
CREATE INDEX ix_activity_at ON activity_log(at DESC);
CREATE INDEX ix_activity_target ON activity_log(target_table, target_pk);
CREATE INDEX ix_activity_principal ON activity_log(principal_id, at DESC);

CREATE TABLE change_sets (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  principal_id  TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending','applying','applied','rejected','discarded','expired')),
  target_table  TEXT NOT NULL,
  ops           TEXT NOT NULL,                   -- json [{op, pk, set, before, after, warnings}]
  origin        TEXT NOT NULL,                   -- inline|bulk|undo|import
  applied_at    TEXT,
  error         TEXT,
  expires_at    TEXT NOT NULL                    -- pending sets expire (default 30 min)
);
CREATE INDEX ix_changesets_status ON change_sets(status, created_at DESC);

CREATE TABLE saved_queries (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, sql TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '[]',             -- json [{name, type, default}]
  created_by TEXT NOT NULL, updated_at TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE query_history (
  id TEXT PRIMARY KEY, at TEXT NOT NULL, principal_id TEXT NOT NULL,
  sql TEXT NOT NULL, mode TEXT NOT NULL, rows INTEGER, ms INTEGER, error TEXT
);
CREATE INDEX ix_query_history_at ON query_history(at DESC);

CREATE TABLE runs (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL,       -- tests|checks|backup|restore|migration|probes
  selection TEXT, principal_id TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','running','passed','failed','error','cancelled')),
  summary TEXT,                                  -- json, kind-specific
  log_path TEXT NOT NULL, exit_code INTEGER
);
CREATE INDEX ix_runs_kind ON runs(kind, started_at DESC);

CREATE TABLE check_results (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  check_id TEXT NOT NULL, status TEXT NOT NULL,  -- pass|info|warn|fail|error
  count INTEGER, samples TEXT, hint TEXT, ms INTEGER,
  PRIMARY KEY (run_id, check_id)
);

CREATE TABLE traffic_snapshots (
  at TEXT NOT NULL, route TEXT NOT NULL, method TEXT NOT NULL,
  count INTEGER NOT NULL, p50_ms REAL, p95_ms REAL, max_ms REAL,
  status_4xx INTEGER NOT NULL, status_5xx INTEGER NOT NULL,
  PRIMARY KEY (at, route, method)
);

CREATE TABLE api_collections (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, requests TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE store_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);  -- schema_version, created_at
```

The store has its own tiny versioned migration list inside the package
(`store/migrations.py`, a list of `(version, sql)`), applied at `mount`.
It never uses the host's Alembic.

## 17. Change-set state machine

```
            create (preview)                     apply                      ok
  ─────────────────────────────►  pending  ──────────────────►  applying  ─────────►  applied
                                    │  ▲                            │
                       discard      │  │ re-preview                 │ guard failed / db error
                                    ▼  │ (refresh before-snapshots) ▼
                                 discarded                       rejected  (error text kept; ops
                                    ▲                                        and before/after kept
                       30 min idle  │                                        for the operator to
                                 expired                                     re-preview)
```

`applying` is a real state (written before the host transaction opens) so a
crash mid-apply leaves evidence; on mount, any `applying` set older than
`Limits.apply_timeout` is marked `rejected` with `error="interrupted"` and the
operator is shown the rows to re-check. The optimistic guard compares the
current row to `before` column-by-column using the coerced values (not string
forms), ignoring columns listed in `TablePolicy.volatile_columns`
(e.g. `updated_at` maintained by triggers).

Undo creates a new change-set with `origin="undo"` whose `set` is the
original `before` (for update/delete) or a delete (for insert), previews it
through the same guard, and links the two activity rows via `undone_by`.

## 18. Caching

Everything the console caches is either immutable for the process lifetime or
cheap to rebuild; nothing is cached across processes.

| What | Where | Invalidation |
|---|---|---|
| Introspected model schema (MetaData → tables/columns/FKs/model indexes) | process memory, built at `mount` | never (models are code) |
| Live DB schema (Inspector: live indexes, drift) | process memory | TTL 60 s; forced after a migration run completes |
| Row-count estimates per table | process memory | TTL 30 s; exact counts under the threshold are not cached |
| Route list + OpenAPI-derived param schemas | process memory, built on first request | never (routes are code); `refresh=true` rebuilds |
| Test tree (`collect`) | process memory + `console_dir/runs/tests/collect.json` | `refresh=true`, or automatically after any test run |
| Manifest | process memory | never; it is a function of config |
| Effective config | none (recomputed per request — it is ~100 rows) | — |
| Health tiles | last result per tile in memory with its `refresh_seconds` | tile-specific TTL (db 5 s, server 5 s, migrations 60 s, host tiles as declared); SSE pushes on state change only |
| Traffic stats | ring buffer (deque) | rolling; snapshot flushed every 60 s |

Browser side: the UI caches the manifest and schema map in memory for the
page lifetime and keeps per-viewer conveniences (last table, column widths,
theme) in `localStorage` wrapped in try/catch. No data rows are cached in the
browser.

## 19. Error handling and retry

Principle: the console never takes the host down, never leaves a half-done
write, and always tells the operator what happened with a request id.

| Component | Failure | Handling | Retry |
|---|---|---|---|
| Request handler | any uncaught exception | error envelope `{code, message, request_id}`, 500; logged to the host logger with the request id; activity row if a write was in progress | none |
| Host DB unreachable | `OperationalError` on any read | tile `database=fail`, sections that need the DB return 503 `db_unavailable`; UI shows a banner and keeps polling `/health` | UI polls with backoff 2 s → 30 s |
| Console store unreachable | SQLite locked / missing dir | reads of console state return 503 `store_unavailable`; **writes to the host DB are refused** (audit must succeed first) | `busy_timeout` 5 s covers lock contention; otherwise operator action |
| Change-set apply | guard mismatch | `rejected`, 409 `changed_underneath` with the differing columns | operator re-previews |
| Change-set apply | DB constraint error | transaction rolled back, `rejected`, 409 with the driver message (first line, 500 chars) | operator edits |
| Change-set apply | audit and data commit disagree | two-phase audit: activity rows are written with `state=pending` *before* the host transaction opens (if that write fails, nothing is applied); after the host commit they are flipped to `committed`, after a rollback to `failed`. Under `store="host"` both live in one transaction and the flip is trivial. A crash between commit and flip leaves `pending` rows; at mount they are reconciled by comparing the target row to `after` (match → `committed`, else → `failed`) | — |
| Query (read) | timeout / too many rows | 400 `query_timeout` / results truncated with `truncated: true` and the cap | operator narrows |
| Supervised run | adapter raises | run `status=error`, traceback in the run log, SSE `run.error` | operator re-runs; single-flight lock released in `finally` |
| Supervised run | cancel | cooperative flag; subprocess gets SIGTERM then SIGKILL after 5 s; `status=cancelled` | — |
| Supervised run | process restart mid-run | on mount, runs with `status=running` and no live thread are marked `error="interrupted"` | operator re-runs |
| Subprocess (pytest, pg_dump, alembic) | non-zero exit | `status=failed` with exit code and parsed summary where the adapter can parse | — |
| Log source | file missing / rotated | source reports `available=false` with reason; tail returns `[]`; follow re-opens on inode change | automatic |
| API playground `send` | host route errors | shown as the response (that is the point); 5xx from the host is not a console error | none |
| API playground `send` | connection refused (host not reachable on its own base_url, e.g. behind a proxy) | 502 `self_unreachable` with the URL tried | none; config hint shown |
| SSE | client disconnect | subscriber queue removed | UI reconnects with backoff, then falls back to polling after 3 failures |
| SSE | slow consumer | oldest events dropped, `gap` event sent | UI re-syncs the affected section by polling |
| Health tile / check | provider raises | that tile/check is `error` with the message; others unaffected | next refresh |
| Alembic upgrade | fails mid-way | `status=failed`; migration state re-read and shown (Alembic leaves the DB at the last completed revision, or inside a transaction on Postgres which is rolled back); schema cache invalidated | operator |
| Restore | fails | provider-specific; the automatic pre-restore backup id is in the run summary | operator |

Idempotency: every write endpoint is keyed by the target id in `confirm`, so a
retried apply of an already-applied change-set returns 409 `already_applied`
rather than re-applying; a retried `POST /tests/run` while running returns
409 with the current run id.

## 20. Load estimate and sizing

The console is a one-operator tool sitting next to a small backend; it is
sized for that, and the limits exist so that it stays harmless when it is
pointed at a bigger one.

| Dimension | Design point | Headroom |
|---|---|---|
| Concurrent operators | 1–3 | SQLite store WAL handles ~10 writers/s; `store="host"` beyond that |
| Host request rate the traffic hook must absorb | ≤ 200 req/s | hook cost is one `perf_counter` pair + deque append (< 20 µs); no I/O on the request path |
| Ring buffer memory | 2,000 entries × ~200 B | < 1 MB |
| SSE subscribers | ≤ 10 | bounded queues of 500 events each |
| Largest table browsed | 10M rows | estimated counts, keyset paging; offset paging refused past `offset_max` (50k) |
| Query result | 500 rows / 5 MB / 30 s | caps from `Limits`; export streams up to `export_rows` (100k) |
| Log tail | 2,000 lines per request from a file read backwards in 64 KB blocks | independent of file size |
| Test run | tens of minutes | output ring buffer 2,000 lines + full log on disk |
| Activity log growth | ~1 row per operator write; bulk of 10k rows = 10k rows | 90-day sweep; a `bulk` op stores one activity row per affected row on purpose (undo granularity) but with `before`/`after` limited to the changed columns for updates |

Vertical only: the console runs in the host's process, one instance per
host process. With several host workers (gunicorn/uvicorn workers) each has
its own ring buffer and supervisor; the UI talks to whichever worker answers.
Consequence and mitigation: traffic stats are per-worker (the snapshot table
merges them, tagged by pid); supervised runs are single-flight per worker,
so the store's `runs` table is the cross-worker lock (`INSERT ... WHERE NOT
EXISTS running` in one statement). Documented as a known limitation for
multi-worker hosts; single-worker is the common case for the apps this
targets.

## 21. The console watching itself

A built-in `console` tile reports: store reachable and writable, store size,
pending change-sets, last sweep time, SSE subscribers, ring buffer fill,
supervisor threads alive, interrupted runs found at mount. Built-in checks
`console_store_writable` and `console_runs_interrupted` surface the same in
the Checks section so an operator looking at the nav badge sees console
faults exactly like application faults. The console's own actions and
errors go through the host's logger under the `opsconsole` logger name, so
they appear in the Logs section's `app` source with request ids like
everything else — there is no separate console log to forget about.

## 22. Assumptions

Stated so they can be checked rather than inherited:

1. One process serves both the API and the console UI, on the same origin,
   so `send` can call `request.base_url` and cookies/loopback rules hold.
2. The host's models are declared on one SQLAlchemy `MetaData`; tables that
   exist in the DB but not in the models are shown (as "live only") but are
   read-only in the Data section because their types are not known to the
   coercion layer.
3. Every table the operator will edit has a primary key. Tables without one
   are browse-only.
4. The host's `AuthPolicy` is the security boundary; the console adds
   `confirm` and audit but does not authenticate anyone itself.
5. Alembic, if present, is configured by an ini file the host can point to
   and the host's `env.py` can be imported from the console's process.
6. pytest, if present, runs against a database the host's `TestRunner` env
   points at; the console never runs tests against the live database.
