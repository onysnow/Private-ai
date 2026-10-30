# Decisions made without waiting (for Ony to read)

Ony, 29 Oct 2026: "for decisions make them based on what's best for the application. Then just tell me later. Quit
waiting on me." Each entry: the question, the call, why, and where it is built. Change any of them by saying so.

## 1. A court filing's allegations are not a primary official record (29 Oct)

- **Question:** the Vekselberg forfeiture complaint is filed as a public record, and the Done rules let one public
  record confirm a claim alone, so every sentence a prosecutor alleges came out "meets every rule for Confirmed".
- **Call:** in the demos, a document published by the authority that took the action, or an admission (the OFAC
  notice, a regulator's order, a plea), is suite Tier A; a complaint, indictment or affidavit is Tier B, TAS's "direct
  testimony, subject to corroboration". An allegation alone can make a claim Supported, never Confirmed; a second,
  independent source or a Tier A record is needed.
- **Why:** the app must not tell a reporter that an allegation is confirmed. The tier is the suite's own vocabulary,
  so the Done rules need no special case; a person can still change any source's tier.
- **Where:** `demo_cases.py`, `demo_1mdb.py` (source_tier from each document's `admitted`). Demos loaded before this
  keep their old tiers until loaded again.

## 2. Check a pack: which packs, where it lives (29 Oct)

- **Questions (CHECK_4 README):** check packs made by someone else's Workbench too? Where does it live?
- **Call:** any pack with a MANIFEST.sha256 can be checked. A pack made in this case is compared with the list kept
  here when it was made (a new `evidence_packs` row per pack, found by the pack id inside it), so a list someone
  redid after changing a file is caught; any other pack is compared with its own list, and the screen says that this
  shows only that it is whole. It lives in Check › Check a pack, with a link from the Export sheet's Evidence pack.
  A changed exhibit picture is drawn again from the case's own file and the band that differs is marked, only when
  the redrawing gives exactly the bytes listed.
- **Why:** the check is only worth something if it cannot be fooled by a new manifest; refusing other packs would
  throw away a useful check of wholeness.
- **Where:** `app/models/evidence_pack.py`, `app/services/pack_check.py`, `POST /investigations/{id}/evidence-pack/check`,
  `features/pack-check/check-a-pack.tsx`.

## 3. Evidence pack as PDF, and signing it (29 Oct)

- **Questions (ADR-0024, research §11):** which PDF renderer? Should packs be signed, with what key, and who keeps it?
- **Call:** PDFs are printed by the headless Chromium the app already ships for web capture, with scripts off and
  every request refused (no new package). The pack holds `evidence-pack.pdf` (the write-up, then each exhibit on its
  own page with its picture), and the Export sheet's "Write-up for reading" now prints the write-up alone. Packs are
  signed: one Ed25519 key per computer, made with the first pack and kept in the local profile (protected at rest by
  the disk's encryption, ADR-0016), never in a case backup. The pack carries `MANIFEST.sha256.sig` and
  `PUBLIC_KEY.pem`; VERIFY.txt gives the stock OpenSSL command; Keep › Safety & data shows the key's fingerprint to
  give out; Check a pack says whether a signature is valid, whose key it is, and whether it is the key the pack was
  made with.
- **Why:** a signature makes "the pack is whole" into "the pack is whole and came from this computer", which is what
  a lawyer asks; a per-computer key needs no setup from the reporter, and a standard Ed25519 signature can be checked
  without the app. Wrapping the key with the app-lock passphrase would mean asking for it on every pack.
- **Where:** `app/services/print_pdf.py`, `pack_signing.py`, `evidence_pack.py`, `pack_check.py`; migration
  `a1c5e9f3d207`.

## 4. Add by hand: one sheet, a source required, where it opens (29 Oct)

- **Questions (ENTRY_1 README):** one sheet with three kinds, or three forms? Allow "I know it, no source yet"? Where
  does it open from?
- **Call:** one sheet with A party / A link / An event, each written as a sentence with blanks. Where it comes from is
  required: a passage (the words must be found in the document as it was read), a source with no file (kept as a
  Source and its note), or no source yet, which is allowed but opens a lead "Find a source for …" and has no evidence,
  so it never counts toward Supported. It lives in See › Add by hand, so ⌘K finds it as "See › Add by hand". Before
  anything is written: the dry run of the Red Flag rules for a link, what the case already holds under that name or
  between those parties, and what waits in Decide. Everything that could refuse the entry is checked before anything
  is written, so a refusal leaves nothing half made.
- **Why:** reporters do know things no document says (a call, a register seen in person), and a blocked form would push
  them to work outside the app; marking it Not yet shown with a lead keeps the rule that nothing unsourced is
  Supported. A link's dry run is the same rules as Decide's "by what it unlocks".
- **Where:** `app/services/manual_entry.py`, `/investigations/{id}/by-hand` (+ `/preview`, `/suggest`),
  `features/by-hand/add-by-hand.tsx`.

## 5. Does it work today?: off by default, shipped test items, under Following (29 Oct)

- **Questions (WORKS_1 README):** on by default? Who picks the test items? Where does it live?
- **Call:** off by default, turned on with one switch ("Check once a day"); "Check all now" and "Try it now" work any
  time. Ten platforms ship with a public test item each (an official account or a long-lived post), and a person can
  change any of them and go back. It lives in Bring in › Following › Works today. A pasted link on a platform that was
  broken or partly working at its last check is warned about in The Drop, from the app's own last check (nothing is
  asked of the platform then); the warning can be turned off. Each try uses the tool a real save uses (yt-dlp without
  downloading, the capture browser, the open-protocol reader), through the same guard, and goes in the outbound log.
- **Why:** ten requests a day from the reporter's own address to platforms is exactly what this app avoids doing
  unasked; a reporter who relies on saving from them turns it on in one click. Shipped items mean it works with no setup.
- **Where:** `app/services/platform_checks.py`, `platform_checks` table, `/platform-checks` routes, the daily task in
  `app/jobs/schedule.py`, `features/following/works-today.tsx`, the warning in `features/the-drop/captures.tsx`.

## 6. Timeline and Places: the eleven open questions (29 Oct)

- **Questions (time-and-place-mockups README):** which view opens; keep all seven views; out-of-order as a lead on its
  own; lanes by source too; how to build Stack; geocoding; places off the map; GPS in photos; Money row and flags on by
  default; Board Rich or Clean, movable cards; Replay stops; a built timeline per person or shared.
- **Calls:**
  1. Lanes opens every case; it is the working view. Curve folds into Lanes' year zoom, Slider into Replay. Kept:
     Lanes, Stack, Build your own, Replay, Periods, Board.
  2. An out-of-order pair is said (banner, arrow, "no award recorded"), never a lead on its own: Make a lead is a button.
  3. Lanes by party, kind, source and how sure: all four.
  4. Stack in plain CSS 3D, no library: five cards a layer and "+n more".
  5. No geocoding: nothing is looked up, and the key says so.
  6. Places off the map are edge markers with their direction and distance.
  7. GPS in a photo's own metadata becomes a proposed place in Decide, never a place by itself.
  8. Money row and flag brackets on by default, each with its key (M, F).
  9. Board Rich by default, Clean one switch away; cards can be moved and the string follows.
  10. Replay stops at each unresolved event, with a switch to play straight through.
  11. A built timeline is per person; it can be made a deck's outline later.
- **Also decided while building Lanes:** one mark per event (shown ✓, not yet ?, disputed !, worked out ƒ) from the
  grade, the claim, the date's status and the source's tier (a Tier A source shows it, as in call 1 above); the source
  dates switch is gone: a document's own date waits in "Not on the timeline yet" to be placed, since it says when the
  document was made, not what happened; a case with more than seven parties shows its busiest seven lanes and "+n
  more"; a record more than ten years before the rest is a stub at the left ("‹ 1957 · 1 earlier"); the sequence rules
  are two (a public contract: tender → bid → award → contract → payment, from the Open Contracting Data Standard's
  stages; a company's life: formed → director → payment) and only a needed step that is missing is said, and only when
  the scene is set (an earlier step is recorded, or the step itself only later); two dates that overlap are never
  said to be out of order.
- **Places, decided while building:** the map is drawn by the app from the records' own coordinates (a projection
  that keeps a kilometre the same length both ways), so it works with no base map and shows rings, paths and edge
  markers; the self-hosted base map stays one switch away ("On the base map") when installed. A place is "read from a
  document" when its coordinates came from a document or a source, "approximate" when its record says a town or wider,
  else "not yet shown". An address or a property with no coordinates, a post box, and 0, 0 (a camera with no fix) are
  listed under Can't be placed with why. A place more than five times the typical distance from the others (and over
  50 km) is an edge marker. A photo's GPS is proposed in Decide as an Address, with a note that it is the file's own
  claim.
- **Why:** the research (§2.9) names Lanes the working view and the checker the innovation; a lead made by the app
  alone would fill the queue with what the reporter has not looked at. Everything else follows the drawn mockups.
- **Where:** `app/services/timeline_lanes.py`, `app/services/sequence_rules.py`, `timeline_periods` table,
  `/investigations/{id}/timeline/lanes` and `/timeline/periods`, `features/timeline/lanes.tsx`, `lane-detail.tsx`,
  `lanes-model.ts`.

## 7. Media tools: the nine open questions (29 Oct)

- **Questions (media-mockups README):** faces; GPS as a place; a name; model downloads; C2PA on exports; cleaning up
  derived files; a reason for each redaction; signing PDFs; PdfCraft's OCR.
- **Calls:**
  1. Faces: a detector only finds boxes; nothing names or matches a face, and there is no "same person" grouping.
     "Blur faces for export" is offered first on a photo with faces, and a shared copy blurs them unless a person
     unticks it; the original is never touched.
  2. GPS in a photo becomes a place proposed in Decide (built with Places).
  3. No name: the tools sit on each file's own page (a photo's Picture, a recording's Listen, a PDF's Redact).
  4. Each model is fetched the first time it is needed, saying its size first, pinned to its SHA-256 and written to
     the outbound log; nothing is fetched at first run. (The voices models keep their setup command as well.)
  5. No C2PA for now: it needs a signing certificate the app does not have. A copy's edit trail is exported as a
     custody manifest beside it, and evidence packs are signed (entry 3).
  6. Derived files are never deleted automatically. A person can delete a copy that nothing uses; the original stays.
  7. A redaction needs a reason, kept in the trail ("phone number of a private person").
  8. No signing inside PDFs for now (it needs a certificate); a pack's signature covers what is sent.
  9. PdfCraft's OCR stays off until tried on a real computer; the app's own OCR reads PDFs as now.
- **Why:** each call keeps the original untouchable and keeps the machine to proposals, as the research asks
  (media research §4.5, §6), and adds nothing that would make the app send or sign on a person's behalf unasked.

## 8. Building the three media screens: what differs from the mockups (29 Oct)

- **Questions:** details the mockups MEDIA_1–3 left open or drew in a way the app cannot do honestly.
- **Calls:**
  1. MEDIA_3 has no Sign tab: entry 7, call 8 keeps signing out of PDFs for now, and a tab that only says "not yet"
     is an inert control. It comes back with a signing key.
  2. Redact is a button in a PDF's reading room ("Redact", named "Redact before sharing"), not a screen of its own; it
     returns to the reading room. Same as a photo's Picture and a recording's Listen (entry 7, call 3).
  3. Proposed boxes: phone numbers and email addresses found by pattern, and people already named in the case (a
     Person record) found in the text. Nothing guesses who is a public official: the mockup's "a councillor in public
     office: usually kept" needs a record the app does not have, so a name says only "a person named in this case".
  4. Accepting a proposal asks for its reason in a popover beside the box, with four common reasons to pick (source
     protection, a private person, personal contact details, not in the story) or one's own words. The same words on the
     same page are accepted together ("Hendry" × 2).
  5. The trail keeps each box's page, place, kind and reason, never the words that were under it: the copy's trail
     row must not leak what the copy removes.
  6. "Hash checked" in the mockup's header is shown as "kept as uploaded · SHA-256 …": the screen does not re-hash the
     file on opening, so it does not say it did.
  7. The new file is named `<name>-redacted-for-<editor|lawyer|publication>-<day>.pdf` (the mockup's spaces and dots
     are not kept in stored file names).
  8. PDF/A is a tick in "Also remove from the copy"; the Archive tab lists the rules the original breaks and says how
     many a PDF/A copy would still break (fonts that are not embedded cannot be fixed here).
  9. MEDIA_2: the sync's strength is said in words from FilmCraft's own numbers (peak over the background, and over the
     next best match), not as a percentage, which those numbers are not.
- **Found in PdfCraft (for Ony, onysnow/pdfcraft):** `doc_remove_hidden` asked to remove a category the file does not
  hold fails with "there are no redaction marks to apply", a message from another tool. The app now asks only for
  categories the file holds.

## 9. Your safety: built without the SA levels (29 Oct)

- **Question:** the panel (research §13) waited on Ony setting Faint and Strong for the 42 safety indicators
  (`catalogue/indicators/sa.yaml`, every one "To be set by Ony").
- **Calls:**
  1. No level is made up. A sign from the records shows "level not set", as the research drew for this state; the
     catalogue's levels are sourced research, and an unsourced number would read as one.
  2. Signs from the records, read here with nothing sent: SA-007, SA-008 and SA-009 from the case's open Red Flags in
     organised crime, corruption and environmental crime, and SA-008 also from parties with the PEP topic; SA-033 from
     photos whose files say where, with what or by whom they were taken (with a pointer to the photo's Remove
     metadata copy). The other record-checkable signs need lookups (CPJ, RSF, court records) the app does not make.
  3. Only you can say: direct threats (SA-013), being followed (SA-014), pressure on family (SA-015), doxxing
     (SA-018), Yes / No / Not sure. A Yes meets that indicator's published definition as worded, its Textbook, and is
     the only thing that raises the notice (in the panel and one slim line on Case home). It never blocks work.
  4. The answers and the safety plan stay in the browser (localStorage): never sent to the server, not in backups, not
     shared with a team, as the research asks. Clearing the browser's data clears them; the panel says where they are.
  5. Guides open only after a line saying which site they open, and nothing from the case goes with them. Their
     addresses are ones the catalogue already checked (Rory Peck Trust, Freedom of the Press Foundation, CPJ).
  6. No inbox kind `safety` yet: nothing fires on the server, so there is nothing to notify.

## 10. The monitor list "encrypted at rest" (29 Oct)

- **Question:** ADR-0022 left encrypting the monitor list at rest for later (source intake research: who you follow
  says what the story is about).
- **Call:** not encrypted inside the app. ADR-0016 already decided that the databases are protected at rest by the
  disk's encryption, which the app reports, and that backups are sealed once a passphrase is set. Encrypting the list
  with the passphrase would stop Following from checking sources whenever the app is locked or restarted, which is
  when it most needs to run. Instead, Following says under the list what protects it now: whether the disk is
  encrypted, and whether backups are.
- **Why:** the protection the research asks for exists (disk encryption, sealed backups); a second key on one table
  would add a way for the watcher to stop silently and protect nothing the disk does not.

## 11. Newsletters through a mailbox (29 Oct)

- **Question:** the source intake research puts newsletters "via a dedicated mailbox into the `.eml` path"; ADR-0022
  left it unbuilt.
- **Calls:**
  1. A mailbox is followed one sender at a time (an address, or @domain for everything from it): each is its own
     source in Following, with its own queue, so a case follows what it needs and not the whole mailbox.
  2. IMAP over TLS only (port 993, the system's certificate checks), with Python's own `imaplib`: no new package.
     Messages are fetched with `BODY.PEEK[]`, so nothing is marked read, and the mailbox is opened read-only.
  3. The password is kept in its own file beside the connector keys (owner-only), never in the database or a backup,
     and removed when the mailbox is unfollowed. An app password is suggested where the provider offers one.
  4. A new message is kept as it came (.eml) outside the case until a person captures it; then it becomes a document
     and goes through the ordinary email reader, which reads text and never loads remote images. Unfollowing deletes
     the kept messages nobody captured.
  5. No Tor route for mail: the reporter's mail server already knows the account; the form asks for a mailbox kept for
     newsletters, never their own.
  6. Each check is a line in the outbound log, saying the server and the sender asked about.

## 12. UI simplification: the sixteen questions (29 Oct)

- **Questions:** `docs/research/ui-simplification/UI_SIMPLIFICATION_RESEARCH.md` §8.
- **Calls:**
  1. Words: **Less / Usual / Everything**. The Media Suite's "Detail: Full / Calm" is not used in the app; "Calm
     motion" stays the motion setting's name, so no two settings share a word.
  2. One level for the whole app, kept on this computer, plus a per-fold memory ("always show this").
  3. Default **Usual** for everyone; the tutorial case opens at Less and says where Usual begins.
  4. Offers: yes, never applied by the app, at most once a session, with Don't ask again.
  5. A Textbook safety notice sits at the top of the case at every level: it is part of the floor (entry 9).
  6. Spines replace the section tab strip on stage pages once they exist (the strip stays until then).
  7. Editorial, Desk and Story stay about how things look; how much shows is the level alone.
  8. Bulk import moves to The Drop and "Stage relationship from a reviewed claim" to the claim, when the Library
     becomes List + slot.
  9. Every fold says "N folded · show": a fold that hides its count hides the floor.
  10. Learn opens filtered to what the app computes, the rest marked reference and checklist.
  11. First: the inspector slot and overlay rules (they remove windows everywhere), then the older heavy panels
      (Library, Claims, Connectors), then Case home and Decide, as the research's order of work.
  12. One inspector at a time with a trail; another row replaces what is open; Back and Esc step back.
  13. The old Relationships panel's add forms and grid move into the Wire's own slot; the Wire itself is unchanged.
  14. Case switcher, New case, Inbox and the shortcut list become modes of the command bar.
  15, 16. The Awwwards list and North Star's working panel need Ony (links, a login); the study continues from the
      public material until he sends them.

## 13. The deck editor: the five questions (29 Oct)

- **Questions:** `docs/design/deck-mockups/README.md`.
- **Calls:**
  1. A deck with a Draft slide is warned, not blocked, before Present: the bar names each slide and why, as drawn.
     Exporting it carries the Draft band on those slides.
  2. Export to PDF as well as .pptx, through the native module when DeckCraft's PDF export is in it; until then .pptx
     only, and the PDF button is not shown (no inert control).
  3. Keep Side by side (slidedoc and presenting): it is how a reporter checks that the slidedoc says what the talk
     says.
  4. Presenter and audience: one window first, with a key (S) to swap what it shows; a second screen is offered only
     where the browser's window-management permission is granted, never asked for at start.
  5. Keep "If they ask": it is folded to one line per source until the presenter opens it, so it does not compete
     with the notes.

## 14. Relationships folded into The Wire (29 Oct; Ony: "Continue", after entry 12, call 13)

- **Call:** See › Relationships is gone. Its list of every link, the reviewed-duplicate switch and each link's
  evidence and assessments are The Wire's "All links" panel (`features/the-wire/all-links.tsx`). Its add forms are not
  carried over: See › Add by hand adds a party or a link, payments included, and asks where it comes from, which the
  old forms did not. A request to open a relationship (a party's dossier, Claims) opens The Wire with All links.
- **Your tags came back as a layer** (Ony: "And yes"): the reporter's tags on parties are drawn on The Wire as a ring
  outside the dot (on a card, round its kind dot), one coloured arc per tag over a pale edge so the dark swatches read on
  the night background. On by default, as the old layer was; the "Your tags" button hides them, and the key lists each
  tag with how many parties carry it. Tags on links are not drawn (the old layer did not either).
  `features/relationship-graph/graph.tsx` is no longer mounted anywhere; its helpers stay in use.
- **Found on the way:** inside the Wire, the theme's filled buttons drew light text on amber (the Wire's buttons inherit
  colour); the links panel now gives them dark text.

## 15. Deck PDF without DeckCraft, and the style panel (29 Oct; revises entry 13, call 2)

- **Call:** a deck exports to PDF now, printed by the browser that already prints the write-up and the evidence pack
  (`app/services/print_pdf.py`, entry 3), not by waiting for DeckCraft in the native module. Entry 13 had held the PDF
  back for DeckCraft; the printer was already in the app, so waiting bought nothing.
  - **Two PDFs:** the slides (one 16:9 page a slide) and a handout (an A4 page a slide, its speaker notes under it).
    Both use the theme's light paper version, as DECK_1's style panel says; a slide citing a claim not yet shown keeps
    its Draft band; the sources are numbered as in the .pptx and listed on the last page.
  - **Charts:** the render service's SVG of the same checked drawing the .pptx uses, so nothing runs in the page while
    it prints; a chart that cannot be drawn says why in its place, as the .pptx does.
  - **Exports save first**, so the file is what is on screen.
- **Style panel:** Style opens the deck's themes in the right panel as DECK_1-state-style-open draws them (a card per
  theme with its colours, the fonts, and what a style never changes); the slide on screen takes the theme at once, and
  Save keeps it. The editor had drawn every deck in the default theme whatever it was saved with; it now draws the
  deck's own.

## 16. The inspector slot, first step (29 Oct; entry 12, calls 11 and 12)

- **Call:** one inspector slot at the right of every case page (`features/inspector/inspector-slot.tsx`, the store's
  `inspector` trail). A party's dossier and a record's Chain of Custody open there, where you are:
  - **Docked, not on top:** the page gives the slot its width, so it never covers the row or the map it came from.
  - **Replace or follow:** opening from the page replaces what is there; a link followed inside the slot (a dossier's
    "Trace relationship", another party) moves along a trail shown at the top.
  - **Back and Esc:** Back or Esc goes one step back; from the first step Esc closes the slot.
- **What it replaced:** "Open the dossier" used to carry you to Bring in, where the dossier sat inside the connectors
  panel, and Chain of Custody was a drawer over the page. Both now open in the slot; the connectors panel's "Open
  dossier" opens it there too.
- **Not yet moved into the slot:** the older Red Flags panel's detail drawer, the AI plan and "one thought" drawers, the
  Export sheet. The Wire's own drawer stays as approved. The rooms (Reading room, Watch the run) stay full screen.

## 17. Ony's hover rule on #116's screens, and the merge of PR #116 into PR #117 (29 Oct)
- **Question:** two branches built Following and edited the same screens; and #116's screens predate Ony's rule of
  29 Oct (sub-text on reveal, types as marks, statuses colour only).
- **Calls:**
  1. Following is #116's (ADR-0022): five other features (Check again later, quotes found again, outside witnesses,
     Does it work today?, the newsletter mailbox) are built on its tables. #117's review fixes are added to it (one
     claim per item, no direct capture of a Tor-followed source's item, no capture of an older page version).
  2. Where both branches changed a screen, the screen's features are #116's (the newer screen) and the hover rule is
     #117's (the newer change), applied on top. Every #116 screen is converted, The Wire excepted (Ony's own redesign).
  3. The timeline keeps its own fact marks (`?` not yet shown, `!` disputed) for now: its SVG lanes draw them and
     aligning them with the status grammar (colour by default, ○ ✕ with Status marks) means changing `FACT` in
     `features/timeline/lanes-model.ts`. To align next.
  4. Is it real?'s item kinds have their own marks (▣ picture, ¶ text, ♪ audio, ▶ video): the app has no shared set of
     source-type icons yet.

## 18. Places on a real map, fetched by the app itself (30 Oct 2026)

Ony: "The where and when did it happen has the weirdest map. Can we use a real map?" The grid the app drew from the
records' coordinates is gone. Places always shows the world map (Protomaps, OpenStreetMap data), in the dark style
under a dark theme. The backend downloads the map by itself the first time it starts without one
(`app/services/basemap_install.py`): the newest Protomaps daily build, zoom 0–6, about 45 MB, fetched by byte ranges
in under a minute, plus the style's fonts and symbols. The same public file goes to everyone, so nothing about a case is
sent, and each download is a line in the outbound log. Until it arrives, Places says "Getting the world map · 12 MB of
45 MB". `BASEMAP_AUTO=false` turns the download off for a computer that must never go online. Why not keep a separate
install step: the backlog already said the base map must come with the app, and the compose file's pinned build
(20261003) had been removed by Protomaps, so the install step no longer worked. A party's path is a line on the map,
and a place known only to its town has a soft area round its dot. "Can't be placed" is a small mark on the map's
corner that opens its list. The country count is left out when the records name no country, rather than saying
"0 countries".

Demo: Ony said the demo matters less while the rest of the app is unfinished, so it moves to the end of the list.

## 19. The 1MDB demo follows five sources, and never checks them by itself (30 Oct 2026)

Following was empty in the demo, so its screens could not be judged against FOLLOW_1 and WORKS_1. The 1MDB demo now
follows five sources with items already in the case (`app/services/demo_following.py`): the Justice Department's
press-release feed, Sarawak Report's news feed, the US v. Ng docket page (two versions), the WNYC Money Talking podcast,
and Sarawak Report on X (a closed platform, no monitor). Items written for the demo say so in their summary.
Calls:
- **No automatic checks for demo sources.** A demo must never contact a site on its own; the monitors have no next
  check, so a site is asked only when a person presses "Check now". It also keeps an address that does not answer
  (two were not confirmed) from turning "broken" while someone looks around.
- **No made-up "Works today" results.** Those rows are app-wide results of really trying each platform's save tool;
  seeding them would claim something works that was never tried. Works today says "not checked yet" and offers the
  first check.

## 20. The Story: a demo story, and an empty state that offers the case's claims (30 Oct 2026)

The Story was an empty form in the demo ("0 of 0 claims"), with 63 claims in the case. The 1MDB demo now has a story
(`app/services/demo_story.py`): the thesis "Billions raised for 1MDB were diverted through look-alike companies to Jho
Low, his partners and Malaysia's prime minister", three sections of existing claims (looked up by their text, never
invented), and a short write-up citing them. Calls:
- **Unplaced claims are grouped by the party their text names** (`stories.claims_about`): specific parties first; a
  party named in more than a quarter of the claims (the case's own subject, like 1MDB) only takes what is left;
  claims naming no party go under "Other claims". Each group offers "+ section", which makes it a section titled with
  the party's name and places its claims in one move.
- **The thesis stays the page title**, clamped to one line; the full sentence is in the diamond.
- **The demo write-up leaves one sentence without a source** on purpose, so the sources gate reads "1 sentence left" as
  a real draft would.
- **The thesis column sits at the top of the tree**, not centred, so the thesis and the gates are in the first view of
  a tall tree.
Not done: the evidence chips show long source titles cut short, not the mockup's short labels; that needs a short
label on sources, which the data does not have.

## 21. The demo deck, and the deck editor laid out like DECK_1 (30 Oct 2026)

The 1MDB demo now has one deck, made by the app's own "New deck from the story" (`app/services/demo_deck.py` calls
`deck_editor.new_deck(source="story")`; no slide is written by hand). Calls:
- The seeded deck takes the story's title ("Where 1MDB's money went"); the builder alone would use the whole thesis.
- The right panel says "Claims on this slide", not the mockup's "Figures on this slide": slides cite claims.
- The mockup's "Contrast passes" check is not shown: the backend has no such check.
- "Edit the words" is closed by default; the mockup shows no edit fields, and editing is one click away.
- Over-long lines are one check ("4 lines over 7 words") with one fix, "Move the rest of each to notes".
The builder puts each claim's full text on a bullet, so most section slides fail the 7-words check; that is the
builder's own output, left as it is.

## 22. Court filings' margin line numbers are not read as text (30 Oct 2026)

US court filings carry a column of line numbers 1–28 down the left margin. The reader already had a rule for such
runs, but it first dropped a top line matching the page number, which on page 1 is the margin's own "1", so the run
started at "2" and was missed: page 1 of every filing began with "2 3 4 … 25". Calls:
- Margin numbers are found by position (PyMuPDF word coordinates): a lone number 1–40, left of every other word and
  in the left 11% of the page, at least five on the page, increasing down it. The text-only run rule stays as the
  fallback, and the page-number line is looked for only after the margin is gone.
- OCR text goes through the same furniture stripping.
- No re-read of documents already read: their passages stay until they are read again. Saved quotes are re-anchored
  on every read (ADR-0015), and one that cannot be found keeps its anchor marked lost, for a person to check.
- The demo complaint was re-read with a one-off script; its 78 saved quotes stayed exactly where they were.

## 23. Demo captures from the pages the loader already holds; Check a pack can be tried on the case (30 Oct 2026)

Links & captures and Check a pack were empty in the demo. Calls:
- **Demo captures use real bytes only** (`app/services/demo_captures.py`): the Sarawak Report "Heist of the century"
  article and FINMA's BSI release, both already downloaded by the demo loader, are captures (saved); MAS's BSI page is
  a link only, with the loader's own reason (the publisher did not answer). No DOJ press release is captured: the case
  holds none, and its text would have to be made up. They say what they are: tool "1MDB demo loader: the page as
  downloaded with the case (no browser visit, no screenshot)", no stage timings, the screenshot stage "not run", and a
  drawn, dashed page card instead of a picture. No custody record is written for them.
- **Check a pack offers "Make a pack from this case and check it"**, and a version with one file changed in the
  browser, so the result view can be reached in the demo. Each records a new pack in the case, as an export does.
- **An added file inside an exhibit folder is only "not in the list"**, no longer also a second "exhibit changed".

## 24. A background job on SQLite gets its own connection (30 Oct 2026)

doj-2018-indictment-low-ng.pdf failed to read with "UPDATE … extraction_candidates expected to update 4 row(s); 0
were matched". Cause: on SQLite every session shares one connection (StaticPool), so one transaction; the inline job
runner reads documents in a worker thread while the server answers requests on that same connection, and a request
session closing rolled back what the job had flushed but not committed. The read then updated rows that were gone.
(A request committing at the wrong moment would equally have committed a job's half-done writes.) Call: on a SQLite
file, each inline job and scheduler tick runs on its own connection with a 60 s busy timeout
(`app/db/session.py own_connection`), so SQLite's file lock keeps it apart, as PostgreSQL already does. Requests still
share one connection with each other, as before. `tests/test_job_own_connection.py` reproduces the old failure.

## 25. Sources & evidence is a browser; the watchlist searches the case when OpenAleph cannot (30 Oct 2026)

Ony asked (BACKLOG): Sources & evidence was only a capture form; watchlist hits had bright yellow highlights and
full-width text. No mockups; designed from the research. Calls:
- **Sources & evidence**: every source, kind as a mark (worked out from stored data: document, web capture, web link
  not downloaded, typed by hand, feed/mailbox/connector, OpenAleph), ordered by claims backed then evidence; a "shelf"
  bar of all sources sized by their evidence; the picked source's pieces with one status-colour mark per claim and the
  stance as a sign (+ backs, − cuts against, · context). The capture form is behind "Add a source". A new endpoint,
  `GET /api/investigations/{id}/evidence-claim-links`, gives every link in one call instead of one per claim.
- **Watchlist**: names | hits | passage side by side; matches tinted in the theme's accent with an underline.
  When OpenAleph cannot be asked, a check searches the case's own read documents (`search_local`), so the watchlist
  works for every case rather than only with OpenAleph or seeded demo hits. Other names are written
  `Name (Other, Other)` and searched as `"Name" OR "Other"`. "New since you last looked" is kept in this browser only.

## 26. The Library: a dense list and a pane, one OpenAleph menu, mailbox messages titled (30 Oct 2026)

Ony asked (BACKLOG, "Bring in › Documents"): progress, stuck and errors per file; no wall of nine OpenAleph buttons
per row; .mbox children titled by raw hashes; no full-width text. No mockup; calls:
- A dense list of files with a pane beside it, not the research's contact-sheet grid (a grid needs a first-page image
  for every file, and a list scans numbers better; a grid can come later).
- Each file's progress and state come from The Drop's own record (`GET /drop`), refreshed while files are read; no
  new endpoint. States are colour only (could not be read, stuck, being read, waiting for you, done), word on hover;
  a failure's reason, a stuck notice and the progress strip stay visible.
- Every per-file action lives in the pane; the main button names the next step; the OpenAleph actions are one menu;
  proposals load only on "Review proposals" (some files have over 3,000).
- Upload moves into an "Add files" popover: The Drop is the way to bring files in.
- Look-alike titles: a long shared opening is drawn faint and shrinks first.
- Mailbox messages are titled by subject, else "Message from <sender>, <date>", else the date; old hash titles are
  renamed the next time "Look for files inside again" runs.

## 27. AI off is a state, not an error (30 Oct 2026)

AI runs and AI drafts showed "AI is off. Turn it on in Settings." in red and a deployment flag name. Calls: AI off
reads as a calm state on both screens ("Nothing: AI is off"), with what turning it on would send (the question and
the plan's records, counted by the server) and a link to Settings. AI drafts hides its run controls when nothing can
run; its empty state links to Ask the case. Ask puts Earlier runs beside the question so the page uses its width; with
no runs it shows the five systems unlit and the sample run. A run's state is a colour, the word on hover.

## 28. Settings panes to the account mockups and the hover rule (30 Oct 2026)

Calls: the disk-encryption explanation goes behind a reveal everywhere (first open too), though ACCOUNT_1 writes it
out (the 29 Oct sub-text rule wins; the how-to-fix line stays visible when the disk is not encrypted). "Hide the
screen now" joins the passphrase actions in Your safety's status row. "Sent this week" shows the site, the full
address on hover. A connector key's state is colour-only ("no key" a hollow ring; "refused" keeps its word as an
alert). A working Access state is the mark with its sentence on hover; states that need action stay written out.
"Kept · Leaves this computer" stays on every pane. No security behaviour changed.

## 29. Claims, Connector findings and Charts rebuilt to the list-and-detail rule (30 Oct 2026)

Calls: Claims is a list beside the open claim, like Sources & evidence; status is colour and edge shape, the word on
hover, and the status counts filter the list. Confidence shows in the list only above 0. The evidence pool (about 930
records on the demo case) sits behind "Attach evidence", searchable, 30 at a time, the records sharing most words with
the claim first, instead of listing every record under every claim. Connector findings rows open by click (no per-row
Inspect button); "To follow up" gets its own amber ring so it no longer looks like "not reviewed"; with no findings
the screen sends you to Bring in › Connectors. Charts still loads its catalogue only on "Build a chart" (it runs every
query; 38 s on the demo case, a backend speed item), but the closed state now says what the builder makes; the data
choice is cards with record counts, empty ones disabled. All three fill the height. Leads and To check stay as they
are: already closer to the 29 Oct rules.

## 30. The Wire's group names keep off the parties; shown on hover where there is no room (30 Oct 2026)

Call: in Linked groups a group's name goes above its group, else below, only where it covers no party, no other name
and no panel; on 1MDB at the whole-case view that leaves most names out at rest, and pointing at any party shows its
group's name, drawn above the parties. Before, the names sat over the next group's dots. The other arrangements'
headings sit beside their own parties by design, so they only keep clear of other names and the panels (a column under
the Altitude panel loses its heading, which was drawn under the panel before).

## 31. Short labels for sources, worked out from what each source records (30 Oct 2026)

The Story's evidence chips showed long source titles cut short ("United States v. All Right and Title to the Yacht…"),
not the mockup's short labels (ACT_2: "Council minutes 14 Nov 2017 p.6"). Sources have no short label, and none is
typed. Call: the server works one out (`app/services/source_labels.py`, `short` on the Story's evidence), from what the
source already holds, never invented:
- **A court filing** is what it is and the court's number: "Forfeiture complaint · 2:17-cv-04441", "DPA · 20-437",
  "Judgment · WA-45-7-11/2018"; the number is the last one in the caption (an account number earlier in it is not the
  court's); with no number, its date ("Cease-and-desist order · 22 Oct 2020"). A short heading before an id reads the
  same way ("Press release · SK.2023.24").
- **A post** is its account and date ("@WSJ · 7 Jul 2015"), else its site ("jho-low.com · Sep 2018").
- **An article** with a long headline is its publisher and date ("The Guardian · 9 Nov 2018"), the publisher's bracketed
  aside dropped ("SBS News", not "SBS News (Reuters wire copy)").
- **A title of 32 characters or fewer** stays as it is; anything else is cut at a whole word.
The full title and the place in the record stay on hover. Chips are now one per source (two sources with the same
title are two chips) and wrap onto a second line, as ACT_2 draws them, instead of being cut on one line. The Cited tab
and the citation hover keep the full title: they have the room.
