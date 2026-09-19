from fastapi.testclient import TestClient
from app.db.session import Base, engine
from app.main import app

def _relationship(client):
    inv=client.post('/api/investigations',json={'name':'Relationship evidence review'}).json()
    src=client.post('/api/sources',json={'investigation_id':inv['id'],'title':'Filing','source_type':'document'}).json()
    ev=client.post('/api/evidence',json={'source_id':src['id'],'quote':'A is employed by B','locator':'p. 4'}).json()
    other=client.post('/api/evidence',json={'source_id':src['id'],'quote':'unattached passage','locator':'p. 8'}).json()
    a=client.post('/api/entities',json={'investigation_id':inv['id'],'schema':'Person','caption':'A','properties':{}}).json()
    b=client.post('/api/entities',json={'investigation_id':inv['id'],'schema':'Company','caption':'B','properties':{}}).json()
    edge=client.post('/api/relationships',json={'investigation_id':inv['id'],'schema':'Employment','source_entity_id':a['id'],'target_entity_id':b['id'],'evidence_id':ev['id']}).json()
    return inv,ev,other,edge

def test_relationship_evidence_review_is_immutable_and_advisory():
    client=TestClient(app); inv,ev,other,edge=_relationship(client)
    r=client.post(f"/api/relationships/{edge['id']}/evidence/{ev['id']}/reviews",json={'stance':'supports','rationale':'Employment filing names both parties.'}); assert r.status_code==200, r.text
    r=client.post(f"/api/relationships/{edge['id']}/evidence/{ev['id']}/reviews",json={'stance':'contradicts','rationale':'Later authentication review undermines this passage.'}); assert r.status_code==200, r.text
    row=r.json(); history=row['provenance']['evidence_review_history']
    assert [x['stance'] for x in history]==['supports','contradicts']
    assert row['advisory']['relationship_evidence_review']['stance']=='contradicts'
    assert row['advisory']['relationship_evidence_needs_review'] is True
    assert row['provenance']['evidence_attachments'][0]['evidence']['quote']=='A is employed by B'
    assert len(client.get(f"/api/relationships/{edge['id']}/evidence-reviews").json()['reviews'])==2

def test_relationship_evidence_review_rejects_unattached_and_bad_stance():
    client=TestClient(app); inv,ev,other,edge=_relationship(client)
    assert client.post(f"/api/relationships/{edge['id']}/evidence/{other['id']}/reviews",json={'stance':'supports','rationale':'wrong evidence'}).status_code==400
    assert client.post(f"/api/relationships/{edge['id']}/evidence/{ev['id']}/reviews",json={'stance':'proven','rationale':'invalid vocabulary'}).status_code==400
    assert client.post(f"/api/relationships/{edge['id']}/evidence/{ev['id']}/reviews",json={'stance':'supports','rationale':'   '}).status_code==400

def test_relationship_supports_multiple_independent_evidence_attachments():
    client=TestClient(app); inv,ev,other,edge=_relationship(client)
    attached=client.post(f"/api/relationships/{edge['id']}/evidence",json={'evidence_id':other['id'],'note':'Independent corroborating passage'})
    assert attached.status_code==200, attached.text
    row=attached.json()
    items=row['provenance']['evidence_attachments']
    assert {x['evidence']['id'] for x in items}=={ev['id'],other['id']}
    assert row['advisory']['relationship_evidence_attachment_count']==2
    r=client.post(f"/api/relationships/{edge['id']}/evidence/{other['id']}/reviews",json={'stance':'supports','rationale':'Independent passage corroborates the employment.'})
    assert r.status_code==200, r.text
    refreshed=r.json()
    by_id={x['evidence']['id']:x for x in refreshed['provenance']['evidence_attachments']}
    assert by_id[other['id']]['latest_review']['stance']=='supports'
    assert by_id[ev['id']]['latest_review'] is None
    assert refreshed['advisory']['relationship_evidence_needs_review'] is True

def test_claim_advisory_reads_claims_from_every_evidence_attachment():
    client=TestClient(app); inv,ev,other,edge=_relationship(client)
    attached=client.post(f"/api/relationships/{edge['id']}/evidence",json={'evidence_id':other['id']})
    assert attached.status_code==200
    claim=client.post('/api/claims',json={'investigation_id':inv['id'],'text':'Second passage challenges employment','status':'disputed','confidence':.2}).json()
    linked=client.post(f"/api/claims/{claim['id']}/evidence",json={'evidence_id':other['id'],'stance':'supports'})
    assert linked.status_code==200
    row=client.post(f"/api/relationships/{edge['id']}/evidence",json={'evidence_id':other['id']}).json()
    deps=row['advisory']['claim_dependencies']
    assert any(x['claim_id']==claim['id'] and x['evidence_id']==other['id'] for x in deps)
    assert row['advisory']['needs_review'] is True


def test_relationship_edge_model_has_no_legacy_evidence_pointer():
    from app.models.domain import RelationshipEdge
    assert "evidence_id" not in RelationshipEdge.__table__.columns

def test_relationship_evidence_assessment_propagates_to_search_and_linked_lead_triage():
    client=TestClient(app)
    inv=client.post('/api/investigations',json={'name':'Propagation audit'}).json()
    src=client.post('/api/sources',json={'investigation_id':inv['id'],'title':'Audit filing','source_type':'document'}).json()
    ev=client.post('/api/evidence',json={'source_id':src['id'],'quote':'A employed B','locator':'p. 3 chars 1-12'}).json()
    a=client.post('/api/entities',json={'investigation_id':inv['id'],'schema':'Person','caption':'Audit Alice','properties':{}}).json()
    b=client.post('/api/entities',json={'investigation_id':inv['id'],'schema':'Company','caption':'Audit Business','properties':{}}).json()
    edge=client.post('/api/relationships',json={'investigation_id':inv['id'],'schema':'Employment','source_entity_id':a['id'],'target_entity_id':b['id'],'evidence_id':ev['id']}).json()
    lead=client.post('/api/leads',json={'investigation_id':inv['id'],'title':'Verify Audit Alice employment','detail':'Check relationship'}).json()
    assert client.post(f"/api/leads/{lead['id']}/links",json={'relationship_id':edge['id']}).status_code==200
    before=client.get(f"/api/leads/{lead['id']}").json()['triage']
    assert before['relationship_evidence_review_counts']['unreviewed']==1
    assert before['needs_attention'] is True
    reviewed=client.post(f"/api/relationships/{edge['id']}/evidence/{ev['id']}/reviews",json={'stance':'contradicts','rationale':'The filing is superseded by authenticated payroll records.'})
    assert reviewed.status_code==200, reviewed.text
    triage=client.get(f"/api/leads/{lead['id']}").json()['triage']
    assert triage['relationship_evidence_review_counts']['contradicts']==1
    assert triage['relationship_evidence_review_counts']['unreviewed']==0
    search=client.get('/api/search',params={'q':'Audit Alice','investigation_id':inv['id']}).json()
    rel=next(hit for hit in search['results'] if hit['type']=='relationship')
    assert rel['metadata']['advisory']['relationship_evidence_needs_review'] is True
    assert rel['metadata']['advisory']['relationship_evidence_review']['stance']=='contradicts'
