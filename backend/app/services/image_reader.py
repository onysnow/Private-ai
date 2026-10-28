"""Pictures as documents (before-and-after images; design doc "All 19 visual
types": data "evidence image attachments").

An uploaded PNG or JPEG is kept as the picture it is and read for any
text in it with the same OCR the Workbench runs on scanned PDF pages
(PyMuPDF + Tesseract, app/services/pdf_ocr.py), so the words in a
screenshot or a captioned satellite image are searchable and quotable. The
picture's kind is read from its bytes with Pillow, never taken from the
file name or the type the browser sent; a file that does not open as one of
the two is refused. WebP is not taken: OpenAleph's ingest does not read it
(app/services/openaleph_formats.py), and the Workbench reads nothing
OpenAleph cannot (ADR-0006). A picture with no text in it is complete, with a note.
"""

from __future__ import annotations

import io
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.documents import Document

# The kinds browsers show as <img>, Word and PowerPoint hold as pictures, and OpenAleph reads.
IMAGE_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg"})
IMAGE_FORMATS = {"PNG": "image/png", "JPEG": "image/jpeg"}


class NotAPicture(ValueError):
    """The file does not open as a PNG or JPEG picture."""


@dataclass(frozen=True)
class Picture:
    format: str        # Pillow's name: PNG, JPEG or WEBP
    mime_type: str
    width: int
    height: int


def picture_of(data: bytes) -> Picture:
    """What the bytes are, read by Pillow: a picture of a kind the app
    shows, or NotAPicture. Pillow's decompression-bomb guard applies."""
    from PIL import Image, UnidentifiedImageError

    try:
        with Image.open(io.BytesIO(data)) as image:
            kind, size = image.format, image.size
            image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError) as exc:
        raise NotAPicture(f"the file does not open as a picture ({exc.__class__.__name__})") from exc
    if kind not in IMAGE_FORMATS:
        raise NotAPicture(f"a {kind} picture is not one the app shows; upload a PNG or a JPEG")
    return Picture(kind, IMAGE_FORMATS[kind], size[0], size[1])


def picture_png(data: bytes) -> bytes:
    """The picture as a PNG (MuPDF reads it as a one-page document)."""
    from PIL import Image

    with Image.open(io.BytesIO(data)) as image:
        out = io.BytesIO()
        image.save(out, format="PNG")
        return out.getvalue()


def extract_image_chunks(path: Path, *, enable_ocr: bool, language: str, dpi: int) -> tuple[list[dict], list[str]]:
    """(chunks, issues) for a picture: the text OCR reads in it, located
    "image (OCR)", or a note that none was read. Raises NotAPicture."""
    from app.services.pdf_ocr import extract_pdf_chunks

    data = path.read_bytes()
    picture = picture_of(data)
    if not enable_ocr:
        return [], ["Text in pictures is not read here (OCR is switched off); the picture is kept as it is."]
    import pymupdf

    # Every picture goes to MuPDF as a PNG, as one page.
    with pymupdf.open(stream=picture_png(data), filetype="png") as image:
        pdf = image.convert_to_pdf()
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "picture.pdf"
        page.write_bytes(pdf)
        result = extract_pdf_chunks(page, enable_ocr=True, language=language, dpi=dpi, min_native_chars=1)
    chunks = [{"locator": "image (OCR)", "page_number": None, "text": chunk["text"]} for chunk in result.chunks]
    issues: list[str] = []
    if result.ocr_error:
        issues.append(f"The text in this picture could not be read: {result.ocr_error}. The picture is kept as it is.")
    elif not chunks:
        issues.append(f"No text was read in this picture ({picture.width} x {picture.height}); it is kept as a picture.")
    return chunks, issues


def stored_picture(storage_path: str, storage_root: Path) -> tuple[bytes, Picture]:
    """A picture document's bytes and what they are. The stored path must
    lie inside the storage root (app/services/security.py contained_path);
    raises NotAPicture for a document that is not a picture, OSError for a
    file that is gone."""
    root = storage_root.resolve()
    path = Path(storage_path).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise OSError("the stored file lies outside the document storage") from exc
    data = path.read_bytes()
    return data, picture_of(data)


def shown_path(db: Session, document: Document) -> str:
    """The file the app shows for a picture document: for a HEIC or RAW photo, its viewable copy (a derived file,
    app/services/photos.py) once the reading job has made it; for any other document, its own file."""
    from app.services.photos import is_photo

    if is_photo(document.filename):
        from app.services.derived_files import latest

        copy = latest(db, document.id, "preview")
        if copy is not None:
            return str(copy.storage_path)
    return str(document.storage_path)


def investigation_picture(investigation_id: str, document_id: str | None) -> tuple[bytes, Picture] | str:
    """A picture for an export, as its bytes and what it is, or why there is
    none. Only a picture document of the export's own investigation is read:
    a stored slide or brief names its pictures by id, and that id is not
    trusted on its own."""
    from app.core.config import settings
    from app.db.session import SessionLocal
    from app.models.domain import Document
    from app.services.security import resolve_storage_root

    if not document_id:
        return "no picture is named"
    with SessionLocal() as db:
        document = db.get(Document, document_id)
        if document is None or document.investigation_id != investigation_id:
            return "the picture is not a document of this investigation"
        storage_path = shown_path(db, document)
    try:
        data, picture = stored_picture(storage_path, resolve_storage_root(settings.document_storage_dir))
    except NotAPicture as exc:
        return f"the document is not a picture ({exc})"
    except OSError:
        return "the picture's stored file is not available"
    return data, picture
