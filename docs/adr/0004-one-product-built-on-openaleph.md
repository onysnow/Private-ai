# ADR-0004: One product, built on OpenAleph

**Status:** Accepted (2026-10-01)
**Date:** 2026-10-01
**Deciders:** Ony
**Review:** "Architecture Review — Fit for Today and Tomorrow" (Claude Doc, 2026-10-01) holds the full analysis this ADR records.

## Context

On 2026-10-01 the app ran as two products:

- **The Docker stack** (`docker compose up`): the Workbench API on PostgreSQL,
  the Next.js workbench at port 3000, and OpenAleph alongside it (ingest-file,
  ftm-analyze, Elasticsearch, Redis, its own PostgreSQL, API and UI). The README
  calls this "the product".
- **The standalone launcher** (`Start Journalism Workbench.bat` →
  `backend/launch_local.py`): the Workbench API alone, on SQLite, opening
  `backend/app/static/index.html` at port 8000 — a 50 KB page last changed on
  2026-09-17, so it lacks the review queue, dashboard, presentations, style panel
  and demo mode.

The Workbench also duplicates three corpus jobs OpenAleph already does —
document reading/OCR, search, and name-finding — which `STACK_OWNERSHIP.md`
already marks as "compatibility scaffolding, not the target architecture".
Every planned feature (more file types, matching, semantic search, private AI,
richer screens) would otherwise be built twice.

## Decision

1. **The Docker stack is the product.** OpenAleph owns the document corpus
   (reading, OCR, archives, search, cross-referencing, name-finding). The
   Workbench owns every reporter decision. The Workbench's database is
   PostgreSQL.
2. **One screen.** The Next.js workbench, built as static files and served by
   the Workbench API at port 8000, replaces `backend/app/static/index.html`.
3. **The Windows launcher starts the Docker stack** and opens that screen, with a
   clear message when Docker isn't installed or running.
4. **SQLite stays for the fast local test run only.** CI's PostgreSQL run decides.
5. **The Workbench's own parser and pattern name-finder become a fallback,** used
   only when OpenAleph is unavailable. No new capability is added to them.
6. **Workbench background jobs run on Procrastinate** (MIT, PostgreSQL), the queue
   OpenAleph's workers already use.
7. **Unchanged** from the Foundation Fixes design: a clean CI type check first, a
   local AI provider (Ollama) with a quote check, response models with a
   generated front-end client, and the main page split into one component per
   panel.

## Options considered

- **A — OpenAleph-centred (chosen).** One owner per job; heavier install
  (Docker Desktop, Elasticsearch memory).
- **B — Standalone-first.** One-click install, but every corpus feature is
  rebuilt by us; contradicts the 2026-09-22 decision that OpenAleph is not
  optional.
- **C — Both, behind swappable parts.** Every feature built and tested twice;
  the two modes drift (as the two screens already had).

## Consequences

Easier: each corpus feature is built once; OpenAleph improvements arrive
without our work; one database means one implementation of search, vectors
and the job queue.

Harder: installing needs Docker Desktop and memory for Elasticsearch; corpus
features follow OpenAleph's releases and data model; the OpenAleph link
becomes critical and needs live end-to-end tests.

Revisit if: the full stack proves too heavy for reporters' laptops (then run
it on a shared newsroom server and keep laptops as clients); OpenAleph's
document path drops something the review screen needs, such as exact
character positions; or OpenAleph's project slows or changes licence.

## Action items

- [ ] Measure the full stack on a typical reporter laptop (memory, start-up, idle CPU)
- [x] Clear the CI type errors; add `tools/check_all.py` and a pre-commit hook
- [ ] Next.js static export served by the API at port 8000; retire `static/index.html`
- [ ] Launcher starts the Docker stack
- [ ] Run the OpenAleph document path live end to end and add it to CI
- [ ] Upload hands documents to OpenAleph and returns at once; Workbench jobs on Procrastinate
- [ ] Own parser and pattern name-finder become an OpenAleph-down fallback
- [ ] Ollama adapter and quote check
- [ ] Response models, generated client, panel split
