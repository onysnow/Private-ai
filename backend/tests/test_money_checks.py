"""Where money appears or vanishes (mockup SEE_2): grey hole, miracle, black hole and round trip, per currency."""
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
    inv = client.post('/api/investigations', json={'name': 'Money'}).json()['id']

    def entity(caption):
        res = client.post('/api/entities', json={'investigation_id': inv, 'schema': 'Company', 'caption': caption})
        assert res.status_code == 200, res.text
        return res.json()['id']

    def pay(a, b, amount, currency='EUR', date=None):
        props = {'amount': [amount], 'currency': [currency]}
        if date:
            props['date'] = [date]
        res = client.post('/api/relationships', json={'investigation_id': inv, 'schema': 'Payment', 'source_entity_id': a,
                                                        'target_entity_id': b, 'properties': props})
        assert res.status_code == 200, res.text
        return res.json()['id']
    return client, inv, entity, pay


def _checks(client, inv, **params):
    res = client.get(f'/api/investigations/{inv}/money-checks', params=params)
    assert res.status_code == 200, res.text
    return res.json()


def test_the_four_checks_name_each_party_with_its_numbers_and_an_innocent_explanation(env):
    client, inv, entity, pay = env
    fern, kestrel, council, nominees, loop = (entity(n) for n in ('Fernhill Ltd', 'Kestrel SA', 'Harbour Council', 'Harbour Nominees', 'Loop Two BV'))
    pay(fern, kestrel, '71400', date='2018-02-06')
    pay(kestrel, council, '1250000', date='2019-05-01')
    pay(kestrel, loop, '180000', date='2020-03-01')
    pay(nominees, loop, '60000', date='2019-06-11')
    pay(fern, council, '500', currency='GBP', date='2018-01-01')
    out = _checks(client, inv)
    eur = next(c for c in out['currencies'] if c['currency'] == 'EUR')
    by = {(c['kind'], c['party']): c for c in eur['checks']}
    grey = by[('grey_hole', 'Kestrel SA')]
    assert grey['amount_in'] == 71400 and grey['amount_out'] == 1430000 and grey['gap'] == 1358600
    assert 'bank loan' in grey['innocent'] and grey['lead_idea'] == 'ask for Kestrel SA’s 2018–20 accounts'
    assert by[('miracle', 'Harbour Nominees')]['gap'] == 60000
    assert by[('black_hole', 'Loop Two BV')]['amount_in'] == 240000
    assert eur['round_trips'] == []
    # Sterling is asked about on its own, never added to the euros.
    gbp = next(c for c in out['currencies'] if c['currency'] == 'GBP')
    assert gbp['payments'] == 1 and {c['party'] for c in gbp['checks']} == {'Fernhill Ltd', 'Harbour Council'}
    assert 'not a finding' in out['rule']


def test_a_round_trip_is_found_with_its_path_and_the_payment_that_returns(env):
    client, inv, entity, pay = env
    a, b, c = entity('Fernhill Ltd'), entity('Kestrel SA'), entity('Loop Two BV')
    pay(a, b, '100000', date='2018-01-01')
    pay(b, c, '90000', date='2018-06-01')
    back = pay(c, a, '85000', date='2019-01-01')
    eur = _checks(client, inv)['currencies'][0]
    [trip] = eur['round_trips']
    assert trip['returning_payment_id'] == back and trip['party'] == 'Fernhill Ltd' and trip['gap'] == 85000
    assert trip['path'] == ['Fernhill Ltd', 'Kestrel SA', 'Loop Two BV', 'Fernhill Ltd']


def test_as_of_keeps_payments_up_to_that_year_and_the_undated_ones(env):
    client, inv, entity, pay = env
    a, b, c = entity('Fernhill Ltd'), entity('Kestrel SA'), entity('Loop Two BV')
    pay(a, b, '1000', date='2018-01-01')
    pay(b, c, '5000', date='2021-01-01')
    pay(c, a, '10')
    eur = _checks(client, inv, as_of=2019)['currencies'][0]
    assert eur['payments'] == 2
    assert _checks(client, inv, as_of=2019)['as_of'] == 2019
    assert client.get(f'/api/investigations/{inv}/money-checks', params={'as_of': 12}).status_code == 422


def test_the_ledger_says_how_sure_each_payment_is(env):
    client, inv, entity, pay = env
    pay(entity('A'), entity('B'), '10')
    [t] = client.get(f'/api/investigations/{inv}/financial-flows').json()['transactions']
    assert t['certainty'] == 'not_yet_shown' and t['locator'] is None


def _keep(client, inv, **body):
    return client.post(f'/api/investigations/{inv}/checks/money', json={'currency': 'EUR', **body})


def test_a_money_check_is_kept_in_to_check_once_and_stays_through_a_recompute(env):
    client, inv, entity, pay = env
    fern, kestrel, council = entity('Fernhill Ltd'), entity('Kestrel SA'), entity('Harbour Council')
    pay(fern, kestrel, '71400', date='2018-02-06')
    pay(kestrel, council, '1250000', date='2019-05-01')
    res = _keep(client, inv, kind='grey_hole', party_id=kestrel)
    assert res.status_code == 200, res.text
    [item] = [i for i in res.json()['items'] if i['kind'] == 'money']
    assert item['indicator_id'] == 'grey_hole' and item['indicator_name'] == 'Grey hole'
    assert item['question'] == 'Grey hole at Kestrel SA: more out than in'
    assert item['excerpt'].startswith('71,400 EUR recorded in, 1,250,000 EUR out: 1,178,600 EUR has no recorded source.')
    assert 'Could be innocent: a bank loan' in item['excerpt'] and item['locator'] == 'EUR ledger'
    assert [p['name'] for p in item['parties']] == ['Kestrel SA'] and item['status'] == 'open'
    # The check now says it is kept; the other checks do not.
    eur = _checks(client, inv)['currencies'][0]
    kept = {(c['kind'], c['party']): c['to_check_id'] for c in eur['checks']}
    assert kept[('grey_hole', 'Kestrel SA')] == item['id'] and kept[('miracle', 'Fernhill Ltd')] is None
    # A second add changes nothing.
    again = _keep(client, inv, kind='grey_hole', party_id=kestrel).json()
    assert [i['id'] for i in again['items'] if i['kind'] == 'money'] == [item['id']]
    # The records' own recompute (GET /checks) never marks it gone; a person decides it like any item.
    listed = client.get(f'/api/investigations/{inv}/checks').json()
    assert [i['id'] for i in listed['items'] if i['kind'] == 'money'] == [item['id']] and not listed['gone']
    decided = client.post(f'/api/checks/{item["id"]}/decide', json={'status': 'unclear', 'note': 'asked for the accounts'}).json()
    assert next(i for i in decided['items'] if i['id'] == item['id'])['status'] == 'unclear'


def test_a_kept_money_check_is_one_of_the_case_home_decisions(env):
    client, inv, entity, pay = env
    fern, kestrel = entity('Fernhill Ltd'), entity('Kestrel SA')
    pay(fern, kestrel, '500', date='2020-01-01')
    item = _keep(client, inv, kind='black_hole', party_id=kestrel).json()['items'][0]
    res = client.get(f'/api/investigations/{inv}/decisions', params={'kind': 'to_check'})
    assert res.status_code == 200, res.text
    [d] = [d for d in res.json()['items'] if d['id'] == item['id']]
    assert d['actor'] == 'Money checks' and d['reason'] == 'Kept from the money checks'
    assert d['proposal'].startswith('Black hole: Receives 500 EUR. Nothing is recorded leaving.')


def test_a_round_trip_is_kept_by_the_payment_that_returns(env):
    client, inv, entity, pay = env
    a, b, c = entity('Fernhill Ltd'), entity('Kestrel SA'), entity('Loop Two BV')
    pay(a, b, '100000', date='2018-01-01')
    pay(b, c, '90000', date='2018-06-01')
    back = pay(c, a, '85000', date='2019-01-01')
    assert _keep(client, inv, kind='round_trip', party_id=a, returning_payment_id='not-it').status_code == 404
    res = _keep(client, inv, kind='round_trip', party_id=a, returning_payment_id=back)
    assert res.status_code == 200, res.text
    [item] = [i for i in res.json()['items'] if i['kind'] == 'money']
    assert item['excerpt'].startswith('Fernhill Ltd → Kestrel SA → Loop Two BV → Fernhill Ltd: 85,000 EUR comes back.')
    [trip] = _checks(client, inv)['currencies'][0]['round_trips']
    assert trip['to_check_id'] == item['id']


def test_only_a_check_this_case_finds_now_can_be_kept(env):
    client, inv, entity, pay = env
    fern, kestrel = entity('Fernhill Ltd'), entity('Kestrel SA')
    pay(fern, kestrel, '500', date='2020-01-01')
    # Not what the check finds (Kestrel SA is a black hole, not a grey hole), another currency, an earlier year.
    assert _keep(client, inv, kind='grey_hole', party_id=kestrel).status_code == 404
    assert _keep(client, inv, kind='black_hole', party_id=kestrel, currency='GBP').status_code == 404
    assert _keep(client, inv, kind='black_hole', party_id=kestrel, as_of=2019).status_code == 404
    # A party of another case is never found in this case's ledger.
    other = client.post('/api/investigations', json={'name': 'Other'}).json()['id']
    assert _keep(client, other, kind='black_hole', party_id=kestrel).status_code == 404
    assert _keep(client, 'no-such-case', kind='black_hole', party_id=kestrel).status_code == 404
    assert _keep(client, inv, kind='nothing', party_id=kestrel).status_code == 422
    res = _keep(client, inv, kind='black_hole', party_id=kestrel, as_of=2020)
    assert res.status_code == 200 and 'Up to the end of 2020.' in res.json()['items'][0]['excerpt']
