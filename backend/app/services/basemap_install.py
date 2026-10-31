"""Getting the base map, once, by the app itself (Places, PLACE_1; ADR-0005 lines 4 and 18).

The base map used to need a setup step (the compose profile `maps`), so Places drew a grid instead of a map until
someone ran it. Now the backend fetches it when it first starts without one: a world extract of the newest Protomaps
daily build to zoom 6 (about 45 MB) and the style's fonts and sprites from Protomaps' basemaps-assets. It is the same
public file for everyone, read by byte ranges of the planet file; nothing about a case is in any request, and each
download is a line in the outbound log (kind "download", no case).

The extract: a PMTiles v3 file numbers its tiles along a Hilbert curve by zoom, so every tile from zoom 0 to 6 has an
id below 5,461. The directories are walked for those ids only, the tile bytes fetched in a few large ranges, and the
tiles written to `world.pmtiles` with the `pmtiles` writer. The file is written beside the final name and renamed at
the end, so a half-done download is never read as a map.
"""
from __future__ import annotations

import gzip
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Callable

import httpx
from pmtiles.tile import Compression, deserialize_directory, deserialize_header, zxy_to_tileid
from pmtiles.writer import Writer

from app.core.config import settings
from app.services.basemap import BASEMAP_FILE, SPRITE_VERSION, basemap_dir

logger = logging.getLogger("journalism.basemap")

BUILDS = "https://build-metadata.protomaps.dev/builds.json"
BUILD_URL = "https://build.protomaps.com/{key}"
ASSETS = "https://protomaps.github.io/basemaps-assets"
FONTS = ("Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic")
SPRITES = tuple(f"{flavor}{scale}.{ext}" for flavor in ("light", "dark", "grayscale") for scale in ("", "@2x") for ext in ("json", "png"))
MERGE_GAP = 1 << 20          # ranges closer than 1 MB are fetched as one request
MAX_RANGE = 16 << 20         # and no single request is larger than 16 MB

_state: dict[str, Any] = {"state": "idle", "done": 0, "total": 0, "error": None}
_lock = threading.Lock()


def progress() -> dict[str, Any]:
    """Where the download is: idle, fetching (done and total bytes), ready, or failed with why."""
    with _lock:
        return dict(_state)


def _set(**kw: Any) -> None:
    with _lock:
        _state.update(kw)


def tiles_below(maxzoom: int) -> int:
    """How many tile ids zoom 0 to `maxzoom` use: every id below this one."""
    return zxy_to_tileid(maxzoom + 1, 0, 0)


def newest_build(client: httpx.Client) -> str:
    builds = client.get(BUILDS).raise_for_status().json()
    return str(sorted(str(b["key"]) for b in builds if str(b.get("key", "")).endswith(".pmtiles"))[-1])


def _ranges(spans: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Byte spans (offset, length) joined into few requests: neighbours closer than MERGE_GAP, up to MAX_RANGE each."""
    out: list[tuple[int, int]] = []
    for off, length in sorted(set(spans)):
        if out and off - (out[-1][0] + out[-1][1]) <= MERGE_GAP and off + length - out[-1][0] <= MAX_RANGE:
            start = out[-1][0]
            out[-1] = (start, max(out[-1][0] + out[-1][1], off + length) - start)
        else:
            out.append((off, length))
    return out


def extract(get_bytes: Callable[[int, int], bytes], dest: Path, maxzoom: int,
            on_bytes: Callable[[int, int], None] = lambda done, total: None) -> int:
    """Copy zoom 0 to `maxzoom` of a PMTiles v3 archive (read through `get_bytes`) into `dest`. Returns the tile count."""
    head = get_bytes(0, 16384)
    header = deserialize_header(head[:127])
    limit = tiles_below(maxzoom)

    def directory(offset: int, length: int) -> list[Any]:
        raw = head[offset:offset + length] if offset + length <= len(head) else get_bytes(offset, length)
        return list(deserialize_directory(raw))   # the pmtiles package reads gzip directories, the only kind it writes

    entries: list[Any] = []
    pending = [(header["root_offset"], header["root_length"])]
    while pending:
        offset, length = pending.pop()
        found = directory(offset, length)
        for i, entry in enumerate(found):
            if entry.tile_id >= limit:
                break
            if entry.run_length == 0:     # a leaf directory: its ids start here and end before the next entry's
                pending.append((header["leaf_directory_offset"] + entry.offset, entry.length))
            else:
                entries.append(entry)
    entries.sort(key=lambda e: e.tile_id)

    base = header["tile_data_offset"]
    spans = _ranges([(base + e.offset, e.length) for e in entries])
    total = sum(length for _, length in spans)
    blobs: list[tuple[int, bytes]] = []
    done = 0
    for off, length in spans:
        blobs.append((off, get_bytes(off, length)))
        done += length
        on_bytes(done, total)

    def data(entry: Any) -> bytes:
        at = base + entry.offset
        for off, blob in blobs:
            if off <= at < off + len(blob):
                return blob[at - off:at - off + entry.length]
        raise ValueError(f"tile {entry.tile_id} was not fetched")

    meta_raw = get_bytes(header["metadata_offset"], header["metadata_length"])
    if header["internal_compression"] == Compression.GZIP:
        meta_raw = gzip.decompress(meta_raw)
    metadata = json.loads(meta_raw or b"{}")

    count = 0
    with open(dest, "wb") as f:
        writer = Writer(f)
        for entry in entries:
            tile = data(entry)
            for k in range(entry.run_length):
                if entry.tile_id + k >= limit:
                    break
                writer.write_tile(entry.tile_id + k, tile)
                count += 1
        out = dict(header)
        out.update(min_zoom=0, max_zoom=min(maxzoom, header["max_zoom"]), center_zoom=min(header.get("center_zoom", 0), maxzoom))
        writer.finalize(out, metadata)
    return count


def _http_bytes(client: httpx.Client, url: str) -> Callable[[int, int], bytes]:
    def get_bytes(offset: int, length: int) -> bytes:
        for attempt in range(4):
            try:
                r = client.get(url, headers={"Range": f"bytes={offset}-{offset + length - 1}"})
                r.raise_for_status()
                return r.content
            except httpx.HTTPError:
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        raise AssertionError("unreachable")
    return get_bytes


def _assets(client: httpx.Client, folder: Path) -> None:
    """The style's fonts (every range of 256 glyphs each font has) and sprites. Kept files are not fetched again."""
    for font in FONTS:
        (folder / "fonts" / font).mkdir(parents=True, exist_ok=True)
        for start in range(0, 65536, 256):
            file = folder / "fonts" / font / f"{start}-{start + 255}.pbf"
            if file.exists() and file.stat().st_size:
                continue
            r = client.get(f"{ASSETS}/fonts/{font.replace(' ', '%20')}/{start}-{start + 255}.pbf")
            if r.status_code == 200 and r.content:
                file.write_bytes(r.content)
    sprites = folder / "sprites" / SPRITE_VERSION
    sprites.mkdir(parents=True, exist_ok=True)
    for name in SPRITES:
        file = sprites / name
        if not (file.exists() and file.stat().st_size):
            file.write_bytes(client.get(f"{ASSETS}/sprites/{SPRITE_VERSION}/{name}").raise_for_status().content)


def install(maxzoom: int | None = None, folder: Path | None = None) -> Path:
    """Fetch the base map into the base-map folder. Safe to run again: a kept map is left as it is."""
    from app.services.outbound import record_platform_request

    folder = folder or basemap_dir()
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / BASEMAP_FILE
    zoom = maxzoom if maxzoom is not None else settings.basemap_maxzoom
    _set(state="fetching", done=0, total=0, error=None)
    try:
        with httpx.Client(timeout=120, follow_redirects=True) as client:
            if not target.exists():
                record_platform_request(None, kind="download", service="Protomaps", destination="build-metadata.protomaps.dev",
                                        sent="The list of the public world map's builds. Nothing about a case.")
                key = newest_build(client)
                url = BUILD_URL.format(key=key)
                record_platform_request(None, kind="download", service="Protomaps", destination="build.protomaps.com",
                                        sent=f"The public world map {key}, zoom 0–{zoom}. Nothing about a case.")
                part = target.with_suffix(".part")
                extract(_http_bytes(client, url), part, zoom, on_bytes=lambda d, t: _set(done=d, total=t))
                os.replace(part, target)
            record_platform_request(None, kind="download", service="Protomaps", destination="protomaps.github.io",
                                    sent="The map's public fonts and symbols. Nothing about a case.")
            _assets(client, folder)
    except Exception as exc:  # the map is a convenience: a failure is said in Places, never stops the app
        logger.warning("base map download failed: %s", exc)
        _set(state="failed", error="The world map could not be downloaded. Places tries again the next time it opens.")
        raise
    _set(state="ready")
    return target


def ensure_in_background() -> None:
    """Start the download if there is no map and none is running. Called at start-up and when Places asks."""
    if not settings.basemap_auto or (basemap_dir() / BASEMAP_FILE).exists() and (basemap_dir() / "sprites" / SPRITE_VERSION / "light.json").exists():
        return
    with _lock:
        if _state["state"] == "fetching":
            return
        _state.update(state="fetching", done=0, total=0, error=None)

    def run() -> None:
        try:
            install()
        except Exception:
            pass
    threading.Thread(target=run, name="basemap-install", daemon=True).start()
