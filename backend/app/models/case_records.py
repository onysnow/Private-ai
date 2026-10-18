"""The Authority System Suite's own records kept for a case (the app-side suite gaps):
gaps, right of reply, hypotheses, conflicts, the retrieval log (with negative search
results), the CP-02 source-protection and CP-03 publication-ethics records, and the
custody log of an online capture.

One table, because each is the suite's JSON record as its schema writes it; the kind
says which schema (app/services/case_records.py validates each). ``record_id`` is the
suite's own id (GAP-0001, ROR-0001 …), numbered per case and kind.
"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class CaseRecord(Base):
    __tablename__ = "case_records"
    __table_args__ = (UniqueConstraint("investigation_id", "record_id", name="uq_case_record_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16), index=True)
    number: Mapped[int] = mapped_column(Integer)
    record_id: Mapped[str] = mapped_column(String(32), index=True)
    body: Mapped[dict] = mapped_column(JSON, default=dict)
    # Every earlier body, oldest first, with who changed it and when: a record is
    # amended, never overwritten (the suite's append-only trail).
    history: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)
