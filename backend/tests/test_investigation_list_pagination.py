"""Covers STRUCT-0018: limit/offset on investigation-scoped list endpoints.

Exercises the endpoints prioritized in the finding: documents, entities,
connector-findings (cycle 1), then sources, claims, leads, reporting-tasks,
connector-runs (cycle 2, the "most likely to grow large" group named in the
remainder task). Unpaginated behavior must stay identical (everything, in
existing order) and limit/offset must slice that same order at the SQL
level.

leads/queue (cycle 3) is paginated differently: its ordering depends on a
computed triage score and status/priority/owner filters that only exist
after every lead is fetched and serialized, so limit/offset there are a
plain Python list slice applied after the filter+sort pipeline, not a SQL
offset/limit -- see lead_queue()'s docstring in app/services/investigations.py.

Cycle 4 closed the remainder: evidence (SQL page through a Source join),
relationships (SQL page when reconciled duplicates are included -- the
default -- and a post-filter slice when they are suppressed), timeline (a
slice of the assembled, sorted list, like leads/queue; counts/total still
describe the whole timeline), and the AI analysis candidate queue (offset
added to its existing limit). /graph stays unpaginated on purpose: it is a
rendering of the whole relationship set, not a list.
"""
from fastapi.testclient import TestClient

from app.db.session import Base, SessionLocal, engine
from app.main import app
from app.models.domain import ConnectorFinding, ConnectorRun


def _new_investigation(client: TestClient, name: str) -> str:
    r = client.post('/api/investigations', json={'name': name})
    assert r.status_code == 200, r.text
    return r.json()['id']


def test_documents_list_limit_offset():
    client = TestClient(app)
    inv = _new_investigation(client, 'Doc pagination')
    uploaded = []
    for i in range(5):
        r = client.post(
            '/api/documents/upload',
            data={'investigation_id': inv, 'title': f'Memo {i}'},
            files={'file': (f'memo{i}.txt', f'Document body {i}.'.encode(), 'text/plain')},
        )
        assert r.status_code == 200, r.text
        uploaded.append(r.json()['id'])

    unpaginated = client.get(f'/api/investigations/{inv}/documents')
    assert unpaginated.status_code == 200
    full = unpaginated.json()
    assert len(full) == 5
    full_ids = [item['id'] for item in full]

    page1 = client.get(f'/api/investigations/{inv}/documents', params={'limit': 2}).json()
    assert [item['id'] for item in page1] == full_ids[:2]

    page2 = client.get(f'/api/investigations/{inv}/documents', params={'limit': 2, 'offset': 2}).json()
    assert [item['id'] for item in page2] == full_ids[2:4]

    remainder = client.get(f'/api/investigations/{inv}/documents', params={'offset': 4}).json()
    assert [item['id'] for item in remainder] == full_ids[4:]


def test_entities_list_limit_offset():
    client = TestClient(app)
    inv = _new_investigation(client, 'Entity pagination')
    created = []
    for caption in ('Alice', 'Bob', 'Carol', 'Dave'):
        r = client.post('/api/entities', json={'investigation_id': inv, 'schema': 'Person', 'caption': caption, 'properties': {}})
        assert r.status_code == 200, r.text
        created.append(r.json()['id'])

    full = client.get(f'/api/investigations/{inv}/entities').json()
    assert len(full) == 4
    # list_entities orders by caption, so this should be alphabetical regardless of creation order.
    full_ids = [item['id'] for item in full]

    page1 = client.get(f'/api/investigations/{inv}/entities', params={'limit': 2}).json()
    assert [item['id'] for item in page1] == full_ids[:2]

    page2 = client.get(f'/api/investigations/{inv}/entities', params={'limit': 2, 'offset': 2}).json()
    assert [item['id'] for item in page2] == full_ids[2:4]


def test_connector_findings_list_limit_offset():
    client = TestClient(app)
    inv = _new_investigation(client, 'Finding pagination')
    with SessionLocal() as db:
        for i in range(4):
            db.add(ConnectorFinding(
                investigation_id=inv, provider='aleph', provider_record_id=f'rec-{i}',
                caption=f'Finding {i}', schema='Company', properties={}, raw={}, review_status='unreviewed',
            ))
        db.commit()

    full = client.get(f'/api/investigations/{inv}/connector-findings').json()
    assert len(full) == 4
    full_ids = [item['id'] for item in full]

    page1 = client.get(f'/api/investigations/{inv}/connector-findings', params={'limit': 2}).json()
    assert [item['id'] for item in page1] == full_ids[:2]

    page2 = client.get(f'/api/investigations/{inv}/connector-findings', params={'limit': 2, 'offset': 2}).json()
    assert [item['id'] for item in page2] == full_ids[2:4]


def test_limit_out_of_range_is_rejected():
    client = TestClient(app)
    inv = _new_investigation(client, 'Bad pagination params')
    assert client.get(f'/api/investigations/{inv}/documents', params={'limit': 0}).status_code == 422
    assert client.get(f'/api/investigations/{inv}/documents', params={'limit': 501}).status_code == 422
    assert client.get(f'/api/investigations/{inv}/documents', params={'offset': -1}).status_code == 422


def test_sources_list_limit_offset():
    client = TestClient(app)
    inv = _new_investigation(client, 'Source pagination')
    created = []
    for i in range(5):
        r = client.post('/api/sources', json={'investigation_id': inv, 'title': f'Source {i}', 'url': f'https://example.com/{i}'})
        assert r.status_code == 200, r.text
        created.append(r.json()['id'])

    full = client.get(f'/api/investigations/{inv}/sources').json()
    assert len(full) == 5
    full_ids = [item['id'] for item in full]

    page1 = client.get(f'/api/investigations/{inv}/sources', params={'limit': 2}).json()
    assert [item['id'] for item in page1] == full_ids[:2]

    page2 = client.get(f'/api/investigations/{inv}/sources', params={'limit': 2, 'offset': 2}).json()
    assert [item['id'] for item in page2] == full_ids[2:4]

    remainder = client.get(f'/api/investigations/{inv}/sources', params={'offset': 4}).json()
    assert [item['id'] for item in remainder] == full_ids[4:]


def test_claims_list_limit_offset():
    client = TestClient(app)
    inv = _new_investigation(client, 'Claim pagination')
    created = []
    for i in range(4):
        r = client.post('/api/claims', json={'investigation_id': inv, 'text': f'Claim {i}'})
        assert r.status_code == 200, r.text
        created.append(r.json()['id'])

    full = client.get(f'/api/investigations/{inv}/claims').json()
    assert len(full) == 4
    full_ids = [item['id'] for item in full]

    page1 = client.get(f'/api/investigations/{inv}/claims', params={'limit': 2}).json()
    assert [item['id'] for item in page1] == full_ids[:2]

    page2 = client.get(f'/api/investigations/{inv}/claims', params={'limit': 2, 'offset': 2}).json()
    assert [item['id'] for item in page2] == full_ids[2:4]


def test_leads_list_limit_offset():
    client = TestClient(app)
    inv = _new_investigation(client, 'Lead pagination')
    created = []
    for i in range(4):
        r = client.post('/api/leads', json={'investigation_id': inv, 'title': f'Lead {i}'})
        assert r.status_code == 200, r.text
        created.append(r.json()['id'])

    full = client.get(f'/api/investigations/{inv}/leads').json()
    assert len(full) == 4
    full_ids = [item['id'] for item in full]

    page1 = client.get(f'/api/investigations/{inv}/leads', params={'limit': 2}).json()
    assert [item['id'] for item in page1] == full_ids[:2]

    page2 = client.get(f'/api/investigations/{inv}/leads', params={'limit': 2, 'offset': 2}).json()
    assert [item['id'] for item in page2] == full_ids[2:4]


def test_reporting_tasks_list_limit_offset():
    client = TestClient(app)
    inv = _new_investigation(client, 'Reporting task pagination')
    created = []
    for i in range(4):
        r = client.post('/api/reporting-tasks', json={'investigation_id': inv, 'title': f'Task {i}'})
        assert r.status_code == 200, r.text
        created.append(r.json()['id'])

    full = client.get(f'/api/investigations/{inv}/reporting-tasks').json()
    assert len(full) == 4
    full_ids = [item['id'] for item in full]

    page1 = client.get(f'/api/investigations/{inv}/reporting-tasks', params={'limit': 2}).json()
    assert [item['id'] for item in page1] == full_ids[:2]

    page2 = client.get(f'/api/investigations/{inv}/reporting-tasks', params={'limit': 2, 'offset': 2}).json()
    assert [item['id'] for item in page2] == full_ids[2:4]


def test_connector_runs_list_limit_offset():
    client = TestClient(app)
    inv = _new_investigation(client, 'Connector run pagination')
    with SessionLocal() as db:
        for i in range(4):
            db.add(ConnectorRun(
                investigation_id=inv, provider='aleph', query=f'query-{i}', status='completed', result_count=i,
            ))
        db.commit()

    full = client.get(f'/api/investigations/{inv}/connector-runs').json()
    assert len(full) == 4
    full_ids = [item['id'] for item in full]

    page1 = client.get(f'/api/investigations/{inv}/connector-runs', params={'limit': 2}).json()
    assert [item['id'] for item in page1] == full_ids[:2]

    page2 = client.get(f'/api/investigations/{inv}/connector-runs', params={'limit': 2, 'offset': 2}).json()
    assert [item['id'] for item in page2] == full_ids[2:4]


def test_lead_queue_limit_offset():
    client = TestClient(app)
    inv = _new_investigation(client, 'Lead queue pagination')
    created = []
    for i in range(4):
        r = client.post('/api/leads', json={'investigation_id': inv, 'title': f'Lead {i}', 'priority': 'normal'})
        assert r.status_code == 200, r.text
        created.append(r.json()['id'])

    full = client.get(f'/api/investigations/{inv}/leads/queue', params={'unresolved_only': False}).json()
    assert full['total'] == 4
    assert len(full['items']) == 4
    full_ids = [item['id'] for item in full['items']]

    page1 = client.get(
        f'/api/investigations/{inv}/leads/queue',
        params={'unresolved_only': False, 'limit': 2},
    ).json()
    # total reflects the full filtered set, not the sliced page.
    assert page1['total'] == 4
    assert [item['id'] for item in page1['items']] == full_ids[:2]

    page2 = client.get(
        f'/api/investigations/{inv}/leads/queue',
        params={'unresolved_only': False, 'limit': 2, 'offset': 2},
    ).json()
    assert page2['total'] == 4
    assert [item['id'] for item in page2['items']] == full_ids[2:4]

    # A status filter still narrows `total` (and the slice) to the matching
    # subset, proving limit/offset apply after filtering, not before it.
    r = client.patch(f'/api/leads/{created[0]}', json={'status': 'resolved'})
    assert r.status_code == 200, r.text
    filtered = client.get(
        f'/api/investigations/{inv}/leads/queue',
        params={'unresolved_only': False, 'status': ['resolved'], 'limit': 1},
    ).json()
    assert filtered['total'] == 1
    assert len(filtered['items']) == 1
    assert filtered['items'][0]['id'] == created[0]


def test_second_batch_out_of_range_params_rejected():
    client = TestClient(app)
    inv = _new_investigation(client, 'Bad pagination params 2')
    for path in ('sources', 'claims', 'leads', 'reporting-tasks', 'connector-runs', 'leads/queue'):
        assert client.get(f'/api/investigations/{inv}/{path}', params={'limit': 0}).status_code == 422
        assert client.get(f'/api/investigations/{inv}/{path}', params={'limit': 501}).status_code == 422
        assert client.get(f'/api/investigations/{inv}/{path}', params={'offset': -1}).status_code == 422


def test_evidence_list_limit_offset():
    client = TestClient(app)
    inv = _new_investigation(client, 'Evidence pagination')
    src_a = client.post('/api/sources', json={'investigation_id': inv, 'title': 'Source A', 'source_type': 'filing'}).json()['id']
    src_b = client.post('/api/sources', json={'investigation_id': inv, 'title': 'Source B', 'source_type': 'filing'}).json()['id']
    for i in range(5):
        r = client.post('/api/evidence', json={'source_id': src_a if i % 2 else src_b, 'quote': f'Quote {i}', 'locator': f'p{i}'})
        assert r.status_code == 200, r.text

    full = client.get(f'/api/investigations/{inv}/evidence').json()
    assert len(full) == 5
    full_ids = [row['evidence']['id'] for row in full]
    assert full_ids == sorted(full_ids), 'ordered by evidence id, as before'
    assert all(row['source']['id'] in {src_a, src_b} for row in full)

    page1 = client.get(f'/api/investigations/{inv}/evidence', params={'limit': 2}).json()
    assert [row['evidence']['id'] for row in page1] == full_ids[:2]
    page2 = client.get(f'/api/investigations/{inv}/evidence', params={'limit': 2, 'offset': 2}).json()
    assert [row['evidence']['id'] for row in page2] == full_ids[2:4]
    remainder = client.get(f'/api/investigations/{inv}/evidence', params={'offset': 4}).json()
    assert [row['evidence']['id'] for row in remainder] == full_ids[4:]
    assert client.get(f'/api/investigations/{inv}/evidence', params={'limit': 0}).status_code == 422


def test_relationships_list_limit_offset_both_views():
    client = TestClient(app)
    inv = _new_investigation(client, 'Relationship pagination')
    people = [client.post('/api/entities', json={'investigation_id': inv, 'schema': 'Person', 'caption': f'Person {i}', 'properties': {}}).json()['id'] for i in range(4)]
    company = client.post('/api/entities', json={'investigation_id': inv, 'schema': 'Company', 'caption': 'Holdings', 'properties': {}}).json()['id']
    for pid in people:
        r = client.post('/api/relationships', json={'investigation_id': inv, 'schema': 'Directorship', 'source_entity_id': pid, 'target_entity_id': company})
        assert r.status_code == 200, r.text

    full = client.get(f'/api/investigations/{inv}/relationships').json()
    assert len(full) == 4
    full_ids = [row['id'] for row in full]
    page1 = client.get(f'/api/investigations/{inv}/relationships', params={'limit': 3}).json()
    assert [row['id'] for row in page1] == full_ids[:3]
    page2 = client.get(f'/api/investigations/{inv}/relationships', params={'limit': 3, 'offset': 3}).json()
    assert [row['id'] for row in page2] == full_ids[3:]
    # The suppressed-duplicates view paginates after its post-fetch filter; with no
    # reconciliation decisions recorded it must match the SQL-paged view exactly.
    filtered = client.get(f'/api/investigations/{inv}/relationships', params={'include_reconciled_duplicates': 'false', 'limit': 3, 'offset': 1}).json()
    assert [row['id'] for row in filtered] == full_ids[1:4]


def test_timeline_limit_offset_keeps_whole_timeline_counts():
    client = TestClient(app)
    inv = _new_investigation(client, 'Timeline pagination')
    for i in range(5):
        r = client.post('/api/timeline-events', json={'investigation_id': inv, 'title': f'Event {i}', 'date_start': f'2020-0{i + 1}-01'})
        assert r.status_code == 200, r.text

    full = client.get(f'/api/investigations/{inv}/timeline').json()
    assert full['total'] == 5 and full['returned'] == 5 and len(full['events']) == 5
    full_ids = [e['id'] for e in full['events']]
    page = client.get(f'/api/investigations/{inv}/timeline', params={'limit': 2, 'offset': 1}).json()
    assert [e['id'] for e in page['events']] == full_ids[1:3]
    assert page['total'] == 5 and page['returned'] == 2 and page['offset'] == 1
    assert page['counts'] == full['counts'], 'counts describe the whole timeline, not the page'


def test_ai_candidate_queue_offset():
    from app.models.domain import AIAnalysisCandidate
    client = TestClient(app)
    inv = _new_investigation(client, 'AI queue pagination')
    with SessionLocal() as db:
        for i in range(4):
            db.add(AIAnalysisCandidate(id=f'q-{i}', investigation_id=inv, module='case_synthesis', payload={}, checked_citation_ids=[], review_status='rejected', reviewer_note='n'))
        db.commit()
    full = [r['id'] for r in client.get(f'/api/investigations/{inv}/ai-analysis-candidates').json()['candidates']]
    assert len(full) == 4
    page = [r['id'] for r in client.get(f'/api/investigations/{inv}/ai-analysis-candidates', params={'limit': 2, 'offset': 1}).json()['candidates']]
    assert page == full[1:3]
    assert client.get(f'/api/investigations/{inv}/ai-analysis-candidates', params={'offset': -1}).status_code == 422
