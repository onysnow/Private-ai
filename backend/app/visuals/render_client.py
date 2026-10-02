"""The export bridge: an ECharts option becomes an SVG through the render
service (render/, ADR-0005 line 2), and the SVG becomes a PNG through
vl-convert, because PowerPoint and Word reject SVG.

Callers never let a missing render service fail an export. `render_svg`
raises RenderUnavailable when the service cannot be reached or answers with
anything but an SVG, and the deck and write-up exporters catch it and keep
today's behaviour: a native PowerPoint chart, a table in Word with a line
saying the image was not available.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import Settings, settings as default_settings

PNG_SCALE = 2.0   # twice the pixel size: crisp on a projector and in print


class RenderUnavailable(RuntimeError):
    """The render service could not be reached, or did not answer with an SVG."""


def render_svg(option: dict[str, Any], width: int, height: int, *, settings: Settings = default_settings,
               transport: httpx.BaseTransport | None = None) -> str:
    """POST the option to the render service and return the SVG text.

    `transport` lets a test stand in for the service (httpx.MockTransport);
    production uses the URL in settings."""
    url = settings.render_service_url.rstrip("/") + "/echarts"
    try:
        with httpx.Client(transport=transport, timeout=settings.render_service_timeout_seconds) as client:
            response = client.post(url, json={"option": option, "width": width, "height": height})
    except httpx.HTTPError as exc:
        raise RenderUnavailable(f"render service at {settings.render_service_url} could not be reached: {exc.__class__.__name__}: {exc}") from exc
    if response.status_code != 200:
        detail = response.text[:300]
        raise RenderUnavailable(f"render service answered {response.status_code}: {detail}")
    if "svg" not in response.headers.get("content-type", "") or not response.text.lstrip().startswith("<svg"):
        raise RenderUnavailable("render service did not answer with an SVG document")
    return response.text


def svg_to_png(svg: str, *, scale: float = PNG_SCALE) -> bytes:
    """SVG text to PNG bytes with vl-convert (resvg underneath)."""
    import vl_convert

    png = vl_convert.svg_to_png(svg, scale=scale)
    if not isinstance(png, bytes) or not png.startswith(b"\x89PNG"):
        raise RenderUnavailable("vl-convert did not produce a PNG")
    return png


def render_png(option: dict[str, Any], width: int, height: int, *, scale: float = PNG_SCALE, settings: Settings = default_settings,
               transport: httpx.BaseTransport | None = None) -> bytes:
    """The whole bridge: option -> SVG (render service) -> PNG (vl-convert),
    `scale` PNG pixels to a design pixel."""
    return svg_to_png(render_svg(option, width, height, settings=settings, transport=transport), scale=scale)


def render_service_status(*, settings: Settings = default_settings, transport: httpx.BaseTransport | None = None) -> dict[str, Any]:
    """What the settings panel can show: reachable or not, and which ECharts."""
    url = settings.render_service_url.rstrip("/") + "/health"
    try:
        with httpx.Client(transport=transport, timeout=min(settings.render_service_timeout_seconds, 3.0)) as client:
            response = client.get(url)
        body = response.json() if response.status_code == 200 else {}
        return {"url": settings.render_service_url, "reachable": response.status_code == 200 and bool(body.get("ok")),
                "echarts": body.get("echarts"), "error": None if response.status_code == 200 else f"HTTP {response.status_code}"}
    except (httpx.HTTPError, ValueError) as exc:
        return {"url": settings.render_service_url, "reachable": False, "echarts": None, "error": f"{exc.__class__.__name__}: {exc}"}
