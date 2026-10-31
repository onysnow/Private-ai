"""Redact before sharing (app/services/pdf_redact.py, mockup MEDIA_3): proposed boxes (phone and email by pattern, a
person named in the case), a redacted copy whose text under each box is gone from the file, not covered, with each
box's reason kept and not its words, hidden data removed, and the case's PDF never written."""

from __future__ import annotations

import os
from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import DerivedFile, Document
from app.services import native

client = TestClient(app)
LINES = ["MARLOW HARBOUR COUNCIL - MINUTES", "Present: the Chair, Cllr Hendry, Cllr Osei, and Ann Example (observer).",
         "A member of the public, Bob Sample, asked whether a deposit had been paid.",
         "Contact for the record: 07700 900 431 or clerk@example.org"]


@pytest.fixture(autouse=True)
def storage(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "documents"))
    if not native.available():
        if os.environ.get("CI"):
            raise AssertionError("CI builds the native module (backend-postgres-ci.yml); it is missing")
        pytest.skip("the native module is not built here")


def _minutes() -> tuple[str, str]:
    pdf = pymupdf.open()
    page = pdf.new_page()
    for n, line in enumerate(LINES):
        page.insert_text((72, 72 + 20 * n), line, fontsize=11)
    page.add_text_annot((300, 300), "a private note")
    pdf.set_metadata({"author": "The Clerk", "creator": "Word"})
    data = pdf.tobytes()
    inv = client.post("/api/investigations", json={"name": "Harbour"}).json()["id"]
    client.post("/api/entities", json={"investigation_id": inv, "schema": "Person", "caption": "Bob Sample", "properties": {"name": ["Bob Sample"]}})
    r = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "minutes.pdf"},
                    files={"file": ("minutes.pdf", data, "application/pdf")})
    assert r.status_code == 200, r.text
    return inv, r.json()["id"]


def test_margin_line_numbers_and_bare_numbers_are_not_phone_numbers():
    from app.services.pdf_redact import PHONE, looks_like_phone

    page = "1\n2\n3\n10\n11\n12\n13\n14\n25\n26\n27\n28\nPage 10 11 12 13\nCase 2016123\nOn 22.03.2013 and 2013-03-22 paid 620.068965 ref 0583-994\nTelephone: (213) 894-3391\n" \
           "Call 07700 900 431 or +44 20 7946 0958 or 2135551234"
    found = [m.group(0).strip() for m in PHONE.finditer(page) if looks_like_phone(m.group(0))]
    assert found == ["(213) 894-3391", "07700 900 431", "+44 20 7946 0958", "2135551234"]


def test_proposes_boxes_and_says_what_hidden_data_the_file_carries():
    _inv, doc = _minutes()
    view = client.get(f"/api/documents/{doc}/redaction")
    assert view.status_code == 200, view.text
    body = view.json()
    assert body["pages"][0]["width"] == 595 and body["pages"][0]["height"] == 842
    found = {(p["kind"], p["text"]) for p in body["proposals"]}
    assert ("phone", "07700 900 431") in found and ("email", "clerk@example.org") in found and ("person", "Bob Sample") in found
    assert {p["why"] for p in body["proposals"]} == {"found by pattern", "a person named in this case"}
    hidden = {h["category"]: h["count"] for h in body["hidden"]}
    assert hidden["metadata"] >= 2 and hidden["comments"] == 1
    assert body["pdfa"]["compliant"] is False


def test_the_copy_has_the_text_gone_keeps_reasons_not_words_and_the_pdf_is_never_written():
    _inv, doc = _minutes()
    with SessionLocal() as db:
        before = Path(db.get(Document, doc).storage_path).read_bytes()
    person = next(p for p in client.get(f"/api/documents/{doc}/redaction").json()["proposals"] if p["kind"] == "person")
    made = client.post(f"/api/documents/{doc}/derived/redacted", json={
        "boxes": [{"page": 1, "rect": person["rect"], "reason": "source protection", "kind": "person"}],
        "remove": ["metadata", "comments"], "made_for": "editor"})
    assert made.status_code == 201, made.text
    row = made.json()
    assert row["operation"] == "redacted" and row["filename"].startswith("minutes-redacted-for-editor-")
    assert row["params"]["boxes"][0]["reason"] == "source protection"
    assert "Bob Sample" not in str(row["params"])
    assert row["params"]["hidden_removed"] == {"comments": 1, "metadata": row["params"]["hidden_removed"]["metadata"]}
    with SessionLocal() as db:
        copy = pymupdf.open(db.get(DerivedFile, row["id"]).storage_path)
        assert Path(db.get(Document, doc).storage_path).read_bytes() == before
    text = copy[0].get_text()
    assert "Bob Sample" not in text and "asked whether a deposit" in text
    assert not copy.metadata.get("author") and not list(copy[0].annots())

    compared = client.get(f"/api/documents/{doc}/redaction/compare", params={"copy_id": row["id"]})
    assert compared.status_code == 200, compared.text
    assert compared.json()["old_words"] > compared.json()["new_words"] and compared.json()["pages_changed"] == [1]
    page = client.get(f"/api/derived-files/{row['id']}/page.png", params={"page": 1, "width": 300})
    assert page.status_code == 200 and page.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_refuses_a_box_with_no_reason_or_off_the_page_and_a_document_that_is_not_a_pdf():
    _inv, doc = _minutes()
    no_reason = client.post(f"/api/documents/{doc}/derived/redacted", json={"boxes": [{"page": 1, "rect": [70, 60, 200, 80], "reason": " "}]})
    assert no_reason.status_code == 422 and "reason" in no_reason.json()["detail"]
    off_page = client.post(f"/api/documents/{doc}/derived/redacted", json={"boxes": [{"page": 3, "rect": [70, 60, 200, 80], "reason": "x"}]})
    assert off_page.status_code == 422 and "page" in off_page.json()["detail"]
    inv = client.post("/api/investigations", json={"name": "Text"}).json()["id"]
    note = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "note.txt"},
                       files={"file": ("note.txt", b"hello", "text/plain")}).json()["id"]
    assert client.get(f"/api/documents/{note}/redaction").status_code == 415
