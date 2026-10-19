# Build list: every mockup, and what it takes to look and work like it (12 Oct 2026)

Ony's instruction (12 Oct): the app must look and work like the mockups. This list puts every
mockup next to what the app has today and what is left. Sources: Workbench-redesign-2026.pdf
(the 16 screens and their sections), Design-research-2026.pdf (the rules), the approved Wire
prototype, and BACKLOG.md. Order follows the PDF's build order (§12), with the two items Ony
approved on 12 Oct first.

Status words: **built** (matches the mockup), **partial** (exists, does not yet match), **missing**.

Rules every screen follows (research ch. 02; redesign ch. 01): status by shape + word, never colour
alone · one alarm colour (Textbook and deletion only) · one focal point · the page never scrolls;
scrolling over a part moves that part · edges hidden with a visible handle, a pause and a key ·
every fact one click from its source · motion explains change, values never animate, and every
motion has a reduced-motion fallback · AI text marked until a person accepts it · the key stays on
screen · disabled controls say why.

---

## 0. Done or in progress

| Mockup | Status | Notes |
|---|---|---|
| The Wire (See prototype) | **work in progress** (Ony, 12 Oct: needs much more design work; redesign from SEE_1, SEE_2 and research ch. 07, mockup first) | Whole case / around a party / one link, lens, follow the money, time strip. Remaining: label links with sentences and certainty line styles from SEE_1 (see §5). Not yet run on 1MDB (downloads blocked in the cloud). |
| Decide (CHECK_1) table-row cards | **built** 12 Oct | Row facts in the question, cells shown, "already in the case". |
| App-side suite gaps | **data built** 12 Oct | §1 below; each shown on its screen with that screen's section. |

## 1. Authority Suite gaps (approved 12 Oct; data, then the screens that show it)

No mockup of its own: these are records the mockups already show (Chain of Custody's checks, the
claim card's classification and likelihood word, the story tree's right-of-reply gate, Before you
run's tier floor). Build each as a field or record with tests; surface it where the mockups put it.

**Data and API built 12 Oct** (all 25 now recorded; `docs/authority-suite/SUITE_GAPS.md`): fields on
sources, evidence, claims, links and leads (`PATCH /api/{claims,sources,evidence,relationships}/{id}/suite`,
claim changes kept as review events), and the suite's own records (GAP, ROR, HYP, CFLT, RLOG, ESRC, EPIT,
CAPT) at `/api/investigations/{id}/case-records`, amended with history. The Confirmed rule now reads the
tier (A alone; A/B/D independent; C never; E/F leads) and counts a restatement as its original. Each value
list is checked against the vendored suite (`tests/test_suite_records.py`). **Still to do:** show each one
where its mockup puts it, in the sections below (§5 line styles, §6 claim card and Chain of Custody,
§7 story-tree reply gate, §8 tier floor).

- [x] Source tier A–F on sources/evidence (shown: Chain of Custody source band; Before you run)
- [x] Claim classification (the eight) and likelihood term (seven ICD 203 words) + confidence basis, warrant, assumptions, limitations (claim card; trace drawer)
- [x] Restatement link between evidence items ("repeats, does not establish")
- [x] Authenticity status, issuer/author, and separate record / event / publication / retrieval dates on evidence
- [x] Relationship evidence status: direct / inferred / alleged (network line styles)
- [x] Event date precision kept apart from evidence status (timeline bands)
- [x] Partly-verified verdict with corrected wording
- [x] Reviewer type on review events (automated / AI-assisted / human / legal)
- [x] Right-of-reply record (OFFERED … EXCEPTION) — story tree gate
- [x] Gap record (GAP-) tied to a claim; negative-search-result record with its scope; retrieval log
- [x] Hypothesis records with kind (working theory / innocent explanation / …) and viable
- [x] Conflict record with the same-proposition test and resolving evidence
- [x] Gathering outcome per lead (obtained / refused / not held / no reply / unable)
- [x] Hash + custody log for online captures; CP-02 source-protection and CP-03 publication-ethics records

## 2. Case home — mockup HOME_1 (redesign §04.1)

Today: **built 12 Oct** except Bring in's "what it proposed so far". Built earlier: question, standing strip, Next up card with three keys and undo, Bring in /
Check / See / Act modules, Since strip, year rail, Pointing-at bar.
To finish:
- [x] Top band (12 Oct; the top edge, still hidden until called): breadcrumb "Cases › case › Home"; **Switch case ⌘O** button (not a dropdown); centred ⌘K bar; bell with count; settings; **Hide screen**
- [x] Next up (12 Oct: the page drawn with the passage marked, View full page, locator, scroll hint): the page thumbnail with the highlighted region and "View full page"; locator line in mono ("Minutes of the board · p. 4 · lines 18–21 · scanned, OCR"); "4 of 7 · scroll" with dots; the reason line ("From the Textbook Red Flag …"); no empty area for kinds without a passage
- [x] Bring in module (12 Oct: real page progress from the reader; "what it proposed so far" still to do — proposals are made at the end of a read): the document being read now with real progress ("Reading with OCR · page 6 of 11"), what it proposed so far, rows with Read → / Review → / See →, a permanent drop target
- [x] Check module (12 Oct): "2 of 22 · scroll", segmented status bar, disputed / not-yet-shown claim cards with their source line
- [x] Act · Red Flags module (12 Oct: "lights 2018" from the flag's dated links): level-chip cards with parties joined by arrows, "lights 2017", the could-be-innocent box, faint flags on one row, "1 of 3 · scroll"
- [x] See module (12 Oct): mini network with edge labels (year, ✓/×), shapes per kind (house for property), legend, "31 parties · 46 links"
- [x] Since strip (12 Oct): four count tiles with the actor (AI tile tagged AI)
- [x] Year rail (12 Oct): events and flags per year, flagged years marked; pointing at a party lights its years
- [x] Pointing at (12 Oct): party chip + "lights 2017–18 everywhere" + Clear
- [x] Scroll-over rule in every module (built earlier: features/case-home/wheel-step.ts; Case home has no page scroll, so the ends have nothing to release to) (wheel moves inside after a pause, releases at the ends)

## 3. App frame and Appearance — mockup HOME_2 (§04.2–4.11)

Today: **partial**. Built: five themes as tokens, Appearance with try-then-keep, effects full/light/off,
edge-hidden frame, ⌘K palette, breadcrumb.
To finish:
- [x] Appearance (12 Oct: six chips, Compare, live before/after of the real Case home, four facts, Format thumbnails; the named effect switches wait for the Rain Noir effects port below): specimen cards drawn in their own theme with six status chips and the lowest contrast pair; **live before/after divider of the real Case home** (react-compare-slider is installed); the four facts under it (contrast, calm zones, fonts, cost); effects as named switches (bokeh, rain pane, grain, iris, shutter corners, neon; all working since 12 Oct); Format thumbnails (Board, Editorial, Desk, Story)
- [x] Settings regrouped (12 Oct; values for API, AI, cases, theme, effects, motion, keys, format): You / Cases / This computer, each row showing its current value; settings search
- [x] Checked against the HOME_2 picture (12 Oct, later): Settings is now the sidebar (Appearance, Notifications, Keyboard, Your safety · New-case setup, Outside lookups, AI and research, Red Flag levels, Demo case · Access and token, Connector keys, Backups, Security log, Operator console ↗), each with its value and the chosen one on the right (address #id); Appearance in two panes: compact theme cards (Current/Trying, "Header Body copy €29,400", status marks, lowest pair · AA), Effects Full/Light/Off with named switches (all six work since 12 Oct, from the OnySnow Studios effect system), Calm motion; "Your case, live" with now/trying corners, four facts, Format tiles; the trying bar at top centre with Esc. Theme fonts now follow THEMES-1/2 (Rain Noir Manrope + Jost 300 titles, Archive Domine, Indigo Inclusive Sans + Lexend, IBM Plex Mono everywhere).
- [x] "+ Make your own" theme (19 Oct: `features/appearance/theme-maker.tsx`, `lib/custom-theme.ts`, `lib/contrast.ts`): start from a theme, change any of its 17 colours, 21 pairs checked for contrast (WCAG AA, the research's pairs; each built-in's lowest pair matches its card) as you go; Save refused naming the failing pair; kept in this browser only; tried, kept, edited and deleted like the other cards; ⌘K offers it too
- [x] Edge rules (12 Oct; Alt → / ← for the left edge, Alt ↓ / ↑ for the top): dwell ~250 ms, visible 5 px handles labelled on first use, Alt+arrows, pin per device; trail of the last five places on the left edge
- [x] Notifications inbox (12 Oct; snooze is per computer, a day or a week) (Needs you / Everything else, snooze)
- [x] New-case setup (12 Oct; also from the case switcher) (name + question, "what kind of case", "what do you have so far")
- [x] Cases shelf (⌘O) (12 Oct: the switcher, each case's last place) with per-case place memory
- [x] Rain Noir effects from the OnySnow Studios site (12 Oct; ADR-0009): BokehField, the 8-blade iris on opening the reading room, shutter corners on saving evidence, steady neon on an opened Textbook flag (off by default), each with its switch
- [x] The whole OnySnow Studios effect system brought in (12 Oct, Ony: "import the entire effect system for now"): `frontend/vendor/onysnow-effects` (engine, light, optics, water, materials, camera, every effect component, stylesheet, docs, research, tools; its 79 test files pass); the bokeh, iris and neon are now its own components
- [x] Rain pane (12 Oct): the system's Pane and WaterDrops on the case-home title band, over the reporter's own photograph (Settings › Appearance, kept in this browser only; research innovation 1); rain stays under the words; Rain Noir + Effects Full + Rain switch + WebGL only; dry under Light, Calm, reduced motion and in the Appearance preview
- [x] Frosted glass panels with the system's Glass/GlassLight (research: "frosted panels (blur 30 px, saturate 150%) over the BokehField"; GlassLight cost grows per pane) — 19 Oct: `features/effects/frost-panel.tsx`; the Case home's four board modules (Next up stays plain, a calm surface), at most 4 panes; Rain Noir + Effects Full only; GlassLight draws the resting frame once and sleeps, off under Calm motion and reduced motion
- [x] Rain under Calm motion: the research's still "after the rain" frame (19 Oct: the system's own "After the rain" weather drawn once hidden, its picture kept under the words, the water stopped; the same under the computer's reduced-motion setting; Effects Light stays dry)

## 4. Bring in — mockups INTAKE_1 (The Drop) and INTAKE_2 (reading room) (§05)

Today: **partial** (old Documents panel; readers built, incl. .eml/.mbox/.zip/.xlsx).
INTAKE_1 The Drop:
- [x] (12 Oct; links still to do — they need web capture) Drop field (files, folders, links, pasted text) that shrinks to a strip once files arrive; This drop card (counts, OCR language, "nothing leaves this computer")
- [x] (12 Oct; polls every 2 s while reading, no per-file stream yet) **Digestion line**: one lane per file, seven stage boxes (Received → Checked → Read → Split into passages → Files inside → Names & facts → Ready for you), live detail ("12/48", "OCR"), stopped / waiting / needs-you states, containers collapsed ("18 of 23 read · Show all"), totals row; Problems & in progress filter (F)
- [x] (12 Oct) Read receipt card (fingerprint, pages, how read, passages, proposals, watchlist hits, flag it fed; Open in reading room · Trace)
- [x] (12 Oct; problems sort first; no filmstrip yet) Ready for you (63 proposals by kind) and Problems first list; bottom filmstrip "1 / 34"
- [x] Library and History tabs; per-file event stream (SSE) instead of three pollers; Stop reading — 12 Oct: Stop reading done (stops at the next page, keeps nothing half-read); the old Documents panel is the Library tab. 19 Oct: History tab (every drop, newest first, with what it saved, found already there, refused, read, could not read, passages, proposals found / accepted / waiting; files brought in one at a time grouped by day; "Show it on the line" filters the line to that drop); each drop is now one ingestion batch. The Drop follows a per-file event stream (`GET …/drop/stream`, ADR-0014) and polls every 2 s only when the stream cannot connect; the Library panel's own job and corpus polls and /review/batch's refresh are unchanged (not part of The Drop's screen)
- [x] Checked against the INTAKE_1 picture (12 Oct, later): three columns (drop field, This drop, read receipt with page thumbnail and READ CLEANLY chip, What happens next · the line · Ready for you with the big number, problems first, Open the reading room, keys); tabs Digestion line / Library n / History (History not built); "● Reading · n files"; each lane with its line under the name, compact boxes ("✓ 214"), a Waiting column (n PROPOSED, Try again, Open that one); an e-mail's files beneath it, archives over 5 folded "18 of 23 read · Show all"; totals with bars; legend and who proposed; filmstrip "1 / n". From the research (§2–3): over 40 files the line starts on problems and folds clean files.
- [ ] Still from the research for The Drop: "Keep a second copy" on a duplicate at upload; "No progress for 6 min" on a stalled stage; the line as a keyboard grid (role="grid", arrows); links in the drop field (needs web capture) — 19 Oct: done except links: a duplicate is named "Already in the case as … · same fingerprint" with Open that one / Keep a second copy / Leave it, and one bad file no longer stops the rest; a running read with no report for 6 min (or a queue that is not moving) shows ⧗ "No progress for n min" with Check, and is listed in Problems first; the line is a role="grid" with one tab stop, arrows, Home/End, Page Up/Down, Enter (receipt or the cell's button), visible focus; each box named "file, Read: working, OCR, page 12 of 40"
INTAKE_2 Reading room:
- [x] (12 Oct) Page strip with proposal marks; calm serif text 40–60 ch/line; tabs Text / Original / Translation / Details; find in document
- [x] (12 Oct; To check makes a lead, Tag tags the document) Selection bar: Evidence E · Claim C · Name N · To check X · Tag T
- [x] (12 Oct; "already in the case" on the card done 19 Oct: the record as a small card with its kind, how many facts the case holds on it, and the reason with its mark, e.g. "✓ Same name: “Ltd” and “Limited” read as one") Margin of proposal cards linked to their spans by leader lines; "Is this already in the case?" inline; questions with number keys; Why?
- [x] (12 Oct) Evidence clip card (quote + 32 chars either side, SHA, anchor) — self-checking quotes
- [x] (12 Oct) Footer keys and counts (accepted / rejected / waiting), Document n of N
- [x] Checked against the INTAKE_2 picture (12 Oct, later): breadcrumb, tabs, find (⌘F) and "Document n of N" in the top band; a strip of drawn pages with a mark per waiting proposal and "n pages · n waiting · n unanchored"; one page at a time with chips (Page n of N, how it was read), the title and ¶ numbers, marks as dashed underlines with no fill (research §6 calm zone); the selection bar at the selection; the margin headed "Page n · proposals · clips" with All / Questions only; the evidence clip there with its page drawn; each card with PROPOSED, confidence dots and word, who proposed it and "p.3 ¶2", its question inside ("What is …? The text does not say" 1–4, "Is this already in the case?" Same as this / A new record, "Whose is it?" with "Accept … first, then link"), Accept A disabled until answered, Reject R, Edit (names), Why ›; a leader line to the words; each decision held 6 s with Undo (U); footer keys and counts, Next ›.
- [ ] Still from the research for the reading room: "What changes if I accept" preview; "Answer once, apply to the batch"; revision rate per proposer (19 Oct: the first two done — Accept shows what it adds, from the card's answers, on hover and focus and as its description; after "Same as this", the other waiting mentions of the same name in the drop, else the case, are listed with "Apply to these n", held 6 s with Undo; `GET /extraction-candidates/{id}/same-answer`) on the read receipt; language chip (the reader does not record the language yet); OCR quality per page
Also from the backlog: watchlist highlights redesign; Sources & evidence as a browsable list of all sources and evidence; .mbox children titled properly; audio/video intake; web links fetched; manual entity/event forms.

## 5. See — mockups SEE_1 (network) and SEE_2 (money) (§07), plus Timeline and Places

SEE_1 "Who controls Kestrel SA": The Wire is now See's map; SEE_1's parts go into it.
**Ony, 12 Oct: the two screenshots of The Wire he sent with the mockups are work in progress and need much more design work than the other screens; they are not targets. The Wire is redesigned from SEE_1, SEE_2 and research chapter 07, as a mockup for Ony to approve first.**
- [ ] Every link labelled with its sentence and certainty glyph ("✓ owns 60%", "? signs for · not yet shown", "ƒ owns 40% · worked out")
- [ ] Certainty line styles: solid shown / dashed not yet shown / double disputed / dotted worked out / faint ended, with the key always on
- [ ] Flag rings with level and count; lettered stubs for long links
- [ ] Right detail panel for a link: sentence, status, the source scan with the words lit, Open the source / Chain of Custody, its Red Flag, "How is X linked to Y?"
- [ ] Active chips (As of end of 2019 ✕ · Lit Kestrel SA ✕ · Clear all) and the as-of time rail with histogram, "11 of 14 links held by then · 1 ended · 2 undated"
- [ ] Arrangement switch (Who controls whom · Around a party · By kind · Linked groups · Grid) with "Chosen because…"
SEE_2 "Where did the money go" (12 Oct: See › Money, `features/money`, loads with the view; the dead Money link now opens it):
- [x] Currency tabs with counts, Columns / Flow / Ledger switch, "Traced so far" running total (click a band; Esc clears)
- [x] Comes from → passes through → goes to columns in SVG, labelled bands with the status grammar; missing money drawn as a hatched "No recorded source" ghost with its arithmetic; a round trip's latest payment drawn as a return arc (never "cannot draw")
- [x] Integrity checks panel (backend `money_checks`, per currency, as of the year): grey hole, miracle, black hole, round trip with "none found"; each with could-be-innocent, Make a lead and the lead idea; the same icons on the parties
- [x] Ledger strip on a time axis (log height, stated), the €10,000 line, Red Flags' structuring bracket (ML-021 now counts euros as well as dollars, per currency); ledger table with status chips and sources; J / K lights the row
- [x] Ledger certainty is shown / not yet shown / disputed (`certainty` on each payment)
- [x] "Add to To check" from a money check (19 Oct: To check item kind `money` in `check_items`, no new table; `POST /investigations/{id}/checks/money` re-runs the check on the case's own ledger and keeps it once; each money check carries `to_check_id`, so the button reads "In To check ✓"; a recompute never marks it gone; shown in To check and Case home's Next up)
- [x] 17 Oct, checked side by side with the mockup's own payments: band chips (✓ land price / council minutes p.4, ✓ 3 × €9,800, ○ €42,000 "deposit"), names and marks where the mockup puts them, ghost as a dotted box, scroll replays the flow in date order ("drawn up to May 2019"), named large bars, flag strip above a compact table, How these work
- [x] Hover a band lights its ledger rows too (19 Oct: every row the band carries, in the table and on the strip; Tab onto a band does the same, Enter traces it; the compact table moves to show a lit row)
- [ ] The stage header above every screen (title, line, part tabs) is not in the mockups, which show only a breadcrumb; with it Money does not fit 1440×900 as drawn (Ony's call: it changes every screen)
- [x] Top 20 flows plus "others (n)" for very large ledgers (19 Oct, Columns: the 20 largest payer-to-payee flows, the rest in one "others (n)" band that opens out on a click, "Fold to the 20 largest" back; labels and Traced so far count every payment; a crowded column packs its parties. The Flow (Sankey) layout is the shared chart and still draws every flow)
Timeline and Places: **no mockup in the 16 screens** — the canvas frames 4–13 exist; per Ony's rule, mockups first (backlog items: unreadable axis, raw property names, invented days; base map shipped with the app; dated place events and precision).

## 6. Check — mockups CHECK_1 (Decide) and CHECK_2 (Chain of Custody) (§06)

CHECK_1 Decide: **partial** (queue, evidence pane, card, keys, undo built).
- [x] Queue filters work past the first 200 (backlog P1); grouped by source with "pages read" (19 Oct: each document group shows "pages read: n of m", the pages carrying a proposal or a passage to check and how many have nothing left, counted on the server from the items themselves; a spreadsheet's rows get no count)
- [x] "What happens" preview per kind; reason chips under No; Last 10 strip; bulk "Accept all 38 high" (19 Oct: each answer says what it does, worded from the endpoint it posts to; chips only where the endpoint stores the note, so a watchlist dismiss answers at once; Last 10 entries undo while held, a saved To check item or missing value goes back to open, the rest say why not; "Accept all n high" per source for high proposals whose Yes asks no question, confirmed by count with the list, one Undo all; the Decide error state stands alone with Retry)
- [ ] Sort by what it unlocks (19 Oct: not built; no stored data says which answer completes a claim's Done rules or raises a Red Flag: To check answers leave flag levels unchanged, an accepted claim starts Not yet shown, and whether a new link would raise a flag needs a dry run of the pattern engine); "Open the document" opens the reader, not Search (done, see CHECK_2 below)
CHECK_2 Chain of Custody (12 Oct: Check › Chain of Custody, `features/custody`; backend `GET /claims/{id}/custody-chain`, `POST /documents/{id}/recheck-hash`):
- [x] Whole-screen chain: Files → Reading → Passage → Decision → The claim as wired cards with check glyphs (✓ hash re-checked on load, ✓ says it, OCR / text layer), one row per piece of evidence, against rows in red; AI drafts that quote the claim as plum cards
- [x] Wire styles (confirmed / proposed / worked out / against / AI) with the action word on each line
- [x] Custody log (who, what, when) with "Export for an editor or lawyer" (a tab-separated table) and L for the chain as a plain list; the custody seal, copyable for a methods note
- [x] Detail panel: the passage with the quote lit, checks, SHA-256, Decided, who and when; Open page n, Re-check hash
- [x] Opened from a claim in Claims ("Chain of Custody: how this got here"); Esc back to the claim
- [x] OCR legibility % (19 Oct: after a read, each page read by OCR is shown to the Tesseract program once more and its mean word confidence kept on the passage, `document_chunks.ocr_legibility`, `app/services/legibility.py`; the document is readable while it is measured; "Page 3 of 4, read by OCR · 96% legible" on the card and in the log). Who decided by name (19 Oct: claim reviews, quote links and accepted/rejected proposals keep `decided_by_id`/`decided_by_name` from the signed-in account, stamped on save, `app/db/decided_by.py`; "Accepted by Ony"). **On this computer there is no account, so your own decisions still say "a person": a login and account screen needs a mockup first (Ony, 19 Oct: "probably have a login and account")**
- [x] 17 Oct, checked side by side with the mockup's three rows and an AI draft: seal beside the title, From file → to sentence, Fit; cards as drawn (page picture, ! OCR, PASSAGE · P.3, decision kind as heading, short dates); only the line into the claim labelled; against rows red throughout; AI step under the claim on a "used in" line with Watch the run (opens Act › AI runs › Watch); detail panel with source qualities, file and content checks, anchor (found now), grouped SHA-256, Rests on it, the key
- [x] "What if this breaks?": the steps after it and the claims, links and open Red Flags resting on the evidence
- [x] 19 Oct: scroll-over replay along the log (the wheel over the log steps through its entries, lighting each one's card and the wires on both its sides; hover a row to start there); draw-in motion (the wires reveal from the file to the sentence when a chain opens; drawn at once with reduced motion or Calm)
- [x] Line numbers in a passage; stored anchors (19 Oct, ADR-0015: `evidence.anchor` with passage, offsets, 32 characters either side, match, lines; anchored on save and again on each read, existing quotes anchored by migration b3f7d2a9c615; the chain finds it again and says held / moved / lost; "PASSAGE · P.3 L.14–22", "lines 14–22", "exact quote + 32 characters before and after, offsets 412–489"; the passage card shows the words around the quote, lit). Still to do from research §3.9: the check_runs table and re-hash job, and a lost quote as a Decide card
- [x] Decide: "Open the document" opens the reader at the evidence's page; the filters work past the first 200 (the server filters by kind before paging)
- [x] Claim card with the Done checklist for Supported (server-enforced rules) in the chain (19 Oct: `GET /claims/{id}/custody-chain` carries `done`, from the same `done_checks` a review to Supported is held to; each rule ✓ met, ✕ not met with what it waits on, ○ not checkable here)

## 7. Act — mockups ACT_1 (Red Flags) and ACT_2 (story tree + write-up) (§08)

ACT_1 Red Flags (12 Oct: rebuilt as three columns, `features/act/red-flags-board.tsx`, `styles/act.css`):
- [x] Top bar: type line, "n of n record rules ran · n need data" (with what each needs), level chips with counts, Set aside, No longer fire, Area, Party, New since last visit (per computer), "6 of 8 flags · Reset"
- [x] Ranked list (level then weight; a kind that fires many times is one row with its count): rank, level chip with id, party chips, new dot, "○ rests on n links not yet shown"; J / K; parties carrying flags as rings (click filters)
- [x] Open flag: id · area · rule version · first seen, summary, the picture it rests on (payments in the band with the reporting line for ML-021; the loop for a cycle; the chain otherwise), level ladder (met / next / not set / needs n facts, with To check), About the numbers, Add to leads (A), Set aside with a reason (X, asked in place), Show in money flows, Share disabled with its reason
- [x] Before you call it: innocent explanations as a checklist kept on the flag (not looked at / ruled out with what ruled it out / could apply; backend `POST /red-flags/{id}/innocent`, migration a9c3e7f1d204), the records can't show with their To check status, the sources as quotes
- [x] 19 Oct: Reading never writes (`GET …/red-flags` only reads, with `ran_at` and `stale`; `POST …/red-flags/run` runs the rules; last run kept in `investigations.red_flag_run`, migration e8b5c1f4a927; every screen reads through `features/red-flags/use-red-flags-query.ts`, which runs stale flags once; "Run the rules · ran n min ago" on the board); hover-preview; scroll over the picture to step through payments (the one in focus ringed and named); "What changed" replay from first seen / stopped firing since the last visit (calm motion lists them at once). GET …/checks, …/decisions and …/wire still run the rules as before

ACT_2 Story (12 Oct: Act › Story, `features/story`; backend `app/services/stories.py`, ADR-0010 data model, ADR-0011 TipTap):
- [x] Thesis diamond → sections → claims → evidence tree; branch lines by the weakest claim (solid / dashed / red); critical path banner and marks; L for the outline; put a claim under a section, take it out
- [x] Gates (every sentence has a source, innocent explanations addressed, single-source statements, right of reply, legal read) with ✓ / ○ / ! and what each waits on; right of reply and legal read recorded by a person; Ready to run refused until every gate passes
- [x] Write-up editor (TipTap) in the reading face: citation chips (the server's own citation node), ⌘⇧C cites a claim of the story, sentence marks (no source ○ dashed, disputed ! red, not yet shown dotted) worked out from the cited claims, saves on its own, Cited tab, Export for publication disabled with how many sentences need a source
- [x] AI-draft marks on paragraphs, Notes tab, version history ("Before legal read"), hover a citation for its quote, click to open the passage beside the text, drag a claim into the text (19 Oct: `editor-extensions.ts`, `story-panes.tsx`; versions in `writeup_versions`, migration e4c8a1f7b392, in the backup; story notes are notes on record type "story". The AI-draft mark rides a paragraph attribute `aiDraft`, plum until kept: nothing inserts AI text into the story's write-up yet)
- [x] Leads as Now / Next / Later; Export sheet (19 Oct: `features/leads/leads-horizons.tsx`, `leads.horizon`, Now capped at 5; the Export sheet in `story-panes.tsx`, the .docx still disabled until every sentence has a source)
- [ ] Evidence pack (shown in the Export sheet as not built yet)

## 8. The AI — mockups AI_1 (Watch the run) and AI_2 (Before you run) (§09)

AI_2 built 12 Oct (Act › AI runs, `features/ai/before-you-run.tsx`; backend `app/services/run_plan.py`, `POST /investigations/{id}/assistant/plan`, `GET/PUT …/assistant/profile`, migration `c7d1f3a8e520`). AI_1 built 18 Oct (`features/ai/watch-the-run.tsx`, ADR-0012; `tests/test-watch-the-run.test.tsx`).
- [x] Run events table + SSE stream (ADR); events emitted at each step of run_reasoning_module
- [x] AI_1 (matched to the mockup 18 Oct; what the run record doesn't hold stays out, see `docs/handoff/01_STATE.md`): input → router → app checks → RAS/TAS/QAS/LAS/DAS → output map with travelling lights, verdict shapes, umbrella and support bands, transport strip with lanes and ledgers, trace drawer (input / steps / output / ledger; Accept · Reject with reason · To check · Copy cite)
- [x] AI_2: operating instructions in plain words, suite name in the tooltip (tier floor D with C hatched "never counts", problems to list, devil's advocate = the suite's /devils-advocate pass, research depth, reasoning chain, live events, outside lookups, take as given = USER_STIPULATED premises in the prompt, overlays greyed PLANNED); changed rows and the steps they add edged amber, hover a setting to light its step; the plan from the server (packet counts, numbered steps with APP / MODEL / YOU); likely-to-run systems by the suite's trigger table; instructions found inside the evidence flagged and echoed; what leaves this computer with the three boxes, model, size in words, time from past runs, money, limits; echo log sent with the run and stored on it; cannot-be-turned-off list; Run and watch ⌘↵ / in the background; Save as this case's default asks for a reason; safety limits refused with 400
- [ ] AI_2 still to do: the "More" row (umbrella session flags have no runtime in the app), Edit plan beyond the question, the same panel as a drawer inside the live view. Steps 3–4 now show AI_1 (the Watch step has the mockup's one-line header; the stepper stays on Ask and Plan)
- [ ] "Ask the case" four-step entry; per-claim review of AI candidates with grounded/guessed underlines (AI_1's drawer has To check per thought, 18 Oct)

## 9. Knowledge and safety — mockups KNOWLEDGE_KEEP_1 (catalogue) and _2 (Safety & data) (§10)

Both **missing**.
- [x] Catalogue map of 42 areas in six families, area card, indicator list with how-checked glyphs and counts, indicator page (ladder, could be innocent / signs side by side, checked by, sources, case), Map / Table / Cards (built 19 Oct at /learn: `features/knowledge/`, `GET /api/catalogue/map`, `/indicators`; the six families are the mockup's grouping, still waiting on Ony, research Part 6 Q2). Still to do: Practise (scheduled flip cards: needs a review store, an open question for Ony); Cards is browse-only
- [x] Glossary: every term (not the first 200), every area's definition, hover cards that are reachable, dwell, Esc (built 19 Oct: Learn › Glossary, `features/glossary/`; every area's own wording in a tab, "No definition yet" where an area has none; the wording itself stays Ony's)
- [ ] Safety & data: what lives where (stores and services with modes and what is sent), totals with zeroes, period switch; Backup / Who can reach it / Housekeeping / Delete this case cards; Your safety panel (built last); outbound log, word for word
- [ ] Encrypted backups (ADR); delete by typing the case name
- [x] Last backup kept (19 Oct: `investigations.last_backup` {at, bytes, sha256, documents_included}, written when a backup is made from the app or the operator console; "Last backup 3 days ago · 1.4 GB · ✓ checksum" in the backup panel, the time beside Settings › Backups). The Safety & data page itself is still to build

## 10. Website — mockups SITE_1 (home) and SITE_2 (About Ony) (§11)

**missing** — waits on Ony's name, licence, photos and safety sentences. Static site in a new repo (ADR).

---

## Order of work from here
1. Suite gaps (§1) — approved first.
2. Case home to HOME_1 (§2) and the frame/Appearance items in §3 that HOME_1 shows.
3. Bring in: The Drop and the reading room (§4).
4. See: SEE_1 parts into The Wire, then Money (SEE_2) (§5).
5. Check: Decide fixes, Chain of Custody (§6).
6. Act: Red Flags to ACT_1, then story tree and write-up (§7).
7. AI run view (§8), Knowledge and safety (§9), Rain Noir effects (§3), website (§10).
Each item lands with tests, a screenshot check in Chromium, and a line in BACKLOG.md.
