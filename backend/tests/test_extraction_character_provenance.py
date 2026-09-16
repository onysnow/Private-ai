from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
import pytest
from app.db.session import Base, get_db
from app.main import app

@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()

def client_for_test():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    def override():
        with __import__('sqlalchemy').orm.Session(engine) as db:
            yield db
    app.dependency_overrides[get_db] = override
    return TestClient(app)

def test_reviewed_extraction_preserves_exact_chunk_character_span():
    client = client_for_test()
    inv = client.post('/api/investigations', json={'name':'Character provenance'}).json()['id']
    text = 'Alice Example worked for Example Company Inc. in 2024. The filing was approved by the board.'
    doc = client.post('/api/documents/upload', data={'investigation_id':inv,'title':'Filing'}, files={'file':('filing.txt', text.encode(), 'text/plain')}).json()
    candidates = client.get(f"/api/documents/{doc['id']}/candidates?status=proposed").json()
    evidence = next(c for c in candidates if c['candidate_type']=='evidence')
    entity = next(c for c in candidates if c['candidate_type']=='entity' and c['payload']['caption']=='Alice Example')
    assert evidence['payload']['span'] == {'start_char':0,'end_char':len(text)}
    assert entity['payload']['span'] == {'start_char':0,'end_char':len('Alice Example')}
    accepted = client.post(f"/api/extraction-candidates/{entity['id']}/review", json={'decision':'accept','note':'Verified'}).json()['record']
    lineage = client.get(f"/api/extraction-candidates/{entity['id']}/lineage").json()
    assert lineage['chunk']['candidate_span'] == {'start_char':0,'end_char':len('Alice Example')}
    prov = client.get('/api/provenance/extraction-lineage', params={'record_type':'entity','record_id':accepted['id']}).json()['lineage']
    assert prov['chunk']['candidate_span']['end_char'] == 13

def test_accepting_extracted_claim_materializes_exact_supporting_evidence_and_trace():
    client = client_for_test()
    inv = client.post('/api/investigations', json={'name':'Claim span continuity'}).json()['id']
    text = 'Alice Example worked for Example Company Inc. in 2024. Another sentence without a claim verb.'
    doc = client.post('/api/documents/upload', data={'investigation_id':inv,'title':'Employment filing'}, files={'file':('employment.txt', text.encode(), 'text/plain')}).json()
    candidates = client.get(f"/api/documents/{doc['id']}/candidates?status=proposed").json()
    claim_candidate = next(c for c in candidates if c['candidate_type']=='claim')
    claim_text = claim_candidate['payload']['text']
    span = claim_candidate['payload']['span']
    assert text[span['start_char']:span['end_char']] == claim_text

    accepted = client.post(
        f"/api/extraction-candidates/{claim_candidate['id']}/review",
        json={'decision':'accept','note':'Reporter reviewed exact sentence','claim_status':'lead','confidence':0.6},
    ).json()['record']
    links = client.get(f"/api/claims/{accepted['id']}/evidence").json()
    assert len(links) == 1
    assert links[0]['stance'] == 'supports'
    assert links[0]['evidence']['quote'] == claim_text
    assert f"@chars:{span['start_char']}-{span['end_char']}" in links[0]['evidence']['locator']

    trace = client.get('/api/provenance/trace', params={'record_type':'claim','record_id':accepted['id']}).json()
    assert trace['root']['id'] == accepted['id']
    assert trace['evidence_links'][0]['evidence']['quote'] == claim_text
    assert trace['evidence_links'][0]['extraction_lineage']['chunk']['candidate_span'] == span

def test_extracted_claim_relationship_requires_explicit_review_and_traces_exact_span():
    client = client_for_test()
    inv = client.post('/api/investigations', json={'name':'Relationship extraction continuity'}).json()['id']
    text = 'Alice Example worked for Example Company Inc. in 2024.'
    doc = client.post('/api/documents/upload', data={'investigation_id':inv,'title':'Employment filing'}, files={'file':('employment.txt', text.encode(), 'text/plain')}).json()
    candidates = client.get(f"/api/documents/{doc['id']}/candidates?status=proposed").json()
    claim_candidate = next(c for c in candidates if c['candidate_type']=='claim')
    accepted_claim = client.post(f"/api/extraction-candidates/{claim_candidate['id']}/review", json={'decision':'accept'}).json()['record']
    evidence = client.get(f"/api/claims/{accepted_claim['id']}/evidence").json()[0]['evidence']
    alice = client.post('/api/entities', json={'investigation_id':inv,'schema':'Person','caption':'Alice Example','properties':{}}).json()
    company = client.post('/api/entities', json={'investigation_id':inv,'schema':'Organization','caption':'Example Company Inc.','properties':{}}).json()

    proposal = client.post(f"/api/claims/{accepted_claim['id']}/relationship-proposals", json={
        'schema':'Employment','source_entity_id':alice['id'],'target_entity_id':company['id'],
        'properties':{'role':['employee']},
    }).json()
    assert proposal['review_status'] == 'proposed'
    assert proposal['payload']['evidence_id'] == evidence['id']
    assert client.get(f"/api/investigations/{inv}/relationships").json() == []

    promoted = client.post(f"/api/extraction-candidates/{proposal['id']}/review", json={'decision':'accept','note':'Reporter verified endpoints'}).json()['record']
    assert promoted['schema'] == 'Employment'
    assert promoted['provenance']['evidence_attachments'][0]['evidence']['id'] == evidence['id']
    assert any(s['origin'] == f"extraction-candidate:{proposal['id']}" for s in promoted['statements'])
    lineage = client.get(f"/api/extraction-candidates/{proposal['id']}/lineage").json()
    assert lineage['chunk']['candidate_span'] == claim_candidate['payload']['span']
    trace = client.get('/api/provenance/trace', params={'record_type':'relationship','record_id':promoted['id']}).json()
    assert trace['root']['id'] == promoted['id']
    rel_evidence = next(row for row in trace['evidence_links'] if row['evidence']['id'] == evidence['id'])
    assert rel_evidence['extraction_lineage']['chunk']['candidate_span'] == claim_candidate['payload']['span']


def test_accepting_extracted_evidence_materializes_character_locator_and_rejects_span_drift():
    client = client_for_test()
    inv = client.post('/api/investigations', json={'name':'Evidence span continuity'}).json()['id']
    text = 'Exact source text that must remain independently traceable.'
    doc = client.post('/api/documents/upload', data={'investigation_id':inv,'title':'Source'}, files={'file':('source.txt', text.encode(), 'text/plain')}).json()
    candidates = client.get(f"/api/documents/{doc['id']}/candidates?status=proposed").json()
    evidence_candidate = next(c for c in candidates if c['candidate_type']=='evidence')
    span = evidence_candidate['payload']['span']
    accepted = client.post(f"/api/extraction-candidates/{evidence_candidate['id']}/review", json={'decision':'accept','note':'Reporter checked exact text'})
    assert accepted.status_code == 200
    evidence = accepted.json()['record']
    assert evidence['quote'] == text
    assert evidence['locator'].endswith(f"@chars:{span['start_char']}-{span['end_char']}")
    trace = client.get('/api/provenance/trace', params={'record_type':'evidence','record_id':evidence['id']}).json()
    assert trace['root']['id'] == evidence['id']
    assert trace['extraction_lineage']['chunk']['candidate_span'] == span


def test_entity_candidate_requires_identity_review_when_likely_match_exists_and_can_reuse_canonical_entity():
    client = client_for_test()
    inv = client.post('/api/investigations', json={'name':'Entity preaccept resolution'}).json()['id']
    canonical = client.post('/api/entities', json={'investigation_id':inv,'schema':'Person','caption':'Alice Example','properties':{}}).json()
    text = 'Alice Example worked for Example Company Inc.'
    doc = client.post('/api/documents/upload', data={'investigation_id':inv,'title':'Filing'}, files={'file':('filing.txt', text.encode(), 'text/plain')}).json()
    candidate = next(c for c in client.get(f"/api/documents/{doc['id']}/candidates?status=proposed").json() if c['candidate_type']=='entity' and c['payload']['caption']=='Alice Example')
    preview = client.get(f"/api/extraction-candidates/{candidate['id']}/entity-matches").json()
    assert preview['strong_match']['entity_id'] == canonical['id']
    assert preview['provider_lead']['provider_resolved_entity_id'] is None

    blocked = client.post(f"/api/extraction-candidates/{candidate['id']}/review", json={'decision':'accept'})
    assert blocked.status_code == 400
    assert 'review identity' in blocked.json()['detail']

    accepted = client.post(f"/api/extraction-candidates/{candidate['id']}/review", json={
        'decision':'accept','matched_entity_id':canonical['id'],'entity_identity_decision':'same','note':'Reporter confirmed same person'
    })
    assert accepted.status_code == 200
    assert accepted.json()['record']['id'] == canonical['id']
    active = client.get(f'/api/investigations/{inv}/entities').json()
    assert len([e for e in active if e['schema']=='Person' and e['caption']=='Alice Example']) == 1


def test_entity_candidate_can_record_explicit_different_decision_before_creating_new_entity():
    client = client_for_test()
    inv = client.post('/api/investigations', json={'name':'Entity negative resolution'}).json()['id']
    canonical = client.post('/api/entities', json={'investigation_id':inv,'schema':'Person','caption':'Alice Example','properties':{}}).json()
    doc = client.post('/api/documents/upload', data={'investigation_id':inv,'title':'Second Alice'}, files={'file':('alice.txt', b'Alice Example testified at the hearing.', 'text/plain')}).json()
    candidate = next(c for c in client.get(f"/api/documents/{doc['id']}/candidates?status=proposed").json() if c['candidate_type']=='entity' and c['payload']['caption']=='Alice Example')
    accepted = client.post(f"/api/extraction-candidates/{candidate['id']}/review", json={
        'decision':'accept','matched_entity_id':canonical['id'],'entity_identity_decision':'different','note':'Reporter verified distinct person','confidence':0.95
    })
    assert accepted.status_code == 200
    new_entity = accepted.json()['record']
    assert new_entity['id'] != canonical['id']
    dupes = client.get(f"/api/entities/{new_entity['id']}/duplicate-candidates").json()
    decision = next(row['latest_decision'] for row in dupes if row['entity_id']==canonical['id'])
    assert decision['decision'] == 'different'
