"""#190: every extraction proposal explains, part by part, why it exists and where it came from."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db
from app.main import app
from app.models.domain import ExtractionCandidate

TEXT = 'Alice Example worked for Example Company Inc. in 2024. Short one.'


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.fixture()
def env():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)

    def override():
        with Session(engine) as db:
            yield db
    app.dependency_overrides[get_db] = override
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Explanations'}).json()['id']
    doc = client.post('/api/documents/upload', data={'investigation_id': inv, 'title': 'Filing'},
                      files={'file': ('filing.txt', TEXT.encode(), 'text/plain')}).json()
    return client, engine, inv, doc


def _candidates(client, doc_id, **params):
    return client.get(f"/api/documents/{doc_id}/candidates", params={'status': 'proposed', **params}).json()


def _explain(client, cid):
    res = client.get(f"/api/extraction-candidates/{cid}/explanation")
    assert res.status_code == 200
    return res.json()


def _part(expl, pid):
    return next(p for p in expl['parts'] if p['id'] == pid)


def test_extractor_records_rationale_on_new_payloads(env):
    client, _, _, doc = env
    rows = _candidates(client, doc['id'])
    claim = next(c for c in rows if c['candidate_type'] == 'claim')
    assert claim['payload']['rationale'] == {'rule': 'sentence_assertion', 'trigger': 'worked', 'length': len(claim['payload']['text'])}
    org = next(c for c in rows if c['candidate_type'] == 'entity' and c['payload']['caption'].startswith('Example Company'))
    assert org['payload']['rationale']['schema_basis'] == 'corporate_suffix'
    assert org['payload']['rationale']['matched'] == 'Company'
    assert (org['payload']['suggested_schema'], org['confidence']) == ('Company', 0.9)
    person = next(c for c in rows if c['candidate_type'] == 'entity' and c['payload']['caption'] == 'Alice Example')
    assert person['payload']['rationale'] == {'rule': 'capitalized_name_sequence', 'schema_basis': 'no_type_signal', 'confidence': 0.4}
    assert person['payload']['schema_choices'] == ['Person', 'Organization', 'Company', 'LegalEntity']
    evidence = next(c for c in rows if c['candidate_type'] == 'evidence')
    assert evidence['payload']['rationale'] == {'rule': 'whole_chunk'}


def test_claim_explanation_names_rule_trigger_span_and_confidence_meaning(env):
    client, _, _, doc = env
    claim = next(c for c in _candidates(client, doc['id']) if c['candidate_type'] == 'claim')
    expl = _explain(client, claim['id'])
    assert expl['method']['id'] == 'sentence_assertion' and expl['method']['automated'] is True
    assert expl['rationale_basis'] == 'recorded'
    part = _part(expl, 'text')
    assert part['value'] == claim['payload']['text']
    assert any('“worked”' in r for r in part['reasoning'])
    chunk = next(s for s in part['sources'] if s['kind'] == 'chunk')
    assert chunk['excerpt']['match'] == claim['payload']['text']
    assert chunk['excerpt']['start_char'] == claim['payload']['span']['start_char']
    assert expl['confidence']['value'] == pytest.approx(0.55)
    assert 'not a probability' in expl['confidence']['basis']
    kinds = {s['kind'] for s in expl['sources']}
    assert {'document', 'source'} <= kinds
    assert any('text-pattern match' in c for c in expl['caveats'])


def test_entity_explanation_separates_name_and_schema_reasoning(env):
    client, _, _, doc = env
    rows = _candidates(client, doc['id'])
    person = next(c for c in rows if c['candidate_type'] == 'entity' and c['payload']['caption'] == 'Alice Example')
    expl = _explain(client, person['id'])
    assert [p['id'] for p in expl['parts']] == ['caption', 'schema']
    assert 'Nothing in the text says what kind of entity this is' in _part(expl, 'schema')['reasoning'][0]
    assert expl['confidence']['basis'].startswith('0.40: nothing in the text says')
    assert _part(expl, 'caption')['sources'][0]['excerpt']['match'] == 'Alice Example'
    org = next(c for c in rows if c['candidate_type'] == 'entity' and c['payload']['caption'].startswith('Example Company'))
    assert 'legal form “Company”' in _part(_explain(client, org['id']), 'schema')['reasoning'][0]


def test_evidence_explanation_is_verbatim_whole_chunk(env):
    client, _, _, doc = env
    ev = next(c for c in _candidates(client, doc['id']) if c['candidate_type'] == 'evidence')
    expl = _explain(client, ev['id'])
    assert expl['method']['id'] == 'whole_chunk'
    quote = _part(expl, 'quote')
    assert quote['value'] == TEXT
    assert quote['sources'][0]['excerpt']['match'] == TEXT
    assert any('read directly from the file' in r for r in quote['reasoning'])


def test_list_with_explain_attaches_explanations_without_changing_default_shape(env):
    client, _, _, doc = env
    plain = _candidates(client, doc['id'])
    assert all('explanation' not in c for c in plain)
    explained = _candidates(client, doc['id'], explain='true')
    assert [c['id'] for c in explained] == [c['id'] for c in plain]
    for row in explained:
        assert row['explanation']['candidate_id'] == row['id']
        assert row['payload'] == next(c for c in plain if c['id'] == row['id'])['payload']


def test_legacy_candidate_without_rationale_is_reconstructed_and_flagged(env):
    client, engine, _, doc = env
    claim = next(c for c in _candidates(client, doc['id']) if c['candidate_type'] == 'claim')
    with Session(engine) as db:
        row = db.get(ExtractionCandidate, claim['id'])
        row.payload = {k: v for k, v in row.payload.items() if k != 'rationale'}
        db.commit()
    expl = _explain(client, claim['id'])
    assert expl['rationale_basis'] == 'reconstructed'
    assert 'reconstructed' in expl['caveats'][0]
    assert any('“worked”' in r for r in _part(expl, 'text')['reasoning'])


def test_openaleph_mention_explains_provider_origin_and_resolution_lead(env):
    client, engine, inv, doc = env
    with Session(engine) as db:
        row = ExtractionCandidate(
            investigation_id=inv, document_id=doc['id'], chunk_id=None, candidate_type='entity',
            payload={'caption': 'Acme Holdings', 'suggested_schema': 'Company', 'properties': {'name': ['Acme Holdings']},
                     'provenance': {'provider': 'openaleph', 'collection_id': '7', 'provider_document_id': 'd1',
                                    'provider_entity_id': 'm1', 'provider_schema': 'Mention',
                                    'provider_resolved_entity_id': 'e9', 'extraction_method': 'openaleph_ftm_analyze'}},
            confidence=1.0,
        )
        db.add(row)
        db.commit()
        cid = row.id
    expl = _explain(client, cid)
    assert expl['method']['id'] == 'openaleph_ftm_analyze'
    assert expl['rationale_basis'] == 'provider'
    assert [p['id'] for p in expl['parts']] == ['caption', 'schema', 'provider_resolution']
    assert 'lead only' in _part(expl, 'provider_resolution')['reasoning'][0]
    provider = next(s for s in expl['sources'] if s['kind'] == 'provider')
    assert provider['provider_entity_id'] == 'm1' and provider['collection_id'] == '7'
    assert any('no page locator' in c for c in expl['caveats'])
    assert not any('reconstructed' in c for c in expl['caveats'])


def test_relationship_proposal_is_broken_down_per_part(env):
    client, _, _, doc = env
    rows = _candidates(client, doc['id'])
    claim = next(c for c in rows if c['candidate_type'] == 'claim')
    person = next(c for c in rows if c['candidate_type'] == 'entity' and c['payload']['caption'] == 'Alice Example')
    org = next(c for c in rows if c['candidate_type'] == 'entity' and c['payload']['caption'].startswith('Example Company'))
    claim_id = client.post(f"/api/extraction-candidates/{claim['id']}/review", json={'decision': 'accept'}).json()['record']['id']
    a = client.post(f"/api/extraction-candidates/{person['id']}/review", json={'decision': 'accept', 'entity_schema': 'Person'}).json()['record']['id']
    b = client.post(f"/api/extraction-candidates/{org['id']}/review", json={'decision': 'accept', 'entity_schema': 'Company'}).json()['record']['id']
    staged = client.post(f"/api/claims/{claim_id}/relationship-proposals",
                         json={'schema': 'Employment', 'source_entity_id': a, 'target_entity_id': b, 'note': 'from filing'})
    assert staged.status_code == 200, staged.text
    expl = _explain(client, staged.json()['id'])
    assert expl['method'] == {**expl['method'], 'id': 'reporter_staged', 'automated': False}
    assert expl['rationale_basis'] == 'reporter'
    assert [p['id'] for p in expl['parts']] == ['schema', 'source', 'target', 'claim', 'evidence', 'note']
    assert _part(expl, 'source')['value'] == 'Alice Example'
    assert _part(expl, 'source')['sources'][0]['kind'] == 'entity'
    assert _part(expl, 'claim')['value'] == claim['payload']['text']
    assert _part(expl, 'evidence')['value'] == claim['payload']['text']
    assert expl['summary'].startswith('Employment: Alice Example → Example Company')
    assert expl['confidence']['basis'].startswith('No extractor confidence')


def test_explanation_404_and_unknown_type(env):
    client, engine, inv, doc = env
    assert client.get('/api/extraction-candidates/nope/explanation').status_code == 404
    with Session(engine) as db:
        row = ExtractionCandidate(investigation_id=inv, document_id=doc['id'], candidate_type='mystery', payload={}, confidence=0.0)
        db.add(row)
        db.commit()
        cid = row.id
    expl = _explain(client, cid)
    assert expl['method']['id'] == 'unknown' and expl['parts'] == []
