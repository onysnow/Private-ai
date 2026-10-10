"""One module per rule. Each defines INDICATOR (the catalogue id it
computes), VERSION, WEAK (True when the catalogue or the research says the
pattern is weak on its own) and run(graph) -> list[Occurrence]."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Occurrence:
    level: str  # faint | strong | textbook
    parties: list[str]
    links: list[str]
    facts: dict[str, Any] = field(default_factory=dict)
    summary: str = ""
    # What the records cannot show and a person has to judge (a partial match is
    # Faint; indicators.md, "Partial matches are Faint").
    not_shown: list[str] = field(default_factory=list)
