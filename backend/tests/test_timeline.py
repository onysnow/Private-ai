from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def make_inv(name="Timeline test"):
    return client.post("/api/investigations", json={"name": name}).json()


def test_timeline_normalizes_ftm_source_and_reporter_events():
    inv = make_inv()
    person = client.post("/api/entities", json={
        "investigation_id": inv["id"], "schema": "Person", "caption": "Jane Reporter",
        "properties": {"name": ["Jane Reporter"], "birthDate": ["1988-04"]},
        "dataset": "reporter", "origin": "interview notes",
    }).json()
    source = client.post("/api/sources", json={
        "investigation_id": inv["id"], "title": "State filing", "url": "https://example.test/filing",
        "metadata_json": {"filing_date": "2025-03-14", "date_verified": True},
    }).json()
    claim = client.post("/api/claims", json={
        "investigation_id": inv["id"], "text": "Jane joined the board in spring 2024", "status": "supported", "confidence": .7,
    }).json()
    manual = client.post("/api/timeline-events", json={
        "investigation_id": inv["id"], "title": "Jane joined board", "date_start": "2024-03",
        "precision": "month", "verification_status": "approximate", "entity_id": person["id"],
        "source_id": source["id"], "claim_id": claim["id"], "origin": source["url"],
    })
    assert manual.status_code == 200

    r = client.get(f"/api/investigations/{inv['id']}/timeline")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 3
    by_kind = {}
    for event in body["events"]:
        by_kind.setdefault(event["kind"], []).append(event)
    assert by_kind["entity_date"][0]["date_start"] == "1988-04"
    assert by_kind["entity_date"][0]["precision"] == "month"
    assert by_kind["entity_date"][0]["provenance"]["origin"] == "interview notes"
    assert by_kind["source_date"][0]["date_start"] == "2025-03-14"
    assert by_kind["source_date"][0]["verification_status"] == "verified"
    reporter = by_kind["reporter_event"][0]
    assert reporter["verification_status"] == "approximate"
    assert reporter["refs"]["claim_id"] == claim["id"]
    assert reporter["refs"]["source_id"] == source["id"]


def test_relationship_date_keeps_relationship_provenance():
    inv = make_inv("Relationship timeline")
    a = client.post("/api/entities", json={"investigation_id": inv["id"], "schema": "Person", "caption": "A"}).json()
    b = client.post("/api/entities", json={"investigation_id": inv["id"], "schema": "Company", "caption": "B"}).json()
    rel = client.post("/api/relationships", json={
        "investigation_id": inv["id"], "schema": "Employment", "source_entity_id": a["id"],
        "target_entity_id": b["id"], "properties": {"startDate": ["2021-06-01"], "role": ["Analyst"]},
        "dataset": "corporate filing", "origin": "https://example.test/corp",
    }).json()
    timeline = client.get(f"/api/investigations/{inv['id']}/timeline").json()
    event = next(x for x in timeline["events"] if x["kind"] == "relationship_date")
    assert event["refs"]["relationship_entity_id"] == rel["relationship_entity_id"]
    assert event["provenance"]["dataset"] == "corporate filing"
    assert event["provenance"]["origin"] == "https://example.test/corp"


def test_timeline_filters_and_rejects_cross_investigation_refs():
    inv1 = make_inv("One")
    inv2 = make_inv("Two")
    foreign_source = client.post("/api/sources", json={"investigation_id": inv2["id"], "title": "Foreign"}).json()
    bad = client.post("/api/timeline-events", json={
        "investigation_id": inv1["id"], "title": "Bad link", "date_start": "2026",
        "precision": "year", "source_id": foreign_source["id"],
    })
    assert bad.status_code == 400

    ok = client.post("/api/timeline-events", json={
        "investigation_id": inv1["id"], "title": "Disputed event", "date_start": "2026",
        "precision": "year", "verification_status": "disputed",
    })
    assert ok.status_code == 200
    filtered = client.get(f"/api/investigations/{inv1['id']}/timeline?verification_status=disputed").json()
    assert filtered["total"] == 1
    assert filtered["events"][0]["title"] == "Disputed event"


def test_reporter_timeline_events_are_searchable_without_becoming_claims():
    inv = make_inv("Timeline search")
    event = client.post("/api/timeline-events", json={
        "investigation_id": inv["id"], "title": "Mitchell Station announcement", "description": "Utility announced retirement plan",
        "date_start": "2026-08-20", "precision": "day", "verification_status": "asserted", "origin": "meeting notes",
    }).json()
    search = client.get("/api/search", params={"q": "Mitchell Station", "investigation_id": inv["id"]}).json()
    hit = next(x for x in search["results"] if x["type"] == "timeline_event")
    assert hit["id"] == event["id"]
    assert hit["metadata"]["verification_status"] == "asserted"
    assert hit["provenance"]["origin"] == "meeting notes"


def test_reporter_timeline_event_exposes_claim_evidence_source_context_without_changing_truth_state():
    inv = make_inv("Timeline provenance continuity")
    source = client.post("/api/sources", json={
        "investigation_id": inv["id"], "title": "Board minutes", "url": "https://example.test/minutes",
        "source_type": "public_record",
    }).json()
    evidence = client.post("/api/evidence", json={
        "source_id": source["id"], "quote": "The board appointed Jane effective April 1.", "locator": "p. 7",
    }).json()
    claim = client.post("/api/claims", json={
        "investigation_id": inv["id"], "text": "Jane joined the board on April 1", "status": "disputed", "confidence": .45,
    }).json()
    link = client.post(f"/api/claims/{claim["id"]}/evidence", json={
        "evidence_id": evidence["id"], "stance": "supports", "note": "Minutes state effective date",
    })
    assert link.status_code == 200
    created = client.post("/api/timeline-events", json={
        "investigation_id": inv["id"], "title": "Jane board appointment", "date_start": "2026-04-01",
        "verification_status": "asserted", "source_id": source["id"], "evidence_id": evidence["id"], "claim_id": claim["id"],
    }).json()
    event = next(x for x in client.get(f"/api/investigations/{inv['id']}/timeline").json()["events"] if x["id"] == created["id"])
    assert event["verification_status"] == "asserted"
    assert event["context"]["source"]["url"] == "https://example.test/minutes"
    assert event["context"]["evidence"]["quote"] == "The board appointed Jane effective April 1."
    assert event["context"]["evidence"]["locator"] == "p. 7"
    assert event["context"]["claim"]["status"] == "disputed"
    assert event["context"]["claim"]["confidence"] == .45
    assert event["context"]["claim"]["evidence_stances"] == [{"stance": "supports", "note": "Minutes state effective date"}]
    # Timeline truth state remains reporter-controlled and is not silently derived from the linked claim.
    assert event["verification_status"] != event["context"]["claim"]["status"]


def test_timeline_relationship_context_preserves_mixed_evidence_assessments():
    inv = make_inv("Timeline mixed relationship evidence")
    source = client.post("/api/sources", json={"investigation_id": inv["id"], "title": "Mixed record"}).json()
    evidence = [client.post("/api/evidence", json={"source_id": source["id"], "quote": f"passage {i}", "locator": f"p. {i}"}).json() for i in range(1, 4)]
    a = client.post("/api/entities", json={"investigation_id": inv["id"], "schema": "Person", "caption": "Mixed A"}).json()
    b = client.post("/api/entities", json={"investigation_id": inv["id"], "schema": "Company", "caption": "Mixed B"}).json()
    rel = client.post("/api/relationships", json={"investigation_id": inv["id"], "schema": "Employment", "source_entity_id": a["id"], "target_entity_id": b["id"], "evidence_id": evidence[0]["id"], "properties": {"startDate": ["2024-01-15"]}}).json()
    for ev in evidence[1:]: assert client.post(f"/api/relationships/{rel['id']}/evidence", json={"evidence_id": ev["id"]}).status_code == 200
    for ev, stance in zip(evidence, ["supports", "contradicts", "unresolved"]):
        response = client.post(f"/api/relationships/{rel['id']}/evidence/{ev['id']}/reviews", json={"stance": stance, "rationale": f"Reporter assessment: {stance}."})
        assert response.status_code == 200, response.text
    manual = client.post("/api/timeline-events", json={"investigation_id": inv["id"], "title": "Mixed relationship event", "date_start": "2024-01-15", "relationship_entity_id": rel["relationship_entity_id"], "verification_status": "asserted"})
    assert manual.status_code == 200, manual.text
    timeline = client.get(f"/api/investigations/{inv['id']}/timeline").json()
    relationship_date = next(x for x in timeline["events"] if x["kind"] == "relationship_date")
    reporter_event = next(x for x in timeline["events"] if x["id"] == manual.json()["id"])
    for event in (relationship_date, reporter_event):
        advisory = event["context"]["relationship_advisory"]
        assert advisory["relationship_evidence_attachment_count"] == 3
        assert advisory["relationship_evidence_review_counts"]["supports"] == 1
        assert advisory["relationship_evidence_review_counts"]["contradicts"] == 1
        assert advisory["relationship_evidence_review_counts"]["unresolved"] == 1
        assert advisory["relationship_evidence_needs_review"] is True
    assert reporter_event["verification_status"] == "asserted"
