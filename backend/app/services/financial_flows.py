"""Financial-flow ledger built from canonical FtM Payment relationships.

Columns follow the TAS Financial Flow Analysis module's transaction ledger as
already mirrored by the frontend's ``FinancialFlowTransaction`` type
(frontend/lib/financial-flow-types.ts): id, date/time, from, to, amount,
currency, stated purpose, evidence, status, and whether the flow is direct or
inferred.

Rules this module keeps (read-only; nothing is created or changed):

* Only canonical ``Payment`` relationship edges are read, in the same reviewed
  duplicate view as the graph: a duplicate the reporter reviewed as the same
  transfer is shown once (its preferred record), so it is never counted twice.
  Edges the reporter has not reviewed as duplicates are each listed, even when
  date and amount match.
* Nothing is guessed. A payment without a parseable amount, without a
  currency, or with more than one amount/currency value is listed under
  ``incomplete`` with the reason, and left out of ``transactions`` (the chart
  input). Amounts are never converted or summed across currencies here.
* ``certainty`` is the status grammar the views draw (research §2.8): ``shown``
  when reviewed evidence supports the payment, ``disputed`` when a claim it
  rests on is challenged or reviewed evidence contradicts it (the rule the
  network uses for a contested link), otherwise ``not_yet_shown``.
* ``flow_type`` is ``direct`` only when at least one attached evidence record's
  latest reporter review is ``supports``; otherwise ``inferred``. The rule is
  returned with the ledger (``flow_type_rule``) so the UI can state it.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.services.relationships import investigation_relationships

FLOW_TYPE_RULE = (
    "direct = at least one attached evidence record whose latest reporter review is 'supports'; "
    "inferred = no such evidence (none attached, not yet reviewed, or reviewed as context/contradicts/"
    "superseded/unresolved)."
)


def _single(values: Any) -> tuple[str | None, str | None]:
    """Return (value, problem) for an FtM property value list."""
    if not values:
        return None, "missing"
    cleaned = sorted({str(v).strip() for v in values if str(v).strip()})
    if not cleaned:
        return None, "missing"
    if len(cleaned) > 1:
        return None, "multiple values: " + ", ".join(cleaned)
    return cleaned[0], None


def _endpoint_labels(rows: list[dict]) -> dict[str, str]:
    """Label each endpoint by caption, disambiguating different entities that share one."""
    by_caption: dict[str, set[str]] = {}
    info: dict[str, dict] = {}
    for row in rows:
        for side in ("source", "target"):
            ent = row.get(side)
            if ent:
                by_caption.setdefault(ent["caption"], set()).add(ent["id"])
                info[ent["id"]] = ent
    labels: dict[str, str] = {}
    for eid, ent in info.items():
        if len(by_caption[ent["caption"]]) > 1:
            labels[eid] = f"{ent['caption']} ({ent['schema']} {eid[:8]})"
        else:
            labels[eid] = ent["caption"]
    return labels


def investigation_financial_ledger(db: Session, investigation_id: str) -> dict[str, Any]:
    rows = investigation_relationships(db, investigation_id, {"Payment"}, include_reconciled_duplicates=False)
    labels = _endpoint_labels(rows)
    transactions: list[dict[str, Any]] = []
    incomplete: list[dict[str, Any]] = []
    for row in rows:
        props = row.get("properties") or {}
        source, target = row.get("source"), row.get("target")
        problems: list[str] = []
        amount_raw, amount_problem = _single(props.get("amount"))
        amount: float | None = None
        if amount_problem:
            problems.append(f"amount {amount_problem}")
        else:
            try:
                amount = float(str(amount_raw).replace(",", ""))
            except ValueError:
                problems.append(f"amount not a number: {amount_raw}")
        currency, currency_problem = _single(props.get("currency"))
        if currency_problem:
            problems.append(f"currency {currency_problem}")
        date, date_problem = _single(props.get("date") or props.get("startDate"))
        if date_problem and date_problem != "missing":
            problems.append(f"date {date_problem}")
        # A payment made over a span (FtM startDate to endDate) keeps its end. More than one end
        # date gives none; nothing is guessed.
        date_end, _ = _single(props.get("endDate"))
        if source is None or target is None:
            problems.append("payer or beneficiary entity missing")

        attachments = (row.get("provenance") or {}).get("evidence_attachments") or []
        supporting = [a for a in attachments if (a.get("latest_review") or {}).get("stance") == "supports"]
        contradicted = any((a.get("latest_review") or {}).get("stance") == "contradicts" for a in attachments)
        evidence_bits = []
        for att in attachments:
            ev = att.get("evidence") or {}
            stance = (att.get("latest_review") or {}).get("stance") or "unreviewed"
            where = ev.get("locator") or (ev.get("source") or {}).get("title") or ev.get("id") or "evidence"
            evidence_bits.append(f"{where} [{stance}]")
        purpose, _ = _single(props.get("purpose"))
        advisory = row.get("advisory") or {}
        record = {
            "id": row["id"],
            "relationship_id": row["id"],
            "dateTime": date,
            "dateEnd": date_end if date_end != date else None,
            "from": labels.get(source["id"], source["caption"]) if source else None,
            "to": labels.get(target["id"], target["caption"]) if target else None,
            "from_entity_id": source["id"] if source else None,
            "to_entity_id": target["id"] if target else None,
            "amount": amount,
            "currency": currency.upper() if currency else None,
            "statedPurpose": purpose,
            "transactionNumber": _single(props.get("transactionNumber"))[0],
            "evidence": "; ".join(evidence_bits) if evidence_bits else None,
            "evidence_count": len(attachments),
            "supporting_evidence_count": len(supporting),
            "status": advisory.get("support_state"),
            "flowType": "direct" if supporting else "inferred",
            "certainty": ("disputed" if advisory.get("support_state") == "challenged_support" or contradicted
                          else "shown" if supporting else "not_yet_shown"),
            "locator": next(((a.get("evidence") or {}).get("locator") for a in supporting + attachments if (a.get("evidence") or {}).get("locator")), None),
        }
        if problems:
            incomplete.append({**record, "problems": problems})
        else:
            transactions.append(record)
    transactions.sort(key=lambda t: (t["dateTime"] or "", t["id"]))
    return {
        "investigation_id": investigation_id,
        "transactions": transactions,
        "incomplete": incomplete,
        "currencies": sorted({t["currency"] for t in transactions}),
        "flow_type_rule": FLOW_TYPE_RULE,
        "duplicate_rule": "Reviewed duplicate payments are shown once (the reporter-preferred record); unreviewed look-alikes are listed separately.",
    }
