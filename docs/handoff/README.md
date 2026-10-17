# Handoff: continuing the Journalism Workbench redesign

This folder holds what a new conversation needs to carry on the work. It sits in the repo, so a session that
clones the branch has all of it.

- **Repo:** `onysnow/Private-ai`
- **Branch:** `claude/hopeful-cannon-aiz8iv`
- **Pull request:** https://github.com/onysnow/Private-ai/pull/58 (into `timeline-wip`)
- **State as of:** 17 Oct 2026, last commit `3fa222c`

## Read in this order

1. `00_START_PROMPT.md`: the message to paste into the new conversation.
2. `01_STATE.md`: what is built, what is half-built, and what comes next.
3. `02_RULES.md`: how Ony wants the work done. This is non-negotiable.
4. `03_RUN_AND_TEST.md`: how to run the app, take screenshots and run the tests, plus the traps.
5. `04_OPEN_ITEMS.md`: questions waiting on Ony, known gaps, and the CI situation.
6. `05_CODE_MAP.md`: where each screen's code, API and tests live.
7. `tools/`: the scripts used to seed mockup data, take screenshots and click through screens (see `tools/README.md`).

## Documents already in the repo (not copied here)

- `CLAUDE.md`: the project rules. The harness loads it automatically.
- `docs/project-notes/START_HERE.md`: where the work stands, in short.
- `docs/project-notes/MOCKUP_BUILD_LIST.md`: **the work plan**. Every mockup, what is done ([x]) and what is left ([ ]).
- `docs/project-notes/BACKLOG.md`: everything else Ony has asked for.
- `docs/design/mockups/*.png`: the approved mockup pictures. Every screen is compared against these.
- `docs/design/REDESIGN_RESEARCH.md`: Ony's research behind the mockups. Read the chapter for a screen before building it.
- `docs/adr/`: the decision records. ADR-0009 to ADR-0012 come from this stretch of work.
- `docs/authority-suite/SUITE_GAPS.md`: the Authority System Suite requirements and where the app meets them.
