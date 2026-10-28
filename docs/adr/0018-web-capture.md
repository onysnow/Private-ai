# ADR-0018: Web capture (a pasted link becomes a source)

**Status:** Accepted (2026-10-28)
**Deciders:** Claude, on Ony's instruction to make the source-intake judgement calls
(`docs/research/source-intake/DECISIONS.md`) and build what was designed before the media suite.

## Context

A link dropped in The Drop is accepted and ignored (BACKLOG; MOCKUP_BUILD_LIST §4 "links in the drop field (needs web
capture)"). Ony's design research §13 and mockup INTAKE_3 ask for a pasted link to become a source: the page as it was,
when, and proof it has not changed since. The suite's EGS Module 04 sets what a capture must keep: the URL, the page
source, a full capture showing the collector's clock (a screenshot alone is not enough), tool and version, collector,
start and end time, displayed metadata marked "as displayed, not verified", a hash with its algorithm, the original kept
unaltered, a custody log, failed captures logged as outcomes, item-by-item capture, and "Content verified: not done by
this system". The research (`SOURCE_INTAKE_RESEARCH.md` §3–4, §10 Phase 1) compares the tools.

## Decision

- **A real browser on this computer.** Playwright (Python, Apache-2.0) drives Chromium's headless shell to load the
  page. One visit, by the reporter's own action; no cookies, no login, no stored session (decided 19 Oct). A site that
  answers 401, 402, 403 or 407 (a login wall, a paywall, or a block on automated visits) is recorded as **not seen**,
  never as shown; a page that cannot be reached, or answers another error, is **link only**, with the reason. The
  browser's own calls home (updates, sign-in, suggestions) are switched off; the full Chromium makes them anyway, the
  headless shell does not, so the shell is the one installed and the one the setting names.
- **What is kept, each with its SHA-256:**
  - `page.html`: the page source as the browser received it;
  - `rendered.html`: the page as it stood once loaded, after its scripts ran;
  - `screenshot.png`: the full page, with a band at the top stating the URL and this computer's UTC clock at capture
    (EGS M04 rule 2: the capture shows the collector's system date and time);
  - `page.har`: every request and response of the visit, with bodies (Playwright's HTTP Archive);
  - `page.warc.gz`: the same exchanges written as WARC 1.1 records by warcio (Apache-2.0), the archival standard. They
    are written from the browser's record of each exchange (the HAR), so bodies are as the browser decoded them; the
    warcinfo record says so.
  - The rendered page also becomes the case document, read by the app's own HTML reader (which keeps the page's main
    content) like any uploaded `.html` file, with a web source carrying the address. The research suggested trafilatura
    for the text; the reader the app already has does that job, so no extractor is added.
- **A capture is its own record** (`captures` table, ADR-0019), linked to the source and the document it made, and fills
  the suite's CAPT record (URL, time, SHA-256, custody log, `content_verified: not done by this system`, outcome).
  Outcomes use the suite's gathering list: OBTAINED, or a failure with its reason.
- **Displayed metadata** (title, author, published date) is kept as displayed and labelled "as displayed, not verified";
  it never fills the app's own date fields.
- **Capture before use.** A link pasted in The Drop is captured before anything is quoted from it: its text exists in
  the case only as the captured document. (A source typed in by hand with an address stays as it is; it is not a
  capture and does not say it is one.)
- **Page text is data.** Nothing on a captured page is ever passed to a model as an instruction (EGS M04 rule 11).
- **Outbound log.** The visit is written to the outbound log (ADR-0015) before it goes: service "web capture", the URL as
  the value, the reporter as the actor. Every other request the page makes (images, scripts) is to the same or other
  hosts and is listed in the HAR; the log records the page request.
- **No private addresses.** The URL must be http or https and its host must resolve only to public addresses: loopback,
  private, link-local, shared and cloud-metadata ranges are refused. The check is enforced where the browser's
  connections go out, not in the page: every connection the capture browser makes (the page, each redirect hop, each
  image and script, the robots.txt) goes through a small forward proxy on this computer's loopback that looks the host
  up once and connects only to the addresses it checked, so a redirect cannot lead into the local network and a name
  cannot resolve differently the second time. Page-level request interception was tried first and is not enough:
  Playwright does not show it redirect hops. The capture runs on the reporter's machine, but a capture tool that can be
  pointed at the local network is a way in.
- **robots.txt** is read but not obeyed for a one-off capture (decision 4): when it disallows the page, the receipt says
  so. Monitors (Phase 3) obey it.
- **Off by default, per capture:** a second witness (a public archive) and a time proof (RFC 3161). Both leave this
  computer; they come in a later step and are logged when used.
- **Route:** Direct. A Tor route per capture comes with Following (Phase 3), through a Tor the reporter runs.

## Consequences

- New packages: `playwright` and `warcio` (both Apache-2.0). The browser is installed by `playwright install
  --only-shell chromium`; the Docker image and the backend CI add it. Where the browser is missing, a capture
  fails with that reason instead of falling back to a plain download that would keep no screenshot.
- Captures live with the case's documents on disk and travel in backups like documents do.
- Not in this step: media from links (yt-dlp, Phase 2), Following (Phase 3), the authenticity layer (Phase 4, its own
  ADR), a second witness and time proof, signing with a local key.
