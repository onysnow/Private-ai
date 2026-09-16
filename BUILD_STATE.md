# DEV 1.24 clean-install recovery: the Windows source launcher no longer trusts the stale DEV 0.85 dependency marker or `py -3`. It explicitly requires Python 3.12, rebuilds an incompatible existing venv, uses a DEV 1.24 dependency marker, verifies every runtime import before declaring setup complete, preserves a setup log on failure, and aligns Repair with the same checks. FastAPI/package metadata and README current-build/setup guidance are updated. This is source-deployment recovery, not installer packaging.

# DEV 1.21 update: entity dossiers now expose the same mixed relationship-evidence assessment inventory used by graph/timeline/search, and each dossier relationship can directly open evidence review, create a reporting question/lead with the exact relationship/claim/evidence context preserved, or trace provenance. Full backend regression: 204/204 passed. Frontend production/typecheck remains unverified because dependencies are not installed in the persisted snapshot. No installer work performed.

# DEV 1.20 update: timeline propagation now exposes the canonical mixed relationship-evidence assessment inventory for both FollowTheMoney relationship-date events and reporter-authored events linked to a relationship. Central relationship advisories now include per-stance evidence-review counts. Full backend regression: 204/204 passed. No installer work performed.

# DEV 1.13 update: post-merge relationship reconciliation now compares the complete first-class evidence attachment inventory and statement-source provenance, not the legacy single evidence pointer. Full backend regression: 200/200 passed.

# DEV 1.11 update: downstream claim workspace, dossier relevance, and unified provenance now consume the first-class relationship evidence attachment inventory rather than the legacy single evidence pointer.

# DEV 1.09 update

- Added immutable reporter review events for evidence directly attached to canonical FollowTheMoney relationships.
- Relationship evidence can be classified as `supports`, `contradicts`, `context`, `superseded`, or `unresolved`; every review requires rationale and preserves prior decisions.
- Relationship serialization now exposes the latest direct-evidence assessment, complete review history, and a non-destructive advisory when direct evidence is unreviewed, contradictory, or unresolved.
- Reviews cannot be attached to unrelated evidence, preventing the UI/API from implying provenance that the canonical edge does not actually contain.
- Investigation export/restore now preserves relationship-evidence review history.
- Added Alembic migration `a83d7c1e9b42`.
- Full backend regression: 197/197 passed. Export/migration focused regression: 12/12 passed. Python compilation passed.
- No installer work performed.

# DEV 1.08 update

- Propagated challenged-claim advisories into entity dossiers and timeline contexts without mutating canonical relationships/events.
- Reconciled duplicate relationship presentations now aggregate preserved evidence and distinguish `mixed_independent_evidence`: a challenged supporting claim is disclosed while independently supported evidence remains visible.
- Dossier summaries count relationship review advisories and mixed-support relationships; Next.js graph, dossier, and timeline surfaces disclose when independent support remains.
- Focused claim/dossier/timeline regression: 15/15 passed. Full suite advanced past 36% before the runtime execution limit; no assertion failure was observed before timeout. Python compilation passed.
- No installer work performed.

# DEV 1.07 update

- Relationship graph serialization now exposes advisory claim dependencies for the exact evidence backing each edge.
- Disputed/rejected dependent claims flag graph edges for reporter review without deleting or rewriting canonical relationships.
- Next.js graph/list surfaces show the advisory warning.
- Full backend regression: 194/194 passed.

# DEV 1.02 update
- Added exact candidate character spans to local document extraction proposals (evidence, claims, entities).
- Accepted canonical entity statements now preserve document + chunk locator + character-span origin; extraction lineage exposes the same span without changing the underlying source text.
- Added regression coverage for source → chunk → candidate span → accepted entity → provenance continuity.
- Full backend suite: 191/191 passed. No installer work performed.

# DEV 1.01 update

Added evidence-linked temporal intervals to reporter `temporal_change` property adjudications. Explicit reporter-supplied YYYY/YYYY-MM/YYYY-MM-DD boundaries now surface in dossiers and the investigation timeline as `property_temporal_interval` events with exact evidence/source provenance. Missing dates are rejected rather than inferred. Added Alembic migration and regression coverage. Backend regression: **190 passed**. No installer work performed.

# DEV 1.00 update

Implemented immutable reporter adjudication for multi-value FollowTheMoney property conflicts. Dossiers can now record `preferred`, `superseded`, `temporal_change`, `both_valid`, or `unresolved` decisions with reviewed values, optional preferred value, rationale, and full decision history. Decisions are presentation/audit metadata only and never rewrite or delete canonical statements. Added API endpoints, dossier UI actions, export/restore coverage, and an Alembic migration. Backend regression: **189 passed**. No installer work performed.

# Journalism Workbench Build State — 0.91

## Status

Version: **0.91.0 / DEV 0.91**

This run continued from the complete DEV 0.83 FollowTheMoney-centered snapshot. No installer/package work was performed.

## Completed through 0.83

- Applied post-merge preferred relationship reconciliation directly to the investigation graph.
- Reviewed secondary duplicate FollowTheMoney edges are collapsed by default; the reporter-preferred edge remains visible.
- The graph API reports visible, underlying, and suppressed duplicate edge counts and annotates preferred/secondary records with reconciliation metadata.
- Added `include_reconciled_duplicates=true` to restore all underlying graph edges for audit and direct provenance inspection.
- Entity dossiers now use the same compact preferred-edge view while exposing underlying/suppressed relationship counts.
- Dossier lead and timeline matching deliberately continues across all underlying relationship records, so presentation collapse cannot hide reporting workflow context.
- The Next.js relationship graph adds an explicit “Show reviewed duplicate edge copies” control and labels preferred/secondary edge state.
- Added regression coverage proving graph collapse, graph expansion, dossier collapse, and direct provenance access to the hidden secondary edge.

## Verification

- Focused post-merge reconciliation regression: **7 passed, 0 failed**.
- Complete backend regression: **160 passed, 0 failed**.
- Complete backend regression against a fresh persistent file-backed SQLite database: **160 passed, 0 failed**.
- Python compilation for changed backend modules: **passed**.
- Strict TypeScript 5.8.3 check for API types/validators: **passed**.
- TypeScript syntax/transpilation validation of the modified Next.js page: **passed**.

## External gates still open

- Real PostgreSQL full-suite run and genuine multi-session contention/snapshot tests.
- Reproducible frontend lockfile plus successful `npm ci`, full typecheck, and production Next.js build.
- Actual Docker/Podman image build; no container runtime is available in this execution environment.

## Next highest-priority core basic

The highest-priority validation remains a **real PostgreSQL full-suite + concurrent-session run**. If PostgreSQL remains unavailable, the next product-level pass should strengthen graph provenance aggregation so a collapsed preferred edge can expose the combined evidence/source inventory of every reviewed duplicate beneath it without falsely merging the underlying records. Installer work remains deferred.

## DEV 0.84

- Added a provenance-bearing retrieval boundary for the future local AI investigator: `POST /api/investigations/{investigation_id}/assistant/context`.
- The retrieval packet separates canonical/evidence/reporting/workflow/review material from unverified external connector leads.
- External/Aleph findings are deliberately excluded from factual citation candidates until promoted or independently evidenced.
- Added a machine-readable reasoning contract telling downstream local models that missing evidence is unknown and connector leads are not facts.
- Added regression coverage for investigation scoping, citation preservation, lead segregation, and optional external-lead exclusion.
- Added `STACK_OWNERSHIP.md` as an architectural guardrail: generic corpus/search/ingestion/dedup/crawler mechanics should migrate to maintained FollowTheMoney/OpenAleph ecosystem components instead of being expanded as custom Workbench subsystems.
- Backend regression: 162/162 passing in normal test mode and 162/162 against a file-backed persistent SQLite database.

## DEV 0.85 — Core application preview before AI

- Reoriented the milestone around a fully usable non-AI core preview. AI is explicitly optional and disabled by default through `ENABLE_AI_FEATURES=false`.
- Added `GET /api/capabilities`; a running instance reports `mode=core_preview`, core functional areas, and whether optional AI features are enabled.
- Added an end-to-end non-AI smoke regression that uploads a real text document and exercises document -> extraction proposal -> reviewed evidence -> claim/evidence verification -> FollowTheMoney relationship with exact evidence -> search -> graph -> dossier -> provenance -> lead.
- Focused core-preview smoke regression: 2/2 passing.
- Complete backend regression after the change: 164/164 passing.
- Started the actual FastAPI server in this environment and verified `/`, `/api/health`, and `/api/capabilities` return HTTP 200. The served local UI was 49,562 bytes and did not require Node or AI.
- Fixed a real Windows preview blocker: `backend/requirements-local.txt` was stale and omitted `python-multipart`, document parsers, Alembic, and PyMuPDF even though the application imports/uses them. The local launcher now forces a fresh 0.85 dependency readiness marker.
- Updated the local fallback UI badge/description to Core Preview 0.85 and corrected the README build marker.
- Added `CORE_PREVIEW_TESTING.md` with the manual test path.
- npm lockfile retrieval was retried with Node 22.16.0/npm 10.9.2 and timed out again; no production Next.js build is claimed.

### Next highest-priority core basic

Run this exact core preview on real PostgreSQL and then validate the Next.js browser surface against the same smoke workflow. Do not add local-LLM reasoning until the non-AI workflow is comfortable to use end to end.

## DEV 0.86 — integrated OpenAleph boundary before AI

- Inspected the complete DEV 0.85 source snapshot and verified the previous root Docker Compose stack contained only Workbench PostgreSQL/FastAPI/Next.js; OpenAleph was not actually part of the local stack.
- Verified current OpenAleph 5.3.1 architecture against official docs/repository. The root Compose topology now includes separate OpenAleph PostgreSQL, Elasticsearch, Redis, `ingest-file`, `ftm-analyze`, OpenAleph worker/API, and Aleph UI services in addition to Workbench PostgreSQL/backend/frontend.
- Workbench and OpenAleph keep separate PostgreSQL ownership boundaries. OpenAleph owns corpus/search/ingestion; Workbench owns reporter-specific evidence/claims/review/workflow metadata.
- Added a first-class local OpenAleph platform configuration separate from the external Aleph research connector.
- Added `GET /api/integrations/openaleph/status`, which performs a real API probe instead of treating configuration as proof of integration.
- `GET /api/capabilities` reports `integrated_preview` when the local OpenAleph platform is enabled and still reports `core_preview` in standalone mode.
- Added an ecosystem audit covering OpenAleph/FollowTheMoney, `ingest-file`, Nomenklatura, followthemoney-compare, Zavod, and the verified SHATTERED project (`mantisfury/ArkhamMirror`). SHATTERED is not bundled wholesale because that would duplicate the selected corpus/search/entity/graph/timeline stack; specialist non-AI shards are candidates for selective adapter-based reuse.
- AI remains disabled and is not a startup dependency.
- Focused DEV 0.86 tests: 6 passed.
- Complete backend regression: 168/168 passed.
- Complete backend regression against a fresh persistent file-backed SQLite database: 168/168 passed.
- The root Compose file parses successfully and tests assert the integrated service topology and database ownership boundaries.

### External gates still open

- No Docker or Podman executable is available in this execution environment, so the OpenAleph containers have **not** actually been pulled/booted here.
- No local PostgreSQL server/client is available, so the full Workbench test suite has not yet run against real PostgreSQL.
- The Next.js production dependency/install/build gate remains open.
- The specific SHATTERED shard APIs/data contracts have not yet been imported or integration-tested; only the project/architecture/licensing scope has been verified.

### Next highest-priority core basic

Boot the DEV 0.86 integrated Compose stack on a Docker-capable machine, run migrations and health probes against real PostgreSQL/OpenAleph, then exercise a real document through OpenAleph ingestion/search and bridge that corpus record into Workbench evidence/provenance. This is higher priority than any AI work or installer packaging.


## DEV 0.87 — OpenAleph corpus bridge

- Added persistent investigation -> OpenAleph collection bindings and document -> OpenAleph synchronization records.
- Added the maintained `openaleph-client==1.1.3` dependency instead of implementing the upload protocol ourselves.
- Workbench can create/reuse an OpenAleph collection by stable foreign ID and upload stored documents through `AlephAPI.ingest_upload`.
- Integrated Docker mode auto-synchronizes successful Workbench uploads to OpenAleph; standalone preview mode keeps auto-sync disabled.
- OpenAleph failure is recorded without deleting or invalidating the reporter's Workbench document.
- Portable investigation export/restore now includes corpus binding/sync state.
- Focused corpus/migration/export regression: 14 passed.
- Full backend regression before the final snapshot refresh: 170 passed.

### External gates still open

- This runtime has no Docker/Podman, so the real OpenAleph containers still cannot be booted here.
- This runtime has no PostgreSQL server/client, so real PostgreSQL and multi-session lock testing remain open.
- Package installation from PyPI is blocked by DNS in this runtime; the `openaleph-client` API contract was verified against the current official project source/docs, while runtime installation remains a Docker/developer-machine validation gate.
- Next.js dependency retrieval/build remains an external gate.

### Next highest-priority core basic

Boot the integrated stack on a Docker-capable host and run one real document through Workbench upload -> OpenAleph collection ingest/index -> corpus search -> reporter evidence/provenance. Once that works, replace the transitional custom extraction path with OpenAleph/`ingest-file` results rather than expanding it.

## DEV 0.88 — OpenAleph extraction-to-review bridge

- Added the first inbound bridge from local OpenAleph corpus extraction into Workbench's reporter review workflow.
- Workbench now queries OpenAleph `Page` entities using exact collection and parent-document filters after a document has a successful corpus sync with a provider record ID.
- Extracted page text is staged as `ExtractionCandidate(candidate_type="evidence")` records, never silently promoted to evidence.
- Each staged candidate carries provider provenance: OpenAleph collection ID, parent document ID, page entity ID/schema, and `openaleph_ingest_file` extraction method.
- Accepted candidates preserve their OpenAleph locator and remain traceable through the existing extraction-lineage/provenance APIs.
- Imports are idempotent: previously staged OpenAleph pages are not duplicated.
- Added `POST /api/documents/{document_id}/corpus/openaleph/import-evidence`.
- Verified the HTTP search contract sends exact `filter:collection_id`, `filter:schema=Page`, and `filter:properties.document` parameters.
- Focused corpus bridge regression: 5 passed.
- Full backend regression: 173/173 passed.
- Full backend regression against a fresh file-backed SQLite database: 173/173 passed.

### External gates still open

- Real OpenAleph/`ingest-file` containers cannot be started in this execution environment because Docker/Podman is unavailable.
- Real PostgreSQL full-suite and multi-session testing remain open because no PostgreSQL service/client is installed here.
- The Next.js lockfile/install/build gate remains open; npm registry access timed out again during this run.
- The inbound bridge currently imports document page text as evidence candidates; OpenAleph-extracted named entities/mentions still need a review-preserving bridge before the transitional Workbench name detector can be retired.

### Next highest-priority core basic

On a Docker-capable host, validate this exact path with a real PDF: Workbench upload -> OpenAleph ingest-file/OCR -> Page entities -> Workbench review queue -> accepted evidence -> claim -> relationship -> dossier/graph -> provenance. In parallel, add the same review-preserving import boundary for OpenAleph/ftm-analyze entity mentions so generic custom name extraction can begin to be removed.


## DEV 0.89 — OpenAleph/ftm-analyze entity review bridge

- Added an inbound `Mention`-entity bridge from OpenAleph/`ftm-analyze` into Workbench's existing extraction-candidate review queue.
- Exact collection and parent-document filters keep entity mentions scoped to the synchronized Workbench document.
- Imported names/schema predictions remain `proposed`; no canonical entity is created until a reporter accepts the candidate.
- Provider-side `Mention.resolved` identifiers are preserved only as provenance metadata and never trigger an automatic merge/resolution.
- Reporter-accepted provider entities now carry statement provenance identifying the OpenAleph collection and source Mention entity.
- Added `POST /api/documents/{document_id}/corpus/openaleph/import-entities`.
- Focused OpenAleph corpus/entity bridge regression: 7 passed.
- Full backend regression: 175/175 passed.
- Full backend regression against a fresh persistent file-backed SQLite database: 175/175 passed.

### External gates still open

- Real OpenAleph/`ingest-file`/`ftm-analyze` containers cannot be started in this execution environment because Docker/Podman is unavailable.
- Real PostgreSQL full-suite and multi-session testing remain open because no PostgreSQL service/client is installed here.
- The Next.js production dependency/build gate remains open in this environment.
- The provider entity bridge is contract-tested against realistic OpenAleph `Mention` responses, but it still needs a real document processed by live `ftm-analyze` to validate the exact production response shape end-to-end.

### Next highest-priority core basic

Run the integrated stack on a Docker-capable host and validate one real PDF end to end: Workbench upload -> OpenAleph ingest/OCR -> `Page` evidence proposals + `Mention` entity proposals -> reporter review -> entity/evidence -> claim -> relationship -> dossier/graph/timeline -> lead/task -> exact provenance. Once live extraction is verified, remove or disable the corresponding transitional custom name-detection path in integrated mode instead of maintaining two generic entity extractors.

## DEV 0.90 — OpenAleph review orchestration and reporter-visible extraction state

- Added `GET /api/documents/{document_id}/corpus/openaleph/review-status` to report corpus binding, synchronization readiness, and OpenAleph-derived candidate counts by type/review state.
- Added `POST /api/documents/{document_id}/corpus/openaleph/refresh-review` to refresh both Page/evidence and Mention/entity review queues through one idempotent reporter action.
- The combined refresh retains the core truth boundary: provider extraction remains proposed review material and never becomes Evidence, a canonical Entity, a merge, or a relationship automatically.
- Optimized OpenAleph Mention import idempotency from repeated full candidate scans to one preloaded provider-ID set; duplicate provider rows in one response no longer create duplicate candidates.
- Added Next.js document controls for OpenAleph status, sync, combined review refresh, and pending/accepted/rejected provider-review counts.
- Focused OpenAleph bridge/API regression: 9 passed.
- Full backend regression: 177/177 passed.
- Full backend regression against a fresh persistent file-backed SQLite database: 177/177 passed.
- Strict TypeScript 5.8.3 validation for API types/validators/client: passed. Full Next.js build remains gated by unavailable npm dependency retrieval.

### External gates still open

- No Docker/Podman runtime is available here, so live OpenAleph/`ingest-file`/`ftm-analyze` container processing cannot be executed.
- No PostgreSQL server/client is installed here, so real PostgreSQL full-suite and multi-session locking/concurrency tests remain open.
- `npm install --package-lock-only --ignore-scripts` timed out again, so the reproducible Next.js dependency/production-build gate remains open.
- The OpenAleph contracts are covered with realistic Page/Mention fixtures, but one real PDF must still be processed through the live stack before the transitional custom generic extractor can be safely retired in integrated mode.

### Next highest-priority core basic

On a Docker-capable host, run one real document through Workbench -> OpenAleph -> `ingest-file`/OCR -> `ftm-analyze` -> combined review refresh -> reporter acceptance -> evidence/entity -> claim -> relationship -> dossier/graph/timeline -> lead/task -> provenance. After that live validation, disable the duplicate local name detector when integrated OpenAleph extraction is enabled.


## DEV 0.91 — integrated entity-extraction ownership

- Added `ENABLE_LOCAL_ENTITY_SUGGESTIONS` with a standalone-safe default of `true`.
- Integrated Docker mode now sets `ENABLE_LOCAL_ENTITY_SUGGESTIONS=false`, so generic proper-name/entity suggestion generation is delegated to OpenAleph/`ftm-analyze` rather than duplicated in Workbench.
- Local evidence and claim suggestions remain available during the live-integration transition; only the duplicate generic name detector is disabled in integrated mode.
- `/api/settings/status` now reports `local_entity_suggestions_enabled` and `entity_extraction_owner` so the active extraction boundary is inspectable.
- Next.js settings display the active entity-extraction owner; the stale frontend build badge was corrected to DEV 0.91.
- Added focused extraction-ownership regression tests covering standalone fallback and integrated-mode suppression.
- Focused extraction/OpenAleph regression: 11/11 passed.
- Complete backend regression: 179/179 passed.
- Complete backend regression against a fresh persistent file-backed SQLite database: 179/179 passed.
- Strict TypeScript validation for the API types/validators/client: passed.

### External gates still open

- No Docker/Podman runtime is available here, so a real OpenAleph/`ingest-file`/`ftm-analyze` document cannot yet validate the production response shape.
- No PostgreSQL service/client is installed here, so real PostgreSQL full-suite and multi-session concurrency testing remain open.
- Full Next.js dependency install/build remains gated by missing frontend dependencies/network access in this environment.

### Next highest-priority core basic

On a Docker-capable host, validate one real PDF end to end through OpenAleph. After that succeeds, retire or disable the remaining duplicate generic local text/evidence extraction paths in integrated mode where OpenAleph already supplies the same corpus material, while preserving a standalone fallback and exact reporter-controlled provenance.

## DEV 0.93 — compact graph provenance aggregation

- Strengthened reviewed-duplicate relationship presentation without merging or rewriting any underlying record.
- A compact preferred graph/dossier edge now exposes `aggregate_provenance`, a read-only inventory of every reviewed duplicate edge beneath it: preserved relationship IDs, combined statement-source fingerprints, and the exact evidence/source records attached to each underlying edge.
- Expanded audit mode (`include_reconciled_duplicates=true`) continues to return each original edge independently and deliberately omits the presentation aggregate.
- The Next.js relationship inspector and the no-Node fallback UI now show the combined evidence inventory for a collapsed preferred edge and allow exact-evidence tracing from the Next.js surface.
- Added regression coverage proving two duplicate relationship records retain two distinct source/evidence trails while one compact preferred edge exposes both.
- Backend regression: **180/180 passed** in default mode and **180/180 passed** against a fresh persistent file-backed SQLite database.
- Strict TypeScript 5.8.3 validation passed for the modified API type/validation/client layer.

### External gates still open

- Real PostgreSQL full-suite and multi-session contention testing.
- Live Docker/OpenAleph/`ingest-file`/`ftm-analyze` document processing.
- Complete Next.js dependency install and production build.

### Next highest-priority core basic

The next product-level basic should tighten **claim/relationship provenance traversal from graph and dossier views** so a reporter can move from a compact edge to all supporting/contradicting claim evidence and then create a reporting lead without losing source lineage. The live PostgreSQL/OpenAleph integration gate remains the highest-priority environmental validation when a Docker-capable host is available.

## DEV 0.93 — claim-aware relationship provenance

- Relationship provenance now expands a reporter-reviewed duplicate edge set from the selected/preferred edge without merging underlying records.
- Exact evidence attached to every preserved duplicate edge is returned in one trace.
- Claim/evidence links for that evidence are surfaced with explicit `supports`, `contradicts`, or `context` stance plus current claim status/confidence.
- The graph inspector adds **Trace relationship + claims**, tying graph review directly into the existing provenance/claim workflow.
- Regression coverage verifies two duplicate edges with independent evidence can surface both a supporting and contradicting claim while preserving both relationship records.
- Full backend regression: 181 passed.

## DEV 0.94 — relationship → claim/evidence → lead continuity
- Added a relationship-context lead creation endpoint that preserves every reviewed duplicate relationship represented by a compact graph edge.
- New leads automatically link the exact evidence records and claims already reached through those relationships, including supports/contradicts/context stances in link notes.
- Lead triage immediately reflects contradictory evidence/disputed claims without changing reporter-set truth states.
- Next.js graph action now uses the context-preserving workflow instead of creating a relationship-only lead.
- Regression test verifies duplicate edges, both evidence records, supporting/disputed claims, and unchanged claim statuses.

## DEV 0.95 — frozen reporting-task investigation context

- Reporting-task workflow snapshots now freeze the reporter-facing reason a task existed: lead priority/owner/next action plus linked relationships, claims and their verification state, exact evidence locators/quotes, and source identity.
- `serialize_task` exposes the newest immutable snapshot as `task_context` while preserving the complete workflow-event history.
- Later claim edits do not rewrite prior task snapshots; regression coverage verifies this audit property.
- No installer work was performed.

## DEV 0.96 — timeline claim/evidence/source provenance continuity
- Reporter-authored timeline events now expose current linked source, exact evidence quote/locator, claim status/confidence, and claim-evidence stance in a read-only `context` object.
- Timeline verification status remains independently reporter-controlled; linked claim status never silently promotes/demotes an event.
- Next.js timeline cards disclose linked claim/evidence context.
- Added regression coverage for source → evidence → claim → timeline continuity and truth-state separation.
- Full backend regression: 184 passed.

## DEV 0.97 — entity dossier explicit-context continuity

- Entity dossiers now prefer explicit graph/evidence/lead links over fragile name-text matching when assembling claims and evidence.
- Claims reached through evidence attached to an entity relationship are included even when the claim text never names the entity.
- Relationship evidence, contextual reporting leads, and reporting tasks now remain visible in the dossier chain.
- The Next.js dossier surface now exposes leads/questions, reporting tasks, timeline events, and external/Aleph findings alongside relationships, claims, and evidence.
- Text-name matching remains a clearly labelled fallback for discoverability; it is not treated as an explicit provenance link.

## DEV 0.98 — dossier identity/merge audit history

- Entity dossiers now expose first-class `identity_history` instead of showing only the alias redirect used when an old merged record is requested.
- The identity surface preserves merged alias records, reporter canonical-resolution decisions (`same`/`different`/`unsure`) with confidence/rationale, and immutable merge-audit records including moved-reference counts.
- Unresolved identity decisions are counted explicitly; connector results still cannot silently establish canonical identity.
- Next.js dossier UI now shows identity decisions and merge history separately from substantive claims/relationships so identity judgment is not confused with evidence truth.
- Regression coverage executes a real reporter `same` decision → merge preview → audited merge → dossier traversal and verifies the original alias and decision remain visible.
- No installer work was performed.

## DEV 0.99

- Entity dossiers now surface unresolved FollowTheMoney property conflicts as first-class investigative material.
- Multiple canonical values for the same property remain separate; the dossier never invents a reporter-preferred value.
- Each conflicting value carries its canonical statement dataset/origin plus external assessment support/conflict counts and review status.
- Next.js dossier UI shows the conflict explicitly as unresolved and displays provenance fingerprints for each value.
- Added regression coverage for a two-employer conflict proving both values and provenance survive without silent preference.
- Focused dossier regression: 5 passed. Full suite reached 176/187 before the 40-second process timeout; this is not reported as a clean full-suite pass.
- No installer work performed.


## DEV 1.03 — extracted claim provenance continuity
- Accepting a reviewed document claim now materializes the exact reviewed sentence/span as Evidence and creates an explicit `supports` ClaimEvidenceLink.
- The claim status/confidence remain reporter-controlled; provenance creation does not verify the claim.
- Materialized evidence carries page/chunk locator plus character offsets and unified provenance tracing resolves it back to the accepted extraction candidate without text-match inference.
- Regression coverage verifies source → chunk/span → claim → evidence → unified provenance continuity.

## DEV 1.04 — reviewed extraction relationship continuity
- Added a reporter-safe relationship proposal stage rooted in an accepted extracted claim. Relationship schema and both canonical endpoints must be explicitly selected; no matcher can directly promote an edge.
- A proposal remains an `ExtractionCandidate` in `proposed` state until separately accepted. Before review, no canonical FollowTheMoney relationship exists.
- Accepted relationship proposals reuse the claim's exact supporting Evidence, preserve document/chunk/character lineage, and write relationship Statement origins to the reviewed extraction-candidate ID.
- Relationship creation now supports transaction-local `commit=False`, allowing extraction promotion and candidate acceptance to commit atomically instead of leaving a canonical edge if candidate review fails afterward.
- Unified relationship provenance traverses the attached Evidence back to the exact accepted document span.
- Full backend regression: 193 passed.

## DEV 1.05 — reporter-facing extraction relationship review
- Next.js document review now exposes the backend relationship-promotion workflow directly from accepted extracted claims.
- Reporters can select an explicit FollowTheMoney relationship schema and two existing canonical endpoints; this action stages a relationship proposal only and cannot create a graph edge.
- Relationship proposals are visually labelled as reporter-staged, non-machine suggestions, and non-canonical until a second explicit acceptance.
- Accepted relationship proposals use a distinct “Accept canonical relationship” action, preserving the two-step review boundary established in DEV 1.04.
- The review surface states the status chain explicitly: reviewed evidence → reporter-controlled claim → staged relationship proposal → canonical relationship.
- Full backend regression remains clean: 193 passed. Focused extraction + unified provenance regression: 6 passed.
- Frontend production/typecheck validation remains blocked in this runtime because the source snapshot does not include installed Next/React/Node dependencies.

## DEV 1.06
- Added immutable claim review history with required rationale.
- Added claim review workspace with stance counts and evidence-dependent relationship visibility.
- Preserved claim review events in investigation export/restore.
- Updated Next.js claim review action to use audited reviews.
- Full backend regression: 194/194 passed.
- No installer work.
- Next: surface review history/dependent relationships directly in the claim UI and propagate advisory disputed-claim signals into graph/dossier/timeline without mutating canonical relationships.

## DEV 1.10 — multi-evidence relationship support
- Added first-class `relationship_evidence_attachments`, preserving the legacy `RelationshipEdge.evidence_id` as a compatibility pointer while allowing multiple independently sourced evidence records per canonical FollowTheMoney relationship.
- Relationship creation automatically seeds an attachment for legacy/direct evidence; reporters can attach additional same-investigation evidence through the relationship API.
- Evidence reviews now validate against the attachment inventory, not only the legacy single evidence field, and serialization exposes each attachment with its own latest immutable review.
- Export/restore includes attachments in foreign-key-safe order; migration backfills every existing relationship evidence pointer without provenance loss.
- Focused multi-evidence relationship regression: 3/3 passed. Python compile passed. Full suite reached 36%+ with no failures before runtime timeout; a complete full-suite pass is not claimed for this run.

## DEV 1.12 — many-evidence relationship consumers
- Relationship serialization now derives claim dependencies from every first-class relationship evidence attachment rather than the legacy compatibility pointer, and each dependency identifies the evidence record that produced it.
- Lead triage now expands relationship links through the complete attachment inventory, so contradictions/disputed claims on secondary relationship evidence can raise reporter attention.
- Lead provenance snapshots now freeze all attached relationship evidence and expose `evidence_ids` instead of treating one legacy evidence pointer as the relationship's provenance.
- Reconciled relationship aggregate provenance now inventories evidence from all attachments on every preserved underlying edge.
- Added regression coverage proving a claim linked only to a secondary relationship evidence attachment reaches the relationship advisory.
- Full backend regression: 199/199 passed. Python compile passed. Three existing Pydantic `schema` shadowing warnings remain.
- No installer work.

## DEV 1.14 — relationship API/presentation attachment migration
- Removed the singular `provenance.evidence` relationship serialization compatibility view; relationship API presentation now exposes evidence only through `provenance.evidence_attachments`.
- Updated the Next.js graph edge inspector to render and provenance-trace every relationship evidence attachment independently.
- Reconciled duplicate relationship advisory aggregation now derives healthy/challenged evidence IDs from each claim dependency's exact attached `evidence_id`, rather than the legacy singular presentation field.
- Updated core provenance/end-to-end tests to assert against first-class evidence attachments.
- Full backend regression: 200/200 passed; focused relationship/provenance regression: 24/24 passed. Three existing Pydantic `schema` shadowing warnings remain.
- No installer work performed.

## DEV 1.15 — relationship evidence compatibility pointer removed
- Removed `RelationshipEdge.evidence_id` from the SQLAlchemy model and relationship creation path. `relationship_evidence_attachments` is now the sole authoritative relationship→evidence storage model.
- Added Alembic migration `c05f9e3a1d64` to drop the legacy column/index. Upgrade/downgrade/upgrade was validated on a fresh SQLite database; downgrade deterministically chooses the oldest attachment because the old schema can represent only one evidence record.
- Added in-memory legacy-backup normalization so older export-format-v1 backups containing `relationship_edges.evidence_id` restore into first-class attachments without losing that provenance.
- Removed the final claim-review workspace read of the deleted compatibility field.
- Full backend regression: 202/202 passed. Migration round-trip passed. Three existing Pydantic `schema` shadowing warnings remain.
- No installer work performed.

## DEV 1.16 — reporter-facing claim dependency audit
- Claim verification now loads the complete review workspace, not only linked evidence.
- Next.js displays evidence stance counts, canonical relationships dependent on the claim evidence, and immutable reporter review history with rationale/confidence transitions.
- Saving a review refreshes the workspace from the audited backend response so relationship dependencies/history cannot drift from the recorded decision.
- No installer work performed.

## DEV 1.17 — relationship evidence review workspace
- The graph edge inspector now provides direct reporter assessment for every first-class relationship evidence attachment: supports, contradicts, context, superseded, or unresolved.
- Recording an assessment requires rationale, preserves the canonical FollowTheMoney relationship, refreshes the serialized combined support/advisory state, and reloads the immutable relationship-evidence review history.
- The inspector shows each attachment's latest assessment and the complete immutable assessment history while retaining exact provenance tracing.
- Full backend regression: 202/202 passed; focused relationship/claim/end-to-end regression: 8/8 passed. Frontend build remains unavailable in this source snapshot because node_modules is not present.
- No installer work performed.

## DEV 1.18
- Added reporter-facing attachment of additional exact investigation evidence to an existing canonical FollowTheMoney relationship directly from the graph inspector.
- The picker excludes evidence already attached to the selected relationship and accepts an optional attachment note.
- Successful attachment refreshes the canonical relationship/support state and entity dossier context without replacing existing evidence; the new attachment is immediately available for independent supports/contradicts/context/superseded/unresolved review.


## DEV 1.19 — relationship evidence propagation audit
- Global/investigation relationship search hits now carry the same non-destructive relationship advisory returned by graph/dossier serialization, including relationship-evidence review state.
- Lead triage now treats relationship-evidence assessment as distinct from claim-evidence stance and surfaces per-stance counts for supports/contradicts/context/superseded/unresolved/unreviewed attachments. Contradicted, unresolved, and unreviewed relationship evidence contributes to queue attention without mutating reporter priority or canonical records.
- Added an end-to-end regression proving an evidence assessment propagates from relationship review into linked lead triage and investigation search metadata.
- Full backend regression: 203/203 passed; focused relationship/lead/search/timeline regression: 19/19 passed. Three existing Pydantic `schema` shadowing warnings remain.
- No installer work performed.

# DEV 1.22 update: exact accepted Evidence now embeds reviewed character offsets in its own locator, not only extraction-candidate lineage metadata. Acceptance validates any staged evidence span against the immutable source chunk and refuses span/quote drift rather than creating false provenance. Export/restore preserves the extended locator. Full backend regression: 205/205 passed. No installer work performed.

# DEV 1.23 update: extraction entity proposals now have a pre-accept canonical-match review boundary. The API exposes likely Workbench matches plus OpenAleph/provider resolution metadata as leads only. A strong canonical match blocks blind entity acceptance until the reporter explicitly chooses same/different/create_new. SAME reuses the existing canonical entity while preserving the extraction/provider statement provenance; DIFFERENT creates a separate entity and records the reporter's negative canonical-resolution decision. Full backend regression: 207/207 passed. No installer work performed.
