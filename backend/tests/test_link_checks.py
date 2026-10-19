"""A link added to To check from The Wire's chain strip (research §2.6: "The chain breaks at 'signs for': no reviewed
source yet. Add to To check →"): one item per link, asking for a reviewed source, on the link's two parties."""
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
    inv = client.post('/api/investigations', json={'name': 'Links'}).json()['id']

    def entity(caption, schema='Company'):
        res = client.post('/api/entities', json={'investigation_id': inv, 'schema': schema, 'caption': caption})
        assert res.status_code == 200, res.text
        return res.json()['id']

    def link(schema, a, b, **props):
        res = client.post('/api/relationships', json={'investigation_id': inv, 'schema': schema, 'source_entity_id': a,
                                                        'target_entity_id': b, 'properties': {k: [v] for k, v in props.items()}})
        assert res.status_code == 200, res.text
        return res.json()['id']
    return client, inv, entity, link


def _add(client, rel):
    res = client.post(f'/api/relationships/{rel}/to-check')
    assert res.status_code == 200, res.text
    return res.json()


def test_a_link_is_added_once_with_its_question_and_parties(env):
    client, inv, entity, link = env
    ross, nominees = entity('M. Ross', 'Person'), entity('Harbour Nominees')
    rel = link('Directorship', ross, nominees, role='signs for')
    out = _add(client, rel)
    [item] = [i for i in out['items'] if i['kind'] == 'link']
    assert item['question'] == 'Find a reviewed source for: M. Ross signs for Harbour Nominees'
    assert item['relationship_id'] == rel and item['indicator_name'] == 'Weak link' and item['status'] == 'open'
    assert [p['name'] for p in item['parties']] == ['M. Ross', 'Harbour Nominees']
    # Adding it again changes nothing.
    again = _add(client, rel)
    assert [i['id'] for i in again['items'] if i['kind'] == 'link'] == [item['id']]
    # Running the rules never marks it gone: no rule asked for it.
    assert client.post(f'/api/investigations/{inv}/red-flags/run').status_code == 200
    listed = client.get(f'/api/investigations/{inv}/checks').json()
    assert [i['id'] for i in listed['items'] if i['kind'] == 'link'] == [item['id']] and not listed['gone']


def test_a_link_without_a_role_is_worded_by_its_kind(env):
    client, inv, entity, link = env
    a, b = entity('Fernhill Ltd'), entity('Kestrel SA')
    rel = link('Ownership', a, b, percentage='40')
    [item] = [i for i in _add(client, rel)['items'] if i['kind'] == 'link']
    assert item['question'] == 'Find a reviewed source for: Fernhill Ltd owns 40% Kestrel SA'


def test_a_link_item_is_answered_like_any_item_and_is_a_decide_to_check(env):
    client, inv, entity, link = env
    ross, nominees = entity('M. Ross', 'Person'), entity('Harbour Nominees')
    rel = link('Directorship', ross, nominees, role='signs for')
    [item] = [i for i in _add(client, rel)['items'] if i['kind'] == 'link']
    res = client.get(f'/api/investigations/{inv}/decisions', params={'kind': 'to_check'})
    assert res.status_code == 200, res.text
    [d] = [d for d in res.json()['items'] if d['id'] == item['id']]
    assert d['question'] == item['question'] and d['actor'] == 'The Wire'
    assert [p['name'] for p in d['parties']] == ['M. Ross', 'Harbour Nominees']
    assert d['open'] == {'href': f'/see?link={rel}#the-wire', 'label': 'Open the link in The Wire'}
    assert [c['path'] for c in d['choices']] == [f'/api/checks/{item["id"]}/decide'] * 3
    decided = client.post(f'/api/checks/{item["id"]}/decide', json={'status': 'shows', 'note': 'the 2019 filing'}).json()
    row = next(i for i in decided['items'] if i['id'] == item['id'])
    assert row['status'] == 'shows' and row['note'] == 'the 2019 filing'
    left = client.get(f'/api/investigations/{inv}/decisions', params={'kind': 'to_check'}).json()['items']
    assert item['id'] not in [d['id'] for d in left]
    # Added again after it was answered: still the one item, with its answer.
    again = [i for i in _add(client, rel)['items'] if i['kind'] == 'link']
    assert [(i['id'], i['status']) for i in again] == [(item['id'], 'shows')]


def test_an_unknown_link_is_not_found(env):
    client, _inv, _entity, _link = env
    assert client.post('/api/relationships/nope/to-check').status_code == 404
