# Changelog

## 1.7 — 2026-09-16

- Closed a ground-truth-contamination gap surfaced by adversarial regression testing (test A24): `EVALUATION/PROMPT_QA_RUBRIC.md`'s evaluation protocol now requires verifying that each ground-truth answer is itself evidence-supported before scoring a run against it, and requires treating a flawed ground truth — not a correct, conservative model output that disagrees with it — as the defect to fix. Previously the protocol defined a ground-truth test set but never required auditing the ground truth's own validity, so a bad ground-truth answer could have caused a correct module output to be wrongly scored as a failure.
- This completes adversarial regression coverage of all 32 named tests in `ADVERSARIAL_TEST_SUITE.md` across Modules 01–06 and 08–12 (Module 07 has no dedicated numbered test but was separately checked against its own pretexting/impersonation prohibition).
- No other files changed.

## 1.6 — 2026-09-16

- Established Topic Authority System (TAS) as the official product name. This package is now titled and self-identifies as "Topic Authority System: Investigative & Legal-Document Evidence Edition" — TAS is the reusable brand/architecture name, and "Investigative & Legal-Document Evidence Edition" is this build's subtitle, naming the one domain this specific edition's source hierarchy, standard, and modules actually govern.
- Updated `README.md` title, metadata, and cross-domain-builder section accordingly.
- Updated the first-chat bootstrap prompt (`CORE/00_START_HERE_BOOTSTRAP_PROMPT.md` and its plain-text copy) so the AI's own activation banner and required acknowledgment explicitly name Topic Authority System and this edition, rather than only the generic "source-first investigative framework" phrasing.
- Added a one-line "Part of Topic Authority System — Investigative & Legal-Document Evidence Edition" byline under the title of every CORE, PROMPT_MODULES, PROMPT_TEMPLATES, VISUAL_STANDARDS, EVALUATION, REFERENCE_NOTES, SOURCE_INDEX, and PROMPT_MODULE_CATALOG file, so the edition identity travels with each file individually rather than living only in the README.
- Updated `META/UNIVERSAL_DOMAIN_GUIDANCE_SYSTEM_BUILDER_PROMPT.md` (and its plain-text copy) to require that every future domain build produced by that prompt is packaged as its own named TAS edition (`Topic Authority System: [DOMAIN SUBTITLE] Edition`), while making explicit that no two editions share source hierarchies or authorities merely because they share the TAS name and layout.
- Renamed the human-readable guide files from `Investigative_Prompt_Engineering_Human_Guide_v1.3.{docx,pdf}` to `TAS_Investigative_Legal_Document_Edition_Human_Guide_v1.6.{docx,pdf}` and updated their title page and running header to match; updated every manifest reference to the new filenames.
- Updated `FULL_PACKAGE_MANIFEST.txt` and `PROJECT_SOURCE_SET_MANIFEST.md` headers, version, and file listings.
- This is a naming/identity change only. No rule, module, schema, or evidentiary behavior changed from v1.5.

## 1.5 — 2026-09-16

- Closed a citation-proximity gap surfaced by adversarial regression testing (test A19): Module 02 (Source Verification) now explicitly requires that a cited passage support the exact proposition stated — including scope, specificity, time period, and qualifiers — and not merely discuss the same topic. This rule previously existed only in `CORE/INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md` section 14 and was not repeated in the module's own self-contained text.
- No other files changed.

## 1.4 — 2026-09-16

- Closed a corroboration-independence gap surfaced by adversarial regression testing (test A05, duplicate quoted email): Module 01 (Evidence Extraction), Module 02 (Source Verification), and Module 08 (Case Synthesis) now each explicitly require that a forwarded, requoted, or republished copy of the same underlying statement be extracted once and never counted as an additional independent corroborating source.
- Added a `restates_evidence_id` field to the evidence record schema in `EVALUATION/OUTPUT_SCHEMAS.md` so a restatement can be linked back to its original record and the linkage is machine-checkable rather than left to narrative discipline alone.
- Added a matching "Restates (evidence ID, if any)" column to Module 01's evidence-records output table and a restated-versus-independent count to its final check.
- This closes a gap that previously depended on the source-isolation guidance in `CORE/INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md` section 7.2 being active in the same context as a module; the rule now travels with each affected module on its own.
- No other files changed. The archive, human-readable guide, and templates remain the v1.3 versions.

## 1.3 — 2026-09-16

- Corrected the self-contained Project Source Set so all twelve task modules are included and available for mandatory routing.
- Changed setup guidance from manually adding task modules mid-workflow to keeping operational guidance indexed while retrieving only task-relevant files.
- Expanded the bootstrap availability check to verify task-relevant modules, visual-decision guidance, schemas, and adversarial tests when required.
- Added a task-dependency-missing status so the framework cannot claim a routed workflow stage was completed when its required module is unavailable.
- Updated the human guide, plain-text bootstrap, manifests, and release packages to match the corrected architecture.

## 1.2 — 2026-09-16

- Added a polished human-readable DOCX/PDF guide covering setup, architecture, file/folder roles, workflows, visual standards, source-backed benefits, limitations, authority, provenance, maintenance, and integrity.
- Added plain-text human-use copies of the bootstrap and universal builder prompts.
- Added `META/UNIVERSAL_DOMAIN_GUIDANCE_SYSTEM_BUILDER_PROMPT.md`, a reusable prompt for rebuilding the same source-first architecture for a different domain/topic.
- Updated the README to document the human guide and cross-domain builder.
- Rebuilt integrity manifests and final release ZIPs.
- The external source archive itself was not substantively replaced; v1.2 packages preserve the v1.1 archived source set and provenance records.

## 1.1 — 2026-09-16

- Added the source-first first-chat bootstrap prompt with a verified-access acknowledgment and honest project-working-memory definition.
- Added the Legal and Investigative Visual Standard and expanded visual-type decision matrix.
- Added an integrated library of thirteen ready-to-run prompts that invoke the core standards, modules, schemas, visual rules, and audits.
- Added Visual Selection and Specification and Legal Document and Prompt Audit modules.
- Added the Legal Document and Prompt Audit Guide with document-type overlays, sampling controls, severity rules, and human/legal review gates.
- Added corpus, visual-element, audit-finding, and prompt-evaluation schemas.
- Expanded the adversarial suite for illustrative-aid status, missing flow intermediaries, misleading scales, accessibility, OCR, document-version state, legal authority, and hidden protected content.
- Archived additional official or peer-reviewed sources for visual design, accessibility, ESI, AI risk/evaluation, technology-assisted review, long-context retrieval, ChatGPT Projects, and latency; recorded verified-mirror and link-only limitations.
- Rewrote the README with a source-backed explanation of the architecture, benefits, setup, file map, and limitations.

## 1.0 — 2026-09-16

- Created evidence-first investigative prompt-engineering standard.
- Added compact ChatGPT Project instructions.
- Added source-authority and retrieval policy.
- Added ten reusable prompt modules.
- Added QA rubric, adversarial test suite, and output schemas.
- Archived current prompt-engineering sources, academic papers, the Netherlands Forensic Institute benchmark repository, the World Bank/UNODC StAR handbook, and the user-supplied FATF 2025 Asset Recovery Guidance.
- Recorded canonical link-only authorities for the FATF 2012 Financial Investigations Guidance and the FFIEC BSA/AML Manual.
