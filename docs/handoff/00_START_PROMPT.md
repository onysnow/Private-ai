# Paste this into the new conversation

---

You are continuing the redesign of the Journalism Workbench (repo `onysnow/Private-ai`). Work on branch
`claude/hopeful-cannon-aiz8iv`. PR https://github.com/onysnow/Private-ai/pull/58 is already open into `timeline-wip`.
Push to that branch, and do not open a new PR.

Before doing anything, read these in order:
1. `CLAUDE.md`
2. `docs/handoff/` (all of it, starting with `README.md`)
3. `docs/project-notes/START_HERE.md` and `docs/project-notes/MOCKUP_BUILD_LIST.md`

The goal: make every screen look and work **exactly** like its approved mockup in `docs/design/mockups/`.
- Compare the design side by side with the picture. The data does not have to match, but the layout, type,
  chips, lines, labels and states do.
- Check that every control works by clicking through it in a real browser, not only in unit tests.
- Read the screen's chapter in `docs/design/REDESIGN_RESEARCH.md` before building it.

Next up, in order:
1. **AI_1 "Watch the run"** (`frontend/features/ai/watch-the-run.tsx`). A first pass is committed, but it has not
   been matched to `docs/design/mockups/AI_1-watch-the-run.png`; its legend and band layout are visibly off. The
   backend run record (ADR-0012) is done and tested.
2. The rest of MOCKUP_BUILD_LIST §8, then §9 (Knowledge catalogue; KEEP Safety & data).
3. The open [ ] items under the screens already built.

Rules that bite:
- **Mockups first.** Ony approves a mockup before the app changes. The Wire (SEE_1) still needs a new mockup.
- **Commands for Ony:** one line, starting with `cd /d C:\Users\Wigi\Documents\Private-ai &&`.
- **The Authority System Suite is beta.** If a problem's cause is inside the suite (bundled in the `authority-suite-sdk` package), report it
  to Ony; do not work around it.
- **Writing:** lead with the answer. Say what was checked and what wasn't. Make no unrequested recommendations.

---
