# Output Schemas

*Part of Quantitative Analysis System (QAS).*

One record type per prefix in `CORE/QAS_STANDARD.md` §5. Projects may add fields but do not change a field's meaning.
Ids take the form PREFIX-NNNN. Module OUTPUT tables may write values in words ("THEORY TEST", "yes/no");
records carry the spelling given here (THEORY_TEST, true/false).

## Framing record (Module 01)

```json
{
  "framing_id": "QFRM-0001",
  "question": "",
  "question_type": "COMPARATIVE",
  "unit_of_analysis": "",
  "target_population": "",
  "data_coverage_expected": "",
  "coverage_gap": "",
  "claim_level": "POPULATION",
  "variables": [{"name": "", "definition": "", "unit": ""}],
  "answer_form": {"quantity": "", "unit": "", "denominator": ""},
  "result_against_expected": "",
  "data_viewed_before_framing": {"viewed": false, "fields_affected": []},
  "modules_skipped": [{"module": "", "reason": ""}],
  "written_at": "YYYY-MM-DDTHH:MM"
}
```

`question_type`: DESCRIPTIVE, COMPARATIVE or THEORY_TEST. `claim_level`:
POPULATION, SUBGROUP or INDIVIDUAL.

## Dataset provenance record (Module 02)

```json
{
  "dataset_id": "QDAT-0001",
  "framing_id": "QFRM-0001",
  "collected_by": "",
  "compiled_by": "",
  "period_covered": "",
  "obtained_on": "YYYY-MM-DD",
  "obtained_how": "",
  "file": {"name": "", "size_bytes": 0, "rows": 0, "columns": 0, "hash": null},
  "received_file_unchanged": true,
  "coverage_gaps": [],
  "found_instructions": [],
  "assurance": {},
  "data_dictionary": [{"variable": "", "label": "", "definition": "", "unit": "", "expected_range": "", "missing_code": ""}]
}
```

Unknown items are written "unknown", not left blank. `found_instructions`
holds text inside the data that reads as an instruction (Standard §6). `assurance` holds the dataset assurance block (end of this file).

## Cleaning step record (Module 02)

```json
{
  "cleaning_id": "QCLN-0001",
  "dataset_id": "QDAT-0001",
  "step": "",
  "reason": "",
  "code_or_procedure": "",
  "manual": false,
  "rows_before": 0,
  "rows_after": 0,
  "values_changed": 0,
  "written_at": "YYYY-MM-DDTHH:MM"
}
```

## Rival-hypothesis record (Module 03)

```json
{
  "rival_set_id": "QRIV-0001",
  "framing_id": "QFRM-0001",
  "phase": "CONFIRMATORY",
  "round": 1,
  "written_at": "YYYY-MM-DDTHH:MM",
  "rivals_identified_so_far": [{"rival": "", "category": "OTHER", "prediction": "", "differs_from": [], "added_on": "YYYY-MM-DD"}],
  "check": {"design": "", "outcomes": [{"outcome": "", "counts_against": []}], "assumptions": [], "weak_points": []},
  "remaining_rivals": [],
  "data_needed": []
}
```

`phase`: EXPLORATORY or CONFIRMATORY. `category`: CHANCE, ARTEFACT,
GROUP_MAKEUP, REVERSE_DIRECTION, COMMON_CAUSE, PARTIAL_CAUSES or OTHER
(Module 03 rule 2).

## Analysis plan record (Module 04)

```json
{
  "plan_id": "QPLN-0001",
  "framing_id": "QFRM-0001",
  "rival_set_id": "QRIV-0001",
  "written_before_outcome_seen": true,
  "causal_assumptions": ["A -> B"],
  "outcome": "",
  "comparison": "",
  "model": "",
  "covariates": [{"variable": "", "reason": ""}],
  "exclusions": [{"rule": "", "reason": "", "n_excluded": 0, "written_before_outcome_seen": true}],
  "stopping_rule": "",
  "subgroups": [],
  "missing_data": "",
  "comparisons_count": 0,
  "log": [{"analysis": "", "label": "CONFIRMATORY", "choice_after_data": null, "alternatives": [], "reason": "", "result": ""}],
  "departures": [{"change": "", "reason": ""}],
  "written_at": "YYYY-MM-DDTHH:MM"
}
```

`causal_assumptions` is written before covariates are chosen (Module 04
rule 3). `written_before_outcome_seen: false` means the plan is POST HOC and its
analyses are EXPLORATORY.

## Result record (Modules 04 and 05)

```json
{
  "result_id": "QRES-0001",
  "plan_id": "QPLN-0001",
  "label": "CONFIRMATORY",
  "code_location": "",
  "estimate": 0.0,
  "unit": "",
  "interval": [0.0, 0.0],
  "interval_level": 0.95,
  "no_interval_reason": null,
  "p_value": null,
  "test": "",
  "model_assumptions_not_met": [],
  "practical_size_note": "",
  "base_rate": null,
  "denominator": "",
  "robustness": {"with_exclusions": "", "without_exclusions": "", "with_covariates": "", "without_covariates": "", "with_unsettled": "", "without_unsettled": ""},
  "subgroup_results": [{"subgroup": "", "estimate": 0.0, "interval": [0.0, 0.0]}],
  "direction_reverses": false,
  "group_makeup_difference": null,
  "analyses_reported_of_total": "n of N",
  "datasets": [{"dataset_id": "QDAT-0001", "period_used": "", "reliance": "RELY_WITH_LIMITS", "limits_stated": []}],
  "interval_covers": "",
  "written_at": "YYYY-MM-DDTHH:MM"
}
```

`no_interval_reason` is required when `interval` is empty (for example, a
plain count); otherwise it stays null. `with_unsettled` and
`without_unsettled` hold the result with and without any material whose
`assurance.upstream_status` is unsettled, and stay empty when there is none
(Module 04 rule 7; Standard §10). `datasets` names each dataset the result
uses, the period of it the result uses, the reliance level of that period
and each limit stated beside the result; `interval_covers` names the error
sources the interval includes (Module 05 rule 14; Policy rules 8, 18 and 20).

## Causal judgement record (Module 06)

```json
{
  "causal_id": "QCAU-0001",
  "result_id": "QRES-0001",
  "temporal_order_shown": "YES",
  "causal_assumptions": ["A -> B"],
  "adjustment_set": [{"variable": "", "role": "COMMON_CAUSE", "reason": ""}],
  "alternative_structures": [{"structure": "", "result": ""}],
  "hill_considerations": [{"viewpoint": "", "finding": ""}],
  "rivals_fit": [{"rival": "", "fits_as_well": false}],
  "unmeasured_common_causes": [],
  "verdict": "ASSOCIATION_ONLY",
  "conditions": [],
  "likelihood_term": null,
  "band": null,
  "permitted_wording": []
}
```

`temporal_order_shown`: YES, NO or UNCLEAR. `role`: COMMON_CAUSE (adjusted),
MEDIATOR or COMMON_EFFECT (not adjusted), or OTHER with reason.
`likelihood_term` is one of ALMOST_CERTAIN, VERY_LIKELY, LIKELY,
ROUGHLY_EVEN_CHANCE, UNLIKELY, VERY_UNLIKELY, ALMOST_NO_CHANCE; `band` is its
band (e.g. "55-80%"). In prose the two are written together, e.g. "likely
(55–80%)". `verdict`:
ASSOCIATION_ONLY or CAUSAL_WORDING_PERMITTED.

## Final audit record (Module 07)

```json
{
  "audit_id": "QAUD-0001",
  "audited_at": "YYYY-MM-DD",
  "fresh_context": true,
  "numbers_traced": [{"number": "", "record": "QRES-0001"}],
  "findings": [{"rule": "", "location": "", "problem": "", "correction": ""}],
  "restatements": [{"text": "", "finding": "QRES-0001", "raises_confidence": false, "widens_scope": false, "association_as_cause": false, "correction": null}],
  "handoff": {"result_ids": ["QRES-0001"], "causal_ids": [], "framing_id": "QFRM-0001", "conditions": []},
  "verdict": "PASS WITH CORRECTIONS"
}
```

`verdict`: PASS, PASS WITH CORRECTIONS or FAIL. A traced number with no
record is written `"record": null` and is a finding.

`handoff` lists what may be passed on (Standard §10): the results, the causal
judgements that cover them, the framing record whose population, coverage gap
and claim level travel with them, and any condition they carry (for example,
"conditional on 40 invoices whose status is unsettled"). It stays empty when
the verdict is FAIL. Module 07 rule 14 writes it.

## Dataset assurance block (QDAT `assurance`; Module 02 and `CORE/DATA_SOURCE_AND_QUALITY_POLICY.md`)

```json
{
  "collection": "SURVEY",
  "official_statistics": {"published_as_official": false, "code": "", "status": "", "status_checked_on": "YYYY-MM-DD", "principles_relied_on": []},
  "assurance_level_published": "none published",
  "risk_factors": [],
  "error_sources": [{"source": "NONRESPONSE", "note": ""}],
  "response_rate": {"value": null, "trend": ""},
  "coverage_and_linkage": {"who_is_missing": "", "linked_to": [], "records_linked": null},
  "quality_events": [{"event": "", "date": "YYYY-MM-DD", "period_affected": ""}],
  "producer_stake": "",
  "documentation": {"motivation": "", "composition": "", "collection_process": "", "preprocessing": "", "uses": "", "distribution": "", "maintenance": ""},
  "independent_check": [{"source": "", "result": ""}],
  "vintage": {"release": "", "released_on": "YYYY-MM-DD"},
  "upstream_status": [{"system": "", "record_id": "", "status": "", "applies_to": ""}],
  "fitness": {"concept": "MATCH", "coverage": "MATCH", "period": "MATCH", "unit": "MATCH", "quality_needed": {"dimension": "TIMELINESS_AND_PUNCTUALITY", "reason": "", "finding": "MATCH"}},
  "interval_covers": "",
  "reliance": "RELY_WITH_LIMITS",
  "reliance_reasons": [],
  "reliance_by_period": [{"period": "", "reliance": "", "reasons": []}],
  "limits": [],
  "conflicts_with": [{"dataset_id": "QDAT-0002", "difference": "", "explanation": ""}],
  "quality_search": [{"looked_in": "", "found": ""}]
}
```

`collection`: SURVEY, ADMINISTRATIVE, FOUND or OTHER (Policy rule 2).
`error_sources[].source`: SPECIFICATION, FRAME_OR_COVERAGE, SAMPLING,
NONRESPONSE, MEASUREMENT, PROCESSING or OTHER (Policy rule 7). Each `fitness`
item, and `quality_needed.finding`: MATCH, MISMATCH or UNKNOWN (Policy rule
17). `quality_needed.dimension`: ACCURACY_AND_RELIABILITY,
TIMELINESS_AND_PUNCTUALITY, COHERENCE_AND_COMPARABILITY or
ACCESSIBILITY_AND_CLARITY, with the reason it was chosen (Policy rule 17).
`principles_relied_on` names the principles of the producer's code the
question depends on (Policy rule 3). `reliance`: RELY, RELY_WITH_LIMITS or
DO_NOT_RELY (Policy rule 18); when a quality event covers only part of the
period used, `reliance_by_period` gives each part its level and `reliance`
the lowest of them. A documentation question the dataset's documentation
does not answer is written "not documented" (Policy rule 13).
`upstream_status` is empty unless the dataset or record came with a status
from earlier work (Standard §10); each entry names the system and the record
that gave the status, the status spelled as that system spells it, and the
rows or records it applies to (Policy rule 23). `interval_covers` names the
error sources an interval from this dataset includes (Policy rule 8).
`conflicts_with` links a dataset that measures the same quantity and
disagrees, with the difference and its explanation by collection, or
"unexplained" (Policy rule 21).
