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

Still not paginated (tracked separately -- their list functions do
post-fetch filtering/sorting or multi-table assembly that doesn't reduce to
a plain SQL offset/limit or a simple post-hoc slice as directly): evidence,
relationships, graph, timeline.
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
