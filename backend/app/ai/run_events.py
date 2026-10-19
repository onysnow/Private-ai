"""The run record: each AI run's steps as they happen (mockup AI_1 "Watch the run", ADR-0012, research SUITE §7.2-7.3).

`RunRecorder.emit` appends one event and commits it, so a reader polling the run sees it at once. The status of an
event is worked out here from the verdict, by the tables below; the model never chooses a colour. Events that come
from the model's own answer are marked `self_reported` until an app check confirms them (the suite's
FABRICATION_CONTROLS: self-reports stay alleged).
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.systems import SuiteModule, walk
from app.core.time import utcnow_naive
from app.models.domain import AIRunEvent

# TAS Standard §4 claim classes (OUTPUT_SCHEMAS case_synthesis) -> node status. A gap, a negative search or an
# unresolved conflict is a finding, not a failure (AGENTS.md: "Absence of a source is a finding").
CLASS_STATUS = {
    "CORROBORATED_FACT": "good",
    "SOURCE_STATEMENT": "partial", "INFERENCE": "partial", "ALLEGATION": "partial", "HYPOTHESIS": "partial",
    "UNKNOWN": "neutral", "NEGATIVE_SEARCH_RESULT": "neutral", "UNRESOLVED_CONFLICT": "neutral",
}
STATUSES = ("good", "partial", "bad", "neutral")

# Instructions written inside case material: shown before the run and kept with it; the prompt already tells the
# model such text is quoted content (TAS Standard §15).
_INJECTION = re.compile(
    r"(severity[ _]floor|source[ _]tier[ _]floor|tier floor|devil'?s advocate|research[ _]depth|"
    r"ignore (?:all |any )?(?:previous|prior|above|earlier) instructions|disregard (?:the |all )?(?:previous |above )?instructions|"
    r"system prompt|you are now)",
    re.IGNORECASE,
)


def instructions_in_packet(packet: dict) -> list[dict]:
    """Text inside case material that reads like an instruction to change a setting or the task."""
    found = []
    items = [i for group in (packet.get("context") or {}).values() for i in group] + list(packet.get("external_leads") or [])
    for item in items:
        for field in ("snippet", "title"):
            text = item.get(field) or ""
            m = _INJECTION.search(text)
            if not m:
                continue
            start = max(0, m.start() - 60)
            found.append({"record_type": item["record_type"], "record_id": item["record_id"], "title": item.get("title") or "",
                          "quote": ("…" if start else "") + text[start:m.end() + 80].strip()})
            break
    return found


class RunRecorder:
    """Appends a run's events. With no run id (a run called directly, not as a job) it records nothing."""

    def __init__(self, db: Session, investigation_id: str, run_id: str | None):
        self.db, self.investigation_id, self.run_id = db, investigation_id, run_id
        self.n = 0
        if run_id:
            self.n = int(db.scalar(select(func.max(AIRunEvent.n)).where(AIRunEvent.run_id == run_id)) or 0)

    def emit(self, kind: str, node: str, *, system: str = "app", status: str = "neutral", text: str = "",
             rule: str | None = None, verdict: str | None = None, refs: list[dict] | None = None,
             parent: int | None = None, self_reported: bool = False, detail: dict | None = None) -> int | None:
        if not self.run_id:
            return None
        if status not in STATUSES:
            raise ValueError(f"unknown event status {status!r}")
        self.n += 1
        self.db.add(AIRunEvent(
            investigation_id=self.investigation_id, run_id=self.run_id, n=self.n, at=utcnow_naive(), kind=kind, node=node,
            system=system, rule=rule, status=status, verdict=verdict, text=text[:2000],
            refs=[{"record_type": str(r.get("record_type")), "record_id": str(r.get("record_id"))} for r in (refs or [])][:200],
            parent=parent, self_reported=self_reported, detail=detail,
        ))
        self.db.commit()
        return self.n


def _refs(*lists: Any) -> list[dict]:
    out: list[dict] = []
    for items in lists:
        for r in items or []:
            if isinstance(r, dict) and r.get("record_type") and r.get("record_id"):
                out.append(r)
    return out


def _in_packet(refs: list[dict], known: set[tuple[str, str]]) -> list[dict]:
    return [r for r in refs if (str(r["record_type"]), str(r["record_id"])) not in known]


def record_thoughts(rec: RunRecorder, module: str, payload: dict, known: set[tuple[str, str]], parent: int | None) -> dict[str, int]:
    """One chain per thought of the answer: what the model says (self-reported), then the app's check of it.
    Returns the tallies by status of the thoughts' last events."""
    tally = {s: 0 for s in STATUSES}

    def chain(node: str, rule: str, thought_id: str, text: str, verdict: str, status: str, refs: list[dict],
              extra: list[tuple[str, str, str, str]] | None = None) -> None:
        said = rec.emit("RULE", node, system="tas", rule=rule, verdict=verdict, status=status, text=text, refs=refs,
                        parent=parent, self_reported=True, detail={"thought": thought_id})
        last_status = status
        missing = _in_packet(refs, known)
        if refs:
            last_status = "bad" if missing else status
            rec.emit("CHECK", "gate:citation", status="bad" if missing else "good", verdict="FAIL" if missing else "PASS",
                     text=(f"{len(missing)} of {len(refs)} cited records are not in the packet" if missing
                           else f"All {len(refs)} cited records are in the packet"),
                     refs=refs, parent=said, detail={"thought": thought_id})
        for kind, enode, estatus, etext in extra or []:
            rec.emit(kind, enode, system="tas" if not enode.startswith("cp-") else "umbrella", status=estatus, text=etext,
                     parent=said, detail={"thought": thought_id})
            if estatus in ("bad", "partial") and last_status == "good":
                last_status = estatus
        tally[last_status] += 1

    if module == "case_synthesis":
        reply_ids = {cid for r in payload.get("right_of_reply_needed") or [] for cid in r.get("claim_ids") or []}
        for c in payload.get("claims") or []:
            cls = str(c.get("classification") or "UNKNOWN")
            support = _refs(c.get("supporting_evidence"))
            refs = _refs(c.get("supporting_evidence"), c.get("contradicting_evidence"))
            extra: list[tuple[str, str, str, str]] = []
            if cls == "CORROBORATED_FACT" and len(support) == 1:
                extra.append(("FLAG", "tas/corroboration", "partial",
                              "Called corroborated on one record: TAS §4.3 needs more than one independent source, or one Tier A record"))
            if c.get("claim_id") in reply_ids:
                extra.append(("CHECK", "cp-01", "partial", "Right of reply needed before publication (CP-01)"))
            chain("tas/class", "TAS Standard §4", str(c.get("claim_id") or ""), str(c.get("claim") or ""), cls,
                  CLASS_STATUS.get(cls, "neutral"), refs, extra)
        for g in payload.get("investigative_gaps") or []:
            chain("tas/08", "Module 08 gaps", str(g.get("gap_id") or ""), str(g.get("unresolved_question") or ""),
                  "GAP", "neutral", [])
    elif module == "hypothesis_test":
        for h in payload.get("hypothesis_matrix") or []:
            viable = bool(h.get("viable"))
            refs = _refs(h.get("supporting_evidence"), h.get("contradicting_evidence"), h.get("ambiguous_evidence"))
            chain("tas/06", "Module 06; Standard §11", str(h.get("hypothesis_id") or ""), str(h.get("hypothesis") or ""),
                  "VIABLE" if viable else "NOT_VIABLE", "partial" if viable else "bad", refs)
        for f in payload.get("contradiction_log") or []:
            refs = _refs((f.get("statement_a") or {}).get("evidence"), (f.get("statement_b") or {}).get("evidence"))
            open_ = f.get("resolution") in (None, "", "null")
            chain("tas/06", "Module 06; Standard §12", str(f.get("conflict_id") or ""),
                  str((f.get("statement_a") or {}).get("statement") or "") + " / " + str((f.get("statement_b") or {}).get("statement") or ""),
                  "OPEN" if open_ else "RESOLVED", "partial" if open_ else "good", refs)
    return tally


def _suite_verdict(module: SuiteModule, item: dict) -> tuple[str, str]:
    """The verdict and status one part of a suite answer shows in the run record, read from the record's own values;
    a support system's part is never good or bad, since it judges nothing (AGENTS.md [AG-067])."""
    if module.system == "las":
        # Only a deductive line judged VALID holds if its premises are true; an inductive or abductive line carries a
        # strength, which the record shows as the model gave it, never as a verdict it did not give.
        lines = [line for line in item.get("argument_lines") or [] if isinstance(line, dict)]
        if item.get("formal_fallacy") or any(line.get("validity_verdict") == "INVALID" for line in lines):
            return "INVALID", "bad"
        if not lines:
            return "NO_LINES", "neutral"
        if all(line.get("validity_verdict") == "VALID" for line in lines):
            return "VALID", "good"
        if any(line.get("validity_verdict") == "NOT_CLEANLY_FORMALIZABLE" for line in lines):
            return "NOT_CLEANLY_FORMALIZABLE", "neutral"
        kinds = sorted({str(line.get("inferential_type") or "") for line in lines if line.get("inferential_type") != "DEDUCTIVE"})
        return ("_".join(k for k in kinds if k) or "NOT_DEDUCTIVE"), "partial"
    if module.system == "ras":
        return str(item.get("corroboration_verdict") or "UNKNOWN"), "good" if item.get("corroboration_verdict") == "CORROBORATED" else "partial"
    field = {"evidence_plan": "route", "ehs_harm_minimisation": "decision", "das_options": "option_type",
             "quant_framing": "category"}.get(module.key)
    if module.key == "ehs_public_interest":
        return ("NEEDED" if item.get("needed_by_public_interest") else "NOT_NEEDED"), "neutral"
    return str(item.get(field) or "RECORDED") if field else "RECORDED", "neutral" if module.is_support else "partial"


def record_suite_thoughts(rec: RunRecorder, module: SuiteModule, payload: dict, known: set[tuple[str, str]],
                          parent: int | None) -> dict[str, int]:
    """One chain per part of a suite answer that a person decides one by one (SuiteModule.items): what the model
    says (self-reported), then the app's check of the records it cites."""
    tally = {s: 0 for s in STATUSES}
    if module.items is None:
        return tally
    list_path, id_field, text_field, ref_fields = module.items
    for _where, item in walk(payload, list_path + "[]"):
        thought_id = str(item.get(id_field) or "")
        refs = _refs(*(item.get(key) for key in ref_fields))
        verdict, status = _suite_verdict(module, item)
        said = rec.emit("RULE", module.node, system=module.system, rule=f"{module.system.upper()} {module.title}",
                        verdict=verdict, status=status, text=str(item.get(text_field) or "")[:2000], refs=refs,
                        parent=parent, self_reported=True, detail={"thought": thought_id})
        last = status
        if refs:
            missing = _in_packet(refs, known)
            last = "bad" if missing else status
            rec.emit("CHECK", "gate:citation", status="bad" if missing else "good", verdict="FAIL" if missing else "PASS",
                     text=(f"{len(missing)} of {len(refs)} cited records are not in the packet" if missing
                           else f"All {len(refs)} cited records are in the packet"),
                     refs=refs, parent=said, detail={"thought": thought_id})
        tally[last] += 1
    return tally


def run_events(db: Session, investigation_id: str, run_id: str, after: int = 0) -> list[AIRunEvent]:
    return list(db.scalars(select(AIRunEvent).where(
        AIRunEvent.investigation_id == investigation_id, AIRunEvent.run_id == run_id, AIRunEvent.n > after,
    ).order_by(AIRunEvent.n)).all())


def serialize_event(e: AIRunEvent) -> dict:
    return {"n": e.n, "at": e.at, "kind": e.kind, "node": e.node, "system": e.system, "rule": e.rule, "status": e.status,
            "verdict": e.verdict, "text": e.text, "refs": e.refs or [], "parent": e.parent, "self_reported": e.self_reported,
            "detail": e.detail}
