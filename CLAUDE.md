# Working on the Journalism Workbench (Private-ai)

Read docs/project-notes/START_HERE.md first: it says where the work stands. The mockup pictures are in docs/design/mockups/: compare every screen against its picture, side by side, before calling it done. docs/design/REDESIGN_RESEARCH.md is Ony's research behind the mockups: read the chapter for a screen before building it. Rain Noir's effects come from onysnow/onysnow-studios (ADR-0009). docs/project-notes/MOCKUP_BUILD_LIST.md is the work plan: every mockup, what the app has, and what is left to make it look and work like the mockup. docs/project-notes/BACKLOG.md lists everything else Ony has asked for.

## How Ony wants to work
- **Commands for him to run:** always one single line, starting with the command that goes to the
  folder, joined with `&&`. He uses Windows Command Prompt, where `;` does not separate commands.
  His repo is `C:\Users\Wigi\Documents\Private-ai`.
  Example: `cd /d C:\Users\Wigi\Documents\Private-ai && git push origin timeline-wip-cloud:timeline-wip`
- **Mockups first:** he approves before the app changes. When he gives feedback, discuss the change
  with him and edit only after he agrees.
- **Execute instructions** rather than acknowledging them. No unrequested recommendations. Never
  re-raise something he ruled out.
- **No assumptions:** say what was checked and what wasn't.
- **Lead with the answer.** Don't announce your own honesty, rate your own point, announce a
  shortcut you declined, or perform contrition.
- **UI:** innovative, using the fact it's digital, not copies of other tools.
- **Show only what matters; the rest on hover or click (29 Oct).** By default a screen shows titles, important data,
  alerts, numbers and icons. Sub-text (how many times something was read, timings in ms, explanations, secondary
  details) is revealed on hover or click, unless the context gives a reason to show it. Categorical facts (what type
  of thing something is) are inferred through the UI (a mark, shape, colour or position) and named on hover or
  click. Applies to the whole app; build every new screen this way.
- **Approval mode is auto:** proceed without stopping on routine steps.
- **Don't create new problems while fixing things.**
- **The Authority System Suite is in beta** (bundled in `authority-suite-sdk`, which `backend/app/ai/authority_sdk.py` imports; this repo keeps no copy). When a problem's cause is in the suite
  itself (its rules, prompts, systems or outputs) rather than in this app, don't work around it in the app: tell Ony
  what it is and where, so he can fix it in the suite.

## Running and testing
- **Backend:** needs `TZ=UTC`. Tests:
  `cd backend && TZ=UTC python -m pytest -p no:cacheprovider tests/<file> --no-cov -W ignore -q`.
  The full suite takes about two hours; run the files a change touches.
- **Frontend:** `cd frontend && npx vitest run`, `npx tsc --noEmit -p .`
- **Ports:** CORS allows only 3000 (web) and 8000 (API).
