from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.db.session import get_db
from app.main import app
import pytest

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


def test_claim_status_and_confidence_are_validated_and_editable():
    client = client_for_test()
    inv = client.post('/api/investigations', json={'name': 'Claim review'}).json()['id']
    created = client.post('/api/claims', json={
        'investigation_id': inv, 'text': 'Initial assertion', 'status': 'unverified', 'confidence': 0.2,
    })
    assert created.status_code == 200
    claim_id = created.json()['id']

    updated = client.patch(f'/api/claims/{claim_id}', json={'status': 'supported', 'confidence': 0.8})
    assert updated.status_code == 200
    assert updated.json()['status'] == 'supported'
    assert updated.json()['confidence'] == 0.8

    assert client.patch(f'/api/claims/{claim_id}', json={'status': 'definitely_true'}).status_code == 400
    assert client.patch(f'/api/claims/{claim_id}', json={'confidence': 1.1}).status_code == 400
    assert client.post('/api/claims', json={
        'investigation_id': inv, 'text': 'Bad confidence', 'status': 'lead', 'confidence': -0.1,
    }).status_code == 400
    assert client.post('/api/claims', json={
        'investigation_id': inv, 'text': 'Bad status', 'status': 'truthy', 'confidence': 0.5,
    }).status_code == 400
