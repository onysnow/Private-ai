# LAS Output Schemas — machine form

*Part of Logic Authority System (LAS) — v0.1. Added 2026-09-30 under DIR-0021 (T-0337).*

One JSON record per field table in `OUTPUT_SCHEMAS.md`, with each closed value stated once beneath it — the form DAS's and TAS's schemas carry inline. It is a separate file because `OUTPUT_SCHEMAS.md` is in the template library's invocation block, whose size ceiling (CODE_REVIEW_LAS_2026-09-25 F11; `_handoff-2026-09-26/tools/loadcheck.py`) these blocks would break; a template that needs the machine form loads this file with it. The field tables remain the definition; where the two differ, the table governs and this file is corrected.

## Argument record

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "arg_id": "ARG-0001",
  "conclusion": "…",
  "explicit_premises": [
    "PREM-0001",
    "PREM-0002"
  ],
  "unstated_premises": [
    "PREM-0003"
  ],
  "argument_lines": [
    {
      "line": 1,
      "premises": [
        "PREM-0001",
        "PREM-0002",
        "PREM-0003"
      ],
      "inferential_type": "DEDUCTIVE",
      "validity_verdict": "VALID",
      "strength": null,
      "logical_form": "modus ponens",
      "confidence_term": "LIKELY"
    }
  ],
  "formal_fallacy": null,
  "rival_explanation_not_addressed": null,
  "conclusion_scope_mismatch": null,
  "equivocation_affecting_inference": [],
  "no_premises_offered": false
}
```

`inferential_type` is `DEDUCTIVE`, `INDUCTIVE` or `ABDUCTIVE`; `validity_verdict` is `VALID`, `INVALID` or `NOT_CLEANLY_FORMALIZABLE` (deductive lines, else `null`); `strength` is a calibrated term with its basis (non-deductive lines, else `null`); `confidence_term` is `ALMOST_CERTAIN`, `VERY_LIKELY`, `LIKELY`, `ROUGHLY_EVEN_CHANCE`, `UNLIKELY`, `VERY_UNLIKELY` or `ALMOST_NO_CHANCE` (a record written before 2026-10-03 carries one of the five it then had, `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` Rule 3); `no_premises_offered` is a boolean.

## Premise record

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "premise_id": "PREM-0001",
  "premise_text": "…",
  "attribution_category": "STATED_BY_ARGUER",
  "type": "EMPIRICAL",
  "load_bearing": true,
  "verification_status": "UNVERIFIED",
  "check_performed": "CHECKED_SHORT_OF_THE_BAR",
  "source": null
}
```

`attribution_category` is `STATED_BY_ARGUER`, `ATTRIBUTED_SOURCE`, `RECONSTRUCTED_BY_EVALUATOR`, `BACKGROUND_ASSUMPTION` or `USER_STIPULATED`; `type` is `EMPIRICAL`, `NORMATIVE` or `DEFINITIONAL`; `load_bearing` is a boolean (false = peripheral); `verification_status` is `VERIFIED`, `CONTESTED`, `REFUTED`, `UNVERIFIED` or `UNVERIFIABLE`; `check_performed` is `NONE`, `CHECKED_SHORT_OF_THE_BAR`, `CHECKED_NOT_TESTABLE` or `STIPULATED_BY_REQUESTER`.

## Fallacy finding

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "finding_id": "FAL-0001",
  "passage": "…",
  "located_step": "PREM-0002 → conclusion",
  "fallacy_candidate": "Hasty generalization",
  "scheme_critical_questions_checked": null,
  "status": "CANDIDATE",
  "confidence_term": "ROUGHLY_EVEN_CHANCE",
  "mechanism": "…"
}
```

`fallacy_candidate` is a name from the formal list or the informal taxonomy above, spelled as there; `status` is `CANDIDATE`, `CONFIRMED` or `DISMISSED`; `confidence_term` is the calibrated term for the status, one of the seven above.

## Counterargument pair

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "pair_id": "STL-0001",
  "arg_id": "ARG-0001",
  "strongest_opposing_argument": {
    "premises": [
      "…"
    ],
    "conclusion": "…"
  },
  "crux": "…",
  "original_survives": true,
  "original_survives_why": "…",
  "module_02_invalidity_unaffected": "NONE_FOUND"
}
```

`original_survives` is a boolean with its reason in `original_survives_why`; `module_02_invalidity_unaffected` is `YES`, `NO` or `NONE_FOUND`.

## Consistency finding

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "finding_id": "CON-0001",
  "statement_a": "…",
  "statement_b": {
    "text": "…",
    "source": "…",
    "location": "…"
  },
  "same_entity_question_time_scope": true,
  "acknowledgment_check": {
    "acknowledged": false,
    "passage": null
  },
  "classification": "DIRECT_CONTRADICTION",
  "basis": "…"
}
```

`classification` is `DIRECT_CONTRADICTION`, `SCOPED_CHANGE_OF_POSITION`, `DEFINITIONAL_MISMATCH`, `UNRESOLVED` or `NOT_A_CONTRADICTION` (Module 07 rule 2); `DIRECT_CONTRADICTION` requires `same_entity_question_time_scope` true and the acknowledgment check performed (the null rules below).

## Hidden premise and equivocation record (Module 05)

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "arg_id": "ARG-0001",
  "hidden_premises": [
    "PREM-0003"
  ],
  "role_uncertain": [],
  "key_terms_checked": [
    "…"
  ],
  "equivocation_findings": [
    {
      "finding_id": "FAL-0002",
      "term": "…",
      "meaning_in_premises": "…",
      "meaning_in_conclusion": "…",
      "where_the_break_occurs": "…"
    }
  ],
  "ambiguous_terms_no_shown_shift": [],
  "vague_but_consistent_terms": []
}
```

`hidden_premises` is ordered by how much work each does; `role_uncertain` lists those whose role Module 05 rule 2's removal test left unclear; every equivocation finding is also a Fallacy finding with candidate `Equivocation`.

## Rhetoric record (Module 08)

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "arg_id": "ARG-0001",
  "technique": "LOADED_LANGUAGE",
  "technique_other": null,
  "passage": "…",
  "corresponds_to_confirmed_fallacy": null,
  "note": "…"
}
```

`technique` is `LOADED_LANGUAGE`, `FALSE_URGENCY`, `FALSE_BALANCE`, `UNSUPPORTED_CONFIDENT_TONE`, `REPETITION` or `OTHER` (named in `technique_other`); `corresponds_to_confirmed_fallacy` is a `FAL-####` or `null`.

## Argument verdict record

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "verdict_id": "VER-0001",
  "arg_id": "ARG-0001",
  "standards_assessment": [
    {
      "standard": "CLARITY",
      "assessment": "MET",
      "basis": "no vague-but-consistent term flagged (Module 05)"
    },
    {
      "standard": "ACCURACY",
      "assessment": "NOT_MET",
      "basis": "PREM-0001 UNVERIFIED (Module 03)"
    }
  ],
  "composite_verdict": "SUPPORTED_IF_PREMISES_HOLD",
  "confidence": "MEDIUM",
  "confidence_term": "LIKELY",
  "confidence_basis": "…"
}
```

`standards_assessment` has one entry per Paul-Elder standard (`CLARITY`, `ACCURACY`, `PRECISION`, `RELEVANCE`, `DEPTH`, `BREADTH`, `LOGIC`, `SIGNIFICANCE`, `FAIRNESS`), each `MET`, `PARTLY_MET` or `NOT_MET` with its basis in a prior module (Module 09 rule 1 — a characterization, never an averaged number, rule 2); `composite_verdict` is `SUPPORTED`, `SUPPORTED_IF_PREMISES_HOLD`, `PARTLY_SUPPORTED`, `NOT_SUPPORTED` or `NOT_ASSESSABLE` (Module 09 rule 8); `confidence` is `LOW`, `MEDIUM` or `HIGH` and `confidence_term` the calibrated term it was mapped from, one of the seven above (`CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` Rule 3) — the term, not the three-value field, crosses a system boundary.

## Final audit record (Module 10)

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "verdict_id": "VER-0001",
  "checks": [
    {
      "rule": 1,
      "finding": "…",
      "check_verdict": "PASS"
    }
  ],
  "overall_verdict": "PASS_WITH_CORRECTIONS",
  "limited_review_trigger": null,
  "required_corrections": [
    "…"
  ]
}
```

`check_verdict` is `PASS` or `FAIL` per Module 10 rule; `overall_verdict` is `PASS`, `PASS_WITH_CORRECTIONS`, `LIMITED_REVIEW` or `FAIL` (`INTEROP.md` §4); `limited_review_trigger` names the missing record or text, or is `null`.
