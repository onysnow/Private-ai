# Logic Prompt QA Rubric

*Part of Logic Authority System (LAS) — v0.1.*

## Purpose

Use this rubric to evaluate a prompt and its outputs before adopting it as a project standard. Score the output a prompt actually produces, not the prompt's wording. Uses the same verdict vocabulary as TAS and RAS, deliberately, rather than a fourth inconsistent set (see `EVALUATION/OUTPUT_SCHEMAS.md`).

## Blocking defects

Any one of these prevents a passing result:

- a formal fallacy present in the argument but not identified (Module 02);
- a named informal fallacy present but not identified, or a fallacy CONFIRMED where none of the taxonomy's definitions actually fit (Module 04);
- a legitimate, well-used argumentation scheme CONFIRMED as fallacious without applying its own critical questions (over-flagging, Module 04);
- an unstated premise the argument depends on left completely unsurfaced (Module 01/05);
- an equivocation (a key term shifting meaning between premise and conclusion) not caught (Module 05);
- premise truth silently assumed rather than flagged as VERIFIED/CONTESTED/REFUTED/UNVERIFIED/UNVERIFIABLE (Module 03);
- a straw man substituted for the argument's steelmanned reconstruction before critique (Module 01), or a counterargument (Module 06) that is actually a restatement of the original's own steelman rather than a genuinely opposing case;
- a genuine contradiction between a source's arguments left unflagged, or a legitimate, scoped change of position mischaracterized as a contradiction (Module 07);
- tone or rhetorical technique allowed to substitute for an actual validity/soundness finding, in either direction (Module 08);
- a composite verdict (Module 09) not actually supported by its own standards-assessment table;
- claiming an argument is "proven" or "disproven" on the basis of a clean logic audit alone, without noting this only establishes validity given the premises, not the premises' truth (`CORE/LAS_PROMPT_ENGINEERING_STANDARD.md` Rule 13);
- calling an argument's conclusion false, disproven or refuted because the argument is invalid, commits a confirmed fallacy, or rests on a REFUTED premise (the fallacy fallacy, `CORE/LAS_PROMPT_ENGINEERING_STANDARD.md` §4.10, Rule 14).

## Scored dimensions

Score each from 0 to 3.

| Dimension | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Reconstruction fidelity | Argument materially misstated | Notable drift from original | Minor drift | Conclusion and all premises (including unstated ones), correctly attributed, accurately captured |
| Validity/strength assessment | Wrong verdict | Right verdict, weak reasoning shown | Right verdict, adequate reasoning | Correct verdict with clear logical-form or inductive/abductive reasoning, including conclusion-scope checks |
| Fallacy detection (formal + informal) | Missed fallacies or false CONFIRMED positives | Some correct, some missed/wrong | Mostly correct | Complete, accurate, taxonomy-grounded findings with mechanism and located step stated |
| Over-flagging resistance | Legitimate scheme confirmed as fallacious without checking critical questions | Critical questions checked inconsistently | Mostly checked correctly | Every appeal-to-authority/analogy/causal candidate correctly resolved against its scheme's critical questions |
| Premise verification discipline | Premise truth silently assumed | Some premises flagged, others assumed | Mostly flagged correctly | Every premise carries an accurate VERIFIED/CONTESTED/REFUTED/UNVERIFIED/UNVERIFIABLE status with correct evidentiary-weight basis |
| Hidden premise / equivocation audit | Not attempted | Superficial | Mostly complete | All substantive unstated premises and equivocations surfaced and ranked |
| Steelman and counterargument quality | Straw man substituted for the original, or counterargument is a restatement | Weak steelman or weak counterargument | Adequate on both | Genuinely strongest defensible version of both the original and the opposing case, real crux identified |
| Consistency check | Contradiction missed, or a scoped change of position wrongly flagged as one | Attempted, same-scope check skipped | Mostly complete | Correctly classified, with same-entity/question/time/scope verification shown |
| Rhetoric/logic separation | Conflated throughout | Some separation | Mostly separated | Rhetorical technique and logical substance cleanly and correctly separated |
| Standards synthesis and verdict | Not grounded in prior modules | Partially grounded | Mostly grounded | Composite verdict fully traceable to the standards table and prior module findings, with calibrated confidence |
| Completion honesty | Overclaims what the audit established | Some overclaiming | Mostly honest | Explicitly distinguishes validity-given-premises from premise truth throughout |
| Output usability | Unusable | Requires major restructuring | Usable with edits | Audience-ready and schema-compliant |

Maximum score: 36.

## Rating bands

| Result | Condition |
|---|---|
| PASS | No blocking defect and score 32-36 |
| PASS WITH CORRECTIONS | No blocking defect and score 26-31 |
| REVISE AND RETEST | No blocking defect and score 19-25 |
| FAIL | Any blocking defect or score below 19 |

## Evaluation protocol

1. Build a ground-truth test set from arguments with an independently agreed-upon validity/fallacy status (textbook examples from LS-05/LS-06 are a good source for unambiguous cases; real-world arguments for harder, contested ones). Verify the ground truth's own classification against the cited textbook definitions before scoring runs against it.
2. Run every case the Regression gate of `ADVERSARIAL_TEST_SUITE.md` names; a prompt is not adopted on this rubric's score while a gated case fails.
3. Include at least one case using a legitimate argumentation scheme (expert opinion, analogy, cause, sign, practical reasoning) specifically to test for over-flagging — a rubric only tested on genuinely fallacious arguments won't catch a model that over-flags legitimate reasoning.
4. Include at least one consistency-check case with a genuine contradiction and one with a legitimate, scoped change of position, so over-flagging and under-flagging are both tested (Module 07).
5. Validate deterministic properties by code where possible: presence of all required schema fields, internal consistency between the fallacy findings list and the final written synthesis.
6. Review qualitative properties independently: reconstruction fidelity, steelman/counterargument quality, and whether tone influenced the verdict.
7. Record model name/version, settings, prompt version, run date, input hash, output hash, score, and defects.
8. Re-run after a model or material prompt change.

## Evaluation record template

| Field | Value |
|---|---|
| Prompt/module | |
| Prompt version/hash | |
| Model/version | |
| Run date | |
| Test case | |
| Input hash | |
| Output hash | |
| Blocking defects | |
| Score | |
| Verdict | |
| Required changes | |
