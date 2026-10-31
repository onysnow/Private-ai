# Review: the checks themselves (tests, test support, CI)

Scope: `backend/tests/`, `frontend/tests/`, `frontend/test-support/`, `.github/workflows/`, `tools/check_all.py`,
`backend/run_postgres_gate.py`, the Windows `.bat` launchers (to compare with CI). Checkout at f20472b.

How things were checked: files read; frontend tests run (`npx vitest run ...`) alone, as five files together four
times, and under 6–8 busy-loop CPU hogs on 4 cores; backend `test_migrations.py`, `test_models_split.py` and five
date-heavy files run under `TZ=UTC` and `TZ=Pacific/Kiritimati` (all passed); a scratch vitest
(`/tmp/claude-0/review/scratch/fe/wire-sum.test.ts`) called The Wire's `linkSentence`; a Python script walked the
model metadata against the backup's `RESTORE_ORDER`; the lockfile's `engines` fields were compared with the CI Node.
Not checked: CI run logs (no access), Ony's own Node version, anything on Windows itself.

Severity: high = a check that misses a wrong result people rely on, or a gate that is not actually doing its job;
medium = flakes or brittleness that cost time and teach people to ignore red; low = hygiene.

---

## A. Gaps: behaviour or schema nothing checks

### A1. PostgreSQL CI never tests the migrated schema: the gate drops it and the suite runs on `create_all` — HIGH
- `.github/workflows/backend-postgres-ci.yml` "Apply Alembic migrations on PostgreSQL" runs `alembic upgrade head`,
  then `run_postgres_gate.py:_reset_schema` (line 24) runs `DROP SCHEMA public CASCADE`, and
  `tests/conftest.py:_reset_database` rebuilds the schema with `Base.metadata.create_all`.
- So on PostgreSQL the whole suite runs on the models, not the migrations. The only check that migrations match the
  models is `tests/test_migrations.py::test_alembic_initial_schema_matches_metadata` (`alembic check`), which runs on
  **SQLite only**. A migration that is wrong only on PostgreSQL passes CI: a type, a server default, a constraint
  name, a `batch_alter_table` that leaves PG with an extra or missing column. That is the database a deployment uses.
- Change: in `backend-postgres-ci.yml`, after `alembic upgrade head`, add
  `python -m alembic check` (fails on drift) and `python -m alembic downgrade base && python -m alembic upgrade head`.
  Then either drop `_reset_schema` from the gate and have `conftest.py` build the schema with `alembic upgrade head`
  once per session (and keep only the row DELETEs between tests), or keep the reset and accept that the suite tests
  `create_all`. The `alembic check` step is the minimum.

### A2. Downgrades are tested only on an empty SQLite database — MEDIUM
- `test_migrations.py::test_alembic_round_trip` (line 51): upgrade head → downgrade base → upgrade head, no rows.
  This PR adds 17 migrations (`backend/alembic/versions/a1c5…`, `a7d3…`, `a7f3…`, `a8d2…`, `b1c4…`, `b2e5…`, `b4d2…`,
  `b6d2…`, `c7e3…`, `c8e4…`, `d3a7…`, `d7b3…`, `d8f4…`, `e4a7…`, `e6c1…`, `e9c4…`, `f7b3…`). On SQLite, adding or
  dropping a column on a table with foreign keys goes through `batch_alter_table`'s copy-and-rename, which is where
  rows get lost or a foreign key gets refused. With an empty database none of that runs.
- Change: add `test_each_revision_downgrades_and_upgrades_with_rows` to `test_migrations.py`. Walk
  `ScriptDirectory.from_config(cfg).walk_revisions()` from base to head. At each revision, insert one row into each
  table the revision touches, run `downgrade -1` then `upgrade +1`, and assert the rows in the tables it did not
  change are still there. Run the same round trip on PostgreSQL in CI (A1).

### A3. `test_alembic_initial_schema_matches_metadata` only checks that the model tables are a subset — LOW
- `test_migrations.py:42`: `assert expected <= live`. A table that migrations create but the models dropped passes this
  line. (`alembic check` would normally catch it, but only on SQLite; see A1.)
- Change: `assert live - {"alembic_version"} == expected`.

### A4. Backup round trip: new columns and most tables never go through export → restore — HIGH
- `test_export_backup.py::test_portable_backup_restores_into_fresh_database` restores one investigation, one entity
  and one document, and checks a few fields. `test_review_fixes.py::test_every_restorable_table_is_exported` and
  `test_ai_candidate_lifecycle_seams.py::test_restore_order_covers_every_investigation_owned_table` check that
  **table names** are listed. No test checks that a **column** survives the round trip. This PR adds columns such as
  `relationship_edges.payment_kind`, the claim-evidence `superseded` fields, document kind/language and the check
  and watchlist deciders. Wrong `_coerce_datetimes` handling, or a JSON column that comes back as a string, would
  fail no test.
- Also, the owned-table guard counts only tables with a **direct** foreign key to `investigations`. I walked the
  foreign keys transitively and found nothing missing today: every owned table is in `RESTORE_ORDER` or the
  `non_portable` list. A future child-of-a-child table would still slip past the guard.
- Change: add `test_every_column_of_every_restorable_table_round_trips`. For each table in `RESTORE_ORDER`, build one
  row with every column non-null, using a per-type value factory (str/int/float/bool/datetime/JSON) and parent ids in
  `RESTORE_ORDER` order. Export with `build_investigation_export`, restore into a fresh database built with
  `alembic upgrade head` (not `create_all`), and assert `_row_dict(restored) == _row_dict(original)` for every row.
  In the owned-table guard, replace the direct foreign-key test with a transitive one (any path to `investigations`).

### A5. Case isolation is checked by looking for a string in the source code, not by trying another case's records — HIGH
- `test_investigation_authorization.py::test_every_record_in_a_path_is_traced_to_its_investigation` (line 242)
  passes as long as `f'"{name}"'` appears **anywhere in the source text** of `authorization._resource_investigation_id`.
  A comment or a wrong branch is enough. 25 generic names are allowlisted (`pk`, `source`, `name`, `aid`, `bid`,
  `cid`, `qid`, `rid`, `tid`, `uid`, …), so a new route using any of them is never checked. Ids sent in the body or
  the query string (`evidence_id`, `claim_id`, `by_evidence_id`, …) are not covered at all. The behavioural tests
  (`test_remote_scoped_routes_hide_other_investigations…`, `test_decks_writeups_and_relationships…`) cover a
  hand-picked set of routes.
- The nested lookups I spot-checked do filter correctly: `routes_ai_runs._run_row`, `stories.section_of`,
  `routes_stories._version`. The gap is the check, not those routes.
- Change: add a parametrized test that seeds case A and case B with one record of every kind (reuse the demo-case
  builder) and sets `api_auth_investigation_ids="A"` with a reporter token. Then, for every `app.openapi()` path with
  a `{…_id}` parameter, call each method with B's id and assert 403/404 and no B id in the response body. For every
  request body schema with a `*_id` field, send B's id with A's `investigation_id` and assert 4xx. Keep the
  source-text test as a fast lint if wanted, but make the behavioural test the gate.

### A6. Owed amounts are tested for the ledger, standing, money checks, charts and Red Flags, but not for The Wire, which also adds currencies together — HIGH
- `test_payment_kinds.py::test_an_amount_owed_is_listed_apart_and_never_counted_as_money_that_moved` covers
  `/financial-flows`, `/standing`, `/money-checks`, `payments_by_party` and the Red Flag rules (`graph.py` puts owed
  links in `out.owed`). The Wire is not covered:
  - `backend/app/services/wire.py:128-131` sends every `Payment` link with its `amount` and no `payment_kind`.
  - `frontend/features/the-wire/wire-engine.ts:132` (`linkSentence`), `:253` (strand `S.sum`) and `:1310` (the path
    hop label) add up every money link, so a fine or an agreed price reads as "paid …".
  - The same sums never split by currency: strands are keyed by family, direction and certainty
    (`wire-engine.ts:251`), and the result is formatted in the first link's currency.
    **Verified**: `linkSentence('money', [13,000 EUR, 5,000 USD])` returns `"paid 18,000 EUR · 2× · May 2016"`
    (scratch test above).
- Change (app): send `payment_kind` from `wire.py`. In `wire-engine.ts`, leave links where `is_owed` is true out of
  the sums (show them as "owed …"), and key strands by currency, or write "13,000 EUR and 5,000 USD" as
  `missing_property._paid_text` already does.
- Change (tests): in `test-the-wire.test.tsx`, add a case with a fine and a two-currency pair between the same
  parties. Assert the sentence reads no "paid" for the fine and both currencies for the pair. In
  `backend/tests/test_wire.py`, assert `payment_kind` is in each link.

---

## B. Timing-dependent tests (fail under load)

Common cause: the screen waits on a **real** interval (TanStack `refetchInterval`, `waitForJob`'s `setTimeout`, a
component `setInterval`, jsdom's 16 ms `requestAnimationFrame`), and the test waits on real time with a fixed
margin. Several tests also set `{timeout: 3000/4000}`, which is **shorter** than the suite default of 5000
(`test-setup.ts`, `asyncUtilTimeout: 5000`), so those overrides make the margin smaller, not larger. None of these
failed in my 4 combined runs or under CPU hogs, except the-wire once (B1). The margins below come from the code, not
from a reproduced failure.

### B1. `frontend/tests/test-the-wire.test.tsx` — rAF-driven engine; the test polls for a passing state — MEDIUM
- Failed once, in the first cold run of `the-wire + captures + page-claims` together: 2 tests failed. One was
  `opens a link with its panel…`, where the `waitFor` at line 282 never found a visible `.elab` holding
  "owns 100%". It passed alone, in 4 later combined runs, and with 6 CPU hogs.
- Cause, from the code: `wire-engine.ts` places the labels inside `frame()`, run by `requestAnimationFrame`.
  jsdom's rAF is a real `setInterval(…, 1000/60)` (`node_modules/jsdom/lib/jsdom/browser/Window.js:604`). The
  view is rebuilt when the second query (`/graph`) lands and when the boot timer (`wire-engine.ts:2053`) calls
  `go('party')`. So label visibility changes while the test is polling for it. The comment at test line 209 says so:
  "The calm descent … can still be redrawing the links: press J until one stays lit."
- Change: let the engine settle on demand. Either add `vi.useFakeTimers({toFake: ['requestAnimationFrame',
  'cancelAnimationFrame', 'setTimeout', 'performance']})` and `await act(() => vi.runAllTimersAsync())` after
  the data loads, or export a `settle()` from the engine that runs `frame()` until `tw` is null. Then assert the
  label once, with no J-press loop.

### B2. `frontend/tests/test-captures.test.tsx:176` — real 1500 ms poll, 4000 ms wait — MEDIUM
- `features/the-drop/captures.tsx:591` refetches every 1500 ms. The test waits for a second GET with
  `{timeout: 4000}`. The first render and fetch get 2.5 s, below the 5 s default.
- Change: `vi.useFakeTimers({shouldAdvanceTime: true})`, wait for the first GET, then
  `await act(() => vi.advanceTimersByTimeAsync(1500))`, then expect two calls. Also unit-test the `refetchInterval`
  predicate (a finished capture with an unfinished job gives 1500). Drop the `{timeout: 4000}`.

### B3. Job-poll page tests: `test-documents.test.tsx:423`, `test-page-documents.test.tsx:262`, `test-openaleph-names.test.tsx:206` — MEDIUM
- `lib/jobs.ts:13` sleeps 1000 ms for real between polls. Each test needs two polls, then two or three more fetches,
  within `{timeout: 4000}`.
- Change: `waitForJob` already takes `sleep` in `WaitOptions`. Route it from a test seam, for example a
  `JobPollContext` or a module-level `setJobPollSleep()` that `test-setup.ts` sets to `() => Promise.resolve()`.
  Then drop the `{timeout: 4000}` overrides.

### B4. `frontend/tests/test-settings-panes.test.tsx:302, 339, 351` — real sleeps against a 2000 ms `setInterval` — MEDIUM
- `features/inbox/interrupt-notice.tsx:58` checks for a calm zone every 2000 ms. "waits while a calm zone is on
  screen" gives `findByRole` 3000 ms (1 s margin). "(control) without the snooze…" sleeps **2500 ms of real time** and
  expects the alert (0.5 s margin). "hears a snooze…" sleeps 2500 ms and expects none, which passes even when the
  interval never fired, so it checks nothing under load. Commit 8a8bec1 fixed only the fold test in this file.
- Change: use the fold test's pattern. Fake timers with `shouldAdvanceTime`, `await act(async () => {})` to flush
  effects, `act(() => vi.advanceTimersByTime(2000 + 10))`, then assert. For the snooze test, also assert that the
  calm check ran (spy `querySelectorAll` or expose `CALM_POLL_MS`).

### B5. `frontend/tests/test-red-flags-board.test.tsx:413-415` — real `REPLAY_MS = 1600` steps, 3000 ms waits — LOW
- `features/act/red-flags-board.tsx:145,179`. Each step gets 1.4 s of margin.
- Change: fake timers, then `advanceTimersByTime(REPLAY_MS)` per step (export `REPLAY_MS`).

### B6. Vendored water simulations take a CPU each while the page tests run beside them — MEDIUM
- Measured here: `effects/water/film.test.ts` "small drops hold…" took **23.1 s**, `sim.test.ts` "grid never misses a
  pair" 11.9 s, `lanes.test.ts` 7.9 s (each has its own `{timeout: 60000–120000}`, so they do not time out
  themselves). `vitest.config.ts` runs them in the same pool as the jsdom page tests. While they run, the page tests'
  real intervals (B1–B5) get less CPU. That fits the pattern seen: failures only in full parallel runs. The
  evaporation test was shrunk in 8a8bec1; these three were not.
- Change: in `vitest.config.ts`, split into `test.projects`: `{name: 'app', include: ['tests/**']}` and
  `{name: 'effects', include: ['vendor/onysnow-effects/**/*.test.*'], pool: 'forks', maxWorkers: 1}`. In CI, run them
  as two steps (`vitest run --project app` then `--project effects`). Also shrink film/sim panes as was done for
  evaporation (the same change belongs upstream in onysnow/onysnow-studios, ADR-0009).

### B7. Backend wall-clock assertions — MEDIUM
- `test_background_jobs.py:165` requires `health_seconds < 0.75` while another thread is uploading.
  `test_background_jobs_procrastinate.py:63` (`< 3`), `:69` (`< 0.75`), `:144` (`< 1.0`). `test_detection_specs.py:206`
  (`< 10`). `test_review_fixes.py:444` (`< 2`). `test_document_reader.py:50` sleeps 0.5 s after `SIGKILL` and assumes
  the pool has noticed by then.
- Change: assert order, not duration. Make the slow read wait on a `threading.Event`. Call `/api/health` while the
  event is not set, and assert it returned and `not read_done.is_set()`. Then set the event and join. For the
  quadratic-time and loop-bound tests, count work (iterations or a call counter), not seconds. For the reader,
  poll `document_reader._pool` state for up to 10 s instead of `sleep(0.5)`.

---

## C. Checks that break on harmless changes

### C1. `backend/tests/test_models_split.py:27,32` — hard-coded 92 / 91 — LOW
- These lines were edited in 5 of this PR's commits. The numbers catch nothing the next lines don't: each model is
  already checked to be re-exported and mapped.
- Change: replace line 27 with
  `assert set(domain.__all__) == {m.class_.__name__ for m in Base.registry.mappers} | {"uid"}` and
  `len(domain.__all__) == len(set(domain.__all__))`. Replace line 32 with the migrated-schema equality from A3, which
  catches the real bug (a model with no migration, or a migration with no model).

### C2. `backend/tests/test_catalogue_api.py:18` — `len(found) == 42` areas — LOW
- The areas come from the Authority System Suite (a beta, bundled in `authority-suite-sdk`). A suite release that
  adds an area fails this app test, though the app has no bug.
- Change: compare against the suite's own list (`len(suite_catalog.areas()) - 1` for APP, or whatever function backs
  `/api/catalogue/areas`). Keep `all(a["indicators"] >= a["verified"] > 0 …)`.

### C3. Page tests fail on any request no one mocked; `page-routes.ts` is hand-kept — MEDIUM
- 35 test files assert `api.unmatched()).toEqual([])` (`test-documents` 7 times, `test-claims`/`test-dossier`/
  `test-page-review` 6). An unmatched route answers 404 (`test-support/mock-api.ts:93`). A new panel on the page
  adds a request, which breaks every page test until `test-support/page-routes.ts` (467 lines) gets the route.
  It was edited in 12 commits of this PR. The replies there are typed only as `Record<string, unknown>`
  (`page-routes.ts:24`), so they can also drift from the API shapes without failing anything.
- The real bug this was guarding against is a front end calling a route that does not exist, or the wrong method.
- Change: in `mockApi`, give an unconfigured route that **exists** in `frontend/openapi.json` a default reply
  (`[]` for array responses, else a minimal object built from the schema) and record it as `defaulted`. Record a
  route **not** in `openapi.json` as `unknown`. Tests assert `api.unknown()).toEqual([])` (always) and keep
  `unmatched` only where a test is about that route. Check the fixtures in `page-routes.ts` against the generated
  validators (`lib/api-validate.ts`, or a zod schema from `@hey-api/openapi-ts`) in a single test, as
  `test_visuals_kinds.py` already does for `chart-kinds.json`.

### C4. Exact UI copy in assertions — MEDIUM
- 391 assertions in `frontend/tests` match a literal of 40+ characters (`toHaveTextContent`/`getByText`/`toContain`/
  `toBe`). Ony's 29–30 Oct "show only what matters" rule moved many of these sentences behind hover. Commit
  fcd440e is typical: it rewrote eight assertions such as `'0 third-party services. 1 source is asked directly, 1 has
  no monitor.'`, `'Harbour Nominees paid Fernhill Ltd four times'` and `'At risk: edited twice since first seen'`
  without any behaviour changing.
- Change: assert the data and the structure, not the sentence. Use roles and accessible names (`getByRole('img',
  {name: /At risk/})`), regexes on the parts that carry facts (`/2 new/`, numbers, party names, dates, currency), and
  `toBeVisible()` or `closest('[hidden]')` for the shown/hidden rule. Keep word-for-word checks for sentence builders
  where the words *are* the result (`linkSentence`, `laneSummary`, `riskWord`, money and date formatting), and test
  them as units.

### C5. `test_investigation_authorization.py:242` — a source-text grep (see A5) — included here because it is also brittle: renaming a local variable in `_resource_investigation_id` can fail it with no change in behaviour.

---

## D. CI and Ony's Windows PC

### D1. Node 22.18.0 in CI is below what the lockfile needs — MEDIUM
- `frontend-ci.yml` and `render-ci.yml` pin `node-version: '22.18.0'`. The lockfile has `undici@8.12.3`
  (`>=22.19.0`) and `jsdom@30.1.3`, `@asamuzakjp/css-color@7.1.7`, `@asamuzakjp/dom-selector@10.0.4`,
  `w3c-xmlserializer@6.0.0` (`^22.22.2 || ^24.15.0 || >=26`). That is where the EBADENGINE warnings come from, and the
  test environment (jsdom) runs on a Node it does not support. `frontend/package.json` still says
  `"node": ">=22.18.0 <23"`. `backend/Dockerfile:5` builds the shipped screen on a floating `node:22-alpine`, so CI
  tests on one Node and the image builds on another. The sandbox here is 22.22.0, also below 22.22.2.
- Change: add `frontend/.nvmrc` with `22.22.2` (or a newer 22.x). In both workflows use
  `node-version-file: frontend/.nvmrc`. Set `engines.node` to `">=22.22.2 <23"`. Add `frontend/.npmrc` with
  `engine-strict=true` so a wrong Node fails `npm ci` instead of warning. Pin `FROM node:22.22.2-alpine` in
  `backend/Dockerfile`, and `render/Dockerfile:6` likewise.

### D2. The SQLite suite never runs in CI, and SQLite is what Ony's PC uses — HIGH
- The only workflow that runs `pytest` is `backend-postgres-ci.yml`, with `DATABASE_URL` set to PostgreSQL, so
  `conftest.py` keeps PostgreSQL. The app on Ony's PC uses `./journalism.db` (SQLite) through the
  `Start without Docker` launcher. Behaviour that differs on SQLite (no FK enforcement without the pragma,
  case-insensitive LIKE, JSON in TEXT, `batch_alter_table` migrations) is only tested when someone runs
  `tools/check_all.py` locally. That takes about two hours, so it is effectively CI-only in the other direction.
- Change: add a `backend-sqlite` job, or a matrix entry `db: [sqlite, postgres]` that leaves `DATABASE_URL` unset
  for SQLite. Add `pytest-xdist` to `requirements-test.txt` and run `-n auto`. `conftest.py` already makes a fresh
  temporary SQLite file per process, so each xdist worker gets its own. Not checked: whether the tests that start
  the render server or a local Playwright page bind fixed ports.

### D3. CI never runs on Windows; Python 3.12 matches — MEDIUM
- Python: every `.bat` launcher requires 3.12 and rebuilds a `.venv` that is not 3.12. CI (`setup-python` "3.12")
  and `backend/Dockerfile` (`python:3.12-slim`) match. The patch level floats in all three, which is fine.
- Not matched: the OS. Tests that behave differently on Windows, none of which CI would see:
  - `test_basemap.py:84,92` call `Path.symlink_to`, which needs Developer Mode or admin on Windows; otherwise it
    raises `OSError` (inferred, not run).
  - `test_connector_credentials.py:15-24` asserts `permissions_restricted: True` on every OS and skips only the mode
    check on `nt`. `app/services/credentials.py:125` returns True on Windows whenever the file exists, without
    checking any ACL. On Ony's platform the test locks in an unchecked claim, and Settings tells him his
    connector-keys file is restricted when nothing checked that.
  - `test_document_reader.py:41` is skipped where there is no `SIGKILL` (correctly), so the reader-crash path is
    untested on Windows.
  - The documented test command `TZ=UTC python -m pytest …` (CLAUDE.md, START_HERE.md:98) is bash syntax. It does
    not work in Windows Command Prompt, which CLAUDE.md says Ony uses.
- Change: add a `windows-latest` job running the SQLite suite (or at least `test_migrations.py`,
  `test_connector_credentials.py`, `test_basemap.py`, `test_export_backup.py`, `test_restore_*`). Mark the symlink
  test `skipif(os.name == "nt" and not _can_symlink())`. Make `credential_status` report `"storage_protection":
  "unchecked"` and `permissions_restricted: None` on Windows unless an ACL check is added, and assert that.
  In `conftest.py`, set `os.environ.setdefault("TZ", "UTC")` (plus `time.tzset()` where it exists) so no shell
  prefix is needed. Not verified on Windows whether that is enough for the rigour/FtM import chain.

### D4. `tools/check_all.py` says it runs "every check CI runs", but misses some — LOW
- Missing: the Alembic single-head check, `alembic upgrade head` (and the `alembic check` from A1), and the Docker
  build. ESLint runs without `--max-warnings 0`; 2 warnings pass today (`components/entity-form.tsx:21`,
  `features/ai/before-you-run.tsx:265`).
- Change: add an `alembic heads` count == 1 step and `alembic check` against a temporary SQLite file to
  `backend_checks()`. Change `"lint"` to `eslint . --ext .ts,.tsx --max-warnings 0` once the two warnings are fixed.

### D5. No timeouts on the backend job, and a path filter that misses a shared fixture — LOW
- `backend-postgres-ci.yml` has no `timeout-minutes`, and `pytest-timeout` is not installed. A hung test (threads,
  Playwright, a subprocess) holds the runner for GitHub's 6-hour limit.
- `backend/tests/test_visuals_kinds.py:411` reads `frontend/test-support/chart-kinds.json`, but backend CI triggers
  only on `backend/**`. A change to the fixture alone never runs the backend test that checks it.
- Change: add `timeout-minutes: 150` to the job and `pytest-timeout` with `--timeout=300` in `addopts`. Add
  `frontend/test-support/chart-kinds.json` to both `paths:` lists in `backend-postgres-ci.yml`.

### D6. Lint and type checks cover a small part of the backend — LOW
- `[tool.ruff] include` and `[tool.mypy] files` cover `app/connectors`, `app/core/{access,config,time}.py`,
  `app/console_adapters.py` and `opsconsole`. Routes, services, models, `exports.py` and the migrations are not
  checked. The workflow comments say the scope will be widened later.
- Change: add `app/services/exports.py`, `app/core/authorization.py` and `app/db/` to both scopes first. These are
  where a type slip loses data or leaks across cases.
