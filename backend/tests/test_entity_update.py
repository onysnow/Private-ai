"""PATCH /entities/{id}: rename an entity and/or add new property values.

Additive only -- a value already recorded for a prop is left alone; a new
one is appended as a Statement alongside it. Nothing here picks between
disagreeing values; that is decide_property_conflict's job.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db
from app.main import app


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.fixture()
def env():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)

    def override():
        with Session(engine) as db:
            yield db
    app.dependency_overrides[get_db] = override
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Edits'}).json()['id']
    return client, inv


def _entity(client, inv, caption='Acme Ltd', schema='Company', **props):
    res = client.post('/api/entities', json={
        'investigation_id': inv, 'schema': schema, 'caption': caption,
        'properties': {k: [v] if isinstance(v, str) else v for k, v in props.items()},
    })
    assert res.status_code == 200, res.text
    return res.json()


def _statements(client, entity_id):
    res = client.get(f'/api/entities/{entity_id}/statements')
    assert res.status_code == 200, res.text
    return res.json()


def test_rename_updates_caption_only(env):
    client, inv = env
    entity = _entity(client, inv, caption='Acme Ltd')
    res = client.patch(f'/api/entities/{entity["id"]}', json={'caption': 'Acme Holdings Ltd'})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['caption'] == 'Acme Holdings Ltd'
    assert body['properties'] == entity['properties']  # unchanged


def test_new_property_value_is_appended_as_a_statement_not_a_replacement(env):
    client, inv = env
    entity = _entity(client, inv, caption='Acme Ltd', country='us')
    res = client.patch(f'/api/entities/{entity["id"]}', json={'properties': {'country': ['gb']}})
    assert res.status_code == 200, res.text
    body = res.json()
    assert sorted(body['properties']['country']) == ['gb', 'us']  # both kept, neither overwritten
    values = sorted(s['value'] for s in _statements(client, entity['id']) if s['prop'] == 'country')
    assert values == ['gb', 'us']


def test_repeating_an_existing_value_does_not_duplicate_the_statement(env):
    client, inv = env
    entity = _entity(client, inv, caption='Acme Ltd', country='us')
    client.patch(f'/api/entities/{entity["id"]}', json={'properties': {'country': ['us']}})
    values = [s['value'] for s in _statements(client, entity['id']) if s['prop'] == 'country']
    assert values == ['us']


def test_requires_caption_or_properties(env):
    client, inv = env
    entity = _entity(client, inv)
    res = client.patch(f'/api/entities/{entity["id"]}', json={})
    assert res.status_code == 400
    assert 'caption' in res.text


def test_404_for_unknown_entity(env):
    client, inv = env
    res = client.patch('/api/entities/nope', json={'caption': 'X'})
    assert res.status_code == 404


def test_merged_entity_cannot_be_edited_directly(env):
    client, inv = env
    a = _entity(client, inv, caption='Acme Ltd')
    b = _entity(client, inv, caption='Acme Limited')
    res = client.post(f'/api/entities/{a["id"]}/canonical-resolution', json={
        'other_entity_id': b['id'], 'decision': 'same', 'confidence': 1.0,
    })
    assert res.status_code == 200, res.text
    preview = client.get(f'/api/entities/{a["id"]}/merge-preview', params={'target_entity_id': b['id']})
    assert preview.status_code == 200, preview.text
    res = client.post(f'/api/entities/{a["id"]}/merge', json={
        'target_entity_id': b['id'], 'preview_digest': preview.json()['preview_digest'],
    })
    assert res.status_code == 200, res.text
    res = client.patch(f'/api/entities/{a["id"]}', json={'caption': 'Renamed'})
    assert res.status_code == 400
    assert 'merged' in res.text
