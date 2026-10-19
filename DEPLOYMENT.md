# Deploying Journalism Workbench on a shared server

`docker-compose.yml` is the local-development stack (source bind-mounted into the
container, loopback-only ports, a literal default API token, Adminer). Do not put it
on a shared host. `docker-compose.prod.yml` is the deployment file; this page is its
runbook. The trusted model is still one newsroom, a small number of reporters, one
operator -- not the public internet. Keep it behind a reverse proxy you control.

## 1. Prerequisites

- A Linux host with Docker Engine + Compose v2, and a TLS reverse proxy (Caddy, nginx,
  Traefik) terminating HTTPS for one hostname, e.g. `https://workbench.example.org`.
- The proxy forwards the workbench hostname to `127.0.0.1:8000` (the API, which also
  serves the workbench screen at `/` -- one origin, ADR-0004) and a second hostname to
  `127.0.0.1:8080` (the OpenAleph UI). The compose file binds those two to the host
  loopback only (`BIND_ADDRESS`, default `127.0.0.1`); the two databases,
  Elasticsearch, Redis and the OpenAleph workers/API are internal-network only.
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
token into the workbench screen it builds; on a shared host that hands the token to
anyone who can load the page. Reporters paste their token into the app's "API access"
panel instead. There is no `PUBLIC_API_URL` either: the screen calls the API on its
own origin.

## 3. First start

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps          # backend healthy
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

### Optional: machine translation (`translate` profile)

OpenAleph can translate documents that are not in your language, on this
machine, with Argos (ADR-0006, Wave C). The Workbench then shows the
translation beside the original (a document's "Translation" button). It is
off by default. To turn it on, add to `.env`:

```bash
OPENALEPH_TRANSLATE_DEFER=true
FTM_TRANSLATE_TARGET_LANGUAGE=eng   # three-letter code: eng, fra, deu...
```

and start with the profile:

```bash
docker compose -f docker-compose.prod.yml --profile translate up -d
```

Both settings go together: without the profile, documents queue for a
translator that is not running. The target must be the three-letter code
FollowTheMoney stores as a document's detected language; a two-letter `en`
never matches, so English documents would be translated too. The first
document in a new language pair downloads that pair (and a small sentence
splitter) from the internet into the `translate-models` and `translate-cache`
volumes; after that, translation needs no network. Translations are a reading
aid: quotes, evidence and claims are always taken from the original.

### Optional: maps (`maps` profile)

Maps draw on a base map kept on this machine, so no map provider learns which
places a reporter looks at (ADR-0005, lines 4 and 18). Install it once:

```bash
docker compose -f docker-compose.prod.yml --profile maps up basemap-extract basemap-assets
```

`basemap-extract` cuts a world map out of the Protomaps daily build (45 MB to
zoom 6, about a minute); `basemap-assets` fetches the map's fonts and symbols
from Protomaps (13 MB, about two minutes). Both are public map data and write
only to the `basemap` volume, which the backend reads. To take a newer build or
more detail, set `BASEMAP_BUILD` (a date listed at
<https://maps.protomaps.com/builds/>) or `BASEMAP_MAXZOOM` in `.env` and run the
command again; each zoom level above 6 makes the file about three times larger
(7: 189 MB, 8: 557 MB). Without it, maps say that no base map is installed. The
map data is © OpenStreetMap contributors (ODbL); every map says so.

### Behind a reverse proxy on the same machine

The app treats a caller on the loopback address as the local owner. A proxy such as
nginx running on the same host is itself a loopback caller, so without help every
remote user would look local. If you put a proxy in front of the app:

1. Set `TRUSTED_PROXY_IPS=127.0.0.1` (comma-separated IPs or CIDRs of the proxies) in `.env`.
   Requests arriving from those addresses are then never treated as local and must send the bearer token.
2. Have the proxy forward the original client address and host, for example in nginx:

   ```nginx
   location / {
       proxy_pass http://127.0.0.1:8000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $remote_addr;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

3. Keep the operations console off behind a proxy (`CONSOLE_ENABLED=false`).

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
docker compose -f docker-compose.prod.yml stop backend
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
- Data lives in six named volumes (eight with the `translate` profile, whose
  `translate-models` and `translate-cache` only hold downloaded language models,
  and `basemap`, which holds the base map the `maps` profile downloads): `workbench-pgdata` (workbench Postgres),
  `workbench-data` (documents, audit log, connector secrets, limiter state), and
  OpenAleph's `openaleph-pgdata`, `openaleph-elasticsearch-data`, `openaleph-redis-data`,
  `openaleph-archive`. Back up the two Postgres volumes and `workbench-data` /
  `openaleph-archive`; Elasticsearch and Redis can be rebuilt from them.

## 7. What this file does not do

No Adminer, no automatic TLS, no multi-replica backend, and OpenAleph runs in its
single-user mode (`ALEPH_SINGLE_USER=true`) behind the same proxy as the workbench.
Those are choices to make deliberately when the deployment outgrows one host.
