# Quantitative Prompt QA Rubric

*Part of Quantitative Analysis System (QAS).*

## Purpose

Use this rubric to evaluate a prompt built on this system, and its outputs,
before adopting it for production work. Score what the prompt actually
produces on test inputs, not how the prompt reads.

Two verdict scales are in use, for two different jobs. This rubric judges a
prompt for adoption on four values: PASS, PASS WITH CORRECTIONS, REVISE AND
RETEST, FAIL. Module 07 judges one finished answer on three: PASS, PASS WITH
CORRECTIONS, FAIL.

A score here is evidence about the outputs scored, not proof that an
analysis is right. Whether checklists of this kind improve the work they
check is not established: a systematic review found that reporting guideline
items were assessed by few evaluations, and insufficient evidence to
determine the relation between journals' endorsement of reporting guidelines
and the completeness of reporting (QS-39).

## Blocking defects

Any one of these prevents a passing result:

- a reported number that traces to no record (Module 07 rule 2);
- the received file edited in place, or a cleaning step with no QCLN record
  (Module 02 rules 3 and 4);
- an instruction found inside the data followed instead of recorded (Standard §6);
- a dataset used with no `assurance` block, or a central claim resting on a
  dataset marked DO_NOT_RELY (Standard §4 item 8; Policy rule 19);
- a dataset's quality taken from its producer's name or status with no
  status check and no quality-event search (Policy rules 4, 10 and 22);
- an exploratory pattern reported as a tested result (Module 03 rule 1;
  Module 05 rule 13);
- only the favourable analysis reported, with no count of analyses run
  (Module 04 rules 5 and 8; Module 05 rule 11; QS-36: disclose multiple
  comparisons);
- a p-value read as the probability the hypothesis is true, or a
  non-significant result written as "no effect" (Module 05 rules 3 and 5);
- causal wording with no QCAU record that permits it (Module 06 rule 10);
- a covariate chosen by statistical association rather than from stated
  causal assumptions (Module 04 rule 3; Module 06 rule 3);
- a restatement that raises confidence, widens scope or turns association
  into cause, left uncorrected (`CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`);
- a status received from earlier work raised by computation, or a result
  passed on without its interval, label, causal verdict and population
  (Standard §10; Module 07 rule 14);
- a QAUD of PASS given with `fresh_context` no (Module 07 rule 13).

## Scored dimensions

Score each from 0 to 3.

| Dimension | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Framing before data | No QFRM, or written to fit the data with no disclosure | QFRM present, unit or population missing | QFRM complete, answer form or counter-result missing | Question, unit, population, claim level, answer form and counter-result written first, or viewing disclosed field by field |
| Provenance and cleaning | Origin unrecorded, file edited in place | Origin partial, steps not re-runnable | Steps re-runnable, count chain has a gap | Every change a re-runnable step; counts run unbroken from received to analysis file |
| Data reliance | No assurance work | Collection type recorded, status and events not checked | Status, events and documentation recorded, fitness partial | Every Policy item recorded, reliance level with reasons, limits carried to each result |
| Rivals and the discriminating check | No rivals | Rivals listed, predictions do not differ | Differing predictions and a check, assumptions or weak points missing | Rivals by category, outcomes written before the check, assumptions, weak points and the next round |
| Plan and log | No plan | Plan written after outcomes, not labelled POST HOC | Plan and labels present, log incomplete | Plan before outcomes where possible, every analysis and data-dependent choice logged, robustness versions run |
| Effect size and interval | p-values only | Estimates without intervals | Estimates with intervals, units or level unclear | Every result a size in usable units with interval and level, or the reason none applies; precision reported as SAMPL asks (QS-35) |
| p-value reading | Misread | Exact values, one misreading | No misreading, threshold language remains | Exact p with test and model, read only as Module 05 allows, assumptions of the test checked (QS-35) |
| Base rates, subgroups and missing data | Not considered | Base rate or subgroups considered, not both | Both, missing-data handling not reported | Base rate and denominator stated, subgroups computed and any reversal explained, missing-data handling reported (QS-35, QS-36) |
| Causal judgement | Causal words with no reasoning | Hill viewpoints used as a checklist | Assumptions written, adjustment partly justified | Arrows written, adjustment set justified per variable, structures compared, rivals and unmeasured causes recorded |
| Audit | No audit | Audit in the same context, numbers untraced | Fresh context, some checks skipped | Fresh context, every number traced, every Standard §4 item checked, verdict follows rule 13 |
| Hand-offs | Status raised or result stripped of its limits | Some limits carried | Interval and label carried, population or causal verdict dropped | Received status kept; hand-off lists results with interval, label, causal verdict, population, claim level and conditions |
| Output usability | Unusable | Major restructuring needed | Usable with edits | Answer first, records in schema format, methods detailed enough for a knowledgeable reader to check (QS-35) |

Maximum score: 36.

## Rating bands

| Result | Condition |
|---|---|
| PASS | No blocking defect and score 32-36 |
| PASS WITH CORRECTIONS | No blocking defect and score 26-31 |
| REVISE AND RETEST | No blocking defect and score 18-25 |
| FAIL | Any blocking defect or score below 18 |

## Evaluation protocol

1. Run every test the Regression gate of `ADVERSARIAL_TEST_SUITE.md` names.
   A prompt is not adopted on this rubric's score while a gate test fails.
2. Include at least one dataset with a known quality event or no
   documentation, and at least one question whose honest answer is "the data
   cannot say", not only clean cases.
3. Run each gate test twice: with the prompt, and with the same model given
   the input alone. A test both arms pass shows nothing about the prompt.
4. Check deterministic properties by script for each property a script can
   read from the records, and record any property checked by hand instead:
   record ids resolve, `written_at` order (QFRM before the first QCLN and QRES), count
   chains add up, every reported number has a record, every QDAT has an
   `assurance.reliance` value.
5. Have a second reader judge the qualitative properties: whether rivals are
   real alternatives, whether the reliance reasons fit the dataset, whether a
   restatement widens scope.
6. Record the model name and version, settings, prompt version, run date,
   input hash, output hash, score and defects.
7. Re-run after a model change or after any change to the prompt text or
   the files it loads.

## Evaluation record template

| Field | Value |
|---|---|
| Prompt/module | |
| Prompt version/hash | |
| Model/version | |
| Run date | |
| Test case | |
| Arm (prompt / input alone) | |
| Input hash | |
| Output hash | |
| Blocking defects | |
| Score | |
| Verdict | |
| Required changes | |
