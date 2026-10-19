"""Requests and replies of Keep › Safety & data (app/api/routes_safety.py, app/services/safety.py)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.responses import ResponseModel, Timestamp

Mode = Literal["OFF", "ASK", "AUTOMATIC"]
Answer = Literal["YES", "NO", "NOT_SURE"]
QuestionId = Literal["threats", "doxxing"]


class ServiceModeIn(BaseModel):
    """A case's mode for one outside service (research Keep §7: Off / Ask first / Automatic)."""
    model_config = ConfigDict(extra="forbid")
    service: str = Field(min_length=1, max_length=64)
    mode: Mode


class SafetyAnswerIn(BaseModel):
    """The reporter's answer to an "Only you can say" question; null takes it back."""
    model_config = ConfigDict(extra="forbid")
    question: QuestionId
    answer: Answer | None = None


class SafetyBackupIn(BaseModel):
    """Back up now. A passphrase protects the backup (ADR-0015); null saves it without one, which the reporter
    chooses on purpose. The passphrase is used to seal the file and dropped: never stored, logged or sent back."""
    model_config = ConfigDict(extra="forbid")
    passphrase: str | None = Field(None, min_length=1, max_length=1024)


class OutboundRequestOut(ResponseModel):
    """One request that left this computer: when, to whom, the value word for word, and why."""
    id: str
    service: str
    service_name: str
    kind: str
    value_sent: str
    value_kind: str
    reason: str
    started_by: str
    documents_sent: int
    created_at: Timestamp


class OutboundLogOut(ResponseModel):
    items: list[OutboundRequestOut]
    total: int
    since: Timestamp | None


class SafetyTotalsOut(ResponseModel):
    requests: int
    services_reached: int
    documents_sent: int
    ai_calls_outside: int


class SentKindOut(ResponseModel):
    value_kind: str
    count: int


class SafetyServiceOut(ResponseModel):
    service: str
    name: str
    line: str
    mode: Mode
    locked_reason: str | None
    # Whether its key is set (connectors); null for the outside AI.
    configured: bool | None
    sent_count: int
    sent_kinds: list[SentKindOut]
    ever_used: bool
    last: list[OutboundRequestOut]


class RecordsStoreOut(ResponseModel):
    total: int
    claims: int


class DocumentsStoreOut(ResponseModel):
    files: int
    size_bytes: int
    missing: int


class BackupsStoreOut(ResponseModel):
    count: int
    last_at: Timestamp | None
    last_size_bytes: int | None
    last_sha256: str | None
    encrypted: bool


class KeysStoreOut(ResponseModel):
    set: int
    total: int


class SecurityLogStoreOut(ResponseModel):
    # Null when the caller may not read the server's own log (remote, not an admin).
    events: int | None
    size_bytes: int | None
    keep_days: int


class PrivateAiStoreOut(ResponseModel):
    enabled: bool
    provider: str | None
    model: str | None
    on_this_computer: bool | None
    outside_allowed: bool


class SafetyStoresOut(ResponseModel):
    records: RecordsStoreOut
    documents: DocumentsStoreOut
    backups: BackupsStoreOut
    service_keys: KeysStoreOut
    security_log: SecurityLogStoreOut
    private_ai: PrivateAiStoreOut


class SafetyAccessOut(ResponseModel):
    mode: str
    remote_api_enabled: bool
    refused_24h: int | None
    needs_attention: bool
    restore_api_enabled: bool


class SafetyDeleteOut(ResponseModel):
    record_total: int
    files_to_delete: int
    shared_files_kept: int
    can_delete: bool


class SafetyQuestionOut(ResponseModel):
    id: QuestionId
    text: str
    indicators: list[str]
    answer: Answer | None
    answered_at: Timestamp | None


class SafetySummaryOut(ResponseModel):
    """Keep › Safety & data in one reply: totals for the period, the six stores, the outside services with their
    modes, who can reach the case, what deleting it removes, and the reporter's private answers."""
    investigation_id: str
    investigation_name: str
    since: Timestamp | None
    totals: SafetyTotalsOut
    stores: SafetyStoresOut
    services: list[SafetyServiceOut]
    access: SafetyAccessOut
    delete: SafetyDeleteOut
    questions: list[SafetyQuestionOut]
