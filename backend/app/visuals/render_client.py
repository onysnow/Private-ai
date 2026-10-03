"""The export bridge: an ECharts option becomes an SVG through the render
service (render/, ADR-0005 line 2), and the SVG becomes a PNG through
vl-convert, because PowerPoint and Word reject SVG.

A map (an option with "map": the places for MapLibre; ADR-0005, line 18) is
drawn in two steps: the render service draws the places on the base map
(POST /map, a PNG), and that picture goes into the chart's own frame (its
title, unit and source line, as every chart picture carries them) as an
ECharts image, drawn and converted like any chart.

Callers never let a missing render service fail an export. `render_svg`
raises RenderUnavailable when the service cannot be reached or answers with
anything but an SVG, and the deck and write-up exporters catch it and keep
today's behaviour: a native PowerPoint chart, a table in Word with a line
saying the image was not available.
"""

from __future__ import annotations

from typing import Any

import base64

import httpx

from app.core.config import Settings, settings as default_settings
from app.visuals.echarts import MAP_BOTTOM, MAP_TOP

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
    `scale` PNG pixels to a design pixel. A map's option takes the map's way."""
    if isinstance(option.get("map"), dict):
        return render_map_png(option, width, height, scale=scale, settings=settings, transport=transport)
    return svg_to_png(render_svg(option, width, height, settings=settings, transport=transport), scale=scale)


def map_room(option: dict[str, Any]) -> tuple[int, int]:
    """The px above and below the map that its frame's title and source line
    take, as the option gives them (app/visuals/echarts.py MAP_TOP, MAP_BOTTOM)."""
    spec = option.get("map") or {}
    return int(spec.get("top", MAP_TOP)), int(spec.get("bottom", MAP_BOTTOM))


def map_area(option: dict[str, Any], width: int, height: int, *, settings: Settings = default_settings,
             transport: httpx.BaseTransport | None = None) -> bytes:
    """The places on the base map, as the render service draws them (PNG at
    twice the size), for the area between the title and the source line."""
    places = [{"longitude": p.get("longitude"), "latitude": p.get("latitude"), "label": str((p.get("label") or {}).get("text") or p.get("name")),
               "radius": p.get("radius"), "picked": (p.get("label") or {}).get("fontWeight") == "bold"}
              for p in (option.get("map") or {}).get("places") or [] if isinstance(p, dict)]
    top, bottom = map_room(option)
    url = settings.render_service_url.rstrip("/") + "/map"
    try:
        with httpx.Client(transport=transport, timeout=settings.render_service_timeout_seconds) as client:
            response = client.post(url, json={"places": [{k: v for k, v in p.items() if v is not None} for p in places],
                                              "width": width, "height": height - top - bottom})
    except httpx.HTTPError as exc:
        raise RenderUnavailable(f"render service at {settings.render_service_url} could not be reached: {exc.__class__.__name__}: {exc}") from exc
    if response.status_code != 200:
        raise RenderUnavailable(f"render service answered {response.status_code}: {response.text[:300]}")
    if response.headers.get("content-type", "") != "image/png" or not response.content.startswith(b"\x89PNG"):
        raise RenderUnavailable("render service did not answer with a PNG map")
    return response.content


def render_map_png(option: dict[str, Any], width: int, height: int, *, scale: float = PNG_SCALE, settings: Settings = default_settings,
                   transport: httpx.BaseTransport | None = None) -> bytes:
    """A map in its chart frame: the map area from the render service, placed
    as an image between the title and the source line of the option's frame."""
    area = map_area(option, width, height, settings=settings, transport=transport)
    top, bottom = map_room(option)
    framed = {key: value for key, value in option.items() if key != "map"}
    framed["graphic"] = [{"type": "image", "left": 0, "top": top, "silent": True,
                          "style": {"image": "data:image/png;base64," + base64.b64encode(area).decode("ascii"),
                                    "width": width, "height": height - top - bottom}}]
    return svg_to_png(render_svg(framed, width, height, settings=settings, transport=transport), scale=scale)


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
