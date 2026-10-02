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
| Match decisions | `POST /profiles/_pairwise` | A reporter's same/different decision on a cross-reference is also recorded in OpenAleph, so its profiles agree with the Workbench | Wave B |
| Neighbours | `GET /entities/{id}/expand`, `/nearby` | "Expand in the corpus" on a dossier; neighbours become relationship proposals | Wave B |
| Match against everything indexed | `POST /match` | Part of the possible-duplicate check when an entity proposal is reviewed | Wave B |
| Lists, diagrams, timelines | `/entitysets` (`list`, `diagram`, `timeline`) | Export the relationship graph and the timeline as an OpenAleph diagram and timeline; save working sets as lists | Wave C |
| Watchlists | `/alerts`, `/notifications` | A watchlist of names re-checked as documents arrive; new hits become leads | Wave C |
| Spreadsheets to entities | `/collections/{id}/mappings` | Map a ledger's columns to Payment/Company entities; results arrive as proposals | Wave C |
| Translation | ftm-translate (`5.3.0-argos`/`-apertium`), deferred by ftm-analyze when `FTM_TRANSLATE_TARGET_LANGUAGE` is set | Optional compose profile `translate`; the document view shows `translatedText` beside the original | Wave C |
| Collection insights | `GET /collections/{id}/discover` | Significant names and terms as suggested leads | Wave C |

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
