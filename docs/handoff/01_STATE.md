# Where the work stands (17 Oct 2026)

The full checklist lives in `docs/project-notes/MOCKUP_BUILD_LIST.md`. This page is the short version.

## Built and checked against the mockup

| Mockup | Screen in the app | Notes |
|---|---|---|
| HOME_1 | Case home | |
| HOME_2 | Settings › Appearance and the frame | |
| INTAKE_1 | The Drop | |
| INTAKE_2 | Reading room | |
| SEE_2 | See › Money | 17 Oct: checked side by side using the mockup's own payments, and every control clicked |
| CHECK_2 | Check › Chain of Custody | 17 Oct: checked side by side using the mockup's three evidence rows plus an AI draft, and every control clicked |
| ACT_1 | Act › Red Flags | |
| ACT_2 | Act › Story | |
| AI_2 | Act › AI runs (Ask, then Instructions & plan) | |
| AI_1 | Act › AI runs › Watch (step 3) | Matched to the mockup in Rain Noir, 1440×900, 18 Oct. See "AI_1 notes" below |

## Half-built

## AI_1 notes

Built from research AI §4–5 (the PDF and `docs/design/REDESIGN_RESEARCH.md` are the same text):
- **Live:** the screen reads `…/events/stream` (`features/ai/run-stream.ts`), merging each step into the same query.
  - A dropped connection says "reconnecting · catching up from event n" and resumes with `?after=n`. It can't send a
    `Last-Event-ID` header, because CORS allows only Authorization and Content-Type.
  - After three failures it polls every second; while streaming, a 5-second poll keeps the run's status.
  - When more than 40 steps wait, the clock runs 1.6× and the pill says so.
- **Map:**
  - Hovering a node shows its tally in words; hovering a wire shows its count and kinds.
  - Arrow keys move along the pipeline; Ctrl+wheel zooms the map, with Fit to reset.
  - A stopped step leaves a ⊘ that stays, plus four sparks once (none under Calm).
  - Lights have a glow and a short tail; good steps are dimmer, problems at full brightness.
  - Lights in flight are only those still moving.
  - Two first-use notes stay until "Got it".
  - CP-02 and CP-03 sit in the input column, dimmed unless the record has them.
  - Over the strip, the wheel zooms the lanes in time, with "whole run" to reset.
- **Drawer:**
  - Steps as a tree or on a time axis, searchable by kind, #n or rule.
  - ↑/↓ move through steps, Enter lights one on the map, Tab stays inside, Esc closes and focus returns.
  - A skeleton while the answer loads.
  - The weakest-link chain; the cap shows only when a step records `detail.capped_to`.
  - "Copy cite" carries the passage, the record ids and a link `/act?inv=…&run=…&step=n#ai-runs`, which reopens the
    trace.
- **States:**
  - A failed run says "Stopped" with its message.
  - A run without steps says it was made before steps were recorded.
  - "Play a sample run" (`features/ai/run-sample.ts`, labelled "sample — not a real run") is in Watch's empty state.
    Watch only opens with a run, so the button is reachable only once Ask has an entry for it (not added: it changes
    AI_2).

Not built, because the run record does not hold it:
- packet tile titles and pages;
- "INTEROP";
- the other TAS modules;
- RAS/QAS/LAS/DAS contents;
- B4 split lights;
- the B6 membrane.

Not built, needing a decision or an ADR:
- per-claim "To check" (a disabled button for now);
- comparing two runs;
- the dashboard mini strip (another screen);
- the WebGL bloom in Rain Noir;
- "Run again from this step".

`tools/seed_run.py` ends as a stopped run (the deliberate out-of-packet citation), with the job marked failed.

## Not started

- **SEE_1 / The Wire redesign:** needs a new mockup for Ony to approve first.
- **§9 Knowledge catalogue** (KNOWLEDGE-catalogue.png).
- **§9 KEEP Safety & data** (KEEP-safety-and-data.png):
  - planned approach: a data map built from ConnectorRun (outbound lookups, word for word), counts and sizes,
    backups, keys and the security log;
  - lookups mode is hard-coded to "ask";
  - the last backup time is not recorded anywhere (it needs a backup event).
- **§10 Website (SITE_1/2):** waits on Ony's name, licence and photos.
- **Timeline and Places:** there is no mockup yet.

## Rain Noir effects

The whole OnySnow Studios effect system is vendored at `frontend/vendor/onysnow-effects` (alias `@fx/*`, ADR-0009).
- The rain pane on the case title band is done.
- Glass panels and the calm "after the rain" still are not done.
- Ony plans to build a separate component library later and port from that.

## Bugs fixed on 17 Oct (good to know)

- Stories were missing from the case backup (export). They now travel with it, with a test.
- Money's round-trip path started at a random party; it now starts at the party the money returns to.
- Chain of Custody counted AI drafts that merely had the claim among their inputs; it now counts only drafts that cite it.

## Local demo data (cloud container only; not in git)

The demo database is `/tmp/claude-0/run/app.db`. It is lost when the container goes, and a new session must rebuild
it (see `03_RUN_AND_TEST.md` and `tools/README.md`). It held:
- the "Demo Investigation" with the file-backed claim "Harbour Nominees Ltd held 40% of Fernhill Ltd from March
  2018", plus the mockup's other two evidence rows and an AI draft;
- a "Kestrel harbour (mockup data)" case carrying SEE_2's own payments.
