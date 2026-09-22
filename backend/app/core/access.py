from __future__ import annotations

import hmac
import ipaddress
from dataclasses import dataclass
from urllib.parse import urlsplit

from fastapi import Request
from fastapi.responses import JSONResponse


@dataclass(frozen=True)
class AccessDecision:
    allowed: bool
    status_code: int = 200
    detail: str = ""
    authenticate: bool = False


SAFE_BROWSER_METHODS = {"GET", "HEAD", "OPTIONS"}


def _host_without_port(value: str | None) -> str:
    raw = (value or "").strip().strip('"')
    if not raw:
        return ""
    if raw.startswith("["):
        end = raw.find("]")
        if end != -1:
            return raw[1:end]
    if raw.count(":") == 1:
        host, maybe_port = raw.rsplit(":", 1)
        if maybe_port.isdigit():
            return host
    return raw


def is_loopback_host(host: str | None) -> bool:
    """Return True only for hosts that unambiguously represent this machine."""
    value = _host_without_port(host).lower()
    if value in {"localhost", "testclient", "testserver"}:
        return True
    if not value:
        return False
    try:
        return ipaddress.ip_address(value).is_loopback
    except ValueError:
        return False


def request_is_local(
    *, client_host: str | None, target_host: str | None = None
) -> bool:
    """Return True only when both the network peer and requested host are local."""
    return is_loopback_host(client_host) and is_loopback_host(
        target_host or client_host
    )


def _forwarded_values(value: str | None, key: str) -> list[str]:
    values: list[str] = []
    for hop in (value or "").split(","):
        for part in hop.split(";"):
            name, sep, raw = part.strip().partition("=")
            if sep and name.strip().lower() == key:
                values.append(raw.strip().strip('"'))
    return values


def _origin_host(origin: str | None) -> str:
    raw = (origin or "").strip()
    if not raw or raw.lower() == "null":
        return ""
    try:
        return urlsplit(raw).hostname or ""
    except ValueError:
        return ""


def request_is_local_request(request: Request) -> bool:
    """Conservatively decide whether a request is truly local.

    Forwarded headers are *downgrade-only*: they may revoke loopback trust when they
    reveal a remote hop/host, but they can never turn a remote peer into a local one.
    This avoids trusting proxy headers as an authentication mechanism while still
    preventing a loopback reverse proxy from hiding an external request.
    """
    direct_client = request.client.host if request.client else None
    direct_target = request.url.hostname
    if not request_is_local(client_host=direct_client, target_host=direct_target):
        return False

    # If a local reverse proxy says any client hop was remote, revoke local trust.
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        for value in x_forwarded_for.split(","):
            host = _host_without_port(value)
            if not host or not is_loopback_host(host):
                return False

    forwarded = request.headers.get("forwarded")
    for value in _forwarded_values(forwarded, "for"):
        host = _host_without_port(value)
        if not host or not is_loopback_host(host):
            return False
    for value in _forwarded_values(forwarded, "host"):
        host = _host_without_port(value)
        if not host or not is_loopback_host(host):
            return False

    x_forwarded_host = request.headers.get("x-forwarded-host")
    if x_forwarded_host:
        for value in x_forwarded_host.split(","):
            host = _host_without_port(value)
            if not host or not is_loopback_host(host):
                return False

    # Browser requests from a public origin are never granted credential-free local
    # trust, even if a proxy rewrote Host to localhost.
    origin = request.headers.get("origin")
    if origin:
        origin_host = _origin_host(origin)
        if not origin_host or not is_loopback_host(origin_host):
            return False

    return True


def bearer_token(authorization: str | None) -> str:
    if not authorization:
        return ""
    scheme, sep, token = authorization.partition(" ")
    if not sep or scheme.lower() != "bearer":
        return ""
    return token.strip()


def decide_api_access(
    *,
    client_host: str | None,
    target_host: str | None = None,
    authorization: str | None,
    configured_token: str,
) -> AccessDecision:
    """Authorize one API request under the local-first security policy."""
    if request_is_local(client_host=client_host, target_host=target_host):
        return AccessDecision(True)

    expected = configured_token.strip()
    if not expected:
        return AccessDecision(
            False,
            status_code=403,
            detail="Remote API access is disabled. Configure API_AUTH_TOKEN to enable authenticated non-local access.",
        )

    supplied = bearer_token(authorization)
    if not supplied or not hmac.compare_digest(supplied, expected):
        return AccessDecision(
            False,
            status_code=401,
            detail="Valid Bearer authentication is required for non-local API access.",
            authenticate=True,
        )

    return AccessDecision(True)


def _normalize_origin(origin: str) -> str:
    raw = origin.strip()
    try:
        parsed = urlsplit(raw)
    except ValueError:
        return ""
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return ""
    try:
        parsed_port = parsed.port
    except ValueError:
        return ""
    default_port = (parsed.scheme == "http" and parsed_port == 80) or (
        parsed.scheme == "https" and parsed_port == 443
    )
    host = parsed.hostname.lower()
    if ":" in host:
        host = f"[{host}]"
    port = "" if parsed_port is None or default_port else f":{parsed_port}"
    return f"{parsed.scheme.lower()}://{host}{port}"


def decide_browser_write_access(
    *,
    method: str,
    origin: str | None,
    sec_fetch_site: str | None,
    allowed_origins: list[str],
) -> AccessDecision:
    """Block cross-site browser writes before they can reach state-changing routes.

    CORS controls whether JavaScript may read a response; it does not guarantee that a
    simple cross-origin request (notably multipart/form-data) will not execute. This
    guard therefore validates Origin/Fetch-Metadata for unsafe API methods while
    leaving non-browser CLI/API clients (which typically send neither header) usable.
    """
    if method.upper() in SAFE_BROWSER_METHODS:
        return AccessDecision(True)

    fetch_site = (sec_fetch_site or "").strip().lower()
    if fetch_site == "cross-site":
        return AccessDecision(False, 403, "Cross-site browser writes are not allowed.")

    if origin is None:
        return AccessDecision(True)

    normalized = _normalize_origin(origin)
    allowed = {_normalize_origin(item) for item in allowed_origins}
    allowed.discard("")
    if not normalized or normalized not in allowed:
        return AccessDecision(False, 403, "Browser write origin is not allowed.")

    return AccessDecision(True)


async def enforce_api_access(request: Request, configured_token: str) -> JSONResponse | None:
    """Return a denial response for an unauthorized API request, otherwise None."""
    if not request.url.path.startswith("/api"):
        return None

    if request_is_local_request(request):
        return None

    decision = decide_api_access(
        client_host=request.client.host if request.client else None,
        target_host=request.url.hostname,
        authorization=request.headers.get("authorization"),
        configured_token=configured_token,
    )
    if decision.allowed:
        return None

    headers = {"WWW-Authenticate": "Bearer"} if decision.authenticate else None
    return JSONResponse(
        status_code=decision.status_code,
        content={"detail": decision.detail},
        headers=headers,
    )


async def enforce_browser_write_access(request: Request, allowed_origins: list[str]) -> JSONResponse | None:
    if not request.url.path.startswith("/api"):
        return None
    decision = decide_browser_write_access(
        method=request.method,
        origin=request.headers.get("origin"),
        sec_fetch_site=request.headers.get("sec-fetch-site"),
        allowed_origins=allowed_origins,
    )
    if decision.allowed:
        return None
    return JSONResponse(
        status_code=decision.status_code, content={"detail": decision.detail}
    )
