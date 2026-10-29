"""A photo's tools (mockup MEDIA_1; media research §2.1, §5; ADR-0021): find faces with a detector only, and make
copies: faces blurred, metadata removed, cropped, an area redacted (with its reason), turned. Every copy is a new file
with its edit-trail row (app/services/derived_files.py); the photo itself is never written. A copy can be made from
another copy, so the trail is a tree from the original.

The face detector is LightCraft's YuNet (MIT weights, 232 KB), exposed alone: nothing here names, matches or groups a
face (media research §4.5; DECISIONS_LOG 7, call 1). Its model is fetched the first time faces are looked for, pinned
to its SHA-256 and written to the outbound log (DECISIONS_LOG 7, call 4).
"""

from __future__ import annotations

import hashlib
import io
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import DerivedFile, Document
from app.services.derived_files import write_derived
from app.services.native import LIGHTCRAFT, native

FACE_MODEL = ("yunet.onnx", "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/"
              "face_detection_yunet_2023mar.onnx", "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4", 232_589)
FACE_MODEL_NAME = "YuNet face detector 2023mar (OpenCV Zoo, MIT)"
OPERATIONS = ("blur_faces", "strip_metadata", "crop", "redact", "turn")
GROW = 0.18  # a found face's box is grown by this much on each side before blurring, so hair and chin go too


class ToolRefused(ValueError):
    """The copy cannot be made as asked, said in words."""


def _model_path() -> Path:
    return Path(settings.faces_model_dir).expanduser() / FACE_MODEL[0]


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def face_model() -> Path:
    """The detector's model, fetched now if it is not here yet (232 KB), and checked against its pin."""
    import httpx

    from app.services.outbound import record_platform_request

    path = _model_path()
    if path.is_file() and _sha256(path) == FACE_MODEL[2]:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    record_platform_request(None, kind="download", service="face detector model", destination="media.githubusercontent.com",
                            sent=FACE_MODEL[1], detail="Fetched the first time faces are looked for (232 KB); no picture is sent")
    reply = httpx.get(FACE_MODEL[1], follow_redirects=True, timeout=60)
    reply.raise_for_status()
    if hashlib.sha256(reply.content).hexdigest() != FACE_MODEL[2]:
        raise ToolRefused("The face detector's model that was fetched is not the expected file; nothing was kept")
    part = path.with_suffix(".part")
    part.write_bytes(reply.content)
    part.replace(path)
    return path


def base_bytes(db: Session, document: Document, parent: DerivedFile | None) -> bytes:
    """What a copy is made from: another copy, or the photo as the app shows it (a HEIC's or RAW's viewable copy)."""
    from app.services.image_reader import shown_path

    return Path(parent.storage_path if parent is not None else shown_path(db, document)).read_bytes()


def find_faces(data: bytes, min_score: float = 0.6) -> list[dict[str, float]]:
    """Boxes where the detector finds a face, as fractions of the picture (x, y, w, h) with its score. Never who."""
    import numpy as np
    from PIL import Image, ImageOps

    detector = native().photo.FaceDetector(face_model().read_bytes())
    with Image.open(io.BytesIO(data)) as image:
        rgb = np.asarray(ImageOps.exif_transpose(image).convert("RGB"))
    found = detector.detect(rgb, min_score=min_score)
    out = []
    for f in found:
        x0, y0, x1, y1 = (float(v) for v in f["box"])
        out.append({"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, "score": round(float(f["score"]), 3)})
    return out


def _box(image_size: tuple[int, int], box: dict[str, Any], grow: float = 0.0) -> tuple[int, int, int, int]:
    w, h = image_size
    try:
        x, y, bw, bh = (float(box[k]) for k in ("x", "y", "w", "h"))
    except (KeyError, TypeError, ValueError) as exc:
        raise ToolRefused("A box is x, y, w and h, each a fraction of the picture") from exc
    if not (0 <= x < 1 and 0 <= y < 1 and 0 < bw <= 1 and 0 < bh <= 1):
        raise ToolRefused("A box must lie on the picture (fractions from 0 to 1)")
    x0, y0 = max(0.0, x - bw * grow), max(0.0, y - bh * grow)
    x1, y1 = min(1.0, x + bw * (1 + grow)), min(1.0, y + bh * (1 + grow))
    return round(x0 * w), round(y0 * h), max(round(x0 * w) + 1, round(x1 * w)), max(round(y0 * h) + 1, round(y1 * h))


def _pillow() -> str:
    import PIL

    return f"Pillow {PIL.__version__}"


def _save(image: Any, like: str | None, *, keep: dict[str, Any] | None = None) -> tuple[bytes, str, str]:
    """Encode a copy: PNG stays PNG, anything else becomes JPEG at quality 92. Only what `keep` names is carried over."""
    out = io.BytesIO()
    extra = {k: v for k, v in (keep or {}).items() if v}
    if like == "PNG":
        image.save(out, "PNG", **extra)
        return out.getvalue(), "image/png", "png"
    image.convert("RGB").save(out, "JPEG", quality=92, **extra)
    return out.getvalue(), "image/jpeg", "jpg"


def make_copy(db: Session, document: Document, operation: str, params: dict[str, Any], *, parent: DerivedFile | None,
              actor: str | None) -> DerivedFile:
    """Make one copy of a photo and keep it with its trail row. Raises ToolRefused when the copy cannot be made."""
    from PIL import Image, ImageDraw, ImageFilter, ImageOps

    if operation not in OPERATIONS:
        raise ToolRefused(f"No such tool: {operation}")
    if parent is not None and parent.document_id != document.id:
        raise ToolRefused("That copy is not one of this photo's")
    data = base_bytes(db, document, parent)
    with Image.open(io.BytesIO(data)) as opened:
        fmt = opened.format
        icc = opened.info.get("icc_profile")
        exif = opened.info.get("exif")
        image = ImageOps.exif_transpose(opened).copy() if operation != "strip_metadata" else opened.copy()
    model = model_sha = None
    record: dict[str, Any] = {}
    # Every copy but "remove metadata" keeps the colour profile and what the file says about itself.
    keep: dict[str, Any] = {"icc_profile": icc, "exif": exif}
    if operation == "blur_faces":
        radius = int(params.get("radius", 24))
        if not 4 <= radius <= 80:
            raise ToolRefused("The blur's radius is from 4 to 80 pixels")
        boxes = params.get("boxes")
        if boxes is None:
            buf = io.BytesIO()
            image.convert("RGB").save(buf, "PNG")
            boxes = find_faces(buf.getvalue())
        if not boxes:
            raise ToolRefused("No face was found to blur")
        for box in boxes:
            region = _box(image.size, box, GROW)
            image.paste(image.crop(region).filter(ImageFilter.GaussianBlur(radius)), region[:2])
        model, model_sha = FACE_MODEL_NAME, FACE_MODEL[2]
        record = {"radius": radius, "regions": len(boxes), "boxes": boxes}
    elif operation == "strip_metadata":
        image = ImageOps.exif_transpose(image)
        keep = {}  # nothing carried over: no EXIF (GPS, serial, software), no XMP, no colour profile
        record = {"removed": "EXIF (camera, serial, software, GPS, time), XMP and the colour profile"}
    elif operation == "crop":
        region = _box(image.size, params.get("box") or {})
        image = image.crop(region)
        record = {"box": params.get("box"), "pixels": list(region)}
    elif operation == "redact":
        reason = str(params.get("reason") or "").strip()
        if not reason:
            raise ToolRefused("Say why this area is redacted: the reason is kept in the trail")
        region = _box(image.size, params.get("box") or {})
        ImageDraw.Draw(image).rectangle(region, fill=(0, 0, 0))
        record = {"box": params.get("box"), "pixels": list(region), "reason": reason[:300]}
    elif operation == "turn":
        degrees = int(params.get("degrees", 90))
        if degrees not in (90, 180, 270):
            raise ToolRefused("A photo turns by 90, 180 or 270 degrees")
        image = image.rotate(-degrees, expand=True)
        record = {"degrees": degrees, "direction": "clockwise"}
    if operation != "strip_metadata" and exif:
        # The turn is now in the pixels: the copy's EXIF must not turn it again.
        from PIL import Image as PILImage

        tags = PILImage.Exif()
        tags.load(exif)
        tags[0x0112] = 1
        keep["exif"] = tags.tobytes()
    out, mime, ext = _save(image, fmt, keep=keep)
    words = {"blur_faces": "faces-blurred", "strip_metadata": "no-metadata", "crop": "cropped", "redact": "redacted", "turn": "turned"}
    return write_derived(db, document=document, data=out, filename=f"{Path(document.filename).stem}-{words[operation]}.{ext}",
                         mime_type=mime, operation=operation, params=record, tool=LIGHTCRAFT if operation == "blur_faces" else _pillow(),
                         parent=parent, model=model, model_sha256=model_sha, created_by=actor)


def photo_view(db: Session, document: Document) -> dict[str, Any]:
    """What the Picture screen shows: what the file claims about itself (each a claim, never a finding), how far its
    GPS is from the nearest place in the case, the machine's proposals (text read in it, the place its GPS gives)."""
    import math

    from sqlalchemy import select

    from app.models.domain import DocumentChunk, DocumentPhoto, ExtractionCandidate
    from app.services.places import investigation_places

    photo = db.get(DocumentPhoto, document.id)
    claims = dict(photo.claims or {}) if photo is not None else {}
    gps = claims.get("gps") if isinstance(claims.get("gps"), dict) else None
    nearest = None
    if gps and gps.get("latitude") is not None and gps.get("longitude") is not None:
        lat, lon = float(gps["latitude"]), float(gps["longitude"])
        best: tuple[float, str, str] | None = None
        for place in investigation_places(db, document.investigation_id)["places"]:
            d_lat, d_lon = math.radians(place["latitude"] - lat), math.radians(place["longitude"] - lon)
            h = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat)) * math.cos(math.radians(place["latitude"])) * math.sin(d_lon / 2) ** 2
            metres = 6_371_000 * 2 * math.asin(min(1.0, math.sqrt(h)))
            if best is None or metres < best[0]:
                best = (metres, place["entity_id"], place["caption"])
        if best is not None:
            nearest = {"metres": round(best[0]), "entity_id": best[1], "caption": best[2]}
    proposal = next((c for c in db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.document_id == document.id))
                     if (c.payload or {}).get("from") == "photo_gps"), None)
    text = [c.text for c in db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == document.id)
                                       .order_by(DocumentChunk.ordinal).limit(5)) if (c.text or "").strip()]
    width, height = (photo.width, photo.height) if photo is not None else (None, None)
    if not width or not height:
        from PIL import Image

        try:
            with Image.open(io.BytesIO(base_bytes(db, document, None))) as shown:
                width, height = shown.size
        except (OSError, ValueError):
            width = height = None
    return {
        "document_id": document.id, "filename": document.filename, "sha256": document.sha256,
        "kind": photo.kind if photo is not None else Path(document.filename).suffix.lstrip(".").upper(),
        "width": width, "height": height,
        "date_tag": photo.date_tag if photo is not None else None, "claims": claims, "nearest_place": nearest,
        "place_proposal": {"id": proposal.id, "status": proposal.review_status} if proposal is not None else None,
        "text": text, "face_model_here": _model_path().is_file(),
    }
