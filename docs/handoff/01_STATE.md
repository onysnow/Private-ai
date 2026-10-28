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
  - "To check" marks one thought (pressed again, takes it off). The mark is a step by you in the run record
    (`POST …/thoughts/{thought_id}/mark`, ADR-0012) and shows in the ledger as "CLM-n to check · you".
  - Confidence shows a cap recorded on any step about the thought; "Removed" finds a BLOCK tied to the thought.
- **States:**
  - A failed run says "Stopped" with its message.
  - A run without steps says it was made before steps were recorded.
  - "Play a sample run" (`features/ai/run-sample.ts`, labelled "sample — not a real run"): the Ask step offers "Watch a
    sample run" when the case has no runs.
- **Compare:** "Compare…" in the header lists finished runs of the same question. Parts whose verdict changed glow,
  the rest dim, and the caption lists each change as "before → after". Steps you add later (review, marks) stay at the
  right edge of the time axis.

- **Run again from this step…:** goes back to the plan with the question and the same packet. The request carries
  `packet_from {run_id, step}`; the server reads the earlier run's packet back from its candidate's prompt
  (`packet_of_run` in `app/ai/reasoning.py`) and records "Packet taken again from run … (step n)". The new run is a new
  record. A run that kept no candidate cannot be run again this way (400).
- **B4 and B6:** the map draws the B4 crosswalk (a PARTIALLY VERIFIED claim splits into a verified and an unverified
  light, INTEROP §3) and the B6 precedence membrane (lit red for the rest of the run when it stops a step) from events
  at `boundary:tas→las` and `boundary:las→das` (`detail.split` for B4). Modules of RAS, QAS, LAS or DAS (`las/03`…)
  become chips in their column, at most five, then "+ n modules". The app runs no LAS or DAS, so no recorded run has
  these today; the sample run shows them.
- **The case home's AI strip** (`features/ai/ai-strip.tsx`, under Switch case): "AI: n drafts waiting for review · last
  run hh:mm" with the last run's four tallies, "AI off" when AI is off, and while a run is live the miniature (five
  column dots, the model ring, the problem count). Clicking opens the run in Act › AI runs.
- **Rain Noir bloom** on the lights: `features/effects/run-bloom.tsx`, ADR-0013, a named effect in Appearance.

Not built:
- packet tile titles and pages, "INTEROP" on the umbrella band (the run record holds ids only);
- the B4/B6 events themselves in a real run: they need the app to run LAS and DAS.

`tools/seed_run.py` ends as a stopped run (the deliberate out-of-packet citation), with the job marked failed.

## Not started

- **SEE_1 / The Wire:** the prototype artifact is the approved design (Ony, 28 Oct); SEE_1's link panel and arrangement switch, and the prototype's touch and phone layout, built 28 Oct.
- **§9 Knowledge catalogue** (KNOWLEDGE-catalogue.png).
- **§9 KEEP Safety & data** (KEEP-safety-and-data.png): first slice built 19 Oct (see `MOCKUP_BUILD_LIST.md` §9 and ADR-0015). Still to do there: Your safety panel, plain-language security events, delete or keep stray files, the Off / Ask first / Automatic switch, OpenAleph traffic in the log, encrypted backups.
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
