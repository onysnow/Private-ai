"""A small self-hosted base map for tests (app/services/basemap.py): a
PMTiles file with gzipped tiles, one range of one font, and a sprite."""

from __future__ import annotations

import gzip
from pathlib import Path

from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer


def write_map(path: Path, tiles: dict[tuple[int, int, int], bytes], *, max_zoom: int = 1) -> None:
    with open(path, "wb") as f:
        writer = Writer(f)
        for (z, x, y), data in sorted(tiles.items(), key=lambda item: zxy_to_tileid(*item[0])):
            writer.write_tile(zxy_to_tileid(z, x, y), gzip.compress(data))
        writer.finalize({
            "tile_type": TileType.MVT, "tile_compression": Compression.GZIP, "min_zoom": 0, "max_zoom": max_zoom,
            "min_lon_e7": -1800000000, "min_lat_e7": -850511287, "max_lon_e7": 1800000000, "max_lat_e7": 850511287,
            "center_zoom": 0, "center_lon_e7": 0, "center_lat_e7": 0,
        }, {"attribution": '<a href="https://www.openstreetmap.org/copyright">&copy; OpenStreetMap</a>', "version": "4.15.2",
            "planetiler:osm:osmosisreplicationtime": "2026-10-03T04:00:00Z"})


def install_basemap(folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    write_map(folder / "world.pmtiles", {(0, 0, 0): b"world", (1, 1, 0): b"north-east"})
    (folder / "fonts" / "Noto Sans Regular").mkdir(parents=True)
    (folder / "fonts" / "Noto Sans Regular" / "0-255.pbf").write_bytes(b"glyphs 0-255")
    (folder / "sprites" / "v4").mkdir(parents=True)
    (folder / "sprites" / "v4" / "grayscale@2x.png").write_bytes(b"\x89PNG sheet")
    (folder / "sprites" / "v4" / "grayscale.json").write_bytes(b"{}")
