"""The evidence pack (app/services/evidence_pack.py, ADR-0024): the write-up with each citation linked to its exhibits,
the exhibits list with each file's fingerprint and whether it still matches, the passage and a picture of the page,
each cited claim's chain of custody, the readiness record, the gaps, the limit, and a manifest every file checks
against. Open checks stamp it as a draft; they never stop it."""

import csv
import hashlib
import io
import zipfile

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Claim, ClaimEvidenceLink, Document, DocumentChunk, Evidence, Source

client = TestClient(app)
PAGE = "Fernhill Ltd. Harbour Nominees Limited, being forty per cent (40%) of the issued share capital, from 14 March 2018."
QUOTE = "Harbour Nominees Limited, being forty per cent (40%)"


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _case(tmp_path):
    inv = ok(client.post("/api/investigations", json={"name": "Pack"}))["id"]
    body = b"plain text stands in for the J30 form"
    path = tmp_path / "j30.txt"
    path.write_bytes(body)
    with SessionLocal() as db:
        src = Source(investigation_id=inv, title="Stock transfer form J30", source_type="document", url="https://registry.example/j30")
        db.add(src)
        db.flush()
        doc = Document(investigation_id=inv, source_id=src.id, filename="j30.txt", sha256=hashlib.sha256(body).hexdigest(),
                       storage_path=str(path), extraction_status="complete")
        db.add(doc)
        db.flush()
        db.add(DocumentChunk(document_id=doc.id, locator="page 3", page_number=3, ordinal=1, text=PAGE))
        claim = Claim(investigation_id=inv, text="Harbour Nominees held 40% of Fernhill Ltd.", status="supported")
        ev = Evidence(source_id=src.id, document_id=doc.id, quote=QUOTE, locator="p. 3")
        db.add_all([claim, ev])
        db.flush()
        db.add(ClaimEvidenceLink(claim_id=claim.id, evidence_id=ev.id, stance="supports"))
        db.commit()
        return inv, claim.id, path


def _write(inv, claim_id, *, cite=True, gone=False):
    ok(client.put(f"/api/investigations/{inv}/story", json={"thesis": "Kestrel SA ended up with the harbour land"}))
    writeup_id = ok(client.post(f"/api/investigations/{inv}/story/writeup"))["writeup_id"]
    text = [{"type": "text", "text": "Harbour Nominees held forty per cent of Fernhill."}]
    if cite:
        text.append({"type": "citation", "attrs": {"recordType": "claim", "recordId": claim_id, "label": "1"}})
    if gone:
        text += [{"type": "text", "text": " A second sentence."}, {"type": "citation", "attrs": {"recordType": "claim", "recordId": "gone-claim", "label": "2"}}]
    ok(client.patch(f"/api/writeups/{writeup_id}", json={"content_json": {"type": "doc", "content": [{"type": "paragraph", "content": text}]}}))


def _open(inv):
    r = client.get(f"/api/investigations/{inv}/evidence-pack.zip")
    assert r.status_code == 200, r.text
    return r, zipfile.ZipFile(io.BytesIO(r.content))


def test_no_write_up_no_pack(tmp_path):
    inv, _claim, _path = _case(tmp_path)
    assert client.get(f"/api/investigations/{inv}/evidence-pack.zip").status_code == 404


def test_the_pack_holds_the_write_up_its_exhibits_custody_readiness_and_a_manifest_that_checks(tmp_path):
    inv, claim_id, _path = _case(tmp_path)
    _write(inv, claim_id)
    r, z = _open(inv)
    names = set(z.namelist())
    assert {"index.html", "writeup.docx", "exhibits.csv", "exhibits/001/exhibit.html", "exhibits/001/passage.txt",
            f"custody/{claim_id}.txt", "readiness.json", "gaps.txt", "README.txt", "VERIFY.txt", "MANIFEST.sha256"} <= names
    assert 'href="exhibits/001/exhibit.html">1</a>' in z.read("index.html").decode()
    row = next(csv.DictReader(io.StringIO(z.read("exhibits.csv").decode())))
    assert row["quote"] == QUOTE and row["page"] == "3" and row["fingerprint_now"] == "matches" and len(row["sha256"]) == 64
    assert "supports: Harbour Nominees held 40%" in row["claims"]
    assert "Linked as supporting the claim" in z.read(f"custody/{claim_id}.txt").decode()
    readme = z.read("README.txt").decode()
    assert "They do not show what happened to a file before it was added" in readme
    # Legal read and right of reply are not recorded: a draft, said on the reply, the README and each page.
    assert r.headers["X-Pack-Draft"] == "1" and "EXPORT AS DRAFT" in readme and "Export as draft" in z.read("index.html").decode()
    for line in z.read("MANIFEST.sha256").decode().splitlines():
        digest, name = line.split("  ", 1)
        assert hashlib.sha256(z.read(name)).hexdigest() == digest
    assert "MANIFEST.sha256" not in z.read("MANIFEST.sha256").decode()


def test_a_changed_file_and_a_citation_to_nothing_are_gaps(tmp_path):
    inv, claim_id, path = _case(tmp_path)
    _write(inv, claim_id, gone=True)
    path.write_bytes(b"changed after it was added")
    r, z = _open(inv)
    gaps = z.read("gaps.txt").decode()
    assert "no longer matches its fingerprint" in gaps and "no longer in the case (gone-claim)" in gaps
    assert r.headers["X-Pack-Gaps"] == "2"
    assert next(csv.DictReader(io.StringIO(z.read("exhibits.csv").decode())))["fingerprint_now"] == "does not match"
    assert "[no exhibit]" in z.read("index.html").decode()
    with SessionLocal() as db:
        assert db.get(Document, next(iter(db.query(Document.id).filter(Document.investigation_id == inv)))[0]).sha256 != hashlib.sha256(path.read_bytes()).hexdigest()


def test_a_picture_goes_as_a_viewing_copy_without_its_metadata_and_a_protected_one_not_at_all(tmp_path, monkeypatch):
    from PIL import Image

    from app.core.config import settings

    from app.models.domain import AuthenticityItem
    from app.services.evidence_pack import viewing_copy

    buf = io.BytesIO()
    exif = Image.Exif()
    exif[0x010F] = "Testcam"  # Make
    Image.new("RGB", (40, 30), (90, 120, 60)).save(buf, "JPEG", exif=exif.tobytes())
    copy = viewing_copy(buf.getvalue())
    with Image.open(io.BytesIO(copy)) as im:
        assert im.size == (40, 30) and not im.getexif() and b"Testcam" not in copy

    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path))
    inv, claim_id, path = _case(tmp_path)
    photo = tmp_path / "fence.jpg"
    photo.write_bytes(buf.getvalue())
    with SessionLocal() as db:
        doc = db.query(Document).filter(Document.investigation_id == inv).one()
        doc.filename, doc.storage_path, doc.sha256 = "fence.jpg", str(photo), hashlib.sha256(buf.getvalue()).hexdigest()
        db.commit()
        doc_id = doc.id
    _write(inv, claim_id)
    _r, z = _open(inv)
    assert b"Testcam" not in z.read("exhibits/001/picture.jpg") and "viewing copy" in z.read("exhibits/001/exhibit.html").decode()
    with SessionLocal() as db:
        db.add(AuthenticityItem(document_id=doc_id, investigation_id=inv, status="unverified", role="events", source_protected=True,
                                checked=[], findings={}, about_evidence=[], suite_restore={}))
        db.commit()
    _r, z = _open(inv)
    assert "exhibits/001/picture.jpg" not in z.namelist() and "Source-protected" in z.read("exhibits/001/exhibit.html").decode()
