from fastapi.testclient import TestClient

from app.db.session import Base, SessionLocal, engine
from app.main import app
from app.models.domain import ConnectorFinding, DocumentChunk, ExtractionCandidate, Statement, TimelineEvent


def test_investigation_search_returns_typed_provenance_and_claim_evidence_links():
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Search provenance'}).json()
    other = client.post('/api/investigations', json={'name': 'Other investigation'}).json()

    entity = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Company', 'caption': 'Acme Holdings Inc.',
        'properties': {'name': ['Acme Holdings Inc.'], 'jurisdiction': ['Indiana']},
        'origin': 'reporter-notebook'
    }).json()
    client.post('/api/entities', json={
        'investigation_id': other['id'], 'schema': 'Company', 'caption': 'Acme Holdings Other',
        'properties': {'name': ['Acme Holdings Other']}
    })

    source = client.post('/api/sources', json={
        'investigation_id': inv['id'], 'title': 'Utility commission filing',
        'url': 'https://example.test/filing', 'source_type': 'government'
    }).json()
    evidence = client.post('/api/evidence', json={
        'source_id': source['id'],
        'quote': 'Acme Holdings requested approval for the Indiana project.',
        'locator': 'p. 42',
        'notes': 'Primary filing excerpt'
    }).json()
    claim = client.post('/api/claims', json={
        'investigation_id': inv['id'], 'text': 'Acme Holdings requested regulatory approval.',
        'status': 'supported', 'confidence': 0.8
    }).json()
    link = client.post(f"/api/claims/{claim['id']}/evidence", json={
        'evidence_id': evidence['id'], 'stance': 'supports', 'note': 'Direct support'
    })
    assert link.status_code == 200, link.text

    response = client.get('/api/search', params={'q': 'Acme Holdings', 'investigation_id': inv['id']})
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

    global_response = client.get('/api/search', params={'q': 'Acme Holdings'})
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


def test_prefiltered_record_types_still_match_via_own_fields_not_a_parents(): # noqa: E501
    """STRUCT-0036: the SQL-level prefilters added to statement/evidence/claim/
    reporting_task/timeline_event/connector_finding/extraction_candidate/
    document_chunk queries must never drop a hit whose OWN text matches the
    query, even when a related "parent" record's independently-scored fields
    (entity caption, document filename, etc.) never mention it. Mirrors the
    existing "Regional Holdings" entity-properties test but for every other
    record type this cycle's prefilter touched, including two that only match
    via a cast-to-text JSON column (connector_finding.properties,
    extraction_candidate.payload).
    """
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Prefilter safety'}).json()['id']
    token = 'Kestrelwood'

    # Statement matches via its own value even though the parent entity's
    # caption/schema/properties never mention the token.
    entity = client.post('/api/entities', json={
        'investigation_id': inv, 'schema': 'Company', 'caption': 'Ordinary Holdings', 'properties': {},
    }).json()
    with SessionLocal() as db:
        db.add(Statement(entity_id=entity['id'], prop='alias', value=f'{token} Trust', dataset='reporter'))
        db.commit()

    # Evidence matches only via its JOINED source's title, not its own quote/locator/notes.
    source = client.post('/api/sources', json={
        'investigation_id': inv, 'title': f'{token} Holdings disclosure', 'source_type': 'filing',
    }).json()
    client.post('/api/evidence', json={
        'source_id': source['id'], 'quote': 'Standard filing text with no distinguishing name.',
    })

    # Claim and reporting task: self-contained, match via their own text.
    client.post('/api/claims', json={'investigation_id': inv, 'text': f'{token} entity confirmed as owner.'})
    client.post('/api/reporting-tasks', json={'investigation_id': inv, 'title': f'Verify {token} filing'})

    with SessionLocal() as db:
        db.add(TimelineEvent(investigation_id=inv, title=f'{token} incorporated', date_start='2020-01-01'))
        # Connector finding matches only via its JSON properties field, not its caption.
        db.add(ConnectorFinding(
            investigation_id=inv, provider='aleph', provider_record_id='rec-prefilter-1',
            caption='Unrelated caption', schema='Company',
            properties={'notes': [f'{token} appears only in a background note']},
            raw={}, review_status='unreviewed',
        ))
        db.commit()

    upload = client.post(
        '/api/documents/upload',
        data={'investigation_id': inv, 'title': 'Doc'},
        files={'file': ('doc.txt', b'placeholder body', 'text/plain')},
    )
    assert upload.status_code == 200, upload.text
    document_id = upload.json()['id']
    with SessionLocal() as db:
        # DocumentChunk matches only via its own extracted text, not the document's filename.
        db.add(DocumentChunk(document_id=document_id, locator='p.1', ordinal=0, text=f'{token} was named as the registered agent.'))
        # ExtractionCandidate matches only via its JSON payload field.
        db.add(ExtractionCandidate(
            investigation_id=inv, document_id=document_id, candidate_type='entity',
            payload={'caption': f'{token} Ventures', 'schema': 'Company'}, review_status='proposed',
        ))
        db.commit()

    response = client.get('/api/search', params={'q': token, 'investigation_id': inv})
    assert response.status_code == 200, response.text
    body = response.json()
    by_type = {row['type'] for row in body['results']}
    assert {
        'statement', 'evidence', 'claim', 'reporting_task', 'timeline_event',
        'connector_finding', 'extraction_candidate', 'document_chunk',
    }.issubset(by_type), f"missing types: {({'statement', 'evidence', 'claim', 'reporting_task', 'timeline_event', 'connector_finding', 'extraction_candidate', 'document_chunk'} - by_type)}, got {by_type}"
