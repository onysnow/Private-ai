from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db.session import Base, SessionLocal
from app.models.domain import Document, DocumentChunk, Evidence, ExtractionCandidate, Source
from app.services.exports import build_investigation_export, inspect_export, restore_investigation_export

client = TestClient(app)


def _must(response, status=200):
    assert response.status_code == status, response.text
    return response.json() if response.content else None


def test_document_extraction_lineage_round_trips_through_portable_backup(tmp_path):
    investigation = _must(client.post('/api/investigations', json={'name': 'Lineage backup case'}))
    inv_id = investigation['id']
    doc = _must(client.post(
        '/api/documents/upload',
        data={'investigation_id': inv_id, 'title': 'Board minutes'},
        files={'file': ('minutes.txt', b'Board approved the filing.\n\nUnrelated hallway note.', 'text/plain')},
    ))

    evidence_candidates = _must(client.get(
        f"/api/documents/{doc['id']}/candidates", params={'candidate_type': 'evidence'}
    ))
    assert len(evidence_candidates) >= 2
    accepted_candidate = evidence_candidates[0]
    rejected_candidate = evidence_candidates[1]

    accepted_review = _must(client.post(
        f"/api/extraction-candidates/{accepted_candidate['id']}/review",
        json={'decision': 'accept', 'note': 'Reporter verified exact minutes text'},
    ))
    accepted_evidence = accepted_review['record']
    _must(client.post(
        f"/api/extraction-candidates/{rejected_candidate['id']}/review",
        json={'decision': 'reject', 'note': 'Reporter excluded irrelevant note'},
    ))

    with SessionLocal() as db:
        package, manifest = build_investigation_export(db, inv_id, include_documents=True)

    lineage = manifest['lineage_integrity']
    assert lineage['valid'] is True
    assert lineage['document_count'] == 1
    assert lineage['chunk_count'] >= 2
    assert lineage['candidate_status_counts']['accepted'] >= 1
    assert lineage['candidate_status_counts']['rejected'] >= 1
    assert lineage['accepted_record_counts']['evidence'] >= 1

    inspected_manifest, records = inspect_export(package)
    assert inspected_manifest['lineage_integrity'] == lineage
    exported_accepted = next(row for row in records['extraction_candidates'] if row['id'] == accepted_candidate['id'])
    exported_rejected = next(row for row in records['extraction_candidates'] if row['id'] == rejected_candidate['id'])
    exported_chunk = next(row for row in records['document_chunks'] if row['id'] == exported_accepted['chunk_id'])
    assert exported_accepted['accepted_record_type'] == 'evidence'
    assert exported_accepted['accepted_record_id'] == accepted_evidence['id']
    assert exported_accepted['reviewer_note'] == 'Reporter verified exact minutes text'
    assert exported_accepted['reviewed_at'] is not None
    assert exported_rejected['review_status'] == 'rejected'
    assert exported_rejected['accepted_record_id'] is None
    assert exported_rejected['reviewer_note'] == 'Reporter excluded irrelevant note'
    assert accepted_evidence['locator'].startswith(exported_chunk['locator'] + '@chars:')
    assert exported_chunk['text'] == accepted_evidence['quote']

    engine = create_engine(f"sqlite:///{tmp_path / 'lineage-restored.db'}", connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    FreshSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    storage = tmp_path / 'restored-documents'
    with FreshSession() as db:
        restored = restore_investigation_export(db, package, storage)
        assert restored['investigation_id'] == inv_id

        restored_doc = db.get(Document, doc['id'])
        restored_source = db.get(Source, doc['source_id'])
        restored_accepted = db.get(ExtractionCandidate, accepted_candidate['id'])
        restored_rejected = db.get(ExtractionCandidate, rejected_candidate['id'])
        restored_evidence = db.get(Evidence, accepted_evidence['id'])
        restored_chunk = db.get(DocumentChunk, accepted_candidate['chunk_id'])

        assert restored_doc is not None and Path(restored_doc.storage_path).read_bytes() == b'Board approved the filing.\n\nUnrelated hallway note.'
        assert restored_source is not None and restored_doc.source_id == restored_source.id
        assert restored_chunk is not None and restored_chunk.document_id == restored_doc.id
        assert restored_accepted is not None and restored_accepted.chunk_id == restored_chunk.id
        assert restored_accepted.review_status == 'accepted'
        assert restored_accepted.accepted_record_type == 'evidence'
        assert restored_accepted.accepted_record_id == restored_evidence.id
        assert restored_accepted.reviewer_note == 'Reporter verified exact minutes text'
        assert restored_accepted.reviewed_at is not None
        assert restored_evidence.locator.startswith(restored_chunk.locator + '@chars:')
        assert restored_evidence.quote == restored_chunk.text
        assert restored_rejected is not None and restored_rejected.review_status == 'rejected'
        assert restored_rejected.accepted_record_id is None
        assert restored_rejected.reviewer_note == 'Reporter excluded irrelevant note'
