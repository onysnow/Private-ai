# Source intake mockups (for Ony's review)

Four screens at 1440 x 900 in Rain Noir, made from `docs/research/source-intake/SOURCE_INTAKE_RESEARCH.md`
(19 Oct 2026). Nothing in the app has changed. Every name, domain, time, count, hash and score is invented sample
data: nothing on these screens was measured.

Open `index.html` in a browser. Keys: `1` to `4` switch screens, `N` shows the "Needs / open questions" layer
(it covers the bottom of the screen; the screens themselves stay clean). The file is self-contained: fonts are
embedded, no network is used.

| Screen | Picture | What it is | Research it uses |
|---|---|---|---|
| INTAKE_3 Capture a web page | `INTAKE_3-capture-a-web-page.png` | A pasted link becomes a capture: live lane, receipt, five outcomes, quote re-anchoring, "Ask first" egress | §0 decisions, §1.1, §4 table, §5.1 (second witness), §10 Phase 1, §8.4/8.6 (Capture, annotation); design §13 and The Drop |
| FOLLOW_1 Following | `FOLLOW_1-following.png` | Monitors: sources and their health, "At risk · capture first" queue, versions, duplicate clusters, egress per monitor | §0 decisions, §5.1, §5.3, §10 Phase 3, §7; suite EGS rule 8 |
| CHECK_3 Is it real? | `CHECK_3-is-it-real.png` | Authenticity check in four layers, a person's decision, role switch, propagation preview, consent card, append-only history; Image / Video / Audio / Text | §9 whole (9.1 evidence, 9.2 layers, 9.3 hard rules, 9.4 statuses, 9.6 limits), §8.6, §10 Phase 4 |
| INTAKE_4 Listen and read along | `INTAKE_4-listen-and-read-along.png` | Podcast in the reading room: timecoded transcript, own vs publisher transcript, low-confidence words, no-speech segments, speaker lanes, scrub bar, pinned quote `media:#t=`, "heard" step, derived files | §3.2 and §3.4 (transcription), §4 (selectors), §5.3 (podcasts), §8.3 (Datashare lesson), §8.4 (transcript, derivatives), §10 Phase 2 |

`states/` holds extra pictures of other states of the same screens (link only, not seen, changed since capture,
already in the case, outside services switched on, capture-all reason box, Video/Audio/Text variants, source-protected,
subject-of-the-story, decision recorded, compare transcripts, heard and confirmed) and each screen with the notes layer open.

## What you can try on the page
- INTAKE_3: pick any of the 5 links; replay the capture lane; switch on "second witness" or "time proof" and watch the
  egress line and the receipt change; "Re-read the page" re-finds the quote.
- FOLLOW_1: Capture / Skip each queued item; "Capture all..." stays locked until a reason is typed; pick a source to
  see its check, schedule, route and what leaves the computer; the closed-platform row has no monitor.
- CHECK_3: switch the item type; turn the local hint on; mark the item source-protected (sending is blocked);
  switch the role; pick a status and see which claims lose support before anything is saved; "Record decision"
  needs a ticked check and a reason, then adds a line to the history.
- INTAKE_4: play/pause (simulated, no sound), scrub, arrow keys, `P` pins the line at the playhead, play the pinned part,
  then "I heard this" unlocks "Save as evidence"; switch to the publisher's transcript or Compare.

## Fixed decisions the screens follow
No social-media logins or accounts; a login wall is "not seen", never "shown". Monitors surface items and a person
captures (bulk needs a recorded reason). System results are findings and non-blocking flags; only a person's recorded
decision sets a status; a detector score never gates; detectors off by default for images; third-party sends need
per-item consent and are blocked for source-protected items. "Content verified: not done by this system." Everything
local by default, with what leaves the computer stated.

## Questions Ony must answer (research §12, numbered as there)
1. Follow: open sources only, or also bulk logged-out collection from closed platforms? (FOLLOW_1 assumes open sources only plus link capture.)
2. Third-party archives (Wayback-type) as an optional second witness, or never? (INTAKE_3 shows it as an off switch.)
3. A neutral / Tor / VPN route per monitor or capture? (FOLLOW_1 and INTAKE_3 show "Direct" and "Neutral route".)
4. robots.txt: honour it for continuous monitoring but not for one-off captures?
5. Collect media from links (Auto Archiver / yt-dlp): in scope? (INTAKE_4's file came from a feed.)
6. Detectors: optional cloud detectors behind per-item consent, or local only? Images off by default? (CHECK_3 shows consent and the images-off default.)
7. Does the suite need a "synthetic" authenticity value, and should this research go to the suite? (CHECK_3 status names are proposals.)
8. Subject-of-story rule: a confirmed deepfake supports claims about the fake, never about what it shows? (CHECK_3 role switch.)
9. Where new records live first: app tables, mirrored to OpenAleph later, or OpenAleph first?
10. Licence handling: separate-process AGPL/GPL tools acceptable for a proprietary product, pending counsel?
11. Legal review before Phase 3 (Following)?

Also open, from the design and media-suite research: sign snapshots with a local key, or SHA-256 plus the custody line
(design §13); status names in §9.4; and the media-suite questions on transcription, naming voices and recording-consent
law (INTAKE_4 depends on them).

## What was checked, and what was not
Checked: each screen was rendered in headless Chromium at 1440 x 900 and looked at; the states listed above were
rendered and looked at or checked for text that spills out of its panel; the page produced no console errors in that
run; the interactions above were driven with Playwright clicks (the 9.5 s "play this part" wait included).
Not checked: Firefox and Safari; a phone (the frame scales down to fit instead of reflowing); a screen reader; colour
contrast was not measured; the keyboard path was not walked end to end; the screens were compared to the existing
mockups by eye, not pixel by pixel.
Limits of the mockup: audio does not play; the capture lane, "works today" checks, versions and scores are drawn, not
produced by any tool; tool versions shown (Playwright 1.64.0, warcio 1.8.1, c2pa-python 0.38.0, faster-whisper 1.2.1)
come from the research's release notes and were not run here.

## Rebuilding the pictures
The pictures were made with Playwright and Chromium: open `index.html?bare#capture` (or `#following`, `#real`,
`#listen`) at 1440 x 900 and take a screenshot. `?notes` opens with the notes layer on.
