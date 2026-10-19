# Changelog

*Research Authority System (RAS)*

## 2026-10-10 — DIR-0044: the restating-a-finding section's last sentence

Under DIR-0044, `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`'s "Restating a finding" section ends "in both studies the exaggeration was in the restatement, not in the result it restated", where it said "the restatement is where accuracy is lost", which claimed more than the two studies show (AUDIT_QAS_2026-10-10 UNSOURCED-4, AUDIT_EHS_2026-10-10 UNSOURCED-5). The same words in every system (audit check 65).

## 2026-10-10 — DIR-0043: three further systems and claim fidelity

Under the maintainer's directive DIR-0043 (2026-10-10), which built PROP-0007:

- `README.md`: a paragraph naming the three systems added that day — QAS (quantitative analysis), EGS (evidence gathering) and EHS (ethics and harm) — and where this system's job ends against each (DEC-0036's boundary-by-job rule; audit check 34 (d) now reads every README for every other system's name).
- `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`: the section "Restating a finding" added at the end, word for word the same in every system (INTEROP.md [IN-067]; audit check 65). A restatement may simplify a finding but may not raise its confidence term, widen its scope, or state an association as a cause (Sumner et al., BMJ 2014; Boutron et al., JAMA 2010 — papertrail/project/SOURCES.md PS-0246, PS-0283).

## 2026-10-05 — DIR-0042 decisions

Under the maintainer's directive DIR-0042 (2026-10-05), his answers "Duplication check" and "Yes, CC BY 4.0":

- Load duplication (umbrella audit check 63, which replaced the byte ceilings): the Project Instructions' principle 11 restated Standard Rule 11 word for word and now names it; the Standard §6 source record's `claim_specific_tier_exceptions` line restated the schema's row and now points to `EVALUATION/OUTPUT_SCHEMAS.md`'s Source record.
- `LICENSE`: Creative Commons Attribution 4.0 International, replacing "All rights reserved"; the README's structure list says so.

## 2026-10-03 — DIR-0041 decisions

The maintainer's answers under DIR-0041 to decisions DIR-0040 left open. Each change below was checked by a grep that fails on the tree before it and passes after.

- Tier 2 is one source's position (T-0137; AUDIT_RAS_2026-09-20 BROKEN-4, AUDIT_RAS_2026-09-21 BROKEN-16): Policy Section 3's Tier 2 is a peer-reviewed study that is itself an independent replication of an earlier finding, and Tier 4 a single peer-reviewed study that is not a replication; whether a finding is "multiple, independently replicated" is judged per claim in Module 04's corroboration verdict. Module 03's tier-scale line and rule 1 say the same. The 1–8 numbering is unchanged.
- Consensus and opinion in the tier table (RF-0026 (d)): Tier 3 is a formal, documented consensus statement of a recognized expert or official body; a single expert's opinion and an official statement that states no evidence for its claim sit at Tier 5, below peer-reviewed studies. Section 3 states that the ladder is a default, not a bar on judgment: a tier for a claim can sit above or below its row with the reason stated, recorded as a claim-specific tier exception, which Module 03 rule 1, Standard §6 and the Source record now allow in either direction (they read "lower tier" before). No tier was renumbered.
- Templates start with Module 01 (T-0298; AUDIT_RAS_2026-09-21 BROKEN-15): the template library states that every template producing a synthesis or a verdict (T00, T01, T02, T04, T05, T07) starts with Module 01, and T02, T04, T05 and T07 now run it; T03 and T06 frame no question. The catalog's "Do not skip Module 01" is unchanged.
- Prompt-injection rule's limit (RF-0026 (a)): Standard §11 states that treating instructions inside sources as data reduces injection but does not prevent it, so an output that acts on retrieved text is checked (Module 10 rule 13).
- Final audit independence (RF-0026 (b)): Module 10 records a fresh context of the same model as a separate pass, not an independent review; independence needs a different model or a person. Output D states the reviewer type and whether the review was independent, and the Final audit finding record gains `reviewer_type` (TAS's audit-finding vocabulary) and `independent_review`. Standard §7 Stage 9 and the catalog's Module 10 row no longer call every fresh-context audit independent.
- `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` carries ICD 203's seven likelihood terms with their probability bands and the directive's alternative term beside each, where it carried five and no bands; it quotes the directive's rule on mixing the two term sets (Rule 1 requires the disclaimer) and its bar on a confidence level and a likelihood term in one sentence, which Rule 3 applies to the certainty-of-evidence label as well (INTEROP §2; T-0225, wording as T-0231 read it from ODNI's copy). The maintainer's choice.

## 2026-10-02 — DIR-0040 fix pass

Under the maintainer's directive DIR-0040, [stated] "Go thru each task and only fix it or do it if it's still necessary to do". Each change below was checked by a grep that finds the defect on the tree before it and does not after. No module rule was added or removed; no test or record-ID prefix changed.

- One spelling per value (T-0136; AUDIT_RAS_2026-09-20 BROKEN-1, BROKEN-2): the venue legitimacy flag is `standard` / `non-indexed-unclear` / `known-predatory` in the Policy (Section 3), the schema and Module 03's output; the third representativeness verdict is LIMITED-NOT ESTABLISHED in Module 05 rule 7, Module 09 rule 1 and the schema's certainty scale.
- Standard §6's source record uses the Source record machine form's field names (`claim_specific_tier_exceptions`, `venue_legitimacy_flag`, `provenance_flag`, `source_level`, `funding_conflicts_of_interest`) and gains `funding_coi_status` and `quality_flag` (T-0136).
- Funding and conflicts of interest (T-0136; BROKEN-3, MISSING-3): one value set, disclosed / undisclosed-discovered / none found / not checked, in Standard §6, the Source record (table and machine form, `funding_coi_status`) and Module 05 output A; Module 03's output gains the column its rule 9 fills.
- Warrant (T-0136; MISSING-4): Module 04's output gains a Warrant column, the producer of the Claim record's Warrant field.
- Quality flag (T-0136 MISSING-5; INTEROP §6, T-0004): Module 03's quality flag is clean / minor-concern / serious-concern and is a field of the Source record (`quality_flag`). Gap priority is central / peripheral (Module 08 rule 6's terms) in Module 08's output and rule 7 and in the Research gap record (`CENTRAL`, `PERIPHERAL`).
- Study design (T-0136; BROKEN-9): RCT / observational / case study / model-simulation / consensus statement / review / other, in Standard §6, the Source record (`study_design`, null where not applicable) and Module 03's output.
- Pointers (T-0136; BROKEN-5, BROKEN-6): Standard §5.3 points at Module 09 rule 3 for the single-source cap as well as at Section 9's scale; README and `SOURCE_INDEX.md` place the institutional/funder-concentration check in Module 02's diversity check and Module 05 rule 6, not Module 06.
- Policy Section 9 (T-0136; BROKEN-17): the mirror sentence reads "use a mirror only if its identity and its content can be confirmed to match the original".
- Search log (T-0297; BROKEN-14): Module 02 output A gains the Purpose column (general / disconfirming-focused) that the Search record and R01 name; the Search record gains Notes (`notes`), which Module 02 rule 6 fills; Policy Section 5's Saturation row becomes "Stopped because" with the set Module 02 output D uses; Module 02 output D's access status reads full text / partial / inaccessible, as Standard §6 does.
- Source record (T-0297; MISSING-14): Retrieved at and Access status (`retrieved_at`, `access_status`: `FULL_TEXT`, `PARTIAL`, `INACCESSIBLE`), required by Standard §6, are fields of the Source record and columns of Module 03's output.
- README (T-0297; MISSING-13): `EVALUATION/OUTPUT_SCHEMAS.md` is described as holding the seven shared record formats; Modules 01, 06, 07 and 09 state their output tables in their own files.
- `SOURCE_INDEX.md` (T-0222; RF-0016): RS-03 says null and negative results are less likely to be published, without "or found".
- `SOURCE_INDEX.md` (T-0299; RL-0012, PS-0030, PS-0040, PS-0041): RS-07 names Module 03 as what lateral reading grounds and says the extension to consensus mapping is RAS's; RS-11 gives the COPE page's warning signs and says that the DOAJ cross-check, the replacement of Beall's list and that list's inactivity since 2017 are RAS's statements with no source; RS-12 names the Crossref location of the database (locator unchanged); a section gives each entry's read status from RL-0012.
- `SOURCE_INDEX.md` (T-0138): a new closing section names ICD 203, the source of `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`'s vocabulary, as DAS DS-13 with ODNI's archive locator and its read date.
- README: the Status section's pointer to the checked-off build plan names `BUILD_PLAN.md`, the file that holds it; the BUILD_PLAN_UPDATED.md it named does not exist (AUDIT_RAS_2026-09-20 and AUDIT_RAS_2026-09-21 MISSING-1; umbrella docs reconciliation).
- `SOURCE_INDEX.md`: the sibling cross-reference names the Decision Authority System's and the Logic Authority System's source indexes by system, where it named two pre-rename directory paths that do not exist in this repository (DEC-0036: no rule file names a sibling's path; umbrella docs reconciliation).

## 0.1.2 — 2026-09-27 (entries dated 2026-09-28 and 2026-09-30 below were made under the same version)

Fixes from the 2026-09-26 code reviews (`papertrail/project/audits/CODE_REVIEW_*_2026-09-26.md` in the Authority Systems umbrella), made under the maintainer's directive DIR-0014, which lifts SA-019 for those findings. DIR-0003 stays: the three held TAS items are not touched. Each fix was checked failing on the pre-fix snapshot and passing after (`papertrail/project/evidence/fix-<REVIEW>-2026-09-26.txt`).

From CODE_REVIEW_TESTS_2026-09-26:

- Adversarial suite (2026-09-28, TESTS F14): the Coverage section names the module rules each test exercises and lists the numbered rules no test reaches.
- Adversarial suite: R22–R36 (2026-09-28, TESTS F14) — tests for the 41 numbered module rules no test reached (the same day's Coverage map listed 38 against a stated 87 rules; the modules hold 90, and Module 04 rules 1, 4 and 8 were missing from it); run on the second tier's condition (R23 when a question may be a single-fact lookup). README's count, stale at 18 since 0.1.2, now reads 36.
- Adversarial suite: R09 names the schema's `Extrapolation flag` field (F34); the second gate tier follows Module 01 Rule 6's routing instead of "stakes or visibility" (F31); a Coverage section states how few numbered rules the tests cite (F14 — recorded, not closed).
- Rubric: REVISE AND RETEST requires no blocking defect, as PASS does (F13); the evaluation protocol runs every gated case (F22).

From CODE_REVIEW_RAS_2026-09-26:

- Provenance (F1): `unverified-provenance` needs no named author or publisher and at least one further mark; one mark alone — an official statement with no method, a syndicated article — does not set it (Policy Section 3, Module 03 rule 11; R16 adds a bylined article that must not be flagged).
- Links (F2): following a citation to the original a source cites is vetting and needs no instruction; an embedded instruction to follow a link is never followed (Standard §11).
- Tier and location downstream (F3, F4, F5, F6, F7): Module 04 takes Modules 02–03 and records each source's tier, pinpoint location and corroboration basis per claim; Module 06 weighs from that; Module 03's exceptions name the claim as the source states it, since claim IDs come from Module 04 (Standard §6, schema); Module 07 takes Module 03's citations and Module 09 its source records; the Claim record gains Corroboration basis and Pinpoint location.
- Not found (F8): a negative search result, and a gap only where the absence bears on the question (README, R10).
- Module 10 (F9, F12): a record the pipeline never produced is a defect (FAIL for the rules that need it); one not handed to the audit is LIMITED REVIEW; the per-claim verdict has LIMITED REVIEW; rules 14–16 check authorized sources, source isolation and audience fit (Standard §13 Passes 1 and 7, Policy Section 7).
- Templates (F10, F11, F15, F16, F23): T02 reports partial completion and gives a likelihood, not a certainty of evidence; T05 runs Module 05 on Modules 02–04's records or says which rules could not run; T05 loads the confidence vocabulary; T03 says the supplied list stands in for Module 02's.
- Rubric (F14, F17): the omission defect exempts a disclosed, user-requested omission; importing a fact from outside supplied sources is a blocking defect; tiering is "per Policy Section 3".
- Adversarial suite (F12, F13): R19 source isolation, R20 a normative question answered by an empirical finding, R21 a predictive question on a contested presupposition. 21 tests.
- Smaller (F18–F22, F24): Standard version line; DAS's Final Decision Audit named correctly; SOURCE_INDEX quotes Rule 8 as the Standard words it and says the RS- ids are not cited; the catalog orders Module 05 before Module 06; the confidence file says ICD 203 has seven terms. INTEROP §4 locates RAS M10's verdict line (F25).

Under the maintainer's directive DIR-0016 (2026-09-30):

- Module 10 rule 13: the audit states whether any step of the pipeline changed because of text inside a retrieved source, and names the step if one did — the statement R24's pass condition asks for. Recorded runs before the change: PROBE-0038/0039, PROBE-0048.

Under the maintainer's directive DIR-0020 (2026-09-30), text corrections from the doctrine-by-doctrine review (`papertrail/project/audits/DOCTRINE_REVIEW_2026-09-30.md`, RAS #3, #5–#8):

- SOURCE_INDEX RS-13 and Standard §16: the modules name none of the index's sources except AHRQ; Kamper's typology is the basis of Module 01's predictive type, not a citation in it (#3).
- T05: with a vetted list and claim map supplied, Module 05 runs on them and states which rules could not run (#5).
- R23: the fail condition names the full pipeline as a whole, not any module of 02–10 (#6).
- This log's 0.1.2 heading and the Standard's version line say that entries dated 2026-09-28 and 2026-09-30 were made under 0.1.2 (#7).
- INTEROP §4 locates the rubric's four adoption verdicts at lines 88–91 (#8).

Under the maintainer's directive DIR-0021 (2026-09-30), the review's content findings decided by the session (`papertrail/project/audits/DOCTRINE_REVIEW_2026-09-30.md`, RAS #1, #2, #4):

- Suite: R19 is in the must-pass gate; R20 and R21 run with the synthesis-question tier (T-0325).
- T07 and Module 10: a synthesis produced outside the pipeline never had the records — the audit says so and the rules that need one are LIMITED REVIEW; the FAIL clause for a record the pipeline never produced applies to this pipeline's own work (T-0326).
- T03–T06 report partial completion under Standard §14 and name the unmet conditions, as T02 does (T-0327).
- Standard §13 Pass 3 names §5's claim categories and makes a claim under the wrong one a finding (T-0338).
- Standard §16 states the basis of the appraisal authority Rule 6 and §7 Stage 2 claim against WP:MEDRS's editor guidance — instruments, not personal objection — and where MEDRS's restraint is the right rule instead (T-0339; the guideline read on 2026-09-30, PS-0088/RL-0015).
- OUTPUT_SCHEMAS: a machine form (JSON, closed values stated in upper case with underscores) after each of the seven record tables, and record-ID prefixes `RSRC` `RCLM` `SRCH` `RDIV` `RBIA` `RGAP` `RAUD` — RAS had none (INTEROP §7 [IN-034], now listed there and guarded by check 44) (T-0337; DEC-0035).

Under the maintainer's directive DIR-0035 (2026-10-02), which extends the guard against output shaped by format rather than findings to this system's audit:

- Module 02 rule 6: every list states found, carried forward and why its search stopped; no count set in advance; lists built by enumerating broadly then judging membership, rejected candidates kept in the search log; equal or round counts across topics checked against the search log; a source reached outside a query logged as a query. Output D gains a coverage line. Module 10 rule 16 checks the shape against the records, including filled cells and dropped source limits. R37 tests both and joins the second-tier run list. (Umbrella `BEHAVIORAL_FAILURES.md` F26–F30; research in the umbrella's `research/LOG.md` RL-0016.)

Under the maintainer's directive DIR-0036 (2026-10-02), which drops the "edition" framing: the README says RAS is "not a part or a subset" of its siblings where it said "not an edition or a subset"; the catalog's open question and the build plan say "overlay" where they said "edition". No rule, module, schema, test or source changed.

Under the maintainer's directive DIR-0037 (2026-10-02), [stated] "you need to get a source for each module. Otherwise it looks like we made it up": `SOURCE_INDEX.md` gains a section, "Supporting sources found after the rules were written", listing 38 works read on 2026-10-02 for the module rules that had no indexed source. Each is support found after the rule was written, never its origin; where a source disagrees with a rule it says so. No rule, module, schema or test changed.

## 0.1.1 — 2026-09-25

Fixes for the fifteen findings in
`papertrail/project/audits/CODE_REVIEW_RAS_2026-09-25.md`, made under the
maintainer's directive DIR-0013 (the no-edit rule for `systems/` lifted
for those findings only). Each was checked absent before and present after.

- F1: a systematic review or meta-analysis pooling two or more independent
  studies is CORROBORATED, with the pooled studies as its basis (Standard
  §5.2, Module 04 rule 7, project instructions); test R18 pins it.
- F2: Standard §11 no longer lets a user authorize omitting disconfirming
  evidence undisclosed or misrepresenting a source; only following a link
  can be user-authorized.
- F3: the injection rule is in the project instructions (principle 15), the
  README rule list, the template library's mandatory block, and Modules
  02, 03, 04, 07 and 10.
- F4: Module 10 rules 11 and 12 check tier, venue, provenance, and
  funding/conflict disclosure (Standard §13 Passes 2 and 4).
- F5: Module 10 receives the Module 01-04 records it checks, and names a
  missing record as LIMITED REVIEW; search limitations are read from Module
  02; Module 09 receives them too; T07 lists the records.
- F6: Module 08 reads Module 07's findings; a retracted sole support is a
  gap (rule 8).
- F7: one representativeness cap, stated in `EVALUATION/OUTPUT_SCHEMAS.md`
  and applied verbatim by Modules 05 and 09; test R17 pins it (gated).
- F8: Module 03 tiers per claim; the source record, schema and Module 03
  output carry claim-specific tier exceptions.
- F9: T02's search keeps two logged queries, one disconfirming; T04 runs
  Modules 05 and 07.
- F10: `replication_status` removed from the Standard §6 source record; it
  is a claim field.
- F11: fixed in the umbrella's `INTEROP.md` — RAS certainty, consensus and
  currency declared and namespaced, the RAS→LAS handoff stated with LAS
  §4's full clause, RAS added to the adoption-verdict row, and the §6
  rename no longer collides with RAS certainty values.
- F12: the confidence vocabulary is named in the template library's
  mandatory block for T01, T02 and T07, and in the project instructions'
  verification requirement; T02 states its certainty in its terms.
- F13: an interim provenance flag (Policy §3, Module 03 rule 11, the
  rubric's blocking defects, test R16); the SOURCE_INDEX open item is
  updated, the framework itself still open.
- F14: the tier scale is defined once, in Policy §3; T02 does not load
  `EVALUATION/OUTPUT_SCHEMAS.md`.
- F15: each project-instructions principle cites the Standard rule it
  summarises, the Standard's Rules 12-15 are added, and RESEARCH GAP and
  NEGATIVE SEARCH RESULT are separate labels.
- Regression gate: R17 and R18 added to the gated list, R16 to the
  run-when-warranted list.

## 0.1.0 — 2026-09-20

This is RAS's first content release under the authoritative build plan's
exact file structure. It supersedes an earlier full v0.1 draft that was
substantively complete but used different file names and a different
ten-module breakdown than the plan approved for RAS specifies. That earlier
draft is not discarded here — its content was read in full and reused,
restructured, and in several places extended to match the plan precisely.

- Restructured `CORE/RESEARCH_INTEGRITY_STANDARD.md` (the earlier draft's
  standard) into `CORE/RAS_PROMPT_ENGINEERING_STANDARD.md`, matching TAS's
  actual `INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md` section pattern
  (purpose/scope, design principles, prompt specification, a research
  claim ontology, source-record requirements, a ten-stage pipeline,
  non-negotiable rules, definitions, citation discipline, prompt-injection
  handling, audit protocol, completion standard, relationship to siblings,
  and source basis) rather than the earlier draft's flatter rules-plus-
  definitions structure. All 12 of the earlier standard's non-negotiable
  rules are preserved; three rules were added (claim-level corroboration,
  the not-found-versus-does-not-exist discipline stated as its own rule,
  and the prompt-injection rule TAS's standard has and the earlier draft's
  did not carry as an explicit numbered rule).
- Added `CORE/SOURCE_AUTHORITY_AND_RETRIEVAL_POLICY.md` as its own
  distinct policy document — RAS's general-research source tiers and
  retrieval discipline, structurally modeled on TAS's own file of the same
  name but with RAS-specific tiers (systematic review down through
  opinion/blog content) rather than TAS's evidence-authenticity tiers.
  This was not a rename of the earlier draft's standard; it is new content
  drawing on the tier scale and retrieval-log fields the earlier draft had
  scattered across `EVALUATION/OUTPUT_SCHEMAS.md` and two prompt modules,
  now consolidated into one governing policy file per the plan.
- Added `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`, reusing TAS's ICD
  203-derived five-term vocabulary near-verbatim and adding five worked
  examples in a research-synthesis context (a well-corroborated causal
  claim, a labeled extrapolation, a genuinely contested claim, a
  sensitivity-analysis-supported claim, and a retracted claim), plus a
  rule distinguishing this vocabulary from the separate certainty-of-
  evidence and degree-of-consensus scales, which it does not replace.
- Added `CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md`, adapting TAS's four-layer
  pattern (project instructions / active guidance / task materials /
  verification archive) to RAS's own non-negotiable rules and claim
  labels, rather than reusing TAS's evidence-law content.
- Renamed and restructured all ten prompt modules to match the plan's
  exact file names and order:
  - `01_RESEARCH_QUESTION_FRAMING_AND_SCOPE_DEFINITION.md` ->
    `01_RESEARCH_QUESTION_FRAMING.md`, adding an explicit fourth question
    type (predictive, alongside empirical/normative/definitional), cited
    to Kamper (2020)'s descriptive/predictive/causal typology.
  - `02_SOURCE_DISCOVERY_AND_SEARCH_DOCUMENTATION.md` ->
    `02_SOURCE_DISCOVERY_AND_DIVERSITY_CHECK.md`, extended with an explicit
    diversity-check output (source independence, institutional/funder and
    geographic/language concentration, viewpoint range) that the earlier
    module's search-log-only design did not include.
  - `03_SOURCE_TIERING_AND_AUTHORITY_CLASSIFICATION.md` ->
    `03_SOURCE_VETTING_AND_AUTHORITY_RANKING.md`, close match, reused
    heavily, and merged with the methodological-fit half (study design,
    sample size, disclosed limitations) of the earlier draft's Module 04
    (Individual Source Quality & Risk-of-Bias Assessment) — a judgment
    call explained below.
  - `04_CLAIM_EXTRACTION_AND_CORROBORATION_MAPPING.md` — new, no earlier
    equivalent. Extracts checkable claims per source and distinguishes
    genuine independent corroboration from restatement of one underlying
    original; absorbs the replication-status concept from the earlier
    draft's Module 04.
  - `06_PUBLICATION_BIAS_AND_REPRESENTATIVENESS_AUDIT.md` ->
    `05_BIAS_AND_INTEREST_DISCLOSURE.md`, broadened beyond publication bias
    alone to funding sources and stated/unstated agendas generally, and
    merged with the funding/conflict-of-interest half of the earlier
    draft's Module 04.
  - `05_CROSS_SOURCE_SYNTHESIS_AND_CONSENSUS_MAPPING.md` ->
    `06_CONTRADICTION_AND_CONSENSUS_MAPPING.md`, close match, reused, with
    sharpened false-balance and false-consensus language.
  - `08_CURRENCY_AND_RETRACTION_CHECK.md` ->
    `07_CURRENCY_AND_RETRACTION_CHECK.md` — same name, reused directly,
    renumbered and cross-references updated.
  - `08_RESEARCH_GAP_ANALYSIS.md` — new, no earlier equivalent. Adapts the
    AHRQ PICOS-based research-gap-characterization framework and a
    four-reason gap taxonomy (insufficient/imprecise, biased, inconsistent,
    not-the-right-information), applying TAS's own negative-search-result
    discipline to research absence.
  - `07_CLAIM_TO_EVIDENCE_CALIBRATION.md` and
    `09_RESEARCH_SYNTHESIS_AND_REPORT_DRAFTING.md` merged into
    `09_SYNTHESIS_AND_CONFIDENCE_CALIBRATION.md` as a two-part module
    (Part A calibration, Part B drafting) run in one pass.
  - `10_FINAL_RESEARCH_INTEGRITY_AUDIT.md` ->
    `10_FINAL_RESEARCH_AUDIT.md`, reused and extended with explicit checks
    against the new corroboration and gap-disclosure requirements.
- Updated `PROMPT_MODULE_CATALOG.md`'s routing table and rules for the new
  module names, order, and dependencies (notably: Module 04 must run
  before Module 06, and Module 08 runs after the consensus/currency
  checks and before synthesis).
- Updated `PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md`'s eight
  templates (T00-T07) to reference the new module names and numbers
  throughout; template structure and coverage otherwise unchanged.
- Updated `EVALUATION/OUTPUT_SCHEMAS.md`: added a diversity-check record,
  a research-gap record, and corroboration-verdict/replication-status
  fields on the Claim record; renamed the representativeness-finding
  record's bias-type field to include funding/agenda alongside the
  earlier four bias categories; updated all module cross-references.
- Updated `EVALUATION/PROMPT_QA_RUBRIC.md`: added two scored dimensions
  (Corroboration mapping; Research gap disclosure), two new blocking
  defects (single-source capture disguised as multi-source corroboration;
  a material research gap identified internally but not disclosed), and
  rescaled the point bands accordingly (new maximum 42, replacing 36).
  Verdict vocabulary unchanged.
- Updated `EVALUATION/ADVERSARIAL_TEST_SUITE.md`: retained all 13 earlier
  test cases (renumbered module references only, no behavioral change to
  R01-R13) and added two new cases — R14 (single-source capture disguised
  as corroboration) and R15 (a research gap identified internally but
  never disclosed in the delivered synthesis) — plus updated the
  regression gate to include both.
- Updated `SOURCE_INDEX.md`: retained all 12 earlier sources (RS-01
  through RS-12) with cross-references updated to the new module names;
  added two new, live-verified sources — RS-13 (Kamper, 2020, verified via
  CrossRef DOI lookup, for the predictive-question type added to Module
  01) and RS-14 (Robinson et al., AHRQ, 2013, verified directly against
  its NCBI Bookshelf text, for Module 08's PICOS-based gap framework) —
  and added a cross-reference note pointing to DAS's and LAS's own source
  indexes for overlapping cognitive-bias and reasoning-error literature
  rather than re-citing it here.
- Replaced the placeholder `LICENSE` with the exact text now used across
  the sibling Authority Systems.
- Rewrote `README.md` to reflect the corrected structure and this
  supersession.

### Judgment call: where the earlier draft's Module 04 went

The build plan's manifest does not give the earlier draft's Module 04
(Individual Source Quality & Risk-of-Bias Assessment) an explicit new
home — it names a new Module 04 (Claim Extraction & Corroboration
Mapping) with no stated equivalent, and separately asks Module 05 (Bias &
Interest Disclosure) to extend beyond publication bias into "funding
sources, stated and unstated agendas." Rather than dropping the earlier
Module 04's content, it was split by what it actually established: its
study-design/sample-size/methodological-limitation fields, which are about
a source's own rigor, were folded into the new Module 03 (Source Vetting &
Authority Ranking); its funding/conflict-of-interest fields, which are
about bias and interest, were folded into the new Module 05; and its
replication-status concept, which is about whether a claim has been
independently corroborated, became part of the new Module 04's
corroboration mapping. No content from the earlier Module 04 was deleted;
it now lives across three modules matched to what each field actually
measures, rather than staying grouped under one module the new manifest
does not otherwise name.

## No prior numbered version

The directory `research-authority-system/` (without the `-v2` suffix)
holds the earlier, structurally mismatched draft this release supersedes.
It is left in place, unmodified, per instruction.
