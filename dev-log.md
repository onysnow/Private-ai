# Dev Log — Private-ai (Claude session/ops log)

This file is separate from `CHANGELOG.md` (formerly `BUILD_STATE.md`,
which PR #22 superseded on 2026-09-16 -- that file is now a frozen
historical artifact, not a maintained log). `CHANGELOG.md` is the
product-facing changelog: what the Journalism Workbench app can do, one
compact entry per milestone, meant for README.md's readers. This file is
the **operations log for Claude's own autonomous work** on this repo
across sessions/wakeups: PR triage, CI diagnosis, merges, branch
hygiene, individual STRUCT-00xx remediation, and the reasoning behind
decisions -- one entry per unit of work, much finer-grained than
CHANGELOG.md's milestones. It exists so that a Claude session picking
this backlog back up — after a context compaction, a new session, or a
scheduled wakeup — can reconstruct current state without depending on
conversation memory, which is lossy (see claude-log.md for the raw
prompts/responses that led to these entries).

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

## Firecrawl connector implemented

Added `firecrawl` as a third connector provider, on top of the
CONNECTOR_SPECS table from the STRUCT-0022 fix:

- app/core/config.py: firecrawl_base_url (defaults to
  https://api.firecrawl.dev, overridable for self-hosted Firecrawl
  per its own FIRECRAWL_API_URL convention), firecrawl_api_key,
  firecrawl_search_limit.
- app/connectors/firecrawl.py: FirecrawlConnector, modeled on
  OpenSanctionsConnector's structure (configured property, _parse_result,
  async search()) but deliberately without a _require_key() guard --
  Firecrawl's own docs confirm POST /v2/search works keyless at a
  lower rate limit, so this connector attaches `Authorization: Bearer`
  only when a key is configured rather than hard-requiring one. Relies
  on the Connector base class's default enrich() (builds a query from
  entity properties, calls search()) rather than overriding it.
- app/connectors/registry.py: registered "firecrawl" in CONNECTOR_SPECS.

Found a THIRD hardcoded-provider-list spot while wiring this up, not
caught during the STRUCT-0022 fix itself: app/services/credentials.py
had its own `SUPPORTED_CONNECTORS = {"aleph", "opensanctions"}`
constant gating get_secret/set_secret/credential_status. Since
registry.py's _build() calls get_secret() for every provider in
CONNECTOR_SPECS, this would have made the registry raise
`ValueError: Unsupported connector credential` for "firecrawl" at
import time -- not a cosmetic gap, an immediate app-startup break.
Fixed by deriving credentials.py's provider check from
app.connectors.registry.CONNECTOR_SPECS too, via a deferred import
inside the module (registry.py already imports get_secret from
credentials.py, so importing back at module load time would be
circular; the import is deferred into the function body instead,
which resolves fine since both modules are fully loaded by call time).

Logged the frontend's own hardcoded `'aleph'|'opensanctions'` provider
list (api-types.ts, api-validate.ts, page.tsx's settings panel) as a
new finding, STRUCT-0040, rather than silently expanding this task
into a frontend change -- the backend's provider list now auto-derives
end to end (registry -> settings -> credentials), but the frontend
still has no way to select/configure Firecrawl without its own,
separately-scoped change.

Added tests/test_firecrawl_connector.py (6 tests): result-shape
mapping, keyless operation confirmed at both the header level and
against a live-shaped mock, bearer-token attachment when a key is
configured, the /api/connectors status endpoint picking Firecrawl up
automatically, and a credential-store roundtrip for the new provider
name.

Full backend suite: 220 passed, 0 failed (214 previous + 6 new).

## STRUCT-0013 progress: mypy widened + CI enforcement added; STRUCT-0006 corrected

Started working the STRUCT-00XX backlog. First up, STRUCT-0013
(BLOCKING): mypy was configured but only covered 4 files and was never
actually run in CI.

- Widened mypy's `files` scope to include app/models and app/schemas.
  Both were already clean except 3 known BaseModel.schema-shadowing
  warnings (fixed with narrow, explained `# type: ignore[assignment]`s
  rather than renaming the `schema` field, which is load-bearing FtM
  terminology used throughout) and one real type-narrowing gap in
  app/core/authorization.py's AuthorizationScope.allows() (rewrote the
  `self.unrestricted or ...` check as an explicit `self.investigation_ids
  is None or ...` so mypy -- and a human reader -- can verify the guard
  directly instead of trusting the `unrestricted` property indirection;
  behaviorally identical, since `unrestricted` is defined as exactly that
  None-check).
- Added `[[tool.mypy.overrides]]` flipping `disallow_untyped_defs = true`
  for app.models.*/app.schemas.* specifically, per the finding's own
  suggestion to enable it per-module as each package is brought under
  coverage rather than waiting for the whole backend.
- Added .github/workflows/backend-lint-ci.yml running `python -m mypy`
  on every push/PR touching backend/** -- this was the more severe half
  of the original finding: even the narrow 4-file scope was never
  actually checked in CI.
- Did NOT attempt app/services (289 errors, 20 files, ~105 in
  search.py alone) or app/ai (134 errors, mostly the same search.py
  errors surfacing transitively) this pass -- real, multi-file
  type-safety work that deserves its own focused pass rather than being
  rushed alongside everything else in this cycle. Logged as a precise
  progress note on STRUCT-0013 itself; status moved OPEN -> IN_PROGRESS
  (still BLOCKING).

While in STRUCTURE_AUDIT.md, re-verified STRUCT-0006 (the Alembic
migration-fork CI guard) and found it's actually already done: the
"Verify Alembic migration chain has a single head" step in
backend-postgres-ci.yml (which explicitly cites STRUCT-0006 in its own
comment) was added and merged in a prior cycle, and STRUCT-0012's
blocker (the workflow not running at all) is independently confirmed
CORRECTED. Marked STRUCT-0006 CORRECTED -- it had simply never been
updated to reflect work already done.

Full backend suite: 220 passed, 0 failed.

## STRUCT-0015 progress: frontend test tooling + first real coverage

Second BLOCKING item. frontend/tests/ had exactly one file (32 lines,
no component coverage at all, no jsdom/RTL tooling installed).

- Added jsdom, @testing-library/react, @testing-library/jest-dom,
  @testing-library/user-event, @vitejs/plugin-react as devDependencies.
- vitest.config.ts: added the React plugin, a `@` path alias resolver
  (matching tsconfig's `@/*` -> `./*`, needed for component imports like
  `@/lib/utils`), and a setupFile; kept the default environment as
  'node' with per-file `// @vitest-environment jsdom` opt-in so the
  existing test keeps its faster default instead of paying jsdom
  startup cost project-wide.
- Added tests/test-api-validate.ts (26 tests): exercises the exact
  code this finding named -- lib/api-validate.ts's type guards and
  jsonObject/jsonArray/parse* helpers -- with malformed and
  missing-field payloads, confirming they reject bad shapes instead of
  silently trusting them.
- Added tests/test-button.test.tsx (5 tests): first real RTL component
  test in this codebase, on components/ui/button.tsx (small,
  self-contained) rather than app/page.tsx directly. Needed an explicit
  `afterEach(cleanup)` -- @testing-library/react's auto-cleanup only
  self-registers when it detects a global `afterEach`, which isn't
  present under vitest without `test.globals: true`.
- Frontend: 1 file/1 test -> 3 files/32 tests, all green.

Environment note worth recording: npm install repeatedly failed with
ENOTEMPTY on this device's mounted frontend/ folder (backed by a
Windows path via the remote-devices bridge -- rename() semantics
through that translation layer aren't reliable under npm's
install/dedupe churn, confirmed by a `x-deny-reason: host_not_allowed`
wall blocking npm entirely from the cloud sandbox side, so this had to
be worked around rather than routed to the cloud container). Fixed by
building node_modules in a scratch directory on the device's own local
disk (not under the mounted folder), verifying all tests pass there,
then copying only the small set of actually-changed source files
(package.json, package-lock.json, vitest.config.ts, the new test
files) back into the real frontend/ directory -- never node_modules
itself, which CI regenerates from package-lock.json independently.
Ony will need to run `npm install` locally to pick up the new
devDependencies for local `npm test`/`npm run dev` -- not a code
issue, just this sandbox's mount quirk.

Did not attempt app/page.tsx interaction tests this pass, per this
finding's own explicit instruction not to treat it as a one-PR fix --
that file is a single, extremely dense 139-line component (thousands
of packed characters per line) that would benefit from at least
partial decomposition before it's practically testable. Status moved
OPEN -> IN_PROGRESS.

## STRUCT-0010 progress: app-factory function added

app/main.py conflated FastAPI app construction with import-time side
effects and module-level singletons (_request_limits, _audit,
_auth_failures all built directly from `settings` at import), so
nothing importing app.main.app could substitute test doubles.

Wrapped the construction (exception handler, CORS/middleware, all 16
router mounts, static-file route) in `create_app(app_settings=None)`,
defaulting to the real settings singleton so `app = create_app()` is
behaviorally identical to what was there before -- verified via a
full, unmodified 220-test run (zero test changes needed).

Deliberately did NOT touch app/db/session.py's `engine`/`SessionLocal`
singletons, which are built from settings.database_url at their own
module's import time, independent of main.py. Making those injectable
too is a bigger, separate piece of work -- exactly what STRUCT-0011's
planned conftest.py fixture needs, and that finding already says it
depends on this factory existing first. No test file migrated to call
create_app() directly yet; that's the actual payoff and belongs with
STRUCT-0011's fixture work rather than a mechanical sweep here.

Full backend suite: 220 passed, 0 failed. mypy: clean.

## STRUCT-0011 investigated, design documented (not implemented this pass)

Looked into the isolated-DB-fixture work STRUCT-0010's factory was
meant to unblock. Found the test suite actually has two different
patterns, not one: some files (test_investigation_authorization.py,
test_persisted_identity_roles.py) already build their own isolated
in-memory engine per file -- fine, just duplicated (STRUCT-0039). The
real problem is ~12+ other files that import app.main.app directly and
rely on setup_module() wiping the shared global engine's tables.

The nonobvious part: several of those files also call SessionLocal()
directly (not through the get_db dependency) to seed data outside the
request cycle -- e.g. test_assistant_context.py inserting a
ConnectorFinding row directly. A conftest fixture that only overrides
app.dependency_overrides[get_db] would miss those calls entirely,
since `from app.db.session import SessionLocal` binds the name at
import time, immune to a later monkeypatch of the module attribute.

Correct fix: keep the same SessionLocal object identity and
reconfigure it in place per test (`SessionLocal.configure(bind=fresh_engine)`)
rather than replacing the name, in an autouse conftest.py fixture that
builds a fresh StaticPool sqlite:// engine, creates the schema, yields,
then tears it down. Documented this precisely in STRUCTURE_AUDIT.md so
whoever picks this up next (me or Ony) has a concrete, correct plan
rather than starting from scratch -- but did not execute the 12+-file
migration itself this pass. Migrating every affected file and deleting
their now-redundant setup_module functions is real, higher-risk
surgery across the whole suite; better done as its own focused pass
with room to catch anything subtle, not as one more item in an
unattended sweep. No code changed; full suite unaffected (220/220,
unchanged from before).

## STRUCT-0014 corrected: stricter ESLint typing rules

Added @typescript-eslint/explicit-module-boundary-types and
@typescript-eslint/no-explicit-any to .eslintrc.json as errors. Small
enough surface to fix outright rather than phase in like mypy: 13
missing-return-type spots (app/page.tsx's default export,
app/layout.tsx, and small exported components in components/ui/ and
lib/utils.ts/api-validate.ts), 0 existing `any` usage anywhere.

Notable gotcha: React 19's @types/react removed the global `JSX`
namespace in favor of React.JSX/ReactElement -- `: JSX.Element`
doesn't compile under this project's installed types. Used
`React.ReactElement` in files with `import * as React`, and a
`ReactElement` named type import in files that only import specific
react exports (app/page.tsx, components/ui/sonner.tsx).

Also added an argsIgnorePattern/varsIgnorePattern of ^_ to the
existing no-unused-vars rule, needed for the intentionally-discarded
destructured fields in tests/test-api-validate.ts (STRUCT-0015) --
standard ESLint convention, not scope creep.

Verified via the same local-disk-mirror workaround as STRUCT-0015
(npm install is unreliable on the mounted frontend/ folder): 0 eslint
errors (9 pre-existing, unrelated warnings left as out of scope --
dead imports and one exhaustive-deps hook warning in app/page.tsx),
0 tsc --noEmit errors, full vitest suite 32/32 passing.

## STRUCT-0016 corrected: coverage floor added

Added --cov-fail-under=80 to pytest's addopts in pyproject.toml.
Coverage was measured and reported but nothing gated on it. Current
coverage re-verified at 86.57% -- comfortably above the new floor.
Applies automatically in CI: run_postgres_gate.py calls `python -m
pytest -q` with no cov flags of its own, relying entirely on addopts,
so backend-postgres-ci.yml enforces this with no workflow change.
Verified: "Required test coverage of 80% reached", 220/220 passing.


## STRUCT-0017 corrected: N+1 query cascade in lead serialization

Added batch equivalents in app/services/leads.py: list_leads_serialized()
(replaces per-lead serialize_lead() calls), _lead_triage_batch(),
_resolve_link_labels()/_serialize_links_batch(), and
serialize_tasks_batch() (backed by a shared _build_task_dict() helper
that serialize_task() now also delegates to, so the two stay in
lockstep). app/services/investigations.py's list_investigation_leads,
lead_queue, and list_investigation_reporting_tasks now call these once
per investigation-sized batch instead of once per lead/task in a
Python-level loop.

Each batch function fetches every table it needs (LeadProfile, LeadLink,
ReportingTask, LeadWorkflowEvent, the five link-target tables, plus
RelationshipEvidenceAttachment/RelationshipEvidenceReviewEvent/
ClaimEvidenceLink for triage, and ReportingTaskWorkflowEvent for task
history) with a small constant number of `.in_()` queries regardless of
how many leads are in the investigation, then reassembles each lead's
dict from in-memory dicts keyed by id -- eliminating the scaling
behavior where a leads-list page load ran roughly 6-10 queries per lead.

serialize_lead/serialize_link/serialize_task/_lead_triage are left
unchanged for their existing single-record call sites (routes_leads.py,
routes_reporting_tasks.py, dossier.py, provenance.py, convert_lead,
lead_provenance_snapshot) -- those only ever serialize one record per
request, so batching them would add complexity with no benefit.

Verified: full 220-test suite green (tests/test_lead_workflow.py and
tests/test_relationship_evidence_review.py exercise this serialization
path directly), 80% coverage floor held at 86.77%. No response-shape
change on any endpoint -- this is a pure query-count optimization.


## STRUCT-0018 partially corrected: pagination on the three highest-priority list endpoints

Added optional limit/offset query params, applied as real SQL LIMIT/OFFSET
(not fetch-then-slice), to the endpoints the finding called out as most
likely to grow large in practice: GET /investigations/{id}/documents,
GET /investigations/{id}/entities, and GET /investigations/{id}/connector-
findings. The underlying service functions (list_investigation_documents,
list_investigation_connector_findings in app/services/investigations.py,
list_entities in app/services/entities.py) take limit: int | None = None,
offset: int = 0; route handlers validate them via Query(ge=1, le=500) /
Query(ge=0). Both default to "no limit" -- unpaginated behavior is
byte-for-byte unchanged, so no existing caller (frontend or test) is
affected until it opts in.

Added tests/test_investigation_list_pagination.py (4 tests) covering all
three endpoints: unpaginated output matches the pre-existing shape,
limit/offset slice that same order correctly, and out-of-range params
return 422.

Deliberately not done in this pass, tracked as follow-up: a default page
size when the client sends no limit (the finding asks for one, but the
frontend has no pagination UI yet -- capping every existing list silently
would look like data loss, not a fix, so it needs to land with frontend
paging support, not alone); and the other 13 investigation-scoped list
endpoints (leads, leads/queue, sources, claims, reporting-tasks,
connector-runs, evidence, relationships, graph, timeline) still have no
limit/offset -- leads/sources/claims/reporting-tasks/connector-runs are
the natural next slice.

Verified: full 224-test suite green (220 existing + 4 new), 80% coverage
floor held at 86.86%.


## STRUCT-0019 corrected: connector-credential save/delete now covered

Added tests/test_connector_credential_endpoints.py (7 tests) exercising
PUT/DELETE /api/settings/connectors/{provider}/credential through the
FastAPI TestClient end to end -- the prior test_connector_credentials.py
only called the lower-level app/services/credentials.py store directly
and never touched save_connector_credential/delete_connector_credential
or the routes that wrap them.

Covers the three branches those wrapper functions were specifically
written to distinguish (unknown provider -> 404, blank/missing credential
-> 400, forced set_secret/remove_secret failure via monkeypatch -> 500),
plus the success round trip and confirming the secret value never leaks
into a response body. Each test monkeypatches
settings.connector_credentials_file to a pytest tmp_path so nothing
touches the real ./data/secrets/connectors.json.

Verified: full 231-test suite green (224 existing + 7 new), 80% coverage
floor held at 87.36% (app/services/settings.py: 70% -> 85%).


## STRUCT-0027 corrected: OpenAleph failures now leave a server-side trace

Added an OpenAlephOperationFailure table (investigation_id, document_id
nullable, operation, error, created_at -- migration
48d964619dd5_add_openaleph_operation_failures.py, verified via alembic
upgrade/downgrade/check) plus record/list/serialize helpers in
app/services/openaleph_corpus.py. The 4 endpoints that previously caught
`except Exception` and left no trace beyond the one HTTP response
(refresh_openaleph_document_review, import_openaleph_document_evidence,
import_openaleph_document_entities, ensure_openaleph_corpus_binding) now
roll back the session and record a failure row before re-raising the 502
-- the same treatment run_connector/enrich_entity already give connector
failures via ConnectorRun.error. Added GET
/investigations/{id}/corpus/openaleph/failures so these are actually
queryable rather than sitting in a table with no way to reach them.

sync_document_to_openaleph was deliberately left untouched -- it already
records failures onto its own DocumentCorpusSync.error field, which is
why the original finding's precise_locations correctly excluded it.

Added tests/test_openaleph_operation_failures.py (6 tests): each
endpoint's failure path is forced by monkeypatching the service call at
the route module's import site (these are looked-up-by-name module
globals at call time, not bound default arguments, so patching there is
what actually reaches the except block), then verifies the recorded
row's fields and that the new endpoint surfaces it, plus per-investigation
scoping and a 404 on an unknown investigation.

Verified: full 237-test suite green (231 + 6 new), 80% coverage floor
held at 87.77%, alembic upgrade/downgrade/check all clean on the new
migration.


## STRUCT-0029 corrected: Docker HEALTHCHECKs added

Added HEALTHCHECK to backend/Dockerfile (python's urllib against
GET /api/health -- auth-exempt for loopback callers, so no token needed)
and frontend/Dockerfile (node's http module against the root page, since
no dedicated frontend health route exists). Neither adds a new package --
both use the runtime already in their base image instead of installing
curl/wget. docker-compose.yml's frontend.depends_on.backend now uses
condition: service_healthy instead of the bare list form, which only
waited for container start, not readiness -- matching the pattern
workbench-db/postgres already use.

Added tests/test_health_endpoint.py (1 test) confirming GET /api/health
returns 200 for an unauthenticated local-style request, which is exactly
how the in-container healthcheck calls it and which nothing previously
verified.

Not locally build-verified -- no docker binary in this sandbox --
.github/workflows/docker-build.yml already runs `docker compose build
backend frontend` on every push and will catch any Dockerfile syntax
error; watching that run after push is this fix's real verification step.

Verified: full 238-test suite green (237 + 1 new), 80% coverage floor
held at 87.79%.


## STRUCT-0032 corrected: README status table updated to reflect merged work

Confirmed via `git merge-base --is-ancestor` that the three PRs the
"Current status" table listed as "In progress" (Postgres CI #5, Docker
build/boot #6, frontend production build/typecheck #4) are all ancestors
of the current HEAD, and that the CI workflows they added
(backend-postgres-ci.yml, docker-build.yml) still exist and run. Updated
all three rows to "Validated -- running in CI", matching the table's
first row, and updated the closing sentence accordingly.

Left the "Dependency security posture" (issue #20) row unchanged --
this sandbox has no way to check GitHub's live issue state (no gh CLI,
no GitHub API access for this repo), and the finding itself only asked
to update that row if the issue is confirmed still open. Current
dependency versions (next 15.5.25, python-multipart 0.0.32, pypdf
6.16.1) suggest the named CVEs may already be patched, but that's a
different question from whether the tracking issue is closed.

Docs-only change; no backend tests affected.


## STRUCT-0033 corrected: CHANGELOG.md resumed, its split from dev-log.md made explicit

README.md pointed readers at CHANGELOG.md as "a detailed dev log", but
CHANGELOG.md's last entry (DEV 0.93) was from 2026-09-16 (PR #22) and
hadn't been touched since -- the entire routes.py Stage E split (120
endpoints, 16 modules) and this session's full engineering audit (40
STRUCT-00xx findings, ongoing remediation) were recorded only here in
dev-log.md, which README never mentioned. A reader following README's
own pointer would see a project that looked stalled since 2026-09-16.

Added one CHANGELOG.md entry ("Engineering hardening pass (post-DEV
1.24)") summarizing that work at a product level and explicitly pointing
to dev-log.md for full session-by-session detail -- deliberately not
one CHANGELOG entry per STRUCT-00xx fix, since that granularity is what
this file is for. Updated both of README.md's CHANGELOG.md references
to also name dev-log.md and describe what each file covers, so the
split is explicit rather than implicit.

Also fixed a related staleness bug found while researching this:
dev-log.md's own header still called BUILD_STATE.md the product
changelog, but BUILD_STATE.md was superseded by CHANGELOG.md in PR #22
and hasn't been touched since (confirmed via git log) -- it's a frozen
historical artifact now, not a maintained file. Corrected the header's
cross-reference.

Docs-only change; no backend tests affected.


## STRUCT-0034 corrected: operator-facing incident-response runbook added

SECURITY.md only covered how an outside contributor reports a
vulnerability privately -- it said nothing about what Ony (the actual
operator) should do if the security audit log shows an unexpected
spike of access_denied/auth_rate_limited events, a connector
credential is suspected leaked, or investigation data looks tampered
with. All the individual pieces already existed and were well built
(SecurityAuditLogger's read/summarize/retention-preview functions in
app/core/audit_log.py, per-investigation backup export in
app/services/exports.py, connector-credential rotation in
app/services/settings.py) but nothing tied them into an actual
"if you see X, do Y, in this order" procedure.

Added a new INCIDENT_RESPONSE.md with four steps in order: (1)
preserve evidence first via a fresh per-investigation export before
touching anything else; (2) pull and read the audit log for the
window in question, starting with the aggregate summary endpoint then
filtering by the real event names (access_denied, auth_rate_limited,
request_rejected, browser_write_denied); (3) rotate a suspected-leaked
connector credential via the existing PUT/DELETE credential endpoints;
(4) honest manual guidance for suspected tampering, since no dedicated
diff tool exists today -- documented as a real limitation rather than
invented functionality to paper over it. The "after the incident"
section on pruning the audit log states the exact literal confirmation
string apply_security_audit_retention requires ("PRUNE SECURITY
AUDIT"), verified directly against app/core/audit_log.py rather than
left as a vague "see the request body."

Left SECURITY.md's existing contributor-facing disclosure content
untouched and added one short "Operator incident response" section
pointing to the new file, since the two audiences (external security
researchers vs. the one trusted operator) are genuinely distinct
readers with different needs.

Docs-only change; no backend tests affected.


## STRUCT-0036 partial fix: eliminated 3 N+1s in search, full scan-and-score deferred

investigation_search() (backend/app/services/search.py) fetches every row of
every searchable model type for an investigation and scores each one in
Python -- a deliberate, documented trade-off for cross-dialect ordering
consistency, but one whose cost scales with total record count rather than
match count. On top of that base cost, three genuine N+1s were compounding
it further, each firing regardless of whether the parent record matched:
LeadProfile was queried once per lead, and DocumentChunk/ExtractionCandidate
were each queried once per document. Batched all three into single IN()
queries keyed by lead id / document id, mirroring the batching pattern
Statement already used for entity_id in this same function. Verified via
the full backend suite (268 tests, all passing unchanged) including
test_search_provenance.py's ranking and provenance-trace assertions.

Also checked whether resolve_active_entity()'s per-row db.get() calls, and
the inline db.get(Entity, ...) calls in the relationship-hit loop, were a
real N+1 -- they are not: entities_stmt loads every Entity for the
investigation into the session up front, so SQLAlchemy's identity map
answers those get()s without a second query. No fix needed there.

Deliberately did not attempt the finding's core ask -- a SQL-level
prefilter (LIKE/ILIKE or FTS) ahead of _score() so unmatched rows are never
fetched -- this pass. Investigating it surfaced a real correctness hazard:
entities_stmt/sources_stmt's full, unfiltered results are reused as
entity_by_id/source_by_id lookup tables so that statements/evidence/
documents can be scored and displayed even when their OWN text matches but
their parent entity/source's fields do not. Prefiltering entities_stmt/
sources_stmt directly would silently drop those matches from search
results entirely -- a worse bug than the slow scan it would fix. A correct
fix needs to separate "which entities/sources are in scope" (cheap, ID-only,
unfiltered) from "which entities/sources themselves match" (prefiltered,
for entity/source-type hits only) -- a more invasive change that deserves
its own careful pass rather than being rushed here. Left STRUCT-0036 as
IN_PROGRESS with the remainder captured for a dedicated follow-up.


## STRUCT-0038 corrected: documented Dependabot's ignore-vs-security-update behavior

.github/dependabot.yml ignores all semver-major version updates for both
npm and pip ecosystems, and the finding worried this meant a CVE that only
ships in a new major version (like the one README's status table names
under issue #20) would never surface automatically.

Checked GitHub's current documentation before writing anything down, and
that premise needed a correction: `update-types`-scoped ignore rules (which
is the exact shape this file already uses) only affect the routine
version-update path. GitHub's own docs state it plainly -- "update-types
only affects version updates, not security updates. Security updates will
always be created regardless of the update-types setting." So this
repo was never silently skipping CVE-driven major bumps via this
mechanism, as long as Dependabot *security* updates (a separate repo
setting under Settings > Advanced Security, not controlled by
dependabot.yml at all) is turned on.

That caveat -- "as long as" -- is the actual gap: nothing in the repo
states the assumption or asks anyone to confirm it, and this sandbox can't
check the live GitHub repo setting (same access limitation already noted
for STRUCT-0032's issue #20 row: no gh CLI, no GitHub API access for this
repo from here). Added a file-level comment to dependabot.yml plus a short
note on each ignore block explaining precisely what it does and doesn't
suppress, and updated SECURITY.md's "Dependency vulnerabilities" scope
line to say the same and ask whoever administers the GitHub repo to
verify the setting is actually on.

Docs-only change; dependabot.yml re-validated with yaml.safe_load(); no
backend tests affected.


## STRUCT-0039 corrected: one register_domain_routers() helper instead of 5 hand-copied blocks

The identical 16-line app.include_router(...) block was hand-duplicated
across what turned out to be 5 places (not 4 -- the finding's
precise_locations missed a 3rd occurrence in
test_persisted_identity_roles.py), each a verbatim copy with no shared
fixture. This is exactly the pattern this session had to work around by
hand during the Stage E routes.py split, and nothing kept the copies in
sync.

Rather than adding a 6th hardcoded list in a new tests/conftest.py (the
finding's literal suggestion), extracted register_domain_routers(app) into
backend/app/main.py itself, right beside create_app(), and had create_app()
call it too. This makes main.py -- the real production wiring -- the
single source of truth: a test app now can never silently drift from what
production actually registers, which a separate test-only conftest.py copy
could still do. All 5 duplicated copies (2 module-level in
test_destructive_action_authorization.py / test_investigation_authorization.py,
3 inline/function-local in test_persisted_identity_roles.py) were replaced
with a one-line import + one-line call.

Verified via the full backend suite (238 tests per --collect-only, all
passing unchanged, exit 0) run against the synced workbench venv.


## STRUCT-0023 corrected: ADR states the two-tier auth end-state

api_access_guard resolves remote requests one of two ways -- persisted
per-user tokens (AppUser/InvestigationMembership, real per-investigation
roles) tried first, falling back to the single shared JW_API_AUTH_TOKEN --
and nothing stated whether this was a migration in progress or a deliberate
permanent design.

Traced the actual middleware code before deciding anything: local requests
bypass both paths entirely (neither matters for ordinary single-workstation
use), and the two remote paths are already fully independent -- a valid
persisted token grants access even with api_auth_token unset (which fails
closed for the shared-token path alone by default). That independence is
what settled the decision: there's no technical reason forcing eventual
removal of either path, so docs/adr/0002-authorization-two-tier-end-state.md
proposes treating them as permanently coexisting tiers instead of inventing
a migration deadline. Persisted per-user tokens are the recommended path
for any multi-person or role-differentiated remote access and the only
path future remote-auth features should build on; the shared token stays
as a deliberately minimal, feature-frozen convenience for a solo operator
or script.

Added a one-line pointer to the ADR in AuthorizationScope's own docstring
so a future reader lands on the stated intent instead of re-deriving it.
Marked Proposed, pending Ony's review, matching ADR-0001's convention.

Docs-only change; no backend logic touched beyond the docstring addition.


## STRUCT-0028 corrected: 6 sites stopped echoing raw exception text to clients

6 call sites (routes_documents.py x3, routes_investigations.py x1,
services/connectors.py x2) built their 502 detail as an f-string embedding
the raw exception message and class name, putting internal/external-service
failure text directly into the API response body.

Fixed all 6. The 4 route-handler sites already log the full exception
server-side via STRUCT-0027's record_openaleph_operation_failure; changed
their 502 detail to a generic message plus a cross-reference id. Rather
than inventing a new id, exposed the request_id main.py's api_access_guard
already computes (previously used only inside the middleware closure, for
the X-Request-ID header and audit log) onto request.state.request_id, so
route handlers can point at the exact same id that's already on the
response header and in the audit trail.

The 2 services/connectors.py sites (run_connector, enrich_entity) are
plain service functions with no Request object -- they already persist the
full exception on the ConnectorRun row (run.error) before this fix. Used
the run's own id as the cross-reference token instead of threading a
request_id through routes_connectors.py/routes_entities.py into these
service functions, which would have been a much wider change for an
OPTIONAL finding; no endpoint exists yet to look up a run by id, but the
id still ties the response to a specific persisted, queryable row today
and stays available to expose via an API later.

Verified via the full backend suite (238 tests, all passing unchanged,
exit 0); confirmed no test asserted on the removed raw-exception text.


## STRUCT-0031 / STRUCT-0035 reviewed: watch items still correctly deferred

Both findings' own required_correction says no action is needed yet
(STRUCT-0031: while this stays local-first single-user; STRUCT-0035: while
remote/shared access remains experimental) -- these are the two OPTIONAL
"Watch" backlog items, not fixes to rush.

Reviewed both against current state rather than skipping them silently.
STRUCT-0031: re-checked docker-compose.yml directly -- the ./backend:/app
bind mount, 127.0.0.1-only ports, and the docker-compose-local-dev-token
default are all still exactly as described; no production compose file
exists. STRUCT-0035: re-checked against this session's new STRUCT-0023 ADR
(docs/adr/0002-authorization-two-tier-end-state.md) -- persisted per-user
tokens are a complete, independent path today, but there's still no stated
move toward actual multi-person shared/remote deployment as the norm, so
the audit-log/rate-limiter passivity remains an accepted trade-off, not an
active gap.

Left both OPEN (not CORRECTED -- nothing was actually changed) with a
progress_note recording this review, so future-me/Ony can see these were
consciously re-examined rather than forgotten, and re-check the trigger
condition on each next.

Docs-only change; no backend tests affected.


## STRUCT-0037 corrected: documented the SQLite single-process constraint

app/db/locking.py's advisory-lock concurrency design correctly gates
itself to PostgreSQL and no-ops on SQLite, but nothing wrote down the
consequence: a SQLite-backed deployment must stay single-process/
single-replica, since concurrent writers would race against SQLite's own
locking model instead of the app's coordination.

Added the note directly above DATABASE_URL in .env.example -- the file
every deployment starts from -- stating this plainly and pointing to
docker-compose.yml's backend/workbench-db services as a working
multi-worker-capable PostgreSQL example, so a future --workers throughput
tweak doesn't quietly break SQLite installs.

Docs-only change; no backend tests affected.


## STRUCT-0020 corrected: 4 list endpoints now 404 consistently

list_sources, list_claims, list_connector_runs, and list_connector_findings
(routes_investigations.py) were missing the `db.get(Investigation, ...) is
None` check their sibling list endpoints in the same module already had --
in unrestricted (single-user default) mode they silently returned 200 []
for a nonexistent investigation_id instead of 404. No security impact
(unrestricted mode already grants full access), just an inconsistency the
finding correctly flagged.

Added the matching check to all 4, plus
tests/test_investigation_list_404_consistency.py covering both directions
(404 for a missing investigation, still 200 [] for a real one with no
rows). Full backend suite (240 tests) verified passing.


## STRUCT-0021 corrected: OpenAleph document routes now 99% covered, one real bug found

routes_documents.py was the lowest-covered route module after the Stage E
split (49%) -- its OpenAleph corpus sync/review/import endpoints only had
their underlying service functions tested directly
(test_openaleph_corpus_bridge.py), never the actual HTTP route layer, so
each route's own try/except/response-shaping code went unexercised.

Added tests/test_openaleph_document_routes_coverage.py (17 tests) covering
the 6 named endpoints plus get_document/list_document_candidates_endpoint/
upload_document: 404/409/503/success paths, monkeypatching each service
function at the route-module import site (the pattern
test_openaleph_operation_failures.py already established) so each test
isolates the route's own logic rather than re-testing the service layer.
Coverage rose from 72% (already improved by earlier STRUCT-0027/0028 work
from the finding's original 49%) to 99%.

Writing the extraction-failure test surfaced a real, previously-hidden bug:
upload_document's 422 detail embeds serialize_document()'s raw `created_at`
datetime, which FastAPI's default HTTPException handler cannot JSON-encode
(unlike a normal 200 response, it never runs jsonable_encoder) -- a real
extraction failure in production would have crashed with an unhandled 500
instead of the intended 422. Fixed by wrapping that HTTPException's detail
in fastapi.encoders.jsonable_encoder(...).

Verified via the full backend suite (257 tests, all passing, exit 0).

## 2026-09-19: STRUCT-0024 reviewed (Watch item, no split needed yet)

`backend/app/models/domain.py` (39 models, 537 lines when the finding was written) was flagged as
a "watch this before it becomes another 1859-line routes.py" item, not something needing action
today. Checked the current state: 42 classes, 558 lines -- about 4% growth (mostly the
`OpenAlephOperationFailure` model added during STRUCT-0027 work). Not "meaningfully past" 537
lines, so no split was performed. Left STRUCT-0024 `OPEN` with a progress_note recording the
current count, matching how STRUCT-0031/STRUCT-0035 were handled earlier this session: a Watch
item that's still correctly in its "no action" state gets a documented review, not an invented
change just to close it out.

When this does cross a real threshold, the plan is already written into the finding: split by the
same domain boundaries as `app/api/routes_*.py` / `app/services/*.py` (investigations, entities,
leads, documents, connectors, settings, etc.), each domain's models in their own module, all still
declared against the shared `Base` from `app/db/session.py`.

## 2026-09-19: STRUCT-0025 fixed -- TAS submodule drift check

`backend/app/ai/reasoning.py` looks up its two wired TAS prompt modules
(case_synthesis, hypothesis_test) by hardcoded file paths inside the
`backend/app/ai/tas_spec` git submodule. Nothing verified those paths still
existed after bumping the submodule's pin, so an upstream rename or
restructure in onysnow/topic-authority-system would have failed silently at
request time with a `FileNotFoundError`, not at CI or review time.

Added `backend/tests/test_tas_submodule_drift.py`: walks
`reasoning.MODULE_FILES` and asserts every path resolves to a real,
non-empty file under `TAS_SPEC_ROOT`. It skips (doesn't fail) when
`tas_spec` isn't checked out at all, matching
`.github/workflows/backend-postgres-ci.yml`'s existing tolerance of a
missing submodule on Dependabot PRs -- so this only adds a new failure mode
for the case that actually matters (submodule present but restructured),
not a new spurious failure for the already-tolerated case. Added a one-line
pointer comment above `MODULE_FILES` in `reasoning.py` so a future submodule
bump or new-module wiring naturally leads to running this test.

No new CI workflow step was needed -- the existing pytest job already runs
the full suite (now 258 tests) whenever the submodule fetch step succeeds.

## 2026-09-19: STRUCT-0026 fixed -- test tooling out of the production requirements file

`backend/requirements.txt` -- the same file `backend/Dockerfile` installs from for the runtime
image -- listed `pytest`/`pytest-cov` directly, so the production container shipped test tooling
it never runs.

Split into three layered files instead of duplicating pins across separate lists:
`requirements.txt` (runtime only, what Dockerfile installs), `requirements-test.txt`
(`-r requirements.txt` + pytest/pytest-cov, now what
`.github/workflows/backend-postgres-ci.yml` installs to run the suite), and the already-existing
`requirements-local.txt` (`-r requirements-test.txt` + mypy/ruff/black/pypdf, for
`Start Journalism Workbench.bat` and `backend-lint-ci.yml`). That also fixes a latent version-drift
risk: `requirements-local.txt` previously duplicated every runtime pin by hand rather than
including from `requirements.txt`, so the two could have silently diverged. Updated
`CONTRIBUTING.md`'s description of the dependency files to match. `backend/Dockerfile` needed no
change -- it already only ever installed `requirements.txt`, so trimming that file was the whole
fix.

## 2026-09-19: STRUCT-0030 fixed -- frontend Docker build now matches CI's install

`frontend/Dockerfile` ran `npm install` (and only ever copied `package.json` into the build
context, not the lockfile), while `.github/workflows/frontend-ci.yml` runs `npm ci` -- a
deterministic install strictly from `package-lock.json`. The two commands can resolve different
dependency versions once the lockfile and `package.json` drift even slightly, so the image that
actually gets built and run wasn't guaranteed to match what CI tested against.

Changed the Dockerfile to `COPY package.json package-lock.json ./` + `RUN npm ci`, matching CI
exactly. Verified by running `npm ci` against the current lockfile in a scratch directory outside
the repo: 509 packages installed cleanly, 0 vulnerabilities -- confirming the lockfile is in sync
today and this change won't break the next build.

## 2026-09-19: STRUCT-0040 fixed -- frontend (and, it turns out, backend) connector list hardcoding

The frontend hardcoded the connector provider list independently of the backend's CONNECTOR_SPECS
single source of truth: `api-types.ts` typed `SettingsStatus.connectors` and
`ConnectorCredentialMutation.provider` as a literal `aleph`/`opensanctions` union, `api-validate.ts`
only validated those two keys, and `page.tsx`'s settings panel rendered a `<select>` with exactly
those two hardcoded `<option>` values. Adding the firecrawl connector to the backend registry
earlier this session made it selectable for search/enrichment (that part already read from
`GET /api/connectors`'s dynamic provider list), but there was no way to save or view a firecrawl
credential from the UI.

Investigating turned up a second bug one layer further back: `app/services/settings.py`'s
`get_settings_status()` *also* still hardcoded `"connectors": {"aleph": ..., "opensanctions": ...}`
in its response, never actually deriving from `CONNECTOR_PROVIDERS` the way STRUCT-0022 intended.
So even a fully generic frontend would never have seen firecrawl's credential status -- fixing only
the frontend would have left the bug half-fixed.

Fixed both. Backend: the connectors dict is now built from `CONNECTOR_PROVIDERS` directly. Added a
test asserting the response's connector keys equal `CONNECTOR_PROVIDERS` itself (not a hardcoded
set), so this can't drift out of sync again. Frontend: `SettingsStatus.connectors` and
`ConnectorCredentialMutation.provider` are now generic (`Record<string,...>` / `string`), their
validators check the object's actual keys, and the settings-panel credential `<select>` renders from
the same `providers` array the external-connectors search panel already used -- plus a small
`providerLabel()` helper replaces the old aleph/opensanctions display-name ternary.

Verified: full backend suite (259 tests, exit 0); frontend typecheck, vitest (32 tests), and
`next build` all clean, run against a fast local scratch copy of the frontend source after the
in-place `npm ci` in the mounted repo path proved too slow for this sandbox's tool timeouts (a
sandbox quirk, not a change in the dependency tree).

## 2026-09-19: STRUCT-0011 attempted, reverted -- SQLite file-lock hazard discovered

Attempted the documented design: a single autouse, function-scoped `tests/conftest.py` fixture
resetting the shared `engine`/`SessionLocal`'s schema before every test, replacing the ad hoc
`setup_module()`/`setup_function()` (or per-file autouse fixture) duplicated across 19 files
(more than the ~12+ originally estimated). Deliberately reused the SAME engine object rather than
building a fresh hardcoded SQLite engine, both because some files call `Session(engine)` /
`SessionLocal()` directly on already-imported name bindings (a rebind wouldn't reach them) and
because `settings.database_url` is real PostgreSQL under `backend-postgres-ci.yml` -- forcing
SQLite there would have silently defeated that job's whole purpose.

The full suite run then hung, reproducibly, partway through -- inside `test_export_backup.py`
(a file that turned out to ALSO silently depend on some earlier file's schema reset, despite never
doing one itself: a 20th, previously uncatalogued instance of this exact finding). Root cause is
almost certainly SQLite file-lock contention: this repo's actual default test backend is
`sqlite:///./journalism.db`, a real file, not the two in-memory URL forms `app/db/session.py`
already special-cases with `StaticPool` -- so it uses a normal multi-connection pool, and an
exclusive per-test schema-DDL lock can collide with a connection some earlier request cycle left
open. A single reset cycle benchmarks at ~0.3ms in isolation, ruling out plain slowness.

Reverted cleanly: all 19 file edits `git checkout`'d, the new `conftest.py` removed, stale
`journalism.db`/`-journal` files from the killed run deleted. Re-verified the full suite passes
clean on the reverted code (259 tests, exit 0) -- the codebase is exactly as it was before this
attempt.

Left STRUCT-0011 `OPEN` (not `CORRECTED` -- nothing was actually shipped) with a detailed
progress_note in `STRUCTURE_AUDIT.md` recording this evidence and narrowing the next attempt's
design to two concrete options: force `StaticPool` for any SQLite backend during tests (not just
the two in-memory URL spellings), or switch to a SAVEPOINT/nested-transaction-per-test rollback
pattern instead of schema-DDL churn. Either way, the naive "reset the literal configured engine
before every test" recipe should not be retried without first resolving this locking hazard.

## 2026-09-19: STRUCT-0013 cycle 2 -- widened mypy to 8 app/services files, caught and fixed a self-introduced regression

Scoped this cycle to the smallest safely-completable app/services slice, per the lesson from the
STRUCT-0011 revert earlier this session about not rushing large risky changes. Re-measured the
actual error count first (316 errors in 20 files, up from the finding's documented 289) and picked
the 6 files with only 1-2 errors each. Discovered mypy's `follow_imports=normal` default still
analyzes and reports errors from unlisted files transitively imported by a listed one -- widening
the real slice to 8 files (adding relationships.py and post_merge_reconciliation.py) once that was
accounted for. All 34 errors in the 8-file slice were confirmed safe mechanical fixes (Sequence-vs-
list wraps, missing annotations, a shared-base-class attribute gap, a SQLAlchemy stub gap, an
Optional-tuple indexing gap, and three cases of a variable name reused across two non-overlapping
loops/branches in one function) -- none were genuine bugs.

One rename (relationships.py's `state` -> `row_state` inside `_apply_reconciliation_view`) missed a
second, non-contiguous use of the same bare name later in the same loop iteration. The full pytest
run caught it immediately: 15 tests failed with `UnboundLocalError: cannot access local variable
'state'`. Fixed with a second, narrower patch renaming that remaining use, then reverified both
`python -m mypy` (still 0 errors, matching CI's exact invocation) and the full suite (259 passed,
exit 0, unchanged count) before calling the fix done. Widened `pyproject.toml`'s mypy `files` list
to cover all 8 files. Left `disallow_untyped_defs` at its relaxed default for these 8 (6 more errors
surface under the strict flag, mostly untyped route-payload `body` params) rather than rushing those
annotations too.

Remaining app/services scope re-measured at 282 errors across 12 files, dominated by search.py
(106, overlapping STRUCT-0036's own scope), documents.py (41), leads.py (38), provenance.py (35).
app/ai (134 errors) and app/api remain untouched. STRUCT-0013 stays `IN_PROGRESS` with a detailed
progress_note recording the exact remaining per-file counts for the next cycle.

## 2026-09-19: STRUCT-0015 cycle 2 -- first component test against app/page.tsx (API-access gate)

app/page.tsx is a single ~140-line but extremely dense component (60+ useState hooks, dozens of
async handlers packed into one function) -- too large to decompose or fully cover in one pass, per
this finding's own note not to treat it as a one-PR fix. Rather than rush a partial refactor, found
the one flow that's genuinely self-contained regardless of the rest of the component: the API-access
bootstrap gate that runs on mount and its bearer-token recovery path -- the very first thing a
reporter interacts with.

Added tests/test-page-api-access.test.tsx (3 tests, jsdom + RTL): a successful local-only bootstrap
with no token gate shown; the token gate appearing on a 401, entering a token, clicking Connect, and
a successful re-bootstrap with that token attached as an Authorization header (confirmed absent on
the pre-auth request); and Clear session token dropping the token and re-running unauthenticated.
Each test dynamically re-imports app/page.tsx after vi.resetModules() so the module-level `api`
ApiClient singleton starts fresh every test -- page.tsx constructs it once at module import time
(`const api = new ApiClient(API)`), so without this a bearer token set in one test would leak into
the next.

Verified via the same fast-scratch-directory workaround from STRUCT-0040 (mounted-repo npm ci is too
slow for the tool timeout): full vitest suite green (35 tests, up from 32), `tsc --noEmit` clean,
`eslint` clean on the new file. Frontend test count: 3 files/32 tests -> 4 files/35 tests. STRUCT-0015
stays IN_PROGRESS -- the component's other dozens of interactions (search, dossier, relationships,
documents, claims, leads, backups, security audit) are still untested.
