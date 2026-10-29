"""Files the Workbench makes from a case file (ADR-0021), and what a photo says about itself.

An evidence file is never written over. Anything made from it (a viewable copy of a RAW or HEIC photo, a redacted PDF,
a cleaned recording, a blurred picture, a clip) is a new file with its own row here: the edit trail. Each row names the
file it was made from and that file's SHA-256, its own SHA-256, the operation and every setting, the code that did it
(the tool and the commit it was built from) and any model with its SHA-256, who asked, when, and the job.
"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class DerivedFile(Base):
    """One file made from a case file. `parent_id` is set when it was made from another derived file (a clip of a
    cleaned recording), and `parent_sha256` is always the exact bytes it was made from. `operation` is one of
    `preview`, `redact`, `clean`, `blur`, `clip`, `ocr_layer`, `sign`, …; `params` holds every setting used."""

    __tablename__ = "derived_files"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("derived_files.id"), nullable=True, index=True)
    parent_sha256: Mapped[str] = mapped_column(String(64))
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    size: Mapped[int] = mapped_column(Integer)
    mime_type: Mapped[str] = mapped_column(String(128))
    storage_path: Mapped[str] = mapped_column(String(1024))
    operation: Mapped[str] = mapped_column(String(32), index=True)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    tool: Mapped[str] = mapped_column(String(255))
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    job_id: Mapped[str | None] = mapped_column(String, nullable=True)  # jobs stay on the server; a backup keeps the id
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class DocumentPhoto(Base):
    """What a photo file says about itself, read from its EXIF, XMP and IPTC: never a finding until a person confirms
    it. `claims` holds the fields the file has (camera, serial, software, capture time, GPS, …); `date_tag` names the
    tag the capture time came from ("Date/Time Original", or only "Date/Time Modified", which is weaker); `kind` is the
    file's format (JPEG, PNG, HEIC, or a RAW format such as CR2 or DNG)."""

    __tablename__ = "document_photos"
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), primary_key=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    claims: Mapped[dict] = mapped_column(JSON, default=dict)
    date_tag: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tool: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
