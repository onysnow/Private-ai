# Contributing

Journalism Workbench is currently a closed personal project (see [LICENSE](LICENSE)) — it isn't accepting outside contributions yet. This document exists so the development process is transparent to reviewers and anyone with repo access.

## Development setup

- **Backend:** FastAPI + SQLAlchemy, Python 3.12. Dependencies are layered across three files (STRUCT-0026): `backend/requirements.txt` (runtime only -- what the Docker image installs), `backend/requirements-test.txt` (adds pytest/pytest-cov, `-r requirements.txt`), and `backend/requirements-local.txt` (adds mypy/ruff/black/pypdf for local dev and lint CI, `-r requirements-test.txt`). On Windows, `Start Journalism Workbench.bat` provisions a private `.venv` and installs pinned dependencies automatically.
- **Frontend:** Next.js + React + TypeScript (`frontend/package.json`).
- **Full stack** (Postgres + OpenAleph + frontend): `docker compose up --build`.

## Branch and PR process

- `main` is protected — changes land through pull requests, not direct pushes.
- Every PR should pass CI (CodeQL at minimum; backend/frontend test workflows as they come online — see the status table in [README.md](README.md)).
- Keep PRs scoped to one concern.
- Follow [`.github/copilot-instructions.md`](.github/copilot-instructions.md) for the non-negotiable product rules (evidence-first provenance, non-destructive merges, stack ownership boundaries) — they apply to human-authored and AI-authored changes alike.
- Never introduce real names of people, companies, or other identifying details into fixtures, tests, or UI placeholders — this repo is public.

## Reporting a bug or requesting a feature

Use the issue templates under `.github/ISSUE_TEMPLATE/`. Found a security issue? See [SECURITY.md](SECURITY.md) instead of opening a public issue.
