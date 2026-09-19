"""Covers STRUCT-0021: routes_documents.py's OpenAleph corpus sync/review/
import endpoints (and a few plain document endpoints alongside them) were
the least-covered route module after the Stage E split -- almost entirely
because their 404/409/success paths were only ever exercised at the
service layer (tests/test_openaleph_corpus_bridge.py calls
sync_document_to_openaleph/ensure_openaleph_collection directly), never
through the actual HTTP route.

These tests exercise the ROUTE layer itself: each endpoint's own
try/except branches, HTTPException status codes, and response shaping.
The underlying OpenAleph service functions are monkeypatched at the
route-module import site (matching tests/test_openaleph_operation_failures.py's
established pattern -- route modules call these names as bare globals
looked up from their own namespace, so patching the service module itself
would not be observed here), since exercising every real OpenAleph
client/HTTP interaction is already the service-level suite's job.
"""
from fastapi.testclient import TestClient

from app.db.session import Base, SessionLocal, engine
from app.main import app
from app.models.domain import Document, DocumentCorpusSync, Source

client = TestClient(app)


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def _new_investigation(name: str) -> str:
    r = client.post('/api/investigations', json={'name': name})
    assert r.status_code == 200, r.text
    return r.json()['id']


def _new_document(inv: str, title: str) -> str:
    r = client.post(
        '/api/documents/upload',
        data={'investigation_id': inv, 'title': title},
        files={'file': (f'{title}.txt', b'Some document body.', 'text/plain')},
    )
    assert r.status_code == 200, r.text
    return r.json()['id']


# --- get_openaleph_document_sync (GET /documents/{id}/corpus/openaleph) ---

def test_get_document_sync_404_for_unknown_document():
    r = client.get('/api/documents/does-not-exist/corpus/openaleph')
    assert r.status_code == 404, r.text


def test_get_document_sync_returns_real_sync_row():
    inv = _new_investigation('OpenAleph route coverage: sync get')
    doc_id = _new_document(inv, 'memo')
    with SessionLocal() as db:
        db.add(DocumentCorpusSync(
            document_id=doc_id, investigation_id=inv, provider='openaleph',
            collection_id='col-1', status='synced', provider_record_id='rec-1',
        ))
        db.commit()

    r = client.get(f'/api/documents/{doc_id}/corpus/openaleph')
    assert r.status_code == 200, r.text
    body = r.json()['sync']
    assert body['document_id'] == doc_id
    assert body['status'] == 'synced'
    assert body['collection_id'] == 'col-1'


# --- get_openaleph_document_review_status ---

def test_review_status_404_when_service_raises_value_error(monkeypatch):
    inv = _new_investigation('OpenAleph route coverage: review status 404')
    doc = _new_document(inv, 'memo')
    monkeypatch.setattr(
        'app.api.routes_documents.get_openaleph_review_status',
        lambda db, document_id: (_ for _ in ()).throw(ValueError('Document not found')),
    )
    r = client.get(f'/api/documents/{doc}/corpus/openaleph/review-status')
    assert r.status_code == 404, r.text


def test_review_status_success(monkeypatch):
    inv = _new_investigation('OpenAleph route coverage: review status ok')
    doc = _new_document(inv, 'memo')
    canned = {'sync_status': 'synced', 'pages_total': 3, 'pages_reviewed': 1}
    monkeypatch.setattr(
        'app.api.routes_documents.get_openaleph_review_status',
        lambda db, document_id: canned,
    )
    r = client.get(f'/api/documents/{doc}/corpus/openaleph/review-status')
    assert r.status_code == 200, r.text
    assert r.json() == canned


# --- sync_openaleph_document ---

def test_sync_404_for_unknown_document():
    r = client.post('/api/documents/does-not-exist/corpus/openaleph/sync')
    assert r.status_code == 404, r.text


def test_sync_503_when_service_raises_runtime_error(monkeypatch):
    inv = _new_investigation('OpenAleph route coverage: sync 503')
    doc = _new_document(inv, 'memo')
    monkeypatch.setattr(
        'app.api.routes_documents.sync_document_to_openaleph',
        lambda db, document_id: (_ for _ in ()).throw(RuntimeError('openaleph-client is not installed')),
    )
    r = client.post(f'/api/documents/{doc}/corpus/openaleph/sync')
    assert r.status_code == 503, r.text


def test_sync_success(monkeypatch):
    inv = _new_investigation('OpenAleph route coverage: sync ok')
    doc = _new_document(inv, 'memo')
    sentinel = object()
    monkeypatch.setattr('app.api.routes_documents.sync_document_to_openaleph', lambda db, document_id: sentinel)
    monkeypatch.setattr(
        'app.api.routes_documents.serialize_sync',
        lambda row: {'status': 'synced'} if row is sentinel else None,
    )
    r = client.post(f'/api/documents/{doc}/corpus/openaleph/sync')
    assert r.status_code == 200, r.text
    assert r.json() == {'sync': {'status': 'synced'}}


# --- refresh_openaleph_document_review / import_openaleph_document_evidence
#     / import_openaleph_document_entities: each shares the same
#     404 (ValueError) / 409 (RuntimeError) / success shape. The existing
#     502-on-bare-Exception branch is already covered by
#     tests/test_openaleph_operation_failures.py.

_OPS = [
    ('refresh-review', 'refresh_openaleph_review_candidates'),
    ('import-evidence', 'import_openaleph_evidence_candidates'),
    ('import-entities', 'import_openaleph_entity_candidates'),
]


def test_ops_404_when_service_raises_value_error(monkeypatch):
    inv = _new_investigation('OpenAleph route coverage: ops 404')
    doc = _new_document(inv, 'memo')
    for path, service_name in _OPS:
        monkeypatch.setattr(
            f'app.api.routes_documents.{service_name}',
            lambda db, document_id: (_ for _ in ()).throw(ValueError('Document not found')),
        )
        r = client.post(f'/api/documents/{doc}/corpus/openaleph/{path}')
        assert r.status_code == 404, f'{path}: {r.text}'


def test_ops_409_when_service_raises_runtime_error(monkeypatch):
    inv = _new_investigation('OpenAleph route coverage: ops 409')
    doc = _new_document(inv, 'memo')
    for path, service_name in _OPS:
        monkeypatch.setattr(
            f'app.api.routes_documents.{service_name}',
            lambda db, document_id: (_ for _ in ()).throw(RuntimeError('Document is not yet synced to OpenAleph')),
        )
        r = client.post(f'/api/documents/{doc}/corpus/openaleph/{path}')
        assert r.status_code == 409, f'{path}: {r.text}'


def test_ops_success(monkeypatch):
    inv = _new_investigation('OpenAleph route coverage: ops ok')
    doc = _new_document(inv, 'memo')
    for path, service_name in _OPS:
        canned = {'op': path, 'staged': 2}
        monkeypatch.setattr(f'app.api.routes_documents.{service_name}', lambda db, document_id, c=canned: c)
        r = client.post(f'/api/documents/{doc}/corpus/openaleph/{path}')
        assert r.status_code == 200, f'{path}: {r.text}'
        assert r.json() == canned


# --- upload_document: 404 investigation, 400 empty file, 422 extraction failed ---

def test_upload_404_for_unknown_investigation():
    r = client.post(
        '/api/documents/upload',
        data={'investigation_id': 'does-not-exist', 'title': 'x'},
        files={'file': ('x.txt', b'hello', 'text/plain')},
    )
    assert r.status_code == 404, r.text


def test_upload_400_for_empty_file():
    inv = _new_investigation('OpenAleph route coverage: upload empty')
    r = client.post(
        '/api/documents/upload',
        data={'investigation_id': inv, 'title': 'x'},
        files={'file': ('x.txt', b'', 'text/plain')},
    )
    assert r.status_code == 400, r.text


def test_upload_reraises_non_investigation_value_error(monkeypatch):
    """The one ValueError message ingest_document can raise that isn't
    "Investigation not found" (e.g. a storage-path safety violation) is
    deliberately re-raised rather than swallowed as a 404 -- it should
    surface as an unhandled 500, not a misleading 404.
    """
    inv = _new_investigation('OpenAleph route coverage: upload reraise')

    def _boom(db, **kwargs):
        raise ValueError('Refusing to write outside the storage root')

    monkeypatch.setattr('app.api.routes_documents.ingest_document', _boom)
    with TestClient(app, raise_server_exceptions=False) as raw_client:
        r = raw_client.post(
            '/api/documents/upload',
            data={'investigation_id': inv, 'title': 'x'},
            files={'file': ('x.txt', b'hello', 'text/plain')},
        )
    assert r.status_code == 500, r.text


def test_upload_auto_syncs_to_openaleph_when_enabled(monkeypatch):
    inv = _new_investigation('OpenAleph route coverage: upload auto-sync')
    monkeypatch.setattr('app.api.routes_documents.settings.openaleph_enabled', True)
    monkeypatch.setattr('app.api.routes_documents.settings.openaleph_auto_sync_documents', True)
    canned = {'status': 'synced', 'auto': True}
    monkeypatch.setattr('app.api.routes_documents.sync_document_to_openaleph', lambda db, document_id: object())
    monkeypatch.setattr('app.api.routes_documents.serialize_sync', lambda row: canned)

    r = client.post(
        '/api/documents/upload',
        data={'investigation_id': inv, 'title': 'x'},
        files={'file': ('x.txt', b'hello world', 'text/plain')},
    )
    assert r.status_code == 200, r.text
    assert r.json()['openaleph_sync'] == canned


def test_upload_422_when_extraction_fails(monkeypatch):
    inv = _new_investigation('OpenAleph route coverage: upload extraction fails')

    def _fake_ingest_document(db, *, investigation_id, title, filename, mime_type, data, storage_dir):
        source = Source(investigation_id=investigation_id, title=title, source_type='document', metadata_json={})
        db.add(source); db.flush()
        doc = Document(
            investigation_id=investigation_id, source_id=source.id, filename=filename, mime_type=mime_type,
            sha256='deadbeef' * 8, storage_path='/tmp/does-not-matter', extraction_status='failed',
            extraction_error='simulated extraction failure',
        )
        db.add(doc); db.commit(); db.refresh(doc)
        return doc

    monkeypatch.setattr('app.api.routes_documents.ingest_document', _fake_ingest_document)
    r = client.post(
        '/api/documents/upload',
        data={'investigation_id': inv, 'title': 'x'},
        files={'file': ('x.txt', b'hello', 'text/plain')},
    )
    assert r.status_code == 422, r.text
    assert r.json()['detail']['error'] == 'simulated extraction failure'


# --- get_document / list_document_candidates_endpoint: 404 branches ---

def test_get_document_404_for_unknown_document():
    r = client.get('/api/documents/does-not-exist')
    assert r.status_code == 404, r.text


def test_list_candidates_404_for_unknown_document():
    r = client.get('/api/documents/does-not-exist/candidates')
    assert r.status_code == 404, r.text
