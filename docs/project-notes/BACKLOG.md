# Backlog (11 Oct 2026): everything Ony has asked for that is not done yet

Read START_HERE.md first. Ony's rule still holds: **mockups first, he approves, then build.**
The "approved" items below may be built straight away.

## Approved: build now
1. **Done 12 Oct: table-row decision cards.** A mapped row's card asks with the row's facts ("Does row 2 show a payment of $65,000,000 from 1MDB to Good Star Limited on 23 May 2011?"), shows the row's cells as a table in place of a passage (on the card and in Decide's middle pane), and lists payments already in the case between the same payer and beneficiary. Name cards from a table say "in row 2" instead of "in this passage". `case_home.py` `_proposals`, `_known_payments`; `decision-card.tsx` `RowCells`.
2. **Done 12 Oct: the type mark in the Decide list.** Proposals use ◇ instead of ≡; every type mark is a plain sign (no tile), with its type named on hover.
3. **Done 11 Oct:** .eml/.mbox/.zip/.xlsx are read by the app's own reader (commit 14b748e).
4. **Approved 12 Oct: build The Wire (See)** from the prototype https://claude.ai/artifact/8u73poSPQa9eLc5RZZXdn3.
5. **Approved 12 Oct: close the app-side Authority Suite gaps** (the 25 suite requirements the app lacks, `docs/authority-suite/SUITE_GAPS.md`) before step 4.

## Ony's standing requirement for every card
Wherever a card appears (decision, dashboard widget, flag, timeline row, to-check item), it must:
- let him infer the most important facts: who, what, how much, when, from where;
- tell it apart from every other card;
- say why it is there.

Cards that fail this today: "Keep this passage as evidence?" with no preview, four identical "business reason for the payments" checks, flags with no amounts or dates, and timeline rows with raw ids.

## Asked for: mockups first
- **Bring in › Documents (ingestion page).** Redesign the queue and most of the page:
  - show progress, "stuck" and errors per file;
  - drop the wall of nine OpenAleph buttons on every row;
  - child documents of an .mbox are titled by raw hashes;
  - stop stretching full-width text: use the width for different components side by side.
- **Watchlist hits.** The bright yellow per-word highlights are unacceptable. Same full-width reading problem.
- **Bring in › Sources & evidence.** It is only a capture form. Add a way to look through all 182 sources and 930 pieces of evidence and display them there.
- **See › Timeline.** Impossible to read; redesign:
  - the axis starts in 1952 and crushes 2009–15;
  - labels overlap;
  - rows show raw property names ("incorporationDate") and `source:<uuid>` origins;
  - dates are shown twice;
  - ranges show invented days.
- **See › Places.** The base map must come with the app automatically, not as a separate install step. Places need dated events (the timeline strip is empty) and precision (city vs exact).
- **See › Money.** The nav link and the "$6.87B" tile go to `#money-flows`, but See has no money view.
- **Media suite.** Keep developing the mockups (research: `docs/research/media-suite/`). Then:
  - study the ArtCraft apps installed on Ony's PC and identify which parts of which apps cover each media type the Workbench handles;
  - define what a journalist needs to do with each media type (features, tools, goals);
  - plan the features;
  - add complementary features for this use;
  - innovate something never done before for investigators;
  - make the designs the best possible UI/UX and visualisation.

## Asked for: demo
- **The demo is a finished (or nearly finished) investigation.** The human-review decisions should be pre-made by Claude from what is known, so the user sees how the app works past the review step. Today 1MDB has about 15,000 items waiting.
- **Run everything through OpenAleph once and ship the results with the demo,** so a download doesn't re-read everything. This needs a running OpenAleph, so do it on Ony's PC, or in a session with OpenAleph up, and package what OpenAleph produced.
- **Ony asked how "follow the money" works with OpenAleph and whether the system is efficient.** This is not yet checked end to end; OpenAleph was not running in the cloud session.

## Asked for: navigation
- **Clicking a party anywhere jumps to Bring in** (the dossier lives in Connectors; `case-workbench.tsx` `STAGE_OF_REQUEST.dossier = 'collect'`). Proposed: open the dossier as a side panel over the current screen. Ony has not answered this yet.

## Found by the data audit (11 Oct) — not yet discussed with Ony
1. **"Add 'United States' as a Person?"** The name-finder's guess of the kind is shown as fact, and about 30 of 37 are wrong. The kind question asked in Review is never asked on the card (`case_home.py:266`, `entity_signals.py:116`).
2. **Names already held as aliases are offered as new records**, e.g. "Jho Low" (9 of them). `resolution.py:68-71` only matches captions.
3. **The CSV is read twice**: by the table mapping, and as one 3,793-character text block with junk names. Skip the text name-finder for table-mapped files.
4. **Timeline entries from record dates:** raw titles ("— startDate"), raw origin ids, no amount, and duplicates of recorded events (`timeline.py:233-259`, `timeline-panel.tsx:141`).
5. **Range dates show invented days** ("1 Jan 2009 to 1 Jan 2013"; `lib/dates.ts:4-11`).
6. **The payments ledger drops `date_end`** (`financial_flows.py:91`). World View → Oceanco shows "—".
7. **The Case home money tile hides the other currencies** (36 payments). "17 sources" means 17 starting payers. Failed documents are not counted.
8. **The Case home flag cards join the parties with →** instead of showing the summary. The return leg of a cycle is lost.
9. **BO-031 fires on one person's two bank accounts** (`shared_holder_link.py`).
10. **OCR noise from photos becomes claims, names and evidence.** Add a quality gate.
11. **94 "Source date" timeline events** (including photo dates) clutter the chronology.
12. **Places have no events or precision.** Also:
    - an inference claim is forced to Supported (`more.json:14195`);
    - an editor's note in the .docx is read as content;
    - a duplicate lead.

Scripts and output: `/tmp/claude-0/audit/` (cloud session only).

## Found by the browser walkthrough (11 Oct) — not yet discussed with Ony
- **P1:**
  - The Decide filter chips only look at the first 200 items, so "Missing 176" shows nothing.
  - On an API error, Decide shows "Failed to fetch" beside "Nothing waits for you".
  - Decide's "Open the document" goes to Bring in › Search.
  - The Home mini-network's nodes can't be clicked with the mouse (an SVG overlay sits on them).
  - The Home year strip changes only its label.
  - Loading a demo failed 4 times ("Could not refresh instance '<Evidence…>'") while another case was being read.
  - A flag level reads "To be set by Ony".
  - The graph's "Linked groups" layout freezes the page for about 20 s.
  - The Chain of Custody drawer ignores Esc.
  - The upload's "Document title" is never saved.
  - Times disagree (UTC vs local) and date formats are mixed.
- **Inert controls:**
  - Timeline marks (hover only) and legend items do nothing.
  - Chart-builder bars do nothing.
  - Party chips inside a flag's detail do nothing.
- **Material types:**
  - CSV and XLSX make no payments unless mapped.
  - MP3, WAV and MP4 give a 415, and the demo's .mp3/.mov show "failed · 0 chunks" with no reason.
  - A web link isn't fetched or archived, and "not a url" is accepted.
  - The watchlist "Check now" needs OpenAleph.
  - There is no form for manual entities, relationships or events.
- **Data quality and counts:**
  - The 1MDB queue has about 15,000 items.
  - Deripaska proposes a railway (CSX) claim from the whole Federal Register issue.
  - The Home counts and the Next-up counts disagree.
- **Layout:**
  - At phone width, Home and Decide overflow and Red Flags collapses.
  - The Leads board pushes the tabs off-screen.
  - Graph nodes are unreadable at the default zoom.
  - The "If you answer" box is clipped.
  - Hydration warnings appear on several screens.
- **Hard to reach:**
  - There is no way to start a second case from the UI.
  - Graph legend chips don't show whether they filter.
  - Batch import drops the case name.
- **Not tested** (not installed in the cloud): base map, OpenAleph, AI drafts.
- Screenshots and scripts: `/tmp/claude-0/walk/` (cloud session only).

## Still open from before
- See ("The Wire") prototype awaits approval: SEE_THE_WIRE_PROTOTYPE.md.
- BO-033 raises one flag per payment. Documents have no kind/language field. Claim evidence can't be "superseded". Payments can't be typed.
