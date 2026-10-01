"""Background jobs: slow work (reading a document, OCR) that runs after the
request that asked for it has returned (ADR-0004, Foundation Fixes fix 1).

One row per piece of work. The row is what the screen polls; the queue that
actually runs it (Procrastinate on PostgreSQL, or in-process on SQLite) is an
implementation detail recorded in ``queue_job_id``. Rows are per-deployment
state, not investigation content, so backups do not carry them.
"""

from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid

JOB_STATUSES = ("queued", "running", "succeeded", "failed", "cancelled")
FINISHED_JOB_STATUSES = ("succeeded", "failed", "cancelled")


class BackgroundJob(Base):
    __tablename__ = "background_jobs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    kind: Mapped[str] = mapped_column(String(64), index=True)
    investigation_id: Mapped[str | None] = mapped_column(ForeignKey("investigations.id"), nullable=True, index=True)
    # What the job works on, e.g. ("document", <document id>).
    subject_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    subject_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    progress: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-100 when known
    message: Mapped[str | None] = mapped_column(Text, nullable=True)       # plain-language step
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    runner: Mapped[str] = mapped_column(String(16), default="inline")      # inline | procrastinate
    queue_job_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)
