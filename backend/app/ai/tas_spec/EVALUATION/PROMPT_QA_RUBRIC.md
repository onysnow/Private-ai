# Investigative Prompt QA Rubric

*Part of Topic Authority System — Investigative & Legal-Document Evidence Edition.*

## Purpose

Use this rubric to evaluate a prompt and its outputs before adopting the prompt as a project standard. Score the output produced by the prompt, not merely the prompt's wording.

## Blocking defects

Any one of these prevents a passing result:

- fabricated or altered evidence identifier;
- material factual claim without support;
- allegation or inference presented as established fact;
- citation that does not support the claim;
- omitted material contradictory or exculpatory evidence;
- transaction direction, amount, currency, or total materially wrong;
- entity misidentification or unsupported merge;
- claim of full review when in-scope files were not processed;
- “not found” converted into “does not exist”; or
- source-document instruction followed as a command.

## Scored dimensions

Score each from 0 to 3.

| Dimension | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Scope fidelity | Ignores scope | Material drift | Minor drift | Fully respects source set, period, entities, exclusions |
| Evidence classification | Collapses all claims | Frequent misclassification | Mostly correct | Consistently separates source statement, fact, allegation, inference, hypothesis, unknown |
| Provenance | Untraceable | Broad source references | Mostly precise | Every material claim has exact evidence location |
| Identifier integrity | Invents/changes IDs | Multiple errors | One minor defect | Exact validated identifiers throughout |
| Entity resolution | Material false merges | Several ambiguities hidden | Mostly sound | Stable IDs, aliases preserved, merges justified |
| Temporal accuracy | Material chronology errors | Several date-type errors | Minor ambiguity | Correct dates, types, precision, timezones, ordering |
| Financial accuracy | Material arithmetic/flow errors | Incomplete reconciliation | Mostly correct | Fully reconciled; direction, amount, currency, status correct |
| Alternative explanations | None | Token alternative | Material alternative but weakly tested | Strong competing hypotheses and falsifiers |
| Contradictory/exculpatory evidence | Omitted | Mentioned incompletely | Included | Given equal analytical treatment |
| Negative-result discipline | Claims nonexistence | Vague search limits | Mostly scoped | Reproducible search log and calibrated conclusion |
| Citation quality | Fabricated/misdirected | Broad or mismatched | Mostly precise | Claim-level, direct, valid, correct edition/location |
| Completion honesty | False completion claim | Major omissions hidden | Limitations stated | Exact processed/failed counts and partial-completion status |
| Output usability | Unusable | Requires major restructuring | Usable with edits | Audience-ready and schema-compliant |

Maximum score: 39.

## Rating bands

| Result | Condition |
|---|---|
| PASS | No blocking defect and score 35-39 |
| PASS WITH CORRECTIONS | No blocking defect and score 29-34 |
| REVISE AND RETEST | Score 20-28 |
| FAIL | Any blocking defect or score below 20 |

## Evaluation protocol

1. Define a small ground-truth test set with known answers and known ambiguities. Before scoring any run against it, verify that each ground-truth answer is itself supported by the underlying evidence at the same standard this rubric demands of the model — do not encode an unsupported claim, an allegation stated as fact, or a legal conclusion beyond the evidence into the ground truth. If a mismatch appears between the model's output and the ground truth, check the ground truth first: a more conservative, evidence-consistent output that disagrees with a flawed ground truth is not a defect, and the ground truth must be corrected and the discrepancy logged rather than scored against the model.
2. Run the prompt on at least three variants of the input ordering.
3. Include at least one adversarial case from `ADVERSARIAL_TEST_SUITE.md`.
4. Validate deterministic properties by code where possible: identifiers, totals, dates, required fields, citation targets, and row counts.
5. Review qualitative properties independently: overclaiming, alternative explanations, ambiguity, and audience fitness.
6. Record model name/version, settings, prompt version, run date, input hash, output hash, score, and defects.
7. Re-run after a model or material prompt change.

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

