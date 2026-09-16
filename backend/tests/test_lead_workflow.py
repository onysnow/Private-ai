from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def make_investigation(name="Lead workflow"):
    r = client.post("/api/investigations", json={"name": name})
    assert r.status_code == 200
    return r.json()


def test_lead_queue_status_priority_links_and_conversion():
    inv = make_investigation()
    lead = client.post("/api/leads", json={
        "investigation_id": inv["id"], "title": "Who approved the contract?", "detail": "Identify the approving official."
    })
    assert lead.status_code == 200
    lead = lead.json()
    assert lead["priority"] == "normal"
    assert lead["status"] == "unreviewed"

    updated = client.patch(f"/api/leads/{lead['id']}", json={
        "status": "active", "priority": "high", "owner": "AJ", "next_action": "Pull board minutes", "note": "Started reporting"
    })
    assert updated.status_code == 200
    body = updated.json()
    assert body["status"] == "active"
    assert body["priority"] == "high"
    assert body["owner"] == "AJ"
    assert body["history"][0]["from_status"] == "unreviewed"
    assert body["history"][0]["to_status"] == "active"

    entity = client.post("/api/entities", json={
        "investigation_id": inv["id"], "schema": "Person", "caption": "Jane Reporter", "properties": {"name": ["Jane Reporter"]}
    }).json()
    link = client.post(f"/api/leads/{lead['id']}/links", json={"entity_id": entity["id"], "note": "Possible approver"})
    assert link.status_code == 200
    assert link.json()["type"] == "entity"

    queue = client.get(f"/api/investigations/{inv['id']}/leads/queue?priority=high")
    assert queue.status_code == 200
    assert queue.json()["total"] == 1
    assert queue.json()["items"][0]["links"][0]["target_id"] == entity["id"]

    converted = client.post(f"/api/leads/{lead['id']}/convert", json={"kind": "claim", "text": "Jane Reporter approved the contract."})
    assert converted.status_code == 200
    claim = converted.json()["record"]
    assert claim["status"] == "lead"
    detail = client.get(f"/api/leads/{lead['id']}").json()
    assert any(x["type"] == "claim" and x["target_id"] == claim["id"] for x in detail["links"])

    task = client.post(f"/api/leads/{lead['id']}/convert", json={"kind": "task", "title": "Request board minutes", "owner": "AJ"})
    assert task.status_code == 200
    assert task.json()["record"]["lead_id"] == lead["id"]

    search = client.get("/api/search", params={"q": "board minutes", "investigation_id": inv["id"]}).json()
    assert search["counts"].get("lead", 0) >= 1 or search["counts"].get("reporting_task", 0) >= 1

    dossier = client.get(f"/api/entities/{entity['id']}/dossier")
    assert dossier.status_code == 200
    assert any(x["lead"]["id"] == lead["id"] and x["match_basis"]["type"] == "explicit_lead_link" for x in dossier.json()["leads"])


def test_cross_investigation_lead_links_are_rejected():
    inv1 = make_investigation("One")
    inv2 = make_investigation("Two")
    lead = client.post("/api/leads", json={"investigation_id": inv1["id"], "title": "Question"}).json()
    source = client.post("/api/sources", json={"investigation_id": inv2["id"], "title": "Wrong source"}).json()
    r = client.post(f"/api/leads/{lead['id']}/links", json={"source_id": source["id"]})
    assert r.status_code == 400


def test_resolved_leads_drop_from_default_unresolved_queue():
    inv = make_investigation("Queue")
    lead = client.post("/api/leads", json={"investigation_id": inv["id"], "title": "Resolved question"}).json()
    r = client.patch(f"/api/leads/{lead['id']}", json={"status": "resolved"})
    assert r.status_code == 200
    default_queue = client.get(f"/api/investigations/{inv['id']}/leads/queue").json()
    assert all(x["id"] != lead["id"] for x in default_queue["items"])
    all_queue = client.get(f"/api/investigations/{inv['id']}/leads/queue?unresolved_only=false").json()
    assert any(x["id"] == lead["id"] for x in all_queue["items"])


def test_lead_queue_surfaces_contradiction_pressure_without_overwriting_reporter_priority():
    inv = make_investigation("Contradiction triage")
    source = client.post("/api/sources", json={
        "investigation_id": inv["id"], "title": "Board filing", "source_type": "document"
    }).json()
    evidence = client.post("/api/evidence", json={
        "source_id": source["id"], "quote": "The filing names a different director.", "locator": "p. 4"
    }).json()
    claim = client.post("/api/claims", json={
        "investigation_id": inv["id"], "text": "Alex was the sole director.", "status": "disputed", "confidence": 0.4
    }).json()
    linked = client.post(f"/api/claims/{claim['id']}/evidence", json={
        "evidence_id": evidence["id"], "stance": "contradicts", "note": "Direct conflict in filing"
    })
    assert linked.status_code == 200

    ordinary = client.post("/api/leads", json={"investigation_id": inv["id"], "title": "Ordinary lead"}).json()
    pressured = client.post("/api/leads", json={"investigation_id": inv["id"], "title": "Resolve director conflict"}).json()
    attach = client.post(f"/api/leads/{pressured['id']}/links", json={"claim_id": claim["id"]})
    assert attach.status_code == 200

    queue = client.get(f"/api/investigations/{inv['id']}/leads/queue?unresolved_only=false")
    assert queue.status_code == 200
    items = queue.json()["items"]
    by_id = {item["id"]: item for item in items}
    triage = by_id[pressured["id"]]["triage"]
    assert triage["needs_attention"] is True
    assert triage["stance_counts"]["contradicts"] == 1
    assert triage["disputed_claim_count"] == 1
    assert triage["attention_score"] == 5
    assert by_id[pressured["id"]]["priority"] == "normal"
    assert items.index(by_id[pressured["id"]]) < items.index(by_id[ordinary["id"]])
