# Backend review: PR #117 (`backend/app`, new alembic versions)

Scratch proofs are in `/tmp/claude-0/review/scratch/`. Run each one from `/home/user/Private-ai/backend` with
`TZ=UTC PYTHONPATH=.:tests python -m pytest -p no:cacheprovider -p conftest <file> --no-cov -W ignore -q -s`.

Counts: high 2, medium 4, low 3.

---

## 1. A mailbox monitor switched to Tor still connects directly, and the outbound log says "through Tor" (HIGH)

- **Where:** `app/api/routes_following.py:104-106` (`update_monitor` accepts `route` for any monitor that is not closed); `app/services/mailbox.py:148-166` (`check` → `_connect` makes a plain `imaplib.IMAP4_SSL` connection and never reads `monitor.route`); `app/services/following.py:182-188` (`_log` adds " (through Tor)" whenever `monitor.route == "tor"`).
- **Scenario:** A reporter follows a newsletter mailbox, then PATCHes `/api/monitors/{id}` with `{"route": "tor"}` to hide their address. The API answers 200 with `route: "tor"`. Every later check, scheduled or manual, opens a direct TCP/TLS connection from the reporter's own IP to the IMAP server. The outbound log row reads `Following: Newsletters from … (through Tor)`. So the user is told they are hidden, and the custody log records a route that was never used.
- **Evidence:** `scratch/test_scratch_mailbox_tor.py` gives `patch: 200 tor`, then `direct connect made: [('connect', 'imap.example.net', 993)]` and `log reason: … (through Tor)`.
- **Fix:** In `update_monitor`, refuse `route` changes for `kind == "mailbox"` with 409 ("a mailbox is read directly; Tor is not offered"). Also make `_log` add the Tor suffix only for kinds that `fetch` actually routes (not `mailbox`). A later option is to route IMAP through the SOCKS proxy.

## 2. Deleting a case leaves its mailbox passwords and kept newsletters on disk (HIGH)

- **Where:** `app/services/lifecycle.py:228-235` stages only `<case>/captures` and `<case>/derived`. It never touches `<case>/following/<monitor>/*.eml` (written by `mailbox._keep`, `mailbox.py:209-224`), and it never calls `mailbox.forget`. That means the `mailboxes.json` entry stays (`mailbox.py:47-79`). Only the per-monitor DELETE route calls `forget`.
- **Scenario:** A case follows a newsletter mailbox (password stored, 2 messages kept and not yet captured). The case is deleted: the API returns 200, `deleted: true`, and the rows are gone. But `mailboxes.json` still holds the mailbox password under the deleted monitor's id, and `<storage>/<case>/following/<monitor>/1.eml` and `3.eml` are still on disk. The case folder itself also survives, because `rmdir` fails on the non-empty `following/` folder. The module docstring promises the password "is removed when the mailbox is no longer followed". Nothing can now remove it, since no row references it.
- **Evidence:** `scratch/test_scratch_mailbox_delete.py` gives `delete status 200 …`, then `password still kept: True` and `eml still on disk: ['3.eml', '1.eml']`.
- **Fix:** Add `"following"` to the staged folders tuple in `delete_investigation`, and count those files in `preview_investigation_deletion`. Before deleting rows, collect the ids of the case's `kind == "mailbox"` monitors. After `db.commit()`, drop those ids from `mailboxes.json`: factor the password half of `mailbox.forget` into `forget_passwords(ids)`.

## 3. Server-wide "Does it work today?" settings can be changed by any case-scoped remote user (MEDIUM)

- **Where:** `app/api/routes_following.py:279-306`. `PATCH /api/platform-checks` and `POST /api/platform-checks/run` have no `require_scope_global_admin`. `PUT /settings/lookups`, `/settings/research` and backups all require it (`routes_preferences.py:178,241`, `routes_backups.py:58`). The router dependency `authorize_request_resource` only checks ids in the path, and these paths have none.
- **Scenario:** A remote shared-bearer user limited to one case (`JW_API_AUTH_INVESTIGATION_IDS=inv-allowed`) sends `PATCH /api/platform-checks {"daily": true, "items": {"youtube": "https://attacker.example.org/x"}}`. The server-wide setting changes, and from then on the workstation's capture browser and yt-dlp visit that address every day. Those visits come from the owner's IP and land in the owner's outbound log. The same user can also start runs on demand.
- **Evidence:** `scratch/test_scratch_platform_admin.py` gives `global lookups PUT: 403`, then `platform-checks PATCH: 200 True ['https://attacker.example.org/x']`.
- **Fix:** Add `request: Request` to both handlers and call `require_scope_global_admin(scope_for_request(request))` first.

## 4. Following: the requests made while finding out what an address is are partly or never logged (MEDIUM, ADR-0015)

- **Where:** `app/services/following.py:481-527` (`discover`, which by its own docstring is "not logged here") and `following.py:546-577` (`follow` logs one line, and only after a monitor row exists).
- **Scenarios:**
  - (a) Following an address that answers 404, 403 or times out raises `FollowRefused` before any monitor exists. The GET went to the site, but no `outbound_requests` row is written.
  - (b) Following a page that names its feed makes two discovery GETs (`/home`, then `/feed.xml` through the recursive `discover`), and only the first is logged. The log row is also written after the requests, which goes against the model's "a row is written before the request goes".
- **Evidence:** `scratch/test_scratch_follow_log.py` gives `refused follow: 422 requests reached site: ['/gone'] log rows: 0`. It also gives `page->feed follow: 200 requests: ['/home', '/feed.xml', '/robots.txt', '/feed.xml']` with only 3 log rows, none of them for the discovery fetch of `/feed.xml`.
- **Fix:** Pass `db` and `investigation_id` into `discover`/`_telegram`, and call `record_outbound(...)` immediately before each `fetch` there (with `mark_outbound_failed` on error). Then drop the after-the-fact `_log` in `follow`.

## 5. A podcast episode whose audio fetch fails stays "capturing" forever and cannot be retried from the queue (MEDIUM)

- **Where:** `app/api/routes_following.py:166-171` marks the item `captured` before the `FOLLOW_AUDIO` job runs. `app/jobs/handlers.py` `follow_audio_job` lets the `FollowRefused` from `fetch_audio` fail the job and never restores the item. `app/services/following.py:903-912` `capture_state` reports `captured` with no capture and no document as `capturing`. `capture_item` refuses anything not `waiting` (409), and `undo` only accepts `skipped`.
- **Scenario:** The episode URL answers 500, or the file is too large or unreachable. The job fails, and Following shows the episode as "capturing" indefinitely. Pressing capture again returns 409, so the episode can never be captured from this screen.
- **Evidence:** `scratch/test_scratch_audio_stuck.py` gives `capture: 200`, then `state after failed fetch: capturing` and `retry capture: 409`.
- **Fix:** In `follow_audio_job`, wrap `fetch_audio`. On failure, run `update(MonitorItem).where(id==…, state=="captured", document_id.is_(None)).values(state="waiting")` (the same conditional revert `_capture` uses), commit, and re-raise. Alternatively, have `capture_state` read the FOLLOW_AUDIO job's status and show `not_saved` with a retry.

## 6. BO-033 grouping makes "no purpose" flags lose their dismissals whenever the payer→payee group changes (MEDIUM)

- **Where:** `app/patterns/detectors/missing_property.py:100-121` now emits one `Measure` per (payer, payee, stated) with every link id in the group. `app/patterns/engine.py:174-176` fingerprints a flag by the sorted list of all its link ids. `engine.py:224-241` creates a new `open` row for an unseen fingerprint, marks the old one `gone`, and carries nothing across (no `status`, `dismissed_reason`, `innocent` notes or `lead_id`).
- **Scenario:** A reporter dismisses "A paid B 3 times … no purpose" with a reason. Then any of these happens:
  - one more purpose-less A→B payment is imported, or a later spreadsheet batch adds one;
  - one of the three gets a purpose;
  - a payment is merged or deduplicated;
  - the first recompute after this PR's VERSION 3→4 bump runs: every existing per-payment BO-033 flag, dismissed or not, is retired and replaced by open grouped flags.

  In each case the dismissed flag goes `gone`, an identical-looking flag comes back `open` with the dismissal and notes lost, and its To-check items are re-raised (`checks.py:153` keys on the flag fingerprint). Before this PR, each payment had a stable fingerprint, so adding a payment never reopened a dismissed one.
- **Evidence:** Code trace of the lines above. `engine.dismiss`/`reopen` are the only places that set the status, and nothing matches a new fingerprint to a gone one.
- **Fix:** Let a detector supply a stable identity for a measure: an optional `key` on `Measure`, here `(source, target, stated)`, used by `_fingerprint` in place of the link ids. Alternatively, when a new flag's indicator and parties equal those of a flag that went gone in the same run, copy `status`, `dismissed_reason`, `innocent` and `lead_id` from it. Add a one-off carry-over for the v3→v4 upgrade: dismiss the group flag when all its links' old per-link flags were dismissed.

## 7. Mailbox: after the server's UIDVALIDITY changes, new messages can be silently dropped (LOW)

- **Where:** `app/services/mailbox.py:174-189` and `209-212`. `_keep` builds its dedupe key from `monitor.last_modified`, which is still the old UIDVALIDITY during the loop (it is only updated after the loop).
- **Scenario:** The server renumbers the mailbox (validity V becomes W). `last` resets to 0 and every message is fetched again, but each one is keyed `uid:V:<n>`. A new message whose new UID equals the UID of a message already queued under V is treated as already seen and skipped, and `last` moves past it, so it is never queued.
- **Fix:** Pass the current `validity` into `_keep` and use it in the key.

## 8. Downloads logged after the fact or not at all (LOW, ADR-0015)

- `app/services/basemap_install.py:186-190`: `newest_build(client)` GETs `https://build-metadata.protomaps.dev/builds.json` before the first `record_platform_request`. That host is never logged; the log names only `build.protomaps.com` and `protomaps.github.io`. This runs automatically at start-up and whenever Places opens without a map.
- `app/services/platform_checks.py:206-215`: the outbound row is written after the visit (`record_platform_request` follows `_ytdlp`/`_page`/`_open`), so a crash or hang mid-visit leaves no row.
- **Fix:** Log before each request, including one row for `build-metadata.protomaps.dev`.

## 9. The IMAP host is not checked against private addresses (LOW)

- **Where:** `app/services/mailbox.py:37,104-105,145-146`. `HOST` only requires `name.tld`. Unlike `following.fetch`, which goes through `check_address` and `_Guard`, the IMAP connection goes to whatever the name resolves to, for example an internal `mail.corp.lan` or a public DNS name pointing at 10.x.
- **Scenario:** A remote case-scoped user can make the workstation open TLS connections to internal hosts and ports (`port` is free) and read the failure wording ("refused the user name or password" or "could not be read: unreachable"). That turns the workstation into a LAN port probe.
- **Fix:** Resolve with `web_capture.resolve_public(host, port)` and connect only to a public address it returns, or refuse the follow.

---

## Checked and found sound

- **Path parameters:** every one in the routes this PR adds or changes (`monitor_id`, `monitor_item_id`, `derived_file_id`, `period_id`, `built_id`, `link_id`, `capture_id`, `document_id`, …) is mapped in `_resource_investigation_id`.
- **Ids taken from the request body:**
  - `sync other_document_id`: `find_sync` checks it is the same case.
  - photo `from_id`: `make_copy` checks the parent belongs to the same document.
  - `compare_redacted copy_id`: checked.
  - supersede `by_evidence_id`: checked to be the same case.
  - built-timeline items: checked against the case's events.
- **Superseded links are left out of support in:** `claim_done`, `claims.claim_review_workspace`, `custody_chain`, the relationships advisory (`loaded.links`), case_home, `patterns/missing.py`, the evidence pack gaps, `documents.py:582`, `authenticity` and `demo_decided`.
- **Owed payments are left out of:** the ledger transactions (and so the money checks and Case home's money traced), the pattern graph links, unlocks, and `data_service`.
- **New tables** all carry an `investigation_id` FK (the deletion walker picks them up), are in `MODEL_BY_TABLE`, `collect_investigation_records` and `RESTORE_ORDER`, and derived files travel in backups with SHA-256 checks.
- **Migrations:** upgrade and downgrade are symmetric, new columns are nullable (or `server_default` for `evidence_packs.pdf`), and alembic has one head (`b2e5c8a1d730`).
- **Following's direct route** uses `check_address` and `_Guard`, so private addresses and DNS rebinding are refused at connect time, with a byte budget and checks on redirects. The audio fetch goes through the guard as well.
