import io
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def new_inv(name='Docs'):
    r=client.post('/api/investigations',json={'name':name}); assert r.status_code==200; return r.json()['id']

def test_text_document_ingestion_review_boundary():
    inv=new_inv('Document boundary')
    text=("Acme Holdings Inc. announced a new infrastructure program on August 12, 2026.\n\n"
          "Jordan Rivera joined the board of directors in 2019.\n")
    r=client.post('/api/documents/upload', data={'investigation_id':inv,'title':'Test memo'}, files={'file':('memo.txt', text.encode(), 'text/plain')})
    assert r.status_code==200, r.text
    doc=r.json(); assert doc['extraction_status']=='complete'; assert doc['chunk_count']==2
    # Extraction never creates canonical records by itself.
    ents=client.get(f'/api/investigations/{inv}/entities').json()
    claims=client.get(f'/api/investigations/{inv}/claims').json()
    assert ents==[] and claims==[]
    search=client.get('/api/search', params={'investigation_id':inv,'q':'infrastructure program'}).json()
    assert any(hit['type']=='document_chunk' for hit in search['results'])
    assert not any(hit['type']=='entity' for hit in search['results'])
    cands=client.get(f"/api/documents/{doc['id']}/candidates", params={'status':'proposed'}).json()
    assert any(c['candidate_type']=='evidence' for c in cands)
    assert any(c['candidate_type']=='claim' for c in cands)
    entity=next(c for c in cands if c['candidate_type']=='entity' and 'Acme Holdings' in c['payload']['caption'])
    rr=client.post(f"/api/extraction-candidates/{entity['id']}/review",json={'decision':'accept','entity_schema':'Company','caption':'Acme Holdings Inc.'})
    assert rr.status_code==200, rr.text
    accepted=rr.json()['record']; assert accepted['schema']=='Company'
    statements=client.get(f"/api/entities/{accepted['id']}/statements").json()
    assert statements and statements[0]['dataset'].startswith('document:') and '#lines ' in statements[0]['origin'] or '#line ' in statements[0]['origin']


def test_evidence_candidate_preserves_locator_and_reject_is_final():
    inv=new_inv('Evidence locator')
    r=client.post('/api/documents/upload', data={'investigation_id':inv}, files={'file':('notes.txt', b'First documented paragraph.\n\nSecond documented paragraph.', 'text/plain')})
    doc=r.json(); cands=client.get(f"/api/documents/{doc['id']}/candidates", params={'candidate_type':'evidence'}).json()
    first=cands[0]
    rr=client.post(f"/api/extraction-candidates/{first['id']}/review", json={'decision':'accept','note':'Reporter checked text'})
    assert rr.status_code==200
    ev=rr.json()['record']; assert ev['locator']=='line 1@chars:0-27'; assert ev['quote']=='First documented paragraph.'
    second=cands[1]
    rr=client.post(f"/api/extraction-candidates/{second['id']}/review", json={'decision':'reject','note':'Not relevant'})
    assert rr.status_code==200 and rr.json()['candidate']['review_status']=='rejected'
    again=client.post(f"/api/extraction-candidates/{second['id']}/review", json={'decision':'accept'})
    assert again.status_code==400
