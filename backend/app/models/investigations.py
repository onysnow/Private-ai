"""Investigation container and reporter-authored timeline events.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import JSON, Boolean, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class Investigation(Base):
    __tablename__ = "investigations"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The case's own question in the reporter's words ("Who really owns the
    # harbour land?"): the title of Case home, and what exports open with.
    question: Mapped[str | None] = mapped_column(Text, nullable=True)
    # True only for the single seeded demo investigation (see
    # app/services/demo_seed.py) -- lets the frontend offer a "hide demo
    # data" toggle without guessing from the name/description.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # The investigation's type as the reporter chose it: catalogue area keys
    # (app/patterns/investigation_type.py). None while the app chooses.
    type_areas: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    # This case's default AI run settings (mockup AI_2 "Save as this case's default"): flags, run options,
    # premises, the reason given and when (app/services/run_plan.py).
    ai_run_profile: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # When the Red Flag rules last ran on this case: {"at", "digest" of the records they read, "cannot_run"}
    # (app/patterns/engine.py). Reading the flags never runs them; None until they first run.
    red_flag_run: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # When a backup of the case was last downloaded or made in the console (the inbox's backup reminder).
    last_backup_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class TimelineEvent(Base):
    __tablename__ = "timeline_events"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    title: Mapped[str] = mapped_column(String(512))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_start: Mapped[str] = mapped_column(String(32), index=True)
    date_end: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    precision: Mapped[str] = mapped_column(String(32), default="day", index=True)
    verification_status: Mapped[str] = mapped_column(String(32), default="asserted", index=True)
    # How well the event itself is substantiated, on Bellingcat's grading
    # scale (ADR-0005, line 5; app/services/timeline.py EVENT_GRADES); the
    # verification status above is about its date. None until graded.
    grade: Mapped[str | None] = mapped_column(String(16), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(ForeignKey("entities.id"), nullable=True, index=True)
    relationship_entity_id: Mapped[str | None] = mapped_column(ForeignKey("entities.id"), nullable=True, index=True)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"), nullable=True, index=True)
    evidence_id: Mapped[str | None] = mapped_column(ForeignKey("evidence.id"), nullable=True, index=True)
    claim_id: Mapped[str | None] = mapped_column(ForeignKey("claims.id"), nullable=True, index=True)
    lead_id: Mapped[str | None] = mapped_column(ForeignKey("leads.id"), nullable=True, index=True)
    dataset: Mapped[str] = mapped_column(String(255), default="reporter", index=True)
    origin: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
