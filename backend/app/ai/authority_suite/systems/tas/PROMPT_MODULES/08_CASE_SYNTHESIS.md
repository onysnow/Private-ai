# Module 08 — Case Synthesis

*Part of Topic Authority System (TAS).*

## Use when

Producing a master investigative brief or report after extraction and validation are complete.

## Prompt

```text
OBJECTIVE
Synthesize the validated evidence records into an objective investigative report for [AUDIENCE AND USE].

AUTHORIZED INPUTS
[VALIDATED EVIDENCE TABLES / TIMELINE / ENTITY MAP / TRANSACTION LEDGER / HYPOTHESIS MATRIX]
Materiality: [MATERIALITY] — what the operator states counts as consequential for this case; if not stated, treat the work as consequential.

RULES
1. Do not add facts absent from the authorized inputs unless external context is expressly allowed and separately cited.
2. Cite every material claim at the claim level and state the warrant — why the cited evidence supports this specific claim, not merely that it is topically related.
3. Distinguish the eight evidence classifications of `CORE/INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md` §4: source statement, corroborated fact, allegation or testimony, inference, hypothesis, unknown, negative search result, and unresolved conflict.
4. Include material evidence that weakens the leading theory.
5. Preserve unresolved conflicts.
6. Do not imply guilt, intent, beneficial ownership, or conspiracy beyond the evidence.
7. Never alter or invent evidence identifiers.
8. Before applying the CORROBORATED FACT label, confirm the supporting sources are independent of one another. Restatements, forwards, requotes, or republications of the same original statement (linked via `restates_evidence_id`) count as one source no matter how many copies appear in the corpus. One source, however detailed or authoritative, is not corroboration: a claim that rests on a single source, including a figure only the subject itself reports, is a SOURCE STATEMENT.
9. Before drafting, state the single most likely way this report could later be shown wrong, overstated, or missing something material, then check whether the evidence in hand already addresses that failure mode; if it doesn't, surface it under Investigative gaps rather than silently proceeding. Write the statement as a short note before the report, headed "Most likely way this report is wrong", and carry any part the evidence does not address into section 11.
10. Right of reply (checkpoint CP-01): for each identifiable person or organization a finding accuses, or states adverse conduct by, record whether the subject was offered the chance to respond before publication — told what will be said, given time to answer, and how the answer is reported — as a right-of-reply record (`EVALUATION/OUTPUT_SCHEMAS.md`). The offer is made by a person, not by you; draft the questions when asked. An exception (no approach made) is decided and named by a person, with its reason. A finding with no record, or with an exception no person decided, is not ready for publication; say so in section 8.
11. An unsourced characterisation of a person or organisation in background text (a reputation, "notorious", "trusted", "fixer") is not a claim to rate. Quote it in section 2 as the background's own words, attributed to the background; give it no row in the findings or the appendix, no confidence level, and no place in the executive summary or a conclusion. If the operator needs it assessed, list under section 11 the evidence that would be needed.

REQUIRED REPORT
1. Executive summary
2. Scope, source set, and limitations
3. Background established by evidence
4. Key entities and time-bounded roles
5. Chronology of material events
6. Financial flows and assets
7. Material relationships
8. Allegations, their corroboration status, and each subject's right-of-reply record (rule 10)
9. Contradictions and competing explanations
10. Findings stated at the appropriate evidence level
11. Investigative gaps and prioritized next records, beginning with any part of rule 9's statement of the most likely way this report could be shown wrong that the evidence in hand does not address
12. Claim-to-evidence appendix

CLAIM-TO-EVIDENCE APPENDIX
| Claim ID | Claim | Evidence classification | Supporting evidence and pinpoint | Contradicting evidence | Warrant | Confidence basis | Confidence (LOW/MEDIUM/HIGH) | Confidence term | Limitation |

Confidence and Confidence term are the Claim record's `confidence` and `confidence_term` (`EVALUATION/OUTPUT_SCHEMAS.md`; `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` Rules 2–3).

FINAL AUDIT
Perform source/scope, claim/evidence, chronology/arithmetic, entity/attribution, contradiction/exculpatory, citation/identifier, and output-completeness passes. List corrections made. State any pass that could not be completed.
```

