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


def test_investigation_evidence_pool_and_claim_link_safeguards():
    client = client_for_test()
    inv_a = client.post('/api/investigations', json={'name': 'Evidence pool A'}).json()['id']
    inv_b = client.post('/api/investigations', json={'name': 'Evidence pool B'}).json()['id']

    source_a = client.post('/api/sources', json={
        'investigation_id': inv_a, 'title': 'Primary filing', 'url': 'https://example.test/a', 'source_type': 'filing',
    }).json()
    source_b = client.post('/api/sources', json={
        'investigation_id': inv_b, 'title': 'Other filing', 'url': 'https://example.test/b', 'source_type': 'filing',
    }).json()
    evidence_a = client.post('/api/evidence', json={
        'source_id': source_a['id'], 'quote': 'Exact supporting sentence.', 'locator': 'page 4, paragraph 2',
    }).json()
    evidence_b = client.post('/api/evidence', json={
        'source_id': source_b['id'], 'quote': 'Other investigation sentence.', 'locator': 'page 1',
    }).json()

    pool = client.get(f'/api/investigations/{inv_a}/evidence')
    assert pool.status_code == 200
    assert len(pool.json()) == 1
    assert pool.json()[0]['evidence']['id'] == evidence_a['id']
    assert pool.json()[0]['source']['id'] == source_a['id']
    assert pool.json()[0]['evidence']['locator'] == 'page 4, paragraph 2'

    claim = client.post('/api/claims', json={
        'investigation_id': inv_a, 'text': 'A testable claim', 'status': 'unverified', 'confidence': 0,
    }).json()
    first = client.post(f"/api/claims/{claim['id']}/evidence", json={
        'evidence_id': evidence_a['id'], 'stance': 'supports', 'note': 'Reporter checked locator',
    })
    assert first.status_code == 200
    duplicate = client.post(f"/api/claims/{claim['id']}/evidence", json={
        'evidence_id': evidence_a['id'], 'stance': 'supports', 'note': 'Duplicate should be idempotent',
    })
    assert duplicate.status_code == 200
    linked = client.get(f"/api/claims/{claim['id']}/evidence").json()
    assert len(linked) == 1
    assert linked[0]['stance'] == 'supports'

    cross = client.post(f"/api/claims/{claim['id']}/evidence", json={
        'evidence_id': evidence_b['id'], 'stance': 'contradicts',
    })
    assert cross.status_code == 400
    assert 'same investigation' in cross.json()['detail']
