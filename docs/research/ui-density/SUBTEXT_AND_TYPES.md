# Sub-text and types: where the 29 Oct rule still has work to do

Research inventory · 29 Oct 2026 · no app code was changed.

The rule (Ony, 29 Oct): titles, important data, alerts, numbers and icons show; sub-text (read counts, timings, explanations, secondary details) is revealed on hover or click; what *type* a thing is gets inferred through the UI (icon, shape, colour, position) and named on hover or click; and where a row or card has a lot of empty space, the text or icon gets bigger.

## The answer first

- **Only one screen follows the rule today: Following.** `components/ui/reveal.tsx` is used by `features/following/following-screen.tsx` and nowhere else. Every other screen still writes its sub-text and its type words out in full.
- **The heaviest offenders** are the screens that were never redesigned and are still stacked cards of forms with full-sentence descriptions and `<small>` metadata lines: Library (`features/documents/documents-panel.tsx`), the Dossier inside Connectors (`features/dossier/dossier-panel.tsx`), Claims (`features/claims/claims-panel.tsx`), OpenAleph corpus (`features/corpus/*`), Connector findings (`features/review-queue/review-queue-panel.tsx`), the Relationships detail, Timeline and Places panels, Backup, Delete and Access (`features/security/security-panel.tsx`). Among the redesigned screens, the most sub-text sits on The Drop's read receipt, Links & captures, Before you run, Watch the run, Chain of Custody's detail panel, Money's checks column and Safety & data.
- **The commonest categorical words** are: claim status written beside its shape, flag level written beside its bars, party kind written as a schema word ("Company", "Person", `LegalEntity`) or as its first letter, proposal kind ("name", "claim", "quote", "link", "date"), decision kind ("Proposals", "Matches", "Watchlist"), evidence stance ("supports", "contradicts", "context"), source type ("Web page", "Public record"), actor ("AI draft", "found by the app", "by a person"), and service mode ("OFF", "ASK FIRST", "AUTOMATIC").
- **The app already has most of the marks it needs, but several screens disagree.** "Disputed" is `✕` in the status grammar, `!` in Search and `×` on Case home's mini-network; "not yet shown" is `○` everywhere except The Wire, which uses `?`; a party's kind is a Lucide icon in a coloured ring in the Relationships network, a shape (circle, house, diamond, square) on Case home's mini-network, and the first letter of its schema on party chips. `◉` means "watchlist" in Decide and The Drop, "only a person" in Learn, and "no requests logged" in Safety & data; `◇` means "proposal" in Decide, "AI" in Safety & data and "kept by itself" in Story's versions. A vocabulary to standardise on is in the cross-screen summary.
- **Several screens already hide things with the browser's `title` tooltip** (Decide's kind icon, Case home's change chips and level chips, the mini-network count, the Red Flags coverage line, Safety's stores). A `title` cannot be reached by keyboard or touch; these should move to `Reveal`.
- **Suggested order:** Case home, Decide, The Drop (with Links & captures), Red Flags, Reading room, then Chain of Custody, Money, Safety & data, Story, AI runs; the legacy panels last, or together with their redesign (open question 2).

## How to read this

Paths are relative to `frontend/`. Line numbers were read in the files on 29 Oct. Each screen has up to five parts:

1. **Keep** – what stays visible.
2. **Move into a reveal** – the sub-text, with `file:line`, what it says, and the visible thing it should hang on.
3. **Infer the type** – a type, kind or state written as a word, with a proposed mark (and the existing mark to reuse, where there is one).
4. **Exceptions** – what looks like sub-text but should stay visible, and why. The "floor" in `docs/research/ui-simplification/UI_SIMPLIFICATION_RESEARCH.md` §3 (from the Authority System Suite doctrine) is the reference: claim status, flag level with "indicator, not a finding", innocent explanations, provenance one click away, AI marking, what leaves the computer, publication gates, safety notices, typed confirmation, failed files, contradictions, and found/shown counts may not be removed.
5. **Bigger** – rows or cards whose CSS shows small type in a box much taller than it, where text or icon should grow once the sub-text moves out.

"Reveal" below means `<Reveal>` from `components/ui/reveal.tsx`: on a mark that is not a control (`tabbable` default), or on a button or link with `tabbable={false}`.

---

## 1. The frame (every screen)

`components/frame/app-frame.tsx`, `components/case/section-screen.tsx`

**Keep:** breadcrumb, the two edge handles, the bell with its count, ⌘K box, stage names and numbers in the left edge.

**Move into a reveal**

| Where | What it says now | Hang it on |
|---|---|---|
| `components/frame/app-frame.tsx:418` | "▸ Case · Steps" label beside the left handle | the left handle (the first-use hint at 419–420 already covers new users) |
| `components/frame/app-frame.tsx:251` | each palette command's `<small>` hint ("Where the case stands and what needs you", the stage line, "For this session; keep it from the bar") | the highlighted command only (show the hint of the active row, not every row) |
| `components/frame/app-frame.tsx:310` | case switcher: the case's question and "last at …" under every case | the highlighted case row |
| `components/frame/app-frame.tsx:446` | "Hide screen" `title` "Cover the screen at once (⌘⇧H or ⇧Esc)" | Reveal on the button (title is mouse-only) |
| `components/case/section-screen.tsx:69` | `ss-line`: the stage's sentence (`lib/stages.ts:16,25,31,38,45`, e.g. "Decide what the evidence shows. Every status shows a shape and a word…") under every stage page's tabs | the stage name `<h1>` |
| `components/case/section-screen.tsx:59` | "step 2 of 5" eyebrow | the stage name; the stage colour and number already place it |

**Infer the type:** the bell is the emoji `🔔` (`app-frame.tsx:324`) while Case home uses a drawn SVG bell (`features/case-home/case-home.tsx:467`). Use the SVG in both.

---

## 2. Case home (`/`)

`features/case-home/case-home.tsx`, `decision-card.tsx`, `mini-network.tsx`, `features/ai/ai-strip.tsx`

**Keep:** case name, the question, the seven standing numbers with their ✓ ✕ ○ marks, the reading file's name and progress bar, the three Bring-in counts, the Check bar and claim texts, Next up's question, evidence and three answer buttons, flag names with their level bars, the change counts, the year rail's years, the mini-network.

**Move into a reveal**

| Where | What it says now | Hang it on |
|---|---|---|
| `case-home.tsx:155` | "The question" eyebrow | drop it; the question's place and type size say it |
| `case-home.tsx:171–178` | each strip cell's second line: "claims supported", "claims disputed", "not yet shown", "to decide · need a person", "money traced from 3 sources · 12 payments", "41 events · 9 years", "documents · 2 unread" | the number (the ✓/✕/○ marks name the first three; a coin, calendar and page icon the last three) |
| `case-home.tsx:228–229` | the reading file's state line ("Reading with OCR · page 6 of 11", "Read · 214 passages") | the progress bar / the thumbnail |
| `case-home.tsx:233` | "4 names and 2 dates proposed so far" | the file name |
| `case-home.tsx:242` | "+ Drop documents anywhere" | keep the `+` and a drop icon; words on hover |
| `case-home.tsx:126` | "· scroll" hint in every stepper | the "1 of n" |
| `case-home.tsx:261`, `sourceLine` 248–258 | under each claim: "1 source for · 2 against · Harbour Gazette, land register · 1 lead open" | keep "1 for · 2 against" as two numbers with ✓/✕ marks; source names and leads in the reveal on the claim |
| `case-home.tsx:287` | "No claims yet. A claim is a sentence you may publish; add one in Check." | keep "No claims yet"; the definition on hover |
| `case-home.tsx:319` | "new · lights 2015, 2017–18" on each flag card | "new" as a dot (Red Flags already uses `rb-new`), years on hover |
| `case-home.tsx:329` | "A flag is a pattern in the records worth a look, never a finding." on the empty state | see Exceptions |
| `case-home.tsx:352–354` | "Since Tue 28 Oct" eyebrow and "Next time you open this case, what moved in between shows here: who did it, and where." | the strip's title |
| `case-home.tsx:356–357` | each change's actor as a `title` ("found by the app", "drafted, to review") | Reveal on the chip (see actor marks below) |
| `case-home.tsx:390–393` | Next up footer: "Accepting adds X; Undo for 5 s." / "12 to decide in this case. Your answer waits 5 s before it is sent, so you can undo it." | "Open Decide ↗"; keep only the held line "Saved in a moment: Yes · Undo Z" visible |
| `case-home.tsx:433–434` | each year's event count and "· flag" word | the year; the count as the bar under it (already drawn, `<i>` at 435), the flag as the existing red underline (`case.css:296`) |
| `case-home.tsx:452, 454` | "lights 2015, 2017–18 everywhere · as of 2018"; "Nothing. Point at a party to light it everywhere." | the party chip; the empty state as a ghost chip with the sentence on hover |
| `case-home.tsx:539` | "Switch case ⌘O" | keep the button, the key on hover |
| `case-home.tsx:471` | "Hide screen ⌘⇧H" | keep, see Exceptions; the key on hover |
| `decision-card.tsx:152` | the locator line "file.pdf · p. 4 · scanned, OCR" | the excerpt or the page thumbnail |
| `decision-card.tsx:160–164` | the "why" line (actor, level word, the reason sentence) | keep the AI mark and the level bars; the reason on hover of the question |
| `mini-network.tsx:182` | "6 linked · 14 in the case · as of 2018", with a `title` explaining it | keep the numbers; the sentence as a Reveal, not `title` |
| `mini-network.tsx:179–181` | the key "shown / not yet shown / disputed" | Reveal on a small "key" mark; the line styles are the marks |
| `features/ai/ai-strip.tsx:51` | "AI: 1 draft waiting for review · last run 14:02" | keep "AI · 1 waiting"; "last run 14:02" on hover |

**Infer the type**

| Where | Word now | Mark |
|---|---|---|
| `case-home.tsx:238–239` | "outside findings to review", "watchlist hits" | Decide's kind icons `◎` and `◉` (`features/case-home/decide-screen.tsx:21`), named on hover |
| `case-home.tsx:381` | "One thing only you can check / decide" heading | the decision kind icon before the question; heading words on hover |
| `case-home.tsx:451`, `decision-card.tsx:63` | the party's kind as the first letter of its schema ("C", "P", "T") | the party icon set (`components/network/party-icons.ts:10`, Lucide icon in the `PARTY` ring colour, `lib/viz-tokens.ts:55`) |
| `mini-network.tsx:68–81` | party kind as circle / house / diamond / square (a fourth system) | the same party icons, so Case home matches the Relationships network |
| `mini-network.tsx:137` | disputed as `×` | `✕` from `components/status.tsx:11` |
| `case-home.tsx:359` | "AI" tag on a change | keep the plum AI mark; it is the AI mark |
| `case-home.tsx:284`, `components/status.tsx:22–25` | `StatusChip`: shape plus "Supported" / "Disputed" / "Not yet shown" | shape only, word on hover (but see open question 1) |
| `case-home.tsx:319, 327`, `components/status.tsx:27–31` | `LevelChip`: bars plus "Textbook" / "Strong" / "Faint", meaning in `title` | bars only, word and meaning in a Reveal (open question 1) |

**Exceptions:** the innocent-explanation line on Textbook cards (`case-home.tsx:322`) is on the floor (innocent explanations stay visible). The "never a finding" sentence on the empty flag state (329) can shorten but the idea stays (floor 2). "Hide screen" stays as a visible button: it must be findable in a hurry. Error lines with Retry (169, 313, 384) stay.

**Bigger:** `styles/case.css:72–76` `.ch-num` cells stretch to the strip's full height (`height: 100%`) with an 11.5 px label; once the label moves to a reveal, the number (`clamp(18px, 1.8vw, 26px)`) and its mark can grow. `case.css:286–299` the year rail is `min-height: 52px` with a 14 px year and a 10.5 px count: with the count gone, the year can be 18–20 px. `case.css:303` "Pointing at" shares that 52 px row at 12.5 px. `case.css:205` `.ch-party-kind` is a 10 px letter in an 18 px disc; an icon at 13–14 px fills it.

---

## 3. Start a case, Inbox, interrupt notice

`features/case-home/case-home.tsx` (FirstCase), `features/new-case/new-case-setup.tsx`, `features/inbox/inbox.tsx`, `features/inbox/interrupt-notice.tsx`

**Move into a reveal**

| Where | What it says now | Hang it on |
|---|---|---|
| `case-home.tsx:490` | "A case holds what you bring in, what you check, and what you can show. Nothing leaves this computer unless you send it." | see Exceptions: first-time user |
| `new-case-setup.tsx:276` | "(you can write it later)" | the field label |
| `new-case-setup.tsx:281` | "(optional: skip it and the app suggests kinds from what you bring in)" | the step title "What kind of case" |
| `new-case-setup.tsx:285` | each area's summary as `title` | Reveal on the chip |
| `new-case-setup.tsx:293` | each "what you have" line ("PDFs, scans, e-mails, pictures") | the option; give each option an icon |
| `inbox.tsx:88` | each row's reason line | the row's title |
| `inbox.tsx:129` | "3 snoozed on this computer; each comes back by itself." | keep "3 snoozed" as a count, the sentence on hover |

**Infer the type:** `inbox.tsx:85–86` writes the actor ("AI draft", or the actor's name in `<small>`) and the level word. Use Decide's kind icon for the row's kind, the plum AI mark, the level bars.

**Exceptions:** the interrupt notice (`interrupt-notice.tsx:206–212`) is an alert: title and reason stay. FirstCase's one sentence is the first thing a new user reads and says nothing leaves the computer: keep it (floor 4 and first-use).

---

## 4. Decide (`/decide`)

`features/case-home/decide-screen.tsx`, `decision-card.tsx`

**Keep:** "To decide", the kind chips with counts, the queue rows' questions, the evidence pane, the card's question, proposal and answers, the bottom count, the session tally `✓ ✕ ○` and the LAST 10 shapes, the held-answer toast with Undo.

**Move into a reveal**

| Where | What it says now | Hang it on |
|---|---|---|
| `decide-screen.tsx:157` | "Kestrel · only you can decide these" | the "To decide" title |
| `decide-screen.tsx:163–168` | "Order" and the long option words "by source (read once, decide all)" | keep the select, short options ("Source", "Impact", "Oldest"), the longer meaning on hover |
| `decide-screen.tsx:170` | "Showing the first 200 of 15,000; each one you decide makes room for the next." | keep "200 of 15,000" (floor 11: found/shown counts), the clause on hover |
| `decide-screen.tsx:178` | "n left" beside each group name | keep the number, drop "left" |
| `decide-screen.tsx:179–181` | "pages read: 3 of 11" with a `title` | the page bar (already drawn); the words in a Reveal on it |
| `decide-screen.tsx:194` | each row's second line: actor · kind word · age ("12 min") · level | keep the level bars; actor, age in the reveal on the row (kind is already the icon at 192) |
| `decide-screen.tsx:206` | "Proposals · 3 of 40" eyebrow over the card | the kind icon; "3 of 40" is already in the bottom bar (225) |
| `decide-screen.tsx:51` | "no locator" when there is none | show nothing |
| `decide-screen.tsx:60` | "words this rests on" legend | the first `<mark>` |
| `decide-screen.tsx:67–68` | "When the value is filled in where the record lives, this goes by itself." / "This kind has no passage to show." | the "Open …" link |
| `decide-screen.tsx:235` | the key strip "J K move 1 2 3 decide Z undo O open the source" | open question 6 |
| `decide-screen.tsx:241` | "Each answer waits 5 s, so you can undo it." (shown when nothing is held) | the bar; the held toast is the alert |
| `decision-card.tsx:110–115` | "What happens" block | on Decide it is the card's consequence and is in the mockup; keep but see open question 6 |

**Infer the type**

| Where | Word now | Mark |
|---|---|---|
| `decide-screen.tsx:160–161` | chips "Proposals 12", "Matches 3", "Watchlist 2" | the kind icon from `KIND_ICON` (line 21) and the count; word on hover |
| `decide-screen.tsx:192` | the kind icon exists but is named by `title` | Reveal instead of `title` |
| `decide-screen.tsx:194` | `KIND_LABEL` repeated in words after the icon | drop it |
| `decide-screen.tsx:206`, `63` | kind word in the eyebrow | the icon |
| `decision-card.tsx:161` | actor name / "AI draft" | AI plum mark; a person as initials (the `lk-initials` disc from `features/lock/first-open.tsx:94`) |

**Exceptions:** the failure panel (`decide-screen.tsx:212–216`), "Could not refresh" (173), the save-failure toast (237) stay. Bulk-accept confirmation text (185) stays: it is a confirmation of a batch action (floor 8).

**Bigger:** `styles/case.css:339` `.dc-kind` draws the kind glyph at 12 px in a 22 px-high slot beside a two-line row; with the second line gone the row is one line, and the icon should be 15–16 px, the same size as Following's kind icon (`following.css:22`, 20 px).

---

## 5. Bring in › The Drop (Digestion line and History)

`features/the-drop/the-drop.tsx`

**Keep:** the drop field's arrow and title, the tab names with counts, "● Reading · n files", each lane's file name and its seven stage marks, the Waiting column, totals bars, Ready for you's big number, the problems list, Open the reading room, the file strip.

**Move into a reveal**

| Where | What it says now | Hang it on |
|---|---|---|
| `the-drop.tsx:140` | each lane's note under the file name (✕ / ⧗ / ⚠ plus the reason) | keep the mark; the reason on hover of the mark |
| `the-drop.tsx:145` | each box's detail ("214", "37", "none", "12/40") | keep: these are numbers (the rule's "numbers"); the full words are already in `title` at 143, which should become a Reveal |
| `the-drop.tsx:151` | "18 of 23 read · 2 reading · 3 waiting" fold line | keep "18 of 23"; the rest on hover |
| `the-drop.tsx:569–570` | "or press O to choose files · a folder" | keep the two links as icons (file, folder), the key on hover |
| `the-drop.tsx:595` | "· reconnecting" / "· checking every 2 s" | the "● Reading" chip |
| `the-drop.tsx:615` | "Since 28 Oct 14:02" | the "This drop" card title |
| `the-drop.tsx:617–618` | "Files: 12 dropped · 3 inside"; "OCR language: English + French" | keep "12 · 3 inside"; the OCR language on hover of a small OCR mark |
| `the-drop.tsx:623–626` | the whole "What happens next" card ("Accepted names and claims join the case. Nothing is added until you accept it.") | the "Ready for you" title |
| `the-drop.tsx:630, 634` | "Every drop, newest first, and what it brought in."; "Each file, step by step. Arrows move through the line; J and K through files." | the tab names |
| `the-drop.tsx:652–653` | the legend of stage marks | Reveal on each column header (642) naming its states; or one "key" mark |
| `the-drop.tsx:654` | "Proposed by: the Workbench's name-finder (rules) · AI none in a drop" | see Exceptions (AI marking): shorten to the `ƒ` app mark with "no AI" visible |
| `the-drop.tsx:663` | "proposals waiting, from 4 documents" | the big number |
| `the-drop.tsx:666` | "3 are medium or low and ask a question" | keep as a count chip with a `?` mark (it changes what the person does next) |
| `the-drop.tsx:678` | key strip | open question 6 |
| `the-drop.tsx:192–193` (History) | "12 files saved · 3 inside them · 1 already in the case · 1 not taken" | keep counts as marks (`=` for already there, `✕` for not taken, the `dp-stage` marks already used at 195–201) |
| `the-drop.tsx:190` | each drop's date and time | the drop's label |
| `the-drop.tsx:605` | "Already in the case as … · same fingerprint" | the `=` mark |

**Read receipt** (`the-drop.tsx:258–288`) — the densest card on the screen:

| Where | What it says now | Hang it on |
|---|---|---|
| `the-drop.tsx:262` | the cleaned title and, under it, the raw file name in `<code>` | keep the title; the raw file name on hover |
| `the-drop.tsx:266–267` | "Fingerprint SHA-256 3fa2c1…9b0d" with copy button | a fingerprint icon with copy; the hash in the reveal |
| `the-drop.tsx:268–269` | "Pages 11 · OCR"; "Read OCR · 42 s" | keep "11 pages"; how it was read and the seconds on hover |
| `the-drop.tsx:273–275` | "By proposer: Name-finder: 31 of 40 accepted · 2 wait" with a `title` | the Proposals row; per-proposer rates on hover |
| `the-drop.tsx:276` | "Watchlist: No watched names" | show only when there is a hit, as the `◉` count |
| `the-drop.tsx:277` | "Feeds: ML-021, BO-007" | small level-bar marks, indicator names on hover |
| `the-drop.tsx:281` | stall advice "Stop reading, then read it again with Try again." | see Exceptions |

**Infer the type**

| Where | Word now | Mark |
|---|---|---|
| `the-drop.tsx:112, 665` | the "Proposed" chip on every waiting cell and every Ready row | drop it: a waiting proposal is the default; use the same dashed outline Chain of Custody uses for "proposed" (`custody` key, `chain-of-custody.tsx:440`) |
| `the-drop.tsx:665`, `KIND` 47–50 | "Names", "Claims", "Quotes", "Links", "Dates", "Emails & phones" | a proposal-kind icon set (see vocabulary), named on hover |
| `the-drop.tsx:92` | file type as upper-case extension text "PDF", "DOCX" | fine as the thumbnail's text where there is no picture; keep |
| `the-drop.tsx:256, 263` | verdict chip "✓ Read cleanly" / "Read, with notes" / "✕ Not read" | the mark alone (✓ / ⚠ / ✕), words on hover |
| `the-drop.tsx:191` | "One at a time" chip on a history entry | an icon (a single file) with the words on hover |

**Exceptions:** problems first (`the-drop.tsx:668–673`) and failed-file notes are floor 9 (failed files must not vanish): the ✕ and the file stay; only the reason moves. "Nothing leaves this computer" (`the-drop.tsx:620`, `583`) is floor 4: keep it, but as the short `⌂ Nothing leaves this computer` chip first-open already uses (`features/lock/first-open.tsx:80`). The stall line (280–281) is an alert about a stuck job and stays. "AI none in a drop" (654) is AI marking (floor 4): keep "no AI" visible as a mark.

**Bigger:** `styles/drop.css:117–118` `.dp-stage` boxes are at least 30 px tall with an 11 px mark; the mark can be 14–15 px. `drop.css:26` `.dp-card` sets 12.5 px for all card text.

---

## 6. Bring in › The Drop › Links & captures

`features/the-drop/captures.tsx`

**Keep:** the link field and Capture, each capture's title and outcome glyph, the chosen capture's title and outcome chip, the lane's stage marks, the screenshot, "Open in reading room", "Quote it in the reading room".

**Move into a reveal**

| Where | What it says now | Hang it on |
|---|---|---|
| `captures.tsx:256` | "Links, files and pasted text share one drop: a link pasted into the drop is captured too." | the "Paste a link" title |
| `captures.tsx:258` | "captured 2026-10-28 14:02:11 UTC" on "Already in the case" | the chip |
| `captures.tsx:290` | each list row's short URL under the title | the row |
| `captures.tsx:306` | the full URL (and redirect `→`) under the chosen capture's title | the host as a chip, the full address on hover (as Following does at `following-screen.tsx:135`) |
| `captures.tsx:85–87` | each stage's seconds ("1.4 s") | the stage mark; the lane chip already gives "Done · 6.2 s" (127), which itself can move to hover |
| `captures.tsx:130–135` | Tool, Collector, "Signed in? No · a fresh browser, no stored cookies", Started, Ended, "Clock shown in capture" | the lane; these are custody facts, see Exceptions for which stay |
| `captures.tsx:137–141` | "What was sent / What came back · as served, not verified" request and response headers | a "headers" mark on the lane |
| `captures.tsx:193–195` | SHA-256 spaced out, copy, "of page.warc.gz" | fingerprint icon with copy; hash on hover |
| `captures.tsx:196` | "by this computer's clock" | the time |
| `captures.tsx:197–198` | each kept file with size and role | keep file names; size and role on hover |
| `captures.tsx:199` | "Local clock only (14:02:11 UTC). Independent proof not asked for." | keep "Local clock only"; the rest on hover |
| `captures.tsx:201` | the custody sentence "… captured on this computer by you; kept unaltered, in the case's records." | the "Captured" time |
| `captures.tsx:169–170` | media: platform · account · length · uploaded; "Collected … kept with this capture as media.mp4, and transcribed on this computer." | the media title |
| `captures.tsx:297` | "The page's site sees one visit from this computer's address, and so does every other site the page loads from (images, scripts, trackers): each is listed in page.har. The visit is written in Safety & data's outbound log before it goes." | the "✓ No outside capture service is used" line |
| `captures.tsx:298–300` | the two disabled switches "a later step" and "Off means off. Route: this computer's own connection." | an "↗ direct" egress chip like Following's (`following-screen.tsx:154`); the planned switches on hover of a "later" mark, or not at all |
| `captures.tsx:309` | "Visiting the page once, from this computer, in a fresh browser with no stored cookies. The receipt appears when it is kept." | the "Capturing" chip |
| `captures.tsx:313` | "A pasted link becomes a source: the page as it was, when, and proof it has not changed since." | the empty state title |
| `captures.tsx:325` | "Text on a captured page is data. It can never give an instruction to the app or to AI." | the "Capture before use" title |
| `captures.tsx:221` | "A file you add is kept as one you supplied, with you as its source." | the "Add a file I saved" button (`tabbable={false}`) |

**Infer the type**

| Where | Word now | Mark |
|---|---|---|
| `captures.tsx:290, 307, 211` | outcome word chips "Saved", "Not seen", "Link only", "Stopped", "Capturing" next to their glyph | the glyph from `captureState` (49–56) alone, word on hover |
| `captures.tsx:127` | lane chip | the glyph |
| `captures.tsx:200` | "as displayed, not verified" chip | a dashed underline on the displayed values (the app's "not yet shown" line style), words on hover |

**Exceptions:** "Content verified: not done by this system. A capture shows what was at the address, not that it is genuine." (`captures.tsx:204`) is a custody statement (floor 3, 6): keep the verdict visible; the sentence may move. The Outcome panel's reason (213) and "Nothing can be quoted from this link" (215, 218) stay: they decide whether the page may be quoted. "Signed in? No" (132) is a custody fact an editor relies on; keep it as a visible `no login` mark with the explanation on hover. robots.txt note (142) can become an amber chip with the sentence on hover. The media consent line (175, "The page's site sees one more visit…") is what the person agrees to before Collect: keep a one-line egress chip visible next to the button, sentence on hover.

---

## 7. Bring in › Following (the reference)

`features/following/following-screen.tsx` — built to the rule. Two small leftovers:

- `following-screen.tsx:326`: the chosen source's name repeated as `fl-small` in the "Changes & versions" eyebrow. It is context, not wrong; it could be the kind icon only.
- `following-screen.tsx:300, 331`: eyebrows "Sources followed" and "What leaves this computer" are titles; fine.

Its marks (`KindIcon` 57–66, `HEALTH` 30–37) should be the source-kind and health vocabulary everywhere else (Settings › Outside lookups, Safety & data's services).

---

## 8. Bring in › Search

`features/search/search-panel.tsx`, `features/marks/marks-panel.tsx`, `features/search/corpus-results.tsx`

**Move into a reveal**

| Where | What it says now | Hang it on |
|---|---|---|
| `search-panel.tsx:151` | "At p. 4, para 2" | the result title |
| `search-panel.tsx:152` | "Matched on name, alias, address" | the highlighted words |
| `search-panel.tsx:153` | "External connector result; treat as a lead until reviewed and promoted." on every outside card | the plum outside edge (the card is already plum) |
| `search-panel.tsx:156` | "2 notes" | a note icon with the count |
| `search-panel.tsx:269` | "Include reviewed duplicate copies" label | keep the checkbox, shorter label "Duplicates", the rest on hover |
| `search-panel.tsx:276` | "· one card per record", "of 120, filtered" | keep "38 results"; the rest on hover |
| `search-panel.tsx:285` | "show" / "fold" word on each group head | a chevron |
| `marks-panel.tsx:83` | "Your tags, notes and collections for this record. They stay on this machine." | the panel title |
| `corpus-results.tsx:46` | "In OpenAleph, not uploaded to this investigation." | an outside mark on the row |

**Infer the type**

| Where | Word now | Mark |
|---|---|---|
| `search-panel.tsx:145` | `TYPE_LABEL` word ("Party", "Link", "Evidence", "Document text", "Proposal") in the kind colour | the card's left edge colour (`KIND`, `lib/record-kinds.ts:14`) already says it, and the group heading names it; drop the word, or show a kind icon |
| `search-panel.tsx:77` | `SurePill` "! Disputed", "○ Not yet shown" | the status shape (but `SURE` in `lib/record-kinds.ts:41–42` uses `!` for disputed and `×` for rejected: switch to `✕` and `–` from `components/status.tsx`) |
| `search-panel.tsx:148` | each party as a ring-coloured dot plus name | the party icon (`party-icons.ts`) |
| `corpus-results.tsx:42` | "page 4 · Email" (schema word) | document-kind icon |
| `search-panel.tsx:162–164` | T, N, C buttons named by `title` | Reveal (`tabbable={false}`) |

---

## 9. Bring in › Library (legacy)

`features/documents/documents-panel.tsx` — a stacked form; no mockup screen of its own yet.

**Move into a reveal**

| Where | What it says now | Hang it on |
|---|---|---|
| `documents-panel.tsx:430–432` | card description: "OpenAleph reads every upload: PDFs and office documents, email, archives… (42 kinds of file). The Workbench's own reader takes over for … All entity/claim/evidence suggestions remain proposals until you accept them." | the title |
| `documents-panel.tsx:446` | "Select several files to import them one at a time with visible progress, then review every proposal…" | "Bulk import" |
| `documents-panel.tsx:453` | "-- resumes reviewing every document here that still has unreviewed proposals, not only a just-imported batch." | the link |
| `documents-panel.tsx:459` | "Inside archive.zip" | the indent (already drawn by `marginLeft` at 458) |
| `documents-panel.tsx:460` | file name repeated, "complete · 214 chunks · entity: 12 · claim: 3" | keep the title; status as a mark (Drop's stage marks), counts on hover |
| `documents-panel.tsx:462–463` | OpenAleph line: sync status · provider document id · awaiting / accepted / rejected | an OpenAleph mark on the row; the line on hover |
| `documents-panel.tsx:466–481` | up to 16 text buttons per document (Review proposals, Review history, OpenAleph status, Sync to OpenAleph, Refresh OpenAleph review, Find names again, …) | one "Open" plus a menu; this is action overload rather than sub-text, noted for the redesign |
| `documents-panel.tsx:491` | "· proposed · 87%" after "entity proposal" | confidence dots (`features/reading-room/reading-room.tsx:197` already draws `●●○`) |
| `documents-panel.tsx:496–498` | "Machine suggestion: no · Reporter staged: yes · Canonical relationship: no" | marks: dashed (proposed) vs solid (accepted) |
| `documents-panel.tsx:501` | "Reporter note: …" | a note icon |
| `documents-panel.tsx:524, 539` | "The claim and its exact evidence are already reporter-reviewed. Selecting endpoints…"; "State: reviewed evidence → unverified/reporter-controlled claim → staged relationship proposal → separate canonicalization." | the "Stage relationship" title |
| `components/extraction-explanation.tsx:70–109` | every proposal's "Why this was proposed" block: method, basis, chars 120–184, confidence basis, sources, caveats, review rule | a "why" mark on the proposal (the reading room already does this as "Reading why…" on request) |

**Infer the type:** `documents-panel.tsx:491` "entity proposal", "claim proposal": the proposal-kind icon. `460` `extraction_status` words ("complete", "failed", "queued"): Drop's stage marks (`the-drop.tsx:41`). `530, 534` "caption · Company" in the entity selects: the party icon in the option.

**Exceptions:** upload and import failures (`440`, `452`) stay. "Keep a second copy of …" (441) is a decision and stays.

---

## 10. Bring in › Sources & evidence (legacy)

`features/source-capture/source-capture-panel.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `source-capture-panel.tsx:84` | "Create a reporter-controlled source and a provenance-preserving evidence record. Evidence remains separate from claims until you explicitly attach it…" | the title |
| `source-capture-panel.tsx:69` | "Saved evidence 6f1c…-uuid. It is now available for claim review." (a raw ID) | "Saved"; the ID on hover, if at all |
| `source-capture-panel.tsx:102` | "4 source(s) · 9 evidence record(s) in this investigation." | two numbers with icons |

**Infer the type:** `source-capture-panel.tsx:26–29, 90–93` source type as a select of words (Web, Document, Interview, Public record, Social, Other). Chain of Custody names the same set (`features/custody/chain-of-custody.tsx:28`). Propose one source-type icon set (globe, page, speech, seal, at-sign, dot) used in both, named on hover; the picker becomes icon buttons.

---

## 11. Bring in › Connectors and the Dossier (legacy)

`features/connectors/connectors-panel.tsx`, `features/dossier/dossier-panel.tsx`, `features/dossier/ownership-chain.tsx`

**Move into a reveal**

| Where | What it says now | Hang it on |
|---|---|---|
| `connectors-panel.tsx:257` | "Multi-provider enrichment keeps one auditable session while each provider gets its own run, status, error, and result count…" | "Enrich all providers" (`tabbable={false}`) |
| `connectors-panel.tsx:209–213` | status "completed · aleph: ok (12) · opensanctions: failed" | per-provider health marks (Following's `HEALTH` glyphs) with counts |
| `connectors-panel.tsx:264` | each cluster's reasons "name: exact · birth date: year only" | the score |
| `connectors-panel.tsx:270` | "Latest decision: unsure" | the decision shape (✓ ✕ ○) |
| `dossier-panel.tsx:231` | "Caption can be changed freely. A new property value is added alongside…" | the Edit button |
| `dossier-panel.tsx:234` | "Merged alias: X now resolves to this canonical entity. Historical merge records are preserved." | a merge mark beside the name |
| `dossier-panel.tsx:235` | "Company · 14 statements · 6 relationships · 3 claims · 4 evidence · 2 leads · 1 external findings" | keep the numbers as small labelled icons; kind as the party icon |
| `dossier-panel.tsx:238–241` | identity history: counts, "Alias: … · preserved record 6f1c…" (raw ID), decisions "90% reporter confidence · rationale", "Merge audit: <uuid> → <uuid>" (raw IDs) | "Identity / merge history" title; all of it in a reveal or fold; IDs only on hover |
| `dossier-panel.tsx:242` | "Identity decisions are reporter-reviewed judgments, not facts inferred by connectors…" | the history title |
| `dossier-panel.tsx:248, 256` | "6 preferred edge(s) shown; 2 reviewed duplicate edge(s) collapsed. Expand them in the relationship graph."; "preferred presentation for 2 reviewed duplicate edge(s)" | a "+2" duplicate badge |
| `dossier-panel.tsx:255` | "evidence: supports 2 · contradicts 1" | ✓2 ✕1 |
| `ownership-chain.tsx:373–375` | the HMRC MTT17040 method paragraph | the "Holds" column header |
| `ownership-chain.tsx:344` | chart rule sentence | see Chart frame below |

**Infer the type:** `dossier-panel.tsx:253` `r.schema` word ("Ownership: A → B"): the link-family colour from `LINK` (`lib/viz-tokens.ts:90–94`) as a line swatch. `267` claim "status: text" as a word: the status shape. `268–271` lead, task, timeline and external statuses as words ("open:", "todo:", "verified", "unreviewed:"): the lead status marks from Leads (`features/leads/leads-horizons.tsx`, `STATUS_MARK`) and the timeline status mark (`features/timeline/timeline-panel.tsx:196`). `connectors-panel.tsx:250` "caption · Company": party icon. `connectors-panel.tsx:238`, `263` provider names as raw lower-case words ("aleph"): a provider label with a logo-free mark, name on hover is not needed — keep provider names, they are not types.

**Exceptions:** "⚠ review needed" (`dossier-panel.tsx:254`) and "n external finding(s) need review" (244) are alerts: keep as chips.

---

## 12. Bring in › OpenAleph corpus (legacy)

`features/corpus/corpus-panel.tsx`, `watchlist.tsx`, `entity-sets.tsx`, `corpus-insights.tsx`, `features/documents/corpus-status.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `corpus-panel.tsx:107` | card description | the title |
| `corpus-panel.tsx:113`, `corpusSyncSummary` 45–60 | four lines: "Last push: succeeded, 28/10/2026 14:02 — message", "Pending: 3 to send · 0 to remove · 1 judgement(s) · 412 record(s) in Collection", "Last cross-reference run: …", "Failures: …" | a sync health mark (Following's `HEALTH`) and "3 to send"; the lines in the reveal; failures stay visible (alert) |
| `corpus-panel.tsx:116` | "No background worker runs here: changes reach OpenAleph on 'Sync now'." | the Sync now button |
| `corpus-panel.tsx:127–131` | "(Company) in Collection", "Score 87% · name", per-property "Name (92%): A ↔ B" | keep the two names and the score as a bar; the rest on hover |
| `watchlist.tsx:253` | "Names searched in this investigation's documents whenever OpenAleph reads a new one…" | the title |
| `watchlist.tsx:271–273` | the note, "Last checked 28/10/2026, 14:02:11.", "Found in 3 document(s), 1 to decide." | keep "3 · 1 to decide"; time and note on hover; a failed check (`CHECK_STATE`) stays visible as amber |
| `watchlist.tsx:193` | "· page 4" | the hit title |
| `entity-sets.tsx:342` | "Made from the confirmed records the sync sent… where you moved things in OpenAleph's diagram stays." | the title |
| `entity-sets.tsx:366–367` | "Diagram: label · 40 record(s) · sent 28/10/2026, 14:02:11" | a kind icon (diagram, timeline, list) and the label; count and time on hover |
| `corpus-insights.tsx:425` | "The names OpenAleph's analysis found most often…" | the title |
| `corpus-insights.tsx:435–436` | "· 12 document(s)", "Alongside: A (4), B (3)" | keep the count; alongside on hover |
| `corpus-status.tsx:508` | "Read: 2 waiting · 1 in progress · 14 done · 0 failed" per stage | a small stacked bar per stage, numbers on hover; failures visible |

**Infer the type:** `corpus-panel.tsx:127` schema in parentheses: party icon. `corpus-insights.tsx:432` group labels (People, Companies, Places): fine as group headings (position), or party icons. `entity-sets.tsx:305` `KIND_NAME` "Diagram/Timeline/List": icons.

---

## 13. Check › Claims (legacy)

`features/claims/claims-panel.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `claims-panel.tsx:193` | card description "Claims stay separate from source material. Review the exact linked evidence…" | the title |
| `claims-panel.tsx:207` | each row's "60% confidence · medium evidence, high agreement" | keep a confidence bar; the grade words on hover |
| `claims-panel.tsx:257–258` | "Grade the claim on the IPCC grid from this: evidence is limited, medium or robust by its type…" | the two grade selects |
| `claims-panel.tsx:255–256` | "2 supporting · 1 contradicting · 0 context"; "From 3 sources" | ✓2 ✕1 ◌0 and a source count |
| `claims-panel.tsx:261, 266` | "No canonical relationship currently depends on this claim's linked evidence."; "Ownership · 2 linked evidence record(s)" | the section title / the relationship |
| `claims-panel.tsx:273–277` | review history: from → to status words, "40% → 60%", grade change words, rationale, override, timestamp | keep the shapes and the rationale; percentages and time on hover |
| `claims-panel.tsx:284–285` | "Exact locator: p. 4"; "Reporter note: …" | the quote |
| `claims-panel.tsx:294` | "Attach accepted evidence without changing the claim's verification status automatically. The backend rejects cross-investigation links and treats an identical claim/evidence/stance link idempotently." | the pool title (the second sentence is developer sub-text and can go) |
| `claims-panel.tsx:245` | Done rules' detail "cannot be checked here: …" | the rule's shape |

**Infer the type:** `claims-panel.tsx:206, 212` `ClaimStatusChip` writes the status word ("Confirmed", "Lead", "Unverified") with the shape — shape only, word on hover (open question 1). `219` status select options as raw lower-case words. `282` stance written as a word ("supports"): stance as the edge style (see vocabulary). `307–309` "Supports / Contradicts / Context" buttons: keep words on the buttons (they are actions), add the stance mark.

**Exceptions:** the Done list for Supported (`claims-panel.tsx:241–250`) is a publication gate (floor 5): its rules stay visible; only the long detail per rule moves to hover. The override field and its warning stay.

---

## 14. Check › To check

`features/to-check/to-check-panel.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `to-check-panel.tsx:139` | "What the records cannot show. A person decides each one; the app never does." | the title |
| `to-check-panel.tsx:74–76` | "Shell company layers · BO-007 · Its Red Flag · 2 other flags on these parties"; "Kept from See › Money · locator" | the level bars of its flag as a link mark; indicator name and id on hover |
| `to-check-panel.tsx:83` | file name, locator | the excerpt |
| `to-check-panel.tsx:148` | "The records changed, or its flag was set aside; the decision is kept." | the "No longer called for" fold title |

**Infer the type:** `to-check-panel.tsx:71` `tc-kind` word "Passage" / "Money check" / "Checklist": icons (quote marks, coin, checkbox), named on hover. `84` decision word "Shows it"/"Does not show it"/"Unclear": the ✓ ✕ ? shapes Red Flags' "records can't show" already uses (`features/act/red-flags-board.tsx:612`). `56` parties as ring-dot plus name: party icon.

---

## 15. Check › Connector findings (legacy)

`features/review-queue/review-queue-panel.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `review-queue-panel.tsx:162` | "schema: externalId → targetProp: externalId" (raw external IDs) | the relationship title |
| `review-queue-panel.tsx:168` | "Canonicalize both endpoints before promotion." | the disabled review buttons |
| `review-queue-panel.tsx:174` | "(87%)" | a score bar |
| `review-queue-panel.tsx:196, 199–201` | ledger rows: "Canonical · 2 support · 0 conflict · latest accepted"; "canonical · reporter · source linked"; "accepted · aleph · dataset · promoted" | ✓/✕ counts and a canonical mark; dataset and provider on hover |

**Infer the type:** `review-queue-panel.tsx:144–149` a table with "Provider" and "Status" columns, Status written "Company · unreviewed": party icon + review-state shape (○ unreviewed, ✓ accepted, ✕ rejected).

---

## 16. Check › Chain of Custody

`features/custody/chain-of-custody.tsx` — redesigned to CHECK_2. Already strong on marks (line styles, check chips, the seal).

| Where | What it says now | Hang it on |
|---|---|---|
| `chain-of-custody.tsx:217` | "From file → to sentence" | the column heads already say it (334) |
| `chain-of-custody.tsx:235` | "who held it · what was done · when" under "Custody log" | the title |
| `chain-of-custody.tsx:345` | AI card "28 Oct 14:02 · not accepted yet" | keep "not accepted" as the dashed outline (AI not accepted, floor 4); time on hover |
| `chain-of-custody.tsx:389–390` | each card's lines and "uploaded by Ony · 2 Oct 09:14" | who and when on hover of the card; the log underneath has them all |
| `chain-of-custody.tsx:366` | Done rule detail "waits on: …" under each rule | the rule's shape (it is also in `title` at 363, which should become a Reveal) |
| `chain-of-custody.tsx:416` | "file.pdf · lines 14–22" mono line in Detail | the title |
| `chain-of-custody.tsx:427, 463–471` | Anchor: "exact quote + 40 characters before and after, offsets 1204–1260 · 1 of 2 places · moved since it was anchored" | an anchor mark (✓ anchored / ↪ moved / ✕ lost); the words on hover; "lost" stays visible as an alert |
| `chain-of-custody.tsx:428–430` | SHA-256 "3fa2 c1d4 … 9b0d · ✓ re-checked when opened" | keep "✓ hash matches"; the hash on hover |
| `chain-of-custody.tsx:438–441` | the key (five line styles) in every Detail panel | one "key" mark |

**Infer the type**

| Where | Word now | Mark |
|---|---|---|
| `chain-of-custody.tsx:382`, `KIND_WORD` 32 | card kind written in caps ("FILE", "READING", "PASSAGE · P.4 L.14–22", "DECISION") | the column already says it (position); keep page/line as the only text |
| `chain-of-custody.tsx:421` | source type `SOURCE_WORD` ("Public record") as a check chip | source-type icon (see §10) |
| `chain-of-custody.tsx:422–423` | "Tier B", "by Registry", "interested party?" chips | tier as a letter badge is fine (it is a number-like grade); issuer on hover |
| `chain-of-custody.tsx:475` | `LevelMark` duplicated here, writes "▮▮▯ STRONG" | use `LevelChip` from `components/status.tsx` |
| `chain-of-custody.tsx:344, 350` | "AI" kind word on AI cards | the plum AI mark |

**Exceptions:** the seal (`213–214`) is meant to be copied into a methods note and stays. "✕ a hash does not match", "✕ could not re-check", "the quote is no longer in the text" are alerts and stay. "If this step breaks …" (436) is shown on request already.

**Bigger:** `styles/custody.css:43–44` `.cc-kind` and `.cc-check` are 9.5 px mono caps; if the kind word goes, the check chips can be 11 px.

---

## 17. See › The Wire

`features/the-wire/the-wire.tsx`, `wire-engine.ts`, `link-panel.tsx` — the approved prototype; the 23 Oct research left it out as the model. Small items only:

| Where | What it says now | Hang it on |
|---|---|---|
| `wire-engine.ts:1119–1121` (`.tw-chosen`, `the-wire.tsx:99`) | "Chosen because 14 of 20 links are ownership or directorship" | the pressed arrangement button |
| `wire-engine.ts:1126–1130` (`.tw-rule`, `the-wire.tsx:100`) | "Owners and directors above what they own or run, one band per step down. 40 parties, 61 links. Roll the wheel over a party to go down to it." | the arrangement button; keep "40 parties · 61 links" |
| `wire-engine.ts:1283–1291` (`.tw-counts`, `the-wire.tsx:151`) | "Showing 40 of 61 links in this window · 3 ended, drawn faint · 2 undated, always shown · 4 link sentences left off where they would overlap: zoom in" | keep "40 of 61" (floor 11); the rest on hover |
| `wire-engine.ts:1333` | "Money paid per quarter · dots are dated events" | the time strip's play button |
| `link-panel.tsx:47` | "3 sources · 2 agree" | keep |
| `link-panel.tsx:61–62` | per source "· p. 4 · supports it, reviewed 12 Oct 2026" | the stance mark; date on hover |

**Infer the type:** `wire-engine.ts:376` each party card's second line is its kind in caps ("COMPANY · CY"); kind should be an icon on the card and the jurisdiction kept (it is data). `wire-engine.ts:1168` drawer kind word, same. `wire-engine.ts:67–68` `SURE.unshown` glyph is `?` where every other screen uses `○`; `link-panel.tsx:73` flag level as a word chip ("strong"): level bars.

---

## 18. See › Money

`features/money/money-view.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `money-view.tsx:161–163` | "Euro payments only. The 3 dollar payments are kept apart and never added to these." | keep a short "EUR only" (it prevents a misread total, floor 12-like); the sentence on hover of the currency tabs |
| `money-view.tsx:178` | "4 payments" under the traced total | the total |
| `money-view.tsx:258` | "Scroll over the flow to replay it in date order · drawn up to Mar 2016 · click a band to add it to 'Traced so far' · L list view" | keep "to Mar 2016" (state); the instructions on hover |
| `money-view.tsx:259` | the key | one "key" mark |
| `money-view.tsx:260–261` | "The 20 largest of 54 flows are drawn; others (34) holds the other 120 payments, €1.2M. Totals count every payment." | keep "20 of 54 flows" (floor 11); the rest on hover |
| `money-view.tsx:234–239` | node lines "ƒ €29,400 · worked out", "= what left X minus what came in", "in €… / out €…" | keep amounts; the "=" explanation on hover of the ƒ |
| `money-view.tsx:363–364` | "6 more rows (2 above), 1 of them lit · J / K moves the lit row…" | keep "6 more"; the rest on hover |
| `money-view.tsx:386, 402` | "The ledger, in date order · EUR"; "bar height: amount, log scale (stated on the axis) · no structuring flag on these EUR payments" | the strip; keep "log scale" on the axis itself |
| `money-view.tsx:441` | each check's small "GREY HOLE · more out than in" | the check icon (`KIND` 36–41: ◐ ✱ ● ↺), name and line on hover |
| `money-view.tsx:449` | "Lead idea: … →" | the "Make a lead" button |
| `money-view.tsx:453–455` | "Does the money add up? · 4 checks"; "Worked out by the app ƒ from the euro ledger only. Each one is a question to chase, not a finding." | see Exceptions |
| `money-view.tsx:474` | "Checks re-run when the ledger or the year changes · last run 28 Oct, 14:02 · How these work" | "How these work" mark; the rest on hover |

**Infer the type:** `money-view.tsx:357` ledger "How sure" column writes "✓ Shown" (mark + word): mark only, word on hover. `463`, `470` "None found" cards each take a full card: show the four check icons in a row, filled when something was found, hollow when not, named on hover.

**Exceptions:** "Could be innocent: …" on each check (`money-view.tsx:443`) is floor 2 and stays. "a question to chase, not a finding" (455) is floor 2's "indicator, not a finding"; keep it once in the column. "Not charted: 3 payments missing something" (281) is floor 11 and stays as a count.

**Bigger:** `styles/money.css:116–122` `.mn-check` header puts a 15 px icon in a 26 px circle next to a 10 px caps word; with the word gone the icon can be 18 px. The four "None found" cards (`money-view.tsx:461–472`) each hold one line in a full card.

---

## 19. See › Relationships (legacy panel around the redesigned network)

`features/relationship-graph/relationship-graph-panel.tsx`, `graph.tsx`, `connections.tsx`, `relationship-detail.tsx`, `components/charts/chart-frame.tsx`, `components/network/network-view.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `relationship-graph-panel.tsx:172` | "Every link is a FollowTheMoney relationship record. Reviewed duplicates are folded…" | the title |
| `relationship-graph-panel.tsx:176` | footnote "18 links shown from 22 records; 4 reviewed duplicates folded into the preferred record." | keep "18 of 22" (floor 11) |
| `relationship-graph-panel.tsx:166–168` | each list row "Ownership · director · ⚠ challenged claim · independent support remains · preferred (+1 duplicate)" | family colour + alert chip; the rest on hover |
| `relationship-graph-panel.tsx:181` | "Creates a reporter-entered canonical entity in this investigation (dataset: reporter)." | the form title |
| `graph.tsx:211–219` | footer: parties, links, contested, not yet supported, crossings line, as-of sentence, footnote, "Point at a party or link for its details; click to open it." | keep the counts; sentences on hover |
| `chart-frame.tsx:58–60` | every chart's question, rule and "why" sentence under its title (used by Relationships, Timeline, Places, Ownership, Charts) | the title. The research behind ChartFrame says the rule should be visible; see open question 4 |
| `chart-frame.tsx:75` | each key section's channel words ("colour and icon: what it is") | the key section title |
| `connections.tsx:58, 67` | "3 chains of up to 4 links, shortest first; … Choose one to light it in the network."; "2 links · weakest: not yet shown" | keep counts; the weakest link as its line style |
| `relationship-detail.tsx:109` | "FtM relationship: <ftm_id> · 12 provenance statements · preferred presentation; …" (raw ID) | a "record" mark; ID on hover |
| `relationship-detail.tsx:116, 136` | "presentation only; no records were merged."; "Only evidence from this investigation is offered. Existing attachments are excluded." | the section titles |
| `relationship-detail.tsx:161` | "· evidence <uuid>" (raw ID) under each assessment | drop or hover |
| `relationship-detail.tsx:163, 167` | timestamps; "· reporter · origin" dataset words | hover |
| `network-view.tsx:89` | party `title` "Name · Company" | Reveal |

**Infer the type:** `graph.tsx:176` family chips "Owns · 6": the line swatch is the mark; keep the count, word on hover. `relationship-detail.tsx:108`, `connections.tsx:65` schema words ("Ownership"): family line colour. `relationship-detail.tsx:162` stance word: stance mark.

---

## 20. See › Timeline (legacy panel)

`features/timeline/timeline-panel.tsx` — no mockup yet (`MOCKUP_BUILD_LIST.md:162`).

| Where | What it says now | Hang it on |
|---|---|---|
| `timeline-panel.tsx:117` | "Dates from the records, the sources and your own events, kept apart by where they come from." | the title |
| `timeline-panel.tsx:123` | chart rule | see open question 4 |
| `timeline-panel.tsx:128` | "Drag the bar under the chart, or scroll over it, to look at a stretch of time." | the chart |
| `timeline-panel.tsx:139–140` | each event's "Dates in records · Verified · known to the month · graded likely" | the event's colour edge and `StatusMark` (both already drawn at 133, 135); words on hover |
| `timeline-panel.tsx:142–147` | Origin, "Claim: supported · confidence 60%", evidence locator and quote, "Evidence stance: supports, context" | the event title |
| `timeline-panel.tsx:154` | the grade select's options write the whole Bellingcat definition ("likely: several sources report it and most of the information can be verified…") | short option words, definition on hover |
| `timeline-panel.tsx:187–188` | the grading paragraph | the Grade select |

**Exceptions:** "Linked claim needs review; this event is kept." and the relationship-support warning (`144–145`) are alerts and stay.

---

## 21. See › Places (legacy panel)

`features/places/places-panel.tsx`, `places-timeline.tsx`, `components/charts/year-slider.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `places-panel.tsx:59` | description | the title |
| `places-panel.tsx:66` | rule "each dot sits at the latitude and longitude its record gives; nothing is looked up, so no address leaves this machine…" | see Exceptions |
| `places-panel.tsx:80` | "Map data © OpenStreetMap contributors (ODbL), Protomaps build 2026-10-01 of …" | attribution must stay visible by licence; keep but shorten to "© OpenStreetMap", build on hover |
| `places-panel.tsx:95` | address · 35.3364° N, 33.3199° E · CY | keep the address; coordinates on hover |
| `places-timeline.tsx:235–237` | "All places. Set a From or a To date to show only the places with an event in that stretch of time." | the date fields |
| `year-slider.tsx:277` | "The network, the money and the timeline show what held by the end of that year. Undated records always show." | the "As of" label |

**Infer the type:** `places-panel.tsx:94, 98` schema words after names ("· RealEstate", "· Ownership"): party icon and family line.

**Exceptions:** "nothing is looked up, so no address leaves this machine" (66) is floor 4: keep it as the `⌂` chip. The OSM attribution is a licence requirement.

---

## 22. Act › Red Flags

`features/act/red-flags-board.tsx`, `features/red-flags/red-flags-panel.tsx` (InvestigationType)

**Keep:** level filter chips with counts, the ranked rows (rank, level bars, name, parties), the open flag's name, summary, picture and ladder, Add to leads / Set aside, "Before you call it" with innocent explanations.

| Where | What it says now | Hang it on |
|---|---|---|
| `red-flags-panel.tsx:203–205` | "Type · Money laundering · Bribery — chosen by the app" | keep the area names; "chosen by the app" as the `ƒ` app mark with words on hover |
| `red-flags-board.tsx:292–293` | "7 of 9 record rules ran · 2 need data", rule names in `title` | keep the counts; names in a Reveal |
| `red-flags-board.tsx:296` | "ran 4 min ago · the records changed since" | keep "the records changed since" as an amber dot (it is an alert: results may be stale); time on hover |
| `red-flags-board.tsx:305, 307` | "Area:", "Party:" labels | icons on the selects |
| `red-flags-board.tsx:321` | "Ranked · level, then weight J / K" | the list |
| `red-flags-board.tsx:339` | indicator id ("ML-021") on every row | on hover of the name |
| `red-flags-board.tsx:344` | "○ rests on 2 links not yet shown" | keep the `○` with "2"; the words on hover |
| `red-flags-board.tsx:383` | "Preview · click the row to open it; move off the list to go back" | a dashed outline on the preview |
| `red-flags-board.tsx:385` | "ML-021 · Money laundering · rule v3 · first seen 12 Oct" mono line | the level mark; id, area, rule version and date on hover |
| `red-flags-board.tsx:401` | each rung's threshold text | keep for the next rung (what would raise it); met rungs' text on hover |
| `red-flags-board.tsx:403` | "Only a person can decide these · open them in To check" | the "Needs 2 facts" word |
| `red-flags-board.tsx:407` | "About the numbers. …" | an info mark |
| `red-flags-board.tsx:428–429` | disabled Share with a visible `<small>` "Share cards are not built yet." | Reveal on the disabled button |
| `red-flags-board.tsx:452, 462, 539` | figcaption smalls "no link joins them in the records", "scroll over to step through · 3 of 6 shown" | keep "3 of 6"; instructions on hover |
| `red-flags-board.tsx:542, 545` | "€9,000–€10,000 band", "€10,000 reporting line" labels on the picture | keep: they read the chart |
| `red-flags-board.tsx:559` | payment focus line "… · ✓ Shown · evidence" | the mark only |
| `red-flags-board.tsx:587–589` | under each innocent explanation "Not looked at" / "Ruled out: note" / "Could apply: note" | the ○ ✓ ! mark at 584 is the state; note on hover |
| `red-flags-board.tsx:616–618` | "Documented in": each source's full quote, publisher, title, locator | keep publisher and title; quote on hover |
| `red-flags-board.tsx:620` | "A flag is a lead, not a finding. Verify before any publication. · Rules ran 4 min ago" | keep the first sentence (floor 2); time on hover |

**Infer the type:** `red-flags-board.tsx:38–41` `LevelMark` writes "▮▮▮ TEXTBOOK" in every row, chip, rung and carrier: bars only, word on hover (open question 1). `612` "○ Open / ✓ Shows it / ✕ Does not / ? Unclear": shape only. `146` "✚ New" / "− No longer fires": the shapes. A third copy of `LevelMark` lives in `chain-of-custody.tsx:473` and `wire-engine.ts:383`: one component.

**Exceptions:** innocent explanations (floor 2), "The records can't show" list (floor 2), the "lead, not a finding" sentence, the set-aside reason (423).

**Bigger:** `styles/act.css:59–60` `.rb-level` draws the bars at 9 px inside a 10.5 px chip; when the word goes, the bars become the only mark and should be 12–13 px.

---

## 23. Act › Story

`features/story/story-screen.tsx`, `story-panes.tsx`, `writeup-editor.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `story-screen.tsx:136–137` | "3 of 8 claims shown · 1 disputed · 4 not yet shown · 2 gates open" | keep: these are the story's status numbers |
| `story-screen.tsx:142` | "thesis → sections → claims → evidence · a branch is as strong as its weakest claim" | "What the story needs" title |
| `story-screen.tsx:144` | "Critical path Blocked by: … (Section 2)" | keep (alert); section name on hover |
| `story-screen.tsx:183–184` | "3 sentences need a source" under Export | keep (floor 5: every sentence sourced) |
| `story-screen.tsx:194` | "Draft for the editor · version 'Before legal read'" | the Version history link |
| `story-screen.tsx:204–206` | footer: Exhibits, "AI use 2 of 9 paragraphs drafted with AI", and the key | keep AI use (floor 4); the key as one mark |
| `story-screen.tsx:270` | "2 of 4 shown" per section | the bar already drawn at 269; keep the bar, numbers on hover |
| `story-screen.tsx:283` | evidence chips "label · locator" | label; locator on hover |
| `story-screen.tsx:334` | each gate's detail | the gate's mark and label |
| `story-panes.tsx:53` | "✓ supports · label · locator" | stance mark; locator on hover |
| `story-panes.tsx:92, 121` | version "Kept by itself · 28 Oct 14:02 · 812 words · read-only" | the version mark (◆ ◇ ↶ at 120); time and words on hover |
| `story-panes.tsx:116` | "Kept on their own while you write, at most one every ten minutes; named ones stay." | the Versions title |
| `story-panes.tsx:214–221` | each export's description and "○ Not built yet" | keep the format names; descriptions on hover; "not built" as a disabled state with reason in a Reveal |

**Infer the type:** `story-screen.tsx:278–279` `StatusChip` with word, and "Critical path" chip: shape only; critical path as a thicker outline (`.critical` already styles it). `284` "one source" chip: keep (floor 5: single-source statements); `258` "Thesis" inside the diamond: the diamond is the mark.

**Exceptions:** gates (floor 5), "Ready to run · decided by …" (342), "Only when every gate has passed." (349) explains a disabled button: move to a Reveal on it.

---

## 24. Act › Leads

`features/leads/leads-panel.tsx`, `leads-horizons.tsx`, `components/leads-kanban-board.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `leads-kanban-board.tsx:208` | "Questions stay separate from claims until evidence supports a conversion. Connector hits remain leads until reviewed." | the title |
| `leads-horizons.tsx:132` | "Drag a card between horizons, or focus it and press M then 1 Now · 2 Next · 3 Later · 0 inbox." | the column headers |
| `leads-horizons.tsx:87` | "from opensanctions" | an outside mark |
| `leads-horizons.tsx:89` | "For: claim text" | a link mark |
| `leads-horizons.tsx:144` | done reason | the done row |
| `leads-kanban-board.tsx:96–97` | "opensanctions lead · ⚠ evidence conflict score 3" | outside mark; keep ⚠ (alert) |
| `leads-kanban-board.tsx:110` | "2 linked record(s) · 1 task(s) · 2 support / 1 contradiction / 0 context" | ✓2 ✕1 and a task count |
| `leads-kanban-board.tsx:126` | "Task · todo · 3 event(s)" | task status dot (`TASK_DOT`), events on hover |
| `leads-kanban-board.tsx:246` | "Leads with an unrecognized status (not shown above):" | keep (failsafe count) |

**Infer the type:** `leads-horizons.tsx:84` priority word in caps on every card while the left edge width already encodes it (`edge` at 65): drop the word, name on hover. `85` status glyph plus word: glyph only. `leads-kanban-board.tsx:93` priority as a Badge word: the edge.

---

## 25. Act › Charts

`features/charts/chart-builder-panel.tsx`, `components/presentation/check-report.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `chart-builder-panel.tsx:138` | description "Make a chart from this investigation's records without the AI… checks it against the design rules." | the title |
| `chart-builder-panel.tsx:149, 152` | each question's description in `title` and again as a paragraph under the buttons | Reveal on each question button |
| `chart-builder-panel.tsx:161` | "· 214 payments" / "· no records yet" in each data option | keep the count |
| `chart-builder-panel.tsx:183` | query description | the select |
| `chart-builder-panel.tsx:191` | "(suggested)" | a star mark |
| `chart-builder-panel.tsx:202–204` | chart frame question "Bar chart, drawn from this investigation's records and checked against the design rules."; footer "Numbered buttons in the data table trace each value to its record." | the title / the table |
| `check-report.tsx:50–51` | "Passes the design checks · 14 rules were checked"; "A chart that fails is not put in a draft or a deck until it is fixed." | keep pass/fail badge; the sentence on hover |

---

## 26. Act › AI runs (Ask, Before you run, Watch the run, Review)

`features/ai/before-you-run.tsx`, `watch-the-run.tsx`, `claim-review-view.tsx`

**Before you run**

| Where | What it says now | Hang it on |
|---|---|---|
| `before-you-run.tsx:346` | "Profile Default · 2 changed" | keep "2 changed" |
| `before-you-run.tsx:349–350` | every setting row's help `<small>` and `title` "key · source" | the setting label (the hover already lights the plan step) |
| `before-you-run.tsx:359` | placeholder "Printed on the result as you said it. Not evidence." | the field |
| `before-you-run.tsx:365` | "Overlays · Legal · Journalism · Values (labour) · Planned" | drop or a "later" mark with hover |
| `before-you-run.tsx:372` | "Edit any step before it runs" | the Edit plan button |
| `before-you-run.tsx:396–401` | packet "40 records go in · 12 claims, 20 evidence… · 2 outside leads count as leads only · 3 Tier C records left out by the tier floor" | keep "40 records go in" and the type icons (394); the breakdown on hover; tier-floor note stays as a count chip |
| `before-you-run.tsx:407` | each plan step's detail `<small>` and system tag | the step title |
| `before-you-run.tsx:414–419` | "Likely to run · decided by what the answer will contain", each system "TAS · when the answer states facts…", and "You cannot switch a system off…" | system tags (TAS, LAS…) with the reason on hover |
| `before-you-run.tsx:448` | earlier runs "28 Oct 14:02 · 24 steps · 1 problem · accepted" | keep "1 problem" (alert) and the review state mark; time and steps on hover |
| `before-you-run.tsx:459, 463, 490` | heading smalls "claim by claim · grounded or guessed · nothing joins the case until you accept it"; "for a new run of this question; …"; "Case synthesis · how strict, what it may use, what leaves this computer" | the headings |
| `before-you-run.tsx:503` | "Runs make no outside lookups yet: the model reads only the packet…" | the "Outside never called" box |
| `before-you-run.tsx:507–513` | Model, Size "≈ 12,000 words in · up to ≈ 2,000 out", Time, Money, Limit "2 runs at once · 6 a minute" | keep Model and Money; size, time, limits on hover |
| `before-you-run.tsx:515–516` | "Changes echoed to the run record" log with times "14:02:11 SETTING severity_floor all → high" | a count of changes; the log on hover |
| `before-you-run.tsx:518` | locked rules with their source in `title` | Reveal |

**Watch the run**

| Where | What it says now | Hang it on |
|---|---|---|
| `watch-the-run.tsx:706` | each problem row "who · rule" small | the verdict |
| `watch-the-run.tsx:727–730` | "not in this run", "+ 3 modules", "not run here" under system columns | dimmed column; words on hover |
| `watch-the-run.tsx:764` | packet records as "evidence:3fa2c1d" (type:raw-ID) | type icon; ID on hover |
| `watch-the-run.tsx:768` | model node "42 s · on this computer" / "nothing is shown while it writes" | the model ring |
| `watch-the-run.tsx:812–814` | "Everything else dims to about a third. Esc clears."; "Click a light, a chip or a tally to follow one thought from input to output." | the "Thought in focus" title |
| `watch-the-run.tsx:833, 845` | "24 events · parent chain"; time axis "14:02:11 · 42 s · 14:02:53" | keep counts; times on hover |
| `watch-the-run.tsx:888` | "Accept and reject apply to the whole answer; …" | the Accept button |
| `watch-the-run.tsx:901–902` | "Event 12 of 24 · 3 lights in flight · 4 new"; "Model: llama3 · this computer" | keep "12 of 24"; the rest on hover |
| `watch-the-run.tsx:919–921` | ledgers "append-only, hashed", "outcomes come later", final audit sentence | ledger names and counts; descriptions on hover |

**Review**

| Where | What it says now | Hang it on |
|---|---|---|
| `claim-review-view.tsx:169, 173` | classification and confidence term under each claim; "model says" chip | the plum AI mark; class words on hover |
| `claim-review-view.tsx:183` | "J / K move · A keep · E correct · R reject" | open question 6 |
| `claim-review-view.tsx:197` | "Claims you have not decided are accepted with the answer. Nothing joins the case until you accept it." | see Exceptions |

**Infer the type:** `before-you-run.tsx:394` packet record type shown as its first letter: a record-kind icon set (as Search). `415` system state words ("not in the app yet", "next run, from this answer") and `title` with `STATE_WORDS`: a state shape per system.

**Exceptions:** "What leaves this computer" with its line (`498–502`) is floor 4: stays. The "Ignored an instruction inside the evidence" notice (`420–421`) is a safety alert: stays. "AI can be wrong. Every result waits for you." (537) and the Review footnote (197) are AI marking (floor 4): see open question 5. "AI is off / No model chosen" (504–505) are blocking states and stay.

---

## 27. Act › AI drafts (legacy)

`components/ai-reasoning-panel.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `ai-reasoning-panel.tsx:296` | the long card description ("Bounded reasoning over this investigation's own evidence… it never creates or edits a canonical record.") | the title |
| `ai-reasoning-panel.tsx:297` | AI status sentence | an AI state mark (on / off / remote) |
| `ai-reasoning-panel.tsx:319` | "proposed · 12 citation(s) checked · 28 Oct 14:02" | review-state mark; count and time on hover |
| `ai-reasoning-panel.tsx:339, 346, 354` | claim / hypothesis / conflict classification words "Supported · likely · confidence high", "still viable · diagnostic" | marks for viable / not viable; words on hover |
| `ai-reasoning-panel.tsx:343, 351` | "Supports: E1, E2 · Contradicts: none" | ✓2 ✕0 with the IDs on hover |
| `ai-reasoning-panel.tsx:364, 378` | "A person makes the approach and records the answer; the AI never does."; "Creates an editable write-up or deck from this reviewed draft…" | the section titles / the buttons |

**Exceptions:** "Most likely way this is wrong" (360) is the suite's material alternative (floor 2-like): stays.

---

## 28. Keep › Safety & data

`features/safety/safety-screen.tsx`

**Keep:** the title, the four totals, the period switch, the six stores, the services and their lines, the outbound log rows (time, service, value), the four cards' headings and buttons.

| Where | What it says now | Hang it on |
|---|---|---|
| `safety-screen.tsx:119` | "Kestrel · <exposure sentence> (checking)" | the title |
| `safety-screen.tsx:146–148` | each store's figure, location (`where`, also as `title` at 143) and "In every backup ✓" | keep the figure; location and backup state on hover (a ⟲ mark for "in backups") |
| `safety-screen.tsx:164` | each service's `about` (already hidden until hover by `safety.css:99–100` — the only CSS-only reveal in the app) | convert to `Reveal` so keyboard and touch get it |
| `safety-screen.tsx:177` | "Point at a line for its requests; press a service to filter the log to it." | the services list |
| `safety-screen.tsx:188` | "Outbound log · append-only" | keep "append-only" as a lock mark with words on hover |
| `safety-screen.tsx:207–208` | each log row's "lookup · checking a director · you started it · ✕ failed on the way · stayed on this computer" | keep "✕ failed" (alert) and "stayed here" as a mark; kind, reason, actor on hover |
| `safety-screen.tsx:217–218` | "1.4 GB · ✓ checksum kept" (hash in `title`) | keep size and ✓; hash in a Reveal |
| `safety-screen.tsx:219` | "Records, documents and history in one file. Restore makes a separate case; never merges." | the Backup card title |
| `safety-screen.tsx:229` | "0 refused · 24 h" | keep |
| `safety-screen.tsx:235` | "… no document points to. Kept until you decide." | the count |
| `safety-screen.tsx:241` | "See what goes first. Shared files stay. Cannot be undone." | see Exceptions |

**Infer the type:** `safety-screen.tsx:26, 165` service mode as caps words "OFF", "ASK FIRST", "AUTOMATIC", "ON REQUEST", "LOCAL": a shape per mode — the line out already changes (dotted when off, `sd-line`); add a mark (`⊘` off, `?` ask first, `↻` automatic, `↗` on request, `⌂` local) and name on hover. `32` store marks `≡ ▤ ⟲ ⚿ ≣ ◇` exist and are good; but `◇` for "AI" collides with Decide's proposal `◇` — use the plum AI mark.

**Exceptions:** "▲ Not encrypted: keep it safe" (220) and each store's `warning` (148) are safety notices (floor 7). "Cannot be undone" on the Delete card (241) is floor 8. "Can't reach the server…" (107) is an error.

**Bigger:** `styles/safety.css:86–88` `.sd-cards` is a four-column grid whose row is as tall as the tallest card (Backup has five lines); "Who can reach it" and "Housekeeping" then carry a 15 px heading and one 12.5 px line in the same height. When the sub-lines move out, the heading can grow (or the numbers "0 refused", "3 stray files" become the big figure, as `.sd-tiles dd` at 26 px, `safety.css:25`). `safety.css:37–39` `.sd-store` is 12.5 px with the mark as plain text; with location and backup state gone, the mark can be 18 px.

---

## 29. Keep › Backup & restore, Delete, Access (legacy)

`features/backups/backup-panel.tsx`, `features/deletion/deletion-panel.tsx`, `features/security/security-panel.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `backup-panel.tsx:142` | "Export FollowTheMoney JSONL, evidence and claim provenance, leads/tasks… in one checksum-verified archive." | the title |
| `backup-panel.tsx:146` | "Last backup 3 days ago · 1.4 GB · ✓ checksum · encrypted" | keep "3 days ago" and ✓; size on hover |
| `backup-panel.tsx:151` | "Restore is preview-first and never merges… The preview checks archive integrity, every restored record ID…" | "Restore safely" |
| `backup-panel.tsx:158–159` | "412 records · 30 stored document file(s) · 0 missing raw file(s)"; "Lineage: valid · Restore API: enabled" | keep counts; lineage and API state as ✓ marks |
| `deletion-panel.tsx:79` | description | the title |
| `deletion-panel.tsx:85` | "412 record(s) · 30 owned file(s) to delete · 2 shared file(s) preserved · 0 file(s) already missing" | keep (floor 8: you must see what goes) |
| `security-panel.tsx:165–176` | eight `<small>` status lines: Environment, Database (a path), Document storage (a path), extraction owner sentence, allowed origins, credentials per connector, Restore API, API access | a status mark per line, the values on hover; or fold behind "Server status" |
| `security-panel.tsx:180, 203` | "Credentials are local-only. The API reports status but never returns the saved secret."; "Local audit entries contain request metadata only…" | the section titles |
| `security-panel.tsx:195–196` | orphan list "file(s) · 18234 bytes · policy: retain by default"; each path and size in bytes | count and size in words; paths on hover |
| `security-panel.tsx:207, 214–216` | retention and summary lines; "Methods: GET 40 · POST 3"; "Status: 200 41 · 401 2" | counts; breakdown on hover |
| `security-panel.tsx:223–224` | each audit row (time · where · request · ✕ refused) and the Technical line | keep ✕/✓ and request; time on hover |

**Exceptions:** the restore confirmation checkbox (`backup-panel.tsx:162`), the warnings and conflicts (160–161), "Blocked:" paths (`deletion-panel.tsx:87`), the type-the-name confirmation (89–92), "Type PRUNE SECURITY AUDIT" (`security-panel.tsx:209`), and "⚠ … worth a look at the audit log" (176) stay: floor 7 and 8.

---

## 30. Reading room and Listen room

`features/reading-room/reading-room.tsx`, `listen-room.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `reading-room.tsx:332` | each proposal card's "Name-finder · p. 4, ¶2" | the confidence dots |
| `reading-room.tsx:197` | confidence dots with the percentage in `title` | Reveal |
| `reading-room.tsx:345` | accept impact lines and "Nothing else in the case changes." | the Accept button (already a hover wrap, `rr-accept-wrap`) |
| `reading-room.tsx:721` | strip counts "11 pages · 3 waiting · 1 unanchored" | keep numbers with marks |
| `reading-room.tsx:729–735` | "Read by OCR · 82% legible" / "Read from the file's own text"; "English · French" / "Language not detected" with explanations in `title`; "p. 4" again | an OCR mark with the legibility number; language as a code ("EN"); explanations in Reveals; drop the duplicate "p. 4" |
| `reading-room.tsx:751–755` | File, the full 64-character SHA-256 in `<code>`, Read, Passages | fingerprint icon with copy; full hash on hover |
| `reading-room.tsx:761` | "Page 4 · 3 proposals · 1 clip" | keep |
| `reading-room.tsx:780, 789–790` | clip meta "p. 4, ¶2 · ✓ the words are in the stored text"; "SHA-256 3fa2c1…9b0d" | keep ✓/✕ (alert when ✕); anchor and hash on hover |
| `reading-room.tsx:813` | "No tags yet; make them in Keep." | the tag button |
| `reading-room.tsx:817` | key strip | open question 6 |
| `listen-room.tsx:97` | "Whole file 42:10 · showing 12:00–14:30" | keep the window; whole length on hover |
| `listen-room.tsx:278` | "Language: English · 97%" | "EN"; probability on hover |
| `listen-room.tsx:284` | "Speakers are not told apart yet: that needs a speaker model, a later step…" | the "Voices" title |
| `listen-room.tsx:290–293, 298` | File, full SHA-256, Streams "audio · aac · 44100 Hz · video · h264 · 1920×1080", "Transcribed whisper · large-v3 · on this computer · 2026-10-28 14:02 UTC" (twice: 293 and 298) | keep "on this computer" (floor 4); tool, model, streams, time on hover; show it once |
| `listen-room.tsx:332–333` | "Place media:#00:12:04.2–00:12:09.8"; "From file · the original, as uploaded" | the pinned quote |
| `listen-room.tsx:354–356` | "original kept unaltered"; "SHA-256 3fa2 c1d4 …9b0d"; "The transcript was made from a 16 kHz copy decoded in memory; no derived file is kept. Quotes play from the original." | the "Original" chip |

**Infer the type:** `reading-room.tsx:329` card kind as a bold word ("Name", "Claim", "Quote", "Link", "Date"): proposal-kind icon. `330` "Proposed" chip: dashed outline (the default state needs no word); "✓ Accepted / ✕ Rejected" as shapes. `335` "· Company" after a name: party icon. `234` "Company · 4 facts in the case": party icon. `744` extraction issues marked with the claim status chip "○ Note" (`st st-unshown`) — that borrows the claim grammar's "not yet shown" for a document note; use a neutral note mark.

**Exceptions:** "Machine unsure" words (`listen-room.tsx:72, 277, 340`) and "Evidence stays locked until you have heard the part yourself." (349) are about whether a quote is safe to use (floor 3): keep the unsure marks visible; the locked-evidence sentence can become a Reveal on the disabled Save button, as Following does for a blocked capture (`following-screen.tsx:199–200`). "✕ the words differ from the stored text" (780, 790) is an alert.

---

## 31. Chain of Custody drawer (Trace)

`features/provenance/provenance-panel.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `provenance-panel.tsx:108` | "One place to follow a record back through source, document, exact chunk/page, extraction proposal, reporter decision…" | the title |
| `provenance-panel.tsx:112` | the request kind ("dossier relationship", "search:entity") in `<small>` | a record-kind icon |
| `provenance-panel.tsx:130, 132` | "Canonical · 2 support · 0 conflict · latest accepted"; "accepted · aleph · dataset · promoted" | ✓/✕ counts; provider and dataset on hover |
| `provenance-panel.tsx:144` | "entity · 3 evidence link(s) · 2 claim link(s) · 4 relationship(s) · 0 lead link(s)" | counts with icons |
| `provenance-panel.tsx:171–172` | "· complete"; "SHA-256: <full hash>" | fingerprint icon; hash on hover |
| `provenance-panel.tsx:173–179` | "· OCR-derived text"; "· 87% extractor confidence"; reviewed-at time; "Accepted record: claim · <uuid>" | marks (OCR, confidence dots); times and IDs on hover |

**Infer the type:** `provenance-panel.tsx:114` "· web" (source type): source-type icon. `146, 153` stance word: stance mark. `156` schema word: family line.

---

## 32. Learn › Red Flags catalogue

`features/knowledge/learn-screen.tsx`, `catalogue-map.tsx`, `indicator-list.tsx`, `indicator-page.tsx`, `catalogue-table.tsx`, `catalogue-cards.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `catalogue-map.tsx:89–90` | "Scroll over the map to step through areas · click to open · lines show 'may also point to'. Scroll to step." | the map title |
| `catalogue-map.tsx:152` | area summary and "12 checkable from your records, 30 after lookups, 4 only by a person." | keep counts with the `HOW_CHECKED` marks; the summary on hover |
| `catalogue-map.tsx:156` | "No indicator in this area fires in this case. That is not the same as nothing wrong: 3 of 46 have a rule that runs on records." | see Exceptions |
| `indicator-list.tsx:64` | "BO · Beneficial ownership" eyebrow (also in `title`) | the area name is the list title |
| `indicator-list.tsx:83` | indicator id on every row | on hover |
| `indicator-list.tsx:90` | key "◫ from your records · ⇄ after outside lookups · ◉ only a person · J / K to move" | the marks already have Reveal-worthy names (`kc-how` `title` at 86 → Reveal) |
| `indicator-page.tsx:63–64` | "BO-007 · Beneficial ownership · ✓ Verified · v3" | keep ✓/○; id, area, version on hover |
| `indicator-page.tsx:83` | threshold source and note | the level steps |
| `indicator-page.tsx:103` | "Data needed: …" | the how-checked mark |
| `indicator-page.tsx:107` | each source's "publisher year · locator · ✓ quote confirmed" | keep publisher; the rest on hover |
| `indicator-page.tsx:114` | each case's "what happened" (shown when all sources are open) | already on request |
| `catalogue-cards.tsx:36` | "Space to turn · ← → to move" | the card |
| `learn-screen.tsx:131–132` | disabled "⟲ Practise" with the reason only for screen readers | Reveal on the disabled button (sighted users get no reason today) |

**Infer the type:** `indicator-list.tsx:85` "○ pending" word: the `○` alone. `indicator-page.tsx:113` case outcome words ("Convicted", "Alleged in reporting"): an outcome mark (`○` already marks "alleged"). `catalogue-table.tsx:30` "n" column header with `title` "Indicators": Reveal. `HOW_CHECKED.person` `◉` (`features/knowledge/families.ts:38`) collides with the watchlist `◉`: see vocabulary.

**Exceptions:** "Pending checks: not used for Red Flags yet." banner (`indicator-page.tsx:66`) and "no flag is not a finding" (`indicator-page.tsx:152`, `catalogue-map.tsx:156`) are floor 2 and 11: keep, shorter.

---

## 33. Learn › Glossary

`features/glossary/glossary-screen.tsx`

| Where | What it says now | Hang it on |
|---|---|---|
| `glossary-screen.tsx:189` | each row's first sentence of the definition | the term (the card on the right shows it on point already, 229) |
| `glossary-screen.tsx:190` | each row's area codes "BO · ML · CO …" | small area marks, names on hover (the `aria-label` has them) |
| `glossary-screen.tsx:170` | count under each letter | keep (numbers) |
| `glossary-screen.tsx:239` | "Defined in 2 areas, listed in 3" | the area tabs |

---

## 34. Settings (`/settings`)

`app/settings/page.tsx`, `features/settings/*`, `features/appearance/appearance-panel.tsx`, `features/lock/*-pane.tsx`

**Keep:** the sidebar with each setting's value, the section title, switches and their labels, the Search settings box.

| Where | What it says now | Hang it on |
|---|---|---|
| `features/settings/settings-index.tsx:22` (`KeptLine`) | on every section: "Kept: the server on this computer, and in backups · Leaves this computer: nothing" | open question 3 |
| `features/settings/settings-index.tsx:84` | the sidebar note under the nav ("Appearance is yours alone…") | the section title |
| `app/settings/page.tsx:283, 285` | Keyboard switch help and "Keys with ⌘ or Ctrl always work: …" | the switch label |
| `app/settings/page.tsx:292` | New-case setup description | the button |
| `app/settings/page.tsx:298–306` | AI model line, "remote endpoints allowed (AI_ALLOW_REMOTE_ENDPOINT is on)", the Authority Suite line with source, TAS version and tier-floor sentence | keep the model and "remote allowed" (floor 4); versions and env-var names on hover |
| `app/settings/page.tsx:310` | Red Flag levels intro | the title |
| `app/settings/page.tsx:326–329, 337–340` | demo case descriptions | the section titles |
| `app/settings/page.tsx:370–373` | "Hidden from investigation pickers in this browser only. The data itself is untouched…" | the Hide button |
| `app/settings/page.tsx:471–478` | "API base URL: …"; "Access mode: local only · token configured on backend: no" | a state mark; URL on hover |
| `app/settings/page.tsx:503–506` | console loopback sentence | the Open console link |
| `features/settings/notifications-pane.tsx:82` | "12 last week" per kind | keep (number) |
| `features/settings/notifications-pane.tsx:90, 99` | Interrupt explanation; "Counted from what this case raised in the last seven days…" | the Interrupt column / the week counts |
| `features/settings/notifications-pane.tsx:104, 106, 113` | each switch's `<small>` | the switch label |
| `features/settings/lookups-pane.tsx:76, 83, 141, 143` | reason and time; "Follows the defaults above. A case can differ…"; "Only the owner…"; "Each lookup leaves a trace on that site…" | see Exceptions for 143 |
| `features/settings/lookups-pane.tsx:88` | "default automatic" under each source | the mode control |
| `features/settings/lookups-pane.tsx:160` | week rows "lookup · Aleph · host · Kestrel · 28 Oct 14:02 · failed" | keep failure mark; the rest on hover |
| `features/settings/research-pane.tsx:57` | env-var explanation (`AI_PROVIDER`, `OLLAMA_MODEL`…) | an info mark |
| `features/settings/research-pane.tsx:66, 80` | each mode's and setting's `<small>` | the label |
| `features/settings/research-pane.tsx:69, 104` | "Whatever is chosen, every result is a proposal…"; "A case that has saved its own settings…" | the section title |
| `features/settings/keys-pane.tsx:64, 71` | "Key saved · never shown again"; status line | a ✓ key mark; status line visible only when bad |
| `features/settings/outside-channels.tsx:116, 130, 147` | each channel's explanation and "Each notice leaves this server for the service that carries it…" | see Exceptions for 147 |
| `features/lock/locking-pane.tsx:124–138, 148, 153, 157, 179` | every switch's `<small>`, the PIN caveat, "A locked case is absent from every list…", per case "opens with the app" | the switch labels; caveats stay where they warn (148) |
| `features/appearance/appearance-panel.tsx:126, 290, 301` | effect and format lines; "Drag the divider, or use ← → while it is focused. The preview is your real case, not a sample." | the labels / the preview |

**Infer the type:** `features/settings/lookups-pane.tsx` and `research-pane.tsx` write modes as words (automatic, ask, off): the same mode shapes as Safety & data (§28). `features/lock/people-pane.tsx:89` already prints the role key "◆ owner · ■ admin · ● reporter · ○ viewer" and `96` writes the role word and what it does: the shape alone with the word and duties on hover (the key line can then go). `settings-index.tsx:66` search results show the group word: fine (it is position).

**Exceptions:** "Each lookup leaves a trace on that site: the name you asked about, from this computer's address." (`lookups-pane.tsx:143`) and "Each notice leaves this server…" (`outside-channels.tsx:147`) are floor 4 for settings that send things out: keep. "On ntfy.sh … anyone who guesses it can read it." (`outside-channels.tsx:130`) is a safety notice: keep. `locking-pane.tsx:148` ("The PIN is a convenience: it does not protect backups or a stolen laptop.") and `214` are safety notices: keep. The type-the-name demo deletion (`page.tsx:393–416`) stays.

**Bigger:** `styles/settings.css:145` `.st-kept` is a 12 px line on every section (see open question 3).

---

## 35. Lock screen and First open

`features/lock/lock-screen.tsx`, `features/lock/first-open.tsx`

- **Lock screen** is already minimal by design ("No case name, no names of people, no counts", `locking-pane.tsx:214`). Only `lock-screen.tsx:51` "Idle · your writing is kept" could shorten; leave it, it reassures at the moment of locking.
- **First open** is one-time consent: the pros and cons of each protection (`first-open.tsx:115–122`), "What it protects" with ✓/✕ (157–163) and the recovery-words warning (171–173) must be read once. **Exception** for the whole screen. Small moves: the "How it will read" preview's place labels (`96–101`) and the footer sentence (`180–183`) could go to hover; `79` "first open after the update" eyebrow is sub-text.

---

## 36. Other pages

- **About** (`app/about/page.tsx`): an explainer page; long text is its content. Out of scope except `86–96` stack items' role chips, which are fine as labels.
- **Review queue and batch triage** (`app/review/page.tsx`, `app/review/batch/page.tsx`): legacy. `review/page.tsx:242–244` "Hover or focus a proposal on the right to see its exact source span here.", `255` locator over each chunk, `265` "complete · 214 chunk(s) · 3 accepted · 1 rejected this session", `304` "entity proposal · high", `307` locator; `batch/page.tsx:202` description. Same treatment as Library (§9): proposal-kind icon, confidence dots, locator on hover.
- **Console** (`app/console/page.tsx`): an iframe of the backend console; not covered.
- **Dashboard** (`app/dashboard/page.tsx`): a redirect.

---

## Cross-screen summary

### Recurring sub-text (what keeps coming back)

1. **Card descriptions** on every legacy panel (`CardDescription`): a paragraph of how the feature works. 14 found (Library, Sources & evidence, Corpus, Claims, Timeline, Places, Chart builder, AI drafts, Backup, Delete, Leads, Provenance, Review, Batch). → Reveal on the title.
2. **"How to use it" lines and key strips**: "Point at …", "Scroll over …", "Drag …", "J / K move …" (Decide, Drop, Reading room, Red Flags, Money, Relationships, Places, Leads, Review). → open question 6.
3. **Hashes**: SHA-256 shown in full or shortened on The Drop receipt, Links & captures, Reading room, Listen room (twice), Chain of Custody, Provenance, Safety's backup card. → one fingerprint icon with copy, hash in a Reveal (keep "✓ hash matches" visible where it is a check result).
4. **Raw IDs**: `source-capture-panel.tsx:69`, `dossier-panel.tsx:239, 241`, `relationship-detail.tsx:109, 161`, `review-queue-panel.tsx:162`, `provenance-panel.tsx:179`, `watch-the-run.tsx:764`, `before-you-run.tsx:254, 381, 390`. → hover only, or remove.
5. **Timestamps that are not the point**: last run, last checked, first seen, sent at, reviewed at, captured at (Red Flags, AI strip, Watchlist, Entity sets, Claims history, Relationship assessments, Drop history, Captures, Story versions, Safety log). → hover; keep times where the row *is* a time (custody log, outbound log).
6. **Durations and rates**: stage seconds (captures, Drop receipt), model seconds, "≈ 12,000 words in", "2 runs at once · 6 a minute", "checking every 2 s". → hover.
7. **Locators and file names under quotes**: decision card, Search, Claims, To check, Story, Link panel, Provenance. → hover on the quote; "Open the source" stays.
8. **Per-row metadata lines in `<small>`**: proposer · locator, actor · kind · age, priority · status · owner · provider. → reveal on the row.
9. **`title` attributes used as tooltips**: `decide-screen.tsx:179, 192`, `case-home.tsx:357, 432`, `components/status.tsx:29`, `mini-network.tsx:182`, `red-flags-board.tsx:292, 296`, `safety-screen.tsx:143, 165, 217`, `the-drop.tsx:143, 273`, `reading-room.tsx:197, 730–732`, `network-view.tsx:89`, `new-case-setup.tsx:285`, `chart-builder-panel.tsx:149`. → `Reveal`, which reaches keyboard, touch and screen readers.

### Recurring categorical words

| Category | Where it is written as a word | Proposed mark | Existing mark to reuse | Named on hover as |
|---|---|---|---|---|
| Claim status | Case home, Claims, Story, Chain of Custody, Search, Money ledger, Red Flags payments | ✓ ✕ ○ – in the status colours | `components/status.tsx:9–14` (fix `lib/record-kinds.ts:41–42` `!`/`×`, `wire-engine.ts:67` `?`, `mini-network.tsx:137` `×`) | Supported · Disputed · Not yet shown · Ruled out |
| Worked out by the app | Money, The Wire, Red Flags type "chosen by the app" | ƒ | `money-view.tsx:234`, `wire-engine.ts:68` | Worked out by the app, not a payment / not a record |
| Flag level | everywhere a flag appears | ▮▯▯ ▮▮▯ ▮▮▮ bars, filled to the level | `components/status.tsx:16–20` `LevelChip` (merge the copies in `red-flags-board.tsx:38`, `chain-of-custody.tsx:473`, `wire-engine.ts:383`) | Faint · Strong · Textbook, with the meaning |
| Party kind | Case home chips (letter), mini-network (shapes), dossier/connectors/corpus/places (schema word), Wire card caps, reading room "· Company" | Lucide icon in the party ring colour | `components/network/party-icons.ts:10`, `lib/viz-tokens.ts:55` `PARTY` | Person · Company · Organisation · Vessel… · Property · Other |
| Link family | dossier, relationships list, connections, places, provenance | a short line in the family colour, arrow when directed | `lib/viz-tokens.ts:90` `LINK`, `chart-frame.tsx:86` `LineSwatch` | Owns · Directs · Paid · Family · Other |
| Decision kind | Decide chips and eyebrow, Case home rows, Inbox | ? ∅ ◇ ⇄ ◎ AI ◉ | `decide-screen.tsx:21` `KIND_ICON` | To check · Missing · Proposal · Match · Outside · AI draft · Watchlist |
| Proposal kind (name, claim, quote, link, date, email/phone) | Drop ready list and receipt, reading-room cards, Library, Review | new: party icon for a name, ○ for a claim, “ for a quote, ⟷ for a link, a calendar for a date, @ for email/phone | none yet | Name · Claim · Quote · Link · Date · Email or phone |
| Record kind (search results, packet records, provenance) | Search `TYPE_LABEL`, Before you run (first letter), Provenance small | the kind colour edge plus the proposal/party icons above | `lib/record-kinds.ts:14` `KIND` colours | Party · Link · Evidence · Claim or event · Lead or task · Document · Outside finding |
| Evidence stance | Claims, Link panel, Story, Provenance, AI drafts, Leads | the left edge or connector line: solid in the supported colour (supports), red (contradicts), dotted grey (context) | Chain of Custody's line styles, "red against the claim" (`chain-of-custody.tsx:440–441`) | Supports · Contradicts · Context only |
| Actor | Case home changes (`ACTOR`), Decide rows, Inbox, custody | person: initials disc; app: ƒ; AI: plum AI mark; outside connector: ↗ | `lk-initials` (`first-open.tsx:94`), `ai-tag` (`components/status.tsx:34`) | By a person · Found by the app · Drafted by AI, to review · From outside records |
| Source kind (watched address) | Following | feed / sitemap / page / podcast / YouTube icons | `following-screen.tsx:57` `KindIcon` | as `KIND_NAME` |
| Source type (evidence) | Sources & evidence select, Chain of Custody chip, Provenance | new: globe, page, speech bubble, seal, at-sign, dot | none yet | Web page · Document · Interview · Public record · Social post · Other |
| Health / job state | Following, The Drop, captures, corpus sync, connectors | ● ○ ↪ ✕ ⊘ ‖ for a source; ✓ ◐ · ✕ ! – ⧗ for a job | `following-screen.tsx:30` `HEALTH`, `the-drop.tsx:41–45` | as their word maps |
| Service mode | Safety & data, Outside lookups, AI and research | ⊘ off · ? ask first · ↻ automatic · ↗ on request · ⌂ local | `⌂` from `first-open.tsx:80`; `↗` from Following's egress line | Off · Ask first · Automatic · On request · Local |
| How an indicator is checked | Learn | ◫ records · ⇄ lookups · person icon | `features/knowledge/families.ts:35–39` `HOW_CHECKED` (change `◉` to a person glyph, `◉` is the watchlist) | From your records · After outside lookups · Only a person |
| Role | People and access | ◆ owner · ■ admin · ● reporter · ○ viewer | `features/lock/people-pane.tsx:89` | the role and what it may do |
| Lead priority | Leads (caps word plus edge) | the left edge thickness (5 px urgent, 3 px high, dashed low) | `leads-horizons.tsx:65` | Urgent · High · Normal · Low |
| Version kind | Story | ◆ named · ◇ automatic · ↶ restore | `story-panes.tsx:120` | Named · Kept by itself · Before a restore |
| Stage | breadcrumbs, cross-links ("Kept from See › Money", "open them in To check") | the stage number in the stage colour | `lib/stages.ts` colours; the rail numbers | the stage and part name |

**Collisions to resolve when standardising:** `◉` (watchlist / only a person / no requests logged), `◇` (proposal / AI store / automatic version), `⇄` (match in Decide / after lookups in Learn), `!` (needs you in The Drop / disputed in Search / could apply in Before you call it / contested in the network), `○` (not yet shown / pending / open / not looked at / waiting). The last is acceptable if `○` always means "not decided yet"; the first four should get one meaning each.

### Standardise on

1. `components/status.tsx` for claim status and flag level (and delete the three copies of the level mark).
2. `components/network/party-icons.ts` + `PARTY` for party kind everywhere a party is named (including Case home's mini-network and chips).
3. Decide's `KIND_ICON` for decision kinds (Inbox, Case home, Drop's ready list).
4. Following's `KindIcon` and `HEALTH` for sources and their health; its `↗ 1 request · 30 min · direct` egress line as the pattern for "what leaves" anywhere a single action sends something out.
5. Chain of Custody's line styles for proposed / confirmed / worked out / against / AI.
6. `ƒ` for anything the app worked out, the plum AI mark for anything AI made.

---

## Order of work

By clutter carried × how often it is open:

1. **Case home** — opened every session; many small fixes; sets the party and kind marks the other screens reuse. Includes the frame (§1).
2. **Decide** — used daily, the queue rows carry the most repeated metadata; the kind icons already exist.
3. **The Drop + Links & captures** — the first screen of every case; the read receipt and the capture receipt are the densest cards among the redesigned screens.
4. **Red Flags** — high use, many small type words and three level-mark copies.
5. **Reading room / Listen room** — long sessions; card metadata and the full hashes.
6. **Chain of Custody** and **Money** — redesigned; mostly moving explanations, few type words.
7. **Safety & data**, **Story**, **AI runs** (Before you run, Watch, Review) — moderate use, large amounts of explanation; careful with the floor (what leaves, AI marking, gates).
8. **Settings** and **Learn / Glossary** — visited rarely; the `KeptLine` question decides most of Settings.
9. **Legacy panels** (Library, Sources & evidence, Connectors + Dossier, Corpus, Claims, Connector findings, Relationships detail, Timeline, Places, Leads kanban, Chart builder, AI drafts, Backup, Delete, Access, Review pages) — the most clutter, but several have no mockup yet (Timeline and Places per `MOCKUP_BUILD_LIST.md:162`); see open question 2.

---

## Ony's answers (29 Oct)

1. **Statuses and flag levels: colour only by default, the word on reveal.** An accessibility setting can change it
   (shape, or shape and word, for readers who cannot rely on colour).
2. **Legacy panels: convert now, as they are.**
3. **Key strips: behind `?`.**
4. **AI disclosures: the AI mark, the sentence on hover.**
Questions 3 and 4 below (Settings' kept/leaves line, chart rules) were not asked yet.

## Open questions for Ony

1. **Shape alone, or shape and word?** The status grammar (`components/status.tsx:1–3`, `lib/stages.ts:25`: "Every status shows a shape and a word") says each status shows its word too. Your 29 Oct rule says the type is inferred and named on hover. Do claim statuses and flag levels become shape-only with the word on hover (as Following's health already is), or are they the context exception?
2. **Legacy panels:** convert the old form panels (Library, Connectors, Corpus, Claims, Timeline, Places, Backup, Delete, Access…) to the rule now as they are, or only when each one gets its mockup and redesign?
3. **Settings' "Kept: … · Leaves this computer: …" line** on every section (`features/settings/settings-index.tsx:22`): a safety statement that stays visible, or a reveal on the section title?
4. **Chart rules:** every chart frame writes its question and its rule sentence under the title (`components/charts/chart-frame.tsx:58–60`), by design ("the one sentence that says why each mark sits where it sits"). Visible, or a reveal on the title?
5. **AI disclosures:** "AI can be wrong. Every result waits for you." and "Nothing joins the case until you accept it." on the AI screens: keep as words, or reduce to the plum AI mark with the sentence on hover?
6. **Key strips:** the visible key hints at the foot of Decide, The Drop, the Reading room and Review ("J K move · 1 2 3 decide · Z undo") are in the mockups. Keep them, or move them behind `?` (which already lists every key)?

---

## What I checked and what I did not

**Read in full or for every rendered line:** `components/ui/reveal.tsx`, `features/following/following-screen.tsx`, `components/case/case-workbench.tsx`, `components/case/section-screen.tsx`, `lib/stages.ts`, `components/frame/app-frame.tsx`, `components/status.tsx`, `features/case-home/case-home.tsx`, `decide-screen.tsx`, `decision-card.tsx`, `mini-network.tsx`, `features/ai/ai-strip.tsx`, `features/inbox/inbox.tsx`, `interrupt-notice.tsx`, `features/new-case/new-case-setup.tsx`, `features/the-drop/the-drop.tsx`, `captures.tsx`, `features/search/search-panel.tsx`, `features/documents/documents-panel.tsx`, `corpus-status.tsx`, `features/source-capture/source-capture-panel.tsx`, `features/connectors/connectors-panel.tsx`, `features/dossier/dossier-panel.tsx`, `ownership-chain.tsx`, `features/corpus/corpus-panel.tsx`, `watchlist.tsx`, `entity-sets.tsx`, `corpus-insights.tsx`, `features/claims/claims-panel.tsx`, `features/to-check/to-check-panel.tsx`, `features/review-queue/review-queue-panel.tsx`, `features/custody/chain-of-custody.tsx`, `features/the-wire/the-wire.tsx`, `link-panel.tsx`, `components/network/network-view.tsx`, `features/money/money-view.tsx`, `features/relationship-graph/relationship-graph-panel.tsx`, `relationship-detail.tsx`, `features/timeline/timeline-panel.tsx`, `features/places/places-panel.tsx`, `places-timeline.tsx`, `components/charts/year-slider.tsx`, `components/charts/chart-frame.tsx`, `features/act/red-flags-board.tsx`, `features/story/story-screen.tsx`, `features/safety/safety-screen.tsx`, `features/security/security-panel.tsx`, `app/settings/page.tsx`, `features/settings/settings-index.tsx`, `lib/record-kinds.ts`.

**Read in part** (the render code, or the text lines found by searching for `<small>`, `<p>`, `title=`, descriptions): `features/the-wire/wire-engine.ts` (text it writes only), `features/relationship-graph/graph.tsx` (120–232), `connections.tsx`, `features/red-flags/red-flags-panel.tsx` (`InvestigationType`), `features/story/story-panes.tsx`, `writeup-editor.tsx`, `features/leads/leads-panel.tsx`, `leads-horizons.tsx`, `components/leads-kanban-board.tsx`, `features/charts/chart-builder-panel.tsx`, `components/presentation/check-report.tsx`, `features/ai/before-you-run.tsx` (180–541), `watch-the-run.tsx`, `claim-review-view.tsx`, `components/ai-reasoning-panel.tsx`, `features/backups/backup-panel.tsx`, `features/deletion/deletion-panel.tsx`, `features/settings/*-pane.tsx`, `outside-channels.tsx`, `features/appearance/appearance-panel.tsx`, `features/lock/lock-screen.tsx`, `first-open.tsx`, `locking-pane.tsx`, `people-pane.tsx`, `name-pane.tsx`, `features/knowledge/*`, `features/glossary/glossary-screen.tsx`, `features/reading-room/reading-room.tsx`, `listen-room.tsx`, `features/provenance/provenance-panel.tsx`, `features/marks/marks-panel.tsx`, `features/search/corpus-results.tsx`, `components/extraction-explanation.tsx`, `app/about/page.tsx`, `app/review/page.tsx`, `app/review/batch/page.tsx`, and the CSS files named above.

**Not opened:** the dossier's sub-parts (`duplicate-candidates`, `property-conflicts`, `reconciliation-review`, `corpus-expand`), the Library's sub-panels (`table-mapper`, `email-view`, `picture-evidence`, `identifier-owner`, `entity-identity`, `similar-documents`, `document-translation`, `schema-question`), `components/entity-graph.tsx`, `components/connection-grid.tsx`, `components/places-map.tsx`, `components/presentation/*` other than `check-report`, `features/charts/keep-chart.tsx`, `features/ai/saved-questions.tsx`, `features/appearance/theme-maker.tsx` and `theme-compare.tsx`, `features/effects/*`, `features/suite-coverage/*`, `features/api-access/*`, `features/inbox/watch-button.tsx`, `features/demo/*`, `components/layout/workbench-page.tsx` (the all-stages view the page tests use), and the old `features/red-flags/red-flags-panel.tsx` body (used only in that all-stages view).

**Not done:** I did not run the app, so I did not see rendered sizes. The "Bigger" notes are read from the CSS (padding, min-height, font size, grid stretching) and are candidates to confirm on screen against the mockups, not measurements. I did not compare each screen with its mockup picture.
