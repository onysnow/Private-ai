"""Is it real? (ADR-0023, research §9): what the app found about a case file's origin, and what a person decided.

The system records findings (content credentials, the outlet's record, hints); only a person sets a status, with what
they checked and why. Every check and every decision is a row in `authenticity_checks`, which is never changed or
deleted: the history is append-only, and any status can be disputed by a later decision.
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class AuthenticityItem(Base):
    """One case file's standing. `status` is verified_origin / unverified / likely_synthetic / confirmed_synthetic /
    disputed; only a person sets anything but unverified. `role` is "events" (it is used to show what happened) or
    "subject" (it is the thing the story is about: a fake that circulated proves it circulated, never what it shows).
    `about_evidence` lists the evidence records that are about the item itself ("this image circulated from 17 March,
    posted by X"): those keep supporting their claims whatever the status; every other record from the item is
    evidence of events, and supports nothing while the item is marked likely or confirmed synthetic (DECISIONS.md
    call 8). `findings` is the latest examination (provenance, source, hints); `suite_restore` keeps each evidence
    record's suite authenticity_status from before a synthetic decision set it to DISPUTED, so undoing it restores it."""

    __tablename__ = "authenticity_items"
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), primary_key=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    status: Mapped[str] = mapped_column(String(24), default="unverified", index=True)
    role: Mapped[str] = mapped_column(String(16), default="events")
    source_protected: Mapped[bool] = mapped_column(Boolean, default=False)
    decided_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    checked: Mapped[list] = mapped_column(JSON, default=list)
    platform_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    findings: Mapped[dict] = mapped_column(JSON, default=dict)
    about_evidence: Mapped[list] = mapped_column(JSON, default=list)
    suite_restore: Mapped[dict] = mapped_column(JSON, default=dict)
    examined_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class AuthenticityCheck(Base):
    """One line of an item's history. `actor` is "system" (a finding) or "person" (a decision, a consent, a setting);
    `kind` names it (provenance, source, hints, similarity, outside, decision, role, protected, flag). `method`, `tool`
    and `version` say how; `input_sha256` the exact bytes looked at; `local` whether anything left this computer;
    `result` keeps the details and `text` the line as shown."""

    __tablename__ = "authenticity_checks"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    kind: Mapped[str] = mapped_column(String(24))
    actor: Mapped[str] = mapped_column(String(16))
    person: Mapped[str | None] = mapped_column(String(255), nullable=True)
    method: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tool: Mapped[str | None] = mapped_column(String(255), nullable=True)
    version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    input_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    local: Mapped[bool] = mapped_column(Boolean, default=True)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, index=True)
