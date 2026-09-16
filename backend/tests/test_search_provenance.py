from fastapi.testclient import TestClient

from app.db.session import Base, engine
from app.main import app


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_investigation_search_returns_typed_provenance_and_claim_evidence_links():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Search provenance'}).json()
    other = client.post('/api/investigations', json={'name': 'Other investigation'}).json()

    entity = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Company', 'caption': 'NiSource Inc.',
        'properties': {'name': ['NiSource Inc.'], 'jurisdiction': ['Indiana']},
        'origin': 'reporter-notebook'
    }).json()
    client.post('/api/entities', json={
        'investigation_id': other['id'], 'schema': 'Company', 'caption': 'NiSource Other',
        'properties': {'name': ['NiSource Other']}
    })

    source = client.post('/api/sources', json={
        'investigation_id': inv['id'], 'title': 'Utility commission filing',
        'url': 'https://example.test/filing', 'source_type': 'government'
    }).json()
    evidence = client.post('/api/evidence', json={
        'source_id': source['id'],
        'quote': 'NiSource requested approval for the Indiana project.',
        'locator': 'p. 42',
        'notes': 'Primary filing excerpt'
    }).json()
    claim = client.post('/api/claims', json={
        'investigation_id': inv['id'], 'text': 'NiSource requested regulatory approval.',
        'status': 'supported', 'confidence': 0.8
    }).json()
    link = client.post(f"/api/claims/{claim['id']}/evidence", json={
        'evidence_id': evidence['id'], 'stance': 'supports', 'note': 'Direct support'
    })
    assert link.status_code == 200, link.text

    response = client.get('/api/search', params={'q': 'NiSource', 'investigation_id': inv['id']})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['investigation_id'] == inv['id']
    assert body['total'] >= 4
    assert {'entity', 'statement', 'evidence', 'claim'}.issubset(set(body['counts']))
    assert all(row['investigation_id'] == inv['id'] for row in body['results'])

    evidence_hit = next(row for row in body['results'] if row['type'] == 'evidence' and row['id'] == evidence['id'])
    assert evidence_hit['provenance']['source_id'] == source['id']
    assert evidence_hit['provenance']['source_url'] == 'https://example.test/filing'
    assert evidence_hit['provenance']['locator'] == 'p. 42'
    assert evidence_hit['provenance']['claim_links'][0]['claim_id'] == claim['id']
    assert evidence_hit['provenance']['claim_links'][0]['stance'] == 'supports'

    global_response = client.get('/api/search', params={'q': 'NiSource'})
    assert global_response.status_code == 200
    assert {row['investigation_id'] for row in global_response.json()['results']} >= {inv['id'], other['id']}


def test_claim_evidence_guards_cross_investigation_and_stance():
    client = TestClient(app)
    inv1 = client.post('/api/investigations', json={'name': 'Evidence one'}).json()
    inv2 = client.post('/api/investigations', json={'name': 'Evidence two'}).json()
    source = client.post('/api/sources', json={'investigation_id': inv1['id'], 'title': 'Source'}).json()
    evidence = client.post('/api/evidence', json={'source_id': source['id'], 'quote': 'Relevant fact'}).json()
    claim = client.post('/api/claims', json={'investigation_id': inv2['id'], 'text': 'Different investigation claim'}).json()

    cross = client.post(f"/api/claims/{claim['id']}/evidence", json={'evidence_id': evidence['id'], 'stance': 'supports'})
    assert cross.status_code == 400

    claim_same = client.post('/api/claims', json={'investigation_id': inv1['id'], 'text': 'Same investigation claim'}).json()
    bad = client.post(f"/api/claims/{claim_same['id']}/evidence", json={'evidence_id': evidence['id'], 'stance': 'proves'})
    assert bad.status_code == 400

    empty = client.post('/api/evidence', json={'source_id': source['id']})
    assert empty.status_code == 400


def test_search_results_expose_direct_provenance_trace_targets_across_reporting_chain():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Search navigation'}).json()
    entity = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Person', 'caption': 'Morgan Vale',
        'properties': {'name': ['Morgan Vale']},
    }).json()
    source = client.post('/api/sources', json={
        'investigation_id': inv['id'], 'title': 'Morgan Vale board filing', 'source_type': 'filing',
    }).json()
    evidence = client.post('/api/evidence', json={
        'source_id': source['id'], 'quote': 'Morgan Vale joined the board.', 'locator': 'page 2',
    }).json()
    claim = client.post('/api/claims', json={
        'investigation_id': inv['id'], 'text': 'Morgan Vale joined the board.', 'status': 'supported', 'confidence': 0.8,
    }).json()
    assert client.post(f"/api/claims/{claim['id']}/evidence", json={'evidence_id': evidence['id'], 'stance': 'supports'}).status_code == 200
    lead = client.post('/api/leads', json={
        'investigation_id': inv['id'], 'title': 'Morgan Vale board follow-up', 'detail': 'Confirm Morgan Vale appointment.', 'status': 'active',
    }).json()
    assert client.post(f"/api/leads/{lead['id']}/links", json={'claim_id': claim['id']}).status_code == 200
    task = client.post(f"/api/leads/{lead['id']}/convert", json={'kind': 'task', 'title': 'Morgan Vale board minutes'}).json()['record']

    body = client.get('/api/search', params={'q': 'Morgan Vale', 'investigation_id': inv['id']}).json()
    by_type = {row['type']: row for row in body['results']}
    assert by_type['entity']['provenance']['trace_record_type'] == 'entity'
    assert by_type['entity']['provenance']['trace_record_id'] == entity['id']
    assert by_type['source']['provenance']['trace_record_type'] == 'source'
    assert by_type['evidence']['provenance']['trace_record_type'] == 'evidence'
    assert by_type['claim']['provenance']['trace_record_type'] == 'claim'
    assert by_type['lead']['provenance']['trace_record_type'] == 'lead'
    assert by_type['lead']['provenance']['trace_record_id'] == lead['id']
    assert by_type['reporting_task']['provenance']['trace_record_type'] == 'task'
    assert by_type['reporting_task']['provenance']['trace_record_id'] == task['id']

    trace = client.get('/api/provenance/trace', params={'record_type': 'lead', 'record_id': lead['id']})
    assert trace.status_code == 200, trace.text
    payload = trace.json()
    assert payload['root']['lead']['id'] == lead['id']
    assert any(row['claim'] and row['claim']['id'] == claim['id'] for row in payload['claim_links'])
    assert any(row['lead']['id'] == lead['id'] for row in payload['lead_links'])


def test_search_ranking_and_groups_keep_external_findings_separate():
    from app.db.session import SessionLocal
    from app.models.domain import ConnectorFinding

    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Ranked search'}).json()
    exact = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Company', 'caption': 'Northstar Energy',
        'properties': {'name': ['Northstar Energy']},
    }).json()
    client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Company', 'caption': 'Regional Holdings',
        'properties': {'notes': ['Northstar Energy appears in a long background note about a subsidiary']},
    })
    source = client.post('/api/sources', json={
        'investigation_id': inv['id'], 'title': 'Northstar Energy filing', 'source_type': 'government',
    }).json()
    client.post('/api/evidence', json={
        'source_id': source['id'], 'quote': 'Northstar Energy disclosed the transaction.', 'locator': 'p. 4',
    })
    with SessionLocal() as db:
        db.add(ConnectorFinding(
            investigation_id=inv['id'], provider='aleph', provider_record_id='aleph-northstar',
            caption='Northstar Energy', schema='Company', properties={'name': ['Northstar Energy']},
            source_url='https://aleph.example.test/entities/aleph-northstar', raw={}, review_status='unreviewed',
        ))
        db.commit()

    response = client.get('/api/search', params={'q': 'Northstar Energy', 'investigation_id': inv['id'], 'limit': 2})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['total'] > body['returned'] == 2
    assert body['counts']['connector_finding'] == 1
    assert body['group_counts']['external_lead'] == 1
    assert body['group_counts']['canonical'] >= 2
    exact_hit = next(row for row in body['results'] if row['type'] == 'entity' and row['id'] == exact['id'])
    assert exact_hit['group'] == 'canonical'
    assert exact_hit['score'] == max(row['score'] for row in body['results'])

    full = client.get('/api/search', params={'q': 'Northstar Energy', 'investigation_id': inv['id'], 'limit': 50}).json()
    external = next(row for row in full['results'] if row['type'] == 'connector_finding')
    assert external['group'] == 'external_lead'
    assert 'trace_record_type' not in external['provenance']
