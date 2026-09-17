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
{"finding_id":"STRUCT-0001","audit_object":"backend/requirements.txt:7","audit_pass":"dependencies","severity":"BLOCKING","finding":"Pinned `followthemoney==4.11.0` does not exist on PyPI (confirmed against the PyPI JSON API — latest available is 4.10.0). Any genuinely clean `pip install -r requirements.txt` fails outright on this line.","precise_locations":["backend/requirements.txt:7"],"required_correction":"Re-pin to an existing release (4.10.0, or whichever is current when this is fixed) and verify the app still imports/uses it correctly (app/services/ftm.py) at that version.","reviewer_type":"AI_ASSISTED","status":"OPEN"}
{"finding_id":"STRUCT-0002","audit_object":"backend/app/api/routes.py","audit_pass":"folder-structure","severity":"MATERIAL","finding":"app/api/ contains a single 1797-line routes.py defining all 117 endpoints, with no sub-modules — inconsistent with app/services/ (14 separate files) and the rest of the backend's otherwise-consistent one-concern-per-file convention.","precise_locations":["backend/app/api/routes.py"],"required_correction":"Split into per-resource route modules (investigations, claims, entities, documents, connectors, settings, assistant, etc.), each with its own APIRouter mounted in main.py — mechanical refactor, no behavior change, but real enough in scope to do as its own reviewed PR rather than inside an unrelated change.","reviewer_type":"AI_ASSISTED","status":"OPEN"}
{"finding_id":"STRUCT-0003","audit_object":"backend/requirements.txt:12","audit_pass":"dependencies","severity":"MATERIAL","finding":"pypdf is a direct dependency (and the subject of ongoing Dependabot security-patch churn per issue #20 / task #10) but has zero references anywhere in app/ or tests/ — pymupdf (fitz) appears to be the PDF library actually in use (app/services/pdf_ocr.py).","precise_locations":["backend/requirements.txt:12"],"required_correction":"Confirm whether pypdf is genuinely unused leftover from a prior implementation (remove it, and stop tracking its CVEs) or is intended for near-term use (if so, note why it's not yet imported anywhere).","reviewer_type":"AI_ASSISTED","status":"OPEN"}
{"finding_id":"STRUCT-0004","audit_object":"backend/app/services/ftm.py:3-4","audit_pass":"docs-hygiene","severity":"NON_MATERIAL","finding":"Comment states 'production requirements still install FollowTheMoney' as justification for a try/except ImportError fallback — currently false, since the pinned version (STRUCT-0001) can't install at all in a clean environment.","precise_locations":["backend/app/services/ftm.py:3-4"],"required_correction":"Fix alongside STRUCT-0001 (same root cause) — verify the comment's claim is true again once the pin is corrected.","reviewer_type":"AI_ASSISTED","status":"OPEN"}
{"finding_id":"STRUCT-0005","audit_object":".github/workflows/","audit_pass":"ci-workflows","severity":"MATERIAL","finding":"actions/checkout is pinned at @v7 in codeql.yml and backend-postgres-ci.yml but @v4 in docker-build.yml and frontend-ci.yml, with no apparent reason for the split (confirmed v7 itself isn't the cause of task #35's failure — codeql.yml also uses v7 and passes fine).","precise_locations":[".github/workflows/backend-postgres-ci.yml:40","--> .github/workflows/codeql.yml:25","--> .github/workflows/docker-build.yml:14","--> .github/workflows/frontend-ci.yml:23"],"required_correction":"Reconcile to one checkout version across all workflows (v7, since two workflows already use it successfully) unless a specific compatibility reason for staying on v4 exists somewhere.","reviewer_type":"AI_ASSISTED","status":"OPEN"}
{"finding_id":"STRUCT-0006","audit_object":"backend/alembic/versions/","audit_pass":"migrations","severity":"OPTIONAL","finding":"The migration chain forked into two heads this session (b84e2fa90c17 / c05f9e3a1d64, from two independently-merged PRs) before being caught and fixed while landing issue #36's migration. Nothing currently enforces single-head-ness.","precise_locations":["backend/alembic/versions/"],"required_correction":"Add a CI check (e.g. `alembic heads | wc -l` == 1) to backend-postgres-ci.yml or a lightweight lint workflow, so a future fork is caught at PR time instead of silently blocking `upgrade head` until someone runs it locally.","reviewer_type":"AI_ASSISTED","status":"CORRECTED"}
{"finding_id":"STRUCT-0007","audit_object":"backend/.env.example","audit_pass":"config-sync","severity":"NON_MATERIAL","finding":"5 of 37 Settings fields have no corresponding entry in .env.example: openaleph_probe_timeout_seconds, connector_credentials_file, max_api_request_bytes, audit_log_file, api_auth_failure_limit_per_minute.","precise_locations":[".env.example"],"required_correction":"Add the missing 5 keys (commented, matching the file's existing style) so .env.example stays a complete reference of every configurable setting.","reviewer_type":"AI_ASSISTED","status":"OPEN"}
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

## Not yet covered (be honest about scope, don't reuse this report to skip it)

- Pass 2 (model ↔ migration field-for-field diff) beyond the
  incidental verification already done while landing AIAnalysisCandidate.
- Pass 6 (frontend components) — not started this cycle.
- Pass 10 (docs-hygiene) beyond the one ftm.py comment (STRUCT-0004) —
  BUILD_STATE.md, CORE_BASICS_AUDIT.md, and the others were not
  checked for currency against the actual codebase this cycle.
