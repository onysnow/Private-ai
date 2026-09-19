"""Covers STRUCT-0027: OpenAleph pipeline failures previously left no
server-side trace of *why* a 502 happened. The 4 endpoints that catch a
bare `except Exception` (refresh-review, import-evidence, import-entities
in routes_documents.py; corpus/openaleph/ensure in routes_investigations.py)
now record an OpenAlephOperationFailure row before re-raising, queryable
via GET /investigations/{id}/corpus/openaleph/failures.

Each service call is monkeypatched at the route-module import site (not
the service module) to raise, since the route functions call these names
looked up from their own module namespace at call time -- patching there
is what actually reaches the route's `except Exception` branch.
"""
from fastapi.testclient import TestClient

from app.db.session import Base, engine
from app.main import app

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


def _boom(*args, **kwargs):
    raise Exception("simulated OpenAleph failure")


def test_refresh_review_failure_is_recorded_and_queryable(monkeypatch):
    inv = _new_investigation('OpenAleph failure trace: refresh')
    doc = _new_document(inv, 'memo')

    monkeypatch.setattr('app.api.routes_documents.refresh_openaleph_review_candidates', _boom)
    r = client.post(f'/api/documents/{doc}/corpus/openaleph/refresh-review')
    assert r.status_code == 502, r.text

    failures = client.get(f'/api/investigations/{inv}/corpus/openaleph/failures').json()
    assert len(failures) == 1
    entry = failures[0]
    assert entry['investigation_id'] == inv
    assert entry['document_id'] == doc
    assert entry['operation'] == 'refresh_review'
    assert 'simulated OpenAleph failure' in entry['error']


def test_import_evidence_failure_is_recorded(monkeypatch):
    inv = _new_investigation('OpenAleph failure trace: evidence')
    doc = _new_document(inv, 'memo')

    monkeypatch.setattr('app.api.routes_documents.import_openaleph_evidence_candidates', _boom)
    r = client.post(f'/api/documents/{doc}/corpus/openaleph/import-evidence')
    assert r.status_code == 502, r.text

    failures = client.get(f'/api/investigations/{inv}/corpus/openaleph/failures').json()
    assert len(failures) == 1
    assert failures[0]['operation'] == 'import_evidence'
    assert failures[0]['document_id'] == doc


def test_import_entities_failure_is_recorded(monkeypatch):
    inv = _new_investigation('OpenAleph failure trace: entities')
    doc = _new_document(inv, 'memo')

    monkeypatch.setattr('app.api.routes_documents.import_openaleph_entity_candidates', _boom)
    r = client.post(f'/api/documents/{doc}/corpus/openaleph/import-entities')
    assert r.status_code == 502, r.text

    failures = client.get(f'/api/investigations/{inv}/corpus/openaleph/failures').json()
    assert len(failures) == 1
    assert failures[0]['operation'] == 'import_entities'
    assert failures[0]['document_id'] == doc


def test_ensure_collection_failure_is_recorded_with_no_document(monkeypatch):
    inv = _new_investigation('OpenAleph failure trace: ensure collection')

    monkeypatch.setattr('app.api.routes_investigations.ensure_openaleph_collection', _boom)
    r = client.post(f'/api/investigations/{inv}/corpus/openaleph/ensure')
    assert r.status_code == 502, r.text

    failures = client.get(f'/api/investigations/{inv}/corpus/openaleph/failures').json()
    assert len(failures) == 1
    assert failures[0]['operation'] == 'ensure_collection'
    assert failures[0]['document_id'] is None


def test_failures_are_scoped_per_investigation():
    other = _new_investigation('OpenAleph failure trace: unrelated')
    assert client.get(f'/api/investigations/{other}/corpus/openaleph/failures').json() == []


def test_failures_endpoint_404s_for_unknown_investigation():
    r = client.get('/api/investigations/does-not-exist/corpus/openaleph/failures')
    assert r.status_code == 404
