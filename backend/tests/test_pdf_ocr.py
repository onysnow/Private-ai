from pathlib import Path
from PIL import Image, ImageDraw
import sys
sys.path.insert(0, '/mnt/data/jw023/backend')
from app.services.pdf_ocr import extract_pdf_chunks


def make_scan(path: Path, text: str):
    image = Image.new('RGB', (1600, 600), 'white')
    draw = ImageDraw.Draw(image)
    draw.text((80, 160), text, fill='black')
    image.save(path, 'PDF', resolution=180)


def test_image_only_pdf_uses_ocr(tmp_path):
    p = tmp_path / 'scan.pdf'
    make_scan(p, 'NiSource announced a new infrastructure program on August 12, 2026.')
    result = extract_pdf_chunks(p)
    assert result.ocr_pages == 1
    assert result.native_pages == 0
    assert result.blank_pages == 0
    assert result.chunks[0]['locator'] == 'page 1 (OCR)'
    assert 'NiSource announced a new infrastructure program' in result.chunks[0]['text']


def test_native_pdf_does_not_get_reclassified_as_ocr(tmp_path):
    import fitz
    p = tmp_path / 'native.pdf'
    doc = fitz.open(); page = doc.new_page(); page.insert_text((72,72), 'This is native searchable PDF text with enough characters for extraction.'); doc.save(p); doc.close()
    result = extract_pdf_chunks(p)
    assert result.native_pages == 1
    assert result.ocr_pages == 0
    assert result.chunks[0]['locator'] == 'page 1'
