# Changelog

## 2026-10-10 — DIR-0047: the premise status of a handed-off result (T-0374)

Version v0.3 (no change to the version: one pointer added to Standard §10).

- Standard §10's Out bullet ends with a pointer to `INTEROP.md` §3 [IN-085] and
  [IN-086], which set the status a handed-off result takes as a premise in the
  work that checks an argument built on it: `VERIFIED` when the QAUD verdict
  is `PASS` and every dataset behind it carries an `upstream_status` of
  `VERIFIED`; `VERIFIED` conditional on the listed corrections for
  `PASS_WITH_CORRECTIONS`; `UNVERIFIED` for any part that rests on a dataset
  below `VERIFIED`, split and not rounded; and never stronger than the QCAU
  permitted wording.

## 2026-10-10 — DIR-0046: fixes from the re-audit (AUDIT_QAS_2026-10-10b)

Version v0.3. Fixes from the second audit of QAS, applied under DIR-0046.

- MISSING-1: new Module 07 rule 14 writes the QAUD `handoff` (result ids
  with interval, level, label and datasets; causal ids; framing id;
  conditions; empty on FAIL); Module 07's OUTPUT gains a `handoff` row; the
  schema says rule 14 writes it; Standard §10, the catalog and T01 step 10
  point to the rule; Q20 and Q33 target it.
- MISSING-2: Module 04 rule 7 also runs the result with and without any
  material whose `assurance.upstream_status` is unsettled and states it as
  conditional; QRES `robustness` gains `with_unsettled` and
  `without_unsettled`; Module 07 rule 12 checks Standard §10 In; Q19
  targets both.
- MISSING-3: `upstream_status` becomes a list of entries, each with
  `system`, `record_id`, `status` (spelled as the issuing system spells it)
  and `applies_to`; Policy rule 23 and INTEROP [IN-083] say so.
- MISSING-4: QRES gains `datasets` (dataset id, period used, reliance,
  limits stated) and `interval_covers`; new Module 05 rule 14 states them
  beside every result; the assurance block gains `conflicts_with` (Policy
  rule 21), `official_statistics.principles_relied_on` (Policy rule 3) and
  `reliance_by_period` (BROKEN-7); Module 07 rule 12 checks Policy rules 8
  and 18 to 21.
- MISSING-5: BEHAVIORAL_FAILURES.md F07 and F31 and INPUT_INTEGRITY.md U01,
  U03 and U06 point at QAS's policy and Standard §10 controls ([BF-172],
  [BF-173], [II-042], [II-043], [II-044]).
- MISSING-6: INTEROP [IN-026] lists the QAS rubric's four values.
- MISSING-8: README states the current version (v0.3); the DIR-0046 heading
  carries v0.2.
- MISSING-9: the confidence file takes the full shape: Purpose, Vocabulary,
  Worked examples in a quantitative context, seven numbered Rules, and
  "Restating a finding" unchanged; INTEROP no longer groups QAS with the
  shorter files ([IN-066], new [IN-084]).
- BROKEN-1: Module 07 rule 13's FAIL adds a central claim on a dataset or
  period marked DO_NOT_RELY, a missing record or field Standard §4
  requires, and any finding none of the corrections fixes; Q21's Pass
  requires FAIL.
- BROKEN-2: Q22's Pass gives FAIL until the step that removed 200 rows is
  recorded.
- BROKEN-3: Q20's Pass sends no verbal likelihood term; its Fail adds
  "very likely".
- BROKEN-4: Q21's input no longer supplies the QAUD; the audit runs in the
  drafting conversation and the Pass records `fresh_context` false.
- BROKEN-5: Policy rule 19 reports a DO_NOT_RELY result with its reason
  beside it; "exploratory" keeps the label's meaning; Q14's Pass likewise.
- BROKEN-6: Policy rule 17 adds UNKNOWN where the documentation does not
  answer; rule 18: an UNKNOWN item is a limit and excludes RELY.
- BROKEN-7: Policy rule 18 judges reliance per period when a quality event
  covers part of the period used; a correction already applied in the
  vintage used is a limit; Q13's Pass names the split.
- BROKEN-8: the DIR-0044 entry moves above v0.1, its stray bullet joins its
  list, and its "Left to the maintainer" line is corrected; BUILD_LOG
  likewise.
- BROKEN-9: INTEROP [IN-060], [IN-061] and [IN-071] name QAS and LAS where
  the pipeline puts QAS between them.
- BROKEN-10: Policy rule 18's "cannot be bounded" becomes "no bound on the
  share ... can be stated from the documentation or an independent
  source"; rubric step 7 re-runs after "any change to the prompt text or
  the files it loads"; Policy rule 17 defines "the quality the question
  needs most" from QS-28's output dimensions, chosen from the answer form
  (logic); Policy rule 21's "where the records allow" becomes "recorded as
  unexplained"; Standard §9 defines "where possible" for plans and
  exclusion rules (logic); rubric step 4 says which properties go to a
  script.
- UNTESTED-2: Q25 (Policy rules 1, 17, 18), Q26 (rules 5, 6), Q27 (rules
  11, 15), Q28 (rule 16), Q29 (rules 8, 20; Module 05 rule 14), Q30 (limit
  7), Q31 (template T03), Q32 (the project-instructions template's rule
  10), Q33 (the handoff); the Coverage note now says limits 1 to 8 each
  have a test.
- UNTESTED-3: the suite has 33 tests (LAS, the smallest of the four, has
  31).
- UNSOURCED-1: Policy rule 3 names the National Academies' principles, not
  "the US principles".
- UNSOURCED-2: Policy rule 2's FOUND category is this system's own
  ("(design)"); QS-32 stays on rule 9 only.
- UNSOURCED-3: Policy rules 3, 15 and 21 mark QS-29 and QS-33 "as relayed".
- UNSOURCED-4: SOURCE_INDEX's QS-17 entry reads "Seven bands, two
  alternative terms for each; do not mix the two sets".

Left to the maintainer: MISSING-7 (which LAS premise status a handed-off
QAS result takes), UNTESTED-1 (runs, parked under DIR-0040) and UNTESTED-4
(claim-ledger.py's pattern).

## 2026-10-10 — DIR-0046: full authority system (v0.2)

The maintainer chose "Full system, in the pipeline": QAS takes router row 3,
between fact (row 2) and inference (row 4), and PROP-0007's cost limits no
longer bind it.

- New `CORE/DATA_SOURCE_AND_QUALITY_POLICY.md`: 23 numbered rules on how far a
  dataset can be relied on, by how it was collected and the assurance behind
  it (official statistics under a code of practice, administrative data and
  any published assurance level, survey error sources, found data and its
  coverage), by its documentation (the datasheet questions) and by its fit
  for the question; a reliance level RELY / RELY_WITH_LIMITS / DO_NOT_RELY;
  a producer's standing does not settle quality (QS-37, QS-38).
- New `CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md` (four layers),
  `EVALUATION/PROMPT_QA_RUBRIC.md` (13 blocking defects, 12 dimensions,
  maximum 36), `BUILD_PLAN.md` and `BUILD_LOG.md`.
- `CORE/QAS_STANDARD.md`: §2 principle 9 (data reliance); §3 names the load
  (Standard, policy, confidence file when used) and QAS's place in the order
  of work; §4 item 8 (each QDAT has an assurance block; no central claim on
  DO_NOT_RELY data); §8 defines "(design)"; new §10 Hand-offs (status
  received is kept; results pass on only as the QAUD `handoff` lists them).
- `EVALUATION/OUTPUT_SCHEMAS.md`: QDAT gains `assurance` (the dataset
  assurance block, defined at the end of the file); QAUD gains `handoff`. The
  opening paragraph was reflowed so no later line moved.
- Module 02 rule 12 fills the assurance block; Module 02's QDAT OUTPUT gains
  an `assurance` row. Module 07 rule 4 also checks the assurance block,
  rewritten in place on its two lines.
- Template library: the invocation block lists the policy; T01 step 2 names
  the assurance block and step 10 the hand-off; new T03 Dataset Reliance
  Check. The catalog's Module 02 row, routing rules and composition pattern
  name the policy and the hand-off.
- `EVALUATION/ADVERSARIAL_TEST_SUITE.md`: Q13–Q24 (the policy, Module 07's
  completion rules, the hand-offs in and out, and the rules the first audit
  listed as named by no test, AUDIT_QAS_2026-10-10 UNTESTED-2); regression
  gate grows to Q03, Q06, Q07, Q11, Q12, Q13, Q19, Q20, Q21.
- `SOURCE_INDEX.md`: QS-25 to QS-39 (trail PS-0301 to PS-0315), limits 8
  (a producer's standing) and 9 (checklists), and the not-read entries.
- `README.md`: status line, the order of work, Structure lists every file;
  the statement that the rubric, template and plan are deliberately absent
  is removed.

## 2026-10-10 — DIR-0045: terms defined from published sources (T-0370)

- Standard §9 "Terms": "central claim" (a claim the draft's headline, summary or conclusion states, and the result the QPLN plan names as answering the question; named before outcomes are seen where the work allows, as a primary outcome is; QS-22, QS-23; a changed designation reported, QS-24) and "plausible structure" (one the stated subject-matter knowledge does not rule out, each written with that knowledge; QS-09, re-read).
- Module 07 rule 13 and Module 06 rule 4 point to Standard §9.
- SOURCE_INDEX.md: QS-22 (CONSORT 2010 Explanation and Elaboration), QS-23 (ICH E9 §2.2.2), QS-24 (COMPare 2019) and a limit on switched primary designations.

## 2026-10-10 — DIR-0044: fixes from the first audit (AUDIT_QAS_2026-10-10)

- MISSING-1: QCLN, QPLN and QRES gain `written_at` (date and time) in the
  schemas and in Modules 02 and 04's OUTPUT; QRIV's `dated` becomes
  `written_at`.
- MISSING-2: Module 02's QDAT OUTPUT gains `framing_id` and
  `received_file_unchanged`.
- MISSING-3: QRES gains `no_interval_reason`, required when `interval` is
  empty (schema and Module 05 OUTPUT).
- MISSING-4: new Module 07 rule 12 checks each Standard §4 item and the
  draft's population, scope and claim level against the QFRM record.
- MISSING-5: Module 07's verdict rule (now rule 13): a QAUD with
  `fresh_context` no records a finding and cannot give PASS.
- MISSING-8: QCAU `likelihood_term_with_band` replaced by `likelihood_term`
  (one of the seven wire tokens) and `band`, written together in prose.
- BROKEN-1: Module 05 rule 10 reads the subgroups from the QPLN record.
- BROKEN-2: verdict rule: FAIL when an untraced number is kept or a finding
  (not a corrected restatement) states cause without a permitting QCAU;
  PASS WITH CORRECTIONS allows removing an untraceable number; T01 step 9
  returns a FAIL to the module the finding names.
- BROKEN-3: Q12's fixture gives the QRES as an estimate with its interval and
  its Pass restores the interval, with no verbal term; Q12 also targets the
  verdict rule (13).
- BROKEN-4: Module 07 rule 11 checks terms against the Term column.
- BROKEN-5: Standard §2 principle 1 and README core rule 1 accept a disclosed
  viewing before framing (Module 01 rule 9).
- BROKEN-6: SOURCE_INDEX reads "Standard §2 principle 3" and "§2 principle
  6"; README's core-rules pointer reads §2–§4; the v0.1 entry's §4.1 and §4.3
  are glossed as §4 items 1 and 3.
- BROKEN-7: Module 07 rule 8 audits "no effect" for any result Module 05
  rule 5 covers.
- BROKEN-8: OUTPUT_SCHEMAS states that module tables may write values in
  words and records carry the schema spelling.
- BROKEN-9: Standard §2 principle 4 defines QRIV `phase` and QPLN/QRES
  `label` as different fields.
- BROKEN-10 (exclusions only): each QPLN `exclusions` entry gains
  `written_before_outcome_seen`; Module 04 OUTPUT shows it.
- UNTESTED-4: Module 07 rule 12 also checks Module 05 rule 12's
  one-contribution statement and Module 06 rule 7; each QRIV rival gains a
  `category` (Module 03 rule 2); exclusion ordering as BROKEN-10.
- UNSOURCED-1: Module 03 rule 2 marks chance, artefact and reverse direction
  "(logic)"; QS-11, QS-09 and QS-06 stay on the other three.
- UNSOURCED-2: Module 02 rule 4's count clause is marked "(logic)".
- UNSOURCED-3: the confidence file says ICD 203 gives two alternative terms
  for each band, not "rows".
- UNSOURCED-5: SOURCE_INDEX "Not read" adds QS-03, QS-13, QS-14, QS-09 and
  QS-08's limits.

- UNSOURCED-4: `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`: the "Restating a finding" section's last sentence now reads "in both studies the exaggeration was in the restatement, not in the result it restated", the same in every system (audit check 65).

Left to the maintainer: UNTESTED-1 and UNTESTED-2 (MISSING-6, MISSING-7,
UNTESTED-3 and UNSOURCED-4 were done in the same change; BROKEN-10's two
criteria under DIR-0045).

## 2026-10-10 — v0.1, built under DIR-0043

First build, under PROP-0007's cost limits:

- `CORE/QAS_STANDARD.md` and `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` (the load).
- Seven modules: 01 Question and Data Framing; 02 Data Provenance and
  Cleaning; 03 Rival Hypotheses and the Discriminating Test; 04 Choosing and
  Running the Analysis; 05 Uncertainty, Effect Size and What a p-value Is
  Not; 06 Causal Judgement; 07 Final Quantitative Audit.
- `PROMPT_MODULE_CATALOG.md`; template library with T00–T02.
- `EVALUATION/OUTPUT_SCHEMAS.md` for record prefixes QFRM, QDAT, QCLN, QRIV,
  QPLN, QRES, QCAU, QAUD.
- `EVALUATION/ADVERSARIAL_TEST_SUITE.md`: Q01–Q12; regression gate Q03, Q06,
  Q07, Q11, Q12; one test per disconfirming limit.
- `SOURCE_INDEX.md`: QS-01 to QS-21, six limits, and the not-read list.
- `README.md`, `LICENSE` (CC BY 4.0).

Second-reader fixes, same day: Module 02 rule 7 marks missing-value coding
"(logic)"; Standard §4.1 (§4 item 1) accepts disclosed viewing before
framing and §4.3 (§4 item 3) limits the skip to descriptive answers; Module 04 rule 3 writes the assumed
causal arrows into a new QPLN `causal_assumptions` field, which Module 06
reads; QPLN log entries gain `reason`; QRES gains `group_makeup_difference`;
Module 03's output field renamed `rivals_identified_so_far`; QS-08 notes the
volume was not shown in the copy read.

Not built, by design: prompt QA rubric, project-instructions template, build
plan.
