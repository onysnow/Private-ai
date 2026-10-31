"""Check a pack (app/services/pack_check.py, mockup CHECK_4): a pack sent back is read here, every file's SHA-256 is
recomputed and compared with the list kept when the pack was made; a changed exhibit picture is drawn again from the
case's own file and the band that differs is shown; a pack made elsewhere is compared with its own list only."""

import hashlib
import io
import zipfile

from PIL import Image

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.domain import Document, EvidencePack
from tests.test_evidence_pack import _case, _open, _write, client, printing_browser  # noqa: F401 (autouse fixture)


def _repack(z: zipfile.ZipFile, change: dict[str, bytes | None], prefix: str = "") -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as new:
        for name in z.namelist():
            data = change.get(name, z.read(name))
            if data is not None:
                new.writestr(prefix + name, data)
        for name, data in change.items():
            if name not in z.namelist() and data is not None:
                new.writestr(prefix + name, data)
    return out.getvalue()


def _check(inv: str, data: bytes) -> dict:
    r = client.post(f"/api/investigations/{inv}/evidence-pack/check", files={"file": ("pack.zip", data, "application/zip")})
    assert r.status_code == 200, r.text
    return r.json()


def _photo_case(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path))
    inv, claim_id, _path = _case(tmp_path)
    buf = io.BytesIO()
    Image.new("RGB", (60, 40), (90, 120, 60)).save(buf, "JPEG")
    photo = tmp_path / "fence.jpg"
    photo.write_bytes(buf.getvalue())
    with SessionLocal() as db:
        doc = db.query(Document).filter(Document.investigation_id == inv).one()
        doc.filename, doc.storage_path, doc.sha256 = "fence.jpg", str(photo), hashlib.sha256(buf.getvalue()).hexdigest()
        db.commit()
    _write(inv, claim_id)
    return inv, claim_id


def test_a_pack_as_made_is_whole_and_its_list_is_the_one_kept_here(tmp_path):
    inv, claim_id, _path = _case(tmp_path)
    _write(inv, claim_id)
    r, z = _open(inv)
    with SessionLocal() as db:
        kept = db.query(EvidencePack).filter_by(investigation_id=inv).one()
        assert kept.manifest == z.read("MANIFEST.sha256").decode() and kept.exhibits[0]["number"] == 1
    out = _check(inv, r.content)
    assert out["whole"] and out["made_here"] and out["compared_with"] == "the list kept here when it was made"
    assert out["counts"] == {"as_made": len(z.namelist()) - 3, "changed": 0, "missing": 0, "extra": 0}  # not the list and its signature
    assert out["pack_id"] == kept.id and out["signature"] == {"state": "valid", "fingerprint": kept.key_fingerprint, "ours": True, "as_made": True}
    # Zipped again inside a folder, it is the same pack.
    assert _check(inv, _repack(z, {}, prefix="from-the-lawyer/"))["whole"]


def test_a_changed_picture_is_drawn_again_and_what_rests_on_it_is_named(tmp_path, monkeypatch):
    inv, claim_id = _photo_case(tmp_path, monkeypatch)
    _r, z = _open(inv)
    with Image.open(io.BytesIO(z.read("exhibits/001/picture.jpg"))) as im:
        edited = im.convert("RGB")
        for x in range(10, 30):
            for y in range(20, 25):
                edited.putpixel((x, y), (250, 250, 250))
        buf = io.BytesIO()
        edited.save(buf, "JPEG", quality=95)
    sent_back = _repack(z, {"exhibits/001/picture.jpg": buf.getvalue(), f"custody/{claim_id}.txt": None, "notes.txt": b"added",
                            "exhibits/001/picture (1).jpg": buf.getvalue()})
    out = _check(inv, sent_back)
    assert not out["whole"] and out["counts"]["changed"] == 1 and out["counts"]["missing"] == 1 and out["counts"]["extra"] == 2
    # A copy added beside the exhibit is not in the list, and not the exhibit changing a second time.
    assert [e["file"] for e in out["exhibits"]] == ["picture.jpg"]
    states = {r["name"]: r for r in out["rows"]}
    assert states["exhibits/001/picture.jpg"]["state"] == "changed"
    assert states[f"custody/{claim_id}.txt"]["about"] == "the chain of custody of “Harbour Nominees held 40% of Fernhill Ltd.”"
    ex = next(e for e in out["exhibits"] if e["file"] == "picture.jpg")
    assert ex["redrawn"] and ex["ours"].startswith("data:image/png") and ex["theirs"].startswith("data:image/png")
    assert ex["case_file"] == "matches" and ex["claims"] == ["Harbour Nominees held 40% of Fernhill Ltd."]
    d = ex["differs"]
    assert d and 0.1 <= d["left"] <= 0.25 and 0.4 <= d["top"] <= 0.55, d


def test_a_redone_list_is_caught_and_a_pack_from_elsewhere_checks_only_against_itself(tmp_path):
    inv, claim_id, _path = _case(tmp_path)
    _write(inv, claim_id)
    _r, z = _open(inv)
    # Someone changes the write-up and writes a new manifest to match: the list kept here still says no.
    page = z.read("index.html") + b"<p>One more sentence.</p>"
    manifest = z.read("MANIFEST.sha256").decode().replace(hashlib.sha256(z.read("index.html")).hexdigest(), hashlib.sha256(page).hexdigest())
    out = _check(inv, _repack(z, {"index.html": page, "MANIFEST.sha256": manifest.encode()}))
    assert out["list_changed"] and not out["whole"] and out["counts"]["changed"] == 1
    # In another case it is not this case's pack: whole against its own list, and it says which list that is.
    other = client.post("/api/investigations", json={"name": "Elsewhere"}).json()["id"]
    there = _check(other, _repack(z, {}))
    assert there["whole"] and not there["made_here"] and there["made_in_other_case"] == "Pack"
    assert there["compared_with"] == "the pack's own MANIFEST.sha256"


def test_what_is_not_a_pack_is_refused_in_words(tmp_path):
    inv, _claim, _path = _case(tmp_path)
    for data, words in ((b"not a zip", "not a .zip"), (_zip({"a.txt": b"x"}), "No MANIFEST.sha256"),
                        (_zip({"../escape.txt": b"x", "MANIFEST.sha256": b""}), "outside itself")):
        r = client.post(f"/api/investigations/{inv}/evidence-pack/check", files={"file": ("x.zip", data, "application/zip")})
        assert r.status_code == 422 and words in r.json()["detail"], r.text


def _zip(files: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        for name, data in files.items():
            z.writestr(name, data)
    return out.getvalue()


def test_the_list_is_signed_with_this_computers_key_and_a_wrong_signature_is_said(tmp_path):
    import subprocess

    inv, claim_id, _path = _case(tmp_path)
    _write(inv, claim_id)
    _r, z = _open(inv)
    assert {"MANIFEST.sha256.sig", "PUBLIC_KEY.pem"} <= set(z.namelist())
    assert "MANIFEST.sha256.sig" not in z.read("MANIFEST.sha256").decode()
    # Anyone can check it with stock OpenSSL, as VERIFY.txt says.
    for name in ("MANIFEST.sha256", "MANIFEST.sha256.sig", "PUBLIC_KEY.pem"):
        (tmp_path / name).write_bytes(z.read(name))
    said = subprocess.run(["openssl", "pkeyutl", "-verify", "-pubin", "-inkey", "PUBLIC_KEY.pem", "-rawin", "-in", "MANIFEST.sha256",
                           "-sigfile", "MANIFEST.sha256.sig"], cwd=tmp_path, capture_output=True, text=True)
    assert "Signature Verified Successfully" in said.stdout, said.stdout + said.stderr
    # A list changed after signing no longer verifies.
    bad = _check(inv, _repack(z, {"MANIFEST.sha256": z.read("MANIFEST.sha256") + b"0" * 64 + b"  notes.txt\n"}))
    assert bad["signature"]["state"] == "invalid" and not bad["whole"]
    # The same key signs every pack made on this computer.
    _r2, z2 = _open(inv)
    assert z2.read("PUBLIC_KEY.pem") == z.read("PUBLIC_KEY.pem")
