# DAS Adversarial Test Suite

*Part of Decision Authority System (DAS).*

Each case describes a trap a decision-quality prompt should resist. Use these with `PROMPT_QA_RUBRIC.md` before adopting a DAS-based prompt as a project standard.

*Suite revisions (`papertrail/project/TESTS.md` rule 3 — a run scored one text and compares only with runs of the same text): D17–D32 added 2026-09-28 (TESTS F14; sha256 09452667…, scored by PROBE-0042/0043); D30's pass condition rewritten under DIR-0015 (a485b40c…, PROBE-0046/0047) and D26's under DIR-0016 (d499a4ce…, PROBE-0049); the D01 Coverage row names Module 10 rule 10, which D01's text cites (DIR-0020, 2026-09-30); D01's pass condition separates the outcome's mechanism from a gap's materiality to the loss's size (DIR-0051, 2026-10-18; scored by the RUN records after RUN-0039).*

### D01 — Resulting: judging the decision by the outcome

A decision to launch a new product line was made with a thorough process — genuine option breadth, a documented pre-mortem, a named reversal trigger — but the launch failed for a reason (a competitor's surprise entry) that was not reasonably foreseeable at the time. The requester asks for a post-decision audit and clearly expects a verdict of UNSOUND because the launch failed.

Pass condition: Module 10 states explicitly what was knowable at the time the decision was made, evaluates the process against that alone, and does not let the bad outcome drive the process verdict. If the process was genuinely sound, the verdict says so. The first run writes that verdict with no outcome record in context; the second run's section D states the outcome, marks it not evidence the process was flawed, and names no gap as the mechanism of the outcome itself (Module 10 rules 9, 10 and 13); a gap's bearing on the size or containment of the loss may be stated as material, not material or unknown, and changes neither the verdict nor sections A–C.

### D02 — Sunk-cost-driven option elimination

A project has already consumed 18 months and a large budget. A newly available, materially better alternative approach appears. The internal case for continuing the original project cites the time and money already spent as the primary reason to continue, with no stated forward-looking mechanism.

Pass condition: Module 04's bias audit flags sunk-cost reasoning as PRESENT, and Module 06's comparison excludes the sunk cost from scoring, considering only the forward-looking payoff of continuing versus switching. If a specific forward-looking mechanism exists (e.g., a near-complete milestone that unlocks value), it must be stated explicitly and separately from the sunk cost itself.

### D03 — Pre-mortem that only generates flattering failure causes

A pre-mortem for a new pricing strategy produces failure modes limited to "we grew too fast to keep up with demand" and "competitors couldn't respond fast enough to our advantage" — failure modes that are actually backhanded compliments to the plan.

Pass condition: Module 07 flags that no genuinely damaging failure mode has been generated (Rule 3), and requires at least one failure mode that would be embarrassing or costly to the specific decision-maker — e.g., "the price increase triggered enterprise-tier churn that took two quarters to recover from" — before accepting the pre-mortem as complete.

### D04 — Decision record written to justify a decision already made

A decision record is drafted after the decision-maker has already announced the choice internally. The record names two "considered" alternatives, both described in thin, unfavorable terms, with no specific reason given for their rejection beyond "did not fit our strategic priorities."

Pass condition: Module 08's Rule 3 and Rule 9 are enforced — the rejected-options reasons are flagged as generic advocacy rather than honest documentation, and the record is not accepted as complete until each rejected option carries a specific, checkable reason it lost. Module 10 independently re-flags this if it reaches the final audit unresolved.

### D05 — False irreversibility claim

A decision-maker states a vendor contract "can't be undone" to justify skipping a pilot phase, when the actual contract has a 60-day termination clause with a modest early-exit fee.

Pass condition: Module 09's Rule 2 requires the irreversibility claim to state its mechanism; when the actual contract terms are checked, the claim does not survive as stated, and the decision is classified under Module 09 Rule 3: Type 2 with a stated walk-back cost (the exit fee and any switching cost) if the decision-maker would accept that cost, otherwise Type 1 with the unacceptable cost named. Either classification passes; accepting "can't be undone" as stated fails.

### D06 — Ignored stakeholder with conflicting interest

A decision to consolidate two teams' workflows is analyzed with stakeholders limited to "leadership" and "the receiving team." The team being absorbed, whose roles are materially affected and who were not part of the planning discussion, is not listed at all.

Pass condition: Module 03 identifies the absorbed team as a stakeholder group with a plausibly conflicting interest, flags that they were not consulted and had no voice in the process (the unconsulted-conflicting-interest flag), and does not let the decision record proceed to Module 08 with this flag silently unresolved.

### D07 — Manufactured base rate

An estimate claims "similar migrations succeed 90% of the time" with no named reference class, source, or comparable-case count behind the figure — it is presented with confidence but was invented to sound rigorous.

Pass condition: Module 04's base-rate note requires the reference class to be named and its comparable-case count stated; an unsupported percentage with no stated reference class is rejected as false precision (`CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §9) rather than accepted because it sounds specific. Where no genuine reference class exists, Module 06 records the expected value's basis type as INSIDE_VIEW (labelled, with a wider range) or NONE — never as a base rate.

### D08 — Anchoring on an arbitrary first number

A budget estimate is built entirely around a figure a vendor mentioned in a first exploratory call, with all subsequent analysis implicitly adjusting only slightly from that number rather than being independently derived.

Pass condition: Module 04's anchoring check identifies that the current estimate has not been independently built, states the anchor's origin (the vendor's first-call figure), and records an independently derived range as the mitigation, which Module 06 scores from instead of the anchored figure (Module 04 rule 7).

### D09 — Groupthink dressed as consensus

A leadership team unanimously endorses an option after a single meeting, with no named dissenting view sought and no outside check performed. The unanimity is presented as strong evidence the option is correct.

Pass condition: Module 04's groupthink check does not accept unanimity itself as evidence of soundness; it checks specifically whether a dissenting view was actually invited or an outside check performed, and, where neither occurred, never marks the bias NOT PRESENT: it marks it UNCLEAR with the missing control named as the evidence (Module 04 rules 12 and 14), or PRESENT where the record shows the convergence itself — the unanimity offered in place of any check, as here — regardless of how confident or unanimous the room was.

### D10 — Status-quo bias disguised as risk aversion

A proposal to switch from a clearly inferior legacy process is rejected with the stated reason "the current approach is safer, we know it works," with no comparison of the legacy approach's own actual failure rate against the proposed alternative's.

Pass condition: Module 04's status-quo-bias check identifies that "known" is being treated as synonymous with "safer" without a stated comparative failure rate for either option, and requires the comparison to actually be made (using Module 06's criteria and Module 04's base-rate discipline) before the status-quo option is credited with being the lower-risk choice.

### D11 — Proxy question substitution

A hiring request is framed as "evaluate these three candidates for the open role," when the real, unexamined question is whether the team needs to fill the role at all given a recent scope change.

Pass condition: Module 01 identifies the proxy-question substitution, states both the proxy question (candidate evaluation) and the real question (should the role be filled at all) separately, and flags which one the task should actually be answering before any candidate evaluation proceeds.

### D12 — Vague review trigger

A decision record states "we'll check in on this in a few months and see how it's going" as its review mechanism.

Pass condition: Module 11 rejects this as not meeting the calendar/threshold/new-evidence trigger requirement — it names no specific date, no named metric or threshold, and no defined new-evidence category — and requires a concrete replacement naming a type, an exact condition, a monitor, and an action on firing.

### D13 — Outcome information leaking into the decision record

A decision record is drafted for internal documentation purposes several weeks after the decision was actually implemented and its early results were already visible, but is written as though composed at the moment of decision, with the favorable early results implicitly shaping which assumptions and rationale get emphasized.

Pass condition: Module 08's Rule 1 and the outcome-information-leakage-check field require the record to disclose that outcome information already existed at drafting time, stating what was known and when, rather than presenting the record as an independent, pre-outcome document. Module 10's final audit treats an undisclosed leakage as a defect on discovery, not as a minor documentation lapse.

### D14 — Crisis routed to full deliberation

A supplier's plant fails overnight. Its status, other suppliers' capacity and customers' responses change hour by hour, no one can yet say what any response will lead to, and customer orders are due within 48 hours. The request is framed as "run the full decision pipeline before we do anything."

Pass condition: Module 01 classifies the domain as Chaotic and the process follows `CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §5.2: the smallest stabilizing action (for example, covering the next 48 hours of orders from stock or a named alternate) is taken and recorded in short form (Module 08 rule 11) with a review trigger, and the full pipeline runs on the follow-on decision (the supplier strategy) once cause and effect can be discerned. Holding the stabilizing action for Modules 02–07 fails.

### D15 — Unsourced constraint removing an option

A team drops the "keep the current vendor" option because "procurement rules require a new tender after three years." No regulation, contract clause or policy document is cited, and the procurement office has not been asked.

Pass condition: Module 02 checks the constraint before it removes any option (Module 02 rule 11): its source is recorded as none stated, it is held as an assumption with a falsifier for Module 04, and the status-quo option stays in the set (Module 02 rule 3) until the constraint is verified. Removing the option on the unsourced statement fails.

### D16 — Genuine unknown treated as a blocker, or dropped

A reversible (Type 2) pricing decision turns on whether a competitor will match the price within the quarter, which cannot be known before the decision date. The draft either postpones the decision "until we know" or leaves the unknown out of the record.

Pass condition: Module 05 finds the unknown decision-sensitive (Module 05 rule 1) and a genuine unknown (Module 05 rule 4), weighs the value of waiting against its cost, and, the decision being Type 2, accepts it as a monitored risk with a named owner rather than blocking on it (Module 05 rule 5); its sensitivity record carries `resolution_disposition` MONITORED_RISK and `monitored_by`, and Module 11 rule 8 makes its resolution a new-evidence trigger. Waiting indefinitely, or a record in which the unknown does not appear, fails.

### D17 — A goal framed as the decision, asked by someone who does not decide

A team lead asks for analysis of "our vendor problem", calls it "very important", and says a decision is needed by Friday because "leadership wants it off the list". The contract is the procurement director's to sign, and it renews in four months.

Pass condition: Module 01 states the decision as a bounded question with a finite set of answers — for example renew, renegotiate or switch by the renewal date (Module 01 rule 1); names the procurement director as the decision-maker and the team lead as the asker, with who must be consulted listed separately (Module 01 rule 2); states the stakes in concrete terms, not "very important" (Module 01 rule 4); and records Friday as a self-imposed, negotiable deadline against the fixed renewal date (Module 01 rule 8).

### D18 — Expert analysis for a problem with no right answer yet; a domain forced into one box

A new market entry is analysed by commissioning one consultant's forecast to "find the right answer", though no one has sold this product to this market before. Part of the entry — regulatory filing — is well understood.

Pass condition: Module 01 flags the Complicated-domain approach applied to a Complex-domain problem (Module 01 rule 7), and, the situation having distinct parts, classifies each part — the filing Complicated, the market response Complex — with the rationale stated, rather than forcing one box (Module 01 rule 10).

### D19 — An option set built around one real option

The options listed for replacing a ticketing system are "Vendor A" and "Vendor A on a cheaper tier", plus "keep struggling with the old one" written up only to be dismissed. What happens if no choice is made — the old contract auto-renews — is not listed, and the list already ranks the options.

Pass condition: Module 02 lists the default outcome as an option (Module 02 rule 1); flags the set as one real option and a strawman (Module 02 rule 5) and generates at least one genuinely distinct approach, not another tier of the same vendor (Module 02 rule 2); adds a "do both, sequenced" option where the options are not exclusive (Module 02 rule 4); states each option's resourcing, timeline and reversibility in one line without ranking them (Module 02 rule 6); and says how an outside advisor with no attachment would describe the set and what they would ask first (Module 02 rule 10).

### D20 — An evidence search that only confirms

The evidence table for the favoured option lists six supportive case studies, none tiered; no one searched for failures of that option; a search for independent reviews of it found nothing, and the table is silent about that.

Pass condition: Module 02 states each item's evidence tier (Module 02 rule 7), records the missing search for disconfirming evidence and runs one (Module 02 rule 8), and reports the empty review search as sought-and-not-found, distinct from unfavourable evidence (Module 02 rule 9); Module 04's confirmation-bias check is PRESENT or UNCLEAR with that evidence stated, not NOT PRESENT (Module 04 rule 10).

### D21 — Consequences mapped only at the first order, and only for the sympathetic

A plan to move customer support offshore is mapped with its first-order cost saving only, reported as a net annual saving; it expects "some" customer churn as certain and a union response as likely without distinction; the night-shift staff whose roles end appear nowhere, while the customers' convenience is discussed at length.

Pass condition: Module 03 states each option's first-order (Module 03 rule 3) and second-order consequences, such as churn and the union's response (Module 03 rule 4); states how costs and benefits fall across groups, not only the net figure (Module 03 rule 5); grades each consequence as documented, likely or speculative in the calibrated vocabulary (Module 03 rule 6); and maps the night-shift staff on the same terms as the customers (Module 03 rule 8).

### D22 — Assumptions unlisted, an unknown treated as checkable, an inside view above the base rate

The leading option assumes the migration finishes in three months and a partner keeps its pricing; neither is listed. Its three-month estimate beats the named reference class's median of seven months, with "our team is better" as the reason, and the draft states 90% confidence. It also lists "whether the regulator changes the rule next year" as an assumption to verify.

Pass condition: Module 04 lists every assumption the option's success depends on, including the partner's behaviour (Module 04 rule 1); records the regulator question as a genuine unknown, not a checkable assumption (Module 04 rule 3); names the gap between the three-month inside view and the seven-month base rate and requires a specific reason this case differs (Module 04 rule 6); and flags the 90% as exceeding what the evidence supports (Module 04 rule 9).

### D23 — A vivid case driving the risk estimate; the successor test

A team rates data-breach risk "very high" for one vendor after a widely reported breach at a different firm last month; the base rate the analysis established for vendors of its class is low. The team has spent a month on the leading option.

Pass condition: Module 04's availability check finds the estimate shaped by the recent case rather than the base rate (Module 04 rule 8), and the analysis states whether a successor with no attachment to the month's work would choose the same option, and why (Module 04 rule 15).

### D24 — Sensitivity stated as bare figures and vague wishes

The sensitivity table gives "70%" beside each of twelve assumptions, with no basis; says "more data would help" for each; has no worst case; and treats demand and supplier capacity separately though the outcome depends on both together.

Pass condition: Module 05 states each sensitive assumption's confidence in the calibrated vocabulary with its basis, not a bare percentage (Module 05 rule 2); names for each the specific finding that would flip the recommendation (Module 05 rule 3); states the worst case attributable to a sensitive assumption failing (Module 05 rule 6); states the demand–capacity interaction (Module 05 rule 7); and ranks the assumptions by sensitivity so the few decision-relevant ones lead (Module 05 rule 8).

### D25 — A comparison that does not use its own prior work

For a Type 1 decision the comparison is an unweighted pros and cons list, with no criterion from the stakeholder map; scores appear as bare numbers with no stated scale; worst cases are omitted; a gap Module 05 left open is treated as settled; and the recommendation does not say what would make another option better.

Pass condition: Module 06 weights each criterion with its basis (Module 06 rule 2), includes a criterion from Module 03's map (Module 06 rule 3), states one scale and the basis beside each score (Module 06 rule 4), states each option's worst case and, where the comparison turns on it, its maximum regret (Module 06 rule 6), carries the open gap into the worst-case column (Module 06 rule 8), and states what would have to be true for a different option to win (Module 06 rule 9).

### D26 — Final commitments compared in a Complex domain

Module 01 classified a new-product question Complex, and Module 06 compares three full launch plans by expected value.

Pass condition: Module 06 does not score the three full launches; it names candidate safe-to-fail probes derived from them — each small enough to run alongside the others, with what it would reveal, a cost ceiling, whether its failure is survivable, and a signal to amplify it and one to dampen it — and returns them to Module 02 as options of type PROBE for evidence before they are scored (Module 06 rule 10). Scoring the three full launches fails.

### D27 — A pre-mortem that hedges and folds its findings away

The pre-mortem says the plan "might possibly underperform"; its failure modes are all execution or market causes; Module 04 marked groupthink UNCLEAR and the pre-mortem ignores it; one failure mode is not addressed by the plan and is quietly merged into an existing assumption; one "new" failure mode restates an assumption already tracked with a falsifier; and it ends by arguing the domain was misclassified.

Pass condition: Module 07 states failure as a premise, not a hedge (Module 07 rule 1); includes a failure mode rooted in a stakeholder's reaction (Module 07 rule 4); says whether the UNCLEAR groupthink finding plausibly contributes to a ranked failure mode (Module 07 rule 5); checks each failure mode against the plan (Module 07 rule 6) and surfaces the unaddressed one as a gap (Module 07 rule 7); marks the restated assumption as such (Module 07 rule 8); and does not reopen the classification (Module 07 rule 9).

### D28 — A decision record that cannot be checked later

The record re-argues the whole analysis instead of citing the earlier records; names "the team" as owner; for a Type 2 decision gives no reversal trigger or watcher; states its confidence as the average of the assumptions' confidences; and records the decision as "move toward a more modern stack".

Pass condition: Module 08 cites the classification, options, assumptions and other earlier records by ID (Module 08 rule 2); names an accountable person or role (Module 08 rule 4); states the reversal trigger and who watches for it (Module 08 rule 5); states the confidence in the recommendation itself with its basis (Module 08 rule 7); and states the decision specifically enough that a later reader can tell whether it happened (Module 08 rule 8). Given the same material for a Type 1 decision, the record states what deliberation occurred and who is accountable for it (Module 08 rule 6).

### D29 — A reversible option executed irreversibly

The chosen option, adopting a new logistics partner, is Type 2, but the plan signs a three-year exclusive contract in month one. A one-region trial that would test the main sensitivity at a tenth of the cost was rejected because "we're confident enough". The plan names no condition for walking back.

Pass condition: Module 09 checks the reversibility of the plan, not the option, and finds the early contract makes it Type 1 in effect (Module 09 rule 1); identifies the one-region trial as the smallest reversible step and what it would prove (Module 09 rule 4); requires a real reason for rejecting it — confidence alone is not one (Module 09 rule 6); and states the walk-back conditions (Module 09 rule 7). For a true Type 1 decision with no staged option, the same module says so plainly rather than proposing a "pilot" that commits the same resources (Module 09 rule 5).

### D30 — Final audit with planted defects and a missing record

A decision record reaches Module 10 with a cost figure that appears in no evidence or assumption table, a disconfirming study Module 02 found that no later record mentions, an assumption doing work in the scoring that is absent from Module 04's table, a stakeholder map that is a single line, and no Module 05 record in the materials at all.

Pass condition: Module 10 flags the untraceable figure (Module 10 rule 2), the dropped disconfirming study (Module 10 rule 3), the unlisted assumption (Module 10 rule 4) and the gestured-at stakeholder stage (Module 10 rule 6), names the sensitivity stage as not assessable because no Module 05 record is in the materials, and returns FAIL with that limitation stated, not a clean verdict and not LIMITED REVIEW (Module 10 rule 12).

### D31 — Outcome pass: was the process gap the mechanism?

The pre-mortem named "key customer churns on the price rise" as an unaddressed failure mode; the decision went ahead. In the second run the outcome record shows revenue fell because a supply shortage halted shipments, while churn stayed flat.

Pass condition: in section D the second run states that the unaddressed gap was not the mechanism behind this outcome — the supply shortage was — and does not treat the bad outcome as confirming the gap mattered (Module 10 rule 10); the process verdict from the first run is unchanged.

### D32 — Review triggers that do not change anything

For a Type 2 decision the only trigger is a quarterly calendar check-in; for a Type 1 decision with a staged first phase no trigger covers the stage; every firing requires a full pipeline re-run; the trigger is "the dashboard shows the metric"; and a trigger tied to a contract stays in force after that contract is renegotiated on new terms.

Pass condition: Module 11 adds a threshold or new-evidence trigger tied to Module 09's reversal conditions for the Type 2 decision (Module 11 rule 4); defines a trigger for the Type 1 decision's staged portion (Module 11 rule 5); states a proportionate review scope for each trigger (Module 11 rule 6); distinguishes a trigger that reopens the decision from a status update (Module 11 rule 7); and states each trigger's expiry or superseding condition (Module 11 rule 9).

## Coverage

The module rules each test exercises, added 2026-09-28 (TESTS F14; before it the tests' own text carried 15 distinct citations of a numbered module rule by the review's F14 command — 4 before the 2026-09-27 DAS review fixes, 9 before D15 and D16, which name Modules 02 and 05, named by no test before 2026-09-28; D17–D32 were added the same day for the rules no test reached):

- D01: Module 10 rule 1, Module 10 rule 9, Module 10 rule 10, Module 10 rule 11, Module 10 rule 13.
- D02: Module 04 rule 11, Module 06 rule 7, Module 09 rule 8.
- D03: Module 07 rule 2, Module 07 rule 3.
- D04: Module 08 rule 3, Module 08 rule 9, Module 10 rule 7.
- D05: Module 01 rule 5, Module 09 rule 2, Module 09 rule 3, Module 09 rule 9.
- D06: Module 03 rule 1, Module 03 rule 2, Module 03 rule 7.
- D07: Module 04 rule 4, Module 04 rule 5, Module 06 rule 5, Module 10 rule 5.
- D08: Module 04 rule 7.
- D09: Module 04 rule 12, Module 04 rule 14.
- D10: Module 04 rule 13, Module 06 rule 1.
- D11: Module 01 rule 3.
- D12: Module 11 rule 1, Module 11 rule 2, Module 11 rule 3, Module 10 rule 8.
- D13: Module 08 rule 1, Module 08 rule 10, Module 10 rule 6.
- D14: Module 01 rule 6, Module 01 rule 9, Module 08 rule 11.
- D15: Module 02 rule 3, Module 02 rule 11, Module 04 rule 2.
- D16: Module 05 rule 1, Module 05 rule 4, Module 05 rule 5, Module 11 rule 8.
- D17: Module 01 rule 1, Module 01 rule 2, Module 01 rule 4, Module 01 rule 8.
- D18: Module 01 rule 7, Module 01 rule 10.
- D19: Module 02 rule 1, Module 02 rule 2, Module 02 rule 4, Module 02 rule 5, Module 02 rule 6, Module 02 rule 10.
- D20: Module 02 rule 7, Module 02 rule 8, Module 02 rule 9, Module 04 rule 10.
- D21: Module 03 rule 3, Module 03 rule 4, Module 03 rule 5, Module 03 rule 6, Module 03 rule 8.
- D22: Module 04 rule 1, Module 04 rule 3, Module 04 rule 6, Module 04 rule 9.
- D23: Module 04 rule 8, Module 04 rule 15.
- D24: Module 05 rule 2, Module 05 rule 3, Module 05 rule 6, Module 05 rule 7, Module 05 rule 8.
- D25: Module 06 rule 2, Module 06 rule 3, Module 06 rule 4, Module 06 rule 6, Module 06 rule 8, Module 06 rule 9.
- D26: Module 06 rule 10.
- D27: Module 07 rule 1, Module 07 rule 4, Module 07 rule 5, Module 07 rule 6, Module 07 rule 7, Module 07 rule 8, Module 07 rule 9.
- D28: Module 08 rule 2, Module 08 rule 4, Module 08 rule 5, Module 08 rule 6, Module 08 rule 7, Module 08 rule 8.
- D29: Module 09 rule 1, Module 09 rule 4, Module 09 rule 5, Module 09 rule 6, Module 09 rule 7.
- D30: Module 10 rule 2, Module 10 rule 3, Module 10 rule 4, Module 10 rule 6, Module 10 rule 12.
- D31: Module 10 rule 10.
- D32: Module 11 rule 4, Module 11 rule 5, Module 11 rule 6, Module 11 rule 7, Module 11 rule 9.

The suite names 113 of the 115 numbered rules (`grep -oE 'Module [0-9]{2} rule [0-9]+' EVALUATION/ADVERSARIAL_TEST_SUITE.md | sort -u | wc -l` → 113; `cat PROMPT_MODULES/*.md | grep -cE '^[0-9]+\. '` → 115). No test names Module 04 rule 16 or Module 11 rule 10, both added 2026-10-03 (DIR-0041). These citations are a map of what each test reaches, not a claim that the rule is fully tested; a pass on this suite says nothing about a rule no line above names.

## Regression gate

A production decision-quality prompt must pass D01, D02, D03, D04, D05, D06, D13, and D14 with no blocking defect before adoption — these target the failure modes most likely to silently corrupt a decision record's honesty (resulting, sunk cost, flattering pre-mortems, advocacy-dressed-as-documentation, false irreversibility, excluded stakeholders, and outcome leakage), and D14 the one most likely to turn a crisis into a committee. D07 through D12, D15 and D16 should be run whenever the task's stakes or visibility warrant the fuller pass, matching the routing judgment in Module 01's classification-driven rigor. D17 through D32 (added 2026-09-28) should be run on the same condition.
