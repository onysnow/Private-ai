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

The screen reads the run record by polling every second (`GET …/ai-runs/{run_id}/events?after=0`); the SSE route exists
but the screen does not use it yet. The Watch step has no title or stepper of its own: its one-line header is the mockup's.
Not drawn, because the run record does not hold it: packet tile titles and pages (the record has ids only), a confidence
cap (no step records one, so the drawer shows it only when `detail.capped_to` exists), "INTEROP", the other TAS modules
(shown as "+ 9 modules · not run here"), RAS/QAS/LAS/DAS contents. "To check" is a disabled button: review applies to the
whole answer. Streams (more than 12 claims on one wire) are built and unit-tested but the demo data has at most 7.
Wheel zoom on the map, per-wire hover counts and the first-use notes are not built.
`tools/seed_run.py` now ends the run as stopped (the deliberate out-of-packet citation), with the job marked failed.

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
