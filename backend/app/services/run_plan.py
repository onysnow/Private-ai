"""Before you run (mockup AI_2, research AI §6): what a run will do, under which settings, on which model, and what
leaves the computer, worked out before anything is sent. Nothing here calls a model.

Also keeps this case's default settings (the run profile): saving one asks for a reason, kept with the profile, the
way the suite asks for a reason on a flip (research AI §6 innovation 2).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.reasoning import (
    CONTROL_SURFACE_FLAGS,
    MODULE_FILES,
    RUN_OPTIONS,
    SAFETY_LIMITS,
    TAS_MODULES,
    ReasoningInputError,
    ai_reasoning_status,
    build_system_prompt,
    normalize_control_flags,
    normalize_premises,
    normalize_run_options,
)
from app.ai.run_events import instructions_in_packet
from app.core.config import Settings
from app.core.config import settings as default_settings
from app.models.domain import BackgroundJob, Investigation
from app.services.assistant_context import build_question_context

# What each setting is called on screen, its values in plain words, and what it does (the suite name stays in
# the tooltip, research AI §6). Kept here so the API and the screen say the same thing.
SETTINGS_TEXT: dict[str, dict[str, Any]] = {
    "source_tier_floor": {"label": "Lowest source tier that counts", "group": "How strict",
                          "help": "Only Tier A can make a fact alone. Tier C never counts. E and F stay leads.",
                          "values": {"A": "A", "B": "B", "C": "C", "D": "D"}},
    "severity_floor": {"label": "Problems to list before “done”", "group": "How strict",
                       "help": "Blocking problems are always enforced.",
                       "values": {"ALL": "All", "MATERIAL": "Material", "BLOCKING": "Blocking"}},
    "devils_advocate": {"label": "Devil’s advocate", "group": "Extra passes",
                        "help": "Best case against the lead theory. Never says “passed”.",
                        "values": {"OFF": "Off", "ON": "On"}},
    "research_depth": {"label": "Research depth", "group": "Extra passes",
                       "help": "Exhaustive needs a check that could prove each answer wrong.",
                       "values": {"NORMAL": "Normal", "EXHAUSTIVE": "Exhaustive"}},
    "show_reasoning_chain": {"label": "Show the reasoning chain", "group": "What you see",
                             "help": "Display only. The chain is always built.",
                             "values": {"ON": "On", "OFF": "Off"}},
    "live_events": {"label": "Live events", "group": "What you see",
                    "help": "How much of the run you watch as it happens.",
                    "values": {"FULL": "Full", "SUMMARY": "Summary", "OFF": "Off"}},
    "outside_lookups": {"label": "Outside lookups", "group": "Doing things on its own",
                        "help": "Each lookup leaves a trace on that site. Runs make none yet; this is kept for when they do.",
                        "values": {"AUTOMATIC": "Automatic", "ASK": "Ask first", "OFF": "Off"}},
}

# What no setting can switch off in a run, each with what enforces it.
LOCKED = [
    {"text": "Citations must be in the packet", "by": "the citation check rejects any other (app/ai/reasoning.py)"},
    {"text": "Blocking problems are always listed", "by": "TAS CONTROL_SURFACE §4 severity_floor"},
    {"text": "The tier floor never goes below D; Tier C never counts", "by": "TAS CONTROL_SURFACE §4 source_tier_floor"},
    {"text": "Material in the case can never change a setting", "by": "AGENTS.md [AG-049]; TAS Standard §15"},
    {"text": "Nothing joins the case until you accept it", "by": "every result is a proposal (review queue)"},
]

MODULE_TEXT = {
    "case_synthesis": ("Case synthesis", "TAS 08"),
    "hypothesis_test": ("Test a theory", "TAS 06"),
    "presentation_draft": ("Draft a brief", "app"),
}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_profile(db: Session, investigation_id: str) -> dict:
    inv = db.get(Investigation, investigation_id)
    if inv is None:
        raise LookupError("Investigation not found")
    stored = inv.ai_run_profile or {}
    return {
        "name": f"{inv.name} default",
        "flags": normalize_control_flags(stored.get("flags")),
        "options": normalize_run_options(stored.get("options")),
        "premises": normalize_premises(stored.get("premises")),
        "reason": stored.get("reason"),
        "saved_at": stored.get("saved_at"),
        "saved": bool(stored),
    }


def save_profile(db: Session, investigation_id: str, *, flags: dict | None, options: dict | None,
                 premises: list[str] | None, reason: str) -> dict:
    inv = db.get(Investigation, investigation_id)
    if inv is None:
        raise LookupError("Investigation not found")
    if not reason.strip():
        raise ReasoningInputError("say in one line why this case runs with these settings")
    inv.ai_run_profile = {
        "flags": normalize_control_flags(flags), "options": normalize_run_options(options),
        "premises": normalize_premises(premises), "reason": reason.strip()[:300], "saved_at": _now(),
    }
    db.commit()
    return get_profile(db, investigation_id)


def _defaults() -> dict:
    return {**{k: s["default"] for k, s in CONTROL_SURFACE_FLAGS.items()}, **{k: s["default"] for k, s in RUN_OPTIONS.items()}}


def settings_table(profile: dict) -> list[dict]:
    """Every setting with the suite default, this case's default and the allowed values, in screen order."""
    case_default = {**profile["flags"], **profile["options"]}
    rows = []
    for key, text in SETTINGS_TEXT.items():
        spec = CONTROL_SURFACE_FLAGS.get(key) or RUN_OPTIONS[key]
        rows.append({
            "key": key, "label": text["label"], "group": text["group"], "help": text["help"],
            "suite_default": spec["default"], "case_default": case_default[key],
            "allowed": [{"value": v, "label": text["values"][v]} for v in spec["allowed"]],
            "source": spec.get("source", "systems/tas/CORE/CONTROL_SURFACE.md §4 " + key),
            "effect": spec.get("effect", "prompt"),
        })
    return rows


def _steps(module: str, options: dict[str, str], include_external_leads: bool, record_count: int) -> list[dict]:
    title, system = MODULE_TEXT[module]
    steps = [{
        "key": "packet", "who": "APP", "title": "Build the packet from the case", "changed": False,
        "detail": "Search this investigation only. Nothing is fetched from outside."
        + (" Outside leads already saved in the case come along as leads only." if include_external_leads else ""),
    }, {
        "key": "model", "who": "MODEL", "title": title, "system": system, "changed": False,
        "detail": f"Answers only from the {record_count} record{'s' if record_count != 1 else ''} in the packet.",
    }]
    if options.get("devils_advocate") == "ON":
        steps.append({"key": "devils_advocate", "who": "MODEL", "title": "Devil’s advocate on the lead theory", "system": "TAS",
                      "changed": True, "detail": "The best case against the leading conclusion, filed as a hypothesis or a gap."})
    if options.get("research_depth") == "EXHAUSTIVE":
        steps.append({"key": "research_depth", "who": "MODEL", "title": "Look for what would prove each finding wrong", "system": "TAS",
                      "changed": True, "detail": "A finding with no such check is listed as an open gap."})
    checks = "Shape · every citation in the packet"
    if module == "presentation_draft":
        checks += " · every quote word for word · every chart drawn from the records · the writing read"
    steps.append({"key": "checks", "who": "APP", "title": "Enforced checks", "changed": False, "detail": checks})
    steps.append({"key": "review", "who": "YOU", "title": "You decide", "changed": False,
                  "detail": "The answer lands as a proposal. Nothing joins the case until you accept it."})
    for n, step in enumerate(steps, 1):
        step["n"] = n
    return steps


def _systems(module: str) -> list[dict]:
    """Which systems the answer will need, by the suite's trigger table (AGENTS.md: triggers are conditions on what
    is about to be produced). TAS runs now; a system the answer trips is handed off after it ("next"): the run names
    it with the module to run, and every suite module runs in the app (app/ai/suite_router.py, ADR-0015)."""
    reaches_beyond = module in TAS_MODULES
    rows = [
        {"system": "TAS", "why": "facts about real people, firms and documents", "state": "runs" if module in TAS_MODULES else "not_expected"},
        {"system": "LAS", "why": "conclusions beyond what a source says", "state": "next" if reaches_beyond else "not_expected"},
        {"system": "QAS", "why": "a theory tested against data", "state": "next" if module == "hypothesis_test" else "not_expected"},
        {"system": "RAS", "why": "published research", "state": "not_expected"},
        {"system": "DAS", "why": "recommending an action", "state": "not_expected"},
    ]
    return rows


def _past_run_minutes(db: Session) -> list[float]:
    rows = db.execute(
        select(BackgroundJob.started_at, BackgroundJob.finished_at)
        .where(BackgroundJob.kind == "ai_reasoning", BackgroundJob.status == "succeeded",
               BackgroundJob.started_at.is_not(None), BackgroundJob.finished_at.is_not(None))
        .order_by(BackgroundJob.finished_at.desc()).limit(5)
    ).all()
    return [round((f - s).total_seconds() / 60, 1) for s, f in rows if s is not None and f is not None and f >= s]


def build_run_plan(db: Session, investigation_id: str, *, module: str, question: str, working_theory: str | None = None,
                   max_results: int = 30, include_external_leads: bool = True, flags: dict | None = None,
                   options: dict | None = None, premises: list[str] | None = None,
                   settings: Settings = default_settings) -> dict:
    if module not in MODULE_FILES or module == "presentation_draft":
        raise ReasoningInputError("the plan covers case synthesis and theory tests")
    if db.get(Investigation, investigation_id) is None:
        raise LookupError("Investigation not found")
    resolved_flags = normalize_control_flags(flags)
    resolved_options = normalize_run_options(options)
    stated = normalize_premises(premises)
    profile = get_profile(db, investigation_id)

    packet = build_question_context(db, investigation_id=investigation_id, question=question, max_results=max_results,
                                    include_external_leads=include_external_leads)
    citations = packet.get("citations", [])
    by_type: dict[str, int] = {}
    for c in citations:
        by_type[c["record_type"]] = by_type.get(c["record_type"], 0) + 1
    leads = len(packet.get("external_leads") or [])

    user_prompt = f"RETRIEVAL PACKET:\n{json.dumps(packet)}" + (f"\nWORKING THEORY TO TEST:\n{working_theory}" if working_theory else "")
    try:
        system_prompt = build_system_prompt(module, packet["reasoning_contract"], resolved_flags, resolved_options, stated)
    except ReasoningInputError:
        system_prompt = ""
    words_in = len(system_prompt.split()) + len(user_prompt.split())

    status = ai_reasoning_status(settings)
    local = status["runs_on_this_computer"]
    provider = status["provider"]
    if not provider:
        leaves = "No model is chosen, so nothing can run yet."
    elif local:
        leaves = "Nothing, for this run."
    elif local is False:
        leaves = f"The question and the packet ({len(citations)} records, about {words_in:,} words) go to {provider}."
    else:
        leaves = "Not known: the model's address could not be checked."
    minutes = _past_run_minutes(db)

    changed = {k: v for k, v in {**resolved_flags, **resolved_options}.items() if v != {**profile["flags"], **profile["options"]}[k]}
    return {
        "module": module, "module_label": MODULE_TEXT[module][0], "system": MODULE_TEXT[module][1],
        "question": question.strip(), "working_theory": working_theory,
        "packet": {
            "records": len(citations), "by_type": [{"record_type": k, "count": v} for k, v in sorted(by_type.items(), key=lambda kv: -kv[1])],
            "leads_only": leads, "first": [{"record_type": c["record_type"], "record_id": c["record_id"], "title": c.get("title") or ""} for c in citations[:6]],
        },
        "steps": _steps(module, resolved_options, include_external_leads, len(citations)),
        "systems": _systems(module),
        "injections": instructions_in_packet(packet),
        "where": {
            "enabled": status["enabled"], "callable": status["endpoints_callable"], "provider": provider, "model": status["model"],
            "runs_on_this_computer": local, "leaves": leaves, "nothing_leaves": bool(provider) and local is True,
            "words_in": words_in, "words_out_max": int(settings.ai_max_output_tokens * 0.75),
            "minutes": minutes,
            "money": "None: it runs on this computer" if local else (f"Charged by {provider}; not estimated here" if provider else "None"),
            "limits": {"concurrent": settings.ai_max_concurrent_runs, "per_minute": settings.ai_runs_per_minute},
        },
        "settings": settings_table(profile),
        "resolved": {**resolved_flags, **resolved_options}, "premises": stated,
        "changed_from_case_default": sorted(changed),
        "suite_defaults": _defaults(),
        "profile": profile,
        "locked": LOCKED, "safety_limits": list(SAFETY_LIMITS),
    }
