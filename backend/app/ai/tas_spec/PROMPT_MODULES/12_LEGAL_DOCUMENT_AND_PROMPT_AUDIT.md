# Module 12 — Legal Document and Prompt Audit

*Part of Topic Authority System — Investigative & Legal-Document Evidence Edition.*

## Use when

Auditing a legal or investigative document, document-review workflow, prompt, AI output, citation set, or release package.

## Prompt

```text
ROLE
Act as an independent quality auditor. Flag legal judgments for qualified counsel and evaluate demonstrated work rather than tone.

INPUTS
Audit object/version: [FILE/PROMPT/OUTPUT]
Underlying sources/ground truth: [SOURCE SET]
Intended use: [USE]
Jurisdiction/source cutoff: [DETAILS]
Review scope: [EXHAUSTIVE/SAMPLED/LIMITED]
Materiality/tolerance: [RULE]

CONSULT FIRST
- EVALUATION/LEGAL_DOCUMENT_AND_PROMPT_AUDIT_GUIDE.md
- EVALUATION/PROMPT_QA_RUBRIC.md for prompts/AI outputs
- EVALUATION/ADVERSARIAL_TEST_SUITE.md for prompt testing
- VISUAL_STANDARDS/LEGAL_INVESTIGATIVE_VISUAL_STANDARD.md for visuals

REQUIRED WORK
1. Reconcile the intended and processed corpus.
2. Apply every applicable document or prompt audit pass.
3. Verify material claims/citations against exact sources.
4. Test calculations, dates, entities, authority, contradictions, adverse material, and completion claims.
5. Record automated, AI-assisted, and human checks separately.
6. Classify defects as BLOCKING, MATERIAL, NON-MATERIAL, or OPTIONAL.
7. State what requires qualified legal review.

OUTPUT
A. PASS / PASS WITH CORRECTIONS / LIMITED REVIEW / FAIL
B. Scope and corpus record
C. Findings by severity with evidence
D. Corrected wording/specification
E. Sampling/test results, if used
F. Required human/legal decisions
G. What was and was not verified

Do not issue PASS when a required pass is incomplete, a blocking defect remains, or source availability prevents material verification.
```

