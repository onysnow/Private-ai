from fastapi.testclient import TestClient

from app.main import app
from app.db.session import SessionLocal
from app.services.exports import build_investigation_export

client = TestClient(app)


def _must(response, status=200):
    assert response.status_code == status, response.text
    return response.json() if response.content else None


def test_restore_preview_reports_existing_record_conflicts_without_mutation():
    inv = _must(client.post('/api/investigations', json={'name': 'Restore preview conflict'}))
    source = _must(client.post('/api/sources', json={
        'investigation_id': inv['id'], 'title': 'Preview source', 'source_type': 'web'
    }))
    _must(client.post('/api/evidence', json={
        'source_id': source['id'], 'quote': 'Exact preview evidence', 'locator': 'paragraph 2'
    }))

    with SessionLocal() as db:
        package, _ = build_investigation_export(db, inv['id'], include_documents=True)

    before = _must(client.get('/api/investigations'))
    preview = _must(client.post('/api/backups/preview', files={
        'file': ('preview.jwbackup.zip', package, 'application/zip')
    }))
    after = _must(client.get('/api/investigations'))

    assert preview['can_restore'] is False
    assert preview['investigation']['id'] == inv['id']
    assert preview['investigation']['name'] == 'Restore preview conflict'
    assert preview['record_counts']['investigations'] == 1
    assert preview['record_counts']['sources'] == 1
    assert preview['record_counts']['evidence'] == 1
    assert any(c['table'] == 'investigations' and c['id'] == inv['id'] for c in preview['conflicts'])
    assert any(c['table'] == 'sources' and c['id'] == source['id'] for c in preview['conflicts'])
    assert before == after


def test_restore_preview_counts_the_document_files_the_backup_could_not_include(tmp_path, monkeypatch):
    """The manifest lists them as missing_document_files
    (build_investigation_export); the preview used to read another key and
    always said none were missing."""
    from pathlib import Path

    from app.core.config import settings
    from app.models.domain import Document

    monkeypatch.setattr(settings, 'document_storage_dir', str(tmp_path))
    inv = _must(client.post('/api/investigations', json={'name': 'Restore preview missing file'}))
    doc = _must(client.post('/api/documents/upload', data={'investigation_id': inv['id'], 'title': 'Memo'},
                            files={'file': ('memo.txt', b'The memo.\n', 'text/plain')}))
    with SessionLocal() as db:
        Path(db.get(Document, doc['id']).storage_path).unlink()
        package, manifest = build_investigation_export(db, inv['id'], include_documents=True)
    assert [row['document_id'] for row in manifest['missing_document_files']] == [doc['id']]

    preview = _must(client.post('/api/backups/preview', files={'file': ('preview.jwbackup.zip', package, 'application/zip')}))
    assert preview['missing_document_count'] == 1
    assert 'Backup references 1 document file(s) that were unavailable when exported; metadata/extracted text can still be restored.' in preview['warnings']
