"""Persisted API users and investigation memberships.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class AppUser(Base):
    __tablename__ = "app_users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    display_name: Mapped[str] = mapped_column(String(255), index=True)
    token_digest: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    global_role: Mapped[str] = mapped_column(String(32), default="member", index=True)  # member/admin
    disabled: Mapped[bool] = mapped_column(default=False, index=True)
    token_created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    token_last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    token_rotated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    token_revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class InvestigationMembership(Base):
    __tablename__ = "investigation_memberships"
    __table_args__ = (UniqueConstraint("user_id", "investigation_id", name="uq_investigation_membership_user_inv"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("app_users.id"), index=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    role: Mapped[str] = mapped_column(String(32), default="viewer", index=True)  # viewer/reporter/admin
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
