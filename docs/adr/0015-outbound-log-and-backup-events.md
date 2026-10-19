# ADR-0015: The outbound log and the backup record (outbound_requests, backup_events)

**Status:** Accepted (2026-10-19)
**Deciders:** Claude, building mockup KEEP-safety-and-data as Ony asked ("continue with what is currently planned and mocked"); the open questions below are Ony's

## Context

The Safety & data screen (research §7, §14; mockup `KEEP-safety-and-data.png`) answers "is my case safe on this
computer, is it backed up, and what has left it?". Two of its facts are stored nowhere today:

- **What left this computer.** Each outside lookup keeps a `connector_runs` row, but its `query` is only
  `entity:<id>` for an enrichment (not the words sent), and it records no actor or reason. AI calls leave traces in
  the run record and the candidate, but no one place lists what went to a model. The research names an
  `outbound_requests` table and an ADR (research §14).
- **When the case was last backed up.** A backup is built and sent to the browser; nothing is kept server-side. The only
  trace is a line in the security audit file, which retention prunes and which has no size or checksum.

## Decision

- **Table `outbound_requests`** (migration f1a9c3d7e582): one row per request that carried case data to an outside
  service, written once, never changed. Fields: `investigation_id`, `at`, `service` (opensanctions, aleph, firecrawl, ai),
  `destination` (the address, or "<provider> <model>"), `local` (the destination is this computer), `value_sent` (the
  exact search words, or the entity's details, as the connector sends them), `value_kind`, `reason` (lookup, enrich,
  matched all services, AI run), `actor`, `status` (sent, failed, not_sent), `error`, `run_id`, `detail`.
- **Written at the three connector call sites** (`services/connectors.py` `run_connector` and `enrich_entity`,
  `services/entities.py` `run_multi_enrichment`) through one function, `log_connector_send`, and at the model call in
  `run_reasoning_module` (`ai/reasoning.py`, and again for a chart-check retry). Each connector describes its own request
  (`Connector.request_preview`), so the log is the value that goes on the wire: OpenSanctions matching logs the schema and
  every property, the text connectors log the words they build from the entity.
- **Status.** `sent` and `failed` both count as left (a failed call may still have reached the service). `not_sent`
  (no key set, or nothing to ask) never left and is not counted.
- **Local is kept, not counted.** A request to a model or service on this computer is logged with `local` true so the
  log is complete and the CSV shows it, but the screen's log and totals show only what left.
- **An AI call's value is the question and a count of what went with it** (records, characters). The exact text, the
  retrieval packet included, is already kept with the run (`ai_analysis_candidates.trace.user_prompt`); copying a packet
  of many pages into every log row would multiply the case's content, so the row points to it (`detail.exact_text`,
  `run_id`).
- **Logging never breaks a lookup.** A failure to write the log row is itself logged and swallowed: the request has
  gone, and losing its answer would be worse.
- **Backups.** `outbound_requests` is part of the case (`exports.py` `MODEL_BY_TABLE`, `RESTORE_ORDER`): it travels in
  a backup, is restored with the case and is deleted with it (the delete walks foreign keys). Proposal in the research:
  yes, it is part of the chain of custody.
- **Table `backup_events`** (same migration): when a backup file was made from the case, its size, SHA-256, whether it
  held documents, record and document counts, `encrypted` (always false today). Written by the export route after the
  file is built. It is **not** part of a backup (`non_portable` in the seam test): a restored case has made no backups.
  It records that the server built a file, not that the person saved it: the server cannot know.
- **Endpoints** (all under `/investigations/{id}`, so ownership is checked): `GET …/safety-and-data?period=` (one reply
  that assembles the screen: totals, the six stores, the services and their modes, the four cards), `GET …/outbound-log`
  (newest first, by service and period; outside only unless `include_local`), `GET …/outbound-log.csv` (every row, local
  ones marked; a cell that would run as a spreadsheet formula is prefixed with an apostrophe).
- **What the screen does not claim.** Traffic to OpenAleph, the watchlist check and the corpus push are not logged
  (their calls are made in several places: `openaleph_http.py`, `CorpusGateway`, the `openaleph-client`). The reply says
  so (`not_counted`) and marks a remote OpenAleph `counted: false` instead of showing a zero. A service's mode is what
  the app really does: a lookup runs only when the reporter starts it (`on_click`); the Off / Ask first / Automatic switch
  of research §7 does not exist yet and is not drawn as if it did.

## Not decided here

- Encrypted backups (a separate ADR; `cryptography` is not in `requirements.txt` and the standard library cannot write
  an encrypted zip). The screen says "Not encrypted" because it is true.
- Your safety (research §13) and plain-language security events (§15): not built; they need Ony's levels and wording.

## Open questions for Ony

1. **The log in backups.** It travels with the case (above). Keep it, or leave the log out of a backup?
2. **AI calls: the question or the whole text.** The log keeps the question and the counts; the full packet stays in the
   run record. Is "word for word" satisfied by pointing to the run, or must the log hold the full text?
3. **OpenAleph traffic.** Which of its calls should be logged first (the watchlist check after each read, the corpus push,
   document uploads), and should a remote OpenAleph count the way an outside lookup does?
4. **The default for outside lookups** (research §7: Off / Ask first / Automatic, with the exact value shown and
   shortenable before it goes). Today every lookup is a click. The handoff notes say the default is Ony's decision.
5. **Backup recorded when the file is built.** Is that the moment that should read "last backup"?
