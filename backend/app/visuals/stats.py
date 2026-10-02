"""The numbers a chart needs beyond the query's own sums and counts: the
shares of a whole, histogram bins, and the points of a scatter plot that
sit far from the rest.

They live in the kitchen's half of the pipeline, beside the data service,
because they are numbers: the drawing (echarts.py) only places them, the
exports reuse them, and the checker (checker.py) recomputes what it needs
on its own instead of trusting these functions.

Sources, each checked against its published form:

* Bin counts use NumPy's own estimators, ported from
  ``numpy/lib/_histograms_impl.py`` (``_hist_bin_sturges`` and
  ``_hist_bin_doane``, the code behind ``numpy.histogram_bin_edges``):
  Sturges (1926), k = log2(n) + 1, and Doane (1976, "Aesthetic frequency
  classifications", The American Statistician 30(4)), which adds
  log2(1 + |g1| / sigma_g1) bins for the skewness g1 of the data. Doane is
  the default because payment amounts are skewed (many small payments, a
  few very large ones), and Sturges' rule assumes roughly normal data and
  draws too few bins for skewed data (Hyndman 1995, "The problem with
  Sturges' rule for constructing histograms"). Freedman-Diaconis is not
  offered: its bin width comes from the interquartile range, and with one
  very large payment among many small ones it asks for hundreds of mostly
  empty bins across the full range. NumPy itself is not a dependency of
  the backend (one formula does not justify the wheel); the port is
  cross-checked against NumPy 2.4 in tests/test_visuals_stats.py when
  NumPy is importable.
* Round bin edges follow Vega's bin transform (``vega-statistics``,
  ``src/bin.js``): a step of 1, 2 or 5 times a power of ten, the smallest
  that keeps the number of bins at or under the estimator's count, with
  the first and last edges rounded out to multiples of the step ("nice").
  A reader can then say "$500K to $1M" instead of "$487,215 to $974,430".
* Outliers lie outside Tukey's fences (Tukey 1977, Exploratory Data
  Analysis): below Q1 - 1.5 IQR or above Q3 + 1.5 IQR. Quartiles are
  interpolated linearly (Hyndman & Fan 1996, type 7), which is NumPy's
  default and ``statistics.quantiles(..., method="inclusive")``.
"""

from __future__ import annotations

import math
import statistics
from bisect import bisect_right
from dataclasses import dataclass
from typing import Sequence

BINNING_RULES = ("doane", "sturges")
DEFAULT_BINNING = "doane"
SHARE_DECIMALS = 1        # one decimal: 8 rounded parts stay within 0.4 points of 100% (rule 5 allows 0.5)
MIN_POINTS_FOR_OUTLIERS = 4   # with fewer points no point is "far from the rest"


# --- parts of a whole -------------------------------------------------------------

def part_shares(values: Sequence[float]) -> list[float]:
    """Each value as a percentage of their sum. Empty when the sum is not
    positive: a whole that adds up to nothing (or less) has no shares, and
    the checker refuses negative parts (rule 3) before this is drawn."""
    total = math.fsum(values)
    if total <= 0:
        return []
    return [100.0 * value / total for value in values]


def format_share(share: float) -> str:
    """'88.6%': the share as it is written on a chart."""
    return f"{share:.{SHARE_DECIMALS}f}%"


# --- histogram bins ------------------------------------------------------------------

def bin_count(values: Sequence[float], rule: str = DEFAULT_BINNING) -> int:
    """How many equal bins the named rule asks for (NumPy's estimators).

    NumPy computes a bin width (range / k) and then ceil(range / width)
    bins; this returns ceil(k) directly, which is the same number without
    the floating-point round trip through the width."""
    if rule not in BINNING_RULES:
        raise ValueError(f"unknown binning rule {rule!r}; the rules are: {', '.join(BINNING_RULES)}")
    n = len(values)
    if n == 0:
        return 0
    if max(values) == min(values):
        return 1
    if rule == "sturges":
        k = math.log2(n) + 1.0
    else:
        # _hist_bin_doane: needs at least three values and some spread.
        if n <= 2:
            return 1
        sigma = statistics.pstdev(values)
        if sigma == 0:
            return 1
        mean = statistics.fmean(values)
        g1 = statistics.fmean(((v - mean) / sigma) ** 3 for v in values)
        sigma_g1 = math.sqrt(6.0 * (n - 2) / ((n + 1.0) * (n + 3)))
        k = 1.0 + math.log2(n) + math.log2(1.0 + abs(g1) / sigma_g1)
    return max(1, math.ceil(k))


@dataclass(frozen=True)
class BinRange:
    """Equal-width bins from `start` to `stop` in steps of `step`."""
    start: float
    stop: float
    step: float

    def edges(self) -> list[float]:
        count = max(1, round((self.stop - self.start) / self.step))
        first = round(self.start / self.step)
        # Each edge from an integer multiple of the step, so edges never
        # drift (0.1 + 0.2 != 0.3), rounded to the step's own precision.
        digits = max(0, -math.floor(math.log10(self.step)) + 1) if self.step < 1 else 0
        return [round((first + i) * self.step, digits) for i in range(count + 1)]


def nice_bins(lowest: float, highest: float, max_bins: int) -> BinRange:
    """Round, equal-width bins covering [lowest, highest] with at most
    `max_bins` steps before rounding the ends out (Vega's bin transform,
    vega-statistics/src/bin.js, base 10, divisors 5 and 2, nice ends)."""
    max_bins = max(1, max_bins)
    span = (highest - lowest) or abs(lowest) or 1.0
    level = math.ceil(math.log10(max_bins))
    # JavaScript's Math.round rounds halves up; Python's round() rounds them to even.
    step = 10.0 ** (math.floor(math.log10(span) + 0.5) - level)
    while math.ceil(span / step) > max_bins:
        step *= 10
    for divisor in (5, 2):
        candidate = step / divisor
        if span / candidate <= max_bins:
            step = candidate
    precision = 0 if step >= 1 else int(-math.log10(step)) + 1
    eps = 10.0 ** (-precision - 1)
    start = math.floor(lowest / step + eps) * step
    if lowest < start:
        start -= step
    stop = math.ceil(highest / step) * step
    if stop == start:
        stop = start + step
    return BinRange(start, stop, step)


@dataclass(frozen=True)
class Bin:
    start: float
    end: float
    indexes: tuple[int, ...]   # which input values fall in this bin
    last: bool = False         # the last bin includes its end (NumPy's convention)

    def holds(self, value: float) -> bool:
        return self.start <= value <= self.end if self.last else self.start <= value < self.end


def histogram_bins(values: Sequence[float], rule: str = DEFAULT_BINNING) -> list[Bin]:
    """The bins a histogram of `values` draws, every bin present (an empty
    one included, so the bars touch with no gaps), each value in exactly
    one bin: [start, end) for all but the last, which is [start, end]."""
    if not values:
        return []
    k = bin_count(values, rule)
    edges = nice_bins(min(values), max(values), k).edges()
    members: list[list[int]] = [[] for _ in range(len(edges) - 1)]
    for index, value in enumerate(values):
        slot = min(bisect_right(edges, value) - 1, len(members) - 1)
        members[max(slot, 0)].append(index)
    return [Bin(edges[i], edges[i + 1], tuple(members[i]), last=(i == len(members) - 1)) for i in range(len(members))]


# --- outliers ---------------------------------------------------------------------------

def tukey_fences(values: Sequence[float]) -> tuple[float, float] | None:
    """(low, high) fences, or None with too few values to call any an outlier."""
    if len(values) < MIN_POINTS_FOR_OUTLIERS:
        return None
    q1, _median, q3 = statistics.quantiles(values, n=4, method="inclusive")
    spread = q3 - q1
    return q1 - 1.5 * spread, q3 + 1.5 * spread


def outlier_indexes(xs: Sequence[float], ys: Sequence[float]) -> set[int]:
    """Points whose x or y lies outside that measure's Tukey fences."""
    out: set[int] = set()
    for values in (xs, ys):
        fences = tukey_fences(values)
        if fences is None:
            continue
        low, high = fences
        out.update(i for i, v in enumerate(values) if v < low or v > high)
    return out
