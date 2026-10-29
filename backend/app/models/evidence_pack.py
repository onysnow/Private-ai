"""Each evidence pack made (ADR-0024; Check a pack, mockup CHECK_4): its own list of files and their SHA-256, kept when
it is made, so a pack someone sends back can be checked against the list made here, not only against its own."""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class EvidencePack(Base):
    """`files` is {path in the pack: SHA-256}, `manifest` the MANIFEST.sha256 as written, `exhibits` one entry per
    exhibit: [{number, evidence_id, document_id, page, quote, picture, claims}] (what is needed to draw its picture
    again and to say what rests on it)."""

    __tablename__ = "evidence_packs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    title: Mapped[str] = mapped_column(Text, default="")
    draft: Mapped[bool] = mapped_column(Boolean, default=False)
    made_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    manifest: Mapped[str] = mapped_column(Text)
    manifest_sha256: Mapped[str] = mapped_column(String(64))
    files: Mapped[dict] = mapped_column(JSON, default=dict)
    exhibits: Mapped[list] = mapped_column(JSON, default=list)
    # The fingerprint of the key it was signed with, and whether it went out as a PDF too.
    key_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pdf: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, index=True)
