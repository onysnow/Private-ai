"""Detection specs (docs/discovery/detection-design.md): each indicator's
detection as data, in catalogue/detection/*.yaml. A spec picks a detector
family and fills in its settings; its bands turn a measure's value into a
level, each band with the sentence the card shows; a spec that has no bands
gives every measure its one level. A spec runs only when the case holds the
kinds of records it needs; otherwise it "cannot run", with its reason."""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import yaml  # type: ignore[import-untyped]
from pydantic import BaseModel, Field, model_validator

from app.patterns.detectors import Measure, families
from app.patterns.graph import CaseGraph

ROOT = Path(__file__).resolve().parents[3] / "catalogue" / "detection"
Level = Literal["faint", "strong", "textbook"]


class Band(BaseModel):
    level: Level
    from_: float | None = Field(default=None, alias="from")  # inclusive
    to: float | None = None  # exclusive
    reason: str = Field(min_length=1)

    def holds(self, value: float | None) -> bool:
        if value is None:
            return False
        return (self.from_ is None or value >= self.from_) and (self.to is None or value < self.to)


class Example(BaseModel):
    """A small case and the level the spec must give it (None: no flag)."""
    name: str
    parties: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []
    expect: Level | None


class Spec(BaseModel):
    indicator: str
    version: int = 1
    family: str
    params: dict[str, Any] = {}
    level: Level | None = None
    bands: list[Band] = []
    summary: str = Field(min_length=1, description="{fact} placeholders filled from the measure")
    not_shown: list[str] = []
    weak: bool = False
    cannot_run: str | None = Field(default=None, description="why it cannot run when the records it needs are missing")
    examples: list[Example] = []

    @model_validator(mode="after")
    def one_way_to_level(self) -> "Spec":
        if (self.level is None) == (not self.bands):
            raise ValueError(f"{self.indicator}: give either a level or bands")
        return self

    def family_module(self) -> Any:
        return families()[self.family]

    def parsed_params(self) -> Any:
        return self.family_module().Params(**self.params)

    def needs(self) -> list[str]:
        return list(self.family_module().needs(self.parsed_params()))

    def level_for(self, value: float | None) -> tuple[str, str] | None:
        if self.level:
            return self.level, ""
        held = [b for b in self.bands if b.holds(value)]
        order = {"faint": 0, "strong": 1, "textbook": 2}
        best = max(held, key=lambda b: order[b.level], default=None)
        return (best.level, best.reason) if best else None

    def text(self, facts: dict[str, Any]) -> str:
        out = re.sub(r"\{([a-z_]+)\}", lambda m: str(facts.get(m.group(1), m.group(0))), self.summary)
        # A name that ends in a full stop ("Lamesa Holding S.A.") must not end the sentence twice.
        return re.sub(r"\.\.(?=\s|$)", ".", out)


class Result(BaseModel):
    level: str
    band_reason: str
    parties: list[str]
    links: list[str]
    facts: dict[str, Any]
    summary: str


def run(spec: Spec, graph: CaseGraph) -> list[Result] | str:
    """The flags a spec raises on the case, or the reason it cannot run."""
    held = {l.schema for l in graph.links} | {p.schema for p in graph.parties.values()}
    missing = [s for s in spec.needs() if s not in held]
    if missing:
        return spec.cannot_run or f"Needs {' and '.join(missing)} records; none in this case yet."
    out = []
    for m in spec.family_module().measure(graph, spec.parsed_params()):
        got = spec.level_for(m.value)
        if got is None:
            continue
        level, reason = got
        facts = {**m.facts, "measured": m.value}
        out.append(Result(level=level, band_reason=reason, parties=list(dict.fromkeys(m.parties)), links=list(dict.fromkeys(m.links)),
                          facts=facts, summary=spec.text(facts)))
    return out


@lru_cache(maxsize=1)
def load(root: Path = ROOT) -> tuple[Spec, ...]:
    specs: list[Spec] = []
    for path in sorted(root.glob("*.yaml")):
        specs += [Spec.model_validate(x) for x in (yaml.safe_load(path.read_text(encoding="utf-8")) or [])]
    return tuple(specs)


def problems(specs: tuple[Spec, ...], known_indicators: dict[str, Any]) -> list[str]:
    """Lint: unknown family or indicator, bad settings, duplicate specs, a band with no reason."""
    out: list[str] = []
    seen: set[str] = set()
    fams = families()
    for s in specs:
        if s.indicator in seen:
            out.append(f"{s.indicator}: two specs")
        seen.add(s.indicator)
        if s.indicator not in known_indicators:
            out.append(f"{s.indicator}: not in the catalogue")
        if s.family not in fams:
            out.append(f"{s.indicator}: unknown family {s.family!r}")
            continue
        try:
            s.parsed_params()
        except Exception as exc:  # pydantic ValidationError: say which spec
            out.append(f"{s.indicator}: settings: {exc}")
        if not s.examples:
            out.append(f"{s.indicator}: no examples")
        levels = {s.level} if s.level else {b.level for b in s.bands}
        hit = {e.expect for e in s.examples}
        for lv in levels - hit:
            out.append(f"{s.indicator}: no example reaches {lv}")
    return out
