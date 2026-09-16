import io
import json
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db.session import Base
from app.models.domain import Investigation, Entity, Source, Evidence, Claim, Document, DocumentChunk
from app.services.exports import build_investigation_export, inspect_export, restore_investigation_export
from app.db.session import SessionLocal

client = TestClient(app)


def new_inv(name="Portable case"):
    r = client.post("/api/investigations", json={"name": name, "description": "Export integrity test"})
    assert r.status_code == 200
    return r.json()["id"]


def test_investigation_export_contains_ftm_provenance_and_documents(tmp_path):
    inv = new_inv("Portable export")
    ent = client.post("/api/entities", json={
        "investigation_id": inv, "schema": "Company", "caption": "Example Energy",
        "properties": {"name": ["Example Energy"]}, "dataset": "reporter", "origin": "https://example.test/company",
    }).json()
    src = client.post("/api/sources", json={
        "investigation_id": inv, "title": "Filed record", "url": "https://example.test/filing",
        "source_type": "filing", "metadata_json": {"filing_date": "2026-09-01"},
    }).json()
    ev = client.post("/api/evidence", json={"source_id": src["id"], "quote": "Verified filing text", "locator": "page 2"}).json()
    claim = client.post("/api/claims", json={"investigation_id": inv, "text": "Example Energy filed the record", "status": "supported", "confidence": 0.8}).json()
    link = client.post(f"/api/claims/{claim['id']}/evidence", json={"evidence_id": ev["id"], "stance": "supports"})
    assert link.status_code == 200
    up = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Interview notes"}, files={"file": ("notes.txt", b"Exact interview note.\n", "text/plain")})
    assert up.status_code == 200
    doc = up.json()

    r = client.get(f"/api/investigations/{inv}/export")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/zip")
    manifest, records = inspect_export(r.content)
    assert manifest["format"] == "journalism-workbench-investigation"
    assert manifest["investigation"]["id"] == inv
    assert manifest["record_counts"]["entities"] >= 1
    assert manifest["record_counts"]["evidence"] >= 1
    assert manifest["record_counts"]["document_chunks"] >= 1
    assert records["statements"][0]["origin"] == "https://example.test/company"

    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        assert "data/entities.ftm.jsonl" in zf.namelist()
        ftm = [json.loads(x) for x in zf.read("data/entities.ftm.jsonl").decode().splitlines() if x.strip()]
        assert any(x["id"] == ent["ftm_id"] and x["schema"] == "Company" for x in ftm)
        raw_entry = next(x for x in manifest["document_files"] if x["document_id"] == doc["id"])
        assert zf.read(raw_entry["archive_path"]) == b"Exact interview note.\n"


def test_portable_backup_restores_into_fresh_database(tmp_path):
    inv = new_inv("Restore case")
    client.post("/api/entities", json={"investigation_id": inv, "schema": "Person", "caption": "Jane Reporter", "properties": {"name": ["Jane Reporter"]}})
    up = client.post("/api/documents/upload", data={"investigation_id": inv}, files={"file": ("restore.txt", b"Restorable source text.", "text/plain")})
    assert up.status_code == 200

    with SessionLocal() as src_db:
        package, manifest = build_investigation_export(src_db, inv, include_documents=True)

    engine = create_engine(f"sqlite:///{tmp_path / 'restored.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    FreshSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    storage = tmp_path / "restored-documents"
    with FreshSession() as db:
        result = restore_investigation_export(db, package, storage)
        assert result["investigation_id"] == inv
        assert db.get(Investigation, inv).name == "Restore case"
        entities = db.scalars(select(Entity).where(Entity.investigation_id == inv)).all()
        documents = db.scalars(select(Document).where(Document.investigation_id == inv)).all()
        chunks = db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == documents[0].id)).all()
        assert len(entities) == 1
        assert len(documents) == 1 and Path(documents[0].storage_path).read_bytes() == b"Restorable source text."
        assert chunks and "Restorable source text" in chunks[0].text


def test_backup_inspection_rejects_tampering():
    inv = new_inv("Tamper case")
    with SessionLocal() as db:
        package, _ = build_investigation_export(db, inv)
    raw = bytearray(package)
    raw[-10] ^= 1
    try:
        inspect_export(bytes(raw))
    except ValueError:
        pass
    else:
        raise AssertionError("Tampered backup should not validate")


def test_legacy_relationship_evidence_backup_normalization():
    from app.services.exports import _normalize_legacy_relationship_evidence
    records = {
        "relationship_edges": [{"id": "rel-1", "evidence_id": "ev-1", "created_at": "2026-01-01T00:00:00"}],
        "relationship_evidence_attachments": [],
    }
    _normalize_legacy_relationship_evidence(records)
    assert "evidence_id" not in records["relationship_edges"][0]
    assert records["relationship_evidence_attachments"][0]["relationship_edge_id"] == "rel-1"
    assert records["relationship_evidence_attachments"][0]["evidence_id"] == "ev-1"
    _normalize_legacy_relationship_evidence(records)
    assert len(records["relationship_evidence_attachments"]) == 1
