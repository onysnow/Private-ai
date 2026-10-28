"""What the story needs (app/services/stories.py, mockup ACT_2): the tree, its gates and the ready decision."""

from fastapi.testclient import TestClient

from app.main import app
from app.services.stories import sentences_without_source
from tests.claim_helpers import post_claim

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


def test_an_initial_or_a_title_does_not_end_a_sentence():
    cite = {"type": "citation", "attrs": {"recordType": "claim", "recordId": "c1", "label": "1"}}
    doc = {"type": "doc", "content": [{"type": "paragraph", "content": [
        {"type": "text", "text": "M. Ross, a director named by Dr. Weber, was paid "}, cite, {"type": "text", "text": ". The money went on, e.g. to Kestrel SA."}]}]}
    assert sentences_without_source(doc) == (2, 1)


def test_a_capital_after_a_capitalised_word_can_end_a_sentence():
    """"Schedule A." is a label, not an initial: the uncited sentence it ends is counted, not hidden by the next one's source."""
    cite = {"type": "citation", "attrs": {"recordType": "claim", "recordId": "c1", "label": "1"}}
    para = lambda text: {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}, cite]}]}
    assert sentences_without_source(para("The filing was Schedule A. The owners were listed ")) == (2, 1)
    assert sentences_without_source(para("The bank paid J. R. Weber and later M. Ross ")) == (1, 0)


def test_the_tree_is_as_strong_as_its_weakest_claim_and_ready_waits_for_every_gate():
    inv = ok(client.post("/api/investigations", json={"name": "Harbour"}))["id"]
    empty = ok(client.get(f"/api/investigations/{inv}/story"))
    assert empty["id"] is None and empty["thesis"] == "" and empty["gates_passed"] == 2  # no flags and nothing single-source yet
    shown = ok(post_claim(client, {"investigation_id": inv, "text": "The council sold the land to Fernhill Ltd", "status": "supported"}))
    unshown = ok(post_claim(client, {"investigation_id": inv, "text": "The sale was not put out to tender"}))
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
    assert section["claims"][0]["evidence"] == [{"id": ev["id"], "stance": "supports", "label": "Land registry", "locator": "title ML-2017",
                                                  "quote": "transferred to Fernhill Ltd"}]
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


def test_the_story_travels_with_the_case_backup():
    from app.db.session import SessionLocal
    from app.services.exports import collect_investigation_records

    inv = ok(client.post("/api/investigations", json={"name": "Backup"}))["id"]
    claim = ok(post_claim(client, {"investigation_id": inv, "text": "The land was sold"}))
    ok(client.put(f"/api/investigations/{inv}/story", json={"thesis": "The land was sold cheaply"}))
    section = ok(client.post(f"/api/investigations/{inv}/story/sections", json={"title": "The sale"}))["sections"][0]
    ok(client.post(f"/api/investigations/{inv}/story/sections/{section['id']}/claims", json={"claim_id": claim["id"]}))
    with SessionLocal() as db:
        records = collect_investigation_records(db, inv)
    assert [r["thesis"] for r in records["stories"]] == ["The land was sold cheaply"]
    assert [r["title"] for r in records["story_sections"]] == ["The sale"]
    assert [r["claim_id"] for r in records["story_claims"]] == [claim["id"]]


def _doc(text):
    return {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]}


def test_the_write_up_keeps_named_and_automatic_versions_and_a_restore_keeps_what_it_replaced(monkeypatch):
    from datetime import timedelta

    from app.services import writeup_versions

    inv = ok(client.post("/api/investigations", json={"name": "Versions"}))["id"]
    assert ok(client.get(f"/api/investigations/{inv}/story/versions")) == {"writeup_id": None, "versions": []}
    assert client.post(f"/api/investigations/{inv}/story/versions", json={"name": "Too soon"}).status_code == 404
    ok(client.put(f"/api/investigations/{inv}/story", json={"thesis": "The land was sold cheaply"}))
    writeup_id = ok(client.post(f"/api/investigations/{inv}/story/writeup"))["writeup_id"]

    # The first save of an empty write-up keeps nothing; the next keeps the text it replaces.
    ok(client.patch(f"/api/writeups/{writeup_id}", json={"content_json": _doc("First draft.")}))
    assert ok(client.get(f"/api/investigations/{inv}/story/versions"))["versions"] == []
    ok(client.patch(f"/api/writeups/{writeup_id}", json={"content_json": _doc("Second draft.")}))
    versions = ok(client.get(f"/api/investigations/{inv}/story/versions"))["versions"]
    assert [(v["kind"], v["name"], v["word_count"]) for v in versions] == [("auto", None, 2)]
    # Within a few minutes of the last one, a save keeps nothing new.
    ok(client.patch(f"/api/writeups/{writeup_id}", json={"content_json": _doc("Third draft.")}))
    assert len(ok(client.get(f"/api/investigations/{inv}/story/versions"))["versions"]) == 1

    named = ok(client.post(f"/api/investigations/{inv}/story/versions", json={"name": "  Before   legal read "}))
    assert (named["kind"], named["name"]) == ("named", "Before legal read")
    assert client.post(f"/api/investigations/{inv}/story/versions", json={"name": "   "}).status_code == 400
    assert ok(client.get(f"/api/investigations/{inv}/story"))["version"]["name"] == "Before legal read"
    one = ok(client.get(f"/api/investigations/{inv}/story/versions/{named['id']}"))
    assert one["content_json"] == _doc("Third draft.")

    ok(client.patch(f"/api/writeups/{writeup_id}", json={"content_json": _doc("After the lawyer.")}))
    restored = ok(client.post(f"/api/investigations/{inv}/story/versions/{named['id']}/restore"))
    assert restored["content_json"] == _doc("Third draft.")
    versions = ok(client.get(f"/api/investigations/{inv}/story/versions"))["versions"]
    assert versions[0]["kind"] == "before_restore" and versions[0]["name"] == "Before restoring “Before legal read”"
    kept = ok(client.get(f"/api/investigations/{inv}/story/versions/{versions[0]['id']}"))
    assert kept["content_json"] == _doc("After the lawyer.")
    # The restore is itself undone by restoring what it kept.
    assert ok(client.post(f"/api/investigations/{inv}/story/versions/{kept['id']}/restore"))["content_json"] == _doc("After the lawyer.")

    # Another case cannot read or restore this case's versions.
    other = ok(client.post("/api/investigations", json={"name": "Other"}))["id"]
    ok(client.post(f"/api/investigations/{other}/story/writeup"))
    assert client.get(f"/api/investigations/{other}/story/versions/{named['id']}").status_code == 404
    assert client.post(f"/api/investigations/{other}/story/versions/{named['id']}/restore").status_code == 404

    # Only the newest automatic versions are kept; named ones stay.
    monkeypatch.setattr(writeup_versions, "AUTO_EVERY", timedelta(0))
    monkeypatch.setattr(writeup_versions, "KEEP_AUTO", 2)
    for i in range(4):
        ok(client.patch(f"/api/writeups/{writeup_id}", json={"content_json": _doc(f"Draft number {i}.")}))
    kinds = [v["kind"] for v in ok(client.get(f"/api/investigations/{inv}/story/versions"))["versions"]]
    assert kinds.count("auto") == 2 and kinds.count("named") == 1 and kinds.count("before_restore") == 2

    # Deleting the write-up takes its versions with it.
    assert client.delete(f"/api/writeups/{writeup_id}").status_code == 200
    assert ok(client.get(f"/api/investigations/{inv}/story"))["writeup_id"] is None
    assert ok(client.get(f"/api/investigations/{inv}/story/versions"))["versions"] == []


def test_story_notes_and_versions_travel_with_the_case_backup():
    from app.db.session import SessionLocal
    from app.services.exports import collect_investigation_records

    inv = ok(client.post("/api/investigations", json={"name": "Notes"}))["id"]
    story = ok(client.put(f"/api/investigations/{inv}/story", json={"thesis": "The land was sold cheaply"}))
    note = ok(client.post(f"/api/investigations/{inv}/notes", json={"text": "Ask the council for the tender file", "record_type": "story", "record_id": story["id"]}))
    assert note["caption"] == "The land was sold cheaply"
    listed = ok(client.get(f"/api/investigations/{inv}/notes", params={"record_type": "story", "record_id": story["id"]}))["notes"]
    assert [n["text"] for n in listed] == ["Ask the council for the tender file"]
    other = ok(client.post("/api/investigations", json={"name": "Other"}))["id"]
    assert client.post(f"/api/investigations/{other}/notes", json={"text": "x", "record_type": "story", "record_id": story["id"]}).status_code == 400

    writeup_id = ok(client.post(f"/api/investigations/{inv}/story/writeup"))["writeup_id"]
    ok(client.patch(f"/api/writeups/{writeup_id}", json={"content_json": _doc("A draft.")}))
    ok(client.post(f"/api/investigations/{inv}/story/versions", json={"name": "Before legal read"}))
    with SessionLocal() as db:
        records = collect_investigation_records(db, inv)
    assert [r["text"] for r in records["notes"]] == ["Ask the council for the tender file"]
    assert [r["name"] for r in records["writeup_versions"]] == ["Before legal read"]
