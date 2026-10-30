"""The app fetches its own world map (app/services/basemap_install.py): the extract keeps zoom 0 to the chosen zoom of a
PMTiles archive, read by byte ranges, and nothing else; the download runs once and says how far it has got."""
import io
from pathlib import Path

from pmtiles.reader import MemorySource, Reader, all_tiles
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

from app.services import basemap_install


def _archive(maxzoom: int) -> bytes:
    """A small PMTiles file with every tile to `maxzoom`; each tile's bytes name it, and the sea is one shared tile."""
    out = io.BytesIO()
    writer = Writer(out)
    ids = sorted((zxy_to_tileid(z, x, y), (z, x, y)) for z in range(maxzoom + 1) for x in range(2 ** z) for y in range(2 ** z))
    for tile_id, (z, x, y) in ids:
        writer.write_tile(tile_id, b"sea" if (x + y) % 3 == 0 else f"{z}/{x}/{y}".encode())
    writer.finalize({"tile_type": TileType.MVT, "tile_compression": Compression.GZIP, "min_zoom": 0, "max_zoom": maxzoom,
                     "min_lon_e7": -1800000000, "min_lat_e7": -850000000, "max_lon_e7": 1800000000, "max_lat_e7": 850000000,
                     "center_zoom": 0, "center_lon_e7": 0, "center_lat_e7": 0}, {"attribution": "© OpenStreetMap", "version": "4.15.2"})
    return out.getvalue()


def test_the_extract_keeps_every_tile_to_the_chosen_zoom_and_no_more(tmp_path: Path) -> None:
    source = _archive(5)
    asked: list[tuple[int, int]] = []

    def get_bytes(offset: int, length: int) -> bytes:
        asked.append((offset, length))
        return source[offset:offset + length]

    seen: list[tuple[int, int]] = []
    count = basemap_install.extract(get_bytes, tmp_path / "world.pmtiles", 3, on_bytes=lambda d, t: seen.append((d, t)))
    assert count == sum(4 ** z for z in range(4))
    with open(tmp_path / "world.pmtiles", "rb") as f:
        data = f.read()
    reader = Reader(MemorySource(data))
    assert reader.header()["max_zoom"] == 3
    assert reader.metadata()["version"] == "4.15.2"
    tiles = {zxy: blob for zxy, blob in all_tiles(MemorySource(data))}
    assert max(z for z, _, _ in tiles) == 3 and len(tiles) == count
    assert tiles[(2, 1, 3)] == b"2/1/3" and tiles[(3, 0, 0)] == b"sea"
    assert seen and seen[-1][0] == seen[-1][1]          # the progress reaches the whole
    assert len(asked) < 10                             # a few ranges, not a request per tile


def test_ranges_join_neighbours_and_stay_under_the_cap() -> None:
    assert basemap_install._ranges([(0, 10), (12, 10), (5, 3)]) == [(0, 22)]
    far = basemap_install.MERGE_GAP + 100
    assert basemap_install._ranges([(0, 10), (far, 10)]) == [(0, 10), (far, 10)]
    big = basemap_install.MAX_RANGE
    assert basemap_install._ranges([(0, big), (big, 10)]) == [(0, big), (big, 10)]


def test_the_download_starts_once_and_not_when_turned_off(monkeypatch, tmp_path: Path) -> None:
    from app.core.config import settings

    started: list[str] = []
    monkeypatch.setattr(settings, "basemap_dir", str(tmp_path))
    monkeypatch.setattr(basemap_install.threading, "Thread", lambda target, name, daemon: type("T", (), {"start": lambda self: started.append(name)})())
    monkeypatch.setattr(settings, "basemap_auto", False)
    basemap_install.ensure_in_background()
    assert started == []
    monkeypatch.setattr(settings, "basemap_auto", True)
    monkeypatch.setitem(basemap_install._state, "state", "idle")
    basemap_install.ensure_in_background()
    basemap_install.ensure_in_background()              # already fetching: not started again
    assert started == ["basemap-install"]
    assert basemap_install.progress()["state"] == "fetching"
    monkeypatch.setitem(basemap_install._state, "state", "idle")
