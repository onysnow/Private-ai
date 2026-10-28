"""Photos and files made from case files (ADR-0021): a HEIC or camera RAW photo is kept exactly as it came and shown
through a viewable copy made here, a derived file with its edit-trail row; what any photo claims about itself is kept
as claims; a derived file never lands on a case file; and both travel in a backup and go when the case is deleted.

The native module (backend/native) does the reading. CI builds it (backend-postgres-ci.yml): missing there is a failure;
on a computer without it these tests are skipped, except the one that checks the read then fails saying what to run.

Fixtures: tests/fixtures/photos/turned.dng is a 14 KB DNG (a 64 x 48 sensor image and the 160 x 200 JPEG preview a
camera embeds, EXIF orientation 6, i.e. to be turned 90 degrees clockwise, make Testcam, only a "Date/Time Modified");
press.heic is a 449 x 559 HEIC photo whose EXIF carries GPS 3.1417 N, 101.6867 E.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import DerivedFile, Document, DocumentPhoto
from app.services import derived_files, native, photos
from app.services.exports import build_investigation_export, preview_investigation_restore, restore_investigation_export
from app.services.lifecycle import delete_investigation, preview_investigation_deletion

client = TestClient(app)
FIXTURES = Path(__file__).parent / "fixtures" / "photos"
DNG, HEIC = FIXTURES / "turned.dng", FIXTURES / "press.heic"


@pytest.fixture(autouse=True)
def storage(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "documents"))


@pytest.fixture
def module():
    if not native.available():
        if os.environ.get("CI"):
            raise AssertionError("CI builds the native module (backend-postgres-ci.yml); it is missing")
        pytest.skip("the native module is not built here")
    return native.native()


def _case(name: str = "Photos") -> str:
    return client.post("/api/investigations", json={"name": name}).json()["id"]


def _upload(inv: str, name: str, data: bytes, mime: str = "application/octet-stream") -> dict:
    r = client.post("/api/documents/upload", data={"investigation_id": inv, "title": name}, files={"file": (name, data, mime)})
    return {"status": r.status_code, **r.json()}


def _jpeg(size=(120, 90), exif: dict | None = None) -> bytes:
    from PIL import Image

    image = Image.new("RGB", size, (90, 120, 160))
    out = io.BytesIO()
    e = Image.Exif()
    for k, v in (exif or {}).items():
        e[k] = v
    image.save(out, format="JPEG", exif=e.tobytes())
    return out.getvalue()


def test_photos_are_known_by_their_extension():
    assert photos.is_photo("IMG_1361.DNG") and photos.is_photo("x.heic") and photos.is_photo("B13A0729.cr2")
    assert not photos.is_photo("x.jpg") and not photos.is_photo(None)


def test_a_raw_photo_is_kept_as_it_came_and_shown_through_a_turned_copy(module):
    from PIL import Image

    inv = _case()
    original = DNG.read_bytes()
    doc = _upload(inv, "turned.dng", original)
    assert doc["status"] == 200 and doc["extraction_status"] == "complete", doc
    with SessionLocal() as db:
        stored = db.get(Document, doc["id"])
        assert Path(stored.storage_path).read_bytes() == original and stored.sha256 == hashlib.sha256(original).hexdigest()
        copy = db.scalars(select(DerivedFile).where(DerivedFile.document_id == doc["id"])).one()
        assert copy.operation == "preview" and copy.parent_sha256 == stored.sha256 and copy.parent_id is None
        assert copy.tool == native.LIGHTCRAFT and copy.mime_type == "image/jpeg"
        assert copy.params["source"] == "the camera's embedded preview" and copy.params["raw_format"] == "Dng"
        kept = Path(copy.storage_path).read_bytes()
        assert hashlib.sha256(kept).hexdigest() == copy.sha256 and copy.size == len(kept)
        assert Path(copy.storage_path).parent.parts[-3:] == (inv, "derived", doc["id"])
        claims = db.get(DocumentPhoto, doc["id"])
        assert claims.kind == "DNG" and claims.claims["make"] == "Testcam" and claims.claims["orientation"] == 6
        # The file has only a modified date: the claim says so instead of passing it off as when it was taken.
        assert claims.date_tag == "Date/Time Modified" and claims.tool == native.LIGHTCRAFT
        issues = stored.extraction_issues
    assert issues[0].startswith("Shown and read from a viewable copy (the camera's embedded preview); the DNG file")

    shown = client.get(f"/api/documents/{doc['id']}/picture")
    assert shown.status_code == 200 and shown.headers["content-type"] == "image/jpeg" and shown.content == kept
    # The preview is stored 160 x 200 and the file says to turn it: the copy is shown turned.
    assert Image.open(io.BytesIO(shown.content)).size == (200, 160)


def test_a_heic_photo_is_decoded_and_its_gps_kept_as_a_claim(module):
    from PIL import Image

    doc = _upload(_case("HEIC"), "press.heic", HEIC.read_bytes(), "image/heic")
    assert doc["status"] == 200 and doc["extraction_status"] == "complete", doc
    with SessionLocal() as db:
        claims = db.get(DocumentPhoto, doc["id"])
        assert claims.kind == "HEIC" and claims.claims["model"] == "Test Phone"
        assert round(claims.claims["gps"]["latitude"], 4) == 3.1417 and round(claims.claims["gps"]["longitude"], 4) == 101.6867
        copy = db.scalars(select(DerivedFile).where(DerivedFile.document_id == doc["id"])).one()
        assert copy.params["source"] == "decoded" and copy.params["bit_depth"] == 8
    shown = client.get(f"/api/documents/{doc['id']}/picture")
    assert shown.status_code == 200 and Image.open(io.BytesIO(shown.content)).size == (449, 559)


def test_a_jpeg_keeps_what_it_claims_and_needs_no_copy(module):
    doc = _upload(_case("JPEG"), "board.jpg", _jpeg(exif={0x010F: "Fernhill", 0x0110: "Cam 2"}), "image/jpeg")
    assert doc["status"] == 200 and doc["extraction_status"] == "complete", doc
    with SessionLocal() as db:
        claims = db.get(DocumentPhoto, doc["id"])
        assert claims.kind == "JPEG" and claims.claims["make"] == "Fernhill" and claims.date_tag is None
        assert db.scalars(select(DerivedFile).where(DerivedFile.document_id == doc["id"])).first() is None


def test_a_file_that_is_not_the_raw_photo_its_name_says_fails_the_read(module):
    doc = _upload(_case("Fake"), "holiday.cr2", b"not a raw file at all")
    assert doc["status"] == 422 and "does not open as a camera RAW photo" in doc["detail"]["error"]


def test_without_the_native_module_the_read_fails_saying_what_to_run(monkeypatch):
    def missing():
        raise native.NativeUnavailable(native.SETUP_HINT)

    monkeypatch.setattr(photos, "native", missing)
    doc = _upload(_case("No module"), "turned.dng", DNG.read_bytes())
    assert doc["status"] == 422 and "pip install ./backend/native" in doc["detail"]["error"]


def test_a_derived_file_is_never_written_over_its_case_file(module, monkeypatch):
    doc = _upload(_case("Overwrite"), "turned.dng", DNG.read_bytes())
    with SessionLocal() as db:
        stored = db.get(Document, doc["id"])
        root = Path(stored.storage_path).parent
        # Point the derived folder at the case file's own folder: the same bytes under the same name would land on it.
        monkeypatch.setattr(derived_files, "derived_folder", lambda *_: root)
        with pytest.raises(derived_files.WouldOverwrite):
            derived_files.write_derived(db, document=stored, data=DNG.read_bytes(), filename="turned.dng",
                                        mime_type="image/x-adobe-dng", operation="preview", params={}, tool="test")
        assert Path(stored.storage_path).read_bytes() == DNG.read_bytes()


def test_photos_and_their_derived_files_travel_in_a_backup_and_go_with_the_case(module):
    inv = _case("Backed up")
    doc = _upload(inv, "turned.dng", DNG.read_bytes())
    with SessionLocal() as db:
        copy = db.scalars(select(DerivedFile).where(DerivedFile.document_id == doc["id"])).one()
        copy_id, copy_path, copy_sha = copy.id, Path(copy.storage_path), copy.sha256
        kept = copy_path.read_bytes()
        data, manifest = build_investigation_export(db, inv)
        assert manifest["record_counts"]["derived_files"] == 1 and manifest["record_counts"]["document_photos"] == 1
        assert [e["sha256"] for e in manifest["derived_file_entries"]] == [copy_sha]
        assert preview_investigation_deletion(db, inv, settings.document_storage_dir)["derived_file_count"] == 1
        delete_investigation(db, inv, settings.document_storage_dir, confirmation=inv)
        assert not copy_path.exists() and db.get(DocumentPhoto, doc["id"]) is None
        preview = preview_investigation_restore(db, data, Path(settings.document_storage_dir))
        assert preview["can_restore"] and preview["derived_file_count"] == 1
        restore_investigation_export(db, data, Path(settings.document_storage_dir))
        restored = db.get(DerivedFile, copy_id)
        assert Path(restored.storage_path).read_bytes() == kept and db.get(DocumentPhoto, doc["id"]).claims["make"] == "Testcam"
    assert client.get(f"/api/documents/{doc['id']}/picture").content == kept


def test_a_backup_whose_derived_file_was_altered_is_refused(module):
    import zipfile

    inv = _case("Tampered")
    _upload(inv, "turned.dng", DNG.read_bytes())
    with SessionLocal() as db:
        data, manifest = build_investigation_export(db, inv)
        delete_investigation(db, inv, settings.document_storage_dir, confirmation=inv)
        entry = manifest["derived_file_entries"][0]
        out = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(data)) as src, zipfile.ZipFile(out, "w") as dst:
            for item in src.infolist():
                raw = src.read(item.filename)
                if item.filename == "manifest.json":
                    m = json.loads(raw)
                    m["derived_file_entries"][0]["sha256"] = "0" * 64
                    raw = json.dumps(m).encode()
                dst.writestr(item, raw)
        preview = preview_investigation_restore(db, out.getvalue(), Path(settings.document_storage_dir))
        assert not preview["can_restore"]
        assert any("does not match the SHA-256 its edit trail recorded" in c["message"] for c in preview["conflicts"])
        assert entry["archive_path"].startswith("derived/")


def test_pdf_tools_never_write_over_the_file_they_opened(module, tmp_path):
    import pymupdf

    work = tmp_path / "work"
    work.mkdir()
    pdf = pymupdf.open()
    pdf.new_page().insert_text((72, 100), "Transfer to account 2112022011906 approved by Jho Low.")
    pdf.save(work / "memo.pdf")
    before = (work / "memo.pdf").read_bytes()
    session = module.pdf.PdfSession(str(work))
    session.call("doc_open", json.dumps({"path": "memo.pdf"}))
    session.call("redact_mark", json.dumps({"doc": 1, "words": ["2112022011906"]}))
    session.call("redact_apply", json.dumps({"doc": 1}))
    with pytest.raises(ValueError, match="never written over"):
        session.call("doc_save", json.dumps({"doc": 1}))
    with pytest.raises(RuntimeError, match="outside the allowed directory"):
        session.call("doc_open", json.dumps({"path": str(tmp_path / "elsewhere.pdf")}))
    session.call("doc_save", json.dumps({"doc": 1, "path": "memo-redacted.pdf", "full": True}))
    assert (work / "memo.pdf").read_bytes() == before
    text = pymupdf.open(work / "memo-redacted.pdf")[0].get_text()
    assert "2112022011906" not in text and "Jho Low" in text


def test_two_recordings_of_one_event_are_lined_up(module):
    import numpy as np

    rng = np.random.default_rng(7)
    rate = 16000
    event = rng.standard_normal(rate * 6).astype(np.float32) * 0.3
    offset = int(1.234 * rate)
    found = module.audio.find_offset(event, event[offset:].copy(), rate)
    assert found["reliable"] and abs(found["lag_seconds"] - 1.234) < 0.001
    hum = (0.2 * np.sin(2 * np.pi * 50 * np.arange(rate * 2) / rate)).astype(np.float32)
    cleaned = module.audio.process("dehum", hum[None, :], float(rate))[0]
    assert np.abs(cleaned[rate:]).max() < 0.02  # the 50 Hz hum is gone once the filter has settled
