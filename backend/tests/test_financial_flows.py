"""Payment relationships and the financial-flow ledger built from them."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db
from app.main import app


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
    inv = client.post('/api/investigations', json={'name': 'Flows'}).json()['id']

    def entity(caption, schema='Company'):
        res = client.post('/api/entities', json={'investigation_id': inv, 'schema': schema, 'caption': caption})
        assert res.status_code == 200, res.text
        return res.json()['id']
    return client, inv, entity


def _payment(client, inv, a, b, **props):
    return client.post('/api/relationships', json={
        'investigation_id': inv, 'schema': 'Payment', 'source_entity_id': a, 'target_entity_id': b,
        'properties': {k: [v] if isinstance(v, str) else v for k, v in props.items()},
    })


def _ledger(client, inv):
    res = client.get(f'/api/investigations/{inv}/financial-flows')
    assert res.status_code == 200, res.text
    return res.json()


def test_payment_relationship_uses_ftm_payer_and_beneficiary(env):
    client, inv, entity = env
    a, b = entity('Acme Ltd'), entity('Harbor Trust')
    res = _payment(client, inv, a, b, amount='1,250.50', currency='usd', date='2024-03-02', purpose='consulting')
    assert res.status_code == 200, res.text
    rel = client.get(f'/api/investigations/{inv}/relationships').json()[0]
    assert rel['schema'] == 'Payment'
    assert rel['source_prop'] == 'payer' and rel['target_prop'] == 'beneficiary'
    assert rel['properties']['amount'] == ['1250.50']
    assert rel['properties']['currency'] == ['USD']


@pytest.mark.parametrize('props, message', [
    ({'amount': 'lots'}, 'amount must be a number'),
    ({'currency': 'dollars'}, '3-letter'),
    ({'date': '03/02/2024'}, 'YYYY'),
])
def test_payment_rejects_values_the_ledger_could_not_read(env, props, message):
    client, inv, entity = env
    a, b = entity('Acme Ltd'), entity('Harbor Trust')
    res = _payment(client, inv, a, b, **props)
    assert res.status_code == 400
    assert message in res.text


def test_ledger_lists_complete_payments_and_separates_incomplete_ones(env):
    client, inv, entity = env
    a, b, c = entity('Acme Ltd'), entity('Harbor Trust'), entity('Jane Doe', 'Person')
    _payment(client, inv, a, b, amount='100', currency='USD', date='2024-01-05', purpose='fees')
    _payment(client, inv, b, c, amount='40', currency='EUR', date='2024-02')
    _payment(client, inv, a, c, currency='USD')  # no amount
    _payment(client, inv, c, a, amount='5')  # no currency
    _payment(client, inv, a, c, amount=['1', '2'], currency='USD')  # two amounts
    # A non-payment relationship is ignored by the ledger.
    client.post('/api/relationships', json={'investigation_id': inv, 'schema': 'Ownership', 'source_entity_id': a, 'target_entity_id': b})

    ledger = _ledger(client, inv)
    txns = ledger['transactions']
    assert [(t['from'], t['to'], t['amount'], t['currency'], t['dateTime']) for t in txns] == [
        ('Acme Ltd', 'Harbor Trust', 100.0, 'USD', '2024-01-05'),
        ('Harbor Trust', 'Jane Doe', 40.0, 'EUR', '2024-02'),
    ]
    assert txns[0]['statedPurpose'] == 'fees'
    assert ledger['currencies'] == ['EUR', 'USD']
    problems = sorted(p for row in ledger['incomplete'] for p in row['problems'])
    assert problems == ['amount missing', 'amount multiple values: 1, 2', 'currency missing']
    assert 'direct' in ledger['flow_type_rule']


def test_flow_type_is_direct_only_with_supporting_reviewed_evidence(env):
    client, inv, entity = env
    a, b = entity('Acme Ltd'), entity('Harbor Trust')
    src = client.post('/api/sources', json={'investigation_id': inv, 'title': 'Bank statement', 'source_type': 'document'})
    assert src.status_code == 200, src.text
    ev = client.post('/api/evidence', json={'source_id': src.json()['id'], 'quote': 'Wire 100 USD to Harbor Trust', 'locator': 'p.2'})
    assert ev.status_code == 200, ev.text
    ev_id = ev.json()['id']
    rel_id = _payment(client, inv, a, b, amount='100', currency='USD').json()['id']
    client.post(f'/api/relationships/{rel_id}/evidence', json={'evidence_id': ev_id})

    txn = _ledger(client, inv)['transactions'][0]
    assert txn['flowType'] == 'inferred'  # attached but not yet reviewed
    assert txn['evidence'] == 'p.2 [unreviewed]'

    res = client.post(f'/api/relationships/{rel_id}/evidence/{ev_id}/reviews', json={'stance': 'supports', 'rationale': 'Statement shows the wire.'})
    assert res.status_code == 200, res.text
    txn = _ledger(client, inv)['transactions'][0]
    assert txn['flowType'] == 'direct'
    assert txn['supporting_evidence_count'] == 1


def test_same_caption_entities_are_not_merged_in_the_ledger(env):
    client, inv, entity = env
    a1, a2, b = entity('Acme Ltd'), entity('Acme Ltd'), entity('Harbor Trust')
    _payment(client, inv, a1, b, amount='1', currency='USD')
    _payment(client, inv, a2, b, amount='2', currency='USD')
    froms = sorted(t['from'] for t in _ledger(client, inv)['transactions'])
    assert froms[0] != froms[1] and all(f.startswith('Acme Ltd (Company ') for f in froms)


def test_a_payment_made_over_a_span_keeps_its_end_date(env):
    client, inv, entity = env
    a, b = entity('Acme Ltd'), entity('Harbor Trust')
    _payment(client, inv, a, b, amount='5', currency='USD', startDate='2012-05-29', endDate='2012-12-03')
    _payment(client, inv, a, b, amount='6', currency='USD', date='2013-01-04')
    rows = {t['amount']: t for t in _ledger(client, inv)['transactions']}
    assert (rows[5]['dateTime'], rows[5]['dateEnd']) == ('2012-05-29', '2012-12-03')
    assert (rows[6]['dateTime'], rows[6]['dateEnd']) == ('2013-01-04', None)


def test_ledger_404_for_unknown_investigation(env):
    client, _, _ = env
    assert client.get('/api/investigations/nope/financial-flows').status_code == 404
