"""The self-hosted base map: tiles, fonts and sprites for the app's maps and
the render service's pictures (ADR-0005, lines 4 and 18;
app/services/basemap.py). Behind the same sign-in as every other route, so
no outside host serves or sees a map request."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.api.dependencies import authorize_request_resource
from app.schemas.responses import BasemapStatusOut, ErrorOut, file_response
from app.services import basemap

router = APIRouter(prefix="/api/basemap", dependencies=[Depends(authorize_request_resource)])

# Tiles, fonts and sprites change only when the base map is installed again:
# the browser may keep them for a day, for this user only.
_CACHE = {"Cache-Control": "private, max-age=86400"}
_NOT_INSTALLED: dict[int | str, dict[str, Any]] = {
    503: {"model": ErrorOut, "description": "No base map is installed here: the compose profile 'maps' has not run"}}


@router.get("", response_model=BasemapStatusOut)
def get_basemap_status() -> Any:
    """Whether a base map is installed, the zoom levels and area it covers, and its fonts."""
    return basemap.status()


@router.get("/tiles/{z}/{x}/{y}.mvt", response_class=Response,
            responses={**file_response("application/vnd.mapbox-vector-tile", "One vector tile, as stored (gzip-encoded)"), **_NOT_INSTALLED})
def get_basemap_tile(z: int, x: int, y: int) -> Response:
    try:
        found = basemap.tile(z, x, y)
    except basemap.BasemapUnavailable:
        raise HTTPException(503, "The base map is unavailable.")
    if found is None:
        raise HTTPException(404, "The base map has no tile there")
    data, encoding = found
    headers = {**_CACHE, **({"Content-Encoding": encoding} if encoding else {})}
    return Response(data, media_type="application/vnd.mapbox-vector-tile", headers=headers)


@router.get("/fonts/{stack}/{glyph_range}.pbf", response_class=Response,
            responses=file_response("application/x-protobuf", "One range of 256 glyphs of a font the base map style uses"))
def get_basemap_font(stack: str, glyph_range: str) -> Response:
    data = basemap.font(stack, glyph_range)
    if data is None:
        raise HTTPException(404, "No such font or glyph range here")
    return Response(data, media_type="application/x-protobuf", headers=_CACHE)


@router.get("/sprites/{name}", response_class=Response,
            responses={200: {"description": "A sprite sheet (PNG) or its index (JSON)",
                             "content": {"image/png": {"schema": {"type": "string", "format": "binary"}},
                                         "application/json": {"schema": {"type": "object"}}}}})
def get_basemap_sprite(name: str) -> Response:
    found = basemap.sprite(name)
    if found is None:
        raise HTTPException(404, "No such sprite here")
    data, media_type = found
    return Response(data, media_type=media_type, headers=_CACHE)
