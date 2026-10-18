# Interop — Shared Vocabulary and Boundary Rules

TAS, RAS, LAS and DAS were built in sequence, each standalone, and three more systems
were added later on the same pattern. Their prose
boundaries are deliberate and correct. Their **machine-readable** boundaries
are not, and the failures are silent rather than loud. [IN-001]
  [PROSE-BY-NATURE: the sentence states a rationale or a disposition rather than an act,
  so there is no event in any retained artifact for a check to be about; the reply it
  shapes is not retained either.]

This file governs the boundaries only. It does not change any system's
internal doctrine, and no system depends on it to run alone. [IN-002]
  [PROSE-BY-NATURE: the sentence states a rationale or a disposition rather than an act,
  so there is no event in any retained artifact for a check to be about; the reply it
  shapes is not retained either.]

Since DIR-0046 (2026-10-10) the seven are of two kinds: five authority systems in the pipeline
(RAS, TAS, QAS, LAS, DAS, router rows 1–5), and two support systems beside it (EGS, EHS, rows 6
and 7), which serve the authority systems and issue no authority judgement.

## 0. Standing rule — never coerce silently

A value that cannot cross a boundary under the rules below is **not**
converted, approximated, defaulted, or dropped. [IN-003] It blocks, and the block
names the field, both systems, and the specific value.

This is the same rule each system already applies to evidence. It applies to
the pipes between them too.

## 1. `tier` — namespaced, never mapped

Three scales, two sharing A–F letters, measuring different things:

Audit check 50 (b) reads each row below against the system that owns the scale: the
directory must exist, hold doctrine, and state that range in its own files. [IN-040] Check 50 (a)
resolves every markdown path this file names — its first run found three still pointing
at the pre-rename `decision-authority-system/` and `logic-authority-system/` directories. [IN-041]

| Scale | Range | Measures |
|---|---|---|
| TAS | A–F | A source's default authority for a use — authenticated evidence, primary material, institutional methodology, investigative reporting, other secondary, social/anonymous (Policy §3's six rows; "authenticity" is only Tier A's first column, and this cell said the whole scale measured it until 2026-09-21, T-0248) [IN-004], check 50 |
| RAS | 1–8 | A source's strength in the research literature for a proposition [IN-005], check 50 |
| DAS | A–F | A precedent's comparability to the decision in front of you [IN-006], check 50 |

**No crosswalk exists and none should be written.** RAS's own policy §1 already
says so: its tiers and TAS's "are not interchangeable, and a RAS-tiered
systematic review is not a substitute for TAS-tiered primary case evidence."
Mapping `TAS:A → DAS:A` would destroy a distinction the systems drew on
purpose. [IN-007]

**Rule.** Every tier value is written qualified with its scale — `TAS:A`,
`RAS:3`, `DAS:B`. [IN-008] An unqualified tier value is invalid at a boundary.

**Schema changes required** — audit check 50 (a) resolves each path named below: [IN-009]

- `systems/das/EVALUATION/OUTPUT_SCHEMAS.md` — `"tier": "B"`
  becomes `"tier": "DAS:B"`. Add a separate `"upstream_tier"` field for a
  cited TAS or RAS finding, so the two can never occupy the same slot. [IN-010] Applied
  2026-10-02 (T-0214): the evidence record writes `"tier": "DAS:B"` and carries `upstream_tier`, and Module 02's evidence table has both columns. Until then,
  a TAS record flowing into DAS Policy §8's "cite the upstream finding" instruction
  (`CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md` §8, line 76 — not the Standard's §9, which is
  calibrated confidence; corrected 2026-09-21, T-0215)
  validated cleanly against `"A"`–`"F"` and meant something else entirely.
- RAS emits numeric tiers that no DAS field could hold before `upstream_tier`.

## 2. `confidence` — unify on ICD 203

The first four systems' `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` files carry the same seven
terms, ICD 203's first row of likelihood terms, each bound to the directive's
probability band (the meaning cells differ between systems; DAS's name the base rate);
until 2026-10-03 they carried five of the seven and no bands (DIR-0041, T-0225). That is the canonical wire format:

    ALMOST_CERTAIN | VERY_LIKELY | LIKELY | ROUGHLY_EVEN_CHANCE | UNLIKELY | VERY_UNLIKELY | ALMOST_NO_CHANCE

The bands, in the same order: 95-99%, 80-95%, 55-80%, 45-55%, 20-45%, 05-20%, 01-05%.
ICD 203's second row of terms (remote … nearly certain), which each confidence file
prints beside the first, never crosses a boundary; an output that mixes the two rows
carries the disclaimer the directive requires: the four files built before DIR-0043 quote
ICD 203's sentence, and the three built under it state the requirement in their own words. [IN-063] A record written
before 2026-10-03 carries one of the five terms it then had and keeps it: a receiver
reads it as written and does not regrade it. [IN-064] All four bar a confidence level and
a likelihood term in one sentence, as ICD 203 does. [IN-065] The three systems added on
2026-10-10 (DIR-0043: QAS, EGS, EHS) carry the same seven terms and bands and also require the
band to be printed beside the term ("likely (55–80%)"), because readers' readings of the terms
vary widely and an official table is matched far less often when the number is not beside the
term (PS-0286, PS-0287). [IN-066] EGS and EHS, the support systems, keep a shorter confidence
file; QAS, a full authority system since DIR-0046, has carried the full shape (purpose,
vocabulary, worked examples, numbered rules, restating a finding) since 2026-10-10
(AUDIT_QAS_2026-10-10b MISSING-9). [IN-084]

**Restating a finding (claim fidelity, DIR-0043).** A summary, headline, abstract, caption or
press line may simplify a finding but may not raise its confidence term, widen its scope, or
state an association as a cause; when it does, the restatement is corrected, not the finding
(Sumner et al. 2014, PS-0246; Boutron et al. 2010, PS-0283). [IN-075] Every system's
`CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` carries this rule word for word under the heading
"Restating a finding", so a system loaded alone carries it; audit check 65 reads all seven files
for the section and fails one that lacks it or words it differently. [IN-067]

TAS and LAS additionally use `LOW|MEDIUM|HIGH`. Treat that as a **local
value, not a wire value**. [IN-049] In LAS it is a display form: its confidence file maps
one term to one value — almost certain, very likely and likely → HIGH, roughly even chance →
MEDIUM, unlikely, very unlikely and almost no chance → LOW. In TAS, since 1.12, it is a different
dimension: the confidence level in a judgment, from the evidence's quality, independence,
completeness and consistency (ICD 203 keeps likelihood and confidence apart), not
derived from the term. Both records carry the term itself (TAS Claim record
`confidence_term`, LAS Verdict record `Confidence term`), so the wire value is recorded,
never reconstructed from the local one. [IN-050] Until 2026-09-25 both files mapped "likely" to HIGH and to MEDIUM
and neither record held the five-term value (DIR-0013). [IN-011]

**Rule.** Record the term itself. Display whatever the local system
prefers. Never transmit `LOW|MEDIUM|HIGH` across a boundary. [IN-012] Audit
check 39 reads every `CONFIDENCE` field written into the trail against the
five terms the trail's own records use, which DIR-0041 did not change (`VERY_LIKELY`
and `VERY_UNLIKELY` are not among them); its display set has been empty since TOOLING_A2 F13 (`low|moderate|high` is no declared set), so no display value passes. [IN-039]

**RAS's per-claim labels are not confidence values.** RAS emits, per
claim, a certainty of evidence (`High` / `Moderate` / `Low` / `Very low`,
GRADE-derived, `systems/ras/EVALUATION/OUTPUT_SCHEMAS.md`), a degree of
consensus (the five labels in the same file) and a currency status
(`current` / `corrected` / `retracted` / `superseded` / `unable to verify`,
`systems/ras/PROMPT_MODULES/07_CURRENCY_AND_RETRACTION_CHECK.md`). [IN-045]
Certainty grades the evidence base, not the probability that a claim is
true, so it is never written into a `confidence` field and never mapped
onto the ICD 203 terms. [IN-046] Across a boundary each is written namespaced
— `RAS-CERTAINTY:Moderate`, `RAS-CONSENSUS:Contested`,
`RAS-CURRENCY:retracted` — so RAS's `High` and `Low` cannot be read as the
`LOW|MEDIUM|HIGH` display values the rule above keeps off the wire. [IN-047]

**Fixed at source 2026-09-25 (DIR-0013):**
`systems/das/CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` Rule 3 described mapping
onto a three-value `confidence` field that DAS does not have — its schemas use
the five-term enum. [IN-051] Rule 3 now says DAS's records carry the terms
themselves (seven since 2026-10-03).

## 3. Verification status — a real crosswalk, lossy where it is lossy

Four places, three vocabularies, for one concept:

| System | Values |
|---|---|
| TAS Module 02 | `VERIFIED` / `PARTIALLY VERIFIED` / `ATTRIBUTED BUT UNCORROBORATED` / `CONTRADICTED` / `UNRESOLVED` / `NOT TESTABLE FROM AVAILABLE SOURCES` [IN-013] |
| TAS visual record | Module 02's six, spelled as Module 02 spells them (`EVALUATION/OUTPUT_SCHEMAS.md`, Visual element record, since 2026-10-02, T-0004; until then a four-value set, VERIFIED / PARTIAL / UNVERIFIED / CONTRADICTED, that Module 02 does not use) [IN-014] |
| LAS Module 03 | `VERIFIED` / `CONTESTED` / `REFUTED` / `UNVERIFIED` / `UNVERIFIABLE` [IN-015] |
| RAS Module 04 | `CORROBORATED` / `SINGLE-SOURCE` [IN-016] |

**TAS's internal inconsistency is settled at source** (2026-10-02, T-0004). Until then
Module 02 and the visual record in `EVALUATION/OUTPUT_SCHEMAS.md` used different enums for
the same concept inside one system; the visual record's `verification_status` now takes
Module 02's verdicts, so the TAS column of the crosswalk below covers both.

**TAS → LAS**, required by `systems/las/CORE/PREMISE_EVIDENCE_AND_ATTRIBUTION_POLICY.md`
§4, which demands a load-bearing empirical premise clear "TAS-tier corroborated fact, or RAS-tier evidence meeting at least a moderate certainty rating" — audit
check 54 (a) confirms every status below is defined by the system that owns its column, searching that system's whole tree because TAS's statuses live in
`PROMPT_MODULES/02_SOURCE_VERIFICATION.md` and not in its schemas: [IN-017]

| TAS | LAS | Note |
|---|---|---|
| `VERIFIED` | `VERIFIED` | clean [IN-018] |
| `CONTRADICTED` | `REFUTED` | **not clean** — LAS `REFUTED` is TAS- or RAS-tier evidence showing the premise false. TAS Module 02 lists `CONTRADICTED` without defining it, and its one operative sentence asks for corrected wording that does not exceed the evidence (02_SOURCE_VERIFICATION.md:47) — a correction, not a finding of falsity. A `CONTRADICTED` claim crosses as `REFUTED` when the TAS row's corrected wording drops the claim, otherwise as `CONTESTED`, and the boundary names which (relabelled 2026-09-27, UMBRELLA F21) [IN-019] |
| `NOT TESTABLE FROM AVAILABLE SOURCES` | `UNVERIFIED` | clean with the check recorded — LAS Module 03's check column reads "checked, not testable from available sources"; `UNVERIFIABLE`, the mapping until 2026-09-25, is LAS's status for value judgments and re-typed an unchecked empirical premise as one [IN-020] |
| `UNRESOLVED` | `UNVERIFIED` | clean with the check recorded — "checked, short of the bar" [IN-021] |
| `PARTIALLY VERIFIED` | `VERIFIED` + `UNVERIFIED` | split, not rounded — LAS Module 03 rule 7: the part TAS confirmed (its corrected wording) crosses as `VERIFIED`, recorded as its own premise, and the rest as `UNVERIFIED`, checked, short of the bar [IN-022], check 54 |
| `ATTRIBUTED BUT UNCORROBORATED` | `UNVERIFIED` | clean with the attribution recorded — LAS Module 03 rule 7: checked, short of the bar, with who says it noted in the Source column [IN-023], check 54 |

Those two TAS statuses have had LAS destinations since 2026-10-03 (LAS Module 03 rule 7,
T-0186, DIR-0041), and LAS forbids rounding either one. A `PARTIALLY VERIFIED`
premise is split, never marked wholly `VERIFIED` or wholly `UNVERIFIED`; an
`ATTRIBUTED BUT UNCORROBORATED` premise keeps its attribution beside `UNVERIFIED`, since
dropping it would silently promote an uncorroborated attribution into a merely unverified
one. [IN-024] Until 2026-10-03 both had no LAS destination and blocked under §0.

**RAS → anything.** `CORROBORATED`/`SINGLE-SOURCE` is a count, not a
verification verdict. It does not map. Carry it as a separate field.

**RAS → TAS.** TAS tiers its own sources on A–F and has no field for a RAS
value (§8: no TAS rule file requires a sibling). [IN-054] A research source used in a TAS task keeps
its RAS values namespaced beside the TAS tier — `RAS:1`, `RAS-CURRENCY:retracted`
— never mapped onto it (§1). [IN-052] A research source RAS finds `retracted` or
`superseded`, or flags `unverified-provenance`, supports no TAS claim: this layer
blocks it at the boundary under §0, naming the source and the RAS value.
`AGENTS.md` [AG-012] states the rule; this is where it is carried out.

**RAS → LAS**, the one RAS handoff a system names (LAS Policy §4, quoted above).
A load-bearing empirical premise meets LAS's bar from RAS when its
`RAS-CERTAINTY` is `High` or `Moderate` and its `RAS-CONSENSUS` is `Established
consensus`; it may then be `VERIFIED`. Each other consensus label decides the status
whatever the certainty: `Majority view with notable dissent` and `Contested — evidence
genuinely mixed` make it `CONTESTED` (dissent with evidentiary support is LAS's "credible
sources disagree"); `Emerging — insufficient evidence to assess` leaves it `UNVERIFIED`;
`Minority view against the weight of evidence` leaves it `UNVERIFIED` — checked, short of
the bar — unless the higher-tier evidence shows it false, which is `REFUTED`. [IN-053] At `Low` or
`Very low` certainty it does not meet the bar and stays `UNVERIFIED`, or takes the status
its consensus label gives when that is `CONTESTED` or `REFUTED`. [IN-048] (All five labels
disposed of 2026-09-27, UMBRELLA F20; `Contested` alone was until then.) A `RAS-CURRENCY` of
`retracted` or `superseded` voids the certainty the claim carried.

**TAS → QAS and QAS → LAS** (since DIR-0046, 2026-10-10, QAS is row 3 of the pipeline, between
fact and inference; `systems/qas/CORE/QAS_STANDARD.md` §10). In: a dataset, record or figure that
reaches QAS from TAS keeps the status TAS gave it, written in the QDAT record's
`assurance.upstream_status`; computing from it does not raise that status, and a result that
rests on material whose status is unsettled is run with and without it and reported as
conditional. [IN-080] Out: a QAS result crosses to LAS, or anywhere else, only after a QAUD record gives
`PASS` or `PASS_WITH_CORRECTIONS`, and only as that record's `handoff` lists it (QAS Module 07
rule 14) — each QRES estimate with its interval, level and label and the reliance level and
limits of the datasets behind it, the QCAU verdict and permitted wording where one
exists, the QFRM target population, coverage gap and claim level, and any condition. `handoff`
is empty when the verdict is `FAIL`. [IN-081] A result stripped of these blocks under §0.

**QAS → LAS, the status a premise takes** (T-0374, decided under DIR-0047, 2026-10-10). A QAS result
handed to LAS enters as a premise worded as its QAUD `handoff` words it, and no stronger: it is
`VERIFIED` when the QAUD verdict is `PASS` and every dataset behind it carries an
`assurance.upstream_status` of `VERIFIED`; it is `VERIFIED` conditional on the listed corrections when
the verdict is `PASS_WITH_CORRECTIONS`, the condition travelling with the premise; and any part that
rests on a dataset whose upstream status is below `VERIFIED` is `UNVERIFIED`, split and not rounded, as
[IN-022] does for a partly verified claim. [IN-085] Computing never raises a status (QAS Standard §10),
a dataset that came from no TAS record carries its reliance level beside the premise, and a sentence
stronger than the QCAU permitted wording (a causal sentence on an associational result) is not the
handed-off premise. [IN-086]

## 4. Verdicts — two vocabularies doing two jobs

Both are currently called `verdict`, which is why they collide:

| Purpose | Values | Used by |
|---|---|---|
| Finished-deliverable audit | `PASS` / `PASS_WITH_CORRECTIONS` / `LIMITED_REVIEW` / `FAIL` | TAS M10 (PROMPT_MODULES/10_FINAL_ACCURACY_AUDIT.md:43, spelled with spaces; cited as :42, the OUTPUT heading above it, until 2026-10-02) and TAS M12 (PROMPT_MODULES/12_LEGAL_DOCUMENT_AND_PROMPT_AUDIT.md:40, spelled the same way — found 2026-09-22 when modules 11 and 12 were audited for the first time), RAS M10 (systems/ras/PROMPT_MODULES/10_FINAL_RESEARCH_AUDIT.md:55, spelled with spaces; located 2026-09-27, RAS F25), LAS M10 (systems/las/PROMPT_MODULES/10_FINAL_LOGIC_AUDIT.md:37, spelled with spaces), DAS M10 (systems/das/PROMPT_MODULES/10_FINAL_DECISION_AUDIT.md:38, spelled with spaces; located 2026-09-30, DIR-0020) — TAS was missing from this row until 2026-09-21, T-0248 [IN-025] |
| Prompt-adoption QA | `PASS` / `PASS_WITH_CORRECTIONS` / `REVISE_AND_RETEST` / `FAIL` | TAS schemas, LAS QA rubric, RAS QA rubric (systems/ras/EVALUATION/PROMPT_QA_RUBRIC.md:88, spelled with spaces, the four values on lines 88–91 — RAS was missing from this row until 2026-09-25, DIR-0013), DAS QA rubric (systems/das/EVALUATION/PROMPT_QA_RUBRIC.md:58, spelled with spaces — missing until 2026-09-27, CODE_REVIEW_DAS_2026-09-26 F14), QAS QA rubric (systems/qas/EVALUATION/PROMPT_QA_RUBRIC.md:77, spelled with spaces, the four values on lines 77–80 — missing until 2026-10-10, AUDIT_QAS_2026-10-10b MISSING-6) [IN-026] |
| Quantitative final audit | `PASS` / `PASS_WITH_CORRECTIONS` / `FAIL` | QAS M07 (systems/qas/PROMPT_MODULES/07_FINAL_QUANTITATIVE_AUDIT.md:90, spelled with spaces; no `LIMITED_REVIEW`: a scope gap is a finding, not a verdict) — added 2026-10-10, DIR-0044, AUDIT_QAS_2026-10-10 MISSING-7 [IN-076] |
| Gathering completeness | `COMPLETE` / `COMPLETE_WITH_GAPS` / `IN_PROGRESS` / `INCOMPLETE` | EGS M05 (systems/egs/PROMPT_MODULES/05_GATHERING_LOG_AND_FINAL_GATHERING_CHECK.md:47, spelled with spaces) — a judgment on whether the gathering was done, not on whether anything gathered is true; added 2026-10-10, DIR-0044, AUDIT_EGS_2026-10-10 BROKEN-12 [IN-077] |
| Publication readiness | `READY_FOR_DECISION` / `NOT_READY` | EHS M04 (systems/ehs/PROMPT_MODULES/04_FINAL_ETHICS_CHECK.md:24, spelled with spaces) — never an approval: the publication decision is a named person's (CP-03); added 2026-10-10, DIR-0044, AUDIT_EHS_2026-10-10 MISSING-11 [IN-078] |

The first two rows are different judgments and the distinction is real — keep both, but
rename the fields `audit_verdict` and `adoption_verdict`. `LIMITED_REVIEW` and
`REVISE_AND_RETEST` are not variants of one another: one says scope prevented
assessment, the other says the artifact failed and should be resubmitted. [IN-027] Audit check 54 (b)
reads every value in the table above against the file its "Used by" column names with a
locator, so a vocabulary that drifts out of the file it is said to be used in is a finding. [IN-043]

## 5. Rubric scores — not portable, do not compare

Maxima are 39 (TAS), 42 (RAS), 36 (QAS), 36 (LAS), 39 (DAS), with non-proportional
bands — audit check 54 (c) re-reads each figure against that system's own
`EVALUATION/PROMPT_QA_RUBRIC.md` on every run, which is the CATCH-0041 class and the reason
these numbers cannot quietly go stale. [IN-044] QAS's rubric dates from DIR-0046 (2026-10-10),
with PASS at 32–36 (`systems/qas/EVALUATION/PROMPT_QA_RUBRIC.md`). [IN-082]
EGS and EHS, the support systems, have no QA rubric. A raw 29 is `PASS_WITH_CORRECTIONS` in TAS and `REVISE_AND_RETEST` in
RAS.

**Rule.** Never compare or aggregate raw scores across systems. [IN-028] Transmit the
verdict label, or a normalized percentage **with the system named**. A bare
number crossing a boundary is invalid.
  [PROSE-BY-NATURE: governs the reply, which this project does not retain, so no check in
  its audit sees it; REPLY_GATE.md §3 maps it to F06, false precision, whose tier, G, is
  PROPOSED and not built.]

## 6. Deliberately system-local

Not everything should be globalized. These stay where they are, and are
declared local so nothing downstream assumes it can read them:

- `severity` (`BLOCKING|MATERIAL|NON_MATERIAL|OPTIONAL`) — **TAS only**, and
  the sole input to TAS's `severity_floor` control. RAS, LAS and DAS emit no
  severity; a TAS severity floor cannot be run over their output. [IN-029] Audit check 50 (c)
  re-reads the three systems' own files for a `severity` field on every run, so this stops
  being an assertion the moment one of them adds it. [IN-042]
- RAS's quality flag `clean|minor-concern|serious-concern` (Module 03; the Source
  record's `quality_flag`) and gap priority `central|peripheral` (Module 08 rule 6's
  own terms; the Research gap record) — RAS only. Until 2026-10-02 they were
  `none|minor|material` and `Material|minor`, a **different concept** that reused
  TAS's severity word; renamed at source then (T-0136, T-0004). The earlier
  suggestion here, low / moderate / significant, collided with RAS's own certainty
  values `Low` and `Moderate` (replaced 2026-09-25, DIR-0013).
- TAS `classification` (`DOCUMENTED|CORROBORATED|ALLEGED|INFERRED|HYPOTHESIZED|CONTESTED|UNKNOWN`) — TAS only.
- TAS `VISUAL_STANDARDS/` and its release-mode enum — TAS only.
- The three systems added on 2026-10-10 keep their own sets (DIR-0044): QAS's analysis `phase`
  and `label` (`EXPLORATORY|CONFIRMATORY`) and rival `category`; EGS's plan-item `status`
  (`PLANNED|SOUGHT|DONE|STOPPED|NOT_SOUGHT`) and gathering outcomes; EHS's `decision`
  (`PENDING|PUBLISH|PUBLISH_WITH_CHANGES|DO_NOT_PUBLISH`) and `breach_decision`. Two of them meet
  another system's words and do not stand in for them: EGS records an interview claim as
  `UNCORROBORATED`, which is not TAS's `classification` — the claim reaches TAS as a source to
  weigh, unweighed — and EGS's `DONE` says a request was answered, not that anything in the
  answer is true. [IN-079]
- QAS's dataset assurance block, the QDAT record's `assurance` field (since DIR-0046,
  2026-10-10; defined at the end of `systems/qas/EVALUATION/OUTPUT_SCHEMAS.md`) — QAS only:
  its `collection` (`SURVEY|ADMINISTRATIVE|FOUND|OTHER`), `error_sources[].source`, each
  `fitness` item (`MATCH|MISMATCH|UNKNOWN`) and `reliance` (`RELY|RELY_WITH_LIMITS|DO_NOT_RELY`)
  say how far one dataset can be relied on for one question. `reliance` is not a TAS
  `classification` or a verification status and does not stand in for one; its
  `upstream_status` field holds a status received from earlier work, unchanged: one entry per
  status, naming the issuing system and record and spelling the status as that system spells
  it, so a receiver never guesses the issuer of a value two systems share, such as `VERIFIED`
  (§0; AUDIT_QAS_2026-10-10b MISSING-3). [IN-083]
- Reversibility is spelled `TYPE_1|TYPE_2` in DAS's machine schema (prose: "Type 1",
  "Type 2") and `TYPE-1|TYPE-2` in this project's trail (`DECISIONS.md`'s
  `REVERSIBILITY:` field, audit check 11). The two map one to one and each keeps its
  own spelling, by the maintainer's choice (DIR-0041, T-0217); a value copied across
  is respelled, never left in the other's form. [IN-062]
- LAS's fallacy-finding status `CANDIDATE|CONFIRMED|DISMISSED`
  (`systems/las/EVALUATION/OUTPUT_SCHEMAS.md:102`, the Fallacy finding record, Module 04) collides with the
  trail's `CONFIRMED:` field (`FABRICATION_CONTROLS.md` §1; `TESTS.md`,
  `CATCHES.md`), which means a named person checked a record. The two share a
  word and nothing else: a LAS `CONFIRMED` fallacy is the module's own finding,
  unreviewed. When a LAS finding is quoted into any trail record it is written
  namespaced — `LAS:CONFIRMED`, `LAS:CANDIDATE`, `LAS:DISMISSED` — and never as
  a bare `CONFIRMED:` line; a bare `CONFIRMED:` line in a record continues to
  mean what FABRICATION_CONTROLS says it means. [IN-038] (T-0189; AUDIT_LAS_2026-09-20.md BROKEN-6)

## 7. Record ID prefixes — one global namespace

Prefixes must be unique across all the systems (seven since DIR-0043), because records from
different systems end up in one trail, and audit check 44 runs the grep each row
cites, compares the result to the row's own list and stated count, and fails a
prefix claimed by two systems. [IN-030]

| System | Prefixes |
|---|---|
| TAS | `EVID` `EVT` `TXN` `REL` `CLM` `AUD` `PEV` `CORP` `VE` `VIS` `TEST` `ENT` `HYP` `CFLT` `GAP` `ROR` `ELEM` (the seventeen `EVALUATION/OUTPUT_SCHEMAS.md` defines, `grep -oE '"[a-z_]*id": "[A-Z]+-'`, and the Standard §16 lists the same seventeen; the Element-map record was added 2026-10-10 for Module 13, rule application, DIR-0043; the Right-of-reply record was added 2026-10-05 for the checkpoint CP-01, DIR-0042; the Entity, Hypothesis, Conflict and Gap records were added 2026-10-03 by the maintainer's choice, DIR-0041, T-0237 — CFLT- for Module 06's contradiction log, the maintainer's example prefix, which no other system uses) [IN-031] |
| LAS | `ARG` `PREM` `FAL` `STL` `CON` `VER` [IN-032] |
| DAS | `DEC` `OPT` `DSE` `ASM` `PMF` `FDA` `STK` `CNS` `BIA` `UNC` `CRIT` `REV` `OUT` `TRG` `CMP` `CST` (the sixteen `OUTPUT_SCHEMAS.md` defines, `grep -oE '"[a-z_]*id": "[A-Z]+-'`; the first six were the list until 2026-09-21, T-0215; `CMP` and `CST` were added 2026-09-27 to the fourteen, CODE_REVIEW_DAS_2026-09-26 F10 and F11 — `STK-SET-`, which appeared in DAS text and was defined nowhere, was dropped 2026-10-02 for a `stakeholder_ids` list, T-0206) [IN-033] |
| RAS | `RSRC` `RCLM` `SRCH` `RDIV` `RBIA` `RGAP` `RAUD` (the seven `EVALUATION/OUTPUT_SCHEMAS.md` defines, `grep -oE '"[a-z_]*id": "[A-Z]+-'`; assigned 2026-09-30 under DIR-0021, T-0337 — none were defined before) [IN-034] |
| QAS | `QFRM` `QDAT` `QCLN` `QRIV` `QPLN` `QRES` `QCAU` `QAUD` (the eight `EVALUATION/OUTPUT_SCHEMAS.md` defines, `grep -oE '"[a-z_]*id": "[A-Z]+-'`; assigned 2026-10-10 under DIR-0043, every one beginning Q so none can meet another system's) [IN-068] |
| EGS | `GPLN` `GREQ` `GINT` `GCAP` `GLOG` (the five `EVALUATION/OUTPUT_SCHEMAS.md` defines, `grep -oE '"[a-z_]*id": "[A-Z]+-'`; assigned 2026-10-10 under DIR-0043 — not GAP-, which is TAS's) [IN-069] |
| EHS | `EPIT` `EHRM` `ESRC` `EFIN` (the four `EVALUATION/OUTPUT_SCHEMAS.md` defines, `grep -oE '"[a-z_]*id": "[A-Z]+-'`; assigned 2026-10-10 under DIR-0043; `ESRC` is CP-02's record and `EPIT` CP-03's, `CHECKPOINTS.md`) [IN-070] |

Two defects, both fixed at source:

- **`PRM-` (TAS, prompt evaluation) vs `PREM-` (LAS, premise) vs `PRE-` (DAS,
  pre-mortem finding)** — three spellings one or two characters apart, three
  meanings, all in evidence tables (DAS's `PRE-` added to this defect 2026-09-21,
  T-0215; it was in [IN-033] but not named here). [IN-037] Renamed at source on
  2026-10-02 by the maintainer's choice (DIR-0041, T-0004): TAS's prompt-evaluation
  prefix is `PEV-` and DAS's pre-mortem finding `PMF-`; LAS keeps `PREM-`, which
  had about thirty uses against one and two.
- **RAS defined no prefixes at all** until 2026-09-30, so its "Claim ID" could not be merged with
  TAS's `CLM-` with any collision guarantee. [IN-035] Assigned under DIR-0021 (T-0337): `RSRC` `RCLM`
  `SRCH` `RDIV` `RBIA` `RGAP` `RAUD` — not `SRC`, which `SYCOPHANCY_CONTROLS.md` §2 uses for a user
  statement recorded as a source (changed 2026-09-27, UMBRELLA F22), and not `CLM`, which is TAS's;
  check 44 (c) now guards the seven against the other three systems' prefixes
  — not `GAP`, which TAS's Standard §16 already names for investigative gaps
  (`GAP-####`); suggesting it for RAS would create the collision this section
  exists to prevent (struck 2026-09-21, T-0248).

## 8. Boundaries — each system says where its job ends; none requires another

DEC-0036 (2026-10-02, under DIR-0036) supersedes DEC-0003. Until then this section said TAS
references none of the other three and should stay that way. The maintainer's objection
settled it: [stated] "RAS, LAS and DAS each describe their boundary with the other three and
still work alone. Saying where your job stops isn't a dependency."

The rule now has two halves. **Each system's README says where its job ends and names the job
that begins there**, in its own words, so a system loaded alone carries its boundary. [IN-055] **No
system's rule files require another to run**: nothing in a system's `CORE/`,
`PROMPT_MODULES/`, `PROMPT_TEMPLATES/`, `EVALUATION/`, `VISUAL_STANDARDS/` or module catalog
names a sibling's path or tells the model to run a sibling first. [IN-036] Audit check 34 (d) reads every system's rule files for a
sibling's path and every README for the name of every other system; a requirement phrased by
name only ("run RAS first") is not caught, and the check says so. [IN-056] A README and a
`SOURCE_INDEX.md` describe and cite and are outside the rule-file set.

The jobs, named here for the umbrella's use; each README states them in its own words: [IN-057]

| Job | System | Where it ends |
|---|---|---|
| Evidence-first investigation of a question of fact | TAS | at weighing a whole literature, judging an argument's logic, judging a decision, and at any legal conclusion: its Module 13 maps the evidence to a supplied rule's elements and stops there (DIR-0043) [IN-058] |
| Research synthesis — weighing a body of published research | RAS | at a specific claim about a case, an argument's logic, and a decision [IN-059] |
| Argument evaluation — whether a conclusion follows | LAS | at the truth of the premises (TAS, RAS, QAS) and at the decision [IN-060] |
| Decision quality — whether a decision is or was made well | DAS | at establishing the facts and the figures (TAS, RAS, QAS) and checking the reasoning (LAS) [IN-061] |
| Quantitative analysis — computing from data and testing a theory against it | QAS | at weighing published studies (RAS), at a fact about a case beyond what the data show (TAS), at the argument built on its result (LAS), and at the decision (DAS) [IN-071] |
| Evidence gathering — obtaining records, testimony and online material | EGS | where the material is in hand: weighing it (TAS), verifying online content, which it does not do, and judging harm or publication (EHS) [IN-072] |
| Ethics and harm — public interest, harm, source protection, the publication record | EHS | at the truth of the material (TAS, RAS) and at the decision itself, which is a named person's (CP-02, CP-03) [IN-073] |

Three jobs no system owned (RF-0024, from RL-0017) were placed on 2026-10-10 (DIR-0043, PROP-0007):
analysing quantitative data is QAS's; applying a legal or regulatory rule to established facts is
TAS Module 13's, as far as an element map and no further; scoring judgments against outcomes over
time is the umbrella's judgement ledger (`JUDGEMENT_LEDGER.md`), record-keeping and a scoring rule
rather than a way of reasoning. [IN-074]

The pipeline in `AGENTS.md` — since DIR-0046 (2026-10-10) RAS, TAS, QAS, LAS, DAS, rows 1–5, with
EGS and EHS as support systems beside it — is the order of work, not of file dependency: RAS's work on a
research source comes before TAS relies on it, and a RAS finding reaches a TAS task through
this layer (§3, RAS → TAS).
