from fastapi.testclient import TestClient
from app.main import app


def _inv(client, name="Merge preview"):
    return client.post("/api/investigations", json={"name": name}).json()["id"]


def _entity(client, inv, caption, schema="Person"):
    return client.post("/api/entities", json={"investigation_id": inv, "schema": schema, "caption": caption, "properties": {"name": [caption]}}).json()


def _mark_same(client, source, target):
    r = client.post(f"/api/entities/{source['id']}/canonical-resolution", json={"other_entity_id": target["id"], "decision": "same", "confidence": 0.98, "rationale": "Reporter verified duplicate identity."})
    assert r.status_code == 200


def test_merge_requires_same_decision_and_fresh_preview_and_remaps_references():
    client = TestClient(app)
    inv = _inv(client)
    source = _entity(client, inv, "Todd C. Hansen")
    target = _entity(client, inv, "Todd Hansen")
    client.post("/api/statements", json={"entity_id": source["id"], "prop": "name", "value": "Todd C. Hansen", "dataset": "reporter"})
    lead = client.post("/api/leads", json={"investigation_id": inv, "title": "Verify corporate filing"}).json()
    client.post(f"/api/leads/{lead['id']}/links", json={"entity_id": source["id"], "note": "Alias record"})

    p = client.get(f"/api/entities/{source['id']}/merge-preview", params={"target_entity_id": target["id"]})
    assert p.status_code == 200
    preview = p.json()
    assert preview["can_execute"] is False
    assert preview["references"]["statements"]["count"] == 1
    assert preview["references"]["lead_links"]["count"] == 1
    r = client.post(f"/api/entities/{source['id']}/merge", json={"target_entity_id": target["id"], "preview_digest": preview["preview_digest"]})
    assert r.status_code == 409

    _mark_same(client, source, target)
    fresh = client.get(f"/api/entities/{source['id']}/merge-preview", params={"target_entity_id": target["id"]}).json()
    assert fresh["can_execute"] is True
    assert fresh["preview_digest"] != preview["preview_digest"]
    stale = client.post(f"/api/entities/{source['id']}/merge", json={"target_entity_id": target["id"], "preview_digest": preview["preview_digest"]})
    assert stale.status_code == 409

    done = client.post(f"/api/entities/{source['id']}/merge", json={"target_entity_id": target["id"], "preview_digest": fresh["preview_digest"], "rationale": "Consolidate verified alias."})
    assert done.status_code == 200
    audit = done.json()["audit"]
    assert audit["moved_counts_json"]["statements"] == 1
    assert audit["moved_counts_json"]["lead_links"] == 1

    active = client.get(f"/api/investigations/{inv}/entities").json()
    ids = {x["id"] for x in active}
    assert target["id"] in ids and source["id"] not in ids
    statements = client.get(f"/api/entities/{target['id']}/statements").json()
    assert any(x["value"] == "Todd C. Hansen" for x in statements)
    history = client.get(f"/api/entities/{target['id']}/merge-history").json()
    assert history[0]["source_entity_id"] == source["id"]


def test_merge_preview_blocks_relationship_that_would_become_self_loop():
    client = TestClient(app)
    inv = _inv(client, "Self-loop blocker")
    source = _entity(client, inv, "Acme Holdings LLC", "Company")
    target = _entity(client, inv, "Acme Holdings", "Company")
    _mark_same(client, source, target)
    rel = client.post("/api/relationships", json={
        "investigation_id": inv, "schema": "Ownership", "source_entity_id": source["id"], "target_entity_id": target["id"],
        "source_prop": "owner", "target_prop": "asset", "properties": {}
    })
    assert rel.status_code == 200
    preview = client.get(f"/api/entities/{source['id']}/merge-preview", params={"target_entity_id": target["id"]}).json()
    assert preview["can_execute"] is False
    assert any(x["code"] == "relationship_self_loop" for x in preview["blockers"])
    r = client.post(f"/api/entities/{source['id']}/merge", json={"target_entity_id": target["id"], "preview_digest": preview["preview_digest"]})
    assert r.status_code == 409


def test_merged_alias_search_dossier_and_provenance_resolve_to_active_entity():
    client = TestClient(app)
    inv = _inv(client, "Alias-aware merge aftermath")
    source = _entity(client, inv, "Anthony J. Shannon")
    target = _entity(client, inv, "Anthony Shannon")
    _mark_same(client, source, target)
    preview = client.get(f"/api/entities/{source['id']}/merge-preview", params={"target_entity_id": target["id"]}).json()
    done = client.post(f"/api/entities/{source['id']}/merge", json={"target_entity_id": target["id"], "preview_digest": preview["preview_digest"]})
    assert done.status_code == 200

    search = client.get("/api/search", params={"q": "Anthony J. Shannon", "investigation_id": inv})
    assert search.status_code == 200
    alias_hit = next(x for x in search.json()["results"] if x["type"] == "entity" and x["id"] == source["id"])
    assert alias_hit["provenance"]["kind"] == "merged_alias"
    assert alias_hit["provenance"]["trace_record_id"] == target["id"]
    assert alias_hit["metadata"]["active_entity_id"] == target["id"]

    dossier = client.get(f"/api/entities/{source['id']}/dossier")
    assert dossier.status_code == 200
    body = dossier.json()
    assert body["entity"]["id"] == target["id"]
    assert body["alias_resolution"]["requested_entity_id"] == source["id"]
    assert body["alias_resolution"]["active_entity_id"] == target["id"]

    trace = client.get("/api/provenance/trace", params={"record_type": "entity", "record_id": source["id"]})
    assert trace.status_code == 200
    trace_body = trace.json()
    assert trace_body["record_id"] == target["id"]
    assert trace_body["root"]["id"] == target["id"]
    assert trace_body["root"]["alias_resolution"]["requested_entity_id"] == source["id"]
