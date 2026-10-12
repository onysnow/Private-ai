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
- [ ] "+ Make your own" theme (shown, marked Not built yet): start from a theme, change colours, each checked for contrast before saving
- [x] Edge rules (12 Oct; Alt → / ← for the left edge, Alt ↓ / ↑ for the top): dwell ~250 ms, visible 5 px handles labelled on first use, Alt+arrows, pin per device; trail of the last five places on the left edge
- [x] Notifications inbox (12 Oct; snooze is per computer, a day or a week) (Needs you / Everything else, snooze)
- [x] New-case setup (12 Oct; also from the case switcher) (name + question, "what kind of case", "what do you have so far")
- [x] Cases shelf (⌘O) (12 Oct: the switcher, each case's last place) with per-case place memory
- [x] Rain Noir effects from the OnySnow Studios site (12 Oct; ADR-0009): BokehField, the 8-blade iris on opening the reading room, shutter corners on saving evidence, steady neon on an opened Textbook flag (off by default), each with its switch
- [x] The whole OnySnow Studios effect system brought in (12 Oct, Ony: "import the entire effect system for now"): `frontend/vendor/onysnow-effects` (engine, light, optics, water, materials, camera, every effect component, stylesheet, docs, research, tools; its 79 test files pass); the bokeh, iris and neon are now its own components
- [x] Rain pane (12 Oct): the system's Pane and WaterDrops on the case-home title band, over the reporter's own photograph (Settings › Appearance, kept in this browser only; research innovation 1); rain stays under the words; Rain Noir + Effects Full + Rain switch + WebGL only; dry under Light, Calm, reduced motion and in the Appearance preview
- [ ] Frosted glass panels with the system's Glass/GlassLight (research: "frosted panels (blur 30 px, saturate 150%) over the BokehField"; GlassLight cost grows per pane)
- [ ] Rain under Calm motion: the research's still "after the rain" frame (now: no rain)

## 4. Bring in — mockups INTAKE_1 (The Drop) and INTAKE_2 (reading room) (§05)

Today: **partial** (old Documents panel; readers built, incl. .eml/.mbox/.zip/.xlsx).
INTAKE_1 The Drop:
- [x] (12 Oct; links still to do — they need web capture) Drop field (files, folders, links, pasted text) that shrinks to a strip once files arrive; This drop card (counts, OCR language, "nothing leaves this computer")
- [x] (12 Oct; polls every 2 s while reading, no per-file stream yet) **Digestion line**: one lane per file, seven stage boxes (Received → Checked → Read → Split into passages → Files inside → Names & facts → Ready for you), live detail ("12/48", "OCR"), stopped / waiting / needs-you states, containers collapsed ("18 of 23 read · Show all"), totals row; Problems & in progress filter (F)
- [x] (12 Oct) Read receipt card (fingerprint, pages, how read, passages, proposals, watchlist hits, flag it fed; Open in reading room · Trace)
- [x] (12 Oct; problems sort first; no filmstrip yet) Ready for you (63 proposals by kind) and Problems first list; bottom filmstrip "1 / 34"
- [ ] Library and History tabs; per-file event stream (SSE) instead of three pollers; Stop reading — 12 Oct: Stop reading done (stops at the next page, keeps nothing half-read); the old Documents panel is the Library tab; History and the event stream still to do
- [x] Checked against the INTAKE_1 picture (12 Oct, later): three columns (drop field, This drop, read receipt with page thumbnail and READ CLEANLY chip, What happens next · the line · Ready for you with the big number, problems first, Open the reading room, keys); tabs Digestion line / Library n / History (History not built); "● Reading · n files"; each lane with its line under the name, compact boxes ("✓ 214"), a Waiting column (n PROPOSED, Try again, Open that one); an e-mail's files beneath it, archives over 5 folded "18 of 23 read · Show all"; totals with bars; legend and who proposed; filmstrip "1 / n". From the research (§2–3): over 40 files the line starts on problems and folds clean files.
- [ ] Still from the research for The Drop: "Keep a second copy" on a duplicate at upload; "No progress for 6 min" on a stalled stage; the line as a keyboard grid (role="grid", arrows); links in the drop field (needs web capture)
INTAKE_2 Reading room:
- [x] (12 Oct) Page strip with proposal marks; calm serif text 40–60 ch/line; tabs Text / Original / Translation / Details; find in document
- [x] (12 Oct; To check makes a lead, Tag tags the document) Selection bar: Evidence E · Claim C · Name N · To check X · Tag T
- [x] (12 Oct; "already in the case" still to do on the card) Margin of proposal cards linked to their spans by leader lines; "Is this already in the case?" inline; questions with number keys; Why?
- [x] (12 Oct) Evidence clip card (quote + 32 chars either side, SHA, anchor) — self-checking quotes
- [x] (12 Oct) Footer keys and counts (accepted / rejected / waiting), Document n of N
- [x] Checked against the INTAKE_2 picture (12 Oct, later): breadcrumb, tabs, find (⌘F) and "Document n of N" in the top band; a strip of drawn pages with a mark per waiting proposal and "n pages · n waiting · n unanchored"; one page at a time with chips (Page n of N, how it was read), the title and ¶ numbers, marks as dashed underlines with no fill (research §6 calm zone); the selection bar at the selection; the margin headed "Page n · proposals · clips" with All / Questions only; the evidence clip there with its page drawn; each card with PROPOSED, confidence dots and word, who proposed it and "p.3 ¶2", its question inside ("What is …? The text does not say" 1–4, "Is this already in the case?" Same as this / A new record, "Whose is it?" with "Accept … first, then link"), Accept A disabled until answered, Reject R, Edit (names), Why ›; a leader line to the words; each decision held 6 s with Undo (U); footer keys and counts, Next ›.
- [ ] Still from the research for the reading room: "What changes if I accept" preview; "Answer once, apply to the batch"; revision rate per proposer on the read receipt; language chip (the reader does not record the language yet); OCR quality per page
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
SEE_2 "Where did the money go" (fixes the dead Money link and $6.87B tile):
- [ ] Currency tabs, Columns / Flow / Ledger switch, "Traced so far" running total
- [ ] Comes from → passes through → goes to columns; missing money drawn hatched with its arithmetic
- [ ] Integrity checks panel: grey hole, miracle, black hole, round trip (with "none found"), each with could-be-innocent and Make a lead / Add to To check
- [ ] Ledger strip with the €10,000 line and structuring brackets from Red Flags; ledger table with status chips and sources
Timeline and Places: **no mockup in the 16 screens** — the canvas frames 4–13 exist; per Ony's rule, mockups first (backlog items: unreadable axis, raw property names, invented days; base map shipped with the app; dated place events and precision).

## 6. Check — mockups CHECK_1 (Decide) and CHECK_2 (Chain of Custody) (§06)

CHECK_1 Decide: **partial** (queue, evidence pane, card, keys, undo built).
- [ ] Queue filters work past the first 200 (backlog P1); grouped by source with "pages read"
- [ ] "What happens" preview per kind; reason chips under No; Last 10 strip; bulk "Accept all 38 high"
- [ ] Sort by what it unlocks; "Open the document" opens the reader, not Search
CHECK_2 Chain of Custody: **missing** (old drawer).
- [ ] Whole-screen chain: Files → Reading → Passage → Decision → The claim as wired cards with check glyphs (✓ hash, ✓ says it, OCR %)
- [ ] Wire styles (confirmed / proposed / worked out / against / AI step) and the key
- [ ] Custody log (who held it, what was done, when) with export for an editor or lawyer
- [ ] Detail panel: source / file / content checks, anchor, SHA re-check, "What if this breaks?"
- [ ] Claim card with the Done checklist for Supported (server-enforced rules)

## 7. Act — mockups ACT_1 (Red Flags) and ACT_2 (story tree + write-up) (§08)

ACT_1 Red Flags: **partial** (board with list and detail on one screen).
- [ ] Top bar: type line with "why?", coverage ("5 of 7 record rules ran · 2 need data · 2,875 more need a lookup or a person"), level filter chips with counts, Set aside / No longer fire / Area / Party / New since, "6 of 8 flags · Reset"
- [ ] Ranked list by level then weight (fix the rank bug); "rests on 1 unshown link" mark; new dot
- [ ] Open flag: summary with values, the pattern picture (payments chart with the $10,000 line), **level ladder** (met / not set / needs n facts)
- [ ] Before you call it: innocent explanations as a checklist (ruled out / could apply), records can't show, sources
- [ ] Parties carrying flags rings; actions Add to leads / Set aside with a reason / Show in money flows; reading never writes (split GET / POST run)
ACT_2 Story: **missing**.
- [ ] Thesis diamond → sections → claims → evidence tree; branch styles by weakest child; critical path
- [ ] Gates (every sentence has a source, innocent explanations, single-source marked, right of reply, legal read)
- [ ] Write-up editor (TipTap, ADR) with citation chips, AI-draft marks, sentence status underlines, Cited / Notes tabs, Export for publication disabled with its reason
- [ ] Leads as Now / Next / Later; Export sheet; evidence pack

## 8. The AI — mockups AI_1 (Watch the run) and AI_2 (Before you run) (§09)

Both **missing**.
- [ ] Run events table + SSE stream (ADR); events emitted at each step of run_reasoning_module
- [ ] AI_1: input → router → app checks → RAS/TAS/QAS/LAS/DAS → output map with travelling lights, verdict shapes, umbrella and support bands, transport strip with lanes and ledgers, trace drawer (input / steps / output / ledger; Accept · Reject with reason · To check · Copy cite)
- [ ] AI_2: operating instructions in plain words (tier floor D, problems to list, devil's advocate, research depth, reasoning chain, live events, outside lookups, take as given, overlays planned), the editable plan, likely-to-run systems, injection notice, where it runs / what leaves / cost, echo log, cannot-be-turned-off list
- [ ] "Ask the case" four-step entry; per-claim review of AI candidates with grounded/guessed underlines

## 9. Knowledge and safety — mockups KNOWLEDGE_KEEP_1 (catalogue) and _2 (Safety & data) (§10)

Both **missing**.
- [ ] Catalogue map of 42 areas in six families, area card, indicator list with how-checked glyphs and counts, indicator page (ladder, could be innocent / signs side by side, checked by, sources, case), Map / Table / Cards, Practise (flip cards)
- [ ] Glossary: every term (not the first 200), every area's definition, hover cards that are reachable, dwell, Esc
- [ ] Safety & data: what lives where (stores and services with modes and what is sent), totals with zeroes, period switch; Backup / Who can reach it / Housekeeping / Delete this case cards; Your safety panel (built last); outbound log, word for word
- [ ] Encrypted backups (ADR); delete by typing the case name

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
