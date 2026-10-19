# Output Schemas

*Part of Research Authority System (RAS).*

Shared record formats and vocabularies referenced by the prompt modules.
Defining these once — here, and the tier scale in
`CORE/SOURCE_AUTHORITY_AND_RETRIEVAL_POLICY.md` Section 3 — keeps every
module using the same tiers and calibration language instead of each
module inventing its own.

## Source tier scale

The eight-tier scale is defined once, in
`CORE/SOURCE_AUTHORITY_AND_RETRIEVAL_POLICY.md` Section 3 (Tier 1,
systematic review / meta-analysis, down to Tier 8, opinion, blog, or
unvetted user-generated content); every record below uses it.

A source additionally carries a *venue legitimacy flag* — `standard`,
`non-indexed-unclear`, or `known-predatory` (a predatory or pay-to-publish
venue; Module 03, Rule 3) — and a *provenance flag* — `verified` or `unverified-provenance`
(Policy Section 3; Module 03, Rule 11) — both independent of tier.

## Certainty-of-evidence scale

Adapted from GRADE (Grading of Recommendations Assessment, Development and
Evaluation) — a property of the evidence *base* supporting a claim, not of
any single source.

| Level | Meaning |
|---|---|
| High | Consistent findings across multiple high-tier, independently corroborated sources (systematic review and/or multiple independently replicated studies); representativeness verdict from Module 05 is REPRESENTATIVE. |
| Moderate | Generally consistent findings, but resting on fewer or lower-tier sources, limited replication, or a representativeness verdict of LIKELY REPRESENTATIVE WITH NOTED GAPS. |
| Low | A single-source claim (Module 04), a small number of lower-tier sources, or unresolved inconsistency across sources. |
| Very low | Preprints, single small studies, expert opinion without a stated evidentiary basis, or a representativeness verdict of LIMITED-NOT ESTABLISHED. |

**Representativeness cap.** The Module 05 verdict caps a claim's
certainty: REPRESENTATIVE — no cap; LIKELY REPRESENTATIVE WITH NOTED GAPS
— at most Moderate; LIMITED-NOT ESTABLISHED — Very low. Module 05 rule 7
and Module 09 rule 1 apply this cap and state no other; test R17 pins it.

## Degree-of-consensus scale

Independent of certainty — a field can have low-certainty evidence with
strong provisional consensus, or high-certainty evidence with genuine
unresolved minority dissent.

- **Established consensus** — the relevant expert/research community agrees,
  with no material, evidence-based dissent.
- **Majority view with notable dissent** — a clear majority position exists,
  alongside a dissenting position that has genuine evidentiary support (not
  merely a vocal minority — see Module 06's manufactured-controversy flag).
- **Contested — evidence genuinely mixed** — the higher-tier evidence itself
  points in different directions; no majority position is supported by the
  weight of evidence.
- **Emerging — insufficient evidence to assess** — too little evidence
  exists yet, regardless of how confident any individual source sounds.
- **Minority view against the weight of evidence** — a position held by a
  source or small group but not supported by the broader, higher-tier
  evidence base; report as a named minority position, not as live debate.

## Records

### Source record
| Field | Description |
|---|---|
| Source ID | |
| Citation | |
| Tier | Default tier for the source's own findings (Policy Section 3) |
| Claim-specific tier exceptions | Claim as the source states it (Module 04 attaches the Claim ID) → a different tier, with reason, for each claim the source carries less or more weight on than its default (Module 03, Rule 1; Policy Section 3) |
| Venue legitimacy flag | standard / non-indexed-unclear / known-predatory |
| Provenance flag | verified / unverified-provenance (Policy Section 3) |
| Primary/secondary/tertiary | |
| Study design (if applicable) | RCT / observational / case study / model-simulation / consensus statement / review / other |
| Sample size (if applicable) | |
| Funding/COI status | disclosed / undisclosed-discovered / none found / not checked (Module 03 rule 9; Module 05 output A) |
| Funding/conflicts of interest | The disclosed or discovered text |
| Disclosed limitations | |
| Quality flag | clean / minor-concern / serious-concern (Module 03) |
| Currency status | current / corrected / retracted / superseded / unable to verify |
| Retrieved at | Retrieval date (Standard §6) |
| Access status | full text / partial / inaccessible (Module 02 output D; Standard §6) |

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "source_id": "RSRC-0001",
  "citation": "Author, Title, Venue, year, DOI or URL",
  "tier": 2,
  "claim_specific_tier_exceptions": [
    {
      "claim_id": "RCLM-0003",
      "claim_as_source_states_it": "…",
      "tier": 4,
      "reason": "…"
    }
  ],
  "venue_legitimacy_flag": "STANDARD",
  "provenance_flag": "VERIFIED",
  "source_level": "PRIMARY",
  "study_design": "RCT",
  "sample_size": 412,
  "funding_coi_status": "DISCLOSED",
  "funding_conflicts_of_interest": "…",
  "disclosed_limitations": "…",
  "quality_flag": "CLEAN",
  "currency_status": "CURRENT",
  "retrieved_at": "2026-09-30",
  "access_status": "FULL_TEXT"
}
```

`tier` is 1–8 (Policy Section 3). `venue_legitimacy_flag` is `STANDARD`, `NON_INDEXED_UNCLEAR` or `KNOWN_PREDATORY`; `provenance_flag` is `VERIFIED` or `UNVERIFIED_PROVENANCE`; `source_level` is `PRIMARY`, `SECONDARY` or `TERTIARY`; `currency_status` is `CURRENT`, `CORRECTED`, `RETRACTED`, `SUPERSEDED` or `UNABLE_TO_VERIFY`; `study_design` is `RCT`, `OBSERVATIONAL`, `CASE_STUDY`, `MODEL_SIMULATION`, `CONSENSUS_STATEMENT`, `REVIEW` or `OTHER`; `funding_coi_status` is `DISCLOSED`, `UNDISCLOSED_DISCOVERED`, `NONE_FOUND` or `NOT_CHECKED`; `quality_flag` is `CLEAN`, `MINOR_CONCERN` or `SERIOUS_CONCERN`; `access_status` is `FULL_TEXT`, `PARTIAL` or `INACCESSIBLE`. `study_design` and `sample_size` are `null` where not applicable, and `funding_conflicts_of_interest` is `null` when nothing was disclosed or discovered. The wire spellings are the table's values in upper case with underscores, the convention `INTEROP.md` §2 sets for values that cross a system boundary.

### Claim record
| Field | Description |
|---|---|
| Claim ID | |
| Claim text (with population/timeframe/scope) | |
| Supporting sources (tier-weighted) | |
| Contradicting sources (tier-weighted) | |
| Corroboration verdict | CORROBORATED / SINGLE-SOURCE |
| Corroboration basis | What the verdict rests on: the independent sources, or "pooled: N independent studies (per the review)" (Module 04 rule 7; Standard §5.2) |
| Pinpoint location | Page, section, figure, table or DOI in each supporting source (Standard §10) |
| Replication status | Independently replicated / single unreplicated / not applicable |
| Certainty of evidence | High / Moderate / Low / Very low |
| Degree of consensus | Established consensus / Majority with dissent / Contested / Emerging / Minority against weight of evidence |
| Extrapolation flag | Whether this claim extends beyond what any cited source directly studied |
| Warrant | One sentence stating why the cited evidence bears on this specific claim, distinct from the certainty basis |

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "claim_id": "RCLM-0001",
  "claim_text": "… (population, timeframe and scope stated)",
  "supporting_sources": [
    {
      "source_id": "RSRC-0001",
      "tier": 2,
      "pinpoint_location": "p. 14, Table 2"
    }
  ],
  "contradicting_sources": [],
  "corroboration_verdict": "CORROBORATED",
  "corroboration_basis": "two independent sources, or pooled: N independent studies (per the review)",
  "replication_status": "INDEPENDENTLY_REPLICATED",
  "certainty_of_evidence": "MODERATE",
  "degree_of_consensus": "MAJORITY_WITH_DISSENT",
  "extrapolation_flag": false,
  "warrant": "…"
}
```

`corroboration_verdict` is `CORROBORATED` or `SINGLE_SOURCE`; `replication_status` is `INDEPENDENTLY_REPLICATED`, `SINGLE_UNREPLICATED` or `NOT_APPLICABLE`; `certainty_of_evidence` is `HIGH`, `MODERATE`, `LOW` or `VERY_LOW` (the scale above); `degree_of_consensus` is `ESTABLISHED_CONSENSUS`, `MAJORITY_WITH_DISSENT`, `CONTESTED`, `EMERGING` or `MINORITY_AGAINST_WEIGHT`; `extrapolation_flag` is a boolean. Each supporting source carries its pinpoint location (Standard §10).

### Search record
| Field | Description |
|---|---|
| Query | |
| Database/engine | |
| Date run | |
| Results found / reviewed | |
| Purpose (general / disconfirming-focused) | |
| Notes | Rejected candidates and the reason, and a source reached outside a query (Module 02 rule 6) |

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "search_id": "SRCH-0001",
  "query": "…",
  "database_or_engine": "…",
  "date_run": "2026-09-30",
  "results_found": 41,
  "results_reviewed": 12,
  "purpose": "DISCONFIRMING",
  "notes": "…"
}
```

`purpose` is `GENERAL` or `DISCONFIRMING` (Module 02 output A; Policy Section 4 requires at least one `DISCONFIRMING` search per question).

### Diversity check record
| Field | Description |
|---|---|
| Dimension | Source independence / institutional-funder concentration / geographic-language concentration / viewpoint range |
| Finding | |
| Single-source or single-viewpoint capture flag | |

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "diversity_id": "RDIV-0001",
  "dimension": "SOURCE_INDEPENDENCE",
  "finding": "…",
  "capture_flag": false
}
```

`dimension` is `SOURCE_INDEPENDENCE`, `INSTITUTIONAL_FUNDER_CONCENTRATION`, `GEOGRAPHIC_LANGUAGE_CONCENTRATION` or `VIEWPOINT_RANGE`; `capture_flag` is a boolean (single-source or single-viewpoint capture).

### Bias and representativeness finding
| Field | Description |
|---|---|
| Bias type | Funding/COI / stated-or-unstated agenda / file-drawer-publication-selection / recency-novelty / language-access / institutional-funder concentration |
| Finding | |
| Effect on confidence | |
| Overall representativeness verdict | REPRESENTATIVE / LIKELY REPRESENTATIVE WITH NOTED GAPS / LIMITED-NOT ESTABLISHED |

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "bias_id": "RBIA-0001",
  "bias_type": "FUNDING_COI",
  "finding": "…",
  "effect_on_confidence": "…",
  "representativeness_verdict": "LIKELY_REPRESENTATIVE_WITH_NOTED_GAPS"
}
```

`bias_type` is `FUNDING_COI`, `AGENDA`, `FILE_DRAWER_PUBLICATION_SELECTION`, `RECENCY_NOVELTY`, `LANGUAGE_ACCESS` or `INSTITUTIONAL_FUNDER_CONCENTRATION`; `representativeness_verdict` is `REPRESENTATIVE`, `LIKELY_REPRESENTATIVE_WITH_NOTED_GAPS` or `LIMITED_NOT_ESTABLISHED` — the verdict that caps certainty (Module 05 rule 7, Module 09 rule 1).

### Research gap record
| Field | Description |
|---|---|
| Gap ID | |
| Sub-question affected | |
| Missing element | Population / topic-intervention / comparison / outcome / setting-timeframe |
| Reason for gap | Insufficient-imprecise / biased / inconsistent / not-the-right-information |
| Gap vs. search-scope-limitation | |
| Priority | Central / peripheral (Module 08 rule 6) |
| What would close it | |

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "gap_id": "RGAP-0001",
  "sub_question_affected": "…",
  "missing_element": "OUTCOME",
  "reason_for_gap": "INSUFFICIENT_IMPRECISE",
  "gap_or_search_scope_limitation": "GAP",
  "priority": "CENTRAL",
  "what_would_close_it": "…"
}
```

`missing_element` is `POPULATION`, `TOPIC_INTERVENTION`, `COMPARISON`, `OUTCOME` or `SETTING_TIMEFRAME`; `reason_for_gap` is `INSUFFICIENT_IMPRECISE`, `BIASED`, `INCONSISTENT` or `NOT_THE_RIGHT_INFORMATION` (the AHRQ framework, Module 08); `gap_or_search_scope_limitation` is `GAP` or `SEARCH_SCOPE_LIMITATION`; `priority` is `CENTRAL` or `PERIPHERAL`.

### Final audit finding
| Field | Description |
|---|---|
| Claim | |
| Confidence-match check | Pass/fail against Module 09's assigned label |
| Citation-accuracy check | Pass/fail — does the pinpoint citation actually support the claim at the stated scope |
| Contradiction/gap-disclosure check | Pass/fail — does the draft disclose what the internal records found |
| Verdict | PASS / PASS WITH CORRECTIONS / LIMITED REVIEW / FAIL |
| Reviewer type | automated / AI-assisted / human / legal counsel (Module 10 output D) |
| Independent review | yes / no — yes only when a person or a different model from the draft's author ran the audit; a fresh context of the same model is a separate pass, recorded as no (Module 10 output D) |

Machine form (DIR-0021, T-0337 — the same fields, one record):

```json
{
  "audit_id": "RAUD-0001",
  "claim_id": "RCLM-0001",
  "confidence_match_check": "PASS",
  "citation_accuracy_check": "PASS",
  "contradiction_gap_disclosure_check": "FAIL",
  "verdict": "PASS_WITH_CORRECTIONS",
  "retrieved_text_changed_a_step": false,
  "step_changed": null,
  "reviewer_type": "AI_ASSISTED",
  "independent_review": false
}
```

The three checks are `PASS` or `FAIL`; `verdict` is `PASS`, `PASS_WITH_CORRECTIONS`, `LIMITED_REVIEW` or `FAIL` (`INTEROP.md` §4 — the value crosses the boundary in this spelling); `retrieved_text_changed_a_step` is Module 10 rule 13's statement, with `step_changed` naming the step or `null`. `reviewer_type` is `AUTOMATED`, `AI_ASSISTED`, `HUMAN` or `LEGAL_COUNSEL` (TAS's audit-finding vocabulary); `independent_review` is `true` only when a person or a different model from the one that wrote the draft ran the audit — a fresh context of the same model is a separate pass, and `false`; both are written from Module 10 output D.

## Record ID prefixes

`RSRC-####` source records, `RCLM-####` claim records, `SRCH-####` search records, `RDIV-####` diversity checks, `RBIA-####` bias and representativeness findings, `RGAP-####` research gaps, `RAUD-####` final audit findings — assigned under DIR-0021 (T-0337); until then RAS defined none (`INTEROP.md` §7 [IN-034]). `SRC-` is not used, because `SYCOPHANCY_CONTROLS.md` §2 uses it for a user statement recorded as a source; `CLM-` is TAS's.
