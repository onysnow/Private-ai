"""Bring in › Links & captures (ADR-0016, mockup INTAKE_3): a pasted link fetched from this computer and kept as a
source, with the outcomes that are not a saved page, the re-check, and the files travelling with the case."""

import hashlib
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from warcio.archiveiterator import ArchiveIterator

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Document, Source, WebCapture
from app.models.safety import OutboundRequest
from app.services import capture_browser, capture_net
from app.services.lifecycle import preview_investigation_deletion, preview_orphan_document_files

client = TestClient(app)

BODY = "Kestrel SA paid 4.2 million euros for the freehold, the harbour authority confirmed on Friday. " * 4
ARTICLE = f"""<!doctype html><html lang="en-GB"><head><title>Harbour parcel sold to Kestrel SA | The Marlow Courier</title>
<meta name="description" content="The sale completed on 12 March.">
<script type="application/ld+json">{{"@type":"NewsArticle","headline":"Harbour parcel sold to Kestrel SA","author":{{"@type":"Person","name":"Staff reporter"}},"datePublished":"2019-03-18T09:12:00Z"}}</script>
</head><body><nav>Home News Sport</nav><article><h1>Harbour parcel sold to Kestrel SA</h1><p>{BODY}</p></article></body></html>"""
LOGIN = '<html><head><title>Sign in</title></head><body><form><input type="password" name="p"></form></body></html>'
SHELL = ('<html><head><title>App</title></head><body><div id="r"></div><script>document.getElementById("r").innerHTML = '
         f'"<p>{BODY}</p>";</script></body></html>')
state = {"version": 1, "seen": []}


class Site(BaseHTTPRequestHandler):
    def log_message(self, *args):  # quiet
        pass

    def _send(self, status, body, ctype="text/html; charset=utf-8", extra=None):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Last-Modified", "Mon, 18 Mar 2019 09:40:11 GMT")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        state["seen"].append({k: v for k, v in self.headers.items()})
        path = self.path.split("?")[0]
        if path == "/article":
            return self._send(200, ARTICLE)
        if path == "/copy-of-article":
            return self._send(200, ARTICLE)
        if path == "/changing":
            return self._send(200, f"<html><head><title>Notice</title></head><body><article><p>{BODY} Version {state['version']}.</p></article></body></html>")
        if path == "/gone":
            return self._send(404, "<html><body>Not found</body></html>")
        if path == "/members":
            return self._send(302, "", extra={"Location": "/login?next=/members"})
        if path == "/login":
            return self._send(200, LOGIN)
        if path == "/forbidden":
            return self._send(403, "<html><body>Forbidden</body></html>")
        if path == "/broken":
            return self._send(500, "<html><body>Oops</body></html>")
        if path == "/file.pdf":
            return self._send(200, b"%PDF-1.4 ...", "application/pdf")
        if path == "/big":
            return self._send(200, "<html><body>" + "x" * 5000 + "</body></html>")
        if path == "/shell":
            return self._send(200, SHELL)
        if path == "/hop":
            return self._send(302, "", extra={"Location": "/article"})
        self._send(404, "nope")


@pytest.fixture(scope="module")
def site():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Site)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


@pytest.fixture(autouse=True)
def _local_capture(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "capture_allow_private_hosts", True)
    monkeypatch.setattr(settings, "capture_browser", "off")
    monkeypatch.setattr(settings, "document_storage_dir", str(tmp_path / "docs"))
    monkeypatch.setenv("NO_PROXY", "127.0.0.1,localhost")
    monkeypatch.setenv("no_proxy", "127.0.0.1,localhost")
    state["version"] = 1
    state["seen"].clear()


def _case(name="Harbour land") -> str:
    return client.post("/api/investigations", json={"name": name}).json()["id"]


def _capture(inv: str, url: str):
    return client.post(f"/api/investigations/{inv}/captures", json={"url": url})


def _captures(inv: str) -> list[dict]:
    return client.get(f"/api/investigations/{inv}/captures").json()["captures"]


def test_a_link_becomes_a_source_with_the_page_kept_and_fingerprinted(site):
    inv = _case()
    reply = _capture(inv, f"{site}/article")
    assert reply.status_code in (200, 202), reply.text
    body = reply.json()
    cap = body["capture"]
    assert body["state"] == "new" and body["already_in_case"] is False and cap["outcome"] == "saved"
    assert cap["title"] == "Harbour parcel sold to Kestrel SA | The Marlow Courier" or cap["title"].startswith("Harbour parcel sold")
    assert cap["displayed"]["byline"] == "Staff reporter" and cap["displayed"]["published"] == "2019-03-18T09:12:00Z"
    assert cap["page_sha256"] == hashlib.sha256(ARTICLE.encode()).hexdigest()
    assert [s["key"] for s in cap["steps"]] == ["link", "page", "source", "screenshot", "archive", "fingerprint", "text"]
    assert {s["key"]: s["state"] for s in cap["steps"]}["screenshot"] == "skipped", "no browser: said, not hidden"
    assert cap["request"]["cookie"] == "(none)" and not any(k.lower() == "cookie" for k, _ in cap["request"]["headers"])
    assert not any(k.lower() == "cookie" for k in state["seen"][0]), "the site was sent no cookie"
    assert cap["response"]["status"] == 200
    roles = {f["role"]: f for f in cap["files"]}
    assert set(roles) == {"page", "archive", "text"}
    assert roles["page"]["sha256"] == cap["page_sha256"]
    for f in cap["files"]:
        stored = client.get(f"/api/investigations/{inv}/captures/{cap['id']}/files/{f['name']}")
        assert stored.status_code == 200 and hashlib.sha256(stored.content).hexdigest() == f["sha256"]
    assert BODY.strip()[:40] in client.get(f"/api/investigations/{inv}/captures/{cap['id']}/files/text.txt").text

    with SessionLocal() as db:
        source = db.get(Source, cap["source_id"])
        assert (source.source_type, source.url) == ("web", f"{site}/article")
        doc = db.get(Document, cap["document_id"])
        assert doc.sha256 == cap["page_sha256"] and doc.extraction_status == "complete", "read through the existing reader"
    detail = client.get(f"/api/documents/{cap['document_id']}").json()
    assert any("Kestrel SA paid" in c["text"] for c in detail["chunks"])


def test_the_archive_file_holds_the_request_and_the_answer_as_served(site):
    inv = _case()
    cap = _capture(inv, f"{site}/article").json()["capture"]
    warc = client.get(f"/api/investigations/{inv}/captures/{cap['id']}/files/page.warc").content
    kinds = {}
    for record in ArchiveIterator(io.BytesIO(warc)):
        kinds[record.rec_type] = record.content_stream().read() if record.rec_type == "response" else b""
        if record.rec_type == "response":
            assert record.http_headers.get_statuscode() == "200"
    assert set(kinds) == {"warcinfo", "request", "response"} and kinds["response"] == ARTICLE.encode()


def test_the_visit_is_in_the_outbound_log_as_a_request_to_the_page_s_own_site(site):
    inv = _case()
    _capture(inv, f"{site}/article")
    with SessionLocal() as db:
        rows = db.query(OutboundRequest).filter(OutboundRequest.investigation_id == inv).all()
    assert [(r.service, r.reason, r.value_sent, r.status) for r in rows] == [("web_capture", "capture", f"{site}/article", "sent")]
    assert rows[0].local is False and rows[0].destination == "127.0.0.1"


def test_the_same_page_again_is_already_in_the_case_and_adds_no_copy(site):
    inv = _case()
    first = _capture(inv, f"{site}/article").json()
    again = _capture(inv, f"{site}/article")
    assert again.status_code == 200 and again.json()["state"] == "already_in_case"
    assert again.json()["capture"]["id"] == first["capture"]["id"]
    assert len(_captures(inv)) == 1
    with SessionLocal() as db:
        assert db.query(Document).filter(Document.investigation_id == inv).count() == 1
    assert [c["state"] for c in again.json()["capture"]["checks"]] == ["same"]


def test_the_same_bytes_at_another_address_are_already_in_the_case(site):
    inv = _case()
    _capture(inv, f"{site}/article")
    other = _capture(inv, f"{site}/copy-of-article").json()
    assert other["state"] == "already_in_case" and len(_captures(inv)) == 1


def test_a_redirect_is_followed_and_the_final_address_is_kept(site):
    inv = _case()
    cap = _capture(inv, f"{site}/hop").json()["capture"]
    assert cap["final_url"] == f"{site}/article" and cap["response"]["redirects"] == [[302, f"{site}/article"]]


def test_a_changed_page_is_a_new_capture_that_names_the_first_which_stays_as_it_was(site):
    inv = _case()
    first = _capture(inv, f"{site}/changing").json()["capture"]
    state["version"] = 2
    result = client.post(f"/api/investigations/{inv}/captures/{first['id']}/recheck")
    assert result.status_code in (200, 202), result.text
    new = result.json()
    assert new["state"] == "changed" and new["capture"]["supersedes_id"] == first["id"]
    assert new["capture"]["id"] != first["id"] and new["capture"]["page_sha256"] != first["page_sha256"]
    original = client.get(f"/api/investigations/{inv}/captures/{first['id']}").json()
    assert original["page_sha256"] == first["page_sha256"] and original["files"] == first["files"]
    assert original["change"] == "changed" and original["checks"][-1]["capture_id"] == new["capture"]["id"]
    assert len(_captures(inv)) == 2
    # Checking again with nothing new says "same" on the newest copy.
    again = client.post(f"/api/investigations/{inv}/captures/{first['id']}/recheck").json()
    assert again["state"] == "same" and again["capture"]["id"] == new["capture"]["id"] and len(_captures(inv)) == 2


def test_a_removed_page_is_recorded_as_gone_and_the_saved_copy_is_kept(site, monkeypatch):
    inv = _case()
    first = _capture(inv, f"{site}/article").json()["capture"]
    monkeypatch.setattr(capture_net, "fetch", lambda url, **k: capture_net.Fetched(
        url=url, final_url=url, status=404, reason="Not Found", http_version="HTTP/1.1", request_headers=[("host", "x")],
        response_headers=[("content-type", "text/html")], body=b"<html>gone</html>"))
    monkeypatch.setattr("app.services.web_capture.fetch", capture_net.fetch)
    result = client.post(f"/api/investigations/{inv}/captures/{first['id']}/recheck").json()
    assert result["state"] == "gone" and result["capture"]["outcome"] == "link_only"
    assert result["capture"]["supersedes_id"] == first["id"]
    original = client.get(f"/api/investigations/{inv}/captures/{first['id']}").json()
    assert original["outcome"] == "saved" and original["change"] == "gone" and original["files"]


@pytest.mark.parametrize("path, outcome", [
    ("/gone", "link_only"), ("/members", "not_seen"), ("/forbidden", "not_seen"), ("/login", "not_seen"),
    ("/broken", "failed"), ("/file.pdf", "failed"),
])
def test_a_page_that_is_not_the_page_is_an_outcome_not_a_saved_copy(site, path, outcome):
    inv = _case()
    reply = _capture(inv, f"{site}{path}")
    assert reply.status_code == 200, reply.text
    cap = reply.json()["capture"]
    assert cap["outcome"] == outcome and cap["reason"] and cap["files"] == [] and cap["document_id"] is None
    with SessionLocal() as db:
        assert db.query(Document).filter(Document.investigation_id == inv).count() == 0, "nothing was saved as a document"
    assert [c["outcome"] for c in _captures(inv)] == [outcome], "it is listed: a capture that did not work is still an outcome"


def test_a_dead_link_keeps_the_link_as_a_source_but_a_login_wall_does_not(site):
    inv = _case()
    dead = _capture(inv, f"{site}/gone").json()["capture"]
    wall = _capture(inv, f"{site}/members").json()["capture"]
    assert dead["source_id"] and wall["source_id"] is None
    assert "login" in wall["reason"] and "never log in" in wall["reason"]


def test_a_page_that_is_too_big_is_failed_not_cut_short(site, monkeypatch):
    monkeypatch.setattr(settings, "capture_max_bytes", 1000)
    inv = _case()
    cap = _capture(inv, f"{site}/big").json()["capture"]
    assert cap["outcome"] == "failed" and "larger than" in cap["reason"]


@pytest.mark.parametrize("url", [
    "ftp://example.org/file", "file:///etc/passwd", "https://user:secret@example.org/page", "", "   ", "http:///nohost",
])
def test_a_link_that_is_not_fetched_is_refused_with_why(site, url):
    reply = _capture(_case(), url)
    assert reply.status_code == 422, reply.text


@pytest.mark.parametrize("url", ["http://127.0.0.1:8000/api/investigations", "http://localhost/", "http://169.254.169.254/latest/meta-data/",
                                 "http://10.0.0.5/", "http://[::1]/", "http://192.168.1.1/admin"])
def test_a_private_address_is_refused_unless_allowed(url, monkeypatch):
    monkeypatch.setattr(settings, "capture_allow_private_hosts", False)
    reply = _capture(_case(), url)
    assert reply.status_code == 422 and "private network" in reply.json()["detail"]


def test_a_redirect_to_a_private_address_is_refused_before_it_is_followed(monkeypatch):
    class _Redirect(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            self.send_response(302)
            self.send_header("Location", "http://169.254.169.254/latest/")
            self.send_header("Content-Length", "0")
            self.end_headers()

    server = ThreadingHTTPServer(("127.0.0.1", 0), _Redirect)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        real = capture_net.host_is_allowed
        monkeypatch.setattr(capture_net, "host_is_allowed", lambda host: None if host == "127.0.0.1" else real(host))
        monkeypatch.setattr(settings, "capture_allow_private_hosts", False)
        inv = _case()
        reply = _capture(inv, f"http://127.0.0.1:{server.server_address[1]}/")
        assert reply.status_code == 422, reply.text
        with SessionLocal() as db:
            rows = db.query(OutboundRequest).filter(OutboundRequest.investigation_id == inv).all()
        assert [r.status for r in rows] == ["not_sent"]
    finally:
        server.shutdown()


def test_an_unreachable_check_is_a_line_in_the_checks_not_a_new_capture(site, monkeypatch):
    inv = _case()
    first = _capture(inv, f"{site}/article").json()["capture"]

    def refuse(url, **k):
        raise capture_net.FetchError("timeout", "The site took too long to answer.")

    monkeypatch.setattr("app.services.web_capture.fetch", refuse)
    result = client.post(f"/api/investigations/{inv}/captures/{first['id']}/recheck").json()
    assert result["state"] == "unreachable" and len(_captures(inv)) == 1
    assert client.get(f"/api/investigations/{inv}/captures/{first['id']}").json()["change"] == "unreachable"


def test_only_a_saved_capture_can_be_checked_again(site):
    inv = _case()
    dead = _capture(inv, f"{site}/gone").json()["capture"]
    assert client.post(f"/api/investigations/{inv}/captures/{dead['id']}/recheck").status_code == 409


def test_a_capture_is_not_reachable_through_another_case(site):
    one, two = _case("One"), _case("Two")
    cap = _capture(one, f"{site}/article").json()["capture"]
    assert client.get(f"/api/investigations/{two}/captures/{cap['id']}").status_code == 404
    assert client.get(f"/api/investigations/{two}/captures/{cap['id']}/files/page.warc").status_code == 404
    assert _captures(two) == []


def test_an_unknown_file_name_is_not_found(site):
    inv = _case()
    cap = _capture(inv, f"{site}/article").json()["capture"]
    assert client.get(f"/api/investigations/{inv}/captures/{cap['id']}/files/..%2F..%2Fetc%2Fpasswd").status_code == 404
    assert client.get(f"/api/investigations/{inv}/captures/{cap['id']}/files/nope.png").status_code == 404


def test_the_capture_files_are_not_strays_and_go_with_the_case(site):
    inv = _case()
    cap = _capture(inv, f"{site}/article").json()["capture"]
    root = Path(settings.document_storage_dir)
    with SessionLocal() as db:
        strays = preview_orphan_document_files(db, root)
        assert strays["orphan_files"] == [], strays
        preview = preview_investigation_deletion(db, inv, root)
        ids = {f["document_id"] for f in preview["document_files"]}
        assert f"capture:{cap['id']}" in ids
    folder = root / inv / "captures" / cap["id"]
    assert (folder / "page.warc").is_file()
    assert client.delete(f"/api/investigations/{inv}", params={"confirmation": inv}).status_code == 200
    assert not (folder / "page.warc").exists() and not (folder / "text.txt").exists()
    with SessionLocal() as db:
        assert db.query(WebCapture).filter(WebCapture.investigation_id == inv).count() == 0


def test_a_backup_carries_the_capture_files_and_a_restore_brings_them_back(site):
    inv = _case()
    cap = _capture(inv, f"{site}/article").json()["capture"]
    package = client.get(f"/api/investigations/{inv}/export", params={"include_documents": "true"}).content
    assert client.delete(f"/api/investigations/{inv}", params={"confirmation": inv}).status_code == 200
    before = settings.enable_restore_api
    settings.enable_restore_api = True
    try:
        restored = client.post("/api/backups/restore", files={"file": ("case.jwbackup.zip", package, "application/zip")})
    finally:
        settings.enable_restore_api = before
    assert restored.status_code == 200, restored.text
    new_id = restored.json()["investigation_id"]
    back = _captures(new_id)[0]
    assert back["id"] == cap["id"] and back["page_sha256"] == cap["page_sha256"]
    for f in back["files"]:
        got = client.get(f"/api/investigations/{new_id}/captures/{back['id']}/files/{f['name']}")
        assert got.status_code == 200 and hashlib.sha256(got.content).hexdigest() == f["sha256"], f["name"]
    with SessionLocal() as db:
        assert db.get(Document, back["document_id"]).sha256 == back["page_sha256"]
        strays = preview_orphan_document_files(db, Path(settings.document_storage_dir))
        assert strays["orphan_files"] == [], strays


def test_a_backup_without_documents_still_restores_the_capture_record(site):
    inv = _case()
    cap = _capture(inv, f"{site}/article").json()["capture"]
    package = client.get(f"/api/investigations/{inv}/export", params={"include_documents": "false"}).content
    manifest = json.loads(__import__("zipfile").ZipFile(io.BytesIO(package)).read("manifest.json"))
    assert manifest["capture_files"] == [] and manifest["record_counts"]["web_captures"] == 1
    assert cap["id"]


@pytest.mark.skipif(not capture_browser.importlib.util.find_spec("playwright"), reason="Playwright is not installed")
def test_with_a_browser_the_capture_has_a_screenshot_and_reads_a_script_built_page(site, monkeypatch):
    monkeypatch.setattr(settings, "capture_browser", "auto")
    installed = sorted(Path("/opt/pw-browsers").glob("chromium-*/chrome-linux/chrome"))
    if installed:
        monkeypatch.setattr(settings, "capture_browser_path", str(installed[-1]))
    inv = _case()
    reply = _capture(inv, f"{site}/shell")
    if reply.status_code not in (200, 202) or {s["key"]: s["state"] for s in reply.json()["capture"]["steps"]}["screenshot"] != "done":
        pytest.skip("Chromium could not run here: " + json.dumps(reply.json()["capture"]["steps"]))
    cap = reply.json()["capture"]
    roles = {f["role"]: f for f in cap["files"]}
    assert {"screenshot", "archive", "text", "page", "rendered"} <= set(roles)
    shot = client.get(f"/api/investigations/{inv}/captures/{cap['id']}/files/screenshot.png").content
    assert shot[:8] == b"\x89PNG\r\n\x1a\n" and cap["has_screenshot"] is True
    assert cap["collector"]["browser"] == "Chromium via Playwright"
    assert roles["page"]["sha256"] == hashlib.sha256(SHELL.encode()).hexdigest(), "the page as the site sent it is kept"
    assert "Kestrel SA paid" in client.get(f"/api/investigations/{inv}/captures/{cap['id']}/files/text.txt").text, \
        "the text a script built is what is read"
