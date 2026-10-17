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

## Half-built

- **AI_1 "Watch the run"** (Act › AI runs › step 3). The backend is complete:
  - the run record table `ai_run_events` (ADR-0012), written at every step of `run_reasoning_module`;
  - `GET /investigations/{id}/ai-runs`;
  - `…/ai-runs/{run_id}/events?after=n`;
  - `…/events/stream` (Server-Sent Events).

  The screen is a first pass: an SVG map with lights, lanes, a log view (L), a trace drawer, and Accept / Reject /
  Copy cite. **It has not been matched to `AI_1-watch-the-run.png`.** The legend row and the system columns'
  "why" text overlap, the transport strip sits below the fold, and the map's proportions differ from the mockup.

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
