"""A photo's tools (app/services/photo_tools.py, mockup MEDIA_1): copies made with faces blurred, metadata removed,
cropped, an area redacted with its reason, or turned, each a new file with its trail row, made from the photo or from
another copy; faces found by a detector only; the photo itself never written."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import DerivedFile, Document
from app.services import photo_tools

client = TestClient(app)


@pytest.fixture(autouse=True)
def storage(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "documents"))


def _photo(size=(200, 100)) -> tuple[str, str]:
    image = Image.new("RGB", size, (200, 200, 200))
    exif = Image.Exif()
    exif[0x010F] = "Fernhill"  # make
    exif[0x0131] = "PhotoEdit 2"  # software
    out = io.BytesIO()
    image.save(out, "JPEG", exif=exif.tobytes(), quality=95)
    inv = client.post("/api/investigations", json={"name": "Picture"}).json()["id"]
    r = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "fence.jpg"},
                    files={"file": ("fence.jpg", out.getvalue(), "image/jpeg")})
    assert r.status_code == 200, r.text
    return inv, r.json()["id"]


def _copy(doc: str, operation: str, params: dict | None = None, from_id: str | None = None):
    return client.post(f"/api/documents/{doc}/derived/photo", json={"operation": operation, "params": params or {}, "from_id": from_id})


def _image(row: dict) -> Image.Image:
    with SessionLocal() as db:
        return Image.open(io.BytesIO(Path(db.get(DerivedFile, row["id"]).storage_path).read_bytes()))


def test_copies_are_new_files_with_their_trail_and_the_photo_is_never_written():
    _inv, doc = _photo()
    with SessionLocal() as db:
        original = db.get(Document, doc)
        before = Path(original.storage_path).read_bytes()
    stripped = _copy(doc, "strip_metadata")
    assert stripped.status_code == 201, stripped.text
    assert not _image(stripped.json()).getexif()
    turned = _copy(doc, "turn", {"degrees": 90}, from_id=stripped.json()["id"])
    assert turned.status_code == 201 and turned.json()["parent_id"] == stripped.json()["id"]
    assert _image(turned.json()).size == (100, 200)
    cropped = _copy(doc, "crop", {"box": {"x": 0.5, "y": 0, "w": 0.5, "h": 1}}).json()
    assert _image(cropped).size == (100, 100) and _image(cropped).getexif()[0x010F] == "Fernhill"
    with SessionLocal() as db:
        assert Path(db.get(Document, doc).storage_path).read_bytes() == before
    trail = client.get(f"/api/documents/{doc}/derived").json()
    assert [(r["operation"], r["parent_id"] is not None) for r in trail] == [("strip_metadata", False), ("turn", True), ("crop", False)]
    assert trail[0]["params"]["removed"].startswith("EXIF")


def test_a_redaction_needs_a_reason_and_blacks_out_its_box():
    _inv, doc = _photo()
    refused = _copy(doc, "redact", {"box": {"x": 0.1, "y": 0.1, "w": 0.2, "h": 0.2}})
    assert refused.status_code == 422 and "Say why" in refused.json()["detail"]
    made = _copy(doc, "redact", {"box": {"x": 0.1, "y": 0.1, "w": 0.2, "h": 0.2}, "reason": "a private person's car plate"}).json()
    picture = _image(made).convert("RGB")
    assert max(picture.getpixel((40, 20))) < 30 and min(picture.getpixel((150, 80))) > 150
    assert made["params"]["reason"] == "a private person's car plate"
    off = _copy(doc, "crop", {"box": {"x": 1.2, "y": 0, "w": 0.5, "h": 1}})
    assert off.status_code == 422


def test_faces_are_found_by_a_detector_only_and_blurred_where_it_found_them(monkeypatch):
    _inv, doc = _photo()
    monkeypatch.setattr(photo_tools, "find_faces", lambda data, min_score=0.6: [{"x": 0.6, "y": 0.2, "w": 0.2, "h": 0.4, "score": 0.91}])
    found = client.post(f"/api/documents/{doc}/faces").json()
    assert found["faces"] == [{"x": 0.6, "y": 0.2, "w": 0.2, "h": 0.4, "score": 0.91}] and "YuNet" in found["model"]
    nothing = client.get(f"/api/documents/{doc}/photo").json()
    assert nothing["claims"].get("make") in (None, "Fernhill") and nothing["text"] == []
    blurred = _copy(doc, "blur_faces", {"radius": 12}).json()
    assert blurred["params"]["regions"] == 1 and blurred["model_sha256"] == photo_tools.FACE_MODEL[2]
    monkeypatch.setattr(photo_tools, "find_faces", lambda data, min_score=0.6: [])
    assert _copy(doc, "blur_faces").status_code == 422
