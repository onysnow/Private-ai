from fastapi.testclient import TestClient

from app.db.session import Base, engine
from app.main import app


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def _entity(client, inv_id, schema, caption):
    return client.post('/api/entities', json={
        'investigation_id': inv_id, 'schema': schema, 'caption': caption,
        'properties': {'name': [caption]},
    }).json()


def test_graph_exposes_relationship_statement_provenance_and_schema_filter():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Graph provenance'}).json()
    person = _entity(client, inv['id'], 'Person', 'Jane Director')
    company = _entity(client, inv['id'], 'Company', 'Example Energy')
    asset = _entity(client, inv['id'], 'Company', 'Example Asset LLC')

    directorship = client.post('/api/relationships', json={
        'investigation_id': inv['id'], 'schema': 'Directorship',
        'source_entity_id': person['id'], 'target_entity_id': company['id'],
        'properties': {'role': ['Board chair']}, 'dataset': 'sec_filing',
        'origin': 'https://example.test/filing#director'
    }).json()
    client.post('/api/relationships', json={
        'investigation_id': inv['id'], 'schema': 'Ownership',
        'source_entity_id': company['id'], 'target_entity_id': asset['id'],
        'properties': {'percentage': ['60%']}, 'dataset': 'reporter',
    })

    graph = client.get(f"/api/investigations/{inv['id']}/graph")
    assert graph.status_code == 200, graph.text
    body = graph.json()
    assert set(body['schemas']) == {'Directorship', 'Ownership'}
    edge = next(x for x in body['edges'] if x['id'] == directorship['id'])
    assert edge['provenance']['statement_count'] >= 3
    assert any(s['dataset'] == 'sec_filing' for s in edge['statements'])
    assert any(s['origin'] == 'https://example.test/filing#director' for s in edge['statements'])
    assert any(s['prop'] == 'role' and s['value'] == 'Board chair' for s in edge['statements'])

    filtered = client.get(f"/api/investigations/{inv['id']}/graph", params=[('schema', 'Directorship')])
    assert filtered.status_code == 200, filtered.text
    filtered_body = filtered.json()
    assert filtered_body['schemas'] == ['Directorship']
    assert len(filtered_body['edges']) == 1
    assert filtered_body['edges'][0]['schema'] == 'Directorship'
    assert {n['id'] for n in filtered_body['nodes']} == {person['id'], company['id']}


def test_graph_rejects_unknown_schema_filter():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Graph filter validation'}).json()
    response = client.get(f"/api/investigations/{inv['id']}/graph", params={'schema': 'FakeLink'})
    assert response.status_code == 400
