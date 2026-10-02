"""Where a chart's words land (app/visuals/layout.py): text widths and
treemap rectangles as ECharts itself works them out, and labels moved
apart on a line. The numbers below were read from ECharts 6.1 (the render
service's own copy); the last test asks the installed ECharts again when
Node and render/node_modules are there."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.visuals.layout import LABEL_GAP, TEXT_SLACK, place_on_line, text_width, treemap_rects, wrapped_lines

RENDER_DIR = Path(__file__).resolve().parents[2] / "render"


def test_text_widths_are_the_ones_echarts_uses_without_a_canvas():
    # zrender's platformApi.measureText('...', '12px sans-serif') in Node.
    assert text_width("Meridian Holdings Ltd", 12) == pytest.approx(116.4)
    # "·" and "†" are outside zrender's table, so each counts as a full em.
    assert text_width("88.7% · $2.4M · 1 payment †", 12) == pytest.approx(176.76)
    assert text_width("", 12) == 0


def test_treemap_rectangles_are_echarts_own():
    # ECharts 6.1, series box 960 x 416, borderWidth 2, gapWidth 2, sort desc.
    rects = treemap_rects([50, 30, 20, 10, 5], 960, 416, border=2, gap=2)
    expected = [(2, 2, 414.5217391304348, 412), (418.5217391304348, 2, 414.5217391304348, 246.4),
                (418.5217391304348, 250.4, 414.5217391304348, 163.6), (835.0434782608696, 2, 122.95652173913038, 274),
                (835.0434782608696, 278, 122.95652173913038, 136)]
    for rect, want in zip(rects, expected):
        assert (rect.x, rect.y, rect.width, rect.height) == pytest.approx(want)
    # In the order given, not the order laid out: the small part last here is laid out last too.
    lopsided = treemap_rects([2400000, 295000, 12000], 960, 416, border=2, gap=2)
    assert lopsided[2].height == pytest.approx(14.182410423452893)


def test_labels_on_a_line_move_apart_and_into_the_picture():
    # Two labels that overlap at the right edge: pulled left and apart, nothing past 100.
    lefts = place_on_line([80, 95], [30, 30], 0, 100)
    assert lefts is not None
    assert lefts[1] + 30 <= 100 and lefts[0] + 30 + LABEL_GAP <= lefts[1] + 1e-9
    # Labels with room stay centred over their marks.
    assert place_on_line([20, 80], [10, 10], 0, 100) == [15, 75]
    # More than the line holds: no placement.
    assert place_on_line([10, 20, 30], [40, 40, 40], 0, 100) is None


def test_words_wrap_at_spaces_and_a_word_too_wide_is_refused():
    width = text_width("Harborline Civic", 12) * TEXT_SLACK + 1
    assert wrapped_lines("Harborline Civic Trust\n0.4% · $12K", 12, width) == ["Harborline Civic", "Trust", "0.4% · $12K"]
    assert wrapped_lines("Harborline", 12, 20) is None


@pytest.mark.skipif(shutil.which("node") is None or not (RENDER_DIR / "node_modules" / "echarts").is_dir(),
                    reason="needs Node and the render service's node_modules (cd render && npm ci)")
def test_the_port_matches_the_installed_echarts():
    script = """
import * as echarts from 'echarts';
import {platformApi} from 'zrender/lib/core/platform.js';
const cases = JSON.parse(process.argv[1]);
const out = {widths: cases.texts.map(t => platformApi.measureText(t, '12px sans-serif').width), treemaps: []};
for (const values of cases.treemaps) {
  const chart = echarts.init(null, null, {renderer: 'svg', ssr: true, width: 960, height: 540});
  chart.setOption({animation: false, series: [{type: 'treemap', roam: false, nodeClick: false, breadcrumb: {show: false}, sort: 'desc',
    left: 0, right: 0, top: 84, bottom: 40, visibleMin: 0, upperLabel: {show: false}, itemStyle: {borderWidth: 2, gapWidth: 2},
    data: values.map((v, i) => ({name: 'p' + i, value: v}))}]});
  out.treemaps.push(chart.getModel().getSeriesByIndex(0).getData().tree.root.children.map(n => {
    const l = n.getLayout(); return [l.x, l.y, l.width, l.height]; }));
  chart.dispose();
}
console.log(JSON.stringify(out));
"""
    cases = {"texts": ["Harborline Civic Trust", "WWW iii", "$52K · 2 payments", "10.9% · $295K · 2 payments"],
             "treemaps": [[7, 3, 3, 1, 1, 1, 9, 2], [10, 10, 10, 10], [5, 5], [1], [2400000, 295000, 12000]]}
    result = subprocess.run(["node", "--input-type=module", "-e", script, json.dumps(cases)], cwd=RENDER_DIR,
                            capture_output=True, text=True, timeout=60, check=True)
    theirs = json.loads(result.stdout)
    for text, width in zip(cases["texts"], theirs["widths"]):
        assert text_width(text, 12) == pytest.approx(width), text
    for values, rects in zip(cases["treemaps"], theirs["treemaps"]):
        mine = treemap_rects(values, 960, 540 - 84 - 40, border=2, gap=2)
        for rect, want in zip(mine, rects):
            assert (rect.x, rect.y, rect.width, rect.height) == pytest.approx(want), values
