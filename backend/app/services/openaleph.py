from __future__ import annotations

from dataclasses import asdict, dataclass

import httpx

from app.core.config import settings


@dataclass(frozen=True)
class OpenAlephStatus:
    configured: bool
    base_url: str
    ui_url: str
    reachable: bool
    api_usable: bool
    http_status: int | None
    detail: str

    def to_dict(self) -> dict:
        return asdict(self)


async def probe_openaleph(*, transport: httpx.AsyncBaseTransport | None = None) -> OpenAlephStatus:
    """Probe the configured OpenAleph corpus platform through its public API.

    This is intentionally separate from the external Aleph connector. Local OpenAleph is
    infrastructure owned by the corpus layer, not an unverified enrichment provider.
    """
    base_url = settings.openaleph_base_url.rstrip("/")
    ui_url = settings.openaleph_ui_url.rstrip("/")
    if not settings.openaleph_enabled:
        return OpenAlephStatus(
            configured=False,
            base_url=base_url,
            ui_url=ui_url,
            reachable=False,
            api_usable=False,
            http_status=None,
            detail="OpenAleph integration is disabled by configuration",
        )

    headers = {"User-Agent": "JournalismWorkbench/0.88"}
    if settings.openaleph_api_key:
        headers["Authorization"] = f"ApiKey {settings.openaleph_api_key}"

    try:
        async with httpx.AsyncClient(
            timeout=settings.openaleph_probe_timeout_seconds,
            follow_redirects=True,
            transport=transport,
        ) as client:
            response = await client.get(
                f"{base_url}/api/2/search",
                params={"q": "*", "limit": 1},
                headers=headers,
            )
    except httpx.HTTPError as exc:
        return OpenAlephStatus(
            configured=True,
            base_url=base_url,
            ui_url=ui_url,
            reachable=False,
            api_usable=False,
            http_status=None,
            detail=f"OpenAleph API probe failed: {exc.__class__.__name__}",
        )

    content_type = response.headers.get("content-type", "")
    api_usable = response.is_success and "json" in content_type.lower()
    detail = (
        "OpenAleph search API is reachable"
        if api_usable
        else f"OpenAleph responded but search API was not usable (HTTP {response.status_code})"
    )
    return OpenAlephStatus(
        configured=True,
        base_url=base_url,
        ui_url=ui_url,
        reachable=True,
        api_usable=api_usable,
        http_status=response.status_code,
        detail=detail,
    )
