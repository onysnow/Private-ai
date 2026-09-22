"""Uploaded documents, extracted chunks, extraction candidates, and the OpenAleph corpus bridge.

Part of the STRUCT-0024 split; see app/models/base.py.
"""

from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, JSON, Float, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.time import utcnow_naive
from app.db.session import Base
from app.models.base import uid


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    filename: Mapped[str] = mapped_column(String(512))
    mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    storage_path: Mapped[str] = mapped_column(Text)
    extraction_status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    extraction_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class InvestigationCorpusBinding(Base):
    __tablename__ = "investigation_corpus_bindings"
    __table_args__ = (UniqueConstraint("investigation_id", "provider", name="uq_investigation_corpus_provider"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    provider: Mapped[str] = mapped_column(String(64), default="openaleph", index=True)
    collection_id: Mapped[str] = mapped_column(String(512), index=True)
    foreign_id: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    collection_label: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)


class DocumentCorpusSync(Base):
    __tablename__ = "document_corpus_syncs"
    __table_args__ = (UniqueConstraint("document_id", "provider", name="uq_document_corpus_provider"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    provider: Mapped[str] = mapped_column(String(64), default="openaleph", index=True)
    collection_id: Mapped[str] = mapped_column(String(512), index=True)
    provider_record_id: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_json: Mapped[dict] = mapped_column(JSON, default=dict)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)


class OpenAlephOperationFailure(Base):
    """Server-side trace of a failed OpenAleph pipeline operation (STRUCT-0027).

    Distinct from DocumentCorpusSync.error (which tracks the document-sync
    operation's own current state) because this covers operations that have
    no single row to attach an error to -- collection setup can fail before
    any InvestigationCorpusBinding exists, and review-refresh/evidence-import/
    entity-import are one-shot actions, not a persistent per-document state
    machine. Rows here are purely diagnostic: nothing reads them to drive
    behavior, so recording a failure is always safe to add without changing
    any existing control flow.
    """
    __tablename__ = "openaleph_operation_failures"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), nullable=True, index=True)
    operation: Mapped[str] = mapped_column(String(64), index=True)
    error: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive, index=True)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    __table_args__ = (UniqueConstraint("document_id", "locator", name="uq_document_chunk_locator"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    locator: Mapped[str] = mapped_column(String(255), index=True)
    page_number: Mapped[int | None] = mapped_column(nullable=True, index=True)
    ordinal: Mapped[int] = mapped_column(default=0, index=True)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)


class ExtractionCandidate(Base):
    __tablename__ = "extraction_candidates"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    investigation_id: Mapped[str] = mapped_column(ForeignKey("investigations.id"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    chunk_id: Mapped[str | None] = mapped_column(ForeignKey("document_chunks.id"), nullable=True, index=True)
    candidate_type: Mapped[str] = mapped_column(String(32), index=True)  # entity/claim/evidence
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    review_status: Mapped[str] = mapped_column(String(32), default="proposed", index=True)
    accepted_record_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    accepted_record_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    reviewer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow_naive)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
