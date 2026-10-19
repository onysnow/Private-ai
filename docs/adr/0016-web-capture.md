# ADR-0016: Capturing a web page from a link (web_captures)

**Status:** Accepted (2026-10-19)
**Deciders:** Claude, building mockup INTAKE_3 after Ony approved the source-intake mockups ("they look fine I guess, so
start development"); the open questions below are Ony's

## Context

A link pasted into the case was not fetched (BACKLOG: "a web link isn't fetched or archived"). Research
`docs/research/source-intake/SOURCE_INTAKE_RESEARCH.md` §10 Phase 1 and the Authority Suite's EGS Module 04 ask for the
same thing: capture before use, with a fingerprint, a time, the tool and what was sent and received, kept apart from any
claim that the page is genuine. Ony's decision of 19 Oct 2026: the app never connects to or logs in to a social media
account; a login wall is "not seen", never "shown".

## Decision

- **Table `web_captures`** (migration a7d2e9b4c613). One row per capture attempt: the address as pasted and the one reached,
  `outcome` (saved | link_only | not_seen | failed) with a reason in words, the request as sent and the answer's status and
  headers as served, the steps of the capture lane with their times, the files kept (name, role, size, SHA-256, path), the
  page's fingerprint and the text's, what the page displays about itself (title, byline, date: "as displayed, not
  verified"), and a list of re-checks. Written once; nothing in a saved capture is changed later except a line added to its
  re-check list.
- **The page is a Document.** A saved page's HTML is stored by `store_document` and read by the same reader as any upload, so
  it appears in The Drop, search, the reading room and claims like any file. Its Source is a `web` source with the address.
  The capture's other files (the WARC archive, the working text copy, and, with a browser, the screenshot and the rendered
  page) live in `<storage>/<case>/captures/<capture id>/` and are recorded in `files` as owned by the capture.
- **Fetch.** `httpx` from this computer: no cookies, no login, `Accept-Encoding: identity` so the bytes kept are exactly what
  the site sent, a size cap (25 MB), a timeout, and at most five redirects, each checked before it is followed. A link with a
  user name or password in it is refused. An address on this computer, a private network, a link-local or reserved range is
  refused (a pasted link must not reach a service on this computer); `CAPTURE_ALLOW_PRIVATE_HOSTS` allows it. The name is
  resolved here and again by the client, so a hostile DNS server answering differently the second time is not fully excluded.
- **Browser (optional).** When Playwright and a Chromium are present, the page is also loaded in headless Chromium in a
  separate process with a time limit and no stored state, for a screenshot and the page as its scripts built it; every request
  the browser makes is checked against the same address rule. When the fetched page has almost no text and the rendered one
  has, the rendered page is the Document read (the raw page is kept as a file). Without a browser the lane says the
  screenshot was skipped and why. `CAPTURE_BROWSER=off` turns it off; `CAPTURE_BROWSER_PATH` names a Chromium/Chrome program.
  Playwright is not in `requirements.txt` (it needs a browser installed beside it); the Docker image has none yet.
- **Archive.** A WARC 1.1 file of the HTTP exchange (`warcio`, Apache-2.0), not a WACZ of what the browser loaded.
- **Outcomes are records.** A 404/410 or an address that does not exist is `link_only` (the link is kept as a source, not a
  copy); a 401/403, a redirect to a login page, or a page whose only content is a password form is `not_seen` (no source,
  nothing behind it seen); anything else that is not an HTML page, too large, or answered with an error is `failed`.
- **Same page again.** Compared by the page's bytes first, then by its extracted text (bytes change with every visit on many
  sites). Same: "already in the case", a "same" line in the first capture's checks, no new copy. Different text: a new capture
  with `supersedes_id`, and a "changed" line on the first, which stays exactly as it was. A removed page on a re-check is a
  `link_only` capture that names the saved one ("gone"); a site that cannot be reached is only a line ("unreachable").
- **Logged as leaving.** Each fetch writes an `outbound_requests` row (service `web_capture`, the address, the request line):
  the page's own site sees the visit. A redirect refused for pointing at a private address is logged `not_sent`.
- **The files travel with the case.** Backup/restore carries `web_captures` and the capture-owned files
  (`manifest.capture_files`); a case's deletion removes them; the stray-file preview does not list them.
- **No claim of genuineness.** The screen says "Content verified: not done by this system" and links to the authenticity
  check; nothing here reads the text to an AI.

## Not built here (in the mockup, not in this slice)

Second witness (a public web archive), time proof (a signed time stamp), the "check again later" schedule (a re-check runs
when pressed), the quote that finds itself again after a re-check, a clock drawn into the screenshot, and "Capture all" for a
monitored feed. Following (research Phase 3), media and social posts by link (Phase 2) and the authenticity layer (Phase 4)
are separate work.

## Deviations from the research plan

- `trafilatura` is not used: the working text copy comes from the reader already in the app (`html_reader`), so the capture and
  the Document agree on what the text is. A heavier extractor can replace it behind `working_text`.
- WARC rather than WACZ, as above.

## Open questions for Ony

1. **robots.txt.** A capture of one pasted link does not consult it. Keep it that way for one-off captures (research §12.4)?
2. **A browser in the Docker image.** Adding Chromium makes screenshots and script-built pages work in the shipped product and
   adds a few hundred MB to the image. Add it, or leave the screenshot to a computer that has one?
3. **Re-check schedule.** Weekly/Daily needs a scheduler that wakes the app; until then a re-check is a button.
4. **Third-party archive and time proof** (research §12.2): wanted, and if so which services (each is a send of the address).
