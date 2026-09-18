# ADR-0001: Firecrawl as a connector provider

**Status:** Proposed
**Date:** 2026-09-18
**Deciders:** Ony

## Context

Private-ai's backend investigates entities (people, companies, addresses)
by querying external connectors -- currently Aleph (document/leak search)
and OpenSanctions (sanctions/PEP matching) -- and persisting their results
as `ConnectorFinding`/`Lead` records against an investigation. Both
existing connectors are structured-data providers with a narrow, specific
scope: Aleph searches a fixed corpus of leaked/public documents,
OpenSanctions matches against curated watchlists.

Neither covers general open-web research: news coverage, company
websites, government filings not in Aleph's corpus, or any other public
page a reporter would otherwise have to search and read by hand. Firecrawl
is a web-data API (Scrape/Crawl/Map/Extract/Search) that can fill this
gap; its `/v2/search` endpoint in particular matches the shape this
codebase's `Connector.search(query) -> list[ExternalFinding]` contract
already expects, and -- unlike Aleph/OpenSanctions -- is documented to
work without an API key at all (a lower, shared rate limit), which matters
for a tool whose install target includes reporters without an existing
Firecrawl account.

This session had already generalized the connector registry from a
hardcoded if/elif chain to a declarative `CONNECTOR_SPECS` table
(STRUCT-0022), specifically so a new provider could be added as one
registry entry plus one `Connector` subclass, rather than another special
case. Firecrawl is the first real test of that generalization.

## Decision

Add Firecrawl as a third connector provider, implemented and already
merged to `dev` (commit `1da7abd`):

- `app/core/config.py`: `firecrawl_base_url` (default
  `https://api.firecrawl.dev`, overridable for a self-hosted Firecrawl
  instance per Firecrawl's own `FIRECRAWL_API_URL` convention),
  `firecrawl_api_key`, `firecrawl_search_limit`.
- `app/connectors/firecrawl.py`: `FirecrawlConnector(Connector)`,
  structured like `OpenSanctionsConnector` (a `configured` property, a
  `_parse_result` helper, an async `search()` using `httpx.AsyncClient`),
  but deliberately without a `_require_key()` guard -- it attaches
  `Authorization: Bearer <key>` only when a key is configured, and
  otherwise sends the request keyless. Relies on the `Connector` base
  class's default `enrich()` (builds a text query from an FtM entity's
  properties, then calls `search()`) rather than overriding it, since
  Firecrawl has no query-by-example matching endpoint the way
  OpenSanctions does.
- `app/connectors/registry.py`: registered `"firecrawl"` in
  `CONNECTOR_SPECS`.

No new pip dependency: implemented against the existing `httpx` dependency
and Firecrawl's plain REST contract, rather than adding `firecrawl-py`
(the official SDK). This matches the existing Aleph/OpenSanctions
connectors' convention (raw `httpx.AsyncClient` calls, not a vendor SDK)
and avoids a dependency this app doesn't otherwise need.

While wiring this up, found and fixed a third hardcoded provider list
that STRUCT-0022's original fix had missed:
`app/services/credentials.py`'s `SUPPORTED_CONNECTORS = {"aleph",
"opensanctions"}` constant gated `get_secret`/`set_secret`/
`credential_status`. Since the registry's `_build()` calls `get_secret()`
for every provider in `CONNECTOR_SPECS`, this would have made the
registry raise `ValueError: Unsupported connector credential` for
`"firecrawl"` at import time -- an app-startup break, not a cosmetic gap.
Fixed by deriving `credentials.py`'s provider check from
`CONNECTOR_SPECS` too, via a deferred import (this module is imported
*by* `registry.py`, so importing back at module load time would be
circular).

## Options Considered

### Option A: Firecrawl as a connector (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low -- one `Connector` subclass, one registry entry, three settings fields; the registry generalization (STRUCT-0022) already did the hard part |
| Cost | Free at the keyless tier (lower rate limit); paid API key raises the limit |
| Scalability | Bounded by `firecrawl_search_limit` per call, same shape as the existing connectors |
| Team familiarity | New to this codebase, but the REST contract is simple (one POST endpoint, flat JSON) |

**Pros:** fits the existing `Connector` ABC with no interface changes;
findings flow through the same persistence path (`persist_connector_findings`,
`Lead` creation) as Aleph/OpenSanctions with zero special-casing; keyless
mode means it works for every install out of the box, unlike Aleph/
OpenSanctions which are useless until a reporter obtains a key.
**Cons:** open-web search results are noisier/less structured than
Aleph's document corpus or OpenSanctions' curated entities -- `schema`
is always `None` and `properties` is just a description string, so
downstream FtM-shaped consumers get less structured data from this
provider than from the other two.

### Option B: Firecrawl only as a standalone research tool (via the Firecrawl MCP), not integrated into the backend

| Dimension | Assessment |
|-----------|------------|
| Complexity | None -- no code change |
| Cost | Same (keyless or keyed) |
| Scalability | N/A -- ad hoc, one query at a time, not tied to an investigation |
| Team familiarity | N/A |

**Pros:** zero implementation/maintenance surface; no new settings, no new
credential-storage path, no new test file to keep green.
**Cons:** findings never become part of an investigation's persisted
record (no `ConnectorFinding`/`Lead`, no audit trail, no dedup against
existing leads) -- every Firecrawl result a reporter finds has to be
manually re-entered as a claim/evidence/source instead of flowing through
the same enrichment pipeline as Aleph/OpenSanctions hits. Doesn't match
the stated goal of "integrating Firecrawl directly into Private-ai."

### Option C: Firecrawl's Extract/Crawl (structured extraction) instead of Search

| Dimension | Assessment |
|-----------|------------|
| Complexity | Higher -- Extract needs a JSON schema or prompt per use case, Crawl needs site-scoped traversal logic |
| Cost | Higher credit usage per call than Search |
| Scalability | Slower (multi-page fetches) and less suited to a "give me an ExternalFinding list for this query" contract |
| Team familiarity | New concepts (schema-driven extraction, crawl depth/limits) beyond a single search call |

**Pros:** potentially richer, more structured results for a known target
site (e.g. a specific court-records portal).
**Cons:** doesn't fit `Connector.search(query) -> list[ExternalFinding]`
as directly -- Search is the only Firecrawl primitive that's naturally a
"query in, ranked results out" shape matching the other two connectors.
Better suited to a future, narrower tool (e.g. a document-ingestion
helper) than to the generic connector-enrichment path.

## Trade-off Analysis

Option A was chosen because it is the only one that makes Firecrawl
results a first-class part of an investigation (persisted, deduplicated,
audit-logged, visible in the same `/api/connectors` status and
`/entities/{id}/enrich` flows as Aleph/OpenSanctions) rather than a
side-channel research tool whose output has to be manually transcribed.
The cost is that Firecrawl's `ExternalFinding`s carry weaker structure
(`schema=None`) than the other two providers -- accepted as reasonable
for a first pass; Option C's schema-driven Extract is a natural
follow-up once there's a concrete recurring extraction target, not a
blocker to shipping Search-based enrichment now.

## Consequences

- What becomes easier: reporters get open-web search results
  (news, filings, company sites) surfaced inside the same investigation
  workflow as Aleph/OpenSanctions, with no API key required to start.
- What becomes easier: adding a *fourth* connector is now a one-file,
  one-registry-entry change end to end (registry -> settings ->
  credentials), now that all three provider lists derive from
  `CONNECTOR_SPECS`.
- What becomes harder: `ExternalFinding.schema` is `None` for every
  Firecrawl result, so any future code that assumes all connector
  findings carry a FollowTheMoney schema needs to handle that gap.
- What we'll need to revisit: the frontend still hardcodes a two-provider
  list (`'aleph'|'opensanctions'`) in `api-types.ts`, `api-validate.ts`,
  and `page.tsx`'s settings panel -- tracked separately as STRUCT-0040 --
  so Firecrawl is usable via the API today but not yet selectable in the
  UI until that lands.

## Action Items

1. [x] Add `firecrawl_base_url`/`firecrawl_api_key`/`firecrawl_search_limit` settings.
2. [x] Implement `FirecrawlConnector` (keyless-capable `search()`).
3. [x] Register `"firecrawl"` in `CONNECTOR_SPECS`.
4. [x] Fix the third hardcoded provider list found in `app/services/credentials.py`.
5. [x] Add `tests/test_firecrawl_connector.py`; full backend suite green (220/220).
6. [ ] Ony: review and mark this ADR Accepted (or request changes).
7. [ ] Frontend: resolve STRUCT-0040 so Firecrawl is selectable/configurable in the settings UI.
