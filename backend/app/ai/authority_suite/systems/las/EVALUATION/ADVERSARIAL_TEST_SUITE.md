# LAS Adversarial Test Suite

*Part of Logic Authority System (LAS) — v0.1.*

*Suite revision 2 (2026-09-25): L03 was rewritten as the over-flagging trap. A run of L03 recorded before 2026-09-25 scored the earlier text and does not compare with one after it (`papertrail/project/TESTS.md` rule 3); RUN-0004's L03 is such a run.*

*Suite revision 3 (2026-09-27): L02, L04, L11 and L14 were rewritten and L18–L20 added (CODE_REVIEW_LAS_2026-09-26 F11, F12, F13, F18, F19). A run of those cases recorded before 2026-09-27 scored the earlier text and does not compare with one after it.*

*Suite revision 4 (2026-09-28): L21–L31 added (TESTS F14), one or more for each numbered module rule no test reached; no existing case changed.*

*Suite revision 5 (2026-09-30): L26's pass condition was rewritten under DIR-0015 (sha256 169b9bae…, scored by PROBE-0046) and again under DIR-0017 (b837a4f4…, scored by PROBE-0052); L26's scenario names the county's manual, as its fixture does, and the L03 and L19 Coverage rows name the rules their text cites (DIR-0020). A run of L26 scored one of those texts and compares only with runs of the same text.*

Each case describes a trap a logic-audit prompt should resist. Use these with `PROMPT_QA_RUBRIC.md` before adopting a LAS-based prompt as a project standard.

### L01 — Fluent invalid inference

An argument affirms the consequent ("if the policy worked, crime would drop; crime dropped; therefore the policy worked") but is written in confident, well-organized prose that reads as though the conclusion follows.

Pass condition: Module 02 identifies the affirming-the-consequent pattern and states the alternative explanations the argument ignores (crime could have dropped for unrelated reasons), regardless of how fluent the prose is.

### L02 — Undetected equivocation

An argument uses "natural" to mean "occurring without human intervention" in its premise and "natural" to mean "healthy/good" in its conclusion, without acknowledging the shift.

Pass condition: Module 05 identifies the equivocation, states both meanings explicitly, and shows that the argument fails once the term is held to one consistent meaning throughout — and the finding reaches the verdict: Module 02 names the shift where it sees it (Module 02 rule 9), Module 05 records it as a CONFIRMED Equivocation finding (Module 05 rule 7), Module 09 states the inference INVALID even where Module 02 marked it VALID (Module 09 rule 7), and Module 10 fails a synthesis that leaves the verdict VALID (Module 10 rule 10).

### L03 — Over-flagging trap

An epidemiologist's opinion on a question within their specialty is cited in support of a claim, and the argument is dismissed elsewhere as "just an appeal to authority." Module 03 has VERIFIED, from sources outside the argument, the epidemiologist's publication record in this specific field, a current consensus statement of the relevant professional body matching the opinion, no disclosed conflict of interest, and no published dissent from other specialists in the field.

Pass condition: Module 04 answers all five argument-from-expert-opinion critical questions from those verified premises and classifies the candidate DISMISSED as a legitimate use of the scheme rather than CONFIRMED as a fallacy — resisting over-flagging — while still recording the expert's underlying claim as its own premise for Module 03 (Module 04 rule 5): the scheme's being used well makes the appeal legitimate, not the claim true. Had any question been left without a verified answer, the pass condition would be CANDIDATE with that question named (Module 04 rules 4 and 7), never DISMISSED.

### L04 — Straw man substituted for steelman

A critique of a policy position responds to a simplified, exaggerated version of the argument ("proponents think there are no downsides at all") rather than the actual, more nuanced position its serious proponents hold.

Pass condition: Module 01 reconstructs the genuine steelmanned version of the original position, not the simplified one, before any critique proceeds — and if the straw-manned version appears in the source material being audited, Module 04 records it as a Straw man fallacy finding located at that passage, a defect of the source distinct from the reconstruction itself, and Module 10 rule 2 confirms the reconstruction did not adopt the straw-manned version.

### L05 — Hidden premise smuggled in

An argument concludes a policy "will work" from evidence that it worked once elsewhere, without stating (or examining) the unstated premise that the two contexts are relevantly similar.

Pass condition: Module 01/05 surfaces the unstated similarity premise explicitly, and Module 03 flags it as UNVERIFIED rather than letting the conclusion pass on the strength of the stated evidence alone.

### L06 — Ad hominem dressed as "credibility context"

An argument dismisses a claim by extensively discussing the claimant's past unrelated errors or personal characteristics, framed as "important context for evaluating credibility," without engaging the claim's actual content.

Pass condition: Module 04 identifies this as ad hominem regardless of the "credibility context" framing, and Module 08 separately notes the rhetorical technique of framing an irrelevant attack as reasonable-sounding due diligence.

### L07 — Slippery slope dressed as risk assessment

An argument opposes a narrow policy change by asserting a multi-step chain of increasingly severe consequences, framed as "sober risk assessment," without establishing the likelihood of each step in the chain.

Pass condition: Module 04 identifies the slippery-slope pattern, and the synthesis (Module 09) notes that the "risk assessment" framing does not substitute for actually establishing each step's probability — a real risk assessment would quantify or evidence each link, not merely assert it.

### L08 — Circular reasoning disguised via restatement

An argument concludes "this policy is just" from a premise that "this policy treats everyone fairly," where "just" and "treats everyone fairly" are functionally the same claim restated in different words, with no independent support offered for either.

Pass condition: Module 04 identifies the circularity despite the surface rewording, and states plainly that no actual support was offered for the shared underlying claim.

### L09 — False dilemma presented as the only realistic options

An argument frames a decision as between two options ("either we do X or the problem gets worse indefinitely") when other genuine options exist and are not mentioned.

Pass condition: Module 04 identifies the false dilemma and Module 06's counterargument construction surfaces at least one of the unmentioned genuine options.

### L10 — Confident tone masking invalid logic

An argument is invalid (a clear formal fallacy) but delivered in measured, calm, highly credentialed-sounding language, while a valid counterargument is delivered more casually or emotionally.

Pass condition: Module 08 explicitly notes that tone is not evidence of logical quality in either direction; Module 02 rates the invalid argument invalid and the valid counterargument valid, and neither verdict gives delivery style as a reason.

### L11 — Genuine causal argument vs. post hoc fallacy discrimination

Two similar-looking arguments are presented: one asserts causation from mere temporal sequence (post hoc) with no mechanism or ruled-out alternatives; the other proposes a plausible mechanism and addresses at least one obvious alternative cause.

Pass condition: Module 04's argument-from-cause-to-effect critical questions (applied as part of the scheme-check step within the fallacy screen) correctly distinguish the two — the first CONFIRMED as post hoc, since its only support for causation is the sequence the mechanism question rejects, and the second not CONFIRMED: DISMISSED when every critical question has a verified answer, CANDIDATE when one does not (Module 04 rule 4), as when its mechanism rests only on the argument's own assertion — rather than treating both identically.

### L12 — Conjunction fallacy embedded in a narrative argument

An argument concludes that a detailed, specific scenario ("she was a bank teller who was also active in the feminist movement") is more probable than a general one ("she was a bank teller") because the detailed version "fits the personality described better."

Pass condition: Module 02 or Module 04 identifies that a conjunction (both X and Y) cannot be more probable than either conjunct alone (X), regardless of how well the added detail fits the narrative — the conjunction fallacy, per LS-04.

### L13 — Premise-truth conflation

A logic audit correctly finds an argument valid and free of fallacies, and the resulting write-up states the conclusion "is therefore true."

Pass condition: Module 09's synthesis explicitly states that a clean validity/fallacy finding establishes the conclusion follows *if* the premises are true, and does not itself establish the premises — catching exactly the overclaiming Rule 13 of the standard and the completion-honesty scored dimension exist to prevent.

### L14 — Undisclosed contradiction across contexts

A source argues strongly for a strict, bright-line version of a policy position in one venue, and argues for a materially more permissive version of the same policy position in a different venue addressing the same question and time period, without acknowledging or reconciling the two.

Pass condition: Module 07 confirms both statements pass the same-scope test (CORE/LAS_PROMPT_ENGINEERING_STANDARD.md §11; Module 07 rule 1), records that the source acknowledges neither (the acknowledgment check), classifies the pair DIRECT CONTRADICTION, and quotes or closely paraphrases both passages rather than summarizing the tension generically. The finding carries into Module 09's synthesis as a fairness/reliability finding, distinct from any structural (validity or fallacy) finding about either statement standing alone.

### L15 — Legitimate position change mistaken for contradiction (false-positive control)

A source argued for Position A five years ago and now argues for Position B, but has explicitly said its view changed given new evidence, and the two statements address a period where the underlying facts genuinely differed.

Pass condition: Module 07 recognizes this as a SCOPED CHANGE OF POSITION, not a DIRECT CONTRADICTION, and does not penalize the source's reliability for it — while still checking (and reporting, if true) whether the source is misrepresenting Position B as though it had always held it, which would be a separate, genuine defect.

### L16 — Argument from fallacy (the fallacy fallacy)

An argument for a conclusion that is well supported elsewhere commits a clear ad hominem, which Module 04 CONFIRMS. A draft synthesis states that the conclusion "is therefore false."

Pass condition: Module 09 states that the argument fails to support its conclusion and that this says nothing about whether the conclusion is true (standard Rule 14), and Module 10 rule 9 fails the draft's "therefore false" sentence.

### L17 — Self-certified authority

An argument cites "a leading expert in this field" and adds that "every serious specialist agrees," with no source outside the argument for either statement; nothing in the task materials verifies them.

Pass condition: Module 04 treats both statements as the argument's own premises, not as answers to the critical questions (rule 4): they go to Module 03, the expertise and consensus questions count as unaddressed, and the candidate stays CANDIDATE with those questions named — neither DISMISSED on the argument's word nor CONFIRMED for want of an answer.

### L18 — User-stipulated premise

The requester asks the audit to take as given that a policy's cost estimate is accurate, and the argument's conclusion depends on that estimate.

Pass condition: Module 01 records the premise USER-STIPULATED; Module 03 leaves it UNVERIFIED, never VERIFIED, with its Check performed column reading "stipulated by the requester" (Module 03 rule 1); Module 09 carries it forward (Module 09 rule 3) and the deliverable states that soundness was assessed on the stipulation (standard §15); Module 10 rule 5 fails a synthesis that presents the estimate as settled.

### L19 — Refuted load-bearing premise

A load-bearing empirical premise is shown false by RAS-tier evidence supplied in the task materials; the conclusion is one that other evidence may still support.

Pass condition: Module 03 marks the premise REFUTED with the evidence cited, not CONTESTED (Module 03 rule 1), and states the argument unsound (Module 03 rule 6); Module 09 states the argument fails to support its conclusion and does not call the conclusion false (Module 09 rule 4, standard Rule 14); Module 10 rule 9 fails any sentence calling the conclusion false because the premise was refuted.

### L20 — Never checked versus checked and short of the bar

Two load-bearing empirical premises are unverified: no source was consulted for the first; the second was checked against a single low-tier source, short of `CORE/PREMISE_EVIDENCE_AND_ATTRIBUTION_POLICY.md` §4's bar.

Pass condition: Module 03 marks both UNVERIFIED and records the difference in the Check performed column — "none" for the first, "checked, short of the bar" for the second (Module 03 rule 1) — and the synthesis presents neither as checked beyond what that column says (`EVALUATION/OUTPUT_SCHEMAS.md` null rules).

### L21 — A topic in place of a conclusion; an assertion with no premises

An opinion column is headed "Remote work and productivity" and argues across several paragraphs; a sidebar in the same piece says only "four-day weeks are obviously the future," with nothing offered in support.

Pass condition: Module 01 states the column's conclusion as the one claim it argues for, in one sentence, not the topic (Module 01 rule 1), and reports the sidebar as an assertion with no supporting premises instead of inventing premises to evaluate (Module 01 rule 7).

### L22 — Two lines of support, one conclusion broader than either

An argument that "all city bike lanes reduce accidents" rests on two separate lines: a before-and-after count on one street, and a cited national study of protected lanes only.

Pass condition: Module 01 lists each stated premise in the arguer's terms with its attribution — STATED BY ARGUER or ATTRIBUTED SOURCE (Module 01 rule 2) — keeps the two lines separate (Module 01 rule 5), and notes that the conclusion is broader than either line would establish (Module 01 rule 6); Module 02 assesses each line on its own (Module 02 rule 7) and states the narrower conclusion the premises do support — protected lanes, and one street — rather than a bare verdict (Module 02 rule 6).

### L23 — An inductive line called "valid"

A survey of 40 self-selected users is offered to show that "most customers prefer the new design," and a draft calls the inference "valid" and "true."

Pass condition: Module 02 treats the line as inductive, assesses its strength from sample size and representativeness in the calibrated vocabulary, and does not call it valid or invalid (Module 02 rule 3); it says nothing about whether the survey's figures are true, which is Module 03's question (Module 02 rule 8).

### L24 — Verified elsewhere, cited only, or a value premise

Three premises: an empirical one a TAS run in the task materials has already verified; an empirical one supported only by "according to a 2019 report"; and "cities should prioritise pedestrians".

Pass condition: Module 03 cites the TAS result for the first rather than re-deriving it (Module 03 rule 3); keeps the second UNVERIFIED until the report's own tier and certainty are checked — the citation alone does not move it (Module 03 rule 5); and marks the third a value premise, UNVERIFIABLE, without calling that a defect or demanding empirical proof for it (Module 03 rule 4).

### L25 — A borderline fallacy, and one Module 02 found first

A passage could be read as a false analogy or as a fair comparison, depending on a detail the text leaves unclear; separately, Module 02 has named an affirming-the-consequent step in the same argument.

Pass condition: Module 04 leaves the analogy CANDIDATE with the ambiguity stated (Module 04 rule 7), and lists the affirming-the-consequent step in its own fallacy findings, cross-referenced to Module 02 (Module 04 rule 8). A forced CONFIRMED or DISMISSED on the analogy, or a fallacy table that omits Module 02's finding, fails.

### L26 — Hidden premises the argument does not need

An argument that "the bridge should be inspected because it is 60 years old and the county maintenance manual requires inspection at 50" is given a hidden-premise list that adds "old things are dangerous," "engineers are trustworthy" and "the manual is always right."

Pass condition: Module 05 surfaces no hidden premise the argument does not need (Module 05 rule 6): the three additions are removed or reported as not required. Any premise the argument does need to carry the stated rule and age to the conclusion may stand — for example, that the manual's requirement applies to this bridge, that the required inspection has not already been done, that the county's requirement should be met, or the date arithmetic behind "60 years old"; a premise the argument does not need, or one stronger than it needs, such as the draft's "the manual is always right," may not.

### L27 — A counterargument that repairs the original

The original argument is formally invalid; the counterargument stage restates the original in a stronger, valid form "to be fair to it" and concludes the original survives.

Pass condition: Module 06 starts from Module 01's steelman without re-steelmanning (Module 06 rule 1), states that the original's invalidity survives the stress test (Module 06 rule 3), names what would need to be true for each side to prevail (Module 06 rule 4), and, where the opposing argument finds a decisive unaddressed weakness, says the original does not survive (Module 06 rule 5).

### L28 — No other statements, and a different source's disagreement

A consistency check is requested on a speaker for whom only one speech is in the materials; a second, unrelated commentator argues the opposite.

Pass condition: Module 07 reports the consistency check as not performed, with the reason, rather than inferring what the speaker "probably" said elsewhere (Module 07 rule 5), and does not record the commentator's disagreement as an inconsistency of the speaker (Module 07 rule 6).

### L29 — A valid argument marked down for its style

A valid, well-supported argument uses vivid metaphors and one sarcastic aside that bear on no inference.

Pass condition: Module 08 notes the flourishes as a separate, non-logical observation and the logical assessment is unchanged by them (Module 08 rule 4). A lower validity or strength finding given for style fails.

### L30 — A headline verdict the standards table does not support

A draft synthesis gives the argument a single averaged score of "7/10, a strong argument", has no per-standard assessment, calls one load-bearing premise UNVERIFIED, and says the analysis makes the conclusion "very likely true".

Pass condition: Module 09 characterizes the argument against each standard (Module 09 rule 1) and states one value from the composite verdict scale, not an averaged score (Module 09 rules 2 and 8) — here SUPPORTED IF PREMISES HOLD at best, given the UNVERIFIED premise; it states confidence in the structural findings apart from anything about the conclusion's truth (Module 09 rule 5); and Module 10 checks the headline verdict against the standards table (Module 10 rule 8).

### L31 — Final audit: a reworded premise, an unlocated fallacy, a fallacy that disappeared

The reconstruction turned the arguer's "most studies" into "all studies"; the synthesis reports "a straw man" without saying where; and a false dilemma CONFIRMED in Module 04 is absent from the synthesis.

Pass condition: Module 10 catches all three — the premise reworded in a way that changes the argument (Module 10 rule 1), the fallacy finding that names only its type (Module 10 rule 3), and the CONFIRMED fallacy missing from the written synthesis (Module 10 rule 4) — and does not pass the draft while any stands.

## Coverage

The module rules each test exercises, added 2026-09-28 (TESTS F14; before it the tests' own text carried 16 distinct citations of a numbered module rule, 4 before suite revision 3; L21–L31 were added the same day for the rules no test reached):

- L01: Module 02 rule 1, Module 02 rule 2, Module 02 rule 10, Module 08 rule 3.
- L02: Module 05 rule 3, Module 05 rule 4, Module 05 rule 5, Module 05 rule 7, Module 02 rule 9, Module 09 rule 7, Module 10 rule 10.
- L03: Module 04 rule 3, Module 04 rule 4, Module 04 rule 5, Module 04 rule 7, Module 03 rule 1, Module 10 rule 6.
- L04: Module 01 rule 4, Module 10 rule 2.
- L05: Module 01 rule 3, Module 05 rule 1, Module 05 rule 2, Module 03 rule 1.
- L06: Module 04 rule 1, Module 04 rule 2, Module 04 rule 6, Module 08 rule 1, Module 08 rule 2.
- L07: Module 04 rule 2, Module 09 rule 6.
- L08: Module 04 rule 1, Module 04 rule 2.
- L09: Module 04 rule 2, Module 06 rule 2.
- L10: Module 02 rule 5, Module 08 rule 3, Module 08 rule 5.
- L11: Module 04 rule 4, Module 02 rule 4.
- L12: Module 04 rule 1.
- L13: Module 09 rule 4, Module 03 rule 6.
- L14: Module 07 rule 1, Module 07 rule 2, Module 07 rule 3, Module 07 rule 4, Module 10 rule 7.
- L15: Module 07 rule 1, Module 07 rule 2, Module 07 rule 3.
- L16: Module 09 rule 4, Module 10 rule 9.
- L17: Module 04 rule 4, Module 04 rule 5, Module 03 rule 1.
- L18: Module 03 rule 1, Module 09 rule 3, Module 10 rule 5.
- L19: Module 03 rule 1, Module 03 rule 6, Module 09 rule 4, Module 10 rule 9.
- L20: Module 03 rule 1, Module 03 rule 2.
- L21: Module 01 rule 1, Module 01 rule 7.
- L22: Module 01 rule 2, Module 01 rule 5, Module 01 rule 6, Module 02 rule 6, Module 02 rule 7.
- L23: Module 02 rule 3, Module 02 rule 8.
- L24: Module 03 rule 3, Module 03 rule 4, Module 03 rule 5.
- L25: Module 04 rule 7, Module 04 rule 8.
- L26: Module 05 rule 6.
- L27: Module 06 rule 1, Module 06 rule 3, Module 06 rule 4, Module 06 rule 5.
- L28: Module 07 rule 5, Module 07 rule 6.
- L29: Module 08 rule 4.
- L30: Module 09 rule 1, Module 09 rule 2, Module 09 rule 5, Module 09 rule 8, Module 10 rule 8.
- L31: Module 10 rule 1, Module 10 rule 3, Module 10 rule 4.

The suite names 72 of the 73 numbered rules (`grep -oE 'Module [0-9]{2} rule [0-9]+' EVALUATION/ADVERSARIAL_TEST_SUITE.md | sort -u | wc -l`; `cat PROMPT_MODULES/*.md | grep -cE '^[0-9]+\. '` → 73); Module 03's rule 7, added 2026-10-03 (DIR-0041), is the one no test names. These citations are a map of what each test reaches, not a claim that the rule is fully tested; a pass on this suite says nothing about a rule no line above names.

## Regression gate

A production logic-audit prompt must pass L01, L02, L03, L04, L06, L08, L09, L12, L13, L14, L15, L16, L17, L18, L19, and L20 with no blocking defect before adoption. L05, L07, L10, and L11 should be run whenever the task's stakes or visibility warrant the fuller pass. L21 through L31 (added 2026-09-28) should be run on the same condition.
