"""Tags, notes and collections: the reporter's own marks on records
(app/services/annotations.py, app/api/routes_annotations.py)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Claim, Entity, Investigation, Lead, LeadLink, RelationshipEdge
from app.services.annotations import TAG_COLOURS

client = TestClient(app)


def _setup() -> dict[str, str]:
    with SessionLocal() as db:
        inv = Investigation(name="Marks")
        other = Investigation(name="Someone else's")
        db.add_all([inv, other])
        db.flush()
        a = Entity(investigation_id=inv.id, ftm_id="a", schema="Company", caption="Bellcastle Ltd", properties={})
        b = Entity(investigation_id=inv.id, ftm_id="b", schema="Person", caption="Jane Doe", properties={})
        stranger = Entity(investigation_id=other.id, ftm_id="c", schema="Person", caption="Not here", properties={})
        db.add_all([a, b, stranger])
        db.flush()
        edge = RelationshipEdge(investigation_id=inv.id, relationship_entity_id="own-1", schema="Ownership",
                                source_entity_id=b.id, target_entity_id=a.id, source_prop="owner", target_prop="asset")
        claim = Claim(investigation_id=inv.id, text="Jane Doe owns Bellcastle through a nominee.")
        db.add_all([edge, claim])
        db.commit()
        return {"inv": inv.id, "other": other.id, "a": a.id, "b": b.id, "stranger": stranger.id, "edge": edge.id, "claim": claim.id}


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def test_tags_are_named_coloured_and_unique_per_investigation():
    ids = _setup()
    base = f"/api/investigations/{ids['inv']}"
    tags = ok(client.post(f"{base}/tags", json={"name": "Money trail", "colour": TAG_COLOURS[2]}))
    assert tags["colours"] == list(TAG_COLOURS)
    assert [(t["name"], t["colour"], t["count"]) for t in tags["tags"]] == [("Money trail", TAG_COLOURS[2], 0)]
    # Same name in any case is refused; a colour outside the swatches is refused.
    assert client.post(f"{base}/tags", json={"name": "money TRAIL", "colour": TAG_COLOURS[0]}).status_code == 400
    assert client.post(f"{base}/tags", json={"name": "Other", "colour": "#ff0000"}).status_code == 400
    # Another investigation may use the same name.
    ok(client.post(f"/api/investigations/{ids['other']}/tags", json={"name": "Money trail", "colour": TAG_COLOURS[0]}))
    tag_id = tags["tags"][0]["id"]
    renamed = ok(client.patch(f"/api/tags/{tag_id}", json={"name": "Follow the money", "colour": TAG_COLOURS[5]}))
    assert renamed["tags"][0]["name"] == "Follow the money"
    assert renamed["tags"][0]["colour"] == TAG_COLOURS[5]


def test_a_tag_goes_on_any_record_of_the_investigation_and_only_there():
    ids = _setup()
    base = f"/api/investigations/{ids['inv']}"
    tag_id = ok(client.post(f"{base}/tags", json={"name": "Nominee", "colour": TAG_COLOURS[0]}))["tags"][0]["id"]
    for record_type, record_id in (("entity", ids["b"]), ("relationship", ids["edge"]), ("claim", ids["claim"])):
        marks = ok(client.post(f"{base}/record-tags", json={"tag_id": tag_id, "record_type": record_type, "record_id": record_id}))
        assert [t["name"] for t in marks["tags"]] == ["Nominee"]
    # Twice is once.
    ok(client.post(f"{base}/record-tags", json={"tag_id": tag_id, "record_type": "entity", "record_id": ids["b"]}))
    records = ok(client.get(f"/api/tags/{tag_id}/records"))
    assert records["tag"]["count"] == 3
    assert {r["caption"] for r in records["records"]} == {"Jane Doe", "Jane Doe → Bellcastle Ltd (Ownership)",
                                                          "Jane Doe owns Bellcastle through a nominee."}
    # A record from another investigation, or one that does not exist, is refused.
    assert client.post(f"{base}/record-tags", json={"tag_id": tag_id, "record_type": "entity", "record_id": ids["stranger"]}).status_code == 400
    assert client.post(f"{base}/record-tags", json={"tag_id": tag_id, "record_type": "entity", "record_id": "missing"}).status_code == 400
    # Untag, then delete the tag: the records stay.
    marks = ok(client.delete(f"{base}/record-tags", params={"tag_id": tag_id, "record_type": "entity", "record_id": ids["b"]}))
    assert marks["tags"] == []
    ok(client.delete(f"/api/tags/{tag_id}"))
    assert ok(client.get(f"{base}/marks", params={"record_type": "claim", "record_id": ids["claim"]}))["tags"] == []
    with SessionLocal() as db:
        assert db.get(Claim, ids["claim"]) is not None


def test_notes_on_a_record_and_a_note_made_a_lead():
    ids = _setup()
    base = f"/api/investigations/{ids['inv']}"
    note = ok(client.post(f"{base}/notes", json={"text": "Check who signed the 2019 transfer.\nThe nominee changed then.",
                                                 "record_type": "entity", "record_id": ids["a"]}))
    assert note["caption"] == "Bellcastle Ltd"
    on_investigation = ok(client.post(f"{base}/notes", json={"text": "Ask the registry for the full file."}))
    assert on_investigation["record_type"] is None
    on_chart = ok(client.post(f"{base}/notes", json={"text": "This cluster is new.", "chart_ref": {"chart": "network", "mark": ids["a"]}}))
    assert on_chart["chart_ref"] == {"chart": "network", "mark": ids["a"]}
    assert client.post(f"{base}/notes", json={"text": "half", "record_type": "entity"}).status_code == 400
    assert client.post(f"{base}/notes", json={"text": "   "}).status_code in (400, 422)
    assert [n["id"] for n in ok(client.get(f"{base}/notes", params={"record_type": "entity", "record_id": ids["a"]}))["notes"]] == [note["id"]]
    edited = ok(client.patch(f"/api/notes/{note['id']}", json={"text": "Check who signed the 2019 transfer."}))
    assert edited["text"] == "Check who signed the 2019 transfer."

    lead = ok(client.post(f"/api/notes/{note['id']}/lead"))
    assert lead["title"] == "Check who signed the 2019 transfer."
    assert client.post(f"/api/notes/{note['id']}/lead").status_code == 400
    with SessionLocal() as db:
        assert db.get(Lead, lead["id"]).investigation_id == ids["inv"]
        links = db.query(LeadLink).filter(LeadLink.lead_id == lead["id"]).all()
        assert [link.entity_id for link in links] == [ids["a"]]
    marks = ok(client.get(f"{base}/marks", params={"record_type": "entity", "record_id": ids["a"]}))
    assert marks["notes"][0]["lead_id"] == lead["id"]
    # Deleting the note keeps the lead.
    ok(client.delete(f"/api/notes/{note['id']}"))
    with SessionLocal() as db:
        assert db.get(Lead, lead["id"]) is not None


def test_collections_keep_order_and_moving_a_record_reorders():
    ids = _setup()
    base = f"/api/investigations/{ids['inv']}"
    col = ok(client.post(f"{base}/collections", json={"name": "Bellcastle money trail"}))
    cid = col["id"]
    ok(client.post(f"/api/collections/{cid}/items", json={"record_type": "entity", "record_id": ids["a"]}))
    ok(client.post(f"/api/collections/{cid}/items", json={"record_type": "relationship", "record_id": ids["edge"]}))
    col = ok(client.post(f"/api/collections/{cid}/items", json={"record_type": "entity", "record_id": ids["b"], "position": 0}))
    assert [(i["record_id"], i["position"]) for i in col["items"]] == [(ids["b"], 0), (ids["a"], 1), (ids["edge"], 2)]
    # Adding a record already there moves it.
    col = ok(client.post(f"/api/collections/{cid}/items", json={"record_type": "entity", "record_id": ids["b"]}))
    assert [i["record_id"] for i in col["items"]] == [ids["a"], ids["edge"], ids["b"]]
    assert client.post(f"/api/collections/{cid}/items", json={"record_type": "entity", "record_id": ids["stranger"]}).status_code == 400
    col = ok(client.delete(f"/api/collections/{cid}/items", params={"record_type": "relationship", "record_id": ids["edge"]}))
    assert [(i["record_id"], i["position"]) for i in col["items"]] == [(ids["a"], 0), (ids["b"], 1)]
    marks = ok(client.get(f"{base}/marks", params={"record_type": "entity", "record_id": ids["a"]}))
    assert marks["collections"] == [{"id": cid, "name": "Bellcastle money trail"}]
    listing = ok(client.get(f"{base}/collections"))
    assert [(c["name"], c["item_count"]) for c in listing["collections"]] == [("Bellcastle money trail", 2)]
    ok(client.patch(f"/api/collections/{cid}", json={"name": "Money trail", "description": "Payments to the nominee"}))
    assert ok(client.delete(f"/api/collections/{cid}"))["collections"] == []
    with SessionLocal() as db:
        assert db.get(Entity, ids["a"]) is not None


def test_marks_travel_in_a_backup_and_go_with_the_investigation():
    from app.services.exports import collect_investigation_records

    ids = _setup()
    base = f"/api/investigations/{ids['inv']}"
    tag_id = ok(client.post(f"{base}/tags", json={"name": "Nominee", "colour": TAG_COLOURS[0]}))["tags"][0]["id"]
    ok(client.post(f"{base}/record-tags", json={"tag_id": tag_id, "record_type": "entity", "record_id": ids["b"]}))
    ok(client.post(f"{base}/notes", json={"text": "A note", "record_type": "entity", "record_id": ids["b"]}))
    cid = ok(client.post(f"{base}/collections", json={"name": "Trail"}))["id"]
    ok(client.post(f"/api/collections/{cid}/items", json={"record_type": "entity", "record_id": ids["b"]}))
    with SessionLocal() as db:
        records = collect_investigation_records(db, ids["inv"])
    assert {k: len(records[k]) for k in ("tags", "record_tags", "notes", "collections", "collection_items")} == {
        "tags": 1, "record_tags": 1, "notes": 1, "collections": 1, "collection_items": 1}
