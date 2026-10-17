import json, urllib.request
API = 'http://localhost:8000/api'
def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={'content-type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b'null')
inv = call('POST', '/investigations', {'name': 'Kestrel harbour (mockup data)'})['id']
def ent(c, schema='Company'):
    return call('POST', '/entities', {'investigation_id': inv, 'schema': schema, 'caption': c})['id']
F, K, C, N, L, U = (ent(n) for n in ('Fernhill Ltd', 'Kestrel SA', 'Harbour Council', 'Harbour Nominees Ltd', 'Loop Two BV', 'Ardent Trust Ltd'))
src = call('POST', '/sources', {'investigation_id': inv, 'title': 'Kestrel SA bank statement', 'source_type': 'document'})['id']
minutes = call('POST', '/sources', {'investigation_id': inv, 'title': 'Harbour Council minutes', 'source_type': 'public_record'})['id']
def pay(a, b, amount, date, currency='EUR', purpose=None, ev=None):
    props = {'amount': [amount], 'currency': [currency], 'date': [date]}
    if purpose: props['purpose'] = [purpose]
    rid = call('POST', '/relationships', {'investigation_id': inv, 'schema': 'Payment', 'source_entity_id': a, 'target_entity_id': b, 'properties': props})['id']
    if ev:
        s, loc = ev
        e = call('POST', '/evidence', {'source_id': s, 'quote': f'{amount} {currency}', 'locator': loc})['id']
        call('POST', f'/relationships/{rid}/evidence', {'evidence_id': e})
        call('POST', f'/relationships/{rid}/evidence/{e}/reviews', {'stance': 'supports', 'rationale': 'Statement line'})
    return rid
pay(F, K, '9800', '2018-02-06', ev=(src, 'stmt p.3'))
pay(F, K, '9800', '2018-03-09', ev=(src, 'stmt p.4'))
pay(F, K, '9800', '2018-04-11', ev=(src, 'stmt p.5'))
pay(F, K, '42000', '2019-05-14', purpose='deposit')
pay(K, C, '1250000', '2019-05-20', purpose='land price', ev=(minutes, 'council minutes p.4'))
pay(K, L, '180000', '2020-03-02', purpose='bank lines')
pay(N, L, '60000', '2019-06-12')
pay(F, U, '4200', '2019-01-10', currency='GBP')
pay(U, F, '3100', '2020-01-10', currency='GBP')
print(inv)
