# Module 04 — Choosing and Running the Analysis

*Part of Quantitative Analysis System (QAS).*

## Use when

Framing and cleaning are recorded and, for a comparison or theory test, the
rivals are listed. Write the plan before outcome data are seen where possible,
then run it.

## Prompt

```text
OBJECTIVE
Fix the analysis before seeing the outcome where possible, run it from the
cleaned file in code, and record every analysis and choice tried, not only
the one reported.

INPUTS
- QFRM, QDAT, QCLN and QRIV records
- The analysis file

RULES
1. Write the QPLN record before outcome data are examined where possible:
   outcome measure, comparison, model or test, covariates with the reason for
   each, exclusions, the rule for sample size or when to stop collecting,
   subgroups, and how missing values are handled. (QS-02, QS-03, QS-12)
2. If outcome data were seen before the plan was written, record that and
   label the plan POST HOC. A post hoc plan is exploratory. (QS-02)
3. Before choosing covariates, write the assumed causal arrows (A -> B)
   among exposure, outcome and other variables into the QPLN record's
   causal_assumptions field. Choose each covariate from those arrows, not by
   which variables are statistically associated with the outcome. Record the
   reason per covariate. (QS-09)
4. Label every analysis CONFIRMATORY (in the plan written before outcome data
   were seen) or EXPLORATORY (anything else). (QS-02, QS-12)
5. Log every analysis run, including those dropped, in the QPLN log with its
   result. Nothing run is deleted from the log. (QS-13, QS-01)
6. Log every choice made after seeing data (an exclusion, a recoding, a
   subgroup, a merged category, a different outcome): what was chosen, what
   the alternatives were, and why. (QS-02)
7. Run the main result with and without the exclusions, and with and without
   the covariates. Record both. If the conclusion differs, the QRES record
   says so. (QS-03) Run it also with and without any material whose QDAT
   assurance.upstream_status is unsettled; the QRES record states the result
   as conditional on that material. (Standard §10)
8. Count the comparisons made and record the count in the QPLN record. A
   result picked from several is reported with that count. (QS-13, QS-01)
9. Run the analysis as code from the analysis file so that the result can be
   re-run. Record the code location in the QRES record. (QS-14)
10. Record each departure from the plan, with the reason, in the QPLN log.
    (QS-12, QS-02)
11. Write one QRES record per result, then pass it to Module 05 before it is
    reported. (Standard §2) Each QRES goes to Module 05 as its own step before any result is
    reported; a self-issued audit under Module 07 does not stand in for it.

OUTPUT
QPLN record:
| plan_id | QPLN-NNNN | framing_id | rival_set_id |
| written_before_outcome_seen | yes / no (POST HOC) |
| causal_assumptions | arrows |
| outcome | comparison | model | covariates + reasons |
| exclusions | rule, reason, n excluded, written before outcome seen (yes/no) |
| stopping_rule | subgroups | missing_data |
| comparisons_count |
| log | analysis, label, choice made after data, alternatives, reason, result |
| departures | change, reason |
| written_at |

QRES record (completed in Module 05):
| result_id | QRES-NNNN | plan_id | label | code_location | written_at |
| with_exclusions | without_exclusions | with_covariates | without_covariates |
| with_unsettled | without_unsettled |
```
