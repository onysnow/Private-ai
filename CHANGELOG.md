# Development changelog

Chronological development journal for Journalism Workbench, DEV 0.7 through DEV 1.24. For the product overview, architecture, and how to run it, see the root [README.md](README.md).

# Journalism Workbench

**Current build: DEV 1.24 — Clean-install recovery baseline**

DEV 0.83 carries preferred post-merge relationship reconciliation into the interactive graph and entity dossier. Reviewed secondary edges are collapsed by default for a clean investigative view, while an explicit expansion control restores every underlying edge and its independent provenance.

A runnable investigative-journalism MVP built around FollowTheMoney concepts, evidence provenance, and external research connectors.


## Integrated non-AI stack milestone (DEV 0.86)

The root Docker Compose definition now includes the actual OpenAleph service family alongside Workbench: OpenAleph PostgreSQL, Elasticsearch, Redis, `ingest-file`, `ftm-analyze`, OpenAleph worker/API, and Aleph UI. Workbench keeps a separate PostgreSQL database for reporter-specific evidence/claim/workflow state and talks to the local OpenAleph API as the corpus platform. AI remains disabled.

`GET /api/integrations/openaleph/status` now distinguishes a configured integration from a genuinely reachable OpenAleph search API. `GET /api/capabilities` reports OpenAleph separately from external Aleph/OpenSanctions connectors.

This environment could not run Docker, so the Compose topology and backend integration contracts are tested, but an actual OpenAleph container boot is still an external gate. See `ECOSYSTEM_INTEGRATION_AUDIT.md` for the OpenAleph/FollowTheMoney/SHATTERED ownership decisions.

## Core preview milestone (DEV 0.85)

The application is intentionally runnable without any local or cloud language model. AI remains an optional future layer. The core preview covers the reporter workflow from investigation/document ingestion through reviewed entities, exact evidence, claims, FollowTheMoney relationships, dossiers/graph, timeline, leads/tasks, provenance, connector review, and portable backup.

Use `GET /api/capabilities` to confirm the running instance is in `core_preview` mode. The zero-Node Windows launcher continues to serve the local FastAPI UI at `http://127.0.0.1:8000`; Docker developer mode exposes the Next.js UI at `http://localhost:3000`.


## Windows: easiest way to run

1. Extract the source archive to a normal writable folder (do not run it from inside the archive).
2. Double-click **Start Journalism Workbench.bat**.
3. The launcher requires Python 3.12, creates a private `.venv`, installs the exact local requirements, and verifies the imports used by the application before marking setup complete.
4. The app opens automatically at `http://127.0.0.1:8000`.
5. Your local database is stored as `backend/journalism.db`.

If Python 3.12 is missing and Windows Package Manager (`winget`) is available, the launcher attempts to install Python 3.12 automatically. It intentionally does not select an arbitrary newer `py -3` runtime. If dependency setup fails, review `journalism-workbench-setup.log` and run **Repair Journalism Workbench.bat** after correcting the reported problem.

To stop it, close the launcher window or double-click **Stop Journalism Workbench.bat**.

## Current features

- Persist connector runs and structured findings with raw provider payloads
- Human identity resolution (same / different / unsure) plus preview-first, audited canonical merges
- Statement-level assessments: accepted, conflicting, outdated, superseded, unresolved
- Explicit promotion of accepted statements into canonical FollowTheMoney entities
- Promotion audit records preserve provider, dataset, source URL, original value, assessment, reporter note, and timestamp
- Aleph structured API attempt with safe web-search fallback

- Create and manage investigations
- Create FollowTheMoney entities and provenance-bearing statements
- Save sources
- Track claims and their verification status/confidence
- Search Aleph and save results as leads rather than verified facts
- Local SQLite mode requiring no PostgreSQL or Node.js
- Docker/PostgreSQL/Next.js development stack retained for later expansion
- Modular connector architecture for OpenSanctions, SEC, campaign finance, public records, crawlers, and other sources

## Docker developer mode

Double-click **Start with Docker.bat**, or run:

```bash
docker compose up --build
```

The Workbench Next.js UI is intended at `http://localhost:3000`, Workbench API docs at `http://localhost:8000/docs`, local OpenAleph API at `http://localhost:8001`, and the OpenAleph UI at `http://localhost:8080`. The full container stack has not yet been boot-tested in this execution environment.

## Aleph access

The Aleph connector first attempts the structured `/api/2/search` endpoint at the access level available to the configured account. If structured access is unavailable, it falls back to a navigable web-search lead and does not scrape presentation HTML into canonical facts. Set `ALEPH_API_KEY` in `.env` to use authenticated access when available.

## Evidence philosophy

External database matches enter the system as leads. Identity resolution and statement assessment remain non-destructive. Only an explicit promotion action can add an accepted external value to the canonical FollowTheMoney entity; each promotion creates a provenance-bearing statement plus an immutable audit record tied to the source finding and assessment.


## MVP 0.7: provenance and conflict history

Canonical entities now expose `/api/entities/{entity_id}/statement-history`, an evidence ledger that groups each FollowTheMoney property/value with canonical statements, reviewed external assertions, source links, provider/dataset provenance, promotion state, and support/conflict counts. This keeps contradictory or superseded evidence visible instead of flattening it into the canonical graph. Both the Next.js workbench and the local FastAPI UI display this ledger during finding review.

## OpenSanctions connector (0.7)

OpenSanctions is the first second-provider validation of the modular connector architecture. Configure `OPENSANCTIONS_API_KEY` in `backend/.env`; hosted API requests use `Authorization: ApiKey …`, search the configured dataset (default: `default`) through `/search/<dataset>`, and preserve the returned FollowTheMoney properties plus raw record in the same review queue as Aleph. Missing credentials fail explicitly rather than scraping the public website into evidence.

Environment variables: `OPENSANCTIONS_BASE_URL`, `OPENSANCTIONS_API_KEY`, `OPENSANCTIONS_DATASET`, and `OPENSANCTIONS_SEARCH_LIMIT`.


## MVP 0.10: canonical-entity enrichment

Canonical FollowTheMoney entities can now drive connector lookups directly through `POST /api/entities/{entity_id}/enrich/{provider}`. OpenSanctions uses its native `/match/<dataset>` query-by-example endpoint and submits the entity schema plus canonical properties. Connectors that do not implement native matching fall back to a conservative query composed from trusted names, aliases, identifiers, jurisdiction, country, and address. Results are persisted as ordinary `ConnectorFinding` records and still require identity resolution, statement assessment, and explicit promotion before entering the canonical evidence graph.

OpenSanctions match scores and match metadata are preserved inside the raw finding payload under `_match` for later reviewer-facing scoring/explanations. Entity-driven enrichment never auto-promotes provider data.


## Multi-provider enrichment sessions (0.9)
A canonical FollowTheMoney entity can now be enriched across multiple registered connectors in one auditable session. Each provider receives its own ConnectorRun and EnrichmentSessionRun, so partial failures do not erase successful results. The session records provider status, errors, result counts, and total findings while all returned records continue through the existing human review, assessment, promotion, and provenance workflow.


## Cross-provider consolidation (0.10)
Multi-provider enrichment sessions now compare findings returned by different providers without merging source records. Candidate clusters are scored using FollowTheMoney schema compatibility, names/aliases, strong identifiers (registration, tax, LEI, ISIN and other IDs), and contextual properties such as jurisdiction, address, and dates. Reporters can mark a cluster as the same external entity, different entities, or unsure. These decisions are stored separately in `cross_provider_decisions`; they do not alter connector findings or canonical entities.


## FollowTheMoney relationship graph (0.11)
Canonical investigations now support first-class FollowTheMoney relationship entities for `Ownership`, `Directorship`, `Membership`, `Employment`, and `UnknownLink`. A relationship is not flattened into an application-only edge: the workbench creates the corresponding FtM interstitial entity with native entity-reference properties (`owner`/`asset`, `director`/`organization`, `member`/`organization`, `employee`/`employer`, or `subject`/`object`) and provenance-bearing statements for every relationship property.

The application keeps a lightweight `relationship_edges` index to make graph queries efficient while the FtM relationship entity remains the canonical evidence object. `GET /api/investigations/{investigation_id}/graph` returns endpoint nodes plus canonical relationship edges, and `GET /api/entities/{entity_id}/relationships` returns incoming/outgoing relationship context. Relationship entities remain directly addressable for statement history and provenance but are excluded from ordinary entity/enrichment selectors unless `include_relationships=true` is requested.

## MVP 0.12 — external relationship review

Connector findings whose FollowTheMoney schema is `Ownership`, `Directorship`, `Membership`, `Employment`, or `UnknownLink` now use a relationship-specific review path. Provider endpoint IDs are preserved, corresponding endpoint findings are located within the same provider/investigation, and canonical entity candidates are scored independently for each endpoint. A reporter can mark the external relationship supported, conflicting, unresolved, or rejected. Only a supported review with both canonical endpoints can be explicitly promoted. Promotion creates a canonical FollowTheMoney relationship entity and graph edge while copying only non-endpoint relationship properties (for example role, percentage, start/end dates) and preserving connector dataset/source provenance on the resulting statements. External records are never merged or rewritten.


## Investigation-scoped authorization (0.64)

The local workstation remains a single-owner, unrestricted mode. Remote shared-bearer access can now be narrowed to a comma-separated investigation allowlist with `API_AUTH_INVESTIGATION_IDS`. When an allowlist is configured, routed reads resolve entity/source/document/claim/lead/connector resources back to their investigation and fail closed outside the allowed set. Global investigation listing and search are filtered to the visible investigations.

Write authorization is also enforced at SQLAlchemy flush time, not only in individual HTTP routes. This prevents a future route or service mutation from silently writing into another investigation because it forgot a route-specific authorization check. The current shared-bearer model is still not a substitute for real user identities and roles; multi-user deployment remains blocked until those are implemented.


## Persisted remote identities

The local workstation owner can create remote API identities under `Settings > Security` API routes. Journalism Workbench generates a bearer token once and stores only its SHA-256 digest. Memberships are per investigation with `viewer`, `reporter`, or `admin` roles. Viewers can read scoped investigations but ORM-level write authorization prevents them from persisting canonical changes. Reporters can write within assigned investigations. Global administrators are unrestricted. The legacy `API_AUTH_TOKEN` shared bearer remains supported for backward compatibility.


## Token lifecycle and remote-user controls (0.66)

Persisted API identities now have explicit bearer-token lifecycle metadata and local-owner controls. Authentication records last successful use; revoked credentials are rejected; local security management can disable or re-enable an identity, rotate its bearer token, or revoke the current token. Rotation returns plaintext only once, stores only the replacement SHA-256 digest, clears prior revocation state, and invalidates the old credential immediately. User listings expose lifecycle timestamps and status but never the bearer token or digest.


## OCR runtime observability (0.68)

`GET /api/settings/status` now reports the configured PDF OCR settings and live Tesseract language-data readiness. The response includes whether OCR is enabled, language, DPI, native-text threshold, tessdata path, requested/missing language packs, and any runtime detail. This makes scanned-document ingestion failures diagnosable before evidence is promoted, while OCR-derived chunks continue to carry explicit `page N (OCR)` provenance locators.

## Destructive-action authorization (0.67)

Investigation lifecycle operations now have a stricter authorization tier than ordinary reporting writes. A `reporter` can continue creating and editing investigation content but cannot delete the investigation itself. Deletion requires the per-investigation `admin` role (or the unrestricted local owner/global administrator). Backup restore is globally destructive because it creates an investigation from an external archive and is therefore restricted to the local owner or a persisted global administrator. Restore remains disabled unless `ENABLE_RESTORE_API=true`.

## Exact relationship evidence provenance (0.69)
Canonical FollowTheMoney relationship edges can now reference a specific evidence record. The backend validates that the evidence belongs to the same investigation and graph/dossier responses expose the exact quote, locator, and source alongside statement provenance. The relationship editor can attach an existing evidence record and the edge inspector can trace it back through the normal provenance workflow.


## Search-to-provenance navigation (0.76)

Internal investigation/global search now emits explicit `trace_record_type` and `trace_record_id` provenance targets for canonical entities, statements, sources, evidence, claims, documents/chunks/extraction proposals, reporting leads, reporting tasks, relationships, and traceable timeline events. The Next.js search result action uses those targets instead of guessing from the result type. Reporting leads are now first-class unified provenance roots, exposing their linked claims, evidence, sources, entities/relationships, triage context, and reporting tasks without promoting or changing any record. External connector findings remain leads/review material and do not receive a canonical trace target merely because they matched a search query.


## Deterministic search ranking and evidentiary grouping (0.77)

Search now distinguishes an exact or leading match in a record's primary human-facing field from a phrase buried in metadata. The database-agnostic scorer behaves the same on SQLite and PostgreSQL, adds deterministic tie-breaking, and reports the full match count separately from the returned limit. Results carry an explicit evidentiary group (`canonical`, `evidence`, `reporting`, `workflow`, `review`, or `external_lead`), with group/type counts calculated across the full match set. The Next.js search panel renders those groups separately and labels external/Aleph results as review-required leads; connector findings still receive no canonical provenance trace target until human review/promotion.


## Canonical entity duplicate review (0.78)

Canonical entities now have an explicit duplicate-review workflow. `/api/entities/{id}/duplicate-candidates` proposes same-investigation candidates while excluding FollowTheMoney relationship/interstitial entities. `/api/entities/{id}/canonical-resolution` records immutable reporter decisions (`same`, `different`, `unsure`) with confidence and rationale. A positive review does **not** automatically merge records; both canonical entities and their provenance remain intact until a future explicit merge operation can safely remap every dependent record. The dossier UI exposes the candidate queue and latest decision. Canonical-resolution decisions are included in portable export/backup and restore.


## Preview-first canonical entity merge (0.79)

Canonical duplicate review can now proceed to an explicit merge without silently discarding provenance. `GET /api/entities/{id}/merge-preview?target_entity_id=...` enumerates dependent references and computes a digest over the exact merge state. Execution requires the latest identity decision to be `same`, no blockers, and the matching fresh preview digest. Known relationship/review self-loop collapses are blockers. A successful merge remaps supported dependent references in one transaction, marks the source record as a merged alias rather than deleting it, and writes an immutable `canonical_entity_merge_audits` snapshot containing the preview and moved counts. Merge audits participate in portable backup/restore. The dossier UI exposes the required review → preview → execute sequence.


## Reconciled graph and dossier presentation strengthened in 0.83

- The investigation graph collapses only reporter-reviewed secondary duplicate relationship edges by default.
- Preferred edge records expose how many reviewed duplicates are hidden beneath them; no underlying relationship entity or provenance statement is deleted.
- `include_reconciled_duplicates=true` restores every reviewed duplicate edge for audit and side-by-side inspection.
- Entity dossiers use the same compact preferred-edge presentation and report both visible and underlying relationship counts.
- Lead and timeline matching still considers all underlying relationship records, preventing compact presentation from hiding workflow context.
- The Next.js graph exposes a reporter-controlled toggle to expand reviewed duplicate edge copies and labels preferred/secondary records explicitly.

## Local AI reasoning boundary (DEV 0.84)

`POST /api/investigations/{investigation_id}/assistant/context` accepts a question and returns a bounded, provenance-bearing retrieval packet. Canonical records, exact evidence, reporting records, workflow records and review proposals are grouped separately from `external_leads`. Connector findings (including Aleph) are never emitted as factual citation candidates merely because they match the question.

See `STACK_OWNERSHIP.md` for the core architectural rule: maintained FollowTheMoney/OpenAleph ecosystem components own commodity data/ingestion/resolution/search plumbing; Journalism Workbench owns the reporter-specific evidence, verification, provenance, workflow and local reasoning layer.


## OpenAleph corpus bridge (DEV 0.87)

DEV 0.87 moves local OpenAleph from service topology into the document workflow. Workbench investigations now persist a one-to-one provider binding to an OpenAleph collection using the maintained `openaleph-client` library. Documents can be synchronized to that collection with stable Workbench foreign IDs and SHA-256 metadata while Workbench retains reporter-specific evidence, claim, verification, relationship, lead, and provenance state.

`OPENALEPH_AUTO_SYNC_DOCUMENTS=true` is enabled for the integrated Docker backend. Standalone/local preview mode keeps it off by default so a missing OpenAleph instance never blocks reporter access to Workbench. Failed corpus synchronization is recorded as retryable integration state; the Workbench source document is not discarded.

New inspection/actions:

- `GET /api/investigations/{investigation_id}/corpus/openaleph`
- `POST /api/investigations/{investigation_id}/corpus/openaleph/ensure`
- `GET /api/documents/{document_id}/corpus/openaleph`
- `POST /api/documents/{document_id}/corpus/openaleph/sync`

The bridge uses OpenAleph for generic corpus ingestion/indexing rather than expanding the legacy custom extractor. The legacy extractor remains transitional compatibility code until a live OpenAleph stack can be exercised end-to-end.

## OpenAleph review bridge (DEV 0.88)

DEV 0.88 adds the first inbound corpus-to-reporter path. After a Workbench document is synchronized to OpenAleph and has a provider document ID, Workbench can query that document's FollowTheMoney `Page` entities and stage their extracted text as **review-required evidence candidates**.

```text
Workbench document
  -> OpenAleph / ingest-file
  -> FollowTheMoney Page entities
  -> Workbench extraction candidates (proposed)
  -> reporter accept/reject
  -> Evidence with exact OpenAleph provenance
```

Nothing returned by OpenAleph is silently promoted into reporter evidence. The import records the collection ID, parent OpenAleph document ID, page entity ID, schema, extraction method, and stable Workbench locator. Re-running the import is idempotent.

Endpoint:

`POST /api/documents/{document_id}/corpus/openaleph/import-evidence`



## OpenAleph review orchestration (DEV 0.90)

DEV 0.90 turns the separate provider sync/import endpoints from 0.87–0.89 into a reporter-visible document workflow. `GET /api/documents/{document_id}/corpus/openaleph/review-status` reports the corpus binding, provider-document synchronization, and provider-derived Page/Mention candidates by review state. `POST /api/documents/{document_id}/corpus/openaleph/refresh-review` idempotently refreshes both OpenAleph Page evidence proposals and `ftm-analyze` Mention entity proposals without auto-accepting either.

The Next.js document panel now exposes OpenAleph status, explicit synchronization, combined review refresh, and counts for provider candidates awaiting/accepted/rejected by the reporter. This keeps the intended boundary visible in the normal product path: provider extraction -> proposed review material -> reporter decision -> canonical/evidentiary records. Duplicate Mention rows returned by the provider are suppressed within the same refresh as well as across repeated refreshes.

## OpenAleph entity review bridge (DEV 0.89)

DEV 0.89 adds the review-preserving inbound entity boundary for `ftm-analyze`. After a document is synchronized to OpenAleph, Workbench can query its FollowTheMoney `Mention` entities and stage names/schema predictions as `entity` extraction candidates. `Mention.resolved` is retained only as provider metadata; it never silently creates a canonical merge or identity decision. Reporter acceptance creates the Workbench entity and records provider-level statement provenance.

Endpoint: `POST /api/documents/{document_id}/corpus/openaleph/import-entities`.

## Integrated extraction ownership (DEV 0.91)

DEV 0.91 removes the first intentional duplicate generic extractor from integrated mode. The Workbench local proper-name detector remains available as a standalone fallback, but the Docker/OpenAleph topology now sets `ENABLE_LOCAL_ENTITY_SUGGESTIONS=false`, making OpenAleph/`ftm-analyze` the owner of generic entity detection in integrated deployments. Workbench still owns reporter review, canonical identity decisions, exact provenance, claims, relationships, dossiers, graph/timeline, and leads.

The settings status endpoint now exposes both `local_entity_suggestions_enabled` and `entity_extraction_owner`, and the Next.js local settings panel shows the active owner. This makes the extraction boundary inspectable rather than implicit. Locator-preserving local text extraction and claim/evidence proposals remain temporarily available until the live OpenAleph document gate can be exercised on a Docker-capable host.


## Compact reviewed-duplicate provenance (DEV 0.93)

When post-merge review marks relationship edges as duplicates and selects a preferred presentation record, the compact graph and entity dossier now expose a read-only provenance inventory across all preserved duplicate edges. This includes the underlying relationship IDs, statement dataset/origin fingerprints, and every exact evidence/source record attached to those edges. The underlying records are not merged or deleted; `include_reconciled_duplicates=true` still returns them independently for audit.
