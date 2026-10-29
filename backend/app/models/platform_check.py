"""Does it work today? (mockup WORKS_1, app/services/platform_checks.py): one row per try of a platform's public test
item. Not part of any case: the platforms are the same for every case on this computer."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class PlatformCheck(Base):
    """`state` is works, partly (saved with something missing: `missing`) or broken; `detail` says what came back."""

    __tablename__ = "platform_checks"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    platform: Mapped[str] = mapped_column(String(32), index=True)
    test_url: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(16))
    detail: Mapped[str] = mapped_column(Text, default="")
    missing: Mapped[list] = mapped_column(JSON, default=list)
    seconds: Mapped[float] = mapped_column(Float, default=0.0)
    tool: Mapped[str] = mapped_column(String(64), default="")
    checked_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, index=True)
