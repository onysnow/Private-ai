# Incident Response Runbook

This is an operator-facing runbook, not the vulnerability-disclosure
policy in [`SECURITY.md`](SECURITY.md) -- it's for Ony (the single
trusted operator running this workbench) to use when something looks
wrong: an unexpected spike of denied/rate-limited requests, a suspected
leaked connector credential, or investigation data that looks tampered
with.

The pieces this runbook ties together already exist and are exercised
by the test suite; nothing here is new functionality, only the order to
run it in. All commands below assume you're running them from the same
machine the workbench is running on (`http://127.0.0.1:8000`), since
most of these endpoints are local-request-only by design (see
`app/core/access.py`) -- if you get a `403`, you're not calling from
localhost.

## 1. Preserve evidence first: take a fresh backup export

Before you prune the audit log, rotate anything, or otherwise touch
state, export every investigation you're worried about. Exports are
per-investigation zip files (`app/services/exports.py`) and don't
mutate anything, so there's no reason not to do this immediately:

```bash
# List investigations to get their IDs
curl -s http://127.0.0.1:8000/api/investigations | python3 -m json.tool

# Export one (change the ID; repeat per investigation of concern)
curl -s -o incident-$(date +%Y%m%dT%H%M%S).jwbackup.zip \
  "http://127.0.0.1:8000/api/investigations/<investigation_id>/export"
```

Keep these zips outside the workbench's own data directory (a separate
drive or cloud folder) -- if the incident turns out to involve the host
itself, you don't want the only copy of your evidence sitting next to
whatever caused the incident.

## 2. Pull and read the security audit log for the window in question

The audit log (`app/core/audit_log.py`) is a local JSONL file
(`audit_log_file`, default `./data/audit/security.jsonl`) that records
every sensitive API call: method, path, status code, client host,
whether it was a local request, and an `event` tag. Start with the
aggregate summary to see if anything stands out:

```bash
curl -s http://127.0.0.1:8000/api/settings/security/audit/summary | python3 -m json.tool
```

This returns `by_event`, `by_method`, and `by_status` counts plus
`local_records`/`remote_records` totals across the whole file. The
`event` values worth watching for are:

- `access_denied` -- a request was rejected by the local-first access
  policy (wrong/missing bearer token from a non-local caller, or a
  local-only endpoint hit remotely).
- `auth_rate_limited` -- someone (or something) is repeatedly failing
  auth from the same source; the fixed-window limiter kicked in.
- `request_rejected` -- a request exceeded a configured size limit.
- `browser_write_denied` -- a mutating request came from an
  unrecognized browser origin.

A spike in any of these, especially from a `client_host` you don't
recognize, is the signal this runbook exists for. Once you know
something's off, pull the actual matching records instead of just the
counts:

```bash
# Every access_denied / auth_rate_limited record, newest window first
curl -s "http://127.0.0.1:8000/api/settings/security/audit?event=access_denied&limit=200" | python3 -m json.tool
curl -s "http://127.0.0.1:8000/api/settings/security/audit?event=auth_rate_limited&limit=200" | python3 -m json.tool

# Everything from a specific status code (e.g. every 401)
curl -s "http://127.0.0.1:8000/api/settings/security/audit?status_code=401&limit=200" | python3 -m json.tool
```

`limit`/`offset` paginate (up to 500 per call); the log never records
request bodies or credentials, only method/path/status/client metadata,
so reading it is always safe to do liberally. Do not prune the log
(`POST /api/settings/security/audit/retention`) until you're done
investigating -- pruning is exactly the kind of thing that can destroy
the evidence you're trying to read. `GET
/api/settings/security/audit/retention-preview` is available if you
need to gauge how big the file has gotten, but treat an actual prune as
a post-incident cleanup step, not something to do mid-investigation.

## 3. Rotate a suspected-leaked connector credential

If a connector API key (Aleph, OpenSanctions, Firecrawl, ...) may have
leaked, rotate it immediately -- this both revokes the old key's local
copy and lets you swap in a freshly-generated one from the provider:

```bash
# Get a new key from the provider's dashboard first, then:
curl -s -X PUT http://127.0.0.1:8000/api/settings/connectors/<provider>/credential \
  -H "Content-Type: application/json" \
  -d '{"credential": "<new-key-from-provider>"}'
```

This calls `save_connector_credential` (`app/services/settings.py`),
which validates the provider name, writes the new secret to the local,
permission-restricted credential store, and refreshes the connector
registry immediately -- no restart needed. If you just need to disable
the connector entirely rather than replace the key:

```bash
curl -s -X DELETE http://127.0.0.1:8000/api/settings/connectors/<provider>/credential
```

Both endpoints are local-request-only, matching everything else that
touches credentials.

## 4. If investigation data looks tampered with

There's no single "diff this investigation" endpoint today. The
practical path is: export the investigation now (step 1, if you haven't
already), then compare it against your most recent known-good backup
(if one exists) using the exported JSON manifests -- `app/services/exports.py`
records a version and per-record content in the backup archive, so a
plain `diff` between two exports' extracted manifests will surface
additions, deletions, and field-level changes. This is manual today;
if tampering investigations become routine, a dedicated compare tool is
worth building, but that's future work, not something this runbook can
paper over.

## After the incident

Once you've read what you need from the audit log and preserved the
exports, it's reasonable to prune the audit log back down. `POST
/api/settings/security/audit/retention` requires the request body's
`confirmation` field to be the **exact literal string**
`PRUNE SECURITY AUDIT` -- anything else (including a paraphrase or a
lowercase version) is rejected with a `ValueError`, by design, so this
can't be triggered by accident:

```bash
curl -s -X POST http://127.0.0.1:8000/api/settings/security/audit/retention \
  -H "Content-Type: application/json" \
  -d '{"keep_days": 90, "confirmation": "PRUNE SECURITY AUDIT"}'
```

`GET /api/settings/security/audit/retention-preview` (same `keep_days`/
`max_records` params, no confirmation needed) shows you what a prune
would remove before you commit to it -- run that first.

After pruning, review whether the access pattern that triggered this
points at a config change worth making (tightening `API_AUTH_TOKEN`,
revisiting who has network access to this host, etc.). Log what you
found and what you did in `dev-log.md` if this repo's engineering log
is how you track that kind of thing, so a future session has the
context if it comes up again.
