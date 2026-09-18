# Structure Audit — 2026-09-17

Run against `dev` @ `ba67c98`, per `APPLICATION_STRUCTURE_AUDIT_PROMPT.md`.
**Status: LIMITED REVIEW** — Passes 1, 3, 7, 8, 9 got full treatment;
Pass 4/5 got a real but partial check (route file structure, service
dead-code scan); Pass 2 (model↔migration field-for-field diff), Pass 6
(frontend components), and Pass 10 (full docs-accuracy sweep) were not
done this cycle — scope/time, not a defect found and dismissed. Re-run
those specifically next pass rather than assuming this report is
exhaustive.

## Findings

```json
{"finding_id":"STRUCT-0001","audit_object":"backend/requirements.txt:7","audit_pass":"dependencies","severity":"NON_MATERIAL","finding":"CORRECTED FROM PRIOR PASS: originally flagged as BLOCKING (followthemoney==4.11.0 not found on PyPI). Re-verified: this was a transient PyPI index-propagation delay shortly after 4.11.0’s release — it now resolves correctly (confirmed via `uv pip install` dry-run and real resolution). The pin itself is fine. What IS real: `followthemoney` pulls in `pyicu` (via `normality`) as a transitive dependency, and pyicu has no prebuilt wheel — it must build from source against system ICU + pkg-config. This audit’s sandbox has no root/apt access to install those, so the build was not verified end-to-end here. BUILD_STATE.md’s repeated ‘full backend regression passed’ entries and this session’s own green docker-build CI checks are reasonably strong evidence the real install targets (Docker image, CI runner, Ony’s local dev setup) already satisfy this — but it was not independently re-confirmed this pass.","precise_locations":["backend/requirements.txt:7"],"required_correction":"No code change needed. If a future clean-install failure ever reproduces, check for missing libicu-dev/pkg-config on that specific machine before re-litigating the version pin.","reviewer_type":"AI_ASSISTED","status":"VERIFIED"}
{"finding_id":"STRUCT-0002","audit_object":"backend/app/api/routes.py","audit_pass":"folder-structure","severity":"MATERIAL","finding":"app/api/ contains a single 1797-line routes.py defining all 117 endpoints, with no sub-modules — inconsistent with app/services/ (14 separate files) and the rest of the backend's otherwise-consistent one-concern-per-file convention.","precise_locations":["backend/app/api/routes.py"],"required_correction":"Split into per-resource route modules (investigations, claims, entities, documents, connectors, settings, assistant, etc.), each with its own APIRouter mounted in main.py — mechanical refactor, no behavior change, but real enough in scope to do as its own reviewed PR rather than inside an unrelated change.","reviewer_type":"AI_ASSISTED","status":"OPEN"}
{"finding_id":"STRUCT-0003","audit_object":"backend/requirements.txt:12","audit_pass":"dependencies","severity":"MATERIAL","finding":"pypdf is a direct dependency (and the subject of ongoing Dependabot security-patch churn per issue #20 / task #10) but has zero references anywhere in app/ or tests/ — pymupdf (fitz) appears to be the PDF library actually in use (app/services/pdf_ocr.py).","precise_locations":["backend/requirements.txt:12"],"required_correction":"Removed from requirements.txt.","reviewer_type":"AI_ASSISTED","status":"CORRECTED"}
{"finding_id":"STRUCT-0004","audit_object":"backend/app/services/ftm.py:3-4","audit_pass":"docs-hygiene","severity":"NON_MATERIAL","finding":"WITHDRAWN: this was reasoned from STRUCT-0001’s original (incorrect) BLOCKING claim, which STRUCT-0001 has since corrected. The comment’s claim is accurate — no defect here.","precise_locations":["backend/app/services/ftm.py:3-4"],"required_correction":"None.","reviewer_type":"AI_ASSISTED","status":"VERIFIED"}
{"finding_id":"STRUCT-0005","audit_object":".github/workflows/","audit_pass":"ci-workflows","severity":"MATERIAL","finding":"actions/checkout is pinned at @v7 in codeql.yml and backend-postgres-ci.yml but @v4 in docker-build.yml and frontend-ci.yml, with no apparent reason for the split (confirmed v7 itself isn't the cause of task #35's failure — codeql.yml also uses v7 and passes fine).","precise_locations":[".github/workflows/backend-postgres-ci.yml:40","--> .github/workflows/codeql.yml:25","--> .github/workflows/docker-build.yml:14","--> .github/workflows/frontend-ci.yml:23"],"required_correction":"Reconciled: all four workflows now pin actions/checkout@v7; actions/setup-node bumped v4->v7 in frontend-ci.yml to match actions/setup-python@v7 in backend-postgres-ci.yml.","reviewer_type":"AI_ASSISTED","status":"CORRECTED"}
{"finding_id":"STRUCT-0006","audit_object":"backend/alembic/versions/","audit_pass":"migrations","severity":"OPTIONAL","finding":"The migration chain forked into two heads this session (b84e2fa90c17 / c05f9e3a1d64, from two independently-merged PRs) before being caught and fixed while landing issue #36's migration. Nothing currently enforces single-head-ness. STATUS CORRECTION: this was wrongly marked CORRECTED in an earlier pass -- the fork itself was fixed (the merge migration), but the required_correction below (a CI check preventing recurrence) was never actually implemented. Re-opened.","precise_locations":["backend/alembic/versions/"],"required_correction":"Add a CI check (e.g. `alembic heads | wc -l` == 1) to backend-postgres-ci.yml or a lightweight lint workflow, so a future fork is caught at PR time instead of silently blocking `upgrade head` until someone runs it locally. Blocked in practice by STRUCT-0012 (backend-postgres-ci.yml itself is not running).","reviewer_type":"AI_ASSISTED","status":"OPEN"}
{"finding_id":"STRUCT-0007","audit_object":"backend/.env.example","audit_pass":"config-sync","severity":"NON_MATERIAL","finding":"5 of 37 Settings fields have no corresponding entry in .env.example: openaleph_probe_timeout_seconds, connector_credentials_file, max_api_request_bytes, audit_log_file, api_auth_failure_limit_per_minute.","precise_locations":[".env.example"],"required_correction":"Added all 5 keys, commented, in their natural sections; re-verified 0 Settings fields now missing from .env.example.","reviewer_type":"AI_ASSISTED","status":"CORRECTED"}
{"finding_id":"STRUCT-0008","audit_object":"backend/app/api/routes.py","audit_pass":"api-routes","severity":"MATERIAL","finding":"Beyond STRUCT-0002's file-size/module-boundary problem: routes.py contains 62 direct db.query/execute/add/commit calls against only 24 imports from app.services. A meaningful share of this file's business logic lives inline in HTTP handlers rather than in the services layer, so it cannot be unit-tested without spinning up the full FastAPI/TestClient stack, and it cannot be reused by anything other than an HTTP request (e.g. a future CLI, worker, or the reasoning layer in app/ai/reasoning.py).","precise_locations":["backend/app/api/routes.py"],"required_correction":"When STRUCT-0002's split happens, do not just move code verbatim into N files by URL prefix -- extract the inline query/mutation logic in each group into the matching app/services/ module (most domains already have one, e.g. relationships.py, documents.py) so each new route file is a thin HTTP adapter over a testable service function, matching the pattern app/ai/reasoning.py + app/api/routes.py already established for issue #36.","reviewer_type":"AI_ASSISTED","status":"OPEN"}
{"finding_id":"STRUCT-0009","audit_object":"backend/app/core/security_controls.py","audit_pass":"folder-structure","severity":"MATERIAL","finding":"CORRECTED (REMEDIATION_PROMPT.md Stage A): split into app/core/request_limits.py (RequestBodyTooLarge, RequestLimitPolicy, validate_content_length, validate_request_envelope), app/core/rate_limiter.py (FixedWindowRateLimiter), and app/core/audit_log.py (SecurityAuditLogger, new_request_id, should_audit_request, read/summarize/preview/apply_security_audit_retention). security_controls.py deleted; all 4 import sites (app/main.py, app/api/routes.py, tests/test_security_controls.py, tests/test_security_audit_retention.py) updated. Verified: full backend suite (216 tests) still passes with an identical pass count, zero test logic changed -- only import paths.","precise_locations":["backend/app/core/request_limits.py","backend/app/core/rate_limiter.py","backend/app/core/audit_log.py"],"required_correction":"Done.","reviewer_type":"AI_ASSISTED","status":"CORRECTED"}
{"finding_id":"STRUCT-0010","audit_object":"backend/app/main.py:24-49","audit_pass":"api-routes","severity":"MATERIAL","finding":"app/main.py conflates FastAPI app construction with bootstrap side effects at import time: `ensure_database_schema(engine)` runs unconditionally on import, and `_request_limits` / `_audit` / `_auth_failures` are module-level singletons built directly from `settings` at import time. There is no `create_app()` factory, so nothing importing `app.main.app` (including every test file) can substitute a fake audit logger, a different rate-limit policy, or skip the schema-migration side effect -- it either runs against real `settings.database_url` / `settings.audit_log_file`, or the whole module fails to import.","precise_locations":["backend/app/main.py:24","backend/app/main.py:42-49"],"required_correction":"Refactor to an app-factory function (e.g. `create_app(settings=...) -> FastAPI`) that builds these objects from an injected settings/config object rather than the module-level singleton, matching the pattern app/ai/llm_client.py already uses for provider config (get_llm_client(settings)). Tests then construct their own app instance with test doubles instead of relying on whatever the real Settings resolve to at import time.","reviewer_type":"AI_ASSISTED","status":"OPEN"}
{"finding_id":"STRUCT-0011","audit_object":"backend/tests/","audit_pass":"api-routes","severity":"MATERIAL","finding":"No conftest.py exists anywhere in backend/tests/. Each test file rolls its own ad hoc `setup_module()` (typically `Base.metadata.drop_all(bind=engine); Base.metadata.create_all(bind=engine)`) against the single shared `engine`/`SessionLocal` that `app.main` already constructed at import time from real `settings.database_url`. There is no per-test transaction rollback and no fixture-based isolation -- tests within a run share one database and rely on each file's own wipe running first, which is order-dependent and cannot be safely parallelized (pytest-xdist would race two files' setup_module against the same tables).","precise_locations":["backend/tests/"],"required_correction":"Add a conftest.py with a session/function-scoped pytest fixture that creates an isolated engine (e.g. sqlite:///:memory: with StaticPool, or a fresh schema per test) and a FastAPI dependency override for get_db, wrapping each test in a transaction that rolls back afterward. Replace each file's own setup_module with that fixture. Depends on STRUCT-0010's app-factory refactor to override cleanly.","reviewer_type":"AI_ASSISTED","status":"OPEN"}
{"finding_id":"STRUCT-0012","audit_object":".github/workflows/backend-postgres-ci.yml","audit_pass":"ci-workflows","severity":"BLOCKING","finding":"CORRECTED (REMEDIATION_PROMPT.md Stage B, task #35 root-caused and fixed): the GitHub Actions web UI's \"Invalid workflow file\" annotation (never exposed by the REST API, which is why every prior API-only diagnosis attempt stalled) showed the real cause: line 51's `if: ${{ secrets.TAS_REPO_TOKEN != \u0027\u0027 }}` -- the `secrets` context is not a valid named-value inside an `if:` condition at all (a documented Actions runner limitation, actions/runner#520). This workflow had never successfully dispatched on any prior commit. Fixed by hoisting TAS_REPO_TOKEN into the job-level env: block and having the step read env.TAS_REPO_TOKEN instead. Verified: run #94 (commit 3b734ed) is this workflow's first-ever successful dispatch, ran a real job end to end, and the backend pytest suite passed against real PostgreSQL for the first time this session (not sqlite).","precise_locations":[".github/workflows/backend-postgres-ci.yml"],"required_correction":"Done. Recommend also adding this workflow as a required status check in branch protection settings so a future PR cannot merge without it passing -- not yet confirmed whether that's configured (out of scope for this cycle; a GitHub repo-settings change, not a code fix).","reviewer_type":"AI_ASSISTED","status":"CORRECTED"}
```

## Patterns across passes

STRUCT-0001, STRUCT-0003, and STRUCT-0004 share one root cause worth
fixing together: the backend's PDF/entity-schema dependency set has
drifted from what's actually imported (one pin that can't even
install, one dependency that's fully unused, one comment whose claim
is no longer true). None of these are independent surprises — they're
one dependency-hygiene pass that's overdue, not three unrelated bugs.

STRUCT-0002 is unrelated to the others but is the single highest-
leverage structural finding: a 1797-line, 117-endpoint single file is
the kind of thing that makes every future "add one endpoint" PR touch
a file everything else also touches, which is exactly the kind of
avoidable merge-conflict generator this session already spent time on
for `frontend/package.json` (PR #27) — worth fixing before it causes
the same kind of friction on the backend side.


## Service boundaries (asked about directly this cycle)

OpenAleph (ingest/analyze/worker/api/ui) is already correctly split
out as its own set of containers behind an HTTP boundary
(`OPENALEPH_BASE_URL`, gated by the `openaleph` compose profile and
the `OPENALEPH_ENABLED` flag in docker-compose.yml) rather than being
embedded in the FastAPI backend process. No change needed there --
this is the one part of the architecture that already reflects a
correct microservice boundary. Nothing else in the backend currently
looks like it's doing heavy background/worker-style processing that
should be pulled out into its own service; the problems found this
cycle (STRUCT-0002/0008/0009/0010/0011/0012) are all about
in-process organization and testability, not missing service
boundaries.

The frontend is not yet large enough to need a components split
(`frontend/app/page.tsx` is 139 lines; almost everything else in
`frontend/components/` is shadcn/ui primitives, not app logic) --
flagged as a watch item, not a finding: split `page.tsx` into
feature components as #43/#44/#45 land, before it grows into a
second routes.py.

## Not yet covered (be honest about scope, don't reuse this report to skip it)

- Pass 2 (model ↔ migration field-for-field diff) beyond the
  incidental verification already done while landing AIAnalysisCandidate.
- Pass 6 (frontend components) — not started this cycle.
- Pass 10 (docs-hygiene) beyond the one ftm.py comment (STRUCT-0004) —
  BUILD_STATE.md, CORE_BASICS_AUDIT.md, and the others were not
  checked for currency against the actual codebase this cycle.
