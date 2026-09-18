# Dev Log — Private-ai (Claude session/ops log)

This file is separate from `BUILD_STATE.md`. `BUILD_STATE.md` is the
product/feature changelog (what the Journalism Workbench app can do).
This file is the **operations log for Claude's own autonomous work** on
this repo across sessions/wakeups: PR triage, CI diagnosis, merges,
branch hygiene, and the reasoning behind decisions. It exists so that a
Claude session picking this backlog back up — after a context
compaction, a new session, or a scheduled wakeup — can reconstruct
current state without depending on conversation memory, which is lossy
(see claude-log.md for the raw prompts/responses that led to these
entries).

Convention: append new entries at the bottom, newest last, each dated
and tagged with what changed. Keep the "Current state" section below
up to date every cycle — read that first if you're picking this up
cold.

## Current state (updated each cycle — read this first)

- **Open PRs on Private-ai:** none. `REMEDIATION_PROMPT.md` (fix-side
  companion to the structure audit) is in place, pushed directly to
  `dev` -- see its Stage A-F order for how the remaining findings
  get worked through.
- **Remediation Stage A done (STRUCT-0009):** `security_controls.py`
  split into `request_limits.py` / `rate_limiter.py` / `audit_log.py`,
  pushed directly to `dev`. Full 216-test suite reverified passing
  after, identical count.
- **Remediation Stage B done -- task #35 finally fixed.** Root cause
  (via the GitHub web UI, exactly as flagged): line 51's
  `if: ${{ secrets.TAS_REPO_TOKEN != '' }}` -- `secrets` is not a
  valid named-value inside an `if:` at all (actions/runner#520).
  This workflow had never successfully dispatched, on any commit,
  ever. Fixed by moving the token into the job-level `env:` block and
  reading `env.TAS_REPO_TOKEN` in the `if:` instead. Run #94 (commit
  `3b734ed`) is this workflow's first-ever green run -- backend
  pytest suite passed against real PostgreSQL, not sqlite.
- **Remediation Stage F done -- STRUCT-0006's actual fix finally
  landed.** Added a "Verify Alembic migration chain has a single
  head" step to backend-postgres-ci.yml (now that Stage B gives it
  somewhere to run). Verified green on run #95 (commit `bcdf640`).
  **`backend-postgres-ci.yml` is now a real, working CI gate for the
  first time this session** -- "CI is green" finally means the
  backend test suite actually ran, on this repo, in CI.
- **Remediation Stages C, D, E not started** (app-factory refactor,
  conftest.py + test isolation, and the routes.py split respectively)
  -- queued in that order per REMEDIATION_PROMPT.md.
- **Open question for Ony, not decided unilaterally:** whether to add
  `backend-postgres-ci.yml` as a required status check in GitHub's
  branch protection settings, now that it actually works -- a repo-
  settings change, not something done from code.
- **task #35 (backend-postgres-ci.yml push-trigger failure)** —
  diagnosed but NOT yet root-caused. Confirmed facts: the workflow's
  YAML is valid (parses fine, schema-plausible, structurally identical
  in shape to the working workflows); the action tags it pins
  (`checkout@v7`, `setup-python@v7`) genuinely exist; it is not a
  stale-check artifact (reproduced fresh via a real push with a
  trivial content edit, still failed identically); it is not an
  account-wide Actions outage (sibling workflows — CodeQL, docker-build,
  frontend, Analyze — succeed on the exact same commits). The run
  itself is created (shows up under the workflow's own run history)
  but completes in 0 duration with 0 jobs and 0 check-runs, conclusion
  `failure`, and GitHub refuses to let it be rerun ("This workflow run
  cannot be retried" — a 403 GitHub reserves for dispatch-level
  configuration failures, not job failures). The run's `name` field
  also falls back to the file path instead of showing the declared
  `name: Backend PostgreSQL CI` — a concrete sign GitHub's workflow
  processor isn't fully resolving this file's top-level metadata, even
  though generic YAML parsing succeeds. This needs a look at the
  GitHub web UI's Actions tab directly (it surfaces a human-readable
  "Invalid workflow file" banner in this exact failure mode that the
  REST API does not expose) — not yet done. Do not re-diagnose from
  scratch next cycle; start from the web UI banner.
- **Issue #36 (backend LLM reasoning layer) — DONE, merged.** Both
  endpoints (case-synthesis, hypothesis-test), strict schema +
  citation validation, the review endpoint, and 6 passing tests
  landed via PR #49 (squash-merged to main @ `2cff5c6`). Issue #36
  auto-closed. Task #54's backend-completion gate: re-confirm with Ony
  whether this satisfies it before starting any frontend work
  (#43/#44/#45).
- **Structure audit v1 findings — mostly resolved this cycle (PR #50,
  pending merge).** STRUCT-0001/STRUCT-0004 self-corrected: the
  original BLOCKING call against `followthemoney==4.11.0` was a
  transient PyPI index-propagation delay, not a real problem (the pin
  is genuinely installable; re-verified via the PyPI JSON API and a
  clean dependency resolution). The real, narrower, still-unverified-
  in-sandbox residual risk is `pyicu`'s system ICU/pkg-config build
  requirement (this device_bash VM can't `apt-get install` as root to
  check). STRUCT-0003 (unused `pypdf` dependency) removed. STRUCT-0005
  (CI action version drift) fixed — all 4 workflow files now pin
  `actions/checkout@v7` consistently. STRUCT-0007 (.env.example gaps)
  fixed — all 5 missing `Settings` keys added, 0 remain missing.
  STRUCT-0002 (`routes.py`, 1797 lines/117 endpoints, needs a module
  split) is deliberately **not** fixed yet — see "Deliberate non-
  fix" note below. Passes 2 (model/migration diff beyond this
  cycle's table), 6 (frontend components), and 10 (full docs-hygiene
  sweep) still haven't been run — don't treat the audit as exhaustive.
- **Working-branch convention:** `dev` is the shared unprotected branch
  for day-to-day pushes (no PR needed there); `main` still requires a
  clean PR. Don't conflate the two.
- **Deliberate non-fix: the `routes.py` split.** Ony asked to hold
  everything to "the highest standards" and structure the codebase
  "for human development." The routes.py split is real and warranted
  (STRUCT-0002), but this repo's own `.github/copilot-instructions.md`
  requires PRs stay scoped to one concern and requires the full test
  suite pass before any backend-touching PR — rushing a 117-endpoint
  file split into this same cycle, without dedicated regression
  coverage for the reorganization itself, would violate the very
  standard being invoked. Deferred to its own future PR. The concrete
  ~10-module breakdown (settings, search/assistant, investigations,
  entities, relationships, documents/extraction, evidence/claims,
  leads/reporting, connectors/enrichment, resolution) still needs to
  be written into STRUCTURE_AUDIT.md as a ready-to-execute plan — not
  done yet.

### Practical notes learned this cycle (save yourself the pain)

- `$HOME/mnt/Documents/...` on the linked Windows machine is a mounted
  folder and is **slow for many small file writes**. A plain
  `npm install` there stalls past device_bash's 180s cap and can even
  leave `node_modules` in a broken half-renamed state (`ENOTEMPTY`
  errors) if it gets killed mid-install. If you only need to
  regenerate `package-lock.json` (e.g. after resolving a
  package.json merge conflict), use
  `npm install --package-lock-only --prefer-offline` instead — it
  skips writing node_modules to disk and finishes in seconds.
- `gh` is not installed on this device. Use `curl` +
  `$(grep -oP '(?<=x-access-token:)[^@]+' ~/.git-credentials)` against
  the GitHub REST API instead for PR/CI status, merges, etc.
- `mergeable_state` can read stale/`dirty` right after another PR
  merges into main — GitHub recomputes it async. Re-fetch 2-3 times
  with a short delay before treating a conflict as real (in this case
  it was real and consistent across 3 fetches).
- This device's system `python3` is 3.10 — too old for this codebase
  (`app/core/time.py` uses `datetime.UTC`, needs 3.11+). `uv` is
  installed on this device though: `uv python install 3.12 && uv venv
  <path> --python 3.12` gets a working interpreter fast, then
  `uv pip install --python <path>/bin/python <pkgs>` for deps. The
  pinned `backend/requirements.txt` isn't fully installable here as of
  this cycle (`followthemoney==4.11.0` doesn't exist on PyPI at that
  pin) — for a quick alembic/model sanity check, installing just the
  handful of packages the import chain actually needs (alembic,
  sqlalchemy, pydantic-settings, psycopg, fastapi) is much faster and
  sufficient; don't burn time on the full requirements.txt unless the
  task actually needs to run the app/tests for real.

## Entries

### 2026-09-17 — Session resumed, backlog re-verified, PR #27 conflict fixed
- Picked up "continue the Private-ai + Authority Systems backlog"
  after a conversation compaction had lost the specifics. Verified via
  `TaskList` and by finding the actual repos on Ony's linked Windows
  machine (`$HOME/mnt/Documents/Private-ai`,
  `.../topic-authority-system`) that the backlog is real (it wasn't
  obvious from conversation context alone after compaction — see
  claude-log.md for the trust/verification exchange this triggered).
- Maintenance pass (task #55): checked mergeable_state/CI on all
  supposedly-open PRs via the GitHub API. Found PR #47 (Private-ai)
  and PR #1 (topic-authority-system, CORE/CONTROL_SURFACE.md) were
  *already merged* (18:24 UTC) — presumably from an earlier wakeup
  cycle this same session. Only PR #27 remained open.
- Diagnosed and fixed PR #27's merge conflict (see "Current state"
  above for the technical detail). Pushed the fix, CI is now running
  against the new commit.
- Created this log and `claude-log.md` at Ony's request, to double as
  the "continuous context store" he asked for separately — the
  "Current state" section above is the fast-import summary; the
  dated entries below are the full history for anyone who needs the
  detail.

### 2026-09-17 — Task #35 diagnosed (partially), Issue #36 part 1/2 shipped
- Confirmed PR #27 fully green after the fix and merged it (squash,
  `1852356`) via the GitHub API — repo requires squash/rebase merges,
  plain "merge" is disabled (`allow_merge_commit: false`).
- Spent real effort on task #35 (see "Current state" above for the
  full finding) but did not reach root cause — narrowed it a lot
  without needing to guess further. Flagged exactly where to pick this
  up (the web UI Actions tab banner) rather than leaving a vague
  "still broken" note.
- Started issue #36 (explicitly the top engineering priority). While
  wiring up the Alembic migration, discovered the existing migration
  chain had silently forked into two heads (`b84e2fa90c17` /
  `c05f9e3a1d64`) from two previously-merged PRs that were never
  reconciled — `alembic upgrade head` would have been ambiguous for
  anyone hitting this fresh. Added a merge migration to fix that as
  part of landing the new table, verified the whole chain top to
  bottom against a real sqlite db (up AND down), not just by reading
  it. Shipped the provider-agnostic LLM client + config + model +
  migrations to `dev` (`536e65e`); endpoints + citation validation +
  tests are next cycle's work.

### 2026-09-17 (cont'd) — Structure audit v1 run
- Ony asked for a full application-structure audit + a reusable prompt
  for it. Wrote `APPLICATION_STRUCTURE_AUDIT_PROMPT.md` (10 passes,
  reuses TAS's own audit-finding-record schema/severity taxonomy
  instead of inventing a new one) and ran a first pass, logged as
  `STRUCTURE_AUDIT.md`. Headline findings: `requirements.txt` pins
  `followthemoney==4.11.0`, which doesn't exist on PyPI (BLOCKING —
  breaks any clean install); `app/api/routes.py` is a single
  1797-line/117-endpoint file with zero sub-modules, inconsistent
  with the rest of the backend's per-concern file layout (MATERIAL);
  `pypdf` is a directly-declared dependency with active Dependabot
  security churn but zero actual references in the codebase
  (MATERIAL). Full detail and 4 more findings in STRUCTURE_AUDIT.md.
  Explicitly marked LIMITED REVIEW — passes 2/6/10 weren't done this
  cycle, don't treat this report as exhaustive.

### 2026-09-17 (cont'd) — PR #49 merged, issue #36 closed
- Opened PR #49 (dev -> main) bundling issue #36's full implementation
  with the structure audit v1 work. Waited for real CI (not a stale
  check), confirmed `mergeable_state: clean` and every triggered check
  (CodeQL, both Analyze jobs, both docker-build) passed, squash-merged.
  GitHub auto-closed issue #36 on merge (the PR body used "Closes #36").
  backend-postgres-ci.yml did not run on this PR — expected, it's the
  workflow with the still-unresolved dispatch failure (task #35), and
  this PR touches no backend/** files that would even change its
  behavior once fixed.
- Merged `origin/main` back into `dev` to keep the branches in sync.

### 2026-09-17 (cont'd) — "Highest standards" pass: audit fixes, self-correction, PR #50
- Ony: "And make sure the follow the highest standards for software
  development. And also make sure it's structure for human
  development." Took this as license to go back through
  `STRUCTURE_AUDIT.md`'s open findings and actually fix what was safe
  to fix mechanically, rather than just filing more findings.
- Re-investigated STRUCT-0001 (the BLOCKING `followthemoney==4.11.0`
  finding) before touching anything else, since a BLOCKING finding
  deserves more than one data point. Found the original conclusion was
  wrong: PyPI's index API and a clean `uv pip install --dry-run`
  resolution both show the pin is real and installable; the original
  failure was a transient propagation delay. Corrected the record
  (STRUCT-0001 -> NON_MATERIAL/VERIFIED, STRUCT-0004 ->
  VERIFIED/WITHDRAWN) instead of leaving a known-wrong BLOCKING
  finding on file — treated self-correction as part of "highest
  standards," not a discreditable admission.
- Removed the unused `pypdf` dependency, reconciled all 4 workflow
  files to `actions/checkout@v7` (+ `setup-node@v7` in
  frontend-ci.yml), and added the 5 `Settings` keys missing from
  `.env.example` (verified 0 remain missing).
- Wrote the underlying conventions into
  `.github/copilot-instructions.md` (new "Code organization
  standards" section) so they're enforceable/discoverable for future
  contributors, human or AI, not just something living in this
  session's working memory.
- Deliberately did NOT execute the `routes.py` split in this same
  pass — see "Deliberate non-fix" in Current state above for why.
- Verified nothing regressed: synced the changed backend files into
  the `~/workbench-local` local copy (faster than the network-mounted
  drive), put `alembic` on PATH, and ran the **full** backend test
  suite (`pytest tests/`, not just the two files touched by issue
  #36) — 216 tests, all passing.
- Confirmed via `git diff --stat origin/main origin/dev` that `dev`'s
  actual content delta over `main` is exactly this batch (PR #49's
  squash-merge means `dev`'s older commit-by-commit history no longer
  matches `main` commit-for-commit, but the tree content already
  converged — checked the diff directly instead of trusting `git log`
  range output, which would have wrongly suggested a dozen unmerged
  commits).
- Opened PR #50 (dev -> main) scoped to just this batch, per the
  project's own PR-scoping rule. Not yet merged — waiting for real CI
  before merging, same discipline as PR #27/#49.

### 2026-09-17 (cont'd) — Remediation prompt written, Stage A executed
- Ony asked to "create a prompt to address all of these issues" (the
  5 new findings + STRUCT-0006's reopening from the prior cycle).
  Wrote `REMEDIATION_PROMPT.md`, the fix-side companion to the audit
  prompt: a dependency-ordered stage plan (A-F) rather than a flat
  to-do list, since several findings genuinely depend on each other
  (a test-isolation fixture needs an app factory to override cleanly;
  a CI check needs a working CI workflow to add it to).
- Immediately executed Stage A (STRUCT-0009) to prove the prompt
  actually works end to end, not just as a plan: split
  `security_controls.py`'s three unrelated concerns into
  `request_limits.py`, `rate_limiter.py`, and `audit_log.py`, updated
  all 4 import sites, deleted the old file, verified with
  `py_compile` + a clean `app.main` import + the full 216-test suite
  (identical pass count, zero behavior change). Pushed directly to
  `dev` per the prompt's own rule that a pure mechanical move doesn't
  need a PR.
- Stages B (task #35 root cause -- needs the GitHub web UI, not
  another API-only pass), C (app-factory refactor), D (conftest.py +
  test isolation), E (the routes.py split, sliced into 8
  smallest-to-largest PRs), and F (STRUCT-0006's actual CI check) are
  still queued, in that order -- see `REMEDIATION_PROMPT.md` for the
  full reasoning behind the ordering.

### 2026-09-17 (cont'd) — Stages B and F: task #35 actually fixed
- Ony: "Okay go ahead and continue" -- the go-ahead to use the GitHub
  web UI (flagged as needed since API-only diagnosis had stalled on
  task #35 for the whole session).
- Opened `backend-postgres-ci.yml`'s run history in the browser and
  clicked into the latest failing run. The Annotations panel showed
  exactly what the REST API never surfaces: "Invalid workflow file
  ... (Line: 51, Col: 13): Unrecognized named-value: 'secrets'.
  Located at position 1 within expression:
  secrets.TAS_REPO_TOKEN != ''". Confirmed against
  actions/runner#520 (web search) that this is a real, documented
  Actions limitation -- `secrets` cannot be referenced inside an
  `if:` condition, full stop, regardless of job/step level.
- This resolves a genuine mystery that spanned this entire session:
  every "0 jobs, 0 duration, non-retryable failure" data point
  collected across many prior cycles was this exact static
  validation error. The workflow had literally never run
  successfully since the line was written -- not a flaky/transient
  issue, not an account-wide outage, not something that would have
  resolved itself.
- Fixed it (job-level env + `env.TAS_REPO_TOKEN` in the `if:`),
  pushed, and watched run #94 dispatch, execute all 12 real steps,
  and pass -- including the actual backend pytest suite against real
  PostgreSQL, for the first time.
- With a working workflow to add it to, immediately did Stage F too:
  added the single-Alembic-head CI check STRUCT-0006 always needed.
  Verified green on run #95.
- Net effect: `backend-postgres-ci.yml` is a real, functioning CI
  gate as of this cycle. Every PR/push going forward should show a
  real pytest result here rather than "0 jobs" -- if that ever
  regresses, don't re-diagnose from scratch; start from this entry
  and the actions/runner#520 restriction.

## Cycle: backend-postgres-ci required check + routes.py split (group 1)

- Made `backend-postgres` a required status check on `main`'s branch
  protection ruleset (GitHub rulesets API, ruleset id 23571038) --
  the recommendation STRUCT-0012 left open last cycle. A PR into
  `main` can no longer merge without this workflow passing.
- Split `backend/app/api/routes.py` (STRUCT-0002/0008), Stage E group
  1 of 8 (the smallest/lowest-risk group per REMEDIATION_PROMPT.md):
  extracted 9 single-endpoint routes (health, capabilities, OpenAleph
  status probe, search, timeline-event creation, relationship
  schemas, AI-analysis-candidate review, evidence creation,
  statement-assessment promotion) into a new `app/api/routes_system.py`,
  with inline validation logic moved into `app/services/evidence.py`
  and `app/services/timeline.py` (both raising `ValueError`, mapped
  to 400/409 by the route, matching the existing
  `create_canonical_relationship` convention). Added
  `app/api/dependencies.py` so both route modules share the same
  `authorize_request_resource` dependency without importing from each
  other. `routes.py`: 1859 -> ~1700 lines, 120 -> 111 endpoints.
- Hit and fixed a real assertion failure mid-split: the script
  removing the 9 function bodies assumed a uniform "2 blank lines"
  separator between top-level functions, but the file isn't
  consistent (some pairs have 1, some have 2). Rewrote the removal to
  match each function body without baking in trailing blank lines,
  then normalized any 3+ blank-line run left behind by a removal down
  to 2 blank lines with a single regex pass at the end -- more robust
  than trying to special-case each block's exact spacing.
- `ruff --select F401 --fix` on the trimmed routes.py removed 19
  now-dead imports (some pre-existing, most freed up by this
  extraction) -- used instead of manually reasoning about every name,
  per the plan.
- Full local-venv test run caught 2 real regressions before they
  could reach CI: three tests build their own minimal FastAPI app by
  hand (`from app.api.routes import router; app.include_router(router)`)
  instead of importing `app.main` -- they needed
  `routes_system.router` added too, since one of them (`/api/search`)
  hit a moved endpoint. And `test_openaleph_integration.py`
  monkeypatches `probe_openaleph` at the module level it's imported
  into, which had to move from `app.api.routes` to
  `app.api.routes_system`. Fixed both; this same pattern (hand-built
  test apps missing the new router) will need to be watched for in
  groups 2-8.
- Full backend suite: 214 passed, 0 failed, 0 regressions (rsynced to
  `$HOME/workbench-local/backend`, run via `$HOME/tmpvenv`). Committed
  and pushed to `dev` (`5f8de76`). Updated STRUCT-0002/0008 in
  `STRUCTURE_AUDIT.md` from OPEN to IN_PROGRESS with a note on what's
  done vs. remaining (groups 2-8: provenance/sources/reporting-tasks;
  extraction-candidates/enrichment/connectors/backups; relationships/
  leads/claims; connector-findings/documents; settings; entities;
  investigations).
- Logged 4 new structure-audit findings answering the "is there
  real type-safety/test coverage" question (STRUCT-0013 through
  STRUCT-0016): mypy is scoped to 4 files and not run in CI at all;
  frontend ESLint doesn't enforce explicit function return types or
  ban `any`; frontend has exactly one 32-line test file; backend
  coverage is a real 86% but has no `--cov-fail-under` floor. These
  are informational for now -- not yet acted on, since the user's
  explicit instruction this cycle was to finish the routes.py split
  first. Next cycle should check whether to tackle these or continue
  groups 2-8 of the split.

## Cycle: routes.py split group 2 (provenance, sources, reporting-tasks)

- Extracted the 6 endpoints under /provenance, /sources, and
  /reporting-tasks into three new route modules
  (routes_provenance.py, routes_sources.py,
  routes_reporting_tasks.py), each domain getting its own file rather
  than one shared "group 2" module -- provenance, sources, and
  reporting-tasks are genuinely separate domains, unlike group 1's
  disparate one-off endpoints. Added a new app/services/sources.py;
  reporting-task logic went into the existing app/services/leads.py
  since it already owns TASK_STATUSES/PRIORITIES/serialize_task/
  make_task_workflow_event.
- Caught a subtlety before it became a silent behavior change: the
  existing provenance.py already had a private
  _record_extraction_lineage() helper with a richer evidence-to-claim
  fallback than the /provenance/extraction-lineage endpoint's inline
  query ever had. Wrote a separate, narrower
  find_extraction_lineage() rather than reusing the richer helper --
  reusing it would have quietly made the endpoint smarter, which
  isn't what "pure refactor" means.
- Two more monkeypatch-target/hand-built-app fixes, same failure mode
  as group 1's: test_ingestion_deletion_coordination.py calls
  routes.create_source(...) directly (bypassing HTTP) and patches
  app.api.routes.lock_investigation_transaction -- both had to follow
  the endpoint to app.api.routes_sources. This time, instead of
  patching just the tests that broke, added all four route modules
  that exist so far to every hand-built test app, since three
  separate test files build their own minimal FastAPI app by hand
  and this exact failure mode will otherwise recur every single
  group through group 8.
- Hit a real git problem worth logging: .git/index.lock (and a
  submodule's index.lock under backend/app/ai/tas_spec) couldn't be
  unlinked by git after normal use -- delete wasn't yet enabled for
  this session's connected folder, so stale lock files were piling
  up and would eventually have blocked commits outright. Requested
  and got delete permission, cleared the stale locks. If future
  cycles see "unable to unlink .git/index.lock" warnings again after
  this, it means delete permission didn't carry over to a new
  session -- request it again rather than treating it as some
  git corruption to diagnose.
- Full backend suite: 214 passed, 0 failed. Committed and pushed to
  `dev` (`cc71e90`). STRUCT-0002/0008 updated with group 2 progress.
- User has since asked for two things once the full split (groups
  2-8, this cycle onward) is complete: (1) run the entire
  `engineering:*` skill suite (architecture, code-review, debug,
  deploy-checklist, documentation, incident-response, standup,
  system-design, tech-debt, testing-strategy) across the whole
  project as a follow-on audit pass, and (2) use Firecrawl for TAS
  and development research going forward, plus consider (not yet
  committed to) integrating Firecrawl directly into Private-ai
  itself as a research feature. Explicitly sequenced: finish the
  routes.py split first, per user decision, before either of those.

## Cycle: routes.py split group 3 (extraction-candidates, enrichment-sessions, connectors, backups)

- Extracted 12 endpoints into 4 new route modules. The interesting
  part of this group was a cross-group dependency: /connectors and
  /entities/{id}/enrich* share three private helpers
  (_persist_connector_findings, _run_connector, _enrich_entity) that
  actually run a connector and persist its findings. Moved all three
  to a new app/services/connectors.py now (rather than waiting for
  group 7's entities extraction to hit the same code), and had
  routes.py re-import them under their old private names so the
  /entities endpoints still in routes.py don't need to change until
  group 7 actually moves them.
- Also surfaced a second cross-group shared helper the same way:
  _read_upload_limited (upload-size limiting) is used by both
  /backups/* (this group) and the document-ingest endpoint (still in
  routes.py, pending group 5). Moved it to
  app.api.dependencies.read_upload_limited alongside
  authorize_request_resource, same re-import-under-old-name pattern.
- Proactively added the four new routers to all three hand-built
  test apps before running the suite, rather than waiting for a
  failure -- paid off: full suite passed clean on the first attempt,
  no follow-up fixes needed this group (groups 1 and 2 each needed
  1-2 follow-up fixes after the first full-suite run).
- Full backend suite: 214 passed, 0 failed. Committed and pushed to
  `dev` (`d01b02f`). STRUCT-0002/0008 updated with group 3 progress.
- Pattern worth remembering for groups 4-8: before writing new route
  modules, grep the target endpoints' bodies for any private
  `_helper` functions they call, and check whether those helpers are
  *also* called by endpoints outside the current group. If so,
  promote the helper to a services/ module now and re-import it under
  its old name in routes.py, rather than duplicating logic or leaving
  a route module importing a private symbol from routes.py.

## Cycle: routes.py split group 4 (relationships, leads, claims)

- Extracted 18 endpoints -- the biggest group yet -- into
  routes_relationships.py, routes_claims.py, routes_leads.py.
  Relationships were already thin adapters (no new service code
  needed); claims and leads each needed real extraction into
  app/services/claims.py and app/services/leads.py respectively,
  including converting the private, HTTPException-raising
  _validate_claim_fields into a public, ValueError-based
  validate_claim_fields to match the rest of the codebase's
  convention (group 3's connector helpers were the deliberate,
  narrow exception to that convention; this wasn't one of those
  cases).
- Caught a real bug in review before running the suite:
  create_lead_link's first draft returned the raw LeadLink ORM row
  instead of serialize_link(db, row), which would have silently
  changed the /leads/{id}/links response shape. Fixed by re-reading
  the new route file against the original code line by line before
  testing, not just trusting that "it compiles."
- Full backend suite: 214 passed, 0 failed -- clean run, no
  follow-up fixes needed (same as group 3). Committed and pushed to
  `dev` (`6e1f01c`). STRUCT-0002/0008 updated with group 4 progress.
- Worth carrying into groups 5-8: this group's size (18 endpoints)
  made a full manual diff-against-original review worthwhile before
  testing, not just after a test failure surfaces a problem. Groups
  5 (17), 7 (20), and 8 (23) are all this size or bigger --
  budget time for that review pass rather than treating "tests pass"
  as the only correctness signal, since a bug that happens to return
  the same HTTP status code with a different body shape won't always
  be caught by existing tests.

## Cycle: routes.py split group 5 (connector-findings, documents)

- Extracted 17 endpoints plus one domain judgment call: POST
  /external-relationship-reviews/{review_id}/promote has a different
  URL prefix than /connector-findings, and REMEDIATION_PROMPT.md's
  Stage E plan doesn't actually assign it to any of the 8 listed
  groups (an oversight in the original plan, not something this
  cycle can fix retroactively without renumbering everything).
  Grouped it into routes_connector_findings.py anyway since it
  promotes the exact ExternalRelationshipReview workflow that
  module's other endpoints create and review -- domain fit mattered
  more here than literal prefix matching.
- New app/services/connector_findings.py holds review-status/
  resolution-decision/statement-assessment logic that had no natural
  existing home (unlike most groups so far, where an existing
  services/ file already owned the relevant domain).
- Full backend suite: 214 passed, 0 failed -- clean run, no
  follow-up fixes needed. Committed and pushed to `dev` (`a6c083a`).
  STRUCT-0002/0008 updated with group 5 progress.
- 3 of 8 groups now remain: settings (14), entities (20),
  investigations (23) -- 57 endpoints. These are exactly the groups
  REMEDIATION_PROMPT.md flagged as needing the most care (entities
  and investigations especially, since group 3 already found
  cross-group shared helpers -- _run_connector/_enrich_entity --
  that entities endpoints depend on, and investigations is described
  as "the biggest and most depended-on," saved for last on purpose).

## Cycle: routes.py split group 6 (settings)

- Extracted all 14 /settings/* endpoints: the /settings/status
  snapshot, persisted app-user identity CRUD plus token
  rotate/revoke, investigation membership grants (PUT/DELETE),
  connector credential storage (PUT/DELETE), and security audit log
  access/retention (list, summary, retention-preview, prune).
- Two private helpers preceding the block (_require_local_request,
  _connector_credential_status) were grepped against the *entire*
  routes.py file before touching anything -- both came back used
  only within this group's own endpoints (lines 78-381 of the
  pre-split file), so they moved cleanly with no cross-group
  re-export shim needed, unlike group 3's _run_connector/
  _enrich_entity which are still re-imported under their old private
  names because entities (group 7) hasn't landed yet.
  _require_local_request stayed in the route module rather than
  services/settings.py: it takes the raw Request object and raises
  HTTPException directly, which is a route-layer HTTP concern, not
  business logic -- the same judgment already applied to
  app/services/connectors.py's three HTTPException-raising
  functions.
- The connector-credential save/delete endpoints have three distinct
  error outcomes (bad provider -> 404, blank secret -> 400, store
  failure -> 500) that don't fit the usual ValueError=400/
  LookupError=404 convention alone. Extended it with RuntimeError=500
  for the store-failure case; behavior is unchanged; only where each
  check lives moved.
- New app/services/settings.py holds all of it (get_settings_status,
  app-user CRUD/token functions, investigation membership put/
  delete, connector credential save/delete). No existing services/
  file was a natural fit, so unlike groups 2 and 5 this is a
  from-scratch module like group 3's connectors.py.
- All 3 hand-built test app builders updated proactively (3
  function-scoped copies in test_persisted_identity_roles.py handled
  with a replace_all assert-count-3 script rather than one at a
  time). Grepped for monkeypatch/direct routes.* calls against every
  moved settings symbol first -- none found, so no retargeting was
  needed this cycle (a clean run, same as groups 3-5).
- Full backend suite: 214 passed, 0 failed. Committed and pushed to
  `dev` (`27134e9`). STRUCT-0002/0008 updated with group 6 progress.
- routes.py: 916 -> 603 lines. 2 of 8 groups remain: entities (20),
  investigations (23) -- 43 endpoints. Both are exactly the groups
  flagged from the start as needing the most care: entities depends
  on the _run_connector/_enrich_entity helpers relocated to
  app/services/connectors.py back in group 3 (those re-import shims
  in routes.py need to be resolved when entities lands), and
  investigations is the biggest and most depended-on group, saved
  for last on purpose.

## Cycle: routes.py split group 7 (entities)

- Extracted all 21 /entities/* endpoints plus the entity-listing
  endpoint under /investigations/{id}/entities. This group's file
  reads (before writing anything) turned up the file's actual
  domain layout: entities and investigations endpoints are
  interleaved throughout routes.py by history, not grouped
  contiguously -- e.g. create_entity sat right after
  remove_investigation, and enrich_entity_multi sat right before
  list_connector_runs/list_connector_findings (which are
  investigation-prefixed and stayed for group 8). Block removal by
  exact-text match (not line ranges) made this a non-issue, same as
  every prior group, but it meant reading the whole 916-line
  pre-split file carefully rather than assuming a contiguous block
  to lift.
- New app/services/entities.py holds the endpoints with real inline
  logic: create_entity, list_entities, decide_property_conflict
  (the biggest single validation routine in the group -- decision
  enum, ledger-value membership, preferred/temporal-interval
  cross-checks), and run_multi_enrichment (the full per-provider
  connector-orchestration loop: session/session-run/connector-run
  bookkeeping, try/except-per-provider failure isolation, status
  rollup). Several one-query list endpoints moved too, for
  consistency with every prior group's convention rather than a
  fresh judgment call.
- Endpoints that already fully delegated to an existing service
  (entity_dossier, entity_statement_history, entity_relationships,
  canonical_duplicate_candidates, record_canonical_resolution,
  preview_entity_merge/execute_entity_merge,
  detect_post_merge_reconciliation/record_post_merge_reconciliation)
  moved verbatim into routes_entities.py with no new service
  extraction -- same "already thin" judgment as routes_relationships.py
  in group 4.
- This group also cleared a piece of standing debt: the
  _persist_connector_findings/_enrich_entity re-export shims that
  have sat in routes.py's import block since group 3 (aliased under
  their old private names so remaining call sites wouldn't need
  changes before their own group's turn). Grepped both names against
  the whole file first -- both were used only inside
  enrich_entity/enrich_entity_multi, i.e. entirely within this
  group -- so routes_entities.py now imports enrich_entity directly
  from app.services.connectors, and run_multi_enrichment (the
  service-layer version of enrich_entity_multi) calls
  persist_connector_findings directly. Updated connectors.py's
  module docstring, which had explicitly said "still in routes.py
  pending group 7's extraction" since group 3 -- now says where the
  call sites actually live.
- All 3 hand-built test app builders updated proactively. Grepped
  for monkeypatch/direct routes.* calls against every moved entities
  symbol first -- none found, clean run.
- Full backend suite: 214 passed, 0 failed -- though this cycle
  surfaced a local tooling wrinkle worth logging: pytest.ini's
  addopts bakes in `-q --cov=...`, and passing `-q` again on the
  command line alongside `--no-cov` was silently swallowing the
  final "214 passed in Xs" summary line (dots reached 100%, exit
  code 0, but no summary text) -- looked exactly like a device_bash
  timeout truncation at first and cost real time chasing that theory
  (backgrounding across device_bash calls doesn't work either --
  each call is its own PID namespace, so a backgrounded process dies
  with the shell that spawned it). Dropping the redundant `-q` fixed
  it immediately. Future cycles: don't pass `-q` when addopts already
  has it, and don't try to background a long-running command across
  separate device_bash calls -- it won't survive.
- Committed and pushed to `dev` (`0c20093`). STRUCT-0002/0008 updated
  with group 7 progress.
- routes.py: 603 -> 310 lines, 22 endpoints remain. Group 8
  (investigations) is the last one -- once it lands, routes.py is
  deleted entirely per REMEDIATION_PROMPT.md, and Stage E is done.

## Cycle: routes.py split group 8 (investigations) -- Stage E complete

- Extracted the last 22 endpoints -- everything still living directly
  under /investigations/*: OpenAleph corpus binding, the AI assistant
  endpoints (context/case-synthesis/hypothesis-test, via the
  route-layer _run_reasoning_endpoint helper that stayed in the route
  module since it's pure HTTP-exception-mapping over
  app/ai/reasoning.py's already-real service function), timeline,
  backup export, investigation CRUD, relationships/graph, and the
  investigation-scoped listing endpoints for documents, evidence,
  sources, claims, leads (+ the lead-queue filter/sort/count logic),
  reporting-tasks, connector-runs, and connector-findings.
- Since this was the last of the 8 groups, app/api/routes.py -- the
  file this entire 8-cycle effort has been shrinking since it opened
  at 1859 lines / 120 endpoints -- is deleted outright rather than
  emptied further. New app/services/investigations.py picked up the
  endpoints with real inline logic (create/list with scope filtering,
  the four investigation-scoped collection queries, the lead-queue
  logic); everything that already fully delegated to an existing
  service module moved verbatim, same judgment applied in every prior
  group.
- main.py and all 3 hand-built test app builders (destructive-action,
  investigation-authorization, persisted-identity-roles -- the last
  with 3 function-scoped copies) now import `router` from
  routes_investigations instead of the now-deleted routes.py. Also
  cleaned up a dead `from app.api import routes` import left in
  test_ingestion_deletion_coordination.py since group 2, when its
  actual call sites were retargeted to routes_sources but the
  now-unused top-level import was never removed -- grepping the
  whole tests/ tree for any remaining `app.api.routes` (not
  `routes_*`) reference caught it before it could break the deleted
  import.
- Full backend suite: 214 passed, 0 failed. Committed and pushed to
  `dev` (`332fe98`).
- STRUCT-0002 and STRUCT-0008 flipped from IN_PROGRESS to CORRECTED
  in STRUCTURE_AUDIT.md -- the split REMEDIATION_PROMPT.md's Stage E
  called for is done. All 120 original routes.py endpoints now live
  across 16 per-domain route modules (routes_system, routes_provenance,
  routes_sources, routes_reporting_tasks, routes_connectors,
  routes_extraction_candidates, routes_enrichment_sessions,
  routes_backups, routes_relationships, routes_claims, routes_leads,
  routes_documents, routes_connector_findings, routes_settings,
  routes_entities, routes_investigations), each backed by a matching
  app/services/ module.
- What's still open from this effort, logged as STRUCT-0013 through
  STRUCT-0016 in earlier cycles and explicitly deferred behind
  finishing this split (per Ony's "finish the split first" sequencing
  decision, now satisfied): mypy coverage is scoped to only 4 files
  and not enforced in CI; no CI step runs ruff/mypy at all; no
  --cov-fail-under threshold. These are natural next targets now that
  every route module is small enough to bring under strict checking
  without a wall of pre-existing errors -- exactly the condition
  STRUCT-0013's required_correction named as the trigger to widen
  mypy's `files` list.
- Next per Ony's standing instruction: run the full engineering-skills
  audit suite (architecture, code-review, debug, deploy-checklist,
  documentation, incident-response, standup, system-design, tech-debt,
  testing-strategy) across the whole Private-ai project, then explore
  Firecrawl for TAS/dev research and consider a Firecrawl integration
  into Private-ai itself.

## Code review pass (post-split): 1 critical + 4 suggestions logged

Ran `/engineering:code-review` against the whole backend (plus a
light frontend pass) now that the routes.py split is complete and
every domain lives in its own route/service module pair. Reviewed
with targeted greps and full-file reads rather than a blanket re-read
of all 71 files:

- **Critical (STRUCT-0017, N+1 query cascade):**
  `app/services/leads.py` (`serialize_link` line 35, `_lead_triage`
  line 55, `serialize_lead` line 124, `serialize_task` line 206) and
  `app/services/investigations.py`'s `list_investigation_leads` /
  `lead_queue` re-serialize every lead's links/triage with fresh
  per-row queries instead of a batched load. Confirmed via direct code
  read, not speculation.
- **Suggestion (STRUCT-0018, pagination):** none of the
  `app/api/routes_*.py` list endpoints paginate; every investigation-
  scoped list (documents, evidence, leads, connector-findings, etc.)
  returns its full result set. Fine at current data volumes, will not
  be once investigations accumulate real history.
- **Suggestion (STRUCT-0019, test coverage):**
  `app/services/settings.py:207-229` (`save_connector_credential`,
  `delete_connector_credential`) has zero coverage under `--cov`.
  `tests/test_connector_credentials.py` only exercises
  `app/services/credentials.py` directly, never the service-layer
  wrappers added in group 6's split.
- **Suggestion (STRUCT-0020, 404 vs. empty-list inconsistency):**
  some investigation-scoped list endpoints in
  `routes_investigations.py` 404 when the parent investigation is
  missing (`db.get(Investigation, ...) is None` check), others
  (`/sources`, `/claims`, `/connector-runs`, `/connector-findings`)
  silently return `[]` for a nonexistent investigation_id. Traced to
  `app/core/authorization.py:200-226`'s `authorize_routed_resource`
  doing scope-checking but not existence-checking in unrestricted
  mode -- the inconsistency predates this split, the split just made
  it visible side-by-side in one file.
- **Suggestion (STRUCT-0021, test coverage):**
  `app/api/routes_documents.py:30-95`'s OpenAleph endpoints are
  thinly covered.

Ony approved filing all five as tracked findings in
STRUCTURE_AUDIT.md (STRUCT-0017 through STRUCT-0021, status OPEN)
rather than GitHub issues, matching the STRUCT-00xx convention used
throughout the split. Docs-only change (STRUCTURE_AUDIT.md +
this dev-log entry) -- no code touched, full suite not re-run for
this commit.

Next per Ony's standing instruction: continue the engineering-skills
audit (architecture, debug, deploy-checklist, documentation,
incident-response, standup, system-design, tech-debt,
testing-strategy) one skill at a time as Ony invokes them, then
Firecrawl for TAS/dev research and a Firecrawl-integration
architecture consideration.

## Architecture evaluation: 5 findings logged (STRUCT-0022-0026)

Ran `/engineering:architecture evaluate` against the whole project
(second dimension of the engineering-skills audit, after
code-review). Reviewed the request-handling middleware, the auth
model, the connector registry, the data model shape, the TAS
submodule integration, and the CI/deployment topology.

- **STRUCT-0022 (MATERIAL, architecture):** `ConnectorRegistry._build()`
  hardcodes exactly two providers via an if/elif chain; `register()`
  is dead code. Flagged now specifically because Firecrawl is next on
  Ony's list -- recommended generalizing to a config-driven provider
  table as part of, or just before, that work, rather than adding a
  third hardcoded branch.
- **STRUCT-0023 (OPTIONAL, architecture):** two coexisting auth paths
  in `main.py`'s middleware (shared static bearer token vs. newer
  per-user persisted tokens with real roles) -- confirmed via the
  code's own docstrings that this is a deliberate in-progress
  migration, not an oversight, but nothing documents the intended
  end state or a retirement plan for the shared-token path.
- **STRUCT-0024 (NON_MATERIAL, architecture):** `app/models/domain.py`
  is 537 lines / 39 models in one file -- same shape `routes.py` had
  before Stage E. No action needed now; marker to split it by domain
  before it grows the way routes.py did.
- **STRUCT-0025 (NON_MATERIAL, architecture):** TAS spec vendored as a
  git submodule pinned at v1.8.0, only 2 of its modules wired to real
  endpoints so far, no automated drift/path check against the pinned
  commit.
- **STRUCT-0026 (NON_MATERIAL, dependencies):** `pytest`/`pytest-cov`
  ship in `backend/requirements.txt`, the same file the Docker image
  installs from.

Docs-only change (STRUCTURE_AUDIT.md + this entry) -- no code
touched, full suite not re-run for this commit.

Next: continue the engineering-skills audit (debug, deploy-checklist,
documentation, incident-response, standup, system-design, tech-debt,
testing-strategy) as Ony invokes each one, then Firecrawl for TAS/dev
research and the Firecrawl-integration architecture work itself --
which should now also resolve STRUCT-0022 along the way.

## Debug audit: 2 findings logged (STRUCT-0027-0028)

Third dimension of the engineering-skills audit. Traced exception
handling across the backend: every bare `except Exception:` (no
`as exc` binding) turned out to be a deliberate cleanup-then-`raise`
pattern (documents.py, entity_merge.py, exports.py, lifecycle.py) or
an intentional safe-fallback (security.py's redact_database_url) --
none of them silently swallow anything. No leftover `print()` debug
statements anywhere in app code either. Good baseline.

Two real gaps found in the OpenAleph/connector error paths:

- **STRUCT-0027 (MATERIAL, debug):** the 4 OpenAleph pipeline
  endpoints that catch `except Exception` have no server-side record
  of a failure once it happens -- unlike `run_connector`/
  `enrich_entity` (app/services/connectors.py), which persist
  `run.error` onto the ConnectorRun row first. When an OpenAleph
  sync/import fails, there is no way to look up why afterward.
- **STRUCT-0028 (OPTIONAL, debug):** those same endpoints plus
  connectors.py's two 502 handlers put raw exception text (sometimes
  the exception class name too) directly into the client-facing
  error response. Contained today under single-user/trusted-caller
  mode, but worth cleaning up given STRUCT-0023's noted direction
  toward per-user remote access.

Docs-only change (STRUCTURE_AUDIT.md + this entry) -- no code
touched, full suite not re-run for this commit.

Next: deploy-checklist, documentation, incident-response, standup,
system-design, tech-debt, testing-strategy, then Firecrawl.

## Deploy-checklist audit: 3 findings logged (STRUCT-0029-0031)

Fourth dimension. Reviewed both Dockerfiles, docker-compose.yml, the
Alembic migration chain, and the CI docker-build workflow.

- **STRUCT-0029 (MATERIAL, deploy-checklist):** neither Dockerfile
  declares a HEALTHCHECK and docker-compose.yml gives backend/frontend
  no healthcheck either, despite GET /health already existing --
  unlike workbench-db's real pg_isready healthcheck. A hung backend
  is invisible to Docker and to frontend's depends_on.
- **STRUCT-0030 (NON_MATERIAL, deploy-checklist):** frontend/Dockerfile
  runs `npm install` while CI runs `npm ci` -- the built image isn't
  guaranteed to match what CI tested.
- **STRUCT-0031 (OPTIONAL, deploy-checklist):** docker-compose.yml is
  the only deployment artifact in the repo and it's dev-only (bind-mounts
  source over the built image, 127.0.0.1-only ports, a literal default
  dev token). Fine under the local-first assumption; flagged so it
  isn't mistaken for deploy-ready if shared/hosted use is ever wanted.

Docs-only change (STRUCTURE_AUDIT.md + this entry) -- no code
touched, full suite not re-run for this commit.

Next: documentation, incident-response, standup, system-design,
tech-debt, testing-strategy, then Firecrawl.

## Documentation audit: 2 findings logged (STRUCT-0032-0033)

Fifth dimension. Cross-checked README.md's own claims against git
history rather than just reading it in isolation.

- **STRUCT-0032 (MATERIAL, documentation):** README's "Current status"
  table still lists Postgres CI (PR #5), Docker build/boot (PR #6),
  and frontend production build (PR #4) as "In progress," but all
  three merged long ago (with post-merge stabilization commits after
  each) -- confirmed via git log, not assumption. The table's last
  edit was literally the PR #6 merge commit itself, which never
  updated the row it was closing out.
- **STRUCT-0033 (MATERIAL, documentation):** README points readers to
  CHANGELOG.md as "a detailed dev log," but CHANGELOG.md's last entry
  is from 2026-09-16 (PR #22, the same PR that introduced that
  pointer) -- every subsequent unit of work, including the entire
  Stage E routes.py split and this whole engineering-skills audit,
  lives only in dev-log.md, which README never mentions.

Docs-only change (STRUCTURE_AUDIT.md + this entry) -- no code
touched, full suite not re-run for this commit.

Next: incident-response, standup, system-design, tech-debt,
testing-strategy, then Firecrawl.

## Incident-response audit: 2 findings logged (STRUCT-0034-0035)

Sixth dimension. Reviewed SECURITY.md, the security audit logger's
read/summarize/retention machinery, and the auth-failure rate
limiter.

- **STRUCT-0034 (MATERIAL, incident-response):** SECURITY.md only
  covers how an outside contributor reports a vulnerability -- there's
  no operator-facing runbook for what Ony should actually do if the
  audit log looks suspicious or a connector credential leaks, even
  though every tool needed for that (audit log read/summarize,
  backup export/restore, credential rotation) already exists.
- **STRUCT-0035 (OPTIONAL, incident-response):** the audit log and
  rate limiter are both purely passive -- nothing surfaces a spike in
  denied/rate-limited requests proactively. FixedWindowRateLimiter's
  own docstring already self-documents its in-memory,
  best-effort-for-single-user nature; noted as worth revisiting if
  remote/shared access (STRUCT-0023) becomes real.

Docs-only change (STRUCTURE_AUDIT.md + this entry) -- no code
touched, full suite not re-run for this commit.

Next: standup, system-design, tech-debt, testing-strategy, then
Firecrawl.

## System-design audit: 2 findings logged (STRUCT-0036-0037)

Seventh dimension. Went past the architecture pass into concurrency
and data-growth specifics: read app/db/locking.py and
app/db/mutation_guard.py in full (PostgreSQL advisory locks,
transaction-scoped, correctly no-op on SQLite with a clear comment
explaining why; a before_flush SQLAlchemy event resolves
investigation_id even for leaf-only records like Statement/Evidence).
This is genuinely well-built -- confirmed all investigation_id
foreign keys carry index=True (168 index=True occurrences checked).

One real scaling gap found in the search/retrieval path:

- **STRUCT-0036 (MATERIAL, system-design):** investigation_search()
  (backing both /search and every AI-assistant question via
  build_question_context) fetches every row of every searchable model
  type for an investigation into Python with no SQL-level text
  filtering, then scores every row with _score() before truncating to
  `limit` -- confirmed by reading the fetch code directly. A
  deliberate trade-off for cross-dialect score-ordering consistency,
  not an oversight, but cost scales with total record count, not
  match count -- worth addressing as investigations grow into the
  volumes this tool is built for.
- **STRUCT-0037 (OPTIONAL, system-design):** the SQLite-vs-PostgreSQL
  concurrency asymmetry (advisory locks only apply to PostgreSQL) is
  correct in code but undocumented -- nothing states that a
  SQLite-backed deployment must stay single-process.

Docs-only change (STRUCTURE_AUDIT.md + this entry) -- no code
touched, full suite not re-run for this commit.

Next: tech-debt, testing-strategy, then Firecrawl.

## Tech-debt audit: 1 finding logged (STRUCT-0038) + backlog inventory

Eighth dimension. Checked for hidden debt outside the tracked system
first: zero TODO/FIXME/XXX/HACK markers anywhere in backend or
frontend source, only 3 `# noqa` suppressions (all legitimate,
self-documented registration imports already read during the debug
pass), zero `# type: ignore`. Debt in this codebase is tracked
externally in STRUCTURE_AUDIT.md, not hidden in code comments -- good
discipline, nothing to surface there.

- **STRUCT-0038 (MATERIAL, tech-debt):** .github/dependabot.yml
  ignores ALL semver-major updates for both npm and pip. A CVE fix
  that only ships in a new major version (like the Next.js CVE
  README's own status table names under issue #20) will never
  surface as an automatic PR -- catching it depends on someone
  noticing manually. Reasonable as a policy, but undocumented as a
  security blind spot.

Prioritized backlog snapshot (38 total findings, 28 OPEN): 2 BLOCKING
still open (STRUCT-0013 mypy scoped to 4 files; STRUCT-0015 frontend
tests are a single 32-line file despite CI showing green), 19
MATERIAL, 6 OPTIONAL, 9 NON_MATERIAL. Nothing found this session rises
above what was already tracked as BLOCKING before this audit started
-- the two existing BLOCKING items remain the top of the backlog by
severity.

Docs-only change (STRUCTURE_AUDIT.md + this entry) -- no code
touched, full suite not re-run for this commit.

Next: testing-strategy, then Firecrawl.

## Testing-strategy audit: 1 finding logged (STRUCT-0039)

Ninth dimension. STRUCT-0015 (frontend test thinness) and STRUCT-0016
(no --cov-fail-under gate) already covered the obvious gaps from an
earlier cycle, so this pass looked for something new: test
*organization*, not just coverage numbers.

- **STRUCT-0039 (MATERIAL, testing-strategy):** the identical 16-line
  app.include_router(...) block is hand-duplicated across 4 separate
  FastAPI app constructions in 3 test files (test_destructive_action_
  authorization.py, test_investigation_authorization.py, and twice in
  test_persisted_identity_roles.py), with no shared fixture. This is
  precisely the pattern that made every one of the 8 Stage E split
  groups require manually touching 4 files in lockstep this session --
  a missed copy would silently drop a router from that test app's
  coverage with nothing failing to say so.

## Engineering-skills audit: all 10 dimensions complete

Full run across code-review, architecture, debug, deploy-checklist,
documentation, incident-response, standup, system-design, tech-debt,
and testing-strategy is done. Final tally: 39 findings in
STRUCTURE_AUDIT.md, 30 OPEN (3 BLOCKING, 21 MATERIAL, 6 OPTIONAL, 9
NON_MATERIAL was updated to 9 as of this entry), 7 CORRECTED, 2
VERIFIED. Two BLOCKING items (STRUCT-0013 mypy scope, STRUCT-0015
frontend test thinness) predate this session's audit and remain the
top of the backlog. Nothing found across all 10 dimensions rose above
BLOCKING -- consistent with this being a genuinely well-built,
carefully-reasoned-about codebase (advisory-locked concurrency
control, strict provenance/non-auto-promotion invariants, a real
security audit trail) whose gaps are mostly "fine for a single
trusted operator today, worth a line of documentation or a small
refactor before that assumption changes."

Full backend test suite (214 tests) was not re-run during this audit
pass since no code was touched -- every commit this cycle was
docs-only (STRUCTURE_AUDIT.md + dev-log.md).

Next: per Ony's original sequencing ("finish the split first, then
run the full audit"), the audit is now finished. Moving on to
Firecrawl -- research for TAS/dev use, then the connector-registry
generalization (resolves STRUCT-0022) and Firecrawl connector
implementation, verified against the full suite, with an ADR for
sign-off before calling it done.

## STRUCT-0022 corrected: connector registry generalized

Fixed ahead of the Firecrawl connector work (commit 228eec1). Found
two more hardcoded-provider-list spots while implementing the fix
beyond the ones STRUCT-0022 named: app/services/settings.py's
CONNECTOR_PROVIDERS was an independent hardcoded set, and
connector_credential_status()'s fallback-key lookup was a raw
`"aleph"` ternary that would have silently used opensanctions_api_key
as the fallback for any third provider -- a real latent bug that
would have bitten a naive Firecrawl connector add. All three now
derive from one CONNECTOR_SPECS table in app/connectors/registry.py.

Full backend suite: 214 passed, 0 failed (confirmed the 2 apparent
failures on the first run were an environment PATH artifact --
alembic's CLI binary not on tmpvenv's PATH in a fresh shell, same
class of issue as this session's earlier `which ruff` gotcha -- not a
regression; `python -m alembic` and `PATH`-fixed runs both green).

Next: implement the Firecrawl connector itself against this table.
