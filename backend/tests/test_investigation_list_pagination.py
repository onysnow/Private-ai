"""Covers STRUCT-0018: limit/offset on investigation-scoped list endpoints.

Exercises the three endpoints prioritized in the finding (documents,
entities, connector-findings): unpaginated behavior must stay identical
(everything, in existing order) and limit/offset must slice that same
order at the SQL level.
"""
from fastapi.testclient import TestClient

from app.db.session import Base, SessionLocal, engine
from app.main import app
from app.models.domain import ConnectorFinding


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def _new_investigation(client: TestClient, name: str) -> str:
    r = client.post('/api/investigations', json={'name': name})
    assert r.status_code == 200, r.text
    return r.json()['id']


def test_documents_list_limit_offset():
    client = TestClient(app)
    inv = _new_investigation(client, 'Doc pagination')
    uploaded = []
    for i in range(5):
        r = client.post(
            '/api/documents/upload',
            data={'investigation_id': inv, 'title': f'Memo {i}'},
            files={'file': (f'memo{i}.txt', f'Document body {i}.'.encode(), 'text/plain')},
        )
        assert r.status_code == 200, r.text
        uploaded.append(r.json()['id'])

    unpaginated = client.get(f'/api/investigations/{inv}/documents')
    assert unpaginated.status_code == 200
    full = unpaginated.json()
    assert len(full) == 5
    full_ids = [item['id'] for item in full]

    page1 = client.get(f'/api/investigations/{inv}/documents', params={'limit': 2}).json()
    assert [item['id'] for item in page1] == full_ids[:2]

    page2 = client.get(f'/api/investigations/{inv}/documents', params={'limit': 2, 'offset': 2}).json()
    assert [item['id'] for item in page2] == full_ids[2:4]

    remainder = client.get(f'/api/investigations/{inv}/documents', params={'offset': 4}).json()
    assert [item['id'] for item in remainder] == full_ids[4:]


def test_entities_list_limit_offset():
    client = TestClient(app)
    inv = _new_investigation(client, 'Entity pagination')
    created = []
    for caption in ('Alice', 'Bob', 'Carol', 'Dave'):
        r = client.post('/api/entities', json={'investigation_id': inv, 'schema': 'Person', 'caption': caption, 'properties': {}})
        assert r.status_code == 200, r.text
        created.append(r.json()['id'])

    full = client.get(f'/api/investigations/{inv}/entities').json()
    assert len(full) == 4
    # list_entities orders by caption, so this should be alphabetical regardless of creation order.
    full_ids = [item['id'] for item in full]

    page1 = client.get(f'/api/investigations/{inv}/entities', params={'limit': 2}).json()
    assert [item['id'] for item in page1] == full_ids[:2]

    page2 = client.get(f'/api/investigations/{inv}/entities', params={'limit': 2, 'offset': 2}).json()
    assert [item['id'] for item in page2] == full_ids[2:4]


def test_connector_findings_list_limit_offset():
    client = TestClient(app)
    inv = _new_investigation(client, 'Finding pagination')
    with SessionLocal() as db:
        for i in range(4):
            db.add(ConnectorFinding(
                investigation_id=inv, provider='aleph', provider_record_id=f'rec-{i}',
                caption=f'Finding {i}', schema='Company', properties={}, raw={}, review_status='unreviewed',
            ))
        db.commit()

    full = client.get(f'/api/investigations/{inv}/connector-findings').json()
    assert len(full) == 4
    full_ids = [item['id'] for item in full]

    page1 = client.get(f'/api/investigations/{inv}/connector-findings', params={'limit': 2}).json()
    assert [item['id'] for item in page1] == full_ids[:2]

    page2 = client.get(f'/api/investigations/{inv}/connector-findings', params={'limit': 2, 'offset': 2}).json()
    assert [item['id'] for item in page2] == full_ids[2:4]


def test_limit_out_of_range_is_rejected():
    client = TestClient(app)
    inv = _new_investigation(client, 'Bad pagination params')
    assert client.get(f'/api/investigations/{inv}/documents', params={'limit': 0}).status_code == 422
    assert client.get(f'/api/investigations/{inv}/documents', params={'limit': 501}).status_code == 422
    assert client.get(f'/api/investigations/{inv}/documents', params={'offset': -1}).status_code == 422
