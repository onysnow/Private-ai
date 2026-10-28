# Source intake: answers to the open questions (28 Oct 2026)

Ony, 28 Oct: "make judgement calls for those" (the 11 questions in `SOURCE_INTAKE_RESEARCH.md` §12, repeated in
`docs/design/source-intake-mockups/README.md`). These are the calls, each with the reason, taken from what the app is
for: a local-first workbench where every fact is one click from its source, the reporter and their sources stay
protected, a person makes every status decision, and the Authority Suite's rules hold. Each call can be changed by Ony.

Where a call rests on a legal reading, it is a product default, not legal advice; the questions for counsel in the
research §6 stay open.

| # | Question | Call | Why |
|---|---|---|---|
| 1 | Follow open sources only, or also bulk logged-out collection from closed platforms? | **Open sources only.** Monitors cover feeds, sitemaps, YouTube channel feeds, Bluesky, Mastodon, public Telegram, podcasts and newsletters. X, Instagram, TikTok, Facebook and LinkedIn: one item at a time from a pasted link, logged-out, or files the reporter supplies. No bulk collection. | X, Meta and YouTube terms bar automated collection, bans would land on the reporter's address, and the suite's EGS rule 8 wants item-by-item capture by a person. FOLLOW_1 is already drawn this way. |
| 2 | Third-party archives (Wayback-type) as an optional second witness? | **Yes, optional, off by default, per capture.** Offered only after the local capture is saved; blocked for source-protected items; each send written to the outbound log. | A second, independent copy makes a capture stronger to an editor or a court, but submitting the URL tells the archive what the reporter is looking at. INTAKE_3's off switch stays. |
| 3 | A neutral / Tor / VPN route per monitor or capture? | **Yes, per monitor and per capture: Direct (default) or Tor.** Tor is used through a Tor the reporter runs on the computer; the app does not ship one. A VPN is the computer's own setting and stays outside the app. A monitor or capture of a party marked sensitive asks for the route before its first request. | Polling an account from a newsroom address reveals interest; the research (§5.1) asks for neutral egress for sensitive targets. Shipping Tor or a VPN is a large security surface the app does not need. |
| 4 | robots.txt: honour it for monitoring but not for one-off captures? | **Yes.** Monitors honour robots.txt and poll politely (conditional GET, per-host limits, Retry-After). A one-off capture of a page the reporter is reading does not check it, and the receipt says so when robots.txt disallows the page. | robots.txt is about automated crawling, which a monitor is; a single evidentiary capture is a person reading a page. Recording it keeps the choice visible. |
| 5 | Collect media from links (Auto Archiver / yt-dlp): in scope? | **In scope, single items only, logged-out, no cookies.** Originals and `info.json` kept; the route (capture or API) recorded on each item; a per-platform "works today" check. | The app has to hold the videos and posts a story rests on; both tools are permissively licensed (MIT, Unlicense). Recording the route lets counsel apply the right platform terms (research §5.2). |
| 6 | Detectors: optional cloud detectors behind consent, or local only? Images off by default? | **Automatic detectors are local only; image detectors off by default.** Outside checks (reverse image search, SynthID Detector) only when the reporter asks for one item, with consent each time, blocked for source-protected items, written to the outbound log. No cloud detector runs on its own. | Off-the-shelf detectors score about chance on real social-media content and image detectors collapse on recompressed files (§9.1), so a cloud detector buys little and sends the material out. Reporters do use reverse search, so it stays available, by hand. |
| 7 | Does the suite need a "synthetic" authenticity value? | **Yes, and that is a suite change for Ony.** The research §9 goes to the suite as input to its open item "a named framework for detecting AI-generated or synthetic-text sources". Until the suite has a value, the app keeps its own check record and shows the suite `DISPUTED` for an item a person marked likely or confirmed synthetic. | `Evidence.authenticity_status` has no value for it today. Which tier each status lands in is the suite's call (§9.5), not the app's. |
| 8 | A confirmed deepfake supports claims about the fake, never about what it shows? | **Yes.** Evidence carries a role: evidence of events, or the subject of the story. The block on support applies only to the first. | It is the only rule that lets a story about a deepfake cite the deepfake without letting the fake prove its own content. |
| 9 | Where new records live first: app tables, or OpenAleph? | **App tables first, mirrored to OpenAleph later** (research Phase 6). | OpenAleph has no web capture or WARC, hashes with sha1, has a self-asserted retrieval date, and overwrites a re-captured URL's metadata instead of keeping versions (§8.2). Custom schemata must be loaded in every OpenAleph process. |
| 10 | Separate-process AGPL/GPL tools acceptable for a proprietary product? | **Avoid them where a permissive tool does the job, which covers Phases 1–2** (Playwright, warcio, trafilatura, yt-dlp, Auto Archiver, faster-whisper, c2pa-python). Where nothing else exists, a separate process is acceptable pending counsel. | Keeps the licence question small. **Already in the app:** PyMuPDF (AGPL-3.0) is imported in-process by `backend/app/services/pdf_ocr.py`, `page_image.py`, `image_reader.py` and `legibility.py`. That is linking, not a separate process, so it needs Ony's attention: a commercial PyMuPDF licence, a permissive replacement (pypdfium2, Apache-2.0/BSD), or moving it behind a separate process. |
| 11 | Legal review before Phase 3 (Following)? | **Not for Following as scoped in 1 and 4** (open feeds, honouring robots.txt, polite polling). **Required before anything wider:** closed platforms, API collection kept past a platform's retention rule, or bulk capture. | Feeds are published to be read by software, so they carry little legal risk. The risky parts (§6 questions 2, 3, 3b) are the parts call 1 leaves out. |

## Also open in the README

- **Snapshot signing:** SHA-256 and the custody log on every capture. A trusted timestamp (RFC 3161, sending only the
  hash) is the "time proof" switch, off by default, per capture. A local signing key waits for the app lock's key
  handling (ADR-0016).
- **Status names (§9.4), in the app's plain words:** Origin checked (verified-origin), Not checked (unverified),
  Looks AI-made (likely-synthetic), AI-made (confirmed-synthetic), Disputed. Only a person sets the first, third,
  fourth and fifth, with reasons.
- **Media-suite questions that INTAKE_4 depends on** (transcription, naming voices, recording-consent law) are taken
  with the media suite, which comes after this.

## Timeline (asked the same day)

Three Timeline designs exist and none was chosen: *Timeline mockups* (artifact HtMrp8LYwWqg8hsbpHVgb5, 10 Oct:
Stack, Lanes, Build your own), boards 4–13 of *Workbench redesign* (A7So1mxoEw4sYHkryasdBz: six variants and the
corkboard), and the proposal in *Workbench_Walkthrough* (Xc8NUft82hsZwCjBe4UWdc, 22 Oct). **Call: combine them into
one Timeline mockup, with Places beside it, for Ony to approve before it is built.** Lanes is the base, because it
already draws ranged dates as bars, unchecked and disputed items by shape, and rows by kind, party, source or
certainty, which fixes the backlog's complaints (an axis from 1952, overlapping labels, raw property names, invented
days). Build your own timeline joins it as a mode, and the redesign's story-mode scrub becomes its replay.
