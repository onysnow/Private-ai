# Add by hand, works today, check a pack: mockups (for Ony's review)

Three screens at 1440 x 900 in Rain Noir, for three things on the build list that had no mockup: a form to add a
party, link or event by hand (BACKLOG: "there is no form for manual entities, relationships or events"), the
per-platform "works today" check (DECISIONS call 5; SOURCE_INTAKE_RESEARCH Phase 2), and "Check a pack"
(REDESIGN_RESEARCH §11 Innovation 2; ADR-0024). Nothing in the app has changed. Every name, file, hash and time is
invented sample data on the Kestrel SA sample case.

Open `index.html` in a browser. Keys: `1` to `3` switch screens, `N` shows the "Needs / open questions" layer.

| Screen | Picture | What it is |
|---|---|---|
| ENTRY_1 Add by hand | `ENTRY_1-add-by-hand.png` | One sheet for a party, a link or an event, written as a sentence with blanks ("Fernhill Ltd · paid · Loop Two BV · €29,400 on 3 Mar 2019, day precision, for · not known"). Each blank matches the case's records as you type (a record of that name, another name of one, or a new party whose kind you pick, never guessed). "Where does it come from?" is required: a passage selected in a document, a source with no file, or "I know it, no source yet" (kept as Not yet shown with a lead). Beside it: where the link lands on the network, what it changes (a dry run of the Red Flag rules, as Decide's "by what it unlocks"), and whether the case already holds it or has it waiting in Decide. Who wrote it is kept on the record and its custody chain. |
| WORKS_1 Does it work today? | `WORKS_1-works-today.png` | Each platform the app saves from (YouTube, Instagram, X, TikTok, Facebook, Telegram, Bluesky, Mastodon, Vimeo, SoundCloud), tested once a day on one public test item: today's result as shape and word (✓ works, ◐ partly, ✕ broken), the last 14 days, what a good save contains. The broken one says what came back, what was expected, and what still works. A switch warns on a pasted link when its platform is broken. What leaves this computer: one request per platform a day, logged. |
| CHECK_4 Check a pack | `CHECK_4-check-a-pack.png` | Drop an evidence pack someone sends back; every file's fingerprint is recomputed here against the pack's MANIFEST.sha256: as made, changed, missing, not in the list. The result in one line and counts; a changed exhibit shown beside the app's own copy with the band that differs; what in the case rests on it (the claim that cites it); export the check for an editor or lawyer. Nothing is sent anywhere. |

`states/` holds each screen with the notes layer open.

## Open questions (also on each notes layer)
1. ENTRY_1: one sheet with three kinds, as drawn, or three separate forms?
2. ENTRY_1: allow "I know it, no source yet" at all (kept as Not yet shown with a lead, never counted toward Supported)?
3. ENTRY_1: where it opens from: See (drawn), the case home, ⌘K "add …"?
4. WORKS_1: on by default, or off until you turn it on (10 requests a day)?
5. WORKS_1: test items shipped with the app, or picked by you?
6. WORKS_1: where it lives: Following (drawn), Settings, or both?
7. CHECK_4: signing packs: a local key (made at "Sign your work"?), and who keeps it? Drawn: "not signed".
8. CHECK_4: check packs made by someone else's Workbench too, or only packs this computer made?
9. CHECK_4: where it lives: Check (drawn), Export, or both?
