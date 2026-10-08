# Discovery: search, tags and notes, "Red Flags", lookups and overlays

Status: **proposed** (5 Oct 2026). Nothing here is built yet. The prototype is
`docs/discovery/prototype.html`; the build waits on Ony's word.

## What Ony asked for (4–5 Oct 2026)

- Search is hard to look at: more colour, more design, more information on
  hover.
- Tag entities, add notes to them, and add them to custom charts.
- Use more of the Dark Academia palette on every page and feature. Find
  better ways to infer information at a glance. Break pages up where their
  design repeats.
- Features that add value, large or small: customisation, organising
  evidence, and helping new discoveries spread.
- The app should help decide what to dig into next, from patterns seen in
  other cases. Example: A owns B owns C owns A suggests a hidden owner.
- At the click of a button: send crawlers, search specific sites for
  records, look into financial information, campaign contributions and
  political activity or voting records.
- Overlay information from different charts to find new patterns.

His answers to three questions:

- Which sources to use depends on the investigation and on where the party
  is (an American or a European institution). The app picks.
- Outside lookups are a toggle that starts on (automatic).
- Free sources first; paid ones as optional keys.

## Principles

1. **A flag is a lead, not a finding.** Every "Red Flags" card says
   what the pattern is, why it matters, where it was documented, the
   innocent explanations, and which document would confirm or clear it.
   "Each flag signals a risk – it is not evidence" (Open Contracting
   Partnership 2024). "No single transactional red flag necessarily
   indicates suspicious activity" (FinCEN FIN-2018-A003).
2. **Outside results are findings until reviewed.** This is the rule the
   workbench already follows for connectors.
3. **Every fetched page is evidence.** Each fetch keeps a WARC record, a
   screenshot, a SHA-256 hash and the time it was fetched.
4. **Library first.** Use OpenAleph in full (cross-referencing, entity
   extraction, diagrams) and build only what it does not do.
5. **Colour has jobs, kept apart.** Each meaning has one colour across the
   app (see below).

## Colour roles (extends `lib/viz-tokens.ts`)

| Job | Colours (palette names) | Where |
|---|---|---|
| Stage of the work | collect steelBlue, verify sage, map amber, report copper, keep taupe | Page rail, section number, section rule only |
| How sure | supported forest/sage, not yet shown umber/taupe, disputed brick, rejected #672c1a | Claims, evidence, events, links, chains |
| Party kind | person blue, company gold, organisation sage, vessel copper, property tan | Dots, name chips |
| Link family | owns amber, directs sage, paid copper, family blue | Lines, cells |
| Kind of record (search, lists) | party gold, link amber, evidence and sources parchment, claim/event sage, lead/task copper, outside finding plum #312237 (cards filled with plum; its edge and text use #9a83a8, a lighter tint of plum, so the mark meets 3:1) | Left edge of a result card, group headers |
| Made by a machine | plum #312237 | AI drafts, pattern flags, outside findings |
| Reporter's own tags | eight free swatches the reporter picks (deepBlue, forest, #8d692b, #663306, #89352a, #61503e, #3e6181, #966926) | Tag chips |
| Danger | brick outline | Delete and restore actions |

Text and marks meet WCAG 1.4.3 (4.5:1) and 1.4.11 (3:1). Every chip pair is
checked in `tests/test-viz-tokens`.

## Page-by-page audit

Based on the screenshots of 4 Oct 2026 (`/mnt/user-data/outputs/screens`).

| Page or card | What is wrong now | Change |
|---|---|---|
| Workbench page | About 9,700 px long. Cards are in an order that does not follow the work. Uneven gaps. A hero sentence takes the first screen. Beige cards elsewhere. | The five-stage page, as in the approved page mockup: a rail, "Where things stand" tiles, equal-height rows, empty parts as one-line strips. |
| Search | One beige card per hit. The same relationship appears twice (as an FtM entity and as a relationship row). Raw FtM ids show in snippets. No colour coding. No facets. Nothing on hover. | Redesigned (see Search below). |
| Provenance trace → **Chain of Custody** | A card of instructions with no content until used. | Becomes the right-hand drawer that "Trace" opens from anywhere: a vertical chain from source to record. |
| Timeline | Done in pass 4. | Joins the shared year slider and overlays. |
| Places | Empty state takes a card. | One-line strip when empty. |
| Documents / bulk import → **The Drop** | Two near-identical upload forms. | One drop zone. Each document's proposals are counted, coloured by status. |
| Leads (kanban) | Empty columns take full width. The board scrolls sideways. Buttons repeat on every card. | Empty columns fold. Priority edge. Task state dots. Actions on hover. "Red Flags" cards can be turned into leads. |
| Chart builder | Question-first flow is good. Choices are plain black buttons. | Each question has a small picture of its chart. A "From a collection" source (see Tags) lets you chart your own picks. |
| AI reasoning | Disabled controls take a full card. | Collapses to one line when switched off. Plum marks anything a model wrote. |
| Deletion / backup / restore | Fine. | "Keep" stage. Brick outline for danger. |
| Sources & evidence | Form with no list. | A list of sources with evidence counts, linked claims and fetch snapshots. |
| Claims | Beige cards. The right pane is empty until a click. | List and detail (as in the mockup). Status edge, confidence bar. Evidence for and against side by side. |
| External connectors | Buttons in a row. Results arrive elsewhere. | Merged into one **Paper Trail** panel with OpenAleph (decided by Ony, 6 Oct 2026). Connectors become sources in the router. |
| Relationships | Network redesign agreed (pass 2 + the radial prototype). | Plus overlays and "Red Flags" markers on the dots. |
| Money flows | Sankey for one payment is one block. | Ledger bars under three payers or payees; flow above. Structuring and round-number flags shown on the bars. |
| Review queue / evidence review / ledger | Three cards, mostly empty. | One "Findings to review" inbox: outside findings, cross-references, crawled pages and AI drafts. Filter chips by kind, accept or set aside in one place. |
| OpenAleph corpus | Beige subcards. | Merged into the **Paper Trail** panel (decided by Ony, 6 Oct 2026): every source's status, one queue of matches and findings, records by source, what stands out, watchlist, send out. |
| Dashboard | Two short lists. | A home for all investigations: each with its stage tiles, newest flags and what changed since the last visit. |
| Review page | Empty when there are no documents. Plain list. | Document reader on the left, proposals on the right, keyboard accept and reject. |
| Settings | Long forms. | Groups: access, outside lookups (the toggle and per-source keys and licences), AI, demo data. |
| About / console | Fine for their purpose. | Palette pass only. |

## Search

- **One result per thing.** Collapse the duplicate FtM-entity and
  relationship hits. Replace ids with names.
- **Results grouped by kind of record**, each group with its colour, a
  count and a fold: parties, links, evidence, claims and events, leads and
  tasks, documents, outside findings.
- **A card for each result.** The left edge is the kind of record. A party
  dot shows the party kind. A status chip shows how sure. The matched words
  are highlighted. A one-line "why it matched" says which field matched.
- **Facets** down the side: kind of record, party kind, status, source,
  date range, tags. Each shows its count and a small bar.
- **Hover a result** for a peek card: a mini network of its links, its
  evidence count by stance, and its latest event. No page change.
- **Actions on hover:** trace, open, tag, add a note, add to a collection,
  show in the network, look it up outside.
- **Keyboard:** ⌘K opens search from anywhere. Arrow keys move. Enter opens
  the result. T tags it.
- **Saved searches** that re-run when new material arrives, and show a
  "3 new" count.

## Tags, notes and collections

- **Tags:** reporter-named, with a colour from the tag swatches. They go on
  any record: party, link, evidence, claim, event, document, lead.
- **Notes:** free text attached to any record or chart mark. A note can be
  turned into a lead.
- **Collections:** a named, ordered set of records ("Bellcastle money
  trail"). Collections can be:
  - a filter on every chart (show only this collection, or light it up)
  - a data source in the chart builder
  - exported as a list to OpenAleph
- **Backend:** tables `tags`, `record_tags` (record type and id), `notes`,
  `collections`, `collection_items`. These are investigation-scoped, are
  included in backup and restore, and are never sent to outside sources.

## Red Flags (pattern engine)

Rules run on the case graph (networkx on the server; graphology in the
browser for live views). Each card is ranked as follows (method from
Fazekas & Kocsis 2015 and OCP 2024):

- equal weights to start
- a bonus when several flags fire on the same parties
- a discount when a flag rests on unreviewed evidence
- jurisdiction-only flags weighted down (Tello Arista, Fazekas & Volkotrub 2026)

The patterns, with where each was documented, are in `patterns.md`. Some
can be computed from today's records. Others need data that lookups bring
in, such as incorporation dates, addresses, procurement fields and public
offices.

Each card shows:

- the parties, lit in the network
- the rule, in plain words
- why it matters, with the source link
- innocent explanations
- what would confirm or clear it
- one-click actions: run the lookups that would help, make it a lead,
  open it in the chart

## Lookups and crawling (source router)

- The router picks sources from the party's kind, the country, and the
  kind of investigation. The catalogue and rules are in `sources.md`, with
  each source's current status checked on 5 Oct 2026.
- **The toggle:** per investigation, off / ask each time / automatic.
  Automatic is the default, as Ony chose. Some sources never run
  automatically:
  - **Click only:** cost money or have small daily limits (PACER, SAM.gov,
    FollowTheMoney.org).
  - **Deep link only:** forbid automation (Equasis, OpenSky without a
    licence).
- **Results:** they land as findings in the inbox with source, query, time
  and licence. Non-commercial data (OpenSanctions, FollowTheMoney.org,
  Global Fishing Watch) is marked.
- **Crawler:**
  - Scrapy (BSD) obeys robots.txt and throttles itself; scrapy-playwright
    renders pages only where JavaScript is needed.
  - warcio (Apache) writes the WARC record, Playwright takes the
    screenshot, and trafilatura (Apache) extracts the text.
  - The extracted text goes into ingestion and OpenAleph's entity
    extraction.
  - Optional: Browsertrix and pywb as separate containers (AGPL/GPL, not
    linked into the app).
- **Matching:**
  - OpenAleph cross-referencing first.
  - Self-hosted yente (MIT code; the data is CC BY-NC) for sanctions and
    PEP screening.
  - rigour and nomenklatura (MIT) for name normalisation and recorded
    match decisions.
- **Source clients:** edgartools, ch-api and pygleif (MIT); a thin OpenFEC
  client of our own, because the existing ones are abandoned.
- Each new package needs an ADR before it is added (repo rule).

## Overlays

- **One year slider for the whole investigation.** The network, ownership
  chain, money, claims and timeline all show the state as of that date.
- **Layers on the network:**
  - money (payment width)
  - flags (a ring on flagged parties)
  - tags (tag colours as a second ring)
  - lookups (a badge where outside findings wait)
  - the timeline (link start dates)
- **Linked highlighting across charts:** point at a party anywhere and it
  lights everywhere else.
- **"How are these two connected?":** pick two parties to see every chain
  between them, with how sure each is.
- **Saved views and story mode** (as discussed on 4 Oct).

## Research in connection with, and the research trail (5 Oct)

- **On any chart:** point at a party and choose "Research in connection
  with…", then click a second party. The run searches inside the case and
  outside it. A dashed plum line joins the two while it runs, and its steps
  show live in the side panel.
- **Research pages:** every run, everywhere it searched (and whether the
  request left the machine), contradictions side by side, mistakes the
  checks caught, corrections, and the matches waiting for a decision.
- **Each step** says who made it (the app's rules, a source, an AI draft,
  or you), why, and exactly what went in and came out. Steps are
  append-only and hash-chained. Design: `system-design.md` 3.9–3.10.
  Prototype: `research-prototype.html`.

## Paper Trail: one panel, source tags, source filter

Decided by Ony, 6 October 2026: "I want them to be all the other services in one panel. And entities can simply have tags saying where they came from … And we can use that tag to manipulate the data if we want to filter by source."

- **One panel, "Paper Trail"** (name chosen by Ony, 7 Oct 2026). It replaces "OpenAleph corpus" and "External connectors". It holds every source's status (your documents, OpenAleph, OpenSanctions, the outside Aleph server, Firecrawl, the planned free registries), one queue of matches and findings from all of them, records by source, what stands out, the watchlist, and the send-outs to OpenAleph. Prototype: the Paper Trail tab of `screens-prototype.html`.
- **Source tags.** A record's tags are the sources of its facts. Nothing new is stored: every fact is a `Statement` with a `dataset` (`document:<id>`, a connector's dataset name, or the reporter's entry), and relationships and findings carry the same. A fixed map turns dataset values into source names; facts found through OpenAleph cross-references, lookups and the crawler get their source's dataset name when they are accepted.
- **Source filter, everywhere.** One filter (any number of sources; "all" by default) on search, the network charts, the timeline, the dossier, the chart builder, the Paper Trail queue and exports. The API takes `sources=` on those endpoints and filters on statement datasets, so "only what OpenSanctions and the registry filing say" is one control on any page.
- **Open question for Ony:** when the filter is on, does a record show only its facts from the chosen sources, or all its facts with the chosen ones lit?

## Names

Decided by Ony, 7 October 2026: a few main features get reporters' names; everything else keeps a plain name, so nobody has to learn slang to find things.

- **Paper Trail**: the one panel for every source (above).
- **Red Flags**: the pattern panel ("dig here next" until now).
- **The Drop**: where documents are added and read, and their proposals reviewed (today's "Document ingestion" and bulk import), chosen by Ony the same day.
- **Chain of Custody**: following one fact back to its document (today's "Provenance trace"), kept apart from Paper Trail, which covers every source at once.

## Ony's answers, 8 October 2026

Decided:

- **Build order** as listed below; each step ends with tests, the full check and screenshots.
- **The app is the Workbench.** Everything in it is a tool or feature of the Workbench; there is no separate "workbench page".
- **Paper Trail holds every source.** There is no OpenAleph-only panel; every possible source is available there.
- **The chart builder sits inside Data visualization.**
- **Type of investigation:** the app fills it in from the records; the reporter can change it at any time.
- **Research automation has three settings:** identify and research without approval; identify and ask for approval before researching; off.
- **Several people on one investigation** is not built and is needed: it must be planned (accounts, roles, who changed what, shared settings and lookups).
- **Every Red Flag uses a graded scale,** not only the mass-officer one (Ony, 8 Oct: there will be many flags, drawn from the whole history of this kind of detection): caution when a pattern appears, danger when it looks serious, confirmed when it meets the published threshold (for mass officers, Global Witness's more than 100 appointments). Each flag's levels come from its source.
- **Every link waits for a person.** No automatic linking at any score; the match confidence is always shown.
- **AI is an investigative journalist's assistant:** it may manage the investigation, report findings, ask for guidance and clarification, and do other relevant tasks. Everything it does goes into the research trail. (This replaces assumption A3 in research-design.md and question 6 in system-design.md; the design for it is still to be written.)
- **Chart builder canvas:** React Flow (ADR-0005 line 7 amended).
- **Design files:** import and export only; no shared gallery for now.
- **Settings like the research switch are chosen in a first-run tutorial** that asks the reporter how they want each one.
- **A connection the reporter draws records intent, not fact:** the reporter believes the two are connected. As the investigation goes on, evidence either fills it in or it stays empty.
- **The "design saved" event is kept.**
- **Diagram pictures:** whichever is best long term (see chart-builder-system-design.md, T3).
- **No live co-editing for now.**
- **Device sync:** delete permission for the git lock files, and running npm install and pip install on Ony's computer, are approved.

Still open: the chart rules question (Ony asked where the rules come from), undo (plain history or zundo), and the research-run question (Ony asked what it meant).

## Build order

1. **Page structure and colour roles across every page.** Search redesign.
   Tags, notes and collections.
2. **Network redesign** (agreed) with the radial view, plus overlays and
   the shared year slider.
3. **Pattern engine** with the patterns computable from today's records,
   and the "Red Flags" panel.
4. **Router, lookups and crawler** (ADRs for the new packages first), then
   research runs and the research pages.
5. **Patterns that need looked-up data.** Saved views and story mode.
   Dashboard and review page.

Each step: tests, the full check gate, screenshots to Ony.

## Sources

- Research notes with every URL: `sources.md` (data sources and the
  router), `patterns.md` (red-flag patterns), `tools.md` (crawlers,
  matching, graph tools).
- Design theory carried over from the chart passes:
  - Munzner 2014, ch. 5
  - MacEachren et al. 2012
  - Shneiderman 1996
  - Becker & Cleveland 1987
  - Furnas 1986
  - Yee et al. 2001
  - Holten & van Wijk 2009
  - Christ 1975
  - Palmer 1992
