# ADR-0006: Use OpenAleph in full

**Status:** Proposed (2026-10-02; built overnight under Ony's instruction to integrate every major part of OpenAleph; Ony accepts or changes each line)
**Date:** 2026-10-02
**Deciders:** Claude, at Ony's request ("I don't want to accidentally not integrate major portions of ... OpenAleph")
**Builds on:** ADR-0004 (OpenAleph owns the document corpus; the Workbench owns reporter decisions)

## Context

ADR-0004 made OpenAleph the corpus platform. On 2026-10-02 the Workbench used
five of OpenAleph's roughly 100 API routes: create a collection, upload a file,
read a document and its pages, search for `Mention` entities, and read one
entity. Everything below was checked against OpenAleph 5.3.1 itself on
2026-10-02, not against its documentation:

- **Routes:** read from the route decorators in `aleph/views/*.py` inside the
  `ghcr.io/openaleph/openaleph:5.3.1` image.
- **Pipeline:** `ingestors/tasks.py` and `ingestors/manager.py` in
  `ingest-file:5.3.1`; `ftm_analyze/tasks.py` and `settings.py` in
  `ftm-analyze:5.3.1`; `openaleph_procrastinate/settings.py`.
- **Live probe:** a three-line memo uploaded to a fresh collection on the
  sandbox stack, with the job queue and the resulting entity read back.

### Finding: name-finding never ran

ingest-file only hands a document to ftm-analyze when the entity it emits
carries text (`should_analyze` in `ingestors/tasks.py`). But
`OPENALEPH_PROCRASTINATE_DEHYDRATE_ENTITIES` defaults to `true`
(`openaleph_procrastinate/settings.py`), and with it on, the manager emits a
stripped "file entity" without its text (`Manager.emit_entity`). So no
document was ever analysed: the `analyze` queue held zero jobs after every
ingest. That is why ADR-0004's live run "found no mentions".

With the flag set to `false` on the ingest service, the same memo was analysed
in seconds:

| Found | Values |
|---|---|
| `peopleMentioned` | jane doe, angela merkel, emmanuel macron |
| `companiesMentioned` | meridian holdings ltd |
| `emailMentioned` | jane.doe@meridian.example |
| `phoneMentioned` | +442079460958 |
| `detectedLanguage` | eng |
| `detectedCountry` | gb |

OpenAleph 5.3 writes these as `*Mentioned` properties on the document. It
creates no `Mention` entities unless juditha resolution is configured, so the
Workbench's search for `Mention` entities could never find anything.

### Checked while building Wave A (2026-10-02)

- **Emails are never analysed by ingest-file.** Its `should_analyze` skips
  every schema that is a `Folder`, and `Email` is one; it only writes the
  sender's and recipients' names and addresses (`namesMentioned`,
  `emailMentioned`) from the headers (`ingestors/support/email.py`).
  ftm-analyze does analyse an email when asked (its `SKIP_NER` lists Folder,
  Package, Table and Workbook by name), so the Workbench asks for it with
  `POST /entities/{id}/analyze`.
- **IBANs printed in groups are not detected.** ftm-analyze's `IBAN_REGEX`
  (`analysis/patterns.py`) needs seven digits in a row after the bank code,
  so `GB82WEST12345698765432` is found and `GB82 WEST 1234 5698 7654 32` is
  not. Where both forms of one number occur, the Workbench finds both; an
  IBAN that appears only in grouped form is not proposed (the Workbench adds
  no detector of its own, decision 5 of ADR-0004). The live test pins this.
- **Short names are dropped.** ftm-analyze keeps names of 8 to 100
  characters (`extract/base.py`), so places such as "Paris" or "London" are
  not reported as `locationMentioned`.
- **Page entities are not analysed** (`Page` is not `Analyzable`); a PDF's
  names are on its `Pages` document, and the Workbench locates each one on
  its page.
- **The image has fifteen spaCy models**, not only English (correcting the
  table below): `SpacyNerModels` lists one small model per language and all
  are installed in `ftm-analyze:5.3.1`.
- **Collection status counts only a collection with work in hand.**
  `GET /collections/{id}/status` returns openaleph-procrastinate's
  `DatasetStatus`: job counts per batch and queue while any job of the
  collection waits or runs (`STATUS_SUMMARY_ACTIVE` in
  `manage/sql.py`), finished jobs included; an idle collection answers
  zeros and no batches. The Workbench's reading progress
  (`GET /api/investigations/{id}/corpus/status`) therefore lists stages
  only while OpenAleph works, and asks again every three seconds until it
  is idle.
- **What ingest-file reads is read from the image, not listed by hand.**
  `tools/openaleph_ingest_formats.py` asks the ingestor registry inside
  `ghcr.io/openaleph/ingest-file:<tag>` (servicelayer's
  `get_extensions("ingestors")`, which `Manager.auction` uses) for each
  ingestor's score and the MIME types and extensions it claims, normalised
  as `Ingestor.match` normalises them, and writes
  `backend/app/services/openaleph_formats.py`. The upload check runs the
  same auction: the highest score among the ingestors claiming a file wins.
  5.3.1 has 37 ingestors; a file whose auction `IgnoreIngestor` wins
  (executables, fonts, keys, `.log` files, which it outbids plain text for)
  is refused, since OpenAleph would store it without reading it. A test
  fails when the compose files move to another ingest-file tag without the
  list being generated again.
- **RAR archives match by extension only.** `RARIngestor.MIME_TYPES` in
  `ingestors/packages/rar.py` is `['application/rarapplication/x-rar']`: a
  missing comma joins the two types into one that matches nothing, so only
  `.rar` selects it.
- **Files inside a container are its children.** A zip becomes a
  `Package`; a directory in it a `Folder` (no file of its own); each file a
  document whose `parent` is that folder or the package; an email's
  attachments have the `Email` as parent. They are listed with
  `GET /search?filter:properties.parent=<id>` and their bytes come from
  `GET /archive/resolve?entity=<id>&redirect=false`, which answers a signed
  link to `/api/2/archive` built on OpenAleph's public address; the
  Workbench follows that path on the address it reaches OpenAleph at. A
  container's status turns `success` before its files are read (each is a
  job of its own), so the Workbench waits until the collection has no
  reading, name-finding or indexing work left. Each file becomes a
  Workbench document with `parent_document_id`, read by a job of its own
  so it can be retried alone; a workbook's sheets (`Table` entities, no
  file of their own) are not included.
- **Search finds pages only when asked.** `GET /search` returns whole
  documents (a PDF as its `Pages` entity) unless `filter:schemata` names
  `Page` as well; then the matching page comes back too, with its `index`
  and its `document` (nested as an entity in a search reply). The
  Workbench asks for `Document` and `Page`, shows a document by the page
  that matched, and links every hit to its Workbench document; snippets are
  OpenAleph's highlights (`<em>` around each match, HTML-escaped text),
  turned into plain pieces so nothing is rendered as markup.
  `GET /entities/{id}/more_like_this` gives similar documents, filtered to
  the investigation's collection.
- **A message nothing replies to has no thread.** `GET /entities/{id}/thread`
  answers no results for it (its docstring says the source is included);
  the Workbench says "no other message in this email's thread".
- **A file only OpenAleph reads waits for OpenAleph.** When OpenAleph
  cannot be reached, a PDF, Word file or text file falls back to the
  Workbench's own reader as before; an email, archive, spreadsheet or image
  fails its read with "needs OpenAleph to read; retry when it is running",
  and the read can be retried from the document row.

## Decision: what each part of OpenAleph does for the Workbench

Every capability goes through the review layer: nothing OpenAleph suggests
becomes a fact until a reporter accepts it (ADR-0004, decision 1).

| OpenAleph capability | Route or service | Workbench use | Status |
|---|---|---|---|
| Read any file: text layers, OCR, office formats, archives, email | `POST /collections/{id}/ingest`, ingest-file | Every upload. Accept every format ingest-file reads while OpenAleph is up; the Workbench's own reader keeps its narrower list as the fallback | Wave A |
| Archive and email children | ingest-file emits child documents (`parent`) | Each child becomes its own Workbench document under its parent, read and reviewed like any other | Wave A |
| Names, companies, places, emails, phones, IBANs | ftm-analyze (`*Mentioned` properties) | Proposals in the review queue. Original spelling and character positions come from the document text. Names → Person/Company/Address proposals; IBANs → BankAccount; emails and phones → "which entity does this belong to?" proposals. The Workbench's pattern name-finder runs only when analysis gave nothing (ADR-0004 item) | Wave A |
| Analysis on demand | `POST /entities/{id}/analyze` | Re-run analysis for a document read before this change | Wave A |
| Full-text search with highlights | `GET /search` | A "Documents in the corpus" group in investigation search, each hit linked to its Workbench document and page | Wave A |
| Similar documents | `GET /entities/{id}/similar`, `/more_like_this` | "Similar documents" on a document | Wave A |
| Email threads | `GET /entities/{id}/thread` | The thread beside an email document | Wave A |
| Collection processing status | `GET /collections/{id}/status` | Reading progress for the investigation's corpus | Wave A |
| Reporter-confirmed entities in the corpus | `POST /collections/{id}/_bulk` | Accepted entities and relationships are written to the investigation's collection (and updated or removed when they change), so OpenAleph's search, cross-referencing and diagrams see them | Wave B |
| Cross-referencing | `POST`/`GET /collections/{id}/xref` | Run after confirmed entities change; each match becomes a "possible same entity" proposal | Wave B |
| Match decisions | `POST /profiles/_pairwise` | A reporter's same/different decision on a cross-reference is also recorded in OpenAleph, so its profiles agree with the Workbench. So is a decision on two of the investigation's own records when OpenAleph proposed the pair (the dossier's duplicate review); once one of them is merged away, the push's removal replaces the judgement | Wave B |
| Neighbours | `GET /entities/{id}/expand`, `/nearby` | "Expand in the corpus" on a dossier; neighbours become relationship proposals | Wave B |
| Match against everything indexed | `POST /match` | Part of the possible-duplicate check when an entity proposal is reviewed: shown beside each name in the review queue (`GET /api/extraction-candidates/{id}/openaleph-matches`); a match in this investigation's collection can be chosen as "same as" its record, others link to OpenAleph, and matches in investigations the reader may not open are counted, not shown. The score is OpenAleph's relevance score, used only to rank (checked on the live 5.3.1 stack) | Wave B |
| Lists, diagrams, timelines | `/entitysets` (`list`, `diagram`, `timeline`) | Export the relationship graph and the timeline as an OpenAleph diagram and timeline; save working sets as lists: the corpus panel sends the records the collection already holds (the Wave B copy) as a diagram (every entity a vertex, every relationship an edge, in the editor's layout format: validation/schema/diagram.yml and aleph-ui 5.3.1's Vertex/Edge ids; new vertices placed by networkx's spring layout, a vertex the set already holds keeps its place), a timeline (every record with a FollowTheMoney start date) or a list (entities the reporter chooses). Sets are created without `entities`, which OpenAleph would upsert into the collection; each record is added as an item, and sending again updates the set, taking out only what the Workbench itself added. The Workbench's own timeline events are not sent: they are not part of the corpus copy, and OpenAleph would keep them after they changed here. Checked against OpenAleph 5.3.1 (tests/test_openaleph_live_corpus.py) | Wave C (built) |
| Watchlists | `/search` (not `/alerts`, `/notifications`) | A watchlist of names re-checked as documents arrive; new hits become leads: the corpus panel's "Watchlist" (`/api/investigations/{id}/watchlist`) searches each watched name in the investigation's collection after OpenAleph reads a new document of it (jobs/handlers.py) and on "Check now"; each document it turns up in is kept once, and the reporter makes it a lead (linked to the document's source) or dismisses it. OpenAleph's own alerts are not used: they are checked once a day (`periodic_daily`, cron `0 0 * * *`, aleph/procrastinate/tasks.py) and delivered to OpenAleph's single user across every collection, while a watchlist answers when a document arrives and stays inside its investigation (ADR-0002) | Wave C (built) |
| Spreadsheets to entities | FollowTheMoney's mapping engine (the format and engine behind `/collections/{id}/mappings`) | Map a ledger's columns to Payment/Company entities; results arrive as proposals: "Map columns to entities" on a CSV, TSV or XLSX document writes a FollowTheMoney mapping, previews the first rows, and runs it (`/api/documents/{id}/table-mappings`); each entity becomes an entity proposal (the same same-or-new identity step as any name) and each link a relationship proposal accepted after both its ends, with the spreadsheet row as its evidence. OpenAleph's endpoint is not called: it writes the mapped entities straight into the collection's aggregator (aleph/logic/mapping.py `map_to_aggregator`), so they would be in the corpus before a reporter reviewed them; the Workbench runs the same engine (`model.make_mapping`) and pushes what is accepted (Wave B) | Wave C (built) |
| Translation | ftm-translate (`5.3.0-argos`/`-apertium`), deferred by ftm-analyze when `FTM_TRANSLATE_TARGET_LANGUAGE` is set | Optional compose profile `translate`; the document view shows `translatedText` beside the original | Wave C |
| Collection insights | `GET /collections/{id}/discover` | Significant names and terms as suggested leads: the corpus panel's "What stands out" (`GET /api/investigations/{id}/corpus/insights`) lists the people, companies, places and other names with their document counts and what they are mentioned alongside; a known record opens its dossier, any other can be made a lead by the reporter (provider `openaleph`, `discover:<kind>:<name>`). OpenAleph keeps these names in lower case, so a label like "AS" comes back title-cased | Wave C (built) |

### Not used, and why

| Capability | Reason |
|---|---|
| Users, roles, groups, permissions, sessions, OAuth | The Workbench owns access (ADR-0002). OpenAleph runs in single-user mode behind it. |
| OpenRefine reconciliation (`/api/freebase/*`) | Meant for spreadsheet tools, not for the Workbench. |
| Bookmarks, tags | These are OpenAleph UI conveniences. The Workbench has leads and review notes. |
| Exports (`/exports`) | The Workbench has its own backups and write-ups. |
| Transcription (ftm-transcribe) | No published image (checked on ghcr.io, 2026-10-02). |
| Geocoding (ftm-geocode) | No published image (checked on ghcr.io, 2026-10-02). |
| Assets and vectors (ftm-assets, ftm-vectorize) | No published image (checked on ghcr.io, 2026-10-02). |
| GLiNER and Flair name-finding engines | Supported by ftm-analyze, but the 5.3.1 image ships only spaCy and its small models (fifteen languages; see "Checked while building Wave A"); `gliner`, `flair` and `transformers` are not installed. |

## Configuration changes

- **Ingest service** in both compose files: `OPENALEPH_PROCRASTINATE_DEHYDRATE_ENTITIES: "false"`. Job payloads then carry document text. That is larger, but it is the only way ingest-file defers analysis in 5.3.1.
- **Optional `translate` profile:** the ftm-translate worker, plus `OPENALEPH_TRANSLATE_DEFER: "true"` and `FTM_TRANSLATE_TARGET_LANGUAGE` on the analyze service.

## Consequences

**Easier:**

- Names, identifiers and languages come from one analyser, the one OpenAleph maintains.
- Cross-referencing covers both document mentions and reporter-confirmed entities.
- Every file type OpenAleph reads can be reviewed.

**Harder:**

- The Workbench keeps an id map between its records and OpenAleph entities, and must keep the collection in step when records change.
- Archives multiply documents.
- Each new OpenAleph release needs the pipeline check above repeated. A live CI run (ADR-0004) is what catches a regression like the dehydration one.

**Revisit when:** OpenAleph publishes geocode, transcribe or vectorize images, or its ftm-analyze image adds GLiNER.
