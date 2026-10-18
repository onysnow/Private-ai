"""Where a chart's words go, worked out before ECharts draws them: how wide
a line of text is, where a flat treemap puts its rectangles, and where the
labels of a 100% bar can sit without running off the picture or into each
other.

ECharts places most labels itself, but it cannot keep every one in view:
a label at the end of a line or of the longest bar runs past the plot, a
100% bar's labels over narrow neighbouring parts collide, and a treemap
quietly drops the words a small rectangle cannot hold (checked with the
render service, visuals pass 3). The drawing (app/visuals/echarts.py) uses
these numbers to leave room and move labels apart; the checker
(app/visuals/checker.py) uses the same numbers to judge what the reader
will actually see, so a chart that would lose a part's name fails rule 12
instead of passing on what its option asked for.

Text widths are the ones ECharts itself uses when it draws without a
canvas, as the render service does: zrender's table of character widths
(zrender/src/core/platform.ts, DEFAULT_TEXT_WIDTH_MAP, the same in the
zrender 6.0 that ECharts 6.1 ships), in ems, with any character outside it
counted as a full em. A browser measures the real font instead, which
runs a little wider for some of the themes' faces, so the drawing pads
every width by TEXT_SLACK.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# zrender's encoding: the character with code 32 + i is (ord(s[i]) - 20) / 100 em wide.
_WIDTH_MAP = "007LLmW'55;N0500LLLLLLLLLL00NNNLzWW\\\\WQb\\0FWLg\\bWb\\WQ\\WrWWQ000CL5LLFLL0LL**F*gLLLL5F0LF\\FFF5.5N"
_EM: dict[str, float] = {chr(32 + i): (ord(c) - 20) / 100 for i, c in enumerate(_WIDTH_MAP)}

# Room for a browser font that runs wider than zrender's table: Inter and
# Noto Sans set about 5-8% wider than Arial, whose widths the table holds.
TEXT_SLACK = 1.1
LABEL_GAP = 8.0    # px between two labels on one line, and between a label and the edge


def text_width(text: str, size: float) -> float:
    """The width ECharts gives one line of text at `size` px when it draws
    without a canvas."""
    return sum(_EM.get(ch, 1.0) for ch in text) * size


def block_width(text: str, size: float) -> float:
    """The widest line of a label that may hold line breaks."""
    return max((text_width(line, size) for line in text.split("\n")), default=0.0)


@dataclass(frozen=True)
class Rect:
    x: float
    y: float
    width: float
    height: float


def treemap_rects(values: list[float], width: float, height: float, *, border: float, gap: float,
                  square_ratio: float = 0.5 * (1 + math.sqrt(5))) -> list[Rect]:
    """The rectangles of a one-level ECharts treemap, in the order of
    `values`, relative to the series box.

    A port of ECharts' squarified layout (echarts/lib/chart/treemap/
    treemapLayout.js: squarify, worst, position; itself from d3 and Bruls,
    Huizing and van Wijk, "Squarified Treemaps", 2000) for a flat tree
    with sort 'desc', no upper label, and the same border and gap on the
    root as on the parts, as app/visuals/echarts.py draws it."""
    # The root's own border, less half the gap, frames the parts (squarify).
    half_gap = gap / 2
    offset = border - half_gap
    inner_w = max(width - 2 * offset, 0.0)
    inner_h = max(height - 2 * offset, 0.0)
    total = sum(values)
    if total <= 0 or not values:
        return [Rect(0, 0, 0, 0) for _ in values]
    # ECharts sorts largest first, ties by the later data index first.
    order = sorted(range(len(values)), key=lambda i: (-values[i], -i))
    areas = {i: values[i] / total * inner_w * inner_h for i in order}
    rect = {"x": offset, "y": offset, "width": inner_w, "height": inner_h}
    out: dict[int, Rect] = {}

    def worst(row: list[int], row_area: float, fixed: float) -> float:
        present = [areas[i] for i in row if areas[i]]
        if not row_area or not present:
            return math.inf
        square = row_area * row_area
        f = fixed * fixed * square_ratio
        return max(f * max(present) / square, square / (f * min(present)))

    def position(row: list[int], row_area: float, fixed: float, flush: bool) -> None:
        horizontal = fixed == rect["width"]
        along, across = ("x", "y") if horizontal else ("y", "x")
        length, depth = ("width", "height") if horizontal else ("height", "width")
        last = rect[along]
        other = row_area / fixed if fixed else 0.0
        if flush or other > rect[depth]:
            other = rect[depth]
        for n, i in enumerate(row):
            step = areas[i] / other if other else 0.0
            size_across = max(other - 2 * half_gap, 0.0)
            remain = rect[along] + rect[length] - last
            mod = remain if (n == len(row) - 1 or remain < step) else step
            size_along = max(mod - 2 * half_gap, 0.0)
            at_across = rect[across] + min(half_gap, size_across / 2)
            at_along = last + min(half_gap, size_along / 2)
            last += mod
            if horizontal:
                out[i] = Rect(at_along, at_across, size_along, size_across)
            else:
                out[i] = Rect(at_across, at_along, size_across, size_along)
        rect[across] += other
        rect[depth] -= other

    fixed = min(rect["width"], rect["height"])
    best = math.inf
    row: list[int] = []
    row_area = 0.0
    k = 0
    while k < len(order):
        i = order[k]
        row.append(i)
        row_area += areas[i]
        score = worst(row, row_area, fixed)
        if score <= best:
            k += 1
            best = score
        else:
            row_area -= areas[row.pop()]
            position(row, row_area, fixed, False)
            fixed = min(rect["width"], rect["height"])
            row, row_area, best = [], 0.0, math.inf
    if row:
        position(row, row_area, fixed, True)
    return [out[i] for i in range(len(values))]


def wrapped_lines(text: str, size: float, width: float) -> list[str] | None:
    """`text` broken at spaces to fit `width` (each width padded by
    TEXT_SLACK), keeping its own line breaks; None when a single word is
    wider than `width`, which ECharts would cut in the middle."""
    lines: list[str] = []
    for paragraph in text.split("\n"):
        line = ""
        for word in paragraph.split(" "):
            if text_width(word, size) * TEXT_SLACK > width:
                return None
            trial = f"{line} {word}" if line else word
            if line and text_width(trial, size) * TEXT_SLACK > width:
                lines.append(line)
                line = word
            else:
                line = trial
        lines.append(line)
    return lines


def place_on_line(centres: list[float], widths: list[float], low: float, high: float, gap: float = LABEL_GAP) -> list[float] | None:
    """The left edges of labels that want to sit centred over `centres`
    (in order, left to right) on one line, moved as little as the line
    needs to keep them `gap` apart and inside [low, high]: one sweep
    pushes right, one pulls back left, as ECharts' own label shifting does
    (echarts/lib/label/labelLayoutHelper.js, shiftLayoutOnXY). None when
    they cannot all fit."""
    if not centres:
        return []
    if sum(widths) + gap * (len(widths) - 1) > high - low:
        return None
    lefts = [c - w / 2 for c, w in zip(centres, widths)]
    edge = low
    for i, w in enumerate(widths):
        lefts[i] = max(lefts[i], edge)
        edge = lefts[i] + w + gap
    edge = high
    for i in range(len(widths) - 1, -1, -1):
        lefts[i] = min(lefts[i], edge - widths[i])
        edge = lefts[i] - gap
    return lefts
