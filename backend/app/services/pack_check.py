"""Check a pack (mockup CHECK_4; research §11 Innovation 2): an evidence pack someone sends back, read in memory on this
computer, every file's SHA-256 recomputed and compared.

The list compared against is the one kept here when the pack was made (EvidencePack), found by the pack id inside the
pack's readiness.json; a pack this computer did not make (or made in another case) is compared against its own
MANIFEST.sha256, which shows it is whole but not that nobody redid the list. Nothing is sent anywhere and nothing of
the pack is kept. For a changed exhibit picture, the picture is drawn again from the case's own file: when that gives
the bytes listed when the pack was made, the two are compared and the band that differs is shown.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import zipfile
from pathlib import PurePosixPath
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import Claim, Document, EvidencePack, Investigation
from app.services.security import resolve_storage_root

MAX_FILES = 5000
MAX_UNPACKED = 1024 * 1024 * 1024  # a zip that would unpack past this is refused, not read
THUMB = 420
SIGNATURE_FILES = ("MANIFEST.sha256.sig", "PUBLIC_KEY.pem")
NOISE = 40  # grey levels of difference that JPEG compression alone can make


class PackRefused(ValueError):
    """Not a zip, unsafe, or too big: said in the app's own words."""


def _members(data: bytes) -> dict[str, bytes]:
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise PackRefused("This is not a .zip file") from exc
    infos = [i for i in zf.infolist() if not i.is_dir()]
    if len(infos) > MAX_FILES:
        raise PackRefused(f"The pack holds more than {MAX_FILES} files: not an evidence pack made here")
    if sum(i.file_size for i in infos) > MAX_UNPACKED:
        raise PackRefused("The pack would unpack to more than 1 GB: not read")
    out: dict[str, bytes] = {}
    for info in infos:
        name = info.filename.replace("\\", "/")
        parts = PurePosixPath(name).parts
        if name.startswith("/") or ".." in parts or re.match(r"^[A-Za-z]:", name):
            raise PackRefused("The pack names a file outside itself: not read")
        out[name] = zf.read(info)
    # A pack zipped again inside a folder: the folder holding MANIFEST.sha256 is the pack.
    if "MANIFEST.sha256" not in out:
        roots = [n[: -len("MANIFEST.sha256")] for n in out if n.endswith("/MANIFEST.sha256")]
        if len(roots) == 1:
            out = {n[len(roots[0]):]: b for n, b in out.items() if n.startswith(roots[0])}
    return out


def _manifest(text: str) -> dict[str, str]:
    listed: dict[str, str] = {}
    for line in text.splitlines():
        m = re.match(r"^([0-9a-fA-F]{64})\s+\*?(.+)$", line.strip())
        if m:
            listed[m.group(2)] = m.group(1).lower()
    return listed


def _thumb(data: bytes) -> str | None:
    from PIL import Image

    try:
        with Image.open(io.BytesIO(data)) as im:
            shown = im.convert("RGB")
            shown.thumbnail((THUMB, THUMB))
            buf = io.BytesIO()
            shown.save(buf, "PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None


def _differs(ours: bytes, theirs: bytes) -> dict[str, float] | None:
    """Where two pictures differ, as fractions of the picture (left, top, width, height); None if they cannot be put
    side by side (another size) or do not differ."""
    from PIL import Image, ImageChops

    try:
        with Image.open(io.BytesIO(ours)) as a, Image.open(io.BytesIO(theirs)) as b:
            if a.size != b.size:
                return None
            # JPEG saved again changes every pixel a little: only a difference a person could see counts.
            diff = ImageChops.difference(a.convert("RGB"), b.convert("RGB")).convert("L").point(lambda v: 255 if v > NOISE else 0)
            box = diff.getbbox()
            if box is None:
                return None
            w, h = a.size
            return {"left": box[0] / w, "top": box[1] / h, "width": (box[2] - box[0]) / w, "height": (box[3] - box[1]) / h}
    except Exception:
        return None


def check(db: Session, investigation_id: str, data: bytes, filename: str = "") -> dict[str, Any]:
    from app.services.claim_done import _file_matches
    from app.services.evidence_pack import _picture

    members = _members(data)
    if "MANIFEST.sha256" not in members:
        raise PackRefused("No MANIFEST.sha256 in it: not an evidence pack, or its list was taken out")
    own_list = _manifest(members["MANIFEST.sha256"].decode("utf-8", "replace"))
    pack_id = None
    try:
        pack_id = json.loads(members.get("readiness.json", b"{}")).get("pack_id")
    except (ValueError, AttributeError):
        pack_id = None
    record = db.get(EvidencePack, pack_id) if isinstance(pack_id, str) else None
    elsewhere = None
    if record is not None and record.investigation_id != investigation_id:
        inv = db.get(Investigation, record.investigation_id)
        elsewhere = inv.name if inv else "another case"
        record = None
    authority = dict(record.files) if record is not None else own_list
    rows = []
    for name, listed in sorted(authority.items()):
        if name not in members:
            rows.append({"name": name, "state": "missing", "listed": listed, "now": None})
            continue
        now = hashlib.sha256(members[name]).hexdigest()
        rows.append({"name": name, "state": "as_made" if now == listed else "changed", "listed": listed, "now": now})
    for name in sorted(set(members) - set(authority) - {"MANIFEST.sha256", *SIGNATURE_FILES}):
        rows.append({"name": name, "state": "extra", "listed": None, "now": hashlib.sha256(members[name]).hexdigest()})
    counts = {k: sum(r["state"] == k for r in rows) for k in ("as_made", "changed", "missing", "extra")}
    list_changed = record is not None and members["MANIFEST.sha256"].decode("utf-8", "replace") != record.manifest
    whole = counts["changed"] == counts["missing"] == counts["extra"] == 0 and not list_changed

    exhibits: list[dict[str, Any]] = []
    root = resolve_storage_root(settings.document_storage_dir)
    by_number = {int(e["number"]): e for e in (record.exhibits if record is not None else [])}
    for r in rows:
        m = re.match(r"^exhibits/(\d{3})/(.+)$", r["name"])
        if not m or r["state"] == "as_made" or record is None:
            continue
        kept = by_number.get(int(m.group(1)))
        if kept is None:
            continue
        doc = db.get(Document, kept.get("document_id")) if kept.get("document_id") else None
        claims = [c.text for c in (db.get(Claim, cid) for cid in kept.get("claims") or []) if c is not None]
        entry: dict[str, Any] = {"number": kept["number"], "file": m.group(2), "state": r["state"],
                                 "document": doc.filename if doc else None,
                                 "case_file": None if doc is None else ("matches" if _file_matches(doc) else "does not match"),
                                 "claims": claims, "ours": None, "theirs": None, "differs": None, "redrawn": False}
        if m.group(2) == kept.get("picture") and doc is not None:
            drawn = _picture(db, doc, kept.get("page"), kept.get("quote") or "", root)
            if drawn is not None and hashlib.sha256(drawn[1]).hexdigest() == r["listed"]:
                entry["redrawn"] = True
                entry["ours"] = _thumb(drawn[1])
                if r["state"] == "changed":
                    entry["theirs"] = _thumb(members[r["name"]])
                    entry["differs"] = _differs(drawn[1], members[r["name"]])
        exhibits.append(entry)
    for r in rows:  # a custody page that is changed or gone: name its claim
        m = re.match(r"^custody/([^/]+)\.txt$", r["name"])
        if m and r["state"] in ("changed", "missing"):
            claim = db.get(Claim, m.group(1))
            r["about"] = f"the chain of custody of “{claim.text}”" if claim else "a claim's chain of custody"

    return {
        "file": filename, "files": len(members), "pack_id": pack_id if isinstance(pack_id, str) else None,
        "made_here": record is not None, "made_in_other_case": elsewhere,
        "made_at": record.created_at if record is not None else None, "made_by": record.made_by if record is not None else None,
        "title": record.title if record is not None else None, "draft": record.draft if record is not None else None,
        "compared_with": "the list kept here when it was made" if record is not None else "the pack's own MANIFEST.sha256",
        "list_changed": list_changed, "whole": whole, "counts": counts, "rows": rows, "exhibits": exhibits,
        "signature": _signature(db, members, record),
    }


def _signature(db: Session, members: dict[str, bytes], record: EvidencePack | None) -> dict[str, Any]:
    """Whether the pack's list carries a valid signature, with which key, and whether that key is this computer's (and,
    for a pack made here, the one it was made with)."""
    from app.services.pack_signing import verify

    out = verify(db, members["MANIFEST.sha256"], members.get("MANIFEST.sha256.sig"), members.get("PUBLIC_KEY.pem"))
    out["as_made"] = record is None or not record.key_fingerprint or out.get("fingerprint") == record.key_fingerprint
    return out
