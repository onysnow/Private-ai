# Changelog

*Decision Authority System (DAS)*

## 2026-10-18 — DIR-0051: the outcome's mechanism and a gap's materiality are separate questions (T-0377)

`PROMPT_MODULES/10_FINAL_DECISION_AUDIT.md` rule 10 now keeps two questions apart: what caused the outcome (the mechanism), and whether a gap bore on how large the loss grew or whether it was contained (its materiality). A gap that bore only on size or containment is stated as such (material, not material or unknown) and is not the mechanism; where the cause lay outside the record, no gap is named as the mechanism; neither answer changes the verdict or sections A–C. The rule asked for a materiality note and D01's pass condition forbade naming a gap as the mechanism, and one of three readers of the two-run D01 rerun (RUN-0039) read the note as breaking the condition. D01's pass condition in `EVALUATION/ADVERSARIAL_TEST_SUITE.md` now uses the same two terms (suite revision recorded in its header). Dropping the note was rejected: it is honest information about why a loss grew, and removing it would make the second-run audit less truthful.

## 2026-10-12 — DIR-0050: an option about to be lost is secured first (T-0376)

`PROMPT_MODULES/01_DECISION_FRAMING.md` rule 10 now ends: whatever the domain, an option that will be lost before the analysis can finish is secured first, as a stabilising step recorded in short form with a review trigger. Only the Chaotic label allowed acting first, and the doctrine arm of gate case D14 classed a fast-moving crisis as Disorder and held everything for the pipeline on both fixtures (RUN-0017, T-0376). The maintainer's approval: DIR-0050.

Later the same day: rule 6's Chaotic label gains its observable signal (a situation changing faster than analysis can finish, where waiting is itself causing harm), and rule 10's stabilising step is taken now with a named owner. The rerun on the first wording classed the same crisis Disorder/Complex and left the step undecided with no owner. Under the same approval (DIR-0050, the maintainer's "just fix them").

## 2026-10-10 — DIR-0044: the restating-a-finding section's last sentence

Under DIR-0044, `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`'s "Restating a finding" section ends "in both studies the exaggeration was in the restatement, not in the result it restated", where it said "the restatement is where accuracy is lost", which claimed more than the two studies show (AUDIT_QAS_2026-10-10 UNSOURCED-4, AUDIT_EHS_2026-10-10 UNSOURCED-5). The same words in every system (audit check 65).

## 2026-10-10 — DIR-0043: three further systems and claim fidelity

Under the maintainer's directive DIR-0043 (2026-10-10), which built PROP-0007:

- `README.md`: a paragraph naming the three systems added that day — QAS (quantitative analysis), EGS (evidence gathering) and EHS (ethics and harm) — and where this system's job ends against each (DEC-0036's boundary-by-job rule; audit check 34 (d) now reads every README for every other system's name).
- `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`: the section "Restating a finding" added at the end, word for word the same in every system (INTEROP.md [IN-067]; audit check 65). A restatement may simplify a finding but may not raise its confidence term, widen its scope, or state an association as a cause (Sumner et al., BMJ 2014; Boutron et al., JAMA 2010 — papertrail/project/SOURCES.md PS-0246, PS-0283).

## 2026-10-05 — DIR-0042 decisions

Under the maintainer's directive DIR-0042 (2026-10-05), his answers "Duplication check" and "Yes, CC BY 4.0":

- The load ceilings of 2026-09-25 (minimum 38,448 bytes, T02 66,725, §6–§15 5,000) are retired; the umbrella's audit check 63 reports a rule restated in files DAS loads together instead. It found one: Module 04 rule 2's second sentence repeated the Standard §4.5 definition of an assumption, so the rule now points to §4.5. The overage the 2026-10-03 entry left open is closed by that choice.
- `LICENSE`: Creative Commons Attribution 4.0 International, replacing "All rights reserved"; the README's structure list says so.

## 2026-10-03 — DIR-0041 decisions

Under the maintainer's directive DIR-0041 (2026-10-03), his answers to the open decisions:

- `EVALUATION/OUTPUT_SCHEMAS.md`: the pre-mortem finding's id prefix is `PMF-` (was `PRE-`), in `finding_id` and the decision record's `premortem_ids` (INTEROP §7; T-0004). The maintainer's choice. Reversibility keeps DAS's `TYPE_1|TYPE_2`; INTEROP §6 maps it to the trail's `TYPE-1|TYPE-2` (T-0217).
- 2026-10-03, Module 10 rule 6 lists the decision record (Module 08) among the stages it checks, with its outcome-information leakage check filled in whenever an outcome existed when the record was written (Module 08 rule 1); D13's coverage line names it (T-0200).
- 2026-10-03, Standard §18 names the fixed minimum a lightweight pass meets — framing, reversibility, options, the key assumption, the decision and its review trigger — and requires each stage it does not run to be listed as skipped; §2.3, the catalog's lightweight-pass routing rule, Module 01 output B, Module 03's Use when and T02 (step 5, output D) say the same (T-0208).
- 2026-10-03, Module 11 rule 10 and output D: when a trigger fires or a review date arrives, its monitor writes the outcome record (OUT-, the schema's Outcome record), descriptive only, before the review; the schema note and the catalog row name Module 11 as its producer (T-0204 item 2).
- 2026-10-03, Module 04 rule 16 checks motivated reasoning, citing Kunda 1990 (PS-0219, already in SOURCE_INDEX); the bias-finding enum gains `MOTIVATED_REASONING`; the catalog row, BUILD_PLAN:16 and README list the same eight biases as the module (T-0207). The suite's coverage line reads 113 of 115 numbered rules: rule 16 and Module 11 rule 10 have no test.
- 2026-10-03, Module 01 rule 7's frequency wording (RF-0026 (h)) was already removed on 2026-10-02 (T-0212, entry below); no further change.
- `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` carries ICD 203's seven likelihood terms with their probability bands and the directive's alternative term beside each, quotes its rule on mixing the two term sets (Rule 1 requires the disclaimer) and its bar on a confidence level and a likelihood term in one sentence (Rule 3); the consequence, assumption and decision records' confidence fields take `VERY_LIKELY` and `VERY_UNLIKELY` as well, and records written before 2026-10-03 keep their five-term values (INTEROP §2; T-0225, wording as T-0231 read it from ODNI's copy). Standard §9 and the README say seven terms. The maintainer's choice (2026-10-03).
- Load: with every change above, T02's load (Project Instructions, Standard, Policy, `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`, Modules 01, 02, 04, 08 and 11) goes from 65,412 to 69,251 bytes (`cat <files> | wc -c`), over the 66,725-byte ceiling of `CODE_REVIEW_DAS_2026-09-25.md` F14 by 2,526. The confidence file adds 1,534 bytes, the Standard 932, Module 11 901, Module 04 325 and Module 01 147. The minimum load (Project Instructions, Standard, Module 01) is 36,023 bytes against its 38,448 ceiling, and Standard §6–§15 4,775 against 5,000 (the review's `sed -n '/^## 6. Standard decision pipeline/,/^## 16/p' | wc -c`). No other text was cut to make room; whether to trim the load or restate the ceiling is open for the maintainer.

## 2026-10-02 — DIR-0040 fix pass

Under the maintainer's directive DIR-0040 ("Go thru each task and only fix it or do it if it's still necessary to do"), the open DAS tasks were each judged necessary or not; the necessary ones are fixed here. Each change has a check that finds the defect on the pre-edit files and not after. All of it is ALLEGED until a second session checks it.

- T-0204: the decision record gains `review_trigger_ids` (Module 11's records, at least one before the record is complete, §18), which Module 08's table carries and Module 11 output A fills; the short form's "review-trigger field" now names it; Module 10's inputs include Module 11, so rule 8 can check the trigger. Who writes the outcome record (OUT-) is left to the maintainer.
- T-0205: Module 10 output E states the reviewer type and whether the run had a fresh context, and output A the audit record ID; the schema defines `reviewer_type` and `rule_compliance.rule` (Module 10 rules 2–5). `material_to_outcome` was already defined.
- T-0206: ID columns in the producing modules' outputs — decision (Module 01), evidence and constraint (02), consequence (03), bias finding (04), sensitivity (05), criterion and comparison (06), reversibility check (09), audit record (10) — and an expiration column in Module 11 (rule 9); an independence column in Module 02's evidence table; `STK-SET-` is dropped for a `stakeholder_ids` list, and Module 08's rows name record IDs.
- T-0207: the duplicated 2026-09-20 BUILD_LOG entry is removed; README's status no longer says the content is pending commit and push; the 0.1.0 entry's counts read 15 schemas and 14 blocking defects, and it and the README name the modules the targeted templates cover; the catalog's Module 04 row lists availability; Standard §6 runs Module 11 (Stage 9) before Module 10 (Stage 10), as the catalog and T01 do; BUILD_PLAN's note names §7–§13 and §15. Whether Module 04 should check motivated reasoning, as BUILD_PLAN's Module 04 line says, is left to the maintainer.
- T-0212: §19 and SOURCE_INDEX say where PE-01 to PE-04 and FI-01 are defined (TAS's index); three unsourced "single most common" frequency claims (§2.1, §5.2, Module 01 rule 7; PS-0212 and PS-0213 found no support) are removed; the confidence file's intelligence-community clause is narrowed to the one documented estimate PS-0188 supports, and PS-0188 is listed under the supporting sources.
- T-0214: evidence and constraint tiers are written `DAS:A`–`DAS:F`, and the evidence record and Module 02's table carry `upstream_tier` for a cited TAS or RAS finding (umbrella INTEROP [IN-008]–[IN-010]; Policy §8).

## 0.1.4 — 2026-09-27

Fixes from the 2026-09-26 code reviews (`papertrail/project/audits/CODE_REVIEW_*_2026-09-26.md` in the Authority Systems umbrella), made under the maintainer's directive DIR-0014, which lifts SA-019 for those findings. DIR-0003 stays: the three held TAS items are not touched. Each fix was checked failing on the pre-fix snapshot and passing after (`papertrail/project/evidence/fix-<REVIEW>-2026-09-26.txt`).

From CODE_REVIEW_TESTS_2026-09-26:

- Adversarial suite (2026-09-28, TESTS F14): the Coverage section names the module rules each test exercises and lists the numbered rules no test reaches.
- Adversarial suite: D17–D32 (2026-09-28, TESTS F14) — tests for the 68 numbered module rules no test reached; run on the second tier's condition. README count now 32.
- Adversarial suite: D05 classifies under Module 09 Rule 3 — Type 2 only when the walk-back cost is acceptable (F33); a Coverage section, which at first named Modules 02 and 05 as untested (F14 — recorded; the 2026-09-28 tests in the entries above closed it).
- Rubric: REVISE AND RETEST requires no blocking defect (F13); the evaluation protocol runs every gated case (F22).

From CODE_REVIEW_DAS_2026-09-26:

- Chaotic domain: Module 08 rule 11 defines the short-form record for a stabilizing action; §5.2 cites it; §18 says which completion conditions it meets; T01 says the stabilizing action happens before the template; the decision record gains `record_form` and `follow_on_decision_id` (F1).
- Module 10 checks the record against Standard §5, §7–§13, §15 and §18, and §14, the catalog, README and a BUILD_PLAN note say the same — the Standard holds no list called "non-negotiable rules" (F2).
- Module 10: the second run writes D only, including any independence limitation; no outcome, no D; section C loses the outcome column, and D states each gap's materiality, recorded in the final-audit record's `gap_materiality` (F3, F5). D01 follows the two-run design (F4).
- Schema: a Constraint record (F11); a comparison ID, and the decision record references the comparison, criteria, constraints and chosen probes (F10, F9); `PROBE` option type and a recommended probe list (F9); `reversibility_revision_note` (F12); `domain_parts` with Module 01 rule 10 naming which part routes the pipeline (F13); `resolution_disposition` for every sensitivity record, with Module 05's table gaining disposition and monitor columns (F18); the confidence fields' value sets (F22).
- Module 06: one common score scale before scoring, and the METHOD NOTE states the additive model's conditions; `score_scale` in the comparison record (F16).
- PIT: Layer 1 rules 1–13 point to the Standard's sections instead of restating them (F30); rule 10's premise is that the plan failed (F19); Layer 2's lightest case is T02's pass (F7); Layer 4 archives the evidence table, constraint check, consequence map and reversibility-check record (F29).
- Module 04 rules 11 and 13 cite DS-20 (Arkes & Blumer 1985) and DS-21 (Samuelson & Zeckhauser 1988), added to SOURCE_INDEX and §19 (F23); rule 7 records an independently derived range as the anchoring mitigation, and D08 cites it (F25).
- Suite: D09 allows UNCLEAR for a missing control (F27); D14's scenario lacks discernible cause and effect (F26); Coverage count 4 → 9. D05 was fixed with the TESTS review above (F24).
- Suite: D15 (an unsourced constraint may not remove an option, Module 02 rule 11) and D16 (a genuine unknown in a Type 2 decision becomes a monitored risk, Module 05 rule 5) — the first tests to name Modules 02 and 05 (CODE_REVIEW_TESTS_2026-09-26 F14, 2026-09-28). 16 tests.
- Text: Module 03 rule 4 (F6); T09 consults Module 10 and the schema only (F8); INTEROP's prompt-adoption row names DAS's rubric (F14, umbrella); Standard and library version lines (F15); catalog's Module 06 output (F17); §4.12 and Module 11 rule 7 cover a permanent commitment's trigger (F20); CCL Rule 1 states the range (F21); SOURCE_INDEX's sibling paths (F28).

Under the maintainer's directive DIR-0015 (2026-09-30):

- Module 10 rule 12: a defect found in the items that could be assessed that warrants FAIL is FAIL, with the limitation stated in E; LIMITED REVIEW only when no such defect was found — the precedence TAS's final-audit modules state.
- Suite: D30's pass condition follows it — the four defects flagged, the sensitivity stage named as not assessable, and FAIL with that limitation stated. Recorded runs on the earlier wording: PROBE-0042/0043.

Under the maintainer's directive DIR-0016 (2026-09-30):

- Module 06 rule 10: when every option supplied is a final commitment, Module 06 does not score them; it names candidate probes derived from them, each with what it would reveal, a cost ceiling, survivability and amplify and dampen signals, and returns them to Module 02 as PROBE options. D26's pass condition follows. Recorded runs on the earlier wording: PROBE-0042/0043, PROBE-0048.

Under the maintainer's directive DIR-0020 (2026-09-30), text corrections from the doctrine-by-doctrine review (`papertrail/project/audits/DOCTRINE_REVIEW_2026-09-30.md`, DAS #1–#6, #8, #9):

- OUTPUT_SCHEMAS: the `process_verdict` note states Module 10 rule 12's precedence — a defect warranting FAIL is FAIL with the limitation stated; LIMITED_REVIEW when none was found (#1).
- Module 08's decision-record table carries the record form and follow-on decision, chosen probe IDs, constraint IDs and the reversibility revision note the schema and Module 09 rule 9 name (#3).
- Module 02's option Type column admits `probe`, the type Module 06 rule 10 returns (#4).
- Suite: the D01 Coverage row names Module 10 rule 10; a revision note records the D30 and D26 rewrites and their hashes (#5, TESTS #13).
- Catalog: Module 10 audits against §5, §7–§13, §15 and §18, as Standard §14 and Module 10 say (#6).
- This log: the 0.1.4 Coverage clause reads as of its day; DIR-0015 dated 2026-09-30 (#8).
- INTEROP §2 and §4: the four confidence files share the five terms, not identical meaning cells; the finished-deliverable row locates DAS Module 10's vocabulary (#9, #2).

Under the maintainer's directive DIR-0021 (2026-09-30), the review's content finding decided by the session (`papertrail/project/audits/DOCTRINE_REVIEW_2026-09-30.md`, DAS #7):

- T02: a Complicated domain routes to T01 with Complex, Chaotic and Disorder; T02 is for Simple/Clear only (T-0329).

Under the maintainer's directive DIR-0035 (2026-10-02), which extends the guard against output shaped by format rather than findings to this system's audit:

- Module 10 rule 6: each enumerated set (Modules 02, 03, 04, 07) is checked for size set by habit rather than by the decision or by a count a module prescribes, and the Module 06 matrix for cells filled because a column demanded them (umbrella `BEHAVIORAL_FAILURES.md` F26–F29; research RL-0016).

Under the maintainer's directive DIR-0036 (2026-10-02), which drops the "edition" framing: the byline on every file reads "Part of Decision Authority System (DAS)" in place of "— Decision Quality Edition", and the README says DAS is "not a part or subset" of its siblings. No rule, module, schema, test or source changed.

Under the maintainer's directive DIR-0037 (2026-10-02), [stated] "you need to get a source for each module. Otherwise it looks like we made it up": `SOURCE_INDEX.md` gains a section, "Supporting sources found after the rules were written", listing 20 works read on 2026-10-02 for the module rules that had no indexed source. Each is support found after the rule was written, never its origin; where a source disagrees with a rule it says so. No rule, module, schema or test changed.

## 0.1.3 — 2026-09-25

Completes F14 of `papertrail/project/audits/CODE_REVIEW_DAS_2026-09-25.md`,
under DIR-0013. 0.1.1 removed the drifted text, but when this release
began the minimum load (Project Instructions + Standard + Module 01) was
40,185 B.
It is now 35,134 B (`wc -c`; 38,448 B before DIR-0013), and §6–§15 are
4,718 B (the review's `sed -n '/^## 6. Standard decision pipeline/,/^## 16/p' | wc -c`;
9,667 B before DIR-0013, 9,769 B before this release).

- Standard §6 keeps its stage headings and names each stage's module;
  §7–§15 state what the stage must achieve, name the module whose rules
  govern, and keep their citations ([DS-05], [DS-12], [DS-14], [DS-15],
  [DS-16], [DS-18], [DS-19]). §9's first paragraph and §15's
  permanent-Type-1 clause are unchanged.
- §7.4 and §8.2 no longer exist: Module 10 rule 6 cites Module 03 rule 2,
  and Module 06 rule 5 cites Module 04 rule 5.

## 0.1.2 — 2026-09-25

Fixes that land in DAS from the umbrella layer's 2026-09-25 code review
(`papertrail/project/audits/CODE_REVIEW_UMBRELLA_2026-09-25.md`), under
DIR-0013.

- Standard §16: no one can authorize suppressing a dissenting view or an
  identified stakeholder, or presenting a foregone conclusion as freshly
  reasoned; the decision-maker may reframe or narrow the decision in their
  own instruction, and the record states it (umbrella F1).
- Calibrated Confidence Language Rule 3 no longer maps onto a three-value
  confidence field that DAS does not have; DAS's records carry the five
  terms (umbrella F5).
- False precision is cited to §9 and §10, not §2.3, which is "Minimum
  sufficient structure" — in Standard §9 and §10, Confidence Language Rule
  1 and test D07 (umbrella F12).

## 0.1.1 — 2026-09-25

Fixes for the fifteen findings in
`papertrail/project/audits/CODE_REVIEW_DAS_2026-09-25.md`, made under the
maintainer's directive DIR-0013 (the no-edit rule for `systems/` lifted
for those findings only). Each was checked absent before and present after.

- F1: a Chaotic-domain decision acts first — the stabilizing action is
  taken and recorded, and the pipeline runs on the follow-on decision
  (Standard §5.2, Module 01, T01, T02, the catalog); a Complex-domain
  decision compares safe-to-fail probes (Module 06 rule 10). Gated test
  D14 pins it.
- F2: an expected value carries a basis type — REFERENCE_CLASS,
  INSIDE_VIEW or NONE — so a record without a reference class is valid
  without a manufactured base rate (schema, Module 06 rule 5, D07).
- F3: Cynefin's fifth context, Disorder, is in the Standard, Module 01,
  the schema enum and SOURCE_INDEX DS-03.
- F4: worst case and maximum regret are separate measures, recorded
  separately, with the decision rule named when they disagree.
- F5: Module 09 rule 3 applies §5.1's test (reversible at acceptable
  cost); "not impossible to reverse" no longer makes a decision Type 2.
- F6: §18's completion condition requires the record to state whether
  outcome information was known when it was written.
- F7: every decision record needs a review trigger; for a permanent
  Type 1 commitment it reviews consequences and mitigation (§15, Module
  11 rule 5).
- F8: motivated-party evidence is tier F, as the Policy says;
  same-decision-maker evidence is tier E unless documented, and never
  independent corroboration.
- F9: stated constraints need a source before they remove an option
  (Module 02 rule 11 and output E, the library's variable table).
- F10: after an outcome exists, the audit is two runs — the process
  verdict with no outcome record in context, then the outcome section
  (Module 10 rule 13, T09, the catalog, the schema's
  `outcome_pass_separate_context`).
- F11: Module 09 records the plan's reversibility type, which supersedes
  the framing type downstream (rule 9, the schema).
- F12: a comparison record holds per-option weighted totals, expected
  value, worst case and regret; the criterion record holds weights and
  scores only.
- F13: the uncertainty record carries `monitored_by`.
- F14: §11 and §14 now point to Modules 07 and 10 instead of restating
  them; the §11 drift ("the most likely reason") is gone.
- F15: the pre-mortem premise is that the plan failed, not that the
  decision was a mistake (§11, Stage 6, Module 07 rule 1).
- Regression gate: D14 added.

## 0.1.0 — 2026-09-20

- Drafted `CORE/DAS_PROMPT_ENGINEERING_STANDARD.md`: the central standard, restructured from the earlier `DECISION_QUALITY_STANDARD.md` scoping draft into TAS's own section pattern (purpose/scope, design principles, prompt specification, decision ontology, classification requirements, standard pipeline, and a source basis) — 19 sections covering resulting, classification (Type 1/2, Cynefin), stakeholder and consequence discipline, assumption/bias/evidence discipline, calibrated uncertainty, comparative evaluation, pre-mortem discipline, decision-record documentation, reversibility and commitment, a final audit protocol, and post-decision review triggers.
- Drafted `CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md`: a new six-tier (A–F) evidence-and-precedent authority system, structurally modeled on TAS's `SOURCE_AUTHORITY_AND_RETRIEVAL_POLICY.md` but built around comparability rather than source authenticity — a precedent's weight depends on how comparable the reference case actually is to the decision in front of you, not on its category or how confidently it's cited. Includes a comparability test, expert-input tiering grounded in naturalistic decision-making research, and an explicit cross-reference to TAS's and RAS's own evidence-tiering work rather than re-deriving it.
- Drafted `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`: reused TAS's five-term ICD-203-derived vocabulary (Almost certain / Likely / Roughly even chance / Unlikely / Almost no chance) near-verbatim, with new worked examples in a decision context (vendor migration, pricing cannibalization, hire reversibility, competitor price-matching) in place of TAS's investigative examples.
- Drafted `CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md`: adapted TAS's four-layer structure (project instructions / active guidance / task materials / verification archive) to decision work, including a new required-label set (DECISION STATEMENT, PROXY QUESTION, OPTION, EVIDENCE/PRECEDENT, ASSUMPTION, GENUINE UNKNOWN, STAKEHOLDER POSITION, BIAS FINDING, PRE-MORTEM FINDING, DECISION, OUTCOME).
- Drafted all 11 prompt modules per the approved build plan's module order and names, mapping and substantially expanding the earlier 8-module scoping draft:
  - 01 Decision Framing (from the earlier Decision Framing & Classification module, with a new proxy-question-substitution rule)
  - 02 Option Generation & Evidence Gathering (from Option Generation, merged with new tiered evidence-gathering and disconfirming-search-discipline rules)
  - 03 Stakeholder & Consequence Mapping — new module; no equivalent in the earlier draft
  - 04 Assumption & Bias Audit (merging the earlier Assumption & Base-Rate Surfacing and Bias Audit modules into one, per the approved plan)
  - 05 Uncertainty & Risk Assessment — new module; no equivalent in the earlier draft
  - 06 Comparative Evaluation (from Criteria, Trade-offs & Expected-Value Synthesis, renamed and linked explicitly to the new consequence map)
  - 07 Pre-Mortem & Failure Mode Analysis (from Premortem & Failure-Mode Analysis, with a new damaging-failure-mode requirement and explicit bias/stakeholder linkage)
  - 08 Decision Synthesis & Rationale Documentation (from Decision Record & Rationale Documentation, with a new decision-record-honesty rule requiring specific, non-generic rejection reasons)
  - 09 Reversibility & Commitment Check — new module; no equivalent in the earlier draft
  - 10 Final Decision Audit (from Post-Decision Audit, expanded to a pre-execution and post-outcome dual-use audit with the four-value PASS/PASS WITH CORRECTIONS/LIMITED REVIEW/FAIL verdict, replacing the earlier three-value SOUND/SOUND WITH GAPS/UNSOUND scale)
  - 11 Post-Decision Review Trigger — new module; no equivalent in the earlier draft
- Drafted `PROMPT_MODULE_CATALOG.md` with the eleven-module routing table, sequencing rules, and explicit hand-off points to TAS, RAS, and LAS for sub-questions outside DAS's own scope.
- Drafted `PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md`: 11 composed templates (T00–T10) — a router, a full pipeline, a lightweight pass, and targeted templates for Modules 03, 04 and 06–11; none targets Module 02 or 05 alone (this line said "one targeted template per major pipeline stage" until 2026-10-02, DIR-0040; `grep -c '^## T[0-9]' PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md` → 11, and the selector names no template for Module 02 or 05).
- Drafted `EVALUATION/OUTPUT_SCHEMAS.md`: 15 record schemas (this line said 14 until 2026-10-02, DIR-0040; `grep -c '^```json' EVALUATION/OUTPUT_SCHEMAS.md` → 15 on the 0.1.0 files, AUDIT_DAS_2026-09-21 BROKEN-1) covering every module's output, including the decision record and the outcome record as two permanently separate, ID-linked schemas (never merged), per the standard's resulting-prevention rule.
- Drafted `EVALUATION/PROMPT_QA_RUBRIC.md`: a 14-blocking-defect list (this line said 13 until 2026-10-02, DIR-0040; `sed -n '/^## Blocking defects/,/^## Scored/p' EVALUATION/PROMPT_QA_RUBRIC.md | grep -c '^- '` → 14 on the 0.1.0 files, AUDIT_DAS_2026-09-21 BROKEN-1) and a 13-dimension, 39-point scored rubric, deliberately reusing TAS's established verdict vocabulary (PASS / PASS WITH CORRECTIONS / REVISE AND RETEST / FAIL for prompt adoption; PASS / PASS WITH CORRECTIONS / LIMITED REVIEW / FAIL for Module 10's audit) rather than inventing a fifth inconsistent set, matching RAS's and LAS's own choice on this point.
- Drafted `EVALUATION/ADVERSARIAL_TEST_SUITE.md`: 13 new test cases (D01–D13) targeting DAS-specific failure modes — resulting, sunk-cost-driven option elimination, flattering-only pre-mortems, decision-record advocacy, false irreversibility claims, ignored conflicting-interest stakeholders, manufactured base rates, anchoring, groupthink, status-quo bias, proxy-question substitution, vague review triggers, and outcome-information leakage — plus a regression gate.
- Rewrote `README.md` to describe the real, correct eleven-module structure and DAS's positioning against TAS, RAS, and LAS (process quality versus outcome luck), replacing the earlier placeholder framing built around an eight-module outline.
- Drafted `SOURCE_INDEX.md`: carried forward the 12 sources (DS-01–DS-12) verified in the earlier scoping draft, added 7 newly verified sources (DS-13–DS-19: ICD 203, Hammond/Keeney/Raiffa's *Smart Choices*, Freeman's stakeholder theory, Howard's information value theory, Klein's naturalistic decision-making research, Ries's staged-commitment method, and Kahneman/Sibony/Sunstein's decision-hygiene research), each checked via live search before citing, and added explicit cross-reference notes to RAS's and LAS's source indices for literature this system deliberately does not re-cite.
- No prior numbered version. The repository previously held only `LICENSE`, a placeholder `README.md`, and `BUILD_PLAN.md`, seeded live in a session with Ony; this is the first real-content release, drafted in a cloud sandbox using the live TAS repository as a structural reference, pending commit and push to the `decision-authority-system` repository.
