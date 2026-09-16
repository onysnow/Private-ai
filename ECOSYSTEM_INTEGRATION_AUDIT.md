# Ecosystem integration audit — DEV 0.86

This audit is a build constraint, not a wishlist. Workbench should use maintained ecosystem components for commodity infrastructure and reserve custom code for reporter-specific evidence, verification, provenance, review, and workflow behavior.

## OpenAleph / FollowTheMoney

**Decision: integrate as core local corpus platform.**

OpenAleph 5.3.1 currently depends directly on FollowTheMoney 4.x, `openaleph-search`, `ftmq`, `nomenklatura`, `followthemoney-compare`, and the OpenAleph service layer. Its official deployment includes PostgreSQL, Elasticsearch, Redis, `ingest-file`, `ftm-analyze`, OpenAleph worker/API, and the Aleph UI.

DEV 0.86 therefore adds those services to the root Docker Compose stack instead of expanding Workbench into another general-purpose corpus/search/ingestion engine. Workbench keeps a separate PostgreSQL database for reporter-specific records such as exact evidence selections, claim stances, workflow state, and review/audit metadata.

Sources:
- https://openaleph.org/docs/
- https://github.com/openaleph/openaleph/blob/main/pyproject.toml
- https://github.com/openaleph/openaleph/blob/main/docker-compose.example.yml
- https://openaleph.org/docs/lib/ingest-file/

## `ingest-file`

**Decision: delegate generic extraction/ingestion to OpenAleph's ingestion boundary as integration deepens.**

It already supports PDFs, images, web/XML, email, archives, and audio/video transcription hooks and emits FollowTheMoney entities. Workbench's current custom extraction remains compatibility scaffolding until OpenAleph ingestion output is mapped back into Workbench's exact-provenance review flow.

License note: current `ingest-file` is AGPLv3-or-later. Deployment and distribution implications must be reviewed before packaging.

## Nomenklatura + followthemoney-compare

**Decision: delegate candidate generation/entity comparison mechanics; retain Workbench reporter decisions and audit trail.**

OpenAleph itself already depends on these components. Workbench should not continue growing parallel generic duplicate-matching algorithms once an adapter preserves the existing explicit Same/Different/Unsure review semantics and provenance.

## Zavod / crawler layer

**Decision: use for repeatable public-source FollowTheMoney pipelines where suitable.**

Workbench should consume crawler output as reviewable external material rather than own a large crawler framework.

## SHATTERED (mantisfury/ArkhamMirror)

**Verified project:** https://github.com/mantisfury/ArkhamMirror

**License:** MIT.

**Status observed during DEV 0.86 audit:** actively developed 2025–2026, local-first, modular shard architecture, PostgreSQL/pgvector, works without an LLM with AI features disabled. The project currently advertises document ingestion/parsing/OCR, entities, search, graph, timeline, claims, contradictions, credibility assessment, Analysis of Competing Hypotheses (ACH), pattern/anomaly analysis, media forensics, provenance, and optional AI.

**Decision: do not embed the whole SHATTERED application into the core stack.** Doing so would create a second document/search/entity/graph/timeline platform next to OpenAleph and would violate the no-duplication rule.

**Candidate SHATTERED capabilities to integrate selectively after API/contract review:**
- credibility/source-assessment methods;
- non-AI portions of Analysis of Competing Hypotheses;
- media-forensics functions such as metadata/perceptual-hash/authenticity checks;
- specialized contradiction/pattern analysis only where it provides behavior OpenAleph + Workbench do not already provide.

Graph, generic ingestion, generic search, entity storage, and timeline functionality are not candidates for wholesale duplication because the selected stack already owns those responsibilities.

Before importing any SHATTERED package, the specific shard API, data contract, dependency surface, and provenance behavior must be inspected and covered by an adapter test.

## Current ownership target

OpenAleph/FollowTheMoney ecosystem:
- corpus storage and full-text search;
- generic document ingestion/extraction;
- FollowTheMoney entity representation;
- generic entity comparison/resolution mechanics;
- entity analysis/indexing;
- public-source FtM crawler infrastructure.

Journalism Workbench:
- investigation-facing orchestration;
- exact evidence selections and locators;
- claims and supports/contradicts/context semantics;
- human verification/promotion gates;
- source-to-claim provenance;
- reporting questions/leads/tasks;
- reporter-facing audit/reconciliation semantics;
- cross-system provenance links;
- later, evidence-bounded local AI.

SHATTERED:
- selectively reused specialist analysis shards only when they add capabilities not already owned by OpenAleph/FollowTheMoney/Workbench.


## DEV 0.87 corpus bridge

The OpenAleph integration now uses the maintained `openaleph-client` package for collection creation/reuse and document ingestion. Workbench persists only the mapping/synchronization state needed to connect reporter workflow records to the corpus platform. This is an adapter boundary, not a competing ingestion implementation.
