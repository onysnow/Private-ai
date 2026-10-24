# Security and deployment register

The 23 Oct 2026 audit (P1, "Security and deployment maturity") asked for this: what was checked,
what was found, and what is open. First written 24 Oct 2026. Each row says how it was checked;
nothing here is a penetration test or a review of a live deployment.

## Known vulnerabilities in dependencies

| Package | Was | Finding | State | Checked with |
|---|---|---|---|---|
| Pillow (backend) | 12.3.0 | 37 known vulnerabilities, fixed in 13.0.0 | **fixed**: 13.0.0. OCR, picture, deck, export and PDF tests pass on it (with Tesseract installed) | `pip-audit -r backend/requirements.txt`: none left |
| next (frontend) | 15.5.27 | critical: remote code execution through the image optimiser with SVG files (GHSA-2464-fhr4-w9xw); denial of service with Server Actions (GHSA-p3m5-59mp-jv5r) | **fixed**: 15.5.28. Typecheck, 1307 tests and build pass | `npm audit --omit=dev` |
| zod (frontend) | 3.25.76 | high: memory exhaustion validating oversized constrained collections (GHSA-mrhx-c7xc-m3w5); fixed only in zod 4.6.6 | **fixed** on 24 Oct (Ony's call): zod 4.6.7, `@hookform/resolvers` 5.9.2 (resolvers 3 supports zod 3 only), the API client regenerated with the zod plugin's `compatibilityVersion: 4`, and the entity form typed with its input and output shapes. Typecheck, lint, 1307 tests and build pass | `npm audit --omit=dev`: none left |

Dev-only packages were not scanned (`--omit=dev`). `eslint-config-next` stays at 15.5.26; it is a
lint config, not part of the running app.

## Exposure of the Docker stack

| Item | Finding | Checked in |
|---|---|---|
| Published ports (developer stack) | every port is bound to `127.0.0.1`; Elasticsearch, Redis and OpenAleph's database publish none | `docker-compose.yml` |
| Published ports (production stack) | bound to `${BIND_ADDRESS:-127.0.0.1}`; exposing them is an explicit setting | `docker-compose.prod.yml` |
| Secrets (production stack) | database passwords, the OpenAleph secret key and `API_AUTH_TOKEN` must be set (`${…:?…}`), so the stack does not start with a default | `docker-compose.prod.yml` |
| Secrets (developer stack) | default passwords and a default API token (`docker-compose-local-dev-token`), which is also built into the browser bundle as `NEXT_PUBLIC_API_AUTH_TOKEN`. Fine on one computer; anyone who can load the page has it | `docker-compose.yml` |

## Upstream versions (OpenAleph and what it runs on)

| Service | Pin | Finding |
|---|---|---|
| OpenAleph API, worker, ingest-file, ftm-analyze, UI | `${OPENALEPH_TAG:-5.3.1}` | pinned; the weekly **OpenAleph live CI** (`.github/workflows/openaleph-live-ci.yml`) runs the Workbench against these real services, so an OpenAleph upgrade is tested before it is used |
| ftm-translate | `5.3.0-argos` | pinned |
| Elasticsearch | `ghcr.io/openaleph/elasticsearch:latest` | **not pinned**: on 24 Oct `latest` was the same image as the moving tag `9` (digest `sha256:89586922…`), so a `docker compose pull` can bring a new Elasticsearch 9.x minor without any change in the repo. The existing search index lives in its volume |
| Redis | `redis:alpine` | **not pinned**: any Redis version |
| PostgreSQL | `postgres:16-alpine`, `postgres:17-alpine` | major version pinned |

Upgrade and rollback steps for the Workbench itself are in `DEPLOYMENT.md` §4–5.

## Not checked

- Authentication and authorization were not re-tested here beyond the existing suite
  (`test_api_access_guard.py`, `test_investigation_authorization.py`).
- No threat model, penetration test or check of a running deployment.
- Backup and restore were not re-run.
