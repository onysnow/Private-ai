"""What crosses from one run's accepted answer into the next system's run (vendored INTEROP.md).

INTEROP §0: a value that cannot cross a boundary under the file's rules is not converted, approximated, defaulted or
dropped silently; it blocks, and the block names the field, both systems and the value. Here a blocked value is
held back from the next run's prompt and listed, field by field, in the hand-over itself, so the run record shows
what was withheld and under which rule. Nothing the person rejected crosses; what they corrected crosses in their
words.

INTEROP defines rows for TAS Module 02 verdicts into LAS (§3), tiers (§1) and confidence (§2). It has no row for a
TAS classification, a TAS Gap's record_existence or a TAS right-of-reply list, so none of those is mapped onto the
receiving system's fields; where the receiving system needs the substance (a gap's question, a subject's name) the
substance crosses and the TAS value stays behind.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

IN_0 = "INTEROP.md §0 [IN-003]: no rule carries this value across, so it blocks rather than being converted"
IN_12 = "INTEROP.md §2 [IN-012]: LOW|MEDIUM|HIGH is a local value and never crosses a boundary"

HELD = {
    ("tas", "las", "classification"): "INTEROP.md §3 maps TAS Module 02 verdicts into LAS statuses, not TAS "
                                      "classifications; " + IN_0,
    ("tas", "las", "confidence_term"): "LAS's confidence term grades its own verdict on the structure, never how "
                                       "likely the conclusion is (LAS CALIBRATED_CONFIDENCE_LANGUAGE.md Rule 4); "
                                       + IN_0,
    ("tas", "egs", "record_existence"): "EGS re-derives existence with its basis (Module 01 rule 4); INTEROP.md has "
                                        "no row between the two, so the Workbench compares them after the run "
                                        "instead of handing one over",
    ("tas", "egs", "classification"): "a TAS classification is not an EGS status (INTEROP.md [IN-079]); " + IN_0,
    ("tas", "egs", "assessment"): "a TAS judgement that EGS does not weigh (AGENTS.md [AG-067])",
    ("tas", "egs", "viable"): "a TAS judgement that EGS does not weigh (AGENTS.md [AG-067])",
    ("tas", "ehs", "classification"): "EHS regrades no finding of the authority systems (AGENTS.md [AG-067]); "
                                      + IN_0,
    ("tas", "ehs", "confidence_term"): "EHS records carry no confidence field (EHS CALIBRATED_CONFIDENCE_LANGUAGE.md)",
    ("tas", "qas", "kind"): "a TAS hypothesis kind is never mapped onto a QAS rival category (INTEROP.md [IN-079]); "
                            "QAS assigns its own",
    ("tas", "qas", "viable"): "a TAS judgement; QAS sets its rivals afresh from the data ([IN-071])",
    ("tas", "qas", "assessment"): "a TAS judgement; QAS sets its rivals afresh from the data ([IN-071])",
}


def _review(source: Any) -> dict:
    return dict(getattr(source, "claim_reviews", None) or {})


def _hold(held: dict[str, dict], frm: str, to: str, name: str, record_id: str, value: Any) -> None:
    if value in (None, "", []):
        return
    rule = IN_12 if name == "confidence" else HELD.get((frm, to, name), IN_0)
    entry = held.setdefault(name, {"field": name, "from": frm.upper(), "to": to.upper(), "rule": rule, "values": []})
    entry["values"].append({"record_id": record_id, "value": value})


def _decided(items: list[Any], id_field: str, text_field: str, reviews: dict) -> tuple[list[dict], list[dict]]:
    """The items a person kept, corrected or left undecided, the corrected ones in their words; and the ones they
    rejected, which never cross."""
    kept: list[dict] = []
    left_out: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        rid = str(item.get(id_field) or "")
        review = reviews.get(rid) or {}
        if review.get("decision") == "reject":
            left_out.append({"record_id": rid, "reason": f"you rejected it: {review.get('reason') or ''}".strip(": ")})
            continue
        item = dict(item)
        if review.get("decision") == "correct" and review.get("text"):
            item["model_wording"] = item.get(text_field)
            item[text_field] = review["text"]
            item["corrected_by_you"] = True
        kept.append(item)
    return kept, left_out


def _tas_claims(payload: dict, reviews: dict, to: str, held: dict[str, dict]) -> tuple[list[dict], list[dict]]:
    claims, left_out = _decided(payload.get("claims") or [], "claim_id", "claim", reviews)
    out = []
    for c in claims:
        cid = str(c.get("claim_id"))
        for name in ("classification", "confidence", "confidence_term"):
            _hold(held, "tas", to, name, cid, c.get(name))
        out.append({k: c[k] for k in ("claim_id", "claim", "model_wording", "corrected_by_you", "warrant",
                                      "assumptions", "supporting_evidence", "contradicting_evidence", "limitations")
                    if k in c})
    return out, left_out


def _case_synthesis_to_las(payload: dict, reviews: dict, held: dict[str, dict]) -> dict:
    claims, left_out = _tas_claims(payload, reviews, "las", held)
    return {"records": claims, "left_out": left_out, "ids": [c["claim_id"] for c in claims]}


def _case_synthesis_to_egs(payload: dict, reviews: dict, held: dict[str, dict]) -> dict:
    claims, left_out = _tas_claims(payload, reviews, "egs", held)
    gaps = []
    existence: dict[str, str] = {}
    for g in payload.get("investigative_gaps") or []:
        if not isinstance(g, dict):
            continue
        gid = str(g.get("gap_id") or "")
        if g.get("record_existence"):
            existence[gid] = str(g["record_existence"])
        _hold(held, "tas", "egs", "record_existence", gid, g.get("record_existence"))
        gaps.append({k: g[k] for k in ("gap_id", "unresolved_question", "bears_on", "why_material",
                                       "needed_record_or_testimony", "could_confirm_or_refute") if k in g})
    records = [{"kind": "gap", **g} for g in gaps] + [{"kind": "claim", "claim_id": c["claim_id"], "claim": c["claim"]}
                                                      for c in claims]
    return {"records": records, "left_out": left_out,
            "ids": [g["gap_id"] for g in gaps if g.get("gap_id")] + [c["claim_id"] for c in claims],
            "existence": existence}


def _hypotheses(payload: dict, reviews: dict, to: str, held: dict[str, dict]) -> tuple[list[dict], list[dict]]:
    hyps, left_out = _decided(payload.get("hypothesis_matrix") or [], "hypothesis_id", "hypothesis", reviews)
    out = []
    for h in hyps:
        hid = str(h.get("hypothesis_id"))
        for name in ("kind", "viable", "assessment"):
            if (h.get(name) is not None) and ("tas", to, name) in HELD:
                _hold(held, "tas", to, name, hid, h.get(name))
        out.append({k: h[k] for k in ("hypothesis_id", "hypothesis", "model_wording", "corrected_by_you",
                                      "supporting_evidence", "contradicting_evidence", "falsifiers", "missing_records",
                                      "assumptions") if k in h})
    return out, left_out


def _hypothesis_test_to_egs(payload: dict, reviews: dict, held: dict[str, dict]) -> dict:
    hyps, left_out = _hypotheses(payload, reviews, "egs", held)
    return {"records": [{"kind": "hypothesis", **h} for h in hyps], "left_out": left_out,
            "ids": [h["hypothesis_id"] for h in hyps]}


def _hypothesis_test_to_qas(payload: dict, reviews: dict, held: dict[str, dict]) -> dict:
    hyps, left_out = _hypotheses(payload, reviews, "qas", held)
    return {"records": hyps, "left_out": left_out, "ids": [h["hypothesis_id"] for h in hyps],
            "note": "Each hypothesis keeps the standing TAS gave it; QAS sets its own rivals and computing from the "
                    "data never raises a TAS status ([IN-080])"}


def _case_synthesis_to_ehs(payload: dict, reviews: dict, held: dict[str, dict]) -> dict:
    claims, left_out = _tas_claims(payload, reviews, "ehs", held)
    kept = {c["claim_id"] for c in claims}
    subjects = []
    for r in payload.get("right_of_reply_needed") or []:
        if isinstance(r, dict) and r.get("subject"):
            # Only the name and the claims that survived your review cross: TAS's own summary of what would be said
            # was written before your review and could carry a claim you rejected or corrected.
            subjects.append({"kind": "subject", "subject": r["subject"],
                             "claim_ids": [cid for cid in r.get("claim_ids") or [] if cid in kept]})
    records = subjects + [{"kind": "claim", "claim_id": c["claim_id"], "claim": c["claim"],
                           "supporting_evidence": c.get("supporting_evidence") or []} for c in claims]
    return {"records": records, "left_out": left_out, "ids": sorted(kept),
            "note": "The subjects are TAS's list of who needs a right of reply, not a reply record: nothing here "
                    "means a reply was offered"}


def _same_system(list_key: str | None, id_field: str) -> Callable[[dict, dict, dict], dict]:
    def translate(payload: dict, reviews: dict, held: dict[str, dict]) -> dict:
        if list_key is None:
            return {"records": [payload], "left_out": [], "ids": [str(payload.get(id_field) or "")]}
        items, left_out = _decided(payload.get(list_key) or [], id_field, "harm", reviews)
        return {"records": items, "left_out": left_out, "ids": [str(i.get(id_field)) for i in items]}
    return translate


TRANSLATORS: dict[tuple[str, str], Callable[[dict, dict, dict], dict]] = {
    ("case_synthesis", "las_argument_check"): _case_synthesis_to_las,
    ("case_synthesis", "evidence_plan"): _case_synthesis_to_egs,
    ("hypothesis_test", "evidence_plan"): _hypothesis_test_to_egs,
    ("hypothesis_test", "quant_framing"): _hypothesis_test_to_qas,
    ("case_synthesis", "ehs_harm_minimisation"): _case_synthesis_to_ehs,
    ("ehs_harm_minimisation", "ehs_public_interest"): _same_system("harm_assessments", "harm_id"),
    ("das_framing", "das_options"): _same_system(None, "decision_id"),
}

SYSTEM_OF = {"case_synthesis": "tas", "hypothesis_test": "tas"}


def hand_over(source: Any, to_module: str, to_system: str) -> dict:
    """The hand-over from an accepted answer (an AIAnalysisCandidate) into a run of `to_module`. `held` lists every
    value that stayed behind, with its rule; `ids` are the record ids the next answer may name upstream."""
    translate = TRANSLATORS.get((source.module, to_module))
    if translate is None:
        raise KeyError(f"{to_module} does not start from {source.module}")
    held: dict[str, dict] = {}
    out = translate(dict(source.payload or {}), _review(source), held)
    from_system = SYSTEM_OF.get(source.module, to_system)
    return {
        "from": {"candidate_id": source.id, "module": source.module, "system": from_system.upper()},
        "to": {"module": to_module, "system": to_system.upper()},
        "accepted_by_a_person": True,
        **out,
        "held": list(held.values()),
    }


def prompt_view(handoff: dict) -> dict:
    """What the model sees of a hand-over: the records and what was withheld, by field name only (the values held back
    are not shown to it, so it cannot reconstruct them)."""
    return {
        "from": handoff["from"], "records": handoff["records"],
        "left_out_by_you": [x["record_id"] for x in handoff.get("left_out") or []],
        "withheld_fields": [{"field": h["field"], "rule": h["rule"]} for h in handoff.get("held") or []],
        **({"note": handoff["note"]} if handoff.get("note") else {}),
    }
