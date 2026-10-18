# Running, screenshotting and testing

## Servers (cloud container)

API, from `backend/`. `TZ=UTC` is required. The AI settings make "where it runs" read "on this computer"; no model is
actually reachable, so runs need the stand-in model in `tools/seed_run.py`.
```
TZ=UTC DATABASE_URL=sqlite:////tmp/claude-0/run/app.db ENABLE_AI_FEATURES=true AI_PROVIDER=ollama OLLAMA_MODEL=qwen2.5:32b-instruct \
  nohup python -m uvicorn app.main:app --port 8000 > /tmp/claude-0/run/api.log 2>&1 &
```

Web, from `frontend/`:
```
rm -rf .next && nohup npx next dev -p 3000 > /tmp/claude-0/run/web.log 2>&1 &
```

CORS only allows ports 3000 (web) and 8000 (API).

After a new migration, upgrade the demo database:
```
cd backend && TZ=UTC DATABASE_URL=sqlite:////tmp/claude-0/run/app.db alembic upgrade head
```

To build a demo database from scratch:
1. Start the API on an empty `DATABASE_URL`; the tables are created by `alembic upgrade head`.
2. `POST /api/demo/seed` creates the "Demo Investigation".
3. `POST /api/demo/cases/{case_id}` (list them with `GET /api/demo/cases`) loads the real demo cases (1MDB, Anise,
   Vekselberg, Deripaska). 1MDB's files cannot download in the cloud.
4. Run the seed scripts in `tools/` for the mockups' own data.

## Traps already hit

- **Opening a given case by link:** the parameter is **`?inv=<id>`**, not `?investigation=`. Without it, the app
  opens the newest case.
- **Killing a server:** `pkill -f ...` returns exit code 144 but works. Start servers in a separate command. If port
  3000 is still busy afterwards, find the leftover processes with `ps aux | grep next` and kill them by PID.
- **After regenerating the API client,** restart the web server and delete `frontend/.next`. Otherwise you get
  "X is not a function" or ENOENT errors from a stale build.
- **Backend code changes** need the API restarted; uvicorn runs without `--reload`.
- **The "Steps and pages" rail** on the left edge shows in every screenshot. It is the app frame, not the screen.

## Regenerating the API client after a backend schema change

```
cd backend && TZ=UTC python3 ../tools/export_openapi.py
cd ../frontend && npm run generate:api
```

Fixtures in frontend tests must be full shapes, because replies are checked against the generated Zod schemas.

A route that returns `text/event-stream` breaks the generated client. Keep such a route out of the schema with
`include_in_schema=False`, as `routes_ai_runs.py` does.

## Tests

### Backend
Run the files a change touches; the full suite takes about two hours.
```
cd backend && TZ=UTC python -m pytest -p no:cacheprovider tests/<file> --no-cov -W ignore -q -p no:logging
ruff check app tests/<file>
python -m mypy   # plain, as CI runs it
```

Guard tests to run whenever you add a table or a route:
- `test_ai_candidate_lifecycle_seams.py`
- `test_models_split.py`
- `test_migrations.py`
- `test_api_contract.py`. Add an id to `Seeded(ids={...})` for any new path parameter. Routes that take an id
  other than `claim_id` or `document_id` belong under `/investigations/{investigation_id}/...`, with an
  ownership check.

### Frontend
```
cd frontend && npx vitest run
npx tsc --noEmit -p .
npx eslint <files>
```

- vitest treats every `tests/*.ts` file as a test, so put shared fixtures in `test-support/`.
- Components that use `useRouter` need `vi.mock('next/navigation', ...)` in their tests.

## Screenshots and clicking through screens

The browser is pre-installed Chromium with Playwright: `executablePath: '/opt/pw-browsers/chromium'`. Never run
`playwright install`.

- `tools/shot.mjs <url> <out.png> [actions]`: a screenshot at 1440×900.
  - `THEME=forest-ledger` (or `rain-noir`) sets the theme.
  - `FULL=1` takes the whole page.
  - Actions are separated by `||`: either `select:<css>=<value>` or a CSS selector to click.
- `tools/money-func.mjs` and `tools/cc-func.mjs` click every Money / Chain of Custody control and print the result
  of each, plus any 4xx/5xx responses or page errors. Pass `INV=<case id>`.
- Compare screenshots with `docs/design/mockups/*.png` in the mockup's own theme:
  - SEE_2 is drawn in Forest Ledger;
  - CHECK_2 and most others are drawn in Rain Noir or Case Night.
