# Journalism Workbench stack ownership

This file is an architectural guardrail: before adding a custom subsystem, check whether the established FollowTheMoney/OpenAleph ecosystem already owns that capability.

## Delegate to the core ecosystem

| Capability | Preferred owner | Workbench rule |
|---|---|---|
| FollowTheMoney schemas/entity semantics | `followthemoney` | Do not invent parallel entity/relationship schema semantics. |
| Large-scale searchable investigative corpus, collections, structured/unstructured storage | OpenAleph | Treat OpenAleph as the corpus/search platform as integration deepens. Do not grow a second general-purpose investigative search platform. |
| File/archive/email/PDF/media extraction pipeline | `ingest-file` | Migrate generic extraction/OCR/archive handling to this boundary rather than expanding custom format handlers. Preserve Workbench review/provenance semantics around its output. |
| Entity matching, deduplication resolver, merge judgments | `nomenklatura` (+ FtM comparison) | Migrate candidate generation/resolver mechanics to this boundary. Preserve reporter-facing review history and Workbench provenance. |
| Repeatable public-source crawlers to FtM | `zavod` | Use for source-specific crawler/enrichment jobs where suitable; Workbench consumes outputs as reviewable material. |
| OpenSanctions entity search/matching | OpenSanctions/yente | Keep as an external enrichment provider; never silently canonicalize returned candidates. |
| Aleph/OpenAleph transfer/API plumbing | official OpenAleph/Aleph client/library interfaces | Prefer official client/API behavior over bespoke bulk-transfer code. |
| Specialist non-AI analytical techniques | SHATTERED specialist analysis shards where they add unique value | Reuse selectively behind adapters; do not deploy SHATTERED as a second corpus/search/entity platform. |

## Workbench-owned capabilities

These are deliberately custom because they encode the reporting workflow rather than commodity corpus plumbing:

- Exact evidence capture and source locator provenance.
- Claim lifecycle and supports / contradicts / context evidence stances.
- Reporter-controlled verification and promotion gates.
- Strict segregation of unverified external connector leads from canonical facts.
- Provenance traces that bridge document/extraction/evidence/claim/relationship/lead/task records.
- Reporting leads, tasks, workflow history and contradiction-aware triage.
- Reporter-facing dossiers and graph presentation rules, including reversible duplicate presentation.
- Local AI reasoning contract: retrieval packets carry citations and evidence classes; external leads cannot become factual citations merely because an LLM retrieved them.
- Portable Workbench-specific backup/export and local security policy for the custom reporting layer.

## Transitional custom code

Existing custom ingestion, search, entity resolution and relationship persistence remain supported until their replacement boundaries are validated. They are **compatibility scaffolding**, not the target architecture. Do not add broad new functionality to these areas unless required to preserve Workbench-specific provenance/review behavior.

Migration must be incremental: replacement is accepted only when existing end-to-end provenance and reporter-review tests continue to pass.

## Sources checked

- OpenAleph: https://openaleph.org/docs/
- ingest-file: https://openaleph.org/docs/lib/ingest-file/
- FollowTheMoney: https://github.com/opensanctions/followthemoney
- nomenklatura: https://github.com/opensanctions/nomenklatura
- zavod: https://zavod.opensanctions.org/
- OpenSanctions open-source components: https://www.opensanctions.org/docs/opensource/


See `ECOSYSTEM_INTEGRATION_AUDIT.md` for the verified SHATTERED scope and the DEV 0.86 integration decisions.


## Corpus bridge implementation

DEV 0.87 establishes the first enforced ownership boundary: Workbench persists investigation/document references and reporter review metadata; `openaleph-client` drives generic document ingestion into OpenAleph. The custom `documents.py` extraction pipeline is transitional compatibility code and should shrink once live OpenAleph ingestion/search is verified.

## DEV 0.88 ownership refinement

OpenAleph/`ingest-file` now owns the upstream extraction of page text in the integrated architecture. Workbench owns the downstream reporter decision about whether extracted text becomes evidence. Provider output is imported as a proposal with exact provenance, not as canonical truth. This same boundary should be applied to OpenAleph/`ftm-analyze` entity extraction before removing Workbench's transitional generic name detector.


## DEV 0.89 ownership refinement

OpenAleph/`ftm-analyze` now owns named-entity detection in the integrated target architecture. Workbench imports FollowTheMoney `Mention` output only as reviewable entity candidates. A provider `resolved` target is evidence for a possible identity match, not authority to canonicalize it. Workbench continues to own the reporter decision, audit trail, statement provenance, and later canonical-resolution/merge workflow.

## DEV 0.90 document-review ownership boundary

OpenAleph/`ingest-file`/`ftm-analyze` own provider-side generic document parsing, OCR, Page creation, Mention extraction, and schema prediction. Workbench owns synchronization bookkeeping, review queue state, exact provenance retention, reporter accept/reject decisions, canonical entities, evidence, claims, relationship truth, dossiers/graph/timeline, leads/tasks, and export/backup. The new combined refresh endpoint only stages provider outputs; it deliberately cannot establish canonical or evidentiary truth.

