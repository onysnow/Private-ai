"""What the story needs (app/services/stories.py, mockup ACT_2): the tree, its gates and the ready decision."""

from fastapi.testclient import TestClient

from app.main import app
from app.services.stories import sentences_without_source

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def test_a_sentence_without_a_citation_is_counted_and_a_citation_after_the_full_stop_belongs_to_its_sentence():
    cite = {"type": "citation", "attrs": {"recordType": "claim", "recordId": "c1", "label": "1"}}
    doc = {"type": "doc", "content": [
        {"type": "heading", "content": [{"type": "text", "text": "Who bought the harbour?"}]},
        {"type": "paragraph", "content": [{"type": "text", "text": "The council sold the land in 2017."}, cite,
                                          {"type": "text", "text": " The sale was not put out to tender."}]},
        {"type": "paragraph", "content": [{"type": "text", "text": "Every share is held by Harbour Nominees "}, cite, {"type": "text", "text": "."}]},
    ]}
    assert sentences_without_source(doc) == (3, 1)
    assert sentences_without_source(None) == (0, 0)


def test_the_tree_is_as_strong_as_its_weakest_claim_and_ready_waits_for_every_gate():
    inv = ok(client.post("/api/investigations", json={"name": "Harbour"}))["id"]
    empty = ok(client.get(f"/api/investigations/{inv}/story"))
    assert empty["id"] is None and empty["thesis"] == "" and empty["gates_passed"] == 2  # no flags and nothing single-source yet
    shown = ok(client.post("/api/claims", json={"investigation_id": inv, "text": "The council sold the land to Fernhill Ltd", "status": "supported"}))
    unshown = ok(client.post("/api/claims", json={"investigation_id": inv, "text": "The sale was not put out to tender"}))
    src = ok(client.post("/api/sources", json={"investigation_id": inv, "title": "Land registry", "source_type": "document"}))
    ev = ok(client.post("/api/evidence", json={"source_id": src["id"], "quote": "transferred to Fernhill Ltd", "locator": "title ML-2017"}))
    ok(client.post(f"/api/claims/{shown['id']}/evidence", json={"evidence_id": ev["id"], "stance": "supports"}))

    story = ok(client.put(f"/api/investigations/{inv}/story", json={"thesis": "Kestrel SA ended up with the harbour land"}))
    assert story["thesis"] == "Kestrel SA ended up with the harbour land" and len(story["unplaced"]) == 2
    story = ok(client.post(f"/api/investigations/{inv}/story/sections", json={"title": "Who bought the land"}))
    section = story["sections"][0]
    assert section["status"] == "empty"
    for claim in (shown, unshown):
        story = ok(client.post(f"/api/investigations/{inv}/story/sections/{section['id']}/claims", json={"claim_id": claim["id"]}))
    section = story["sections"][0]
    assert section["status"] == "unshown" and (section["shown"], section["total"]) == (1, 2)
    assert section["claims"][0]["evidence"] == [{"id": ev["id"], "stance": "supports", "label": "Land registry", "locator": "title ML-2017"}]
    assert section["claims"][0]["single_source"] is True
    assert story["critical"] == [{"claim_id": unshown["id"], "text": "The sale was not put out to tender", "section": "Who bought the land"}]
    assert story["counts"] == {"claims": 2, "shown": 1, "disputed": 0, "unshown": 1}
    assert story["unplaced"] == []
    gates = {g["key"]: g for g in story["gates"]}
    assert gates["sources"]["state"] == "pending" and gates["single"]["state"] == "warning" and gates["right_of_reply"]["state"] == "open"

    refused = client.post(f"/api/investigations/{inv}/story/ready", json={"by": "Ony"})
    assert refused.status_code == 400 and "Right of reply sent" in refused.json()["detail"]
    story = ok(client.put(f"/api/investigations/{inv}/story/gates", json={"gate": "legal_read", "who": "M. Ross", "on": "2026-10-11"}))
    assert {g["key"]: g for g in story["gates"]}["legal_read"]["detail"] == "M. Ross · 2026-10-11"
    story = ok(client.post(f"/api/investigations/{inv}/story/writeup"))
    assert story["writeup_id"]
    # A section from another case's story is refused.
    other = ok(client.post("/api/investigations", json={"name": "Other"}))["id"]
    assert client.delete(f"/api/investigations/{other}/story/sections/{section['id']}").status_code == 404
    story = ok(client.delete(f"/api/investigations/{inv}/story/sections/{section['id']}/claims/{unshown['id']}"))
    assert story["sections"][0]["status"] == "shown" and len(story["unplaced"]) == 1
