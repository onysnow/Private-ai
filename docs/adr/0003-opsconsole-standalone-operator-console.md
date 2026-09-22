# ADR-0003: Operator console as a standalone, host-agnostic package (opsconsole)

**Status:** Proposed
**Date:** 2026-09-22
**Deciders:** Ony
**Design:** `docs/opsconsole/DESIGN.md` (v1.1) is the full specification this ADR records the decisions for.

## Context

The v1 operator console (fa79215) gave the workbench a loopback-only
`/api/console/*` API and two copies of a small UI (backend-served
`static/console.html`, Next.js `app/console/page.tsx`) covering table
browsing, read-only SQL, route listing, an endpoint probe, a pytest runner
and an app-log tail. It was written directly against the workbench:
`app/services/console.py` imports `app.models`, `app.core.config.settings`
and `app.core.app_log`; the UI hard-codes the endpoint list; every new
capability meant another workbench-specific module.

The requirement has since changed in two ways:

1. **Scope.** The console must cover the whole operator surface: visual CRUD
   with bulk actions and an audit trail, user/role administration, an ER
   diagram and data dictionary, migrations, backups, an API playground with
   traffic statistics, integrity checks, effective configuration, live logs
   and in-app tests — the "admin dashboard" vocabulary (CRUD, RBAC, activity
   log, API playground, live data, ER diagram, DB/API/server admin layers)
   rather than a debugging page.
2. **Reuse.** It has to "hold on its own so we can reuse the design for
   other web apps." That rules out anything that imports the workbench.

Forces at play: one developer; no appetite for new infrastructure (the stack
is already FastAPI + SQLAlchemy + Postgres/SQLite + Next.js + Docker Compose
+ OpenAleph); the console must keep working inside the Windows launcher and
the Compose deployment; writes to production data from an admin UI are a
real risk and need review and audit; mypy strict and the existing security
guards (loopback rule, rate limits, security audit log) must keep applying.

Six decisions are recorded here because each one shapes the others. They are
numbered D1–D6; the options for each are below.

## Decision

Build `opsconsole` as a separate Python package (`backend/opsconsole/`, no
imports of `app.*`) with a single framework-free UI bundle, mounted by the
host through `opsconsole.mount(app, ConsoleConfig(...))`. Specifically:

- **D1 — Boundary:** the host supplies everything app-specific through typed
  adapter `Protocol`s (`AuthPolicy`, `TestRunner`, `LogSource`,
  `UserDirectory`, `BackupProvider`, `Check`, `TileProvider`, settings,
  Alembic ini, table policy). Sections whose adapter is absent are not
  mounted; the UI renders from `GET /manifest`.
- **D2 — Console state:** the console keeps its own state (activity log,
  change-sets, saved queries, run history, traffic snapshots) in a SQLite
  file under `console_dir`, with an opt-in `store="host"` mode that puts the
  same tables, prefixed `opsconsole_`, in the host database.
- **D3 — Writes:** all data mutation goes through change-sets (preview with
  before/after → confirm bound to the change-set id → apply under an
  optimistic guard → activity rows → undo), including bulk operations and
  the write-mode SQL path. Writes are off by default (`WritePolicy.DISABLED`).
- **D4 — Authorization:** the console authenticates nobody. The host's
  `AuthPolicy` decides read and write tiers; the console adds `confirm`
  tokens, table/column masking and audit. The workbench's policy stays
  loopback-only for reads and loopback + global admin for writes.
- **D5 — UI:** one vanilla ES-module bundle (`ui/index.html`, `console.js`,
  `console.css`) served by the host at `ui_path`, themed by CSS custom
  properties; the Next.js `/console` page becomes an iframe wrapper.
- **D6 — Real-time and background work:** an in-process `EventBus` over one
  SSE endpoint with polling as the source of truth, and one `TaskSupervisor`
  (thread per task, single-flight per kind, run logs on disk) shared by
  tests, checks, backups, restores, migrations and probes.

## Options Considered

### D1 — Where the boundary sits

#### Option A: Standalone package with adapter Protocols (chosen)
| Dimension | Assessment |
|---|---|
| Complexity | Medium — adapters must be designed once; wiring is explicit |
| Cost | ~200 lines of host adapters per app; package built once |
| Scalability (to more hosts) | High — second host is adapters only |
| Team familiarity | High — plain Python Protocols and dataclasses, no framework |

**Pros:** enforceable ("no `app.` imports" is a one-line test); typed contract; fakes are trivial in tests; can be extracted to its own repo unchanged.
**Cons:** every host capability needs an adapter written by hand; some generic checks (orphans, unindexed FKs) had to be re-derived from `MetaData` instead of reusing app code.

#### Option B: Keep it inside the workbench, generalise later
| Dimension | Assessment |
|---|---|
| Complexity | Low now, high later |
| Cost | Cheapest short-term |
| Scalability | Low — "later" extraction usually means a rewrite |
| Team familiarity | High |

**Pros:** fastest to the next feature. **Cons:** contradicts the stated requirement; the v1 code already shows the drift (three workbench imports in the service module after one week).

#### Option C: Adopt an existing admin framework (sqladmin / FastAPI-Admin / Django-admin-style)
| Dimension | Assessment |
|---|---|
| Complexity | Low for CRUD, high for everything else |
| Cost | Free to install; expensive to extend |
| Scalability | Medium |
| Team familiarity | Low — another framework's conventions and UI |

**Pros:** CRUD forms out of the box. **Cons:** none of them cover tests, logs, traffic, checks, migrations, config provenance or a reviewable change-set flow; their UIs are not embeddable in the existing Next.js app on our terms; they bring their own auth assumptions that conflict with D4.

### D2 — Where console state lives

#### Option A: Own SQLite file in `console_dir` (chosen), `store="host"` opt-in
**Pros:** zero migration burden on hosts; works before the host's first migration; host schema stays exactly the app's; easy to wipe. **Cons:** a second file to back up; SQLite write concurrency (adequate for 1–3 operators); cross-worker coordination needs a table-level lock.

#### Option B: Tables in the host database only
**Pros:** one database, transactional audit with data writes for free. **Cons:** every host must add and migrate `opsconsole_*` tables before the console works; pollutes the app schema and its ER diagram; a broken host DB also loses the console's history of what went wrong.

#### Option C: In-memory only
**Pros:** simplest. **Cons:** no audit trail across restarts — disqualifying for an admin tool that can mutate data.

### D3 — How writes happen

#### Option A: Change-sets with preview, confirm, optimistic guard, audit, undo (chosen)
**Pros:** one code path for inline edit, bulk delete/update, undo and write-SQL; reviewable diff before anything touches the DB; concurrent edits detected; every row change is recoverable from `activity_log`. **Cons:** two round-trips per edit; change-set expiry and reconciliation logic to maintain.

#### Option B: Direct inline save (Adminer/sqladmin style)
**Pros:** fewer moving parts, one round-trip. **Cons:** no preview for bulk operations, no guard against editing a row someone else changed, audit has to be bolted on per endpoint.

#### Option C: Read-only console; use Adminer for writes
**Pros:** no write risk in our code. **Cons:** Adminer has no audit, no undo, no policy on masked columns, and no link to the app's checks; it also does not run under the Windows launcher without Docker.

### D4 — Authorization

#### Option A: Host `AuthPolicy` decides; console adds confirm + masking + audit (chosen)
**Pros:** one security boundary per app (ADR-0002's tiers keep applying); no second user store; the workbench's loopback rule is unchanged. **Cons:** a host with weak auth gets a weak console; the package cannot enforce a minimum beyond "writes off by default".

#### Option B: Console-owned users, roles and sessions
**Pros:** identical behaviour across hosts. **Cons:** a second credential store to secure, rotate and audit; conflicts with the host's existing per-investigation roles; more code in the most sensitive place.

### D5 — UI technology

#### Option A: Vanilla ES modules + CSS custom properties, no build (chosen)
**Pros:** embeddable in any host (iframe or div), no coupling to the host's frontend toolchain or React version, no build step in CI, themable by token override. **Cons:** we write a virtualised table, a diff viewer and a small SQL editor ourselves; no component ecosystem.

#### Option B: React components inside the Next.js app
**Pros:** shadcn/Tailwind widgets available; same look as the app. **Cons:** ties the console to this frontend; a Flask/Django host could not use it; the loopback API rule already makes the Next page a thin proxy anyway.

#### Option C: Separate SPA with its own build (Vite)
**Pros:** modern DX. **Cons:** a second build pipeline, a `dist/` to ship in the Python package, version skew between bundle and API — all cost with no benefit at this size.

### D6 — Real-time and background execution

#### Option A: SSE + polling fallback; single `TaskSupervisor` with threads (chosen)
**Pros:** works through every proxy; one-directional is all that is needed; polling remains correct on its own; one supervisor replaces four ad-hoc runners. **Cons:** per-worker state under multi-worker hosts (documented; cross-worker lock via the `runs` table).

#### Option B: WebSockets
**Pros:** bidirectional. **Cons:** nothing needs client→server streaming; more proxy trouble; more code.

#### Option C: External queue/worker (Celery/RQ + Redis)
**Pros:** durable background jobs. **Cons:** new infrastructure for a one-operator tool; contradicts the zero-new-infra goal; the workbench already runs OpenAleph's Redis, but coupling the console to it would break D1.

## Trade-off Analysis

The decisions trade short-term speed for a hard boundary. B-options in D1
and D5 would ship the next feature faster inside the workbench, but the
reuse requirement is explicit and the v1 code shows how quickly the
boundary erodes without a package line. D2 and D3 trade extra mechanism
(a second SQLite file, a change-set state machine, two-phase audit) for the
property that an admin UI with write access can never mutate data without a
reviewable, attributable, reversible record — which is the property that
makes enabling writes acceptable at all. D4 refuses to duplicate
authentication because the host already has a two-tier model (ADR-0002) and
a second one would be a second thing to get wrong. D6 keeps everything in
one process because the target hosts are single-worker local or
small-compose deployments; the multi-worker limitation is accepted and
written down rather than engineered away.

What this costs the workbench specifically: `console.py`,
`console_health.py`, `routes_console.py`, `static/console.html` and the body
of `frontend/app/console/page.tsx` are deleted and replaced by
`app/console_adapters.py` plus the package. Nothing user-visible regresses
at the end of phase 1 of the design.

## Consequences

- Easier: adding a console capability to a second app (adapters only);
  testing the console (fixture host with four tables, fakes for every
  adapter); reasoning about risk (writes off by default, every write
  audited, every destructive action previewed); embedding the UI anywhere.
- Harder: the package's generic introspection must handle every SQLAlchemy
  column type it meets (coercion layer with property tests); UI widgets are
  hand-written; console state is a second database to include in backups.
- Unchanged: the workbench's loopback rule, rate limits, security audit and
  ADR-0002 token tiers all sit in front of the console exactly as before.
- Revisit when: a host has many concurrent operators (`store="host"`),
  traffic history beyond a ring buffer is wanted (OTLP exporter), a
  non-FastAPI host appears (framework shim around `api/`), or true
  live-query subscriptions are needed (DB change capture).

## Action Items

1. [ ] Phase 1 — package skeleton: `mount`, `ConsoleConfig`, Protocols, manifest, store + in-package migrations, `EventBus`/SSE, `TaskSupervisor`, request hook; read sections (Overview, Schema, Data browse, Query read, Logs, Checks, Config); UI bundle.
2. [ ] Workbench adapters (`app/console_adapters.py`): auth, checks split out of `console_health.py`, tiles (openaleph, connectors, ai, security), pytest runner, jsonl log sources, `WorkbenchUsers`, `WorkbenchBackups`, table policy (mask `app_users.token_digest`).
3. [ ] Delete v1 console files; replace `tests/test_console.py` with the package suite (SQLite + Postgres in CI) plus a host manifest test.
4. [ ] Phase 2 — writes: change-sets, bulk, activity log, undo, write-mode SQL, config flags; `CONSOLE_WRITES` setting (`disabled` default in prod, `changesets` in the Windows launcher).
5. [ ] Phase 3 — tests section, API playground (send, act-as, traffic, probes, collections), migrations plan/upgrade.
6. [ ] Phase 4 — Users & Roles and Backups sections.
7. [ ] Phase 5 — extract `backend/opsconsole` to its own repository; second host adopts.
8. [ ] Mark this ADR **Accepted** when phase 1 ships and the "no `app.` imports" test is in CI.
