# Changelog

*Logic Authority System (LAS)*

## 2026-10-18 — DIR-0052: Module 06 rule 5 (T-0378)

Module 06 rule 5 says 'does not survive' is a finding about the argument, not its conclusion: the conclusion is not called false or contradicted on unverified figures. Closes the doctrine-arm FAIL of L27 in the full-suite run (RUN-0049). The maintainer's approval: DIR-0052.

## 2026-10-10 — DIR-0044: the restating-a-finding section's last sentence

Under DIR-0044, `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`'s "Restating a finding" section ends "in both studies the exaggeration was in the restatement, not in the result it restated", where it said "the restatement is where accuracy is lost", which claimed more than the two studies show (AUDIT_QAS_2026-10-10 UNSOURCED-4, AUDIT_EHS_2026-10-10 UNSOURCED-5). The same words in every system (audit check 65).

## 2026-10-10 — DIR-0043: three further systems and claim fidelity

Under the maintainer's directive DIR-0043 (2026-10-10), which built PROP-0007:

- `README.md`: a paragraph naming the three systems added that day — QAS (quantitative analysis), EGS (evidence gathering) and EHS (ethics and harm) — and where this system's job ends against each (DEC-0036's boundary-by-job rule; audit check 34 (d) now reads every README for every other system's name).
- `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`: the section "Restating a finding" added at the end, word for word the same in every system (INTEROP.md [IN-067]; audit check 65). A restatement may simplify a finding but may not raise its confidence term, widen its scope, or state an association as a cause (Sumner et al., BMJ 2014; Boutron et al., JAMA 2010 — papertrail/project/SOURCES.md PS-0246, PS-0283).

## 2026-10-05 — DIR-0042 decisions

Under the maintainer's directive DIR-0042 (2026-10-05), his answers "Duplication check" and "Yes, CC BY 4.0":

- The load ceilings of 2026-09-25 (block 43,487 bytes, T02 54,695) are retired; the umbrella's audit check 63 reports a rule restated in files LAS loads together instead, and finds none. The overage the 2026-10-03 entry left open is closed by that choice.
- `LICENSE`: Creative Commons Attribution 4.0 International, replacing "All rights reserved"; the README's structure list says so.

## 2026-10-03 — DIR-0041 decisions

Under the maintainer's directive DIR-0041 (2026-10-03), his answers to the decisions DIR-0040 left open:

- Module 02 rule 10 (T-0180): every abductive line, and every line judged INVALID or weak whatever its type, states what else could explain the evidence — the rival explanation, if any, not addressed. Until now only the abductive branch (rule 4) asked for it, so an affirming-the-consequent line judged INVALID under rule 2 did not. Rule 4 points to rule 10; the output field and the schema's Argument record row read "abductive, INVALID or weak lines". The adversarial suite's Coverage row for L01 names rule 10.
- Module 03 rule 7 (T-0186): a table says where two TAS Module 02 statuses land — PARTIALLY VERIFIED as VERIFIED for the part TAS confirmed, recorded as its own premise, plus UNVERIFIED for the rest; ATTRIBUTED BUT UNCORROBORATED as UNVERIFIED with the attribution noted in the Source column — and forbids rounding either. The umbrella's `INTEROP.md` §3 maps both, where it said they block.
- Module 03 rule 1 (RF-0026 (e)): UNVERIFIABLE is "a claim that checking sources cannot settle"; a normative premise is marked as a value premise and stated openly, and the status takes no position on whether such claims can be true.
- Module 05 rule 2 (RF-0026 (f)): the premise-removal test is a heuristic; where it gives no clear answer the premise's role is recorded as uncertain (Module 05 output, the schema's Hidden premise row, `role_uncertain` in the machine form).
- Module 06 "Use when" (T-0281): Modules 01–03 are its prerequisites — the reconstructed argument and the validity and soundness checks; `validate-doctrine.py` V5 roots go from [1, 6, 10] to [1, 10].
- Module 10 (RF-0026 (b)): a fresh context of the same model is a separate pass, not an independent one; independence needs a different model or a person, and output B states which the audit was. The catalog's row 10 and routing rule and the README say the same.
- Adversarial suite Coverage: 72 of the 73 numbered rules named; Module 03's rule 7 is the one no test names.
- `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` carries ICD 203's seven likelihood terms with their probability bands and the directive's alternative term beside each, and quotes its rule on mixing the two term sets; Rule 3 maps very likely → HIGH and very unlikely → LOW, keeps records written before 2026-10-03 at their five-term values and bars a confidence level and a term in one sentence; the schemas' `Confidence term` and the machine form's `confidence_term` take the seven; Module 02 rule 3's "strong" is likely or above (INTEROP §2; T-0225, wording as T-0231 read it from ODNI's copy). The maintainer's choice.
- Load: Module 02's second "Use when" sentence and rule 5's closing clause, both restating the objective, are cut. With every change above, the invocation block (Standard, Policy, `EVALUATION/OUTPUT_SCHEMAS.md`, `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`) goes from 42,531 to 43,708 bytes and T02 (block + Modules 01, 02, 04) from 54,683 to 55,767 bytes (`cat <files> | wc -c`), over the ceilings of 43,487 by 221 bytes and of 54,695 by 1,072. The confidence file's two new rows, band and alternative-term columns and quoted mixing rule account for 1,080 bytes of the increase (`wc -c CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`, 4,699 → 5,779). No other text was cut to make room. The ceilings are the project's own (CODE_REVIEW_LAS_2026-09-25 F11), and whether to trim the load or restate them is open for the maintainer.

## 2026-10-02 — DIR-0040 fix pass

Under the maintainer's directive DIR-0040 (2026-10-02), "only fix it or do it if it's still necessary to do":

- Module OUTPUTs name the stable record id each fills (T-0181, audit MISSING-2): Module 01 `ARG-` and `PREM-`, 03 `PREM-`, 04 `FAL-`, 05 `PREM-` and `FAL-`, 06 `STL-`, 07 `CON-`, 08 the `FAL-` a technique corresponds to, 09 `VER-`, 10 the `VER-` audited. Module 02's fields go on the Argument record Module 01 opens.
- Module 01 rule 3 and OUTPUT: an unstated premise is RECONSTRUCTED BY EVALUATOR or BACKGROUND ASSUMPTION, the Policy §3 classification Module 01 is assigned; Module 05 rule 1 re-checks it (T-0181, MISSING-3). The explicit-premises row points to rule 2 for its three values.
- Module 02 rule 3: an inductive line's strength is the calibrated term; "strong" means likely or almost certain and "weak" a lower term (T-0181, BROKEN-2).
- README: "seven-stage (Stage 0–6)" pipeline, as Standard §6 heads it; the 0.1.0 entry below says "six-stage" (T-0181, BROKEN-1).
- SOURCE_INDEX LS-03 and Standard §19 no longer say LAS uses Toulmin's "warrant"; no LAS rule, field or column uses it (T-0184, BROKEN-3).
- SOURCE_INDEX and README say no originating academic citation for steelmanning was found, where they said it has none (T-0184, UNSOURCED-5; umbrella OI-011).
- Load: Standard §16 drops its null sentence, which `EVALUATION/OUTPUT_SCHEMAS.md`'s null rules state; Module 04's Status column drops the three values its OBJECTIVE names. Invocation block 42,634 → 42,531 bytes and T02 (block + Modules 01, 02, 04) 54,660 → 54,683 bytes, against ceilings of 43,487 and 54,695 (`cat <files> | wc -c`).
- README: the `SOURCE_INDEX.md` entry gives both counts it holds, 8 numbered sources (`grep -c '^| LS-0' SOURCE_INDEX.md`) and 26 supporting works added under DIR-0037 (`grep -c '^- PS-' SOURCE_INDEX.md`), where it said "8 sources" only (umbrella docs reconciliation).
- Module 09 rule 8: NOT SUPPORTED now covers a line rated weak (Module 02 rule 3). A single inductive line below “likely” fitted none of the five composite values, though the rule requires one value per argument (found by the DIR-0040 group reviewing Module 02’s strong/weak mapping).

## 0.1.3 — 2026-09-27

Fixes from the 2026-09-26 code reviews (`papertrail/project/audits/CODE_REVIEW_*_2026-09-26.md` in the Authority Systems umbrella), made under the maintainer's directive DIR-0014, which lifts SA-019 for those findings. DIR-0003 stays: the three held TAS items are not touched. Each fix was checked failing on the pre-fix snapshot and passing after (`papertrail/project/evidence/fix-<REVIEW>-2026-09-26.txt`).

From CODE_REVIEW_TESTS_2026-09-26:

- Adversarial suite (2026-09-28, TESTS F14): the Coverage section names the module rules each test exercises and, when written, listed the numbered rules no test reached (L21–L31, the same day, closed that list).
- Adversarial suite: L21–L31 (2026-09-28, TESTS F14; suite revision 4) — tests for the 30 numbered module rules no test reached; run on the second tier's condition. README and BUILD_PLAN counts now 31.
- Adversarial suite: a suite-revision note says L03 was rewritten on 2026-09-25 and that earlier L03 runs do not compare (F5); L10's pass condition is observable in one output (F35); L11 follows Module 04 Rule 7 on DISMISSED versus CANDIDATE (F32); a Coverage section (F14 — recorded, not closed).
- Rubric: REVISE AND RETEST requires no blocking defect (F13); the evaluation protocol runs every gated case (F22).

From CODE_REVIEW_LAS_2026-09-26:

- Pipeline order: Stage 2, T01 and the catalog run Module 02, then 03, then 04; Module 04 takes Module 03's premise statuses and Module 02's equivocations as inputs, T03 and T05 run Modules 02 and 03 first (F1, F3, F4).
- Module 04 rule 4: a credential Module 03 marks REFUTED answers the critical question in the negative and the candidate may be CONFIRMED; the "(rule 7)" citation is gone (F2, F22).
- Module 05 takes Module 02's named equivocations, gives each equivocation finding a status, and separates an ambiguous term with no shown shift from an equivocation; Module 09 rule 7 makes an inference INVALID only on a CONFIRMED equivocation and records UNKNOWN otherwise; Module 10 rule 10 checks both (F4, F5, F6).
- Confidence: CCL says validity is binary and the confidence in the verdict is not; a Confidence term field on the Argument record, the Fallacy finding and Modules 02 and 04; LOW arises only for a verdict with more than two values (F7, F8, F29).
- Module 03 rule 1 and the Premise record: a definitional premise is VERIFIED by consistent use (F9).
- Module 07 and the schema: a NOT A CONTRADICTION classification, and an acknowledgment check column and field (F10, F16).
- The same-scope test is written out in Standard §11 and Module 07 rule 1 only; PIT, Module 10 rule 7 and L14 refer to it (F13).
- Schema fields for Module 01's argument lines and no-premises flag and Module 06's output D; Module 09's output names the Verdict record's confidence fields; Module 10's output names the Limited-review trigger (F15, F16).
- PIT Layer 2 lists the same four files as the library's invocation block and says the catalog is consulted when choosing a template (F17).
- Composite verdict scale defined in Module 09 rule 8, pointed to by the schema and Standard §13 (F33).
- Suite revision 3: L02 carries the equivocation to the verdict (F18); L04 names Module 04 and Module 10 rule 2 (F11); L11 follows Module 04 rule 4 (F12); L18–L20 test USER-STIPULATED, REFUTED and the Check performed column (F19); the regression gate adds L18–L20. 20 tests.
- Text: README 14 rules and 20 tests, BUILD_PLAN note (F14); Standard §6 section range, version line, "these questions" (F21, F24, F28); Module 10 rule 1 checks the conclusion (F23); SOURCE_INDEX (F25); T00, T02, T06 (F26); Modules 05 and 08 "Use when" (F27); schema "(Module 07 rule 2)" (F28); PIT principle 2 (F30); catalog names BUILD_PLAN.md (F32). F20 was fixed with the TESTS review above. F31 is in the umbrella's INTEROP.md.
- Load: the fields above pushed the invocation block and T02's load over the ceilings set by 2026-09-25's F11 fix. Text in that load that restated a module or another loaded file was cut to a pointer: Standard §2.2, §4.7, §4.8, §8.1–§8.4 and §14's last bullet; Module 04's objective and "Use when"; the schema's scheme list (Standard §4.9 names the five); Module 02 rule 3's example. Block 43,637 → 42,514 bytes (ceiling 43,487); T02 56,304 → 54,540 (ceiling 54,695).

Under the maintainer's directive DIR-0015 (2026-09-30):

- Suite: L26's pass condition lets a premise the argument does need stand — that the manual's requirement applies to this bridge, that the required inspection has not already been done, or that the county's requirement should be met; a premise stronger than needed, such as "the manual is always right," may not; the three draft additions must still be removed or reported as not required. Recorded runs on the earlier wording: PROBE-0040/0041, PROBE-0044/0045.

Under the maintainer's directive DIR-0017 (2026-09-30):

- Suite: L26's premises that may stand are examples, not a closed list — any premise the argument needs may stand, including the date arithmetic behind "60 years old"; a premise it does not need, or a stronger one, may not. Re-scored in PROBE-0046 on the earlier wording.

Under the maintainer's directive DIR-0020 (2026-09-30), text corrections from the doctrine-by-doctrine review (`papertrail/project/audits/DOCTRINE_REVIEW_2026-09-30.md`, LAS #2–#9):

- Suite: the L03 and L19 Coverage rows name Module 04 rule 7 and Module 09 rule 4, which their text cites (#2); L26's scenario names the county's manual, as its fixture does (#7); suite revision 5 records the two L26 rewrites (TESTS #12).
- OUTPUT_SCHEMAS: the Hidden premise and equivocation record carries the ambiguous-terms row Module 05 rule 7 writes and Modules 09 and 10 read (#3).
- Calibrated Confidence Language rule 3: the three-value field is on the Verdict record only, and the validity verdict is three-valued (#4).
- Standard §11 names the five consistency values Module 07 rule 2 declares (#5).
- Template library: the variables table lists `[SUSPECTED FALLACY]` and `[ATTACHMENT]` and drops the unused `[TASK_ID]` (#6).
- This log: DIR-0015 dated 2026-09-30; the 0.1.3 Coverage sentence reads as of its day (#8, #9).

Under the maintainer's directive DIR-0021 (2026-09-30), the review's content finding decided by the session (`papertrail/project/audits/DOCTRINE_REVIEW_2026-09-30.md`, LAS #1):

- OUTPUT_SCHEMAS: the informal taxonomy carries False analogy (weak analogy) and Conjunction fallacy, the two candidates L25 and L12 require (T-0328; closes T-0179).
- Standard §17 Pass 2 names §4's finding kinds and makes a finding filed under the wrong kind a finding (T-0338).
- OUTPUT_SCHEMAS: a machine form (JSON, closed values stated) for each of the nine records, in `EVALUATION/OUTPUT_SCHEMAS_MACHINE.md` — a separate file because the invocation-block ceiling (F11, loadcheck.py) would not hold it inline; to stay under that ceiling the Stable record IDs list and four Verdict-vocabulary bullets that restated the record tables became pointers, and the DIR-0020 additions to §11, Calibrated Confidence rule 3, the ambiguous-terms row and the two taxonomy rows were shortened (T-0337; DEC-0035). Load: block 42,634 and T02 54,660 against 43,487 and 54,695.

Under the maintainer's directive DIR-0035 (2026-10-02), which extends the guard against output shaped by format rather than findings to this system's audit:

- Module 10 rule 4: the pipeline's enumerated lists (Modules 01, 04, 05) are checked for length set by habit rather than by the argument, and for items the synthesis drops because they fit no heading (umbrella `BEHAVIORAL_FAILURES.md` F26–F29; research RL-0016).

Under the maintainer's directive DIR-0036 (2026-10-02), which drops the "edition" framing: the README says LAS is "not a part or subset" of its siblings where it said "not an edition or subset". No rule, module, schema, test or source changed.

Under the maintainer's directive DIR-0037 (2026-10-02), [stated] "you need to get a source for each module. Otherwise it looks like we made it up": `SOURCE_INDEX.md` gains a section, "Supporting sources found after the rules were written", listing 26 works read on 2026-10-02 for the module rules that had no indexed source. Each is support found after the rule was written, never its origin; where a source disagrees with a rule it says so. No rule, module, schema or test changed.

## 0.1.2 — 2026-09-25

Completes F11 of `papertrail/project/audits/CODE_REVIEW_LAS_2026-09-25.md`,
under DIR-0013. 0.1.1 loaded the confidence file and removed the repeated
same-scope text, but the mandatory block had grown to 48,119 B. It is now
42,220 B, and T02 (block + Modules 01, 02, 04) 54,572 B (`wc -c`); before
DIR-0013 the block plus the confidence file was 43,487 B and T02 plus that
file 54,695 B.

- Standard §6–§10, §12, §13, §16 and §17 state what each stage must
  achieve and name the module whose rules govern; §1's scope list points
  to §6; §4.9–§4.11 and Rules 1, 5, 7, 9 and 12 drop sentences that
  restated §6, §8 or a module; §19 names the sources and leaves what each
  establishes to `SOURCE_INDEX.md`.
- §8.3 cited `EVALUATION/OUTPUT_SCHEMAS.md` for the schemes' critical
  questions; the schema defers them to Module 04, which §8.3 now cites.
- Calibrated Confidence Language: shorter purpose and application
  paragraphs, two worked examples shortened, the fourth folded into
  Rule 4. Premise Evidence and Attribution Policy §1–§2 shortened.
- The stage and pass headings stay: `validate-doctrine.py` reports V1 10,
  V2 3, V3 4, V4 1, V5 0 before and after.

## 0.1.1 — 2026-09-25

Fixes for the fifteen findings in
`papertrail/project/audits/CODE_REVIEW_LAS_2026-09-25.md`, made under the
maintainer's directive DIR-0013 (the no-edit rule for `systems/` lifted
for those findings only). Each was checked absent before and present after.

- F1: the fallacy fallacy is defined as the argument from fallacy —
  concluding a conclusion false because its argument failed (§4.10, the
  schema's taxonomy). New Rule 14, Rule 13's converse, forbids it; §1 and
  §2.3 say "unsound", not "false"; a rubric blocking defect, Module 09
  rule 4, Module 10 rule 9 and gated test L16 enforce it. The error the
  old text described, confirming a fallacy from surface resemblance, is
  named over-flagging (Rule 6, §4.10, Module 10 rule 6, the rubric,
  the catalog, T05, L03, the README).
- F2: Module 02 rule 9 checks key terms before a validity verdict; Module
  05 rule 7 records equivocations as fallacy findings; Module 09 rule 7
  and Module 10 rule 10 carry them into the verdict.
- F3: L03's scenario supplies verified answers to all five
  expert-opinion critical questions, so DISMISSED is what Module 04
  allows; its pass condition names CANDIDATE when one is missing.
- F4: Module 07's SCOPED CHANGE OF POSITION needs the source's
  acknowledgment; a different venue, audience or medium is not a change
  of scope (Module 07 rule 2, Standard §11).
- F5: Module 04 rule 4 — an argument's own assertion does not answer a
  critical question; it goes to Module 03 and the candidate stays
  CANDIDATE. Gated test L17 pins it.
- F6: Standard §15 no longer lets a requester authorize omitting a
  finding or settling a contested premise; a premise the requester
  stipulates is recorded USER-STIPULATED (new attribution category in
  the Policy, project instructions, schema and Module 01) and stays
  UNVERIFIED.
- F7: new premise status REFUTED (TAS- or RAS-tier evidence shows the
  premise false); the umbrella's `INTEROP.md` crosswalk now maps
  `CONTRADICTED` → `REFUTED` and `NOT TESTABLE FROM AVAILABLE SOURCES` →
  `UNVERIFIED` with its check recorded.
- F8: Module 10 receives the original argument; T07 supplies it.
- F9: the schema adds the Module 05, Module 08 and Module 10 records and
  the Argument record's logical form, rival explanation,
  conclusion-scope (Rule 10) and equivocation (Rule 11) fields.
- F10: Module 08 cites §12 and Rule 9; the project instructions point to
  principle 10 and Standard §15.
- F11: the mandatory block loads the confidence vocabulary; the
  same-scope test is stated once, in §11, and referenced elsewhere; §17's
  seven passes, which restated Module 10, are now one line each naming
  the Module 10 rules that carry them out (rules 8 and 9 take the two
  checks only §17 had).
- F12: confidence maps one term to one value, applied to the verdict as
  recorded; the Verdict record carries the five-term value.
- F13: UNVERIFIED records whether a check was performed (Module 03's
  check column, the schema's Premise record, the Policy).
- F14: Module 04 runs after Module 02 (Standard Stage 2, Module 04 and
  its input, T01, T02, the catalog).
- F15: Module 10's LIMITED REVIEW list includes missing records or text
  (T07's trigger); `INTEROP.md` §4 names LAS M10's spaced spelling.
- Regression gate: L16 and L17 added.

## 0.1.0 — 2026-09-20

This release supersedes an earlier, structurally mismatched v0.1 draft
(dated the same day, produced in a prior pass before this repository's
actual `BUILD_PLAN.md` was checked against it). That draft had real,
live-verified content but the wrong file names and an eleven-module
framing (a dedicated Argumentation Scheme Classification module, and no
Consistency Check module) that didn't match the authoritative plan. This
release remaps that content onto the plan exactly, rather than
discarding it, and is the first version where the repository's contents
actually match its own build plan — hence starting the changelog at
0.1.0 now rather than continuing the prior draft's informal "0.1"
numbering.

Built using the live Topic Authority System (TAS) repository as the
structural and rigor model throughout (`CORE/INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md`,
`CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md`, `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`,
`CORE/SOURCE_AUTHORITY_AND_RETRIEVAL_POLICY.md`, and the `EVALUATION/` and
`PROMPT_TEMPLATES/` files), never copied verbatim.

- Renamed `CORE/LOGICAL_INTEGRITY_STANDARD.md` to
  `CORE/LAS_PROMPT_ENGINEERING_STANDARD.md` and restructured it into TAS's
  19-section standard pattern (purpose/scope, design principles, prompt
  specification, an argument-and-reasoning ontology in place of TAS's
  evidence ontology, the 13 non-negotiable rules, a six-stage
  reasoning-audit pipeline, premise attribution, fallacy-screening
  discipline, hidden premises, counterargument stress-testing, consistency
  checking, rhetoric-vs-logic, verdict/confidence, citation discipline,
  prompt injection, output schemas, audit protocol, completion standard,
  and source basis) — carrying forward all 13 non-negotiable rules from
  the prior draft's standard, renumbered and extended with an explicit
  consistency-checking rule (new Rule 8).
- Added `CORE/PREMISE_EVIDENCE_AND_ATTRIBUTION_POLICY.md` (new): how to
  attribute a premise to its actual source (the arguer's own words, a
  source the arguer cites, or LAS's own reconstruction of an unstated
  premise) and the evidentiary weight a premise needs, by role and type,
  before soundness can even be assessed. Structurally modeled on TAS's
  `SOURCE_AUTHORITY_AND_RETRIEVAL_POLICY.md` but answering a distinct
  question — premise attribution and weight, not source tiering — per
  se not a renaming of TAS's tiers.
- Added `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` (new for this repo):
  reuses TAS's five-term ICD 203-derived vocabulary near-verbatim, with
  worked examples rewritten for argument-evaluation confidence
  (confidence in a validity, inductive-strength, or fallacy finding) and
  an explicit warning against letting that confidence bleed into implied
  confidence about the conclusion's truth.
- Added `CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md` (new for this repo):
  adapts TAS's governing-principles/required-labels/workflow/output-
  behavior/source-hierarchy template to LAS's domain, framed through an
  explicit four-layer deployment model (project instructions / active
  guidance / task materials / verification archive).
- Renamed and updated all ten prompt modules to match the authoritative
  module list and order exactly:
  - `01_ARGUMENT_RECONSTRUCTION_AND_PREMISE_IDENTIFICATION.md` ->
    `01_ARGUMENT_RECONSTRUCTION.md` (reused near-verbatim; added explicit
    premise-attribution categories per the new CORE policy).
  - `02_FORMAL_VALIDITY_CHECK.md` -> `02_VALIDITY_CHECK.md` (extended from
    formal-deductive-only to explicitly cover inductive and abductive
    inference strength, per the authoritative module description).
  - `03_PREMISE_SOUNDNESS_AND_TRUTH_VALUE_FLAGGING.md` ->
    `03_SOUNDNESS_CHECK.md` (reused; made the deference to TAS/RAS
    evidence standards, and the evidentiary-weight thresholds from the
    new CORE policy, explicit).
  - `04_INFORMAL_FALLACY_DETECTION.md` -> `04_FALLACY_DETECTION.md`
    (extended to cover formal fallacies alongside informal ones, and
    folded in the prior draft's Module 05 — Argumentation Scheme
    Classification & Critical Questions — as the mechanism by which a
    fallacy candidate is confirmed or dismissed, since the authoritative
    plan specifies exactly ten modules with no separate scheme-
    classification module, and the plan's own "flag as possibilities to
    check, not automatic verdicts" language already implied this
    machinery belonged inside fallacy detection).
  - `06_HIDDEN_PREMISE_AND_AMBIGUITY_AUDIT.md` ->
    `05_HIDDEN_PREMISE_SURFACING.md` (reused the hidden-premise content in
    full; folded the ambiguity/equivocation content in as a closely
    related concern within the same module, per the mapping guide).
  - `07_STEELMAN_AND_STRONGEST_COUNTERARGUMENT_CONSTRUCTION.md` ->
    `06_COUNTERARGUMENT_STRESS_TEST.md` (reused the counterargument-
    construction half; added an explicit "not the same job as Module 01's
    steelmanning" section differentiating the two, per the mapping guide).
  - `07_CONSISTENCY_CHECK.md` (new, no prior equivalent): checks an
    argument's consistency with other statements by the same source,
    distinguishing DIRECT CONTRADICTION from a legitimate SCOPED CHANGE OF
    POSITION, a DEFINITIONAL MISMATCH, or UNRESOLVED — grounded in Walton
    and Krabbe's formal-dialectics "commitment store" concept (new source
    LS-08, verified via live search).
  - `08_RHETORIC_VS_LOGIC_SEPARATION.md` ->
    `08_RHETORICAL_VS_LOGICAL_FORCE.md` (reused, renamed only).
  - `09_OVERALL_ARGUMENT_QUALITY_SYNTHESIS.md` ->
    `09_ARGUMENT_SYNTHESIS_AND_VERDICT.md` (reused; made the composite
    verdict explicit and calibrated rather than a quality description
    alone).
  - `10_FINAL_LOGIC_INTEGRITY_AUDIT.md` -> `10_FINAL_LOGIC_AUDIT.md`
    (reused; restructured its rules around the three checks the
    authoritative plan names explicitly: no invented premises, no
    strawmanning, and no fallacy flagged without stating exactly which
    step of the argument it applies to).
- Rewrote `PROMPT_MODULE_CATALOG.md` for the new ten-module list, order,
  and routing rules, including an explicit note on why the argumentation-
  scheme check is folded into Module 04 rather than given its own module.
- Rewrote `EVALUATION/OUTPUT_SCHEMAS.md`: added a fallacy-finding status
  field (CANDIDATE / CONFIRMED / DISMISSED) operationalizing the
  authoritative plan's "flagged possibilities to check, not automatic
  verdicts" language for Module 04; added a Consistency finding record and
  classification vocabulary for Module 07; added a stable-ID scheme
  (`ARG-####`, `PREM-####`, `FAL-####`, `STL-####`, `CON-####`,
  `VER-####`) matching TAS's ID-prefix pattern; carried forward the formal
  and informal fallacy taxonomies, the argumentation-scheme base set (now
  cross-referenced from Module 04 instead of a standalone module), and the
  universal intellectual standards unchanged.
- Rewrote `EVALUATION/PROMPT_QA_RUBRIC.md`: updated every blocking-defect
  and scored-dimension cross-reference to the new module numbers; added a
  Consistency Check scored dimension and blocking defect; recalculated
  the rubric to 12 dimensions / 36 max points with rebanded PASS / PASS
  WITH CORRECTIONS / REVISE AND RETEST / FAIL thresholds preserving the
  prior draft's pass/fail proportions.
- Updated `EVALUATION/ADVERSARIAL_TEST_SUITE.md`: carried forward all 13
  prior cases (L01-L13) with every module cross-reference updated to the
  new numbering (Module 02=Validity, 04=Fallacy Detection, 05=Hidden
  Premise Surfacing, 06=Counterargument Stress-Test, 07=Consistency Check,
  08=Rhetoric vs Logic, 09=Synthesis/Verdict, 10=Final Audit); added two
  new cases targeting the new Consistency Check module — L14 (an
  undisclosed contradiction across contexts) and L15 (a legitimate,
  acknowledged change of position, as a false-positive control) — and
  added both to the regression gate.
- Rewrote `PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md`: kept
  T00-T04 with updated module references; renamed T05 to an
  Argumentation-Scheme Legitimacy Check invoking Module 04's
  critical-questions step directly (since Module 05 no longer exists as a
  standalone module); added new T06 (a standalone Consistency Check
  template) and renumbered the former T06 (Independent Logic Integrity
  Audit) to T07.
- Updated `SOURCE_INDEX.md`: carried forward LS-01 through LS-07
  unchanged, with cross-references updated to the new module numbers;
  added LS-08 (Douglas Walton & Erik C. W. Krabbe, *Commitment in
  Dialogue: Basic Concepts of Interpersonal Reasoning*, 1995, State
  University of New York Press), verified via live search, as the basis
  for the new Module 07.
- Rewrote `README.md` to describe the corrected structure and this
  release's remap, replacing the placeholder framing.
- Carried forward `LICENSE` (proprietary, all rights reserved) using
  Anthony Shannon's exact, current license text, replacing the prior
  draft's placeholder note about reconciling against TAS's actual text.
- No prior numbered version. The immediately preceding draft is treated
  as superseded scaffolding, not a prior release, since its structure did
  not match this repository's own build plan.
