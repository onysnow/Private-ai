"""The numbers beside the queries (app/visuals/stats.py): shares of a
whole, histogram bins, outliers. Each is held to its published source:
the bin counts to NumPy's estimators, the round edges to Vega's bin
transform (the expected values below are what vega-statistics 2.0.0's
own bin() returned for the same inputs), the fences to Tukey."""

import math
import random

import pytest

from app.visuals.stats import (
    BINNING_RULES, bin_count, format_share, histogram_bins, nice_bins, outlier_indexes, part_shares, tukey_fences,
)


def test_shares_add_up_to_the_whole():
    shares = part_shares([2400000, 285000, 40000])
    assert math.isclose(sum(shares), 100.0)
    assert [format_share(s) for s in shares] == ["88.1%", "10.5%", "1.5%"]
    assert part_shares([]) == [] and part_shares([0, 0]) == []
    # Eight parts rounded to one decimal stay within half a point of 100 (rule 5).
    rng = random.Random(3)
    for _ in range(200):
        values = [rng.uniform(1, 1000) for _ in range(8)]
        assert abs(sum(float(format_share(s)[:-1]) for s in part_shares(values)) - 100.0) <= 0.4 + 1e-9


@pytest.mark.parametrize("lowest, highest, max_bins, expected", [
    # vega-statistics 2.0.0, src/bin.js, called as bin({extent: [lowest, highest], maxbins})
    (5000, 2400000, 7, (0, 2500000, 500000)),
    (0, 100, 10, (0, 100, 10)),
    (12.5, 97.3, 5, (0, 100, 20)),
    (3, 3, 1, (0, 5, 5)),
    (0.012, 0.87, 6, (0, 1, 0.2)),
    (100, 1500, 4, (0, 1500, 500)),
    (250, 31622.7766, 9, (0, 35000, 5000)),
])
def test_round_bin_edges_follow_vegas_bin_transform(lowest, highest, max_bins, expected):
    found = nice_bins(lowest, highest, max_bins)
    assert (found.start, found.stop, found.step) == pytest.approx(expected)


def test_bin_counts_follow_numpys_sturges_and_doane():
    # Sturges: ceil(log2(n) + 1).
    assert bin_count(list(range(10)), "sturges") == math.ceil(math.log2(10) + 1)
    # Doane adds bins for skewness: a long right tail asks for more than Sturges.
    skewed = [5000, 7000, 12000, 15000, 18000, 22000, 30000, 45000, 250000, 2400000]
    assert bin_count(skewed, "doane") > bin_count(skewed, "sturges")
    # Doane needs three values and some spread (NumPy returns one bin otherwise).
    assert bin_count([1, 2], "doane") == 1 and bin_count([4, 4, 4], "doane") == 1
    assert bin_count([], "doane") == 0 and bin_count([7], "sturges") == 1
    assert set(BINNING_RULES) == {"doane", "sturges"}
    with pytest.raises(ValueError, match="unknown binning rule"):
        bin_count([1, 2, 3], "fd")


def test_bin_counts_match_numpy_when_it_is_installed():
    np = pytest.importorskip("numpy")  # not a backend dependency; a cross-check where it exists
    rng = random.Random(11)
    for trial in range(300):
        values = [rng.lognormvariate(9, 1.5) for _ in range(rng.randint(1, 200))]
        for rule in BINNING_RULES:
            ours = bin_count(values, rule)
            theirs = len(np.histogram_bin_edges(np.array(values), bins=rule)) - 1
            if theirs == ours + 1 and rule == "sturges" and math.log2(len(values)).is_integer():
                # NumPy turns k into a width (range / k) and back (ceil(range /
                # width)); when k is a whole number (64 values: log2 64 + 1 = 7)
                # the float round trip can land a hair above it and add a bin.
                # Sturges' rule itself says 7.
                continue
            assert ours == theirs, (trial, rule, len(values))


def test_histogram_bins_touch_have_one_width_and_hold_every_value_once():
    rng = random.Random(5)
    for _ in range(100):
        values = [round(rng.lognormvariate(8, 1.2), 2) for _ in range(rng.randint(1, 80))]
        bins = histogram_bins(values)
        assert bins and bins[-1].last and not any(b.last for b in bins[:-1])
        assert all(a.end == b.start for a, b in zip(bins, bins[1:]))            # no gaps
        assert len({round(b.end - b.start, 6) for b in bins}) == 1               # one width
        held = sorted(i for b in bins for i in b.indexes)
        assert held == list(range(len(values)))                                  # each value exactly once
        assert all(b.holds(values[i]) for b in bins for i in b.indexes)


def test_a_value_on_an_edge_goes_to_the_bin_it_opens_and_the_maximum_to_the_last():
    bins = histogram_bins([0, 500000, 1000000, 2500000])
    by_start = {b.start: b.indexes for b in bins}
    assert by_start[500000] == (1,)          # [500K, 1M) holds 500K
    assert bins[-1].end == 2500000 and 3 in bins[-1].indexes   # the last bin is closed
    assert histogram_bins([]) == []


def test_tukey_fences_and_outliers():
    assert tukey_fences([1, 2, 3]) is None   # too few to call anything an outlier
    low, high = tukey_fences([1, 2, 3, 4, 5, 6, 7, 8])
    # Q1 2.75 and Q3 6.25 by linear interpolation (NumPy's percentile gives the
    # same); IQR 3.5, so the fences sit 5.25 beyond the quartiles.
    assert (low, high) == pytest.approx((-2.5, 11.5))
    xs = [1, 2, 2, 3, 3, 4, 40]
    ys = [10, 11, 12, 13, 14, 15, 16]
    assert outlier_indexes(xs, ys) == {6}
    assert outlier_indexes([1, 2], [3, 4]) == set()
