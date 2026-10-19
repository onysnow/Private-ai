# ADR-0014: The Drop's per-file event stream

**Status:** Accepted (2026-10-19)
**Deciders:** Claude, building the build list's §4 item "per-file event stream (SSE) instead of three pollers" (INTAKE_1, research §3 Needs)

## Context

The Drop (mockup INTAKE_1) asked the server for the whole drop every 2 s while any file was being read. Research §3
asks for one stream that follows each file, with polling kept as the fallback. ADR-0012 already chose Server-Sent
Events with FastAPI's own StreamingResponse for the AI run record, kept out of the OpenAPI schema.

## Decision

- **Route:** `GET /api/investigations/{investigation_id}/drop/stream` (app/api/routes_case_home.py), under the same
  router authorization as `GET …/drop`, 404 when the case does not exist, `include_in_schema=False` like the run
  record's stream (the generated client has no shape for an event stream). No new table and no new package.
- **What it sends:** the server looks at the drop once a second (the same `drop()` the screen reads, validated
  through `DropOut`) and sends only what changed since the last look (`drop.changes`):
  - `lane`: one file whose lane changed, with the files inside it (the first look on a connection sends every file);
  - `gone`: a file no longer in the case;
  - `summary`: everything else (totals, Ready for you, watchlist) and the order of the files, after any change.
  - `end`: once no file is waiting or being read. A connection also closes after 10 minutes; the screen reconnects.
- **The screen** (features/the-drop/drop-stream.ts) merges each message into the same TanStack Query entry the
  page reads, so nothing else on the page changes. While the stream is connected the page does not poll. On a
  dropped connection it reconnects with a back-off; after three failures in a row it polls every 2 s as before,
  and the "Reading" chip says so ("checking every 2 s").
- **Reconnecting** needs no event ids: the first look on a new connection sends every file again.

## Not changed

The old Library panel (features/documents/documents-panel.tsx) still follows a single upload's job and the
OpenAleph corpus with its own polls, and /review/batch still refreshes every 3 s. They are not part of The Drop's
screen; folding them in is left for when the Library tab and the batch page are redesigned.
