"""The Authority System Suite's systems, modules and records, read from the vendored copy (ADR-0017).

Every system has the same files: ``README.md`` (its name on the first line),
``PROMPT_MODULES/NN_TITLE.md`` (a ``## Use when`` and a ``## Prompt`` block),
and ``EVALUATION/OUTPUT_SCHEMAS.md`` (LAS adds ``OUTPUT_SCHEMAS_MACHINE.md``),
where each record is a heading followed by a JSON example and, beneath it, the
closed values its fields take ("`status` is `VERIFIED` or `HELD_AS_ASSUMPTION`").
Nothing here is written by hand: updating the vendored copy updates what runs.
tests/test_suite_catalog.py fails if a system, a module or a record stops parsing.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterator

SUITE_ROOT = Path(__file__).resolve().parent / "authority_suite"
SYSTEMS = ("ras", "tas", "qas", "las", "das", "egs", "ehs")   # AGENTS.md's order: the pipeline, then support

_HEADING = re.compile(r"^(#{2,3}) (.+?)\s*$", re.M)
# The four ways the schemas state a field's closed values (all read from the text, none written here):
# "`status` is `VERIFIED` or `HELD_AS_ASSUMPTION`" (DAS, LAS, RAS, EGS, EHS);
_CLOSED = re.compile(r"`([a-z_]+)` is ((?:`[A-Z0-9_ ]+`(?:,\s*|,?\s+(?:or|and)\s+))+`[A-Z0-9_ ]+`)")
# "`likelihood_term` is one of ALMOST_CERTAIN, VERY_LIKELY, ..." and "`temporal_order_shown`: YES, NO or UNCLEAR" (QAS);
_WORD = r"[A-Z][A-Z0-9_]+(?: [A-Z][A-Z0-9_]+)*"
_CLOSED_BARE = re.compile(rf"`([a-z_]+)`(?: is one of|:)\s+((?:{_WORD}(?: \([^)]*\))?(?:,\s*|,?\s+or\s+))+{_WORD})")
# "`classification` ... is one of ...: `SOURCE_STATEMENT|CORROBORATED_FACT|...`" (TAS prose);
_PIPES = re.compile(r"`([A-Z][A-Z0-9_ ]*(?:\|[A-Z][A-Z0-9_ ]*)+)`")
# and the example's own value, "confidence": "LOW|MEDIUM|HIGH" (TAS).
_PIPE_VALUE = re.compile(r"[A-Z][A-Z0-9_ ]*(?:\|[A-Z][A-Z0-9_ ]*)+")


@dataclass(frozen=True)
class Record:
    kind: str                     # the heading, e.g. "Analysis plan record (Module 04)"
    example: dict[str, Any]
    prefix: str | None            # the id prefix its example uses, e.g. "QPLN"
    id_field: str | None
    closed: dict[str, tuple[str, ...]] = field(default_factory=dict)


@dataclass(frozen=True)
class Module:
    system: str
    number: str                   # "01"
    title: str
    path: Path
    use_when: str
    prompt: str

    @property
    def key(self) -> str:
        return f"suite:{self.system}.{self.number}"


@dataclass(frozen=True)
class System:
    code: str
    name: str                     # "Logic Authority System (LAS)"
    modules: tuple[Module, ...]
    records: tuple[Record, ...]

    def record(self, kind: str) -> Record | None:
        return next((r for r in self.records if r.kind == kind), None)


def _section(text: str, title: str) -> str:
    match = re.search(rf"^## {re.escape(title)}\s*$(.*?)(?=^## |\Z)", text, re.M | re.S)
    return match.group(1).strip() if match else ""


def _module(system: str, path: Path) -> Module:
    text = path.read_text(encoding="utf-8")
    number, _, rest = path.stem.partition("_")
    title = re.search(r"^# (.+)$", text, re.M)
    prompt = _section(text, "Prompt")
    fenced = re.search(r"```text\n(.*?)```", prompt, re.S)
    return Module(system=system, number=number, title=(title.group(1).strip() if title else rest.replace("_", " ").title()),
                  path=path, use_when=_section(text, "Use when"), prompt=(fenced.group(1) if fenced else prompt).strip())


def _records(text: str) -> list[Record]:
    """Each heading followed by a ```json block, with the closed values stated before the next heading."""
    found: list[Record] = []
    headings = list(_HEADING.finditer(text))
    for i, heading in enumerate(headings):
        end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
        body = text[heading.end():end]
        block = re.search(r"```json\n(.*?)```", body, re.S)
        if not block:
            continue
        try:
            example = json.loads(block.group(1))
        except json.JSONDecodeError:
            continue
        if not isinstance(example, dict):
            continue
        prefix = id_field = None
        for key, value in example.items():
            if key.endswith("_id") and isinstance(value, str):
                match = re.match(r"([A-Z]+)-\d+", value)
                if match:
                    prefix, id_field = match.group(1), key
                    break
        closed: dict[str, tuple[str, ...]] = {}
        prose = body[block.end():]
        for key, value in _walk_strings(example):
            if _PIPE_VALUE.fullmatch(value):
                closed.setdefault(key, tuple(v.strip() for v in value.split("|")))
        for name, values in _CLOSED.findall(prose):
            closed.setdefault(name, tuple(re.findall(r"`([A-Z0-9_ ]+)`", values)))
        for name, values in _CLOSED_BARE.findall(prose):
            parts = re.split(r",\s*(?:or\s+)?|\s+or\s+", re.sub(r"\s*\([^)]*\)", "", values))
            closed.setdefault(name, tuple(m.group(0) for part in parts if (m := re.match(_WORD, part.strip()))))
        for paragraph in re.split(r"\n\s*\n", prose):
            for match in _PIPES.finditer(paragraph):
                before = re.findall(r"`([a-z_]+)`", paragraph[:match.start()])
                if before:
                    closed.setdefault(before[0] if before[0] in example else before[-1],
                                      tuple(v.strip() for v in match.group(1).split("|")))
        found.append(Record(kind=heading.group(2).strip(), example=example, prefix=prefix, id_field=id_field, closed=closed))
    return found


@lru_cache(maxsize=None)
def system(code: str) -> System:
    if code not in SYSTEMS:
        raise KeyError(f"unknown suite system {code!r}; one of {', '.join(SYSTEMS)}")
    root = SUITE_ROOT / "systems" / code
    name = (root / "README.md").read_text(encoding="utf-8").splitlines()[0].lstrip("# ").strip()
    modules = tuple(_module(code, p) for p in sorted((root / "PROMPT_MODULES").glob("[0-9][0-9]_*.md")))
    text = (root / "EVALUATION" / "OUTPUT_SCHEMAS.md").read_text(encoding="utf-8")
    machine = root / "EVALUATION" / "OUTPUT_SCHEMAS_MACHINE.md"
    records = _records(text)
    if machine.exists():
        seen = {r.kind for r in records}
        records += [r for r in _records(machine.read_text(encoding="utf-8")) if r.kind not in seen]
    return System(code=code, name=name, modules=modules, records=tuple(records))


def systems() -> list[System]:
    return [system(code) for code in SYSTEMS]


def module(key: str) -> Module:
    """``suite:las.02`` → LAS Module 02."""
    match = re.fullmatch(r"suite:([a-z]{3})\.(\d\d)", key or "")
    if not match:
        raise KeyError(f"not a suite module key: {key!r}")
    found = next((m for m in system(match.group(1)).modules if m.number == match.group(2)), None)
    if found is None:
        raise KeyError(f"{match.group(1).upper()} has no Module {match.group(2)}")
    return found


@lru_cache(maxsize=1)
def non_negotiables() -> str:
    """AGENTS.md's Non-negotiables: in force with no load (AG-031), so in every suite prompt."""
    text = (SUITE_ROOT / "AGENTS.md").read_text(encoding="utf-8")
    section = _section(text, "Non-negotiables")
    # The audit annotations are for the suite's maintainers, not the model.
    return re.sub(r"\n\s*\[PROSE-BY-NATURE:.*?\]", "", section, flags=re.S).strip()


def _walk_strings(node: Any, key: str | None = None) -> Iterator[tuple[str, str]]:
    if isinstance(node, dict):
        for k, v in node.items():
            yield from _walk_strings(v, k)
    elif isinstance(node, list):
        for item in node:
            yield from _walk_strings(item, key)
    elif isinstance(node, str) and key:
        yield key, node


def check_record(rec: Record, value: Any) -> list[str]:
    """What is wrong with ``value`` as this record: a missing field, a field of the wrong JSON type, a closed value
    outside its list. Lenient where the example is: a null in the example takes anything, an empty list any list."""
    if not isinstance(value, dict):
        return [f"{rec.kind}: a record must be an object"]
    problems = [f"{rec.kind}: missing field '{k}'" for k in rec.example if k not in value]
    for k, example in rec.example.items():
        if k in value:
            problems += _type_problems(f"{rec.kind}.{k}", example, value[k])
    if rec.prefix and rec.id_field and isinstance(value.get(rec.id_field), str) \
            and not re.fullmatch(rf"{rec.prefix}-\d+", value[rec.id_field]):
        problems.append(f"{rec.kind}: '{rec.id_field}' must look like {rec.prefix}-0001")
    for name, allowed in rec.closed.items():
        for found in _values_named(value, name):
            if isinstance(found, str) and found and found not in allowed:
                problems.append(f"{rec.kind}: '{name}' is {found!r}, not one of {', '.join(allowed)}")
    return problems


def _type_problems(where: str, example: Any, value: Any) -> list[str]:
    if example is None or value is None:
        return []
    if isinstance(example, bool):
        return [] if isinstance(value, bool) else [f"{where} must be true or false"]
    if isinstance(example, (int, float)):
        return [] if isinstance(value, (int, float)) and not isinstance(value, bool) else [f"{where} must be a number"]
    if isinstance(example, str):
        return [] if isinstance(value, str) else [f"{where} must be text"]
    if isinstance(example, list):
        if not isinstance(value, list):
            return [f"{where} must be a list"]
        if example and isinstance(example[0], dict):
            return [f"{where}[{i}] must be an object" for i, item in enumerate(value) if not isinstance(item, dict)]
        return []
    if isinstance(example, dict):
        return [] if isinstance(value, dict) else [f"{where} must be an object"]
    return []


def _values_named(node: Any, name: str) -> list[Any]:
    out: list[Any] = []
    if isinstance(node, dict):
        for k, v in node.items():
            if k == name:
                out += v if isinstance(v, list) else [v]
            elif isinstance(v, (dict, list)):
                out += _values_named(v, name)
    elif isinstance(node, list):
        for item in node:
            out += _values_named(item, name)
    return out
