"""Web capture (ADR-0018): a pasted link becomes a source. One visit in a real browser (Playwright driving Chromium,
no cookies, no login), and what it saw kept with a SHA-256 for each file:

- ``page.html``     the page source as the browser received it;
- ``rendered.html`` the page as it stood once loaded, after its scripts ran (what the case document is read from);
- ``screenshot.png`` the full page under a band giving the address and this computer's UTC clock (EGS M04 rule 2);
- ``page.har``      every request and response of the visit, with bodies;
- ``page.warc.gz``  the same exchanges as WARC 1.1 records, written from the browser's record of each one.

The visit is in the outbound log before it goes; private, loopback, link-local and metadata addresses are refused for
the page and for everything it asks for. The capture's record (app/models/captures.py) fills the suite's CAPT record.
Nothing read from the page is ever an instruction to a model: the text is a document like any upload.
"""

from __future__ import annotations

import base64
import io
import ipaddress
import json
import logging
import re
import socket
import socketserver
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import Capture, Document, Investigation, Source
from app.services.outbound import mark_outbound_failed, record_outbound
from app.services.security import contained_path, resolve_storage_root
from app.services.sources import is_web_address

logger = logging.getLogger("journalism.capture")

SERVICE = "web capture"
# The suite's gathering outcomes (app/ai/suite_vocab.py GATHERING_OUTCOMES) for the app's three words.
SUITE_OUTCOME = {"saved": "OBTAINED", "not_seen": "UNABLE_TO_OBTAIN", "link_only": "UNABLE_TO_OBTAIN"}
# A site that answers one of these asked for a login or payment, or turned automated visits away: the page was not shown.
NOT_SHOWN = {401, 402, 403, 407}
# Taller than this, the picture stops here and its limits say so (a page can be made endlessly tall).
MAX_SHOT_HEIGHT = 30000
BAND_HEIGHT = 44


class CaptureRefused(ValueError):
    """The address is not one this computer will visit (not http or https, or a private address)."""


# --- Which addresses may be visited --------------------------------------------------------------------------------
# One rule, enforced where the browser's connections go out: every connection the capture browser makes (the page,
# each redirect hop, every image and script, a robots.txt) goes through the guard proxy below, which looks the host up
# once and connects only to the addresses it checked. Asking the browser to skip addresses is not enough: it follows
# redirects and opens connections the page-level hooks never see, and a name can resolve differently a second time.

Resolved = list[tuple[int, int, int, str, tuple[Any, ...]]]


def _public(address: str) -> bool:
    ip = ipaddress.ip_address(address.split("%", 1)[0])
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def resolve_public(host: str, port: int) -> Resolved:
    """The host's addresses when every one of them is public; empty (refused) when any is not, or none resolve."""
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError, OSError):
        return []
    return list(infos) if infos and all(_public(str(info[4][0])) for info in infos) else []


def host_allowed(host: str, port: int | None = None) -> bool:
    return bool(resolve_public(host, port or 443))


def check_address(url: str) -> None:
    """Refuse what is not an http(s) address with a host. A host given as an address or as `localhost` is checked
    here, so the reporter hears at once; a name is checked by the guard when the visit starts."""
    if not is_web_address(url):
        raise CaptureRefused(f"“{url}” is not a web address: give one that starts with http:// or https://")
    host = (urlsplit(url).hostname or "").rstrip(".").lower()
    if host == "localhost" or host.endswith(".localhost"):
        raise CaptureRefused("This computer's own addresses are not captured")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return
    if not host_allowed(host):  # an address needs no lookup to be checked
        raise CaptureRefused(f"{host} is a private or local address: only public web pages are captured")


class _GuardHandler(socketserver.StreamRequestHandler):
    """One browser connection: a CONNECT tunnel (https, wss) or one plain-http request, to a checked address only."""
    timeout = 30

    def handle(self) -> None:
        guard: _Guard = self.server.guard  # type: ignore[attr-defined]
        request_line = self.rfile.readline(8192).decode("latin-1").split()
        if len(request_line) != 3:
            return
        method, target, http_version = request_line
        headers: list[bytes] = []
        while len(headers) < 200:
            line = self.rfile.readline(65536)
            if line in (b"\r\n", b"\n", b""):
                break
            headers.append(line)
        if method == "CONNECT":
            host, _, port = target.rpartition(":")
            upstream = guard.open(host, int(port) if port.isdigit() else 443)
            if upstream is None:
                self.wfile.write(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                return
            self.wfile.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            self.wfile.flush()
        else:
            parts = urlsplit(target)
            if parts.scheme != "http" or not parts.hostname:
                return
            upstream = guard.open(parts.hostname, parts.port or 80)
            if upstream is None:
                return  # closed without an answer: the browser reports the page unreachable, not a site's refusal
            path = (parts.path or "/") + (f"?{parts.query}" if parts.query else "")
            kept = [h for h in headers if h.split(b":", 1)[0].strip().lower()
                    not in (b"proxy-connection", b"connection", b"keep-alive", b"proxy-authorization")]
            # One request per connection, so a reused connection can never reach a host that was not checked.
            upstream.sendall(f"{method} {path} {http_version}\r\n".encode("latin-1") + b"".join(kept) + b"Connection: close\r\n\r\n")
        self._pipe(upstream)

    def _pipe(self, upstream: socket.socket) -> None:
        def down() -> None:
            try:
                while chunk := upstream.recv(65536):
                    self.connection.sendall(chunk)
            except OSError:
                pass
            finally:
                for sock in (self.connection, upstream):
                    try:
                        sock.shutdown(socket.SHUT_RDWR)
                    except OSError:
                        pass

        reader = threading.Thread(target=down, daemon=True)
        reader.start()
        try:
            while chunk := self.rfile.read1(65536):
                upstream.sendall(chunk)
        except OSError:
            pass
        reader.join(timeout=5)
        upstream.close()


class _GuardServer(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


class _Guard:
    """A forward proxy on this computer's loopback for the capture browser alone."""

    def __init__(self) -> None:
        self.refused: list[str] = []
        self._server = _GuardServer(("127.0.0.1", 0), _GuardHandler)
        self._server.guard = self  # type: ignore[attr-defined]
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self._server.server_address[1]}"

    def __enter__(self) -> _Guard:
        self._thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self._server.shutdown()
        self._server.server_close()

    def open(self, host: str, port: int) -> socket.socket | None:
        host = host.strip("[]").rstrip(".").lower()
        for family, kind, proto, _, address in resolve_public(host, port):
            try:
                sock = socket.socket(family, kind, proto)
                sock.settimeout(30)
                sock.connect(address)
                return sock
            except OSError:
                continue
        if host not in self.refused:
            self.refused.append(host)
        return None


# --- The visit -----------------------------------------------------------------------------------------------------

@dataclass
class Visit:
    """What one visit saw. `response_status` is None when no page came back; `error` then says why."""
    final_url: str | None = None
    response_status: int | None = None
    received: bytes | None = None
    rendered: str | None = None
    screenshot: bytes | None = None
    har: bytes | None = None
    displayed: dict[str, str] = field(default_factory=dict)
    captured_at: datetime | None = None
    robots_disallowed: bool | None = None
    tool: str = ""
    error: str | None = None
    refused_hosts: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    # Seconds each part of the visit took: fetched (the page and what it loads), source, screenshot.
    timings: dict[str, float] = field(default_factory=dict)


_DISPLAYED_JS = """() => {
  const meta = (...names) => {
    for (const n of names) {
      const el = document.querySelector(`meta[name="${n}"], meta[property="${n}"], meta[itemprop="${n}"]`);
      if (el && el.content && el.content.trim()) return el.content.trim();
    }
    return '';
  };
  const time = document.querySelector('article time[datetime], time[datetime]');
  return {
    title: (meta('og:title', 'twitter:title') || document.title || '').trim(),
    author: meta('author', 'article:author', 'parsely-author', 'byl'),
    published: meta('article:published_time', 'datePublished', 'pubdate', 'date', 'DC.date.issued')
               || (time ? time.getAttribute('datetime') : ''),
  };
}"""


def _tool_name(browser_version: str) -> str:
    try:
        pw = version("playwright")
    except PackageNotFoundError:
        pw = "unknown"
    return f"Journalism Workbench web capture: Playwright {pw}, Chromium {browser_version}"


def visit(url: str, har_path: Path, *, timeout_s: float | None = None, browser_path: str | None = None) -> Visit:
    """Load the page once and keep what came back, every connection through the guard. Never raises for what the
    site does: `error` says it, and `refused_hosts` names the private or unresolvable hosts it was kept from."""
    with _Guard() as guard:
        out = _visit(url, har_path, guard, timeout_s=timeout_s, browser_path=browser_path)
        out.refused_hosts = list(guard.refused)
    if out.error is None and out.response_status is None:
        out.error = "No page came back"
    return out


# The browser's own calls home (updates, sign-in, suggestions, safe-browsing lists, metrics) are switched off, so the
# only requests a capture makes are the page's. The headless shell honours this; a full Chromium still calls Google
# (tests/test_web_capture.py checks that the page's host is the only one asked for), so the setting names the shell.
QUIET_BROWSER = [
    "--proxy-bypass-list=<-loopback>", "--disable-background-networking", "--disable-component-update",
    "--disable-sync", "--no-pings", "--disable-domain-reliability", "--disable-client-side-phishing-detection",
    "--disable-default-apps", "--no-default-browser-check", "--no-first-run", "--metrics-recording-only",
    "--disable-breakpad", "--disable-features=OptimizationHints,MediaRouter,Translate,AutofillServerCommunication,"
    "CertificateTransparencyComponentUpdater,InterestFeedContentSuggestions,PrivacySandboxSettings4,NetworkTimeServiceQuerying",
]


def _visit(url: str, har_path: Path, guard: _Guard, *, timeout_s: float | None, browser_path: str | None) -> Visit:
    from playwright.sync_api import Error as PlaywrightError, ProxySettings, sync_playwright

    timeout_ms = int((timeout_s or settings.capture_timeout_seconds) * 1000)
    out = Visit()
    # "<-loopback>" takes back the browser's own exception for this computer's addresses: they go to the guard too.
    proxy: ProxySettings = {"server": guard.url, "bypass": "<-loopback>"}
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(executable_path=browser_path or settings.capture_browser_path or None,
                                        proxy=proxy, args=QUIET_BROWSER)
        except PlaywrightError as exc:
            out.error = ("The capture browser is not installed on this computer (run `playwright install --only-shell chromium`)"
                         if "Executable doesn't exist" in str(exc) else f"The capture browser did not start: {_first_line(exc)}")
            return out
        out.tool = _tool_name(browser.version)
        context = browser.new_context(
            record_har_path=str(har_path), record_har_content="embed", service_workers="block",
            accept_downloads=False, java_script_enabled=True, viewport={"width": 1280, "height": 900},
        )
        try:
            # WebSockets are not kept in the record, so none is opened.
            context.route_web_socket(re.compile(".*"), lambda ws: ws.close())
            page = context.new_page()
            page.set_default_timeout(timeout_ms)
            clock = time.monotonic()
            try:
                response = page.goto(url, wait_until="load", timeout=timeout_ms)
            except PlaywrightError as exc:
                out.error = _navigation_error(exc, url, guard.refused)
                return out
            try:  # what loads after the page itself (late images, feeds), for a little while
                page.wait_for_load_state("networkidle", timeout=min(8000, timeout_ms))
            except PlaywrightError:
                out.limitations.append("The page was still loading when it was kept")
            out.timings["fetched"], clock = time.monotonic() - clock, time.monotonic()
            out.final_url = page.url
            out.response_status = response.status if response is not None else None
            if response is not None:
                try:
                    out.received = response.body()
                except PlaywrightError:
                    out.limitations.append("The page source as received could not be read back from the browser")
            out.rendered = page.content()
            out.displayed = {k: str(v)[:500] for k, v in (page.evaluate(_DISPLAYED_JS) or {}).items() if v}
            out.timings["source"], clock = time.monotonic() - clock, time.monotonic()
            height = int(page.evaluate("() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)") or 0)
            out.captured_at = datetime.now(timezone.utc)
            if height > MAX_SHOT_HEIGHT:
                out.screenshot = page.screenshot(full_page=True, clip={"x": 0, "y": 0, "width": 1280, "height": MAX_SHOT_HEIGHT})
                out.limitations.append(f"The page is {height:,} pixels tall; the picture shows the first {MAX_SHOT_HEIGHT:,}")
            else:
                out.screenshot = page.screenshot(full_page=True)
            out.timings["screenshot"] = time.monotonic() - clock
        finally:
            context.close()  # writes the HAR
            browser.close()
        if out.final_url:
            out.robots_disallowed = _robots_disallow(p, out.final_url, proxy, timeout_ms)
    out.har = har_path.read_bytes() if har_path.is_file() else None
    return out


def _first_line(exc: BaseException) -> str:
    return (str(exc).strip().splitlines() or ["unknown error"])[0][:300]


def _navigation_error(exc: BaseException, url: str, refused: list[str]) -> str:
    host = (urlsplit(url).hostname or "").strip("[]").lower()
    text = str(exc)
    if host in refused:
        return f"{host} is a private or local address, or does not resolve: only public web pages are captured"
    if refused:
        return f"The page sent the browser on to {refused[-1]}, a private or local address: the capture stopped there"
    if "Timeout" in type(exc).__name__ or "Timeout" in text:
        return "The page did not load in time"
    match = re.search(r"net::(ERR_[A-Z_]+)", text)
    return f"The page could not be reached ({match.group(1)})" if match else f"The page could not be reached: {_first_line(exc)}"


def _robots_disallow(p: Any, final_url: str, proxy: Any, timeout_ms: int) -> bool | None:
    """Whether the site's robots.txt asks robots not to fetch the page, read through the guard. None when it could
    not be read. A one-off capture notes this and goes ahead (DECISIONS.md, call 4)."""
    parts = urlsplit(final_url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    request = p.request.new_context(proxy=proxy, max_redirects=0)
    try:
        response = request.get(f"{parts.scheme}://{parts.netloc}/robots.txt", timeout=min(10000, timeout_ms),
                               fail_on_status_code=False)
        if 400 <= response.status < 500:
            return False  # no robots.txt: nothing is asked
        if response.status != 200:
            return None
        parser = RobotFileParser()
        parser.parse(response.text().splitlines())
        return not parser.can_fetch("*", final_url)
    except Exception:
        return None
    finally:
        request.dispose()


# --- The files -----------------------------------------------------------------------------------------------------

def banded_screenshot(png: bytes, url: str, at: datetime) -> bytes:
    """The screenshot under a band stating the address and this computer's UTC clock when it was taken."""
    from PIL import Image, ImageDraw, ImageFont

    shot = Image.open(io.BytesIO(png)).convert("RGB")
    out = Image.new("RGB", (shot.width, shot.height + BAND_HEIGHT), (17, 17, 17))
    out.paste(shot, (0, BAND_HEIGHT))
    draw = ImageDraw.Draw(out)
    font = ImageFont.load_default(size=15)
    clock = at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    left = f"Captured {clock} (this computer's clock)"
    room = shot.width - 24 - int(draw.textlength(left + "   ", font=font))
    shown = url
    while shown and draw.textlength(shown, font=font) > room:
        shown = shown[:-2]
    if shown != url:
        shown = shown[:-1] + "…"
    draw.text((12, 13), left, fill=(240, 240, 240), font=font)
    draw.text((shot.width - 12 - int(draw.textlength(shown, font=font)), 13), shown, fill=(200, 200, 200), font=font)
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return buf.getvalue()


_HOP_HEADERS = {"content-encoding", "transfer-encoding", "content-length"}


def warc_from_har(har: bytes, tool: str) -> bytes:
    """WARC 1.1 request and response records for each exchange in the HAR. The bodies are as the browser decoded
    them, so content and transfer encodings are dropped from the headers and the length is the body's own."""
    from warcio.statusandheaders import StatusAndHeaders
    from warcio.warcwriter import WARCWriter

    entries = json.loads(har).get("log", {}).get("entries", [])
    buf = io.BytesIO()
    writer = WARCWriter(buf, gzip=True, warc_version="1.1")
    writer.write_record(writer.create_warcinfo_record("page.warc.gz", {
        "software": tool, "format": "WARC File Format 1.1",
        "description": "Written from the capture browser's record of each exchange (page.har); bodies as decoded by the browser",
    }))
    for entry in entries:
        request, response = entry.get("request") or {}, entry.get("response") or {}
        url = request.get("url") or ""
        if not url.startswith(("http://", "https://")) or (response.get("status") or 0) <= 0:
            continue
        date = _warc_date(entry.get("startedDateTime"))
        content = response.get("content") or {}
        body = content.get("text") or ""
        payload = base64.b64decode(body) if content.get("encoding") == "base64" else body.encode("utf-8")
        headers = [(h["name"], h["value"]) for h in response.get("headers") or [] if not h["name"].startswith(":")
                   and h["name"].lower() not in _HOP_HEADERS]
        headers.append(("Content-Length", str(len(payload))))
        status = f"{response['status']} {response.get('statusText') or ''}".strip()
        record = writer.create_warc_record(url, "response", payload=io.BytesIO(payload),
                                           http_headers=StatusAndHeaders(status, headers, protocol="HTTP/1.1"),
                                           warc_headers_dict={"WARC-Date": date})
        writer.write_record(record)
        parts = urlsplit(url)
        target = (parts.path or "/") + (f"?{parts.query}" if parts.query else "")
        post = ((request.get("postData") or {}).get("text") or "").encode("utf-8")
        req_headers = [(h["name"], h["value"]) for h in request.get("headers") or [] if not h["name"].startswith(":")]
        req = writer.create_warc_record(url, "request", payload=io.BytesIO(post),
                                        http_headers=StatusAndHeaders(f"{request.get('method', 'GET')} {target} HTTP/1.1",
                                                                      req_headers, protocol="HTTP/1.1", is_http_request=True),
                                        warc_headers_dict={"WARC-Date": date,
                                                           "WARC-Concurrent-To": record.rec_headers.get_header("WARC-Record-ID")})
        writer.write_record(req)
    return buf.getvalue()


def _warc_date(started: str | None) -> str:
    try:
        when = datetime.fromisoformat((started or "").replace("Z", "+00:00"))
    except ValueError:
        when = datetime.now(timezone.utc)
    return when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def classify(v: Visit) -> tuple[str, str | None]:
    """The app's outcome and its reason for what the visit saw."""
    if v.response_status is None:
        return "link_only", v.error or "No page came back"
    if v.response_status in NOT_SHOWN:
        return "not_seen", (f"The site refused to show the page (HTTP {v.response_status}): a login, a paywall, "
                            "or a block on automated visits")
    if v.response_status >= 400:
        return "link_only", f"The site answered HTTP {v.response_status}"
    return "saved", None


def capture_dir(storage_root: str | Path, investigation_id: str, capture_id: str) -> Path:
    return contained_path(resolve_storage_root(storage_root), investigation_id, "captures", capture_id)


def _sha256(data: bytes) -> str:
    import hashlib

    return hashlib.sha256(data).hexdigest()


def _keep(folder: Path, name: str, role: str, data: bytes) -> dict[str, Any]:
    path = contained_path(folder, name)
    path.write_bytes(data)
    return {"name": name, "role": role, "bytes": len(data), "sha256": _sha256(data)}


# What the capture lane shows, in order (mockup INTAKE_3).
STAGES = (("checked", "Link checked"), ("fetched", "Page fetched"), ("source", "Source saved"), ("screenshot", "Screenshot"),
          ("archive", "Archive (WARC)"), ("fingerprint", "Fingerprint"), ("text", "Text read"))


def _stages(times: dict[str, float], stopped: str | None = None, skipped: tuple[str, ...] = ()) -> list[dict[str, Any]]:
    """The lane: each stage done with its seconds, the one that failed stopped, the rest after it skipped."""
    out, after_stop = [], False
    for key, label in STAGES:
        if key == stopped:
            state, after_stop = "stopped", True
        elif after_stop or key in skipped:
            state = "skipped"
        elif key in times:
            state = "done"
        else:
            state = "waiting"
        out.append({"key": key, "label": label, "state": state, "seconds": round(times[key], 2) if key in times else None})
    return out


_SENT = ("user-agent", "accept-language", "accept")
_SERVED = ("content-type", "content-length", "last-modified", "etag", "date", "server")


def main_exchange(har: bytes | None, final_url: str | None) -> dict[str, Any]:
    """The request for the page itself and what the server answered, from the HAR: a few telling headers each, as
    served and not verified. No cookies are ever sent; the request says so."""
    if not har or not final_url:
        return {}
    try:
        entries = json.loads(har).get("log", {}).get("entries", [])
    except ValueError:
        return {}
    entry = next((e for e in reversed(entries) if (e.get("request") or {}).get("url") == final_url
                  and ((e.get("response") or {}).get("status") or 0) > 0), None)
    if entry is None:
        return {}
    request, response = entry["request"], entry["response"]
    parts = urlsplit(final_url)

    def pick(headers: list[dict[str, str]], names: tuple[str, ...]) -> list[list[str]]:
        found = {h["name"].lower(): h["value"] for h in headers or [] if not h["name"].startswith(":")}
        return [[name, found[name][:300]] for name in names if name in found]

    sent = pick(request.get("headers") or [], _SENT)
    cookies = [h for h in request.get("headers") or [] if h["name"].lower() == "cookie"]
    sent.append(["cookie", "(none)" if not cookies else "sent"])
    return {
        "request": {"method": request.get("method", "GET"),
                    "target": (parts.path or "/") + (f"?{parts.query}" if parts.query else ""), "headers": sent},
        "response": {"status": f"{response.get('httpVersion') or 'HTTP/1.1'} {response.get('status')} {response.get('statusText') or ''}".strip(),
                     "headers": pick(response.get("headers") or [], _SERVED)},
    }


# --- The capture as a job ------------------------------------------------------------------------------------------

def request_capture(db: Session, investigation_id: str, url: str, *, collector: str | None) -> Capture:
    """The row a capture job fills. Refuses an address it will never visit (CaptureRefused)."""
    url = url.strip()
    check_address(url)
    if db.get(Investigation, investigation_id) is None:
        raise LookupError("Investigation not found")
    row = Capture(investigation_id=investigation_id, url=url, status="queued", collector=collector or "you", files=[],
                  displayed={}, stages=_stages({}), exchange={})
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def run_capture(db: Session, capture_id: str, report: Callable[[int | None, str | None], None], *,
                storage_root: str | Path | None = None,
                read_document: Callable[[str], None] | None = None) -> dict[str, Any]:
    """Visit the page and keep what it showed. Returns the job's message and result. `read_document` reads the case
    document the capture made (the job's runner passes one that runs the reading job)."""
    from app.services import case_records
    from app.services.documents import store_document

    row = db.get(Capture, capture_id)
    if row is None:
        return {"message": "The capture was deleted", "result": {}}
    root = storage_root or settings.document_storage_dir
    row.status, row.started_at = "capturing", utcnow_naive()
    db.commit()
    request_id = record_outbound(db, row.investigation_id, service=SERVICE, kind="web address", value=row.url,
                                 reason="Capture this page (one visit, no cookies)", actor="you",
                                 source={"capture_id": row.id, "destination": (urlsplit(row.url).hostname or "")[:255]})
    report(10, "Loading the page")
    folder = capture_dir(root, row.investigation_id, row.id)
    folder.mkdir(parents=True, exist_ok=True)
    har_path = contained_path(folder, "page.har")
    times: dict[str, float] = {}
    clock = time.monotonic()
    try:
        check_address(row.url)
        times["checked"] = time.monotonic() - clock
        # Playwright's sync API refuses a thread with a running event loop; its own thread has none.
        with ThreadPoolExecutor(max_workers=1) as pool:
            seen = pool.submit(visit, row.url, har_path).result()
    except CaptureRefused as exc:
        seen = Visit(error=str(exc))
    except Exception as exc:  # the browser itself failed: the capture says so rather than vanishing
        logger.exception("web capture %s failed", row.id)
        seen = Visit(error=f"The capture browser failed: {_first_line(exc)}")
    times.update(seen.timings)
    outcome, reason = classify(seen)
    if seen.response_status is None:
        mark_outbound_failed(db, request_id)
    row.stages = _stages(times, stopped=None if seen.response_status is not None else ("checked" if "checked" not in times else "fetched"))
    db.commit()
    report(70, "Keeping the files")

    files: list[dict[str, Any]] = []
    if seen.received is not None:
        files.append(_keep(folder, "page.html", "page source as received", seen.received))
    if seen.rendered is not None:
        files.append(_keep(folder, "rendered.html", "page as loaded, after its scripts", seen.rendered.encode("utf-8")))
    if seen.screenshot is not None and seen.captured_at is not None:
        files.append(_keep(folder, "screenshot.png", "full-page picture with address and clock",
                           banded_screenshot(seen.screenshot, seen.final_url or row.url, seen.captured_at)))
    if seen.har is not None and seen.response_status is not None:
        files.append({"name": "page.har", "role": "every request and response", "bytes": len(seen.har), "sha256": _sha256(seen.har)})
        clock = time.monotonic()
        files.append(_keep(folder, "page.warc.gz", "WARC 1.1 archive of the visit", warc_from_har(seen.har, seen.tool)))
        times["archive"] = time.monotonic() - clock
    else:
        har_path.unlink(missing_ok=True)
    if files:
        # Each file was hashed as it was written; checking them back from disk is the fingerprint the receipt shows.
        clock = time.monotonic()
        for kept in files:
            if _sha256(contained_path(folder, kept["name"]).read_bytes()) != kept["sha256"]:
                raise RuntimeError(f"capture file {kept['name']} changed while it was being kept")
        times["fingerprint"] = time.monotonic() - clock
    if not files:
        try:
            folder.rmdir()
        except OSError:
            pass

    row.final_url, row.http_status, row.tool = seen.final_url, seen.response_status, seen.tool or None
    row.outcome, row.reason, row.files = outcome, reason, files
    row.displayed = seen.displayed
    row.exchange = main_exchange(seen.har, seen.final_url)
    row.robots_disallowed = seen.robots_disallowed
    row.finished_at = utcnow_naive()
    captured_at = seen.captured_at or datetime.now(timezone.utc)
    limitations = list(seen.limitations)
    if seen.refused_hosts:
        limitations.append("Not loaded, as private or local addresses: " + ", ".join(seen.refused_hosts[:10]))

    if outcome == "saved" and seen.rendered is not None:
        host = urlsplit(seen.final_url or row.url).hostname or "page"
        title = seen.displayed.get("title") or host
        doc = store_document(db, investigation_id=row.investigation_id, title=title,
                             filename=f"{host}-{captured_at.strftime('%Y%m%d-%H%M%S')}Z.html", mime_type="text/html",
                             data=seen.rendered.encode("utf-8"), storage_dir=Path(root),
                             source_metadata={"capture_id": row.id, "retrieved_at": captured_at.isoformat()})
        source = db.get(Source, doc.source_id)
        if source is not None:
            source.source_type, source.url, source.title = "web", row.url, title[:512]
            if seen.displayed.get("author"):
                source.issuer_or_author = seen.displayed["author"][:512]
        row = db.get(Capture, capture_id) or row
        row.document_id, row.source_id = doc.id, doc.source_id

    warc = next((f for f in files if f["name"] == "page.warc.gz"), None) or next(iter(files), None)
    if warc is not None:
        record = case_records.create(db, row.investigation_id, "CAPT", {
            "url": row.url,
            "captured_at": captured_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "hash_value": warc["sha256"],
            "original_location": seen.final_url or row.url,
            "custody_log": [{"person": row.collector or "you", "time": captured_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                             "action": f"Captured with {seen.tool or 'the capture browser'}",
                             "storage": f"this computer: captures/{row.id}/{warc['name']}"}],
            "outcome": SUITE_OUTCOME[outcome],
            "failure_reason": reason,
            "limitations": limitations,
        }, created_by=row.collector)
        row = db.get(Capture, capture_id) or row
        row.case_record_id = record.id
    reading = bool(row.document_id and read_document is not None)
    failed_at = None if seen.response_status is not None else ("checked" if "checked" not in times else "fetched")
    row.stages = _stages(times, stopped=failed_at, skipped=() if reading else ("text",))
    row.status = "finished"
    db.commit()

    if reading and row.document_id and read_document is not None:
        report(85, "Reading the page")
        clock = time.monotonic()
        read_document(row.document_id)
        times["text"] = time.monotonic() - clock
        db.expire_all()
        row = db.get(Capture, capture_id) or row
        doc_row = db.get(Document, row.document_id)
        read_ok = doc_row is not None and doc_row.extraction_status == "complete"
        row.stages = _stages(times, stopped=None if read_ok else "text")
        db.commit()
    words = {"saved": "Page kept", "not_seen": "Not seen", "link_only": "Link only"}[outcome]
    return {"message": f"{words}: {reason}" if reason else words,
            "result": {"capture_id": row.id, "outcome": outcome, "document_id": row.document_id}}


def serialize_capture(row: Capture) -> dict[str, Any]:
    return {
        "id": row.id, "investigation_id": row.investigation_id, "url": row.url, "final_url": row.final_url,
        "status": row.status, "outcome": row.outcome, "suite_outcome": SUITE_OUTCOME.get(row.outcome or ""),
        "reason": row.reason, "http_status": row.http_status, "collector": row.collector, "tool": row.tool,
        "requested_at": row.requested_at, "started_at": row.started_at, "finished_at": row.finished_at,
        "files": row.files or [], "displayed": row.displayed or {}, "robots_disallowed": row.robots_disallowed,
        "stages": row.stages or [], "exchange": row.exchange or {},
        "source_id": row.source_id, "document_id": row.document_id, "case_record_id": row.case_record_id,
        "job_id": row.job_id, "content_verified": "not done by this system",
    }


def list_captures(db: Session, investigation_id: str) -> list[Capture]:
    return list(db.scalars(select(Capture).where(Capture.investigation_id == investigation_id)
                           .order_by(Capture.requested_at.desc(), Capture.id.desc())))


def capture_file(row: Capture, name: str, storage_root: str | Path | None = None) -> tuple[Path, dict[str, Any]]:
    """The kept file and its entry; LookupError when the capture has no such file or it is gone from disk."""
    entry = next((f for f in row.files or [] if f.get("name") == name), None)
    if entry is None:
        raise LookupError("This capture has no such file")
    path = contained_path(capture_dir(storage_root or settings.document_storage_dir, row.investigation_id, row.id), name)
    if not path.is_file():
        raise LookupError("The file is missing from this computer")
    return path, entry

