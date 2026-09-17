# Prompt Module Catalog

*Part of Topic Authority System — Investigative & Legal-Document Evidence Edition.*

This catalog routes tasks to the individual modules in `PROMPT_MODULES/`.

| Module | Primary job | Expected input | Main output |
|---|---|---|---|
| 01 Evidence Extraction | Convert raw sources into traceable records | Original files or bounded corpus | Corpus inventory and evidence table |
| 02 Source Verification | Verify claims, citations, and links | Claims plus allowed sources | Claim-by-claim verification matrix |
| 03 Timeline Reconstruction | Build and audit chronology | Evidence records | Event table and date-conflict log |
| 04 Entity Relationship Analysis | Resolve entities and map precise relationships | Evidence records and filings | Entity and relationship registers |
| 05 Financial Flow Analysis | Build ledger, reconcile totals, analyze flows | Transactions and financial records | Transaction ledger, reconciliation, indicators, flow spec |
| 06 Hypothesis and Contradiction Testing | Test theories against alternatives | Findings and evidence | Hypothesis matrix and contradiction log |
| 07 Investigative Gap Analysis | Prioritize next records and interviews | Findings, inventory, constraints | Acquisition dashboard |
| 08 Case Synthesis | Produce final evidence-linked report | Validated intermediate outputs | Investigative report and claim appendix |
| 09 Visual Evidence Audit | Audit case visuals factually and visually | Visual plus controlling evidence | Element-by-element defect record |
| 10 Final Accuracy Audit | Perform independent high-scrutiny review | Deliverable plus source set | Pass/fail verdict and audit trail |
| 11 Visual Selection and Specification | Choose and specify an evidence-traceable visual before production | Validated data/evidence plus visual question | Visual specification and element-to-evidence table |
| 12 Legal Document and Prompt Audit | Audit legal/investigative documents, prompts, AI outputs, or review workflows | Audit object plus controlling sources/ground truth | Severity-ranked defects, corrections, review gates, and verdict |

## Routing rules

- Do not start with Case Synthesis when raw records have not been extracted.
- Use Source Verification before publishing consequential allegations.
- Use Timeline Reconstruction separately when dates or causation are central.
- Use Entity Relationship Analysis before drawing a relationship graph.
- Use Financial Flow Analysis before drawing money arrows.
- Use Visual Selection and Specification before creating a consequential visual; use Visual Evidence Audit on the rendered result.
- Use Legal Document and Prompt Audit for legal-facing documents, legal citations, ESI workflows, prompts, and AI outputs.
- Use Hypothesis Testing when the investigation has a leading theory.
- Use the Final Accuracy Audit in a fresh context when practical.

## Composition pattern

For a large investigation, pass validated outputs between modules:

```text
Raw sources
  -> Evidence records
  -> Verified claims + resolved entities
  -> Timeline + transaction ledger
  -> Hypothesis and gap matrices
  -> Case synthesis
  -> Visual specification/rendered audit when applicable
  -> Independent document/prompt/final audit
```

Do not paste every module into one prompt. Each module is a stage with an inspectable output.
