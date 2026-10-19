"""Housekeeping per file (research Keep §12): Keep, Add back to the case, Delete. Every path the client sends is
checked again on the server; anything that is not a current stray file under document storage is refused and
nothing changes (app/services/housekeeping.py, app/api/routes_settings.py)."""

import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Document, KeptStrayFile, Source

client = TestClient(app)


@pytest.fixture()
def storage(tmp_path, monkeypatch):
    root = tmp_path / "documents"
    root.mkdir()
    monkeypatch.setattr(settings, "document_storage_dir", str(root))
    audit = tmp_path / "audit.jsonl"
    monkeypatch.setattr(app.state.audit_logger, "path", audit)
    return root, audit


def _case() -> str:
    reply = client.post("/api/investigations", json={"name": "Harbour land"})
    assert reply.status_code == 200, reply.text
    return reply.json()["id"]


def _listed() -> list[str]:
    reply = client.get("/api/settings/storage/orphans")
    assert reply.status_code == 200, reply.text
    return [f["relative_path"] for f in reply.json()["orphan_files"]]


def test_delete_removes_only_confirmed_stray_files_and_is_audited(storage):
    root, audit = storage
    (root / "stray.txt").write_bytes(b"left over")
    (root / "sub").mkdir()
    (root / "sub" / "old.pdf").write_bytes(b"%PDF-1.4 stray")
    (root / "keep-me.txt").write_bytes(b"not chosen")
    assert sorted(_listed()) == ["keep-me.txt", "stray.txt", "sub/old.pdf"]

    reply = client.post("/api/settings/storage/orphans/delete", json={"paths": ["stray.txt", "sub/old.pdf"]})
    assert reply.status_code == 200, reply.text
    body = reply.json()
    assert body["deleted_count"] == 2 and body["freed_bytes"] == len(b"left over") + len(b"%PDF-1.4 stray")
    assert not (root / "stray.txt").exists() and not (root / "sub" / "old.pdf").exists() and (root / "keep-me.txt").exists()
    assert _listed() == ["keep-me.txt"]
    events = [json.loads(line) for line in audit.read_text().splitlines()]
    assert any(e["event"] == "stray_files_deleted" and e["path"] == "/api/settings/storage/orphans/delete" for e in events)


@pytest.mark.parametrize("bad", [
    "../outside.txt", "sub/../../outside.txt", "..\\outside.txt", "/etc/passwd", "\\\\server\\share\\x", "C:\\Windows\\win.ini",
    "C:outside.txt", "", "   ", "nul\x00byte", ".upload-staging/staged.txt", ".restore-stage-abc/x.txt", "missing.txt", "sub",
    "link-out.txt", "link-doc.txt", "linkdir/outside.txt", "%2e%2e/outside.txt",
])
def test_anything_but_a_current_stray_file_is_refused_and_nothing_changes(storage, bad):
    root, _audit = storage
    outside = root.parent / "outside.txt"
    outside.write_bytes(b"not in storage")
    inv = _case()
    doc_file = root / "0123456789abcdef_doc.txt"
    doc_file.write_bytes(b"a document's file")
    with SessionLocal() as db:
        source = Source(investigation_id=inv, title="doc.txt", source_type="document")
        db.add(source)
        db.flush()
        db.add(Document(investigation_id=inv, source_id=source.id, filename="doc.txt", sha256="0" * 64,
                        storage_path=str(doc_file.resolve()), extraction_status="done"))
        db.commit()
    (root / "sub").mkdir()
    (root / ".upload-staging").mkdir()
    (root / ".upload-staging" / "staged.txt").write_bytes(b"in flight")
    (root / ".restore-stage-abc").mkdir()
    (root / ".restore-stage-abc" / "x.txt").write_bytes(b"in flight")
    os.symlink(outside, root / "link-out.txt")
    os.symlink(doc_file, root / "link-doc.txt")
    os.symlink(root.parent, root / "linkdir")
    (root / "stray.txt").write_bytes(b"a real stray")
    before = sorted(p.as_posix() for p in root.rglob("*"))
    assert _listed() == ["stray.txt"]  # links, staging and the document's file are never offered

    for action, body in (("delete", {"paths": ["stray.txt", bad]}), ("keep", {"paths": ["stray.txt", bad]})):
        reply = client.post(f"/api/settings/storage/orphans/{action}", json=body)
        assert reply.status_code in (400, 422), (action, bad, reply.text)
    added = client.post(f"/api/investigations/{inv}/storage/orphans/add-back", json={"path": bad})
    assert added.status_code in (400, 422), added.text

    assert sorted(p.as_posix() for p in root.rglob("*")) == before
    assert outside.read_bytes() == b"not in storage" and doc_file.read_bytes() == b"a document's file"
    with SessionLocal() as db:
        assert db.scalars(select(KeptStrayFile)).all() == []


def test_a_document_file_is_refused_even_when_named_directly(storage):
    root, _audit = storage
    inv = _case()
    up = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Lease"},
                     files={"file": ("lease.txt", b"The lease.\n", "text/plain")})
    assert up.status_code == 200, up.text
    stored = Path(up.json()["storage_path"]) if "storage_path" in up.json() else next(root.glob("*_lease.txt"))
    reply = client.post("/api/settings/storage/orphans/delete", json={"paths": [stored.relative_to(root.resolve()).as_posix()]})
    assert reply.status_code == 400 and stored.exists()


def test_keep_hides_a_file_and_it_is_not_offered_again(storage):
    root, _audit = storage
    (root / "photo.jpg").write_bytes(b"\xff\xd8\xff kept")
    (root / "other.txt").write_bytes(b"other")
    reply = client.post("/api/settings/storage/orphans/keep", json={"paths": ["photo.jpg", "photo.jpg"]})
    assert reply.status_code == 200 and reply.json() == {"kept": ["photo.jpg"], "kept_count": 1}
    body = client.get("/api/settings/storage/orphans").json()
    assert [f["relative_path"] for f in body["orphan_files"]] == ["other.txt"] and body["kept_file_count"] == 1
    assert (root / "photo.jpg").exists()
    # A kept file is no longer a stray on offer, but it is still a stray file: it can be kept again without a copy.
    assert client.post("/api/settings/storage/orphans/keep", json={"paths": ["photo.jpg"]}).status_code == 200
    with SessionLocal() as db:
        assert len(db.scalars(select(KeptStrayFile)).all()) == 1


def test_add_back_makes_a_document_of_the_case_and_removes_the_stray_copy(storage):
    root, _audit = storage
    inv = _case()
    (root / "a1b2c3d4e5f60718_interview.txt").write_bytes(b"Notes from the harbour interview.\n")
    reply = client.post(f"/api/investigations/{inv}/storage/orphans/add-back", json={"path": "a1b2c3d4e5f60718_interview.txt"})
    assert reply.status_code == 200, reply.text
    body = reply.json()
    assert body["investigation_id"] == inv and body["filename"] == "interview.txt" and body["job_id"]
    with SessionLocal() as db:
        doc = db.get(Document, body["document_id"])
        assert doc is not None and doc.investigation_id == inv and doc.filename == "interview.txt"
        assert Path(doc.storage_path).read_bytes() == b"Notes from the harbour interview.\n"
    assert _listed() == []
    # The same bytes again are already in the case.
    (root / "copy.txt").write_bytes(b"Notes from the harbour interview.\n")
    again = client.post(f"/api/investigations/{inv}/storage/orphans/add-back", json={"path": "copy.txt"})
    assert again.status_code == 409 and (root / "copy.txt").exists()


def test_housekeeping_actions_are_local_only(storage):
    root, _audit = storage
    (root / "stray.txt").write_bytes(b"x")
    remote = {"X-Forwarded-For": "203.0.113.9"}
    for path, body in (("/api/settings/storage/orphans/delete", {"paths": ["stray.txt"]}),
                       ("/api/settings/storage/orphans/keep", {"paths": ["stray.txt"]})):
        assert client.post(path, json=body, headers=remote).status_code in (401, 403)
    assert (root / "stray.txt").exists()
