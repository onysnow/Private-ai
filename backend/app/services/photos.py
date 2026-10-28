"""Photos the browser cannot show (HEIC and camera RAW), and what any photo says about itself (ADR-0021).

A HEIC or RAW file is kept exactly as it came. The reading job makes a viewable JPEG from it, a derived file with its
trail row (app/services/derived_files.py): for RAW, the preview the camera itself embedded in the file; for HEIC, the
picture decoded. That copy is what the app shows and what OCR reads; the original is what is hashed and exported.

For every photo (JPEG and PNG too) the reading job keeps what the file *claims* about itself, read from its EXIF, XMP
and IPTC by LightCraft's reader: camera, serial number, software, capture time, GPS. A claim is never a finding: files
are edited, platforms strip and rewrite metadata, and camera clocks are wrong. `date_tag` says which tag the capture
time came from, because "Date/Time Modified" alone is much weaker than "Date/Time Original".
"""

from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

from sqlalchemy.orm import Session

from app.services.native import LIGHTCRAFT, NativeUnavailable, native

if TYPE_CHECKING:
    from PIL.Image import Image

    from app.models.documents import Document

logger = logging.getLogger(__name__)

HEIC_EXTENSIONS = frozenset({".heic", ".heif"})
RAW_EXTENSIONS = frozenset({".dng", ".cr2", ".cr3", ".nef", ".nrw", ".arw", ".raf", ".rw2", ".pef", ".orf"})
PHOTO_EXTENSIONS = HEIC_EXTENSIONS | RAW_EXTENSIONS
PREVIEW_QUALITY = 92
DATE_TAGS = ("Date/Time Original", "Date/Time Digitized", "Date/Time Modified")


class NotAPhoto(ValueError):
    """The file does not open as the HEIC or RAW photo its name says."""


def is_photo(filename: str | None) -> bool:
    return Path(filename or "").suffix.lower() in PHOTO_EXTENSIONS


def _jpeg(image: Image) -> bytes:
    out = io.BytesIO()
    image.convert("RGB").save(out, format="JPEG", quality=PREVIEW_QUALITY)
    return out.getvalue()


def _orient(image: Image, orientation: int | None) -> Image:
    """Turn a picture the way its EXIF orientation says (the camera's own preview is stored unturned)."""
    from PIL import Image as PILImage

    ops = {2: [PILImage.Transpose.FLIP_LEFT_RIGHT], 3: [PILImage.Transpose.ROTATE_180], 4: [PILImage.Transpose.FLIP_TOP_BOTTOM],
           5: [PILImage.Transpose.TRANSPOSE], 6: [PILImage.Transpose.ROTATE_270], 7: [PILImage.Transpose.TRANSVERSE],
           8: [PILImage.Transpose.ROTATE_90]}
    for op in ops.get(orientation or 1, []):
        image = image.transpose(op)
    return image


def viewable_copy(path: Path) -> tuple[bytes, dict[str, Any], dict[str, Any]]:
    """(JPEG bytes, how it was made, what the file claims) for a HEIC or RAW file. Raises NotAPhoto."""
    import numpy as np
    from PIL import Image as PILImage
    from PIL import ImageOps

    photo = native().photo
    data = path.read_bytes()
    ext = path.suffix.lower()
    if ext in RAW_EXTENSIONS:
        raw = photo.raw_format(data)
        if raw is None:
            raise NotAPhoto(f"the file does not open as a camera RAW photo ({ext})")
        claims = dict(photo.metadata(data))
        preview = photo.raw_preview(data)
        if preview is None:
            raise NotAPhoto(f"this {raw} file carries no preview picture the app can show")
        with PILImage.open(io.BytesIO(preview)) as image:
            image.load()
            turned = ImageOps.exif_transpose(image) if image.getexif().get(0x0112) else _orient(image, claims.get("orientation"))
            how: dict[str, Any] = {"source": "the camera's embedded preview", "raw_format": raw, "width": turned.width,
                   "height": turned.height, "format": "JPEG", "quality": PREVIEW_QUALITY}
            return _jpeg(turned), how, {**claims, "kind": raw.upper()}
    try:
        pixels, bits, exif = photo.decode_heic(data)
    except ValueError as exc:
        raise NotAPhoto(f"the file does not open as a HEIC photo ({exc})") from exc
    claims = dict(photo.metadata_from_exif(exif)) if exif else {}
    scale = 257 if pixels.max() > 255 else 1
    rgb = (np.asarray(pixels[..., :3]) // scale).astype("uint8")
    decoded = PILImage.fromarray(rgb, "RGB")
    how = {"source": "decoded", "bit_depth": bits, "width": decoded.width, "height": decoded.height,
           "format": "JPEG", "quality": PREVIEW_QUALITY}
    return _jpeg(decoded), how, {**claims, "kind": "HEIC"}


def date_tag_of(data: bytes) -> str | None:
    """The strongest date tag the file has, by name."""
    names = {name for _group, name, _value in native().photo.tags(data)}
    return next((t for t in DATE_TAGS if t in names), None)


def keep_claims(db: Session, document: Document, claims: dict[str, Any], date_tag: str | None) -> None:
    from app.models.derived import DocumentPhoto

    kind = claims.pop("kind", None) or Path(document.filename).suffix.lstrip(".").upper()
    db.merge(DocumentPhoto(document_id=document.id, investigation_id=document.investigation_id, kind=kind[:16],
                           width=claims.get("width"), height=claims.get("height"), claims=claims, date_tag=date_tag,
                           tool=LIGHTCRAFT))
    db.commit()


def record_claims(db: Session, document_id: str) -> None:
    """After a JPEG or PNG is read: keep what it claims about itself. Never fails the read."""
    from app.models.domain import Document

    doc = db.get(Document, document_id)
    if doc is None:
        return
    try:
        data = Path(doc.storage_path).read_bytes()
        claims = dict(native().photo.metadata(data))
        keep_claims(db, doc, {**claims, "kind": Path(doc.filename).suffix.lstrip(".").upper().replace("JPG", "JPEG")},
                    date_tag_of(data))
    except NativeUnavailable:
        return
    except Exception:  # what a file claims is extra; a picture that reads is never failed for it
        db.rollback()
        logger.exception("could not read the photo metadata of %s", document_id)


def read_photo_document(db: Session, document_id: str, report: Callable[[int | None, str | None], None],
                        *, job_id: str | None = None) -> str:
    """The reading job for a HEIC or RAW photo: make the viewable copy, keep what the file claims, then read any text
    in the copy with OCR like any picture. A failure marks the document failed with the reason and raises."""
    from app.core.config import settings
    from app.models.domain import Document
    from app.services.derived_files import write_derived
    from app.services.documents import extract_document
    from app.services.image_reader import extract_image_chunks
    from app.services.transcription import _fail

    doc = db.get(Document, document_id)
    if doc is None:
        return "The document was deleted before it was read"
    report(10, "Making a viewable copy")
    path = Path(doc.storage_path)
    try:
        jpeg, how, claims = viewable_copy(path)
    except (NativeUnavailable, NotAPhoto) as exc:
        _fail(db, document_id, str(exc))
        raise
    copy = write_derived(db, document=doc, data=jpeg, filename=f"{path.stem}.jpg", mime_type="image/jpeg",
                         operation="preview", params=how, tool=LIGHTCRAFT, job_id=job_id)
    try:
        keep_claims(db, doc, dict(claims), date_tag_of(path.read_bytes()))
    except Exception:
        db.rollback()
        logger.exception("could not keep the photo metadata of %s", document_id)
    report(50, "Reading any text in the picture")
    chunks, issues = extract_image_chunks(Path(copy.storage_path), enable_ocr=settings.enable_pdf_ocr,
                                          language=settings.pdf_ocr_language, dpi=settings.pdf_ocr_dpi)
    issues = [f"Shown and read from a viewable copy ({how['source']}); the {claims['kind']} file is kept as it came.",
              *issues]
    doc = extract_document(db, document_id, text=(chunks, issues))
    if doc is None:
        return "The document was deleted before it was read"
    if doc.extraction_status != "complete":
        raise RuntimeError(doc.extraction_error or "The photo could not be read")
    return f"{claims['kind']} photo: viewable copy made, {len(chunks)} passage{'s' if len(chunks) != 1 else ''} of text"
