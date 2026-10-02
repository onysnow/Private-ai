# Journalism Workbench

[![CodeQL](https://github.com/onysnow/Private-ai/actions/workflows/codeql.yml/badge.svg)](https://github.com/onysnow/Private-ai/actions/workflows/codeql.yml) [![License: Proprietary](https://img.shields.io/badge/license-proprietary-lightgrey.svg)](LICENSE)

**An evidence-first investigative research platform — built for humans, not for an LLM to guess with.**

Journalism Workbench helps investigators build evidence-backed cases: collect sources, resolve entities, map relationships, track claims, and preserve exactly where every conclusion came from. It runs entirely without a local or cloud AI model — reasoning over your evidence graph is an optional layer on top, not the foundation underneath.

> **Why that matters:** an external database match, an OCR'd document, or a model's guess is never treated as fact. Every one of them enters the system as a *lead* or a *proposal*. A human reviewer explicitly resolves identity, assesses the statement, and promotes it before it becomes part of the canonical record — and rejected or superseded evidence is preserved, not deleted.

## The core workflow

```mermaid
flowchart LR
    A[Source / Document] --> B[Finding or\nExtraction Candidate]
    B --> C{Identity\nResolution}
    C -->|same| D[Statement\nAssessment]
    C -->|different| D
    C -->|unsure| E[Stays in\nreview queue]
    D -->|accepted| F[Human\nPromotion]
    D -->|conflicting / outdated /\nsuperseded| G[Preserved,\nnot discarded]
    F --> H[Canonical FollowTheMoney\nEntity / Relationship]
    H --> I[Provenance +\nAudit Record]
    I --> J[Graph, Dossier,\nTimeline, Leads]
```

Nothing skips the human-review step. Nothing gets silently merged or overwritten.

## What's actually built

- **Investigations, entities, and evidence** on a [FollowTheMoney](https://github.com/opensanctions/followthemoney) data model — relationships (ownership, directorship, employment, etc.) are first-class FtM entities, not flattened graph edges, so every relationship carries its own provenance-bearing statements.
- **Exact provenance.** Evidence locators carry precise character offsets (`line N@chars:start-end`), not approximate page references — the accepted text is validated against the exact source slice at promotion time.
- **Non-destructive entity resolution.** Duplicate candidates go through reporter review → merge preview (with dependency analysis and a verified digest) → transactional merge. The source entity survives as a merged alias with a full audit snapshot, not a deletion.
- **Multi-provider connectors** (Aleph/OpenAleph, OpenSanctions, with a modular architecture for more) that keep each provider's findings separate and auditable — cross-provider matches are surfaced for reporter comparison, never silently reconciled.
- **A bounded AI reasoning boundary.** When enabled, the AI assistant endpoint only ever sees a retrieval packet built from reviewed canonical/evidentiary material, with external leads kept in a clearly separate bucket — the model can't cite something a human hasn't already reviewed. Reasoning output (TAS Case Synthesis / Hypothesis Test) lands in a review queue as an `AIAnalysisCandidate` — listed, read and accepted/rejected from the "AI reasoning" panel — and never writes a canonical record; `GET /api/settings/status` reports under `ai` whether the endpoints are callable, which model answers and whether it runs on this computer, and which vendored TAS spec version the prompts are built from.
- **Private AI.** `AI_PROVIDER=ollama` runs the model on the reporter's own computer through [Ollama](https://ollama.com); the adapter refuses another address or an Ollama cloud model unless `AI_ALLOW_REMOTE_ENDPOINT` is on. Runs are background jobs. Presentation drafts must quote their records: every key point, figure and cited record carries a quote that is checked word for word against the record's text, and anything whose quote is not found is removed before review (the brief preview lists the quotes found).
- **Investigation-scoped authorization** (viewer / reporter / admin) enforced at the ORM flush level, not just in route handlers, plus persisted API identities with token rotation/revocation.
- **A 200+ test regression suite** covering the invariants that actually matter here — non-auto-promotion, merge provenance preservation, destructive-action authorization, cross-provider isolation — not just CRUD smoke tests.

Full architectural reasoning and ownership boundaries (what this app owns vs. what it delegates to the FollowTheMoney/OpenAleph ecosystem) are in [`STACK_OWNERSHIP.md`](STACK_OWNERSHIP.md).

## Screenshots

_Coming shortly — the local UI is being captured live._

## Current status — read this before judging "done"

This project has been developed iteratively -- product-facing milestones live in [`CHANGELOG.md`](CHANGELOG.md), and the underlying session-by-session engineering log (PR triage, CI diagnosis, individual audit-finding remediation) lives in [`dev-log.md`](dev-log.md) -- and with a consistently honest practice of naming what's *not* yet proven, not just what's built. As of this writing:

| Area | Status |
|---|---|
| Core reporter workflow (source → evidence → claim → relationship → dossier → lead) | Validated — regression suite passing against SQLite |
| Backend test suite against a **real PostgreSQL** server | Validated — running in CI ([backend-postgres-ci.yml](.github/workflows/backend-postgres-ci.yml)) |
| **Docker** build/boot of the full stack | Validated — running in CI ([docker-build.yml](.github/workflows/docker-build.yml)) |
| Frontend (Next.js) production build/typecheck | Validated — running in CI |
| Dependency security posture | Actively patching ([issue #20](https://github.com/onysnow/Private-ai/issues/20)) — a critical Next.js CVE and several high-severity CVEs were found and are being resolved |
| Remote multi-user deployment | Experimental. The trusted deployment model today is a single local workstation owner; treat authentication as access control, not as a production multi-tenant security boundary yet A separate production compose file and runbook now exist — [`docker-compose.prod.yml`](docker-compose.prod.yml) and [`DEPLOYMENT.md`](DEPLOYMENT.md) (secrets required, no source bind-mount, loopback-only behind your TLS proxy, rollback via `alembic downgrade` and the portable backup feature) — validated by the config test suite, not yet by a live deployment. |

I'd rather this table be accurate than impressive. The architecture and domain modeling are the mature part of this project; production-hardening the deployment story is the current, active work — you're looking at it happen in CI on every push, not just taking my word for it.

## Running it (Windows)

The product is the Docker stack: the Workbench, its PostgreSQL database and
OpenAleph, with the Workbench screen served by the API at one address
([ADR-0004](docs/adr/0004-one-product-built-on-openaleph.md)).

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it.
2. Double-click **`Start Journalism Workbench.bat`**. The first start downloads and builds everything and can take 10 minutes or more; later starts take seconds.
3. The workbench opens at `http://127.0.0.1:8000`. **`Stop Journalism Workbench.bat`** stops it and keeps your data.

| What | Where |
|---|---|
| Workbench | `http://127.0.0.1:8000` |
| API docs | `http://127.0.0.1:8000/docs` |
| OpenAleph UI / API | `http://127.0.0.1:8080` / `http://127.0.0.1:8001` |
| Database editor (Adminer) | `http://127.0.0.1:8081` (System `PostgreSQL`, Server `workbench-db`, Username `journalism`, Password `POSTGRES_PASSWORD`, default `journalism-local-dev`, Database `journalism`) |

From a terminal the same thing is `docker compose up --build -d`.

The development compose file bakes a localhost-only development bearer token into
the screen it builds, because browser calls reach the containerized API through
Docker's port publishing rather than loopback. Override `API_AUTH_TOKEN` in your
shell or `.env` if you want a different local token.

Uploading a document saves it and answers at once; reading it runs as a
background job on the Procrastinate queue inside the API, and the screen shows
its progress. **OpenAleph reads the file** (text layers, OCR for scans, office
formats) and the Workbench takes its text back page by page, or paragraph by
paragraph for files without pages. When OpenAleph cannot (it is still
starting, it rejects or fails the file, it takes longer than
`OPENALEPH_READ_TIMEOUT_SECONDS`, or it returns no text) the Workbench's own
reader reads the file instead, and the job says why. A read that fails can be
retried from the document's **Retry reading** button. `GET /api/jobs` lists jobs.

On the first start, the `openaleph-setup` step creates OpenAleph's database and
search indexes before its workers start; that takes several minutes. Later
starts skip it unless the OpenAleph version changes.

Elasticsearch wants about 1 GB of heap (`OPENALEPH_ES_JAVA_OPTS`). This repo has
one git submodule ([`topic-authority-system`](https://github.com/onysnow/topic-authority-system)
at `backend/app/ai/tas_spec/`); run `git submodule update --init --recursive` after
cloning for full development.

### Developer mode (no Docker)

**`Start without Docker (developer).bat`** runs the API alone on SQLite, without
OpenAleph: a reduced mode for development, not the product. It creates a private
`.venv` (Python 3.12, installed via `winget` if missing), installs pinned
dependencies, builds the screen into `frontend/out` if Node.js is installed, and
opens `http://127.0.0.1:8000`. On SQLite there is no job queue: an upload is
read before it answers, off the server's main loop so other requests still
get through. If setup fails, check
`journalism-workbench-setup.log` and run **`Repair developer setup (no Docker).bat`**.

For front-end work, `cd frontend && npm run dev` serves the screen with hot reload
at `http://localhost:3000`, talking to the API at `http://localhost:8000`.

Name proposals come from OpenAleph's `ftm-analyze` when it returns them, and
from the Workbench's own name-finder while `ENABLE_LOCAL_ENTITY_SUGGESTIONS`
is true (the default). To leave names to OpenAleph alone:

```bash
ENABLE_LOCAL_ENTITY_SUGGESTIONS=false docker compose up --build
```

`DOCUMENT_READER=local` makes the Workbench read every file itself (then
`OPENALEPH_AUTO_SYNC_DOCUMENTS=true` still sends each file to OpenAleph after
reading it).

## Inspecting the backend

Everything the backend does is viewable without leaving the machine. Start from the
**backend console** and branch out:

| Surface | Where | What it shows |
|---|---|---|
| Backend console | `http://127.0.0.1:8000/console` (inside the workbench: `/console/`) | Database status and every table with live row counts on **any** dialect — including the SQLite file developer mode uses, which Adminer cannot open; page through rows; run read-only SQL; the complete route table with a live probe of the id-free endpoints; run the real test suite against an isolated database and watch it; the structured application log (every request with status/duration, every unhandled error with its traceback, searchable by request id); the security alert counts. Loopback-only: inside the Docker stack, browser requests arrive from Docker's network, so the console refuses them. |
| Swagger / ReDoc | `http://127.0.0.1:8000/docs`, `/redoc` | Every endpoint with its schema, callable in the browser. |
| Adminer | `http://127.0.0.1:8081` (Docker: `docker compose up -d workbench-db adminer`) | Browse **and edit** rows in the Postgres database. Server `workbench-db`, user `journalism`, password `POSTGRES_PASSWORD` (`journalism-local-dev` by default). Developer mode uses this Postgres automatically when the container is running, so what you do in the app is what Adminer shows. |
| OpenAleph UI | `http://localhost:8080` | The corpus side: collections, ingested documents, extracted entities. |
| Settings → status | `GET /api/settings/status` | Config as the running process sees it (database, storage, access mode, connectors, AI provider and limits, TAS spec version, security denials). |
| Security audit | `GET /api/settings/security/audit`, `…/summary`, `…/alerts` | The tamper-evident JSONL of every write and every denial. |
| AI trace | any AI analysis candidate → "What the model was sent" | The exact system prompt and retrieval packet a reasoning run used, beside its output. |
| CI | GitHub Actions on every push | Backend suite on real PostgreSQL, mypy + ruff, Docker build, frontend build/tests. |

Data changes are deliberate: the console refuses anything but `SELECT`/`WITH`/`EXPLAIN`
and rolls back every query; edits happen in Adminer, where you can see exactly what you
are changing.

## Security

See [`SECURITY.md`](SECURITY.md) for the vulnerability reporting process. Short version: this is designed for a trusted local workstation today; don't expose it to the open internet without treating the shared-bearer/remote-identity model as experimental.

## Development history

The full DEV 0.7 → DEV 1.24 iteration log — including every architectural decision, ownership boundary, and validation gate along the way — lives in [`CHANGELOG.md`](CHANGELOG.md). For the engineering work since DEV 1.24 (the `routes.py` module split, the ongoing structural audit tracked in [`STRUCTURE_AUDIT.md`](STRUCTURE_AUDIT.md), and everything else at session granularity), see [`dev-log.md`](dev-log.md).
