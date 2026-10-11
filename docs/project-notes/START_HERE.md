# Start here (11 Oct 2026)

This is where the Workbench redesign stands, for a new session picking it up. The branch is
`timeline-wip`.

## How Ony wants to work
- Commands for him to run: always one single line starting with the `cd` to the folder, joined
  with `;` for PowerShell, e.g. `cd C:\Users\Wigi\Documents\Private-ai; git push origin timeline-wip-cloud:timeline-wip`.
- Mockups first; he approves before the app changes. When he gives feedback, discuss the change
  with him and edit only after he agrees.
- Execute instructions rather than acknowledging them. No unrequested recommendations. Never
  re-raise something he ruled out. No assumptions: say what was checked and what wasn't.
- Don't announce your own honesty, rate your own point, announce a shortcut you declined, or
  perform contrition. Lead with the answer.
- He likes innovative UI that uses the fact it's digital, not copies of other tools.
- Approval mode is auto: proceed without stopping on routine steps.

## Running and testing (cloud container)
- Backend: `TZ=UTC` is required (the container's TZ breaks `rigour`). Tests:
  `cd backend && TZ=UTC python -m pytest -p no:cacheprovider tests/<file> --no-cov -W ignore -q`.
  The full suite takes about two hours; run the files a change touches.
- API: `TZ=UTC DATABASE_URL=sqlite:///<path>/app.db uvicorn app.main:app --port 8000` from `backend/`.
  Web: `npx next dev -p 3000` from `frontend/`. Only ports 3000/8000 are allowed by CORS.
- Kill a server by its PID in its own command; a `pkill -f` on the same line as the command it
  matches kills the shell (exit 144).

## Done this session (all on timeline-wip)
- **Act screen:** the shared section layout every stage will get; Red Flags as list and detail
  on one screen (redesign canvas board 3).
- **Demo cases** (`docs/project-notes/DEMO_CASES.md`):
  - 1MDB now has photos, video, a podcast, articles, posts, scanned and foreign-language
    judgments, rebuilt emails, a .docx and a spreadsheet;
  - its records gained coordinates, IDs, PEP status, six currencies, graded claims, disputed
    links, ranged dates and merge candidates;
  - four small real cases: Anise (structuring), Vekselberg (shell chains), Deripaska
    (sanctions, shared address) and Jardine (ownership loop).
- **Fixes:**
  - a scanned page with a filing stamp is now OCR'd;
  - BO-032 matches an address written two ways;
  - one demo loads at a time, and a failed load is cleaned up;
  - a flag summary no longer ends twice after "S.A.".

## Waiting on Ony
- **See ("The Wire"):** the prototype is at https://claude.ai/artifact/8u73poSPQa9eLc5RZZXdn3,
  with its source in `docs/design/see-the-wire/` and the design in `SEE_THE_WIRE_PROTOTYPE.md`.
  It awaits his approval before it is built.
- **Media suite:** the research is in `docs/research/media-suite/MEDIA_SUITE_RESEARCH.md`, and
  its 12 open questions are at the end of that file. Next comes mockups for approval.
- **Then storytold:** after the media-suite research and mockups, study
  https://github.com/storytold (Ony's request). It is an open-source Adobe-like suite: filmcraft
  (video), lightcraft (photo), wordcraft (text), a Photoshop-like editor, soundcraft (audio),
  deckcraft (slides), artcraft and artcraft-services, and pdfcraft for drafting and editing
  documents, which he says the app absolutely needs. Check each one's licence and what can be
  reused.

## Still open from the demos
- Email, .mbox, .zip, video, audio and .xlsx files are read only through OpenAleph.
- BO-033 raises one flag per payment.
- Documents have no kind or language field.
- Claim evidence can't be "superseded".
- Payments can't be typed as a fine, judgment debt or agreed price.
