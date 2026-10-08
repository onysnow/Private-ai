"""Read the catalogue from ``catalogue/`` and check it hangs together.

``load()`` parses every YAML file through the models (so a malformed entry
fails loudly) and ``problems()`` lists what the models alone cannot see:
duplicate ids, cross-hints to an area or indicator that does not exist,
glossary links to unknown indicators.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml  # type: ignore[import-untyped]  # stubs (types-PyYAML) not installed; ADR-0007

from app.catalogue.models import Area, Glossary, Indicator, Status

ROOT = Path(__file__).resolve().parents[3] / "catalogue"


@dataclass
class Catalogue:
    areas: list[Area]
    glossaries: list[Glossary]
    by_id: dict[str, Indicator] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.by_id = {i.id: i for a in self.areas for i in a.indicators}

    def area_names(self) -> set[str]:
        return {a.key for a in self.areas} | {a.name for a in self.areas}

    def verified(self) -> list[Indicator]:
        return [i for a in self.areas for i in a.indicators if i.status is Status.verified]


def load(root: Path = ROOT) -> Catalogue:
    areas = [Area.model_validate(yaml.safe_load(p.read_text(encoding="utf-8"))) for p in sorted((root / "indicators").glob("*.yaml"))]
    glossaries = [Glossary.model_validate(yaml.safe_load(p.read_text(encoding="utf-8"))) for p in sorted((root / "glossary").glob("*.yaml"))]
    return Catalogue(areas=areas, glossaries=glossaries)


def problems(cat: Catalogue) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for area in cat.areas:
        for ind in area.indicators:
            if ind.id in seen:
                out.append(f"duplicate indicator id {ind.id}")
            seen.add(ind.id)
            if not ind.id.startswith(area.key + "-"):
                out.append(f"{ind.id} sits in area {area.key} but its id has another prefix")
            for hint in ind.cross_hints:
                if hint.target_area not in cat.area_names():
                    out.append(f"{ind.id} cross-hint points to unknown area {hint.target_area!r}")
                if hint.target_indicator and hint.target_indicator not in cat.by_id:
                    out.append(f"{ind.id} cross-hint points to unknown indicator {hint.target_indicator!r}")
    for glossary in cat.glossaries:
        for term in glossary.terms:
            for ref in term.indicators:
                if ref not in cat.by_id:
                    out.append(f"glossary term {term.term!r} links to unknown indicator {ref!r}")
    return out
