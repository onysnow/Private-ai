"""The one front door to the Authority System Suite: every AI module the app runs, which system and trigger-table
row it belongs to, the suite's version (from the Authority Suite SDK), and where an answer goes next.

Everything that names a module, a system or a route reads it from here: the run pipeline (app/ai/reasoning.py)
for its run record, the plan (app/services/run_plan.py), the settings status, and the single run endpoint
(POST /api/investigations/{id}/assistant/run). The modules themselves stay in their own files beneath it: TAS's
prompts and contracts in reasoning.py, the other six systems in app/ai/systems.py, the boundaries between them in
app/ai/interop.py.

Routing follows AGENTS.md: "Triggers are conditions on what you are about to produce, not on what the user asked
for." A run is routed by its module, and an answer is routed onward by what it contains (next_runs).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.ai.systems import SUITE_MODULES, SUITE_ROOT, SYSTEM_NAMES, SYSTEMS_ROOT

TAS_ROOT = SYSTEMS_ROOT / "tas"
# App-local module content: not part of the suite (see presentation_modules/PRESENTATION_DRAFT.md).
APP_MODULES_ROOT = Path(__file__).resolve().parent / "presentation_modules"

# Why the router sends a run to each system: the trigger table's own condition (AGENTS.md rows 1-7).
ROUTER_REASONS = {
    "ras": "the answer characterizes published research on a general question",
    "tas": "the answer states facts about real people, firms and documents",
    "qas": "the answer tests a theory or explanation against data",
    "las": "the answer states conclusions beyond what a source directly says",
    "das": "the answer structures a choice between options",
    "egs": "the answer plans how to obtain evidence",
    "ehs": "the answer prepares material for publication that could cause harm",
    "app": "an app module: a draft from the records you picked",
}


@dataclass(frozen=True)
class Route:
    module: str
    system: str  # tas, ras, qas, las, das, egs, ehs; "app" for an app-local module
    title: str
    node: str
    files: tuple[Path, ...]
    takes_from: tuple[str, ...] = ()
    needs_handoff: bool = False

    @property
    def row(self) -> int | None:
        """The suite's trigger-table row (AGENTS.md); None for an app-local module."""
        return SYSTEM_NAMES[self.system][2] if self.system in SYSTEM_NAMES else None

    @property
    def kind(self) -> str:
        return SYSTEM_NAMES[self.system][1] if self.system in SYSTEM_NAMES else "app"

    @property
    def system_name(self) -> str:
        return SYSTEM_NAMES[self.system][0] if self.system in SYSTEM_NAMES else "Workbench"

    @property
    def rule(self) -> str | None:
        return f"AGENTS.md trigger table row {self.row}" if self.row else None

    @property
    def reason(self) -> str:
        return ROUTER_REASONS[self.system]


ROUTES: dict[str, Route] = {
    "case_synthesis": Route("case_synthesis", "tas", "Case synthesis", "tas/08",
                            (TAS_ROOT / "PROMPT_MODULES" / "08_CASE_SYNTHESIS.md",)),
    "hypothesis_test": Route("hypothesis_test", "tas", "Theory test", "tas/06",
                             (TAS_ROOT / "PROMPT_MODULES" / "06_HYPOTHESIS_AND_CONTRADICTION_TESTING.md",)),
    **{key: Route(key, m.system, m.title, m.node, m.files, m.takes_from, m.needs_handoff)
       for key, m in SUITE_MODULES.items()},
    "presentation_draft": Route("presentation_draft", "app", "Draft", "app/draft",
                                (APP_MODULES_ROOT / "PRESENTATION_DRAFT.md",)),
}

# Each system's final audit, which runs in a fresh context and never in the run it audits (every system's catalog).
FINAL_AUDIT = {
    "tas": "10_FINAL_ACCURACY_AUDIT.md", "ras": "10_FINAL_RESEARCH_AUDIT.md", "qas": "07_FINAL_QUANTITATIVE_AUDIT.md",
    "las": "10_FINAL_LOGIC_AUDIT.md", "das": "10_FINAL_DECISION_AUDIT.md",
    "egs": "05_GATHERING_LOG_AND_FINAL_GATHERING_CHECK.md", "ehs": "04_FINAL_ETHICS_CHECK.md",
}

# The systems in the suite's own order: the five authority systems in pipeline order, then the two support systems.
SYSTEM_ORDER = ("ras", "tas", "qas", "las", "das", "egs", "ehs")


class UnknownModule(ValueError):
    pass


def route(module: str) -> Route:
    try:
        return ROUTES[module]
    except KeyError:
        raise UnknownModule(f"unknown reasoning module {module!r}; expected one of {sorted(ROUTES)}") from None


# The next runs the trigger table can point to from each module's answer, before the answer exists (the plan shows
# them); next_runs() narrows this to what an answer actually contains.
POSSIBLE_NEXT = {
    "case_synthesis": ("las_argument_check", "evidence_plan", "ehs_harm_minimisation"),
    "hypothesis_test": ("quant_framing", "evidence_plan"),
    "ehs_harm_minimisation": ("ehs_public_interest",),
    "das_framing": ("das_options",),
}


def _items(payload: dict, key: str) -> list[dict]:
    return [x for x in payload.get(key) or [] if isinstance(x, dict)]


def next_runs(module: str, payload: dict | None) -> list[dict[str, Any]]:
    """Where this answer goes next, by the conditions its content meets (AGENTS.md: triggers are conditions on what
    is about to be produced). Each next run starts from this answer once a person accepts it."""
    payload = payload or {}
    found: list[tuple[str, str]] = []
    if module == "case_synthesis":
        beyond = [c.get("claim_id") for c in _items(payload, "claims") if c.get("classification") in ("INFERENCE", "HYPOTHESIS")]
        if beyond:
            found.append(("las_argument_check", f"{len(beyond)} claim(s) go beyond what a source says: {', '.join(map(str, beyond))}"))
        gaps = _items(payload, "investigative_gaps")
        if gaps:
            found.append(("evidence_plan", f"{len(gaps)} gap(s) name records or testimony still to obtain"))
        subjects = [r.get("subject") for r in _items(payload, "right_of_reply_needed") if r.get("subject")]
        if subjects:
            found.append(("ehs_harm_minimisation", f"findings about {', '.join(map(str, subjects))} would be published"))
    elif module == "hypothesis_test":
        hyps = _items(payload, "hypothesis_matrix")
        if hyps:
            found.append(("quant_framing", f"{len(hyps)} explanation(s) to test, against data where the test rests on numbers"))
        missing = [m for h in hyps for m in h.get("missing_records") or []]
        if missing:
            found.append(("evidence_plan", f"{len(missing)} record(s) that would test a hypothesis are missing"))
    elif module == "ehs_harm_minimisation":
        if _items(payload, "harm_assessments"):
            found.append(("ehs_public_interest", "the harms listed need weighing against the public interest"))
    elif module == "das_framing" and payload.get("decision_id"):
        found.append(("das_options", f"{payload['decision_id']} is framed; its options and evidence come next"))
    out = []
    for key, why in found:
        r = ROUTES[key]
        out.append({"module": key, "system": r.system.upper(), "row": r.row, "title": r.title, "why": why})
    return out


def _version_of(system: str) -> dict[str, str | None]:
    """A system's numbered version from its CHANGELOG ('## 1.12 — …'), and its newest entry ('## 2026-10-18 — …'):
    some systems number their versions, others only date their changes."""
    changelog = SYSTEMS_ROOT / system / "CHANGELOG.md"
    version = latest = None
    if changelog.exists():
        for line in changelog.read_text(encoding="utf-8").splitlines():
            if not line.startswith("## "):
                continue
            head = line[3:].strip()
            if latest is None:
                latest = head[:120]
            m = re.match(r"(\d+\.\d+(?:\.\d+)?)\b", head)
            if m:
                version = m.group(1)
                break
    return {"version": version, "latest_change": latest}


def vendored_commit() -> str | None:
    """'onysnow/Authority-System-Suite@d2b2186': the suite the Authority Suite SDK bundles."""
    from app.ai.authority_sdk import suite_source

    return suite_source()


def module_count(system: str) -> int:
    """How many prompt modules the system has in the suite the SDK bundles."""
    folder = SYSTEMS_ROOT / system / "PROMPT_MODULES"
    return len(list(folder.glob("[0-9][0-9]_*.md"))) if folder.is_dir() else 0


def final_audit(system: str) -> dict[str, str] | None:
    name = FINAL_AUDIT.get(system)
    return {"node": f"{system}/{name[:2]}", "file": name} if name else None


def run_route(module: str) -> dict[str, Any]:
    """What a run's record needs to draw its route: the system, its row, the module's node and title, how many of the
    system's modules it leaves unrun, and the system's final audit, which never runs inside it."""
    r = ROUTES.get(module)
    if r is None:
        return {"system": None, "row": None, "node": None, "title": module, "modules_in_system": 0, "final_audit": None}
    return {"system": r.system, "row": r.row, "node": r.node, "title": r.title,
            "modules_in_system": module_count(r.system) if r.row else 0, "final_audit": final_audit(r.system)}


def systems_status() -> list[dict[str, Any]]:
    """Every system of the suite with its row, kind, version and the modules the app runs from it."""
    rows = []
    for system in SYSTEM_ORDER:
        name, kind, row = SYSTEM_NAMES[system]
        modules = [r for r in ROUTES.values() if r.system == system]
        rows.append({
            "system": system, "name": name, "kind": kind, "row": row, **_version_of(system),
            "module_count": module_count(system), "final_audit": final_audit(system),
            "present": (SYSTEMS_ROOT / system).is_dir(),
            "modules": [{"module": r.module, "title": r.title, "node": r.node,
                         "available": all(p.exists() for p in r.files)} for r in modules],
        })
    return rows


def catalog() -> dict[str, Any]:
    """Every module and record of the suite the SDK bundles, read from its own files (app/ai/suite_catalog.py), with the
    app runs that use each module. A module no run uses is listed too, and a final audit says it never runs in the
    run it audits: what the app leaves out is shown, not hidden."""
    from app.ai import suite_catalog

    rows = []
    for system in suite_catalog.systems():
        audit = FINAL_AUDIT.get(system.code)
        rows.append({
            "code": system.code, "name": system.name, "row": SYSTEM_NAMES[system.code][2], "kind": SYSTEM_NAMES[system.code][1],
            "modules": [{
                "number": m.number, "title": m.title, "use_when": m.use_when,
                "path": str(m.path.relative_to(SUITE_ROOT)),
                "runs_in": sorted(r.module for r in ROUTES.values() if m.path in r.files),
                "final_audit": audit is not None and m.path.name == audit,
            } for m in system.modules],
            "records": [{"kind": r.kind, "prefix": r.prefix, "id_field": r.id_field, "fields": list(r.example),
                         "closed": {k: list(v) for k, v in r.closed.items()}} for r in system.records],
        })
    return {"source": vendored_commit(), "systems": rows}
