# Working on the Journalism Workbench (Private-ai)

Read docs/project-notes/START_HERE.md first: it says where the work stands and what is next.

## How Ony wants to work
- **Commands for him to run:** always one single line, starting with the command that goes to the
  folder, joined with `;` so it pastes into PowerShell. His repo is `C:\Users\Wigi\Documents\Private-ai`.
  Example: `cd C:\Users\Wigi\Documents\Private-ai; git push origin timeline-wip-cloud:timeline-wip`
- **Mockups first:** he approves before the app changes. When he gives feedback, discuss the change
  with him and edit only after he agrees.
- **Execute instructions** rather than acknowledging them. No unrequested recommendations. Never
  re-raise something he ruled out.
- **No assumptions:** say what was checked and what wasn't.
- **Lead with the answer.** Don't announce your own honesty, rate your own point, announce a
  shortcut you declined, or perform contrition.
- **UI:** innovative, using the fact it's digital, not copies of other tools.
- **Approval mode is auto:** proceed without stopping on routine steps.
- **Don't create new problems while fixing things.**

## Running and testing
- **Backend:** needs `TZ=UTC`. Tests:
  `cd backend && TZ=UTC python -m pytest -p no:cacheprovider tests/<file> --no-cov -W ignore -q`.
  The full suite takes about two hours; run the files a change touches.
- **Frontend:** `cd frontend && npx vitest run`, `npx tsc --noEmit -p .`
- **Ports:** CORS allows only 3000 (web) and 8000 (API).
