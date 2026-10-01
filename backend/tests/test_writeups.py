from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def make_investigation(name="Writeup test"):
    r = client.post("/api/investigations", json={"name": name})
    assert r.status_code == 200
    return r.json()


def make_claim(investigation_id, text="Meridian paid Bellcastle $2.4M"):
    r = client.post("/api/claims", json={"investigation_id": investigation_id, "text": text})
    assert r.status_code == 200
    return r.json()


CITATION_DOC = {
    "type": "doc",
    "content": [
        {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "The payment"}]},
        {"type": "paragraph", "content": [
            {"type": "text", "text": "Meridian paid Bellcastle a consulting fee"},
            {"type": "citation", "attrs": {"recordType": "claim", "recordId": "CLAIM-PLACEHOLDER", "label": "CLM-1"}},
            {"type": "text", "text": " in November 2023."},
        ]},
        {"type": "bulletList", "content": [
            {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Open question: was it disclosed?"}]}]},
        ]},
    ],
}


def test_create_update_and_citation_extraction():
    inv = make_investigation()
    claim = make_claim(inv["id"])
    doc = {**CITATION_DOC, "content": [
        CITATION_DOC["content"][0], CITATION_DOC["content"][1], CITATION_DOC["content"][2],
    ]}
    # patch the placeholder with a real claim id
    doc["content"][1]["content"][1]["attrs"]["recordId"] = claim["id"]

    created = client.post("/api/writeups", json={
        "investigation_id": inv["id"], "title": "  The $2.4M payment  ", "content_json": doc,
    })
    assert created.status_code == 200
    row = created.json()
    assert row["title"] == "The $2.4M payment"
    assert row["status"] == "draft"
    assert row["cited_record_refs"] == [{"record_type": "claim", "record_id": claim["id"]}]
    assert row["word_count"] > 0
    assert row["content_json"]["type"] == "doc"

    listed = client.get(f"/api/investigations/{inv['id']}/writeups")
    assert listed.status_code == 200
    assert len(listed.json()["writeups"]) == 1
    assert "content_json" not in listed.json()["writeups"][0]
    assert "preview" in listed.json()["writeups"][0]

    updated = client.patch(f"/api/writeups/{row['id']}", json={"status": "final"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "final"

    fetched = client.get(f"/api/writeups/{row['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["status"] == "final"


def test_invalid_status_rejected():
    inv = make_investigation()
    r = client.post("/api/writeups", json={"investigation_id": inv["id"], "title": "X", "status": "published"})
    assert r.status_code == 400


def test_missing_investigation_404():
    r = client.post("/api/writeups", json={"investigation_id": "does-not-exist", "title": "X"})
    assert r.status_code == 404


def test_docx_export_round_trips_citations():
    inv = make_investigation()
    claim = make_claim(inv["id"])
    doc = {**CITATION_DOC}
    doc["content"][1]["content"][1]["attrs"]["recordId"] = claim["id"]
    row = client.post("/api/writeups", json={
        "investigation_id": inv["id"], "title": "Export test", "content_json": doc,
    }).json()

    exported = client.get(f"/api/writeups/{row['id']}/export.docx")
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.wordprocessingml")
    assert len(exported.content) > 0

    from io import BytesIO
    from docx import Document as DocxDocument
    docx = DocxDocument(BytesIO(exported.content))
    full_text = "\n".join(p.text for p in docx.paragraphs)
    assert "The payment" in full_text
    assert "References" in full_text
    assert claim["id"] in full_text


def test_delete_writeup():
    inv = make_investigation()
    row = client.post("/api/writeups", json={"investigation_id": inv["id"], "title": "To delete"}).json()
    deleted = client.delete(f"/api/writeups/{row['id']}")
    assert deleted.status_code == 200
    assert client.get(f"/api/writeups/{row['id']}").status_code == 404
