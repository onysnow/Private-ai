from fastapi.testclient import TestClient

from app.db.session import Base, engine
from app.main import app


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_core_preview_capabilities_do_not_require_ai():
    client = TestClient(app)
    response = client.get('/api/capabilities')
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['mode'] == 'core_preview'
    assert body['ai_features_enabled'] is False
    assert all(body['core'].values())


def test_reporter_core_workflow_document_to_evidence_claim_relationship_dossier_graph_lead():
    client = TestClient(app)

    inv = client.post('/api/investigations', json={
        'name': 'Core preview smoke',
        'description': 'End-to-end non-AI reporter workflow',
    }).json()

    # Upload a real text document and verify extraction creates review proposals.
    document_text = (
        'Ada North served on the Meridian Utility board.\n\n'
        'Meridian Utility Company paid North Consulting LLC for advisory work in 2025.\n'
    )
    upload = client.post(
        '/api/documents/upload',
        data={'investigation_id': inv['id'], 'title': 'Board and payment notes'},
        files={'file': ('notes.txt', document_text.encode('utf-8'), 'text/plain')},
    )
    assert upload.status_code == 200, upload.text
    doc = upload.json()
    assert doc['extraction_status'] == 'complete'
    assert doc['chunk_count'] >= 1
    assert doc['candidate_counts']['evidence'] >= 1

    candidates = client.get(f"/api/documents/{doc['id']}/candidates", params={'status': 'proposed'}).json()
    evidence_candidate = next(row for row in candidates if row['candidate_type'] == 'evidence')
    accepted_evidence = client.post(
        f"/api/extraction-candidates/{evidence_candidate['id']}/review",
        json={'decision': 'accept', 'note': 'Reviewed during preview smoke test'},
    )
    assert accepted_evidence.status_code == 200, accepted_evidence.text
    evidence = accepted_evidence.json()['record']

    # Create canonical entities explicitly. Extraction remains proposal-only until reporter review.
    ada = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Person', 'caption': 'Ada North',
        'properties': {'name': ['Ada North']}, 'origin': 'preview smoke',
    }).json()
    utility = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Company', 'caption': 'Meridian Utility Company',
        'properties': {'name': ['Meridian Utility Company']}, 'origin': 'preview smoke',
    }).json()

    # Evidence -> claim verification.
    claim = client.post('/api/claims', json={
        'investigation_id': inv['id'],
        'text': 'Ada North served on the Meridian Utility board.',
        'status': 'supported', 'confidence': 0.9,
    }).json()
    link = client.post(f"/api/claims/{claim['id']}/evidence", json={
        'evidence_id': evidence['id'], 'stance': 'supports', 'note': 'Direct document excerpt',
    })
    assert link.status_code == 200, link.text

    # Canonical FollowTheMoney relationship with exact evidence attached.
    relationship = client.post('/api/relationships', json={
        'investigation_id': inv['id'],
        'schema': 'Directorship',
        'source_entity_id': ada['id'],
        'target_entity_id': utility['id'],
        'properties': {'role': ['Board member']},
        'origin': 'preview smoke',
        'evidence_id': evidence['id'],
    })
    assert relationship.status_code == 200, relationship.text
    rel = relationship.json()

    # Relationship -> lead workflow.
    lead = client.post('/api/leads', json={
        'investigation_id': inv['id'],
        'title': 'Confirm board appointment dates',
        'detail': 'Find the original board appointment record.',
        'relationship_id': rel['id'],
        'status': 'active',
    })
    assert lead.status_code == 200, lead.text

    # The same records must be visible through the working surfaces.
    search = client.get('/api/search', params={'q': 'Ada North', 'investigation_id': inv['id']})
    assert search.status_code == 200, search.text
    types = {row['type'] for row in search.json()['results']}
    assert {'entity', 'evidence', 'claim'}.issubset(types)

    graph = client.get(f"/api/investigations/{inv['id']}/graph")
    assert graph.status_code == 200, graph.text
    assert any(edge['id'] == rel['id'] for edge in graph.json()['edges'])

    dossier = client.get(f"/api/entities/{ada['id']}/dossier")
    assert dossier.status_code == 200, dossier.text
    dbody = dossier.json()
    assert dbody['entity']['id'] == ada['id']
    assert any(row['id'] == rel['id'] for row in dbody['relationships'])

    trace = client.get('/api/provenance/trace', params={'record_type': 'relationship', 'record_id': rel['id']})
    assert trace.status_code == 200, trace.text
    tbody = trace.json()
    assert tbody['investigation_id'] == inv['id']
    assert tbody['root']['id'] == rel['id']

    leads = client.get(f"/api/investigations/{inv['id']}/leads")
    assert leads.status_code == 200
    assert any(row['id'] == lead.json()['id'] for row in leads.json())
