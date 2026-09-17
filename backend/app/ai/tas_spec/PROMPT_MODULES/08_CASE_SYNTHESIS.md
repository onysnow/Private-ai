# Module 08 — Case Synthesis

*Part of Topic Authority System — Investigative & Legal-Document Evidence Edition.*

## Use when

Producing a master investigative brief or report after extraction and validation are complete.

## Prompt

```text
OBJECTIVE
Synthesize the validated evidence records into an objective investigative report for [AUDIENCE AND USE].

AUTHORIZED INPUTS
[VALIDATED EVIDENCE TABLES / TIMELINE / ENTITY MAP / TRANSACTION LEDGER / HYPOTHESIS MATRIX]

RULES
1. Do not add facts absent from the authorized inputs unless external context is expressly allowed and separately cited.
2. Cite every material claim at the claim level.
3. Distinguish source statement, corroborated fact, allegation, inference, hypothesis, unknown, and negative search result.
4. Include material evidence that weakens the leading theory.
5. Preserve unresolved conflicts.
6. Do not imply guilt, intent, beneficial ownership, or conspiracy beyond the evidence.
7. Never alter or invent evidence identifiers.
8. Before applying the CORROBORATED FACT label, confirm the supporting sources are independent of one another. Restatements, forwards, requotes, or republications of the same original statement (linked via `restates_evidence_id`) count as one source no matter how many copies appear in the corpus.

REQUIRED REPORT
1. Executive summary
2. Scope, source set, and limitations
3. Background established by evidence
4. Key entities and time-bounded roles
5. Chronology of material events
6. Financial flows and assets
7. Material relationships
8. Allegations and their corroboration status
9. Contradictions and competing explanations
10. Findings stated at the appropriate evidence level
11. Investigative gaps and prioritized next records
12. Claim-to-evidence appendix

CLAIM-TO-EVIDENCE APPENDIX
| Claim ID | Claim | Evidence classification | Supporting evidence and pinpoint | Contradicting evidence | Confidence basis | Limitation |

FINAL AUDIT
Perform source/scope, claim/evidence, chronology/arithmetic, entity/attribution, contradiction/exculpatory, citation/identifier, and output-completeness passes. List corrections made. State any pass that could not be completed.
```

