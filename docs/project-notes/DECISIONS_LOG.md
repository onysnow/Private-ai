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

## 32. BO-033: one flag per payer and payee, not one per payment (30 Oct 2026)

**Call.** The "payment with no stated purpose" rule (BO-033, `missing_property`) raises one flag for all the payments
from one payer to one payee, instead of one per payment. A pair gets two flags only when some of its payments are
recorded as having no purpose ("None stated": Textbook) and others simply have no purpose recorded yet (Faint).
The flag carries every payment (its links, by date), their count, the total per currency (never added across
currencies), how many have no amount, and the first and last date. The summary reads "Payer paid Payee 3 times,
3,500.50 EUR and 700 USD in all, from 2014-01-03 to 2015-03-09, and no purpose is found in the records for any of
them yet." A flag with one payment reads as before. Rule version 3 (family version 4).

**Why.** One flag per payment buried the board: 31 of 37 flags on 1MDB, 144 on Anise, where all 144 deposits go
from one person to five accounts (now 5 flags). Payer and payee is the unit a reporter checks: one set of documents
(a contract, invoices, a ledger) says what that dealing was for, and BO-031 and ML-021 already group their payments
this way. The direction is kept (A paying B is not B paying A) because the summary and the question differ. Stated
and not-recorded stay apart because their levels differ, and a Faint "nothing entered yet" must not be lifted to
Textbook by one payment in the same pair.

**Stored flags.** Handled as the engine handles any version change: the rule's version is in the digest, so cases run
under version 2 read as behind and the next run recomputes. A pair with one payment keeps its flag (same parties and
link, same fingerprint), with its status. The old per-payment flags of a pair with several payments no longer fire and
move to "no longer fire"; the pair's new flag starts open, so a per-payment set-aside does not carry over to it.

**Board.** A flag with several payments shows them as a list under the summary (date, amount, the stated purpose when
the record gives one; how sure each payment is as the dot's colour, the word on hover), the first six and the rest on a
click, and links to the money view like the other payment flags.

## 33. A payment has a kind; a fine, an order or an agreed price is owed, not money that moved (30 Oct 2026)

Payments could not be typed as a fine, a judgment debt or an agreed price (BACKLOG, "Still open from before"), so a
regulator's penalty or a court's fine was read everywhere as money that moved between two parties: on 1MDB the
RM11.4 billion statutory fine, the S$29.1 million of MAS penalties and the Swiss courts' orders were drawn as flows,
added into the money totals and checks (a regulator that only receives penalties is a "black hole"), and read by the
Red Flag payment rules. The demo's own notes say these are "not a transfer that happened".

Calls:
- **Where it is kept.** FollowTheMoney's Payment has no property that fits (`purpose` is the stated purpose as free
  text, `programme` a sanctions or funding programme), so the kind is the app's own column, `relationship_edges.
  payment_kind` (migration `a7d3f9c2e614`), beside `evidence_status`. It is not written into the FtM record, so it does
  not reach OpenAleph or an FtM export; it does go into backups (they copy every column).
- **The kinds, a short list** (`app/services/payment_kinds.py`): money that moved — a transfer, a loan, a fee (or payment
  for services), a settlement; an amount owed — an agreed price, a fine or penalty, an amount ordered by a court or
  authority (a judgment debt, compensation, restitution, disgorgement). Not said is the default and reads as money
  that moved, as every payment did before. Nothing guesses a kind.
- **Where a person sets it.** Add by hand (", as [kind]" after the purpose, "not said" by default) and an opened payment
  (See › The Wire › All links: a select beside its mark; `PATCH /relationships/{id}/payment-kind`). `POST /relationships`
  takes it too. A change keeps no history and asks no reason, as `evidence_status` does; the Red Flags see the change
  on their next run (the graph digest changes).
- **How it shows.** The kind is its mark (a Lucide icon; an amount owed is ringed), named with what it means on hover,
  focus or click; no mark when not said. See › Money's ledger rows carry it; the amounts owed are listed under
  "Owed, not paid: n" below the money picture, every currency, each with its mark and amount, never added up.
- **What leaves an amount owed out** (each consumer checked): the ledger puts it in `owed`, not `transactions`, so
  See › Money's picture, flow, strip, currency tabs and "Traced so far", the Case home's money traced, and the money
  checks (grey / black holes, miracles, round trips) do not count it; the five charts that read the ledger
  list it under omitted, "an amount owed, not a payment"; the Red Flag rules do not read it (`patterns/graph.py` keeps
  it in `owed`): structuring (ML-021: the amount was set by an authority, not split by the payer), round trips (ML-023),
  payments between parties held by the same people (BO-031) and payment with no purpose (BO-033: a fine's reason is
  that it is a fine). Add by hand's "What it changes" says an amount owed raises no Red Flag. Missing values (MV-PAY-*)
  still ask for a fine's amount, currency and date: those are gaps either way.
- **Left as they were, on purpose:** a loan, a fee or a settlement is money that moved and every rule reads it. A loan
  repaid closes a round trip; the check already names "a loan being repaid" as what could be innocent, and round
  tripping is often dressed as loans, so it stays. A kind is not a purpose: a typed loan with no stated purpose still
  rises as BO-033 (faint).
- **The 1MDB demo** gets kinds only where a payment's own note says "Kind: …" or "Ordered by the court": the court's
  fine and the nine MAS penalties and composition fine are fines; the tax judgment, FINMA's three disgorgements, the
  Swiss court's two compensatory claims and its restitution order are ordered; the Tanjong purchase price and the
  Equanimity's contract balance are agreed prices (19 payments). A purpose that only says "loan" or "settlement", as
  represented to a bank (Red Granite's "loans", the $700 million "settlement"), is the cover story the case disputes,
  so those stay not said.
- **Not done:** a mapped table column and an AI-extracted payment do not carry a kind yet (a person sets it on the
  opened link).

## 34. One way to write a date and a time on every screen (30 Oct 2026)

- **Question:** the browser walkthrough found date formats mixed between screens (BACKLOG P1): "30/10/2026, 14:05:22"
  where a screen called the browser's own `toLocaleString()`, "Thu 30 Oct, 14:05" in Settings, "13 Oct, 22:30" in the
  Drop, "2026-10-29 07:00" read raw off the API (shown as if local), "06 Feb 2018" in Money, and "Sept" wherever the
  browser's en-GB month names were used (ICU 72 writes "Sept"; the app's own tables write "Sep").
- **Call:** a record's date is `dateWords` (lib/dates.ts): "3 Oct 2023", "Oct 2023", "2023", at the precision held. A
  moment from the API is `timeWords` (lib/timestamps.ts): "3 Oct 2026, 14:05", in the reader's own time, always with
  the year; its day alone is `timeDayWords` ("3 Oct 2026"). Month names come from one table (`MONTHS`, "Sep"). Kept
  apart on purpose: relative words ("4 min ago", "yesterday") where the screen is about recency (Red Flags' "ran",
  Safety's cards, People's "last used", Decide's ages, Following's "14:05 today"); a narrow column with the full time on
  hover uses `compactDay` ("10 Oct" this year, "Oct 2025" otherwise: Library's Added column, Is it real's history);
  logs set in monospace keep `shortStamp` ("2026-10-10 15:02": the outbound log, the security request log); provenance
  lines kept in UTC say so, `utcStamp` ("2026-10-10 14:02 UTC": transcribed, fetched and made-by lines in the
  listening room, a checked pack's "made on"), and Chain of Custody and Captures keep their UTC forms as the CHECK
  mockup draws them. Live clocks inside a run (Watch the run's step axis) stay time-of-day.
- **Why the year always:** a case runs for years and holds moments from several of them; "10 Oct" alone is ambiguous
  once a case crosses a new year, and a fixed form keeps tests from changing with the calendar. The research writes
  some stamps without the year ("AI draft · 10 Oct", "last run 10 Oct, 14:02"); they now carry it.
- **Where:** lib/dates.ts, lib/timestamps.ts and every screen that wrote its own (see the commit).

## 35. A party's dossier opens where you are: the inspector slot finished (30 Oct 2026)

BACKLOG "Asked for: navigation": clicking a party used to carry you to Bring in, where the dossier sat in Connectors.
The inspector slot (entry 16) already opened the dossier at the right of the current screen; this finishes it so it
works as a panel should, rather than adding a second dossier drawer beside it.
- **Every request goes to the slot.** Every "open dossier" in the app goes through the store's `openDossier` (The Wire,
  All links, Red Flags, Places, the corpus, Connectors, a party inside a dossier); none of them changes the screen.
  Case home's and Decide's party chips point at a party (light it everywhere) and stay as they are.
- **Focus.** Opening moves focus to the slot's close button; closing gives it back to what had it, unless the reporter
  has already clicked somewhere else on the page.
- **The browser's Back closes it.** Opening pushes one history entry; Back closes the slot, and Forward opens the party
  again. Steps inside the slot replace that entry, not add to it: the slot's own ‹ Back and Esc walk the trail, and the
  browser's Back leaves the slot in one press, so it never takes several presses to get back to the page. Closing with
  × or Esc goes back over that entry, so the history stays as it was.
- **The address names the party** (`?dossier=<id>`), so a reload or a shared link opens the same dossier. A Chain of
  Custody step has no address of its own yet (its request is not a single id) and is not reopened on reload.
- **"Open in Bring in › Connectors"** on a dossier takes you to Connectors with that party selected, to enrich it from
  outside sources, and the slot stays open beside it. There is no longer a second, inline dossier in Connectors, so the
  link names where you go, not a "full view".
- **Width.** Docked at min(520 px, 40 vw) as before (at 1440 × 900: 520 px, the page keeps 920 px); a handle on its left
  edge drags it between 360 px and 70% of the window, the arrow keys on the handle move it 40 px, and the width is kept
  per device. Up to 900 px wide the slot fills the screen, as before; at phone width (640 px and under) it is a bottom
  sheet, 86% of the height, with a grab bar, and a swipe down closes it.
- **Motion.** It slides in from the right (up, as a sheet); with reduced motion or the calm setting it appears at once.

## 36. Claim evidence can be marked superseded by a newer record (30 Oct 2026)

A claim's evidence could only support, contradict or give context, so a figure a later judgment corrected kept counting
as support. Calls:
- **A mark beside the stance, not a fourth stance.** The link keeps what it said (supports, contradicts, context) and is
  marked superseded, with why (required: the suite changes no status without a stated basis) and the record that
  replaces it (optional: it may not be in the case yet; it must be another record of the same case, and two records
  cannot replace each other). Who marked it and when are stamped like every decision (`app/db/decided_by.py`); marking
  again after an undo stamps again. Undo clears the mark: the link counts again.
- **Shown, never counted.** A superseded link stays on every screen, struck and faded, and counts nowhere support is
  counted: the stance counts and sources on Claims, the Done rules (a superseded contradiction needs no answer either, as
  RAS Module 07 rule 5 has it for a superseded dissenting source), the Story's single-source gate (a claim left on one
  record is single-source), Chain of Custody's seal and "what rests on it" (the row stays, its wire faded and saying
  "superseded", the mark in the log), the evidence pack (an exhibit still, said to be superseded, with what replaced it
  and why; a claim resting only on superseded evidence is listed as a gap), Missing values (a Supported claim whose
  support is all superseded), a link's claim dependencies, a lead's stance counts, the case home's sources for and against,
  the evidence-by-stance chart (its own bar) and the authenticity preview.
- **On screen:** Claims shows the struck quote; what replaced it, why, who and when on hover, and pointing at it lights
  the record that replaced it in the list. "Mark superseded" is a row icon on hover; Undo stays in sight on a superseded
  row. A superseded count shows beside the stance counts only when there is one. The Story's chips put a superseded
  record after the ones that count, struck, its replacement on hover.
- **Backups** carry the five new columns as they are; a restore refuses a link marked superseded by evidence outside the
  backup.
- **Suite gap** (logged in `suite_map.json`, `SUITE_GAPS.md`): TAS §7.3 has superseded as a document state and RAS
  Module 07 a research source's `currency_status`; neither names the record that replaces it, nor marks one claim's
  evidence. The app uses the suite's word and rules, but the TAS Claim record would need a `superseded_by` on its evidence.

## 37. Documents keep what they are and their language, with how each was set (30 Oct 2026)
BACKLOG "Documents have no kind/language field". Built on `documents` (migration `a8d2f6c4e913`), filled in
`app/services/document_facts.py`:
- **Twelve kinds**, enough to tell a case's papers apart without becoming a taxonomy: court filing (complaints,
  indictments, pleas, motions), judgment or order, official record or notice (registries, regulatory notices, gazettes),
  article, press release, email, social media post, spreadsheet, recording, photo, web page, other. The demo records'
  words map onto them (`complaint` → court filing, `registry` → official record, `web_page` → web page); a word that
  names a file format (`docx`, `archive`) gives no kind. A PDF's type says nothing about what it is, so it stays
  "kind not set" until its source's record or a person says.
- **Language as ISO 639-1** (the primary subtag of a BCP-47 tag; ISO 639-3 only where no two-letter code exists).
  Regional variants are not kept: nothing in the app reads them.
- **How each was set:** `reader` (its file type, or what OpenAleph read it as), `source` (its source's record states it),
  `detected` (OpenAleph, faster-whisper for a recording, or py3langid for any other text, with how sure), `person`. A
  person's value is never replaced by the machine; a source's is not replaced by a detection; detections replace each
  other as they come (OpenAleph's and faster-whisper's after the app's own). A person clearing one keeps it cleared.
- **A detector of the app's own** (ADR-0027): py3langid 0.4.0 (BSD-3, 4.5 MB, numpy only), two-letter languages only,
  kept only at 80 % sure or more and with at least 40 letters of text. The alternatives were larger (lingua, fastText)
  or random unless seeded (langdetect). Documents already in a case are detected once by the migration.
- **On screen:** the Library row's mark is what the document is, named on hover with its file kind, how it was set and
  its language; a document with no kind shows its file's mark faint and dashed. The kind filter chips are now what
  documents are, plus "Kind not set" (the file-kind filter is kept in the model, no longer drawn: the two would have
  been the same marks twice). The pane and the reading room's Details hold two chips, kind and language, which open a
  chooser in place (the kinds as marks; a language typed as a code or a name). The reading room's language chip names
  the document's own language first, with how it was set, then any other language OpenAleph found; "Language not
  detected" stays only where nothing is known.
- Kind and language travel in a backup (they are columns of `documents`); a backup made before keeps none and the
  restored documents read as not known.

## 38. Money's columns say less at rest when the picture is dense (30 Oct 2026)

Ony, 30 Oct, on the 1MDB Money columns: "a LOT of overlapping UI". With five columns and twenty flows, every middle
party's "in · out" sums sat on the bands, six amount chips were laid over them, and the bands showed through the names.
Call, for a picture with more than six chipped bands (`isDense`, `features/money/money-layout.ts`; the mockup SEE_2
draws five): a band's chip shows only while the band is pointed at or focused, or its payment is lit in the ledger,
drawn above everything else and in its own place when no free place is near; a middle party's label is its name alone;
a source's is its name and total (the count of payments on the label's reveal, as the in/out sums already are); a
label's plate is opaque, so a band passing behind never reads through a name. A sparse picture keeps every chip and
sum at rest, as SEE_2 draws it.

## 39. A table proposes its own mapping; a person accepts it (30 Oct 2026)
BACKLOG "CSV and XLSX make no payments unless mapped". When a CSV, TSV or XLSX arrives, `app/services/table_proposals.py`
reads its header and first 50 rows and says what it looks like; nothing is made until a person accepts.
- **Two kinds only:** payments, or a list of people or companies (Person, Company or LegalEntity, from its columns).
  Anything else gets no proposal and stays with Map columns to entities. Up to five sheets of a workbook are tried; the
  first that looks like either is proposed.
- **Roles from the header, checked against the values:** date, value date, amount, money out, money in, which way,
  currency, payer, payee, other party, account holder, purpose, reference, kind of payment (and name, first/last name,
  date of birth, nationality, country, address, registration number, incorporated, email, phone for lists). Header
  words in English, German, French, Spanish, Italian, Dutch and Portuguese. A column's confidence is its header's
  weight times how many sample values read as the role; a proposal under 50 % is not shown. "Valuta" holding EUR is a
  currency, holding dates a value date. Booking date is the date; a value date is kept apart, and is the date only when
  it is the only one.
- **What a FollowTheMoney mapping cannot say is read first** (`prepare`, kept on the mapping, migration
  `b1c4e7a9d352`): thousand separators and either decimal mark (decided from the amounts: "1.234,56" vs "1,234.56"),
  signs, brackets, DR/CR, a currency in the cell or the header; debit/credit pairs or a which-way column; dates day or
  month first (decided from values above 12, dots mean day first) or in words; and a single account's statement, where
  the holder (a column, or a name the person types; asked for before Accept is possible) pays money out and receives
  money in. The amount kept is without its sign. A statement with no other-party column reads its description as the
  other party, at lower confidence. A counterparty column with unsigned amounts and nothing saying which way is not
  proposed: guessing the direction would invent who paid whom.
- **Accepting runs the existing column mapping** (`run_mapping`), so every party and payment is a proposal in the
  file's queue, reviewed into the ledger as before. Evidence is the row as the file has it, never the derived cells.
  `payment_kind` is set only when a column says a kind in the kinds' own words (fine, fee, loan, transfer…).
- **Who decided is kept** (`table_proposal_decisions`): accepted or dismissed, by whom, when, the proposal as shown,
  the proposal as accepted, whether it was changed, and the mapping it ran. Accepting twice is refused. A dismissed
  proposal is no longer offered; the hand mapper stays. Both travel in a backup.
- **On screen** (Drop read receipt, Library side pane): "Looks like payments" (or "one account's payments", "a list of
  companies"), each column as a chip "Date → date" whose strength is how sure (the percentage and the reason on
  hover), "+N left out", the first row as it would be read (all three sample rows on hover), Accept, Edit (each column's
  role, how numbers and dates are written), Dismiss.

## 40. Esc goes to the topmost layer only (30 Oct 2026)

With a party's dossier open in the inspector slot over The Wire, one Esc both stepped the slot back and did The Wire's
own Esc (closed its drawer, or went up a level): both listen on the window, and the slot did not mark the key as taken.
Calls:
- **One mechanism, in `lib/on-screen.ts`** beside `onScreen` and `typingInto`, which every window key handler already
  uses: a layer is an open dialog or anything marked `data-layer` (the slot is). The layer that acts on Esc calls
  `preventDefault`; a screen acts on Esc only when `escapeTaken(e, itsRoot)` is false, that is the key was not taken and
  no layer is open above it. The second half is what makes it hold whatever order the listeners were added in (The
  Wire's is added before the slot's, so `defaultPrevented` alone would come too late).
- **Who uses it:** the slot (it steps back only when no dialog is open above it, then takes the key), The Wire, Chain of
  Custody's "Back to the claim" (which had its own dialog check), and the theme trial bar (which had one too). The
  screens' other keys are left as they were: only Esc is shared between layers.
- **Unchanged:** the slot's Back still closes it, its Esc still walks the trail and closes from the first step.

## 41. Sources & evidence shows superseded evidence as Claims does (30 Oct 2026)

Bring in › Sources & evidence was told a link was superseded (entry 36) but showed nothing of it. Calls:
- **The mark travels with the link.** `GET /investigations/{id}/evidence-claim-links` keeps `superseded` (a boolean) and
  adds `superseded_mark`, the same object the Claims screen reads (what replaced it, why, who, when; `claims.
  superseded_of`), null while the link counts.
- **Per link, not per piece.** A piece can be superseded on one claim and still back another, so the mark is on that
  claim's chip: struck and faded, its stance mark struck, named "superseded" in its accessible name, and on hover the
  claim, then what replaced it, why, who and when (the Claims screen's own `supersededDetail`). Pointing at it lights the
  record that replaced it when that record is in the pane, as on Claims. Only a piece superseded on every claim it was
  linked to has its quote struck and faded.
- **Not counted.** A superseded link backs its claim no longer, so the source's claim count, status dots, tally and
  sort leave it out; a source whose every link is superseded says so ("Superseded on every claim it was linked to")
  instead of "Not used in a claim yet", and is in neither "Backing claims" nor "Not used yet".

## 42. A payment's kind read from what the record says, never guessed (30 Oct 2026)

Entry 33 gave a payment a kind set only by a person. Spreadsheets often carry the kind in a column, and a sentence
sometimes says it outright. Calls:
- **A mapped column, one optional role.** A Payment link in a table mapping may name `payment_kind_column`. It is the
  app's own role, not a FollowTheMoney property, so it is kept beside the entity and stripped before the mapping goes
  to FollowTheMoney; the kind is not one of the keys that make rows one payment. Only a Payment takes it; a column
  that does not exist is refused like any other.
- **Read through the vocabulary.** Each cell is read whole through `payment_kinds.from_value`: a kind's name, its word,
  or a listed name for it ("penalty", "purchase price", "wire transfer", "judgment debt"…). "fine art" names no kind.
  A cell that names none leaves the kind unset and is reported against its row (preview problems, run skipped list);
  an empty cell says nothing and is not reported. Rows of one payment that name different kinds leave it unset, reported.
- **From a sentence, only amounts owed in so many words.** A payment proposed from an extracted claim carries a kind
  only when the sentence states a fine or penalty ("fined", "a financial penalty of"), an order ("ordered … to pay",
  disgorgement, restitution, a judgment debt) or an agreed price ("purchase price"), and exactly one of them; the words
  that stated it travel with the proposal (`payment_kind_stated`). "Loan", "settlement", "fee" and "transfer" are never
  read from a sentence: how a payment was described is often what the case disputes (entry 33). Accepted, the
  proposal's kind becomes the link's.
- **Mapping screen:** under a Payment link, one select, "Kind of payment: not said" or "Kind of payment from “column”";
  what happens to a cell that names no kind is on hover.

## 43. Act › Charts loads its catalogue with the screen (30 Oct 2026)
Entry 29 left the chart catalogue behind "Build a chart" because building it ran every query (38 s on the demo case).
Profiled on a fresh 1MDB demo database (172 links, 97 reporter events, 930 evidence records; this container, SQLite):
`describe_catalog` took 2.0 s cold and 1.7 s warm with **5,025 SQL statements**; `serialize_relationship` alone was
2.3 of 3.1 s under the profiler. Causes: each link was serialized one by one (entities, statements, evidence, sources,
reviews, claims: a query each, the review history read again for every attached record), and the same links were
serialized again by the ledger, the timeline (once per dated link and once per reporter event pointing at a link),
the places and the link counts; `events_over_time` and `events_in_order` looked up each event's link one query at a
time; the map's places built the timeline a second time. The 38 s was not reproduced here (this database has no
documents read); the old cost grows with links and events together, which a case with read documents has more of.
Calls:
- **Batched, not cached.** `serialize_relationships` reads what a set of links needs in a few `IN` queries (chunks
  of 500) and builds the same rows; `serialize_relationship` is that for one link. The relationship list, a party's
  links, the graph and the timeline's advisories use it. The timeline asks once for every link's advisory.
- **Shared while the catalogue runs.** Inside `describe_catalog` each link is serialized once for all sixteen queries
  (`relationship_rows_shared`, read-only work only), and the places reuse the catalogue's one timeline. Every caller
  still gets its own copy of a row (dicts and lists new; text, numbers and dates shared, as none can change).
- **No cache across requests.** The app has no data version to key one on, and the catalogue is now fast enough
  without one; a stale count would be worse than a quarter second.
- **Result:** 270 statements; 0.47 s cold, 0.19 s warm in the function; the endpoint 0.2–0.4 s after the server's
  first request (about 1.2 s for that first one, while SQLAlchemy compiles its statements). The output is byte-for-byte
  what it was: a golden of the catalogue, every query, every link, the relationship lists, the graph, a party's
  links, the timeline, the places and the ledger, made before and after on the same database, is identical. A test
  holds the catalogue's statement count flat as links are added (before: 91 → 601 for 30 more payments).
- **The screen:** Act › Charts asks for the catalogue as it opens; "Build a chart" is gone. While it loads (well under
  a second) the screen shows what the builder makes and a loading line. Sections of a stage still mount only when
  first opened, so nothing else asks for it.

## 44. Places: a place's pictures, by three stated rules, and a window you can scroll (30 Oct 2026)

PLACE_1 draws "Pictures of this place" in the place card and a window under the map that scrolls. Both are built.
- **A picture is of a place only by a rule, never a guess** (`app/services/place_pictures.py`, each place's `pictures`
  on GET /places). Three rules, and each match carries its rule and what it rests on, shown on hover:
  **gps**, the photo's own EXIF GPS within 250 m of a place known to the building (or with no precision noted), 500 m
  for a street or square, 5 km for a town or wider (0, 0 is no fix); **linked**, a person tied it: evidence for a link
  or a dated event at the place, the file the place's coordinates were read from, or a photo whose GPS proposal was
  accepted as the place; **named**, a picture's caption or a saved capture's page names the house number and street,
  as whole words. A place with no house number is never matched by name: a street or town alone names many places.
  Why these radii: the GPS a phone writes is good to tens of metres, and a place's ring already says how exact the
  place is; a wider radius would call a photo two streets away "taken here".
- **A picture is a held photo file or a captured page** (shown by its screenshot). A picture evidence record with no
  file is left out: there is nothing to open. A PDF is never a picture, even when its caption names the address.
- **One click opens the source** (the photo room, or the captured page in the reading room). The rule is a mark on
  the thumbnail (pin, chain, quote) and its sentence on hover; the date shown is the source's, else the camera's clock,
  else the capture's day, and which on hover. The three rules are stated behind the `?` beside the heading.
- **The window greys pictures taken outside it**, as it greys events; an undated picture is never greyed. The card's
  event heading says "1 of 2 in the dates picked". **Compare 2017 ↔ 2021** sets the earliest dated picture beside the
  latest when they are of different years.
- **The window:** scrolling over the strip moves a picked window a month a notch (and the page does not scroll too;
  with no window picked, the page scrolls as usual). The window itself takes focus: the arrows move it whole, Page
  Up/Down a year, Escape lets it go. The arrows on an edge no longer also step to the next place (they did: the key
  bubbled to the panel). Each row ends with how many of its events fall in the window. The window glides on keys and
  scroll, never under the pointer, and not at all under reduced motion.
- **The map's tooltip lookups do not compute pictures** (`pictures=False` in the map chart and the photo tool), so
  their cost is unchanged.

## 45. The demo arrives decided: its review decisions are pre-made, a few of each kind left to try (30 Oct 2026)

BACKLOG "Asked for: demo": the demo is a finished investigation, so the human-review decisions are pre-made from what
is known, and the user sees the app past the review step. Built in `backend/app/services/demo_decided.py`.

- **Only on a demo case** (`Investigation.is_demo`), never anyone's own. It runs at the end of a demo build (the
  table's proposals, every missing value and checklist item) and after each of a demo case's documents is read (that
  document's proposals, passages and watchlist hits): the queue grows as documents are read, so the decisions are made
  where the proposals are made, not once at load.
- **Every decision is stamped "Demo (pre-decided)"** (`DEMO_DECIDER_ID` in `app/db/decided_by.py`) with the rule that
  made it in its note, and can be undone: `POST /api/demo/pre-decided/{investigation_id}/undo` (all, one kind, or one
  item), counted by `GET /api/demo/pre-decided/{investigation_id}`. Undo never touches a person's decisions. To make
  this possible To check items and watchlist hits now keep who decided them too (migration b2e5c8a1d730, revising
  a8d2f6c4e913), stamped the same way a person's proposal decision is; a stamp the code sets itself wins over the
  request's person, so a demo decision made during a request is still the demo's. The custody chain shows such an
  acceptance as the app's, not a person's. To check items, missing values and watchlist hits now carry
  `decided_by_id` / `decided_by_name` in the API, as proposals already did, so a screen can tell the two apart.
- **Accepted only when the case already holds it; nothing new is made.** A name that is a record's own name or alias
  word for word (one record only; a table's "X (Y)" by either part) is accepted as that record through the app's own
  "Same record" answer, so its mentions are kept on it. A passage holding a quote the case keeps from the same source,
  a sentence that is a claim's text or holds the quote supporting exactly one claim, a table payment the case holds
  (same ends, amount, currency, date) are accepted as that quote, claim or payment.
- **Rejected by stated rules:** names made only of court-caption words (Verified Complaint, Forfeiture In Rem, All
  Right), a court's abbreviation (C.D. Cal), a role standing for an unnamed person (Deutsche Bank Employee, Christie's
  VP); passages under six words, under half letters, only page furniture (Case 2:16-cv-…, Page 3 of 136) or an email's
  header lines; the same name, sentence or passage proposed again. Proposals the OCR quality gate held back stay held.
- **Left waiting, so Decide can still be tried:** the DOJ payments table's rows and names (the money; their "Already in
  the case" notes show the $330M total), then one name, one sentence and one passage per document while fewer than 36
  proposals wait; 8 missing values (one of each rule in turn); 8 To check items; 4 watchlist hits. Every other
  proposal is rejected as "not taken by the finished case"; the rest of To check is set aside as "unclear", missing
  values as "not needed here", hits dismissed, each with a note saying a person did not answer it. "Shows it" or "Does
  not" is never pre-made: whether a passage shows an indicator is a person's call.
- **Measured** (tests/test_demo_decided.py, the case built without downloads, the shipped files read): without the pass
  about 500 items wait after the reads (323 proposals, 175 missing values, 3 checks); with it 47 (36 proposals, 8
  missing, 3 to check), 287 proposals and 167 missing values pre-decided. Not measured: a load with the eleven real
  court PDFs read (OCR, about 15,000 items on Ony's PC); the caps hold there too, but the time the pass takes on that
  many proposals was not checked.

## 46. A party's dossier, converted for the inspector slot (30 Oct 2026)
Seen in Chromium on 1MDB: the dossier in the inspector slot (entry 35) was still the old panel: a line of count
glyphs with no meaning ("6 ≡ 1 ↔ 0 ○ …"), a wall of large buttons on every row, headings with nothing under them,
full-width text. Rebuilt in the converted screens' grammar (Red Flags, Claims, Sources & evidence, the Wire's drawer)
for a ~520 px side slot and a phone's bottom sheet (`features/dossier/*`, `styles/dossier.css`).
- **At rest:** who or what (its kind as the Drop's party mark, named on hover; the name, large; the country and up to
  three key identifiers as chips: registration, LEI, tax, VAT, ID, passport, IMO, MMSI, SWIFT, INN, OGRN, the
  incorporation, birth and dissolution dates; more as "+n" with the rest on hover). A chip's hover says where the value
  comes from; its click traces it. Then what waits on a person: "n to decide" (the one primary action) and the outside
  findings to review. Then the figures, each opening its section (scrolled to, its title focused, lit for a moment):
  links (a bar of link families in their colours), claims (a bar by status), Red Flags (a bar by level), sources
  (quotes on hover), money in and out (short amounts, every currency on hover), and leads and dates when there are any.
  A zero figure is quiet and not a control.
- **The dossier works out its party's flags and money** from the case's Red Flags and ledger reads (shared with Act ›
  Red Flags and See › Money, counted over the party and its merged aliases); a dismissed flag does not count. The
  API's dossier has neither; nothing new is asked of the backend.
- **A section is drawn only when it holds something**; an empty dossier shows one quiet line ("No claims, leads or
  tasks yet"). A section shows five rows, then "Show all". Order: To decide, Red Flags, Claims, Links (by family),
  Money, Ownership and control (only when the chain has links), Sources, Leads and tasks, Dates, Outside findings.
- **Row actions are small icon buttons**, shown on hover or focus (always on a touch screen), named on hover and as
  their accessible name; the names are the old buttons' words, so nothing is lost: Review relationship evidence, Trace
  relationship, Create question / lead with exact context, Trace payment, Trace provenance, Open the source, Trace lead,
  Trace task, Same entity, Different, Unsure, Preview merge into this record, Temporal change, Both valid,
  Unresolved, Duplicate · prefer first/second, Keep separate, Expand in the corpus. A property's values are chips:
  clicking one is "Prefer <value>". The previewed merge's "Merge" is the only other filled button.
- **The other party of a link, payment or duplicate opens its own dossier** in the slot (the trail keeps the way back),
  so a reporter can compare two records before saying they are the same.
- **Folded under "More":** identity and merge history, OpenAleph's "Expand in the corpus", and every recorded value
  (each traceable). Explanations that used to be paragraphs are on the hover of their section's title.
- Statuses of leads, tasks, dates and findings are shapes with the word on hover, as on Leads and the Drop.

## 47. Settings never scrolls; Notifications as a grid, server setting names behind a reveal (30 Oct 2026)

The sweep at 1440×900 found the Settings page scrolling (Appearance 1105 px, Notifications 1390, Outside lookups 1363,
AI and research 1060), a wall of "Needs you default" buttons, and deployment names (NOTIFY_MAIL_URL,
NOTIFY_PUSH_SUBJECT, ENABLE_AI_FEATURES) in the panes. Calls:
- **The page never scrolls.** Settings is the window's height under the frame's bar; the sidebar and the open section
  scroll inside themselves, and a two-column pane (Appearance, Notifications) scrolls each column on its own. Appearance,
  Notifications and AI and research fit 1440×900; Outside lookups scrolls in its section (it carries Look a name up now).
- **Notifications: kinds × places.** One row per kind with last week's count, one column per place (Interrupt, Needs
  you, Everything else, Off), each a mark in its colour named on hover with what it does; the choice is a filled dot,
  the default a ring on its cell (named "(default)" in the dot's name). The per-kind choice is a route, not an outside
  channel, because the server stores email, phone and Web Push per channel (off, Textbook Red Flags, once a day), not
  per kind; those keep their own rows under Outside the app. "Open the inbox" moved into the Last week pane's head.
- **Server setting names only on reveal.** A channel the server cannot use reads "Not set up on this server"; the
  sentence naming what whoever runs the server sets is revealed on it. AI off reads "AI is off · nothing runs or leaves
  this computer; the rest of the workbench works without it" (entry 27), the flag on hover; "Change it" still lists the
  environment names on click. A suite file missing stays written out (something to fix in the suite).
- **AI and research:** the model and Research without asking share the first row.
- **Outside lookups:** the summary is a few words ("A party’s name, to OpenAleph, Firecrawl and OpenSanctions, when you
  say so."), in the UI face; the full sentence with each source's address is revealed on it.
- **Appearance:** a theme card is its name, swatches, type and marks; its mood and lowest contrast pair are revealed on
  the card (and stay in its accessible name). "+ Make your own" explains itself on hover. Of the four facts, the check
  result shows; the other three are names with their detail on hover. Calm motion joined the effect switches' grid and
  Status marks' three choices sit on one line.

## 48. Act sweep: Leads, AI drafts, Red Flags and Charts to the hover and fill rules (30 Oct 2026)

A read-only sweep of Act at 1440×900 on the 1MDB demo found chrome at rest and empty space. Calls:
- **Leads:** the add-lead form (inputs and a big textarea, a third of the screen) folds into one "+ New lead" button
  beside the view switch; it unfolds in place, folds on Cancel or Esc, and folds by itself once the lead is added. The
  lone ⇄ is named on hover ("Moving a lead", with the keys). Counts are part of column titles ("Next 1", "Now 4 / 5",
  "Done 0" as a title-styled toggle, not "Done (0)"); "not yet placed" is the Inbox title's reveal. A card's status
  glyph sits before its title, and owner, source, tasks and evidence counts share one last line, so a lead with only
  a title is one line, not a lone "○".
- **AI drafts:** AI off (or no model chosen) is the AI mark, hollow and grey, its sentence on hover, with "Settings ›"
  beside it, as DECISIONS_LOG 27 decided for AI runs. With no drafts, the screen shows what a draft is as its path
  (Ask → AI draft → You decide, each step's explanation on hover) and, beside it, the case's claims a draft could test
  (disputed and not-yet-shown first, ruled-out left out; `features/ai/draftable-claims.tsx`), each with "Ask ›",
  which opens Ask the case with the claim as the question. Nothing runs from here.
- **Red Flags vs ACT_1:** every rung shows its rule; the rung at the flag's level adds "Found" with the facts in the
  records that meet it, read from the rule's own measurement (counts, parties in the loop, amounts, dates, holders).
  A rung with no rule of its own says on hover that the rung above meets it. The centre draws the payments a flag
  rests on for every family whose links are payments (the loop's payments, the payments between companies with one
  holder, a single payment with no stated purpose), not only for the band rule. "Parties carrying flags" names are
  one line, cut, the full name on hover. "Could be innocent" items show a short title (the text before a
  parenthesis or semicolon, about 48 characters), the full text on reveal; the checklist actions are unchanged.
- **Charts:** layout only. Before a question is chosen, the main area is a gallery of every chart the catalogue can
  make, grouped by question with their record counts; a card chooses its question and its data at once. The rail
  still works step by step.

## 49. Keep › Backup & restore, Delete and Access, and Settings › Security log, converted (30 Oct 2026)

The sweep found Keep's last three tabs and the Security log pane unconverted: big headings, stacked orange buttons, a
raw file input, a collapsed "Local security/settings status" line on an empty Access page, and the server's facts
running together ("EnvironmentDatabaseDocument storage…"). Calls, all in the look of Safety & data (KEEP mockup):
- **Backup & restore** fills the screen in two panels. Left, *Make one*: the last backup big ("Last backup 3 days ago"),
  its size and a ✓ checksum (SHA-256 on hover), and what a backup holds counted from Safety & data's own stores (records,
  documents… big numbers; where each lives on hover; what stays out, keys and the security log, behind ⓘ); Download
  backup at the foot. Right, *Restore safely*: a target to drop a backup on, or press to choose one (the file input
  stays in the page for the keyboard); the passphrase field when the file is sealed; the preview counted as tiles
  (records, stored files, missing files), lineage and restore as ✓/✕ marks, warnings and conflicts written out, then the
  confirmation and Restore investigation. Sealed or not (ADR-0016) is a chip in the heading, its meaning on hover.
- **Delete** is the deliberate step in the alarm colour (one of its two allowed places): the case's name in the alarm
  colour in the heading and three steps on a rail (See what goes · Type its name · Delete). What goes is counted when
  the tab opens (a read-only count: records removed and files removed in the alarm colour, shared files kept and already
  missing calm; records by table on hover), with "Back up this case" beside it. The name to type is shown big in the
  panel beside, and the button stays shut until it matches. The all-stages page, which mounts every panel at once,
  keeps the count behind Preview deletion (`countOnOpen={false}`).
- **Access** is a real screen: *Who can reach {case}, and how*. The people and their keys on the left are Settings ›
  People and access itself (one table, so a role or a key changes in either place); on the right the ways in, each a
  mark and a big word with its detail on hover and a link to the setting that changes it: Network (only this computer
  / devices with a key), App lock (passphrase / nothing to unlock; idle, hide and sleep on hover), Refused · 24 h, Backups
  (sealed / not sealed), Connector keys (n of m). Refusals that need a look stay written out as an alert. Below, the
  server's setup as marks and the stray files as one quiet action (Safety & data's "Look at them" opens here). The
  connector-key form that sat in the old collapsed block is not repeated: Settings › Connector keys is the full form.
- **Settings › Security log**: the setup is a list of spaced marks, each name with its value on hover and a status
  colour (the word on reveal; Settings › Appearance › Status marks adds the shape or word) for those with a state; the
  denials a count with its sentence on hover, or the alert written out. The events load with the pane and scroll inside
  it; refused-only and technical are small switches; "Stray files" and "Preview 90-day retention" are small secondary
  actions at its foot (the prune still needs the typed phrase).
- The pieces live in `features/security/security-panel.tsx` (ServerStatus, StrayFiles, SecurityLog) and
  `features/security/access-screen.tsx`; the old collapsed block remains only on the all-stages page.

## 50. Bring in › Connectors, OpenAleph corpus, Search and Following's at-rest notice converted (30 Oct 2026)

A sweep of the running app found four Bring in screens still in the old panel style or half empty. Each now fills its
tab (the page does not scroll; parts scroll inside) and follows the 29 Oct rule.

- **Connectors** (`features/connectors/connectors-panel.tsx`): no "External connectors" heading, no raw provider and
  case dropdowns, no "Enrich a canonical entity" label. Left: the case's parties as a searchable picker (kind as the
  party mark, ↑↓ to move); a typed name that is no party is searched outside with Enter or the dashed row under the
  list, which says on hover what is sent where. Right: the picked party's name large, Open dossier, Enrich with the
  chosen connector, Enrich all providers. One card per connector, chosen by clicking it: its key state as colour (the
  word and Settings › Connector keys' line on hover; a refused key stays an alert in words with a link to fix it), the
  case's mode, when it was last used (what was sent on hover), and after a lookup its health and count. Below: what was
  sent from this case this week (from the outbound log Settings › Outside lookups reads), and the count of findings
  waiting, linking to Check › Connector findings. The case switcher is left to the frame on the stage screen (the
  all-in-one page still passes it). Why: the connectors' state was already known to Settings; showing it where the
  lookup is made says before you press whether it can work, and what leaves the computer.
- **OpenAleph corpus** (`features/corpus/*`): no repeated title. One strip holds the sync as a status colour (Status
  marks apply), when it last went and what waits; what the corpus is and every sync line are on hover; failures stay.
  What stands out is asked for when the screen opens, not behind a button: the server answers "off" and "nothing sent
  yet" itself, and only a case already sent asks its own OpenAleph collection. It, the cross-references and the
  OpenAleph sets (now three icon buttons, named on hover) sit in a right rail; the watchlist takes the rest. A watched
  name shows "N hits", nothing at zero, a hollow ring if never searched; a name found nowhere gets the whole pane (name
  large, other names, why it is watched, "In no document yet", Search for it now) instead of a sentence and an empty
  third pane.
- **Search** (`features/search/search-panel.tsx`): before a search the screen shows what can be searched, each kind of
  record with its count from the case's standing (pick one to search only it), names to try from the case's parties
  (real names before anonymised labels), and the last eight searches (this browser only; key hints behind `?`). The
  orange "Search records" button is a quiet ↵ beside the box: Enter searches. A × clears back to this screen. Documents
  have no passage count in the API, so passages are not counted.
- **Following** (`features/following/following.tsx`): the at-rest paragraph is a lock mark beside "Sources followed",
  the sentence on hover. Only an unencrypted disk (the list readable on this computer; the person must turn encryption
  on) stays on screen, as a short "▲ List not encrypted" alert with the sentence and what to do on hover.

## 51. Check's screens and Decide follow the 29 Oct rules (30 Oct 2026)

A sweep of the running app (1MDB demo, 1440×900) found Check's tabs and Decide still showing sub-text, unnamed
figures and empty space. What changed, screen by screen:

- **Claims, a claim opened.** The figures (confidence, supporting, contradicting, context, sources) are bare numbers,
  each named on hover; a zero is quiet (faded), so "0 0 0" no longer shouts. Sections with nothing in them (Linked
  evidence, Review history, Relationships resting on it) are not drawn: one quiet line says what is empty ("No evidence
  is linked to this claim yet. No review recorded yet. Nothing rests on it."), with Attach evidence beside it. The
  status to record is no longer a raw "lead" select: it is a radio group of the six statuses, each in its status
  colour (lead and unverified dashed like Not yet shown, supported and confirmed green, disputed red, rejected muted);
  a control keeps its words. The claim's status now is ringed; arrows move. Confidence is a figure with its slider.
- **The stuck "0% confidence" card** was the shared Reveal opening on focus: a click on a row focuses it, so the card
  stayed over the list until focus moved. Reveal now ignores the focus a pointer press gives (hover already showed
  the card); keyboard focus still opens it. A row with no confidence and no grade carries no card at all. This applies
  to every screen.
- **The grey status dots are not a bug.** The API lists the 1MDB claims with the 29 lead and unverified ones first, and
  those are Not yet shown, whose colour is the grey (`--status-unshown`). Further down the list the disputed, supported
  and rejected claims carry their colours. Checked against `GET /api/investigations/…/claims`.
- **To check** fills the screen: the title and the counts as figures (○ open, ✓ decided, named on hover, zero quiet),
  the cards sharing the height. Each card answers with Case home's Next-up buttons (✓ Shows it, ✕ Does not, ? Unclear)
  and keys S, D, U for the card in hand: the one pointed at or focused, else the first open one. Undo and the note are
  icons named on hover.
- **Chain of Custody** fills the screen: the wires take the height the log leaves, the log keeps to its rows and
  scrolls inside past 42% of the height, the drawer scrolls inside itself. The drawer's "Key" heading now has its key
  drawn under it (the five line styles and what each means), as the mockup draws it.
- **Is it real?** A finding's first sentence shows, the rest ("Nothing is sent on its own; ask…") on hover. What each
  status means ("The default. Nothing either way…") is revealed on its button. An option not offered says "Not
  offered", the reason on hover. Why Record decision is disabled is revealed on it. Where an offered option sends
  ("Local · nothing leaves this computer") stays in sight: what leaves the computer is on the floor.
- **Connector findings, empty:** one calm line centred in the screen with its mark and Run a connector; what findings
  are is on hover of the line.
- **Check a pack** fills the screen: the drop zone takes the full height, the three steps spread down their panel at a
  larger size.
- **Decide:** the "What happens" box is one quiet line ("What happens", with ◆ when a Yes unlocks something); the box is
  its reveal, and each answer's own line is revealed on its button. The right column's question is no longer cut at
  three lines, the passage and the answers are larger, so the column is used.

## 52. See › Timeline fits the screen; Money's checks at rest; the Wire's round-trip chips keep off parties; Glossary never empty (30 Oct 2026)

A sweep of the 1MDB demo at 1440×900 found these screens saying too much, or cut off. Calls:
- **Timeline fits its section and never scrolls the page.** The section is a fill section like The Wire; each view
  scrolls inside itself. In Lanes the strip ("Not on the timeline yet", Undated) and the key line always show under the
  chart, and the chart shows as many lanes as fit its height (at least three), the busiest first; the selected event's
  and the lit party's lanes count inside that number. The rest are behind "+ N more lanes", and the chart scrolls inside
  itself when they are open. Before, the strip and the Undated tray ran off the bottom of the screen.
- **The bands' switch.** "hide them 20", struck through when on, read as a mistake. It is now one switch: the band, the
  count and a track that is lit while the month-or-year dates are drawn; what it does is on reveal.
- **From names the source, not the dataset's id.** The 1MDB demo's dates were read from sources, but the source was
  missed because a statement's origin carries where in it the date was read ("source:<id>#<locator>"); the drawer
  showed "1mdb-demo". The server now reads the origin's source (and a document's source) before falling back to the
  dataset (`app/services/timeline_lanes.py`). This also moves those events to their source's lane in "Lanes by
  Source", and a date from a Tier A source is marked shown, as the rule already said. Where no source is recorded, the
  drawer says "An imported dataset", the dataset's id on reveal.
- **Money's checks: title and figure at rest.** A check is its kind's icon, the party and one figure ("$5.24m
  unsourced", "$1.59bn out", "$378m back"). The numbers sentence and "Could be innocent" are on reveal on the name
  (still read with it, never dropped: a check is an indicator, not a finding); the lead idea on Make a lead. Make a lead
  and Add to To check are quiet icon buttons named on reveal, no primary: a column of orange buttons is gone.
- **Money's key is drawn**, a swatch per kind of band with its word on reveal, in place of a "KEY" word with nothing
  under it. "40 more" under the compact ledger is now "All 46 payments in the Ledger ›", which opens the Ledger layout
  (as L does); how many are above or lit stays on reveal.
- **The Wire's round-trip chips keep off every party** (the rule of entry 30 for group names): by the line from the
  focus, above it then below, further out each time, clear of cards, dots and their names, the other chips and the
  panels. With no clear spot a chip is left out at rest and shown while the pointer is on either party of the round
  trip. Nothing else on the Wire changed.
- **Glossary: compact rows, the card never empty.** Rows are 34 px, not 46. With nothing pinned the card holds the
  first term shown (it is not written to the address, so it does not pin). The dot per area, which said nothing, is the
  area's short code (ML, BO, SF), up to three and "+n", each area's name on reveal; the safety area in its own colour.

## 53. The demo's pre-made decisions shown and undoable on screen (30 Oct 2026)

Entry 45 made the demo's review decisions ahead ("Demo (pre-decided)"), with an undo endpoint no screen used. Now a
person on the demo case can see what the demo decided and take it back. Built in `frontend/features/demo/pre-decided.tsx`.

- **Where the queue is (Decide's queue column, Case home's Next up footer): one quiet line.** At rest: the demo's mark
  (a dashed stamp ring, accent-2), the number and "decided ahead by the demo", and "Undo them". On hover or focus of the
  number: what the demo is doing ("a nearly finished case"), the count per kind (proposals; checks and missing values;
  watchlist hits) with what they became (accepted, rejected, set aside as unclear, not needed here, dismissed), and an
  Undo per kind. The kind counts are sub-text, so they are not at rest; the total and the undo are what matters.
- **Undo always asks first, in place:** "Put n of the demo's decisions back in the queue? They wait for you in Decide
  again:" with the list by kind of what comes back, and "Your own decisions stay as they are." Undo n / Cancel. After an
  undo every query is refreshed (as Decide's own answers do), so the queue, the counts, To check and the watchlist show
  what came back; the line says "n back in the queue to decide." and goes when nothing is left.
- **One decision shown alone carries the mark, "Decided ahead by the demo" on hover:** a To check item (its demo note
  moves from the card to the hover; the card's Undo sends that item to the demo undo, `{kind: 'check', id}`, so the
  note goes with it), a watchlist hit the demo dismissed (with its own Undo, `{kind: 'watchlist', id}`), and a custody
  chain decision card and its "Decided" row (mark and hover only: the chain's card names the quote, not the proposal,
  so it has no id to undo by; the line in Decide undoes it).
- **Decide's "Last 10" strip is not marked:** it holds only the answers given in this session, never the demo's.
- **Nothing on a case that is not a demo.** The frame knows `is_demo` and does not ask a case that is not one; when it
  does not know (a screen rendered alone), the counts endpoint's 404 says so and nothing shows. A status that waits
  again (proposed, open, new) is never counted as decided. Page tests answer the counts route for a demo case with no
  decisions by default (`frontend/test-support/page-routes.ts`); a case that is not a demo is not asked.

## 54. Act and Following resweep: no key hints over the work, every met rung its rule, statuses as colour (30 Oct 2026)

A second look at 1440×900 found these, and the calls:
- **Frame hint chips gone.** The first-use "Steps and pages [" and "Tools ]" chips floated over content (over
  Correlation in Act › Charts). They are removed, with the "learned" flag that drove them. Each edge's handle names its
  edge and key on hover (the top handle gained the same reveal the left one had), and every key is in the `?` sheet,
  which is where Ony put key hints.
- **Red Flags ladder:** every met rung shows its rule and the facts. A rung below the flag's own level with no rule in
  the catalogue says "Met through the Textbook rule above" (the level named), and carries the same Found facts, since
  what meets the higher rung meets the lower. **Parties carrying flags** is a list, not rings: a bar in the heaviest
  flag's colour, the name (cut only when it must be, the whole name on hover) and the count; it scrolls inside itself
  past about six rows. "A flag is a lead, not a finding…" is an ⓘ mark with the sentence on hover.
- **Following:** a source's waiting count is the number alone ("new" on hover); a closed platform's "none" is a dashed
  empty ring ("No monitor: link capture only" on hover); "fix" stays as an alert. In the queue a risk that asks for
  action keeps a short alert word in its colour ("At risk", "Removed", "Changed", "Deleted", the full sentence on
  hover); a calm status (wire copy, transcript offered, no sign of risk) is a coloured dot named on hover.
  "Captured · Skipped" is behind an ⓘ. The screen now fills its tab: each column scrolls inside itself (the queue
  inside its panel; before, the tab clipped it), the sources list grows to the column's height with bigger rows, and
  "What leaves this computer" takes the rest of the right column with its counts large (third-party services, then
  asked directly / through Tor / a public server / no monitor, each a number).
- **AI drafts, none yet:** the path (Ask → Draft → You decide) runs down the panel, larger, from the head at the top to
  Ask the case at the foot, so the panel is filled rather than half empty.
- **Leads:** a card's "↳ what it is for" line is the ↳ mark in the card's last line, the words on hover. An empty
  Now / Next / Later is a dashed slot sized to its content saying what to drop there, not a tall empty box.

## 55. See and Glossary: nothing overlaps, nothing is cut, the side panels are full (30 Oct 2026)

A sweep of the 1MDB demo at 1440×900 found marks and labels printed over each other on the See screens, and two side
panels empty for most of their height. Calls (placement only; nothing's look or features changed):
- **The Wire keeps parties apart (the rule of entries 30 and 52, extended to the parties themselves).** Around a party
  and along a path, each party's footprint (its card with the flag count above and the accounts under it, or its dot
  with its name chip on the side away from the middle) is pushed clear of every other before the view moves there; the
  party in the middle never moves. Cards keep their size on screen, so the room is worked out at the zoom the view
  settles at. A dot's name chip also keeps off every other dot (the 1Malaysia name ran under two icons); a sector name
  ("Other links") keeps off dots and their names and off the panels as well as the cards, else it is left out; a link's
  sentence goes, of its clear spots, where the fewest other lines run through it (skipped while the view moves).
- **Timeline.** The strip shows as many whole "Not on the timeline yet" cards as fit (they grow into the room), the
  rest counted in a last "and N more"; a card cut at the edge read as covered by the Undated box. Undated lists three
  titles, one line each, the full title and why on reveal. A range's label sits 3 px higher, clear of the marks' rings,
  and keeps off the lane's flag brackets. "Name a period" moved beside the Periods switch (it sat alone at the screen's
  bottom-left edge). The event panel runs the full height and its rest is the event's run: its lane's events in date
  order (or, with no party, the same source's), the event lit, a click opens another; only events drawn now are listed.
- **Places.** The map keeps room on its right for the widest name (at most 35% of the map), so no name runs off the
  edge; an unseen copy of every dot is placed before the names, so a name never covers another place's dot (it waits
  for a closer zoom and is named on hover, as colliding names already did). Charts (every name kept) are unchanged.
- **Money.** The ledger strip's values keep 3 px off each other and the bars; one with no room is shown while its bar
  is pointed at, drawn over everything. A middle bar's check marks go above the bar, else below, else left of it, else
  higher, at the first spot clear of every name and bar (the round trip's mark sat on Cistenique's name). Entry 38's
  quiet columns are unchanged.
- **Glossary.** The card holds, under the definition: where the term is in the case open in the workbench (up to five
  records, each a kind mark and title, the kind, date and snippet on reveal; "Not in this case's records" when none),
  the catalogue's entry (each area, opening it in the Red Flags catalogue, its counts on reveal), and the terms around
  it (those whose definition names it; its neighbours in its first area). The letter rail's rows are at most 25 px
  from the top, so all 27 letters fit above the bottom corner (Y was cut and Z gone).

## 56. Keep and Bring in, after the visual check: cards filled, names whole on hover, the dev hydration mismatch (30 Oct 2026)

A check of the running app at 1440×900 on the 1MDB demo found empty cards, cut names and a hydration mismatch on
Keep (49) and Bring in (50). The calls:

- **Backup & restore holds what a backup holds, by kind.** Eight tiles from the case's standing (the counts Search
  shows): parties, links, claims, evidence, sources, dated events, open leads, documents, each sized to its number
  (no tile grows to 260 px for one figure). The documents' size and place are on hover. What stays out (service keys,
  security log) is one quiet line under them. Sealed or not is the status colour; "not sealed" and what it means are
  on hover. It needs no action to use the app, so it is not an alert.
- **"Records" were two different counts; each now says what it counts.** Backup's 496 was Safety & data's "case
  records" (parties plus links). Delete's 4,526 is every database row the case owns, in every table (party facts,
  evidence, joins, review history). Neither was wrong. Backup no longer shows a "records" figure (it counts by kind).
  Delete's tile reads "database rows removed", and the tables are listed under the tiles, biggest first, with the
  reporter's names for the ones a reporter knows (parties, links, facts about parties, link evidence).
- **Delete: the three steps fill the panel beside what goes.** The step rail moved from the header into the confirm
  panel as a vertical rail. Each step holds its own part: the count, the name and its box, the button. The step to do
  now is in the alarm colour. "Preview ready…" is gone; a blocked deletion still says so. The four tiles span the
  panel's width, the rows' tile the widest.
- **Access: the server's setup moved under the people.** The right column ran off the screen and the left was empty
  below the people. The setup marks are now a grid of tiles at the foot of the people's column. The five ways in share
  the right column's height, each a bigger word. The grid's row is bounded, so a column scrolls inside itself and is
  never cut off. "Network access is off" and "a person" keep their words; what they mean is on hover (also in
  Settings › People and access).
- **Connectors.** A party's name ends in an ellipsis, the whole name on hover. The list's grid column could grow past
  the panel, so the ellipsis never showed. "Sent from this case" with nothing sent is one line ("nothing this week").
  The room goes to the picked party: its note and the facts a lookup can match on (other names, jurisdiction,
  registration, LEI, dates, address). A party with only a name says so in one line.
- **OpenAleph corpus.** "In OpenAleph" with nothing sent says in one quiet line what it holds. "What stands out" with
  nothing to list takes the rail's free height, its state ("OpenAleph off") big in the middle and the sentence on
  hover. A watched name found nowhere is drawn bigger in the centre pane.
- **Search.** No Recent card until there is a search; Try takes its width. The keys `?` moved to Try. A long name to
  try ends in an ellipsis, the whole name on hover.
- **The hydration mismatch came from `next dev`, not the screens.** React reported each Reveal's id differing between
  the server and the browser. Decoding the two ids showed the server's tree had one extra two-child level above the
  stage. That is Next 15.5's dev-only segment explorer, which wraps segments in its own nodes. The mismatch came on a
  page's first load, not on every load. With `experimental.devtoolSegmentExplorer: false` in next.config.mjs, five
  runs of the same pages (fifteen loads) showed none; with it on, the control runs showed it again. The built app
  (`output: 'export'`) never had the explorer. Recent searches were already read from localStorage in an effect, so
  they were not the cause.

## 57. Check's screens and Decide: each pane shows something of its own, and fills its room (30 Oct 2026)

A visual sweep of the 1MDB demo at 1440×900 found these, and each is changed so:

- **Is it real? with no file** was one line. It now fills the screen: "Nothing to check yet", the two ways in as large
  cards (The Drop; Links & captures, which `?drop=links` now opens on The Drop's second tab), and the four layers of the
  item view (CHECK_3: provenance, source, hints, you decide) drawn quietly, each one's explanation on its title. Under
  the ways in, "Recorded without their files" lists the case's pictures, video, recordings and posts that the case
  records as links or that were not downloaded (a source's `metadata_json` has `not_downloaded` or `link_only`), with
  why on hover. They are listed there, not in the item rail: with no file there is nothing for the four layers to
  examine (no credentials, no fingerprint), so they are a to-do, not an item.
- **Decide**: the evidence pane and the card no longer say the same thing. A decision with no passage of its own (a
  Red Flag's "records cannot show" part) has, in the evidence pane, what the records show between its parties (Case
  home's link rows, now `party-links.tsx`, up to eight, larger), or else why it is asked and what the case holds; the
  card has the question, the proposal, the parties and the answers. With a passage, the pane has the passage and the card
  the proposal (it no longer repeats the passage). "What happens" is a mark in the card's top line, its words on hover,
  instead of a heading over 250 px of nothing. The answer keys (1/2/3 on Decide, S/D/U on Case home) are behind a `?`
  in the card's top line. The demo's line is its mark, the count, "pre-decided" and Undo them; that the demo decided
  them, why, and the counts by kind stay on hover.
- **Chain of Custody**: a small chain grows (CSS zoom, up to 1.5, never past what its columns' width allows) to fill
  the room the log leaves it, instead of floating centred in empty space (`growScale`, unit-tested; Fit still scales
  down). The claim picker is wider (up to 760 px), a longer claim ends in an ellipsis with the whole sentence on hover.
  The claim card's Done checklist keeps only the rules not met in sight (an alert); the whole list is on the name. The
  line key is a mark in the drawer, drawn on hover.
- **To check**: one indicator asks each group the same question, so three cards had the same title. A card's title is
  now what its Red Flag found, as the flag's summary words it ("3 payments between Tanore Finance Corporation and
  Granton Property Holdings Limited"), with the years the flag covers; under it the question and why it is there (the
  rest of the summary: "Both are held or run by …"). An item with no flag keeps its question. The amount is not there:
  the item and its flag's facts carry the number of payments, not their sum (BO-031's facts: count, the two parties,
  the holders). The S/D/U keys are behind a `?` by the counts. Cards keep to their content, the answers beside the text.
- **Claims** with no claim open: under the status bars, "Left to do": near done (not yet shown, 70 % or more), under
  50 %, not graded, leads, each a large count that filters the list (one at a time, with the status and the words;
  Clear clears it). A list of claims was tried first; it repeated the left list's sentences on the same screen.

## 58. Similar documents and deleted documents: the live test cleans up at the end (30 Oct 2026)

- **Question:** `test_the_corpus_is_searched_with_highlights_and_similar_documents_are_found` failed on over a quarter
  of the OpenAleph live CI runs (8 of the 29 finished runs listed on 30 Oct; a ninth failed installing dependencies):
  OpenAleph's more_like_this answered `results: []` for the note, also after 120 s, while its steps passed 30 times
  in a row on a long-running local stack.
- **Cause (not the Workbench's):** OpenAleph 5.3.1 (images `ghcr.io/openaleph/openaleph:5.3.1`, openaleph-search
  5.3.1; openaleph-search `main` still has it) builds more_like_this with `boost_terms: 1`. Elasticsearch 9.5.5
  (Lucene 10.5.1) picks the like document's terms per shard and weighs each by
  `idf = 1 + ln((numDocs + 1) / (docFreq + 1))`, where `numDocs` counts live documents only but `docFreq` also counts
  deleted ones still in the segments (soft deletes, kept until a merge, which a small index rarely needs). On a shard
  where a term's `docFreq` passes about e × (live documents + 1), that weight is negative; with `boost_terms` set, the
  term query gets boost `weight / best weight`, negative when some terms are positive, and Lucene refuses it: the shard
  fails with `illegal_argument_exception: boost must be a positive float, got -0.79`. Elasticsearch still answers 200
  with the other shards' hits, and OpenAleph does not pass `_shards.failed` on, so a document on the failed shard is
  silently missing. The live tests deleted each test's collection straight after it, so by the search test the
  documents index held 2 live documents and 36 deleted ones over its 10 shards; whether the memo landed on a shard that
  fails is down to its id's hash.
- **Evidence:** a fresh local stack after the four tests before it (per-shard live/deleted 0/8, 0/2, 0/0, 0/1, 0/0, 0/6,
  2/6, 0/2, 0/8, 0/3) gave the same query, run by hand, a failed shard with that message; a one-shard index with the
  memo re-written six times fails the same way, and the same index with `boost_terms` 0 does not.
- **Minimal reproduction** (any Elasticsearch 9.5.5, one shard):
  ```
  PUT mlt-repro {"settings":{"number_of_shards":1},"mappings":{"properties":{"content":{"type":"text","term_vector":"with_positions_offsets"}}}}
  PUT mlt-repro/_doc/like?refresh=true   {"content":"Meridian Holdings records show Angela Merkel"}
  PUT mlt-repro/_doc/other?refresh=true  {"content":"Angela Merkel discussed Meridian Holdings with the finance desk"}   (7 times)
  POST mlt-repro/_search {"query":{"more_like_this":{"fields":["content"],"like":[{"_id":"like"}],"min_term_freq":1,"min_doc_freq":1,"boost_terms":1}}}
  ```
  The search fails with "boost must be a positive float"; with `"boost_terms":0` it finds `other`.
- **Where to fix it upstream:** openaleph-search `query/more_like_this.py` (drop `boost_terms`, or make it a parser
  setting); OpenAleph's search views (say when `_shards.failed` > 0 rather than answering a partial list as complete);
  Elasticsearch's `XMoreLikeThis` (an idf that cannot go negative when deleted documents are counted).
- **Why nothing in the app:** the app cannot avoid it or see it. OpenAleph takes only `mlt_min_doc_freq`,
  `mlt_minimum_should_match`, `mlt_min_term_freq`, `mlt_max_query_terms`, `mlt_min_word_length` and
  `mlt_max_doc_freq`; none of them keeps the weight positive, since it depends on each shard's live and deleted counts.
  Its answer carries nothing that says a shard failed. A user can meet it too: a small collection whose documents were
  re-processed or deleted can show "no similar documents" for one that has some.
- **Call:** `backend/tests/test_openaleph_live.py` keeps the collections it makes until every test has run (a
  session fixture), so the tests no longer fill the index with deleted documents before the search test; and the
  progress test's three files each get their own text (three files with the same text were one OpenAleph entity
  written six times, enough to fail a shard holding it, the memo and little else). No assertion changed. What is left
  is each document's own earlier versions (two writes each, three for the memo analysed again), which keeps every
  shard under the limit. On 10 fresh local stacks after the change (CI's pytest command each time; the last 6 with
  the progress files apart, where no document was written more than 3 times) the similar documents test passed every
  time and no shard failed the query. Running the live tests again on the same stack straight after a run can still meet the
  bug, through the collections the last run deleted; CI starts from a new stack each time.

## 59. A browser check for every screen: overlapping text, cut-off text, the page scrolling, console errors (31 Oct 2026)

- **Question:** the same visual bugs kept coming back after each fix, found by eye in sweep screenshots: names and
  labels on top of each other, words cut off with no "…" and no way to read the rest, the page scrolling, hydration and
  key warnings (architecture review of 31 Oct, "highest payoff" item 1).
- **Call:** `frontend/scripts/check-screens.mjs`, run as `npm run check:screens -- --base http://localhost:3000 --case <id|auto>`.
  It opens every screen in Chromium (Playwright) and fails on: two seen text boxes crossing (HTML text measured by its
  own words, SVG `<text>` too); text hidden by a clipping box with no ellipsis, or an ellipsis with no Reveal, title or
  accessible name to show the rest; words running outside their own box; the page scrolling down or sideways; console
  errors, `pageerror`, hydration and React key warnings. Panels whose content covers under 40% of their height are
  reported, not failed ("Fill the space").
- **Why this way:** the screens are read from `lib/stages.ts` and the settings list in `app/settings/page.tsx`, so a new
  stage part or settings pane is checked without touching the check. The theme is set the way the app keeps it
  (`localStorage` `pai:appearance`) before the page loads. Overlaps under something opaque that belongs to neither text
  (a dialog over the page) and the same words drawn twice in one place (an SVG halo) are not counted; a chip that
  half-covers a name is. Reduced motion is on so nothing is measured mid-animation. `--self-test` proves each check on
  a built-in page with each bug once and its harmless look-alike beside it, with no app running (13 of 13 pass).
- **Exceptions:** `frontend/scripts/check-screens.allow.json`; every entry names its class, screen (a glob), optionally
  width, theme and a text or CSS-path match, and must give its reason. It starts empty: no exception is accepted yet.
- **CI:** `.github/workflows/screens-ci.yml` builds the static export, lets the API serve it on one origin (ADR-0004),
  builds the 1MDB demo case offline (records, no downloads) and runs the check; by hand (1440 px, default theme, or the
  inputs given) and nightly (both widths, all five themes). It is not on pull requests: its run time on a runner is not
  measured yet; the step summary and the uploaded artifact hold the report and the screenshots.
- **Not done yet:** the first full run against the app. The servers were down when the check was written (the
  container had restarted; nothing listened on 3000 or 8000) and starting them was not permitted, so the thresholds
  are calibrated on the self-test page only, not on the app's screens.
