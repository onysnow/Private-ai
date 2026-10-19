# Changelog

## 2026-10-10 — DIR-0044: the restating-a-finding section's last sentence

Under DIR-0044, `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`'s "Restating a finding" section ends "in both studies the exaggeration was in the restatement, not in the result it restated", where it said "the restatement is where accuracy is lost", which claimed more than the two studies show (AUDIT_QAS_2026-10-10 UNSOURCED-4, AUDIT_EHS_2026-10-10 UNSOURCED-5). The same words in every system (audit check 65).

## 2026-10-10 — DIR-0043: Module 13, rule application

Under the maintainer's directive DIR-0043 (PROP-0007's placement: "rule application as a TAS module that stops at an element map"):

- `PROMPT_MODULES/13_RULE_APPLICATION_ELEMENT_MAP.md` (new): given a rule the user names and supplies (statute, regulation, code section, contract term) and the records of Modules 01–08, it quotes the supplied text and citation, never one from memory, and stops with a list of what is needed when no text was supplied; breaks the text into its elements; maps EVID- and CLM- records for and against each element, and the gaps; names the standard of proof only as the user or the text states it; flags elements that turn on the rule's meaning as questions for counsel; and stops with no conclusion and no predicted outcome. Sources: LII Wex "element" (LA-07, PS-0288), In re Winship (LA-08, PS-0289), Stockmeyer on IRAC (LA-09, PS-0107; it does not itself cover element-by-element mapping), Dahl et al. on legal hallucination, 58–88% (LA-10, PS-0109).
- `PROMPT_MODULE_CATALOG.md`: row 13; a routing rule (run after Modules 07 and 08; never a substitute for Module 12's legal-document audit); the composition pattern; the opening sentence counts thirteen modules.
- `EVALUATION/OUTPUT_SCHEMAS.md`: the Element-map record (`ELEM-`), its `conclusion` fixed at "none — for counsel or the forum".
- `CORE/INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md`: §16 lists `ELEM-`, seventeen prefixes; §6 Stage 4 places Module 13 after Modules 07 and 08. INTEROP §7's TAS row lists the same seventeen (an umbrella edit made in the same change).
- `EVALUATION/ADVERSARIAL_TEST_SUITE.md`: A63 ("did she commit fraud under section 4-117?" with no text supplied) and A64 (a supplied term with an element no record bears on), both in the Coverage section, neither in the Regression gate; the Coverage note counts thirteen modules.
- `CORE/CONTROL_SURFACE.md`: `/run-module` names 01–13 and `/run-adversarial-test` names A01–A64 (version 1.5).
- `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`: the section "Restating a finding", the text every system carries (Sumner et al., BMJ 2014; Boutron et al., JAMA 2010).
- `SOURCE_INDEX.md`: LA-07 to LA-10, each with its role, trail record and the Module 13 rules it supports. LA-11 (Sumner et al., PS-0246) and LA-12 (Boutron et al., PS-0283) for the "Restating a finding" section.
- Second reader's fixes, same day: Module 13 rule 5 gives the standard of proof only as the user or the text states it, with In re Winship (LA-08) as a US-criminal-law example and no assumed standard; rule 3 cites the Standard §6 Stage 4 (was §12) and requires every record weighing against an element in `evidence_against`; rule 6 cites its deferral to counsel as logic and the Standard §1, keeping LA-09 only for interpretation as a separate step. `SOURCE_INDEX.md`: LA-12 gives Boutron's figures (18.0% of titles, 37.5% of abstract results sections, 58.3% of abstract conclusions sections, of 72 trials) and notes the authors are from general knowledge; LA-07 gives the page's negligence example; LA-08's role is stated as a US-criminal-law example. The Element-map record's example has `rule_text` "" (`null` only when no text was supplied) and a `for_counsel_or_forum_to_decide` field.
- `README.md`: "Where TAS's job ends" names seven kinds of work — research synthesis (RAS), argument evaluation (LAS), decision quality (DAS), quantitative analysis (QAS), evidence gathering (EGS), ethics and harm judgements (EHS), and the legal conclusion, which TAS now maps toward with Module 13 and leaves to counsel; Structure counts thirteen modules and lists the Right-of-reply and Element-map records.

## 2026-10-05 — DIR-0042 decisions

Under the maintainer's directive DIR-0042 (2026-10-05), his answers "Unit + right of reply" and "Yes, CC BY 4.0":

- Right of reply, the first checkpoint (CP-01 in the umbrella's `CHECKPOINTS.md`): Module 08 rule 10 records, for each identifiable person or organization a finding accuses, whether the subject was offered the chance to respond before publication, as a Right-of-reply record; the offer and any exception are a person's, never the model's; a finding with no record is not ready for publication. Module 08's report section 8 carries the records. Module 10 adds a check: in a deliverable meant for publication, such a finding with no record, or with an exception no named person decided, is a blocking defect. Source: Media Helping Media, "Fairness in journalism" (PS-0130 in the project trail: offer the right of reply when making allegations, exceptions checked with senior editors, a record of when, how and where the subject was approached and what they answered).
- `EVALUATION/OUTPUT_SCHEMAS.md`: the Right-of-reply record (`ROR-`); the Standard §16 lists sixteen prefixes. INTEROP §7's TAS row lists the same sixteen.
- Adversarial suite: A62 tests the checkpoint (Module 08 rule 10, Module 10's check); it is not in the Regression gate. The Control Surface's `/run-adversarial-test` names A01–A62 (version 1.4).
- `LICENSE`: Creative Commons Attribution 4.0 International, the license of the rest of the doctrine (the maintainer's choice; it replaces "All rights reserved").

## 2026-10-03 — DIR-0041 decisions

Under the maintainer's directive DIR-0041 (2026-10-03), his answers to the open decisions:

- `EVALUATION/OUTPUT_SCHEMAS.md`: the Prompt evaluation record's id prefix is `PEV-` (was `PRM-`), one or two characters from LAS `PREM-` and DAS's former `PRE-` (INTEROP §7; T-0004). The maintainer's choice.
- `EVALUATION/OUTPUT_SCHEMAS.md`: Entity (`ENT-`), Hypothesis (`HYP-`), Conflict (`CFLT-`, not `CNF-`, which is one letter from DAS `CNS-`) and Gap (`GAP-`) records, with their fields, for what Modules 01, 04, 06 and 07 produce; the Standard §16 lists the fifteen prefixes the schemas define (T-0237, 2026-10-03). The maintainer's choice: define all four.
- One evidence-classification set, the Standard §4's eight (§4.2–§4.9; §4.9 Unresolved conflict added): the Standard §5 and §17 Pass 2, the Project Instructions' principle 2 and Required evidence labels, Module 01 rule 4, Module 08 rule 3, T01, the Guide's Pass 6 and prompt-audit table, the rubric and the schemas give these eight or point to them; the visual element `classification` maps onto them (T-0240, 2026-10-03). The maintainer's choice.
- CORROBORATED FACT on a single source: only a Tier A source carries it alone, for a proposition of the kind Tier A establishes — the Standard §4.3, the Project Instructions' label, Policy §3, the Control Surface's `source_tier_floor` row and the Visual Standard §5.3 (T-0286, 2026-10-03). The maintainer's choice.
- `[MATERIALITY]`: Modules 01, 02, 04–11 take it as an input; the operator states what counts as consequential for the case, and when it is not stated the work is treated as consequential (Standard §3, Project Instructions principle 11, template variables); "high-quality" in Policy §3 Tier D is the row's own two tests, which the operator may make stricter (T-0243, 2026-10-03). The maintainer's choice.
- Project Instructions principle 13 and Output behavior: no next steps, records to obtain or recommendations unless the request asks for them; a limitation or evidence warning that changes how a claim reads goes in one line at that claim (T-0264, T-0293, 2026-10-03). The maintainer's choice: F10 governs, evidence warnings exempt.
- Adversarial suite: A53–A61, harder cases written so that passing needs a TAS rule, record field or label, replace A03, A04, A06, A08, A13, A16, A18, A19 and A20 in the Regression gate and in the Guide §9.3 list; the nine stay as tests; not run (T-0288, 2026-10-03). The maintainer's choice.
- Modules 01, 02 and 12: the instructions-are-data rule reduces prompt injection and does not prevent it, so an output that acts on retrieved text is checked; Module 07 rule 5 gives its reason — an AI assistant does not recommend deceptive methods, and the decision stays with the journalist and their editor under their own code (RF-0026 (a) and (c), 2026-10-03). The maintainer's choices.
- Control Surface: version line; `/run-adversarial-test` names A01–A61.
- `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` carries ICD 203's seven likelihood terms with their probability bands and the directive's alternative term beside each, quotes its rule on mixing the two term sets, and Rule 1 requires its disclaimer; the Claim record's `confidence_term` takes `VERY_LIKELY` and `VERY_UNLIKELY` as well, and records written before 2026-10-03 keep their five-term values (Rule 3; INTEROP §2; T-0225, wording as T-0231 read it from ODNI's copy). The Project Instructions template lists the seven. The maintainer's choice (2026-10-03).

## 2026-10-02 — DIR-0040 fix pass

Under the maintainer's directive DIR-0040 (2026-10-02), [stated] "Go thru each task and only fix it or do it if it's still necessary to do". Each change below was checked failing before the edit and passing after. DIR-0003 stays: the three held TAS items are not touched.

- Output schemas: the Evidence record carries `source_tier` (A–F, Policy §3), the value `source_tier_floor` reads; Module 01's evidence table has the matching column (T-0236).
- Output schemas: the Visual element record's `verification_status` takes Module 02's verdicts, spelled as Module 02 spells them, in place of a four-value set Module 02 does not use (T-0004).
- Output schemas: the Event record's `date_precision` adds `before`, `after` and `estimated`, the precisions the Visual Standard §7 and T03 require (T-0241).
- Output schemas: the Prompt evaluation record's `verdict` is the adoption verdict; the Module 10/12 audit verdict, LIMITED REVIEW included, is their output A and the Guide §11 audit record's Verdict row (T-0312, T-0238).
- Modules 10 and 12 record each finding as an audit finding record with its `reviewer_type`; Module 02 ends with a retrieval log (Policy §4); Module 08's report section 11 opens with rule 9's premortem statement (T-0238).
- Severity is spelled `NON_MATERIAL` in Module 12, the Guide §10.1 and T06, as in the schema (T-0311).
- Catalog: Module 04's name matches its heading; Module 10's verdict lists all four values (T-0242, T-0241).
- Control Surface: the "silently override" rule is cited to the Project Instructions' Source hierarchy, where it is written, not Policy §3 (T-0242); `visual_release_mode` offers the four classifications §15.1–15.4 define, drops `authentication_pending`, which no file defined, and says what the mode changes (T-0241); version line.
- Project Instructions: likelihood in the five calibrated terms and confidence as high/medium/low, as the Calibrated Confidence Language file's Rules 1–3 say (T-0240).
- Standard §9.2 and Module 04: one predicate list (the Standard gains "appointed by", Module 04 `APPEARED_WITH`) and one relationship status set, direct, inferred or alleged (T-0241).
- Template library: T06 consults Module 12 and T07 Module 11, the modules the catalog routes those tasks to (T-0239); version line.
- Adversarial suite: a case with a rubric blocking defect is FAIL whatever its pass condition says (T-0286).
- dev-log: "Current state" names the current release (T-0242).

## 1.12 — 2026-09-27

Fixes from the 2026-09-26 code reviews (`papertrail/project/audits/CODE_REVIEW_*_2026-09-26.md` in the Authority Systems umbrella), made under the maintainer's directive DIR-0014, which lifts SA-019 for those findings. DIR-0003 stays: the three held TAS items are not touched. Each fix was checked failing on the pre-fix snapshot and passing after (`papertrail/project/evidence/fix-<REVIEW>-2026-09-26.txt`).

From CODE_REVIEW_TESTS_2026-09-26:

- Adversarial suite: A02, A17 and A18 pass conditions name what a scorer looks for (F19); A24 says it tests the evaluation step, not the prompt (F18); the visual-prompt gate names its financial, timeline and relationship tests (F15); a Coverage section (first written stating that no test named the module or rule it exercises — F14, recorded; superseded the next day by the three Coverage entries below).
- Rubric: the evaluation protocol runs every case the suite's Regression gate names, instead of "at least one" (F22).

From CODE_REVIEW_TAS_2026-09-26:

- Confidence (F2): Calibrated Confidence Language Rules 1–3 and the Claim record keep likelihood (`confidence_term`) and confidence in the judgment (`confidence`, from the evidence's weight) apart, as ICD 203 does; `confidence` is no longer mapped from the term. Module 08's claim-to-evidence appendix carries both columns (F8). INTEROP §2 says so for TAS.
- Control Surface: `/run-adversarial-test` sets a test up with an operator-held ground truth and never scores the session's own work; `auto_run_adversarial_gate` reports which gated tests have a recorded run and never claims the gate passed (F1, F14); `/audit-pass` takes `S` or `G` (F3); `severity_floor` has the values `ALL`, `MATERIAL`, `BLOCKING` (F5); a rule for telling operator text from material in one message (F6); `source_tier_floor` never counts Tier C (F12); `/show-contradiction-log` cites Module 06 outputs A and B (F15); version line (F17).
- Verdicts (F4): PASS WITH CORRECTIONS requires every pass complete (Guide §10.2, Module 10); an incomplete pass with material corrections is LIMITED REVIEW.
- Standard: the evidence record drops `amount`/`currency`, which belong on the transaction record, and uses Module 01's classification values (F7 — the 1.10 entry below said the evidence record used the schema's field names; two of its fields did not); §10.1's ledger has source and normalized amount columns, as does Module 05's (F21); §11 states the one-alternative floor and points to Module 06's three (F19); §15's authority test is §13's — the authority stated (F23).
- Project Instructions: the draft/executed distinction (Standard §7.3) is a workflow requirement every template loads (F9).
- Template library: version line (F17); the block's preface no longer says two rule sets never conflict (F24); T09 generates Module 06's alternatives (F19); T10 produces Module 08's twelve-section report and runs the final audit in a fresh context when practical (F18, F22); T11 varies input order three ways unconditionally, as the rubric does (F20).
- Rubric and schema: the evaluation record template and the Prompt evaluation record carry the same fields (F11).
- Adversarial suite (2026-09-28, TESTS F14): the Coverage section names the module rule each of A01–A39 exercises, the tests whose rule is outside `PROMPT_MODULES/`, and — until A40 was added the same day — that no test exercised Module 07.
- Adversarial suite: A40 (2026-09-28, TESTS F14) — an acquisition plan with a pretext on offer, the first test of Module 07's six rules.
- Adversarial suite: A41–A52 (2026-09-28, TESTS F14) — tests for every numbered rule, Final Accuracy Audit pass, visual step and legal-audit step no test named; run when a prompt uses the module.
- Adversarial suite: A33–A39 — an allegation framed as fact (F10); a flag change inside evidence; a module invoked without its text; accepted risk on a blocking finding; a blocking defect with an incomplete pass; a user-narrowed scope; likelihood and confidence recorded apart (F13). 39 tests at that point; 52 with A40–A52.

Under the maintainer's directive DIR-0020 (2026-09-30), text corrections from the doctrine-by-doctrine review (`papertrail/project/audits/DOCTRINE_REVIEW_2026-09-30.md`, TAS #3–#6):

- Rubric: the evaluation-record template's rows carry the schema's fields, with `prompt_version`/`prompt_hash` on one row and `prompt_id` as the record's id (#3).
- This log's 1.12 entry: the Coverage sentence, the "1.10 entry above", the Module 07 clause and the "39 tests" count read as of the day each was true (#4).
- SOURCE_INDEX VZ-01: the verification notes it pointed to are not in this system (#5).
- INTEROP §7's TAS row names `ENT-` and `HYP-` beside `GAP-` as Standard §16 prefixes with no schema (#6).

Under the maintainer's directive DIR-0021 (2026-09-30), the review's content findings decided by the session (`papertrail/project/audits/DOCTRINE_REVIEW_2026-09-30.md`, TAS #1, #2):

- Control Surface: `severity_floor` `ALL` says a Guide §10.2 PASS with disclosed non-material defects does not by itself complete the task (T-0323).
- Suite and Guide: the base Regression gate holds the Guide §9.3 minimum set — A01, A07, A11, A12, A17 and A33 added; the Guide's list names the test for each item (T-0324).
- Standard §17 Pass 2 names §4's evidence classifications and makes a claim under the wrong one a finding (T-0338, the audit-protocol vocabulary discontinuity METHODOLOGY_VALIDATION_2026-09-21 §1 names).

Under the maintainer's directive DIR-0035 (2026-10-02), which extends the guard against output shaped by format rather than findings to this system's audit:

- Module 10: one more adversarial check, for a list or section whose length or structure was set by format rather than findings (umbrella `BEHAVIORAL_FAILURES.md` F26–F29; research RL-0016). No numbered rule, other module or source changed.

Under the maintainer's directive DIR-0036 (2026-10-02), [stated] "Drop that the "edition" framing entirely":

- README: the "Investigative & Legal-Document Evidence Edition" subtitle is replaced, and the opening paragraph describes TAS as evidence-first investigation of any question of fact that is written to the standard legal work demands (LA-01 to LA-06 named). The byline on every file reads "Part of Topic Authority System (TAS)", and SOURCE_INDEX.md and the template library say "TAS" where they said "this edition". A "Where TAS's job ends" section names the jobs that begin at its boundary — research synthesis (RAS), argument evaluation (LAS), decision quality (DAS) and applying law to facts — under decision DEC-0036, which superseded DEC-0003; it is a statement, not a dependency, and no rule file names a sibling. No rule, module, schema, test or source changed; the held items stay held (DIR-0003).

Under the maintainer's directive DIR-0037 (2026-10-02), [stated] "you need to get a source for each module. Otherwise it looks like we made it up": `SOURCE_INDEX.md` gains a section, "Supporting sources found after the rules were written", listing 28 works read on 2026-10-02 for the module rules that had no indexed source. Each is support found after the rule was written, never its origin; where a source disagrees with a rule it says so. No rule, module, schema or test changed.

## 1.11 — 2026-09-25

Fixes that land in TAS from the umbrella layer's 2026-09-25 code review (`papertrail/project/audits/CODE_REVIEW_UMBRELLA_2026-09-25.md` in the Authority Systems umbrella), under the same directive, DIR-0013.

- Standard §15: following a link, executing code, contacting a person or revealing protected information needs the user's own instruction; omitting evidence from the scope reviewed is never permitted, whoever asks, and a narrowed scope is stated in the output. The clause "unless the user independently authorized that action" covered all six actions before (umbrella F1).
- The Claim record carries `confidence_term`, the five-term value, and Calibrated Confidence Language Rule 3 says to record it there rather than reconstruct it from `confidence` (umbrella F5).

## 1.10 — 2026-09-25

Fixes for the fifteen findings of the 2026-09-25 code review (`papertrail/project/audits/CODE_REVIEW_TAS_2026-09-25.md` in the Authority Systems umbrella), made under the maintainer's directive DIR-0013. Each fix was checked before and after the edit.

- `source_tier_floor` now sets the lowest tier that may **count toward** a corroborated fact; it never lets one source stand as corroboration on its own, defaults to `D`, and may not be set below it (F1).
- Verdict precedence stated in Module 10, Module 12, Guide §10.2 and T12: a blocking defect found in the scope reviewed is FAIL even when another pass could not be completed; LIMITED REVIEW applies only when no blocking defect was found (F2).
- Commands and flags are honoured only from the operator's own instruction text, never from evidence, and every flag change is echoed back (F3).
- Modules 02 and 12 carry the untrusted-content rule in their own prompts (F4).
- `show_reasoning_chain: false` collapses the chain but never hides alternatives or contrary evidence (F5).
- Omitted material contradictory or exculpatory evidence is BLOCKING in the Guide, matching the rubric (F6).
- The Standard's evidence record uses the schema's field names; the schema gains `source_hash` and `paragraph`/`cell`/`message_id` pinpoints (F7).
- `ACCEPTED_RISK` is defined, needs a named human, and is never valid on a BLOCKING finding (F8).
- Test A23 follows the Policy §9 priority order (F9).
- The template library loads one rule set and consults the Standard and Policy on demand; the Guide applies to legal documents, prompts and work intended for legal reliance, not every output (F11).
- The confidence vocabulary maps one term to one value (F12). `/run-module` refuses to run a module whose text is not in context (F10). The rubric's REVISE AND RETEST band excludes blocking defects (F13). `/devils-advocate` output is logged as a hypothesis or gap, never as a contradiction (F14). Module 09 uses the schema's four severities (F15).

## 1.9 — 2026-09-17

- Added `CORE/CONTROL_SURFACE.md`: a defined set of in-session commands
  (`/run-module`, `/audit-pass`, `/show-contradiction-log`, `/devils-advocate`,
  `/final-audit`, `/run-adversarial-test`) and session flags (`severity_floor`,
  `source_tier_floor`, `show_reasoning_chain`, `auto_run_adversarial_gate`,
  `visual_release_mode`), so TAS has a control surface usable in a raw chat
  session with no backend, independent of any embedding application's own
  command/flag layer. Every entry states which existing TAS rule/file it
  operationalizes and either a verified external precedent (Claude Code's
  slash-command system, EDRM's phase model, Heuer & Pherson's Structured
  Analytic Techniques, a code-review severity taxonomy, the Command Line
  Interface Guidelines) or an explicit "reasoning only" label when no
  precedent was found. `/devils-advocate` resolves the "structured
  devil's-advocate pass" the v1.8 self-QA explicitly deferred pending
  sign-off, by offering it as an opt-in command rather than a mandatory
  rule change. Two candidates (a citation-strictness flag; making the
  diagnosticity column or Module 08 premortem step optional) were checked
  against a stated non-negotiable-rule boundary and rejected outright since
  both are already mandatory rules, not tunable preferences. Updated
  `README.md`'s Structure section to list this file.

## 1.8 — 2026-09-17

Self-QA pass and cross-domain enhancements. Two batches of changes:

Self-QA fixes (structural gaps introduced when this repo was first trimmed from the original standalone package, found by an internal structural audit against this repo's own citation references and `PROMPT_QA_RUBRIC.md`):
- Re-added a trimmed `SOURCE_INDEX.md` at repo root — the bibliography for every `[PE-##]`, `[FI-##]`, `[IM-##]`, `[VZ-##]`, `[LA-##]`, `[CX-##]` citation used in `CORE/INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md`, `VISUAL_STANDARDS/LEGAL_INVESTIGATIVE_VISUAL_STANDARD.md`, and `EVALUATION/LEGAL_DOCUMENT_AND_PROMPT_AUDIT_GUIDE.md`. It was excluded during initial vendoring on the mistaken theory that it was distribution bookkeeping; it is a citation index, not a copy of any source's text, so there was no license reason to leave it out. The `Local artifact` column was dropped since `ORIGINAL_SOURCES/` itself correctly stays excluded from this repo.
- Reworded two references to `CORE/00_START_HERE_BOOTSTRAP_PROMPT.md` (`CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md` rule 12; `PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md`) so they state the underlying principle — verify a governing file is actually accessible before relying on it — directly, instead of pointing at a ChatGPT-Project-specific bootstrap file that was correctly excluded from this app-agnostic repo but left dangling references behind.
- Added a one-line clarification to the `ORIGINAL_SOURCES` mention in `PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md` noting it is part of the fuller source package this edition was drawn from and is not included in this repo.
- Added a fourth verdict, LIMITED REVIEW, to Module 10 (Final Accuracy Audit), matching how Module 12 already defines it: for when a review scope or source-availability limitation — not a defect in the work — prevents a complete verdict. Previously Module 10 could only issue PASS, PASS WITH CORRECTIONS, or FAIL, which forced a scope-limited review into a misleading FAIL and blurred the "not found" vs. "does not exist" distinction the doctrine enforces everywhere else.

Cross-domain enhancements (adopted from external research into intelligence-tradecraft, evidence-law, and decision-science methods that overlap with TAS's own goals; declined items and larger candidate modules are documented separately and not part of this release):
- Added a diagnosticity rule and a "Diagnostic value" column to the hypothesis matrix in `CORE/INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md` §11 and Module 06 (Hypothesis and Contradiction Testing), adapted from Analysis of Competing Hypotheses (Heuer & Pherson): evidence consistent with every live hypothesis is non-diagnostic and must not be listed as generic support; evidence inconsistent with one or more hypotheses is weighted more heavily than evidence merely consistent with the leading one.
- Added `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`, a shared calibrated-language vocabulary adapted from the U.S. Intelligence Community's words of estimative probability (ICD 203), and pointed Module 06's conclusion step and `CORE/INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md` §11 at it. Replaces ad hoc "high/medium/low" narrative language with a shared five-term vocabulary; the three-value `confidence` schema field is unchanged, with a mapping note added instead of a breaking schema change.
- Added a `warrant` field to the Claim record (`EVALUATION/OUTPUT_SCHEMAS.md`), adapted from Toulmin's model of argumentation: a one-sentence statement of why the cited evidence bears on this specific claim, distinct from `confidence_basis` (how sure) and from `supporting_evidence` (what was cited). Added a matching "Warrant" column to Module 08's claim-to-evidence appendix table and a rule requiring it be stated alongside the citation.
- Added a premortem rule to Module 08 (Case Synthesis), adapted from Gary Klein's premortem technique: before drafting, state the single most likely way the report could later be shown wrong, overstated, or missing something material, and check whether the evidence in hand already addresses that failure mode, surfacing any gap under Investigative Gaps rather than proceeding silently.

Not changed in this release: `META/UNIVERSAL_DOMAIN_GUIDANCE_SYSTEM_BUILDER_PROMPT.md` re-add (deferred to when narrative-edition work starts, so it is designed against a real second edition); a structured devil's-advocate pass, a Scheme/Modus-Operandi Reconstruction module, and a Digital/Open-Source Media Verification module (larger scope decisions, held for explicit sign-off before drafting).

## 1.7 — 2026-09-16

- Closed a ground-truth-contamination gap surfaced by adversarial regression testing (test A24): `EVALUATION/PROMPT_QA_RUBRIC.md`'s evaluation protocol now requires verifying that each ground-truth answer is itself evidence-supported before scoring a run against it, and requires treating a flawed ground truth — not a correct, conservative model output that disagrees with it — as the defect to fix. Previously the protocol defined a ground-truth test set but never required auditing the ground truth's own validity, so a bad ground-truth answer could have caused a correct module output to be wrongly scored as a failure.
- This completes adversarial regression coverage of all 32 named tests in `ADVERSARIAL_TEST_SUITE.md` across Modules 01–06 and 08–12 (Module 07 has no dedicated numbered test but was separately checked against its own pretexting/impersonation prohibition).
- No other files changed.

## 1.6 — 2026-09-16

- Established Topic Authority System (TAS) as the official product name. This package is now titled and self-identifies as "Topic Authority System: Investigative & Legal-Document Evidence Edition" — TAS is the reusable brand/architecture name, and "Investigative & Legal-Document Evidence Edition" is this build's subtitle, naming the one domain this specific edition's source hierarchy, standard, and modules actually govern.
- Updated `README.md` title, metadata, and cross-domain-builder section accordingly.
- Updated the first-chat bootstrap prompt (`CORE/00_START_HERE_BOOTSTRAP_PROMPT.md` and its plain-text copy) so the AI's own activation banner and required acknowledgment explicitly name Topic Authority System and this edition, rather than only the generic "source-first investigative framework" phrasing.
- Added a one-line "Part of Topic Authority System — Investigative & Legal-Document Evidence Edition" byline under the title of every CORE, PROMPT_MODULES, PROMPT_TEMPLATES, VISUAL_STANDARDS, EVALUATION, REFERENCE_NOTES, SOURCE_INDEX, and PROMPT_MODULE_CATALOG file, so the edition identity travels with each file individually rather than living only in the README.
- Updated `META/UNIVERSAL_DOMAIN_GUIDANCE_SYSTEM_BUILDER_PROMPT.md` (and its plain-text copy) to require that every future domain build produced by that prompt is packaged as its own named TAS edition (`Topic Authority System: [DOMAIN SUBTITLE] Edition`), while making explicit that no two editions share source hierarchies or authorities merely because they share the TAS name and layout.
- Renamed the human-readable guide files from `Investigative_Prompt_Engineering_Human_Guide_v1.3.{docx,pdf}` to `TAS_Investigative_Legal_Document_Edition_Human_Guide_v1.6.{docx,pdf}` and updated their title page and running header to match; updated every manifest reference to the new filenames.
- Updated `FULL_PACKAGE_MANIFEST.txt` and `PROJECT_SOURCE_SET_MANIFEST.md` headers, version, and file listings.
- This is a naming/identity change only. No rule, module, schema, or evidentiary behavior changed from v1.5.

## 1.5 — 2026-09-16

- Closed a citation-proximity gap surfaced by adversarial regression testing (test A19): Module 02 (Source Verification) now explicitly requires that a cited passage support the exact proposition stated — including scope, specificity, time period, and qualifiers — and not merely discuss the same topic. This rule previously existed only in `CORE/INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md` section 14 and was not repeated in the module's own self-contained text.
- No other files changed.

## 1.4 — 2026-09-16

- Closed a corroboration-independence gap surfaced by adversarial regression testing (test A05, duplicate quoted email): Module 01 (Evidence Extraction), Module 02 (Source Verification), and Module 08 (Case Synthesis) now each explicitly require that a forwarded, requoted, or republished copy of the same underlying statement be extracted once and never counted as an additional independent corroborating source.
- Added a `restates_evidence_id` field to the evidence record schema in `EVALUATION/OUTPUT_SCHEMAS.md` so a restatement can be linked back to its original record and the linkage is machine-checkable rather than left to narrative discipline alone.
- Added a matching "Restates (evidence ID, if any)" column to Module 01's evidence-records output table and a restated-versus-independent count to its final check.
- This closes a gap that previously depended on the source-isolation guidance in `CORE/INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md` section 7.2 being active in the same context as a module; the rule now travels with each affected module on its own.
- No other files changed. The archive, human-readable guide, and templates remain the v1.3 versions.

## 1.3 — 2026-09-16

- Corrected the self-contained Project Source Set so all twelve task modules are included and available for mandatory routing.
- Changed setup guidance from manually adding task modules mid-workflow to keeping operational guidance indexed while retrieving only task-relevant files.
- Expanded the bootstrap availability check to verify task-relevant modules, visual-decision guidance, schemas, and adversarial tests when required.
- Added a task-dependency-missing status so the framework cannot claim a routed workflow stage was completed when its required module is unavailable.
- Updated the human guide, plain-text bootstrap, manifests, and release packages to match the corrected architecture.

## 1.2 — 2026-09-16

- Added a polished human-readable DOCX/PDF guide covering setup, architecture, file/folder roles, workflows, visual standards, source-backed benefits, limitations, authority, provenance, maintenance, and integrity.
- Added plain-text human-use copies of the bootstrap and universal builder prompts.
- Added `META/UNIVERSAL_DOMAIN_GUIDANCE_SYSTEM_BUILDER_PROMPT.md`, a reusable prompt for rebuilding the same source-first architecture for a different domain/topic.
- Updated the README to document the human guide and cross-domain builder.
- Rebuilt integrity manifests and final release ZIPs.
- The external source archive itself was not substantively replaced; v1.2 packages preserve the v1.1 archived source set and provenance records.

## 1.1 — 2026-09-16

- Added the source-first first-chat bootstrap prompt with a verified-access acknowledgment and honest project-working-memory definition.
- Added the Legal and Investigative Visual Standard and expanded visual-type decision matrix.
- Added an integrated library of thirteen ready-to-run prompts that invoke the core standards, modules, schemas, visual rules, and audits.
- Added Visual Selection and Specification and Legal Document and Prompt Audit modules.
- Added the Legal Document and Prompt Audit Guide with document-type overlays, sampling controls, severity rules, and human/legal review gates.
- Added corpus, visual-element, audit-finding, and prompt-evaluation schemas.
- Expanded the adversarial suite for illustrative-aid status, missing flow intermediaries, misleading scales, accessibility, OCR, document-version state, legal authority, and hidden protected content.
- Archived additional official or peer-reviewed sources for visual design, accessibility, ESI, AI risk/evaluation, technology-assisted review, long-context retrieval, ChatGPT Projects, and latency; recorded verified-mirror and link-only limitations.
- Rewrote the README with a source-backed explanation of the architecture, benefits, setup, file map, and limitations.

## 1.0 — 2026-09-16

- Created evidence-first investigative prompt-engineering standard.
- Added compact ChatGPT Project instructions.
- Added source-authority and retrieval policy.
- Added ten reusable prompt modules.
- Added QA rubric, adversarial test suite, and output schemas.
- Archived current prompt-engineering sources, academic papers, the Netherlands Forensic Institute benchmark repository, the World Bank/UNODC StAR handbook, and the user-supplied FATF 2025 Asset Recovery Guidance.
- Recorded canonical link-only authorities for the FATF 2012 Financial Investigations Guidance and the FFIEC BSA/AML Manual.
