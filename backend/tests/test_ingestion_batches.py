"""A bulk import as one record, and the same file caught when it is sent
again (design doc "Document Ingestion & Review System Design", Phase 2;
app/services/ingestion_batches.py)."""

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Document, Source
from app.services.ingestion_batches import find_duplicate

client = TestClient(app)

MEMO = b"Meridian Holdings Ltd paid Bellcastle Trading Group $2.4M on 3 March."
LEDGER = b"Ledger line one.\n\nLedger line two."


def _investigation(name: str = "Harbour contracts") -> str:
    reply = client.post("/api/investigations", json={"name": name})
    assert reply.status_code == 200
    return reply.json()["id"]


def _upload(inv: str, filename: str, data: bytes, mime: str = "text/plain", **form: str):
    return client.post("/api/documents/upload", data={"investigation_id": inv, "title": filename, **form},
                       files={"file": (filename, data, mime)})


def test_a_batch_lists_each_file_and_what_happened_to_it():
    inv = _investigation()
    batch = client.post(f"/api/investigations/{inv}/ingestion-batches", json={"label": "March filings"})
    assert batch.status_code == 200, batch.text
    batch_id = batch.json()["id"]
    assert batch.json()["items"] == [] and batch.json()["label"] == "March filings"

    memo = _upload(inv, "memo.txt", MEMO, batch_id=batch_id)
    assert memo.status_code in (200, 202), memo.text
    ledger = _upload(inv, "ledger.txt", LEDGER, batch_id=batch_id)
    again = _upload(inv, "memo copy.txt", MEMO, batch_id=batch_id)
    assert again.status_code == 409
    assert again.json()["detail"]["message"] == "Already in this investigation as “memo.txt”"
    assert again.json()["detail"]["document"]["id"] == memo.json()["id"]
    empty = _upload(inv, "blank.txt", b"", batch_id=batch_id)
    assert empty.status_code == 400

    body = client.get(f"/api/ingestion-batches/{batch_id}").json()
    assert [(i["position"], i["filename"], i["outcome"]) for i in body["items"]] == [
        (0, "memo.txt", "saved"), (1, "ledger.txt", "saved"), (2, "memo copy.txt", "duplicate"), (3, "blank.txt", "refused")]
    assert body["items"][2]["duplicate_of"] == {"id": memo.json()["id"], "filename": "memo.txt"}
    assert body["items"][3]["error"] == "Document is empty"
    # Only what this import saved is reviewed; the duplicate's document was reviewed before.
    assert body["review_order"] == [memo.json()["id"], ledger.json()["id"]]
    first = body["documents"][0]
    assert first["filename"] == "memo.txt" and first["extraction_status"] == "complete"
    assert first["job"]["status"] == "succeeded" and first["candidate_counts"]

    listed = client.get(f"/api/investigations/{inv}/ingestion-batches").json()["batches"]
    assert [(b["id"], b["counts"]) for b in listed] == [(batch_id, {"saved": 2, "duplicate": 1, "refused": 1})]


def test_the_same_file_twice_is_caught_unless_a_second_copy_is_asked_for():
    inv = _investigation()
    first = _upload(inv, "memo.txt", MEMO)
    assert first.status_code in (200, 202)
    assert _upload(inv, "memo.txt", MEMO).status_code == 409
    kept = _upload(inv, "memo (second copy).txt", MEMO, allow_duplicate="true")
    assert kept.status_code in (200, 202) and kept.json()["id"] != first.json()["id"]
    # Another investigation may hold the same file.
    assert _upload(_investigation("Port authority"), "memo.txt", MEMO).status_code in (200, 202)


def test_files_found_inside_an_archive_are_not_duplicates():
    """The same attachment in two emails is two findings, not a mistake."""
    inv = _investigation()
    first = _upload(inv, "mail.txt", MEMO).json()
    with SessionLocal() as db:
        parent = db.get(Document, first["id"])
        source = Source(investigation_id=inv, title="attachment", source_type="document")
        db.add(source)
        db.flush()
        db.add(Document(investigation_id=inv, source_id=source.id, filename="attachment.txt", sha256="f" * 64,
                        storage_path=parent.storage_path, extraction_status="complete", parent_document_id=parent.id))
        db.commit()
        assert find_duplicate(db, inv, "f" * 64) is None
        assert find_duplicate(db, inv, parent.sha256).id == parent.id


def test_a_batch_of_another_investigation_is_refused():
    inv, other = _investigation(), _investigation("Port authority")
    batch_id = client.post(f"/api/investigations/{other}/ingestion-batches", json={}).json()["id"]
    reply = _upload(inv, "memo.txt", MEMO, batch_id=batch_id)
    assert reply.status_code == 404
    assert client.get(f"/api/ingestion-batches/{batch_id}").json()["items"] == []
    assert client.get("/api/ingestion-batches/nope").status_code == 404
    assert client.post("/api/investigations/nope/ingestion-batches", json={}).status_code == 404


def test_a_backup_keeps_its_imports_and_refuses_an_item_pointing_elsewhere(tmp_path):
    """Imports travel with a backup. An item has no investigation_id of its
    own, so one that points at a batch outside the backup is a conflict."""
    import hashlib
    import io
    import json
    import zipfile

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.db.session import Base
    from app.models.domain import IngestionBatchItem
    from app.services.exports import build_investigation_export, preview_investigation_restore, restore_investigation_export

    inv = _investigation()
    batch_id = client.post(f"/api/investigations/{inv}/ingestion-batches", json={}).json()["id"]
    _upload(inv, "memo.txt", MEMO, batch_id=batch_id)
    with SessionLocal() as db:
        package, _manifest = build_investigation_export(db, inv, include_documents=True)

    engine = create_engine(f"sqlite:///{tmp_path / 'restored.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine, autoflush=False, autocommit=False)() as db:
        restore_investigation_export(db, package, tmp_path / "docs")
        assert [item.outcome for item in db.query(IngestionBatchItem).filter_by(batch_id=batch_id)] == ["saved"]

    with zipfile.ZipFile(io.BytesIO(package)) as zf:
        manifest = json.loads(zf.read("manifest.json"))
        records = json.loads(zf.read("data/database.json"))
        others = {n: zf.read(n) for n in zf.namelist() if n not in {"manifest.json", "data/database.json"}}
    records["ingestion_batch_items"][0]["batch_id"] = "someone-elses-batch"
    data = json.dumps(records).encode("utf-8")
    manifest["checksums"]["data/database.json"] = hashlib.sha256(data).hexdigest()
    tampered = io.BytesIO()
    with zipfile.ZipFile(tampered, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in others.items():
            zf.writestr(name, content)
        zf.writestr("data/database.json", data)
        zf.writestr("manifest.json", json.dumps(manifest))

    engine = create_engine(f"sqlite:///{tmp_path / 'target.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine, autoflush=False, autocommit=False)() as db:
        preview = preview_investigation_restore(db, tampered.getvalue(), tmp_path / "docs2")
        assert any(c["table"] == "ingestion_batch_items" and c["kind"] == "foreign_investigation" for c in preview["conflicts"])
        assert preview["can_restore"] is False
