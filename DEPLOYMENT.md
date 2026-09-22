# Deploying Journalism Workbench on a shared server

`docker-compose.yml` is the local-development stack (source bind-mounted into the
container, loopback-only ports, a literal default API token, Adminer). Do not put it
on a shared host. `docker-compose.prod.yml` is the deployment file; this page is its
runbook. The trusted model is still one newsroom, a small number of reporters, one
operator -- not the public internet. Keep it behind a reverse proxy you control.

## 1. Prerequisites

- A Linux host with Docker Engine + Compose v2, and a TLS reverse proxy (Caddy, nginx,
  Traefik) terminating HTTPS for one hostname, e.g. `https://workbench.example.org`.
- The proxy forwards `/` to `127.0.0.1:3000` (frontend), the API path to
  `127.0.0.1:8000`, and a second hostname to `127.0.0.1:8080` (the OpenAleph UI). The
  compose file binds those three to the host loopback only (`BIND_ADDRESS`, default
  `127.0.0.1`); the two databases, Elasticsearch, Redis and the OpenAleph workers/API
  are internal-network only.
- OpenAleph is part of the stack, not optional. Budget for it: Elasticsearch alone wants
  ~1 GB heap (`OPENALEPH_ES_JAVA_OPTS`, default `-Xms1g -Xmx1g`), the OpenAleph images
  are linux/amd64, and the archive volume grows with every ingested document.

## 2. Configuration (`.env` next to the compose file, mode 600)

Required -- the stack refuses to start without them:

| Variable | What |
|---|---|
| `POSTGRES_PASSWORD` | Database password. `openssl rand -hex 24`. |
| `API_AUTH_TOKEN` | Shared bearer token for remote API access. `openssl rand -hex 32`. Rotate by changing it and restarting `backend`; persisted per-user tokens (Settings → Security → Users) keep working. |
| `PUBLIC_ORIGIN` | The https origin the proxy serves (`https://workbench.example.org`). Becomes the only allowed CORS origin. |
| `PUBLIC_API_URL` | The URL the *browser* reaches the API at, as routed by your proxy. Baked into the frontend bundle at build time -- change it and rebuild. |
| `PUBLIC_OPENALEPH_URL` | The https URL the proxy serves the OpenAleph UI at (e.g. `https://aleph.example.org`, forwarded to `127.0.0.1:8080`). |
| `OPENALEPH_SECRET_KEY` | OpenAleph's session/signing secret. `openssl rand -hex 32`. |
| `OPENALEPH_DB_PASSWORD` | Password for OpenAleph's own Postgres 17 (separate from the workbench database on purpose -- two products, two ownership boundaries). |

Optional: `OPENALEPH_AUTO_SYNC_DOCUMENTS` (default `true` here: uploads flow into the
OpenAleph corpus), `ENABLE_LOCAL_ENTITY_SUGGESTIONS` (default `false` here: OpenAleph's
`ftm-analyze` owns extraction), `OPENALEPH_TAG` (image tag, default `5.3.1`),
`API_AUTH_INVESTIGATION_IDS` (comma list, scopes the shared token),
`ENABLE_AI_FEATURES` / `AI_PROVIDER` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (see
`.env.example` for the rate-limit and timeout knobs), connector keys (`ALEPH_API_KEY`,
`OPENSANCTIONS_API_KEY`, `FIRECRAWL_API_KEY`), `ENABLE_RESTORE_API` (leave `false`
unless you are actively restoring -- see §5), `WORKBENCH_TAG` (image tag, default
`latest`), `BIND_ADDRESS`.

Deliberately absent: `NEXT_PUBLIC_API_AUTH_TOKEN`. The dev compose bakes the shared
token into the public JavaScript bundle; on a shared host that hands the token to
anyone who can load the page. Reporters paste their token into the app's "API access"
panel instead.

## 3. First start

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps          # backend/frontend healthy
curl -s http://127.0.0.1:8000/api/health              # {"status":"ok"} from the host
```

The backend runs `ensure_database_schema()` at startup (app lifespan): on an empty
database it applies the Alembic chain to head; on a database at head it is a no-op; on
a database it does not recognise it **refuses to start** rather than mutate it. Read
`docker compose logs backend` if the container restarts.

Then, from the app: Settings → Security → create persisted users for each reporter
(their tokens can be rotated and revoked individually); check Settings → status shows
`access.mode = shared_bearer` or `persisted_users`, and that
`security.total_denials` is 0.

## 4. Upgrade

```bash
git pull                                              # or check out the release tag
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d       # recreates changed services only
docker compose -f docker-compose.prod.yml logs -f backend   # watch the schema step
```

Migrations run forward automatically at backend start. Take a backup first (§5) when
the release notes mention a migration.

## 5. Rollback

There are two different things to roll back; do them in this order.

**Code** (no migration in the release): check out the previous tag, rebuild, `up -d`.

**Schema** (the release added a migration): the running code must never be older than
the schema it is talking to. So:

```bash
# 1. stop the app, keep the database
docker compose -f docker-compose.prod.yml stop backend frontend
# 2. downgrade one migration at a time from the NEW image (it knows the migration)
docker compose -f docker-compose.prod.yml run --rm backend alembic downgrade -1
#    ...repeat, or `alembic downgrade <revision>` for the exact target;
#    `alembic history` lists the chain, `alembic current` shows where you are
# 3. only now switch the code back and start
git checkout <previous-tag>
docker compose -f docker-compose.prod.yml up -d --build
```

If a downgrade fails part-way, do not improvise: restore the database from the pre-upgrade
backup (below) and start the previous tag.

**Data** -- two mechanisms, use both:

- *Database-level*: before every upgrade,
  `docker compose -f docker-compose.prod.yml exec workbench-db pg_dump -U journalism journalism > backup-$(date +%F).sql`.
  Restore with `psql` into a fresh volume. This is the whole-instance safety net.
- *Investigation-level*: the app's own portable backup (`GET /api/investigations/{id}/export`,
  or the "Portable investigation backup & restore" panel) produces a self-contained
  archive per investigation -- documents, extracted text, review trail, AI analysis
  queue -- that restores into any instance. Restore is disabled by default:
  set `ENABLE_RESTORE_API=true`, restart `backend`, restore through the panel (it
  previews conflicts and refuses foreign-investigation rows and duplicate ids), then
  set it back to `false`.

## 6. Watching it

- `GET /api/settings/status` → `security` block: denials in the last 24h,
  `needs_attention` when they exceed `SECURITY_ALERT_DENIALS_PER_DAY` (default 20) or
  any lockout occurred. Also shown in the app's API access panel.
- `GET /api/settings/security/alerts?window_hours=1` for detail; `…/audit` for the raw
  log; `…/audit/retention-preview` before trimming it.
- The auth-failure limiter persists to the data volume, so a lockout in progress
  survives a restart. It is still per-process: if you ever run more than one backend
  replica, rate-limit at the proxy as well.
- Data lives in six named volumes: `workbench-pgdata` (workbench Postgres),
  `workbench-data` (documents, audit log, connector secrets, limiter state), and
  OpenAleph's `openaleph-pgdata`, `openaleph-elasticsearch-data`, `openaleph-redis-data`,
  `openaleph-archive`. Back up the two Postgres volumes and `workbench-data` /
  `openaleph-archive`; Elasticsearch and Redis can be rebuilt from them.

## 7. What this file does not do

No Adminer, no automatic TLS, no multi-replica backend, and OpenAleph runs in its
single-user mode (`ALEPH_SINGLE_USER=true`) behind the same proxy as the workbench.
Those are choices to make deliberately when the deployment outgrows one host.
