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

- **Open PRs on Private-ai:** #27 (shadcn/ui adoption) — only one open.
- **PR #27:** was `mergeable_state: dirty` against main after PR #47 and
  the TAS PR #1 merged (both landed 2026-09-17 ~18:24 UTC, moving
  main's tip to `17a0540`). Root cause: `frontend/package.json` /
  `package-lock.json` conflict — PR #27's branch still had
  `vitest ^3.2.6`, main had already moved to `vitest ^5.0.1` via a
  separate dependency bump. Resolved by keeping PR #27's
  `tailwindcss`/`typescript` additions and taking main's newer
  `vitest`, then regenerating the lockfile. Pushed as commit
  `7e5665d` to `copilot/adopt-shadcn-ui-library`. As of this entry:
  `mergeable: true`, `mergeable_state: unstable` (checks still running
  on the new commit) — do not merge until it reports clean/success.
- **PR #47 (Private-ai, bump TAS submodule to v1.8.0)** — merged
  2026-09-17 18:24 UTC.
- **task #35 (backend-postgres-ci.yml push-trigger failure)** — not
  yet diagnosed this cycle; main just moved twice, so a fresh push-CI
  data point should exist shortly — check `main`'s latest workflow run
  before assuming the old failure data point is still current.
- **Task #54 gate (backend LLM reasoning layer, issue #36):** not
  started yet. This is explicitly the priority per Ony's sequencing,
  ahead of any frontend feature work (#43/#44/#45).
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
