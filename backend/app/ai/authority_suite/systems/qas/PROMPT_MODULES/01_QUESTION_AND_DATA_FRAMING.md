# Module 01 — Question and Data Framing

*Part of Quantitative Analysis System (QAS).*

## Use when

A task will produce a number or test a theory against data. Run it before any
dataset is opened.

## Prompt

```text
OBJECTIVE
Write down what is being asked of the data, and what an answer would look
like, before looking at the data. Do not open, summarise or describe any
dataset in this module.

INPUTS
- The request, in the user's words
- The names of datasets expected to be used (names only, not contents)

RULES
1. Write the question as one sentence ending in a question mark. Record the
   date and time it was written in the QFRM record. (logic)
2. Classify the question: DESCRIPTIVE (how many, how much, how often),
   COMPARATIVE (is A different from B) or THEORY TEST (does this explanation
   fit the data better than its rivals). (logic)
3. Name the unit of analysis: what one row of the analysis file will be (a
   person, a contract, a precinct in one year). What counts as an observation
   depends on the question, so it is fixed from the question. (QS-05)
4. Name the population the answer is meant to cover (who, where, when). Name
   separately what the expected data cover. Record any gap between the two;
   the answer may not claim the wider of the two. (logic)
5. Name the level at which the claim will be made: population, subgroup or
   individual. If the data describe groups, record that an individual-level
   claim is not available from them. (QS-10)
6. List the variables: the outcome, the grouping or exposure variable, and any
   other variable the question needs. For each give a definition in words and
   its unit. (QS-04)
7. Write the form of the answer: the quantity to be reported (count, rate,
   difference, ratio), its unit and its denominator. (logic)
8. Write the result that would count against the expected answer. If none can
   be stated, record that the question is not yet testable. (QS-07)
9. If any dataset was opened before this record was written, say so in the
   QFRM record and mark each field written after viewing. Choices made after
   seeing data are not treated as planned in advance. (QS-02)
10. For a DESCRIPTIVE question with no comparison, record whether Modules 03
    and 06 are skipped, with the reason. (Standard §3)

OUTPUT
QFRM record (fields as in EVALUATION/OUTPUT_SCHEMAS.md):
| Field | Value |
| framing_id | QFRM-NNNN |
| question | |
| question_type | DESCRIPTIVE / COMPARATIVE / THEORY_TEST |
| unit_of_analysis | |
| target_population | |
| data_coverage_expected | |
| coverage_gap | |
| claim_level | POPULATION / SUBGROUP / INDIVIDUAL |
| variables | name, definition, unit |
| answer_form | quantity, unit, denominator |
| result_against_expected | |
| data_viewed_before_framing | yes/no + fields affected |
| modules_skipped | module, reason |
| written_at | |
```
