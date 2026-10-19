"""Fetching one web page for a capture (ADR-0016, mockup INTAKE_3): from this computer, without cookies or a login,
with every redirect checked, and with the request as sent and the answer as served kept word for word.

The address check refuses anything that is not on the public internet (this computer, a private network, a
link-local or reserved range) unless settings.capture_allow_private_hosts is on: a pasted link must not be a way to
reach a service on this computer or its network. Each redirect is checked the same way before it is followed. The
name is resolved here and again by the HTTP client, so a server that answers differently the second time is not
fully excluded (DNS rebinding); the browser, which loads a page's other files, checks each of them as well
(capture_browser.py).
"""

from __future__ import annotations

import ipaddress
import socket
import time
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlsplit

import httpx

from app.core.config import settings

USER_AGENT = "Mozilla/5.0 (compatible; JournalismWorkbench-Capture/1.0)"
ACCEPT_LANGUAGE = "en-GB,en;q=0.9"
MAX_REDIRECTS = 5


class AddressRefused(ValueError):
    """The link is not one a capture will fetch; the message says why, in words."""


class FetchError(Exception):
    """Nothing came back. `kind`: dns | connect | timeout | too_large | tls | refused | other."""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind
        self.message = message


@dataclass
class Fetched:
    url: str
    final_url: str
    status: int
    reason: str
    http_version: str
    request_headers: list[tuple[str, str]]
    response_headers: list[tuple[str, str]]
    body: bytes
    redirects: list[tuple[int, str]] = field(default_factory=list)
    seconds: float = 0.0

    def header(self, name: str) -> str | None:
        for key, value in self.response_headers:
            if key.lower() == name.lower():
                return value
        return None


def host_is_allowed(host: str) -> str | None:
    """None when the host is on the public internet; else why it is not."""
    if settings.capture_allow_private_hosts:
        return None
    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except OSError:
        return None  # not found, or no network: the fetch reports that, in its own words
    for info in infos:
        address = ipaddress.ip_address(str(info[4][0]).split("%")[0])
        if not address.is_global:
            return f"{host} is on this computer or a private network, not the public internet"
    return None


def check_address(url: str) -> str:
    """The URL cleaned for fetching, or AddressRefused. Only http and https; no user name or password in the link."""
    text = (url or "").strip()
    if not text:
        raise AddressRefused("Paste a web address.")
    parts = urlsplit(text)
    if parts.scheme not in ("http", "https"):
        if not parts.scheme and "." in text.split("/")[0]:
            return check_address("https://" + text)
        raise AddressRefused("Only http and https addresses can be captured.")
    if not parts.hostname:
        raise AddressRefused("That address has no site name.")
    if parts.username or parts.password:
        raise AddressRefused("An address with a user name or password in it is not fetched: captures never log in.")
    why = host_is_allowed(parts.hostname)
    if why:
        raise AddressRefused(why[0].upper() + why[1:] + ".")
    return parts._replace(fragment="").geturl()


def _target(url: str) -> str:
    parts = urlsplit(url)
    return (parts.path or "/") + (f"?{parts.query}" if parts.query else "")


def fetch(url: str, *, timeout: float | None = None, max_bytes: int | None = None) -> Fetched:
    """GET the page. Redirects are followed by hand (at most MAX_REDIRECTS), each checked first. The body is asked
    for uncompressed so what is kept is exactly what the site sent. Raises AddressRefused or FetchError."""
    timeout = settings.capture_timeout_seconds if timeout is None else timeout
    limit = settings.capture_max_bytes if max_bytes is None else max_bytes
    started = time.monotonic()
    redirects: list[tuple[int, str]] = []
    current = url
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
               "Accept-Language": ACCEPT_LANGUAGE, "Accept-Encoding": "identity"}
    with httpx.Client(follow_redirects=False, timeout=timeout, headers=headers, cookies=None) as client:
        for _ in range(MAX_REDIRECTS + 1):
            try:
                with client.stream("GET", current) as response:
                    sent = [(k, v) for k, v in response.request.headers.multi_items()]
                    if response.is_redirect and response.headers.get("location"):
                        nxt = check_address(urljoin(current, response.headers["location"]))
                        redirects.append((response.status_code, nxt))
                        current = nxt
                        continue
                    body = bytearray()
                    for chunk in response.iter_raw():
                        body.extend(chunk)
                        if len(body) > limit:
                            raise FetchError("too_large", f"The page is larger than {limit // (1024 * 1024)} MB, so it was not kept.")
                    return Fetched(
                        url=url, final_url=current, status=response.status_code, reason=response.reason_phrase,
                        http_version=response.http_version, request_headers=sent,
                        response_headers=[(k, v) for k, v in response.headers.multi_items()], body=bytes(body),
                        redirects=redirects, seconds=time.monotonic() - started,
                    )
            except httpx.ConnectError as exc:
                text = str(exc)
                if "Name or service not known" in text or "nodename nor servname" in text or "getaddrinfo" in text or "Temporary failure" in text:
                    raise FetchError("dns", "The address did not lead to a site.") from exc
                if "CERTIFICATE" in text.upper() or "SSL" in text.upper():
                    raise FetchError("tls", "The site's certificate was not accepted.") from exc
                raise FetchError("connect", "The site did not answer.") from exc
            except httpx.TimeoutException as exc:
                raise FetchError("timeout", "The site took too long to answer.") from exc
            except httpx.HTTPError as exc:
                raise FetchError("other", f"The page could not be fetched ({type(exc).__name__}).") from exc
    raise FetchError("refused", f"The address redirected more than {MAX_REDIRECTS} times.")


def request_line(url: str) -> str:
    return f"GET {_target(url)} HTTP/1.1"
