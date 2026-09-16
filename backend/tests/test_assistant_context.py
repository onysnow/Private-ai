from fastapi.testclient import TestClient
from app.db.session import Base, SessionLocal, engine
from app.main import app
from app.models.domain import ConnectorFinding


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_question_context_separates_external_leads_from_factual_citations():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'AI context'}).json()
    other = client.post('/api/investigations', json={'name': 'Other'}).json()
    entity = client.post('/api/entities', json={'investigation_id': inv['id'], 'schema': 'Person', 'caption': 'Ada North', 'properties': {'name': ['Ada North']}}).json()
    source = client.post('/api/sources', json={'investigation_id': inv['id'], 'title': 'Board minutes', 'source_type': 'minutes', 'url': 'https://example.test/minutes'}).json()
    evidence = client.post('/api/evidence', json={'source_id': source['id'], 'quote': 'Ada North joined the utility board.', 'locator': 'page 7'}).json()
    claim = client.post('/api/claims', json={'investigation_id': inv['id'], 'text': 'Ada North joined the utility board.', 'status': 'supported', 'confidence': 0.9}).json()
    assert client.post(f"/api/claims/{claim['id']}/evidence", json={'evidence_id': evidence['id'], 'stance': 'supports'}).status_code == 200
    with SessionLocal() as db:
        db.add(ConnectorFinding(investigation_id=inv['id'], provider='aleph', provider_record_id='aleph-1', caption='Ada North Holdings', schema='Company', properties={'name': ['Ada North Holdings']}, source_url='https://aleph.example/entities/aleph-1', raw={}, review_status='unreviewed'))
        db.add(ConnectorFinding(investigation_id=other['id'], provider='aleph', provider_record_id='aleph-other', caption='Ada North Other', schema='Company', properties={}, raw={}, review_status='unreviewed'))
        db.commit()
    r = client.post(f"/api/investigations/{inv['id']}/assistant/context", json={'question': 'Ada North utility board', 'max_results': 50})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['reasoning_contract']['external_leads_are_unverified'] is True
    assert entity['id'] in {x['record_id'] for x in body['context']['canonical']}
    assert evidence['id'] in {x['record_id'] for x in body['context']['evidence']}
    assert claim['id'] in {x['record_id'] for x in body['context']['reporting']}
    assert any(x['title'] == 'Ada North Holdings' for x in body['external_leads'])
    assert all(x['title'] != 'Ada North Other' for x in body['external_leads'])
    citations = {(x['record_type'], x['record_id']) for x in body['citations']}
    assert ('evidence', evidence['id']) in citations
    assert all(kind != 'connector_finding' for kind, _ in citations)


def test_question_context_can_exclude_external_leads():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'No external'}).json()
    with SessionLocal() as db:
        db.add(ConnectorFinding(investigation_id=inv['id'], provider='aleph', provider_record_id='lead-2', caption='Needle Company', schema='Company', properties={'name': ['Needle Company']}, raw={}, review_status='unreviewed'))
        db.commit()
    r = client.post(f"/api/investigations/{inv['id']}/assistant/context", json={'question': 'Needle Company', 'include_external_leads': False})
    assert r.status_code == 200
    assert r.json()['external_leads'] == []
