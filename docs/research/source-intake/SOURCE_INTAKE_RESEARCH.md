# Source intake: news, social media, following sources, and keeping AI-made material out

Research dates: first pass 19 Oct 2026; second pass 19 Oct 2026 (same day, deeper). Branch `claude/private-ai-content-ingestion-nq2dnd`. Nothing in the app has changed. This is research and a plan, for mockups and Ony's approval before any build.

## 0. The short version

1. **Today the app takes files only.** A pasted link is accepted and ignored, audio and video are refused, and nothing follows an outlet, a journalist or an account (§1).
2. **Capture: reuse, don't write extractors.** Bellingcat's Auto Archiver (MIT, v1.2.9 released 1 Sep 2026) plus yt-dlp (Unlicense, 19 Aug 2026) cover capture, hashing and timestamps. Everything stays local by default. Ony's own design research (§13) and the suite's EGS Module 04 already specify what a capture must record (§3, §4).
3. **Licences matter here because Private-ai is proprietary.** Permissive tools can be linked. GPL and AGPL tools (Browsertrix, pywb, gallery-dl, Zeeschuimer, 4CAT, Firecrawl, ftm-analyze, ingest-file, Datashare and others) can only run as separate programs, and counsel should confirm even that (§3.3). All licences below were read from the LICENSE file or PyPI.
4. **Platforms split three ways.** Open (Bluesky, Mastodon, Telegram public, YouTube feeds, RSS): build monitors. Gated or paid (X, Meta, TikTok, Reddit): capture what the reporter is looking at; no bulk crawling. Journalist eligibility for the official research programmes is unproven (§5).
5. **FollowTheMoney covers articles, not social media.** Tested against the real FtM 4.11 model (the version OpenAleph and this backend both pin): 8 drafted schemata load and behave (§8, Appendix A). OpenAleph itself has no web capture, no WARC, a self-asserted `retrievedAt`, and sha1 as its default hash (§8.2).
6. **Keeping AI-made material out cannot rest on a detector.** Off-the-shelf detectors score about chance (AUC ~0.5) on real social-media content; commercial ones stay under 90% accuracy. What works is layers: provenance, then source reputation, then detectors as hints, then a person who records reasons (§9). The suite lists "a named framework for detecting AI-generated sources" as an open item; this is input for that, and the suite change is Ony's call.
7. **Not everything could be verified.** The research environment could not open web pages directly; official-domain search excerpts filled most platform gaps (§5.2) but are not the pages. What is still unread is listed in §11. One finding changes the plan: YouTube, X and Reddit terms require stored API data to be refreshed or deleted, and X, Meta and YouTube bar automated collection without written permission, which sits against evidence preservation (§5.2, §6).

### What the second pass corrected in the first draft

| First draft said | Checked result |
|---|---|
| FtM 3.8.4 | OpenAleph, ingest-file and ftm-analyze all pin followthemoney 4.11.x; the repo moved to `opensanctions/followthemoney`. Re-tested on 4.11.0 |
| `Message` requires a sender, so `SocialPost` inherits that | Wrong: `required` is not inherited in FtM 4.11. Tested: `SocialPost.required = []` |
| Custom schemata work with default settings | They default to `matchable: true`, and have no label or caption. Fixed and re-tested |
| C2PA newest is 2.3; "2.4" unconfirmed | The spec's own history lists 2.5 (Oct 2026), 2.4 (Apr 2026), 2.3 (Dec 2025) |
| SynthID Detector is waitlisted | Google's blog (official-site excerpt) says access is expanded to everyone, globally in English; images, video and audio per synthid.com; not a general AI detector |
| gallery-dl GPL-2; Zeeschuimer and 4CAT MIT/MPL | gallery-dl is GPL-2.0-only; Zeeschuimer and 4CAT are AGPL |
| Berkeley Protocol 2020, then 2022 | Both hold: the English edition launched 1 Dec 2020 (OHCHR); translated editions followed in 2022, the date the suite cites |
| "Most platforms strip C2PA" | Partly wrong: a Washington Post test (Oct 2025) found none of eight platforms kept or showed credentials, but YouTube, Meta, TikTok and LinkedIn say they read C2PA on upload and add their own labels |
| YouTube search.list costs 100 units | The 2026-10-15 quota page says 100 `search.list` calls per day plus 10,000 units/day for everything else |
| "ACLU v. Sessions" | The case is Sandvig v. Sessions (2018), then Sandvig v. Barr (2020) |
| hiQ outcome | The CFAA win did not save hiQ: breach of contract was found and it settled (§6) |
| Text detectors flag non-native writers at 61.3% | The arXiv text says 61.22%, seven 2023-era detectors, 91 essays. Not a rate for current tools |
| Open decision on `Message.required` | Removed (see above) |
| X read price $0.005 from vendor blogs | Confirmed by X's own pricing page excerpt; its monthly cap conflicts between its own pages (3 million vs 2 million) |
| Meta Content Library limited to accounts over 25,000 followers | The threshold for public accounts was lowered to 1,000 followers (Meta Transparency Center excerpt) |
| DSA delegated act "adopted 2 Jul 2025" | Delegated Regulation (EU) 2025/2050 is dated 1 July 2025; the portal opened 29 Oct 2025 |
| Digital Omnibus "unconfirmed" | Confirmed adopted: Regulation (EU) 2026/1744 (in force 27 Jul 2026) |
| Reddit pricing and access | Self-service closed Nov 2025; approval needed for new tokens; no pricing found |

## 1. What the app has today (checked in this repo)

| Need | State | Where |
|---|---|---|
| Upload articles/clippings as files | Works: `.txt .md .csv .html .htm .pdf .docx`, images `.png .jpg .jpeg`, containers `.eml .mbox .zip .xlsx` | `services/documents.py:24`, `html_reader.py`, `image_reader.py`, `container_readers.py` |
| OCR of screenshots and scans | Works | `image_reader.py`, `pdf_ocr.py` |
| Wider formats | Only with OpenAleph running | `openaleph_formats.py` |
| Audio/video | MP3/WAV/MP4 give 415; demo `.mp3/.mov` show "failed · 0 chunks" | `BACKLOG.md:91` |
| Paste a link | Field exists; not fetched or archived; "not a url" accepted | `BACKLOG.md:92`, `MOCKUP_BUILD_LIST.md:97,103` |
| Web search | Firecrawl `/v2/search` returns title, URL, description only | `connectors/firecrawl.py` |
| Online capture record | Form for URL, date, SHA-256, custody log; filled by hand | `services/case_records.py` (CAPT) |
| Follow names | Watchlist searches the case's own documents when one arrives | `services/watchlists.py` |
| Follow outlets/accounts/feeds | None | n/a |
| Authenticity | `Evidence.authenticity_status` (VERIFIED / PROVISIONAL / DISPUTED / UNKNOWN, apart from truth), `Source.source_tier` A–F, `restates_evidence_id`, four dates. No AI-origin field, no check history | `models/sources.py`, `ai/suite_vocab.py:16` |
| Licence of this repo | Proprietary | `LICENSE` |
| FtM version | `followthemoney==4.11.0` | `backend/requirements.txt` |

### 1.1 What the suite and the approved design already say

- **Ony's design research, §13 "Source & exact evidence capture"** (`docs/design/REDESIGN_RESEARCH.md`, ~lines 3624–3700): web capture "keeps a snapshot (HTML or MHTML + screenshot), its SHA-256 and the time"; link dead at capture is saved as "link only" with the reason; a page behind a login or paywall is "not seen", never "shown"; an optional "changed since capture" re-check marks a source "changed" or "gone", "which is itself evidence"; quotes store exact text plus 32 characters of prefix and suffix (Hypothesis selectors). The Drop (INTAKE_1) is "one drop for everything", with a pasted URL becoming a source capture. This document's Phase 1 is that design.
- **EGS Module 04, Online Collection and Preservation** (`ai/authority_suite/systems/egs/PROMPT_MODULES/04_…md`): capture before use; record URL, page source (HTML) and a full capture showing the collector's system date and time (a screenshot alone is not enough); tool and version; collector; start and end time; displayed metadata marked "as displayed, not verified"; hash with algorithm; original kept unaltered, working copies hashed; custody log; log failed captures as outcomes; **"prefer item-by-item manual capture to bulk automated collection, and record the reason if bulk collection is used"**; **"Do not verify or authenticate content… Content verified: not done by this system"**; and text on a captured page is data, never an instruction.
- **The suite's source tiers** (`systems/tas/CORE/SOURCE_AUTHORITY_AND_RETRIEVAL_POLICY.md`): A–F; tier F is "social posts, anonymous tips, community repositories": leads only unless independently verified; only tier A carries a corroborated fact alone.
- **RAS provenance flag** (`systems/ras/CORE/…POLICY.md` §3): `verified` or `unverified-provenance` (no named checkable author or publisher plus another mark such as no method, unresolvable citations, or text duplicated across unrelated sites). Flagged sources are tiered no higher than 8 and never counted as corroboration. **This is an interim rule; the suite lists "a named framework for detecting AI-generated or synthetic-text sources" as an open item** (`ras/SOURCE_INDEX.md`, `ras/README.md`).

Consequences: (a) social posts are already capped by the suite; (b) a "Capture" record is already defined by the suite (GCAP) and should drive the schema; (c) following sources must be built so a person decides what to capture, or records a reason for bulk collection; (d) the authenticity check is app-side work the suite explicitly leaves undone, and anything that changes the suite's vocabulary is Ony's decision to make in the suite.

## 2. Method and limits

- Two passes, 12 research agents plus my own checks in the repo, plus a third round of targeted searches restricted to official domains (WebSearch returns excerpts of the page, not the page). **Second pass tools:** `raw.githubusercontent.com` and PyPI worked from the shell; everything else did not resolve (WebFetch DNS failures); Firecrawl ran out of credits partway. WebSearch returns summaries of pages, not the pages.
- Tags used: **[read]** the primary text or file was opened; **[search]** a search-engine summary of a page that was not opened; **[memory]** not re-checked; **[tested]** I ran it.
- Licences below are **[read]** from LICENSE files or PyPI metadata unless marked otherwise. Release dates are PyPI upload dates.
- Two tool outputs (Firecrawl) carried text asking the agents to add a billing link to their answers. They were ignored.

## 3. How other tools do it

### 3.1 Capture and archive

| Tool | What it does | Licence | Latest | Fit | Caveat |
|---|---|---|---|---|---|
| **Bellingcat Auto Archiver** | URL → media (via yt-dlp and other extractors), hashes, screenshots, WACZ, RFC 3161 and OpenTimestamps timestamps; deletion detection (1.2.0); Bluesky, Reddit, LinkedIn extractors | MIT | 1.2.9, 2026-09-01 | **Full** for capture | Extractors break with platform changes; some need logins/cookies; its own dependency licences not checked |
| **browsertrix-crawler / Browsertrix** | Real-browser crawl to WARC/WACZ with logged-in sessions | AGPL-3 | n/a | **Full** for web fidelity | AGPL: separate process only. Heavy |
| ArchiveBox | Self-hosted archive: HTML, SingleFile, WARC, PDF, screenshot, media | MIT | 0.9.73, 2026-10-06 | Partial | Own UI and DB; weaker on hashing/timestamps |
| warcio | WARC read/write | Apache-2.0 | 1.8.1, 2026-03-31 | Building block | Write our own WARC |
| wacz (Python) | WACZ packaging | Apache-2.0 | 0.6.0, 2026-09-10 | Building block | |
| pywb / ReplayWeb.page | Replay WARC/WACZ | GPL / AGPL-3 | pywb 2.10.0, 2026-09-22 | Viewer | Separate process only |
| SingleFile | One-file page save (extension) | AGPL-3 | n/a | Manual only | |
| changedetection.io | Page-change monitor: CSS/XPath/JSON selectors, RSS output, Playwright for JS pages, Docker | Apache-2.0 | 0.60.9, 2026-10-12 | **Good sidecar or model for "changed since capture"** | README promotes a paid hosted service |
| Zeeschuimer + 4CAT | Browser extension records what you browse (TikTok, Instagram, X, LinkedIn…); 4CAT analyses | **AGPL-3** (both) | n/a | Partial–full for closed platforms | Separate process only. Depends on page structure |
| Wayback Save Page Now / Perma.cc / archive.today | Third-party archives | Services | n/a | Optional second witness | **Send the URL to a third party.** archive.today has no API; Guardian, NYT, FT and USA Today reportedly block the Wayback Machine [search] |
| Hunchly | Commercial investigator capture | Proprietary | n/a | Reference design (cited in Ony's research) | Closed |
| Memento (RFC 7089) | Find archived versions | Spec | n/a | Lookup only | |
| internetarchive (Python) | Official IA client | AGPL-3 | 2026-10-15 | Avoid linking | |
| Datashare (ICIJ) | Local document search + NER | AGPL-3 | n/a | Design reference; no URL ingest found | Java backend, Vue client; flat document model (§8.3) |

### 3.2 Libraries

| Library | Licence | Latest | Note |
|---|---|---|---|
| **yt-dlp** | Unlicense | 2026.8.19 (2026-08-19) | Works for many platforms; breaks and is updated often. Platform coverage [memory] |
| gallery-dl | **GPL-2.0-only** | 1.32.17 (2026-10-17) | Separate process only |
| Instaloader | MIT | 4.15.4 (2026-10-12) | Public profiles; rate-limited |
| TikTok-Api (unofficial) | MIT | 7.3.3 (2026-04-01) | Fragile |
| snscrape / twint | n/a | snscrape not updated since 2023 [search] | Treat as dead |
| Nitter / XCancel | n/a | One vendor guide says both went offline on 25 Aug 2026 [search, single source] | Don't build on it |
| **trafilatura** | Apache-2.0 | 2.3.1 (2026-10-06) | Best article-text extractor; finds feeds and sitemaps |
| newspaper4k | MIT | 0.9.6 (2026-07-19) | Alternative |
| readability-lxml | Apache-2.0 | 0.9 (2026-08-27) | |
| htmldate | Apache-2.0 | 2026-10-02 | Publication date extraction |
| feedparser | BSD-2 | 6.0.14 (2026-07-30) | |
| Scrapy | BSD-3 | 2.19.0 (2026-09-10) | |
| Playwright (Python) | Apache-2.0 | 1.64.0 (2026-10-13) | |
| crawl4ai | Apache-2.0 | 0.9.5 (2026-10-14) | |
| Firecrawl self-host | AGPL-3 (client `firecrawl-py` MIT) | 4.53.0 | Hosted Firecrawl sends URLs to a third party |
| RSSHub / FreshRSS | AGPL | n/a | Routes break; separate process |
| Miniflux | Apache-2.0 | n/a | Light feed poller with an API |
| Telethon | MIT | 1.45.0 (2026-09-10) | Real user account (ban risk); uses a personal login |
| atproto (Bluesky) | MIT | 0.0.73 (2026-10-17) | Open firehose/public AppView [memory] |
| Mastodon.py | MIT | 2.3.3 (2026-10-18) | Per-instance rules |
| faster-whisper | MIT | 1.2.1 (2025-10-31) | Local transcription |
| WhisperX | BSD-2 | 3.8.6 (2026-05-25) | Word timestamps and speakers; pyannote needs a gated model |
| whisper.cpp | MIT | n/a | What ftm-transcribe shells out to |
| pyannote.audio | **MIT** (GitHub LICENSE; PyPI field blank) | 4.0.7 (2026-06-30) | Code is MIT; the diarization models are gated behind a contact form (media-suite round-2 check), so check the model terms separately |
| imagehash | BSD-2 | 4.3.2 (2025-02-01) | Perceptual hashes |
| datasketch | MIT | 2026-07-05 | MinHash near-duplicate for wire copy |
| open_clip_torch | MIT | 3.3.0 (2026-02-27) | Local image similarity |
| ExifRead / Pillow / pillow-heif | BSD / MIT-CMU / BSD-3 | current | EXIF/GPS |
| pyexiv2 / pyexiftool | GPL-3 / GPL-3+ or BSD | | Avoid linking |
| OpenTimestamps client | LGPL-3 | 0.7.2 (2024-12-31) | Python lib `python-opentimestamps` |

### 3.3 Licence handling, since Private-ai is proprietary

- **Link as libraries (permissive):** MIT, BSD, Apache-2.0, Unlicense (e.g. yt-dlp, Auto Archiver, trafilatura, feedparser, Playwright, warcio, faster-whisper, WhisperX, atproto, Telethon).
- **Separate process/service only, and ask counsel:** GPL (gallery-dl, pywb, pyexiv2, whatstk) and AGPL (Browsertrix, Zeeschuimer, 4CAT, Firecrawl self-host, SingleFile, ReplayWeb.page, RSSHub, FreshRSS, Datashare, internetarchive, and OpenAleph's own ftm-analyze, ftmq, openaleph-search, ingest-file, ftm-transcribe, openaleph-procrastinate, ftm-lakehouse, ftm-translate). The OpenAleph server itself is MIT; FtM is MIT. The app already talks to OpenAleph over its API.
- **LGPL:** gallery-dl is *not* LGPL (an early scan said so; PyPI says GPL-2.0-only); OpenTimestamps client is LGPL-3.
- **c2pa-rs, c2pa-python, c2patool:** MIT OR Apache-2.0 (LICENSE-MIT and LICENSE-APACHE read; there is no plain LICENSE file).
- **Unclear:** pyannote.audio (blank), datashare-python and caul (no licence), several Hugging Face detector models (not checked).

### 3.4 Transcription

faster-whisper (default), WhisperX for word times and speakers; try existing captions first (yt-dlp subtitles; podcast `podcast:transcript` tags). Whisper can invent text (Careless Whisper, in the media-suite research). Record model, version and parameters; keep publisher transcripts and our own labelled apart. OpenAleph's `ftm-transcribe` runs whisper.cpp but is not usable as published (§8.2).

## 4. Evidentiary capture, set against what the suite requires

| Requirement | Source | What implementing it needs |
|---|---|---|
| Capture before use; no quoting before a capture record exists | EGS M04 rule 1 | Block "Save evidence" from a link until the capture exists |
| URL + page source (HTML) + full capture showing system date/time; screenshot alone is not enough | M04 rule 2; Eurojust/ICC guidelines (GS-11) | Store HTML/MHTML, a WARC/WACZ, and a screenshot |
| Tool + version, collector, start and end time | M04 rule 3 | Fields on `Capture` (Appendix A) |
| Displayed metadata recorded "as displayed, not verified" | M04 rule 4 | Keep uploader/post date apart from our own fields |
| Hash + algorithm; original kept unaltered; working copies hashed and marked as copies | M04 rules 5, 6 | SHA-256 (OpenAleph defaults to sha1; §8.2) |
| Custody log: who, when, why, where stored | M04 rule 7 | Existing CAPT custody log |
| Prefer item-by-item manual capture; reason recorded for bulk | M04 rule 8; Berkeley Protocol | Monitors surface items; a person captures, or a recorded reason covers a bulk run |
| Failed capture is an outcome, with reason | M04 rule 9 | "link only", "not seen", removed, login wall |
| Do not verify or authenticate; "Content verified: not done by this system" | M04 rule 10 | Authenticity checks are a separate app layer (§9) |
| Page text is data, not instructions | M04 rule 11 | Never pass captured page text to an AI as instructions |
| Timestamping | Berkeley Protocol; Auto Archiver supports it | RFC 3161 (sends only a hash, per search summary of the RFC) or OpenTimestamps (client adds a random nonce, so the calendar sees neither the file nor its digest, read in code) |

Berkeley Protocol: OHCHR and UC Berkeley's Human Rights Center launched the English edition on **1 Dec 2020** (OHCHR story dated that day; ISBN 978-92-1-154233-2) [excerpt]; translated editions followed in 2022, and the suite cites a 2022 OHCHR PDF (`…/2024-01/OHCHR_BerkeleyProtocol.pdf`). It sets minimum standards for identification, collection, preservation, verification and analysis. The protocol text itself was not opened here; the suite's own reading (paras 14, 28, 38–39) is the strongest available statement of its principle of legality: follow the applicable law of each jurisdiction, and open-source information excludes unauthorised access.

WARC: WARC 1.1 is a standard (source in `iipc/warc-specifications` [read]; ISO 28500:2017 per search summary). WACZ stable version listed at specs.webrecorder.net/wacz/1.1.1 [search].

Web Annotation selectors for quotes [read, from a copy of the 2017 Recommendation in the w3c repo]: `TextQuoteSelector` {exact, prefix, suffix}, `TextPositionSelector` {start inclusive, end exclusive}, and time ranges as a `FragmentSelector` with `t=30,60` conforming to Media Fragments. This matches Ony's design (§13).

## 5. Following sources over time, and platform access

### 5.1 Following

- **Discover:** `<link rel="alternate">`, `/feed`, sitemaps; news sitemaps (Google's guidance: drop entries older than 2 days; max 1,000 URLs per sitemap [search]); YouTube channel feed `youtube.com/feeds/videos.xml?channel_id=` [memory]; podcasts via their RSS.
- **Poll politely:** conditional GET (ETag / If-Modified-Since), per-host rate limits, jitter, `Retry-After`. memorious4 does conditional requests and incremental tags [read].
- **Change detection:** hash the extracted main text, keep every version, capture each revision. changedetection.io is the model to copy or embed.
- **Duplicates:** exact SHA-256; MinHash for syndicated copy; pHash for images; DOI for papers.
- **Monitors surface, people capture.** To respect EGS rule 8, a monitor creates an "at-risk, capture first" queue; bulk capture needs a recorded reason.
- **robots.txt:** not law in most places; honour it for continuous monitoring; a one-off evidentiary capture of a page the reporter is reading is different. Needs Ony's decision (§12).
- **Source protection:** anything third-party learns what the reporter is interested in (Wayback SPN, Perma.cc, Event Registry, NewsAPI, hosted Firecrawl, Google APIs, external reverse-image sites): default off, opt-in per item. Polling an account from a newsroom address, or logging in as a person-linked account, reveals interest: neutral egress or Tor for sensitive targets, dedicated accounts, never a personal one. The watchlist and monitor list are themselves sensitive. Subscribing to a newsletter exposes the subscriber and tracking pixels reveal opens: use a dedicated alias and never load remote images.

### 5.2 Platform access

Tags: **[read]** page opened; **[excerpt]** an excerpt of an official page returned by a search restricted to that site (the page itself was not opened); **[search]** secondary summary.

| Platform | What the evidence says | Basis |
|---|---|---|
| **YouTube** | Quota page ("Last updated 2026-10-15"): default is **100 `search.list` calls per day**, 100 `videos.insert` calls, and 10,000 units/day for other endpoints; `videos/channels/playlistItems/commentThreads/comments/activities .list` cost 1; `captions.list` 50, `captions.insert` 400, `captions.update` 450, `captions.delete` 50. **Developer Policies: data from the API may be stored no longer than 30 calendar days, then must be deleted or refreshed** (non-authorized data: "an API Client must not store statistics retrieved as Non-Authorized Data for more than 30 days"); deletion requests within 7 days; an exception allows audited analytics developers to keep some metrics up to 36 months, from 1 Jun 2026. **Terms of Service** list downloading content among prohibited uses unless the Service authorises it or YouTube and rights holders give written permission, and bar scrapers except public search engines following robots.txt (the copy seen may be ~1,000 days old) | Quota: **[read]** developers.google.com/youtube/data/determine_quota_cost. Policies and ToS: **[excerpt]** developers.google.com/youtube/terms/developer-policies, youtube.com/static?template=terms. `captions.download` cost not listed |
| **Reddit** | Responsible Builder Policy: developers "must request access and get explicit approval before accessing any Reddit data through our API"; commercial use needs separate explicit written approval; selling, licensing, sharing or commercialising Reddit data, and mining, scraping or training AI models on it, is prohibited without express written approval; deleted content must be removed and the wiki "strongly recommends" deleting stored user data within 48 hours. A Nov 2025 announcement closed self-service access: new OAuth tokens need approval, existing access continues; researchers file a ticket (Reddit for Researchers: approved non-commercial academic projects). Research through the API outside that programme is prohibited. Journalists are not named anywhere | **[read]** support.reddithelp.com article 14945211791892 (Developer Platform); **[excerpt]** article 42728983564564 (Responsible Builder Policy, ~14 days old) and the Nov 2025 announcement (mirrors of the r/redditdev post) |
| **X** | Official pricing page: pay-per-use; Post reads **$0.005**, user reads $0.010, owned reads $0.001, creating a post $0.015 (a post with a URL $0.20); repeat requests for the same resource within 24 hours (UTC) are not charged again; failed requests are not billed; monthly cap **3 million Post reads on the pricing page but 2 million on the usage-and-billing and Enterprise pages (unresolved)**. **ToS (PDF dated 2026-04-10):** "crawling or scraping the Services in any form, for any purpose without our prior written consent is expressly prohibited"; the earlier robots.txt allowance is gone. Developer Guidelines: non-API automation "results in permanent suspension". **Developer Policy:** redistribute only Post/User IDs (max 1,500,000 Post IDs per entity per 30 days); up to 500 public objects per user per day by non-automated means; hydrated redistribution up to 50,000 per recipient per day and not public; stored content must be kept current and deleted or modified within 24 hours of a request (snapshot flagged 151–175 days old) | **[excerpt]** docs.x.com/x-api/getting-started/pricing, /fundamentals/post-cap, /developer-terms/policy, legal.x.com ToS PDF. Free-tier status not found |
| **Meta (Facebook, Instagram)** | **Automated Data Collection Terms:** no automated data collection "without first obtaining Meta's express written permission"; accepting the terms is not the permission. Business Discovery API returns basic metadata and metrics for *other* Instagram **Business or Creator** accounts only, not personal accounts. **Meta Content Library:** requires affiliation with an academic institution or a not-for-profit with scientific or public-interest research as a primary purpose; applications via Research Tools Manager or through ICPSR (University of Michigan), reviewed by CASD; sanctions exclusions; Meta's 2023 commitment says journalists affiliated with a qualified non-profit or academic institution "will be onboarded"; the follower threshold for public accounts was lowered from 25,000 to 1,000. Journalists are not a named category | **[excerpt]** facebook.com/legal/automated_data_collection_terms, developers.facebook.com Business Discovery docs (pages flagged 490–740 days old), transparency.meta.com Content Library pages, about.fb.com 2023 post |
| **TikTok** | Research Tools: academic institutions in the US, EEA, UK, Canada, Switzerland, and not-for-profit/independent research bodies in the EU (Brazil for youth-safety research); criteria: research expertise, independence from commercial interests, a not-for-profit public-interest mission, disclosed funding, ethical review. Terms say TikTok may also grant access to other cases. **EU vetted researchers must go through the Digital Services Coordinator (Coimisiún na Meán): TikTok does not accept direct applications.** Pages conflict and are old (700–1,400 days); a journalist at a for-profit outlet probably would not qualify. Display API, Commercial Content API and scraping clause not found | **[excerpt]** developers.tiktok.com/products/research-api, tiktok.com/legal research terms |
| **EU DSA Art. 40** | Delegated Regulation **(EU) 2025/2050 of 1 July 2025** (CELEX 32025R2050); Data Access Portal opened **29 Oct 2025**; the Digital Services Coordinator has 80 working days to formulate a reasoned request or explain; applicants show affiliation to a research organisation, independence from commercial interests, data security capability, funding disclosure and a commitment to publish; Recital 97 mentions civil-society organisations doing scientific research for a public-interest mission; non-vetted researchers can reach publicly accessible data in platform interfaces under conditions; formal proceedings are open against X, AliExpress, Meta and TikTok including over researcher access to public data. **No source addresses journalists** | **[excerpt]** algorithmic-transparency.ec.europa.eu FAQ, data-access.dsa.ec.europa.eu, digital-strategy.ec.europa.eu, EUR-Lex |
| **Telegram** | API Terms: apps need their own `api_id`; abuse (flooding, spam, faking subscriber or view counters) can lead to a permanent ban; accounts logging in through unofficial clients are automatically placed under observation; the Bot Platform terms bar making bot credentials available to the public. Nothing on scraping public channels | **[excerpt]** core.telegram.org/api/terms, telegram.org/tos/bot-developers |
| **Bluesky / AT Protocol** | The firehose is free, authenticated, covers posts, likes, follows and handle changes; Bluesky expects funded projects relying on it to pay infrastructure providers or run their own relay, and recommends client-side rate limiting for backfills; developer guidelines ban spam and require honouring deletion requests. The ToS scraping clause was not retrieved | **[excerpt]** docs.bsky.app developer guidelines and firehose guide |
| **Mastodon / Threads / LinkedIn** | Mastodon per instance [memory]; Threads has an official Graph-style API, keyword search reported at 500 queries per rolling 7 days [search, secondary]; LinkedIn bans scraping and has no useful official read API [search] | Mostly unverified |

**Conflict with evidence preservation (for counsel, §6).** YouTube (30 days), X (24 hours on request) and Reddit (recommended 48 hours) require stored API data to be refreshed or deleted, and X, Meta and YouTube prohibit automated collection or downloading without written permission. A journalist's evidentiary capture (an unaltered original kept with a hash) may sit against those terms whichever way it is collected. The suite's own capture rules assume the capture is kept. Where the content came through an API, the app should record the route (API or capture) so counsel can apply the right terms.

### 5.3 Other source types

| Type | Best route | Notes |
|---|---|---|
| Newsletters | Email ingestion into the existing `.eml` path is primary; RSS is the free-tier path | Substack/Ghost/Beehiiv feed availability and paywall behaviour unverified; keep raw `.eml` and feed XML; python-substack is unofficial |
| Podcasts | Podcast RSS; `podcast:transcript` tag (types text/plain, text/html, text/vtt, application/json, application/x-subrip; `rel="captions"` = timecoded) [read]; Podcast Index API for discovery (docs repo MIT) with own transcription otherwise | **Podcast Index API terms v2.0 (effective 4 Oct 2026): free for any purpose including commercial**, excluding re-exposing the API as your own public service and bulk scraping of it (use the public data dumps); free key and secret; a User-Agent that identifies the app is required; rate limits are not published [excerpt]. Apple iTunes Search ~20 calls/min [search]; Spotify exposes no public audio URL [search] |
| Paywalled / syndicated news | Capture what the reporter can see to WARC; Common Crawl CC-News as an open corpus (news-crawl code Apache-2.0); licensed corpora (Nexis, Factiva, ProQuest) are institution-mediated | Copyright/privacy duties stay with us; "stop at the login" norm [search]; wire dedupe via MinHash |
| Messaging | **User-supplied exports**: Telegram `result.json` (official export schema [search]), WhatsApp `.txt`/`.zip` (WhatsApp-Chat-Exporter MIT; whatstk GPL-3), Signal Desktop export (signal-export MIT; breaks when Signal changes key storage [search]) | **WhatsApp's Terms bar collecting users' information in an unauthorised manner and its FAQ says scraping personal data (phone numbers, profile pictures, statuses) violates the Terms and can get accounts banned; the Channels-specific terms were not found.** **Discord's Terms prohibit scraping the service without written consent, including with any bot, crawler or scraper; its developer policy bars mining or scraping and AI training on API data; self-bots are forbidden and can lead to termination** [excerpt]. No official read API for WhatsApp Channels found; do not plan live collection from WhatsApp or Signal. Joining with your own number exposes it to admins. Exports hold third-party phone numbers |
| Non-US platforms (Weibo, WeChat, VK, Naver/Kakao, LINE, Rumble, Gab, Truth Social) | No clean official route found; use exports or manual capture with WACZ | Truth Social's truthbrush has an Apache-2.0 LICENSE file but PyPI says "Other/Proprietary"; endpoints reported disabled [search]. Several entries unverified |
| Academic papers | **Crossref** as backbone; OpenAlex by DOI; arXiv, PubMed E-utilities, Semantic Scholar, Unpaywall as needed | Crossref public pool 5 req/s single lookup, 1 req/s lists, polite pool (with `mailto`) 10 and 3 req/s [search, Dec 2025 blog]. **Take retraction status from Crossref `update-to`** (source `retraction-watch` or `publisher`), not OpenAlex `is_retracted`, which lumped corrections and concerns in with retractions for a few months [search]. **OpenAlex data is CC0; a free key gives a $1/day budget ($0.10/day keyless); single-record lookups are free, list calls $0.0001, searches $0.001, PDF downloads $0.01; paid plans from $5,000/year; its pages disagree on per-second limits (30 req/s on the authentication page, 100 req/s on the quick reference)** [excerpt, help.openalex.org] |
| Court and government | juriscraper (BSD-2), courts-db (BSD-2), CourtListener RECAP, edgartools (MIT), python-muckrock, GovInfo | SEC EDGAR 10 requests/s with a declared User-Agent [search]; PACER fees [search]; keep receipts | **CourtListener default for new logged-in users in 2026: 5 requests/minute, 50/hour, 125/day (previously 5,000/hour; accounts that made 1,000+ requests are grandfathered); citation lookup 60 citations/minute; RECAP Fetch 30/minute; HTTP 429 with Retry-After; membership tiers are intended for personal, educational, research, journalistic and exploratory use; one account per project** [excerpt]
| Reverse image / geolocation | Local first: perceptual hash + CLIP against the case's own files; TinEye API is the only commercial reverse-image API found (prices undated); Bing Search APIs retired 2025-08-11 [search]; PimEyes: Hamburg DPA closed its investigation Nov 2025 while saying practices were likely unlawful, noyb sued Apr 2026 [search], no API | Platforms mostly strip EXIF/GPS on upload [search]; every online reverse search discloses the image (§9.3) |

## 6. Law (for counsel; not legal advice)

Tiers: **[read]** primary text opened; **[excerpt]** primary excerpt from a search; **[search]** secondary summary.

### United States
- **hiQ v. LinkedIn:** 9th Cir. 938 F.3d 985 (9 Sep 2019) affirmed a preliminary injunction [excerpt]; on remand after *Van Buren*, 18 Apr 2022, affirmed again, noting *Van Buren* "did not directly address" the "without authorization" clause [read]. **The CFAA win did not save hiQ.** The district court granted LinkedIn summary judgment on breach of contract (hiQ's own scraping and fake accounts) [excerpt]. The consent judgment (stipulation filed 6–7 Dec 2022, order 8 Dec per Proskauer) [excerpt]: $500,000 against hiQ; hiQ stipulated that LinkedIn "may establish liability" under the CFAA and California law (trespass to chattels, misappropriation); permanent injunction to stop scraping LinkedIn, stop using fake accounts, and destroy source code, data and algorithms created from the scraped data; it makes no express distinction between public and non-public parts of LinkedIn; the stipulated conclusions were the parties' and are not precedential.
- **Van Buren v. United States** (3 Jun 2021) [read]: "exceeds authorized access" is a "gates-up-or-down inquiry"; footnote 8 leaves open whether limits can come from contracts or policies.
- **Meta v. Bright Data** (N.D. Cal., 23 Jan 2024) [excerpt]: summary judgment for Bright Data; its logged-off scraping of public data did not violate Facebook/Instagram terms. Meta reportedly dropped the case without appeal [search].
- **X Corp. v. Bright Data** (N.D. Cal., 9 May 2024) [excerpt]: scraping-and-selling contract claims preempted by the Copyright Act; access claims failed on public data. After amendment (late 2024) the court let a fraud-based unfair-competition claim and tortious-interference and access-related contract claims based on server impairment proceed, but denied scraping-based contract claims; Bright Data added antitrust counterclaims [search]. No appellate ruling found.
- **Others** [search]: Meta v. Voyager Labs (motion to dismiss denied; settled); X Corp. v. CCDH (dismissed under anti-SLAPP, 25 Mar 2024; appeal outcome not found); Ryanair v. Booking.com (D. Del., CFAA verdict set aside; appeal status not found); Google v. SerpApi (DMCA claim dismissed in part, 20 Jul 2026, amended Aug 2026, low confidence); Thomson Reuters v. Ross (3d Cir., Sep 2026, no fair use for non-generative AI training; context only). Status update from a third search: X v. CCDH, Ninth Cir. 24-2643, briefing concluded, no decision found; Ryanair v. Booking.com, Third Cir. 25-1374, pending as of the mid-2025 sources, no decision found.
- **DOJ charging policy** (Justice Manual 9-48.000, updated 19 May 2022) [excerpt]: prosecutors should decline cases of good-faith security research; a CFAA "exceeds authorized access" prosecution may not rest solely on violating an access restriction in a contract or terms of service with a public web service (the restriction must be built into the system's code or configuration); limits: accessing someone else's account on a multi-user service, or access with no authorisation at all, can still be charged. A charging guideline, not an immunity: it does not bind civil plaintiffs or states, and it has no journalism-specific provision.
- **Sandvig v. Barr** (D.D.C., 27 Mar 2020) [excerpt]: CFAA Access Provision does not criminalise mere ToS violations on consumer websites; not binding outside D.D.C.
- **Knight Institute 2018 safe-harbor proposal** [search]: policy advocacy, not law.
- **Archiving:** *Hachette v. Internet Archive* (2d Cir., 4 Sep 2024) [excerpt]: lending of scanned books was not fair use; final. It concerns book lending, not evidence capture. FRE 902(13)/(14) allow certification of electronic records; courts differ on Wayback affidavits [search]. No case found on a journalist archiving a third-party page, or on hash/timestamp capture.
- **Recording:** federal law is one-party consent; about 11 all-party states reported by RCFP (CA, DE, FL, IL, MD, MA, MI, MT, NH, PA, WA) [search, dated guide].

### EU and UK
- **GDPR Art. 85** requires member states to reconcile; no blanket exemption [search]. CJEU C-199/24 (*ND v Legal Newsdesk Sweden*, 9 Jul 2026) reportedly limits Art. 85 to genuinely journalistic processing [search; judgment not opened]. Germany (Medienprivileg, MStV), France (loi Informatique et Libertés art. 80), Ireland (DPA 2018 s.43) described [search]; Netherlands and Italy not verified. Netherlands: one source places the exemption in Article 41 UAVG (not 43) and Italy in Codice privacy title XII, sections 136–139 with a journalism code of conduct whose GDPR alignment was still pending in 2018 [search]; verify both against official texts.
- **Database right/TDM:** *Ryanair v PR Aviation* (CJEU C-30/14): the Directive does not stop contractual limits on unprotected databases [search]. TDM Arts. 3 and 4 of Directive 2019/790 [memory]; no journalism-specific exception found. Pending: CJEU C-250/25 (*Like Company v Google*), BGH appeal in *LAION v Kneschke* [search].
- **UK:** Data (Use and Access) Act 2025 (Royal Assent 19 Jun 2025) [search]. legislation.gov.uk shows Schedule 2 para 26(9)(d) DPA 2018 substituted from 5 Feb 2026 (DUAA s.142(1), Sch 9 para 24), para 26(9)(c)(ii) substituted from 30 Sep 2026 (S.I. 2026/386), and s.124(5) (the journalism code) amended [excerpt]; the exact new wording was not retrieved. The ICO Data Protection and Journalism Code (statutory since 22 Feb 2024; the 2023 edition seen) predates these changes and no update was found. The para 26 exemption has four conditions: journalism, with a view to publication, reasonable belief that publication is in the public interest, and reasonable belief that compliance is incompatible with journalism [search].
- **DSA Art. 40:** Delegated Regulation (EU) 2025/2050; see §5.2. No source addresses journalists.

### Practical reading
Logged-out public access has not been held a CFAA violation (*hiQ*, *Bright Data*); logged-in or account-based scraping carries contract exposure (*hiQ*, *Ryanair v. Booking.com*, *Van Buren* fn. 8 still open); copyright preemption was accepted by one district judge only; ToS and platform developer terms can conflict with evidence preservation (X: delete on request within 24 hours; YouTube: refresh or delete within 30 days; Reddit: delete within 48 hours recommended; X, Meta and YouTube ToS prohibit scraping or downloading without written permission) and need counsel's view (§5.2).

### Questions for counsel
1. Does *Meta v. Bright Data* (district level, no appeal) support a policy that separates logged-out from logged-in capture?
2. For logged-in capture, how material are ToS and contract-only theories?
3. Platform retention rules (X: delete or modify on request within 24 hours; YouTube API: refresh or delete within 30 days; Reddit: delete within 48 hours recommended) versus keeping an evidentiary capture: which prevails for a journalist, and does it matter whether the content came through an API or a capture?
3b. Do X's, Meta's and YouTube's bans on scraping, automated collection and downloading without written permission reach a reporter's manual or tool-assisted capture of a page they are reading?
4. What happened in X v. CCDH (9th Cir. 24-2643), Ryanair v. Booking.com (3d Cir.) and after the Nov 2024 order in X v. Bright Data?
5. Which member-state journalism rules apply to a tool provider that is not a media organisation, and does C-199/24 narrow Art. 85 for it? Does Art. 40(12) cover journalists?
6. Does a newsroom fit the TDM Art. 4 exception given opt-outs?
7. What capture, hash and certification protocol satisfies FRE 902(13)/(14) and UK/EU equivalents?
8. Which all-party-consent states matter for audio/video capture?
9. Do the GPL/AGPL separate-process arrangements in §3.3 hold for a proprietary product?

## 7. Source reliability signals worth building in

- **Retraction status** from Crossref (§5.3) shown on every cited paper.
- **Outlet reputation:** domain age, ownership (FtM `Ownership` via `Outlet`), byline history, content-farm lists; NewsGuard's AI Tracking Center title reads "3,749 AI Content Farm sites (and Counting)", last updated 23 Jun 2026 per a search summary (page not opened); its own 2023 report says the total is likely much larger, so the count is a floor [search].
- **Duplication and first-seen date** (syndicated copies, earliest copy) feeding the "restates, does not establish" evidence link.

## 8. Data models

### 8.1 What FtM 4.11 has [read and tested]

Checked in the 4.11.0 wheel and loaded into a real model.
- `Document` (extends `Thing`, `Analyzable`; **required `fileName`**): `contentHash`, `title`, `author`, `generator`, `crawler`, `fileSize`, `fileName`, `extension`, `encoding`, `bodyText`, `messageId`, `mimeType`, `language`, `translatedLanguage`, `translatedText`, `date`, `authoredAt`, `publishedAt`, `parent`, `ancestors`, `processingStatus/Error/Agent`, `processedAt`. From `Thing`: `sourceUrl`, `publisher`, `publisherUrl`, `createdAt`, `modifiedAt`, `retrievedAt`, `keywords`, `proof`. From `Analyzable`: `detectedLanguage`, `*Mentioned`.
- `HyperText` (+`bodyHtml`), `Article` (no extra properties), `Pages`, `Page`, `PlainText`, `Folder`, `Package`, `Table` (`columns`, `rowCount`, `csvHash`), `Workbook`, `Audio` (`duration`, `samplingRate`), `Video` (`duration`), `Image` (`pictured`, **`credit`**).
- `Message` (required `bodyText`, `sender`): `subject`, `threadTopic`, `sender`, `senderAccount`, `recipients`, `recipientAccount`, `inReplyTo`, `inReplyToMessage`, `metadata`. `UserAccount` (required `username`): `owner`, `service`, `email`, **`phone`**, `password`, `ipAddress`.
- `Documentation` **exists**: an `Interest` edge linking a `document` to an `entity` (required both; role). Useful for source → entity links. `Mention` is generated NER output (required `document`, `name`).
- **Edge syntax** (from `Ownership.yaml`): `edge: {source: owner, target: asset, label: "owns", directed: true}` with plain property names; required fields in a schema-level `required:` list.
- **`required` is not inherited** (tested): `Email.required = []`, `SocialPost.required = []`, even though `Message.required = ['bodyText','sender']`.

### 8.2 What OpenAleph does and does not do [read]

- **Versions:** OpenAleph 5.3.2 (25 Aug, latest release page), pyproject at 5.3.3-rc4; the docs versions page stops at 5.1.0 (stale). **FtM pin: `followthemoney >=4.11.0,<5.0.0` in openaleph, ingest-file and ftm-analyze.**
- **Components:** Postgres (app data, FtM fragments, task queue), Elasticsearch 9, Redis (cache), an archive keyed by sha1, workers `ingest`, `analyze`, `openaleph`. Published images (ghcr.io/openaleph): ftm-analyze, openaleph, ingest-file (AMD64 only), elasticsearch, aleph-ui, ftm-translate, ftm-lakehouse, servicelayer-api. **No ftm-transcribe image.**
- **Licences:** OpenAleph server MIT (pyproject name `aleph`); ingest-file AGPL-3 (MIT before 3.18.4); ftm-analyze, ftmq, openaleph-search, openaleph-procrastinate, ftm-lakehouse, ftm-translate, memorious4 AGPL; openaleph-servicelayer MIT; FtM MIT. PyPI `openaleph` is the *client*, not the server.
- **Ingest:** formats include html, xml, text, office, pdf, archives (zip, tar, rar, 7z), email (pst, olm, msg, eml, emlx, mbox), tabular, image, audio, video, json. libmagic overrides declared mime types.
- **HTML ingestor:** sets `HyperText`, `bodyHtml`, title, summary, author (`author`, `og:site_name`), `publishedAt` (`article:published_time`), keywords. **It sets no `sourceUrl`, `retrievedAt`, `crawler` or `publisher`.** It reads the tag `aricle:modified_time` (a typo in the code), so `modifiedAt` is probably never filled from the page.
- **Provenance comes from the uploader:** the upload API (`POST /api/2/collections/<id>/ingest`) takes a `meta` form field; the `Document` model whitelists `title, summary, author, publisher, crawler, source_url, file_name, mime_type, headers, date, authored_at, modified_at, published_at, retrieved_at, languages, countries, keywords` and maps them into FtM (`crawler`, `sourceUrl`, `retrievedAt`, `publisher`, packed `headers`). `foreign_id` is not unique and **re-saving the same foreign_id overwrites the meta**: re-capturing a URL mutates the record instead of adding a versioned capture.
- **No URL fetch, no WARC** in OpenAleph or ingest-file (searches for `warc` across the org returned 0 hits). `memorious4` (AGPL, "part of the OpenAleph suite") is a YAML staged crawler that emits uploads with `crawler`, `source_url`, `retrieved_at`, `headers`, but stores only the raw HTTP body (no headless browser, no WARC).
- **Hash:** sha1 by default; sha256 only behind the experimental `OPENALEPH_LAKEHOUSE` flag. FtM's `contentHash` describes SHA1 while ftm-lakehouse validates sha256: the two disagree.
- **Timestamp:** `retrievedAt` is a plain self-asserted date. No signed timestamp, no RFC 3161/OpenTimestamps, no custody log.
- **ftm-transcribe:** version 0.0.1, not on PyPI, no Dockerfile at the root, repo last updated 2026-02-27, AGPL-3. It runs whisper.cpp (default model `ggml-medium-q8_0`), writes the full transcript into `bodyText` of the same Audio/Video entity with timecodes **inline as `[00:00:00.000 -> 00:00:05.000] text`**, and is only deferred if `OPENALEPH_TRANSCRIBE_DEFER=1` (default off). No structured segment storage.
- **Custom schemata:** `FTM_MODEL_PATH` is read once at import and replaces the model, so use a full copy of the stock YAML plus your files, in every process that reads the model. Official guidance: add, never remove or rename; keep additions small ("10 or 20 schemata, not 200"); resync on upgrades. The old Aleph how-to is the only OpenAleph-lineage page found; the current OpenAleph docs navigation has none. Elasticsearch uses 5 bucket indexes (page, pages, documents, intervals, things), generated from `model.schemata`; new properties can be added by put_mapping without a reindex, changing an existing field's type or analyzer needs one; already-indexed entities lack new fields until re-indexed (inference). Not verified in a running stack.

### 8.3 Datashare (ICIJ) as a design reference [read]

AGPL-3, Java backend, Vue client. A flat `Document` per file (content, path, language, tags, `metadata`, `parentDocument`, `rootDocument`…) with `NamedEntity` child documents; extraction by Extract on Tika with Tesseract. **No URL ingest found**; ingestion scans a local directory. Transcription lives outside the core: a Temporal worker (`datashare-python` `asr-worker`, `caul` with NVIDIA Parakeet and a whisper.cpp fallback) writes JSON artifacts with timed segments (start_s, end_s, text, optional speaker, confidence) and a manifest, then writes the plain transcript into the document's `content`. Lessons: keep structured timed segments as a separate artifact beside the searchable text; idempotent stages behind a queue; treat the index as rebuildable. Licence of datashare-python and caul: none found.

### 8.4 Gap table (FtM 4.11)

| Concept | FtM | Plan |
|---|---|---|
| Fetched article, body, dates, language | Covered (`Article`/`HyperText`) | Use as is; our fetcher must set `sourceUrl`, `retrievedAt`, `crawler`, `publisher` because ingest-file does not |
| Outlet | Partial (`publisher` is a string) | New `Outlet` extends `Organization` |
| Byline / journalist | Partial (`author` is a string) | New `Byline` interval |
| Ownership of outlets | Covered (`Ownership`) | Inherited via `Outlet` |
| Social account | Partial (`UserAccount`) | New `SocialAccount` |
| Post / comment / thread / repost | Partial (`Message` fits) | New `SocialPost` |
| Likes per user, followers graph | None | Side tables (high volume) |
| Engagement counts over time | None | Side table |
| Hashtags, @mentions | Partial (`Mention` is NER-only) | Property + search |
| Channel / group | None | `SocialAccount` with kind = channel |
| Feed / monitor | None | App table |
| Capture | Partial (`contentHash`, `crawler`, `retrievedAt`) | New `Capture` aligned to the suite's GCAP fields |
| Transcript with timecodes | None | Side table of segments + a pointer entity (matches Datashare's lesson); `bodyText` holds the flat transcript |
| Derivatives | Partial (`parent`) | New `MediaDerivative` |
| Deleted / removed | None | `liveStatus` + `lastCheckedAt` |
| Annotation with selector | Partial (`Note`, `Mention`) | Side table (W3C Web Annotation) |
| Authenticity / AI-generation | None | New `AuthenticityAssessment` (§9) |
| Claim review | None | Export vocabulary only (schema.org `ClaimReview`, `MediaReview`) |

### 8.5 The schemata as tested

All 8 drafted schemata (Appendix A) were added to a copy of the 71 stock schemata and loaded with `FTM_MODEL_PATH` on FtM 4.11.0: 79 schemata. Entities built through the model behaved as intended; `Byline` resolves `journalist → article` as an edge; `SocialPost` caption comes from `permalink`. **Caveats of the test:** the ICU library was stubbed (it matters for name transliteration, not for loading schemata); nothing was run inside a real OpenAleph stack; no data was indexed. The first draft failed two ways in testing and one in review (property-level `required`, mapping-style edge endpoints, no labels/captions/`matchable: false`); all are fixed in the Appendix.

### 8.6 The app's own tables

- `Source`: has `url`, `source_type`, `metadata_json`, `source_tier` (A–F), `issuer_or_author`. Needs: platform, account link, outlet link, first/last captured, live status.
- `Evidence`: has `authenticity_status`, `restates_evidence_id`, created/event/published/retrieved dates. Needs: link to the capture; media time range (`t=12.0-19.5`); `role` (evidence of events vs the subject of the story); selector fields (prefix/suffix) already planned in Ony's design.
- `Document`: no kind or language field (in the backlog). Needs: capture link, derivative-of link.
- New tables: `monitor`, `capture`, `engagement_snapshot`, `authenticity_check` (append-only), `transcript_segment`.
- **Where to start:** the app's tables first, mirrored into FtM later (lowest risk, since schema changes touch every OpenAleph process and an upgrade).

## 9. Keeping AI-generated material from being used as a source

### 9.1 What the primary sources show

- **Detectors in the wild.** Deepfake-Eval-2024 (arXiv 2503.02857, v5 27 May 2026) [read: abstract and tables]: AUC fell by 50% (video), 48% (audio) and 45% (image) against earlier benchmarks. **In absolute terms, off-the-shelf detectors score about chance:** video GenConViT 0.63, FTCN 0.50, StyleFlow 0.51; audio AASIST 0.43, RawNet2 0.53, P3 0.58; image UFD 0.56, DistilDIRE 0.52, NPR 0.53. Fine-tuning helped audio and video (GenConViT 0.82, AASIST 0.91, P3 0.92) but barely images (+4.5%). 22 commercial detectors (anonymised): best video 0.79, audio 0.93, image 0.88–0.90; none reached 90% accuracy; human analysts disagreed under 10% of the time. Dataset access is gated until May 2027.
- **Recompression kills image detectors.** AIGIBench (arXiv 2505.12335) [read]: under JPEG quality 50 or Gaussian noise, fake-image accuracy often approaches 0% while real-image accuracy stays near 100%. TrueFake (2504.20658) [read]: Facebook was the most disruptive platform, with 10–100% losses. Treat image scores on platform-downloaded files as uninformative.
- **Audio** (Müller et al., 2203.16263; ASVspoof 5) [abstract only]: lab performance does not carry to found audio; codec compression and adversarial attacks degrade it.
- **Text detectors.** Liang et al. (2304.02819) [read]: seven 2023 detectors, 91 TOEFL essays, average false-positive rate 61.22% (the 61.3% in the published version unchecked); 18 of 91 essays flagged by all seven. Pangram's technical report claims 0% on TOEFL (vendor self-evaluation; no independent audit found). RAID (2405.07940) [read]: closed detectors have low false positives at default thresholds; attacks like homoglyphs cut Originality's detection from 85.0% to 9.3%. Sadasivan et al. [read]: recursive paraphrasing evades watermark, neural, zero-shot and retrieval detectors, and watermarks can be spoofed. A 2026 preprint (abstract only) says formal native writing gets flagged structurally.
- **Watermarks.** SynthID-Text (Nature 2024) is Apache-2.0 on GitHub but "not intended for production use" per its README [read]; independent preprints report heavy loss after paraphrase or back-translation (abstracts only). "Watermarks in the Sand" proves strong watermarking impossible under stated assumptions (abstract). SynthID Detector: Google's blog (excerpt) says "we're expanding access to everyone – with the tool available globally in English starting today" (about 12 days before this research); it checks output from Google and partners (OpenAI, NVIDIA, Kakao, and "soon" Apple); synthid.com lists images, video and audio (the 2025 announcement also listed text; whether text was dropped is unconfirmed); it is "not a general AI detector", so a negative result tells you nothing about content from other generators.
- **Content farms.** In one preprint (2605.23684, abstract), Pangram labelled 55.2% of 105 articles from 7 documented AI-slop domains as highly likely AI: detectors miss many even on known farms. NewsGuard started its tracker in 2023 (150 sites in June 2023, 614 by December 2023, defined by four criteria including that the site looks human-run and does not clearly disclose AI use) and later launched a real-time "AI Content Farm" datastream built with Pangram Labs' software, with analysts reviewing results to remove false positives; it reported 3,006 sites growing by 300–500 a month, and says the true number is likely higher [excerpt, newsguardtech.com]. That pairing, a detector as a hint with a person removing false positives, is the pattern §9.3 recommends.
- **Provenance (C2PA).** The spec's own history lists 2.5 (Oct 2026), 2.4 (Apr 2026), 2.3 (Dec 2025) [read, from the generated site in `c2pa-org/specifications`; not compared to the live site]. Validation states: Well-Formed, Valid, Trusted (every Trusted is Valid, every Valid is Well-Formed); Valid needs an unmodified manifest, a validated signature and no revoked credential; Trusted also needs the signer on a trust list. Signer trust: the validator maintains EKU lists and trust anchors; the C2PA Trust List (32 certificates counted in `conformance-public/trust-list/C2PA-TRUST-LIST.pem`) and a separate TSA list (23) are required; users can add anchors. `c2pa.actions.v2` must open with `c2pa.created` or `c2pa.opened`; `c2pa.created` shall carry a `digitalSourceType`; `allActionsIncluded` is mandatory. AI declaration: `digitalSourceType` (IPTC term, e.g. `trainedAlgorithmicMedia`) is the core signal; 2.4 added `c2pa.ai-disclosure` (modelType required, humanOversightLevel optional), partly "pending further specification". **A valid signature can accompany AI-generated content, so validity and origin are separate facts.**
- **IPTC DigitalSourceType** terms in current use (read via c2pa-rs and the schema.org enumeration; definitions are c2pa-rs's wording of IPTC's text): `digitalCapture`, `computationalCapture`, `humanEdits`, `compositeWithTrainedAlgorithmicMedia` (IPTC label "Edited with Generative AI", added July 2023), `algorithmicallyEnhanced`, `digitalCreation`, `dataDrivenMedia`, `trainedAlgorithmicMedia` (IPTC label "Created using Generative AI"), `algorithmicMedia`, `screenCapture`, `virtualRecording`, `composite`, `compositeCapture`, `compositeSynthetic`, and film/print digitisation terms. `minorHumanEdits`, `softwareImage` and `digitalArt` are flagged deprecated in c2pa-rs.
- **Libraries.** c2pa-rs: 0.91.3 on its stable branch (main is 0.92.0-dev, never published); works offline once configured (`verify.remote_manifest_fetch=false`; TSA trust list loaded locally); **in non-test builds the default `trust_anchors` is empty, so a production verifier must supply the C2PA list itself** (read from code, not run; the Python docs describe `user_anchors` as "additional" to built-in anchors; the two disagree and must be tested). c2pa-python 0.38.0 (2026-09-29), MIT OR Apache-2.0. c2patool: `init trust` downloads the official list (needs network once). Beta: breaking changes roughly every two months.
- **What platforms do with it.** Washington Post, 22 Oct 2025 [search]: of eight platforms, only YouTube disclosed the AI video, hidden in the expanded description; "no platform… kept the Content Credentials data… or let users access it." YouTube ("Captured with a camera" needs C2PA 2.1+ capture and no edits), Meta ("AI info" from C2PA/IPTC indicators or disclosure), TikTok (auto-labels uploads with Content Credentials) and LinkedIn ("CR" icon) say they read it [search; help pages not opened]. X: no policy found. Net: a file downloaded from a platform rarely carries its manifest; absence says nothing. Read manifests on originals or direct-from-source files, and record the platform's own label as separate evidence.
- **Local open-source detectors (read from LICENSE files).** Usable commercially: UFD (MIT, AUC 0.56 in Deepfake-Eval), AIDE (MIT, among the more JPEG-robust in AIGIBench), DMimageDetection (Apache-2.0), AASIST (MIT-style, AUC 0.43), Binoculars (BSD-3, text), Fast-DetectGPT (MIT, text). Non-commercial: CNNDetection (CC BY-NC-SA), DeepfakeBench (CC BY-NC). No licence file (default copyright): DIRE, NPR, TruFor. TrueMedia.org code is MIT but **model weights are request-only** (README, Feb 2025); whether the service is live under Georgetown is unconfirmed. The InVID-WeVerify/vera.ai plugin is MIT, but its detectors are server-side (endpoint variables in its README), so they are not local. Hugging Face model licences not checked. Hugging Face image detectors vary: Organika/sdxl-detector is CC BY-NC 3.0 (its card says it may be less accurate on generators other than SDXL) and Smogy/SMOGY-Ai-images-detector CC BY-NC 4.0 (both non-commercial); ash12321/sdxl-detector-vit, Reju983/ai-generated-image-detector, arnolfokam/ai-generated-image-detector and capcheck/ai-image-detection list Apache-2.0; ninini1/AI-image-detector is CC BY-ND 4.0 [excerpt, model cards]. Their accuracy was not checked, and ones trained on one generator should not be assumed to work on others.
- **Newsroom practice** [excerpt/search; the AP, Reuters and BBC domains are blocked for the search tool, so their own standards pages were not reached]: WITNESS tipsheet "Things to know before using AI detection tools" (false positives, language challenges, variable accuracy; use other verification techniques first; say how much confidence the tool gives and fill the rest with reporting), and a WITNESS piece putting detectors at about 85–90% accuracy even in the best circumstances, with a case where Mexican journalists got conflicting results and one false "AI" verdict on an authentic image [excerpt]; WITNESS's TRIED benchmark for evaluating tools. Reuters's digital verification editor (JournalismAI Festival, Nieman Lab, Dec 2025): inboxes full of "magic" detector pitches, auditing them is now part of the job, and teams are told never to rely on a single tool. CJR/Tow Center: deepfake detection tools cannot be trusted to reliably catch AI-generated or manipulated content and generalise poorly to new techniques; a detector is one "layer of confirmation". A Nieman Lab report (Jul 2026) says authentication tools are built without adequate journalist input and most CMS vendors do not support C2PA. InVID is praised for centralising tools. Bellingcat's 2023 test of AI or Not: strong on uncompressed AI images, weak on compressed ones. AP 2023 standards ("if journalists have any doubt at all about the authenticity of the material, they should not use it") and Reuters's 2023 framework are from memory/secondary summaries only.
- **Law on marking** [excerpt of EUR-Lex consolidated text, artificialintelligenceact.eu and Commission pages; not opened in full]: EU AI Act Art. 50 applies from **2 Aug 2026**. Providers of generative systems must make outputs detectable as AI-generated (marking is the provider's duty); deployers of deepfakes must disclose them visibly and cannot rely on the embedded marking alone; for AI-generated text published to inform the public, the disclosure duty falls away where the content went through human review or editorial control and a person holds editorial responsibility (a practitioner guide says the review must be substantive). The Code of Practice on transparency of AI-generated content was published in June 2026. **The Digital Omnibus on AI is Regulation (EU) 2026/1744, signed 8 Jul 2026, published in the Official Journal 24 Jul 2026, in force 27 Jul 2026** (Parliament's procedure file, EUR-Lex excerpt): generative systems already on the market before 2 Aug 2026 have until **2 Dec 2026** to meet the Art. 50(2) marking duty. Content made before 2 Aug 2026 needs no retroactive marking. Commission pages disagree on sub-paragraph numbering, so verify before citing paragraph numbers. **California AB 853** (Ch. 674, signed 13 Oct 2025) moved the AI Transparency Act's operative date to **2 Aug 2026** (statute text); from **1 Jan 2027** large online platforms may not knowingly remove provenance data and must detect and show compliant provenance data (§22757.3.1), and GenAI hosting platforms may not offer systems lacking required disclosures (§22757.3.2); capture-device makers from **1 Jan 2028** (§22757.3.3). SB 1000 and AB 2713 would amend it and their status is unknown. Marking rules raise how often a *positive* signal appears; they do not make absence meaningful.

### 9.2 Design: four layers, then a person

1. **Provenance:** validate any C2PA manifest locally, record the validation state (invalid / valid / trusted / absent / untrusted signer), the signer, the `digitalSourceType` and AI-disclosure assertions, the platform's own label, and, where the reporter chooses, a manual SynthID lookup. These are **findings**, not statuses.
2. **Source and outlet reputation:** content-farm lists, domain age, ownership, byline history, first-seen date, earliest copy.
3. **Detectors, as hints only:** off by default for images, because of the recompression result; shown with the calibrated false-positive rate and suppressed on short or possibly second-language text.
4. **A person decides, with reasons recorded:** what was checked and what was not.

### 9.3 Hard rules

- A detector score never auto-rejects or auto-approves. It raises a separate, non-blocking review flag; nothing blocks claim support until a person records a decision. A detector result can never raise a grade.
- Every check stores method, tool, model and version, score and scale, threshold, date and time, input hash, and whether it ran locally or in the cloud. History is append-only; any status can be disputed.
- **Local by default.** Cloud detectors and **external reverse searches** (TinEye, Google Lens, Yandex) are third-party sends: opening a link in a browser means nothing is *automatically submitted*, but a URL or query in the link still goes to the provider and an upload discloses the image. Explicit per-item consent, blocked by default on source-protected material, logged. Prefer a public URL of the item over uploading the original; for sensitive items use only local similarity checks against the case's own files.
- **Propagation.** A claim citing an item marked synthetic cannot be marked supported through it. It needs other support, or shows "supported only by a synthetic source". Derivatives (crops, transcripts, quotes, summaries) inherit the flag from their parent; clearing one needs a human reason.
- **AI material as the subject of the story.** A real deepfake is valid evidence *of the deepfake* ("this fake circulated, posted by X on date Y"), not of what it depicts. Add a `role` on the evidence (as-evidence-of-events vs as-subject); propagation blocks only the first.

### 9.4 Proposed status values (for Ony to rename or accept)

Signature validation and origin are two separate facts. The system records validation results and assertions as findings. Only a person's recorded decision sets a status.

| Status | Meaning | Set by |
|---|---|---|
| verified-origin | A person reviewed the provenance assertions and the signer's trust (or independently verified capture/author) and recorded reasons | A person only |
| unverified | Default; nothing either way | System |
| likely-synthetic | A person judged the indicators weighty but not conclusive and recorded why | A person only; the system may raise a separate non-blocking review flag |
| confirmed-synthetic | Signed AI-source manifest, generator admission or forensic finding, reviewed by a person | A person with reasons |
| disputed | Evidence conflicts | A person |

### 9.5 How this meets the suite (for Ony to decide in the suite)

- The suite's EGS says it does not verify content, and its RAS tiers a flagged source at no higher than 8 and never counts it as corroboration. `Evidence.authenticity_status` has no value for "synthetic". Options for Ony: reuse `DISPUTED` plus the new app flag; add a suite value; or leave the suite alone and keep the app's check as a separate record that the suite sees only through `DISPUTED`/`UNKNOWN`. The research here (four layers; findings versus statuses; propagation; subject-of-story role) can be offered to the suite as input for its open item, "a named framework for detecting AI-generated or synthetic-text sources". **Which tier each status lands in is the suite's call.**
- Social posts are tier F already; AI-flagged sources would sit at or below that.

### 9.6 Honest limits

No detector is decisive. Off-the-shelf detectors are at chance on real social-media content, commercial ones stay under 90% accuracy, image detectors collapse on recompressed files, text detectors misfire on non-native and formal writing, watermarks fall to paraphrase, and a "fake" verdict can itself be abused (the liar's dividend). Provenance can confirm authenticity or AI origin when present, and its absence proves nothing. The layer reduces risk and forces a recorded human judgment; it does not guarantee that no synthetic material gets in.

## 10. Plan

Follows the repo's rule: mockups first, Ony approves, then build.

**Phase 0: Decisions (no code).** Answer §12. ADRs: capture architecture (tools, local-only default, licence handling); FtM extension vs app tables; authenticity statuses and propagation rule. Counsel review of §6 before Phase 3.

**Phase 1: Links that work** (Ony's design §13 and INTAKE_1). A pasted link is fetched locally (Playwright), saved as HTML/MHTML + screenshot + WARC/WACZ with SHA-256, time, tool and version, headers; text extracted (trafilatura); the page's text read through the existing Drop lanes and the CAPT record fills itself (no hand entry). States "link only" (dead link) and "not seen" (login/paywall); "changed since capture" re-check; failed captures logged as outcomes. Capture precedes quoting. Fixes the backlog item "a web link isn't fetched or archived".

**Phase 2: Media and social posts by link.** Auto Archiver / yt-dlp for single posts and videos; originals + `info.json` kept; platform, post id, account and live status recorded; transcripts through faster-whisper with a segment side table and the flat text for search; a per-platform "works today" health check because extractors break. Unlock the 415 for audio/video.

**Phase 3: Following.** Monitors (feeds, sitemaps, YouTube feeds, Bluesky, Mastodon, Telegram public, podcasts) with schedule, conditional GET, change detection and version history, duplicate clustering; items surface in an "at-risk, capture first" queue (EGS rule 8); closed platforms by on-demand capture or Zeeschuimer import, no bulk crawling; per-monitor egress policy; encrypted monitor list. Newsletters via a dedicated mailbox into the `.eml` path. Messaging via exports only.

**Phase 4: Authenticity layer.** `authenticity_check` log; local C2PA validation with a supplied trust list; outlet reputation; consented external helpers; optional detectors (text and audio before image); propagation on claims; `role` field; review UI that demands reasons. Needs the suite decision (§9.5).

**Phase 5: Papers and records.** Crossref/OpenAlex lookups by DOI with retraction flags; court and government sources.

**Phase 6: FtM mirror.** Load the schemata into OpenAleph after testing in a real stack (custom model in every process, reindex), mirror outlets, bylines, accounts, posts, captures and assessments.

## 11. What could not be verified

**Not opened; only official-site search excerpts or nothing (WebFetch could not resolve hosts and Firecrawl credits were out):**
1. X: free-tier status; the live Developer Agreement text (the Policy snapshot was flagged 151–175 days old); which monthly cap is right (3 million or 2 million Post reads).
2. Meta: Graph API rate limits; the current Meta Platform Terms text; Content Library eligibility page itself.
3. TikTok: Display API, Commercial Content API, ToS scraping clause; current research eligibility (pages 700–1,400 days old and conflicting).
4. YouTube: `captions.download` quota cost; current ToS text (copy seen may be ~1,000 days old).
5. Reddit: whether journalists have any path; pricing (none found).
6. Bluesky ToS scraping clause; Mastodon and Threads terms; Telegram's position on scraping public channels.
7. EU and US statutes: EUR-Lex text of DSA Art. 40 and AI Act Art. 50 opened in full; California SB 1000 and AB 2713 status.
8. Case outcomes and texts: any appeal in X v. Bright Data, the Ninth Circuit decision in X v. CCDH (24-2643), the Third Circuit decision in Ryanair v. Booking.com (25-1374); the hiQ consent judgment itself; Justice Manual 9-48.000 opened in full; the NL (UAVG Art. 41?) and IT (Codice privacy §136) official texts; the exact wording of Sch 2 para 26 DPA 2018 as amended.
9. Newsroom standards pages: AP, Reuters, BBC Verify (their domains are blocked for the search tool), AFP, NYT, Poynter/IFCN, First Draft; NewsGuard's live tracker page.
10. Primary text of the Berkeley Protocol; IPTC's own controlled-vocabulary page; Media Fragments, PROV-O and RFC 3161 primary text; opentimestamps.org docs; the live spec.c2pa.org site against the repo build; C2PA Conformance Program documents.

**Needs a running test, not reading:**
11. FtM custom schemata inside a running OpenAleph stack (do ingest-file and ftm-analyze accept a changed model; reindex behaviour); the ICU stub I used affects only transliteration.
12. Whether c2pa-rs / c2pa-python ship a default trust list (source and docs disagree).
13. Whether Auto Archiver's dependencies are all permissively licensed and whether its extractors work today per platform; whether `OPENALEPH_LAKEHOUSE` and ftm-transcribe are production-ready.

**Not researched or only partly:** Naver/Kakao, Rumble, Gab, CORE, Factiva (its domain is blocked for the search tool), WhatsApp Channels-specific terms, Signal public groups; Podcast Index rate limits (unpublished); imapclient, caul, substack-api and crossrefapi licences (blank on PyPI); datashare-python licence (no LICENSE file at main); accuracy of the Hugging Face detectors.

## 12. Questions for Ony

1. **Scope of "follow".** Monitor only open sources and capture closed platforms on demand, or also try bulk collection from X/Instagram/TikTok/Facebook (terms and ban risk, and the suite prefers item-by-item capture)?
2. **Third-party archives** (Wayback, Perma.cc) as an optional second witness (leaks the URL), or never?
3. **Egress:** a neutral/Tor/VPN route per monitor for sensitive targets?
4. **robots.txt:** honour it for continuous monitoring, but not for one-off evidentiary captures?
5. **Media suite question 8** (collect media from links, wrapping Auto Archiver or yt-dlp): yes or out of scope? Phases 1–2 assume yes.
6. **Detectors:** optional cloud detectors behind per-item opt-in, or local-only? Images off by default?
7. **The suite:** does it need a "synthetic" authenticity value, and should this research go to the suite as input to its open item?
8. **Subject-of-story rule:** agree that a confirmed deepfake can support claims about the deepfake itself, never about what it shows?
9. **Where new records live first:** app tables then mirrored to OpenAleph (my suggestion), or OpenAleph first?
10. **Licence handling:** are separate-process AGPL/GPL tools acceptable for a proprietary product, pending counsel?
11. **Legal review** before Phase 3?

## Appendix A: Draft FtM schemata (tested on FtM 4.11.0)

Each block is one file under `FTM_MODEL_PATH`, alongside a full copy of the stock YAML. Loaded together with the 71 stock schemata (79 total). Not tested inside a running OpenAleph stack.

```yaml
SocialAccount:
  extends:
  - UserAccount
  label: Social account
  plural: Social accounts
  matchable: true
  featured:
  - username
  - service
  - displayName
  - owner
  caption:
  - displayName
  - username
  properties:
    platform:
      type: string
    platformId:
      type: identifier
    displayName:
      type: name
    profileUrl:
      type: url
    accountKind:
      type: string
    verified:
      type: string
    accountCreatedAt:
      type: date
    followersCount:
      type: number
    liveStatus:
      type: string
    lastCheckedAt:
      type: date
    operatedBy:
      type: entity
      range: LegalEntity
      reverse:
        name: socialAccounts
SocialPost:
  extends:
  - Message
  label: Social post
  plural: Social posts
  matchable: false
  featured:
  - permalink
  - senderAccount
  - date
  - postKind
  caption:
  - permalink
  - title
  - subject
  properties:
    platform:
      type: string
    platformPostId:
      type: identifier
    permalink:
      type: url
    conversationId:
      type: identifier
    rootPost:
      type: entity
      range: SocialPost
      reverse:
        name: thread
    sharedPost:
      type: entity
      range: SocialPost
      reverse:
        name: shares
    postKind:
      type: string
    hashtags:
      type: string
      maxLength: 200
    liveStatus:
      type: string
    metrics:
      type: json
    attachments:
      type: entity
      range: Document
      reverse:
        name: attachedTo
Outlet:
  extends:
  - Organization
  label: Outlet
  plural: Outlets
  matchable: true
  featured:
  - name
  - homepageUrl
  - outletKind
  - country
  properties:
    outletKind:
      type: string
    homepageUrl:
      type: url
    domains:
      type: string
    editorialCountry:
      type: country
    ownershipNote:
      type: string
  caption:
  - name
  - alias
Byline:
  extends:
  - Interval
  label: Byline
  plural: Bylines
  matchable: false
  featured:
  - journalist
  - article
  - role
  edge:
    source: journalist
    target: article
  required:
  - journalist
  - article
  properties:
    journalist:
      type: entity
      range: Person
    article:
      type: entity
      range: Article
    role:
      type: string
    position:
      type: number
Capture:
  extends:
  - Thing
  label: Capture
  plural: Captures
  matchable: false
  featured:
  - requestUrl
  - capturedAt
  - sha256
  - toolName
  caption:
  - requestUrl
  - finalUrl
  properties:
    capturedDocument:
      type: entity
      range: Document
    archiveFile:
      type: entity
      range: Document
    warcRecordId:
      type: string
    sha256:
      type: checksum
    capturedAt:
      type: date
    toolName:
      type: string
    toolVersion:
      type: string
    capturedBy:
      type: entity
      range: Person
    requestUrl:
      type: url
    finalUrl:
      type: url
    timestampProof:
      type: entity
      range: Document
    collectionForm:
      type: entity
      range: Document
TranscriptSegment:
  extends:
  - Thing
  label: Transcript segment
  plural: Transcript segments
  matchable: false
  featured:
  - media
  - startMs
  - endMs
  - speaker
  caption:
  - text
  required:
  - media
  properties:
    media:
      type: entity
      range: Document
      reverse:
        name: segments
    startMs:
      type: number
    endMs:
      type: number
    speaker:
      type: string
    text:
      type: text
    language:
      type: language
    confidence:
      type: number
    model:
      type: string
MediaDerivative:
  extends:
  - Interval
  label: Media derivative
  plural: Media derivatives
  matchable: false
  featured:
  - source
  - derivative
  - kind
  required:
  - source
  - derivative
  properties:
    source:
      type: entity
      range: Document
    derivative:
      type: entity
      range: Document
    kind:
      type: string
    tool:
      type: string
    toolVersion:
      type: string
    fragment:
      type: string
AuthenticityAssessment:
  extends:
  - Thing
  label: Authenticity assessment
  plural: Authenticity assessments
  matchable: false
  featured:
  - subject
  - method
  - reviewStatus
  caption:
  - method
  - rationale
  required:
  - subject
  properties:
    subject:
      type: entity
      range: Document
    method:
      type: string
    model:
      type: string
    modelVersion:
      type: string
    digitalSourceType:
      type: string
    aiLikelihood:
      type: number
    confidence:
      type: number
    c2paResult:
      type: string
    c2paManifestHash:
      type: checksum
    reviewStatus:
      type: string
    reviewedBy:
      type: entity
      range: Person
    reviewedAt:
      type: date
    rationale:
      type: text
```

**Side tables (outside FtM):** `monitor(id, platform, query_or_handle, schedule, egress, last_run, status)`; `engagement_snapshot(post_id, captured_at, likes, reposts, replies, views)`; `follow_edge(src_account, dst_account, first_seen, last_seen)`; `reaction(post_id, account_id, kind, seen_at)`; `annotation(id, target, selector_json, body, author, created)`; `transcript_segment(id, media_id, start_ms, end_ms, speaker, text, confidence, model, run_id)`; `authenticity_check(id, subject_id, method, tool, model_version, score, threshold, input_hash, ran_locally, result, reviewer, reviewed_at, reasons)`.

## Appendix B: Licence and release evidence

Read from LICENSE files on `raw.githubusercontent.com` (main/master) or PyPI JSON on 2026-10-19:

MIT: auto-archiver, ArchiveBox, instaloader, TikTok-Api, newspaper4k, Telethon, faster-whisper, whisper.cpp, c2pa-node-v2, OpenAleph server, memorious (original), FtM, Mastodon.py, atproto, python-muckrock. · Apache-2.0: trafilatura, readability, miniflux, Playwright (Python), crawl4ai, changedetection.io, synthid-text, warcio, wacz, htmldate, news-please. · BSD: feedparser, Scrapy, WhisperX, hypothesis, imagehash. · Unlicense: yt-dlp. · MIT OR Apache-2.0: c2pa-rs, c2pa-python, c2patool. · LGPL: OpenTimestamps client. · GPL-2.0-only: gallery-dl. · GPL-3: pywb, whatstk, pyexiv2. · AGPL-3: browsertrix-crawler, Browsertrix, ReplayWeb.page, SingleFile, RSSHub, FreshRSS, Firecrawl, Zeeschuimer, 4CAT, searxng, Datashare, Zotero, ingest-file, ftm-analyze, ftm-transcribe, openaleph-procrastinate, ftmq, openaleph-search, ftm-lakehouse, ftm-translate, memorious4, internetarchive.
No LICENSE file found at main/master: zotero/translators, bluesky-social/jetstream (not confirmed elsewhere).

## Appendix C: Sources

Read (primary): C2PA 2.5 spec site build and conformance-public trust lists (GitHub); c2pa-rs, c2pa-python, c2patool and c2pa-node repos; schemaorg `schema.ttl`; Web Annotation Recommendation copy (w3c repo); iipc/warc-specifications; FtM 4.11.0 wheel and docs; OpenAleph, ingest-file, ftm-analyze, ftm-transcribe, openaleph-procrastinate, memorious and datashare sources; YouTube quota page (updated 2026-10-15); Reddit developer support article; arXiv papers 2503.02857, 2304.02819, 2405.07940, 2303.11156, 2505.12335, 2504.20658; *Van Buren* (supremecourt.gov) and the 9th Cir. 2022 *hiQ* opinion; Podcast namespace transcript spec; Podcast Index OpenAPI; Crossref REST README.
Excerpts (primary, via search): CourtListener/govinfo for *hiQ* (N.D. Cal.), *Meta v. Bright Data*, *X v. Bright Data*, *Sandvig*, *Hachette*; Justice Manual 9-48.000.
Search summaries only (pages not opened): everything tagged [search], including the X developer terms, Meta and TikTok research-program pages, EU DSA/AI Act pages, California bills, platform labelling help pages, newsroom guidance, NewsGuard, SynthID, GDPR journalism pages, PACER/EDGAR/OpenAlex/Crossref rate limits.
Suite and repo: `backend/app/ai/authority_suite` (EGS Module 04, EGS SOURCE_INDEX GS-10/GS-11, TAS and RAS source policies); `docs/design/REDESIGN_RESEARCH.md` §13; `case_records.py`; `requirements.txt`.
