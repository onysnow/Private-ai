from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_relationship_rejects_cross_investigation_evidence_and_exposes_exact_provenance():
    inv = client.post('/api/investigations', json={'name':'Relationship evidence A'}).json()
    other = client.post('/api/investigations', json={'name':'Relationship evidence B'}).json()
    person = client.post('/api/entities', json={'investigation_id':inv['id'],'schema':'Person','caption':'A Person','properties':{}}).json()
    company = client.post('/api/entities', json={'investigation_id':inv['id'],'schema':'Company','caption':'A Company','properties':{}}).json()
    src = client.post('/api/sources', json={'investigation_id':inv['id'],'title':'Primary filing','url':'https://example.test/filing'}).json()
    ev = client.post('/api/evidence', json={'source_id':src['id'],'quote':'A Person joined the board.','locator':'p. 4'}).json()
    created = client.post('/api/relationships', json={'investigation_id':inv['id'],'schema':'Directorship','source_entity_id':person['id'],'target_entity_id':company['id'],'evidence_id':ev['id']})
    assert created.status_code == 200, created.text
    prov = created.json()['provenance']['evidence_attachments'][0]['evidence']
    assert prov['id'] == ev['id']
    assert prov['quote'] == 'A Person joined the board.'
    assert prov['locator'] == 'p. 4'
    assert prov['source']['url'] == 'https://example.test/filing'

    other_src = client.post('/api/sources', json={'investigation_id':other['id'],'title':'Other case source'}).json()
    other_ev = client.post('/api/evidence', json={'source_id':other_src['id'],'quote':'Unrelated evidence'}).json()
    rejected = client.post('/api/relationships', json={'investigation_id':inv['id'],'schema':'Directorship','source_entity_id':person['id'],'target_entity_id':company['id'],'evidence_id':other_ev['id']})
    assert rejected.status_code == 400
    assert 'same investigation' in rejected.text
