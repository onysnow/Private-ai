"""A capture's outside witnesses (app/services/capture_witness.py, ADR-0025; mockup INTAKE_3): a time proof, a second
witness and a copy looked for elsewhere. Each is asked for by a person, logged before it goes, sends only the
fingerprint or the address, never runs for a source-protected item, and leaves the kept files as they were.

The outside services are stood in for by `capture_witness.send`. The time server's answers are two real RFC 3161
tokens kept in tests/fixtures/time_proof/, both over the five bytes "hello" and answering one request (its nonce
below), so the check here runs against the bundled roots for real.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.time import utcnow_naive
from app.db.session import SessionLocal
from app.models.domain import AuthenticityItem, Capture, Document, OutboundRequest, Source
from app.services import capture_witness
from app.services.web_capture import capture_dir
from tests.test_following import _case, client

FIXTURES = Path(__file__).parent / "fixtures" / "time_proof"
WARC = b"hello"
NONCE = 3426957407254283261
URL = "https://news.example/2019/03/harbour-parcel"


def _capture(inv: str, *, outcome: str = "saved", status: str = "finished") -> str:
    with SessionLocal() as db:
        row = Capture(investigation_id=inv, url=URL, final_url=URL, status=status, outcome=outcome, http_status=200 if outcome == "saved" else 404,
                      captured_at=utcnow_naive(), finished_at=utcnow_naive(), files=[], displayed={}, stages=[], exchange={}, media={})
        db.add(row)
        db.flush()
        if outcome == "saved":
            folder = capture_dir(settings.document_storage_dir, inv, row.id)
            folder.mkdir(parents=True, exist_ok=True)
            (folder / "page.warc.gz").write_bytes(WARC)
            row.files = [{"name": "page.warc.gz", "role": "what the browser loaded (WARC)", "bytes": len(WARC),
                          "sha256": hashlib.sha256(WARC).hexdigest()}]
        db.commit()
        return row.id


class Fake:
    def __init__(self, *answers: capture_witness.Reply | Exception) -> None:
        self.answers = list(answers)
        self.calls: list[tuple[str, str, bytes | None]] = []

    def __call__(self, method: str, url: str, *, content: bytes | None = None, headers: dict | None = None, timeout: float = 0) -> capture_witness.Reply:
        self.calls.append((method, url, content))
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


@pytest.fixture
def outside(monkeypatch):
    fake = Fake()
    monkeypatch.setattr(capture_witness, "send", fake)
    monkeypatch.setattr(capture_witness, "_request_for", lambda warc: (b"request-for-" + hashlib.sha256(warc).hexdigest().encode(), NONCE))
    return fake


def _token(name: str = "freetsa-hello.tsr") -> capture_witness.Reply:
    return capture_witness.Reply(200, {"content-type": "application/timestamp-reply"}, (FIXTURES / name).read_bytes(), "")


def _log(inv: str) -> list[OutboundRequest]:
    with SessionLocal() as db:
        return list(db.scalars(select(OutboundRequest).where(OutboundRequest.investigation_id == inv).order_by(OutboundRequest.at)))


def test_a_time_proof_sends_the_fingerprint_only_keeps_the_token_and_checks_it_here(outside):
    inv = _case()
    cid = _capture(inv)
    outside.answers = [_token()]
    r = client.post(f"/api/captures/{cid}/time-proof")
    assert r.status_code == 200, r.text
    proof = r.json()["witnesses"]["time_proof"]
    fingerprint = hashlib.sha256(WARC).hexdigest()
    assert proof["state"] == "stamped" and proof["check"] == "checked" and "Free TSA" in proof["check_detail"]
    assert proof["fingerprint"] == fingerprint, proof
    assert proof["sent"] == fingerprint and proof["server"] == settings.capture_time_server
    assert proof["time"].startswith("2026-10-29") and proof["serial"] and proof["token"] == "timestamp.tsr"
    # What went: the request for the fingerprint, nothing of the page.
    (method, url, content), = outside.calls
    assert method == "POST" and url == settings.capture_time_server and WARC not in (content or b"")
    line, = _log(inv)
    assert line.kind == "fingerprint" and line.value == fingerprint and line.outcome == "sent" and line.service == "time server (freetsa.org)"
    # The token is a new file beside the others, hashed like them; the WARC is as it was.
    files = {f["name"]: f for f in r.json()["files"]}
    token = (FIXTURES / "freetsa-hello.tsr").read_bytes()
    assert files["timestamp.tsr"]["sha256"] == hashlib.sha256(token).hexdigest()
    assert files["page.warc.gz"]["sha256"] == fingerprint
    folder = capture_dir(settings.document_storage_dir, inv, cid)
    assert (folder / "timestamp.tsr").read_bytes() == token and (folder / "page.warc.gz").read_bytes() == WARC
    assert client.get(f"/api/captures/{cid}/files/timestamp.tsr").content == token
    # Asked again: it is stamped already, and nothing goes.
    assert client.post(f"/api/captures/{cid}/time-proof").json()["witnesses"]["time_proof"]["state"] == "stamped"
    assert len(outside.calls) == 1 and len(_log(inv)) == 1


def test_a_token_for_other_bytes_or_another_request_is_refused_and_says_why(outside):
    inv = _case()
    cid = _capture(inv)
    with SessionLocal() as db:
        row = db.get(Capture, cid)
        (capture_dir(settings.document_storage_dir, inv, cid) / "page.warc.gz").write_bytes(b"other bytes")
        row.files = [{**row.files[0], "sha256": hashlib.sha256(b"other bytes").hexdigest()}]
        db.commit()
    outside.answers = [_token()]
    proof = client.post(f"/api/captures/{cid}/time-proof").json()["witnesses"]["time_proof"]
    assert proof["state"] == "failed" and proof["reason"] == capture_witness.FAILED["mismatch"]
    assert _log(inv)[0].outcome == "failed"
    assert not (capture_dir(settings.document_storage_dir, inv, cid) / "timestamp.tsr").exists()
    # The nonce is part of the check: the same token does not answer another request.
    checked = capture_witness.check_token((FIXTURES / "freetsa-hello.tsr").read_bytes(), WARC, NONCE + 1)
    assert checked["check"] == "failed"
    assert capture_witness.check_token((FIXTURES / "sigstore-hello.tsr").read_bytes(), WARC, NONCE)["check"] == "checked"


def test_a_server_that_cannot_be_reached_or_is_busy_leaves_the_capture_as_it_was(outside):
    inv = _case()
    cid = _capture(inv)
    outside.answers = [OSError("timeout"), capture_witness.Reply(429, {}, b"", "")]
    first = client.post(f"/api/captures/{cid}/time-proof").json()
    assert first["witnesses"]["time_proof"]["reason"] == "The service did not answer in time."
    second = client.post(f"/api/captures/{cid}/time-proof").json()
    assert second["witnesses"]["time_proof"]["reason"] == capture_witness.FAILED["busy"]
    assert [f["name"] for f in second["files"]] == ["page.warc.gz"]
    assert [line.outcome for line in _log(inv)] == ["failed", "failed"]


def test_a_second_witness_sends_the_address_and_keeps_where_the_archive_put_its_copy(outside):
    inv = _case()
    cid = _capture(inv)
    outside.answers = [capture_witness.Reply(200, {"content-location": f"/web/20261029101412/{URL}"}, b"", "")]
    archive = client.post(f"/api/captures/{cid}/second-witness").json()["witnesses"]["archive"]
    assert archive["state"] == "saved" and archive["url"] == f"https://web.archive.org/web/20261029101412/{URL}"
    assert archive["archived_at"].startswith("2026-10-29T10:14:12") and archive["sent"] == URL
    (method, url, _content), = outside.calls
    assert method == "GET" and url == capture_witness.ARCHIVE_SAVE + URL
    line, = _log(inv)
    assert line.service == "Internet Archive" and line.kind == "link" and line.value == URL


def test_look_for_a_copy_elsewhere_is_for_a_page_not_kept_here(outside):
    inv = _case()
    saved = _capture(inv)
    assert client.post(f"/api/captures/{saved}/look-elsewhere").status_code == 409
    gone = _capture(inv, outcome="link_only")
    assert client.post(f"/api/captures/{gone}/time-proof").status_code == 409  # nothing to sign
    found = {"archived_snapshots": {"closest": {"available": True, "status": "200", "timestamp": "20190318094011",
                                                "url": f"http://web.archive.org/web/20190318094011/{URL}"}}}
    outside.answers = [capture_witness.Reply(200, {}, json.dumps(found).encode(), ""),
                       capture_witness.Reply(200, {}, b'{"archived_snapshots": {}}', "")]
    elsewhere = client.post(f"/api/captures/{gone}/look-elsewhere").json()["witnesses"]["elsewhere"]
    assert elsewhere["state"] == "found" and elsewhere["url"] == f"https://web.archive.org/web/20190318094011/{URL}"
    assert elsewhere["archived_at"].startswith("2019-03-18T09:40:11")
    assert outside.calls[0][1].startswith(capture_witness.ARCHIVE_LOOKUP + "?url=https%3A%2F%2Fnews.example")
    assert client.post(f"/api/captures/{gone}/look-elsewhere").json()["witnesses"]["elsewhere"]["state"] == "none"


def test_nothing_is_sent_for_a_source_protected_capture(outside):
    inv = _case()
    cid = _capture(inv)
    with SessionLocal() as db:
        source = Source(investigation_id=inv, title="Harbour parcel", url=URL)
        db.add(source)
        db.flush()
        doc = Document(investigation_id=inv, source_id=source.id, filename="page.html", sha256="0" * 64, storage_path="/nowhere", extraction_status="complete")
        db.add(doc)
        db.flush()
        db.get(Capture, cid).document_id = doc.id
        db.add(AuthenticityItem(document_id=doc.id, investigation_id=inv, status="unverified", role="events", source_protected=True,
                                checked=[], findings={}, about_evidence=[], suite_restore={}))
        db.commit()
    for path in ("time-proof", "second-witness"):
        r = client.post(f"/api/captures/{cid}/{path}")
        assert r.status_code == 409 and "source-protected" in r.json()["detail"]
    assert outside.calls == []
    assert [line.outcome for line in _log(inv)] == ["blocked", "blocked"]
    assert client.get(f"/api/captures/{cid}").json()["source_protected"] is True


def test_the_switches_a_capture_starts_with_are_asked_once_it_is_kept(outside):
    inv = _case()
    cid = _capture(inv)
    outside.answers = [_token(), capture_witness.Reply(302, {"location": f"https://web.archive.org/web/20261029101412/{URL}"}, b"", "")]
    with SessionLocal() as db:
        row = db.get(Capture, cid)
        capture_witness.ask_when_saved(row, time_proof_on=True, second_witness_on=True)
        db.commit()
        capture_witness.after_capture(db, row)
    out = client.get(f"/api/captures/{cid}").json()["witnesses"]
    assert out["time_proof"]["state"] == "stamped" and out["archive"]["state"] == "saved" and "asked" not in out
    # Off means off: a capture started without them asks nothing.
    other = _capture(inv)
    with SessionLocal() as db:
        capture_witness.after_capture(db, db.get(Capture, other))
    assert len(outside.calls) == 2


def test_the_capture_route_takes_the_two_switches(monkeypatch):
    seen = {}
    monkeypatch.setattr(capture_witness, "ask_when_saved", lambda row, **asked: seen.update(asked))
    inv = _case()
    client.post(f"/api/investigations/{inv}/captures", json={"url": URL, "time_proof": True})
    assert seen == {"time_proof_on": True, "second_witness_on": False}
