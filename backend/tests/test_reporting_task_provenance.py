from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def must(response):
    assert response.status_code == 200, response.text
    return response.json()


def test_reporting_task_freezes_lead_provenance_and_records_status_history():
    inv = must(client.post('/api/investigations', json={'name': 'Task provenance'}))
    entity = must(client.post('/api/entities', json={
        'investigation_id': inv['id'], 'schema': 'Person', 'caption': 'Jordan Hale',
        'properties': {'name': ['Jordan Hale']},
    }))
    source = must(client.post('/api/sources', json={
        'investigation_id': inv['id'], 'title': 'Board filing', 'source_type': 'filing',
        'url': 'https://example.test/board-filing',
    }))
    evidence = must(client.post('/api/evidence', json={
        'source_id': source['id'], 'quote': 'Jordan Hale joined the board.', 'locator': 'page 4',
    }))
    claim = must(client.post('/api/claims', json={
        'investigation_id': inv['id'], 'text': 'Jordan Hale joined the board.',
        'status': 'unverified', 'confidence': 0.6,
    }))
    must(client.post(f"/api/claims/{claim['id']}/evidence", json={
        'evidence_id': evidence['id'], 'stance': 'supports', 'note': 'Primary filing',
    }))

    lead = must(client.post('/api/leads', json={
        'investigation_id': inv['id'], 'title': 'Verify board appointment',
        'detail': 'Obtain minutes and corroborate the filing.', 'status': 'active',
    }))
    must(client.post(f"/api/leads/{lead['id']}/links", json={
        'claim_id': claim['id'], 'note': 'Claim under review',
    }))

    converted = must(client.post(f"/api/leads/{lead['id']}/convert", json={
        'kind': 'task', 'title': 'Request board minutes', 'priority': 'high', 'owner': 'reporter',
    }))
    task = converted['record']
    assert task['lead_id'] == lead['id']
    assert task['status'] == 'todo'
    assert len(task['history']) == 1
    created_event = task['history'][0]
    assert created_event['from_status'] is None
    assert created_event['to_status'] == 'todo'
    assert created_event['lead_provenance']['lead']['id'] == lead['id']
    assert {row['type'] for row in created_event['lead_provenance']['links']} == {'claim'}

    # Mutating the lead after task creation must not rewrite the task's historical snapshot.
    must(client.post(f"/api/leads/{lead['id']}/links", json={
        'entity_id': entity['id'], 'note': 'Subject entity',
    }))
    completed = must(client.patch(f"/api/reporting-tasks/{task['id']}", json={
        'status': 'done', 'workflow_note': 'Minutes obtained and archived.',
    }))
    assert completed['status'] == 'done'
    assert len(completed['history']) == 2
    done_event, original_event = completed['history']
    assert done_event['from_status'] == 'todo'
    assert done_event['to_status'] == 'done'
    assert done_event['note'] == 'Minutes obtained and archived.'
    assert {row['type'] for row in done_event['lead_provenance']['links']} == {'claim', 'entity'}
    assert {row['type'] for row in original_event['lead_provenance']['links']} == {'claim'}

    trace = must(client.get('/api/provenance/trace', params={
        'record_type': 'task', 'record_id': task['id'],
    }))
    assert trace['record_type'] == 'task'
    assert trace['root']['task']['id'] == task['id']
    assert trace['root']['task']['history'][0]['to_status'] == 'done'
    assert any(row['lead']['id'] == lead['id'] for row in trace['lead_links'])
    assert any(row['claim'] and row['claim']['id'] == claim['id'] for row in trace['claim_links'])

    package = client.get(f"/api/investigations/{inv['id']}/export")
    assert package.status_code == 200, package.text
    inspected = must(client.post('/api/backups/inspect', files={
        'file': ('task-provenance.jwbackup.zip', package.content, 'application/zip'),
    }))
    assert inspected['record_counts']['reporting_tasks'] >= 1
    assert inspected['record_counts']['reporting_task_workflow_events'] >= 2
