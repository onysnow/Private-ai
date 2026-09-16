from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import Base, engine
from app.main import app
from app.models.domain import ConnectorFinding, ConnectorRun


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def entity(client, inv, schema, caption):
    return client.post('/api/entities', json={
        'investigation_id': inv, 'schema': schema, 'caption': caption,
        'properties': {'name': [caption]},
    }).json()


def add_finding(inv, provider, record_id, caption, schema, props):
    with Session(engine) as db:
        run = ConnectorRun(investigation_id=inv, provider=provider, query='fixture', status='completed')
        db.add(run); db.flush()
        row = ConnectorFinding(
            investigation_id=inv, run_id=run.id, provider=provider,
            provider_record_id=record_id, caption=caption, schema=schema,
            properties=props, source_url=f'https://source.test/{record_id}', raw={'dataset':'fixture-dataset'},
        )
        db.add(row); db.commit(); db.refresh(row)
        return row.id


def test_external_directorship_requires_review_before_graph_promotion():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name':'External relationship'}).json()['id']
    person = entity(client, inv, 'Person', 'Alice Director')
    company = entity(client, inv, 'Company', 'Example Corp')
    add_finding(inv, 'opensanctions', 'person-ext', 'Alice Director', 'Person', {'name':['Alice Director']})
    add_finding(inv, 'opensanctions', 'company-ext', 'Example Corp', 'Company', {'name':['Example Corp']})
    rel_id = add_finding(inv, 'opensanctions', 'rel-ext', 'Alice Director director of Example Corp', 'Directorship', {
        'director':['person-ext'], 'organization':['company-ext'], 'role':['Board member'], 'startDate':['2021-01-01'],
    })

    candidates = client.get(f'/api/connector-findings/{rel_id}/relationship-candidates')
    assert candidates.status_code == 200, candidates.text
    body = candidates.json()
    assert body['source_external_id'] == 'person-ext'
    assert body['target_external_id'] == 'company-ext'
    assert body['source_candidates'][0]['entity_id'] == person['id']
    assert body['target_candidates'][0]['entity_id'] == company['id']
    assert client.get(f'/api/investigations/{inv}/relationships').json() == []

    review = client.post(f'/api/connector-findings/{rel_id}/relationship-reviews', json={
        'source_entity_id': person['id'], 'target_entity_id': company['id'],
        'decision':'supported', 'note':'Endpoints verified against filing',
    })
    assert review.status_code == 200, review.text
    review_id = review.json()['id']
    assert client.get(f'/api/investigations/{inv}/relationships').json() == []

    promotion = client.post(f'/api/external-relationship-reviews/{review_id}/promote')
    assert promotion.status_code == 200, promotion.text
    again = client.post(f'/api/external-relationship-reviews/{review_id}/promote')
    assert again.status_code == 200
    assert again.json()['id'] == promotion.json()['id']

    graph = client.get(f'/api/investigations/{inv}/graph').json()
    assert len(graph['edges']) == 1
    edge = graph['edges'][0]
    assert edge['schema'] == 'Directorship'
    assert edge['source']['id'] == person['id']
    assert edge['target']['id'] == company['id']
    assert edge['properties']['role'] == ['Board member']
    statements = client.get(f"/api/entities/{edge['relationship_entity_id']}/statements").json()
    role = next(s for s in statements if s['prop'] == 'role')
    assert role['dataset'] == 'fixture-dataset'
    assert role['origin'] == 'https://source.test/rel-ext'


def test_conflicting_relationship_cannot_be_promoted():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name':'Conflict'}).json()['id']
    a = entity(client, inv, 'Person', 'A')
    b = entity(client, inv, 'Company', 'B')
    rel_id = add_finding(inv, 'aleph', 'employment-x', 'A employed by B', 'Employment', {'employee':['a-x'], 'employer':['b-x']})
    review = client.post(f'/api/connector-findings/{rel_id}/relationship-reviews', json={
        'source_entity_id': a['id'], 'target_entity_id': b['id'], 'decision':'conflicting',
    }).json()
    resp = client.post(f"/api/external-relationship-reviews/{review['id']}/promote")
    assert resp.status_code == 409
    assert client.get(f'/api/investigations/{inv}/relationships').json() == []
