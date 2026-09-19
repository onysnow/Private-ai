from sqlalchemy import select
import pytest

from app.core.config import settings
from app.db.session import Base, SessionLocal, engine
from app.models.domain import ExtractionCandidate, Investigation
from app.services.documents import ingest_document


def _ingest(tmp_path, *, local_entities: bool):
    old = settings.enable_local_entity_suggestions
    settings.enable_local_entity_suggestions = local_entities
    try:
        db = SessionLocal()
        inv = Investigation(name="Extraction ownership")
        db.add(inv); db.commit(); db.refresh(inv)
        doc = ingest_document(
            db,
            investigation_id=inv.id,
            title="Ownership note",
            filename="note.txt",
            mime_type="text/plain",
            data=b"Jordan Rivera worked with Acme Holdings Corporation. The filing reported that the company paid a consultant.",
            storage_dir=tmp_path / "documents",
        )
        candidates = db.scalars(
            select(ExtractionCandidate).where(ExtractionCandidate.document_id == doc.id)
        ).all()
        return db, doc, candidates
    finally:
        settings.enable_local_entity_suggestions = old


def test_standalone_fallback_keeps_local_entity_suggestions(tmp_path):
    db, doc, candidates = _ingest(tmp_path, local_entities=True)
    try:
        assert doc.extraction_status == "complete"
        assert any(row.candidate_type == "entity" for row in candidates)
        assert any(row.candidate_type == "evidence" for row in candidates)
        assert any(row.candidate_type == "claim" for row in candidates)
    finally:
        db.close()


def test_integrated_mode_disables_duplicate_local_name_detector_only(tmp_path):
    db, doc, candidates = _ingest(tmp_path, local_entities=False)
    try:
        assert doc.extraction_status == "complete"
        assert not any(row.candidate_type == "entity" for row in candidates)
        # Local locator-preserving text/claim fallback remains available until live
        # OpenAleph extraction has passed the full production integration gate.
        assert any(row.candidate_type == "evidence" for row in candidates)
        assert any(row.candidate_type == "claim" for row in candidates)
    finally:
        db.close()
