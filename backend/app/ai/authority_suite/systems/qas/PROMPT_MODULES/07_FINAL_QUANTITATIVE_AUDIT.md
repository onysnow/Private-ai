# Module 07 — Final Quantitative Audit

*Part of Quantitative Analysis System (QAS).*

## Use when

The output is drafted. Run it last, in a fresh context that holds only the
records and the draft, not the reasoning that produced them.

## Prompt

```text
OBJECTIVE
Check the draft against the records. Every number traces to a step, every
word matches the analysis, and every restatement keeps the finding's
confidence, scope and causal status.

INPUTS
- The draft output, including headline, summary and captions
- All QFRM, QDAT, QCLN, QRIV, QPLN, QRES and QCAU records

RULES
1. Work only from the records and the draft. Do not repair a gap by
   reasoning about what was probably done; record it as a finding. (logic)
2. List every number in the draft. Trace each to a QRES, QCLN or QDAT record.
   A number with no record is a finding. (Standard §2)
3. Check that the QCLN row counts run from the received file to the analysis
   file with no unexplained difference. (logic)
4. Check each dataset has a QDAT record with its origin and an assurance
   block giving a reliance level, and that the received file was left unchanged. (QS-14, QS-04; Standard §4)
5. Check that the QFRM record is dated before the first QCLN and QRES
   records, or that viewing before framing is disclosed. (QS-02)
6. Check that each result labelled EXPLORATORY is reported as exploratory,
   and that no exploratory pattern is presented as tested. (QS-02, QS-12)
7. Check that the analyses reported match the QPLN log, or that the draft
   gives the count of analyses run. (QS-13, QS-03)
8. Check each p-value sentence: no "probability the hypothesis is true", no
   "no effect" from a result Module 05 rule 5 covers, no "significant" used
   to mean important. (QS-01, QS-13)
9. Check each causal word against a QCAU verdict that permits it. (QS-09,
   QS-08)
10. Restatement check: compare each headline, summary, abstract and caption
    with the QRES or QCAU record it restates, using "Restating a finding" in
    CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md. For each, record whether it raises
    the confidence term, widens the scope or turns association into cause. A
    restatement that does is corrected; the finding stands. (QS-20, QS-21)
11. Check each verbal likelihood term is from the Term column of
    CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md and has its band beside it.
    (QS-19, QS-17)
12. Check each item of the Standard §4 completion standard, and the draft's
    population, scope and claim level against the QFRM record's
    target_population, coverage_gap and claim_level. Check that each reported
    result carries Module 05 rule 12's one-contribution statement and that no
    significance test is offered as the answer to whether a link is causal.
    Check Standard §10 In: no status in a QDAT assurance.upstream_status is
    raised in the draft, and a result resting on unsettled material gives
    both runs and the condition (Module 04 rule 7). Check Policy rules 8 and
    18 to 21: each result names its datasets, their reliance and limits and
    what its interval covers (Module 05 rule 14); a result from a DO_NOT_RELY
    period carries its reason and supports no central claim; two datasets
    that disagree are both kept, with the difference explained or recorded
    as unexplained. Record each unmet item as a finding. (Standard §4)
13. Give the verdict:
    PASS: no findings.
    PASS WITH CORRECTIONS: every finding is fixed by changing wording, adding
    a disclosure, adding a count or removing an untraceable number; list
    each correction and apply it.
    FAIL: a reported number that cannot be traced is kept in the draft, a
    result depends on an unrecorded step, a finding (not a restatement
    corrected under rule 10) states cause with no QCAU record that permits
    it, a central claim (Standard §9) rests on an exploratory pattern
    presented as tested or on a dataset or period marked DO_NOT_RELY, a
    record or a field Standard §4 requires is missing, or any other finding
    is one that none of the corrections above fixes.
    A QAUD with fresh_context no records that as a finding and cannot give
    PASS. (Standard §4)
14. Write the QAUD handoff: the QRES ids that may be passed on, each with
    its interval, level, label and datasets; the QCAU ids that cover them;
    the QFRM id whose population, coverage gap and claim level travel with
    them; and any condition they carry. The handoff is empty on FAIL.
    Anything passed on that the handoff does not list, or that drops what it
    lists, is a restatement and is checked under rule 10. (Standard §10)

OUTPUT
QAUD record:
| audit_id | QAUD-NNNN | audited_at | fresh_context (yes/no) |
| numbers_traced | number, record id or "none" |
| findings | rule, location, problem, correction |
| restatements | text, finding id, raised / widened / causal, correction |
| verdict | PASS / PASS WITH CORRECTIONS / FAIL |
| handoff | result ids, causal ids, framing id, conditions (empty on FAIL) |
```
