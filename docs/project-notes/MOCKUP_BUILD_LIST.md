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
| The Wire (See prototype) | **built** 12 Oct | Whole case / around a party / one link, lens, follow the money, time strip. Remaining: label links with sentences and certainty line styles from SEE_1 (see §5). Not yet run on 1MDB (downloads blocked in the cloud). |
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

Today: **partial**. Built: question, standing strip, Next up card with three keys and undo, Bring in /
Check / See / Act modules, Since strip, year rail, Pointing-at bar.
To finish:
- [x] Top band (12 Oct; the top edge, still hidden until called): breadcrumb "Cases › case › Home"; **Switch case ⌘O** button (not a dropdown); centred ⌘K bar; bell with count; settings; **Hide screen**
- [ ] Next up: the page thumbnail with the highlighted region and "View full page"; locator line in mono ("Minutes of the board · p. 4 · lines 18–21 · scanned, OCR"); "4 of 7 · scroll" with dots; the reason line ("From the Textbook Red Flag …"); no empty area for kinds without a passage
- [x] Bring in module (12 Oct: real page progress from the reader; "what it proposed so far" still to do — proposals are made at the end of a read): the document being read now with real progress ("Reading with OCR · page 6 of 11"), what it proposed so far, rows with Read → / Review → / See →, a permanent drop target
- [x] Check module (12 Oct): "2 of 22 · scroll", segmented status bar, disputed / not-yet-shown claim cards with their source line
- [x] Act · Red Flags module (12 Oct: "lights 2018" from the flag's dated links): level-chip cards with parties joined by arrows, "lights 2017", the could-be-innocent box, faint flags on one row, "1 of 3 · scroll"
- [x] See module (12 Oct): mini network with edge labels (year, ✓/×), shapes per kind (house for property), legend, "31 parties · 46 links"
- [x] Since strip (12 Oct): four count tiles with the actor (AI tile tagged AI)
- [x] Year rail (12 Oct): events and flags per year, flagged years marked; pointing at a party lights its years
- [x] Pointing at (12 Oct): party chip + "lights 2017–18 everywhere" + Clear
- [ ] Scroll-over rule in every module (wheel moves inside after a pause, releases at the ends)

## 3. App frame and Appearance — mockup HOME_2 (§04.2–4.11)

Today: **partial**. Built: five themes as tokens, Appearance with try-then-keep, effects full/light/off,
edge-hidden frame, ⌘K palette, breadcrumb.
To finish:
- [ ] Appearance: specimen cards drawn in their own theme with six status chips and the lowest contrast pair; **live before/after divider of the real Case home** (react-compare-slider is installed); the four facts under it (contrast, calm zones, fonts, cost); effects as named switches (bokeh, rain pane, grain, iris, shutter corners, neon); Format thumbnails (Board, Editorial, Desk, Story)
- [ ] Settings regrouped: You / Cases / This computer, each row showing its current value; settings search
- [ ] Edge rules: dwell ~250 ms, visible 5 px handles labelled on first use, Alt+arrows, pin per device; trail of the last five places on the left edge
- [ ] Notifications inbox (Needs you / Everything else, snooze)
- [ ] New-case setup (name + question, "what kind of case", "what do you have so far")
- [ ] Cases shelf (⌘O) with per-case place memory
- [ ] Rain Noir effects port (ADR first): bokeh field, rain pane on the case-home hero, iris on feature open, shutter corners on save

## 4. Bring in — mockups INTAKE_1 (The Drop) and INTAKE_2 (reading room) (§05)

Today: **partial** (old Documents panel; readers built, incl. .eml/.mbox/.zip/.xlsx).
INTAKE_1 The Drop:
- [ ] Drop field (files, folders, links, pasted text) that shrinks to a strip once files arrive; This drop card (counts, OCR language, "nothing leaves this computer")
- [ ] **Digestion line**: one lane per file, seven stage boxes (Received → Checked → Read → Split into passages → Files inside → Names & facts → Ready for you), live detail ("12/48", "OCR"), stopped / waiting / needs-you states, containers collapsed ("18 of 23 read · Show all"), totals row; Problems & in progress filter (F)
- [ ] Read receipt card (fingerprint, pages, how read, passages, proposals, watchlist hits, flag it fed; Open in reading room · Trace)
- [ ] Ready for you (63 proposals by kind) and Problems first list; bottom filmstrip "1 / 34"
- [ ] Library and History tabs; per-file event stream (SSE) instead of three pollers; Stop reading
INTAKE_2 Reading room:
- [ ] Page strip with proposal marks; calm serif text 40–60 ch/line; tabs Text / Original / Translation / Details; find in document
- [ ] Selection bar: Evidence E · Claim C · Name N · To check X · Tag T
- [ ] Margin of proposal cards linked to their spans by leader lines; "Is this already in the case?" inline; questions with number keys; Why?
- [ ] Evidence clip card (quote + 32 chars either side, SHA, anchor) — self-checking quotes
- [ ] Footer keys and counts (accepted / rejected / waiting), Document n of N
Also from the backlog: watchlist highlights redesign; Sources & evidence as a browsable list of all sources and evidence; .mbox children titled properly; audio/video intake; web links fetched; manual entity/event forms.

## 5. See — mockups SEE_1 (network) and SEE_2 (money) (§07), plus Timeline and Places

SEE_1 "Who controls Kestrel SA": The Wire is now See's map; SEE_1's parts go into it.
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
