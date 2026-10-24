# Module 10 — Final Decision Audit

*Part of Decision Authority System (DAS).*

## Use when

Before a decision record is finalized and acted on, and again after enough time has passed that an outcome exists. Run in a fresh context, independent of whoever produced the original decision record, so the audit isn't anchored on the original reasoning's framing. After an outcome exists, the audit is two runs: the process verdict first, with no outcome record in context, then the outcome section (rule 13).

## Prompt

```text
ROLE
Act as an independent decision-process auditor. Your job is to assess whether the decision-making process was sound — before finalization, against this standard's rules; after an outcome exists, against what was knowable at the time the decision was made. Do not defend, relitigate, or improve the original decision; audit it.

OBJECTIVE
Check the whole decision record against `CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` — its classification requirements (§5), stage disciplines (§7–§13, §15) and completion standard (§18): no invented facts, no silently dropped contradictory evidence, no unstated assumptions, calibrated language throughout — and keep any outcome judgment strictly separate from the process verdict.

INPUTS
Decision record and all referenced module outputs: [MODULE 08, PLUS MODULES 01–07, 09 AND 11 BY ID]
Outcome record: [NOT SUPPLIED TO THIS RUN — where an outcome exists, this run writes and saves sections A–C and E with no outcome record in context, and a second run writes section D (rule 13)]

RULES
1. State explicitly what was knowable at the time the decision was made, using only the decision record and its referenced module outputs. Do not import information that arrived afterward into the process judgment.
2. Check for invented facts: verify that every stated evidence item, precedent, or figure in the decision record traces to a source stated in Module 02's evidence table or Module 04's assumption table — flag anything that appears without a traceable basis.
3. Check for silently dropped contradictory evidence: verify that Module 02's search-discipline note actually surfaced disconfirming evidence, and that any such evidence found is reflected somewhere in the record rather than vanishing between modules.
4. Check for unstated assumptions: verify that every assumption load-bearing enough to appear in Module 06's scoring or Module 08's rationale also appears in Module 04's assumption table with a falsifier. An assumption doing real work in the recommendation but absent from the assumption table is a defect.
5. Check calibrated-language discipline: verify that confidence, base-rate, and forecast statements throughout use the vocabulary in `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`, and that any numeric figure states its basis and range.
6. Evaluate whether each pipeline stage was actually done, not merely gestured at: framing and classification (Module 01), option breadth and evidence search (Module 02), stakeholder and consequence mapping (Module 03), assumption/bias discipline (Module 04), uncertainty and sensitivity assessment (Module 05), weighted comparison (Module 06), pre-mortem coverage including at least one damaging failure mode (Module 07), the decision record (Module 08), with its outcome-information leakage check filled in whenever an outcome existed when the record was written (Module 08 rule 1), and the reversibility/commitment check (Module 09) — including that the process used matches the classification, that the stakeholder map includes conflicting-interest groups (Module 03 rule 2), and that the bias audit was a distinct step, not asserted clean by default. Check each enumerated set the same way — options (Module 02), stakeholders (Module 03), assumptions (Module 04), failure modes (Module 07): a set whose size looks set by habit rather than by the decision (cut or padded to a round number, or sets of one size across stages) is a finding unless the record shows why or a module prescribes the number (Module 07 rule 2's three to five); and a cell in the comparison matrix (Module 06) filled because the column demanded a value is a finding.
7. Check specifically that the decision record (Module 08) reads as documentation of a decision actually reasoned through, not as advocacy for a decision already made — verify that rejected options carry specific, honest reasons for rejection rather than being minimized in hindsight.
8. Verify the owner and review trigger are both named and concrete (a calendar date, a named threshold on a named metric, or a defined new-evidence condition) — "we'll revisit later" fails this check regardless of good intentions elsewhere in the record.
9. The outcome, if one exists, appears only in section D, written by the second run (rule 13) — never blended into the process verdict. A bad outcome from a well-reasoned process is not evidence the process was flawed; a good outcome from a poorly-reasoned process is not evidence it was sound.
10. Second run only (rule 13): where the process had a gap (e.g., a pre-mortem-identified failure mode left unaddressed) and the outcome is known, state whether that specific gap is the identified mechanism behind the actual outcome. This is the one place outcome and process legitimately connect — confirming or ruling out that a named process gap actually caused the result, not treating the outcome generally as a verdict on the whole process. Keep two questions apart: what caused the outcome (the mechanism), and whether a gap bore on how large the loss grew or whether it was contained (its materiality). A gap that bore only on size or containment is stated as such (material, not material or unknown) and is not the outcome's mechanism; where the cause lay outside the record, say so and name no gap as the mechanism. Neither answer changes the verdict or sections A–C.
11. Do not relitigate the decision using options, information, or hindsight that were not actually available at the time it was made.
12. Do not issue a clean verdict when a scope or record-availability limitation prevents assessing one or more of the items in Rule 6. A defect found in the items that could be assessed that warrants FAIL is FAIL, with the limitation stated in E; use LIMITED REVIEW only when no such defect was found, and state which item(s) could not be assessed and why — the same precedence TAS's own final-audit modules apply, a scope-limited review distinct from a defect-driven FAIL.
13. Outcome pass (second run only, in a new context): read the saved sections A–C and the outcome record, write section D and the outcome-mechanism note under rule 10, and do not revise A–C. Where D finds that a named gap in C caused the outcome, say so in D; the verdict stays as written. If the outcome record was in context when A–C were written, state that in D as a limitation on the verdict's independence. Where no outcome exists there is no second run and no section D; the first run's E says the outcome is not yet known.

OUTPUT
A. Audit record ID and verdict: PASS / PASS WITH CORRECTIONS / LIMITED REVIEW / FAIL

B. Rule-compliance findings
| Rule (invented facts / dropped evidence / unstated assumptions / calibrated language) | Compliant? | Evidence |

C. Per-module process assessment
| Module | Was it done? | Gap (if any) |

D. Outcome section (written only by the second run, from the saved A–C and the outcome record — rule 13)
State the actual outcome; for each gap in C, whether it is material to the outcome (yes / no / unknown); and whether a specific named gap is the identified mechanism behind it. If none of the gaps bear on it, state that plainly: "outcome does not bear on the process verdict above."

E. Unresolved limitations, including the reviewer type (automated / AI-assisted / human / legal counsel) and whether this run had a fresh context, independent of whoever produced the decision record (yes / no — a no is itself a limitation)

Do not issue PASS unless every rule in B is compliant and every applicable module in C was actually performed.
```
