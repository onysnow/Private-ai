"""The Authority System Suite's own records for a case (app/models/case_records.py).

Each kind is the suite's record as its schema writes it, checked here field by field
with the suite's closed lists (app/ai/suite_vocab.py):

- GAP  Gap record (TAS OUTPUT_SCHEMAS; Module 07): an unresolved question tied to a claim.
- ROR  Right-of-reply record (CP-01): offered by a person, never the model.
- HYP  Hypothesis record (Module 06): every consequential attribution needs an alternative.
- CFLT Conflict record (Standard §12): the same-proposition test and resolving evidence.
- RLOG Retrieval log entry (Policy §4): a material search, reproducible; a negative
       result states only that nothing responsive was found within the recorded scope.
- ESRC Source-protection record (EHS, CP-02).
- EPIT Public-interest and proportionality record (EHS, CP-03).
- CAPT An online capture with its hash and custody log (EGS Module 04).

A record is amended, never overwritten: the earlier body goes to its history. Rules the
suite states as checks (a reply's offerer is a person; an exception names who decided;
a resolved conflict names its resolving evidence; a negative result has a scope) are
enforced here.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai import suite_vocab as v
from app.core.time import utcnow_naive
from app.models.domain import CaseRecord

Date = Field(default=None, pattern=r"^\d{4}(-\d{2}(-\d{2})?)?([T ][\d:.]+Z?)?$")


class _Record(BaseModel):
    model_config = ConfigDict(extra="forbid")
    limitations: list[str] = []


class Gap(_Record):
    unresolved_question: str = Field(min_length=1)
    bears_on: list[str] = Field(min_length=1, description="claim or hypothesis ids the gap is tied to (Module 07 rule 1)")
    why_material: str = ""
    current_evidence: list[str] = []
    needed_record_or_testimony: str = ""
    record_existence: Literal[v.RECORD_EXISTENCE] | None = None  # type: ignore[valid-type]
    likely_custodian: str | None = None
    lawful_access_route: str | None = None
    priority: int | None = Field(default=None, ge=1)
    could_confirm_or_refute: str = ""
    depends_on: list[str] = []


class RightOfReply(_Record):
    subject_entity_id: str = Field(min_length=1)
    claim_ids: list[str] = Field(min_length=1)
    what_will_be_said: str = ""
    offered_by: str = ""
    offered_at: str | None = Date
    channel: str = ""
    deadline: str | None = Date
    status: Literal[v.REPLY_STATUSES]  # type: ignore[valid-type]
    response: str | None = None
    reflected_in: str | None = None
    exception_reason: str | None = None
    exception_decided_by: str | None = None

    @model_validator(mode="after")
    def _person(self) -> "RightOfReply":
        if self.status == "EXCEPTION":
            if not (self.exception_reason or "").strip() or not (self.exception_decided_by or "").strip():
                raise ValueError("An exception needs its reason and the person who decided it")
        elif not self.offered_by.strip():
            raise ValueError("Say who made the approach: a reply is offered by a person, never the model")
        if self.status == "RESPONDED" and not (self.response or "").strip():
            raise ValueError("A reply marked Responded needs the response")
        return self


class Hypothesis(_Record):
    hypothesis: str = Field(min_length=1)
    kind: Literal[v.HYPOTHESIS_KINDS]  # type: ignore[valid-type]
    supporting_evidence: list[str] = []
    contradicting_evidence: list[str] = []
    ambiguous_evidence: list[str] = []
    non_diagnostic_evidence: list[str] = []
    assumptions: list[str] = []
    falsifiers: list[str] = []
    missing_records: list[str] = []
    viable: bool = True
    assessment: str = ""


class Statement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    statement: str = Field(min_length=1)
    evidence_ids: list[str] = []


class Conflict(_Record):
    statement_a: Statement
    statement_b: Statement
    same_proposition: bool
    same_proposition_basis: str = Field(min_length=1, description="the Standard §12 test: same entity, event, period, definition, basis, version, question, scope")
    conflict_type: Literal[v.CONFLICT_TYPES]  # type: ignore[valid-type]
    resolution: str | None = None
    resolving_evidence: list[str] = []

    @model_validator(mode="after")
    def _resolved_by_evidence(self) -> "Conflict":
        if (self.resolution or "").strip() and not self.resolving_evidence:
            raise ValueError("A resolution names its resolving evidence; the more convenient account is never chosen")
        return self


class RetrievalLog(_Record):
    search_objective: str = Field(min_length=1)
    systems_searched: list[str] = Field(min_length=1)
    query_terms: list[str] = Field(min_length=1)
    searched_at: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}")
    results_reviewed: str = ""
    responsive_records: list[str] = []
    negative_result: bool = False
    scope: str = ""
    access_limits: list[str] = []

    @model_validator(mode="after")
    def _negative_has_scope(self) -> "RetrievalLog":
        if self.negative_result and (self.responsive_records or not self.scope.strip()):
            raise ValueError("A negative result states only that nothing responsive was found within a recorded scope: give the scope, list no records")
        return self


class SourceProtection(_Record):
    """CP-02. Holds no real name: the source is a code name."""
    story_id: str = ""
    source_code_name: str = Field(min_length=1)
    planned_step: Literal[v.PLANNED_STEPS]  # type: ignore[valid-type]
    risk_to_source: str = ""
    risk_to_journalist: str = ""
    exposure_routes: list[str] = []
    channel_offered: str = ""
    channel_risks_explained: str = ""
    channel_chosen: str = ""
    data_kept: list[dict[str, Any]] = []
    metadata_stripped: bool = False
    items_checked: list[dict[str, Any]] = []
    identifying_markers: list[dict[str, Any]] = []
    anonymity_reasons: str = ""
    deletion_requests: list[dict[str, Any]] = []
    breach_decision: Literal[v.BREACH_DECISIONS] = "PENDING"  # type: ignore[valid-type]
    steps_waived: list[str] = []
    decision_reason: str | None = None
    decided_by: str | None = None
    decided_at: str | None = Date

    @model_validator(mode="after")
    def _named_when_breached(self) -> "SourceProtection":
        if (self.breach_decision == "BREACH" or self.steps_waived) and not all(
                (x or "").strip() for x in (self.decided_by, self.decided_at, self.decision_reason)):
            raise ValueError("A breach, or any step waived, needs the person who decided, when, and why")
        return self


class PublicInterest(_Record):
    """CP-03, dated before publication; the decision is a named person's."""
    story_id: str = ""
    public_interest: Literal[v.PUBLIC_INTEREST_GROUNDS]  # type: ignore[valid-type]
    reasons: str = ""
    interest_of_the_public: str = ""
    elements: list[dict[str, Any]] = []
    public_figure_note: str | None = None
    child_exceptional_interest: str | None = None
    lawful_access_note: str | None = None
    harm_ids: list[str] = []
    written_at: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}")
    revised_at: str | None = Date
    retrospective: bool = False
    decision: Literal[v.PUBLICATION_DECISIONS] = "PENDING"  # type: ignore[valid-type]
    decided_by: str | None = None
    decided_at: str | None = Date
    decision_reason: str | None = None

    @model_validator(mode="after")
    def _person_decides(self) -> "PublicInterest":
        if self.decision != "PENDING" and not (self.decided_by or "").strip():
            raise ValueError("The decision is a named person's: say who decided")
        if self.public_interest == "OTHER" and not self.reasons.strip():
            raise ValueError("Public interest OTHER is stated in reasons")
        return self


class CustodyEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    person: str = Field(min_length=1)
    time: str = Field(min_length=1)
    action: str = Field(min_length=1)
    reason: str = ""
    storage: str = ""


class Capture(_Record):
    url: str = Field(min_length=1)
    captured_at: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}")
    hash_algorithm: Literal["SHA-256"] = "SHA-256"
    hash_value: str = Field(pattern=r"^[0-9a-f]{64}$")
    original_location: str = ""
    custody_log: list[CustodyEntry] = Field(min_length=1)
    content_verified: str = "not done by this system"
    outcome: Literal[v.GATHERING_OUTCOMES] = "OBTAINED"  # type: ignore[valid-type]
    failure_reason: str | None = None


KINDS: dict[str, type[_Record]] = {"GAP": Gap, "ROR": RightOfReply, "HYP": Hypothesis, "CFLT": Conflict, "RLOG": RetrievalLog,
                                   "ESRC": SourceProtection, "EPIT": PublicInterest, "CAPT": Capture}
KIND_NAMES = {"GAP": "Gap", "ROR": "Right of reply", "HYP": "Hypothesis", "CFLT": "Conflict", "RLOG": "Retrieval log",
              "ESRC": "Source protection (CP-02)", "EPIT": "Public interest (CP-03)", "CAPT": "Online capture"}


class CaseRecordError(ValueError):
    pass


def _validate(kind: str, body: dict[str, Any]) -> dict[str, Any]:
    model = KINDS.get(kind)
    if model is None:
        raise CaseRecordError(f"Unknown record kind {kind!r}: one of {', '.join(KINDS)}")
    try:
        return model.model_validate(body).model_dump()
    except ValidationError as exc:
        first = exc.errors()[0]
        where = ".".join(str(p) for p in first.get("loc", ()))
        raise CaseRecordError(f"{KIND_NAMES[kind]}: {where + ': ' if where else ''}{first.get('msg', 'is not valid').removeprefix('Value error, ')}") from exc


def create(db: Session, investigation_id: str, kind: str, body: dict[str, Any], created_by: str | None = None) -> CaseRecord:
    clean = _validate(kind, body)
    number = int(db.scalar(select(func.max(CaseRecord.number)).where(CaseRecord.investigation_id == investigation_id,
                                                                      CaseRecord.kind == kind)) or 0) + 1
    row = CaseRecord(investigation_id=investigation_id, kind=kind, number=number, record_id=f"{kind}-{number:04d}",
                     body=clean, history=[], created_by=created_by)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def amend(db: Session, row: CaseRecord, body: dict[str, Any], amended_by: str | None = None) -> CaseRecord:
    clean = _validate(row.kind, body)
    if clean == row.body:
        return row
    row.history = [*(row.history or []), {"body": row.body, "replaced_at": utcnow_naive().isoformat(), "replaced_by": amended_by}]
    row.body = clean
    db.commit()
    db.refresh(row)
    return row


def list_records(db: Session, investigation_id: str, kind: str | None = None) -> list[CaseRecord]:
    stmt = select(CaseRecord).where(CaseRecord.investigation_id == investigation_id)
    if kind:
        stmt = stmt.where(CaseRecord.kind == kind)
    return list(db.scalars(stmt.order_by(CaseRecord.kind, CaseRecord.number)))


def serialize(row: CaseRecord) -> dict[str, Any]:
    return {"id": row.id, "investigation_id": row.investigation_id, "kind": row.kind, "kind_name": KIND_NAMES[row.kind],
            "record_id": row.record_id, "body": row.body, "history": row.history or [], "created_by": row.created_by,
            "created_at": row.created_at, "updated_at": row.updated_at}
