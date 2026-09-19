from fastapi.testclient import TestClient
from app.db.session import Base, engine
from app.main import app

def test_claim_review_requires_rationale_preserves_history_and_shows_relationship_dependencies():
    client=TestClient(app)
    inv=client.post('/api/investigations',json={'name':'Claim review'}).json()
    src=client.post('/api/sources',json={'investigation_id':inv['id'],'title':'Filing','source_type':'document'}).json()
    support=client.post('/api/evidence',json={'source_id':src['id'],'quote':'A employed B','locator':'p. 2 chars 10-22'}).json()
    contra=client.post('/api/evidence',json={'source_id':src['id'],'quote':'B denied employment','locator':'p. 7 chars 4-23'}).json()
    claim=client.post('/api/claims',json={'investigation_id':inv['id'],'text':'A employed B','status':'unverified','confidence':0}).json()
    for ev,stance in ((support,'supports'),(contra,'contradicts')): assert client.post(f"/api/claims/{claim['id']}/evidence",json={'evidence_id':ev['id'],'stance':stance}).status_code==200
    a=client.post('/api/entities',json={'investigation_id':inv['id'],'schema':'Person','caption':'A','properties':{}}).json(); b=client.post('/api/entities',json={'investigation_id':inv['id'],'schema':'Company','caption':'B','properties':{}}).json()
    edge=client.post('/api/relationships',json={'investigation_id':inv['id'],'schema':'Employment','source_entity_id':a['id'],'target_entity_id':b['id'],'evidence_id':support['id']}).json()
    assert client.post(f"/api/claims/{claim['id']}/reviews",json={'status':'disputed','confidence':.4,'rationale':''}).status_code==400
    body=client.post(f"/api/claims/{claim['id']}/reviews",json={'status':'disputed','confidence':.4,'rationale':'Direct denial conflicts with the filing.'}).json()
    assert body['claim']['status']=='disputed'; assert body['workspace']['stance_counts']=={'supports':1,'contradicts':1,'context':0}; assert body['workspace']['dependent_relationships'][0]['id']==edge['id']
    assert body['workspace']['review_history'][0]['from_status']=='unverified'; assert body['workspace']['review_history'][0]['to_status']=='disputed'
    advisory=client.get(f"/api/investigations/{inv['id']}/graph").json()['edges'][0]['advisory']; assert advisory['needs_review'] is True; assert advisory['disputed_claim_count']==1
    assert client.post(f"/api/claims/{claim['id']}/reviews",json={'status':'supported','confidence':.7,'rationale':'Additional authentication completed.'}).status_code==200
    hist=client.get(f"/api/claims/{claim['id']}/review-workspace").json()['review_history']; assert len(hist)==2; assert {x['to_status'] for x in hist}=={'disputed','supported'}
    assert client.get(f"/api/investigations/{inv['id']}/graph").json()['edges'][0]['advisory']['needs_review'] is False

def test_reconciled_relationship_advisory_distinguishes_independent_support_and_timeline_disclosure():
    client=TestClient(app)
    inv=client.post('/api/investigations',json={'name':'Independent support advisory'}).json()
    src=client.post('/api/sources',json={'investigation_id':inv['id'],'title':'Two records','source_type':'document'}).json()
    ev1=client.post('/api/evidence',json={'source_id':src['id'],'quote':'A worked for B per filing','locator':'p. 1'}).json()
    ev2=client.post('/api/evidence',json={'source_id':src['id'],'quote':'A worked for B per payroll','locator':'p. 9'}).json()
    c1=client.post('/api/claims',json={'investigation_id':inv['id'],'text':'Filing says A worked for B','status':'unverified','confidence':0}).json()
    c2=client.post('/api/claims',json={'investigation_id':inv['id'],'text':'Payroll says A worked for B','status':'supported','confidence':.8}).json()
    client.post(f"/api/claims/{c1['id']}/evidence",json={'evidence_id':ev1['id'],'stance':'supports'})
    client.post(f"/api/claims/{c2['id']}/evidence",json={'evidence_id':ev2['id'],'stance':'supports'})
    a=client.post('/api/entities',json={'investigation_id':inv['id'],'schema':'Person','caption':'A','properties':{}}).json()
    b=client.post('/api/entities',json={'investigation_id':inv['id'],'schema':'Company','caption':'B','properties':{}}).json()
    r1=client.post('/api/relationships',json={'investigation_id':inv['id'],'schema':'Employment','source_entity_id':a['id'],'target_entity_id':b['id'],'evidence_id':ev1['id']}).json()
    r2=client.post('/api/relationships',json={'investigation_id':inv['id'],'schema':'Employment','source_entity_id':a['id'],'target_entity_id':b['id'],'evidence_id':ev2['id']}).json()
    # Reconcile duplicates using the existing reporter-review endpoint.
    resp=client.post(f"/api/entities/{a['id']}/post-merge-reconciliation",json={'record_type':'relationship','record_a_id':r1['id'],'record_b_id':r2['id'],'preferred_record_id':r1['id'],'decision':'duplicate','rationale':'Same employment relationship; preserve both evidence records.'})
    assert resp.status_code==200, resp.text
    client.post(f"/api/claims/{c1['id']}/reviews",json={'status':'disputed','confidence':.3,'rationale':'Filing authenticity is under review.'})
    graph=client.get(f"/api/investigations/{inv['id']}/graph").json()
    edge=graph['edges'][0]
    assert edge['advisory']['support_state']=='mixed_independent_evidence'
    assert edge['advisory']['has_independent_support'] is True
    assert edge['advisory']['healthy_supporting_evidence_count']==1
    assert edge['advisory']['challenged_supporting_evidence_count']==1
    dossier=client.get(f"/api/entities/{a['id']}/dossier").json()
    assert dossier['summary']['relationship_review_advisory_count']==1
    assert dossier['summary']['relationship_mixed_support_count']==1
