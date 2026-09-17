# Structure Audit Remediation — Prompt

*A reusable, re-runnable prompt — the fix-side companion to
`APPLICATION_STRUCTURE_AUDIT_PROMPT.md`. That prompt produces findings
in `STRUCTURE_AUDIT.md` and explicitly does not fix anything while
auditing. This prompt is what turns an `OPEN` finding into a `CORRECTED`
one — safely, verifiably, and in an order that doesn't break something
else on the way. Re-run it whenever `STRUCTURE_AUDIT.md` has new `OPEN`
findings to work through.*

## Purpose

Take every `OPEN` (and any wrongly-closed) finding in
`STRUCTURE_AUDIT.md`, fix it for real, and prove the fix didn't
regress anything — rather than leaving findings to accumulate as a
report nobody acts on. This prompt is about execution discipline as
much as the code changes themselves: several of the current findings
are exactly the kind of thing that's easy to "fix" in a way that looks
done but isn't (see STRUCT-0006's status-correction below for a
concrete example of that happening once already).

## Non-negotiable rules for whoever (human or AI) runs this

1. **Never mark a finding `CORRECTED` without re-reading its own
   `required_correction` field and confirming, concretely, that exact
   thing was done** — not something adjacent to it. STRUCT-0006 was
   marked `CORRECTED` after the migration fork itself was fixed, but
   the actual required correction (a CI check preventing recurrence)
   was never added. Don't repeat that mistake with any other finding.
2. **Run the full backend test suite before AND after every change,**
   not just the tests touching the file you changed. `pytest tests/`
   with no path filter. If the count of passing tests doesn't match
   what it was before your change (plus any tests you added), stop
   and find out why before continuing — don't assume a lower total is
   "unrelated."
3. **One finding, or one tightly-coupled cluster of findings, per
   commit/PR.** Don't bundle an unrelated mechanical fix into a PR for
   a risky structural one — this repo's own
   `.github/copilot-instructions.md` already requires PR scope
   discipline; this prompt does not get an exception.
4. **Respect the dependency order below.** Some of these findings
   build on each other (a conftest.py fixture needs an app factory to
   override cleanly; a CI check for single-head migrations needs a
   working CI workflow to add it to). Fixing them out of order either
   doesn't work or has to be redone.
5. **A large finding gets broken into small, independently-mergeable
   steps**, each with its own passing test run — not one giant commit
   that changes everything at once and asks for trust. STRUCT-0002 /
   STRUCT-0008 (the routes.py split) is explicitly this kind of
   finding; see its stage below for how to slice it.
6. **Update `STRUCTURE_AUDIT.md` in the same commit as the fix it
   describes** (or the next one, immediately after) — status field,
   plus a short note on what was actually done and how it was
   verified. A fix without an updated audit record just recreates the
   STRUCT-0006 problem for the next person.
7. **Update `dev-log.md` (and `claude-log.md` if there was a specific
   prompt behind the stage) at the end of each stage**, not just at
   the end of the whole remediation — each stage should be safe to
   stop after and pick back up cold.

## Stage order (respects real dependencies — don't reorder without a reason)

### Stage A — `STRUCT-0009` (independent, mechanical, do first)
Split `backend/app/core/security_controls.py` into three files by
concern: `request_limits.py` (`RequestLimitPolicy`,
`validate_content_length`, `validate_request_envelope`),
`rate_limiter.py` (`FixedWindowRateLimiter`), and `audit_log.py`
(`SecurityAuditLogger`, `new_request_id`, `should_audit_request`,
`read_security_audit`, `summarize_security_audit`,
`*_security_audit_retention`, `_safe_audit_record`,
`_parse_audit_timestamp`). Update the two import sites
(`app/main.py`, `app/api/routes.py`) accordingly. Pure move, no
behavior change — the full test suite should pass with zero test
changes needed. Safe to push directly to `dev`.

### Stage B — `STRUCT-0012` (diagnostic + infra, unblocks the real safety net)
Root-cause task #35's `backend-postgres-ci.yml` dispatch failure —
this needs the GitHub web UI's Actions tab (the "Invalid workflow
file" banner it shows that the REST API doesn't expose), not another
round of API-only diagnosis. Once fixed, confirm a real push actually
triggers the workflow and it runs the full pytest suite against
PostgreSQL. Until this stage is done, "CI is green" does not mean the
backend tests passed — say so plainly in any status update, and don't
let Stage C/D/E's PRs be treated as CI-verified for their test
behavior the way PR #27/#49/#50 were; verify those manually the same
way this remediation prompt already requires.

### Stage C — `STRUCT-0010` (foundation — do before Stage D)
Refactor `app/main.py` from module-level side effects to an app
factory: `create_app(settings: Settings = default_settings) -> FastAPI`
that builds `_request_limits` / `_audit` / `_auth_failures` (now
living in the Stage A files) from the passed-in `settings` rather than
the module-level import, and moves `ensure_database_schema(engine)`
inside the factory (or an explicit `startup` hook) instead of running
unconditionally on import. Keep a module-level `app = create_app()`
for uvicorn/production entry, so nothing outside this file needs to
change — the point is that tests (and Stage D) can now call
`create_app(settings=test_settings)` instead.

### Stage D — `STRUCT-0011` (depends on Stage C)
Add `backend/tests/conftest.py` with a fixture that builds an isolated
engine (in-memory SQLite with `StaticPool`, or a fresh schema per test
run) and overrides `get_db` via FastAPI's dependency-override
mechanism against an app built with `create_app()` from Stage C, plus
a fixture that wraps each test in a transaction rolled back afterward.
Migrate test files off their own ad hoc `setup_module()` one at a
time — don't require every test file to move in one commit; a file
using the old pattern and a file using the new fixture can coexist
during the transition, as long as the full suite still passes at
every commit.

### Stage E — `STRUCT-0002` + `STRUCT-0008` (biggest — its own sequence of PRs)
Split `routes.py` by the natural domain boundaries already visible in
its route prefixes, extracting each domain's inline `db.query`/
`execute`/`add`/`commit` calls into its matching `app/services/`
module as part of the same move (most domains already have one —
`relationships.py`, `documents.py`, etc. — follow the pattern
`app/ai/reasoning.py` + its route handlers already established for
issue #36: route file is a thin HTTP adapter, service module holds
the logic). Do this smallest-to-largest so the pattern is proven on
low-risk code before touching the highest-traffic endpoints:

1. `health`, `capabilities`, `search`, `integrations`,
   `relationship-schemas`, `evidence`, `ai-analysis-candidates`,
   `statement-assessments`, `timeline-events` (1 endpoint each —
   bundle these into one "misc/system" module + PR)
2. `provenance`, `sources`, `reporting-tasks` (2 each)
3. `extraction-candidates`, `enrichment-sessions`, `connectors`,
   `backups` (3 each)
4. `relationships` (5), `leads` (6), `claims` (7)
5. `connector-findings` (8), `documents` (9)
6. `settings` (14)
7. `entities` (20)
8. `investigations` (23) — last, since it's the biggest and most
   depended-on; by this point the pattern should be well-proven.

Each numbered group is its own PR: new route module + matching
service extraction + full test suite passing + `routes.py` shrinking
by exactly that group's endpoints, nothing else changing in the same
diff. `main.py` picks up each new `APIRouter` via `include_router` as
groups land; `routes.py` itself is deleted once group 8 merges.

### Stage F — `STRUCT-0006`'s actual required correction (depends on Stage B)
Once Stage B has a working `backend-postgres-ci.yml`, add the single-
head check to it (`alembic heads | wc -l` should be `1`; fail the job
otherwise). Only then mark STRUCT-0006 `CORRECTED` — re-read rule 1
above before doing so.

## Verification checklist (every stage, no exceptions)

- [ ] Full `pytest tests/` run, no path filter, before the change.
- [ ] Full `pytest tests/` run, no path filter, after the change —
      same pass count (plus any intentionally added tests), zero
      unexplained new failures.
- [ ] `python -m py_compile` (or equivalent import check) on every
      touched file.
- [ ] `STRUCTURE_AUDIT.md` finding(s) for this stage updated with
      `status` and a note on what was actually done.
- [ ] `dev-log.md` "Current state" section updated; a dated entry
      added.
- [ ] PR opened (or direct `dev` push, only for Stage A's kind of
      pure mechanical move) per rule 3 — not bundled with the next
      stage's work.

## Where this goes

Save as `REMEDIATION_PROMPT.md` at the repo root, sibling to
`APPLICATION_STRUCTURE_AUDIT_PROMPT.md` and `STRUCTURE_AUDIT.md`. Log
a one-line pointer to it in `dev-log.md`'s "Current state" section so
a future session picking this up cold knows it exists and where the
stage order lives.
