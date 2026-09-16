## DEV 1.24 — clean source-deployment recovery

PASS (source logic): Windows setup now pins the intended Python 3.12 interpreter rather than `py -3`, invalidates the stale DEV 0.85 dependency-ready marker, rebuilds an incompatible venv, installs the complete local requirements, and performs an import smoke test before marking setup ready. Setup failures are retained in `journalism-workbench-setup.log`; Repair uses the same runtime contract. This addresses two concrete clean-install hazards found in the DEV 1.23 snapshot after the user reported DEV 1.22 failed to install. Network-disabled CI cannot perform a fresh PyPI install, and Docker is unavailable in this execution environment, so clean-machine package acquisition and Docker boot remain external gates.

# DEV 1.21 audit: dossier → question/lead propagation is reporter-actionable. Dossier relationship rows disclose per-stance evidence assessment counts and can seed a first-class lead through the existing context-preserving relationship workflow, retaining relationship, evidence, claim, and provenance links rather than reducing mixed evidence to a generic warning. Full backend regression 204/204 passed.

# DEV 1.20 audit: mixed relationship evidence (supports/contradicts/context/superseded/unresolved/unreviewed) is summarized centrally and propagates into both synthetic relationship-date timeline events and reporter-authored relationship events without changing reporter-controlled timeline verification status. Full backend 204/204 passed.

# DEV 1.13 audit: post-merge reconciliation is many-evidence aware; focused reconciliation/evidence review 16/16 and full backend 200/200 passed. Legacy RelationshipEdge.evidence_id remains only for API/presentation compatibility.

# DEV 1.11 audit: many-evidence downstream consumers migrated for claims, dossiers, and provenance; legacy evidence_id remains compatibility-only.

## DEV 1.09 — direct relationship-evidence review

Canonical relationship evidence is now explicitly reporter-reviewable without mutating the relationship or its source material. Immutable review history distinguishes evidence-level contradiction from claim-level dispute. Current limitation: a single underlying `RelationshipEdge` still has one direct `evidence_id`; reconciled duplicate edges can aggregate multiple preserved evidence records for presentation, but first-class many-evidence attachment to one edge remains the next structural provenance task.

# DEV 1.08 audit note

Claim contradiction advisories now propagate to dossier and timeline presentation. Reconciled duplicate edges aggregate their preserved evidence for advisory purposes only, distinguishing challenged support from mixed independent support. Underlying FollowTheMoney relationships, claims, evidence, and reconciliation decisions remain unchanged.

## DEV 1.07 — disputed-claim relationship advisories

Canonical relationships now surface claim-dependency advisories derived from their exact linked evidence. Advisory state is presentation/review metadata only; it never mutates FollowTheMoney relationships.

# DEV 1.02 provenance audit update
Document extraction review now preserves deterministic character offsets within the extracted chunk for local evidence, claim, and entity proposals. Accepted entity statement origin includes the exact character range, while the extraction-lineage API exposes the candidate span alongside document hash, source, chunk ordinal/locator/page and extraction method. This closes the local source → extraction → entity review character-provenance gap without auto-promoting proposals to truth.

# DEV 1.01 temporal-property audit

Temporal property conflicts now support explicit, evidence-linked intervals and timeline projection without inferred dates. Underlying FollowTheMoney statements remain immutable.

# DEV 1.00 update

Implemented immutable reporter adjudication for multi-value FollowTheMoney property conflicts. Dossiers can now record `preferred`, `superseded`, `temporal_change`, `both_valid`, or `unresolved` decisions with reviewed values, optional preferred value, rationale, and full decision history. Decisions are presentation/audit metadata only and never rewrite or delete canonical statements. Added API endpoints, dossier UI actions, export/restore coverage, and an Alembic migration. Backend regression: **189 passed**. No installer work performed.

# Journalism Workbench Core Basics Audit — 0.83

## Architecture retained

- FastAPI backend.
- Next.js / TypeScript frontend.
- PostgreSQL target with Alembic migrations and SQLite development/test parity guards.
- Docker deployment definitions.
- FollowTheMoney canonical entities and interstitial relationship entities.
- Aleph/OpenSanctions modular connector review where external results remain leads until explicit reporter promotion.

## Core workflow status

The coherent investigative workflow remains implemented and regression-covered:

**source/document → extraction/OCR → entity review/resolution → exact-provenance evidence → claim support/contradiction/status → FollowTheMoney relationship → dossier/graph/timeline → question/lead/task → global/investigation search → export/backup/restore**

## Source-first provenance strengthened in 0.72

- The unified provenance trace can now start directly from a `source` or `document`, in addition to canonical entity, claim, evidence, and relationship records.
- Source traces show the original source, associated ingested document when present, accepted evidence, claim/evidence stance links, relationships backed by that evidence, and reporting leads explicitly attached to the source.
- Document traces preserve SHA-256 identity and extraction status while traversing through the owning source into accepted evidence and downstream reporting work.
- Evidence links retain exact locator and accepted extraction lineage; the new trace does not infer evidentiary meaning or promote extraction/connector material.
- The Next.js document list exposes a direct **Trace document** action, and source-only trace actions use the unified endpoint.
- Runtime frontend validation was extended for the new source/document trace root types.


## Relationship-to-lead workflow strengthened in 0.73

- Reporting leads can now link directly to canonical `relationship_edges`, not only to the relationship's FollowTheMoney entity or its endpoint entities.
- Creating a lead from a relationship can be performed atomically through `POST /api/leads` with `relationship_id`.
- Cross-investigation relationship links are rejected.
- Relationship provenance traces expose the linked lead, and both endpoint entity dossiers surface relationship-linked leads.
- The Next.js graph inspector exposes a direct **Create reporting lead from relationship** action.
- This closes the explicit graph/dossier → lead handoff in the target source → evidence → claim → relationship → dossier/graph → lead workflow without turning an unresolved question into a canonical factual claim.


## Lead triage and direct provenance navigation strengthened in 0.74

- Lead queue items now compute advisory evidence-tension signals from explicitly linked claims, evidence, and evidence-backed canonical relationships.
- `supports`, `contradicts`, and `context` remain separate; contradictory evidence and disputed claims raise an attention score but never auto-change a claim or lead priority/status.
- Reporter-set priority remains the primary queue order. Evidence tension only breaks ties inside the same priority bucket.
- Lead-linked entity, source, claim, evidence, and relationship records can be opened directly in the unified provenance panel.
- This makes question/lead triage provenance-aware while retaining the project's human-review boundary.


## Lead-to-task execution provenance strengthened in 0.75

- Reporting tasks now have durable workflow events for creation and status changes.
- Each workflow event freezes the lead's explicit provenance context at that moment, including linked records and evidence-tension triage; later lead edits do not rewrite earlier snapshots.
- Task provenance is exportable/restorable and available through the unified provenance trace with `record_type=task`.
- The Next.js lead queue surfaces task history counts, direct task provenance tracing, and basic task status transitions.
- Unified provenance trace reads now explicitly enforce the resolved investigation authorization scope.


## Search-to-provenance navigation strengthened in 0.76

- Investigation/global search results now carry explicit trace roots instead of requiring UI-side inference.
- Search navigation spans canonical entities/statements, sources, documents/extracted chunks, evidence, claims, FollowTheMoney relationships, reporting leads, reporting tasks, and traceable timeline events.
- Reporting leads are first-class unified provenance roots and expose linked claim/evidence/source/relationship context while retaining their unresolved reporting status.
- External connector findings remain unverified review material and are deliberately not made canonical simply by appearing in search.
- This closes the search → provenance navigation gap across the implemented source → evidence → claim → relationship → lead → task chain.

## Security progress retained

- `viewer` remains read-only.
- `reporter` may mutate ordinary investigation content but cannot delete the investigation.
- per-investigation `admin` may perform investigation deletion.
- persisted global `admin` and the local workstation owner are unrestricted.
- backup restore requires global-admin/local-owner authority and the separate `ENABLE_RESTORE_API=true` feature switch.
- ORM `before_flush` remains the fail-closed investigation write boundary beneath route-level policy.

## Validation

- Backend regression for 0.77: **148/148** across two complete test-file partitions after the monolithic invocation exceeded the execution window.
- Focused grouped-search/provenance regression: **4/4**.
- Fresh persistent file-backed SQLite regression: **148/148** across the same two complete test-file partitions.
- Strict TypeScript 5.8.3 API types/validators check: **passed**.
- Unified provenance regression: **3/3**, including source/document entry points over an ingested and reporter-accepted evidence record.
- Strict TypeScript 5.8.3 check for the modified API types/validators with ES2022/DOM libs: **passed**. Full Next.js page/build validation remains gated on frontend dependencies.
- Real host Tesseract runtime smoke test remains passed from 0.68/0.69.

## Core-basics assessment

The requested investigative-domain basics remain represented end-to-end. 0.77 strengthens search relevance without weakening truth-state boundaries: canonical/evidentiary/reporting/review/external records are grouped explicitly, while Aleph and other connector findings remain leads until human review and promotion.

## Not yet complete

1. Full suite on a real PostgreSQL server.
2. True concurrent PostgreSQL sessions for advisory-lock/snapshot behavior.
3. Reproducible frontend lockfile, dependency install, typecheck, and production build.
4. Actual Docker/Podman image build; container runtime is unavailable here.
5. Any future remote security-management surface must enforce global-admin authority; current security-management remains local-only.

Installer creation remains intentionally deferred until these gates are audited.


## Search relevance and evidentiary grouping strengthened in 0.77

- Exact or leading matches in captions/titles/quotes/claim text outrank incidental metadata matches using one deterministic database-agnostic scorer.
- Stable tie-breaking prevents SQLite/PostgreSQL ordering drift for equal relevance scores.
- Every result is classified as canonical, evidence, reporting, workflow, review, or external lead.
- Type/group counts describe the full match set even when the UI requests a limited result page.
- External/Aleph connector findings remain visibly separated review leads and deliberately have no canonical provenance trace target until explicit human review/promotion.


## Canonical entity-resolution safety strengthened in 0.78

The canonical entity layer now supports reporter-controlled duplicate review independent of external connector findings. Likely duplicates are generated only within the same investigation and exclude FollowTheMoney relationship/interstitial entities. Review decisions are immutable historical records and can be revised by adding a later decision; the candidate response surfaces the latest decision. Crucially, a `same` decision does not mutate either entity, so statements, evidence-linked relationships, dossiers, timeline links, leads, tasks, and other provenance cannot be silently reassigned or lost. Canonical-resolution records participate in portable backup/restore. A true merge remains intentionally deferred until it can be preview-first, transactional, and provenance-preserving.


## Preview-first canonical merge safety strengthened in 0.79

A reporter-verified `same` identity decision can now be followed by an explicit merge, but only after inspecting a fresh preview of every supported dependent reference. The preview digest prevents time-of-check/time-of-use drift inside the normal application workflow; execution refuses stale previews. Canonical relationship edges and external relationship reviews that would collapse into self-loops are reported as blockers. Successful execution remaps dependent references in one transaction, retains the source entity as a merged alias rather than deleting it, and stores an immutable audit snapshot of the preview and moved counts. This closes the prior entity-resolution gap while preserving source identity history and avoiding silent graph mutation.


## Merge-aftermath alias navigation strengthened in 0.80

- Merged canonical records remain immutable audit anchors rather than disappearing.
- Searching an old alias returns that historical name but points provenance to the active canonical entity.
- Dossier and entity-provenance requests made with a merged entity ID resolve to the active entity and include the alias chain.
- Duplicate-candidate review resolves aliases first, preventing work from continuing against an inactive canonical record.

## Post-merge reconciliation strengthened in 0.81

- Canonical merges no longer leave duplicate statements or converged relationship edges as unexplained parallel rows.
- The backend detects exact semantic statement duplicates after normalization and duplicate relationship signatures after endpoint consolidation.
- Every candidate pair keeps both original record IDs and provenance; the reporter records `duplicate`, `keep_separate`, or `unsure` as a separate immutable decision.
- Reconciliation decisions survive investigation backup/restore.
- The dossier UI exposes the review queue without destructive automatic deduplication.


## Preferred reconciliation and provenance strengthened in 0.82

- A `duplicate` post-merge review can designate either original record as the preferred assertion/relationship; this preference is immutable review metadata, not destructive deduplication.
- `keep_separate` and `unsure` decisions cannot designate a preferred record, and the preference must belong to the reviewed pair.
- Normal search suppresses only a reviewed non-preferred duplicate copy. Reporters can explicitly include reconciled duplicates to recover both historical records.
- Search results expose reconciliation metadata for preferred and secondary copies.
- Entity and relationship provenance traces expose the corresponding reconciliation decision so preference never hides the underlying provenance history.
- The dossier review UI requires an explicit choice of which duplicate copy is preferred.


## Reconciled graph/dossier presentation strengthened in 0.83

- Interactive FollowTheMoney graph presentation now respects reporter-reviewed preferred relationship records instead of rendering duplicate post-merge edges as equal canonical display entries.
- Collapse is presentation-only: hidden secondary edges remain first-class relationship records with their own relationship entities, statements, evidence links, and unified provenance traces.
- Reporters can explicitly expand reviewed duplicate copies in the graph to inspect every underlying record.
- Entity dossiers report compact relationship counts separately from underlying record counts and preserve lead/timeline discovery across the complete underlying edge set.
- Regression coverage verifies that a hidden duplicate edge remains directly traceable after graph and dossier collapse.

## DEV 0.84 local-AI retrieval boundary

The first AI-investigator boundary is now implemented without granting a model authority over canonical records. The endpoint returns bounded retrieval context grouped by evidentiary role and a factual-citation list that intentionally omits connector findings. Aleph/OpenSanctions results remain a separate `external_leads` collection.

This is intentionally not yet an answer-generating LLM endpoint. The next reasoning layer can consume this packet while remaining constrained by exact Workbench provenance.

Architecture ownership is now explicit in `STACK_OWNERSHIP.md`: OpenAleph/FollowTheMoney ecosystem components should own commodity ingestion, corpus search, FtM entity mechanics, deduplication/resolution and crawler infrastructure where they fit; Workbench should own reporter-specific evidence, claims, review gates, provenance, workflow, presentation and local-AI reasoning.

## DEV 0.85 core-preview audit

The application now has an explicit non-AI preview contract. `GET /api/capabilities` advertises the core reporter feature set and reports AI disabled by default. `tests/test_core_preview_smoke.py` validates the coherent core reporting chain with a real uploaded document, reviewed evidence, a supported claim, an evidence-backed FollowTheMoney relationship, graph/dossier/search/provenance reads, and a reporting lead.

A launcher audit found that the previous `requirements-local.txt` was incomplete for the code path exposed by `Start Journalism Workbench.bat`; document upload/extraction dependencies and Alembic were missing. DEV 0.85 aligns the local requirements with the executable feature set and changes the dependency-ready marker so an existing development `.venv` cannot silently skip the new requirements.

Remaining release gates are still real PostgreSQL/concurrency, actual Docker image builds, and a reproducible Next.js dependency/build chain. These are validation/deployment gates, not reasons to make AI a prerequisite for the core application.

## DEV 0.86 integrated-platform audit

DEV 0.85's custom reporter workflow remains regression-covered, but it was not yet the agreed integrated product because the root container topology did not contain OpenAleph. DEV 0.86 corrects that architectural gap in source: the root Compose stack now declares the maintained OpenAleph services and keeps Workbench's reporter-specific database separate.

The new OpenAleph status endpoint makes an important distinction: `OPENALEPH_ENABLED=true` means the integration is configured; `api_usable=true` is only returned after the configured `/api/2/search` endpoint actually responds successfully with JSON. This prevents future progress reports from equating a config stub with a working corpus platform.

SHATTERED was verified as `mantisfury/ArkhamMirror`, an MIT-licensed, actively developed modular local-first investigative platform that can operate without an LLM. Its generic ingestion/search/entities/graph/timeline functions overlap substantially with OpenAleph + Workbench, so wholesale embedding is rejected. The integration audit instead identifies specialist analysis capabilities (credibility assessment, non-AI Analysis of Competing Hypotheses, media forensics, and selected unique analytical shards) for later adapter-level evaluation.

Remaining audit gate: actual Docker/OpenAleph/PostgreSQL boot and a real OpenAleph-ingested document flowing into Workbench evidence/provenance have not yet been demonstrated in this runtime.


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

## DEV 0.88 — corpus extraction review audit

The integration now crosses the corpus boundary in both directions for document text: Workbench can upload a source to OpenAleph and can stage OpenAleph `Page` text back into the reporter review queue with explicit provider provenance. This closes an architectural gap in 0.87, where corpus synchronization existed but OpenAleph extraction could not yet participate in Workbench evidence review.

The human-review rule is preserved: OpenAleph page text becomes a proposed `ExtractionCandidate`, not Evidence. Reporter acceptance is still required before the text can function as evidence in claims or relationships.

Still transitional: Workbench's generic local text/name candidate generator remains present. It should not be expanded; the next migration target is OpenAleph/ftm-analyze entity/mention extraction into the same review boundary.


## DEV 0.89 — entity extraction review audit

The integrated OpenAleph boundary now covers both page-text evidence proposals and `ftm-analyze` `Mention` entity proposals. Entity mentions are scoped to the synchronized document, imported idempotently, and require explicit reporter acceptance. Provider resolution hints are preserved but cannot automatically merge entities. This allows the custom name detector to become a migration target once a live OpenAleph/`ftm-analyze` run confirms the production extraction contract.

## OpenAleph document-review orchestration strengthened in 0.90

- OpenAleph synchronization and inbound extraction are now visible as one document-level reporter workflow instead of separate low-level endpoints.
- A review-status endpoint distinguishes provider sync readiness from Workbench truth state and reports OpenAleph Page/Mention candidates as proposed/accepted/rejected.
- A combined refresh endpoint idempotently stages both exact Page text and Mention entities while preserving explicit human review.
- The Next.js document panel exposes status/sync/refresh controls so the OpenAleph -> review -> evidence/entity boundary is reachable through the product UI.
- Provider-side duplicate Mention rows are deduplicated during a single refresh as well as across later refreshes.
- Backend regression: **177/177** in the default suite and **177/177** against a fresh persistent file-backed SQLite database.
- Strict TypeScript 5.8.3 validation for the modified API types/validators/client passed; full Next.js install/build remains externally gated by npm registry timeout.


## Integrated entity-extraction ownership strengthened in 0.91

- Workbench no longer runs its homemade generic proper-name detector in the integrated Docker/OpenAleph topology.
- `ftm-analyze` is now the explicit generic entity-extraction owner in integrated mode; Workbench retains human review and truth-state ownership.
- Standalone mode preserves the local entity detector as a fallback so current working functionality is not lost when OpenAleph is unavailable.
- The active ownership boundary is visible through `/api/settings/status` and the frontend settings panel.
- Evidence and claim suggestions remain local for now because the live OpenAleph extraction path still cannot be executed in this runtime; they remain proposals and do not bypass reporter review.
- Backend regression: 179/179 on default and fresh file-backed SQLite runs.

## DEV 0.92 — reviewed duplicate graph provenance audit

Compact graph presentation no longer hides the evidence inventory of reviewed duplicate relationship edges. When a reporter has marked two relationship records as duplicates and selected a preferred record, Workbench still preserves both edge records independently but exposes a read-only `aggregate_provenance` block on the compact preferred edge. That block inventories every underlying relationship ID, every statement dataset/origin fingerprint, and each exact Evidence/Source record attached to the reviewed duplicates.

This is explicitly presentation-only aggregation, not record consolidation. Expanded audit mode returns the underlying records separately and does not synthesize the aggregate. The Next.js edge inspector and fallback UI both disclose that distinction.

## DEV 0.93 — claim-aware graph provenance

Relationship review now traverses from a compact preferred graph edge through every reporter-reviewed duplicate edge, exact evidence/source records, and the claims that cite that evidence. Claim stance (`supports`, `contradicts`, `context`) and verification state remain explicit; no claim status is inferred from graph topology and no duplicate relationship/evidence record is merged. This closes the prior graph → evidence → claim-context gap at the read/review layer.

## DEV 0.94 — relationship-to-lead context continuity
The graph-to-lead workflow now preserves the investigative reason for following a relationship: all reviewed duplicate relationship records, their exact evidence, and claims reached through that evidence are linked to the new lead. This is context copying only; it does not infer truth, alter claim status, or merge records. Lead triage can therefore surface contradiction/dispute immediately while provenance remains traversable.

### DEV 0.95 task continuity audit
Reporting tasks created from leads retain a denormalized, immutable investigation-context snapshot at each workflow transition. The snapshot includes the lead's next action/owner/priority, linked relationships, claims, evidence locators/quotes, sources, and contradiction triage. This closes the lead → reporting task continuity gap without changing claim or relationship truth state.

### DEV 0.96 timeline provenance audit
Reporter timeline events now preserve navigable source/evidence/claim context, including exact evidence locator and supports/contradicts/context stance, without deriving event verification state from claim state. This closes the principal timeline continuity gap identified after DEV 0.95.

### DEV 0.97 entity dossier continuity audit

Entity dossiers now assemble core investigative context from explicit relationship/evidence/lead links before falling back to text-name matching. A relationship's evidence can pull its linked supporting/contradicting claims into the dossier even when those claim/evidence strings omit the entity name. Contextual leads and their reporting tasks are included, while timeline and connector/Aleph findings remain visible as separate reviewed surfaces. No claim, finding, or text mention is promoted to truth by dossier inclusion.

### DEV 0.98 entity identity-history audit

Canonical identity history is now a first-class dossier surface. A canonical dossier inventories merged aliases, reporter-authored same/different/unsure decisions with confidence and rationale, and immutable merge audits. This makes the distinction between provider discovery, reporter identity judgment, and an executed canonical merge visible rather than collapsing them into a single canonical record. Merge history remains audit data; it does not promote connector output or rewrite claim/evidence truth states.

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

## DEV 1.04 — extracted relationship review/provenance audit
- Reviewed document claims can now stage, but not automatically create, a FollowTheMoney relationship.
- The reporter must explicitly choose relationship schema, source canonical entity, and target canonical entity. The proposal is review-required and produces no graph edge until acceptance.
- Promotion attaches the exact Evidence already materialized from the accepted claim, so graph provenance reaches source → document → chunk → character span without text matching.
- Canonical relationship statements retain the extraction-candidate ID as origin, while claim status remains independent; relationship creation does not verify the claim.
- Promotion is transaction-safe with the candidate acceptance (`commit=False` relationship creation inside the review transaction).
- Full backend regression: 193 passed; focused extraction test: 3 passed.

## DEV 1.05 audit — extraction review UI continuity
PASS: The reporter-facing document review can now continue from an accepted extracted claim into a separately reviewed relationship proposal without bypassing canonical entity selection or the second relationship acceptance gate.

PASS: The UI distinguishes machine extraction, reporter-reviewed claim/evidence, staged relationship proposal, and canonical relationship states. Staging alone does not create a graph edge.

REMAINS: Production Next.js build/typecheck requires installed frontend dependencies; live PostgreSQL concurrency, Docker Compose, OpenAleph/ingest-file/ftm-analyze, and a real integrated document remain external validation gates.

# DEV 1.06 claim-verification audit

Claim truth-state changes now have immutable reporter review events with required rationale, prior/new status and confidence, and portable export/restore coverage. A claim review workspace returns supporting/contradicting/context evidence together with canonical relationships that currently depend on that evidence; changing a claim status never deletes or rewrites those relationships. The Next.js review action now records through this audited review primitive and requires rationale. Full backend regression: **194/194 passed**.

### DEV 1.10 relationship evidence audit
Canonical relationships now support multiple first-class evidence attachments. Each attachment retains its original Evidence/Source provenance and independent immutable reporter review history. The old single `evidence_id` remains temporarily for API/data compatibility and is backfilled into the attachment table by migration; new read/review behavior uses the attachment inventory. Remaining follow-up: update all claim/dossier/timeline/provenance dependency queries that still inspect the compatibility pointer so they consume the complete attachment set.

### DEV 1.12 audit note
Many-evidence relationship support now reaches relationship claim advisories, lead triage/provenance snapshots, and reconciled relationship aggregate provenance. These consumers no longer depend on `RelationshipEdge.evidence_id` for investigative behavior. The compatibility field remains in the model/API creation path pending a dedicated removal migration and final search/timeline/frontend compatibility audit.

### DEV 1.14 audit note
PASS: Relationship API and graph presentation no longer expose or consume a singular `provenance.evidence` object. Exact relationship evidence is presented as an attachment inventory, and each attachment remains independently traceable. Reconciled-edge advisory aggregation also uses the evidence ID carried by each claim dependency, preventing secondary attachments from being collapsed onto a legacy primary evidence record. Full backend regression: **200/200 passed**. The database/model creation compatibility field `RelationshipEdge.evidence_id` still exists and should only be removed after a dedicated migration/export-restore audit.

# DEV 1.15 audit — relationship evidence has one authoritative storage path
`RelationshipEdge.evidence_id` has been removed from the ORM/database head. Relationship evidence is authoritative only through `relationship_evidence_attachments`. Creation can still accept an initial `evidence_id` at the API boundary, but it is validated and stored as an attachment rather than a relationship column. Legacy version-1 backups are normalized during restore. Full backend regression: 202/202 passed; SQLite migration upgrade/downgrade/upgrade passed.

## DEV 1.16 — claim verification UI continuity
- Reporter-facing claim review now exposes immutable review history and exact evidence-dependent canonical relationships alongside supporting/contradicting/context evidence.
- This closes a backend/UI gap in the evidence → claim verification → relationship review workflow without mutating canonical facts.

## DEV 1.17 — relationship evidence review UI
PASS: The reporter can now review each exact evidence attachment from the relationship graph itself, with required rationale and immutable history. The UI distinguishes evidence assessment from claim status and does not mutate the canonical relationship when support is challenged. Backend regression remains 202/202. Frontend production build could not be executed because dependencies are not installed in the persisted source snapshot.

### DEV 1.18 relationship evidence attachment workflow
PASS — graph inspector can attach additional exact evidence from the active investigation to an existing canonical relationship, preserve prior attachments, and immediately hand the new attachment into the independent evidence-review workflow.


## DEV 1.19 propagation audit
Relationship evidence review state is now consistently exposed in canonical relationship search results and linked-lead triage. This closes two stale-state interpretation gaps found during the graph → dossier → timeline → lead/search propagation audit. Lead triage explicitly keeps relationship-evidence assessment separate from claim-evidence stance.

## DEV 1.22 — document extraction → exact Evidence provenance hardening
PASS: accepting an evidence extraction proposal now materializes the reviewed chunk character range directly into `Evidence.locator` (`...@chars:start-end`). This makes the Evidence independently exact when consumed later by claims, relationships, dossier/graph/search, or portable backups rather than requiring the extraction-candidate side channel to recover character precision.

PASS: when an extraction proposal supplies a character span, acceptance validates the bounds and requires the staged evidence quote to equal the immutable source chunk slice. Provider/parser drift therefore fails closed instead of producing an Evidence record with false exact provenance.

PASS: portable export/restore retains the character-qualified Evidence locator while the underlying DocumentChunk keeps its original page/line locator. Full backend regression: **205/205 passed**.

## DEV 1.23 — extraction entity pre-accept identity review
- Added `GET /api/extraction-candidates/{candidate_id}/entity-matches` for canonical match preview before entity promotion.
- Provider/OpenAleph `resolved` identifiers remain lead metadata and never select or merge a Workbench entity automatically.
- Strong likely matches fail closed: blind acceptance is rejected until the reporter explicitly records `same`, `different`, or `create_new`.
- `same` reuses the existing canonical entity and adds the accepted extraction/provider provenance statement without creating a duplicate entity.
- `different` creates the separate canonical entity and records an explicit immutable negative canonical-resolution decision.
- Focused extraction provenance/identity regression: 6/6 passed; full backend regression: 207/207 passed.
