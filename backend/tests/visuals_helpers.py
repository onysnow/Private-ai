"""Helpers for the visuals tests.

Every chart kind the order slip names is drawn now, but the path a kind
takes before it is drawn (accepted on the order slip, checked on its spec
and data only, refused by the drawing with "not drawn yet", taken out of a
draft with that reason) is how every new kind arrives. `withhold_kind`
keeps that path tested: it takes one kind out of DRAWN_KINDS, in every
module that reads it, for one test.
"""

from __future__ import annotations

import pytest

from app.ai import chart_check, reasoning
from app.visuals import data_service, echarts, spec
from app.visuals.spec import DRAWN_KINDS, ChartKind


def withhold_kind(monkeypatch: pytest.MonkeyPatch, kind: ChartKind) -> None:
    withheld = frozenset(DRAWN_KINDS - {kind})
    for module in (spec, echarts, data_service, chart_check, reasoning):
        if hasattr(module, "DRAWN_KINDS"):
            monkeypatch.setattr(module, "DRAWN_KINDS", withheld)
