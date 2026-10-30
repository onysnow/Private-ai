# Start here (30 Oct 2026)

**Where it stands, 30 Oct (PR #117, branch `claude/laughing-tesla-dstx1t`):** a side-by-side check of every screen
against its mockup at 1440×900 (pictures were sent to Ony), then fixes from it. Built or fixed 30 Oct:
- **Places** on a real world map (Protomaps, fetched once by the backend, `app/services/basemap_install.py`), opening on a
  place, a draggable date window, paths on the map (DECISIONS_LOG 18).
- **Timeline**: every view opens on the case's busy years with outliers folded (Lanes, Stack, Board, Replay, Periods,
  Build your own).
- **Is it real?** opens on an item with a file rail; **Chain of Custody** checklist and columns; **Red Flags** buttons;
  **Money** labels placed without overlap; **Case home** quiet empty states, Next up's evidence, the Red Flag notice docked.
- **Redact**: margin line numbers no longer proposed as phones, proposals grouped; **reading**: court filings' margin
  line numbers no longer read as text (DECISIONS_LOG 22); **Clean and cut** spectrogram; **Listen & read** parts, voices
  and player; **photo room** proposals and size; MP3 cover art no longer a "video".
- **Demo data** so screens can be judged: five followed sources (19), a story (20), a deck from it (21), three captures
  from pages the loader really downloaded (23). Demo sources are never checked automatically.
- **Following**, **Story**, **Decks**, **Links & captures**, **Check a pack** (can be tried on the case), **Add by hand**,
  **Safety & data**, the **Knowledge** map (was blank: a CSS grid bug).
Fixed later on 30 Oct: the Story's evidence chips show a short label worked out from each source (DECISIONS_LOG 31);
a Board note pinned to a single year shows on the board that now holds that year.
Built later on 30 Oct (DECISIONS_LOG 32–37): BO-033 raises one flag per payer and payee; a payment has a kind (a fine,
an order or an agreed price is owed, not money that moved); one date and time style on every screen; a party's
dossier opens in the inspector slot over the current screen (Esc, Back, a drag handle, a bottom sheet on a phone);
claim evidence can be marked superseded; documents keep their kind and language (py3langid, ADR-0027). Looked at in
Chromium at 1440×900 on the 1MDB demo (30 Oct, later): Money's Ledger with "Owed, not paid: 19" folded under it; a
claim's evidence marked superseded (struck, the counts drop, undo beside it); the dossier opening over Places with
`?dossier=` and Esc closing it; Library kind marks and "EN English" detected on an uploaded text. Not looked at: the
BO-033 payment list (1MDB has no pair with two payments; Anise needs its documents) and the dossier's drag handle and
phone sheet. A dev server started with `npx next dev` skips `predev`, which copies MapLibre's worker: run
`npm run dev`, or `node scripts/copy-maplibre-worker.mjs` first, or Places draws no map. Migrations chain a7d3f9c2e614 → a7f3c9e2d641 → a8d2f6c4e913.
Open: openaleph-live's similar-documents test fails on some runs for a reason not established (PR #117 comments); The
Wire is Ony's own redesign.

**Later on 30 Oct (DECISIONS_LOG 38–52, all merged into PR #117):** Money's columns say less at rest when dense (38, Ony's
feedback); a table proposes its own mapping (39); Esc goes to the topmost layer (40); superseded evidence in Sources &
evidence (41); a payment's kind from a mapped column or a sentence that states it (42); Charts loads its catalogue with
the screen, 5,025 → 270 queries (43); a place's pictures and the timeline window, PLACE_1 (44); the 1MDB demo opens as a
nearly finished investigation, about 500 waiting → 47, every pre-made decision signed "Demo (pre-decided)" and undoable
(45); the party dossier rebuilt to the hover rule (46); a sweep of every screen against the rules, then fixes to
Settings (47), Act (48), Keep (49), Bring in (50), Check (51) and See and the Glossary (52). Two tests that failed only
on a busy machine were fixed (the water-drop one belongs upstream in onysnow-studios too). Migrations chain
a8d2f6c4e913 → b1c4e7a9d352 → b2e5c8a1d730. Open: openaleph-live's similar-documents test (its cause being reproduced
in Docker); the demo's undo endpoints have no screen yet.

**Late on 30 Oct (DECISIONS_LOG 53–58):** the demo's pre-made decisions shown and undoable (53); a re-check of every
screen in Chromium on the merged code, then fixes: frame hints off the content, every Red Flag rung's rule, Following
and Leads (54); the Wire's cards kept apart, Timeline, Places, Money bar values and the Glossary (55); Keep and Bring in
filled, names cut with an ellipsis, and the dev-only hydration mismatch traced to Next's segment explorer, turned off
in next.config (56); Is it real?'s empty state, Decide without repeats, To check titles that differ (57). openaleph-live's
similar-documents failure is explained and its test fixed (58: an openaleph-search + Elasticsearch bug; upstream fixes
written up for Ony). CI on PR #117: the three guard tests and a lint error fixed in 73358a4, which went fully green.
Every push now goes through the full gate first (lint, typecheck, the whole frontend suite, the backend guard tests).
Not yet looked at in a browser: the Settings panes after the sweep, an opened claim, the dossier at 1440 and 390.

**Earlier, 29 Oct, late (PR #117, branch `claude/laughing-tesla-dstx1t`, which carries #116's branch
`claude/native-module` merged in):** everything #116 built (below) plus, from #117, Ony's hover rule applied to every
screen (sub-text on reveal, types as marks, statuses colour-only with Settings › Appearance › Status marks, key hints
behind `?`, the AI mark), the style guide at `/style-guide`, and the site mockup for Illustrator
(`docs/design/site-export/`, made by `tools/export_site_mockup.py`). Following is #116's (ADR-0022), with three fixes from
#117's review: no direct capture of an item from a Tor-followed source, one claim per item, no capture of an older page
version (a version counts as captured only once its capture saved the page).

Built by #116, 29 Oct: the Timeline screens (Lanes, Stack, Replay, Board, Periods, Build your own) and Places
(TIME/PLACE mockups); the three media screens, a photo's Picture (MEDIA_1), a recording's Clean and cut and Sync
(MEDIA_2), a PDF's Redact before sharing (MEDIA_3); Add by hand, Check a pack, Does it work today?, the evidence pack as
PDF; The Wire's redesign; the deck editor; Your safety; the newsletter mailbox (DECISIONS_LOG 9–15). Still to build:
the storytold study, the website (§10), the UI simplification questions not covered by the hover rule.

**The work plan is `MOCKUP_BUILD_LIST.md`** (12 Oct note, kept for history; Ony, 12 Oct: make the app look and work like the mockups). Done 12 Oct (PR #58 into timeline-wip): table-row Decide cards, The Wire, the app-side suite gaps (data and API), Case home to HOME_1, the frame and Settings to HOME_2, the whole OnySnow Studios effect system brought in with the rain pane on the case title band (ADR-0009; frosted Glass panels still to do), The Drop and the reading room (INTAKE_1/2; History tab, per-file stream, web links and "already in the case" on reading-room cards still to do). Then SEE_2 Money, CHECK_2 Chain of Custody, ACT_1 Red Flags, ACT_2 Story, and AI_2 Before you run (Act › AI runs: the run settings in plain words, the plan, what leaves the computer, this case's default with a reason). SEE_1 waits on a Wire mockup Ony approves. AI_1 and the Knowledge catalogue and glossary are built. 23 Oct: Safety & data (KEEP_2) built with the outbound log (ADR-0015); its remaining parts are in MOCKUP_BUILD_LIST §9. Next: the "Your safety" panel, encrypted backups, then the website (§10, waits on Ony).

This is where the Workbench redesign stands, for a new session picking it up. The branch is
`timeline-wip`.

## How Ony wants to work
- Commands for him to run: always one single line starting with the `cd` to the folder, joined
  with `&&` (he uses Command Prompt), e.g. `cd /d C:\Users\Wigi\Documents\Private-ai && git push origin timeline-wip-cloud:timeline-wip`.
- Don't wait on him (29 Oct): decide each open question on what is best for the app, build it, and log the call
  in DECISIONS_LOG.md. When he gives feedback on something built, change it as he says.
- Execute instructions rather than acknowledging them. No unrequested recommendations. Never
  re-raise something he ruled out. No assumptions: say what was checked and what wasn't.
- Don't announce your own honesty, rate your own point, announce a shortcut you declined, or
  perform contrition. Lead with the answer.
- He likes innovative UI that uses the fact it's digital, not copies of other tools.
- **Show only what matters; the rest on hover or click (29 Oct).** By default a screen shows titles, important data,
  alerts, numbers and icons. Sub-text (how many times something was read, timings in ms, explanations, secondary
  details) is revealed on hover or click, unless the context gives a reason to show it. Categorical facts (what type
  of thing something is) are inferred through the UI (a mark, shape, colour or position) and named on hover or
  click. Applies to the whole app; build every new screen this way. Ony's answers (29 Oct,
  `docs/research/ui-density/SUBTEXT_AND_TYPES.md`): statuses and flag levels are colour only by default, the word on
  reveal, with Settings › Appearance › Status marks to add the shape or the word; key hints live behind `?`; AI notices
  are the AI mark with the sentence on hover; the old panels are converted too. The shared component is
  `components/ui/reveal.tsx`; the style guide is `/style-guide`.
- **Fill the space (29 Oct).** When a row, card or box has a lot of empty space above and below its content, make the
  text or icon bigger instead of leaving the space empty.
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

## Decided without waiting
Since 29 Oct Ony's open questions are decided on what is best for the app and logged in `DECISIONS_LOG.md`.

## Waiting on Ony (before 29 Oct; now decided and built in turn, see DECISIONS_LOG.md)
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
- Documents have no kind or language field.
- Claim evidence can't be "superseded".
- Payments can't be typed as a fine, judgment debt or agreed price.
