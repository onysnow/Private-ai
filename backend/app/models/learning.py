"""Flip cards for Practise in Learn (research Knowledge §6 "Needs": a small table learning_cards, per reporter, local).

One row per reporter per card: an indicator from the catalogue or a term from the glossary. The card's review state
is a step on a fixed-interval ladder (app/services/learning.py); no investigation owns it, so it belongs to no case
and travels in no case's backup.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import JSON, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class LearningCard(Base):
    __tablename__ = "learning_cards"
    __table_args__ = (UniqueConstraint("owner", "kind", "ref", name="uq_learning_card_owner_kind_ref"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    # Who practises it: the request's actor ("local-owner" on the workstation, a persisted user's id remotely).
    owner: Mapped[str] = mapped_column(String(255), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # indicator / term
    ref: Mapped[str] = mapped_column(String(255))  # indicator id (BO-007) or the term as the glossary spells it
    # The catalogue areas it belongs to, kept so a deck is chosen without reading the catalogue again.
    areas: Mapped[list] = mapped_column(JSON, default=list)
    # How it was added: the reporter's ＋ Flip card, or from practising an area.
    added_from: Mapped[str] = mapped_column(String(32), default="flip_card")
    step: Mapped[int] = mapped_column(Integer, default=0)  # the rung of the ladder it reached
    interval_days: Mapped[int] = mapped_column(Integer, default=0)
    due_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, index=True)
    last_answer: Mapped[str | None] = mapped_column(String(16), nullable=True)  # again / hard / good / easy
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reviews: Mapped[int] = mapped_column(Integer, default=0)
    lapses: Mapped[int] = mapped_column(Integer, default=0)  # times answered Again after it had climbed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
