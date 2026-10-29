# ADR-0021: Following (source intake Phase 3)

**Status:** Accepted (2026-10-29)
**Deciders:** Claude, building the approved source-intake plan (`docs/research/source-intake/DECISIONS.md`, calls 1, 3,
4 and 11; mockup FOLLOW_1)

## Context

The research (`SOURCE_INTAKE_RESEARCH.md` §5.1, §10 Phase 3) asks for monitors over open sources: feeds, sitemaps,
YouTube channel feeds, podcasts and pages, polled politely, with change detection, version history and an "at risk,
capture first" queue (suite EGS rule 8: monitors surface, people capture). The calls: open sources only, no account
logins, no bulk collection (1); a Direct or Tor route per monitor, through a Tor the reporter runs (3); monitors obey
robots.txt (4); no legal review needed for Following as scoped (11).

## Decision

- **Three tables** (ADR-0019): `monitors` (address, kind, interval, route, health, ETag and Last-Modified, next look),
  `monitor_items` (what a poll found; new, captured or skipped, with who decided and why) and `monitor_versions` (every
  version of a watched page's main text, with lines added and removed). In backups and deletion like every case table.
  A restored case's monitors come back paused: nothing is sent until a person resumes each one.
- **Kinds:** feed (RSS, RDF, Atom), sitemap (and news sitemap; an index of sitemaps is refused with that reason),
  podcast (enclosure and `podcast:transcript` kept as displayed), youtube (the channel's public Atom feed), page (the
  app's own HTML reader keeps the main text; a change of text is a new version). Worked out from the address when not given.
- **A poll is polite:** a conditional GET (If-None-Match, If-Modified-Since); robots.txt read, kept an hour and obeyed
  (a 5xx or 401/403 on robots.txt means do not poll for now, RFC 9309); one request to a host at a time with a pause
  between (`FOLLOW_HOST_GAP_SECONDS`, 2 s); jitter of ±10% on the interval; Retry-After honoured; after a failure the
  wait doubles, up to a day. A same-site redirect (http to https, a trailing slash) is followed; one to another site
  marks the monitor "moved" and a person accepts the new address. 401/402/403/407 is "blocked" (the app never logs in).
- **Where a request goes:** the same rule as a capture (ADR-0018). Direct: the host is looked up once, every address
  must be public, and the connection goes to that address with the name kept for the Host header and the certificate
  check, so a name cannot resolve differently the second time. Tor: through `TOR_SOCKS_URL` (default
  `socks5://127.0.0.1:9050`), which looks the name up itself; the app ships no Tor. New package: `socksio` (MIT), what
  httpx needs to speak SOCKS.
- **Items, not captures.** A poll never keeps a page. Each new entry, sitemap address or page version is an item in the
  queue; an entry whose text changed after it was first seen is flagged "edited" and counted. A person captures one
  (the same capture as a pasted link) or skips it with an optional reason. Capturing several at once needs a reason,
  which goes on each item, at most 50 a time.
- **Outbound log** (ADR-0015): each poll is a line before it goes, service "following", the address as the value, the
  route in the reason; marked failed when the site cannot be reached.
- **Scheduler** (`app/jobs/schedule.py`): `follow_sources` every minute polls the monitors that are due, at most
  `FOLLOW_MAX_PER_TICK` (12) a minute.
- **The screen** (Bring in › Following) is built to Ony's rule of 29 Oct: titles, numbers, icons and alerts show; the
  rest is revealed on hover, focus or click (`components/ui/reveal.tsx`, the shared component for that rule).

## Not in this step

- Duplicate clusters ("same story, n copies": MinHash over syndicated text), "gone" detection for captured addresses
  (a re-check of each captured item), discovery of a site's feed from its page (`<link rel="alternate">`), following
  the sitemaps an index lists, Bluesky, Mastodon and public Telegram, and newsletters through a dedicated mailbox.
- The monitor list is not encrypted on its own: it is in the case's database, which the disk encryption covers
  (ADR-0016).
