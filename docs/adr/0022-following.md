# ADR-0022: Following (the app watches, a person captures)

**Status:** Accepted (2026-10-28)
**Deciders:** Claude, on Ony's instruction to continue the build order (source intake Phase 3), within the calls in
`docs/research/source-intake/DECISIONS.md` (1: open sources only; 3: Direct or Tor per monitor; 4: robots.txt honoured
for monitoring; 9: app tables first; 11: no legal review needed for Following as scoped).

## Context

Mockup FOLLOW_1 and the research (`SOURCE_INTAKE_RESEARCH.md` §5.1, §5.3, §10 Phase 3) ask the case to follow its
sources over time: feeds, sitemaps, single pages, podcasts and open-protocol public accounts, each checked politely,
with what they turn up waiting in a queue for a person ("at risk, capture first", suite EGS rule 8). Nothing is kept
until a person captures it; several at once needs a reason in the custody log.

## Decision

- **Tables** (app tables first): `monitors` (a source, its kind, schedule, route, health, the last check's lines, the
  ETag and Last-Modified for conditional GETs), `monitor_items` (what it turned up, each version of its text, its
  state, the decision with who, when and a bulk reason) and `page_versions` (each version of a followed page's main
  text, with what changed). All travel in a case backup and go with the case.
- **Kinds.** `feed` (RSS, Atom, YouTube channel feeds), `sitemap` (news sitemaps; the newest child of an index),
  `page` (one page's main text: navigation, headers, footers, scripts and asides left out, so a menu or an advert is a
  layout change, not a new version), `podcast` (a feed whose items carry audio; `podcast:transcript` noted),
  `account` (Bluesky through its public read-only server `public.api.bsky.app`, Mastodon through the account's public
  RSS; no login anywhere) and `closed` (X, Instagram, Facebook, TikTok, LinkedIn, Threads, WhatsApp, Telegram, …: a row
  with no monitor; a pasted link is captured logged out, or the reporter supplies files). Following something asks the
  address once to see what it is; a page that names its feed is followed through the feed.
- **Polite.** Every request goes through the capture guard (public addresses only, a 20 MB budget) or, on the Tor
  route, to the Tor the reporter runs (`TOR_SOCKS_URL`, default `socks5h://127.0.0.1:9050`; the app ships none). Each
  check is a conditional GET; robots.txt is read once a day per host and honoured; 429 and 503 wait for `Retry-After`;
  checks are jittered and the scheduler never asks one host twice within 10 s; a permanent redirect pauses the
  source until a person accepts the new address. Each request, robots.txt included, is a line in the outbound log.
  The User-Agent names the app and nothing about the reporter.
- **The queue, most at risk first.** Gone (something captured now answers 404 or 410: "Record removal"), then the
  amber signals (an account deleting posts, an item deleted at the source or edited since first seen, a page changed
  since it was captured), then teal (a wire copy of others, a publisher transcript), then "New · no sign of risk".
  Copies of one story (word-shingle similarity ≥ 0.6 across sources, within 14 days) are counted once: only the
  earliest is offered for capture.
- **Capturing.** A page or post is captured by the ordinary web capture (ADR-0018); a podcast episode by fetching its
  audio file (the same guard, `MAX_MEDIA_BYTES`) and transcribing it (ADR-0020). Capture all needs a reason of eight
  characters or more, kept on each item it captured. Skip can be undone.
- **The scheduler** (one tick a minute, PLATFORM_NEEDS_PLAN part 2) checks up to five due monitors per tick.

## Consequences

- New packages: `feedparser` 6.0.14 (BSD-2, with `feedparser-sgmllib`, PSF-2.0) and `socksio` 1.0.0 (MIT) for the Tor
  route through httpx.
- Not built: newsletters into a dedicated mailbox (needs a mail account the app does not have), public Telegram
  channels (read from `t.me/s/…` pages), MinHash for large corpora (pairwise shingles are enough for one case's
  fortnight), a per-platform "works today" check beyond the monitor's own health, and encrypting the monitor list at
  rest (it lives in the case database like every other record).
- Each followed site sees a visit from this computer's address on the Direct route; the screen says so per source.
