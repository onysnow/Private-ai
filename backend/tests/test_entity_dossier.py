from fastapi.testclient import TestClient

from app.db.session import Base, engine
from app.main import app


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_entity_dossier_assembles_canonical_evidence_relationships_and_leads():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Dossier test'}).json()
    company = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Company', 'caption': 'Acme Holdings Inc.',
        'properties': {'name': ['Acme Holdings Inc.'], 'alias': ['Acme Holdings']}, 'origin': 'reporter'
    }).json()
    person = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Person', 'caption': 'Jane Reporter',
        'properties': {'name': ['Jane Reporter']}
    }).json()
    rel = client.post('/api/relationships', json={
        'investigation_id': inv['id'], 'schema': 'Employment',
        'source_entity_id': person['id'], 'target_entity_id': company['id'],
        'properties': {'role': ['Executive']}, 'origin': 'employment filing'
    })
    assert rel.status_code == 200, rel.text

    source = client.post('/api/sources', json={
        'investigation_id': inv['id'], 'title': 'Commission filing', 'url': 'https://example.test/acme-holdings'
    }).json()
    evidence = client.post('/api/evidence', json={
        'source_id': source['id'], 'quote': 'Acme Holdings filed the application.', 'locator': 'p. 4'
    }).json()
    claim = client.post('/api/claims', json={
        'investigation_id': inv['id'], 'text': 'Acme Holdings sought commission approval.', 'status': 'supported', 'confidence': .8
    }).json()
    client.post(f"/api/claims/{claim['id']}/evidence", json={
        'evidence_id': evidence['id'], 'stance': 'supports'
    })
    client.post('/api/claims', json={
        'investigation_id': inv['id'], 'text': 'Unrelated company claim.'
    })
    client.post('/api/leads', json={
        'investigation_id': inv['id'], 'title': 'Check Acme Holdings board overlap', 'detail': 'Find current directors.'
    })

    response = client.get(f"/api/entities/{company['id']}/dossier")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['entity']['id'] == company['id']
    assert body['summary']['relationship_count'] == 1
    assert body['summary']['relationship_schemas']['Employment'] == 1
    assert body['summary']['claim_count'] == 1
    assert body['summary']['evidence_count'] == 1
    assert body['summary']['lead_count'] == 1
    assert body['claims'][0]['match_basis']['type'] == 'text_mention'
    assert body['evidence'][0]['source']['url'] == 'https://example.test/acme-holdings'
    assert body['evidence'][0]['claim_links'][0]['stance'] == 'supports'
    assert body['relationships'][0]['direction'] == 'incoming'
    assert body['statement_history']


def test_entity_dossier_404():
    client = TestClient(app)
    assert client.get('/api/entities/not-real/dossier').status_code == 404


def test_entity_dossier_uses_explicit_graph_context_without_text_name_matches():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Explicit dossier context'}).json()
    person = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Person', 'caption': 'Alice Example',
        'properties': {'name': ['Alice Example']}
    }).json()
    company = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Company', 'caption': 'Acme Holdings',
        'properties': {'name': ['Acme Holdings']}
    }).json()
    source = client.post('/api/sources', json={
        'investigation_id': inv['id'], 'title': 'Annual filing', 'url': 'https://example.test/filing'
    }).json()
    evidence = client.post('/api/evidence', json={
        'source_id': source['id'], 'quote': 'The director resigned on March 4.', 'locator': 'p. 9'
    }).json()
    claim = client.post('/api/claims', json={
        'investigation_id': inv['id'], 'text': 'The resignation occurred before the acquisition.',
        'status': 'disputed', 'confidence': .55
    }).json()
    client.post(f"/api/claims/{claim['id']}/evidence", json={
        'evidence_id': evidence['id'], 'stance': 'supports'
    })
    rel = client.post('/api/relationships', json={
        'investigation_id': inv['id'], 'schema': 'Directorship',
        'source_entity_id': person['id'], 'target_entity_id': company['id'],
        'properties': {'role': ['Director']}, 'evidence_id': evidence['id'], 'origin': 'annual filing p. 9'
    }).json()
    lead = client.post(f"/api/relationships/{rel['id']}/lead-from-context").json()
    task = client.post('/api/reporting-tasks', json={
        'investigation_id': inv['id'], 'lead_id': lead['id'], 'title': 'Verify resignation sequence',
        'status': 'todo', 'priority': 'high'
    })
    assert task.status_code == 200, task.text

    body = client.get(f"/api/entities/{company['id']}/dossier").json()
    assert body['summary']['claim_count'] == 1
    assert body['summary']['evidence_count'] == 1
    assert body['summary']['lead_count'] == 1
    assert body['summary']['task_count'] == 1
    assert body['claims'][0]['claim']['id'] == claim['id']
    assert body['claims'][0]['match_basis']['type'] == 'explicit_graph_context'
    assert body['evidence'][0]['evidence']['id'] == evidence['id']
    assert body['evidence'][0]['match_basis']['type'] == 'relationship_evidence'
    assert body['leads'][0]['lead']['id'] == lead['id']
    assert body['leads'][0]['match_basis']['type'] == 'explicit_lead_link'
    assert body['tasks'][0]['id'] == task.json()['id']
    assert body['tasks'][0]['task_context']['context']['relationships'][0]['id'] == rel['id']


def test_entity_dossier_exposes_canonical_identity_decisions_and_merge_audit():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Identity history dossier'}).json()
    alias = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Person', 'caption': 'A. Example',
        'properties': {'name': ['A. Example']}
    }).json()
    canonical = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Person', 'caption': 'Alice Example',
        'properties': {'name': ['Alice Example'], 'alias': ['A. Example']}
    }).json()
    decision = client.post(f"/api/entities/{alias['id']}/canonical-resolution", json={
        'other_entity_id': canonical['id'], 'decision': 'same', 'confidence': .96,
        'rationale': 'Reporter matched date of birth and filing history.'
    })
    assert decision.status_code == 200, decision.text
    preview = client.get(f"/api/entities/{alias['id']}/merge-preview?target_entity_id={canonical['id']}")
    assert preview.status_code == 200, preview.text
    assert preview.json()['can_execute'] is True
    merge = client.post(f"/api/entities/{alias['id']}/merge", json={
        'target_entity_id': canonical['id'], 'preview_digest': preview.json()['preview_digest'],
        'rationale': 'Preserve A. Example as an audited alias.'
    })
    assert merge.status_code == 200, merge.text

    body = client.get(f"/api/entities/{canonical['id']}/dossier").json()
    history = body['identity_history']
    assert body['summary']['identity_alias_count'] == 1
    assert history['aliases'][0]['id'] == alias['id']
    assert history['merge_audits'][0]['source_entity_id'] == alias['id']
    assert history['merge_audits'][0]['target_entity_id'] == canonical['id']
    # The canonical-resolution decision remains immutable history even though the
    # source record has subsequently become an alias.
    assert history['canonical_decisions'][0]['decision'] == 'same'
    assert history['canonical_decisions'][0]['confidence'] == .96
    assert history['canonical_decisions'][0]['other_entity']['id'] == alias['id']
    assert history['unresolved_decision_count'] == 0


def test_entity_dossier_surfaces_property_conflicts_without_silently_preferring_a_value():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Property conflict dossier'}).json()
    entity = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Person', 'caption': 'Casey Example',
        'properties': {'name': ['Casey Example'], 'employer': ['Company A', 'Company B']},
        'dataset': 'reporter-notes', 'origin': 'two conflicting filings'
    }).json()

    body = client.get(f"/api/entities/{entity['id']}/dossier").json()
    assert body['summary']['property_conflict_count'] == 1
    conflict = body['property_conflicts'][0]
    assert conflict['prop'] == 'employer'
    assert conflict['status'] == 'unresolved'
    assert conflict['preferred_value'] is None
    assert conflict['reason'] == 'multiple_canonical_values'
    assert {row['value'] for row in conflict['values']} == {'Company A', 'Company B'}
    assert all(row['canonical'] for row in conflict['values'])
    assert all(row['canonical_statements'][0]['dataset'] == 'reporter-notes' for row in conflict['values'])
    assert all(row['canonical_statements'][0]['origin'] == 'two conflicting filings' for row in conflict['values'])


def test_property_conflict_reporter_decisions_are_audited_and_drive_dossier_presentation_only():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Property adjudication'}).json()
    entity = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Person', 'caption': 'Jordan Example',
        'properties': {'name': ['Jordan Example'], 'employer': ['Company A', 'Company B']},
        'dataset': 'filings', 'origin': 'independent records'
    }).json()
    decision = client.post(f"/api/entities/{entity['id']}/property-conflicts/employer/decisions", json={
        'decision': 'temporal_change', 'values': ['Company A', 'Company B'],
        'rationale': 'Reporter determined the filings describe sequential employment periods.'
    })
    assert decision.status_code == 200, decision.text
    assert decision.json()['decision'] == 'temporal_change'

    body = client.get(f"/api/entities/{entity['id']}/dossier").json()
    conflict = body['property_conflicts'][0]
    assert conflict['status'] == 'temporal_change'
    assert conflict['preferred_value'] is None
    assert conflict['latest_decision']['rationale'].startswith('Reporter determined')
    assert len(conflict['decision_history']) == 1
    # Review is presentation/audit metadata only: both immutable FtM statements survive.
    history = [x for x in body['statement_history'] if x['prop'] == 'employer']
    assert {x['value'] for x in history} == {'Company A', 'Company B'}
    assert all(x['canonical'] for x in history)

    preferred = client.post(f"/api/entities/{entity['id']}/property-conflicts/employer/decisions", json={
        'decision': 'preferred', 'values': ['Company A', 'Company B'], 'preferred_value': 'Company B',
        'rationale': 'Newer verified filing is preferred for current-employer display.'
    })
    assert preferred.status_code == 200, preferred.text
    body = client.get(f"/api/entities/{entity['id']}/dossier").json()
    conflict = body['property_conflicts'][0]
    assert conflict['status'] == 'preferred'
    assert conflict['preferred_value'] == 'Company B'
    assert len(conflict['decision_history']) == 2
    assert {x['value'] for x in body['statement_history'] if x['prop'] == 'employer'} == {'Company A', 'Company B'}


def test_property_conflict_decision_rejects_invalid_preference():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Property adjudication validation'}).json()
    entity = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Person', 'caption': 'Taylor Example',
        'properties': {'name': ['Taylor Example'], 'employer': ['A', 'B']}
    }).json()
    response = client.post(f"/api/entities/{entity['id']}/property-conflicts/employer/decisions", json={
        'decision': 'preferred', 'values': ['A', 'B'], 'preferred_value': 'C'
    })
    assert response.status_code == 400


def test_temporal_property_review_requires_explicit_dates_and_surfaces_on_timeline():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Temporal property review'}).json()
    entity = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Person', 'caption': 'Morgan Example',
        'properties': {'name': ['Morgan Example'], 'employer': ['Company A', 'Company B']}
    }).json()
    source = client.post('/api/sources', json={'investigation_id': inv['id'], 'title': 'Employment filing', 'source_type': 'filing'}).json()
    evidence = client.post('/api/evidence', json={'source_id': source['id'], 'quote': 'Joined Company B in 2024.', 'locator': 'p. 4'}).json()
    missing = client.post(f"/api/entities/{entity['id']}/property-conflicts/employer/decisions", json={
        'decision': 'temporal_change', 'values': ['Company A', 'Company B'],
        'temporal_intervals': [{'value': 'Company B'}]
    })
    assert missing.status_code == 400
    reviewed = client.post(f"/api/entities/{entity['id']}/property-conflicts/employer/decisions", json={
        'decision': 'temporal_change', 'values': ['Company A', 'Company B'],
        'rationale': 'The filing establishes the new role; no end date for Company A is inferred.',
        'temporal_intervals': [{'value': 'Company B', 'date_start': '2024', 'precision': 'year', 'evidence_id': evidence['id']}]
    })
    assert reviewed.status_code == 200, reviewed.text
    dossier = client.get(f"/api/entities/{entity['id']}/dossier").json()
    assert dossier['property_conflicts'][0]['latest_decision']['temporal_intervals'][0]['date_start'] == '2024'
    timeline = client.get(f"/api/investigations/{inv['id']}/timeline").json()
    event = next(x for x in timeline['events'] if x['kind'] == 'property_temporal_interval')
    assert event['date_start'] == '2024'
    assert event['refs']['evidence_id'] == evidence['id']
    assert event['provenance']['locator'] == 'p. 4'
