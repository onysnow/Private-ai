# Platform needs: plan (19 Oct 2026)

What the Settings panes work left out because the app could not do it yet, and how each is added. Ony asked
for the plan and then the build (19 Oct). Each part says what already exists, what is added, and with what.
Settled rules this follows: notifications are in-app by default, "no email or phone unless the reporter turns
it on" (docs/discovery/indicators.md, 9 Oct); nothing leaves the computer without the reporter choosing it, and
what does leave says as little as possible; OpenAleph's own alerts are not used (ADR-0006: once a day, one user,
every collection).

Build order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Parts 1 and 2 are foundations the others use.

**Status (19 Oct):** parts 1–7 built (branch `claude/notifications-delivery`); part 8 waits on the SA levels.

## 1. A log of everything that leaves the computer

**Today.** `connector_runs` records lookups (search words, or "entity:<id>" for a party, not the full payload
sent to /match). Remote AI calls, OpenAleph pushes and the demo download are not recorded anywhere; the security
log records incoming requests only. REDESIGN_RESEARCH §14 already asks for an `outbound_requests` table.

**Add.** Table `outbound_requests`: when, case (if any), kind (`lookup`, `ai`, `mail`, `push`, `key_check`,
`source_check`, `download`), destination host, what was sent in words (a party's name; "kind of alert only"; the
search words), outcome (sent / refused / failed / no answer) and size. One helper, `record_outbound()`, called by
every place that sends: connectors (search, enrich, multi-enrich, automatic), the LLM client when the model is
not on this computer, mail, push, key checks, source checks, the 1MDB demo fetch. Settings › Outside lookups'
"Sent this week" and Connector keys' "Last used" read it. Kept 90 days, like the security log.

## 2. A scheduler that works in both modes

**Today.** No periodic work at all. Procrastinate 3.10 (already a dependency) has `periodic` cron tasks, but the
SQLite developer mode has no worker; the only loop is the stalled-job watchdog in `JobRunner`.

**Add.** One ticker started by `JobRunner.start()` in both modes: every 60 s it runs the registered tick tasks in
a thread, each with its own interval and a "last ran" row (`app_preferences`, scope `server`) so a restart does not
re-run them early. On PostgreSQL each tick takes a transaction advisory lock, so two API processes never run it
twice. This is the same shape as the existing watchdog, needs no new package, and behaves the same on SQLite.
This is Procrastinate's own "dynamic scheduling" pattern: the schedule and each task's last run live in the app's
database, and only the heartbeat differs by mode. On PostgreSQL the heartbeat is a Procrastinate periodic task
(`@periodic(cron="* * * * *")`), which the queue deduplicates across workers by its `procrastinate_periodic_defers`
unique key; on SQLite it is an asyncio loop started in the FastAPI lifespan. No APScheduler (3.x would need its own
locking across processes; 4.x is still alpha).

Tick tasks: deliver notifications outside the app (part 5), backup reminders (part 3), source freshness (part 7).

## 3. Records the inbox can read: imports finished, backups made

**Today.** An import batch has no end; each file's read has `finished_at` on its job. A backup download writes
no row (only the security log line); only console backups are listed with a time.

**Add.**
- `ingestion_batches.finished_at`, set when the last file of the batch finishes reading (checked at the end of
  every read job). Inbox kind `import`: "23 files read · 1 needs you", Needs you by default when something
  failed, Everything else otherwise.
- The last full backup is read from `investigations.last_backup` (kept by the stored-provenance work): set when a backup is downloaded (`GET …/export`) or made in the console.
  Inbox kind `backup`: "No backup of this case for 14 days, and 31 records changed since", Everything else by
  default; the days are a setting (7 / 14 / 30 / never).

## 4. Saved questions, and research without approval

**Today.** A run's question lives only in its job payload; "Run again" and "Run again from this step" exist;
Ask first adds a Needs-you row when documents arrive after a case's last run. "Without approval" was not offered.

**Add.**
- Table `saved_questions`: case, module, question, theory, created by, created when, last run. "Save this
  question" on Watch the run and in Before you run's earlier runs; listed in Before you run with Run now / Stop.
- Research mode gets a third value, **Without approval**, and becomes per case like Outside lookups (server
  default plus a case's own, with a reason).
- When an import batch finishes (part 3) in a case set to Without approval, each saved question of the case is
  queued as an AI run under the case's run profile, at most once per batch; the results land in Decide like any
  run, and the inbox says "AI draft ready". Ask first keeps today's row, now naming the saved questions.

## 5. Notifications outside the app: email and phone

**Today.** In-app only; a desktop notification (the browser's own, kind only) when the tab is in the background.

**Add.**
- A delivery ledger `notification_deliveries` (person, row key, channel, sent at) so nothing is sent twice.
- Per person in Settings › Notifications, "Outside the app": Email (address, off / interrupts only / a daily
  summary of Needs you) and Phone (off / interrupts only). Each says, before it is turned on, exactly what would
  be sent and through whom.
- What is sent: the kind and how many, never names or text ("A Textbook Red Flag in one of your cases. Open the
  Workbench to see it."). A daily summary lists counts per kind.
- The server's mail and push settings live in the environment file, like the AI model; Settings shows whether
  they are set.
- **Apprise** (caronc/apprise 2.x, BSD-2-Clause, very active) sends both: one URL per channel.
  - Email: the server's mail account is an Apprise `mailtos://` URL in the environment file (`NOTIFY_MAIL_URL`);
    each reporter adds only their own address. Only `mailtos://` is accepted (TLS; Apprise checks certificates by
    default), and the `X-Application` header is set to the app's own name. The standard library's smtplib was
    rejected: without an explicit context it does not check certificates. fastapi-mail pulls in a template engine
    and more for one fixed line.
  - Phone: **ntfy** through the reporter's own Apprise `ntfys://` URL: a self-hosted ntfy server, or ntfy.sh with a
    long random topic. It works when the app runs only on a laptop. Settings says plainly that ntfy.sh can read
    the one line it carries (ntfy has no end-to-end encryption).
  - Phone, on a newsroom server reached over HTTPS: **Web Push with VAPID** (pywebpush 2.x, MPL-2.0), no account,
    payload encrypted end to end; the service worker shows fixed text and the push carries nothing else. iPhone
    needs the app added to the Home Screen (iOS 16.4+). Built after ntfy, as part 5b.

## 6. Checking a key without sending a search

**Today.** Each connector only searches; a key's state is read from its last lookup.

**Add.** `Connector.check_key()` calling an endpoint that needs the key but sends no query; "Check the key" on each
Connector keys card, recorded in the outbound log as `key_check`. Endpoints, read in each project's source:
- OpenSanctions: `GET /catalog` (needs the key, not metered; only /match and /search use credits).
- OpenAleph: `GET /api/2/notifications?limit=0` (403 without a valid key; /metadata answers 200 to any key).
- Firecrawl: `GET /v2/team/credit-usage` (401 for a bad key, costs no credits; also says the credits left).

## 7. Knowing when an outside source has new data

**Today.** Nothing tracks a source's data version; `connector_findings.raw` keeps per-entity dates unread.

**Add.** A tick (part 2, every 6 hours) asks OpenSanctions for `GET /catalog` with `If-None-Match` (a 304 when
nothing changed) and keeps each dataset's `version`; when the configured dataset's version changes it raises
inbox kind `source` ("OpenSanctions updated its lists") and, in cases whose OpenSanctions mode is Automatic,
re-checks the parties already looked up there, once. No names are sent to learn this. Later: OpenSanctions'
delta files would say exactly which matched entities changed; OpenAleph collections carry `data_updated_at`.

## 8. Safety indicators

**Today.** 42 SA indicators in the catalogue, none can fire: every Strong level reads "To be set by Ony" and no
detection spec exists for SA. Settings › Your safety is Hide screen only.

**Not built now.** It needs Ony to set the SA levels, and check specs written for the 14 SA indicators the
records can check. When those exist, the inbox gains kind `safety` (may interrupt), as indicators.md decides.

## What Ony decides

- Email and phone stay off until each reporter turns them on (already decided, 9 Oct); the wording of what an
  email may say is drafted here as "kind and count only".
- The backup reminder's default (14 days).
- The SA levels (part 8).
