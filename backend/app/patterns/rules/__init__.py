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
