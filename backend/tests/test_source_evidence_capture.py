from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
import pytest

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


def test_direct_source_and_exact_evidence_capture_normalizes_and_preserves_provenance():
    client = client_for_test()
    inv = client.post('/api/investigations', json={'name': 'Direct capture'}).json()['id']

    source_response = client.post('/api/sources', json={
        'investigation_id': inv,
        'title': '  City council minutes  ',
        'url': '  https://example.test/minutes  ',
        'source_type': 'public_record',
    })
    assert source_response.status_code == 200
    source = source_response.json()
    assert source['title'] == 'City council minutes'
    assert source['url'] == 'https://example.test/minutes'

    evidence_response = client.post('/api/evidence', json={
        'source_id': source['id'],
        'quote': '  The board approved the contract.  ',
        'locator': '  page 7, item 4  ',
        'notes': '  checked against signed minutes  ',
    })
    assert evidence_response.status_code == 200
    evidence = evidence_response.json()
    assert evidence['quote'] == 'The board approved the contract.'
    assert evidence['locator'] == 'page 7, item 4'
    assert evidence['notes'] == 'checked against signed minutes'

    pool = client.get(f'/api/investigations/{inv}/evidence').json()
    assert len(pool) == 1
    assert pool[0]['source']['id'] == source['id']
    assert pool[0]['evidence']['id'] == evidence['id']
    assert pool[0]['evidence']['locator'] == 'page 7, item 4'


def test_direct_capture_rejects_blank_source_and_blank_evidence():
    client = client_for_test()
    inv = client.post('/api/investigations', json={'name': 'Blank capture'}).json()['id']

    blank_source = client.post('/api/sources', json={
        'investigation_id': inv, 'title': '   ', 'source_type': 'web',
    })
    assert blank_source.status_code == 400
    assert blank_source.json()['detail'] == 'Source title is required'

    source = client.post('/api/sources', json={
        'investigation_id': inv, 'title': 'Valid source', 'source_type': 'web',
    }).json()
    blank_evidence = client.post('/api/evidence', json={
        'source_id': source['id'], 'quote': '  ', 'locator': '\t', 'notes': '\n',
    })
    assert blank_evidence.status_code == 400
    assert 'quote, locator, or note' in blank_evidence.json()['detail']
