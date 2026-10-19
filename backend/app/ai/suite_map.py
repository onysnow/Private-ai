"""What the app's values mean in the Authority System Suite (Ony, 11 Oct 2026: "if
there is a need for a value that doesn't exist in the Authority system but needs
to exist, that's a problem").

``suite_map.json`` maps every value the app uses to the suite term that defines it,
with the file it is in, read against the vendored suite. Each is:

- ``same``: the suite defines this meaning;
- ``close``: the suite has a nearby idea with a different boundary (the note says how);
- ``none``: the suite does not define it at all.

``close`` and ``none`` are suite gaps: a value the app needs that the suite would
have to define. The other direction is listed too: what the suite requires a record
to carry that the app has nowhere to keep (app gaps).

Two checks keep this honest (tests/test_suite_map.py): every value in the app's own
lists below must be in the map, so a new value cannot arrive unmapped; and every
mapped term must still be in the vendored suite, so an update that drops one fails.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.ai.reasoning import SUITE_ROOT, _vendored_suite_commit, _vendored_tas_version

MAP_FILE = Path(__file__).resolve().parent / "suite_map.json"


def app_vocabularies() -> dict[str, tuple[str, ...]]:
    """Every list of values the app decides with, read from where the app keeps it."""
    from app.patterns.checks import MISSING_STATUSES, STATUSES
    from app.patterns.engine import LEVELS
    from app.services.claim_done import DONE_RULES
    from app.services.claims import AGREEMENT_GRADES, CLAIM_STATUSES, EVIDENCE_GRADES
    from app.services.connector_findings import FINDING_DECISIONS, STATEMENT_ASSESSMENTS
    from app.services.entities import ALLOWED_CONFLICT_DECISIONS
    from app.services.leads import LEAD_STATUSES, PRIORITIES
    from app.services.relationships import RELATIONSHIP_EVIDENCE_STANCES
    from app.services.sources import SOURCE_TYPES
    from app.services.timeline import EVENT_GRADES, TIMELINE_EVENT_VERIFICATION_STATUSES
    from app.ai.reasoning import REVIEW_STATUSES

    return {
        "claim_status": tuple(sorted(CLAIM_STATUSES)),
        "claim_evidence_stance": ("supports", "contradicts", "context"),
        "relationship_evidence_stance": tuple(sorted(RELATIONSHIP_EVIDENCE_STANCES)),
        "source_type": SOURCE_TYPES,
        "red_flag_level": LEVELS,
        "check_answer": tuple(s for s in STATUSES if s != "open"),
        "missing_value_answer": tuple(s for s in MISSING_STATUSES if s != "open"),
        "event_verification_status": tuple(sorted(TIMELINE_EVENT_VERIFICATION_STATUSES)),
        "event_grade": tuple(EVENT_GRADES),
        "claim_evidence_grade": EVIDENCE_GRADES,
        "claim_agreement_grade": AGREEMENT_GRADES,
        "claim_confidence": ("number 0..1",),
        "outside_finding_decision": FINDING_DECISIONS,
        "statement_assessment": STATEMENT_ASSESSMENTS,
        "property_conflict_decision": tuple(sorted(ALLOWED_CONFLICT_DECISIONS)),
        "lead_status": tuple(sorted(LEAD_STATUSES)),
        "lead_priority": tuple(sorted(PRIORITIES)),
        "ai_candidate_review": REVIEW_STATUSES,
        "done_rule": DONE_RULES,
    }


VOCABULARY_NAMES = {
    "claim_status": "Claim status", "claim_evidence_stance": "Evidence on a claim", "relationship_evidence_stance": "Evidence on a link",
    "source_type": "Source type", "red_flag_level": "Red Flag level", "check_answer": "To check answer", "missing_value_answer": "Missing value answer",
    "event_verification_status": "Event date status", "event_grade": "Event grade", "claim_evidence_grade": "Evidence grade (IPCC)",
    "claim_agreement_grade": "Agreement grade (IPCC)", "claim_confidence": "Claim confidence", "outside_finding_decision": "Outside record decision",
    "statement_assessment": "Outside value assessment", "property_conflict_decision": "Conflicting value decision", "lead_status": "Lead status",
    "lead_priority": "Lead priority", "ai_candidate_review": "AI draft review", "done_rule": "Done rule for Supported",
}


@lru_cache(maxsize=1)
def _load() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(MAP_FILE.read_text(encoding="utf-8"))
    return data


@lru_cache(maxsize=64)
def _suite_text(file: str) -> str | None:
    path = SUITE_ROOT / file
    return path.read_text(encoding="utf-8") if path.is_file() else None


def _found(file: str | None, term: str | None) -> bool | None:
    if not file or not term:
        return None
    text = _suite_text(file)
    return bool(text and term in text)


def coverage() -> dict[str, Any]:
    """The map with each term checked against the vendored suite, and the values the
    app uses that the map does not cover (each one a problem)."""
    data = _load()
    mapped = {(m["vocabulary"], m["value"]) for m in data["mappings"]}
    unmapped = [{"vocabulary": v, "value": value} for v, values in app_vocabularies().items() for value in values if (v, value) not in mapped]
    mappings = [{**m, "vocabulary_name": VOCABULARY_NAMES.get(m["vocabulary"], m["vocabulary"]), "found": _found(m["file"], m["suite_term"])}
                for m in data["mappings"]]
    lacks = [{**m, "found": _found(m["file"], m["suite_term"])} for m in data["suite_requires_app_lacks"]]
    counts = {k: sum(1 for m in mappings if m["match"] == k) for k in ("same", "close", "none")}
    return {
        "source": _vendored_suite_commit(), "tas_version": _vendored_tas_version(),
        "counts": {**counts, "unmapped": len(unmapped), "app_lacks": sum(1 for m in lacks if not m.get("recorded_in")),
                   "app_recorded": sum(1 for m in lacks if m.get("recorded_in")),
                   "drifted": sum(1 for m in [*mappings, *lacks] if m["found"] is False)},
        "mappings": mappings, "unmapped": unmapped, "suite_requires_app_lacks": lacks,
    }


def gaps_markdown() -> str:
    """The suite gaps as a document the suite's owner can work from."""
    cov = coverage()
    lines = ["# Authority System Suite gaps found by the Journalism Workbench", "",
             f"Read against {cov['source']} (TAS {cov['tas_version']}). Generated by backend/app/ai/suite_map.py; do not edit by hand.", "",
             f"{cov['counts']['same']} app values the suite defines, {cov['counts']['close']} it defines only nearly, "
             f"{cov['counts']['none']} it does not define; {cov['counts']['app_lacks']} things the suite requires that the app does not record yet, "
             f"and {cov['counts']['app_recorded']} it now records.", "",
             "## Values the app needs that the suite does not define", ""]
    for m in [x for x in cov["mappings"] if x["match"] == "none"]:
        lines.append(f"- **{m['vocabulary_name']} · {m['value']}** — {m['note']}")
    lines += ["", "## Values the suite defines only nearly (the boundary differs)", ""]
    for m in [x for x in cov["mappings"] if x["match"] == "close"]:
        lines.append(f"- **{m['vocabulary_name']} · {m['value']}** ≈ `{m['suite_term']}` ({m['file']}) — {m['note']}")
    open_ = [m for m in cov["suite_requires_app_lacks"] if not m.get("recorded_in")]
    lines += ["", "## What the suite requires that the app does not record yet", ""]
    lines += [f"- **{m['what']}** — `{m['suite_term']}` ({m['file']}). {m['why']}" for m in open_] or ["None."]
    lines += ["", "## Suite requirements the app now records", ""]
    for m in cov["suite_requires_app_lacks"]:
        if m.get("recorded_in"):
            where = m["recorded_in"]
            where = f"the {where.split(':', 1)[1]} record (app/services/case_records.py)" if where.startswith("record:") else f"`{where}`"
            lines.append(f"- **{m['what']}** — `{m['suite_term']}` ({m['file']}), recorded in {where}.")
    return "\n".join(lines) + "\n"
