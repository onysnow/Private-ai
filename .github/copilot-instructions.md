# Copilot instructions for this repository

This is Journalism Workbench: a FastAPI backend + Next.js/TypeScript
frontend investigative-reporting platform. Read `STACK_OWNERSHIP.md`,
`CORE_BASICS_AUDIT.md`, and `BUILD_STATE.md` at the repo root before
making non-trivial changes — they document the architecture ownership
boundaries and the full history of what's been validated so far.

## Non-negotiable product rules

- **Human review is load-bearing.** External connector findings (Aleph,
  OpenSanctions) and AI/extraction output are never automatically
  promoted to canonical entities, evidence, or claims. A reporter must
  explicitly accept/promote them. Do not "simplify" this by
  auto-accepting anything.
- **Provenance is exact, not inferred.** Evidence carries exact
  character-offset locators (`line N@chars:start-end`). Don't round,
  approximate, or drop these when touching extraction/evidence code.
- **Canonical records are never silently mutated or deleted** by merges,
  reconciliation, or dedup — see the merge/alias/reconciliation sections
  of `CORE_BASICS_AUDIT.md` for the audit-trail pattern to follow.
- Follow `STACK_OWNERSHIP.md` for what belongs in this app vs. what
  should delegate to the FollowTheMoney/OpenAleph/OpenSanctions
  ecosystem. Don't build a second corpus/search/entity-resolution
  platform inside this repo.

## Working conventions

- Backend: FastAPI + SQLAlchemy + Alembic. Tests use SQLite for speed;
  some tests are Postgres-specific (see `test_postgres_*.py`) — don't
  assume SQLite-only behavior is portable.
- Frontend: Next.js (App Router) + TypeScript, strict mode. Keep
  `frontend/lib/api-types.ts` / `api-validate.ts` in sync with backend
  schema changes.
- Never use real names of people, companies, or organizations in test
  fixtures, seed data, or UI placeholder text — this repo is public.
  Use clearly generic placeholders (e.g. "Acme Holdings", "Jordan
  Rivera", "Example City").
- Keep PRs scoped to what the linked issue asks. Don't opportunistically
  refactor unrelated code in the same PR.
- Run the full backend test suite before opening a PR that touches
  `backend/`; run typecheck + build before one that touches `frontend/`.
- Add/update tests for any behavior change — this project has a large
  regression suite (200+ backend tests) specifically because reporter
  workflows must not silently break.

## Code organization standards

Enforced by `APPLICATION_STRUCTURE_AUDIT_PROMPT.md` (re-run periodically;
see `STRUCTURE_AUDIT.md` for the latest pass and open findings):

- **One file per concern**, matching `app/services/`'s existing pattern —
  new business logic gets its own module there, not a growing shared
  file. `app/api/routes.py` is a known, tracked exception (single file,
  117+ endpoints as of 2026-09) rather than the standard to copy; its
  planned split into per-resource route modules is recorded in
  `STRUCTURE_AUDIT.md` and should happen as its own scoped PR with the
  full backend suite run against it, per the PR-scoping rule above —
  not opportunistically bundled into an unrelated change.
- **Every `Settings` field in `app/core/config.py` must have a matching,
  commented entry in `.env.example`** — this is checked mechanically
  (diff the two), not by memory.
- **Don't add a dependency without an actual import**, and remove one
  the moment its last reference disappears — an unused pinned
  dependency (especially one with active CVE/Dependabot churn) is a
  liability with no offsetting benefit.
- **Keep `actions/checkout` (and other shared actions) on one pinned
  version across every workflow file** in `.github/workflows/` — a
  silent split invites "works in one workflow, not the other" bugs
  that are annoying to trace back to a version mismatch.
- **The Alembic migration chain must resolve to exactly one head.** If
  two PRs both add a migration off the same prior head and both merge,
  the chain forks silently until someone runs `alembic heads` and
  notices more than one line — add a merge migration immediately if
  this happens, don't build the next migration on only one branch and
  leave the fork in place.
