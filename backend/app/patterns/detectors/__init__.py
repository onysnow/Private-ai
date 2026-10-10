"""Detector families (docs/discovery/detection-design.md): small, tested
functions that each measure one kind of thing on the case graph. An
indicator's detection is a spec (catalogue/detection/*.yaml) that picks a
family and fills in its settings; the family returns measures, and the
spec's bands turn a measure's value into Faint, Strong or Textbook.

A family module defines NAME, VERSION, a pydantic Params model, NEEDS(params)
(the kinds of records it reads, for the applicability gate) and
measure(graph, params) -> list[Measure]."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Measure:
    parties: list[str]
    links: list[str]
    value: float | None = None  # what the bands read; None for a family that only finds a shape
    facts: dict[str, Any] = field(default_factory=dict)  # stored with the flag and offered to the summary


def families() -> dict[str, Any]:
    from app.patterns.detectors import (
        count_in_band, count_in_window, cycle, missing_property, path_length, property_threshold, sequence_within,
        shared_holder_link, shared_property,
    )
    mods = [cycle, path_length, missing_property, shared_property, count_in_band, shared_holder_link,
            property_threshold, count_in_window, sequence_within]
    return {m.NAME: m for m in mods}
