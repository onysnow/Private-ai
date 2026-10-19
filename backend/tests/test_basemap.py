"""The self-hosted base map (app/services/basemap.py, app/api/routes_basemap.py;
ADR-0005, lines 4 and 18): tiles as stored with their encoding, the style's
fonts and sprites, nothing outside the base map folder, and a plain answer
when no base map is installed."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytest
from basemap_helpers import install_basemap, write_map
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import basemap

client = TestClient(app)


@pytest.fixture()
def folder(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "basemap_dir", str(tmp_path))
    return tmp_path


def test_without_a_base_map_the_status_says_so_and_tiles_answer_503(folder):
    reply = client.get("/api/basemap")
    assert reply.status_code == 200
    assert reply.json()["available"] is False and reply.json()["reason"] == "No base map is available."
    assert client.get("/api/basemap/tiles/0/0/0.mvt").status_code == 503


def test_tiles_are_served_as_stored_with_their_encoding(folder):
    install_basemap(folder)
    status = client.get("/api/basemap").json()
    assert status == {"available": True, "min_zoom": 0, "max_zoom": 1, "bounds": [-180.0, -85.0511287, 180.0, 85.0511287],
                      "version": "4.15.2", "built": "2026-10-03T04:00:00Z", "attribution": "© OpenStreetMap", "fonts": ["Noto Sans Regular"]}
    reply = client.get("/api/basemap/tiles/1/1/0.mvt")
    assert reply.status_code == 200
    # The HTTP client undoes the gzip, as a browser does.
    assert reply.headers["content-encoding"] == "gzip" and reply.content == b"north-east"
    assert reply.headers["cache-control"] == "private, max-age=86400"
    assert client.get("/api/basemap/tiles/1/0/1.mvt").status_code == 404     # no tile there
    assert client.get("/api/basemap/tiles/2/0/0.mvt").status_code == 404     # past the map's zoom
    assert client.get("/api/basemap/tiles/1/2/0.mvt").status_code == 404     # outside the grid


def test_a_new_extract_is_read_without_a_restart(folder):
    install_basemap(folder)
    assert client.get("/api/basemap/tiles/0/0/0.mvt").content == b"world"
    write_map(folder / "world.pmtiles", {(0, 0, 0): b"new world"}, max_zoom=0)
    os.utime(folder / "world.pmtiles", (1_900_000_000, 1_900_000_000))
    assert client.get("/api/basemap/tiles/0/0/0.mvt").content == b"new world"
    assert client.get("/api/basemap").json()["max_zoom"] == 0


def test_fonts_and_sprites_come_only_from_the_base_map_folder(folder):
    install_basemap(folder)
    (folder.parent / "secret.pbf").write_bytes(b"not a font")
    font = client.get("/api/basemap/fonts/Noto Sans Regular/0-255.pbf")
    assert font.status_code == 200 and font.content == b"glyphs 0-255"
    # A stack lists fallbacks; the first font this copy has is served.
    assert client.get("/api/basemap/fonts/Arial Unicode MS,Noto Sans Regular/0-255.pbf").content == b"glyphs 0-255"
    assert client.get("/api/basemap/fonts/Noto Sans Regular/256-511.pbf").status_code == 404     # not in this copy
    assert client.get("/api/basemap/fonts/Noto Sans Regular/1-255.pbf").status_code == 404       # not a glyph range
    assert basemap.font("Noto Sans Regular", "9" * 5000) is None
    assert basemap.font("..", "secret") is None and basemap.font("../..", "0-255") is None
    sheet = client.get("/api/basemap/sprites/grayscale@2x.png")
    assert sheet.status_code == 200 and sheet.headers["content-type"] == "image/png"
    assert client.get("/api/basemap/sprites/grayscale.json").headers["content-type"] == "application/json"
    assert basemap.sprite("../grayscale.json") is None and basemap.sprite("GRAYSCALE.png") is None


def test_font_and_sprite_symlinks_cannot_escape_the_base_map_folder(folder):
    install_basemap(folder)
    outside_fonts = folder.parent / "outside-fonts"
    outside_fonts.mkdir()
    (outside_fonts / "0-255.pbf").write_bytes(b"outside glyphs")
    font_dir = folder / "fonts" / "Noto Sans Regular"
    shutil.rmtree(font_dir)
    font_dir.symlink_to(outside_fonts, target_is_directory=True)
    assert basemap.font("Noto Sans Regular", "0-255") is None

    outside_sprites = folder.parent / "outside-sprites"
    outside_sprites.mkdir()
    (outside_sprites / "grayscale.json").write_text("{}", encoding="utf-8")
    sprite_dir = folder / "sprites" / "v4"
    shutil.rmtree(sprite_dir)
    sprite_dir.symlink_to(outside_sprites, target_is_directory=True)
    assert basemap.sprite("grayscale.json") is None
