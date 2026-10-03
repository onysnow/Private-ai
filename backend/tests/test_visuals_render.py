"""The export bridge (app/visuals/render_client.py): the render service
behind a mocked transport, vl-convert for the PNG, and one live run of
render/server.mjs on a free port (skipped when Node or the service's
packages are missing)."""

import json
import os
import re
import shutil
import socket
import subprocess
import time
from pathlib import Path

import httpx
import pytest

from app.core.config import Settings
from app.services.presentation_style import font_stack, theme as theme_for
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


@pytest.fixture()
def live_service():
    """render/server.mjs on a free port, for as long as the test runs."""
    if _node() is None:
        pytest.skip("node is not installed")
    if not (RENDER_DIR / "node_modules" / "echarts").exists():
        pytest.skip("render/node_modules is missing: run `npm ci` in render/")
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
        yield settings
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()


def test_the_live_render_service_draws_a_house_style_chart(live_service):
    built = _built()
    svg = render_svg(built.option, built.width, built.height, settings=live_service)
    assert svg.startswith("<svg") and 'width="960"' in svg
    assert "Meridian received most of the money" in svg
    assert "Meridian Holdings Ltd" in svg and "$2.4M" in svg
    png = svg_to_png(svg)
    assert png.startswith(b"\x89PNG")


def _kind_data() -> dict[str, tuple[str, VisualData]]:
    parties = [DataRow("Meridian Holdings Ltd", 2400000, [RecordRef("relationship", "r1")], 1, "Meridian Holdings Ltd"),
               DataRow("Alaric Voss", 295000, [RecordRef("relationship", "r2"), RecordRef("relationship", "r3")], 2, "Alaric Voss"),
               DataRow("Harborline Civic Trust", 12000, [RecordRef("relationship", "r4"), RecordRef("relationship", "r5")], 2, "Harborline Civic Trust")]
    category = VisualData("inv", "payments_by_party", {}, "USD", "amount", "category", "payments", parties, "USD", 5)
    months = [DataRow("Nov 2023", 2400000, [RecordRef("relationship", "r1")], 1, "2023-11"),
              DataRow("Dec 2023", 5000, [RecordRef("relationship", "r4")], 1, "2023-12"),
              DataRow("Jan 2024", 52000, [RecordRef("relationship", "r2"), RecordRef("relationship", "r5")], 2, "2024-01")]
    time_data = VisualData("inv", "payments_over_time", {}, "USD", "amount", "time", "payments", months, "USD", 4)
    amounts = [DataRow(f"Payment {i}", v, [RecordRef("relationship", f"p{i}")], 1, f"Payment {i}") for i, v in enumerate((5000, 7000, 12000, 45000, 250000, 2400000))]
    distribution = VisualData("inv", "payment_amounts", {}, "USD", "amount", "distribution", "payments", amounts, "USD", 6)
    pairs = [DataRow(row.label, row.value, row.record_refs, row.record_count, row.key, x=float(row.record_count)) for row in parties]
    pair_data = VisualData("inv", "payments_count_and_total_by_party", {}, "USD", "amount", "pairs", "payments", pairs, "USD", 5,
                           x_unit="payments", x_unit_kind="count", measure_labels={"x": "Number of payments received", "y": "Total received (USD)"})
    happened = [DataRow("Alaric Voss appointed director", 1.0, [RecordRef("timeline_event", "e1")], 1, "2019-06-11", start="2019-06-11", status="verified"),
                DataRow("Consulting contract runs", 1.0, [RecordRef("timeline_event", "e2")], 1, "2022-03-01", start="2022-03", end="2023-08-31",
                        status="asserted")]
    events = VisualData("inv", "events_in_order", {}, "events", "count", "events", "events", happened, record_count=2)
    return {"timeline": ("events_in_order", events), "line": ("payments_over_time", time_data), "area": ("payments_over_time", time_data), "stacked_bar_100": ("payments_by_party", category),
            "donut": ("payments_by_party", category), "treemap": ("payments_by_party", category), "histogram": ("payment_amounts", distribution),
            "scatter": ("payments_count_and_total_by_party", pair_data)}


def test_the_live_render_service_draws_every_statistical_kind(live_service):
    """render/server.mjs imports the whole `echarts` package (its index.js
    registers every chart, component and feature), so each kind's option
    draws as it does in the app: the title, the parts' names and the values
    come back in the SVG, and vl-convert turns each into a PNG."""
    for kind, (query, data) in _kind_data().items():
        spec = parse_spec({"kind": kind, "title": "Meridian received most of the money", "query": {"name": query}})
        built = build_chart(spec, data, theme_for("dark_academia"))
        svg = render_svg(built.option, built.width, built.height, settings=live_service)
        assert svg.startswith("<svg") and "Meridian received most of the money" in svg, kind
        expected = {"line": "$52K", "area": "$52K", "histogram": "$500K", "scatter": "Meridian Holdings Ltd"}.get(kind, "Alaric Voss")
        assert expected in svg.replace("&#36;", "$"), (kind, expected)
        png = svg_to_png(svg)
        assert png.startswith(b"\x89PNG"), kind
        # The words reach the picture: with them taken out it comes out different.
        # (Named only "Calibri", every word was dropped on a host without Calibri.)
        assert png != svg_to_png(_without_text(svg)), kind


def _without_text(svg: str) -> str:
    return re.sub(r"<text\b[^>]*>.*?</text>", "", svg, flags=re.S)


def test_vl_convert_draws_text_set_in_a_font_this_host_may_lack():
    # The font list the drawing writes (presentation_style.font_stack), as
    # ECharts writes it into the SVG: the theme's face, then generic families.
    words = (f'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60"><text x="10" y="40" '
             f'style="font-size:24px;font-family:{font_stack("Calibri")};" fill="#000">Meridian $2.4M</text></svg>')
    assert svg_to_png(words, scale=1.0) != svg_to_png(_without_text(words), scale=1.0)
