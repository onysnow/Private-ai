"""The shape of one indicator and one glossary term.

``extra="forbid"`` everywhere: a misspelt field in a YAML file is refused,
not ignored. JSON Schema files in ``catalogue/schema/`` are exported from
these models (``python tools/catalogue.py schema``), so the schema and the
code cannot drift.
"""

from __future__ import annotations

import re
from datetime import date
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ID_PATTERN = re.compile(r"^[A-Z]{2}-\d{3}$")
NUMBER = re.compile(
    r"\d|\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|fifty|hundred|thousand|million|billion|half|percent|per cent)\b",
    re.IGNORECASE,
)
# References to a law, article or report carry digits that are not thresholds
# ("Article 4(3) of Directive (EU) 2024/1069"); they are removed before looking
# for a number that needs a source.
REFERENCE = re.compile(
    r"\b(?:Article|Art\.|Directive|Regulation|Reg\.|Recommendation|Rec|Section|s\.|paragraph|para\.|Annex|Rule|indicator|indication|point|item|principle|chapter|§)\s*(?:\(EU\)\s*)?[\w()./-]*\d[\w()./-]*",
    re.IGNORECASE,
)


# Years, page numbers and US Code citations ("2020 advisory p.3", "18 U.S.C. 152(1),(7)").
OTHER_REFERENCES = re.compile(r"\b(?:fn|footnote|note)\.?\s*\d+|\b(?:19|20)\d{2}\b|\bpp?\.\s*\d+|\b\d+\s*U\.S\.C\.?\s*§?\s*[\d()a-z,\s]*", re.IGNORECASE)


def has_threshold_number(*texts: str) -> bool:
    """True when the text gives a quantity (a count, a share, an amount) rather
    than only a reference to a law or report."""
    return any(NUMBER.search(OTHER_REFERENCES.sub("", REFERENCE.sub("", text))) for text in texts)


# Every area the catalogue covers. A cross-hint may point to any of them, even
# before that area's file exists.
AREAS: dict[str, str] = {
    "ML": "Money laundering", "BO": "Hidden ownership and shell companies",
    "SF": "Terrorist financing, proliferation financing and sanctions evasion", "FR": "Tax evasion and fraud",
    "CO": "Corruption and influence", "PP": "Public procurement, non-profits and elections",
    "HT": "Human trafficking and forced labour", "HR": "Human rights abuses, war crimes and cultural property",
    "OC": "Organised crime and illicit goods", "EN": "Environmental crime", "IN": "Information integrity",
    "CY": "Cybercrime and judging sources", "SA": "Safety of investigators, sources and witnesses",
    # Added in the second research round (coverage check, 8 October 2026).
    "VE": "Violent extremism and hate-motivated attacks", "ES": "Espionage and insider threat",
    "EF": "Elder financial exploitation", "MA": "Securities market abuse", "AF": "Corporate accounting fraud",
    "PD": "Prescription drug diversion", "LE": "Labour exploitation and wage theft",
    "PM": "Police misconduct and state violence", "CA": "Child sexual abuse in institutions",
}


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Outcome(str, Enum):
    """What a case's source establishes. Ordered from a court's finding to a
    published allegation; an allegation is never shown as a finding."""

    convicted = "convicted"
    acquitted = "acquitted"
    settled = "settled"
    fined_by_regulator = "fined_by_regulator"
    found_by_official_inquiry = "found_by_official_inquiry"
    alleged_in_reporting = "alleged_in_reporting"


class Checkable(str, Enum):
    records = "records"   # from the case's own records
    lookups = "lookups"   # needs outside data (a Paper Trail source)
    person = "person"     # a person must read documents or interviews


class Status(str, Enum):
    verified = "verified"  # every quote re-opened and found word for word
    pending = "pending"    # collected, not yet fully verified; kept out of Red Flags and the PDF


class Source(Strict):
    title: str
    publisher: str
    year: str | None = None
    url: str
    locator: str | None = Field(default=None, description="page, section or paragraph")
    quote: str = Field(min_length=1)
    quote_verified: bool = False
    licence: str | None = None
    checked: date | None = None


class Case(Strict):
    name: str
    year: str
    jurisdiction: str
    what_happened: str
    outcome: Outcome
    outcome_verified: bool = False
    source_url: str
    source_title: str | None = None


class Levels(Strict):
    faint: str
    strong: str
    textbook: str
    threshold_source: str = Field(description="URL of the source for any number in the levels, or 'none'")

    @model_validator(mode="after")
    def numbers_need_a_source(self) -> "Levels":
        if has_threshold_number(self.faint, self.strong, self.textbook) and self.threshold_source.strip().lower() in {"", "none"}:
            raise ValueError("a level gives a number but threshold_source names no source")
        return self


class CrossHint(Strict):
    target_area: str
    target_indicator: str | None = None
    reason: str
    source_url: str


class Indicator(Strict):
    id: str
    name: str
    definition: str
    areas: list[str] = Field(min_length=1)
    typology: str | None = None
    status: Status = Status.pending
    sources: list[Source] = Field(min_length=1)
    examples: list[str] = Field(default_factory=list)
    cases: list[Case] = Field(default_factory=list)
    data_needed: list[str] = Field(default_factory=list)
    checkable: Checkable
    lookup_sources: list[str] = Field(default_factory=list)
    levels: Levels
    threshold_verified: bool = False
    cross_hints: list[CrossHint] = Field(default_factory=list)
    innocent_explanations: list[str] = Field(min_length=1)
    jurisdictions: str | None = None
    version: int = 1

    @field_validator("id")
    @classmethod
    def id_shape(cls, value: str) -> str:
        if not ID_PATTERN.match(value):
            raise ValueError(f"indicator id {value!r} must look like ML-001")
        return value

    @model_validator(mode="after")
    def verified_means_verified(self) -> "Indicator":
        if self.status is Status.verified:
            unverified = [s.url for s in self.sources if not s.quote_verified]
            if unverified:
                raise ValueError(f"{self.id} is verified but these quotes are not: {unverified}")
            cases = [c.name for c in self.cases if not c.outcome_verified]
            if cases:
                raise ValueError(f"{self.id} is verified but these case outcomes are not: {cases}")
            if has_threshold_number(self.levels.faint, self.levels.strong, self.levels.textbook) and not self.threshold_verified:
                raise ValueError(f"{self.id} is verified but its threshold numbers are not")
        return self


class Area(Strict):
    key: str = Field(pattern=r"^[A-Z]{2}$")
    name: str
    scope: str
    indicators: list[Indicator]
    not_reached: list[str] = Field(default_factory=list)


class Term(Strict):
    term: str
    definition: str
    examples: list[str] = Field(default_factory=list)
    source_url: str
    cases: list[str] = Field(default_factory=list)
    related: list[str] = Field(default_factory=list)
    indicators: list[str] = Field(default_factory=list)
    areas: list[str] = Field(default_factory=list)


class Glossary(Strict):
    area: str
    terms: list[Term]
