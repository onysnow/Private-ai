# Module 05 — Uncertainty, Effect Size and What a p-value Is Not

*Part of Quantitative Analysis System (QAS).*

## Use when

A result from Module 04 will be reported. Run it for every QRES record.

## Prompt

```text
OBJECTIVE
State each result as a size with its uncertainty, read any p-value only for
what it is, check base rates and subgroups, and report every analysis run.

INPUTS
- QRES and QPLN records; QFRM record; the QDAT records of the datasets used
- The analysis output

RULES
1. Report each result as an effect size in units the reader can use (points,
   cases per 1,000, percentage points), with an interval and its level.
   (QS-12, QS-01)
2. A p-value may be reported. Give the exact value, the test and the model,
   beside the estimate and interval. Do not drop p-values on the ground that
   they are banned; the ASA statement does not ban them. One author's advice
   to stop using them is a position, not a consensus. (QS-13, QS-12)
3. Do not write that a p-value is the probability that the hypothesis is
   true, or the probability that chance alone produced the result. (QS-13,
   QS-01)
4. Do not rest a conclusion on a p-value crossing a threshold alone. (QS-13)
5. A p-value above 0.05, or an interval that includes zero, is not "no
   effect". Write what the interval allows: for example, "the data are
   compatible with no difference and with a difference as large as 6
   points". (QS-01, QS-08)
6. Statistical significance is not importance. State separately whether the
   size matters in context, and why. (QS-13, QS-01)
7. Do not write that a 95% interval has a 95% chance of holding the true
   value in this study. Do not conclude "no difference" from overlapping
   intervals. (QS-01)
8. A p-value tests the whole model, including random sampling, correct
   analysis and no selective reporting. Record any of these that do not hold.
   (QS-01)
9. For any rate, hit rate, flag rate or conditional probability, state the
   base rate and the denominator. A test that flags 25% of negatives can make
   most positives false when the condition is rare. (QS-11)
10. For each comparison between groups, compute the result within the
    subgroups named in the QPLN record. If the direction changes
    within subgroups, report both levels and the difference in group make-up.
    (QS-10, QS-11)
11. Report every analysis in the QPLN log, or report the count of analyses
    and where the rest are listed. (QS-13, QS-01)
12. State that a single result is one contribution; a repeat of the same
    study could give a very different p-value. (QS-12)
13. Exploratory results carry the word "exploratory" wherever they are
    reported. (Standard §2)
14. Beside every result, name each dataset it rests on and, from that
    dataset's assurance block: where it came from and how it was collected,
    the reliance level of the period the result uses, each limit the block
    names, its known biases, how missing data were handled, and which error
    sources the interval covers. Record these in the QRES fields datasets
    and interval_covers. A result from a period marked DO_NOT_RELY carries
    that reason. (Standard §2)

OUTPUT
QRES record (completes Module 04's):
| result_id | QRES-NNNN |
| estimate | unit | interval | interval_level |
| no_interval_reason | required when interval is empty |
| p_value | test | model_assumptions_not_met |
| practical_size_note |
| base_rate | denominator |
| subgroup_results | subgroup, estimate, interval |
| direction_reverses | yes/no |
| group_makeup_difference | |
| label | CONFIRMATORY / EXPLORATORY |
| analyses_reported_of_total |
| datasets | dataset_id, period used, reliance, limits stated |
| interval_covers | error sources the interval includes |
```
