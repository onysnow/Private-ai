# Start here (12 Oct 2026)

**The work plan is `MOCKUP_BUILD_LIST.md`** (Ony, 12 Oct: make the app look and work like the mockups). Done 12 Oct (PR #58 into timeline-wip): table-row Decide cards, The Wire, the app-side suite gaps (data and API), Case home to HOME_1, the frame and Settings to HOME_2, the whole OnySnow Studios effect system brought in with the rain pane on the case title band (ADR-0009; frosted Glass panels still to do), The Drop and the reading room (INTAKE_1/2; History tab, per-file stream, web links and "already in the case" on reading-room cards still to do). Then SEE_2 Money, CHECK_2 Chain of Custody, ACT_1 Red Flags, ACT_2 Story, and AI_2 Before you run (Act › AI runs: the run settings in plain words, the plan, what leaves the computer, this case's default with a reason). SEE_1 waits on a Wire mockup Ony approves. AI_1 and the Knowledge catalogue and glossary are built. 23 Oct: Safety & data (KEEP_2) built with the outbound log (ADR-0015); its remaining parts are in MOCKUP_BUILD_LIST §9. Next: the "Your safety" panel, encrypted backups, then the website (§10, waits on Ony).

This is where the Workbench redesign stands, for a new session picking it up. The branch is
`timeline-wip`.

## How Ony wants to work
- Commands for him to run: always one single line starting with the `cd` to the folder, joined
  with `&&` (he uses Command Prompt), e.g. `cd /d C:\Users\Wigi\Documents\Private-ai && git push origin timeline-wip-cloud:timeline-wip`.
- Mockups first; he approves before the app changes. When he gives feedback, discuss the change
  with him and edit only after he agrees.
- Execute instructions rather than acknowledging them. No unrequested recommendations. Never
  re-raise something he ruled out. No assumptions: say what was checked and what wasn't.
- Don't announce your own honesty, rate your own point, announce a shortcut you declined, or
  perform contrition. Lead with the answer.
- He likes innovative UI that uses the fact it's digital, not copies of other tools.
- **Show only what matters; the rest on hover or click (29 Oct).** By default a screen shows titles, important data,
  alerts, numbers and icons. Sub-text (how many times something was read, timings in ms, explanations, secondary
  details) is revealed on hover or click, unless the context gives a reason to show it. Categorical facts (what type
  of thing something is) are inferred through the UI (a mark, shape, colour or position) and named on hover or
  click. Applies to the whole app; build every new screen this way.
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
  - three small real cases: Anise (structuring), Vekselberg (shell chains) and Deripaska
    (sanctions, shared address). Jardine (ownership loop) was removed as a case and kept for
    the tutorial in `TUTORIAL_NOTES.md`; the tutorial will be built on the 1MDB demo.
- **Fixes:**
  - a scanned page with a filing stamp is now OCR'd;
  - BO-032 matches an address written two ways;
  - one demo loads at a time, and a failed load is cleaned up;
  - a flag summary no longer ends twice after "S.A.".

- **Your name and the app lock (19 Oct, ADR-0016, mockups ACCOUNT_1–4):** first open asks your
  name, which goes on your decisions; "Protect with a passphrase" locks the app (idle, Hide
  screen, sleep; quick PIN), seals every backup, and lets a case have its own passphrase;
  People and access gives a person a key that expires. Branch `claude/accounts-and-locking`.
  Disk encryption is left to Windows (BitLocker / Device encryption); the app only reports it,
  and the BitLocker reading is untested on a real Windows machine.

- **Following (29 Oct, ADR-0021, mockup FOLLOW_1):** source intake Phase 3. Bring in › Following watches feeds,
  sitemaps, podcasts, YouTube channel feeds and pages for a case, politely (conditional GET, robots.txt, Retry-After);
  what it finds waits in an at-risk queue for a person to capture or skip. The first screen built to the 29 Oct rule
  (sub-text on hover or click), with its shared component `components/ui/reveal.tsx`.

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
  documents, which he says the app absolutely needs. Licences checked 11 Oct: lightcraft,
  photocraft and vectorcraft are MIT/Apache-2.0; artcraft and artcraft-services are the
  "ArtCraft License (WIP)" (fair source: no selling it, no competing product, a fork can't strip
  its community/donation/paid-model links). Ony's call: the Workbench is not a competing product,
  so studying and porting from them is fine.

- **UI simplification research (23 Oct):** `docs/research/ui-simplification/UI_SIMPLIFICATION_RESEARCH.pdf` (source `.md`, figures in `fig/`), with six animated sketches in `concept-lab.html` (also at https://claude.ai/artifact/5vCdnmgCH5saNn21grE628). Proposes three detail levels (Less / Usual / Everything) over a floor that never folds, and folding, depth and selection patterns. No app code changed. Revision 2 adds North Star (§5.7), the Awwwards list (§5.8) and fewer windows and layout (§7.5); The Wire is left as is. Its 16 open questions are in §8.

## Still open from the demos
- Video and audio files are read only through OpenAleph. (Email, .mbox, .zip and .xlsx are now read by the
  Workbench's own reader too: `app/services/container_readers.py`.)
- BO-033 raises one flag per payment.
- Documents have no kind or language field.
- Claim evidence can't be "superseded".
- Payments can't be typed as a fine, judgment debt or agreed price.
