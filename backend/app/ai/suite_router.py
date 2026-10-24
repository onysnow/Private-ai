"""Which suite systems a run's answer trips, by AGENTS.md's trigger table (ADR-0015).

The table's triggers are conditions on what is about to be produced ("state a conclusion that goes beyond what a
source directly says" → LAS). The rows and their wording are read from the vendored AGENTS.md; what is written
here is only how a record of an answer shows a row's condition, one rule per line of HANDOFF_RULES. Each hand-off
names the row, the records that tripped it, and the module that takes them first, with this run as its earlier run.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Callable

from app.ai import suite_catalog as catalog
from app.ai.suite_modules import is_suite_module, record_id

_ROW = re.compile(r"^\| (\d+) \| `systems/([a-z]{3})/` \| (.+?) \|\s*$", re.M)


@dataclass(frozen=True)
class Row:
    number: int
    system: str
    when: str              # "state a conclusion that goes beyond what a source directly says"


@lru_cache(maxsize=1)
def trigger_rows() -> dict[str, Row]:
    text = (catalog.SUITE_ROOT / "AGENTS.md").read_text(encoding="utf-8")
    rows = {}
    for number, code, when in _ROW.findall(text):
        when = re.sub(r"\s*\[AG-\d+\].*$", "", when).strip()
        rows[code] = Row(int(number), code, when)
    return rows


def row_rule(code: str) -> str | None:
    row = trigger_rows().get(code)
    return f"AGENTS.md trigger table row {row.number}" if row else None


def _value(record: dict, name: str) -> Any:
    found = catalog._values_named(record, name)
    return found[0] if found else None


# (from system, record kind, test on the record) -> (to system, why, the module that takes it first)
Rule = tuple[str, str, Callable[[dict], bool], str, str, str]
HANDOFF_RULES: list[Rule] = [
    ("tas", "Evidence record", lambda r: _value(r, "classification") in ("INFERENCE", "HYPOTHESIS"),
     "las", "an inference or hypothesis goes beyond what its source says", "suite:las.01"),
    ("tas", "Claim record", lambda r: _value(r, "classification") in ("INFERENCE", "HYPOTHESIS"),
     "las", "a claim classed as inference or hypothesis goes beyond what its source says", "suite:las.01"),
    ("qas", "Causal judgement record (Module 06)", lambda r: True,
     "las", "a causal judgement is a conclusion beyond the data", "suite:las.01"),
    ("tas", "Transaction record", lambda r: True,
     "qas", "amounts to add up or compare", "suite:qas.01"),
    ("tas", "Hypothesis record", lambda r: True,
     "qas", "a theory to test against the data", "suite:qas.03"),
    ("tas", "Gap record", lambda r: True,
     "egs", "evidence still to obtain", "suite:egs.01"),
    ("tas", "Right-of-reply record", lambda r: True,
     "egs", "the subject is to be approached: an interview to prepare", "suite:egs.03"),
    ("tas", "Right-of-reply record", lambda r: True,
     "ehs", "material about a real person heading for publication", "suite:ehs.01"),
    ("egs", "Interview (Module 03)", lambda r: True,
     "ehs", "a source is approached and recorded", "suite:ehs.03"),
    ("las", "Premise record", lambda r: _value(r, "verification_status") not in (None, "", "VERIFIED"),
     "tas", "a factual premise not yet checked against the record", "suite:tas.02"),
    ("ras", "Claim record", lambda r: True,
     "las", "a research claim to carry into an argument", "suite:las.01"),
]

# Modules 06 and 08 keep their own contract (ADR-0015); their parts map onto the same rows.
_TAILORED: dict[str, list[tuple[str, str, Callable[[dict], bool], str, str, str]]] = {
    "case_synthesis": [
        ("claims", "claim_id", lambda c: c.get("classification") in ("INFERENCE", "HYPOTHESIS"),
         "las", "a claim classed as inference or hypothesis goes beyond what its source says", "suite:las.01"),
        ("investigative_gaps", "gap_id", lambda g: True, "egs", "evidence still to obtain", "suite:egs.01"),
        ("right_of_reply_needed", "subject", lambda r: True,
         "ehs", "material about a real person heading for publication", "suite:ehs.01"),
    ],
    "hypothesis_test": [
        ("hypothesis_matrix", "hypothesis_id", lambda h: True, "qas", "a theory to test against the data", "suite:qas.03"),
        ("hypothesis_matrix", "hypothesis_id", lambda h: bool(h.get("viable")),
         "las", "a viable explanation is a conclusion beyond what a source says", "suite:las.01"),
    ],
}


def _system_of(module: str) -> str | None:
    if is_suite_module(module):
        return catalog.module(module).system
    return "tas" if module in _TAILORED else None


def handoffs(module: str, payload: dict | None) -> list[dict]:
    """The hand-offs an answer calls for: one per (system, module), with the row and the records that tripped it."""
    payload = payload or {}
    found: dict[tuple[str, str], dict] = {}
    from_system = _system_of(module)

    def add(to: str, why: str, take: str, ident: str) -> None:
        if to == from_system and take == module:
            return
        row = trigger_rows().get(to)
        entry = found.setdefault((to, take), {
            "system": to, "row": row.number if row else None, "when": row.when if row else None,
            "why": why, "module": take, "records": [],
        })
        if ident and ident not in entry["records"]:
            entry["records"].append(ident)

    if is_suite_module(module):
        system = catalog.system(from_system or "")
        for item in payload.get("records") or []:
            if not isinstance(item, dict) or not isinstance(item.get("record"), dict):
                continue
            for src, kind, test, to, why, take in HANDOFF_RULES:
                if src == system.code and item.get("kind") == kind and test(item["record"]):
                    add(to, why, take, record_id(system, item))
    else:
        for list_key, id_key, test, to, why, take in _TAILORED.get(module, []):
            for part in payload.get(list_key) or []:
                if isinstance(part, dict) and test(part):
                    add(to, why, take, str(part.get(id_key) or ""))
    return sorted(found.values(), key=lambda h: (h["row"] or 99, h["module"]))
