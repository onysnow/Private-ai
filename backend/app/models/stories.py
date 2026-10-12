"""What the story needs (research Act §7, mockup ACT_2): the story's one-line thesis, the sections it will say, the
claims under each section, the publication gates a person records, and the decision that it is ready to run.

A branch is only as strong as its weakest claim; that is worked out on read (app/services/stories.py), not stored.
One story per case for now (an open question for Ony: one or several).
"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class Story(Base):
    __tablename__ = "stories"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True, unique=True)
    thesis: Mapped[str] = mapped_column(Text, default="")
    # The write-up the story is told in (one), if started.
    writeup_id: Mapped[str | None] = mapped_column(ForeignKey("writeups.id"), nullable=True)
    # Gates a person records: {"right_of_reply": {"to": "...", "on": "YYYY-MM-DD"}, "legal_read": {"by": "...", "on": "..."}}.
    gates: Mapped[dict] = mapped_column(JSON, default=dict)
    ready_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ready_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)


class StorySection(Base):
    __tablename__ = "story_sections"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    story_id: Mapped[str] = mapped_column(ForeignKey("stories.id"), index=True)
    title: Mapped[str] = mapped_column(String(512))
    position: Mapped[int] = mapped_column(Integer, default=0)


class StoryClaim(Base):
    __tablename__ = "story_claims"
    __table_args__ = (UniqueConstraint("section_id", "claim_id", name="uq_story_claim"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    section_id: Mapped[str] = mapped_column(ForeignKey("story_sections.id"), index=True)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
