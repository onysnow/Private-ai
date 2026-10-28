"""Web capture (ADR-0018, app/services/web_capture.py): which addresses are visited, what a visit keeps and how it is
hashed, the case document and CAPT record it makes, and its files through backup, deletion and restore.

The visits run a real Chromium against pages served on this machine. Loopback is refused to the capture for real, so
those tests let 127.0.0.1 through by replacing the host check; the check itself is tested on its own."""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import CaseRecord, Capture, Document, DocumentChunk, Investigation, OutboundRequest, Source
from app.services import web_capture
from app.services.exports import (_capture_file_entries, build_investigation_export, preview_investigation_restore,
                                  restore_investigation_export)
from app.services.lifecycle import delete_investigation, preview_investigation_deletion

client = TestClient(app)


# --- Which addresses are visited -----------------------------------------------------------------------------------

@pytest.mark.parametrize("url", [
    "ftp://example.org/x", "file:///etc/passwd", "example.org", "http://localhost:8000/", "http://app.localhost/",
    "http://127.0.0.1/", "http://10.1.2.3/", "http://192.168.0.1/", "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://100.64.0.1/", "http://0.0.0.0/",
])
def test_addresses_that_are_never_visited(url):
    with pytest.raises(web_capture.CaptureRefused):
        web_capture.check_address(url)


def test_a_public_address_is_accepted():
    web_capture.check_address("https://example.org/news/1?x=2")
    web_capture.check_address("http://93.184.215.14/")


def _resolves_to(monkeypatch, *addresses):
    def fake(host, port, *a, **k):
        if not addresses:
            raise socket.gaierror("no such name")
        return [(socket.AF_INET6 if ":" in a_ else socket.AF_INET, socket.SOCK_STREAM, 6, "", (a_, port)) for a_ in addresses]
    monkeypatch.setattr(web_capture.socket, "getaddrinfo", fake)


def test_a_name_must_resolve_only_to_public_addresses(monkeypatch):
    _resolves_to(monkeypatch, "93.184.215.14")
    assert web_capture.host_allowed("example.org") is True
    _resolves_to(monkeypatch, "93.184.215.14", "10.0.0.5")  # one private answer is enough to refuse
    assert web_capture.host_allowed("rebind.example") is False
    _resolves_to(monkeypatch, "::ffff:169.254.169.254")
    assert web_capture.host_allowed("metadata.example") is False
    _resolves_to(monkeypatch)
    assert web_capture.host_allowed("nowhere.example") is False


def test_api_refuses_a_private_address_before_queueing():
    inv = client.post("/api/investigations", json={"name": "Capture refusals"}).json()["id"]
    r = client.post(f"/api/investigations/{inv}/captures", json={"url": "http://169.254.169.254/latest/"})
    assert r.status_code == 422
    assert "private or local" in r.json()["detail"]
    assert client.get(f"/api/investigations/{inv}/captures").json() == []
    assert client.post("/api/investigations/nope/captures", json={"url": "https://example.org/"}).status_code == 404


# --- What a visit's files are --------------------------------------------------------------------------------------

def test_outcomes():
    V = web_capture.Visit
    assert web_capture.classify(V(response_status=200)) == ("saved", None)
    assert web_capture.classify(V(response_status=403))[0] == "not_seen"
    assert web_capture.classify(V(response_status=404)) == ("link_only", "The site answered HTTP 404")
    assert web_capture.classify(V(error="The page did not load in time")) == ("link_only", "The page did not load in time")


def test_warc_is_written_from_the_har_with_decoded_bodies():
    from warcio.archiveiterator import ArchiveIterator

    png = b"\x89PNG\r\n\x1a\nfake"
    har = {"log": {"entries": [
        {"startedDateTime": "2026-10-28T10:00:00.000Z",
         "request": {"method": "GET", "url": "https://example.org/a?b=1", "headers": [{"name": ":authority", "value": "example.org"}, {"name": "Accept", "value": "*/*"}]},
         "response": {"status": 200, "statusText": "OK",
                      "headers": [{"name": "Content-Type", "value": "text/html"}, {"name": "Content-Encoding", "value": "gzip"},
                                  {"name": "Content-Length", "value": "3"}],
                      "content": {"text": "<p>Hello</p>"}}},
        {"startedDateTime": "2026-10-28T10:00:01.000Z", "request": {"method": "GET", "url": "https://example.org/p.png", "headers": []},
         "response": {"status": 200, "statusText": "OK", "headers": [], "content": {"text": base64.b64encode(png).decode(), "encoding": "base64"}}},
        {"startedDateTime": "2026-10-28T10:00:02.000Z", "request": {"method": "GET", "url": "http://10.0.0.1/x", "headers": []},
         "response": {"status": -1, "headers": [], "content": {}}},
        {"startedDateTime": "2026-10-28T10:00:02.000Z", "request": {"method": "GET", "url": "data:image/gif;base64,AAAA", "headers": []},
         "response": {"status": 200, "headers": [], "content": {}}},
    ]}}
    warc = web_capture.warc_from_har(json.dumps(har).encode(), "test tool")
    records = []
    for record in ArchiveIterator(io.BytesIO(warc)):
        records.append((record.rec_type, record.rec_headers.get_header("WARC-Target-URI"), record))
        if record.rec_type == "response":
            body = record.content_stream().read()
            headers = dict(record.http_headers.headers)
            assert "Content-Encoding" not in headers
            assert headers["Content-Length"] == str(len(body))
            assert body == (b"<p>Hello</p>" if record.rec_headers.get_header("WARC-Target-URI").endswith("?b=1") else png)
        if record.rec_type == "request":
            assert ":authority" not in dict(record.http_headers.headers)
    assert [(t, u) for t, u, _ in records] == [
        ("warcinfo", None), ("response", "https://example.org/a?b=1"), ("request", "https://example.org/a?b=1"),
        ("response", "https://example.org/p.png"), ("request", "https://example.org/p.png")]
    assert records[0][2].rec_headers.get_header("WARC-Type") == "warcinfo"
    assert records[1][2].rec_headers.get_header("WARC-Date") == "2026-10-28T10:00:00.000000Z"


def test_screenshot_band_states_address_and_clock():
    from datetime import datetime, timezone

    from PIL import Image

    shot = Image.new("RGB", (800, 300), (255, 255, 255))
    buf = io.BytesIO()
    shot.save(buf, format="PNG")
    out = Image.open(io.BytesIO(web_capture.banded_screenshot(buf.getvalue(), "https://example.org/" + "x" * 300,
                                                              datetime(2026, 10, 28, 10, 0, tzinfo=timezone.utc))))
    assert out.size == (800, 300 + web_capture.BAND_HEIGHT)
    assert out.getpixel((2, 2)) == (17, 17, 17)
    assert out.getpixel((2, web_capture.BAND_HEIGHT + 2)) == (255, 255, 255)


def test_restore_refuses_capture_files_the_backup_does_not_list_or_whose_hash_differs():
    records = {"captures": [{"id": "c1", "files": [{"name": "page.html", "sha256": "a" * 64}]}]}
    manifest = {"capture_files": [{"capture_id": "c1", "name": "page.html", "sha256": "a" * 64},
                                  {"capture_id": "c2", "name": "page.html", "sha256": "a" * 64},
                                  {"capture_id": "c1", "name": "../../etc/x", "sha256": "a" * 64},
                                  {"capture_id": "c1", "name": "page.html", "sha256": "b" * 64}]}
    problems = [problem for _, problem in _capture_file_entries(manifest, records)]
    assert problems[0] is None and problems[1] and problems[2]
    assert problems[3] == "Capture file page.html does not match the SHA-256 its capture recorded"


@pytest.mark.parametrize("url", ["http://[", "https://[::1", "http://exa mple.org/"])
def test_a_malformed_address_is_refused_not_a_server_error(url):
    inv = client.post("/api/investigations", json={"name": "Malformed"}).json()["id"]
    r = client.post(f"/api/investigations/{inv}/captures", json={"url": url})
    assert r.status_code == 422 and "is not a web address" in r.json()["detail"]


# --- A real visit --------------------------------------------------------------------------------------------------

PAGE = b"""<!doctype html><html><head><title>Harbour deal</title><meta name="author" content="J. Doe">
<meta property="article:published_time" content="2026-10-01"></head>
<body><main><h1>Harbour deal</h1><p>Kestrel SA bought the harbour land in March 2019.</p>
<img src="/pic.png"><img src="http://10.0.0.1/tracker.png"></main></body></html>"""
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


class _Site(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        routes = {"/story": (200, "text/html", PAGE), "/pic.png": (200, "image/png", PNG),
                  "/robots.txt": (200, "text/plain", b"User-agent: *\nDisallow: /story\n"),
                  "/members": (403, "text/html", b"<p>Log in to read</p>"), "/gone": (404, "text/html", b"<p>Not here</p>"),
                  "/heavy": (200, "text/html", b"<html><body><p>Heavy page</p><script>fetch('/big.bin')</script></body></html>")}
        if self.path == "/cookie":  # a site that sets a cookie on its way to the page
            self.send_response(302)
            self.send_header("Set-Cookie", "sid=abc; Path=/")
            self.send_header("Location", "/story")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if self.path == "/big.bin":  # one large thing the page loads
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(3 * 1024 * 1024))
            self.end_headers()
            for _ in range(48):
                self.wfile.write(b"x" * 65536)
            return
        if self.path == "/jump":  # a redirect into the local network
            self.send_response(302)
            self.send_header("Location", "http://10.0.0.1/admin")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        status, kind, body = routes.get(self.path, (404, "text/plain", b"no"))
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def _browser_or_skip():
    from playwright.sync_api import sync_playwright

    try:
        with sync_playwright() as p:
            p.chromium.launch(executable_path=settings.capture_browser_path or None).close()
    except Exception as exc:
        if os.environ.get("CI"):
            raise  # CI installs the browser (backend-postgres-ci.yml): a missing one is a failure there
        pytest.skip(f"no capture browser here: {str(exc).splitlines()[0]}")


@pytest.fixture
def site(monkeypatch, tmp_path):
    # A machine whose Playwright browsers are not this package's own build names its headless shell explicitly.
    shells = sorted(Path("/opt/pw-browsers").glob("chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell"))
    if not settings.capture_browser_path and shells:
        monkeypatch.setattr(settings, "capture_browser_path", str(shells[-1]))
    _browser_or_skip()
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "documents"))
    monkeypatch.setattr(settings, "capture_timeout_seconds", 20.0)
    real = web_capture.resolve_public
    monkeypatch.setattr(web_capture, "resolve_public", lambda host, port: (
        [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))] if host == "127.0.0.1" else real(host, port)))
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Site)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def _capture(base: str, path: str, name: str = "Harbour") -> tuple[str, dict]:
    inv = client.post("/api/investigations", json={"name": name}).json()["id"]
    r = client.post(f"/api/investigations/{inv}/captures", json={"url": base + path})
    assert r.status_code == 200, r.text  # the inline runner finishes the job before it answers
    return inv, r.json()


def test_a_captured_page_is_kept_hashed_and_read(site):
    inv, cap = _capture(site, "/story")
    assert cap["status"] == "finished" and cap["outcome"] == "saved" and cap["suite_outcome"] == "OBTAINED"
    assert cap["http_status"] == 200 and cap["final_url"] == site + "/story"
    assert cap["started_at"] <= cap["captured_at"] <= cap["finished_at"]
    assert cap["displayed"] == {"title": "Harbour deal", "author": "J. Doe", "published": "2026-10-01"}
    assert cap["robots_disallowed"] is True  # noted, and the page was still kept
    assert cap["tool"].startswith("Journalism Workbench web capture: Playwright 1.64.1, Chromium ")
    assert cap["content_verified"] == "not done by this system"
    assert [f["name"] for f in cap["files"]] == ["page.html", "rendered.html", "screenshot.png", "page.har", "page.warc.gz"]
    assert [(s["key"], s["state"]) for s in cap["stages"]] == [(k, "done") for k, _ in web_capture.STAGES]
    assert all(isinstance(s["seconds"], float) for s in cap["stages"])
    assert cap["exchange"]["request"]["method"] == "GET" and cap["exchange"]["request"]["target"] == "/story"
    assert ["cookie", "(none)"] in cap["exchange"]["request"]["headers"]
    assert cap["exchange"]["response"]["status"].endswith("200 OK")
    assert ["content-type", "text/html"] in cap["exchange"]["response"]["headers"]

    for kept in cap["files"]:
        r = client.get(f"/api/captures/{cap['id']}/files/{kept['name']}")
        assert r.status_code == 200
        assert hashlib.sha256(r.content).hexdigest() == kept["sha256"] == r.headers["x-content-sha256"]
        assert len(r.content) == kept["bytes"]
    assert client.get(f"/api/captures/{cap['id']}/files/page.html").content == PAGE
    assert client.get(f"/api/captures/{cap['id']}/files/../../journalism.db").status_code == 404
    assert "attachment" in client.get(f"/api/captures/{cap['id']}/files/rendered.html").headers["content-disposition"]

    with SessionLocal() as db:
        doc = db.get(Document, cap["document_id"])
        assert doc is not None and doc.extraction_status == "complete" and doc.mime_type == "text/html"
        text = " ".join(c.text for c in db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc.id)))
        assert "Kestrel SA bought the harbour land" in text
        source = db.get(Source, cap["source_id"])
        assert source.source_type == "web" and source.url == site + "/story" and source.title == "Harbour deal"
        assert source.issuer_or_author == "J. Doe" and source.metadata_json["capture_id"] == cap["id"]

        record = db.get(CaseRecord, cap["case_record_id"])
        warc = next(f for f in cap["files"] if f["name"] == "page.warc.gz")
        assert record.kind == "CAPT" and record.body["hash_value"] == warc["sha256"] and record.body["outcome"] == "OBTAINED"
        assert record.body["content_verified"] == "not done by this system"
        assert record.body["custody_log"][0]["storage"] == f"this computer: captures/{cap['id']}/page.warc.gz"
        assert any("10.0.0.1" in line for line in record.body["limitations"])

        logged = db.scalars(select(OutboundRequest).where(OutboundRequest.investigation_id == inv)).all()
        assert [(r.service, r.kind, r.value, r.outcome) for r in logged] == [("web capture", "web address", site + "/story", "sent")]

    assert [c["id"] for c in client.get(f"/api/investigations/{inv}/captures").json()] == [cap["id"]]
    assert client.get(f"/api/captures/{cap['id']}").json()["job"]["status"] == "succeeded"


def test_a_login_wall_is_not_seen_and_a_missing_page_is_link_only(site):
    _, walled = _capture(site, "/members", "Walled")
    assert walled["outcome"] == "not_seen" and walled["suite_outcome"] == "UNABLE_TO_OBTAIN"
    assert "HTTP 403" in walled["reason"] and walled["document_id"] is None and walled["case_record_id"]

    _, gone = _capture(site, "/gone", "Gone")
    assert gone["outcome"] == "link_only" and gone["reason"] == "The site answered HTTP 404" and gone["document_id"] is None


def test_the_browser_reaches_this_computer_only_through_the_guard(site, monkeypatch, tmp_path):
    # Without the fixture's exception, the page on 127.0.0.1 is refused even though browsers skip proxies for loopback;
    # and it is the only host asked for: the browser makes no calls of its own.
    monkeypatch.setattr(web_capture, "resolve_public", lambda host, port: [])
    seen = web_capture.visit(site + "/story", tmp_path / "page.har")
    assert seen.response_status is None and seen.refused_hosts == ["127.0.0.1"]
    assert seen.error == "127.0.0.1 is a private or local address, or does not resolve: only public web pages are captured"


def test_a_redirect_into_the_local_network_is_refused(site):
    inv, cap = _capture(site, "/jump", "Refused")
    assert cap["outcome"] == "link_only"
    assert cap["reason"] == "The page sent the browser on to 10.0.0.1, a private or local address: the capture stopped there"
    assert cap["files"] == [] and cap["case_record_id"] is None
    assert [s["state"] for s in cap["stages"]] == ["done", "stopped", "skipped", "skipped", "skipped", "skipped", "skipped"]
    with SessionLocal() as db:
        assert db.scalar(select(OutboundRequest.outcome).where(OutboundRequest.investigation_id == inv)) == "failed"


def test_capture_files_travel_in_a_backup_and_go_with_the_case(site, tmp_path):
    inv, cap = _capture(site, "/story", "Backed up")
    folder = web_capture.capture_dir(settings.document_storage_dir, inv, cap["id"])
    assert sorted(p.name for p in folder.iterdir()) == sorted(f["name"] for f in cap["files"])
    with SessionLocal() as db:
        data, manifest = build_investigation_export(db, inv)
        assert sorted(e["name"] for e in manifest["capture_files"]) == sorted(f["name"] for f in cap["files"])
        assert preview_investigation_deletion(db, inv, settings.document_storage_dir)["capture_file_count"] == 5
        delete_investigation(db, inv, settings.document_storage_dir, confirmation=inv)
        assert not folder.exists() and db.get(Capture, cap["id"]) is None

        preview = preview_investigation_restore(db, data, Path(settings.document_storage_dir))
        assert preview["can_restore"] and preview["capture_file_count"] == 5
        restore_investigation_export(db, data, Path(settings.document_storage_dir))
        assert db.get(Investigation, inv) is not None and db.get(Capture, cap["id"]) is not None
    for kept in cap["files"]:
        assert hashlib.sha256((folder / kept["name"]).read_bytes()).hexdigest() == kept["sha256"]


def test_a_capture_says_whether_a_cookie_the_site_set_was_sent(site):
    # The browser starts with no stored cookies; one the site sets during the visit goes back to it, as in a private
    # window, and the receipt's request line says so rather than claiming none.
    _, cap = _capture(site, "/cookie", "Cookie")
    assert cap["outcome"] == "saved" and cap["final_url"] == site + "/story"
    assert ["cookie", "sent"] in cap["exchange"]["request"]["headers"]


def test_a_page_past_the_byte_budget_is_cut_off(site, monkeypatch):
    monkeypatch.setattr(settings, "capture_max_megabytes", 1)
    _, cap = _capture(site, "/heavy", "Heavy")
    assert cap["outcome"] == "saved"
    with SessionLocal() as db:
        limits = db.get(CaseRecord, cap["case_record_id"]).body["limitations"]
    assert "The page and what it loaded passed the 1 MB capture limit; the rest was not loaded" in limits
    har = next(f for f in cap["files"] if f["name"] == "page.har")
    assert har["bytes"] < 2 * 1024 * 1024


def test_a_retried_capture_job_does_not_visit_again(site, monkeypatch):
    inv, cap = _capture(site, "/story", "Retried")
    visits = []
    monkeypatch.setattr(web_capture, "visit", lambda *a, **k: visits.append(a))
    with SessionLocal() as db:
        result = web_capture.run_capture(db, cap["id"], lambda *a: None)
        assert result["message"] == "Already captured" and visits == []
        assert db.scalar(select(func.count()).select_from(OutboundRequest).where(OutboundRequest.investigation_id == inv)) == 1
    again = client.get(f"/api/captures/{cap['id']}").json()
    assert again["files"] == cap["files"] and again["document_id"] == cap["document_id"]
    for kept in cap["files"]:
        assert hashlib.sha256(client.get(f"/api/captures/{cap['id']}/files/{kept['name']}").content).hexdigest() == kept["sha256"]


def test_a_case_deleted_during_the_visit_keeps_nothing(site, monkeypatch):
    real = web_capture.visit
    with SessionLocal() as db:
        db.add(Investigation(id="gone-case", name="Gone"))
        db.commit()
        row = web_capture.request_capture(db, "gone-case", site + "/story", collector="you")

    def visit_then_delete(*args, **kwargs):
        seen = real(*args, **kwargs)
        with SessionLocal() as other:
            delete_investigation(other, "gone-case", settings.document_storage_dir, confirmation="Gone")
        return seen

    monkeypatch.setattr(web_capture, "visit", visit_then_delete)
    with SessionLocal() as db:
        result = web_capture.run_capture(db, row.id, lambda *a: None)
    assert result["message"].startswith("The case or the capture was deleted")
    root = Path(settings.document_storage_dir)
    assert not (root / "gone-case").exists()
    assert not any((root / ".capture-staging").glob("*")) if (root / ".capture-staging").exists() else True


def test_restore_preview_warns_when_capture_files_were_missing(site):
    inv, cap = _capture(site, "/story", "Missing")
    (web_capture.capture_dir(settings.document_storage_dir, inv, cap["id"]) / "screenshot.png").unlink()
    with SessionLocal() as db:
        data, manifest = build_investigation_export(db, inv)
        assert manifest["missing_capture_files"] == [{"capture_id": cap["id"], "name": "screenshot.png"}]
        delete_investigation(db, inv, settings.document_storage_dir, confirmation=inv)
        preview = preview_investigation_restore(db, data, Path(settings.document_storage_dir))
    assert any("missing 1 web capture file" in w for w in preview["warnings"])
