"""Redact before sharing (mockup MEDIA_3; media research §2.3, §5; ADR-0021): a PDF copy for an editor, a lawyer or
publication with the text under each box truly removed, not covered, and the file's hidden data taken out.

Every tool here runs on PdfCraft (the native module's `pdf.PdfSession`) over a copy of the PDF in a folder of its own,
so the case's file is never opened for writing; PdfCraft also refuses to save over a file it opened. Boxes come from a
person: drawn, or proposed (a phone number or an email address found by pattern, a person named in this case found in
the text) and accepted one by one. Each box needs its reason (DECISIONS_LOG 7, call 7), kept in the edit trail with
the box's page and place; the words that were under it are not kept anywhere. After saving, the new file is opened
again and must hold no text under any box, or nothing is kept.
"""

from __future__ import annotations

import json
import re
import shutil
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.derived import DerivedFile
from app.models.domain import Document
from app.services.derived_files import write_derived
from app.services.native import PDFCRAFT, native

HIDDEN = ("metadata", "attachments", "comments", "form-fields", "hidden-text", "hidden-layers", "bookmarks",
          "links-actions-scripts", "private-data")
MADE_FOR = {"editor": "the editor", "lawyer": "a lawyer", "publication": "publication"}
MAX_BOXES = 500
# Separators inside a phone number are spaces, dots or hyphens on one line: a newline between numbers is a column of
# numbers (a court filing's margin line numbers 1 to 28, a table), never one phone number.
PHONE = re.compile(r"(?<![\w+])(?:\+\d{1,3}[ \t.-]?)?(?:\(\d{2,5}\)[ \t.-]?)?\d{2,5}(?:[ \t.-]?\d{2,4}){2,4}(?!\w)")
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def looks_like_phone(found: str) -> bool:
    """Whether a PHONE match is worth proposing. Not: under seven digits; a column of numbers across lines (a court
    filing's margin line numbers); a run of counting numbers on one line ("10 11 12 13"); a date ("22.03.2013",
    "2013-03-22"); a decimal ("620.068965"); two groups that are not a local number ("0583-994"); and a bare run of
    digits under ten long (a case number or an amount far more often than a phone number)."""
    found = found.strip()
    digits = sum(ch.isdigit() for ch in found)
    if digits < 7 or "\n" in found:
        return False
    groups = re.findall(r"\d+", found)
    numbers = [int(g) for g in groups]
    if len(numbers) >= 3 and all(b - a == 1 for a, b in zip(numbers, numbers[1:], strict=False)):
        return False
    if len(groups) == 3 and (_is_date(groups) or _is_date(groups[::-1])):
        return False
    if found.startswith("+") or "(" in found:
        return True
    if len(groups) == 1:
        return digits >= 10
    if len(groups) == 2:
        return "." not in found and len(groups[-1]) >= 4
    return True


def _is_date(groups: list[str]) -> bool:
    """Day, month, year (or month, day, year) with a four-digit year."""
    day, month, year = groups
    return len(year) == 4 and year[:2] in ("19", "20") and 1 <= int(month) <= 31 and 1 <= int(day) <= 31 and \
        (int(month) <= 12 or int(day) <= 12)


class RedactRefused(ValueError):
    """The redacted copy cannot be made as asked, said in words."""


def is_pdf(document: Document) -> bool:
    return document.filename.lower().endswith(".pdf") or (document.mime_type or "") == "application/pdf"


class _Pdf:
    """One PdfSession over a folder of its own, holding a copy of the case's file as `original.pdf`."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.session = native().pdf.PdfSession(str(root))

    def call(self, tool: str, **args: Any) -> list[Any]:
        try:
            out = self.session.call(tool, json.dumps(args))
        except Exception as exc:  # PdfCraft says what went wrong in words
            raise RedactRefused(str(exc)) from exc
        return [json.loads(r) if isinstance(r, str) else r for r in out]

    def open(self, name: str) -> int:
        return int(self.call("doc_open", path=name)[0]["doc"])


@contextmanager
def _working_copy(document: Document) -> Iterator[tuple[_Pdf, int]]:
    with tempfile.TemporaryDirectory(prefix="redact-") as folder:
        root = Path(folder)
        shutil.copyfile(document.storage_path, root / "original.pdf")
        pdf = _Pdf(root)
        yield pdf, pdf.open("original.pdf")


def _pages(pdf: _Pdf, doc: int) -> list[dict[str, Any]]:
    info = pdf.call("doc_info", doc=doc)[0]
    return [{"page": int(p["page"]), "width": float(p["width"]), "height": float(p["height"])} for p in info["pages"]]


def _hidden(pdf: _Pdf, doc: int) -> list[dict[str, Any]]:
    found = pdf.call("doc_hidden_info", doc=doc)[0]
    return [{"category": c["category"], "label": c["label"], "count": int(c["count"])} for c in found["categories"]]


def _pdfa(pdf: _Pdf, doc: int) -> dict[str, Any]:
    found = pdf.call("pdfa_verify", doc=doc, level="2b")[0]
    return {"compliant": bool(found["compliant"]), "declared": (found.get("declared") or {}).get("pdfa"),
            "issues": [{"clause": i.get("clause"), "message": i.get("message"), "fixable": bool(i.get("fixable"))}
                       for i in found.get("issues") or []]}


def _people(db: Session, document: Document) -> list[tuple[str, str]]:
    """The people named in this case (each name at least four letters), to look for in the PDF's text."""
    from app.models.entities import Entity

    out = []
    for entity in db.scalars(select(Entity).where(Entity.investigation_id == document.investigation_id, Entity.schema == "Person",
                                                Entity.merged_into_entity_id.is_(None))):
        names = {entity.caption, *((entity.properties or {}).get("name") or [])}
        out += [(entity.id, n.strip()) for n in names if isinstance(n, str) and len(n.strip()) >= 4]
    return out


def _proposals(db: Session, document: Document, pdf: _Pdf, doc: int) -> list[dict[str, Any]]:
    """Boxes the machine proposes, each to be accepted or rejected by a person: phone numbers and email addresses found
    by pattern, people named in this case found in the text. Never applied on their own."""
    text = pdf.call("text_extract", doc=doc)[0]["pages"]
    wanted: list[tuple[str, str, str | None]] = []  # (kind, phrase, entity id)
    for page in text:
        for match in EMAIL.finditer(page["text"]):
            wanted.append(("email", match.group(0), None))
        for match in PHONE.finditer(page["text"]):
            if looks_like_phone(match.group(0)):
                wanted.append(("phone", match.group(0).strip(), None))
    wanted += [("person", name, entity_id) for entity_id, name in _people(db, document)]
    out: list[dict[str, Any]] = []
    seen: set[tuple[int, tuple[float, ...]]] = set()
    for kind, phrase, entity_id in dict.fromkeys(wanted):
        for match in pdf.call("text_find", doc=doc, query=phrase, limit=200)[0]["matches"]:
            for rect in match["rects"]:
                key = (int(match["page"]), tuple(round(v, 1) for v in rect))
                if key in seen:
                    continue
                seen.add(key)
                out.append({"id": f"{kind}-{len(out) + 1}", "kind": kind, "page": key[0], "rect": [round(v, 2) for v in rect],
                            "text": match["text"], "entity_id": entity_id,
                            "why": "found by pattern" if kind != "person" else "a person named in this case"})
    return sorted(out, key=lambda p: (p["page"], p["rect"][1], p["rect"][0]))


def redaction_view(db: Session, document: Document) -> dict[str, Any]:
    """What the Redact screen shows: the pages and their sizes in points, the proposed boxes, the hidden data the file
    carries by category, and whether it meets PDF/A-2b now."""
    with _working_copy(document) as (pdf, doc):
        return {"document_id": document.id, "sha256": document.sha256, "pages": _pages(pdf, doc),
                "proposals": _proposals(db, document, pdf, doc), "hidden": _hidden(pdf, doc), "pdfa": _pdfa(pdf, doc),
                "tool": PDFCRAFT}


def _checked_box(box: dict[str, Any], pages: dict[int, dict[str, Any]], n: int) -> dict[str, Any]:
    page = box.get("page")
    if not isinstance(page, int) or page not in pages:
        raise RedactRefused(f"Box {n} is on a page this PDF does not have")
    rect = box.get("rect")
    if not isinstance(rect, list) or len(rect) != 4 or not all(isinstance(v, (int, float)) for v in rect):
        raise RedactRefused(f"Box {n} is four numbers: left, top, right and bottom in points")
    x0, y0, x1, y1 = (float(v) for v in rect)
    size = pages[page]
    x0, y0, x1, y1 = max(0.0, x0), max(0.0, y0), min(size["width"], x1), min(size["height"], y1)
    if x1 - x0 < 1 or y1 - y0 < 1:
        raise RedactRefused(f"Box {n} does not cover any of page {page}")
    reason = str(box.get("reason") or "").strip()
    if not reason:
        raise RedactRefused(f"Say why box {n} on page {page} is redacted: the reason is kept in the trail")
    kind = box.get("kind") if box.get("kind") in ("drawn", "phone", "email", "person") else "drawn"
    return {"page": page, "rect": [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)], "reason": reason[:300], "kind": kind}


def make_redacted(db: Session, document: Document, *, boxes: list[dict[str, Any]], remove: list[str], pdfa: bool,
                  made_for: str, actor: str | None) -> DerivedFile:
    """The redacted copy: every box's content removed for good (PdfCraft's redact, which re-reads each page and fails if
    anything readable is left), the hidden data asked for removed, PDF/A-2b if asked; then the saved file is opened
    again and must hold no text under any box. Kept as a new file with its trail row; the case's file is unchanged."""
    if not boxes:
        raise RedactRefused("Draw or accept at least one box to redact")
    if len(boxes) > MAX_BOXES:
        raise RedactRefused(f"At most {MAX_BOXES} boxes in one copy")
    if made_for not in MADE_FOR:
        raise RedactRefused("A redacted copy is for an editor, a lawyer or publication")
    unknown = sorted(set(remove) - set(HIDDEN))
    if unknown:
        raise RedactRefused(f"No such hidden data: {', '.join(unknown)}")
    with _working_copy(document) as (pdf, doc):
        pages = {p["page"]: p for p in _pages(pdf, doc)}
        checked = [_checked_box(b, pages, n) for n, b in enumerate(boxes, start=1)]
        before = {h["category"]: h["count"] for h in _hidden(pdf, doc)}
        for box in checked:
            pdf.call("redact_mark", doc=doc, page=box["page"], rect=box["rect"], author=actor or "the Workbench")
        applied = pdf.call("redact_apply", doc=doc)[0].get("applied")
        # Only categories the file holds: PdfCraft refuses to remove one that is empty.
        removed = {c: before[c] for c in sorted(set(remove)) if before.get(c)}
        if removed:
            pdf.call("doc_remove_hidden", doc=doc, categories=list(removed))
        archive = None
        if pdfa:
            converted = pdf.call("pdfa_convert", doc=doc, level="2b")[0]
            archive = {"level": "PDF/A-2b", "compliant": bool(converted.get("compliant")),
                       "issues": [i.get("message") for i in converted.get("issues") or []]}
        pdf.call("doc_save", doc=doc, path="redacted.pdf")
        # The check: the new file, opened afresh, holds no text under any box.
        again = pdf.open("redacted.pdf")
        for n, box in enumerate(checked, start=1):
            x0, y0, x1, y1 = box["rect"]
            inset = [x0 + 0.5, y0 + 0.5, x1 - 0.5, y1 - 0.5]
            left = pdf.call("text_extract", doc=again, pages=[box["page"]], rect=inset)[0]["pages"]
            if any((p.get("text") or "").strip() for p in left):
                raise RedactRefused(f"Text is still readable under box {n} on page {box['page']}: nothing was kept")
        data = (pdf.root / "redacted.pdf").read_bytes()
    stem = Path(document.filename).stem
    return write_derived(
        db, document=document, data=data, filename=f"{stem}-redacted-for-{made_for}-{date.today().strftime('%d-%b')}.pdf",
        mime_type="application/pdf", operation="redacted",
        params={"made_for": MADE_FOR[made_for], "boxes": checked, "applied": applied, "hidden_removed": removed,
                "pdfa": archive, "checked": f"the new file opened again: no text under any of the {len(checked)} boxes",
                "kept": "each box's page, place and reason; not the words that were under it"},
        tool=PDFCRAFT, created_by=actor)


def copy_page_png(row: DerivedFile, page: int, width: int) -> bytes:
    """One page of a redacted copy as PNG, `width` pixels across, for Compare."""
    with tempfile.TemporaryDirectory(prefix="redact-") as folder:
        root = Path(folder)
        shutil.copyfile(row.storage_path, root / "copy.pdf")
        pdf = _Pdf(root)
        doc = pdf.open("copy.pdf")
        pages = {p["page"]: p for p in _pages(pdf, doc)}
        if page not in pages:
            raise RedactRefused("This copy has no such page")
        dpi = max(24.0, min(300.0, width / pages[page]["width"] * 72))
        image = pdf.call("page_render", doc=doc, page=page, dpi=dpi)[0]
        return bytes(image[0])


def compare(document: Document, row: DerivedFile) -> dict[str, Any]:
    """How the copy differs from the case's file in words: how many words each holds, and the pages that changed."""
    with tempfile.TemporaryDirectory(prefix="redact-") as folder:
        root = Path(folder)
        shutil.copyfile(document.storage_path, root / "original.pdf")
        shutil.copyfile(row.storage_path, root / "copy.pdf")
        pdf = _Pdf(root)
        old, new = pdf.open("original.pdf"), pdf.open("copy.pdf")
        found = pdf.call("doc_compare", doc=new, other=old)[0]
        hidden_after = _hidden(pdf, new)
        pages = sorted({int(side["page"]) for c in found.get("changes") or [] for side in (c["old"], c["new"]) if side.get("text")})
    return {"copy_id": row.id, "old_words": int(found["old_words"]), "new_words": int(found["new_words"]),
            "pages_changed": pages, "hidden_left": hidden_after}
