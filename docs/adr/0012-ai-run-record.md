# ADR-0012: The AI run record (ai_run_events)

**Status:** Accepted (2026-10-12)
**Deciders:** Claude, building mockup AI_1 as Ony asked ("continue with the mockups"); the open questions below are Ony's

## Context

Mockup AI_1 "Watch the run" and its trace drawer (research AI §4–5, SUITE §7.2–7.4) show what an AI run did, in
order: where it went in the Authority System Suite, what the app's checks passed or stopped, and each thought from
the question to the answer. Until now a run was one job with two progress messages, and the stored candidate kept only
the prompts and the reply. The research names this an ADR: an append-only events table, its migration and its place
in backups, and a stream.

## Decision

- **Table `ai_run_events`** (migration d3a6b9c2e714): one row per step, written once and never changed. Fields follow
  research SUITE §7.2: `run_id` (the background job the run was queued as), `n` (1, 2, 3… within the run, unique with
  `run_id`), `at`, `kind` (TURN, SETTING, ROUTE, LOAD, CHECK, RULE, FLAG, BLOCK, WRITE), `node` (router, model,
  gate:citation, tas/08, tas/class, cp-01, review…), `system`, `rule` (the suite anchor), `status` (good, partial,
  bad, neutral), `verdict` (the suite's own closed-list word), `text`, `refs` (records), `parent` (the `n` this step
  follows from, so a thought can be traced from input to output), `self_reported`, `detail`.
- **Written by `run_reasoning_module()`** at each step it already has (app/ai/run_events.py): the run starting, the
  settings in force and the echoed changes, the route and the module loaded, the packet, any instruction found inside
  the evidence, the model call's start and end, the shape check, the citation check, one chain per thought of the
  answer, the candidate saved, the run ending (or stopping, with its plain message), and later the reporter's review.
  Your mark on one thought (To check, keep, reject; `POST …/ai-runs/{run_id}/thoughts/{thought_id}/mark`, added 18 Oct) is
  a step too: node `review`, its parent the thought, `detail` {thought, mark, reason}. The latest mark wins; nothing is changed.
- **Status is the app's, never the model's.** It comes from tables in app/ai/run_events.py (claim classes per TAS
  Standard §4; a gap is a finding, not a failure). What the model says is recorded `self_reported` and stays so until
  an app check (the citation check per thought) confirms it, as the suite's FABRICATION_CONTROLS require.
- **Reading it:** `GET /investigations/{id}/ai-runs` lists runs; `GET …/ai-runs/{run_id}/events?after=n` answers at
  once (the screen polls this every second through the generated client, which carries the login token);
  `GET …/events/stream` sends Server-Sent Events with FastAPI's own StreamingResponse (no new package), resuming after
  `Last-Event-ID`.
- **Backups:** the run record travels with the case (exports.py RESTORE_ORDER); deleting a case deletes it.

Steps the suite defines but the app does not perform (LAS, QAS and DAS routing, boundary crossings, Module 10's final
audit, checkpoint records, the judgement ledger) are not invented: the screen draws them dimmed as "not in the app yet".

## Open questions for Ony

- The name: the suite calls its ledger "Paper Trail", which the app already uses for the sources panel. The screen says
  "Run record".
- Draw the suite's whole pipeline even though only TAS runs inside the app (the screen does, dimmed), or only what runs?
