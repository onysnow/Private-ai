# Module 10 — Final Accuracy Audit

*Part of Topic Authority System (TAS).*

## Use when

Performing the last high-scrutiny review of a report, master document, prompt, dataset output, or visual package.

## Prompt

```text
ROLE
Act as an independent evidence auditor. Your job is to find material defects, not to defend the draft.

OBJECTIVE
Determine whether the deliverable is accurate, complete within scope, traceable, internally consistent, and ready for its stated audience.

INPUTS
Deliverable: [FILE]
Controlling sources: [SOURCE SET]
Required scope/output: [REQUIREMENTS]
Materiality: [MATERIALITY] — what the operator states counts as consequential for this case; if not stated, treat the work as consequential.

COMPLETE THESE PASSES BEFORE CONCLUDING
1. Scope and corpus pass
2. Claim-to-evidence pass
3. Chronology and arithmetic pass
4. Entity and attribution pass
5. Contradiction and exculpatory-evidence pass
6. Citation, link, quotation, and identifier pass
7. Output-completeness and presentation pass

ADVERSARIAL CHECKS
- Find the strongest unsupported claim.
- Find the citation that least supports its sentence.
- Find the most plausible alternative explanation omitted.
- Find any statement that upgrades an allegation or inference into fact.
- Find any “not found” language that implies nonexistence.
- Find any date-type, amount, currency, ownership, or arrow-direction error.
- Find any task or source that was skipped but not disclosed.
- Find any finding that accuses an identifiable person or organization, or states adverse conduct by one, with no right-of-reply record, or with an exception no named person decided (Module 08 rule 10; checkpoint CP-01). In a deliverable meant for publication this is a blocking defect.
- Find any list or section whose length or structure was set by format rather than findings: equal or round counts across topics that no module prescribes (Module 07's top five acquisitions is prescribed), a list cut with no statement of how much was cut, a stated count that does not match the items, a table cell filled because the column demanded it, or a finding dropped because it fit no section.

OUTPUT
A. Verdict: PASS / PASS WITH CORRECTIONS / LIMITED REVIEW / FAIL
B. Blocking defects
C. Material corrections
D. Non-material corrections
E. Pass-by-pass audit record with evidence
F. Corrected wording for every overstated claim
G. Unresolved limitations
H. Explicit statement of what was and was not verified

Record each defect in B–D as an audit finding record (`EVALUATION/OUTPUT_SCHEMAS.md`), its `reviewer_type` naming who made the check.

Use LIMITED REVIEW when a review scope or source-availability limitation — not a defect in the work itself — prevents completing one or more passes; state the limitation explicitly. This is distinct from FAIL, which means the deliverable contains a blocking defect within the scope actually reviewed.

Precedence: A blocking defect found in the scope reviewed is FAIL even when another pass could not be completed; state the limitation alongside it. Use LIMITED REVIEW only when no blocking defect was found in the scope reviewed and a scope/source-availability limitation prevented completing a pass. Do not issue PASS when any pass is incomplete. Do not issue PASS until all seven passes are complete and no blocking defect remains. Issue PASS WITH CORRECTIONS only when all seven passes are complete, no blocking defect remains, and material corrections are listed in C; when a pass could not be completed, material corrections are listed under LIMITED REVIEW instead.
```

