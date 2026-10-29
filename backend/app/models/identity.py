"""Persisted API users and investigation memberships.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import Boolean, Integer, String, DateTime, ForeignKey, Text, UniqueConstraint
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
    # The key's last two characters, to tell keys apart on screen, and when it stops working (ADR-0016; None: no
    # expiry, keys made before expiry was kept).
    token_hint: Mapped[str | None] = mapped_column(String(8), nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class LocalProfile(Base):
    """The person who works on this computer (ADR-0016, mockups ACCOUNT_1-4): one row. Their name goes on their
    decisions; the passphrase, recovery words and PIN are kept only as Argon2id hashes; the backup key's secret half
    only encrypted with the passphrase and with the recovery words (age)."""
    __tablename__ = "local_profile"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    protection: Mapped[str] = mapped_column(String(16), default="none")  # none | passphrase
    passphrase_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recovery_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    backup_recipient: Mapped[str | None] = mapped_column(String(128), nullable=True)
    identity_by_passphrase: Mapped[str | None] = mapped_column(Text, nullable=True)
    identity_by_recovery: Mapped[str | None] = mapped_column(Text, nullable=True)
    idle_minutes: Mapped[int] = mapped_column(Integer, default=10)  # 0: never
    lock_on_hide: Mapped[bool] = mapped_column(Boolean, default=True)
    lock_on_sleep: Mapped[bool] = mapped_column(Boolean, default=True)
    quick_pin: Mapped[bool] = mapped_column(Boolean, default=False)
    passphrase_set_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    recovery_set_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    disk_answer: Mapped[str | None] = mapped_column(String(16), nullable=True)  # the reporter's own answer when the app cannot tell
    # The key evidence packs are signed with (app/services/pack_signing.py): Ed25519, raw, base64; made at the first pack.
    signing_public: Mapped[str | None] = mapped_column(String(64), nullable=True)
    signing_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    signing_created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)


class InvestigationMembership(Base):
    __tablename__ = "investigation_memberships"
    __table_args__ = (UniqueConstraint("user_id", "investigation_id", name="uq_investigation_membership_user_inv"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("app_users.id"), index=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    role: Mapped[str] = mapped_column(String(32), default="viewer", index=True)  # viewer/reporter/admin
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
