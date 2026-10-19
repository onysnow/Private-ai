"""The suite's other systems, run the way TAS is (AGENTS.md trigger table rows 1 and 3-7).

Each entry is one app run: a system's own prompt module(s) from the vendored suite, an output contract trimmed
from that system's EVALUATION/OUTPUT_SCHEMAS.md to what one call over a retrieval packet can honestly fill, the
value lists copied from the suite (tests/test_authority_suite_drift.py reads them back out of the vendored text),
and the checks the suite's own rules make mechanical. A run may start from the accepted answer of an earlier run;
what crosses that boundary is decided in app/ai/interop.py, never here.

What an app run of each system may not do is held in its contract and its checks, with the rule that says so:
EGS and EHS are support systems that judge and decide nothing (AGENTS.md [AG-067]); DAS structures a decision and
never makes it (DAS Standard §2); LAS checks whether a conclusion follows and never whether its premises are true
(LAS Standard Rule 3).
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

SUITE_ROOT = Path(__file__).resolve().parent / "authority_suite"
SYSTEMS_ROOT = SUITE_ROOT / "systems"

_REF = {"record_type": "string", "record_id": "string"}
# CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md in every system; INTEROP.md §2 wire terms.
CONFIDENCE_TERMS = ("ALMOST_CERTAIN", "VERY_LIKELY", "LIKELY", "ROUGHLY_EVEN_CHANCE", "UNLIKELY", "VERY_UNLIKELY",
                    "ALMOST_NO_CHANCE")

# The systems by name, as their READMEs and AGENTS.md name them. "support" systems serve the authority systems and
# issue no authority judgement (AGENTS.md [AG-067]).
SYSTEM_NAMES = {
    "tas": ("Topic Authority System", "authority", 2),
    "ras": ("Research Authority System", "authority", 1),
    "qas": ("Quantitative Analysis System", "authority", 3),
    "las": ("Logic Authority System", "authority", 4),
    "das": ("Decision Authority System", "authority", 5),
    "egs": ("Evidence Gathering System", "support", 6),
    "ehs": ("Ethics and Harm System", "support", 7),
}

# --- LAS: systems/las/EVALUATION/OUTPUT_SCHEMAS_MACHINE.md (machine spellings; the table form governs meaning) ---
LAS_INFERENTIAL_TYPES = ("DEDUCTIVE", "INDUCTIVE", "ABDUCTIVE")
LAS_VALIDITY = ("VALID", "INVALID", "NOT_CLEANLY_FORMALIZABLE")
LAS_ATTRIBUTION = ("STATED_BY_ARGUER", "ATTRIBUTED_SOURCE", "RECONSTRUCTED_BY_EVALUATOR", "BACKGROUND_ASSUMPTION",
                   "USER_STIPULATED")
LAS_PREMISE_TYPES = ("EMPIRICAL", "NORMATIVE", "DEFINITIONAL")
# systems/las/EVALUATION/OUTPUT_SCHEMAS.md, "Formal fallacy list".
LAS_FORMAL_FALLACIES = ("Affirming the consequent", "Denying the antecedent", "Undistributed middle")

# --- EGS: systems/egs/EVALUATION/OUTPUT_SCHEMAS.md, Evidence-plan item; priority from Module 01 rule 6 ---
EGS_ROUTES = ("RECORDS_REQUEST", "INTERVIEW", "ONLINE_CAPTURE", "ARCHIVE_OR_COURT", "PURCHASE", "OTHER")
EGS_EXISTENCE = ("KNOWN", "BELIEVED")
EGS_TYPES = ("DOCUMENT", "PERSON", "ONLINE")
EGS_PRIORITIES = ("HIGH", "MEDIUM", "LOW")
EGS_STATUSES = ("PLANNED", "SOUGHT", "DONE", "STOPPED", "NOT_SOUGHT")
# A plan can only be written, or written as not to be sought: SOUGHT, DONE and STOPPED record work a person did.
EGS_PLAN_STATUSES = ("PLANNED", "NOT_SOUGHT")

# --- EHS: systems/ehs/EVALUATION/OUTPUT_SCHEMAS.md ---
EHS_PUBLIC_INTERESTS = ("EXPOSING_CRIME", "SERIOUS_IMPROPRIETY", "HEALTH_OR_SAFETY", "PREVENTING_MISLEADING",
                        "FAILED_OBLIGATION", "MISCARRIAGE_OF_JUSTICE", "PUBLIC_DEBATE", "OTHER")
EHS_PIT_DECISIONS = ("PENDING", "PUBLISH", "PUBLISH_WITH_CHANGES", "DO_NOT_PUBLISH")
EHS_HARM_CATEGORIES = ("PUBLIC_FIGURE", "PRIVATE_PERSON", "MINOR", "VULNERABLE")
EHS_HARM_DECISIONS = ("PENDING", "ACCEPT_REMAINING_HARM", "CHANGE_THE_STORY")
# "The model writes `PENDING` and nothing else there" (the schema's opening rule): a person's fields.
EHS_PERSON_FIELDS = ("decided_by", "decided_at", "decision_reason", "decision_confirmed_by")

# --- DAS: systems/das/EVALUATION/OUTPUT_SCHEMAS.md ---
DAS_REVERSIBILITY = ("TYPE_1", "TYPE_2")
DAS_DOMAINS = ("SIMPLE", "COMPLICATED", "COMPLEX", "CHAOTIC", "DISORDER")
DAS_DEADLINE_TYPES = ("FIXED", "NEGOTIABLE")
DAS_OPTION_STATUSES = ("EXISTING", "NEWLY_GENERATED")
DAS_OPTION_TYPES = ("DEFAULT", "STATUS_QUO", "SEQUENCED", "ALTERNATIVE", "PROBE")
DAS_TIERS = ("DAS:A", "DAS:B", "DAS:C", "DAS:D", "DAS:E", "DAS:F")
DAS_DIRECTIONS = ("FAVORS", "DISFAVORS", "MIXED")
DAS_INDEPENDENCE = ("INDEPENDENT", "SAME_DECISION_MAKER", "MOTIVATED_PARTY")
DAS_CONSTRAINT_STATUSES = ("VERIFIED", "HELD_AS_ASSUMPTION")


# --- QAS: systems/qas/EVALUATION/OUTPUT_SCHEMAS.md, Framing record and Rival-hypothesis record ---
QAS_QUESTION_TYPES = ("DESCRIPTIVE", "COMPARATIVE", "THEORY_TEST")
QAS_CLAIM_LEVELS = ("POPULATION", "SUBGROUP", "INDIVIDUAL")
QAS_PHASES = ("EXPLORATORY", "CONFIRMATORY")
QAS_RIVAL_CATEGORIES = ("CHANCE", "ARTEFACT", "GROUP_MAKEUP", "REVERSE_DIRECTION", "COMMON_CAUSE", "PARTIAL_CAUSES",
                        "OTHER")

# --- RAS: systems/ras/EVALUATION/OUTPUT_SCHEMAS.md, Source record and Claim record (wire spellings) ---
RAS_VENUE = ("STANDARD", "NON_INDEXED_UNCLEAR", "KNOWN_PREDATORY")
RAS_PROVENANCE = ("VERIFIED", "UNVERIFIED_PROVENANCE")
RAS_SOURCE_LEVELS = ("PRIMARY", "SECONDARY", "TERTIARY")
RAS_CURRENCY = ("CURRENT", "CORRECTED", "RETRACTED", "SUPERSEDED", "UNABLE_TO_VERIFY")
RAS_STUDY_DESIGNS = ("RCT", "OBSERVATIONAL", "CASE_STUDY", "MODEL_SIMULATION", "CONSENSUS_STATEMENT", "REVIEW", "OTHER")
RAS_FUNDING = ("DISCLOSED", "UNDISCLOSED_DISCOVERED", "NONE_FOUND", "NOT_CHECKED")
RAS_QUALITY = ("CLEAN", "MINOR_CONCERN", "SERIOUS_CONCERN")
RAS_ACCESS = ("FULL_TEXT", "PARTIAL", "INACCESSIBLE")
RAS_CORROBORATION = ("CORROBORATED", "SINGLE_SOURCE")
RAS_REPLICATION = ("INDEPENDENTLY_REPLICATED", "SINGLE_UNREPLICATED", "NOT_APPLICABLE")


@dataclass(frozen=True)
class Check:
    """What the app's mechanical reading of an answer found. Errors reject the answer as malformed (the suite's own
    rule was broken); flags travel with it for the person deciding."""
    errors: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)


# A checker reads the answer with what the run had: {"handoff": the translated hand-over or None, "packet_text":
# the packet as the model saw it, "premises": what the requester took as given}.
Checker = Callable[[dict, dict], Check]


@dataclass(frozen=True)
class SuiteModule:
    key: str
    system: str
    title: str
    node: str
    files: tuple[Path, ...]
    schema: dict
    required: dict
    values: tuple[tuple[str, str, tuple[str, ...]], ...]
    # The modules whose accepted answer this one may start from, and whether it must.
    takes_from: tuple[str, ...] = ()
    needs_handoff: bool = False
    accepts_premises: bool = False
    # What the reporter is asked for, on screen and in the prompt.
    question_label: str = "The question"
    context_label: str | None = None
    # The lines that hold this run inside what the suite lets an app run of it do, each with its rule.
    limits: tuple[str, ...] = ()
    # The parts a person decides one by one: (list key, id field, text field, ref fields).
    items: tuple[str, str, str, tuple[str, ...]] | None = None
    check: Checker | None = None

    @property
    def system_name(self) -> str:
        return SYSTEM_NAMES[self.system][0]

    @property
    def is_support(self) -> bool:
        return SYSTEM_NAMES[self.system][1] == "support"

    @property
    def router_row(self) -> int:
        return SYSTEM_NAMES[self.system][2]


def walk(node: Any, path: str) -> Iterator[tuple[str, dict]]:
    """The objects a dotted path names, with where each is: "arguments[].argument_lines[]" yields every line of every
    argument. A path with no "[]" yields the payload itself."""
    parts = [p for p in path.split(".") if p]
    found: list[tuple[str, Any]] = [("", node)]
    for part in parts:
        key = part[:-2] if part.endswith("[]") else part
        nxt: list[tuple[str, Any]] = []
        for where, obj in found:
            if not isinstance(obj, dict):
                continue
            value = obj.get(key)
            if part.endswith("[]"):
                for i, item in enumerate(value if isinstance(value, list) else []):
                    nxt.append((f"{where}{'.' if where else ''}{key}[{i}]", item))
            else:
                nxt.append((f"{where}{'.' if where else ''}{key}", value))
        found = nxt
    for where, obj in found:
        if isinstance(obj, dict):
            yield where, obj


def check_values(module: SuiteModule, payload: dict) -> list[str]:
    errors: list[str] = []
    for path, name, allowed in module.values:
        for where, obj in walk(payload, path):
            value = obj.get(name)
            if value is not None and value not in allowed:
                errors.append(f"{where + '.' if where else ''}{name} must be one of {list(allowed)}, got {value!r}")
    return errors


def check_shape(module: SuiteModule, payload: dict) -> list[str]:
    """Required keys and their types, one level into each listed record, as reasoning._REQUIRED_SHAPE does for TAS."""
    errors: list[str] = []
    for key, expected in module.required.items():
        if key not in payload:
            errors.append(f"missing required field {key!r}")
            continue
        value = payload[key]
        if isinstance(expected, tuple) and expected[0] is dict:
            if not isinstance(value, dict):
                errors.append(f"field {key!r} must be an object")
                continue
            for req, typ in expected[1].items():
                if req not in value:
                    errors.append(f"{key} missing required field {req!r}")
                elif not isinstance(value[req], typ) or (typ is int and isinstance(value[req], bool)):
                    errors.append(f"{key}.{req} must be a {typ.__name__}")
        elif isinstance(expected, tuple):
            item_types: dict[str, type] = expected[1]
            if not isinstance(value, list):
                errors.append(f"field {key!r} must be a list")
                continue
            for i, item in enumerate(value):
                if not isinstance(item, dict):
                    errors.append(f"{key}[{i}] must be an object")
                    continue
                for req, typ in item_types.items():
                    if req not in item:
                        errors.append(f"{key}[{i}] missing required field {req!r}")
                    elif not isinstance(item[req], typ) or (typ is int and isinstance(item[req], bool)):
                        errors.append(f"{key}[{i}].{req} must be a {typ.__name__}")
        elif not isinstance(value, expected):
            errors.append(f"field {key!r} must be a {expected.__name__}")
    return errors


def _ids(payload: dict, path: str, name: str) -> list[str]:
    return [str(obj.get(name)) for _w, obj in walk(payload, path) if obj.get(name)]


def _pattern(ids: list[str], prefix: str, what: str) -> list[str]:
    return [f"{what} {i!r} is not a {prefix}-0001 style id" for i in ids if not re.fullmatch(rf"{prefix}-\d{{4,}}", i)]


def _keys_anywhere(node: Any, names: tuple[str, ...], where: str = "") -> list[str]:
    found: list[str] = []
    if isinstance(node, dict):
        for k, v in node.items():
            here = f"{where}.{k}" if where else k
            if k in names:
                found.append(here)
            found.extend(_keys_anywhere(v, names, here))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            found.extend(_keys_anywhere(v, names, f"{where}[{i}]"))
    return found


def _handoff_ids(handoff: dict | None) -> set[str]:
    return set((handoff or {}).get("ids") or [])


# --- LAS ------------------------------------------------------------------------------------------------------------

def _check_las(payload: dict, ctx: dict) -> Check:
    handoff = ctx.get("handoff")
    errors: list[str] = []
    flags: list[str] = []
    premise_ids = _ids(payload, "premises[]", "premise_id")
    errors += _pattern(premise_ids, "PREM", "premise_id")
    errors += _pattern(_ids(payload, "arguments[]", "arg_id"), "ARG", "arg_id")
    known = set(premise_ids)
    for where, arg in walk(payload, "arguments[]"):
        for key in ("explicit_premises", "unstated_premises"):
            for pid in arg.get(key) or []:
                if pid not in known:
                    errors.append(f"{where}.{key} names {pid!r}, which is not in premises")
        if arg.get("no_premises_offered") and (arg.get("explicit_premises") or arg.get("unstated_premises")):
            errors.append(f"{where} says no premises were offered but lists premises")
        for line_where, line in walk(arg, "argument_lines[]"):
            for pid in line.get("premises") or []:
                if pid not in known:
                    errors.append(f"{where}.{line_where}.premises names {pid!r}, which is not in premises")
            deductive = line.get("inferential_type") == "DEDUCTIVE"
            # OUTPUT_SCHEMAS_MACHINE.md: a validity verdict on deductive lines, else null; strength the other way round.
            if deductive and line.get("validity_verdict") is None:
                errors.append(f"{where}.{line_where} is deductive and has no validity_verdict")
            if not deductive and line.get("validity_verdict") is not None:
                errors.append(f"{where}.{line_where} is not deductive, so validity_verdict must be null")
            if not deductive and not line.get("strength"):
                errors.append(f"{where}.{line_where} is not deductive and has no strength")
        fallacy = arg.get("formal_fallacy")
        if fallacy is not None and fallacy not in LAS_FORMAL_FALLACIES:
            errors.append(f"{where}.formal_fallacy must be null or one of {list(LAS_FORMAL_FALLACIES)}, got {fallacy!r}")
        if handoff is not None:
            for cid in arg.get("reviews") or []:
                if cid not in _handoff_ids(handoff):
                    errors.append(f"{where}.reviews names {cid!r}, which the handed-over answer does not hold")
    stipulated = ctx.get("premises") or []
    marked = [p for _w, p in walk(payload, "premises[]") if p.get("attribution_category") == "USER_STIPULATED"]
    if len(marked) < len(stipulated):
        flags.append(f"You gave {len(stipulated)} premise(s) to take as given; {len(marked)} are marked USER_STIPULATED "
                     "(LAS Policy §3: a requester's premise is recorded as such and stays unverified)")
    return Check(errors, flags)


LAS_ARGUMENT_CHECK = SuiteModule(
    key="las_argument_check", system="las", title="Logic check", node="las/01+02",
    files=(SYSTEMS_ROOT / "las" / "PROMPT_MODULES" / "01_ARGUMENT_RECONSTRUCTION.md",
           SYSTEMS_ROOT / "las" / "PROMPT_MODULES" / "02_VALIDITY_CHECK.md"),
    schema={
        "modules_not_run": "string - Template T02: this is a compressed check; say that Modules 03-10 were not run, "
                           "that premise truth was not checked, and that it should not be relied on for anything "
                           "consequential before they are",
        "arguments": [{
            "arg_id": "string, e.g. ARG-0001",
            "reviews": ["string - the CLM- ids of the handed-over claims this argument reconstructs, or empty"],
            "conclusion": "string - one sentence: the claim argued for",
            "explicit_premises": ["string - PREM- ids of premises the arguer states"],
            "unstated_premises": ["string - PREM- ids of premises the inference needs but nobody stated"],
            "argument_lines": [{
                "line": "number",
                "premises": ["string - PREM- ids"],
                "inferential_type": "|".join(LAS_INFERENTIAL_TYPES),
                "validity_verdict": "null, OR " + "|".join(LAS_VALIDITY) + " - deductive lines only",
                "strength": "null, OR string - a calibrated term and its basis; non-deductive lines only",
                "logical_form": "null, OR string",
                "confidence_term": "|".join(CONFIDENCE_TERMS) + " - confidence in this verdict about the structure, "
                                   "never in whether the conclusion is true",
            }],
            "formal_fallacy": "null, OR one of: " + " | ".join(LAS_FORMAL_FALLACIES),
            "rival_explanation_not_addressed": "null, OR string",
            "conclusion_scope_mismatch": "null, OR string - what the premises, if true, establish",
            "equivocation_affecting_inference": ["string - the term and where its meaning shifts"],
            "no_premises_offered": "boolean",
        }],
        "premises": [{
            "premise_id": "string, e.g. PREM-0001",
            "premise_text": "string",
            "attribution_category": "|".join(LAS_ATTRIBUTION),
            "type": "|".join(LAS_PREMISE_TYPES),
            "load_bearing": "boolean - false = peripheral",
            "source": [_REF],
        }],
    },
    required={
        "modules_not_run": str,
        "arguments": (list, {"arg_id": str, "conclusion": str, "explicit_premises": list, "unstated_premises": list,
                             "argument_lines": list, "no_premises_offered": bool}),
        "premises": (list, {"premise_id": str, "premise_text": str, "attribution_category": str, "type": str,
                            "load_bearing": bool}),
    },
    values=(
        ("arguments[].argument_lines[]", "inferential_type", LAS_INFERENTIAL_TYPES),
        ("arguments[].argument_lines[]", "validity_verdict", LAS_VALIDITY),
        ("arguments[].argument_lines[]", "confidence_term", CONFIDENCE_TERMS),
        ("premises[]", "attribution_category", LAS_ATTRIBUTION),
        ("premises[]", "type", LAS_PREMISE_TYPES),
    ),
    takes_from=("case_synthesis",), accepts_premises=True,
    question_label="The argument to check",
    limits=(
        "Judge only whether each conclusion follows if its premises are true; never whether a premise is true "
        "(LAS Standard Rule 3; Module 02 assumes every premise true).",
        "Never say a conclusion is established because its argument holds (Rule 13), nor false because it fails "
        "(Rule 14).",
        "Never present a premise you supplied as the arguer's (Module 01 rule 3): mark it RECONSTRUCTED_BY_EVALUATOR.",
        "Render no composite verdict: Module 09 needs Modules 01-08, and this run is Modules 01 and 02 only.",
        "Write no confidence LOW|MEDIUM|HIGH: that field belongs to the Verdict record only.",
    ),
    items=("arguments", "arg_id", "conclusion", ()),
    check=_check_las,
)


# --- EGS ------------------------------------------------------------------------------------------------------------

def _check_egs(payload: dict, ctx: dict) -> Check:
    handoff = ctx.get("handoff")
    errors: list[str] = []
    flags: list[str] = []
    plan_ids = _ids(payload, "plan_items[]", "plan_item_id")
    errors += _pattern(plan_ids, "GPLN", "plan_item_id")
    upstream_ok = _handoff_ids(handoff)
    existence_upstream = (handoff or {}).get("existence") or {}
    for where, item in walk(payload, "plan_items[]"):
        if not str(item.get("refutes_if") or "").strip():
            errors.append(f"{where} has no refutes_if: a point with none is incomplete (Module 01 rule 2)")
        if item.get("status") == "NOT_SOUGHT" and not str(item.get("status_reason") or "").strip():
            errors.append(f"{where} is NOT_SOUGHT with no status_reason")
        for ref in item.get("upstream_refs") or []:
            if ref not in upstream_ok:
                errors.append(f"{where}.upstream_refs names {ref!r}, which the handed-over answer does not hold")
        for ref in item.get("upstream_refs") or []:
            tas = existence_upstream.get(ref)
            if tas and item.get("existence") and tas != item["existence"]:
                flags.append(f"{item.get('plan_item_id')}: EGS says the record is {item['existence']}, the TAS gap "
                             f"{ref} said {tas}. Neither was changed: INTEROP.md has no rule between the two")
    order = [str(x) for x in payload.get("order_of_work") or []]
    if sorted(order) != sorted(plan_ids):
        errors.append("order_of_work must list every plan item exactly once")
    kinds = {str(i.get("plan_item_id")): i for _w, i in walk(payload, "plan_items[]")}
    seen_document: set[str] = set()
    for pid in order:
        item = kinds.get(pid) or {}
        if item.get("type") == "DOCUMENT":
            seen_document.add(str(item.get("hypothesis")))
        elif item.get("type") == "PERSON" and not item.get("order_exception_reason"):
            later = [kinds[q] for q in order[order.index(pid) + 1:] if q in kinds]
            if any(k.get("type") == "DOCUMENT" and k.get("hypothesis") == item.get("hypothesis") for k in later):
                errors.append(f"{pid} approaches a person before the records that check them, with no "
                              "order_exception_reason (Module 01 rule 5)")
    return Check(errors, flags)


EVIDENCE_PLAN = SuiteModule(
    key="evidence_plan", system="egs", title="Evidence plan", node="egs/01",
    files=(SYSTEMS_ROOT / "egs" / "PROMPT_MODULES" / "01_EVIDENCE_PLAN.md",),
    schema={
        "plan_items": [{
            "plan_item_id": "string, e.g. GPLN-0001",
            "upstream_refs": ["string - the GAP-, CLM- or HYP- ids this point came from, exactly as the handed-over "
                              "answer writes them"],
            "hypothesis": "string",
            "point_to_establish": "string - one term of the hypothesis that must be proven",
            "confirms_if": "string",
            "refutes_if": "string - required; a point with none is incomplete",
            "record_or_testimony": "string",
            "holder": "string",
            "route": "|".join(EGS_ROUTES),
            "existence": "|".join(EGS_EXISTENCE),
            "existence_basis": "string - where it is referred to (KNOWN), or why it is believed to exist",
            "existence_evidence": [_REF],
            "existence_likelihood": "null, OR string - a term with its band beside it, e.g. 'likely (55–80%)'",
            "type": "|".join(EGS_TYPES),
            "priority": "|".join(EGS_PRIORITIES),
            "priority_reason": "string - materiality, risk of loss, time to obtain",
            "order_exception_reason": "null, OR string - why a person comes before the records that check them",
            "status": "|".join(EGS_PLAN_STATUSES),
            "status_reason": "null, OR string - required for NOT_SOUGHT",
        }],
        "order_of_work": ["string - every GPLN- id once, in the order to work them: documents first"],
    },
    required={
        "plan_items": (list, {"plan_item_id": str, "upstream_refs": list, "hypothesis": str, "point_to_establish": str,
                              "confirms_if": str, "refutes_if": str, "record_or_testimony": str, "holder": str,
                              "route": str, "existence": str, "existence_basis": str, "type": str, "priority": str,
                              "priority_reason": str, "status": str}),
        "order_of_work": list,
    },
    values=(
        ("plan_items[]", "route", EGS_ROUTES), ("plan_items[]", "existence", EGS_EXISTENCE),
        ("plan_items[]", "type", EGS_TYPES), ("plan_items[]", "priority", EGS_PRIORITIES),
        ("plan_items[]", "status", EGS_PLAN_STATUSES),
    ),
    takes_from=("case_synthesis", "hypothesis_test"), needs_handoff=True,
    question_label="What the plan is for", context_label="Jurisdiction and access limits",
    limits=(
        "Plan how to obtain evidence; never judge whether anything is true (EGS Standard §1; AGENTS.md [AG-067]).",
        "Plan no route that is unlawful or needs authority the requester lacks (Standard §2.7; Module 01 rule 10).",
        "Write every point PLANNED or NOT_SOUGHT: SOUGHT, DONE and STOPPED record work a person did.",
        "Send nothing and approach no one: a send waits for a person's explicit yes (AGENTS.md [AG-061]).",
        "Weigh no harm and no source protection: that is EHS's.",
    ),
    items=("plan_items", "plan_item_id", "point_to_establish", ("existence_evidence",)),
    check=_check_egs,
)


# --- EHS ------------------------------------------------------------------------------------------------------------

def _check_ehs_common(payload: dict) -> list[str]:
    return [f"{where} is a person's field; the model never writes it (EHS OUTPUT_SCHEMAS.md)"
            for where in _keys_anywhere(payload, EHS_PERSON_FIELDS)]


def _check_ehs_harm(payload: dict, ctx: dict) -> Check:
    handoff = ctx.get("handoff")
    errors = _check_ehs_common(payload)
    errors += _pattern(_ids(payload, "harm_assessments[]", "harm_id"), "EHRM", "harm_id")
    return Check(errors, [])


def _check_ehs_pit(payload: dict, ctx: dict) -> Check:
    handoff = ctx.get("handoff")
    errors = _check_ehs_common(payload)
    errors += _pattern([str(payload.get("pit_id") or "")], "EPIT", "pit_id")
    for hid in payload.get("harm_ids") or []:
        if hid not in _handoff_ids(handoff):
            errors.append(f"harm_ids names {hid!r}, which the handed-over harm assessment does not hold")
    if not str(payload.get("reasons") or "").strip():
        errors.append("reasons is empty: a category with no reasons is not a public interest")
    flags = []
    missing = sorted(_handoff_ids(handoff) - set(payload.get("harm_ids") or []))
    if missing:
        flags.append(f"Harm entries not weighed here: {', '.join(missing)}")
    return Check(errors, flags)


_RULES_NOT_APPLIED = {"rule": "string", "reason": "string"}
_EHS_LIMITS = (
    "Decide nothing: write PENDING in every decision field and nothing else (EHS Standard §1; OUTPUT_SCHEMAS.md). "
    "A named person decides.",
    "Say or imply no approval, clearance or decision by you (Standard §5).",
    "Give no harm or public interest as a probability or a score: a reasoned weighing only.",
    "Name no confidential source; a code name only (Standard §6).",
    "Regrade no finding of the authority systems (AGENTS.md [AG-067]).",
)

EHS_HARM = SuiteModule(
    key="ehs_harm_minimisation", system="ehs", title="Harm assessment", node="ehs/02",
    files=(SYSTEMS_ROOT / "ehs" / "PROMPT_MODULES" / "02_HARM_MINIMISATION.md",),
    schema={
        "story_id": "string - the story as named in the request",
        "harm_assessments": [{
            "harm_id": "string, e.g. EHRM-0001",
            "person_or_group": "string - as the packet names them; a confidential source by code name only",
            "identified_in": [_REF],
            "category": "|".join(EHS_HARM_CATEGORIES),
            "harm": "string",
            "approach_or_consent": "string - as the packet records it, or 'NOT GIVEN'",
            "least_harmful_way": "string - and what it changes",
            "loses_public_interest": "boolean",
            "remaining_harm": "string",
            "remaining_harm_reasons": "string - a reasoned weighing, never a probability or a score",
            "decision": "PENDING - write PENDING and nothing else",
            "missing_inputs": ["string"],
            "rules_not_applied": [_RULES_NOT_APPLIED],
        }],
        "people_without_harm_entry": ["string - anyone named or identifiable in the material who has no entry"],
    },
    required={
        "story_id": str,
        "harm_assessments": (list, {"harm_id": str, "person_or_group": str, "category": str, "harm": str,
                                    "least_harmful_way": str, "loses_public_interest": bool,
                                    "remaining_harm_reasons": str, "decision": str}),
        "people_without_harm_entry": list,
    },
    values=(("harm_assessments[]", "category", EHS_HARM_CATEGORIES), ("harm_assessments[]", "decision", ("PENDING",))),
    takes_from=("case_synthesis",),
    question_label="What is being prepared for publication", context_label="How each person was approached",
    limits=_EHS_LIMITS,
    items=("harm_assessments", "harm_id", "harm", ("identified_in",)),
    check=_check_ehs_harm,
)

EHS_PUBLIC_INTEREST = SuiteModule(
    key="ehs_public_interest", system="ehs", title="Public interest", node="ehs/01",
    files=(SYSTEMS_ROOT / "ehs" / "PROMPT_MODULES" / "01_PUBLIC_INTEREST_AND_PROPORTIONALITY.md",),
    schema={
        "pit_id": "string, e.g. EPIT-0001",
        "public_interest": "|".join(EHS_PUBLIC_INTERESTS),
        "reasons": "string - facts from this story; a category with no reasons is not a public interest",
        "reasons_evidence": [_REF],
        "interest_of_the_public": "string - recorded and given no weight",
        "elements": [{"element": "string", "intrusion_or_harm": "string", "needed_by_public_interest": "boolean",
                      "weighing": "string", "evidence": [_REF]}],
        "public_figure_note": "null, OR string",
        "child_exceptional_interest": "null, OR string - or that none was found",
        "lawful_access_note": "null, OR string - a fact, never the justification",
        "harm_ids": ["string - the EHRM- ids of the handed-over harm assessment this weighing covers"],
        "decision": "PENDING - write PENDING and nothing else",
        "missing_inputs": ["string"],
        "rules_not_applied": [_RULES_NOT_APPLIED],
    },
    required={
        "pit_id": str, "public_interest": str, "reasons": str, "interest_of_the_public": str,
        "elements": (list, {"element": str, "intrusion_or_harm": str, "needed_by_public_interest": bool,
                            "weighing": str}),
        "harm_ids": list, "decision": str,
    },
    values=(("", "public_interest", EHS_PUBLIC_INTERESTS), ("", "decision", ("PENDING",))),
    takes_from=("ehs_harm_minimisation",), needs_handoff=True,
    question_label="What is being prepared for publication", context_label="Who decides",
    limits=_EHS_LIMITS,
    items=("elements", "element", "weighing", ("evidence",)),
    check=_check_ehs_pit,
)


# --- DAS ------------------------------------------------------------------------------------------------------------

def _check_das_framing(payload: dict, ctx: dict) -> Check:
    handoff = ctx.get("handoff")
    errors = _pattern([str(payload.get("decision_id") or "")], "DEC", "decision_id")
    flags = []
    if payload.get("problem_domain") == "DISORDER" and not payload.get("domain_parts"):
        flags.append("Framed as DISORDER: the live possibilities should be named in domain_rationale")
    return Check(errors, flags)


def _check_das_options(payload: dict, ctx: dict) -> Check:
    handoff = ctx.get("handoff")
    errors: list[str] = []
    flags: list[str] = []
    framing = (handoff or {}).get("records") or []
    framed = framing[0] if framing and isinstance(framing[0], dict) else {}
    if handoff is not None and payload.get("decision_id") != framed.get("decision_id"):
        errors.append(f"decision_id {payload.get('decision_id')!r} is not the handed-over framing's "
                      f"{framed.get('decision_id')!r}")
    option_ids = _ids(payload, "options[]", "option_id")
    errors += _pattern(option_ids, "OPT", "option_id")
    errors += _pattern(_ids(payload, "evidence_table[]", "evidence_id"), "DSE", "evidence_id")
    errors += _pattern(_ids(payload, "constraints[]", "constraint_id"), "CST", "constraint_id")
    options = [o for _w, o in walk(payload, "options[]")]
    if not any(o.get("status") == "NEWLY_GENERATED" for o in options):
        errors.append("no option is NEWLY_GENERATED: Module 02 asks for options beyond those already on the table")
    if not any(o.get("option_type") == "STATUS_QUO" for o in options):
        flags.append("No STATUS_QUO option: Module 02 asks for one, or a stated reason it is unavailable")
    if any(o.get("option_type") == "PROBE" for o in options) and framed.get("problem_domain") not in (None, "COMPLEX"):
        errors.append(f"a PROBE option needs a COMPLEX framing; the framing says {framed.get('problem_domain')}")
    for key in _keys_anywhere(payload, ("score", "rank", "ranking", "recommended")):
        errors.append(f"{key}: options carry no score or rank, and nothing is recommended yet (Module 02 rule 6)")
    for where, row in walk(payload, "evidence_table[]"):
        if row.get("option_id") not in option_ids:
            errors.append(f"{where}.option_id {row.get('option_id')!r} is not one of the options")
        if row.get("independence") == "MOTIVATED_PARTY" and row.get("tier") != "DAS:F":
            errors.append(f"{where} is from a motivated party, so its tier is DAS:F, not {row.get('tier')!r}")
    for where, row in walk(payload, "constraints[]"):
        if not row.get("source") and not row.get("source_refs"):
            if row.get("options_removed"):
                errors.append(f"{where} has no source, so it removes no option; it is held as an assumption")
            if row.get("status") != "HELD_AS_ASSUMPTION":
                errors.append(f"{where} has no source, so its status is HELD_AS_ASSUMPTION")
        for oid in row.get("options_removed") or []:
            if oid not in option_ids:
                errors.append(f"{where}.options_removed names {oid!r}, which is not one of the options")
    return Check(errors, flags)


_DAS_LIMITS = (
    "Structure the decision; never make it, and never substitute your own risk tolerance or values for the "
    "decision-maker's (DAS Standard §2).",
    "Evaluate no option's merits and rank or recommend nothing yet (Module 01; Module 02 rule 6).",
    "Do not call this a decision record or a completed DAS task: the pre-mortem, weighted criteria, owner and review "
    "trigger have not been done (Standard §18).",
    "Do not redo TAS's fact-finding: cite the packet's records (Policy §8).",
    "Make no publication or harm judgement: that is EHS's, and a named person decides it.",
)

DAS_FRAMING = SuiteModule(
    key="das_framing", system="das", title="Decision framing", node="das/01",
    files=(SYSTEMS_ROOT / "das" / "PROMPT_MODULES" / "01_DECISION_FRAMING.md",),
    schema={
        "decision_id": "string, e.g. DEC-0001",
        "decision_statement": "string - one bounded question with a finite set of answers",
        "proxy_question": "null, OR string",
        "decision_maker": "string - who has authority, as the request names or the packet shows; never you",
        "required_consultation": ["string"],
        "stakes": "string - the concrete consequences of getting it wrong",
        "reversibility_type": "|".join(DAS_REVERSIBILITY),
        "reversibility_rationale": "string - for this instance, not the category",
        "problem_domain": "|".join(DAS_DOMAINS),
        "domain_rationale": "string - the observable signal; the live possibilities when DISORDER",
        "domain_parts": [{"part": "string", "problem_domain": "|".join(DAS_DOMAINS), "rationale": "string"}],
        "deadline": "null, OR string - YYYY-MM-DD, as stated",
        "deadline_type": "|".join(DAS_DEADLINE_TYPES),
        "recommended_process": "string",
        "process_mismatch_flag": "null, OR string",
        "ambiguity_flag": "null, OR string",
        "routing_note": "string - which of Modules 02-07 should run in full or compressed",
        "evidence": [_REF],
    },
    required={
        "decision_id": str, "decision_statement": str, "decision_maker": str, "stakes": str,
        "reversibility_type": str, "reversibility_rationale": str, "problem_domain": str, "domain_rationale": str,
        "deadline_type": str, "recommended_process": str, "routing_note": str,
    },
    values=(("", "reversibility_type", DAS_REVERSIBILITY), ("", "problem_domain", DAS_DOMAINS),
            ("", "deadline_type", DAS_DEADLINE_TYPES), ("domain_parts[]", "problem_domain", DAS_DOMAINS)),
    question_label="The decision under review", context_label="Who decides, by when, and what is at stake",
    limits=_DAS_LIMITS, check=_check_das_framing,
)

DAS_OPTIONS = SuiteModule(
    key="das_options", system="das", title="Options and evidence", node="das/02",
    files=(SYSTEMS_ROOT / "das" / "PROMPT_MODULES" / "02_OPTION_GENERATION_AND_EVIDENCE_GATHERING.md",),
    schema={
        "decision_id": "string - the DEC- id of the handed-over framing",
        "options": [{"option_id": "string, e.g. OPT-0001", "option": "string",
                     "status": "|".join(DAS_OPTION_STATUSES), "option_type": "|".join(DAS_OPTION_TYPES),
                     "resourcing_and_timeline": "string", "reversibility_note": "null, OR string",
                     "limitations": ["string"]}],
        "evidence_table": [{
            "evidence_id": "string, e.g. DSE-0001", "option_id": "string - an OPT- id above",
            "evidence_or_precedent": "string", "cites": [_REF],
            "tier": "|".join(DAS_TIERS) + " - comparability to THIS decision (Policy §3); never a source's TAS tier",
            "upstream_tier": "null - always null: the Workbench fills it from the cited source's own tier",
            "comparability_note": "string",
            "direction": "|".join(DAS_DIRECTIONS),
            "independence": "|".join(DAS_INDEPENDENCE),
            "limitations": ["string"],
        }],
        "search_discipline_note": "string - what was sought against the leading option; found; sought and not found",
        "distance_check": "string - how an outside advisor would read this",
        "constraints": [{"constraint_id": "string, e.g. CST-0001", "constraint": "string",
                         "source": "null, OR string", "source_refs": [_REF],
                         "tier": "null, OR " + "|".join(DAS_TIERS), "options_removed": ["string - OPT- ids"],
                         "status": "|".join(DAS_CONSTRAINT_STATUSES)}],
    },
    required={
        "decision_id": str,
        "options": (list, {"option_id": str, "option": str, "status": str, "option_type": str}),
        "evidence_table": (list, {"evidence_id": str, "option_id": str, "evidence_or_precedent": str, "tier": str,
                                  "comparability_note": str, "direction": str, "independence": str}),
        "search_discipline_note": str, "distance_check": str,
        "constraints": (list, {"constraint_id": str, "constraint": str, "options_removed": list, "status": str}),
    },
    values=(("options[]", "status", DAS_OPTION_STATUSES), ("options[]", "option_type", DAS_OPTION_TYPES),
            ("evidence_table[]", "tier", DAS_TIERS), ("evidence_table[]", "direction", DAS_DIRECTIONS),
            ("evidence_table[]", "independence", DAS_INDEPENDENCE), ("constraints[]", "tier", DAS_TIERS),
            ("constraints[]", "status", DAS_CONSTRAINT_STATUSES)),
    takes_from=("das_framing",), needs_handoff=True,
    question_label="The decision under review", context_label="Options already on the table, and stated constraints",
    limits=_DAS_LIMITS,
    items=("options", "option_id", "option", ()),
    check=_check_das_options,
)


# --- QAS ------------------------------------------------------------------------------------------------------------

def _numbers(text: str) -> list[str]:
    return re.findall(r"\d[\d,.]*\d|\d", text)


def _check_qas(payload: dict, ctx: dict) -> Check:
    handoff = ctx.get("handoff")
    errors: list[str] = []
    framing: dict = payload["framing"] if isinstance(payload.get("framing"), dict) else {}
    rivals: dict = payload["rival_set"] if isinstance(payload.get("rival_set"), dict) else {}
    errors += _pattern([str(framing.get("framing_id") or "")], "QFRM", "framing.framing_id")
    errors += _pattern([str(rivals.get("rival_set_id") or "")], "QRIV", "rival_set.rival_set_id")
    if rivals.get("framing_id") != framing.get("framing_id"):
        errors.append("rival_set.framing_id must be the framing's own id")
    if not str(framing.get("question") or "").rstrip().endswith("?"):
        errors.append("framing.question must be one sentence ending in '?' (Module 01)")
    viewed: dict = framing["data_viewed_before_framing"] if isinstance(framing.get("data_viewed_before_framing"), dict) else {}
    if viewed.get("viewed") is not True:
        errors.append("data_viewed_before_framing.viewed must be true: the packet was in view (Module 01 rule 9)")
    for where, rival in walk(payload, "rival_set.rivals_identified_so_far[]"):
        hyp = rival.get("from_hypothesis")
        if hyp is not None and hyp not in _handoff_ids(handoff):
            errors.append(f"{where}.from_hypothesis names {hyp!r}, which the handed-over answer does not hold")
    # QAS computes, as code (Module 04); this run computes nothing. A number written here must be one a record states.
    stated = set(_numbers(ctx.get("packet_text") or ""))
    flags: list[str] = []
    texts: list[tuple[str, str]] = [("framing.result_against_expected", str(framing.get("result_against_expected") or ""))]
    for where, rival in walk(payload, "rival_set.rivals_identified_so_far[]"):
        texts.append((f"{where}.prediction", str(rival.get("prediction") or "")))
    check: dict = rivals["check"] if isinstance(rivals.get("check"), dict) else {}
    texts.append(("rival_set.check.design", str(check.get("design") or "")))
    for where, outcome in walk(payload, "rival_set.check.outcomes[]"):
        texts.append((f"{where}.outcome", str(outcome.get("outcome") or "")))
    for where, text in texts:
        unstated = [n for n in _numbers(text) if n not in stated]
        if unstated:
            flags.append(f"{where} writes {', '.join(unstated)}, which no record in the packet states: QAS numbers come "
                         "from a recorded run, and this run ran none")
    return Check(errors, flags)


QAS_FRAMING = SuiteModule(
    key="quant_framing", system="qas", title="Rival explanations", node="qas/01+03",
    files=(SYSTEMS_ROOT / "qas" / "PROMPT_MODULES" / "01_QUESTION_AND_DATA_FRAMING.md",
           SYSTEMS_ROOT / "qas" / "PROMPT_MODULES" / "03_RIVAL_HYPOTHESES_AND_THE_DISCRIMINATING_TEST.md"),
    schema={
        "framing": {
            "framing_id": "string, e.g. QFRM-0001",
            "question": "string - one sentence ending in '?'",
            "question_type": "|".join(QAS_QUESTION_TYPES),
            "unit_of_analysis": "string - what one row is, e.g. one payment",
            "target_population": "string",
            "data_coverage_expected": "string - what the packet's records cover",
            "coverage_gap": "string - the answer may not claim the wider of the two",
            "claim_level": "|".join(QAS_CLAIM_LEVELS),
            "variables": [{"name": "string", "definition": "string", "unit": "string"}],
            "answer_form": {"quantity": "string - count, rate, difference or ratio, in words", "unit": "string",
                            "denominator": "string"},
            "result_against_expected": "string - in words, or that the question is not yet testable",
            "data_viewed_before_framing": {"viewed": "boolean - true: the packet was in view",
                                           "fields_affected": ["string"]},
            "modules_skipped": [{"module": "string", "reason": "string"}],
        },
        "rival_set": {
            "rival_set_id": "string, e.g. QRIV-0001",
            "framing_id": "string - the QFRM- id above",
            "phase": "|".join(QAS_PHASES),
            "round": "number - 1",
            "rivals_identified_so_far": [{
                "rival": "string",
                "category": "|".join(QAS_RIVAL_CATEGORIES),
                "prediction": "string - what the data would show if it holds, in words; never a value you computed",
                "differs_from": ["string - the rivals, as written here, whose prediction differs"],
                "from_hypothesis": "null, OR string - the HYP- id of the handed-over theory test it came from",
                "evidence": [_REF],
            }],
            "check": {
                "design": "string - the analysis the Workbench would run; you never run it",
                "outcomes": [{"outcome": "string", "counts_against": ["string - rivals"]}],
                "assumptions": ["string"],
                "weak_points": ["string"],
            },
            "remaining_rivals": ["string - all of them: the check has not been run"],
            "data_needed": ["string"],
        },
    },
    required={
        "framing": (dict, {"framing_id": str, "question": str, "question_type": str, "unit_of_analysis": str,
                           "target_population": str, "coverage_gap": str, "claim_level": str, "variables": list,
                           "answer_form": dict, "data_viewed_before_framing": dict}),
        "rival_set": (dict, {"rival_set_id": str, "framing_id": str, "phase": str, "rivals_identified_so_far": list,
                             "check": dict, "remaining_rivals": list, "data_needed": list}),
    },
    values=(("framing", "question_type", QAS_QUESTION_TYPES), ("framing", "claim_level", QAS_CLAIM_LEVELS),
            ("rival_set", "phase", QAS_PHASES),
            ("rival_set.rivals_identified_so_far[]", "category", QAS_RIVAL_CATEGORIES)),
    takes_from=("hypothesis_test",),
    question_label="The question the data should answer",
    limits=(
        "Compute nothing and write no result, estimate or interval: QAS runs its analysis as code and records where "
        "(Module 04); every number must trace to a run (Module 07). Write only numbers a packet record states.",
        "Write no audit and call nothing PASS: the final audit runs in a fresh context (Module 07).",
        "Use no causal wording and no likelihood term: those need a causal judgement record (Standard; Module 06).",
        "Say the rival list is the rivals identified so far, never that it is complete (Module 03).",
        "Decide no claim about the case beyond what the data show: that is TAS's (Standard §10).",
    ),
    items=("rival_set.rivals_identified_so_far", "rival", "prediction", ("evidence",)),
    check=_check_qas,
)


# --- RAS ------------------------------------------------------------------------------------------------------------

def _check_ras(payload: dict, ctx: dict) -> Check:
    errors: list[str] = []
    flags: list[str] = []
    source_ids = _ids(payload, "sources[]", "source_id")
    errors += _pattern(source_ids, "RSRC", "source_id")
    errors += _pattern(_ids(payload, "claims[]", "claim_id"), "RCLM", "claim_id")
    unverified: set[str] = set()
    for where, src in walk(payload, "sources[]"):
        tier = src.get("tier")
        if not isinstance(tier, int) or isinstance(tier, bool) or not 1 <= tier <= 8:
            errors.append(f"{where}.tier must be a RAS tier, a whole number 1-8 (never a TAS letter), got {tier!r}")
        if src.get("provenance_flag") == "UNVERIFIED_PROVENANCE":
            unverified.add(str(src.get("source_id")))
            if tier != 8:
                errors.append(f"{where} has unverified provenance, so its tier is 8 (Module 03)")
        if src.get("currency_status") in ("CURRENT", "CORRECTED", "RETRACTED", "SUPERSEDED"):
            flags.append(f"{src.get('source_id')}: currency_status {src['currency_status']} was not checked outside "
                         "the packet (Module 07 did not run); it rests on what the record itself says")
    for where, claim in walk(payload, "claims[]"):
        support = [s for s in claim.get("supporting_sources") or [] if isinstance(s, dict)]
        for key in ("supporting_sources", "contradicting_sources"):
            for s in claim.get(key) or []:
                if isinstance(s, dict) and s.get("source_id") not in source_ids:
                    errors.append(f"{where}.{key} names {s.get('source_id')!r}, which is not one of the sources")
        counted = [s for s in support if s.get("source_id") not in unverified]
        if claim.get("corroboration_verdict") == "CORROBORATED" and len({s.get("source_id") for s in counted}) < 2:
            errors.append(f"{where} is CORROBORATED on fewer than two sources that count (an unverified-provenance "
                          "source never counts)")
    for key in _keys_anywhere(payload, ("certainty_of_evidence", "degree_of_consensus")):
        errors.append(f"{key}: only a full Module 09 calibration assigns it, and this run is Modules 03 and 04")
    return Check(errors, flags)


_RAS_SOURCE_REF = {"source_id": "string - an RSRC- id above", "tier": "number - 1-8", "pinpoint_location": "string",
                   "evidence": [_REF]}

RAS_VETTING = SuiteModule(
    key="research_vetting", system="ras", title="Research vetting", node="ras/03+04",
    files=(SYSTEMS_ROOT / "ras" / "PROMPT_MODULES" / "03_SOURCE_VETTING_AND_AUTHORITY_RANKING.md",
           SYSTEMS_ROOT / "ras" / "PROMPT_MODULES" / "04_CLAIM_EXTRACTION_AND_CORROBORATION_MAPPING.md"),
    schema={
        "scope_and_limitations": "string - Template T03: the packet stood in for Module 02's search, so no search or "
                                 "diversity check ran; this is partial completion, naming the Standard §14 "
                                 "conditions it does not meet",
        "not_research_sources": [{"record": _REF, "reason": "string - a case source, not published research; not "
                                                            "tiered here"}],
        "sources": [{
            "source_id": "string, e.g. RSRC-0001",
            "record": _REF,
            "citation": "string - as the record states it; never guess an identifier",
            "tier": "number - 1-8, the RAS scale; never a TAS letter",
            "claim_specific_tier_exceptions": [{"claim_id": "string - an RCLM- id", "claim_as_source_states_it": "string",
                                                "tier": "number - 1-8", "reason": "string"}],
            "venue_legitimacy_flag": "|".join(RAS_VENUE),
            "provenance_flag": "|".join(RAS_PROVENANCE),
            "source_level": "|".join(RAS_SOURCE_LEVELS),
            "study_design": "null, OR " + "|".join(RAS_STUDY_DESIGNS),
            "sample_size": "null, OR number - only as the source itself states it",
            "funding_coi_status": "|".join(RAS_FUNDING),
            "funding_conflicts_of_interest": "null, OR string",
            "disclosed_limitations": ["string"],
            "quality_flag": "|".join(RAS_QUALITY),
            "currency_status": "|".join(RAS_CURRENCY) + " - UNABLE_TO_VERIFY unless a packet record itself states "
                               "the notice",
            "retrieved_at": "null, OR string",
            "access_status": "|".join(RAS_ACCESS),
        }],
        "claims": [{
            "claim_id": "string, e.g. RCLM-0001",
            "claim_text": "string - with its population, timeframe and scope",
            "supporting_sources": [_RAS_SOURCE_REF],
            "contradicting_sources": [_RAS_SOURCE_REF],
            "corroboration_verdict": "|".join(RAS_CORROBORATION),
            "corroboration_basis": "string",
            "replication_status": "|".join(RAS_REPLICATION),
            "extrapolation_flag": "boolean",
            "warrant": "string",
        }],
    },
    required={
        "scope_and_limitations": str,
        "not_research_sources": (list, {"record": dict, "reason": str}),
        "sources": (list, {"source_id": str, "record": dict, "citation": str, "tier": int,
                           "venue_legitimacy_flag": str, "provenance_flag": str, "source_level": str,
                           "funding_coi_status": str, "quality_flag": str, "currency_status": str,
                           "access_status": str}),
        "claims": (list, {"claim_id": str, "claim_text": str, "supporting_sources": list,
                          "corroboration_verdict": str, "replication_status": str, "extrapolation_flag": bool,
                          "warrant": str}),
    },
    values=(("sources[]", "venue_legitimacy_flag", RAS_VENUE), ("sources[]", "provenance_flag", RAS_PROVENANCE),
            ("sources[]", "source_level", RAS_SOURCE_LEVELS), ("sources[]", "study_design", RAS_STUDY_DESIGNS),
            ("sources[]", "funding_coi_status", RAS_FUNDING), ("sources[]", "quality_flag", RAS_QUALITY),
            ("sources[]", "currency_status", RAS_CURRENCY), ("sources[]", "access_status", RAS_ACCESS),
            ("claims[]", "corroboration_verdict", RAS_CORROBORATION),
            ("claims[]", "replication_status", RAS_REPLICATION)),
    question_label="The general question the research bears on",
    limits=(
        "Tier and vet the sources in the packet; draw or imply no synthesis conclusion and never write 'the research "
        "shows' (Template T03; Standard Rule 9).",
        "Assign no certainty-of-evidence or consensus label: only a full Module 09 calibration does (DIR-0021).",
        "Report partial completion: the packet was never a fair search (Policy §4).",
        "Use only what the packet's records state; import no facts from memory, and leave currency UNABLE_TO_VERIFY "
        "unless a record states the notice (Module 07 rule 3).",
        "A case record that is not published research is listed in not_research_sources and not tiered.",
        "Decide no claim about the case: RAS stops at a specific claim about a case ([IN-059]).",
    ),
    items=("claims", "claim_id", "claim_text", ()),
    check=_check_ras,
)


SUITE_MODULES: dict[str, SuiteModule] = {m.key: m for m in (
    RAS_VETTING, QAS_FRAMING, LAS_ARGUMENT_CHECK, DAS_FRAMING, DAS_OPTIONS, EVIDENCE_PLAN, EHS_HARM,
    EHS_PUBLIC_INTEREST,
)}


def run_checks(key: str, payload: dict, *, handoff: dict | None = None, packet_text: str = "",
               premises: list[str] | None = None) -> Check:
    module = SUITE_MODULES[key]
    ctx = {"handoff": handoff, "packet_text": packet_text, "premises": premises or []}
    return module.check(payload, ctx) if module.check else Check()


def framing_text(key: str, module_texts: list[str], premises: list[str]) -> str:
    """The opening of the system prompt for one suite module: which system, its own module text, and the limits an
    app run of it keeps."""
    m = SUITE_MODULES[key]
    kind = (" It is a support system: it serves the authority systems and issues no authority judgement "
            "(AGENTS.md [AG-067]).") if m.is_support else ""
    modules = "\n\n".join(module_texts)
    limits = "\n".join(f"- {line}" for line in m.limits)
    stipulated = ""
    if premises and m.accepts_premises:
        lines = "\n".join(f"- {p}" for p in premises)
        stipulated = ("\nPREMISES THE REQUESTER TAKES AS GIVEN (record each as a premise with attribution_category "
                      f"USER_STIPULATED; it stays unverified, never VERIFIED -- LAS Policy §3):\n{lines}\n")
    return f"""You are operating under the {m.system_name} ({m.system.upper()}) of the Authority System Suite, row
{m.router_row} of the suite's trigger table.{kind} The following module text defines your task, its rules, and
the report a human reviewer expects. Return its content as the JSON records in the OUTPUT CONTRACT below, not
as a markdown report:

{modules}

WHAT THIS RUN MAY NOT DO (the suite's own rules for it):
{limits}
{stipulated}"""
