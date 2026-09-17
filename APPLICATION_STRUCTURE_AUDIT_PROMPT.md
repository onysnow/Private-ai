# Full Application Structure Audit — Prompt

*A reusable, re-runnable prompt. Not a one-time report — run this again
after any significant structural change (new module, new domain area,
major dependency shift) and diff against the previous run's findings.*

## Purpose

Audit Private-ai's actual structure — folder layout, backend models,
API routes, services, migrations, frontend components, config,
CI/CD, dependencies, and documentation hygiene — against its own
stated conventions and against each other, and surface every place
they've drifted. This is a consistency/hygiene audit, not a feature
or security audit: `CORE_BASICS_AUDIT.md` already tracks
feature/regression status, `ECOSYSTEM_INTEGRATION_AUDIT.md` and
`STACK_OWNERSHIP.md` already cover ecosystem-delegation decisions,
and dependency CVEs are tracked separately (issue #20's backlog).
This prompt does not duplicate any of those; skip anything that's
really one of those audits in disguise.

## Non-negotiable rules for whoever (human or AI) runs this

1. **Every finding must cite an exact file path (and line number where
   applicable).** "Naming feels inconsistent somewhere in services/"
   is not a finding — `app/services/claims.py:142` is.
2. **Never fix anything while auditing.** This prompt produces a
   findings report only. Fixes are separate follow-up work, scoped
   and reviewed individually — mixing "found a problem" with "changed
   the problem" in the same pass hides what actually changed and why.
3. **Distinguish "inconsistent" from "wrong."** A lot of what this
   surfaces will be legitimate variation (a step that genuinely needs
   a longer timeout, a model that genuinely doesn't need an index).
   Flag it either way, but say which you think it is, and don't
   invent a house rule to justify a finding that isn't backed by
   this repo's own actual precedent.
4. **Reuse TAS's own severity/status taxonomy** for every finding
   (see "Output format" below) rather than inventing a new one —
   this repo already has a working standard for exactly this kind of
   record.

## Scope — audit passes to run

Run each pass independently and record its findings separately; don't
collapse them into one undifferentiated list.

### Pass 1 — Folder/directory structure
Walk `backend/app/*` and `frontend/*` top-level directories. For each,
confirm: does its actual content match its name's implied purpose
(e.g. does everything under `services/` actually hold business logic,
or has a route handler or a model snuck in)? Are there directories
that exist for one or two files that could be flattened, or single
directories that have grown large enough to need splitting? Flag any
file sitting at a level it doesn't belong (a model in `services/`, a
route in `models/`, a component outside `frontend/components/`).

### Pass 2 — Backend models (`app/models/domain.py` and any other
model files)
For every mapped class: does it follow the same field-naming
convention as its siblings (`created_at`/`reviewed_at` timestamps,
`review_status` string enums, `id: Mapped[str] = mapped_column(...,
default=uid)` primary keys)? Does every foreign key have a matching
index where the codebase's own pattern says it should? Are there two
models that duplicate the same review-gate pattern
(`ExtractionCandidate`, `AIAnalysisCandidate`, others) with
avoidable field-name drift between them? Is there a model with no
corresponding Alembic migration, or a migration whose resulting
schema doesn't match its model class field-for-field (don't assume —
actually generate a throwaway DB from migrations and diff its schema
against `Base.metadata`)?

### Pass 3 — Alembic migration chain
Confirm the chain resolves to exactly one head (this audit already
caught one real 2-head fork this session — check whether it recurs).
Confirm every migration has a working `downgrade()`, not a `pass`
stub pretending to be one (a genuine no-op downgrade, like a pure
merge point, is fine — a downgrade that silently fails to reverse a
real schema change is not). Confirm migration filenames/revision IDs
follow one consistent ID scheme.

### Pass 4 — API routes (`app/api/routes.py` and any route modules)
Do endpoint paths follow one consistent REST convention (resource
naming, verb placement, pluralization)? Are there two routes doing
near-identical work with diverging validation/error-handling? Does
every mutating endpoint that should be gated behind
`enable_ai_features`/auth/investigation-membership checks actually
have that gate, cross-checked against a sibling endpoint that does it
correctly?

### Pass 5 — Backend services (`app/services/*`)
Check for circular imports between services, business logic that's
duplicated instead of shared, and functions/classes that are no
longer imported anywhere (genuinely dead code — verify with a repo-
wide reference search, don't guess from the name).

### Pass 6 — Frontend components (`frontend/components/*`,
`frontend/app/*` or equivalent)
Is there a clear, consistently-followed line between generic UI
primitives (the shadcn `components/ui/*` set) and feature-specific
components? Are there components with no remaining import anywhere
(dead code, same rule as Pass 5)? Do components follow one consistent
naming/casing convention and one consistent prop-typing approach?

### Pass 7 — Config/settings sync
Diff every field on `Settings` (`app/core/config.py`) against
`.env.example` — every setting should appear in both, commented
consistently. This audit just added three new ones by hand; verify
they (and every other setting) are actually present and correctly
named in `.env.example`, not just assumed to be.

### Pass 8 — CI/CD workflows (`.github/workflows/*.yml`)
Compare pinned action versions (`actions/checkout@vN`,
`actions/setup-python@vN`, `actions/setup-node@vN`, etc.) across every
workflow file — flag any inconsistency (this audit already noticed
`codeql.yml` uses `checkout@v7` while `docker-build.yml` and
`frontend-ci.yml` use `checkout@v4`; confirm whether that's
intentional or drift, and whether it's the whole story or one of
several such mismatches). Confirm every workflow that should trigger
on a given path filter actually does, and flag any workflow whose
runs have been silently failing or never triggering (cross-reference
against real run history via the GitHub API, not just the file
contents — task #35 is a live example of a workflow whose file reads
as valid but fails to dispatch).

### Pass 9 — Dependencies
Cross-reference `backend/requirements.txt`/`requirements-local.txt`
and `frontend/package.json` against what's actually imported in the
codebase: anything declared but unused, anything used but undeclared
(would break a clean install), and any version pin that doesn't
actually resolve on PyPI/npm (this audit found `followthemoney==4.11.0`
does not exist on PyPI as of this run — confirm whether that's still
true and whether it blocks a truly clean install).

### Pass 10 — Documentation hygiene
For each root-level doc (`README.md`, `BUILD_STATE.md`,
`CORE_BASICS_AUDIT.md`, `CORE_PREVIEW_TESTING.md`,
`ECOSYSTEM_INTEGRATION_AUDIT.md`, `STACK_OWNERSHIP.md`,
`SNAPSHOT_MANIFEST.json`, `dev-log.md`, `claude-log.md`): is it still
accurate against the current codebase, or does it describe a prior
state that's since changed? Flag anything that would actively mislead
a new reader.

## Output format

One findings report, using TAS's own audit-finding-record schema
(`EVALUATION/OUTPUT_SCHEMAS.md` → "Audit finding record" in the
topic-authority-system repo) adapted to this domain:

```json
{
  "finding_id": "STRUCT-0001",
  "audit_object": "backend/app/models/domain.py:463",
  "audit_pass": "models | folder-structure | migrations | api-routes | services | frontend-components | config-sync | ci-workflows | dependencies | docs-hygiene",
  "severity": "BLOCKING | MATERIAL | NON_MATERIAL | OPTIONAL",
  "finding": "",
  "precise_locations": ["path:line", "..."],
  "required_correction": "",
  "reviewer_type": "AI_ASSISTED",
  "status": "OPEN"
}
```

- `severity` follows the same meaning as everywhere else in this
  ecosystem: BLOCKING = actively broken or will break something soon;
  MATERIAL = real inconsistency worth fixing, not urgent; NON_MATERIAL
  = cosmetic/stylistic; OPTIONAL = worth considering, not a defect.
- Group the report by pass (Pass 1 through Pass 10 above), findings
  ranked most-severe first within each group.
- End with a short "patterns across passes" section if the same root
  cause produced findings in more than one pass (e.g. if the same
  historical merge that forked the migration chain also left a stray
  duplicate model or an inconsistent action-version pin) — don't
  report the same root cause N times as if they were unrelated.

## Where this goes

Save the completed report as `STRUCTURE_AUDIT.md` at the repo root
(sibling to the existing audit docs), and log a one-line summary entry
in `dev-log.md` pointing to it. Do not fold the findings directly into
`BUILD_STATE.md` — that file is feature/regression history, not
structural audit history.
