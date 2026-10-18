# Integrated Prompt Template Library

*Part of Decision Authority System (DAS).*

Version: 0.1.4
Prepared: 2026-09-20; revised 2026-09-25 and 2026-09-27 (`CHANGELOG.md` 0.1.1–0.1.4 give the reasons, affected modules and tests, per the versioning rule below)

## How to use this library

These templates invoke the collection instead of repeating the full operating standard in every prompt. Replace bracketed fields, attach or identify the relevant prior module outputs, and use the narrowest template that fits the task.

Before using a template in a new consequential chat, verify that every governing file it names is actually accessible (`CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md`, Layer 1, rule 14). A template cannot compensate for missing decision context or evidence.

### Common variables

| Variable | Meaning |
|---|---|
| `[DECISION_ID]` | Stable decision identifier |
| `[DECISION_STATEMENT]` | The decision as currently understood |
| `[DECISION_MAKER]` | Who actually has authority to decide |
| `[STAKES]` | What's materially at stake in getting it wrong |
| `[DEADLINE]` | Real deadline, and whether it is fixed or negotiable |
| `[OPTIONS]` | Options already on the table, including any implicit default |
| `[EVIDENCE_SET]` | Evidence, precedent, or expert input already gathered |
| `[STAKEHOLDERS]` | Known stakeholder groups, including any known conflicting interests |
| `[CONSTRAINTS]` | Budget, timeline, regulatory, political, or resourcing constraints — each with its source; an unsupported constraint does not remove an option (Module 02 rule 11) |
| `[OUTPUT_FORMAT]` | Table, memo, structured record, etc. |

### Mandatory invocation block

Every template includes or assumes this block:

```text
GOVERNING PROJECT FILES
First consult:
- CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md (or active Project Instructions)
- CORE/DAS_PROMPT_ENGINEERING_STANDARD.md
- CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md, when precedent or expert input bears on the decision
- CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md, when any confidence or base-rate language will be used

Then consult the task-specific modules and schemas named below. If a named file is unavailable, disclose that before analysis. Do not claim compliance with a file you could not access.

AUTHORITY RULE
The project files govern process and quality control. The decision-maker's actual stated values, risk tolerance, and authority govern the decision itself. This collection structures a decision; it does not make it.
```

## Template selector

| Need | Template |
|---|---|
| Decide how much process a new decision needs | T00 Decision Router |
| Run the full pipeline on a high-stakes decision | T01 Full Decision Pipeline |
| Run a lightweight pass on a low-stakes, reversible decision | T02 Lightweight Decision Pass |
| Map stakeholders and consequences only | T03 Stakeholder & Consequence Mapping |
| Audit assumptions and biases behind an existing leading option | T04 Assumption & Bias Audit |
| Compare options against explicit criteria | T05 Comparative Evaluation |
| Stress-test a leading option before committing | T06 Pre-Mortem |
| Write the decision record at the moment of decision | T07 Decision Record Documentation |
| Check reversibility and find a smaller first step | T08 Reversibility & Commitment Check |
| Independently audit an existing decision record | T09 Final Decision Audit |
| Design or check review triggers for an existing decision | T10 Review Trigger Design |

---

## T00 — Decision Router

Use when the request is broad, or it isn't yet clear how much process the decision warrants.

```text
Apply the mandatory invocation block from the Integrated Prompt Template Library.

OBJECTIVE
Route this decision through the smallest sufficient set of DAS modules. Do not begin substantive option evaluation yet.

DECISION AS PRESENTED
[DECISION_STATEMENT]

CONTEXT
Decision-maker: [DECISION_MAKER]
Stakes: [STAKES]
Deadline: [DEADLINE]
Known options: [OPTIONS]
Constraints: [CONSTRAINTS]

CONSULT
- PROMPT_MODULE_CATALOG.md
- PROMPT_MODULES/01_DECISION_FRAMING.md

OUTPUT
1. Restated decision statement and any proxy-question flag
2. Reversibility and problem-domain classification
3. Ordered module plan, including which stages can be compressed and why
4. Evidence or precedent gaps that must be filled before Module 02
5. Human decision-authority gates (who must actually sign off)
6. Completion criteria for this specific decision
```

---

## T01 — Full Decision Pipeline

Use for a Type 1 (irreversible) or Complex-domain decision, or any decision materially affecting more than one stakeholder group. A Chaotic-domain decision comes here only for its follow-on decision: see REQUIRED PROCESS.

```text
Apply the mandatory invocation block.

TASK
Run the full DAS pipeline on this decision, producing an auditable decision record.

INPUTS
Decision ID: [DECISION_ID]
Decision statement: [DECISION_STATEMENT]
Decision-maker: [DECISION_MAKER]
Stakes and deadline: [STAKES] / [DEADLINE]
Options already on the table: [OPTIONS]
Evidence/precedent already gathered: [EVIDENCE_SET]
Known stakeholders: [STAKEHOLDERS]
Constraints: [CONSTRAINTS]

CONSULT
- PROMPT_MODULES/01_DECISION_FRAMING.md through 11_POST_DECISION_REVIEW_TRIGGER.md, in order
- EVALUATION/OUTPUT_SCHEMAS.md

REQUIRED PROCESS
Run Modules 01 through 09 and 11 in sequence, passing each module's output as the next module's input by ID. Do not skip Module 03 or Module 05 because of time pressure. Two domain rules change the process itself (`CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §5.2): a Chaotic-domain decision acts first, before this template — the smallest action that establishes stability is taken and recorded in short form (Module 08 rule 11) with a review trigger (Module 11), and this pipeline runs on the follow-on decision once the situation is stable; a Complex-domain decision compares safe-to-fail probes, not final commitments (Module 06 rule 10). Run Module 10 in a fresh context once the record is complete.

OUTPUT
A. Every module's output record, in order, each with a stable ID
B. The final decision record (Module 08)
C. The review-trigger record (Module 11)
D. The Module 10 audit verdict, with any required corrections applied and re-verified

FAILURE RULE
If a required module's inputs are missing (e.g., no evidence set for Module 02, no stakeholder information for Module 03), state PARTIAL PIPELINE and name exactly which module could not be completed and why — do not silently thin that module's output to fill the gap.
```

---

## T02 — Lightweight Decision Pass

Use for a Type 2, Simple/Clear-domain decision affecting only the decision-maker or a small, aligned team.

```text
Apply the mandatory invocation block.

TASK
Run a lightweight DAS pass sufficient for a fast, reversible decision, without the full pipeline's overhead.

INPUTS
Decision statement: [DECISION_STATEMENT]
Options already on the table: [OPTIONS]
Deadline: [DEADLINE]

CONSULT
- PROMPT_MODULES/01_DECISION_FRAMING.md
- PROMPT_MODULES/02_OPTION_GENERATION_AND_EVIDENCE_GATHERING.md
- PROMPT_MODULES/04_ASSUMPTION_AND_BIAS_AUDIT.md (assumption table only, base-rate note if a reference class is readily available)
- PROMPT_MODULES/08_DECISION_SYNTHESIS_AND_RATIONALE.md
- PROMPT_MODULES/11_POST_DECISION_REVIEW_TRIGGER.md

REQUIRED PROCESS
1. Confirm the classification (Module 01) actually supports compressing the pipeline — if it does not (Type 1, or a Complicated, Complex, Chaotic or Disorder domain — T02 is for Simple/Clear only), stop and route to T01 instead (DIR-0021).
2. Generate at least one genuinely distinct option beyond the default (Module 02, Rule 2), even in a lightweight pass.
3. State at least one falsifiable assumption behind the leading option (Module 04).
4. Write a short decision record naming the owner and at least one review trigger (Modules 08, 11).
5. List in the record, as skipped, each pipeline stage this pass did not run, so the record meets the lightweight-pass minimum (`CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §18).

OUTPUT
A. Classification confirmation (with escalation flag if T01 is actually warranted)
B. Short option list
C. Key assumption(s) with falsifier(s)
D. Short decision record with owner, review trigger and the stages skipped

A lightweight pass still requires an owner and a review trigger — these are never optional, regardless of stakes.
```

---

## T03 — Stakeholder & Consequence Mapping

```text
Apply the mandatory invocation block.

OBJECTIVE
Identify everyone affected by this decision and map first- and second-order, distributional consequences for each option under consideration.

INPUTS
Decision statement and classification: [FROM MODULE 01 OR AS STATED]
Options: [OPTIONS]

CONSULT
- PROMPT_MODULES/03_STAKEHOLDER_AND_CONSEQUENCE_MAPPING.md
- EVALUATION/OUTPUT_SCHEMAS.md

OUTPUT
A. Stakeholder register, including any conflicting-interest or unconsulted groups
B. Consequence map (first- and second-order, by option, with distributional notes)
C. Unconsulted-conflicting-interest flag
```

---

## T04 — Assumption & Bias Audit

```text
Apply the mandatory invocation block.

OBJECTIVE
State the leading option's assumptions and falsifiers, reason from a genuine reference class, and check explicitly for named decision biases.

INPUTS
Leading option and basis: [DESCRIPTION]
Any prior stakeholder/consequence map: [FROM MODULE 03, IF AVAILABLE]

CONSULT
- PROMPT_MODULES/04_ASSUMPTION_AND_BIAS_AUDIT.md
- CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md
- CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md

OUTPUT
A. Assumption table with falsifiers
B. Base-rate note
C. Bias-check finding list (PRESENT / NOT PRESENT / UNCLEAR, each with evidence)
D. Distance-check note
```

---

## T05 — Comparative Evaluation

```text
Apply the mandatory invocation block.

OBJECTIVE
Compare the real options against explicit, weighted criteria.

INPUTS
Surviving options: [OPTIONS]
Consequence map and sensitivity table, if available: [FROM MODULES 03 AND 05]

CONSULT
- PROMPT_MODULES/06_COMPARATIVE_EVALUATION.md
- EVALUATION/OUTPUT_SCHEMAS.md

OUTPUT
A. Weighted comparison table
B. Expected-value, worst-case and regret table
C. Recommendation, with what would have to be true for a different option to win instead

Do not select criteria after seeing which option they favor.
```

---

## T06 — Pre-Mortem

```text
Apply the mandatory invocation block.

OBJECTIVE
Assume the chosen option has already failed a year from now, and work backward to the most plausible causes, including at least one genuinely damaging one.

INPUTS
Recommended option and basis: [DESCRIPTION]
Known assumptions and stakeholder map, if available: [FROM MODULES 03–04]

CONSULT
- PROMPT_MODULES/07_PRE_MORTEM_AND_FAILURE_MODE_ANALYSIS.md

OUTPUT
A. Ranked pre-mortem finding, with source (execution / market / stakeholder reaction / bias-linked / other) per failure mode
B. Damaging-failure-mode check
C. Carry-forward note (GAP items requiring resolution before commitment)
```

---

## T07 — Decision Record Documentation

```text
Apply the mandatory invocation block.

OBJECTIVE
Produce the actual decision record at the moment of decision, before the outcome is known.

AUTHORIZED INPUTS
All prior module outputs for this decision, by ID: [LIST]

CONSULT
- PROMPT_MODULES/08_DECISION_SYNTHESIS_AND_RATIONALE.md
- EVALUATION/OUTPUT_SCHEMAS.md

OUTPUT
A. Complete decision record per the Module 08 schema, including honestly stated reasons each rejected option lost
B. Outcome-information leakage check

Do not include any outcome information. Do not write this as advocacy for a foregone conclusion.
```

---

## T08 — Reversibility & Commitment Check

```text
Apply the mandatory invocation block.

OBJECTIVE
Check reversibility against the specific committed plan, verify any irreversibility claim, and identify the smallest reversible first step.

INPUTS
Decision record: [FROM MODULE 08]
Pre-mortem finding: [FROM MODULE 07]

CONSULT
- PROMPT_MODULES/09_REVERSIBILITY_AND_COMMITMENT_CHECK.md

OUTPUT
A. Reversibility re-check, including whether any irreversibility claim survives verification
B. Smallest-reversible-step analysis
C. Walk-back conditions
D. Sunk-cost-on-commitment flag
```

---

## T09 — Final Decision Audit

Use before execution, and again after an outcome exists. Run in a fresh context.

```text
Apply the mandatory invocation block.

ROLE
Act as an independent decision-process auditor. Judge the process, not the outcome, unless Rule 10 of Module 10 specifically applies.

INPUTS
Decision record and all referenced module outputs: [FILES/IDS]
Outcome record: [NOT IN RUN 1 — see REQUIRED PROCESS]

CONSULT
- PROMPT_MODULES/10_FINAL_DECISION_AUDIT.md
- EVALUATION/OUTPUT_SCHEMAS.md (final-audit finding record)

REQUIRED PROCESS
Run 1, with no outcome record in context: check for invented facts, dropped contradictory evidence, unstated assumptions, and calibrated-language discipline; assess whether each pipeline stage was actually performed; write A–C and E and save them. Run 2, only where an outcome exists, in a new context: supply the saved A–C and the outcome record [FILE/ID], and write D only, without revising A–C (Module 10 rule 13).

OUTPUT
A. Verdict: PASS / PASS WITH CORRECTIONS / LIMITED REVIEW / FAIL
B. Rule-compliance findings
C. Per-module process assessment
D. Outcome section (run 2 only, written from the saved A–C)
E. Unresolved limitations

Do not issue PASS unless every rule is compliant and every applicable module was actually performed.
```

---

## T10 — Review Trigger Design

```text
Apply the mandatory invocation block.

OBJECTIVE
Define or check concrete review triggers for this decision — calendar, threshold, or new-evidence — not a vague intention to revisit later.

INPUTS
Decision record: [FROM MODULE 08]
Walk-back conditions, if available: [FROM MODULE 09]
Sensitivity table, if available: [FROM MODULE 05]

CONSULT
- PROMPT_MODULES/11_POST_DECISION_REVIEW_TRIGGER.md

OUTPUT
A. Review-trigger record, with type, exact condition, monitor, and action on firing
B. Monitored-risk carry-forward check
C. Review scope note

Reject any trigger that cannot be checked by someone other than the original decision-maker without further interpretation.
```

## Versioning rule

When a template is materially changed, update: template version/date; reason for change; affected modules/schemas; test cases added or modified; and the source or model change that triggered the revision.
