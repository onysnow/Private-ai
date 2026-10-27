"""The Authority System Suite's closed lists the app now records (the app-side suite
gaps, docs/authority-suite/SUITE_GAPS.md; Ony, 12 Oct 2026: close them before step 4).

Each list is copied from the vendored suite (backend/app/ai/authority_suite), and
VOCAB_SOURCES names the file that defines it and a line of that file the values must
appear on. tests/test_suite_vocab.py reads those files, so a suite update that changes
a list fails the test instead of drifting silently."""

from __future__ import annotations

from app.ai.authority_sdk import confidence_terms

TAS_SCHEMAS = "systems/tas/EVALUATION/OUTPUT_SCHEMAS.md"
TAS_STANDARD = "systems/tas/CORE/INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md"

# Evidence and source records (TAS Evidence record).
SOURCE_TIERS = ("A", "B", "C", "D", "E", "F")
AUTHENTICITY_STATUSES = ("VERIFIED", "PROVISIONAL", "DISPUTED", "UNKNOWN")

# Claim record.
CLASSIFICATIONS = ("SOURCE_STATEMENT", "CORROBORATED_FACT", "ALLEGATION", "INFERENCE", "HYPOTHESIS", "UNKNOWN",
                   "NEGATIVE_SEARCH_RESULT", "UNRESOLVED_CONFLICT")
CONFIDENCE_TERMS = confidence_terms()  # from the Authority Suite SDK, not a copy
CONFIDENCE_LEVELS = ("LOW", "MEDIUM", "HIGH")
# Module 02's verdicts; PARTIALLY VERIFIED needs wording that does not exceed the evidence.
VERIFICATION_VERDICTS = ("VERIFIED", "PARTIALLY VERIFIED", "ATTRIBUTED BUT UNCORROBORATED", "UNRESOLVED",
                         "NOT TESTABLE FROM AVAILABLE SOURCES", "CONTRADICTED")

# Relationship record: whether a link is documented, inferred or alleged (Standard §9).
RELATIONSHIP_EVIDENCE_STATUSES = ("DIRECT", "INFERRED", "ALLEGED")

# Event record: precision kept apart from evidence status.
DATE_PRECISIONS = ("exact", "day", "month", "range", "before", "after", "estimated", "unknown")

# Final-audit finding record: who reviewed.
REVIEWER_TYPES = ("AUTOMATED", "AI_ASSISTED", "HUMAN", "LEGAL_COUNSEL")

# Right-of-reply record (CP-01).
REPLY_STATUSES = ("OFFERED", "RESPONDED", "DECLINED", "NO_RESPONSE", "EXCEPTION")
# Gap record.
RECORD_EXISTENCE = ("KNOWN", "BELIEVED")
# Hypothesis record.
HYPOTHESIS_KINDS = ("WORKING_THEORY", "INNOCENT_EXPLANATION", "ALTERNATIVE_ATTRIBUTION", "DATA_QUALITY", "OTHER")
# Conflict record (spelled as Module 06 spells it).
CONFLICT_TYPES = ("DIRECT CONTRADICTION", "TEMPORAL CHANGE", "DEFINITIONAL MISMATCH", "SCOPE DIFFERENCE", "AMBIGUOUS", "UNRESOLVED")
# EGS gathering outcome (what was not obtained is a finding).
GATHERING_OUTCOMES = ("OBTAINED", "REFUSED", "NOT_HELD", "NO_REPLY", "UNABLE_TO_OBTAIN")
# EHS records: CP-03 public interest and its decision; CP-02 source protection.
PUBLIC_INTEREST_GROUNDS = ("EXPOSING_CRIME", "SERIOUS_IMPROPRIETY", "HEALTH_OR_SAFETY", "PREVENTING_MISLEADING", "FAILED_OBLIGATION",
                           "MISCARRIAGE_OF_JUSTICE", "PUBLIC_DEBATE", "OTHER")
PUBLICATION_DECISIONS = ("PENDING", "PUBLISH", "PUBLISH_WITH_CHANGES", "DO_NOT_PUBLISH")
PLANNED_STEPS = ("CONTACT", "RECORD", "STORE", "SHARE", "PUBLISH")
BREACH_DECISIONS = ("PENDING", "NONE", "BREACH")

VOCAB_SOURCES: dict[str, tuple[str, str | None]] = {
    # name: (file, the text in it that holds every value, matched without case), or
    # (file, None) when the file lists each value as its own "- VALUE" bullet.
    "VERIFICATION_VERDICTS": ("systems/tas/PROMPT_MODULES/02_SOURCE_VERIFICATION.md", None),
    "RELATIONSHIP_EVIDENCE_STATUSES": (TAS_STANDARD, "| Direct, inferred, or alleged |"),
    "CLASSIFICATIONS": (TAS_SCHEMAS, "`SOURCE_STATEMENT|CORROBORATED_FACT|ALLEGATION|INFERENCE|HYPOTHESIS|UNKNOWN|NEGATIVE_SEARCH_RESULT|UNRESOLVED_CONFLICT`"),
    "CONFIDENCE_TERMS": (TAS_SCHEMAS, '"confidence_term": "ALMOST_CERTAIN|VERY_LIKELY|LIKELY|ROUGHLY_EVEN_CHANCE|UNLIKELY|VERY_UNLIKELY|ALMOST_NO_CHANCE"'),
    "DATE_PRECISIONS": (TAS_SCHEMAS, '"date_precision": "exact|day|month|range|before|after|estimated|unknown"'),
    "REVIEWER_TYPES": (TAS_SCHEMAS, '"reviewer_type": "AUTOMATED|AI_ASSISTED|HUMAN|LEGAL_COUNSEL"'),
    "REPLY_STATUSES": (TAS_SCHEMAS, '"status": "OFFERED|RESPONDED|DECLINED|NO_RESPONSE|EXCEPTION"'),
    "RECORD_EXISTENCE": (TAS_SCHEMAS, '"record_existence": "KNOWN|BELIEVED"'),
    "HYPOTHESIS_KINDS": (TAS_SCHEMAS, '"kind": "WORKING_THEORY|INNOCENT_EXPLANATION|ALTERNATIVE_ATTRIBUTION|DATA_QUALITY|OTHER"'),
    "CONFLICT_TYPES": (TAS_SCHEMAS, '"conflict_type": "DIRECT CONTRADICTION|TEMPORAL CHANGE|DEFINITIONAL MISMATCH|SCOPE DIFFERENCE|AMBIGUOUS|UNRESOLVED"'),
    "AUTHENTICITY_STATUSES": (TAS_STANDARD, "authenticity_status: verified | provisional | disputed | unknown"),
    "PUBLICATION_DECISIONS": ("systems/ehs/EVALUATION/OUTPUT_SCHEMAS.md", "`decision` is `PENDING`, `PUBLISH`, `PUBLISH_WITH_CHANGES` or\n`DO_NOT_PUBLISH`"),
    "PLANNED_STEPS": ("systems/ehs/EVALUATION/OUTPUT_SCHEMAS.md", "`planned_step` is `CONTACT`, `RECORD`, `STORE`, `SHARE` or `PUBLISH`"),
    "BREACH_DECISIONS": ("systems/ehs/EVALUATION/OUTPUT_SCHEMAS.md", "`PENDING`, `NONE` or `BREACH`, and the model writes `PENDING`"),
    "GATHERING_OUTCOMES": ("systems/egs/EVALUATION/OUTPUT_SCHEMAS.md", "`OBTAINED`, `REFUSED`, `NOT_HELD`, `NO_REPLY`, `UNABLE_TO_OBTAIN`"),
}
