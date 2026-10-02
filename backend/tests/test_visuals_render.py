"""The export bridge (app/visuals/render_client.py): the render service
behind a mocked transport, vl-convert for the PNG, and one live run of
render/server.mjs on a free port (skipped when Node or the service's
packages are missing)."""

import json
import os
import shutil
import socket
import subprocess
import time
from pathlib import Path

import httpx
import pytest

from app.core.config import Settings
from app.services.presentation_style import theme as theme_for
from app.visuals.data_service import DataRow, RecordRef, VisualData
from app.visuals.echarts import build_chart
from app.visuals.render_client import RenderUnavailable, render_png, render_service_status, render_svg, svg_to_png
from app.visuals.spec import parse_spec

RENDER_DIR = Path(__file__).resolve().parents[2] / "render"
SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#B98D34"/></svg>'


def _settings() -> Settings:
    return Settings(render_service_url="http://render.test:8070", render_service_timeout_seconds=2.0, _env_file=None)


def _data() -> VisualData:
    rows = [DataRow("Meridian Holdings Ltd", 2400000, [RecordRef("relationship", "r1")], 1, "Meridian Holdings Ltd"),
            DataRow("Arden Partners", 285000, [RecordRef("relationship", "r2"), RecordRef("relationship", "r3")], 2, "Arden Partners")]
    return VisualData("inv", "payments_by_party", {"direction": "received"}, "USD", "amount", "category", "payments", rows, "USD", 3)


def _built():
    spec = parse_spec({"kind": "bar", "title": "Meridian received most of the money", "query": {"name": "payments_by_party"}})
    return build_chart(spec, _data(), theme_for("dark_academia"))


def test_render_svg_posts_the_option_and_returns_the_svg():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, headers={"content-type": "image/svg+xml; charset=utf-8"}, text=SVG)

    svg = render_svg({"series": []}, 300, 150, settings=_settings(), transport=httpx.MockTransport(handler))
    assert svg == SVG
    assert seen["url"] == "http://render.test:8070/echarts"
    assert seen["body"] == {"option": {"series": []}, "width": 300, "height": 150}


@pytest.mark.parametrize("handler, fragment", [
    (lambda request: (_ for _ in ()).throw(httpx.ConnectError("refused")), "could not be reached"),
    (lambda request: httpx.Response(500, text="boom"), "answered 500"),
    (lambda request: httpx.Response(422, json={"error": "cannot draw"}), "answered 422"),
    (lambda request: httpx.Response(200, headers={"content-type": "text/html"}, text="<html>"), "did not answer with an SVG"),
])
def test_an_unreachable_or_unhelpful_service_raises_render_unavailable(handler, fragment):
    with pytest.raises(RenderUnavailable, match=fragment):
        render_svg({"series": []}, 300, 150, settings=_settings(), transport=httpx.MockTransport(handler))


def test_svg_to_png_uses_vl_convert():
    png = svg_to_png(SVG)
    assert png.startswith(b"\x89PNG\r\n\x1a\n")


def test_render_png_runs_the_whole_bridge():
    transport = httpx.MockTransport(lambda request: httpx.Response(200, headers={"content-type": "image/svg+xml"}, text=SVG))
    png = render_png({"series": []}, 300, 150, settings=_settings(), transport=transport)
    assert png.startswith(b"\x89PNG")


def test_render_service_status_reports_reachability():
    up = httpx.MockTransport(lambda request: httpx.Response(200, json={"ok": True, "echarts": "6.1.0"}))
    assert render_service_status(settings=_settings(), transport=up) == {"url": "http://render.test:8070", "reachable": True, "echarts": "6.1.0", "error": None}
    down = httpx.MockTransport(lambda request: (_ for _ in ()).throw(httpx.ConnectError("refused")))
    status = render_service_status(settings=_settings(), transport=down)
    assert status["reachable"] is False and "ConnectError" in status["error"]


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _node() -> str | None:
    for candidate in (shutil.which("node"), "/opt/node22/bin/node"):
        if candidate and Path(candidate).exists():
            return candidate
    return None


@pytest.mark.skipif(_node() is None, reason="node is not installed")
@pytest.mark.skipif(not (RENDER_DIR / "node_modules" / "echarts").exists(), reason="render/node_modules is missing: run `npm ci` in render/")
def test_the_live_render_service_draws_a_house_style_chart():
    port = _free_port()
    process = subprocess.Popen([_node() or "node", "server.mjs"], cwd=RENDER_DIR, env={**os.environ, "PORT": str(port), "HOST": "127.0.0.1"},
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    settings = Settings(render_service_url=f"http://127.0.0.1:{port}", render_service_timeout_seconds=20.0, _env_file=None)
    try:
        for _ in range(100):
            if process.poll() is not None:
                raise AssertionError(f"render service exited early: {process.stdout.read() if process.stdout else ''}")
            if render_service_status(settings=settings)["reachable"]:
                break
            time.sleep(0.1)
        else:
            raise AssertionError("render service did not come up")
        built = _built()
        svg = render_svg(built.option, built.width, built.height, settings=settings)
        assert svg.startswith("<svg") and 'width="960"' in svg
        assert "Meridian received most of the money" in svg
        assert "Meridian Holdings Ltd" in svg and "$2.4M" in svg
        png = svg_to_png(svg)
        assert png.startswith(b"\x89PNG")
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
