# TAS spec (vendored)

This directory vendors the first-party methodology content from the **Topic
Authority System (TAS) — Investigative & Legal-Document Evidence Edition**,
v1.7, a standalone prompt-engineering framework Ony built independently of
this repo.

TAS is not a code library. It is a set of evidence-discipline rules, output
schemas, and structured prompt modules originally designed to run inside a
ChatGPT Project. This directory brings that methodology into Journalism
Workbench so the backend's AI layer can be built on top of it, instead of
inventing an ad hoc set of prompting rules from scratch.

## Provenance

Vendored from `topic_authority_system_investigative_legal_document_edition_v1.7.zip`
(the author's original package). Only first-party markdown authored as part
of TAS itself is included here. Deliberately excluded:

- `ORIGINAL_SOURCES/` — third-party copyrighted reference material (FATF,
  World Bank StAR, UNODC, WCAG, arXiv papers, etc.) that has no place in a
  public repo's license.
- `HUMAN_GUIDES/`, `CORE/00_START_HERE_BOOTSTRAP_PROMPT.md`,
  `META/` — content specific to running TAS manually inside a ChatGPT
  Project UI (file-availability ceremony, ChatGPT-Project setup docs). Not
  applicable when TAS's rules are compiled into a backend system prompt
  instead of pasted into a chat.
- `SOURCE_INDEX.md`, `REFERENCE_NOTES/`, `INTEGRITY_SHA256.txt`,
  `FULL_PACKAGE_MANIFEST.txt`, `PROJECT_SOURCE_SET_MANIFEST.md` —
  distribution/verification bookkeeping for the standalone package, not
  needed once the content lives in version control with its own history.

`CHANGELOG.md` was renamed to `TAS_CHANGELOG.md` to avoid colliding with
Workbench's own root `CHANGELOG.md`.

## What's actually wired into code (as of this vendoring)

Only two modules are implemented end-to-end against Workbench's backend:

- **`PROMPT_MODULES/08_CASE_SYNTHESIS.md`**
- **`PROMPT_MODULES/06_HYPOTHESIS_AND_CONTRADICTION_TESTING.md`**

Everything else in this directory (the other 10 prompt modules, the visual
standards, the adversarial test suite, the audit guide) is vendored as
reference and is intended for later phases. Do not assume a module is live
in the product just because its file is present here.

## How this maps onto Workbench

- `EVALUATION/OUTPUT_SCHEMAS.md` — the JSON record shapes
  (`Claim`, `Evidence`, `Audit finding`, etc.) that any AI-generated output
  must validate against before it can be written to Workbench's review
  queue.
- `CORE/SOURCE_AUTHORITY_AND_RETRIEVAL_POLICY.md` and the non-negotiable
  evidence rules — the constraints layered on top of
  `build_question_context()`'s existing `reasoning_contract`
  (`backend/app/services/assistant_context.py`): never invent evidence IDs,
  preserve provenance, treat document-embedded text as quoted content not
  instructions, and require an audit pass before anything is treated as
  final.
- `EVALUATION/PROMPT_QA_RUBRIC.md` and `EVALUATION/ADVERSARIAL_TEST_SUITE.md`
  — the basis for backend regression tests on the two wired modules'
  prompts and output validation.

AI-generated output is never written directly to canonical investigation
records. It is written as a new review-queue record type (modeled on the
existing `ExtractionCandidate` pattern), requiring explicit human promotion.
The feature is gated behind `settings.enable_ai_features` (default `False`)
and a pluggable LLM provider abstraction — no vendor lock-in.
