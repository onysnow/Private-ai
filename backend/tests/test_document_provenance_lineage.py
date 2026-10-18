from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
import pytest

from app.core.config import settings
from app.db.session import Base, get_db
from app.main import app


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def client_for_test():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    def override():
        with __import__('sqlalchemy').orm.Session(engine) as db:
            yield db
    app.dependency_overrides[get_db] = override
    return TestClient(app)


def test_document_extraction_lineage_survives_acceptance_and_resolves_from_evidence():
    client = client_for_test()
    inv = client.post('/api/investigations', json={'name': 'Lineage audit'}).json()['id']
    upload = client.post(
        '/api/documents/upload',
        data={'investigation_id': inv, 'title': 'Board filing'},
        files={'file': ('filing.txt', b'The board approved the contract on August 12, 2026.', 'text/plain')},
    )
    assert upload.status_code == 200
    doc = upload.json()
    candidates = client.get(f"/api/documents/{doc['id']}/candidates?status=proposed&candidate_type=evidence").json()
    assert candidates
    candidate = candidates[0]

    before = client.get(f"/api/extraction-candidates/{candidate['id']}/lineage")
    assert before.status_code == 200
    before_lineage = before.json()
    assert before_lineage['candidate']['review_status'] == 'proposed'
    assert before_lineage['document']['id'] == doc['id']
    assert before_lineage['chunk']['locator'].startswith('line ')
    assert before_lineage['chunk']['extraction_method'] == 'native_text'

    reviewed = client.post(f"/api/extraction-candidates/{candidate['id']}/review", json={
        'decision': 'accept', 'note': 'Reporter checked exact extracted text',
    })
    assert reviewed.status_code == 200
    evidence = reviewed.json()['record']

    resolved = client.get('/api/provenance/extraction-lineage', params={
        'record_type': 'evidence', 'record_id': evidence['id'],
    })
    assert resolved.status_code == 200
    body = resolved.json()
    assert body['found'] is True
    lineage = body['lineage']
    assert lineage['candidate']['review_status'] == 'accepted'
    assert lineage['candidate']['accepted_record_type'] == 'evidence'
    assert lineage['candidate']['accepted_record_id'] == evidence['id']
    assert lineage['candidate']['reviewer_note'] == 'Reporter checked exact extracted text'
    assert lineage['chunk']['text'].startswith('The board approved')
    assert lineage['source']['id'] == doc['source_id']


def test_document_extraction_lineage_keeps_rejections_and_rejects_bad_record_types():
    client = client_for_test()
    inv = client.post('/api/investigations', json={'name': 'Rejected lineage'}).json()['id']
    doc = client.post(
        '/api/documents/upload',
        data={'investigation_id': inv, 'title': 'Notes'},
        files={'file': ('notes.txt', b'Jordan Hale served on the committee.', 'text/plain')},
    ).json()
    candidate = client.get(f"/api/documents/{doc['id']}/candidates?status=proposed").json()[0]
    rejected = client.post(f"/api/extraction-candidates/{candidate['id']}/review", json={
        'decision': 'reject', 'note': 'False positive after source check',
    })
    assert rejected.status_code == 200
    lineage = client.get(f"/api/extraction-candidates/{candidate['id']}/lineage").json()
    assert lineage['candidate']['review_status'] == 'rejected'
    assert lineage['candidate']['reviewer_note'] == 'False positive after source check'
    assert lineage['candidate']['accepted_record_id'] is None

    bad = client.get('/api/provenance/extraction-lineage', params={'record_type': 'relationship', 'record_id': 'x'})
    assert bad.status_code == 400


def test_extraction_lineage_is_investigation_scoped_for_remote_callers(monkeypatch):
    """A remote caller scoped to one investigation must not be able to read
    another investigation's document/source/chunk text through this endpoint
    by simply supplying a different record_id -- unlike /provenance/trace
    (which has always checked this), /provenance/extraction-lineage had no
    scope check at all until this fix."""
    client = client_for_test()
    inv_a = client.post('/api/investigations', json={'name': 'Investigation A'}).json()['id']
    inv_b = client.post('/api/investigations', json={'name': 'Investigation B'}).json()['id']

    def accepted_evidence_id(investigation_id: str, text: bytes) -> str:
        doc = client.post(
            '/api/documents/upload',
            data={'investigation_id': investigation_id, 'title': 'Filing'},
            files={'file': ('filing.txt', text, 'text/plain')},
        ).json()
        candidate = client.get(f"/api/documents/{doc['id']}/candidates?status=proposed&candidate_type=evidence").json()[0]
        reviewed = client.post(f"/api/extraction-candidates/{candidate['id']}/review", json={'decision': 'accept', 'note': 'ok'})
        return reviewed.json()['record']['id']

    evidence_a = accepted_evidence_id(inv_a, b'The board approved the contract on August 12, 2026.')
    evidence_b = accepted_evidence_id(inv_b, b'The council approved the budget on August 12, 2026.')

    # A shared remote bearer token configured to see only Investigation B.
    monkeypatch.setattr(settings, 'api_auth_token', 'shared-secret-token')
    monkeypatch.setattr(settings, 'api_auth_investigation_ids', inv_b)
    remote_headers = {'X-Forwarded-For': '203.0.113.5', 'Authorization': 'Bearer shared-secret-token'}

    leaked = client.get('/api/provenance/extraction-lineage', params={'record_type': 'evidence', 'record_id': evidence_a}, headers=remote_headers)
    assert leaked.status_code == 404, "a caller scoped to investigation B must not read investigation A's lineage"

    in_scope = client.get('/api/provenance/extraction-lineage', params={'record_type': 'evidence', 'record_id': evidence_b}, headers=remote_headers)
    assert in_scope.status_code == 200
    assert in_scope.json()['found'] is True
    assert in_scope.json()['lineage']['document']['investigation_id'] == inv_b

    # Unchanged for a genuinely local caller: both investigations remain visible.
    assert client.get('/api/provenance/extraction-lineage', params={'record_type': 'evidence', 'record_id': evidence_a}).json()['found'] is True
    assert client.get('/api/provenance/extraction-lineage', params={'record_type': 'evidence', 'record_id': evidence_b}).json()['found'] is True
