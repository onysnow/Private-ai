from pathlib import Path

from PIL import Image, ImageDraw

from app.services.pdf_ocr import extract_pdf_chunks


def make_scan(path: Path, text: str):
    image = Image.new('RGB', (1600, 600), 'white')
    draw = ImageDraw.Draw(image)
    draw.text((80, 160), text, fill='black')
    image.save(path, 'PDF', resolution=180)


def test_image_only_pdf_uses_ocr(tmp_path):
    p = tmp_path / 'scan.pdf'
    make_scan(p, 'Acme Holdings announced a new infrastructure program on August 12, 2026.')
    result = extract_pdf_chunks(p)
    assert result.ocr_pages == 1
    assert result.native_pages == 0
    assert result.blank_pages == 0
    assert result.chunks[0]['locator'] == 'page 1 (OCR)'
    # OCR can introduce minor whitespace/punctuation noise (word-merging, stray
    # leading marks) depending on font rendering, so check for the key phrases
    # rather than one brittle contiguous exact-spacing string.
    ocr_text = result.chunks[0]['text']
    assert 'Acme Holdings' in ocr_text
    assert 'infrastructure program' in ocr_text


def test_a_scan_with_a_filing_stamp_is_still_read_by_ocr(tmp_path):
    import fitz
    scan = tmp_path / 'scan.pdf'
    make_scan(scan, 'The prosecution proved the funds came from 1MDB on 22 March 2013.')
    p = tmp_path / 'stamped.pdf'
    doc = fitz.open(scan)
    doc[0].insert_text((20, 20), 'WA-45-7-11-2018 filed 26/12/2025 serial 7f3a9c', fontsize=6)
    doc.save(p); doc.close()
    result = extract_pdf_chunks(p)
    assert result.ocr_pages == 1
    assert result.chunks[0]['locator'] == 'page 1 (OCR)'
    assert 'prosecution proved' in result.chunks[0]['text']


def test_native_pdf_does_not_get_reclassified_as_ocr(tmp_path):
    import fitz
    p = tmp_path / 'native.pdf'
    doc = fitz.open(); page = doc.new_page(); page.insert_text((72,72), 'This is native searchable PDF text with enough characters for extraction.'); doc.save(p); doc.close()
    result = extract_pdf_chunks(p)
    assert result.native_pages == 1
    assert result.ocr_pages == 0
    assert result.chunks[0]['locator'] == 'page 1'


def test_pleading_line_numbers_and_the_court_header_are_not_read_as_text():
    from app.services.pdf_ocr import strip_page_furniture
    margin = "\n".join(str(n) for n in range(1, 29))
    page = (f" \n{margin}\nDEBORAH CONNOR, Acting Chief\n1. The defendant is a yacht.\n2. It was bought.\n"
            "Case 2:17-cv-04441-DSF-PLA   Document 1   Filed 06/15/17   Page 4 of 250   Page ID #:4\n")
    out = strip_page_furniture(page)
    assert "DEBORAH CONNOR" in out and "1. The defendant" in out
    assert "\n2\n" not in out and "Page ID" not in out
    # a short numbered list on its own lines is kept
    assert strip_page_furniture("1\n2\n3\nitems") == "1\n2\n3\nitems"
    # the page's own number at the top goes; another number stays
    assert strip_page_furniture(" \n6 \n" + margin + "\nIndirectly, by Symphony", 6) == "Indirectly, by Symphony"
    assert strip_page_furniture("2018 was the year", 6) == "2018 was the year"


def test_each_page_is_told_as_it_is_read(tmp_path):
    import fitz

    from app.services.pdf_ocr import PAGE_PROGRESS
    p = tmp_path / 'two.pdf'
    doc = fitz.open()
    for n in (1, 2):
        doc.new_page().insert_text((72, 72), f'Page {n} of the board minutes, with enough native text to be read without OCR.')
    doc.save(p); doc.close()
    told = []
    token = PAGE_PROGRESS.set(lambda page, total, ocr: told.append((page, total, ocr)))
    try:
        extract_pdf_chunks(p)
    finally:
        PAGE_PROGRESS.reset(token)
    assert told == [(1, 2, False), (2, 2, False)]


def _pleading_pdf(path: Path, pages: int = 2, skip: tuple[int, ...] = ()) -> None:
    """US pleading paper: 1 to 28 down the left margin of every page, the text in a column right of it."""
    import fitz
    doc = fitz.open()
    for n in range(1, pages + 1):
        page = doc.new_page(width=612, height=792)
        for k in range(1, 29):
            if k not in skip:
                page.insert_text((44, 72 + 24 * (k - 1)), str(k), fontsize=11)
        page.insert_text((72, 72), f'The United States brings this complaint, page {n}.', fontsize=11)
        page.insert_text((72, 96), '1. The defendant asset is real property in New York.', fontsize=11)
        page.insert_text((72, 120), '2. It was bought with diverted funds.', fontsize=11)
        page.insert_text((300, 760), str(n), fontsize=11)
    doc.save(path)
    doc.close()


def test_pleading_paper_margin_numbers_are_not_read_as_text(tmp_path):
    p = tmp_path / 'pleading.pdf'
    _pleading_pdf(p)
    result = extract_pdf_chunks(p, enable_ocr=False)
    for n, chunk in enumerate(result.chunks, 1):
        text = chunk['text']
        assert text.startswith(f'The United States brings this complaint, page {n}.'), text[:80]
        assert '1. The defendant asset' in text and '2. It was bought' in text
        assert '\n3\n' not in text and '\n27\n' not in text and '\n28' not in text


def test_page_one_keeps_no_margin_numbers():
    # Page 1's own number is "1": it once took the margin's "1", and the rest (2 to 28) stayed as text.
    from app.services.pdf_ocr import strip_page_furniture
    margin = "\n".join(str(n) for n in range(1, 29))
    assert strip_page_furniture(f" \n \n{margin}\nM. KENDALL DAY, Chief", 1).strip() == "M. KENDALL DAY, Chief"
    assert strip_page_furniture(f"1\n{margin}\nM. KENDALL DAY, Chief", 1).strip() == "M. KENDALL DAY, Chief"


def test_margin_numbers_found_by_position_allow_gaps(tmp_path):
    import fitz

    from app.services.pdf_ocr import margin_line_numbers
    p = tmp_path / 'gaps.pdf'
    _pleading_pdf(p, pages=1, skip=(5, 6, 19))
    with fitz.open(p) as doc:
        found = margin_line_numbers(doc[0])
    assert found == [str(k) for k in range(1, 29) if k not in (5, 6, 19)]
    result = extract_pdf_chunks(p, enable_ocr=False)
    text = result.chunks[0]['text']
    assert text.startswith('The United States brings this complaint, page 1.')
    assert '\n4\n' not in text and '\n20\n' not in text


def test_a_normal_pdf_keeps_its_numbers(tmp_path):
    import fitz

    from app.services.pdf_ocr import _clean, margin_line_numbers
    p = tmp_path / 'normal.pdf'
    doc = fitz.open()
    for n in (1, 2):
        page = doc.new_page(width=612, height=792)
        page.insert_text((72, 72), f'Board minutes, page {n}, with enough native text to be read.', fontsize=11)
        for k in range(1, 8):  # a numbered list, each number on its own line in the text column
            page.insert_text((72, 96 + 20 * k), str(k), fontsize=11)
            page.insert_text((72, 106 + 20 * k), f'Item {k} of the agenda was discussed.', fontsize=11)
        page.insert_text((300, 760), str(n), fontsize=11)  # the page number, at the foot
    doc.save(p)
    doc.close()
    result = extract_pdf_chunks(p, enable_ocr=False)
    with fitz.open(p) as doc:
        assert [margin_line_numbers(page) for page in doc] == [[], []]
        expected = [_clean(page.get_text('text')) for page in doc]
    assert [c['text'] for c in result.chunks] == expected
    assert '\n7\nItem 7' in result.chunks[0]['text'] and result.chunks[1]['text'].endswith('\n2')
