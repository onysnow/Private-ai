# How Ony wants the work done

These come from `CLAUDE.md` plus what he has said in conversation. They all still apply.

## Working with Ony
- **Commands for him to run:** always one line. Start with the command that changes to the folder, and join the
  rest with `&&`. He uses Windows Command Prompt, where `;` does not separate commands. His repo is at
  `C:\Users\Wigi\Documents\Private-ai`.
  Example: `cd /d C:\Users\Wigi\Documents\Private-ai && git push origin timeline-wip-cloud:timeline-wip`
- **Mockups first.** He approves a mockup before the app changes. When he gives feedback, discuss the change
  with him, and edit only after he agrees.
- **Execute instructions** rather than acknowledging them. Make no unrequested recommendations, and never re-raise
  something he has ruled out.
- **No assumptions.** Say what was checked and what wasn't.
- **Lead with the answer.** Don't announce your own honesty, rate your own point, announce a shortcut you
  declined, or perform contrition.
- **UI:** innovative, using the fact that it is digital, not a copy of other tools.
- **Approval mode is auto.** Proceed without stopping on routine steps.
- **Don't create new problems while fixing things.** Run the tests a change touches, and the guard tests:
  - `backend/tests/test_ai_candidate_lifecycle_seams.py`, which checks backup covers every table;
  - `backend/tests/test_models_split.py`, which checks model and table counts;
  - `backend/tests/test_api_contract.py`, which needs an id seeded for every new path parameter.
- **"Exactly like the mockup"** (Ony, 17 Oct). Triple-check the design, not just the data, and check that
  everything works. Compare screenshots side by side with the picture, in the mockup's theme. Seed the mockup's
  own data when the demo data can't show a state.

## Authority System Suite (beta)
`backend/app/ai/authority_suite` is vendored and in beta. When a problem's cause is inside the suite (its rules,
prompts, systems or outputs), **tell Ony what it is and where**, and don't work around it in the app.

## Effects
He asked for the whole OnySnow Studios effect system to be imported (done), not only the rain and glass. Later he
will build a separate component library and port from that instead.

## Commits and PRs
- End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: <the session URL of the conversation doing the work>
  ```
  (Use the trailer lines the new session's own system instructions give.)
- Put no model identifiers in commits or PRs, and no real people's names in fixtures or test data.
- Push to `claude/hopeful-cannon-aiz8iv`. PR #58 already exists; don't open another.
- Ony merges into `timeline-wip` himself.

## Status grammar (used everywhere)
- shown: solid
- not yet shown: dashed
- disputed: red, with a double edge
- worked out by the app: dotted or hatched, marked ƒ
- AI: plum (`--ai-mark`)

Every status has a shape and a word, never colour alone.
