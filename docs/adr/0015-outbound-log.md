# ADR-0015: The outbound log (Safety & data)

**Status:** Accepted (2026-10-23)
**Deciders:** Claude, building the build list's §9 "Safety & data" (mockup KNOWLEDGE_KEEP_2, research Part 3 §7 and §14)

## Context

The mockup promises "what left, word for word" and totals with zeroes ("39 requests left this computer · 0 documents
sent out · 0 AI calls outside"). Research §14 asks for an `outbound_requests` table written by every connector and AI
call, and marks the data-model change for an ADR. The security log records incoming requests only; `connector_runs`
keeps the query of a search but only `entity:<id>` for a lookup, not the words that went.

## Decision

- **Table `outbound_requests`** (migration `a3f7c1d9e642`, `app/models/outbound.py`): case, time, service, kind of value,
  the value sent, the reason, actor (`you` / `automatic`), `leaves_computer`, outcome (`sent` / `failed` / `blocked`),
  documents sent, and a `source` pointer (connector run, AI run, record). Append-only except that `outcome` changes to
  `failed` when the request errors.
- **Written by the code that sends**, before the request goes (`app/services/outbound.py`): the connector search, the
  one-record lookup and the multi-provider lookup, and each AI model call. A connector says what its lookup sends
  (`Connector.enrich_sent`; OpenSanctions sends every property, Aleph and Firecrawl one search line).
- **AI calls** log how much went (records, characters, model), not the text: the full prompt is already on the run's trace.
  A model that runs on this computer is logged with `leaves_computer = false` and never counted in the totals.
- **In backups:** yes, as part of the chain of custody (research proposal); `outbound_requests` is in the export and
  restore order, and goes with the case on deletion like every other case table.
- **Read back by** `GET /api/investigations/{id}/safety-data?period=today|7d|30d|all` (`app/services/safety_data.py`).
  Everything on it comes from rows or files the app keeps: counts from the case, the log, the security log (last
  backup = the newest successful download of this case's export in it; refusals in 24 h), the orphan-file preview.

## Not built, and said so on the screen

- No "Ask first / Automatic" switch per service (research INVENTORY §8, planned): a service shows Off (no key stored) or
  "Only when you press it", because every call today is started by a person.
- Backup size and "checksum checked" are not recorded; a backup's date is the time the export was downloaded.
- Backups are not encrypted (the research's passphrase item, an open question for Ony).
- Calls that were not logged before this change are not in the log.
- Corpus expansion and document sync go to OpenAleph; when it is not on this computer they count in "documents sent out"
  only through `document_corpus_syncs`; they are not rows in the log yet.
