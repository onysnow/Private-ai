# Backlog (11 Oct 2026): everything Ony has asked for that is not done yet

Read START_HERE.md first. Ony's rule still holds: **mockups first, he approves, then build.**
The "approved" items below may be built straight away.

## Approved: build now
1. **Done 12 Oct: table-row decision cards.** A mapped row's card asks with the row's facts ("Does row 2 show a payment of $65,000,000 from 1MDB to Good Star Limited on 23 May 2011?"), shows the row's cells as a table in place of a passage (on the card and in Decide's middle pane), and lists payments already in the case between the same payer and beneficiary. Name cards from a table say "in row 2" instead of "in this passage". `case_home.py` `_proposals`, `_known_payments`; `decision-card.tsx` `RowCells`.
2. **Done 12 Oct: the type mark in the Decide list.** Proposals use ◇ instead of ≡; every type mark is a plain sign (no tile), with its type named on hover.
3. **Done 11 Oct:** .eml/.mbox/.zip/.xlsx are read by the app's own reader (commit 14b748e).
4. **Done 12 Oct: The Wire (See)**, built from the approved prototype (https://claude.ai/artifact/8u73poSPQa9eLc5RZZXdn3) as See's first section: `GET /api/investigations/{id}/wire` (`app/services/wire.py`, groups and layout by networkx) and `features/the-wire/` (the prototype's drawing code ported, scoped to its panel). Changes from the prototype: amounts under a million written in full (9,800 not "10 k"); the time strip spans the case's own dates; the drawer opens the dossier and flags; tags offer Trace. Not yet tested on 1MDB (its records cannot be downloaded in the cloud session).
5. **Done 12 Oct (data and API): the app-side Authority Suite gaps** — all 25 suite requirements are now recorded (`docs/authority-suite/SUITE_GAPS.md`; details in `MOCKUP_BUILD_LIST.md` §1). Each is shown on screen as its mockup's section is built.

6. **Done 19 Oct (first slice): Keep › Safety & data** (mockup KEEP-safety-and-data, ADR-0015): what lives on this computer and what left it, the outbound log word for word (CSV export), the last backup, the four Keep cards. Open: ADR-0015's five questions for Ony (the log in backups; AI calls as the question or the whole text; which OpenAleph calls to log; the default for outside lookups; when "last backup" is noted), Your safety panel, stray-file cleanup, encrypted backups.

## After the whole site is built: show less at rest (Ony, 29 Oct)
"When we finish the entire site, I want to go through and bury more details behind hoverable effects because there is way
too much text many of the times. I also want the whole container to have a small effect when you're inside it to help
keep track of the mouse amongst all the UI. And by default I will want only the most important pieces of data viewed
when you're not hovering, have selected or in said container."
- A pass over every screen once the build list is done, not now. At rest each container shows only its most important
  data; hovering, selecting or being inside a container reveals the rest (DECISIONS_LOG 12's detail levels and the
  research §7.4 ideas B "four depths" and D are the starting point).
- Every container gets a small effect while the pointer is inside it, so the pointer is easy to keep track of.
- Keep the floor (research §3): status, level and provenance stay visible at rest.
- **The Wire done first (29 Oct):** its panels show only their first line at rest (the header's one line, the trail's
  current party, the key's title) and open on hover or keyboard focus; the panel the pointer is in lights its edge at the
  pointer, and over the map the pointer carries a small lamp on the grid. The rest of the site follows in the pass.

## Later: animated presentations (Ony, 29 Oct)
"At some point I would like the option to create animated presentations like the one I am pasting":
https://framer.com/m/Chronical-Timeline-JMbe1o.js@IcxcWf1SSSwxMOG63dAo (Framer's "Chronical Timeline").
- What that component is: a story you scroll through rather than click through. A sticky frame holds the current
  item while the page scrolls. Each item has a year in large type, a section label ("01/ Section label"), a description
  and a picture or video. The items are revealed and turned as you scroll, with parallax, and a smoothing setting eases
  the scroll.
- Where it would sit: beside DECK_1's slides and PDF (DECISIONS_LOG 15), an export or present mode that turns a deck, or a
  case's timeline, into a scrolling animated story. The same citation rule applies: every line keeps its source, and a
  line resting on a claim that isn't shown yet keeps its Draft mark.
- Not started; it waits until Ony asks for it.

## Later: expanding cards layout (Ony, 29 Oct)
"Also I know that this style of animation and grid/layout could be used": Framer's "Expanding Cards"
(https://framer.com/m/Expanded-Card-Tf0T.js@eQAyLIpgdsn5jzRZJ7tW).
- What it is, from its code: five cards side by side in one 400px-high row. The open card takes the width and the
  others close to narrow strips. Each card has a background picture under a dark overlay, a number, a title and a
  paragraph; the title and paragraph show only on the open card. On phones the row turns into a column. Opening and
  closing use one spring (stiffness 160, damping 30).
- Places it fits, each with exactly the few items the layout wants:
  - The case home: the five stages (Bring in, Check, See, Act, Keep, lib/stages.ts) as the five cards. The open one shows
    the stage's line, its parts and where the case stands in it; the closed ones keep their number and stage colour.
  - The See stage: its four drawings (The Wire, Timeline, Money, Places) as cards with a live thumbnail of each.
  - Decks and the animated presentations above: a slide layout that compares up to five parties or sources.
- Not started; a mockup comes first when Ony picks where.

## Later: our own globe, with the Wire's links on it (Ony, 29 Oct)
"I eventually want to be able to use this globe and make it our own. Then we will be able to map out the events,
financial flows like that on the wire, but have it displayed on the globe":
https://framer.com/m/TacticalGlobe3D-uVMtXj.js@UhPxNuaENi2YMvlzEzft (Framer's "TacticalGlobe3D").
- What it is, from its code: a globe drawn in SVG with sphere maths of its own (an orthographic projection), no 3D
  library. It uses the Natural Earth 110m country outlines (the world-atlas file, which it fetches from a CDN). Drag turns
  it, it spins slowly when left alone, and it has an atmosphere, stars, a grid, country hover and markers with labels.
- Making it our own means writing our own globe in that style, not copying the component: its code carries no licence.
  Natural Earth is public domain, so the outlines can ship with the app, which also keeps the globe working offline
  (nothing fetched from a CDN).
- What it would show: the Wire's parties at their places, its links as arcs over the globe in the same family colours
  and line styles (money arcs with the moving lights running the way the money went), and Timeline events as markers,
  played through the time strip.
- Where it sits: the Places screen already draws with MapLibre, which can show its map as a globe. Whether the globe is
  that, or our own SVG globe in the Framer style, is a call to make with Ony at the mockup.
- Not started; it waits until Ony asks for it.

## Website titles that soak in like ink (Ony, 29 Oct)
"For our product page, for titles I want to try using this animation/styling":
https://framer.com/m/InkBleedComponent-DpjWv7.js@kqaA6CCQV2BFK6BSX295 (Framer's "Ink Bleed Text").
- What it is, from its code: each word soaks in from soft, fibrous edges and dries into crisp type, using an SVG filter
  per word (fractal noise pushing the edges about, plus a blur), 1.6 s a word with a 0.14 s stagger, started when it
  scrolls into view; hovering wets it again.
- Preview made with our own code (the component has no licence) on SITE_1's titles: on the site's dark ground, in a serif,
  and on paper. It goes in the website (MOCKUP_BUILD_LIST §10) once Ony picks a version.

## The Wire with a liquid shader in its backgrounds (Ony, 29 Oct)
"Show me the wire where the backgrounds have this subtle shader effect":
https://framer.com/m/Shader-Button-v12VJe.js@PhehsfTqnG7o5bWDuNUT (Framer's "Shader Button", whose fill is a moving
"Liquid Gradient" shader).
- He meant the chips' backgrounds, not the map ground (29 Oct). Preview made with our own shader: one slow
  domain-warped liquid in the chips' blue drawn for the whole map, each chip showing the patch under it (so it flows on
  from chip to chip and lifts with a hovered chip). In the app it would draw once a frame at half resolution, pause off
  screen, and stay off under calm motion, Effects off and reduced motion. It waits for his yes.
- He asked why the cards are rounded rectangles rather than chips: the app's cards have had 11px corners since they were
  first drawn (PR #60), and only a dot's name is a full pill. The previews now draw cards as pills; the app changes only
  on his yes.

## Testimonial rotation (Ony, 29 Oct)
Ony sent https://framer.com/m/Testimonial-Rotation-JRnz0w.js@VcEYXbVlwUb8LpYlJsb6 without a note.
- What it is, from its code: one quote at a time, with an avatar, a name and a byline, changing every 6 s with a blur and
  a slide, progress bars and arrows, pausing on hover, and still under reduced motion.
- The natural home is the website. Not started; it waits for Ony to say where he wants it.

## Iridiums, liquid metal (Ony, 29 Oct)
Ony sent https://framer.com/m/Iridiums-cvu6Qo.js@zVtz2mLljephiv025VmE without a note.
- What it is, from its code: a pale, iridescent liquid metal drawn in a shader. It is not a painted pattern. It builds a
  photo studio (strip lights, a horizon, two softboxes, a floor) and a drifting liquid surface, then reflects the
  studio in the surface at every pixel. The colour comes from each channel reflecting at a slightly different angle.
  Its controls are angle, dispersion, exposure, Fresnel, grain, highlight, lights, polish, relief, scale, shadow, speed,
  strips, tint and vignette.
- It is the same idea as the OnySnow light engine (light from a modelled scene, not painted on), so a version of our own
  would belong in onysnow-studios. Not started; it waits for Ony to say where he wants it.

## The Wire's chips in Nova Glow's motion (Ony, 29 Oct)
"This is how smooth I want the chips, and also how I want any glow animations. The styling is sharper": Framer's
"Nova Glow Navigation" (https://framer.com/m/Nova-Glow-Navigation-zmwqc6.js@AeSS5plwSRxLlwjuE91J).
His corrections to the first preview: keep the chips as they are (no recolouring, nothing removed) and only add the
styling; give our icons that kind of animation and care without copying Nova's icon; glow only on the chip being
hovered, in the chip's own colour as light. Red Flags: on faint (yellow) and strong (orange) the glow is only on the
count's circle at the top right; a chip with a textbook flag carries a police siren: a red beam sweeping round its
outline, the red light coming only from that moving beam, never from the whole outline (his correction, 29 Oct).
- The second preview does that: today's chips with a spring, a sheen, words that roll up on "+N more" and link chips, a
  glow in the kind's colour on hover, each kind icon's own animation on hover, the flag circle lit on hover, and the
  textbook chip's red siren beam sweeping round its outline at rest (faster on hover). Faint is yellow there, outline and
  circle. It waits for his yes before the app changes.

## Ony's standing requirement for every card
Wherever a card appears (decision, dashboard widget, flag, timeline row, to-check item), it must:
- let him infer the most important facts: who, what, how much, when, from where;
- tell it apart from every other card;
- say why it is there.

Cards that fail this today: "Keep this passage as evidence?" with no preview, four identical "business reason for the payments" checks, flags with no amounts or dates, and timeline rows with raw ids.

## Asked for: mockups first
- **Login and account (19 Oct).** So decisions on this computer carry your name ("Accepted by Ony") rather than "a person": the app stores who decided from the signed-in account (built 19 Oct), but the local owner has no account. Mockups ACCOUNT_1–4 approved 19 Oct; tools researched in `docs/research/accounts-and-locking-tools.md`; Ony chose BitLocker for the disk plus small tools: ADR-0016, built 19 Oct (MOCKUP_BUILD_LIST.md, ACCOUNT_1–4).
- **Bring in › Documents (ingestion page).** Redesign the queue and most of the page:
  - show progress, "stuck" and errors per file;
  - drop the wall of nine OpenAleph buttons on every row;
  - child documents of an .mbox are titled by raw hashes;
  - stop stretching full-width text: use the width for different components side by side.
- **Watchlist hits.** The bright yellow per-word highlights are unacceptable. Same full-width reading problem.
- **Bring in › Sources & evidence.** It is only a capture form. Add a way to look through all 182 sources and 930 pieces of evidence and display them there.
- **See › Timeline.** Impossible to read; redesign (28 Oct: mockups TIME_1 and TIME_2 drawn, `docs/design/time-and-place-mockups/`, waiting for approval):
  - the axis starts in 1952 and crushes 2009–15;
  - labels overlap;
  - rows show raw property names ("incorporationDate") and `source:<uuid>` origins;
  - dates are shown twice;
  - ranges show invented days.
- **See › Places.** (28 Oct: mockup PLACE_1 drawn, waiting for approval.) The base map must come with the app automatically, not as a separate install step. Places need dated events (the timeline strip is empty) and precision (city vs exact).
- ~~**See › Money.** The nav link and the "$6.87B" tile go to `#money-flows`, but See has no money view.~~ Fixed 12 Oct: See › Money (mockup SEE_2) is at `#money-flows`.
- **Media suite.** Keep developing the mockups (research: `docs/research/media-suite/`). Then:
  - study the ArtCraft apps installed on Ony's PC and identify which parts of which apps cover each media type the Workbench handles;
    28 Oct: the code of all 22 craft repos is mapped to the build items in `docs/research/media-suite/CRAFT_REPOS.md`;
    28 Oct: built and tried; what works is in the Workbench's native module (ADR-0021). Each use still needs its screen (mockup first): a photo's claims and the edit trail; redact, clean, blur, sync and clip from the reading view; PDF signing and PDF/A;
    28 Oct: mockups MEDIA_1–3 drawn for these (`docs/design/media-mockups/`), waiting for approval;
  - define what a journalist needs to do with each media type (features, tools, goals);
  - plan the features;
  - add complementary features for this use;
  - innovate something never done before for investigators;
  - make the designs the best possible UI/UX and visualisation.

- **Done 19 Oct: Settings panes** (Notifications, Outside lookups, AI and research, Connector keys), built from the Settings panes mockup (https://claude.ai/artifact/SEucwaaP2poX283ztjtfLp; HOME_2 drew only their sidebar rows). Ony said to decide on what is best for the app. Calls made: a Textbook Red Flag interrupts by default (once, never repeated, held while reading); outside lookups default to Ask first; research without asking is Off / Ask first only ("Without approval" needs saved questions, not built); no "Test key" (a test would have to send a query): a key's state comes from its last lookup; email and phone notifications are not offered (they would need a mail or push service). Not built: a safety-indicator kind (no data yet), "import finished", "backup reminder" and "connector refreshed" kinds (no records to read them from), per-case research mode.
- **Done 19 Oct: Platform needs** (docs/project-notes/PLATFORM_NEEDS_PLAN.md, parts 1–7), what the Settings panes left out. A log of every request that leaves the server (`outbound_requests`); a scheduler (every minute, both modes); imports finished and full backups recorded, with inbox rows for them; saved questions, research Without approval (per case too, with a reason); email (Apprise, the server's `NOTIFY_MAIL_URL`), phone (ntfy) and Web Push (`NOTIFY_PUSH_SUBJECT`), off until a reporter turns them on, kind and count only; Check the key with no search; OpenSanctions dataset updates noticed every six hours, and parties re-looked-up in cases set to Automatic. Not built: part 8, safety indicators (needs the SA levels).
- **Done 19 Oct: issue #41, the forms.** The 20 hand-wired forms are on the shared layer (`lib/forms.ts`): an empty or bad field says what to do under it and sends nothing; a refused save shows under the field or for the form, and the input stays (`docs/frontend/react-hook-form-zod.md`). The connections picker has no typed field and stays as it is.

## Asked for: demo
- **The demo is a finished (or nearly finished) investigation.** The human-review decisions should be pre-made by Claude from what is known, so the user sees how the app works past the review step. Today 1MDB has about 15,000 items waiting.
- **Run everything through OpenAleph once and ship the results with the demo,** so a download doesn't re-read everything. This needs a running OpenAleph, so do it on Ony's PC, or in a session with OpenAleph up, and package what OpenAleph produced.
- **Ony asked how "follow the money" works with OpenAleph and whether the system is efficient.** This is not yet checked end to end; OpenAleph was not running in the cloud session.

## Asked for: testing
- **Proofs alongside tests (25 Oct).** Tests check the inputs someone thought to try; a proof is a machine-checked argument that a property holds for every input. Add proofs to the ways the app is checked. Not yet decided: which parts of the app to prove, what each proof must show (its specification), and which proof tool to use.

## Asked for: navigation
- **Clicking a party anywhere jumps to Bring in** (the dossier lives in Connectors; `case-workbench.tsx` `STAGE_OF_REQUEST.dossier = 'collect'`). Proposed: open the dossier as a side panel over the current screen. Ony has not answered this yet.

## Found by the data audit (11 Oct) — Ony, 29 Oct: "Fix". Each checked against the code on 29 Oct, then fixed with tests
1. ~~**"Add 'United States' as a Person?"**~~ Fixed 29 Oct: a name whose kind the text gives no sign of is offered as "Add it, kind not known" (LegalEntity), never as the guess; accepting one without a kind is refused (`case_home.py` `_entity_question`, `documents.py` `review_candidate`). Not done: a place or country kind among the choices (FollowTheMoney has none).
2. ~~**Names already held as aliases are offered as new records.**~~ Already fixed before 29 Oct (every name and alias is matched, `resolution.py`). Fixed 29 Oct: a merge keeps the merged-away record's names as the survivor's aliases (`entity_merge.py`).
3. ~~**The CSV is read twice.**~~ Fixed 29 Oct: a table (CSV, TSV, XLSX) is never read as running text for proposals, mapped or not; mapping one withdraws such proposals kept from before (`documents.py`, `table_mappings.py`).
4. ~~**Timeline entries from record dates.**~~ Fixed 29 Oct: a link's dates make one event in words with its amount, start and end; a record's date reads "X: incorporation date"; a date already on the timeline for that record or a party of that link is not drawn again; no raw origin id (`timeline.py`, `timeline-panel.tsx`).
5. ~~**Range dates show invented days.**~~ Fixed before 29 Oct in `lib/dates.ts`; the Places strip's tooltip fixed 29 Oct (`places-timeline.tsx`).
6. ~~**The payments ledger drops `date_end`.**~~ Fixed before 29 Oct; 29 Oct: a payment known only by its end date reads "by" it, and the money strip and the Red Flags payment line keep the end.
7. ~~**The Case home money tile.**~~ Fixed 29 Oct: "from N starting payers" (different payers), every other currency listed with its sum, documents that could not be read counted.
8. ~~**The Case home flag cards join the parties with →.**~~ Fixed 29 Oct: the flag's summary at every level; a loop's summary keeps its way back.
9. ~~**BO-031 fires on one person's two bank accounts.**~~ Already fixed before 29 Oct (detector version 2, only dealings between legal persons). It is the app's Red Flags engine, not the Authority Suite.
10. ~~**OCR noise from photos becomes claims, names and evidence.**~~ Fixed 29 Oct: proposals read by OCR from a page under 60% legible (`OCR_LEGIBILITY_FLOOR`) are held back from Decide and wait in the reading room, "Held back · hard to read", decidable by eye (`handlers.py` `hold_illegible`).
11. ~~**94 "Source date" timeline events.**~~ Fixed 29 Oct: a source's own date is an event only on request ("Also show when each source was published or filed"; `include_source_dates`).
12. ~~**Places have no events or precision.**~~ Fixed 29 Oct: a property's events reach the address it is linked to, and a place says how exact it is ("exact to the building", from its notes). Also fixed in the demo data: the two inference claims are leads, not Confirmed and Supported; the converted .docx keeps its converter's note in its properties, not its text (its SHA-256 updated in `more.json`); the duplicate lead became next actions on the two leads it repeated.

Scripts and output: `/tmp/claude-0/audit/` (cloud session only).

## Found by the browser walkthrough (11 Oct) — not yet discussed with Ony
- **P1:**
  - ~~The Decide filter chips only look at the first 200 items, so "Missing 176" shows nothing.~~ Checked 12 Oct: the server filters by kind before paging.
  - ~~On an API error, Decide shows "Failed to fetch" beside "Nothing waits for you".~~ Checked in code 28 Oct: a list that did not load says so alone, with a retry (`decide-screen.tsx`, `decideUnreachable`).
  - ~~Decide's "Open the document" goes to Bring in › Search.~~ Fixed earlier: it opens the reader at the evidence's page (MOCKUP_BUILD_LIST §6).
  - ~~The Home mini-network's nodes can't be clicked with the mouse (an SVG overlay sits on them).~~ Checked 28 Oct in Chromium on the Vekselberg demo: a mouse click at a node's centre points at the party ("Pointing at Arinter Management, Inc., lights 2016–18 everywhere").
  - ~~The Home year strip changes only its label.~~ Checked 28 Oct in Chromium: a year sets the case's "as of" year ("· as of 2021") and the page's parts change with it.
  - ~~Loading a demo failed 4 times ("Could not refresh instance '<Evidence…>'") while another case was being read.~~ Checked 28 Oct: one demo builds at a time (a second is refused with a 409 naming the one loading, shown on the loader), a half-made case is removed, and reading runs as jobs after the build; two demos started together: one loaded, the other was refused and loaded when asked again; none was left half-made. Not tried: a demo build while a large case is being read.
  - ~~A flag level reads "To be set by Ony".~~ Checked in code 28 Oct: shown as "not set", never guessed (`knowledge/families.ts`, `patterns/engine.py`).
  - The graph's "Linked groups" layout freezes the page for about 20 s. Not re-checked 28 Oct (needs the 1MDB-sized case).
  - ~~The Chain of Custody drawer ignores Esc.~~ Fixed 28 Oct (`case-workbench.tsx`; `tests/test-custody-drawer.test.tsx`).
  - The upload's "Document title" is never saved. Checked 28 Oct: it is saved as the document's source title (`store_document`), which is what the custody chain, the evidence pack and Is it real? show; the document lists still show the file name.
  - ~~Times disagree (UTC vs local)~~: every screen reads API times through `lib/timestamps.ts` (`tests/test-api-times-on-screen.test.tsx` holds it); date formats still differ between screens.
- **Inert controls:**
  - Timeline marks (hover only) and legend items do nothing. Left for the Timeline rebuild (TIME_1/TIME_2, waiting for approval).
  - ~~Chart-builder bars do nothing.~~ Fixed 28 Oct: a bar, slice or point traces the first record behind its value (`pickedRow`, `chart-builder-panel.tsx`).
  - ~~Party chips inside a flag's detail do nothing.~~ Fixed 28 Oct: a party named in the open flag's picture filters the list to its flags, and again shows all (`red-flags-board.tsx`).
- **Material types:**
  - CSV and XLSX make no payments unless mapped.
  - MP3, WAV and MP4 give a 415, and the demo's .mp3/.mov show "failed · 0 chunks" with no reason. (28 Oct: recordings are accepted and transcribed on this computer, ADR-0020; a read without the model fetched fails saying what to run.)
  - A web link isn't fetched or archived, and "not a url" is accepted. (28 Oct: a link is captured: page, screenshot with clock, HAR and WARC with SHA-256, read as a document; ADR-0018, The Drop › Links & captures. A source's address is checked as a web address, `app/services/sources.py`.)
  - The watchlist "Check now" needs OpenAleph.
  - ~~There is no form for manual entities, relationships or events.~~ Fixed 29 Oct: See › Add by hand (mockup ENTRY_1) writes a party, link or event as a sentence, with where it comes from required.
- **Data quality and counts:**
  - The 1MDB queue has about 15,000 items.
  - ~~Deripaska proposes a railway (CSX) claim from the whole Federal Register issue.~~ Fixed 29 Oct: the pinned PDF (83 FR 19138-19140) starts with the end of an FRA notice about CSX and ends with the start of a Treasury meeting notice. The manifest now names the OFAC notice's first and last words (`part`), and proposals come only from between them; every page is still kept and searchable, and the PDF is unchanged (`own_part` in `app/services/documents.py`). A demo loaded before this keeps its old proposals; loading it again after removing it reads the notice only.
  - ~~The Home counts and the Next-up counts disagree.~~ Checked 29 Oct in Chromium on the Vekselberg demo: "984 to decide" on the strip, "1 of 984" on Next up.
- **Layout:**
  - ~~At phone width, Home and Decide overflow and Red Flags collapses.~~ Fixed 29 Oct: their one-column layout used `1fr`, which never shrinks below its widest child; now `minmax(0, 1fr)` (`styles/case.css`). Checked in Chromium at 390 px: no screen scrolls sideways; Red Flags already stacked.
  - The Leads board pushes the tabs off-screen. Not reproduced 29 Oct on a case with 2 leads (tabs stay at 1440 and 390 px); not tried on a case with many.
  - ~~Graph nodes are unreadable at the default zoom.~~ Fixed 29 Oct: the relationship network opens no smaller than 85% (13 px names read at about 11 px; they were about 6 px on the Vekselberg demo), at the top of the chain when the drawing is taller than its box; Fit still shows all of it (`network-view.tsx`). Checked in Chromium.
  - ~~The "If you answer" box is clipped.~~ No such box any more (29 Oct: the words are not in the code).
  - ~~Hydration warnings appear on several screens.~~ Checked 29 Oct in Chromium: none on Home, Decide, Bring in, Check, See, Act or Keep, at 1440 and 390 px.
- **Hard to reach:**
  - ~~There is no way to start a second case from the UI.~~ Fixed earlier: "+ Start a new case" in the case menu (`app-frame.tsx`).
  - ~~Graph legend chips don't show whether they filter.~~ Fixed 29 Oct: a filter chip that is on carries a ✓ and one that is off is struck through, not only faded (`globals.css` `.cf-chip`); checked in Chromium on See › Relationships.
  - Batch import drops the case name. Not reproduced 29 Oct: a batch is labelled from its files; what "the case name" meant is in the walkthrough's notes, which were in that session only.
- **Not tested** (not installed in the cloud): base map, OpenAleph, AI drafts.
- Screenshots and scripts: `/tmp/claude-0/walk/` (cloud session only).

## Still open from before
- See ("The Wire") prototype awaits approval: SEE_THE_WIRE_PROTOTYPE.md.
- BO-033 raises one flag per payment. Documents have no kind/language field. Claim evidence can't be "superseded". Payments can't be typed.

## Case home: built vs the approved mockup (Ony sent both, 12 Oct)
The mockup is the Kestrel SA screen in the redesign PDF; the built one is the Demo Investigation home. To match:
- **Header:** breadcrumb "Cases › case › Home"; "Switch case ⌘O" as a button, not a dropdown; the search/command bar centred at the top (⌘K); notifications bell with its count; settings; "Hide screen".
- **Next up:** the page thumbnail with the highlighted region, the locator line under the quote ("Minutes of the board · p. 4 · lines 18–21 · scanned, OCR"). A card with no passage (a missing value) leaves a big empty area; it should fill with what the value is for.
- **Bring in:** the document being read now, with its progress ("Reading with OCR · page 6 of 11") and what it has proposed so far.
- **Check:** "2 of 22 · scroll" and the segmented bar.
- **Act · Red Flags:** cards with the level chip, the summary as parties with arrows, "lights 2017", the "could be innocent" box, and the faint flags on one row.
- **See · who is linked:** edge labels with year and ✓/×, a shape per kind (a house for property), the legend, the party and link counts.
- **Since:** the four count tiles.
- **Year rail:** events and flags per year, with the flagged years marked.
- **Pointing at:** the party chip and "lights 2017–18 everywhere".

## From Workbench-redesign-2026.pdf (Ony pasted its text on 12 Oct; read in full)
Both PDFs are on Ony's PC (Documents\Private-ai-design); Ony pasted the text of both on 12 Oct and it was read in full. Design-research-2026.pdf is the evidence base (20 findings, ch. 02); the rules every build follows: never colour alone, one alarm colour, hidden navigation needs a handle + keys + dwell, motion explains change with a reduced-motion fallback, every claim one click from its source, mark grounded vs guessed AI, keep the key on screen.
- **Build order (§12):** 1 Foundations ✓ · 2 Suite swap ✓ · 3 Case home and Decide ✓ (gaps above) · 4 Bring in · 5 See · 6 Act · 7 AI run view · 8 Knowledge and safety · 9 Themes and effects · 10 Website.
- **Approved 12 Oct, ahead of the order:** The Wire (See) and closing the app-side suite gaps.
- **Decisions still Ony's (§12 table):** product name; edge panels on dwell or click only; Next up order; whether Textbook/safety notices may interrupt; Rain Noir rain default and photo; outside lookups default (automatic vs ask first); the seven Supported rules, the written override and the IPCC grid; whether watchlist hits and AI drafts live in Decide; unset Faint/Strong levels ("not set" vs hidden, per-case thresholds); every area's glossary definition; dotted worked-out links and money checks as Red Flags; stories per case, default gates, signed packs; social posting; "Paper Trail" vs "Run record"; website licence, price, telemetry, photos; backup passphrase.
- **ADRs needed before packages (§12):** motion library, command palette, Rain Noir effects port, local fonts, virtualised list, TipTap, PDF and share-card rendering, AI run event store, evidence anchors and check results; optional d3-sankey, timeline library, C2PA, headless browser.
