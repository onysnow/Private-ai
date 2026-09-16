from pathlib import Path

import fitz
from fastapi.testclient import TestClient

from app.main import app
from app.services.pdf_ocr import extract_pdf_chunks, ocr_runtime_status


def test_ocr_runtime_reports_requested_language_data():
    status = ocr_runtime_status("eng")
    assert status.available, status.detail
    assert status.requested_languages == ("eng",)
    assert status.missing_languages == ()
    assert status.tessdata
    assert Path(status.tessdata, "eng.traineddata").is_file()


def test_scanned_pdf_ocr_smoke(tmp_path):
    source = fitz.open()
    page = source.new_page(width=500, height=160)
    page.insert_text((36, 80), "Journalism provenance OCR smoke test", fontsize=24)
    pix = page.get_pixmap(dpi=200, alpha=False)

    scanned = fitz.open()
    scanned_page = scanned.new_page(width=500, height=160)
    scanned_page.insert_image(scanned_page.rect, pixmap=pix)
    pdf_path = tmp_path / "scan.pdf"
    scanned.save(pdf_path)
    scanned.close()
    source.close()

    result = extract_pdf_chunks(pdf_path, enable_ocr=True, language="eng", dpi=200, min_native_chars=20)
    assert result.ocr_error is None
    assert result.ocr_pages == 1
    assert result.native_pages == 0
    assert result.blank_pages == 0
    assert result.chunks[0]["locator"] == "page 1 (OCR)"
    assert "Journalism provenance OCR smoke test" in result.chunks[0]["text"]


def test_backend_dockerfile_provisions_ocr_runtime():
    dockerfile = Path(__file__).resolve().parents[1] / "Dockerfile"
    text = dockerfile.read_text(encoding="utf-8")
    assert "tesseract-ocr" in text
    assert "tesseract-ocr-eng" in text
    assert "TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata" in text
    assert "eng.traineddata" in text


def test_settings_status_reports_ocr_runtime():
    response = TestClient(app).get("/api/settings/status")
    assert response.status_code == 200
    extraction = response.json()["document_extraction"]
    assert extraction["pdf_ocr_enabled"] is True
    assert extraction["pdf_ocr_language"] == "eng"
    assert extraction["ocr_runtime"]["available"] is True
    assert extraction["ocr_runtime"]["requested_languages"] == ["eng"]
    assert extraction["ocr_runtime"]["missing_languages"] == []
