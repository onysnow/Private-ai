"""Passphrase-protected backups (ADR-0015; research Keep §8): the whole archive sealed with AES-256-GCM under a key
made from the passphrase with scrypt; a wrong passphrase or a changed byte fails cleanly with a plain 400; old,
unprotected backups still restore; the passphrase never reaches a log, the outbound log or the backup record."""

import logging
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.session import Base, SessionLocal
from app.main import app
from app.models.domain import BackupEvent, Document, Investigation, OutboundRequest
from app.services.backup_crypto import MAGIC, PASSPHRASE_REQUIRED, PASSPHRASE_WRONG, BackupPassphraseError, is_sealed, seal, unseal
from app.services.exports import build_investigation_export, inspect_export, restore_investigation_export
from app.services.lifecycle import delete_investigation

client = TestClient(app)
PASSPHRASE = "harbour-lamp-violet-41"


def _case(name: str = "Harbour land") -> str:
    reply = client.post("/api/investigations", json={"name": name})
    assert reply.status_code == 200, reply.text
    inv = reply.json()["id"]
    up = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Lease"},
                     files={"file": ("lease.txt", b"The harbour lease was signed in 2019.\n", "text/plain")})
    assert up.status_code == 200, up.text
    return inv


def _fresh_session(tmp_path: Path):
    engine = create_engine(f"sqlite:///{tmp_path / 'restored.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def test_seal_round_trip_and_container_header():
    sealed = seal(b"archive bytes", PASSPHRASE)
    assert sealed.startswith(MAGIC) and sealed[len(MAGIC)] == 1 and is_sealed(sealed)
    assert b"archive bytes" not in sealed
    assert unseal(sealed, PASSPHRASE) == b"archive bytes"
    # A fresh salt and nonce every time: the same archive never seals to the same bytes.
    assert seal(b"archive bytes", PASSPHRASE) != sealed
    # An unprotected archive passes through untouched, with or without a passphrase.
    assert unseal(b"PK\x03\x04plain", None) == b"PK\x03\x04plain" == unseal(b"PK\x03\x04plain", "ignored")


def test_protected_backup_round_trips_through_a_fresh_database(tmp_path):
    inv = _case("Protected round trip")
    with SessionLocal() as db:
        package, manifest = build_investigation_export(db, inv, include_documents=True, passphrase=PASSPHRASE)
    assert is_sealed(package) and b"harbour lease" not in package
    sealed_manifest, records = inspect_export(package, PASSPHRASE)
    assert sealed_manifest["checksums"] == manifest["checksums"] and records["investigations"][0]["id"] == inv
    with _fresh_session(tmp_path)() as db:
        result = restore_investigation_export(db, package, tmp_path / "docs", PASSPHRASE)
        assert result["investigation_id"] == inv and db.get(Investigation, inv).name == "Protected round trip"
        doc = db.scalars(select(Document).where(Document.investigation_id == inv)).one()
        assert Path(doc.storage_path).read_bytes() == b"The harbour lease was signed in 2019.\n"


def test_wrong_or_missing_passphrase_and_tampering_fail_cleanly(tmp_path):
    inv = _case("Wrong passphrase")
    with SessionLocal() as db:
        package, _ = build_investigation_export(db, inv, passphrase=PASSPHRASE)
    for passphrase, message in ((None, PASSPHRASE_REQUIRED), ("", PASSPHRASE_REQUIRED), ("harbour-lamp-violet-42", PASSPHRASE_WRONG)):
        try:
            inspect_export(package, passphrase)
        except BackupPassphraseError as exc:
            assert str(exc) == message
        else:
            raise AssertionError("A protected backup opened without its passphrase")
    for at in (len(MAGIC) + 3, len(package) // 2, len(package) - 1):  # the salt, the ciphertext, the tag
        changed = bytearray(package)
        changed[at] ^= 1
        try:
            inspect_export(bytes(changed), PASSPHRASE)
        except BackupPassphraseError as exc:
            assert str(exc) == PASSPHRASE_WRONG
        else:
            raise AssertionError("A changed protected backup opened")
    try:
        inspect_export(package[:len(MAGIC) + 20], PASSPHRASE)
    except BackupPassphraseError as exc:
        assert str(exc) == PASSPHRASE_WRONG
    else:
        raise AssertionError("A cut-off protected backup opened")
    with _fresh_session(tmp_path)() as db:
        try:
            restore_investigation_export(db, package, tmp_path / "docs", "not it")
        except BackupPassphraseError:
            pass
        else:
            raise AssertionError("Restore went ahead with a wrong passphrase")
        assert db.get(Investigation, inv) is None


def test_back_up_now_with_a_passphrase_records_it_as_protected_and_restore_asks_for_it(tmp_path, monkeypatch, caplog):
    caplog.set_level(logging.DEBUG)
    audit = tmp_path / "audit.jsonl"
    monkeypatch.setattr(app.state.audit_logger, "path", audit)
    monkeypatch.setattr(settings, "enable_restore_api", True)
    inv = _case("Back up protected")

    reply = client.post(f"/api/investigations/{inv}/safety/backup", json={"passphrase": PASSPHRASE})
    assert reply.status_code == 200, reply.text
    assert reply.headers["x-jw-backup-protected"] == "true" and is_sealed(reply.content)
    backups = client.get(f"/api/investigations/{inv}/safety").json()["stores"]["backups"]
    assert backups["count"] == 1 and backups["encrypted"] is True and backups["last_size_bytes"] == len(reply.content)

    files = {"file": ("investigation.jwbackup.zip", reply.content, "application/zip")}
    for path in ("/api/backups/inspect", "/api/backups/preview", "/api/backups/restore"):
        missing = client.post(path, files=files)
        assert missing.status_code == 400 and missing.json()["detail"] == PASSPHRASE_REQUIRED
        wrong = client.post(path, files=files, data={"passphrase": "harbour-lamp-violet-42"})
        assert wrong.status_code == 400 and wrong.json()["detail"] == PASSPHRASE_WRONG
    preview = client.post("/api/backups/preview", files=files, data={"passphrase": PASSPHRASE})
    assert preview.status_code == 200 and preview.json()["investigation"]["id"] == inv

    with SessionLocal() as db:
        delete_investigation(db, inv, settings.document_storage_dir, confirmation=inv)
    restored = client.post("/api/backups/restore", files=files, data={"passphrase": PASSPHRASE})
    assert restored.status_code == 200, restored.text
    assert restored.json()["investigation_id"] == inv

    # Never in a log line, the security audit log, the outbound log or the backup record.
    assert all(PASSPHRASE not in record.getMessage() and PASSPHRASE not in str(record.__dict__) for record in caplog.records)
    assert PASSPHRASE not in (audit.read_text() if audit.exists() else "")
    with SessionLocal() as db:
        assert all(PASSPHRASE not in row.value_sent for row in db.scalars(select(OutboundRequest)))
        assert all(PASSPHRASE not in str(vars(row)) for row in db.scalars(select(BackupEvent)))


def test_saving_without_a_passphrase_is_a_choice_and_old_backups_still_restore(tmp_path):
    inv = _case("Unprotected")
    reply = client.post(f"/api/investigations/{inv}/safety/backup")
    assert reply.status_code == 200 and reply.headers["x-jw-backup-protected"] == "false" and reply.content[:2] == b"PK"
    assert client.get(f"/api/investigations/{inv}/safety").json()["stores"]["backups"]["encrypted"] is False
    explicit = client.post(f"/api/investigations/{inv}/safety/backup", json={"passphrase": None})
    assert explicit.status_code == 200 and explicit.content[:2] == b"PK"
    assert client.post(f"/api/investigations/{inv}/safety/backup", json={"passphrase": "   "}).status_code == 400
    files = {"file": ("old.jwbackup.zip", reply.content, "application/zip")}
    # An unprotected backup opens as before, and a passphrase sent with it is ignored.
    for data in (None, {"passphrase": "anything"}):
        preview = client.post("/api/backups/preview", files=files, data=data)
        assert preview.status_code == 200, preview.text
    with _fresh_session(tmp_path)() as db:
        assert restore_investigation_export(db, reply.content, tmp_path / "docs")["investigation_id"] == inv
