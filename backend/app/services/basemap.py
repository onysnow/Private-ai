"""The self-hosted base map (ADR-0005, lines 4 and 18).

One Protomaps PMTiles file (a world extract of the Protomaps daily build,
to zoom 6 by default) and a copy of Protomaps' `basemaps-assets` (the
style's fonts and sprites) sit in `settings.basemap_dir`; the compose
profile `maps` puts them there once, at setup. The app's maps and the
render service's pictures ask the backend for every tile, font and sprite,
so no other host learns which places a reporter looks at.

The file is read with the `pmtiles` package (BSD-3), memory-mapped, and
opened again when it changes (a new extract). Tiles are served as stored:
the Protomaps build keeps them gzipped, so they go out with
`Content-Encoding: gzip`, which every browser and MapLibre Native undo.

Layout of the folder (as `basemaps-assets` publishes it):

    world.pmtiles
    fonts/<font stack>/<first>-<last>.pbf     e.g. fonts/Noto Sans Regular/0-255.pbf
    sprites/v4/<flavor>[@2x].json|png         e.g. sprites/v4/grayscale@2x.png
"""

from __future__ import annotations

import os
import re
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pmtiles.reader import Compression, MmapSource, Reader

from app.core.config import settings

BASEMAP_FILE = "world.pmtiles"
FONT_RANGE = re.compile(r"^(\d+)-(\d+)$")
SPRITE_NAME = re.compile(r"^[a-z]+(@2x)?\.(json|png)$")
SPRITE_VERSION = "v4"   # the sprite folder @protomaps/basemaps 5 points at


class BasemapUnavailable(RuntimeError):
    """No base map is installed here (the `maps` setup has not run)."""


@dataclass
class _Opened:
    path: Path
    stamp: tuple[float, int]
    handle: Any
    reader: Reader
    header: dict[str, Any]
    metadata: dict[str, Any]


_lock = threading.Lock()
_opened: _Opened | None = None


def basemap_dir() -> Path:
    return Path(settings.basemap_dir)


def _open() -> _Opened:
    """The base map file, opened once and again whenever it is replaced."""
    global _opened
    path = basemap_dir() / BASEMAP_FILE
    try:
        stat = path.stat()
    except OSError as exc:
        raise BasemapUnavailable(f"no base map at {path}: run the compose profile 'maps' once to install it") from exc
    stamp = (stat.st_mtime, stat.st_size)
    with _lock:
        if _opened is not None and _opened.path == path and _opened.stamp == stamp:
            return _opened
        handle = open(path, "rb")
        try:
            # MmapSource maps the file read-only; the mapping outlives the handle.
            reader = Reader(MmapSource(handle))
            header, metadata = reader.header(), reader.metadata()
        except Exception as exc:
            handle.close()
            raise BasemapUnavailable(f"the base map at {path} cannot be read: {exc}") from exc
        if _opened is not None:
            _opened.handle.close()
        _opened = _Opened(path, stamp, handle, reader, header, metadata)
        return _opened


def tile(z: int, x: int, y: int) -> tuple[bytes, str | None] | None:
    """One vector tile as stored, with the content encoding it is stored in
    ("gzip", or None for uncompressed); None when the map has no tile there."""
    opened = _open()
    if not (opened.header["min_zoom"] <= z <= opened.header["max_zoom"]) or not (0 <= x < 2 ** z and 0 <= y < 2 ** z):
        return None
    data = opened.reader.get(z, x, y)
    if data is None:
        return None
    compression = opened.header["tile_compression"]
    return bytes(data), ("gzip" if compression == Compression.GZIP else None)


def fonts() -> list[str]:
    folder = basemap_dir() / "fonts"
    try:
        return sorted(entry.name for entry in os.scandir(folder) if entry.is_dir())
    except OSError:
        return []


def font(stack: str, glyph_range: str) -> bytes | None:
    """One range of glyphs of one font stack. MapLibre asks for a stack as
    the names its style lists, comma-separated; the first one this copy has
    is served (the stacks @protomaps/basemaps names are single fonts)."""
    match = FONT_RANGE.match(glyph_range)
    if match is None or int(match.group(1)) % 256 or int(match.group(2)) != int(match.group(1)) + 255:
        return None
    have = set(fonts())
    for name in (part.strip() for part in stack.split(",")):
        if name in have:
            try:
                return (basemap_dir() / "fonts" / name / f"{glyph_range}.pbf").read_bytes()
            except OSError:
                return None
    return None


def sprite(name: str) -> tuple[bytes, str] | None:
    """A sprite sheet (`grayscale@2x.png`) or its index (`grayscale.json`)."""
    if not SPRITE_NAME.match(name):
        return None
    try:
        data = (basemap_dir() / "sprites" / SPRITE_VERSION / name).read_bytes()
    except OSError:
        return None
    return data, ("application/json" if name.endswith(".json") else "image/png")


def status() -> dict[str, Any]:
    """Whether a base map is installed, and what it covers."""
    try:
        opened = _open()
    except BasemapUnavailable as exc:
        return {"available": False, "reason": str(exc), "fonts": fonts()}
    header, metadata = opened.header, opened.metadata
    return {
        "available": True,
        "min_zoom": header["min_zoom"], "max_zoom": header["max_zoom"],
        "bounds": [header["min_lon_e7"] / 1e7, header["min_lat_e7"] / 1e7, header["max_lon_e7"] / 1e7, header["max_lat_e7"] / 1e7],
        "version": str(metadata.get("version") or ""),
        "built": str(metadata.get("planetiler:osm:osmosisreplicationtime") or ""),
        # The data's own attribution, as plain words (the file holds it as a link).
        "attribution": "© OpenStreetMap" if "openstreetmap" in str(metadata.get("attribution", "")).lower() else str(metadata.get("attribution") or ""),
        "fonts": fonts(),
    }
