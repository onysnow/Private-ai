from fastapi.testclient import TestClient
from app.main import app


def _inv(client):
    return client.post("/api/investigations", json={"name": "Post merge reconciliation"}).json()["id"]


def _entity(client, inv, caption, schema="Person"):
    return client.post("/api/entities", json={"investigation_id": inv, "schema": schema, "caption": caption, "properties": {"name": [caption]}}).json()


def _merge(client, source, target):
    same = client.post(f"/api/entities/{source['id']}/canonical-resolution", json={"other_entity_id": target["id"], "decision": "same", "confidence": 1.0})
    assert same.status_code == 200
    preview = client.get(f"/api/entities/{source['id']}/merge-preview", params={"target_entity_id": target["id"]}).json()
    assert preview["can_execute"] is True
    done = client.post(f"/api/entities/{source['id']}/merge", json={"target_entity_id": target["id"], "preview_digest": preview["preview_digest"]})
    assert done.status_code == 200


def test_statement_duplicates_are_detected_and_reviewed_without_deletion():
    client = TestClient(app)
    inv = _inv(client)
    source = client.post("/api/entities", json={"investigation_id": inv, "schema": "Person", "caption": "Todd C. Hansen", "properties": {"name": ["Todd Hansen"]}, "dataset": "aleph", "origin": "https://aleph.example/1"}).json()
    target = client.post("/api/entities", json={"investigation_id": inv, "schema": "Person", "caption": "Todd Hansen", "properties": {"name": ["  todd   hansen "]}, "dataset": "reporter", "origin": "county filing"}).json()
    a = client.get(f"/api/entities/{source['id']}/statements").json()[0]
    b = client.get(f"/api/entities/{target['id']}/statements").json()[0]
    _merge(client, source, target)

    review = client.get(f"/api/entities/{target['id']}/post-merge-reconciliation")
    assert review.status_code == 200
    body = review.json()
    assert body["summary"]["statement_pairs"] == 1
    pair = body["statement_duplicates"][0]
    assert {pair["record_a"]["id"], pair["record_b"]["id"]} == {a["id"], b["id"]}
    assert pair["provenance_differs"] is True
    assert pair["latest_decision"] is None

    decision = client.post(f"/api/entities/{target['id']}/post-merge-reconciliation", json={
        "record_type": "statement", "record_a_id": a["id"], "record_b_id": b["id"],
        "decision": "duplicate", "rationale": "Same assertion, retain both provenance records."
    })
    assert decision.status_code == 200
    again = client.get(f"/api/entities/{target['id']}/post-merge-reconciliation").json()
    assert again["statement_duplicates"][0]["latest_decision"]["decision"] == "duplicate"
    statements = client.get(f"/api/entities/{target['id']}/statements").json()
    assert {a["id"], b["id"]}.issubset({row["id"] for row in statements})


def test_relationship_duplicates_after_endpoint_consolidation_are_reviewable_and_preserve_both_edges():
    client = TestClient(app)
    inv = _inv(client)
    alias = _entity(client, inv, "ACME Incorporated", "Company")
    canonical = _entity(client, inv, "ACME Inc.", "Company")
    person = _entity(client, inv, "Jane Doe")
    first = client.post("/api/relationships", json={
        "investigation_id": inv, "schema": "Directorship", "source_entity_id": person["id"], "target_entity_id": alias["id"],
        "source_prop": "director", "target_prop": "organization", "properties": {}, "dataset": "source-a"
    }).json()
    second = client.post("/api/relationships", json={
        "investigation_id": inv, "schema": "Directorship", "source_entity_id": person["id"], "target_entity_id": canonical["id"],
        "source_prop": "director", "target_prop": "organization", "properties": {}, "dataset": "source-b"
    }).json()
    _merge(client, alias, canonical)

    body = client.get(f"/api/entities/{canonical['id']}/post-merge-reconciliation").json()
    assert body["summary"]["relationship_pairs"] == 1
    pair = body["relationship_duplicates"][0]
    assert {pair["record_a"]["id"], pair["record_b"]["id"]} == {first["id"], second["id"]}
    assert pair["provenance_differs"] is True

    saved = client.post(f"/api/entities/{canonical['id']}/post-merge-reconciliation", json={
        "record_type": "relationship", "record_a_id": first["id"], "record_b_id": second["id"],
        "decision": "keep_separate", "rationale": "Independent evidence trails should remain separately reviewable."
    })
    assert saved.status_code == 200
    rels = client.get(f"/api/entities/{canonical['id']}/relationships").json()
    assert {first["id"], second["id"]}.issubset({row["id"] for row in rels})


def test_reconciliation_rejects_unrelated_records():
    client = TestClient(app)
    inv = _inv(client)
    entity = client.post("/api/entities", json={"investigation_id": inv, "schema": "Person", "caption": "One", "properties": {"name": ["Same assertion"]}, "dataset": "x"}).json()
    other = client.post("/api/entities", json={"investigation_id": inv, "schema": "Person", "caption": "Two", "properties": {"name": ["Same assertion"]}, "dataset": "y"}).json()
    a = client.get(f"/api/entities/{entity['id']}/statements").json()[0]
    b = client.get(f"/api/entities/{other['id']}/statements").json()[0]
    r = client.post(f"/api/entities/{entity['id']}/post-merge-reconciliation", json={
        "record_type": "statement", "record_a_id": a["id"], "record_b_id": b["id"], "decision": "duplicate"
    })
    assert r.status_code == 409

def test_preferred_duplicate_statement_is_search_suppressed_but_traceable():
    client = TestClient(app)
    inv = _inv(client)
    source = client.post("/api/entities", json={"investigation_id": inv, "schema": "Person", "caption": "Preferred Search Person", "properties": {"name": ["Preferred Search Person"]}, "dataset": "source-a", "origin": "filing-a"}).json()
    target = client.post("/api/entities", json={"investigation_id": inv, "schema": "Person", "caption": "Preferred Search Person", "properties": {"name": ["Preferred Search Person"]}, "dataset": "source-b", "origin": "filing-b"}).json()
    a = client.get(f"/api/entities/{source['id']}/statements").json()[0]
    b = client.get(f"/api/entities/{target['id']}/statements").json()[0]
    _merge(client, source, target)
    saved = client.post(f"/api/entities/{target['id']}/post-merge-reconciliation", json={
        "record_type": "statement", "record_a_id": a["id"], "record_b_id": b["id"],
        "decision": "duplicate", "preferred_record_id": b["id"], "rationale": "Reporter prefers the filing-b assertion while retaining both histories."
    })
    assert saved.status_code == 200, saved.text
    assert saved.json()["preferred_record_id"] == b["id"]

    normal = client.get("/api/search", params={"q": "Preferred Search Person", "investigation_id": inv}).json()
    statement_ids = {row["id"] for row in normal["results"] if row["type"] == "statement"}
    assert b["id"] in statement_ids
    assert a["id"] not in statement_ids
    preferred_hit = next(row for row in normal["results"] if row["type"] == "statement" and row["id"] == b["id"])
    assert preferred_hit["metadata"]["reconciliation"]["is_preferred"] is True

    expanded = client.get("/api/search", params={"q": "Preferred Search Person", "investigation_id": inv, "include_reconciled_duplicates": True}).json()
    secondary = next(row for row in expanded["results"] if row["type"] == "statement" and row["id"] == a["id"])
    assert secondary["metadata"]["reconciliation"]["suppressed_duplicate"] is True
    assert secondary["metadata"]["reconciliation"]["preferred_record_id"] == b["id"]

    trace = client.get("/api/provenance/trace", params={"record_type": "entity", "record_id": target["id"]})
    assert trace.status_code == 200, trace.text
    pair = trace.json()["reconciliation"]["statement_duplicates"][0]
    assert pair["latest_decision"]["preferred_record_id"] == b["id"]


def test_preferred_record_requires_duplicate_decision_and_pair_member():
    client = TestClient(app)
    inv = _inv(client)
    a_ent = _entity(client, inv, "Preference Guard")
    b_ent = client.post("/api/entities", json={"investigation_id": inv, "schema": "Person", "caption": "Preference Guard", "properties": {"name": ["Preference Guard"]}, "dataset": "other"}).json()
    a = client.get(f"/api/entities/{a_ent['id']}/statements").json()[0]
    b = client.get(f"/api/entities/{b_ent['id']}/statements").json()[0]
    _merge(client, a_ent, b_ent)
    bad = client.post(f"/api/entities/{b_ent['id']}/post-merge-reconciliation", json={
        "record_type": "statement", "record_a_id": a["id"], "record_b_id": b["id"],
        "decision": "keep_separate", "preferred_record_id": a["id"]
    })
    assert bad.status_code == 409
    bad2 = client.post(f"/api/entities/{b_ent['id']}/post-merge-reconciliation", json={
        "record_type": "statement", "record_a_id": a["id"], "record_b_id": b["id"],
        "decision": "duplicate", "preferred_record_id": "not-in-pair"
    })
    assert bad2.status_code == 409

def test_preferred_duplicate_relationship_is_search_collapsed_and_provenance_explains_preference():
    client = TestClient(app)
    inv = _inv(client)
    alias = _entity(client, inv, "Graph Preference LLC", "Company")
    canonical = _entity(client, inv, "Graph Preference LLC", "Company")
    person = _entity(client, inv, "Graph Preference Director")
    first = client.post("/api/relationships", json={
        "investigation_id": inv, "schema": "Directorship", "source_entity_id": person["id"], "target_entity_id": alias["id"],
        "source_prop": "director", "target_prop": "organization", "properties": {"role": ["Director"]}, "dataset": "source-a"
    }).json()
    second = client.post("/api/relationships", json={
        "investigation_id": inv, "schema": "Directorship", "source_entity_id": person["id"], "target_entity_id": canonical["id"],
        "source_prop": "director", "target_prop": "organization", "properties": {"role": ["Director"]}, "dataset": "source-b"
    }).json()
    _merge(client, alias, canonical)
    saved = client.post(f"/api/entities/{canonical['id']}/post-merge-reconciliation", json={
        "record_type": "relationship", "record_a_id": first["id"], "record_b_id": second["id"],
        "decision": "duplicate", "preferred_record_id": second["id"], "rationale": "Same edge; source-b is preferred presentation."
    })
    assert saved.status_code == 200, saved.text

    normal = client.get("/api/search", params={"q": "Graph Preference Director", "investigation_id": inv}).json()
    rel_ids = {row["id"] for row in normal["results"] if row["type"] == "relationship"}
    assert second["id"] in rel_ids and first["id"] not in rel_ids

    trace = client.get("/api/provenance/trace", params={"record_type": "relationship", "record_id": first["id"]})
    assert trace.status_code == 200, trace.text
    rec = trace.json()["reconciliation"]
    assert rec["suppressed_duplicate"] is True
    assert rec["preferred_record_id"] == second["id"]


def test_graph_and_dossier_collapse_reviewed_duplicate_relationships_without_erasing_history():
    client = TestClient(app)
    inv = _inv(client)
    alias = _entity(client, inv, "Collapsed Graph Co", "Company")
    canonical = _entity(client, inv, "Collapsed Graph Co", "Company")
    person = _entity(client, inv, "Collapsed Graph Director")
    first = client.post("/api/relationships", json={
        "investigation_id": inv, "schema": "Directorship", "source_entity_id": person["id"], "target_entity_id": alias["id"],
        "source_prop": "director", "target_prop": "organization", "properties": {"role": ["Director"]}, "dataset": "source-a"
    }).json()
    second = client.post("/api/relationships", json={
        "investigation_id": inv, "schema": "Directorship", "source_entity_id": person["id"], "target_entity_id": canonical["id"],
        "source_prop": "director", "target_prop": "organization", "properties": {"role": ["Director"]}, "dataset": "source-b"
    }).json()
    _merge(client, alias, canonical)
    saved = client.post(f"/api/entities/{canonical['id']}/post-merge-reconciliation", json={
        "record_type": "relationship", "record_a_id": first["id"], "record_b_id": second["id"],
        "decision": "duplicate", "preferred_record_id": second["id"], "rationale": "Same edge; keep source-b as the compact graph edge."
    })
    assert saved.status_code == 200, saved.text

    compact = client.get(f"/api/investigations/{inv}/graph")
    assert compact.status_code == 200, compact.text
    body = compact.json()
    assert [edge["id"] for edge in body["edges"]] == [second["id"]]
    assert body["reconciliation"]["suppressed_duplicate_count"] == 1
    assert body["reconciliation"]["underlying_edge_count"] == 2
    assert body["edges"][0]["reconciliation"]["is_preferred"] is True
    assert first["id"] in body["edges"][0]["reconciliation"]["suppressed_duplicate_ids"]

    expanded = client.get(f"/api/investigations/{inv}/graph", params={"include_reconciled_duplicates": True}).json()
    assert {edge["id"] for edge in expanded["edges"]} == {first["id"], second["id"]}
    secondary = next(edge for edge in expanded["edges"] if edge["id"] == first["id"])
    assert secondary["reconciliation"]["suppressed_duplicate"] is True
    assert secondary["reconciliation"]["preferred_record_id"] == second["id"]

    dossier = client.get(f"/api/entities/{canonical['id']}/dossier")
    assert dossier.status_code == 200, dossier.text
    d = dossier.json()
    assert [edge["id"] for edge in d["relationships"]] == [second["id"]]
    assert d["summary"]["relationship_count"] == 1
    assert d["summary"]["relationship_underlying_count"] == 2
    assert d["summary"]["relationship_suppressed_duplicate_count"] == 1

    # The historical secondary edge is still directly traceable.
    trace = client.get("/api/provenance/trace", params={"record_type": "relationship", "record_id": first["id"]})
    assert trace.status_code == 200
    assert trace.json()["reconciliation"]["suppressed_duplicate"] is True


def test_compact_preferred_relationship_aggregates_reviewed_duplicate_provenance_without_merging_records():
    client = TestClient(app)
    inv = _inv(client)
    alias = _entity(client, inv, "Aggregate Provenance Co", "Company")
    canonical = _entity(client, inv, "Aggregate Provenance Co", "Company")
    person = _entity(client, inv, "Aggregate Provenance Director")

    source_a = client.post("/api/sources", json={"investigation_id": inv, "title": "State filing A", "url": "https://example.test/a"}).json()
    source_b = client.post("/api/sources", json={"investigation_id": inv, "title": "State filing B", "url": "https://example.test/b"}).json()
    evidence_a = client.post("/api/evidence", json={"source_id": source_a["id"], "quote": "Director listed in filing A", "locator": "p. 2"}).json()
    evidence_b = client.post("/api/evidence", json={"source_id": source_b["id"], "quote": "Director listed in filing B", "locator": "p. 9"}).json()

    first = client.post("/api/relationships", json={
        "investigation_id": inv, "schema": "Directorship", "source_entity_id": person["id"], "target_entity_id": alias["id"],
        "source_prop": "director", "target_prop": "organization", "properties": {"role": ["Director"]},
        "dataset": "filing-a", "origin": "https://example.test/a#p2", "evidence_id": evidence_a["id"]
    }).json()
    second = client.post("/api/relationships", json={
        "investigation_id": inv, "schema": "Directorship", "source_entity_id": person["id"], "target_entity_id": canonical["id"],
        "source_prop": "director", "target_prop": "organization", "properties": {"role": ["Director"]},
        "dataset": "filing-b", "origin": "https://example.test/b#p9", "evidence_id": evidence_b["id"]
    }).json()
    _merge(client, alias, canonical)
    saved = client.post(f"/api/entities/{canonical['id']}/post-merge-reconciliation", json={
        "record_type": "relationship", "record_a_id": first["id"], "record_b_id": second["id"],
        "decision": "duplicate", "preferred_record_id": second["id"],
        "rationale": "Same relationship; compact presentation should retain both evidence trails."
    })
    assert saved.status_code == 200, saved.text

    compact = client.get(f"/api/investigations/{inv}/graph").json()
    assert len(compact["edges"]) == 1
    edge = compact["edges"][0]
    assert edge["id"] == second["id"]
    aggregate = edge["aggregate_provenance"]
    assert aggregate["presentation_only"] is True
    assert set(aggregate["underlying_relationship_ids"]) == {first["id"], second["id"]}
    assert aggregate["underlying_relationship_count"] == 2
    assert aggregate["evidence_count"] == 2
    assert {item["id"] for item in aggregate["evidence"]} == {evidence_a["id"], evidence_b["id"]}
    assert {item["source"]["id"] for item in aggregate["evidence"]} == {source_a["id"], source_b["id"]}
    assert "filing-a|https://example.test/a#p2" in aggregate["statement_sources"]
    assert "filing-b|https://example.test/b#p9" in aggregate["statement_sources"]

    # Expanded audit mode still returns the original two records independently and does not invent an aggregate.
    expanded = client.get(f"/api/investigations/{inv}/graph", params={"include_reconciled_duplicates": True}).json()
    assert {row["id"] for row in expanded["edges"]} == {first["id"], second["id"]}
    assert all("aggregate_provenance" not in row for row in expanded["edges"])

def test_relationship_trace_collects_claim_stances_across_reviewed_duplicate_evidence():
    client = TestClient(app)
    inv = _inv(client)
    alias = _entity(client, inv, "Claim Trace Co", "Company")
    canonical = _entity(client, inv, "Claim Trace Co", "Company")
    person = _entity(client, inv, "Claim Trace Director")
    evidence_ids = []
    for suffix in ("a", "b"):
        source = client.post("/api/sources", json={"investigation_id": inv, "title": f"Filing {suffix}", "source_type": "filing"}).json()
        evidence = client.post("/api/evidence", json={"source_id": source["id"], "quote": f"Director evidence {suffix}", "locator": f"page {suffix}"}).json()
        evidence_ids.append(evidence["id"])
    first = client.post("/api/relationships", json={"investigation_id": inv, "schema": "Directorship", "source_entity_id": person["id"], "target_entity_id": alias["id"], "properties": {"role": ["Director"]}, "dataset": "filing-a", "evidence_id": evidence_ids[0]}).json()
    second = client.post("/api/relationships", json={"investigation_id": inv, "schema": "Directorship", "source_entity_id": person["id"], "target_entity_id": canonical["id"], "properties": {"role": ["Director"]}, "dataset": "filing-b", "evidence_id": evidence_ids[1]}).json()
    support = client.post("/api/claims", json={"investigation_id": inv, "text": "The person served as a director.", "status": "supported", "confidence": 0.8}).json()
    dispute = client.post("/api/claims", json={"investigation_id": inv, "text": "The directorship ended before the filing date.", "status": "disputed", "confidence": 0.4}).json()
    assert client.post(f"/api/claims/{support['id']}/evidence", json={"evidence_id": evidence_ids[0], "stance": "supports"}).status_code == 200
    assert client.post(f"/api/claims/{dispute['id']}/evidence", json={"evidence_id": evidence_ids[1], "stance": "contradicts"}).status_code == 200
    _merge(client, alias, canonical)
    assert client.post(f"/api/entities/{canonical['id']}/post-merge-reconciliation", json={"record_type": "relationship", "record_a_id": first["id"], "record_b_id": second["id"], "decision": "duplicate", "preferred_record_id": second["id"]}).status_code == 200

    trace = client.get("/api/provenance/trace", params={"record_type": "relationship", "record_id": second["id"]})
    assert trace.status_code == 200, trace.text
    body = trace.json()
    assert set(body["root"]["reviewed_duplicate_scope"]["underlying_relationship_ids"]) == {first["id"], second["id"]}
    assert {row["evidence"]["id"] for row in body["evidence_links"]} == set(evidence_ids)
    assert {(row["claim"]["id"], row["stance"]) for row in body["claim_links"]} == {(support["id"], "supports"), (dispute["id"], "contradicts")}

def test_relationship_context_lead_preserves_duplicate_edges_evidence_and_claim_stances():
    client = TestClient(app)
    inv = _inv(client)
    alias = _entity(client, inv, "Lead Context Co", "Company")
    canonical = _entity(client, inv, "Lead Context Co", "Company")
    person = _entity(client, inv, "Lead Context Director")
    evidence_ids = []
    for suffix in ("a", "b"):
        source = client.post("/api/sources", json={"investigation_id": inv, "title": f"Lead filing {suffix}", "source_type": "filing"}).json()
        evidence = client.post("/api/evidence", json={"source_id": source["id"], "quote": f"Lead evidence {suffix}", "locator": f"page {suffix}"}).json()
        evidence_ids.append(evidence["id"])
    first = client.post("/api/relationships", json={"investigation_id": inv, "schema": "Directorship", "source_entity_id": person["id"], "target_entity_id": alias["id"], "properties": {"role": ["Director"]}, "dataset": "filing-a", "evidence_id": evidence_ids[0]}).json()
    second = client.post("/api/relationships", json={"investigation_id": inv, "schema": "Directorship", "source_entity_id": person["id"], "target_entity_id": canonical["id"], "properties": {"role": ["Director"]}, "dataset": "filing-b", "evidence_id": evidence_ids[1]}).json()
    support = client.post("/api/claims", json={"investigation_id": inv, "text": "Director claim", "status": "supported", "confidence": 0.8}).json()
    dispute = client.post("/api/claims", json={"investigation_id": inv, "text": "Timing dispute", "status": "disputed", "confidence": 0.4}).json()
    client.post(f"/api/claims/{support['id']}/evidence", json={"evidence_id": evidence_ids[0], "stance": "supports"})
    client.post(f"/api/claims/{dispute['id']}/evidence", json={"evidence_id": evidence_ids[1], "stance": "contradicts"})
    _merge(client, alias, canonical)
    client.post(f"/api/entities/{canonical['id']}/post-merge-reconciliation", json={"record_type": "relationship", "record_a_id": first["id"], "record_b_id": second["id"], "decision": "duplicate", "preferred_record_id": second["id"]})

    created = client.post(f"/api/relationships/{second['id']}/lead-from-context")
    assert created.status_code == 200, created.text
    lead = created.json()
    by_type = {}
    for link in lead["links"]:
        by_type.setdefault(link["type"], set()).add(link["target_id"])
    assert by_type["relationship"] == {first["id"], second["id"]}
    assert by_type["evidence"] == set(evidence_ids)
    assert by_type["claim"] == {support["id"], dispute["id"]}
    assert lead["triage"]["needs_attention"] is True
    assert lead["triage"]["stance_counts"]["contradicts"] == 1
    # Creating the lead is context preservation only; truth states are unchanged.
    claims = {row["id"]: row for row in client.get(f"/api/investigations/{inv}/claims").json()}
    assert claims[support["id"]]["status"] == "supported"
    assert claims[dispute["id"]]["status"] == "disputed"

def test_reporting_task_freezes_rich_lead_context():
    client = TestClient(app)
    inv = _inv(client)
    person = _entity(client, inv, "Task Person")
    company = _entity(client, inv, "Task Company", "Company")
    source = client.post("/api/sources", json={"investigation_id": inv, "title": "Task filing", "source_type": "filing", "url": "https://example.test/task"}).json()
    evidence = client.post("/api/evidence", json={"source_id": source["id"], "quote": "Task Person is a director of Task Company.", "locator": "p. 7"}).json()
    claim = client.post("/api/claims", json={"investigation_id": inv, "text": "Task Person directs Task Company", "status": "disputed", "confidence": 0.5}).json()
    client.post(f"/api/claims/{claim['id']}/evidence", json={"evidence_id": evidence["id"], "stance": "contradicts"})
    rel = client.post("/api/relationships", json={"investigation_id": inv, "schema": "Directorship", "source_entity_id": person["id"], "target_entity_id": company["id"], "properties": {}, "evidence_id": evidence["id"]}).json()
    lead = client.post(f"/api/relationships/{rel['id']}/lead-from-context", json={}).json()
    # Add the reporter's concrete next action before converting to a task.
    client.patch(f"/api/leads/{lead['id']}", json={"next_action": "Interview the company secretary", "owner": "Reporter A", "priority": "high"})
    converted = client.post(f"/api/leads/{lead['id']}/convert", json={"kind": "task"}).json()
    task = converted["record"]
    snap = task["history"][0]["lead_provenance"]
    assert snap["lead"]["next_action"] == "Interview the company secretary"
    assert snap["lead"]["owner"] == "Reporter A"
    assert snap["lead"]["priority"] == "high"
    assert {x["id"] for x in snap["context"]["relationships"]} == {rel["id"]}
    assert {x["id"] for x in snap["context"]["claims"]} == {claim["id"]}
    assert {x["id"] for x in snap["context"]["evidence"]} == {evidence["id"]}
    assert {x["id"] for x in snap["context"]["sources"]} == {source["id"]}
    assert snap["triage"]["needs_attention"] is True
    # Later edits must not rewrite the frozen creation context.
    client.patch(f"/api/claims/{claim['id']}", json={"status": "verified"})
    tasks = client.get(f"/api/investigations/{inv}/reporting-tasks").json()
    frozen = next(x for x in tasks if x["id"] == task["id"])["history"][0]["lead_provenance"]
    assert next(x for x in frozen["context"]["claims"] if x["id"] == claim["id"])["status"] == "disputed"


def test_relationship_reconciliation_uses_all_evidence_attachments_not_legacy_pointer():
    client = TestClient(app)
    inv = _inv(client)
    alias = _entity(client, inv, "ACME Holdings", "Company")
    canonical = _entity(client, inv, "ACME", "Company")
    person = _entity(client, inv, "Jane Evidence")
    source = client.post("/api/sources", json={"investigation_id": inv, "title": "Filing", "source_type": "document"}).json()
    evidence = client.post("/api/evidence", json={"investigation_id": inv, "source_id": source["id"], "quote": "Jane is a director of ACME.", "locator": "p. 4"}).json()
    first = client.post("/api/relationships", json={
        "investigation_id": inv, "schema": "Directorship", "source_entity_id": person["id"], "target_entity_id": alias["id"],
        "source_prop": "director", "target_prop": "organization", "properties": {}, "dataset": "reporter"
    }).json()
    second = client.post("/api/relationships", json={
        "investigation_id": inv, "schema": "Directorship", "source_entity_id": person["id"], "target_entity_id": canonical["id"],
        "source_prop": "director", "target_prop": "organization", "properties": {}, "dataset": "reporter"
    }).json()
    attached = client.post(f"/api/relationships/{first['id']}/evidence", json={"evidence_id": evidence["id"], "note": "Independent filing"})
    assert attached.status_code == 200
    _merge(client, alias, canonical)
    pair = client.get(f"/api/entities/{canonical['id']}/post-merge-reconciliation").json()["relationship_duplicates"][0]
    assert pair["provenance_differs"] is True
    assert {item["evidence"]["id"] for item in pair["record_a"]["provenance"]["evidence_attachments"] if item["evidence"]} | {item["evidence"]["id"] for item in pair["record_b"]["provenance"]["evidence_attachments"] if item["evidence"]} == {evidence["id"]}
