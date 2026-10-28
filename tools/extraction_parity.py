"""Read the same files with OpenAleph and with the Workbench's own reader, and compare.

    OPENALEPH_LIVE_URL=http://127.0.0.1:8001 TZ=UTC python tools/extraction_parity.py --out docs/project-notes/EXTRACTION_PARITY.md

The 23 Oct 2026 audit (P1, "OpenAleph and fallback processing consistency")
asked for this before the fallback reader is ever removed: the Workbench reads
documents through OpenAleph (ingest-file, ftm-analyze) and keeps its own reader
(PyMuPDF, Tesseract, python-docx and the container readers) for when OpenAleph
cannot. This uploads each test file twice through the Workbench's upload route,
in two investigations, once read by OpenAleph and once by the Workbench's own
reader, and compares what each kept:

- the outcome (read, failed and why);
- how many pages or paragraphs, and their locators;
- how alike the text is, page by page (difflib ratio after collapsing spaces);
- the names proposed (OpenAleph's ftm-analyze against the Workbench's own
  pattern finder, which is the fallback for names too);
- the files inside an archive or email.

Needs a running OpenAleph 5.3.x (docker compose, as .github/workflows/
openaleph-live-ci.yml starts it) and Tesseract. Runs the Workbench in this
process on a throwaway SQLite database; it deletes the OpenAleph collections
it made.
"""
from __future__ import annotations

import argparse
import difflib
import io
import os
import re
import sys
import tempfile
import time
import zipfile
from email.message import EmailMessage
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
WORK = Path(tempfile.mkdtemp(prefix="extraction-parity-"))
os.environ.setdefault("TZ", "UTC")
os.environ["DATABASE_URL"] = f"sqlite:///{WORK / 'parity.db'}"
os.environ["JOB_RUNNER"] = "inline"
os.environ["DOCUMENT_READ_IN_SUBPROCESS"] = "false"

LETTER = ("Memo from the finance desk.\n\nJane Doe met Angela Merkel and Emmanuel Macron to discuss Meridian "
          "Holdings Ltd.\n\nPayments went to GB82WEST12345698765432. Contact jane.doe@meridian.example or call "
          "+44 20 7946 0958.")


def text_pdf(*pages: str) -> bytes:
    import pymupdf

    pdf = pymupdf.open()
    for text in pages:
        page = pdf.new_page()
        page.insert_textbox(pymupdf.Rect(72, 72, 520, 760), text, fontsize=11)
    return pdf.tobytes()


def scanned_pdf(*pages: str) -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 30)
    except OSError:
        font = ImageFont.load_default(size=30)
    images = []
    for text in pages:
        image = Image.new("RGB", (1240, 1754), "white")
        draw = ImageDraw.Draw(image)
        y = 150
        for paragraph in text.split("\n"):
            for line in re.findall(r".{1,60}(?:\s|$)", paragraph) or [""]:
                draw.text((110, y), line.strip(), fill="black", font=font)
                y += 46
        images.append(image)
    out = io.BytesIO()
    images[0].save(out, "PDF", save_all=True, append_images=images[1:], resolution=150)
    return out.getvalue()


def word(*paragraphs: str) -> bytes:
    import docx

    document = docx.Document()
    for paragraph in paragraphs:
        document.add_paragraph(paragraph)
    out = io.BytesIO()
    document.save(out)
    return out.getvalue()


def archive() -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as box:
        box.writestr("letter.txt", LETTER)
        box.writestr("ledger.pdf", text_pdf("Ledger. Meridian Holdings Ltd paid Bellcastle Trading 40,000 dollars."))
    return out.getvalue()


def email() -> bytes:
    message = EmailMessage()
    message["From"] = "Rebecca Thornton <rebecca@halvorsen.example>"
    message["To"] = "Gustavo Reyes <gustavo@meridian.example>"
    message["Subject"] = "Invoice"
    message["Date"] = "Mon, 12 Oct 2026 09:00:00 +0000"
    message.set_content("Dear Gustavo,\n\nJonathan Whitaker signed the invoice for Meridian Holdings Ltd.\n\nRebecca")
    message.add_attachment(text_pdf("Invoice 2231. Meridian Holdings Ltd owes 12,500 dollars."),
                           maintype="application", subtype="pdf", filename="invoice.pdf")
    return message.as_bytes()


FILES: list[tuple[str, str, bytes]] = [
    ("letter.txt", "text/plain", LETTER.encode()),
    ("two-pages.pdf", "application/pdf", text_pdf(LETTER, "Page two. Bellcastle Trading SA received 40,000 dollars "
                                                          "from Meridian Holdings Ltd on 3 March 2025.")),
    ("scan.pdf", "application/pdf", scanned_pdf("Ledger page one.\nMeridian Holdings Ltd paid Bellcastle Trading SA.",
                                                "Ledger page two.\nJane Doe approved the transfer.")),
    ("blank-page.pdf", "application/pdf", text_pdf(LETTER, "")),
    ("minutes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
     word("Board minutes.", "Jane Doe chaired. Emmanuel Macron attended for Meridian Holdings Ltd.")),
    ("accents.txt", "text/plain", "Société Générale versa 12 000 € à Müller & Söhne GmbH à Zürich.".encode()),
    ("box.zip", "application/zip", archive()),
    ("invoice.eml", "message/rfc822", email()),
    ("truncated.pdf", "application/pdf", text_pdf(LETTER)[:400]),
    ("not-a-pdf.pdf", "application/pdf", b"This file says it is a PDF but it is plain text about Meridian Holdings Ltd."),
]


def norm(text: str) -> str:
    return " ".join((text or "").split()).lower()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    live = os.environ.get("OPENALEPH_LIVE_URL", "").rstrip("/")
    if not live:
        raise SystemExit("set OPENALEPH_LIVE_URL to a running OpenAleph API, e.g. http://127.0.0.1:8001")

    import httpx
    from fastapi.testclient import TestClient
    from sqlalchemy import select

    from app.core.config import settings
    from app.db.migrations import ensure_database_schema
    from app.db.session import SessionLocal, engine
    from app.main import app
    from app.models.domain import (
        Document,
        DocumentChunk,
        ExtractionCandidate,
        InvestigationCorpusBinding,
    )
    from app.services import openaleph_corpus

    ensure_database_schema(engine)
    settings.openaleph_enabled = True
    settings.openaleph_base_url = live
    settings.openaleph_api_key = ""
    settings.openaleph_read_poll_seconds = 1.0
    settings.openaleph_read_timeout_seconds = 300.0
    settings.openaleph_analysis_timeout_seconds = 180.0
    settings.enable_local_entity_suggestions = True
    settings.document_storage_dir = str(WORK / "docs")
    openaleph_corpus._single_user_tokens = {}
    client = TestClient(app)

    def investigation(name: str) -> str:
        return client.post("/api/investigations", json={"name": f"Parity {name} {time.strftime('%H%M%S')}"}).json()["id"]

    def read(reader: str, inv: str, name: str, mime: str, data: bytes) -> dict:
        settings.document_reader = reader
        settings.openaleph_auto_sync_documents = reader == "openaleph"
        started = time.monotonic()
        reply = client.post("/api/documents/upload", data={"investigation_id": inv, "title": name},
                            files={"file": (name, data, mime)})
        body = reply.json()
        doc = body.get("detail", {}).get("document") if isinstance(body.get("detail"), dict) else body
        out = {"http": reply.status_code, "seconds": round(time.monotonic() - started, 1), "pages": [], "names": set(),
               "children": [], "status": None, "error": None, "issues": [], "job": (body.get("job") or {}).get("message")}
        if not doc or "id" not in doc:
            out["status"] = "refused"
            out["error"] = str(body.get("detail"))[:160]
            return out
        with SessionLocal() as db:
            row = db.get(Document, doc["id"])
            out["status"], out["error"], out["issues"] = row.extraction_status, row.extraction_error, row.extraction_issues or []
            out["pages"] = [(c.locator, c.text) for c in db.scalars(select(DocumentChunk).where(
                DocumentChunk.document_id == row.id).order_by(DocumentChunk.ordinal))]
            out["names"] = {norm(c.payload.get("caption", "")) for c in db.scalars(select(ExtractionCandidate).where(
                ExtractionCandidate.document_id == row.id, ExtractionCandidate.candidate_type == "entity"))}
            out["children"] = sorted(d.filename for d in db.scalars(select(Document).where(Document.parent_document_id == row.id)))
        return out

    via_openaleph, via_local = investigation("OpenAleph"), investigation("local")
    rows = []
    for name, mime, data in FILES:
        print(f"reading {name} ...", flush=True)
        oa = read("openaleph", via_openaleph, name, mime, data)
        local = read("local", via_local, name, mime, data)
        pairs = list(zip(oa["pages"], local["pages"]))
        same_locators = [a[0] == b[0] for a, b in pairs]
        # The whole text, so a file the two split differently (paragraphs, headers) is still compared.
        whole = (difflib.SequenceMatcher(None, norm(" ".join(t for _, t in oa["pages"])),
                                         norm(" ".join(t for _, t in local["pages"]))).ratio()
                 if oa["pages"] and local["pages"] else None)
        union = oa["names"] | local["names"]
        rows.append({
            "file": name, "oa": oa, "local": local,
            "pages": f"{len(oa['pages'])} / {len(local['pages'])}",
            "locators_match": all(same_locators) and len(oa["pages"]) == len(local["pages"]),
            "text_similarity": f"{whole:.2f}" if whole is not None else "—",
            "names_in_both": sorted(oa["names"] & local["names"]),
            "names_only_openaleph": sorted(oa["names"] - local["names"]),
            "names_only_local": sorted(local["names"] - oa["names"]),
            "name_overlap": f"{len(oa['names'] & local['names'])}/{len(union)}" if union else "—",
        })

    with SessionLocal() as db:
        collections = [b.collection_id for b in db.scalars(select(InvestigationCorpusBinding))]
    token = httpx.get(f"{live}/api/2/metadata", timeout=10).json().get("token")
    for collection_id in collections:
        httpx.delete(f"{live}/api/2/collections/{collection_id}", headers={"Authorization": f"Token {token}"}, timeout=30)

    lines = ["# OpenAleph and the Workbench's own reader on the same files\n",
             f"Generated by `tools/extraction_parity.py` on {time.strftime('%Y-%m-%d')} against OpenAleph at "
             f"`{live}` ({httpx.get(f'{live}/api/2/metadata', timeout=10).json().get('app', {}).get('version', 'version not reported')}). "
             "Each file was uploaded through the Workbench twice: read by OpenAleph, and read by the Workbench's own reader. "
             "Pages are OpenAleph / Workbench. Text similarity is the difflib ratio of the two whole texts, spaces collapsed and lower-cased.\n",
             "| File | OpenAleph | Workbench | Pages | Locators match | Text similarity | Names in both |",
             "|---|---|---|---|---|---|---|"]
    def outcome(r: dict) -> str:
        if r["status"] == "complete":
            extra = f"; {len(r['children'])} file(s) inside" if r["children"] else ""
            return f"read ({r['seconds']}s){extra}"
        return f"{r['status']}: {(r['error'] or '')[:90]}"
    for row in rows:
        lines.append(f"| `{row['file']}` | {outcome(row['oa'])} | {outcome(row['local'])} | {row['pages']} | "
                     f"{'yes' if row['locators_match'] else 'no'} | {row['text_similarity']} | {row['name_overlap']} |")
    lines.append("\n## Where they differ\n")
    for row in rows:
        notes = []
        if not row["locators_match"]:
            notes.append(f"locators: OpenAleph {[p[0] for p in row['oa']['pages']]}, Workbench {[p[0] for p in row['local']['pages']]}")
        if row["names_only_openaleph"]:
            notes.append(f"names only OpenAleph found: {', '.join(row['names_only_openaleph'])}")
        if row["names_only_local"]:
            notes.append(f"names only the Workbench found: {', '.join(row['names_only_local'])}")
        if row["oa"]["children"] != row["local"]["children"]:
            notes.append(f"files inside: OpenAleph {row['oa']['children']}, Workbench {row['local']['children']}")
        if row["oa"]["issues"] or row["local"]["issues"]:
            notes.append(f"issues: OpenAleph {row['oa']['issues']}, Workbench {row['local']['issues']}")
        if notes:
            lines.append(f"- **`{row['file']}`**: " + "; ".join(notes))
    text = "\n".join(lines) + "\n"
    print(text)
    if args.out:
        args.out.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
