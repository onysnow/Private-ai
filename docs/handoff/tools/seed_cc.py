import json, os, sys, urllib.request
sys.path.insert(0, '.')
API = 'http://localhost:8000/api'
INV = os.environ['INV']; CLAIM = os.environ['CLAIM']
def call(m, p, b=None):
    r = urllib.request.Request(API + p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'content-type': 'application/json'})
    with urllib.request.urlopen(r) as x: return json.loads(x.read() or b'null')
land = call('POST', '/sources', {'investigation_id': INV, 'title': 'Land Registry title, harbour plot 4', 'source_type': 'public_record'})['id']
ch = call('POST', '/sources', {'investigation_id': INV, 'title': 'Companies House CS01, Fernhill Ltd, Dec 2017', 'source_type': 'public_record'})['id']
e1 = call('POST', '/evidence', {'source_id': land, 'quote': 'Proprietor from 21 March 2018: Harbour Nominees Limited', 'locator': 'p.2 §8'})['id']
e2 = call('POST', '/evidence', {'source_id': ch, 'quote': 'Shareholder: Kestrel SA, 1,000 ordinary shares (100%).', 'locator': 'p.1'})['id']
call('POST', f'/claims/{CLAIM}/evidence', {'evidence_id': e1, 'stance': 'supports'})
call('POST', f'/claims/{CLAIM}/evidence', {'evidence_id': e2, 'stance': 'contradicts', 'note': 'filed 14 Dec 2017, before the transfer'})
from app.db.session import SessionLocal
from app.models.domain import AIAnalysisCandidate
with SessionLocal() as db:
    db.add(AIAnalysisCandidate(investigation_id=INV, module='case_synthesis', review_status='proposed', trace={'run_id': os.environ.get('RUN_ID')},
        payload={'claims': [{'claim_id': 'CLM-0009', 'claim': 'Kestrel SA controlled Fernhill Ltd through Harbour Nominees', 'supporting_evidence': [{'record_type': 'claim', 'record_id': CLAIM}]}]},
        checked_citation_ids=[]))
    db.commit()
print('ok')
