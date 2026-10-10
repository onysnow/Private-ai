# Prompt Module Catalog

*Part of Topic Authority System (TAS).*

This catalog routes tasks to the thirteen modules in `PROMPT_MODULES/`.

| Module | Primary job | Expected input | Main output |
|---|---|---|---|
| 01 Evidence Extraction | Convert raw sources into traceable records | Original files or bounded corpus | Corpus inventory and evidence table |
| 02 Source Verification | Verify claims, citations, and links | Claims plus allowed sources | Claim-by-claim verification matrix |
| 03 Timeline Reconstruction | Build and audit chronology | Evidence records | Event table and date-conflict log |
| 04 Entity and Relationship Analysis | Resolve entities and map precise relationships | Evidence records and filings | Entity and relationship registers |
| 05 Financial Flow Analysis | Build ledger, reconcile totals, analyze flows | Transactions and financial records | Transaction ledger, reconciliation, indicators, flow spec |
| 06 Hypothesis and Contradiction Testing | Test theories against alternatives | Findings and evidence | Hypothesis matrix and contradiction log |
| 07 Investigative Gap Analysis | Prioritize next records and interviews | Findings, inventory, constraints | Acquisition dashboard |
| 08 Case Synthesis | Produce final evidence-linked report | Validated intermediate outputs | Investigative report and claim appendix |
| 09 Visual Evidence Audit | Audit case visuals factually and visually | Visual plus controlling evidence | Element-by-element defect record |
| 10 Final Accuracy Audit | Perform independent high-scrutiny review | Deliverable plus source set | Verdict (PASS / PASS WITH CORRECTIONS / LIMITED REVIEW / FAIL) and audit trail |
| 11 Visual Selection and Specification | Choose and specify an evidence-traceable visual before production | Validated data/evidence plus visual question | Visual specification and element-to-evidence table |
| 12 Legal Document and Prompt Audit | Audit legal/investigative documents, prompts, AI outputs, or review workflows | Audit object plus controlling sources/ground truth | Severity-ranked defects, corrections, review gates, and verdict |
| 13 Rule Application Element Map | Map established evidence to each element of a rule the user supplies, and stop before any legal conclusion | Rule text and citation supplied by the user, plus evidence, claim and gap records | Element-map record (ELEM-): elements, evidence for and against, gaps, standard of proof, questions for counsel |

## Routing rules

- Do not start with Case Synthesis when raw records have not been extracted.
- Use Source Verification before publishing consequential allegations.
- Use Timeline Reconstruction separately when dates or causation are central.
- Use Entity and Relationship Analysis before drawing a relationship graph.
- Use Financial Flow Analysis before drawing money arrows.
- Use Visual Selection and Specification before creating a consequential visual; use Visual Evidence Audit on the rendered result.
- Use Legal Document and Prompt Audit for legal-facing documents, legal citations, ESI workflows, prompts, and AI outputs.
- Use Rule Application Element Map when the user names a legal or regulatory rule (statute, regulation, code section, contract term) and asks how the facts bear on it. Run it only after Module 07 and Module 08 have produced the facts it maps; it is not a substitute for Module 12's legal-document audit. Without the rule's text supplied by the user it stops and lists what is needed. It ends with what counsel or the forum must decide, never a conclusion.
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
  -> Element map against a supplied rule, when one is in question
  -> Visual specification/rendered audit when applicable
  -> Independent document/prompt/final audit
```

Do not paste every module into one prompt. Each module is a stage with an inspectable output.
