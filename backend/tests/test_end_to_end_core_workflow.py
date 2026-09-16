import io
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base, get_db
from app.main import app
from app.services.exports import restore_investigation_export

client = TestClient(app)


def _must(response, status=200):
    assert response.status_code == status, response.text
    return response.json() if response.content else None


def test_reporter_reviewed_end_to_end_core_workflow(tmp_path):
    # Investigation
    inv = _must(client.post('/api/investigations', json={
        'name': 'E2E provenance case',
        'description': 'Exercises reviewed source-to-lead workflow',
    }))
    inv_id = inv['id']

    # Source/document -> deterministic extraction proposals. No proposal becomes canonical by itself.
    text = (
        'Jordan Hale served as a director of Acme Energy Inc. on August 12, 2026.\n\n'
        'Acme Energy Inc. reported the appointment in its board filing.\n'
    )
    doc = _must(client.post(
        '/api/documents/upload',
        data={'investigation_id': inv_id, 'title': 'Board filing excerpt'},
        files={'file': ('board-filing.txt', text.encode(), 'text/plain')},
    ))
    assert doc['extraction_status'] == 'complete'
    assert _must(client.get(f'/api/investigations/{inv_id}/entities')) == []
    assert _must(client.get(f'/api/investigations/{inv_id}/claims')) == []

    candidates = _must(client.get(f"/api/documents/{doc['id']}/candidates", params={'status': 'proposed'}))
    person_candidate = next(c for c in candidates if c['candidate_type'] == 'entity' and c['payload']['caption'] == 'Jordan Hale')
    company_candidate = next(c for c in candidates if c['candidate_type'] == 'entity' and c['payload']['caption'] == 'Acme Energy Inc')
    evidence_candidate = next(c for c in candidates if c['candidate_type'] == 'evidence' and 'Jordan Hale served' in c['payload']['quote'])
    claim_candidate = next(c for c in candidates if c['candidate_type'] == 'claim' and 'Jordan Hale served' in c['payload']['text'])

    person = _must(client.post(f"/api/extraction-candidates/{person_candidate['id']}/review", json={
        'decision': 'accept', 'entity_schema': 'Person', 'caption': 'Jordan Hale', 'note': 'Reporter matched filing text',
    }))['record']
    company = _must(client.post(f"/api/extraction-candidates/{company_candidate['id']}/review", json={
        'decision': 'accept', 'entity_schema': 'Company', 'caption': 'Acme Energy Inc.', 'note': 'Reporter matched filing text',
    }))['record']
    support_evidence = _must(client.post(f"/api/extraction-candidates/{evidence_candidate['id']}/review", json={
        'decision': 'accept', 'note': 'Exact filing sentence checked',
    }))['record']
    claim = _must(client.post(f"/api/extraction-candidates/{claim_candidate['id']}/review", json={
        'decision': 'accept', 'claim_status': 'unverified', 'confidence': 0.65,
        'note': 'Retain as disputed until contrary record is resolved',
    }))['record']

    # Evidence and contradiction/status handling.
    _must(client.post(f"/api/claims/{claim['id']}/evidence", json={
        'evidence_id': support_evidence['id'], 'stance': 'supports', 'note': 'Primary filing supports appointment',
    }))
    contrary_source = _must(client.post('/api/sources', json={
        'investigation_id': inv_id,
        'title': 'Later correction notice',
        'url': 'https://example.test/correction',
        'source_type': 'filing',
        'metadata_json': {'retrieved_at': '2026-09-12T12:00:00Z'},
    }))
    contrary_evidence = _must(client.post('/api/evidence', json={
        'source_id': contrary_source['id'],
        'quote': 'Jordan Hale was not appointed to the Acme Energy Inc. board.',
        'locator': 'page 1, paragraph 2',
        'notes': 'Exact correction language',
    }))
    _must(client.post(f"/api/claims/{claim['id']}/evidence", json={
        'evidence_id': contrary_evidence['id'], 'stance': 'contradicts', 'note': 'Correction directly conflicts',
    }))
    claim_evidence = _must(client.get(f"/api/claims/{claim['id']}/evidence"))
    assert {row['stance'] for row in claim_evidence} == {'supports', 'contradicts'}

    claim = _must(client.patch(f"/api/claims/{claim['id']}", json={
        'status': 'disputed', 'confidence': 0.5,
    }))
    assert claim['status'] == 'disputed'

    # Canonical FollowTheMoney interstitial relationship with exact reviewed provenance.
    rel_origin = f"document:{doc['id']}#line 1"
    relationship = _must(client.post('/api/relationships', json={
        'investigation_id': inv_id,
        'schema': 'Directorship',
        'source_entity_id': person['id'],
        'target_entity_id': company['id'],
        'properties': {'role': ['Director'], 'startDate': ['2026-08-12']},
        'dataset': 'reporter-reviewed',
        'origin': rel_origin,
        'evidence_id': support_evidence['id'],
    }))
    assert relationship['source']['id'] == person['id']
    assert relationship['target']['id'] == company['id']
    assert relationship['provenance']['statement_count'] >= 4
    assert any(item.startswith(f'reporter-reviewed|{rel_origin}') for item in relationship['provenance']['sources'])
    assert relationship['provenance']['evidence_attachments'][0]['evidence']['id'] == support_evidence['id']
    assert relationship['provenance']['evidence_attachments'][0]['evidence']['locator'] == support_evidence['locator']
    assert relationship['provenance']['evidence_attachments'][0]['evidence']['source']['id'] == doc['source_id']

    # Provenance trace on extracted canonical entity.
    history = _must(client.get(f"/api/entities/{person['id']}/statement-history"))
    name_bucket = next(row for row in history if row['prop'] == 'name' and row['value'] == 'Jordan Hale')
    assert name_bucket['canonical'] is True
    assert name_bucket['canonical_statements'][0]['dataset'].startswith('document:')
    assert name_bucket['canonical_statements'][0]['origin'].startswith(f"document:{doc['id']}#line 1")

    # Timeline, lead, links, and reporting task close the reporting loop.
    timeline_event = _must(client.post('/api/timeline-events', json={
        'investigation_id': inv_id,
        'title': 'Reported board appointment',
        'description': 'Appointment is disputed by a later correction.',
        'date_start': '2026-08-12',
        'precision': 'day',
        'verification_status': 'disputed',
        'entity_id': person['id'],
        'relationship_entity_id': relationship['relationship_entity_id'],
        'evidence_id': support_evidence['id'],
        'claim_id': claim['id'],
        'dataset': 'reporter-reviewed',
        'origin': rel_origin,
    }))
    lead = _must(client.post('/api/leads', json={
        'investigation_id': inv_id,
        'title': 'Resolve Jordan Hale board contradiction',
        'detail': 'Obtain board minutes and reconcile filing with correction notice.',
        'status': 'active',
    }))
    _must(client.post(f"/api/leads/{lead['id']}/links", json={'entity_id': person['id'], 'note': 'Subject'}))
    _must(client.post(f"/api/leads/{lead['id']}/links", json={'claim_id': claim['id'], 'note': 'Disputed claim'}))
    _must(client.post(f"/api/leads/{lead['id']}/links", json={'evidence_id': contrary_evidence['id'], 'note': 'Contrary evidence'}))
    converted = _must(client.post(f"/api/leads/{lead['id']}/convert", json={
        'kind': 'task', 'title': 'Request Acme board minutes', 'priority': 'high', 'owner': 'reporter',
    }))
    assert converted['kind'] == 'task'
    assert converted['record']['lead_id'] == lead['id']

    # Search -> dossier/graph/timeline surfaces all resolve against the same canonical investigation.
    inv_search = _must(client.get('/api/search', params={'investigation_id': inv_id, 'q': 'Jordan Hale'}))
    assert any(hit['type'] == 'entity' and hit['id'] == person['id'] for hit in inv_search['results'])
    global_search = _must(client.get('/api/search', params={'q': 'Jordan Hale'}))
    assert any(hit['investigation_id'] == inv_id for hit in global_search['results'])

    graph = _must(client.get(f'/api/investigations/{inv_id}/graph'))
    assert {node['id'] for node in graph['nodes']} >= {person['id'], company['id']}
    assert any(edge['id'] == relationship['id'] for edge in graph['edges'])

    timeline = _must(client.get(f'/api/investigations/{inv_id}/timeline'))
    assert any(event['id'] == timeline_event['id'] and event['verification_status'] == 'disputed' for event in timeline['events'])

    dossier = _must(client.get(f"/api/entities/{person['id']}/dossier"))
    assert dossier['summary']['relationship_count'] >= 1
    assert dossier['summary']['claim_statuses'].get('disputed', 0) >= 1
    assert dossier['summary']['evidence_count'] >= 2
    assert dossier['summary']['lead_count'] >= 1
    assert dossier['summary']['timeline_event_count'] >= 1
    assert any(row['claim']['id'] == claim['id'] for row in dossier['claims'])

    # Portable export and backup inspection validate the final graph of records and raw source file.
    package = client.get(f'/api/investigations/{inv_id}/export')
    assert package.status_code == 200, package.text
    inspected = _must(client.post('/api/backups/inspect', files={
        'file': ('case.jwbackup.zip', io.BytesIO(package.content), 'application/zip')
    }))
    counts = inspected['record_counts']
    assert counts['entities'] >= 3  # two endpoints + relationship entity
    assert counts['statements'] >= 1
    assert counts['sources'] >= 2
    assert counts['evidence'] >= 2
    assert counts['claim_evidence_links'] >= 2
    assert counts['relationship_edges'] >= 1
    assert counts['timeline_events'] >= 1
    assert counts['leads'] >= 1
    assert counts['reporting_tasks'] >= 1
    assert counts['documents'] >= 1
    assert counts['document_chunks'] >= 1


    # Restore the same complete reporter graph into a clean database and prove that
    # reporter-facing read surfaces still resolve after the portable round trip.
    restore_engine = create_engine(
        f"sqlite:///{tmp_path / 'workflow-restored.db'}",
        connect_args={'check_same_thread': False},
    )
    Base.metadata.create_all(restore_engine)
    RestoreSession = sessionmaker(bind=restore_engine, autoflush=False, autocommit=False)
    restored_storage = tmp_path / 'restored-documents'
    with RestoreSession() as restore_db:
        restored = restore_investigation_export(restore_db, package.content, restored_storage)
        assert restored['investigation_id'] == inv_id

    def restored_db_dependency():
        db = RestoreSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = restored_db_dependency
    try:
        restored_client = TestClient(app)
        restored_graph = _must(restored_client.get(f'/api/investigations/{inv_id}/graph'))
        assert {node['id'] for node in restored_graph['nodes']} >= {person['id'], company['id']}
        assert any(edge['id'] == relationship['id'] for edge in restored_graph['edges'])

        restored_timeline = _must(restored_client.get(f'/api/investigations/{inv_id}/timeline'))
        assert any(event['id'] == timeline_event['id'] and event['verification_status'] == 'disputed' for event in restored_timeline['events'])

        restored_dossier = _must(restored_client.get(f"/api/entities/{person['id']}/dossier"))
        assert restored_dossier['summary']['relationship_count'] >= 1
        assert restored_dossier['summary']['claim_statuses'].get('disputed', 0) >= 1
        assert restored_dossier['summary']['evidence_count'] >= 2
        assert restored_dossier['summary']['lead_count'] >= 1
        assert restored_dossier['summary']['timeline_event_count'] >= 1

        restored_search = _must(restored_client.get('/api/search', params={'investigation_id': inv_id, 'q': 'Jordan Hale'}))
        assert any(hit['type'] == 'entity' and hit['id'] == person['id'] for hit in restored_search['results'])

        restored_claim_evidence = _must(restored_client.get(f"/api/claims/{claim['id']}/evidence"))
        assert {row['stance'] for row in restored_claim_evidence} == {'supports', 'contradicts'}

        restored_history = _must(restored_client.get(f"/api/entities/{person['id']}/statement-history"))
        restored_name = next(row for row in restored_history if row['prop'] == 'name' and row['value'] == 'Jordan Hale')
        assert restored_name['canonical_statements'][0]['origin'].startswith(f"document:{doc['id']}#line 1")

        restored_doc = _must(restored_client.get(f"/api/documents/{doc['id']}"))
        assert restored_doc['id'] == doc['id']
        restored_files = [path for path in restored_storage.rglob('*') if path.is_file()]
        assert any(path.read_bytes() == text.encode() for path in restored_files)
    finally:
        app.dependency_overrides.clear()
        restore_engine.dispose()
