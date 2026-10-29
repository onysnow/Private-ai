"""Is it real? (mockup CHECK_3, ADR-0023, app/services/authenticity.py): content credentials validated here against a
trust list, findings recorded in an append-only history, a status only a person sets with what they checked and why,
what a synthetic decision does to the claims that lean on the item, its role, the suite's DISPUTED and its restore,
local comparison, and outside checks allowed once with consent and refused for a source-protected item.

The signed pictures are made here: a test certificate authority and a signer named "Pixelforge Studio (sample)" sign a
small JPEG whose manifest says it was created with generative AI. The trust list is that authority alone (trusted) or
the bundled official list (valid, signer not trusted).
"""

from __future__ import annotations

import datetime
import io
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import (
    AuthenticityCheck, AuthenticityItem, Claim, ClaimEvidenceLink, Document, DocumentChunk, Evidence, OutboundRequest, Source,
)
from app.services import authenticity
from app.services.claim_done import done_checks
from app.services.exports import build_investigation_export, restore_investigation_export
from app.services.lifecycle import delete_investigation

c2pa = pytest.importorskip("c2pa")
client = TestClient(app)


@pytest.fixture(autouse=True)
def storage(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "documents"))


def _picture(colour=(120, 160, 90), size=(64, 48), quality=75) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", size, colour)
    for x in range(0, size[0], 8):
        for y in range(size[1]):
            img.putpixel((x, y), (250, 250, 250))
    img.save(buf, "JPEG", quality=quality)
    return buf.getvalue()


@pytest.fixture(scope="module")
def signed() -> tuple[bytes, str]:
    """A JPEG signed by a test signer whose manifest declares generative AI, and the signer's root as PEM."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

    now = datetime.datetime.now(datetime.timezone.utc)

    def name(cn: str) -> x509.Name:
        return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn), x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Test Signer")])

    usage = dict(content_commitment=False, key_encipherment=False, data_encipherment=False, key_agreement=False,
                 encipher_only=False, decipher_only=False)
    ca_key = ec.generate_private_key(ec.SECP256R1())
    ca = (x509.CertificateBuilder().subject_name(name("Test Root")).issuer_name(name("Test Root")).public_key(ca_key.public_key())
          .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(days=1))
          .not_valid_after(now + datetime.timedelta(days=3650))
          .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
          .add_extension(x509.KeyUsage(digital_signature=False, key_cert_sign=True, crl_sign=True, **usage), critical=True)
          .sign(ca_key, hashes.SHA256()))
    key = ec.generate_private_key(ec.SECP256R1())
    leaf = (x509.CertificateBuilder().subject_name(name("Pixelforge Studio (sample)")).issuer_name(ca.subject).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=365))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.KeyUsage(digital_signature=True, key_cert_sign=False, crl_sign=False, **usage), critical=True)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.EMAIL_PROTECTION]), critical=False)
            .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
            .sign(ca_key, hashes.SHA256()))
    pem = serialization.Encoding.PEM
    chain = leaf.public_bytes(pem) + ca.public_bytes(pem)
    private = key.private_bytes(pem, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    manifest = {"claim_generator_info": [{"name": "test", "version": "1"}], "title": "parcel_aerial.jpg",
                "assertions": [{"label": "c2pa.actions.v2", "data": {"actions": [{"action": "c2pa.created",
                    "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"}]}}]}
    signer = c2pa.Signer.from_info(c2pa.C2paSignerInfo(alg=b"es256", sign_cert=chain, private_key=private, ta_url=None))
    out = io.BytesIO()
    c2pa.Builder(json.dumps(manifest)).sign(signer, "image/jpeg", io.BytesIO(_picture()), out)
    return out.getvalue(), ca.public_bytes(pem).decode()


def _case() -> str:
    return client.post("/api/investigations", json={"name": "Harbour land"}).json()["id"]


def _upload(inv: str, name: str, data: bytes, mime: str) -> str:
    r = client.post("/api/documents/upload", data={"investigation_id": inv, "title": name}, files={"file": (name, data, mime)})
    assert r.status_code in (200, 201, 202), r.text
    body = r.json()
    return body.get("document_id") or body.get("id") or body["document"]["id"]


def _claim(inv: str, doc_id: str, text: str, *, other_source: bool = False) -> str:
    """A claim supported by a quote from the item, and, when asked, by a second source too."""
    with SessionLocal() as db:
        doc = db.get(Document, doc_id)
        claim = Claim(investigation_id=inv, text=text, status="unverified")
        ev = Evidence(source_id=doc.source_id, document_id=doc.id, quote="the parcel", locator="the whole picture")
        db.add_all([claim, ev])
        db.flush()
        db.add(ClaimEvidenceLink(claim_id=claim.id, evidence_id=ev.id, stance="supports"))
        if other_source:
            src = Source(investigation_id=inv, title="Land registry filing", source_type="public_record")
            db.add(src)
            db.flush()
            other = Evidence(source_id=src.id, quote="Kestrel SA", locator="p. 3")
            db.add(other)
            db.flush()
            db.add(ClaimEvidenceLink(claim_id=claim.id, evidence_id=other.id, stance="supports"))
        db.commit()
        return claim.id


def test_content_credentials_are_validated_here_against_the_trust_list(signed):
    data, root = signed
    trusted = authenticity.read_credentials(data, "image/jpeg", trust_pem=root)
    assert trusted["state"] == "trusted"
    assert trusted["signer"] == "Pixelforge Studio (sample)" and trusted["source_types"] == ["trainedAlgorithmicMedia"]
    official = authenticity.read_credentials(data, "image/jpeg")  # the bundled list: the test root is not on it
    assert official["state"] == "valid" and "signingCredential.untrusted" in official["failures"]
    tampered = bytearray(data)
    tampered[-30] ^= 0xFF
    assert authenticity.read_credentials(bytes(tampered), "image/jpeg", trust_pem=root)["state"] == "invalid"
    assert authenticity.read_credentials(_picture(), "image/jpeg")["state"] == "absent"


def test_the_bundled_trust_list_is_the_one_its_source_note_names():
    import hashlib

    note = (authenticity.TRUST_DIR / "SOURCE.md").read_text()
    digest = hashlib.sha256(authenticity.TRUST_LIST.read_bytes()).hexdigest()
    assert digest in note and authenticity.TRUST_LIST_DATE in note


def test_opening_the_screen_records_findings_and_a_review_flag_but_no_status(signed):
    inv = _case()
    doc_id = _upload(inv, "parcel_aerial.jpg", signed[0], "image/jpeg")
    out = client.get(f"/api/documents/{doc_id}/authenticity").json()
    assert out["status"] == "unverified" and out["role"] == "events"
    prov = out["findings"]["provenance"]
    assert prov["state"] == "valid" and prov["signer"] == "Pixelforge Studio (sample)"
    assert [f["key"] for f in out["findings"]["flags"]] == ["ai_declared"]
    assert out["findings"]["hints"]["state"] == "off_by_default"
    assert out["findings"]["jpeg_quality"] == 75 and "quality about 75" in out["item"]["note"]
    kinds = [h["kind"] for h in out["history"]]
    assert set(kinds) == {"intake", "provenance", "flag", "source", "hints"} and all(h["actor"] == "system" for h in out["history"])
    # Opening it again records nothing new; examining again adds lines and changes none.
    again = client.get(f"/api/documents/{doc_id}/authenticity").json()
    assert len(again["history"]) == len(out["history"])
    first_ids = {h["id"] for h in out["history"]}
    more = client.post(f"/api/documents/{doc_id}/authenticity/examine").json()
    assert first_ids < {h["id"] for h in more["history"]}


def test_a_decision_needs_what_was_checked_and_a_reason(signed):
    inv = _case()
    doc_id = _upload(inv, "parcel_aerial.jpg", signed[0], "image/jpeg")
    client.get(f"/api/documents/{doc_id}/authenticity")
    url = f"/api/documents/{doc_id}/authenticity/decision"
    assert client.post(url, json={"status": "likely_synthetic", "checked": [], "reason": "The signer says AI made it."}).status_code == 409
    assert client.post(url, json={"status": "likely_synthetic", "checked": ["read_findings"], "reason": "AI"}).status_code == 409
    same = client.post(url, json={"status": "unverified", "checked": ["read_findings"], "reason": "Nothing either way yet."})
    assert same.status_code == 409 and "different status" in same.json()["detail"]
    ok = client.post(url, json={"status": "confirmed_synthetic", "checked": ["read_findings", "compared_copies"],
                                "reason": "Signed manifest declares generative AI; account dates conflict with the post."})
    assert ok.status_code == 200
    body = ok.json()
    assert body["status"] == "confirmed_synthetic" and body["checked"] == ["read_findings", "compared_copies"]
    line = body["history"][0]
    assert line["kind"] == "decision" and line["actor"] == "person" and "was “Unverified”" in line["text"]


def test_synthetic_as_evidence_of_events_takes_its_support_away_and_shows_the_suite_disputed(signed):
    inv = _case()
    doc_id = _upload(inv, "parcel_aerial.jpg", signed[0], "image/jpeg")
    alone = _claim(inv, doc_id, "The parcel was fenced off by March 2019.")
    backed = _claim(inv, doc_id, "The sign on the fence named Kestrel SA as owner.", other_source=True)
    preview = client.get(f"/api/documents/{doc_id}/authenticity/preview", params={"status": "likely_synthetic"}).json()
    assert preview["blocking"] and not preview["applied"] and preview["losing"] == 1
    outcomes = {c["id"]: c for c in preview["claims"]}
    assert outcomes[alone]["outcome"] == "loses"
    assert outcomes[backed]["outcome"] == "keeps" and outcomes[backed]["other"]["source"] == "Land registry filing"
    with SessionLocal() as db:
        assert done_checks(db, db.get(Claim, alone))["rules"][0]["state"] == "met"
    client.post(f"/api/documents/{doc_id}/authenticity/decision", json={
        "status": "likely_synthetic", "checked": ["read_findings"], "reason": "The signer says generative AI made it."})
    with SessionLocal() as db:
        rule = done_checks(db, db.get(Claim, alone))["rules"][0]
        assert rule["state"] == "not_met" and "only by a synthetic source" in rule["detail"]
        assert done_checks(db, db.get(Claim, backed))["rules"][0]["state"] == "met"
        evs = list(db.scalars(select(Evidence).where(Evidence.document_id == doc_id)))
        assert evs and all(e.authenticity_status == "DISPUTED" for e in evs)
    # As the subject of the story, the claims about what it shows stay without it; a claim about the item itself
    # (that it circulated, posted by whom) is supported by it, synthetic or not.
    subject = client.patch(f"/api/documents/{doc_id}/authenticity", json={"role": "subject"}).json()
    assert subject["preview"]["headline"].startswith("As the subject") and subject["preview"]["suggestion"].startswith("This image was online by")
    added = client.post(f"/api/documents/{doc_id}/authenticity/about-claim", json={"text": "This image circulated from 17 Mar 2019, posted by @harbourwatch."})
    assert added.status_code == 201
    about = next(c for c in added.json()["preview"]["claims"] if c["outcome"] == "about")
    with SessionLocal() as db:
        assert done_checks(db, db.get(Claim, about["id"]))["rules"][0]["state"] == "met"
        assert done_checks(db, db.get(Claim, alone))["rules"][0]["state"] == "not_met"
    # Undone, the suite's earlier values come back.
    client.post(f"/api/documents/{doc_id}/authenticity/decision", json={
        "status": "unverified", "checked": ["compared_copies"], "reason": "The poster sent the original camera file."})
    with SessionLocal() as db:
        assert done_checks(db, db.get(Claim, alone))["rules"][0]["state"] == "met"
        assert all(e.authenticity_status is None for e in db.scalars(select(Evidence).where(Evidence.document_id == doc_id)))


def test_outside_checks_are_consented_logged_and_blocked_for_a_protected_item(signed):
    inv = _case()
    doc_id = _upload(inv, "parcel_aerial.jpg", signed[0], "image/jpeg")
    with SessionLocal() as db:
        doc = db.get(Document, doc_id)
        db.get(Source, doc.source_id).url = "https://social.example/@harbourwatch/post/88213/photo.jpg"
        db.commit()
    out = client.get(f"/api/documents/{doc_id}/authenticity").json()
    options = {o["key"]: o for o in out["outside"]}
    assert options["tineye"]["available"] and options["tineye"]["sends"].endswith("/88213/photo.jpg")
    assert not options["upload"]["available"] and not options["cloud_detector"]["available"]
    sent = client.post(f"/api/documents/{doc_id}/authenticity/outside", json={"option": "tineye"}).json()
    assert sent["url"].startswith("https://tineye.com/search?url=https%3A%2F%2Fsocial.example")
    client.patch(f"/api/documents/{doc_id}/authenticity", json={"source_protected": True})
    blocked = client.post(f"/api/documents/{doc_id}/authenticity/outside", json={"option": "lens"})
    assert blocked.status_code == 409 and "source-protected" in blocked.json()["detail"]
    with SessionLocal() as db:
        rows = list(db.scalars(select(OutboundRequest).where(OutboundRequest.investigation_id == inv)))
        # Written in the same second on a fast run, so compared without their order.
        assert sorted((r.service, r.outcome) for r in rows if r.service in ("TinEye", "authenticity")) == [("TinEye", "sent"), ("authenticity", "blocked")]
    # Comparing with the case's own files stays possible: nothing leaves.
    _upload(inv, "same_picture.jpg", _picture(quality=60), "image/jpeg")
    compared = client.post(f"/api/documents/{doc_id}/authenticity/compare").json()
    assert compared["pool"] == 1 and len(compared["matches"]) == 1


def test_a_short_text_has_its_hint_suppressed_and_sentences_are_compared_locally():
    inv = _case()
    words = "The council was told the lease would be signed quietly and members were never shown the terms of it."
    a = _upload(inv, "page.txt", words.encode(), "text/plain")
    b = _upload(inv, "courier.txt", ("Earlier report. " + words).encode(), "text/plain")
    with SessionLocal() as db:
        for doc_id, text in ((a, words), (b, "Earlier report. " + words)):
            if not db.scalar(select(DocumentChunk).where(DocumentChunk.document_id == doc_id)):
                db.add(DocumentChunk(document_id=doc_id, investigation_id=inv, ordinal=0, text=text))
        db.commit()
    out = client.get(f"/api/documents/{a}/authenticity").json()
    assert out["item"]["kind"] == "text" and out["findings"]["provenance"]["state"] == "absent"
    assert out["findings"]["hints"]["state"] == "suppressed"
    web = next(o for o in out["outside"] if o["key"] == "web")
    assert web["available"] and "council was told" in web["sends"]
    compared = client.post(f"/api/documents/{a}/authenticity/compare").json()
    assert compared["matches"] and compared["matches"][0]["document_id"] == b


def test_the_history_goes_with_the_case_in_a_backup_and_with_it_when_deleted(signed):
    inv = _case()
    doc_id = _upload(inv, "parcel_aerial.jpg", signed[0], "image/jpeg")
    client.get(f"/api/documents/{doc_id}/authenticity")
    with SessionLocal() as db:
        n = len(list(db.scalars(select(AuthenticityCheck).where(AuthenticityCheck.document_id == doc_id))))
        data, manifest = build_investigation_export(db, inv)
        assert manifest["record_counts"]["authenticity_items"] == 1 and manifest["record_counts"]["authenticity_checks"] == n
        delete_investigation(db, inv, settings.document_storage_dir, confirmation=inv)
        assert db.get(AuthenticityItem, doc_id) is None
        restore_investigation_export(db, data, Path(settings.document_storage_dir))
        assert db.get(AuthenticityItem, doc_id) is not None
        assert len(list(db.scalars(select(AuthenticityCheck).where(AuthenticityCheck.document_id == doc_id)))) == n


def test_kind_follows_the_file():
    doc = Document(filename="clip.mp4", mime_type="video/mp4", sha256="0" * 64, storage_path=str(Path("/nowhere")))
    assert authenticity.kind_of(doc) == "video"
