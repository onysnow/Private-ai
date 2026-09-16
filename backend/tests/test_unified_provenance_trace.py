from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_unified_provenance_trace_connects_claim_evidence_relationship_and_lead():
    inv = client.post('/api/investigations', json={'name': 'Unified provenance'}).json()
    person = client.post('/api/entities', json={'investigation_id': inv['id'], 'schema': 'Person', 'caption': 'Reporter Person', 'properties': {}}).json()
    company = client.post('/api/entities', json={'investigation_id': inv['id'], 'schema': 'Company', 'caption': 'Example Co', 'properties': {}}).json()
    source = client.post('/api/sources', json={'investigation_id': inv['id'], 'title': 'Board filing', 'url': 'https://example.test/board'}).json()
    evidence = client.post('/api/evidence', json={'source_id': source['id'], 'quote': 'Reporter Person joined the board.', 'locator': 'p. 7'}).json()
    claim = client.post('/api/claims', json={'investigation_id': inv['id'], 'text': 'Reporter Person served on Example Co board.', 'status': 'supported', 'confidence': 0.8}).json()
    link = client.post(f"/api/claims/{claim['id']}/evidence", json={'evidence_id': evidence['id'], 'stance': 'supports', 'note': 'Primary filing'} )
    assert link.status_code == 200, link.text
    rel = client.post('/api/relationships', json={
        'investigation_id': inv['id'], 'schema': 'Directorship', 'source_entity_id': person['id'],
        'target_entity_id': company['id'], 'evidence_id': evidence['id'],
    }).json()
    lead = client.post('/api/leads', json={'investigation_id': inv['id'], 'title': 'Check board dates', 'detail': 'Verify start and end dates'}).json()
    lead_link = client.post(f"/api/leads/{lead['id']}/links", json={'evidence_id': evidence['id'], 'note': 'Follow exact filing'} )
    assert lead_link.status_code == 200, lead_link.text

    trace = client.get('/api/provenance/trace', params={'record_type': 'evidence', 'record_id': evidence['id']})
    assert trace.status_code == 200, trace.text
    body = trace.json()
    assert body['root']['source']['url'] == 'https://example.test/board'
    assert body['claim_links'][0]['stance'] == 'supports'
    assert body['claim_links'][0]['claim']['id'] == claim['id']
    assert body['relationships'][0]['id'] == rel['id']
    assert body['relationships'][0]['provenance']['evidence_attachments'][0]['evidence']['locator'] == 'p. 7'
    assert body['lead_links'][0]['lead']['id'] == lead['id']

    claim_trace = client.get('/api/provenance/trace', params={'record_type': 'claim', 'record_id': claim['id']}).json()
    assert claim_trace['evidence_links'][0]['evidence']['id'] == evidence['id']
    assert claim_trace['relationships'][0]['id'] == rel['id']

    rel_trace = client.get('/api/provenance/trace', params={'record_type': 'relationship', 'record_id': rel['id']}).json()
    assert rel_trace['evidence_links'][0]['evidence']['id'] == evidence['id']
    assert rel_trace['root']['relationship']['relationship_entity_id'] == rel['relationship_entity_id']


def test_unified_provenance_trace_rejects_unknown_type_and_missing_record():
    bad_type = client.get('/api/provenance/trace', params={'record_type': 'mystery', 'record_id': 'x'})
    assert bad_type.status_code == 400
    missing = client.get('/api/provenance/trace', params={'record_type': 'evidence', 'record_id': 'missing'})
    assert missing.status_code == 404


def test_unified_provenance_trace_starts_from_source_and_document():
    inv = client.post('/api/investigations', json={'name': 'Source provenance'}).json()
    upload = client.post(
        '/api/documents/upload',
        data={'investigation_id': inv['id'], 'title': 'Committee minutes'},
        files={'file': ('minutes.txt', b'Jordan Hale served on the committee.', 'text/plain')},
    )
    assert upload.status_code == 200, upload.text
    doc = upload.json()
    source_id = doc['source_id']

    proposed = client.get(
        f"/api/documents/{doc['id']}/candidates",
        params={'candidate_type': 'evidence', 'status': 'proposed'},
    ).json()
    assert proposed
    accepted = client.post(
        f"/api/extraction-candidates/{proposed[0]['id']}/review",
        json={'decision': 'accept', 'note': 'Use exact extracted text'},
    )
    assert accepted.status_code == 200, accepted.text
    evidence_id = accepted.json()['record']['id']

    claim = client.post('/api/claims', json={
        'investigation_id': inv['id'], 'text': 'Jordan Hale served on the committee.',
        'status': 'supported', 'confidence': 0.9,
    }).json()
    linked = client.post(
        f"/api/claims/{claim['id']}/evidence",
        json={'evidence_id': evidence_id, 'stance': 'supports', 'note': 'Minutes'},
    )
    assert linked.status_code == 200, linked.text
    lead = client.post('/api/leads', json={
        'investigation_id': inv['id'], 'title': 'Confirm committee dates', 'detail': 'Find appointment dates',
    }).json()
    lead_link = client.post(f"/api/leads/{lead['id']}/links", json={'source_id': source_id, 'note': 'Source follow-up'})
    assert lead_link.status_code == 200, lead_link.text

    source_trace = client.get('/api/provenance/trace', params={'record_type': 'source', 'record_id': source_id})
    assert source_trace.status_code == 200, source_trace.text
    body = source_trace.json()
    assert body['root']['type'] == 'source'
    assert body['root']['document']['id'] == doc['id']
    assert body['evidence_links'][0]['evidence']['id'] == evidence_id
    assert body['evidence_links'][0]['extraction_lineage']['document']['id'] == doc['id']
    assert body['claim_links'][0]['claim']['id'] == claim['id']
    assert body['lead_links'][0]['lead']['id'] == lead['id']

    document_trace = client.get('/api/provenance/trace', params={'record_type': 'document', 'record_id': doc['id']})
    assert document_trace.status_code == 200, document_trace.text
    dbody = document_trace.json()
    assert dbody['root']['type'] == 'document'
    assert dbody['root']['source']['id'] == source_id
    assert dbody['root']['document']['sha256'] == doc['sha256']
    assert dbody['evidence_links'][0]['evidence']['id'] == evidence_id
    assert dbody['claim_links'][0]['stance'] == 'supports'
    assert dbody['lead_links'][0]['lead']['id'] == lead['id']
