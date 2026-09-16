from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _investigation(name: str):
    response = client.post('/api/investigations', json={'name': name})
    assert response.status_code == 200
    return response.json()


def _entity(investigation_id: str, caption: str, schema: str = 'Person'):
    response = client.post('/api/entities', json={
        'investigation_id': investigation_id,
        'schema': schema,
        'caption': caption,
        'properties': {'name': [caption]},
    })
    assert response.status_code == 200
    return response.json()


def test_relationship_can_seed_first_class_reporting_lead_and_trace_to_dossiers():
    inv = _investigation('Relationship lead workflow')
    person = _entity(inv['id'], 'Alex Person')
    company = _entity(inv['id'], 'Example Holdings', 'Company')
    relationship = client.post('/api/relationships', json={
        'investigation_id': inv['id'],
        'schema': 'Directorship',
        'source_entity_id': person['id'],
        'target_entity_id': company['id'],
        'properties': {'role': ['Director']},
        'dataset': 'reporter',
        'origin': 'board filing',
    }).json()

    created = client.post('/api/leads', json={
        'investigation_id': inv['id'],
        'title': 'Verify the directorship dates',
        'detail': 'Check appointment and resignation filings.',
        'relationship_id': relationship['id'],
    })
    assert created.status_code == 200
    lead = created.json()
    assert len(lead['links']) == 1
    link = lead['links'][0]
    assert link['type'] == 'relationship'
    assert link['target_id'] == relationship['id']
    assert 'Directorship' in link['label']

    trace = client.get('/api/provenance/trace', params={
        'record_type': 'relationship', 'record_id': relationship['id'],
    })
    assert trace.status_code == 200
    lead_links = trace.json()['lead_links']
    assert any(row['lead']['id'] == lead['id'] for row in lead_links)

    for entity in (person, company):
        dossier = client.get(f"/api/entities/{entity['id']}/dossier")
        assert dossier.status_code == 200
        assert any(row['lead']['id'] == lead['id'] for row in dossier.json()['leads'])


def test_relationship_lead_link_rejects_cross_investigation_edge_and_multiple_targets():
    inv1 = _investigation('Relationship lead one')
    inv2 = _investigation('Relationship lead two')
    a = _entity(inv2['id'], 'A')
    b = _entity(inv2['id'], 'B', 'Company')
    relationship = client.post('/api/relationships', json={
        'investigation_id': inv2['id'], 'schema': 'Ownership',
        'source_entity_id': a['id'], 'target_entity_id': b['id'], 'properties': {},
        'dataset': 'reporter',
    }).json()
    lead = client.post('/api/leads', json={'investigation_id': inv1['id'], 'title': 'Question'}).json()

    wrong_inv = client.post(f"/api/leads/{lead['id']}/links", json={'relationship_id': relationship['id']})
    assert wrong_inv.status_code == 400

    entity = _entity(inv1['id'], 'Local entity')
    multiple = client.post(f"/api/leads/{lead['id']}/links", json={
        'entity_id': entity['id'], 'relationship_id': relationship['id'],
    })
    assert multiple.status_code == 400
