# Source intake: news, social media, following sources, and keeping AI-made material out

Research date: 19 Oct 2026. Branch `claude/private-ai-content-ingestion-nq2dnd`. Nothing in the app has changed; this is research and a plan, for mockups and Ony's approval before any build.

## 0. The short version

1. **What the app does today.** Files only (The Drop), plus Firecrawl *search* and a hand-filled "online capture" record. A pasted link is accepted and ignored. Video and audio are refused. Nothing follows an outlet, a journalist or an account. (Checked in the code at `d43fab7`; see §1.)
2. **Capture should be built on existing open tools, not new extractors.** The one tool that covers capture, hashing, timestamping and deletion-checks together is Bellingcat's Auto Archiver (v1.2.x seen). yt-dlp does the media. WARC/WACZ is the master copy. All fetching stays local. See §3 and §4.
3. **Social platforms split into three groups.** Open (Bluesky, Mastodon, Telegram public channels, YouTube channel feeds): build monitors. Closed with a paid or gated API (X, Meta, TikTok, Reddit): capture what the reporter is looking at, rather than bulk crawling. Rights and terms vary and are partly unverified (§5).
4. **FollowTheMoney (FtM) covers articles well and social media badly.** It has `Article`, `Message` and `UserAccount`, but no outlet-to-journalist link, no capture record, no transcript timecodes, no engagement history, no deleted status and no authenticity record. §6 lists each gap and a plan: six new FtM schemata, five side tables.
5. **Keeping AI-made material out cannot be done by a detector.** Detectors lose roughly half their accuracy on real-world content, and text detectors flag non-native writers. What works is layers: provenance first (C2PA), then source reputation, then detectors as *hints only*, then a person who records reasons. A "synthetic" flag must stop a claim being marked supported by that item. See §7.
6. **Nothing here is final.** Licences and many 2026 platform facts could not be checked (§9). Each needs checking before it goes into an ADR.

## 1. What the app has today (checked in this repo)

| Need | State | Where |
|---|---|---|
| Upload articles/clippings as files | Works: `.txt .md .csv .html .htm .pdf .docx`, images `.png .jpg .jpeg`, containers `.eml .mbox .zip .xlsx` | `services/documents.py:24`, `html_reader.py`, `image_reader.py`, `container_readers.py` |
| OCR of screenshots and scans | Works | `image_reader.py`, `pdf_ocr.py` |
| Wider formats (audio, video, many office files) | Only with OpenAleph running | `openaleph_formats.py` |
| Audio/video | MP3/WAV/MP4 give 415; demo `.mp3/.mov` show "failed · 0 chunks" | `BACKLOG.md:91` |
| Paste a link | Field exists; not fetched or archived; "not a url" accepted | `BACKLOG.md:92`, `MOCKUP_BUILD_LIST.md:97,103` |
| Web search | Firecrawl `/v2/search` only returns title, URL, description; saves no page | `connectors/firecrawl.py` |
| Online capture record | Form for URL, date, SHA-256, custody log; filled by hand | `services/case_records.py` (CAPT) |
| Follow names | Watchlist searches the case's own documents when one arrives; "Check now" needs OpenAleph | `services/watchlists.py` |
| Follow outlets/accounts/feeds | None | n/a |
| AI-made material | `Evidence.authenticity_status` (VERIFIED / PROVISIONAL / DISPUTED / UNKNOWN, kept apart from truth), `Source.source_tier` A–F, `restates_evidence_id`, four separate dates. No AI-origin field, no check history | `models/sources.py`, `ai/suite_vocab.py:16` |

The media-suite research already lists "URL capture" as open question 8 (`docs/research/media-suite/MEDIA_SUITE_RESEARCH.md:605`). This document is its fuller answer.

## 2. Method and limits of this research

- Three agents researched in parallel: (A) capture tools and platforms, (B) data models, (C) AI-generated content. I checked the repo myself.
- **GitHub was blocked (403) for agent A and most hosts except `raw.githubusercontent.com` for agent B.** So: no licence was read at a repo and no release date was read from a repo. Every licence below is from memory unless marked.
- Agent B read the FtM schema YAML directly (FtM 3.8.4). Everything in §6 about FtM fields is checked. Everything about outside standards (W3C, schema.org, IPTC, C2PA) is from memory.
- Several 2026 platform claims come from vendor blogs that sell scraping data. They are marked **weak**.
- Tags used below: **[checked]** read from a source in this work; **[weak]** one vendor/secondary source; **[memory]** not re-checked.

## 3. How other tools do it

### 3.1 Capture and archive

| Tool | What it does | Licence | Maintained | Fit for us | Caveat |
|---|---|---|---|---|---|
| **Bellingcat Auto Archiver** | URL in → media via yt-dlp and other extractors → hashes, screenshots, WACZ, RFC 3161 and OpenTimestamps timestamps; v1.2 added deletion detection; has Bluesky (no login), Reddit and LinkedIn extractors | MIT [memory] | v1.2.x [checked via release listing] | **Full** for capture | Extractors break with platform changes; some need cookies/logins |
| **browsertrix-crawler / Browsertrix** | Real-browser crawl to WARC/WACZ, logged-in sessions, page behaviours | AGPL [memory] | Active [memory] | **Full** for web fidelity | Heavy to run |
| ArchiveBox | Self-hosted archive: HTML, SingleFile, WARC, PDF, screenshot, media | MIT [memory] | Active [memory] | Partial | Own UI and DB; weak on hashing/timestamps |
| warcio | Python WARC read/write | Apache-2.0 [memory] | Slow [memory] | Building block | Write our own WARC from Playwright traffic |
| ReplayWeb.page / pywb | Show WARC/WACZ | AGPL/GPL [memory] | Active | Viewer only | Needed to *display* captures |
| SingleFile | One-file page save | AGPL-3 [memory] | Active | Manual only | No custody chain |
| Hunchly | Commercial investigator browser capture | Proprietary | Yes | Reference design | Closed, manual |
| Zeeschuimer + 4CAT | Browser extension records what *you browse* on TikTok, Instagram, X, LinkedIn etc.; 4CAT analyses | MIT/MPL [memory] | Active [memory] | Partial–full for closed platforms | Depends on page structure; passive capture is lower risk than crawling |
| Wayback Save Page Now, Perma.cc, archive.today | Public/third-party archives | Services | Yes / unclear | Optional second witness only | **Sends the URL to a third party**; archive.today has no API and is automation-hostile |
| Memento (RFC 7089) | Protocol to find archived versions | Spec | Stable | Lookup | Not capture |
| Hypothesis | Web annotation | BSD-2 [memory] | Active | Annotation idea | Not ingest |
| Zotero | References and snapshots; many translators for papers and news | AGPL [memory] | Active | Partial (papers, metadata) | Useful for the "papers" half |
| Media Cloud, GDELT, Event Registry, NewsAPI | News corpora/APIs | Mixed | Active | Partial | Metadata/snippets; paid ones learn your queries |
| Google Fact Check Tools | ClaimReview lookups | Free API | Yes | Partial | Structured claims only |
| Datashare (ICIJ), DocumentCloud, Overview, OpenAleph | Document stores | Mixed [memory] | Active mostly | Partial | Not good at web/social ingest |
| Junkipedia, Social Searcher, Pinpoint | Hosted | Proprietary | – | None | Hosted or gated; unsuitable for local-first |

### 3.2 Libraries

| Library | State in 2026 | Basis |
|---|---|---|
| **yt-dlp** | Works for YouTube, TikTok, X, Reddit, Bluesky, partly Instagram/Facebook; breaks and is updated often; YouTube may need cookies/PO token | [memory] |
| gallery-dl | Works for many image sites; cookie-dependent | [memory] |
| Instaloader | Public profiles, rate-limited | **weak** |
| snscrape | Not updated since Nov 2023: treat as dead | **weak** |
| twint | Dead | [memory], high confidence |
| Nitter / XCancel | One vendor guide says both went offline 25 Aug 2026 after an X Corp demand; ntscraper says most instances are dead. Don't build on it | **weak** (single source) |
| TikTok-Api (unofficial) | Intermittent, needs Playwright tokens | [memory] |
| **trafilatura** | Best article-text extractor; also finds feeds/sitemaps | [memory] |
| newspaper4k, readability-lxml | Alternatives, weaker | [memory] |
| feedparser | Stable RSS/Atom | [memory] |
| FreshRSS / Miniflux | Feed pollers with an API | [memory] |
| RSSHub | Many routes, many break | [memory] |
| Playwright | Works | [memory] |
| Firecrawl self-host | Works; AGPL-3; **hosted Firecrawl sends URLs to a third party** | [memory] |
| crawl4ai | Works | [memory] |
| Bluesky firehose (Jetstream) / public AppView | No key needed; best-supported platform | [memory] |
| Mastodon API | Public timelines/hashtags open; per instance | [memory] |
| Telethon | Telegram MTProto client; real user account (ban risk); public channels | [memory] |

### 3.3 Transcription [all memory]

faster-whisper (MIT, CPU/GPU, int8) as default; WhisperX adds word timestamps and speakers (pyannote needs a gated Hugging Face model; the app's own media-suite round-2 check found the pyannote gate is a contact form and some alignment models are CC BY-NC). For YouTube, try existing captions via yt-dlp first. Record model, version and parameters with each transcript. The app's own media-suite research already covers the full pipeline and Whisper hallucination risk; reuse it.

## 4. Best practice for evidentiary capture

From the Berkeley Protocol on Digital Open Source Investigations (cited from memory; check the text at ohchr.org before quoting):

- Keep the **original** separate from working copies; WARC/WACZ for pages, original media plus yt-dlp `info.json` for video, headers included.
- **Hash on ingest** (SHA-256) and keep a manifest in an append-only log.
- **Timestamp** with RFC 3161 or OpenTimestamps. RFC 3161 sends only the hash, so content does not leak.
- Keep metadata: platform IDs, handle, URL, UTC capture time, tool and version, who captured, environment.
- **Capture before deletion**: capture on first sight, re-capture, record "deleted/removed" as a state (Auto Archiver 1.2 pattern).
- Per-item **custody event log**: captured, hashed, accessed, exported. Immutable storage.
- A screenshot alone is weak; pair it with WARC and hash.
- Fits what the app already has: the CAPT record (URL, SHA-256, custody log) and the Chain of Custody screen. Today a person fills them; the plan is that capture fills them.

## 5. Following sources over time, platforms, terms and law

### 5.1 Following

- **Discover**: `<link rel="alternate">`, `/feed`, sitemaps and news-sitemaps via robots.txt; YouTube channel feed `youtube.com/feeds/videos.xml?channel_id=` [memory].
- **Poll politely**: conditional GET (ETag / If-Modified-Since), per-host rate limits, jitter, `Retry-After`.
- **Change detection**: hash the extracted main text, not raw HTML; keep every version; capture each revision (this catches silent edits to a published article).
- **Duplicates**: exact SHA-256; near-duplicate text (SimHash/MinHash); images pHash/dHash; video frame-sampled pHash. Cluster wire copy. This feeds the app's existing "already in the case" cards and "restates, does not establish" evidence link.
- **Social**: open protocols first (Bluesky, Mastodon, Telegram public, YouTube feeds). For closed platforms use passive capture (Zeeschuimer) or manual save.
- **robots.txt**: not law in most places, but honour it for continuous crawling; a one-off evidentiary capture of a page the reporter is reading is different. A written policy is needed (open question 4).

### 5.2 Source protection: the key local-first issue

- Anything third-party learns what the reporter is interested in: Wayback SPN, Perma.cc, Event Registry, NewsAPI, hosted Firecrawl, Google APIs. **Default all off; opt-in per source.**
- Polling an account from a newsroom IP, or logging in as a person-linked account, reveals interest to the platform. Options: neutral egress, Tor/VPN for sensitive targets, dedicated accounts, never a personal account.
- The watchlist and monitor list are themselves sensitive: encrypt at rest, consider keeping them apart from case data.
- Local-only parts are the safe core: Playwright, yt-dlp, feedparser, local Whisper, c2pa-rs.

### 5.3 Platform access, as far as it could be checked

| Platform | Finding | Basis |
|---|---|---|
| Meta (Facebook, Instagram) | CrowdTangle closed 14 Aug 2024. Replacement (Meta Content Library + API) is limited to qualified academic and nonprofit researchers; most journalists lost access. Graph API only sees your own pages/permissioned content | **checked** (TechCrunch, Nieman Lab). No 2026 change found |
| X | Pay-per-use now the default (about $0.005 per post read reported); free tier gone; legacy Basic/Pro closed to new sign-ups and reportedly migrating; Enterprise very expensive | **weak** (vendor blogs disagree; check docs.x.com) |
| YouTube | Data API v3: 10,000 units/day default; `search.list` about 100 units; more needs an audit form. Official caption download needs the video owner; use yt-dlp for auto-captions | **checked** (Google docs) for quota; rest [memory] |
| TikTok | Research API for qualifying academic/nonprofit researchers (US/EU); reporter eligibility not verified | [memory], unverified |
| Reddit | Free tier about 100 queries/min, non-commercial; manual approval reported to take weeks; commercial needs a separate deal | **weak** |
| Telegram | MTProto open to any user via api_id; Bot API cannot read arbitrary channels | [memory] |
| Bluesky | Open, no key | [memory] |
| EU DSA Art. 40 | Delegated act adopted 2 Jul 2025: vetted researchers via a Digital Services Coordinator, independent of commercial interests, portal. Nothing found about journalists; whether a freelancer qualifies is unverified | **checked** (Polish regulator page) |

### 5.4 Law [all memory; not legal advice; needs a lawyer before the app ships anything that bulk-collects]

- *hiQ v. LinkedIn* (9th Cir. 2022): scraping public pages probably not a CFAA violation, but contract/ToS liability remained and the case settled.
- *Meta v. Bright Data* (N.D. Cal., Jan 2024): ruling for Bright Data on logged-off scraping of public data; logged-in under account terms is different.
- *X Corp v. Bright Data* (N.D. Cal., 2024): X's claims dismissed; appeal not checked.
- GDPR still applies to personal data stored; GDPR Art. 85 journalism exemptions vary by member state; no general scraping exemption verified.
- Practical risk (account bans) differs from legal liability.

## 6. Data models: what FtM and OpenAleph don't cover

### 6.1 What FtM 3.8.4 has [checked: schema YAML read]

- `Document` (extends `Thing`, `Analyzable`): `title`, `fileName`, `mimeType`, `contentHash`, `author`, `generator`, `crawler`, `bodyText`, `language`, `translatedText`, `date`, `authoredAt`, `publishedAt`, `parent/ancestors`, `processingStatus/Error/Agent/At`; from `Thing`: `sourceUrl`, `publisher`, `publisherUrl`, `createdAt`, `modifiedAt`, `retrievedAt`, `keywords`, `proof`; from `Analyzable`: `detectedLanguage`, `*Mentioned`.
- `HyperText` (+`bodyHtml`), `Article` (no extra properties; "a piece of media reporting about a subject"), `Pages`/`Page`, `Audio` (`duration`, `samplingRate`), `Video` (`duration`), `Image` (`pictured`), `Email`, `Folder`/`Package`.
- `Message` (extends Interval, Folder, PlainText, HyperText): `sender` (required), `senderAccount`, `recipients`, `inReplyToMessage`, `threadTopic`, `metadata`. Closest thing to a post.
- `UserAccount`: `username` (required), `service`, `email`, `number`, `owner`, `ipAddress`, `password`. Closest thing to a social account.
- `Organization` can stand for an outlet; `Ownership` links LegalEntities. `Event`, `Note` (no text offsets), `Mention` (machine NER output only), `Assessment` (the file itself asks whether to retire it; unrelated).
- OpenAleph tooling: **ftm-transcribe** runs WhisperCPP as a worker; its README says JSON is kept "temporarily" and doesn't say how timecodes are stored. Not read: ftm-analyze, followthemoney-store, ftmq, ingest-file contents.
- ADR-0006 already records that OpenAleph publishes no transcribe image (checked 2 Oct 2026).

### 6.2 Gap table

| Concept | FtM | Plan |
|---|---|---|
| Fetched article, body, dates, language | Covered (`Article`/`HyperText`) | Use as is |
| Outlet | Partial (`publisher` is a string) | New `Outlet` extends `Organization` |
| Byline / journalist | Partial (`author` is a string) | New `Byline` interval: journalist, article, role, order |
| Outlet ownership | Covered (`Ownership`) | Inherited via `Outlet` |
| Social account | Partial (`UserAccount`) | New `SocialAccount`: platform, stable platform id (not the handle), display name, profile URL, kind, verified, created, live status, last checked, operated by |
| Post / comment | Partial (`Message` fits but requires `sender`) | New `SocialPost`: platform post id, permalink, conversation/root post, shared post, kind (post/reply/repost/quote), hashtags, live status, attachments |
| Repost / quote | None | Property on `SocialPost` |
| Likes/reactions per user, followers graph | None | Side tables (high volume; keep out of the search index) |
| Engagement counts over time | None | Side table `engagement_snapshot` |
| Hashtags / @mentions | Partial (`Mention` is NER-only) | Property + search |
| Channel / group | None | `SocialAccount` with kind = channel |
| Feed / monitor subscription | None | App DB table, not FtM |
| Capture / snapshot | Partial (`contentHash`, `crawler`, `retrievedAt`) | New `Capture`: WARC/WACZ record id, SHA-256, captured at, tool + version, captured by, request and final URL, timestamp proof, collection form |
| Transcript with timecodes | None | `TranscriptSegment`; FtM suits a few hundred segments per file, so for hours of audio use a side table with a pointer entity (undecided) |
| Derivatives (frame, thumbnail, audio track, translation) | Partial (`parent`) | New `MediaDerivative`: source, derivative, kind, tool, fragment |
| Deleted / removed | None (`processingStatus` is wrong) | `liveStatus` + `lastCheckedAt` |
| Annotation with text/time selector | Partial | Side table following W3C Web Annotation selectors |
| Authenticity / AI-generation | None | New `AuthenticityAssessment` (see §7.4) |
| Claim review / fact-check | None | Export vocabulary only (schema.org `ClaimReview`) |

Draft YAML for all six schemata is in Appendix A. **It has not been loaded into an FtM `Model`**; syntax is modelled on the stock files and is untested.

### 6.3 How custom schemata work, and the limits

- [checked in code] `FTM_MODEL_PATH` **replaces** the model; it does not add to it. You copy the stock YAML and add your files; you must keep it in step on each upgrade.
- [snippets only] Aleph's guide says extend, never alter or remove stock schemata. A forum thread reports Aleph ignoring a custom `Document` subtype because it hardcodes Document handling; the suggested workaround was to update the entity after ingest.
- Every service that reads the model (API, ingest, analyze, transcribe, ftmq, store clients) must see the same path. Elasticsearch mappings come from the model, so changes likely need a reindex (not verified for OpenAleph). Use only the standard property types. Prefer subtypes and new schemata over editing `Message`.
- **Open decision:** the app keeps its own SQL records (`Source`, `Evidence`, `Document`) and mirrors documents to OpenAleph (`DocumentCorpusSync`). Which of the six schemata live in OpenAleph and which only in the app's tables is for the ADR; the lowest-risk path is app tables first, mirrored into FtM later.

### 6.4 Where the app's own SQL schema needs to grow

- `Source`: has `url`, `source_type`, `metadata_json`, `source_tier` (A–F), `issuer_or_author`. Needs: platform, account link, outlet link, first/last captured, live status.
- `Evidence`: has `authenticity_status` (suite vocabulary), `restates_evidence_id`, created/event/published/retrieved dates. Needs: link to the capture, the media time range (`t=12.0-19.5`) for transcripts, `role` (evidence of events vs the subject of the story).
- `Document`: has no kind or language field (already in the backlog). Needs: capture link, derivative-of link.
- New tables: `monitor`, `capture`, `engagement_snapshot`, `authenticity_check` (append-only), `transcript_segment`.
- **Authority System Suite:** the authenticity vocabulary (VERIFIED / PROVISIONAL / DISPUTED / UNKNOWN) lives in the suite (`app/ai/suite_vocab.py`). It has no value for "synthetic". This is a suite matter for Ony to decide; the app should not invent a workaround in its own vocabulary (see CLAUDE.md).

## 7. Keeping AI-generated material from being used as a source

### 7.1 What is established and what is not

- **Provenance is the strongest signal, but a missing signal means nothing.** A valid C2PA manifest saying "AI-generated" is strong evidence of synthetic origin; a valid camera-signed manifest is good evidence of capture origin. Most social platforms are widely reported to strip manifests on upload (vendor claims, conflicting, **weak**: test each platform yourself). So "no manifest" on social-sourced media proves nothing.
- **C2PA** newest spec confirmed: 2.3 (about 5 Jan 2026, adds live-video provenance) [checked]. A "2.4" claim was not confirmed. Verification tools: c2pa-rs, c2pa-python, c2patool, run fully offline (trust list needs refreshing). Licences are from memory (MIT/Apache-2.0 for Rust); an old `c2pa` Python package on PyPI was GPL-3.0, so **read each LICENSE before bundling**.
- **IPTC DigitalSourceType** (`trainedAlgorithmicMedia` etc.) [memory]: only a hint unless inside a signed C2PA manifest.
- **SynthID**: detects only Google-model output. SynthID Detector launched 20 May 2025 on a waitlist for journalists/researchers [checked via press report]; a claim of global English opening on 7 Oct 2026 is a single secondary source and **unverified**.
- **Detectors for video, audio, images**: the Deepfake-Eval-2024 paper (arXiv 2503.02857) tested real 2024 social-media content: open-source detectors lost about 50% (video), 48% (audio) and 45% (image) of AUC compared with lab benchmarks; commercial detectors did better but not as well as human analysts [checked: abstract-level]. Lab benchmark numbers (FaceForensics++, DFDC) overstate real-world accuracy [memory].
- **Text detectors**: Liang et al. 2023 found seven detectors flagged 61.3% of TOEFL essays by non-native writers as AI [checked via coverage]. Pangram reports about 0% false positives (vendor self-report, no independent replication found). OpenAI withdrew its own text classifier in July 2023 [memory].
- **TrueMedia.org** shut its hosted service 14 Jan 2025 and open-sourced the code; a Georgetown revival was reported but its current status is unconfirmed.
- **AI content farms**: NewsGuard reportedly tracks thousands of AI-generated news sites (3,749 by June 2026 per a secondary source; could not open the tracker). Domain-level checks are more reliable than per-article text detection.
- **Journalism practice** (InVID-WeVerify, WITNESS, SIFT, lateral reading, reverse image search) [memory]: encode as human steps. The "liar's dividend" is the main reason never to publish or act on a detector verdict alone: real material gets dismissed as fake.
- **Law**: EU AI Act Art. 50 transparency duties mostly apply from 2 Aug 2026, with a Digital Omnibus extension to 2 Dec 2026 for some systems already on the market; California SB 942 as amended by AB 853 operative 2 Aug 2026 for large GenAI providers (image, video, audio). Both from law-firm commentary, **not primary texts**. Net effect: marking rules raise how often a *positive* provenance signal appears. Open-weight models and bad actors will not mark, and marks can be stripped.

### 7.2 Design: a four-layer triage

1. **Provenance**: C2PA validation, signer and trust-list result, IPTC source type, known watermarks where access exists.
2. **Source and outlet reputation**: domain against content-farm lists, domain age, ownership, byline history, first-seen date, earliest copy by reverse image search.
3. **Detectors as hints**: optional per modality; results stored; never used to gate.
4. **A person decides, with reasons**: what was checked, what was not.

### 7.3 Hard rules

- A detector score **never** auto-rejects or auto-approves; it only raises a review flag, and can only lower a grade pending review, never raise one.
- Every check stores method, tool, model and version, score and scale, threshold, date and time, hash of the input, and whether it ran locally or in the cloud. History is append-only; any status can be disputed.
- **Local by default.** Sending a source's media to a cloud detector discloses it to a third party. Cloud detectors (Hive, Reality Defender, Sensity, SynthID Detector, InVID beta tools, GPTZero, Pangram) only with explicit per-item opt-in, never on source-protected material, and each send logged.
- **Propagation**: a claim citing an item marked likely-synthetic or confirmed-synthetic cannot be marked supported through it; it needs other support or shows "supported only by a synthetic source". Derivatives (crops, transcripts, quotes, summaries) inherit the flag from their parent; clearing one needs a human reason.
- **AI material as the subject of the story**: a real deepfake is valid evidence *of the deepfake* ("this fake circulated, posted by X on date Y"), not of what it depicts. Add a `role` on the evidence (as-evidence-of-events vs as-subject); propagation blocks only the first.

### 7.4 Proposed status values (for Ony to rename or accept)

| Status | Meaning | Set by |
|---|---|---|
| verified-origin | Valid signed provenance, or independent human verification of capture/author | System (valid signed C2PA) or a person |
| unverified | Default; nothing either way | System |
| likely-synthetic | Weighty indicators (signed AI-source assertion, detector agreement, content-farm domain) but not confirmed | System flag; a person confirms |
| confirmed-synthetic | Signed AI manifest, generator admission, or human forensic finding | A person with reasons, or a valid AI-source manifest |
| disputed | Evidence conflicts | A person |

Mapping to the suite's source tiers (the research agent did not read the suite; the app's `source_tier` runs **A–F**, not A–D as that agent assumed): proposal only. verified-origin with signed capture plus corroboration → top tiers; unverified → mid tier with a caveat, never sole support; likely-synthetic or disputed → lead only; confirmed-synthetic → excluded from support but allowed as the subject of reporting. **Which tier each lands in is the suite's call**, and the missing "synthetic" value in `AUTHENTICITY_STATUSES` is a suite change for Ony.

### 7.5 Honest limits

No detector is decisive. In-the-wild accuracy drops by roughly half for open models; text detectors misfire on non-native writers; a "fake" verdict can itself be abused. Provenance can confirm authenticity or AI origin, but its absence proves nothing. The layer reduces risk and forces a recorded human judgment; it does not guarantee that no synthetic material gets in.

## 8. Plan

This follows the repo's rule: mockups first, Ony approves, then build. Each step ends with a decision from Ony.

**Phase 0: Decisions (no code).** Answer the open questions in §10. Write ADRs: capture architecture (which tools, local-only default); FtM extension vs app tables; authenticity statuses and propagation rule.

**Phase 1: Links that work (smallest useful slice).** A pasted link is fetched locally with Playwright, saved as WARC/WACZ with a SHA-256 and a custody entry, its text extracted (trafilatura) and sent through the existing Drop lanes; the CAPT record fills itself. Fixes the backlog item "a web link isn't fetched or archived". Mockup: link row in INTAKE_1/2. Checks `robots.txt` policy decision.

**Phase 2: Media and social posts by link.** yt-dlp / Auto Archiver for single posts and videos (YouTube, TikTok, X, Instagram, Facebook, Reddit, Bluesky); original media + `info.json` kept; platform, post id, account and live status recorded. Transcription via faster-whisper (the media-suite plan), transcript pinned to time ranges. A per-platform "works today" health check, because extractors break.

**Phase 3: Following.** Monitors (outlet feeds, sitemaps, YouTube channel feeds, Bluesky, Mastodon, Telegram public channels), a schedule, change detection with version history, duplicate clustering, an "at-risk, capture first" queue, and a source-health screen. Closed platforms: Zeeschuimer import and manual capture, no bulk crawling. Egress policy per monitor.

**Phase 4: Authenticity layer.** `authenticity_check` log; C2PA validation locally; outlet/domain reputation check; reverse-search links (open in browser, nothing sent); optional detectors behind opt-in; the propagation rule on claims; the `role` field; review UI that demands reasons. Needs the suite decision on statuses.

**Phase 5: FtM mirror.** Load the six schemata into OpenAleph (after testing the YAML), mirror outlets, bylines, accounts, posts, captures and assessments so they can be searched and cross-referenced; side tables stay in the app.

**What each phase needs checked before building:** licences (§9), current extractor behaviour on each platform, whether OpenAleph accepts the custom schemata, the legal read in §5.4.

## 9. What could not be verified

1. Every licence in §3 (GitHub blocked), plus last-release dates except Auto Archiver's version.
2. Current working state of yt-dlp, gallery-dl, Instaloader, TikTok-Api and RSSHub routes in Oct 2026.
3. The Nitter shutdown and snscrape state (single weak sources); X API prices; Reddit pricing.
4. Whether journalists, especially freelancers, qualify for Meta Content Library, the TikTok Research API or DSA Art. 40 access.
5. Outcomes and appeals of the Bright Data cases; any 2025–26 scraping rulings; GDPR Art. 85 per country.
6. The Berkeley Protocol wording; Hunchly, Event Registry and similar current terms.
7. Official c2pa-rs / c2pa-python / c2patool licences; whether C2PA 2.4 exists; SynthID Detector's October 2026 availability; TrueMedia/Georgetown status.
8. Per-platform C2PA stripping; vendor accuracy for Hive, Reality Defender, Sensity, Resemble, Pindrop, GPTZero, Originality, Turnitin; independent replication of Pangram's claims.
9. InVID-WeVerify licence; WITNESS, Bellingcat, First Draft, AFP/Reuters/AP AI guidelines; IFCN material.
10. Primary legal texts for EU Art. 50 Omnibus changes and California AB 853; China's labelling rules; OpenAI/Meta/Adobe/TikTok/YouTube labelling policies.
11. Contents of ftm-analyze, ftm-transcribe's write-back, ingest-file provenance fields, followthemoney-store and ftmq; which FtM version OpenAleph pins; whether custom schemata work in its Docker setup and need a reindex.
12. All external standards in §6 (PROV-O, Web Annotation, schema.org, IPTC, C2PA, WARC/WACZ) are from memory; the proxy blocked w3.org, schema.org, iptc.org and c2pa.org.
13. The draft YAML in Appendix A has not been loaded into an FtM model.

## 10. Questions for Ony

1. **Scope of "follow".** Monitor only open sources (feeds, Bluesky, Mastodon, Telegram public, YouTube) and capture closed platforms only on demand? Or also try bulk collection from X/Instagram/TikTok/Facebook, accepting the terms and ban risk?
2. **Third-party archives.** Wayback/Perma.cc as an optional second witness (leaks the URL), or never?
3. **Egress.** Is a neutral/Tor/VPN route per monitor wanted for sensitive targets?
4. **robots.txt.** Honour it for continuous monitoring (my recommendation from the research), and not for one-off evidentiary captures?
5. **Media suite open question 8** (collect media from links with a Berkeley-style record, wrapping Auto Archiver or yt-dlp): yes or out of scope? Phases 1–2 assume yes.
6. **Detectors.** Allow optional cloud detectors behind per-item opt-in, or local-only?
7. **Synthetic status in the suite.** The suite's authenticity vocabulary has no value for AI-made material. Do you want to add one in the suite, and what should it be called?
8. **Subject-of-story rule.** Agree that a confirmed deepfake can support claims about the deepfake itself, never about what it shows?
9. **Where the new records live first**: the app's tables, mirrored to OpenAleph later (my suggestion), or OpenAleph first?
10. **Legal review** before Phase 3.

## Appendix A: Draft FtM schemata (untested)

```yaml
SocialAccount:
  extends: [UserAccount]
  label: Social account
  properties:
    platform:         {type: string}      # x, bluesky, telegram...
    platformId:       {type: identifier}  # stable id, not the handle
    displayName:      {type: name}
    profileUrl:       {type: url}
    accountKind:      {type: string}      # person|org|channel|group|bot
    verified:         {type: string}
    accountCreatedAt: {type: date}
    followersCount:   {type: number}      # snapshot; history in a side table
    liveStatus:       {type: string}      # live|suspended|deleted|unknown
    lastCheckedAt:    {type: date}
    operatedBy:       {type: entity, range: LegalEntity, reverse: {name: socialAccounts}}

SocialPost:
  extends: [Message]   # note: Message requires sender; relaxing it edits a stock schema
  label: Social post
  properties:
    platform:       {type: string}
    platformPostId: {type: identifier}
    permalink:      {type: url}
    conversationId: {type: identifier}
    rootPost:       {type: entity, range: SocialPost, reverse: {name: thread}}
    sharedPost:     {type: entity, range: SocialPost, reverse: {name: shares}}
    postKind:       {type: string}        # post|reply|repost|quote
    hashtags:       {type: string, maxLength: 200}
    liveStatus:     {type: string}
    metrics:        {type: json}          # latest snapshot only
    attachments:    {type: entity, range: Document, reverse: {name: attachedTo}}

Outlet:
  extends: [Organization]
  properties:
    outletKind:       {type: string}      # newspaper|broadcaster|blog|agency
    homepageUrl:      {type: url}
    domains:          {type: string}
    editorialCountry: {type: country}
    ownershipNote:    {type: string}

Byline:
  extends: [Interval]
  edge:
    source: {property: journalist}
    target: {property: article}
  properties:
    journalist: {type: entity, range: Person, required: true}
    article:    {type: entity, range: Article, required: true}
    role:       {type: string}            # author|photographer|editor
    position:   {type: number}

Capture:
  extends: [Thing]
  properties:
    capturedDocument: {type: entity, range: Document}
    archiveFile:      {type: entity, range: Document}   # WARC/WACZ
    warcRecordId:     {type: string}
    sha256:           {type: checksum}
    capturedAt:       {type: date}
    toolName:         {type: string}
    toolVersion:      {type: string}
    capturedBy:       {type: entity, range: Person}
    requestUrl:       {type: url}
    finalUrl:         {type: url}
    timestampProof:   {type: entity, range: Document}   # .ots or RFC 3161
    collectionForm:   {type: entity, range: Document}

TranscriptSegment:      # undecided: entity vs side table for long media
  extends: [Thing]
  properties:
    media:      {type: entity, range: Document, required: true, reverse: {name: segments}}
    startMs:    {type: number}
    endMs:      {type: number}
    speaker:    {type: string}
    text:       {type: text}
    language:   {type: language}
    confidence: {type: number}
    model:      {type: string}

MediaDerivative:
  extends: [Interval]
  properties:
    source:     {type: entity, range: Document, required: true}
    derivative: {type: entity, range: Document, required: true}
    kind:       {type: string}            # frame|thumbnail|audio|translation|ocr
    tool:       {type: string}
    toolVersion: {type: string}
    fragment:   {type: string}            # e.g. t=12,18

AuthenticityAssessment:
  extends: [Thing]
  properties:
    subject:           {type: entity, range: Document, required: true}
    method:            {type: string}     # classifier|C2PA|forensic|human
    model:             {type: string}
    modelVersion:      {type: string}
    digitalSourceType: {type: string}     # IPTC term
    aiLikelihood:      {type: number}
    confidence:        {type: number}
    c2paResult:        {type: string}     # valid|invalid|absent|untrusted
    c2paManifestHash:  {type: checksum}
    reviewStatus:      {type: string}
    reviewedBy:        {type: entity, range: Person}
    reviewedAt:        {type: date}
    rationale:         {type: text}
```

**Side tables (outside FtM):** `monitor(id, platform, query_or_handle, schedule, egress, last_run, status)`; `engagement_snapshot(post_id, captured_at, likes, reposts, replies, views)`; `follow_edge(src_account, dst_account, first_seen, last_seen)`; `reaction(post_id, account_id, kind, seen_at)`; `annotation(id, target, selector_json, body, author, created)`.

## Appendix B: Sources used

Checked: TechCrunch and Nieman Lab on CrowdTangle's closure; developers.google.com YouTube quota pages; uke.gov.pl on the DSA Art. 40 delegated act; Auto Archiver GitHub/readthedocs/release listing; arXiv 2503.02857 (Deepfake-Eval-2024); Liang et al. 2023 via Times Higher Education coverage; TrueMedia.org shutdown notice; C2PA 2.3 spec PDF (spec.c2pa.org); FtM schema YAML, `model.py`, `__init__.py` at raw.githubusercontent.com (alephdata/followthemoney, version 3.8.4); READMEs of openaleph/ftm-transcribe and openaleph/openaleph-procrastinate.
Weak (vendor or secondary): gigazine and zernio (X pricing), xpoz.ai (Nitter, scraper state), ntscraper README, techloy (Reddit), scalevise (SynthID Detector), sqmagazine (NewsGuard counts), makeinfluence and top10films (platform C2PA stripping), Ropes & Gray, Jones Day, Morgan Lewis, Troutman (AI labelling law), arXiv 2402.14873 (Pangram, vendor report).
Search snippets only, pages not read: followthemoney.readthedocs.io/custom.html, docs.aleph.occrp.org custom data model, aleph.discourse.group/t/aleph-custom-schemata/191, openaleph.org docs for ftm-analyze, alephdata/ingest-file.
