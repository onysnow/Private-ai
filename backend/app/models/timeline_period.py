"""Named periods of a case's timeline (mockups TIME_1 and TIME_8; research §2.9): a stretch of time the reporter names
("Set-up 2016", "The money 2018"), drawn as a tint over the lanes, with the reporter's own summary of it."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class TimelinePeriod(Base):
    """`date_start` and `date_end` are ISO dates, months or years, as on a timeline event; `summary` is the reporter's."""

    __tablename__ = "timeline_periods"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    date_start: Mapped[str] = mapped_column(String(32))
    date_end: Mapped[str] = mapped_column(String(32))
    summary: Mapped[str] = mapped_column(Text, default="")
    made_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
