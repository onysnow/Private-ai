# Research Prompt QA Rubric

*Part of Research Authority System (RAS).*

## Purpose

Use this rubric to evaluate a prompt and its outputs before adopting it as a
project standard. Score the output a prompt actually produces, not the
prompt's wording.

A verdict-vocabulary note up front: TAS's own self-QA pass found its verdict
vocabulary had drifted into three slightly different sets across three
files, which was flagged as an avoidable inconsistency, not a defect in any
one module. RAS avoids that from the start: this rubric uses the same
four-value PASS / PASS WITH CORRECTIONS / REVISE AND RETEST / FAIL scale TAS
uses for prompt-adoption evaluation, and Module 10's Final Research Audit
uses the same PASS / PASS WITH CORRECTIONS / LIMITED REVIEW / FAIL scale
TAS's Module 12 and Legal Document and Prompt Audit Guide use for auditing
a finished deliverable. Two contexts, two vocabularies, shared across all
Authority Systems rather than invented separately by each.

## Blocking defects

Any one of these prevents a passing result:

- fabricated citation, or a citation whose author, venue, year, or finding
  was not actually checked against the real source;
- a citation that does not support the claim at the stated scope (topic
  match without proposition, population, or time-period match);
- a single-source claim (Module 04) presented as "the research shows" or
  as established consensus;
- multiple sources restating the same underlying original presented as
  independent corroboration (single-source capture disguised as
  multi-source support — see Module 02's diversity check and Module 04's
  independence test);
- material disconfirming or null-result evidence omitted from the
  synthesis without the omission disclosed, where a fair search would reasonably
  have surfaced it (a disclosed, user-requested omission is Standard §11's
  permitted case);
- a fact imported from outside the supplied or retrieved sources where the task
  limits the evidence to them (Policy Section 7);
- a retracted, corrected, or superseded source relied upon without
  disclosing the retraction/correction;
- a source's tier materially misclassified in a way that changes how much
  weight the claim built on it should carry (e.g., an opinion piece treated
  as peer-reviewed research);
- "no studies found on X" converted into "X does not occur" or "X is
  disproven" — the same not-found-versus-does-not-exist collapse TAS's
  rubric blocks, applied to research absence rather than case evidence;
- a claim of a complete or representative search when the search was
  undocumented, narrow, or single-pass;
- a material research gap identified internally (Module 08) but not
  disclosed in the delivered synthesis;
- unsupported numerical precision not traceable to a specific cited source's
  own reported figure;
- a known material conflict of interest or funding source left undisclosed
  when it was discoverable;
- a source flagged `unverified-provenance` (Policy Section 3) tiered above
  8 or counted as corroboration.

## Scored dimensions

Score each from 0 to 3.

| Dimension | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Scope fidelity | Ignores framed question's scope | Material drift from scope | Minor drift | Fully respects question framing, date range, population, exclusions |
| Search & diversity documentation | No search log | Log present but sparse, no diversity check | Mostly complete log and diversity check | Full query/database/date log with diversity check and stated limitations |
| Disconfirming-evidence discipline | Only confirming sources sought | Token disconfirming search | Present but under-weighted | Genuine, documented search for disconfirming/null-result work |
| Source tiering accuracy | Tiers absent or arbitrary | Frequent misclassification | Mostly correct | Every relied-upon source correctly tiered per Policy Section 3 |
| Corroboration mapping | Not attempted | Corroboration asserted without independence check | Independence mostly checked | Every claim's corroboration verdict correctly distinguishes genuine independence from restatement |
| Bias & representativeness | Not assessed | Assessed superficially | Assessed with gaps noted | Full bias audit (funding/agenda, file-drawer, recency, language, funder concentration) with stated verdict |
| Certainty/consensus calibration | Ad hoc language ("proven," "shown") | Some calibrated language, inconsistent | Mostly calibrated | Every material claim carries both a certainty-of-evidence and a consensus label from the shared scale |
| Citation quality | Fabricated/mismatched | Broad or scope-mismatched | Mostly precise | Claim-level, pinpoint, scope-matched citations throughout |
| Currency/retraction discipline | Not checked | Checked inconsistently | Checked for most relied-upon sources | Every relied-upon source's currency confirmed or its unavailability disclosed |
| Research gap disclosure | Gaps not identified | Identified internally but not disclosed | Disclosed but not characterized | Gaps identified, characterized (PICOS-element and reason), and disclosed in the synthesis itself |
| Conflict-of-interest disclosure | Omitted | Noted for some sources | Noted for most | Consistently disclosed where knowable and material |
| Extrapolation labeling | Extrapolation presented as direct finding | Occasionally flagged | Mostly flagged | Every extrapolation beyond a source's actual scope explicitly labeled |
| Completion honesty | False completeness claim | Major limitations hidden | Limitations stated but incomplete | Exact search scope, coverage, and limitations stated plainly |
| Output usability | Unusable | Requires major restructuring | Usable with edits | Audience-ready and schema-compliant |

Maximum score: 42.

## Rating bands

| Result | Condition |
|---|---|
| PASS | No blocking defect and score 37-42 |
| PASS WITH CORRECTIONS | No blocking defect and score 30-36 |
| REVISE AND RETEST | No blocking defect and score 21-29 |
| FAIL | Any blocking defect or score below 21 |

## Evaluation protocol

1. Define a small ground-truth test set built from research questions with
   a genuinely well-documented, checkable state of evidence (e.g., a
   question with an existing high-quality systematic review or consensus
   statement to check against). Before scoring any run against it, verify
   the ground truth itself is accurately characterized at the certainty and
   consensus level actually supported by that review/statement — do not
   encode a stronger or more settled answer into the ground truth than the
   evidence base itself supports. If a run's output is more conservative
   than the ground truth but consistent with the underlying evidence, check
   the ground truth first rather than scoring the run down.
2. Run every case the Regression gate of `ADVERSARIAL_TEST_SUITE.md` names; a prompt is not adopted on this rubric's score while a gated case fails.
3. Run the prompt on at least one question with genuinely contested or thin
   evidence, not only questions with a clean consensus answer — a rubric
   only tested against easy cases won't catch overclaiming on hard ones.
4. Validate deterministic properties by code where possible: citation
   presence, tier labels, required schema fields, and internal consistency
   between the claim table and the drafted synthesis.
5. Review qualitative properties independently: overclaiming, dropped
   caveats, dropped gaps, manufactured consensus or manufactured
   controversy, and audience fitness.
6. Record model name/version, settings, prompt version, run date, input
   hash, output hash, score, and defects.
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
