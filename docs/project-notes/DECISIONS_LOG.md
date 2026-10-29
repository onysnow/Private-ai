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
