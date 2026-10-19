# Output Schemas

*Part of Decision Authority System (DAS).*

These schemas provide stable fields for validation, mirroring the role TAS's `EVALUATION/OUTPUT_SCHEMAS.md` plays for evidence records. Projects may add fields but should not silently change field meaning. DAS's records describe decisions, not evidence claims — where TAS's Claim record binds a claim to the evidence that warrants it, DAS's Assumption record binds an assumption to the falsifier that would disprove it. The two play the same structural role (nothing here is trusted until it states what would overturn it) but the fields are not interchangeable: an assumption is not a claim about the past, it is a stated bet on the future, so it also carries a reference class and base rate that a TAS claim record has no equivalent for.

## Framing record

```json
{
  "decision_id": "DEC-0001",
  "decision_statement": "",
  "proxy_question": null,
  "decision_maker": "",
  "required_consultation": [],
  "stakes": "",
  "reversibility_type": "TYPE_1",
  "reversibility_rationale": "",
  "problem_domain": "COMPLICATED",
  "domain_rationale": "",
  "domain_parts": [],
  "deadline": "YYYY-MM-DD or null",
  "deadline_type": "FIXED",
  "recommended_process": "",
  "process_mismatch_flag": null,
  "ambiguity_flag": null,
  "framed_at": "YYYY-MM-DD"
}
```

`reversibility_type` is `TYPE_1` (one-way door) or `TYPE_2` (two-way door). `problem_domain` is `SIMPLE`, `COMPLICATED`, `COMPLEX`, `CHAOTIC`, or `DISORDER` (Cynefin; `DISORDER` when it is unclear which of the other four applies, with the live possibilities in `domain_rationale`). `domain_parts` lists `{"part": "", "problem_domain": "", "rationale": ""}` when the situation has distinct parts (Module 01 rule 10); `problem_domain` then holds the domain of the part the decision turns on, which routes the pipeline, and stays `DISORDER` only while no part can be classified. `deadline_type` is `FIXED` or `NEGOTIABLE`. `process_mismatch_flag` is set when the process actually proposed does not match what the classification implies; leave `null` when no mismatch exists. Produced by Module 01 and referenced, not repeated, by every later record for the same decision.

## Option record

```json
{
  "option_id": "OPT-0001",
  "decision_id": "DEC-0001",
  "option": "",
  "status": "NEWLY_GENERATED",
  "option_type": "ALTERNATIVE",
  "resourcing_and_timeline": "",
  "reversibility_note": null,
  "limitations": []
}
```

`status` is `EXISTING` or `NEWLY_GENERATED`. `option_type` is `DEFAULT`, `STATUS_QUO`, `SEQUENCED`, `ALTERNATIVE`, or `PROBE` (a safe-to-fail probe in a Complex-domain decision, Module 06 rule 10). An option record carries no score or ranking — that belongs to the criterion-score record, produced later, once Modules 03–05 have run against the surviving options.

## Evidence/precedent record

```json
{
  "evidence_id": "DSE-0001",
  "decision_id": "DEC-0001",
  "option_id": "OPT-0001",
  "evidence_or_precedent": "",
  "tier": "DAS:B",
  "upstream_tier": null,
  "comparability_note": "",
  "direction": "FAVORS",
  "independence": "INDEPENDENT",
  "limitations": []
}
```

`tier` is `DAS:A` through `DAS:F` per `CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md` §3, written with its scale so a DAS tier is never read as a TAS or RAS one. `upstream_tier` holds the tier a cited TAS or RAS finding carries in its own system, written the same way (`TAS:A`, `RAS:3`), and is `null` when the record cites no upstream finding (Policy §8); it is never copied into `tier`, and neither scale is converted into the other. `direction` is `FAVORS`, `DISFAVORS`, or `MIXED`. `independence` is `INDEPENDENT`, `SAME_DECISION_MAKER`, or `MOTIVATED_PARTY` — a record with `independence: MOTIVATED_PARTY` is tiered `DAS:F` (vendor case studies, motivated-party testimonials: context only, never load-bearing, `CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md` §3) regardless of how it is presented. A record with `independence: SAME_DECISION_MAKER` is tiered `DAS:E` unless a documented process and outcome record exists; even then it is not independent corroboration of the decision-maker's own view.

## Constraint record

```json
{
  "constraint_id": "CST-0001",
  "decision_id": "DEC-0001",
  "constraint": "",
  "source": null,
  "tier": null,
  "options_removed": [],
  "status": "VERIFIED",
  "assumption_id": null
}
```

Produced by Module 02 output E. `source` is `null` when none was stated, and `tier` is `DAS:A`–`DAS:F` per `CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md` §3. `status` is `VERIFIED` or `HELD_AS_ASSUMPTION` (then `assumption_id` names the Module 04 record). An unsourced constraint removes no option (Module 02 rule 11): its `options_removed` stays empty.

## Stakeholder record

```json
{
  "stakeholder_id": "STK-0001",
  "decision_id": "DEC-0001",
  "stakeholder_group": "",
  "consulted": false,
  "interest": "CONFLICTING",
  "voice_in_process": "NONE",
  "limitations": []
}
```

`interest` is `ALIGNED`, `CONFLICTING`, or `MIXED`, relative to the decision-maker's own interest. `voice_in_process` is `DIRECT`, `INDIRECT`, or `NONE`. A record with `interest: CONFLICTING` and `voice_in_process: NONE` must be surfaced explicitly in Module 03's unconsulted-conflicting-interest flag, not merely listed.

## Consequence record

```json
{
  "consequence_id": "CNS-0001",
  "decision_id": "DEC-0001",
  "option_id": "OPT-0001",
  "stakeholder_id": "STK-0001",
  "order": "FIRST",
  "consequence": "",
  "distributional_note": null,
  "confidence": "LIKELY",
  "limitations": []
}
```

`order` is `FIRST` or `SECOND`. `confidence` uses the calibrated terms from `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` (`ALMOST_CERTAIN`, `VERY_LIKELY`, `LIKELY`, `ROUGHLY_EVEN_CHANCE`, `UNLIKELY`, `VERY_UNLIKELY`, `ALMOST_NO_CHANCE`); a record written before 2026-10-03 carries one of the five it then had (Rule 3).

## Assumption record

```json
{
  "assumption_id": "ASM-0001",
  "decision_id": "DEC-0001",
  "option_id": "OPT-0001",
  "assumption": "",
  "type": "ASSUMPTION",
  "falsifier": null,
  "evidence_obtainable_before_decision": null,
  "reference_class_used": null,
  "base_rate": null,
  "inside_view_estimate": null,
  "divergence_reason": null,
  "status": "UNTESTED",
  "limitations": []
}
```

`type` is `ASSUMPTION` (unverified but checkable) or `GENUINE_UNKNOWN` (cannot currently be resolved either way). `falsifier` states what evidence would prove the assumption wrong; it is required whenever `type` is `ASSUMPTION` — a record with `type: ASSUMPTION` and `falsifier: null` has not met the standard's assumption-discipline rule and should not be treated as having earned fact status. `status` is `UNTESTED`, `TESTED_HOLDS`, or `TESTED_FAILED`. `reference_class_used` and `base_rate` are `null` when no genuine reference class exists — do not fabricate either field to avoid a null.

## Bias-audit finding record

```json
{
  "finding_id": "BIA-0001",
  "decision_id": "DEC-0001",
  "bias": "ANCHORING",
  "finding": "UNCLEAR",
  "evidence": "",
  "effect_if_present": null,
  "mitigation": null
}
```

`bias` is one of `ANCHORING`, `AVAILABILITY`, `OVERCONFIDENCE`, `CONFIRMATION_BIAS`, `SUNK_COST`, `GROUPTHINK`, `STATUS_QUO_BIAS`, `MOTIVATED_REASONING`, or `OTHER` (state the specific bias in `evidence` when `OTHER` is used). `finding` is `PRESENT`, `NOT_PRESENT`, or `UNCLEAR` — never omitted; a check that wasn't actually performed is `UNCLEAR` with that stated in `evidence`, not `NOT_PRESENT`.

## Uncertainty/sensitivity record

```json
{
  "sensitivity_id": "UNC-0001",
  "decision_id": "DEC-0001",
  "assumption_id": "ASM-0001",
  "sensitivity": "HIGH",
  "confidence": "LIKELY",
  "confidence_basis": "",
  "what_would_change_recommendation": "",
  "resolvable_before_decision": false,
  "resolution_disposition": "MONITORED_RISK",
  "monitored_by": null,
  "limitations": []
}
```

`sensitivity` is `HIGH`, `MEDIUM`, or `LOW` — whether a different answer would plausibly change which option is preferred. `resolvable_before_decision` distinguishes an assumption that could be resolved with reasonable effort from a genuine unknown. `resolution_disposition` is required for every record: `RESOLVED` when the item was resolved before the decision (possible only when `resolvable_before_decision` is `true`), otherwise `MONITORED_RISK` or `DEADLINE_EXTENDED`; a record with no disposition is incomplete. `confidence` takes the seven calibrated terms (see the consequence record). `monitored_by` names the person or role watching a `MONITORED_RISK` (Module 05 output D) and is required for that disposition; Module 11's carry-forward check reads it.

## Criterion-score record

```json
{
  "criterion_id": "CRIT-0001",
  "decision_id": "DEC-0001",
  "criterion": "",
  "weight": null,
  "weight_basis": "",
  "consequence_map_linked": false,
  "scores": {
    "OPT-0001": {"score": null, "basis": ""}
  }
}
```

`weight` and every `score` must carry a `*_basis` string — an unbased number here is the false precision the standard forbids. `consequence_map_linked` records whether at least one criterion in the full set traces to Module 03's consequence map, required for any Type 1 or Complex-domain decision, and for the follow-on decision of a Chaotic one. A criterion record holds weights and scores only; expected value, worst case and regret are per option, in the comparison record.

## Comparison record

```json
{
  "comparison_id": "CMP-0001",
  "decision_id": "DEC-0001",
  "criterion_ids": ["CRIT-0001"],
  "score_scale": "",
  "options": {
    "OPT-0001": {
      "weighted_total": null,
      "weighted_total_basis": "",
      "expected_value": {"range": null, "basis_type": "REFERENCE_CLASS", "basis": ""},
      "worst_case": {"outcome": "", "basis": ""},
      "max_regret": {"value": null, "basis": ""}
    }
  },
  "decision_rule_if_measures_disagree": null,
  "recommended_option_id": "OPT-0001",
  "recommended_probe_ids": [],
  "what_would_make_another_option_better": ""
}
```

One comparison record per decision, produced by Module 06 and referenced by the decision record's `comparison_id`. `score_scale` states the one scale every score is on (Module 06 rule 4); a weighted total over scores on different scales is not a total. For a Complex-domain decision the recommendation is a portfolio: `recommended_option_id` is `null` and `recommended_probe_ids` lists the probe options (`option_type: PROBE`). `basis_type` is `REFERENCE_CLASS` (the expected value traces to the `reference_class_used`/`base_rate` fields of the relevant assumption records), `INSIDE_VIEW` (no genuine reference class exists; it traces to their `inside_view_estimate` fields, is labelled inside-view, and carries a wider range), or `NONE` (no defensible estimate; `range` stays `null` and the comparison rests on the weighted totals and worst cases). A base rate is never manufactured to reach `REFERENCE_CLASS`, and a `null` range with `basis_type: NONE` is not a validation failure. `worst_case` is the option's own lowest plausible outcome; `max_regret` is its largest shortfall, across the plausible states of the world, against the best option in the same state — a different measure, recorded separately, `null` when regret was not used. `decision_rule_if_measures_disagree` names the rule the recommendation follows (for example, highest expected value, maximin, minimax regret) when expected value, worst case and regret favor different options.

## Pre-mortem-finding record

```json
{
  "finding_id": "PMF-0001",
  "decision_id": "DEC-0001",
  "option_id": "OPT-0001",
  "rank": 1,
  "failure_mode": "",
  "source": "EXECUTION",
  "is_damaging_to_decision_maker": false,
  "addressed_by": null,
  "status": "GAP",
  "required_action": null,
  "carry_forward_owner": null
}
```

`failure_mode` is stated as already having happened ("the vendor missed the integration deadline," not "the vendor might miss it"). `source` is `EXECUTION`, `MARKET`, `STAKEHOLDER_REACTION`, `BIAS_LINKED`, or `OTHER`. At least one record per decision must carry `is_damaging_to_decision_maker: true` — a pre-mortem with none is presumptively incomplete under Module 07, Rule 3. `status` is `ADDRESSED` (with `addressed_by` naming the option, assumption, or plan element that covers it) or `GAP`. A `GAP` record must carry either a `required_action` or a `carry_forward_owner`.

## Decision record

```json
{
  "decision_id": "DEC-0001",
  "decision_statement": "",
  "decided_at": "YYYY-MM-DD",
  "owner": "",
  "framing_id": "DEC-0001",
  "option_ids": ["OPT-0001"],
  "rejected_options": [
    {"option_id": "OPT-0002", "reason": ""}
  ],
  "stakeholder_ids": ["STK-0001"],
  "assumption_ids": ["ASM-0001"],
  "bias_audit_ids": ["BIA-0001"],
  "sensitivity_ids": ["UNC-0001"],
  "premortem_ids": ["PMF-0001"],
  "review_trigger_ids": ["TRG-0001"],
  "chosen_option_id": "OPT-0001",
  "chosen_option_basis": "",
  "recommendation_confidence": "LIKELY",
  "recommendation_confidence_basis": "",
  "reversal_trigger": null,
  "reversal_watcher": null,
  "deliberation_and_accountable_party": null,
  "outcome_information_leakage_check": "NONE",
  "record_form": "FULL",
  "follow_on_decision_id": null,
  "comparison_id": "CMP-0001",
  "criterion_ids": ["CRIT-0001"],
  "chosen_probe_ids": [],
  "constraint_ids": [],
  "reversibility_revision_note": null,
  "limitations": []
}
```

`rejected_options` must carry a specific `reason` per option — an empty or generic reason ("didn't fit as well") fails Module 08, Rule 3. Exactly one of `reversal_trigger`/`reversal_watcher` (Type 2) or `deliberation_and_accountable_party` (Type 1) should be populated, matching the `plan_reversibility_type` in the reversibility-check record (Module 09), or the framing record's `reversibility_type` until Module 09 has run; the other pair stays `null`. `outcome_information_leakage_check` is `NONE` or a stated note of what outcome information was already known when this record was written — this record must never contain an outcome field itself. `record_form` is `FULL` or `SHORT`; `SHORT` is only for a Chaotic-domain stabilizing action (Module 08 rule 11), which fills the owner, `review_trigger_ids` and leakage fields and names its `follow_on_decision_id`, leaving the module-record references empty. `recommendation_confidence` takes the seven calibrated terms (see the consequence record). `comparison_id` and `criterion_ids` reference Module 06's records (Module 08 rule 2); `constraint_ids` Module 02's. For a Complex-domain decision `chosen_option_id` is `null` and `chosen_probe_ids` lists the probes chosen (Module 06 rule 10). `reversibility_revision_note` states what Module 09 rule 9 changed in this record and why, `null` when nothing changed. `review_trigger_ids` lists the review-trigger records (Module 11) for this decision — at least one before the record is complete (§18); Module 11 enters them once its records exist, as Module 09 enters `reversibility_revision_note`. `stakeholder_ids`, `assumption_ids`, `bias_audit_ids`, `sensitivity_ids` and `premortem_ids` list the records of Modules 03, 04, 05 and 07 by their own IDs.

## Reversibility-check record

```json
{
  "check_id": "REV-0001",
  "decision_id": "DEC-0001",
  "framing_reversibility": "TYPE_1",
  "plan_reversibility": "DIVERGES",
  "plan_reversibility_type": "TYPE_2",
  "irreversibility_mechanism": null,
  "actual_walk_back_cost": null,
  "smallest_reversible_step": null,
  "step_chosen": false,
  "reason_if_not_chosen": null,
  "walk_back_conditions": [],
  "sunk_cost_on_commitment_flag": null
}
```

`plan_reversibility` is `MATCHES` or `DIVERGES` relative to `framing_reversibility`. `plan_reversibility_type` is `TYPE_1` or `TYPE_2` by the standard's §5.1 test applied to the committed plan (Module 09 rules 3 and 9); where it differs from `framing_reversibility` it supersedes it, and the decision record's reversibility fields are revised to match before Module 10 runs. `irreversibility_mechanism` is required whenever the decision is being treated as Type 1 at execution time — a `null` value here with a Type 1 classification means the irreversibility claim has not survived Module 09's check and must be treated as unverified, per Module 09 Rule 2.

## Review-trigger record

```json
{
  "trigger_id": "TRG-0001",
  "decision_id": "DEC-0001",
  "type": "THRESHOLD",
  "condition": "",
  "monitored_by": "",
  "action_on_firing": "",
  "linked_sensitivity_id": null,
  "linked_walk_back_condition": null,
  "expiration_condition": null
}
```

`type` is `CALENDAR`, `THRESHOLD`, or `NEW_EVIDENCE`. Every decision record must have at least one linked review-trigger record before it is considered complete (`CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §18). A `condition` that cannot be checked by someone other than the original decision-maker without further interpretation fails Module 11, Rule 2.

## Outcome record

```json
{
  "outcome_id": "OUT-0001",
  "decision_id": "DEC-0001",
  "recorded_at": "YYYY-MM-DD",
  "outcome_summary": "",
  "outcome_known_at": "YYYY-MM-DD or null",
  "linked_gap_ids": [],
  "limitations": []
}
```

Module 11 rule 10 writes this record when a review trigger fires or a review date arrives. `linked_gap_ids` references pre-mortem-finding records whose `status` was `GAP` and that the final decision audit later identifies as the mechanism behind this outcome — populated by Module 10, not by whoever writes the outcome itself, to keep the outcome record purely descriptive. This record is intentionally thin: its only job is to exist separately from the decision record, not to carry the process judgment.

## Final-audit finding record

```json
{
  "finding_id": "FDA-0001",
  "decision_id": "DEC-0001",
  "audited_at": "YYYY-MM-DD",
  "reviewer_type": "AI_ASSISTED",
  "fresh_context": true,
  "process_verdict": "PASS_WITH_CORRECTIONS",
  "rule_compliance": [
    {"rule": "NO_INVENTED_FACTS", "compliant": true, "evidence": ""}
  ],
  "module_assessments": [
    {"module": "01", "was_done": true, "gap": null}
  ],
  "gap_materiality": [],
  "outcome_known": false,
  "outcome_pass_separate_context": null,
  "outcome_summary": null,
  "outcome_mechanism_note": null,
  "limitations": []
}
```

`process_verdict` is `PASS`, `PASS_WITH_CORRECTIONS`, `LIMITED_REVIEW`, or `FAIL` — matching the four-value vocabulary TAS uses for a finished deliverable and RAS/LAS reuse for the same reason (`EVALUATION/PROMPT_QA_RUBRIC.md`). `LIMITED_REVIEW` is required, not optional, when a scope or record-availability limitation prevents assessing one or more modules and no defect warranting `FAIL` was found in the modules that could be assessed — never issue `PASS` in that situation; a defect that warrants `FAIL` is `FAIL`, with the limitation stated (Module 10 rule 12, DIR-0015). `fresh_context` records whether this audit ran independent of whoever produced the original decision record; a `false` value is itself a limitation to state, not a detail to omit. `reviewer_type` is `AUTOMATED`, `AI_ASSISTED`, `HUMAN`, or `LEGAL_COUNSEL` (TAS's audit-finding vocabulary); it and `fresh_context` are written from Module 10 output E. `rule_compliance` holds one entry per row of Module 10 output B, and `rule` is `NO_INVENTED_FACTS`, `NO_DROPPED_CONTRADICTORY_EVIDENCE`, `NO_UNSTATED_ASSUMPTIONS`, or `CALIBRATED_LANGUAGE` (Module 10 rules 2–5). `gap_materiality` is written by the second run only (Module 10 output D): one entry per module with a gap, `{"module": "07", "material_to_outcome": "YES"}`, where `material_to_outcome` is `YES`, `NO`, or `UNKNOWN`; it stays empty when no outcome exists. `outcome_mechanism_note` is populated only when a specific gap is confirmed or ruled out as the actual mechanism behind a known outcome. `outcome_pass_separate_context` is `true` when the outcome fields were written by a second run given the saved process verdict (Module 10 rule 13), `false` when the outcome record was in context while the verdict was written — a limitation to state — and `null` when no outcome exists.

## Null and uncertainty rules

- Use `null` when a field is absent or unknown; do not use an empty string to conceal unknown data.
- A `falsifier`, `weight_basis`, `*_basis`, or `irreversibility_mechanism` (when claimed Type 1) field is required whenever the record type calls for one; a populated numeric/score/classification field with a `null` basis is a validation failure, not an acceptable gap. An expected value with `basis_type: NONE` is not populated — its range is `null` — so it passes this rule without a manufactured basis.
- Enumerated status values must be defined before production use.
- Every decision-stage record must carry a `decision_id`; the outcome record and the final-audit finding record are the only ones permitted to also reference an outcome, and only after the decision record (Module 08) already exists and is unchanged since the last revision permitted before Module 10 (Module 09 rule 9, recorded in `reversibility_revision_note`).
