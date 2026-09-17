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

- **Open PRs on Private-ai:** none. PR #27 (shadcn/ui) merged (squash,
  commit `1852356`) after its conflict was fixed — mergeable/CI both
  clean. PR #47 (submodule bump) was already merged before this cycle.
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
- **Issue #36 (backend LLM reasoning layer) — in progress, part 1/2
  done:** provider-agnostic `LLMClient` abstraction (Anthropic +
  OpenAI adapters), `Settings.ai_provider`/`anthropic_api_key`/
  `openai_api_key`, `.env.example` docs, and the `AIAnalysisCandidate`
  review-gated model + Alembic migration are done and pushed to `dev`
  (commit `536e65e`). Verified the full migration chain applies AND
  reverses cleanly against a throwaway sqlite db. **Next cycle:**
  implement the two endpoints (`POST .../assistant/case-synthesis`,
  `POST .../assistant/hypothesis-test`) per issue #36's spec — compile
  system prompt from the TAS module file + `SOURCE_AUTHORITY_AND_
  RETRIEVAL_POLICY.md` + the existing `reasoning_contract`, call
  `build_question_context()` for the user-turn content, strictly
  validate every returned evidence_id against the packet's `citations`
  list (reject/flag anything not present), persist as
  `AIAnalysisCandidate`, wire into the existing candidate-review flow
  (see `review_extraction_candidate` in `routes.py` for the pattern to
  reuse) — then the test list from the issue body. This is still the
  explicit priority ahead of any frontend feature work (#43/#44/#45).
- **Working-branch convention:** `dev` is the shared unprotected branch
  for day-to-day pushes (no PR needed there); `main` still requires a
  clean PR. Don't conflate the two.

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
