from fastapi.testclient import TestClient
from app.main import app


def test_statement_history_shows_support_conflict_and_promotion(tmp_path, monkeypatch):
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name':'History Test'}).json()
    entity = client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema':'Company', 'caption':'NiSource',
        'properties': {'name':['NiSource']}, 'dataset':'reporter'
    }).json()

    # Inject two connector findings directly through DB-backed models because connector transport is tested elsewhere.
    from app.db.session import SessionLocal
    from app.models.domain import ConnectorFinding, ResolutionDecision
    db = SessionLocal()
    try:
        f1 = ConnectorFinding(investigation_id=inv['id'], provider='aleph', provider_record_id='a1', caption='NiSource', schema='Company', properties={'jurisdiction':['us-in']}, source_url='https://aleph.example/a1', raw={'dataset':'corp_registry'})
        f2 = ConnectorFinding(investigation_id=inv['id'], provider='aleph', provider_record_id='a2', caption='NiSource', schema='Company', properties={'jurisdiction':['us-oh']}, source_url='https://aleph.example/a2', raw={'dataset':'old_registry'})
        db.add_all([f1,f2]); db.flush()
        db.add_all([
            ResolutionDecision(investigation_id=inv['id'], finding_id=f1.id, entity_id=entity['id'], decision='positive', confidence=.95),
            ResolutionDecision(investigation_id=inv['id'], finding_id=f2.id, entity_id=entity['id'], decision='positive', confidence=.9),
        ])
        db.commit(); ids=(f1.id,f2.id)
    finally:
        db.close()

    a1 = client.post(f'/api/connector-findings/{ids[0]}/assessments', json={'entity_id':entity['id'],'prop':'jurisdiction','value':'us-in','status':'accepted'}).json()
    client.post(f'/api/statement-assessments/{a1["id"]}/promote', json={'note':'verified current filing'})
    client.post(f'/api/connector-findings/{ids[1]}/assessments', json={'entity_id':entity['id'],'prop':'jurisdiction','value':'us-oh','status':'conflicting','note':'older conflicting record'})

    r = client.get(f'/api/entities/{entity["id"]}/statement-history')
    assert r.status_code == 200
    rows = {(x['prop'],x['value']):x for x in r.json()}
    current = rows[('jurisdiction','us-in')]
    assert current['canonical'] is True
    assert current['support_count'] == 1
    assert current['external_assessments'][0]['promoted'] is True
    assert current['external_assessments'][0]['source_url'] == 'https://aleph.example/a1'
    assert current['external_assessments'][0]['dataset'] == 'corp_registry'

    conflict = rows[('jurisdiction','us-oh')]
    assert conflict['canonical'] is False
    assert conflict['conflict_count'] == 1
    assert conflict['latest_status'] == 'conflicting'
