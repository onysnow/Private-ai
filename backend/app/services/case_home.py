"""Case home (Workbench-redesign-2026.pdf, "The case home"; FEATURE_HOME §1, §7;
FEATURE_CHECK §2, §3.1): what the case dashboard and the Decide screen read.

- ``standing``: the seven standing numbers, counted on the server (the old frame
  fired nine list requests and counted in the browser).
- ``decisions``: one list of everything only a person can decide, read from the
  tables each kind already lives in, each item the same five-part card:
  question, proposal (with who proposed it), evidence, choices, what happens.
  Choices name the existing endpoint they post to, so deciding never goes
  through a second code path. Ordered by consequence, not by where it came from.
- ``since``: what changed after a moment, from the timestamps the records
  already carry, naming who did it (a person, the app, the AI, an outside source).

Nothing here writes."""

from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any, Callable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.domain import (
    AIAnalysisCandidate, CheckItem, Claim, ClaimReviewEvent, ConnectorFinding, CrossReferenceProposal, Document,
    DocumentChunk, Entity, Evidence, ExtractionCandidate, Investigation, Lead, PatternFlag, RelationshipEdge, Source,
    TimelineEvent, WatchlistEntry, WatchlistHit,
)
from app.services.relationships import RELATIONSHIP_SCHEMAS, investigation_relationships

LEVEL_RANK = {"textbook": 3, "strong": 2, "faint": 1}
CLAIM_SURE = {"supported": "supported", "confirmed": "supported", "disputed": "disputed", "rejected": "ruled_out",
              "lead": "unshown", "unverified": "unshown"}
OPEN_LEAD = {"unreviewed", "active", "blocked"}
UNREAD = {"queued", "pending", "extracting"}
DECISION_KINDS = ("to_check", "missing", "proposal", "match", "outside", "ai", "watchlist")


def _count(db: Session, stmt: Any) -> int:
    return int(db.scalar(stmt) or 0)


# --- Standing numbers --------------------------------------------------------------------------------------------

def standing(db: Session, investigation_id: str) -> dict[str, Any]:
    from app.services.financial_flows import investigation_financial_ledger

    inv = investigation_id
    claims = Counter(CLAIM_SURE.get(s, "unshown") for s in db.scalars(select(Claim.status).where(Claim.investigation_id == inv)))
    documents = list(db.execute(select(Document.extraction_status).where(Document.investigation_id == inv, Document.parent_document_id.is_(None))))
    years: Counter[str] = Counter()
    for (start,) in db.execute(select(TimelineEvent.date_start).where(TimelineEvent.investigation_id == inv)):
        if start and start[:4].isdigit():
            years[start[:4]] += 1
    flags = list(db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == inv, PatternFlag.status == "open",
                                                      PatternFlag.gone_at.is_(None))))
    from app.services.case_years import flag_years, link_years
    by_link = link_years(db, inv)
    flag_year_counts: Counter[str] = Counter(str(y) for f in flags for y in flag_years(f, by_link))
    ledger = investigation_financial_ledger(db, inv)
    # Money traced counts each sum once, where it starts: a payment whose payer
    # received nothing in the case. Adding every hop would count layered money
    # again at each layer (on the 1MDB case, $12.4B for about $4.6B moved).
    paid_to = {t["to_entity_id"] for t in ledger["transactions"]}
    by_currency: dict[str, list[float]] = {}
    all_payments: dict[str, int] = {}
    for t in ledger["transactions"]:
        all_payments[t["currency"]] = all_payments.get(t["currency"], 0) + 1
        if t["from_entity_id"] not in paid_to:
            by_currency.setdefault(t["currency"], []).append(float(t["amount"]))
    currency = max(by_currency, key=lambda c: len(by_currency[c])) if by_currency else None
    waiting = decision_counts(db, inv)
    return {
        "investigation_id": inv,
        "claims": {"total": sum(claims.values()), "supported": claims["supported"], "disputed": claims["disputed"],
                   "unshown": claims["unshown"], "ruled_out": claims["ruled_out"]},
        "to_check": waiting.get("to_check", 0),
        "missing": waiting.get("missing", 0),
        "to_decide": sum(waiting.values()),
        "to_decide_by_kind": waiting,
        "money": {"currency": currency, "amount": round(sum(by_currency[currency]), 2) if currency else 0.0,
                  "payments": all_payments.get(currency, 0) if currency else 0,
                  "from_sources": len(by_currency[currency]) if currency else 0,
                  "other_currencies": sorted(c for c in by_currency if c != currency)},
        "timeline": {"events": sum(years.values()), "from": min(years) if years else None, "to": max(years) if years else None,
                     "years": [{"year": y, "events": years.get(y, 0), "flags": flag_year_counts.get(y, 0)}
                               for y in sorted(set(years) | set(flag_year_counts))]},
        "documents": {"total": len(documents), "unread": sum(1 for (s,) in documents if s in UNREAD),
                      "failed": sum(1 for (s,) in documents if s == "failed")},
        "sources": _count(db, select(func.count()).select_from(Source).where(Source.investigation_id == inv)),
        "evidence": _count(db, select(func.count()).select_from(Evidence).join(Source, Evidence.source_id == Source.id)
                           .where(Source.investigation_id == inv)),
        "network": {"parties": _count(db, select(func.count()).select_from(Entity).where(Entity.investigation_id == inv,
                                                                                         Entity.merged_into_entity_id.is_(None))),
                    "links": _count(db, select(func.count()).select_from(RelationshipEdge).where(RelationshipEdge.investigation_id == inv))},
        "flags": {"open": len(flags), "textbook": sum(f.level == "textbook" for f in flags),
                  "strong": sum(f.level == "strong" for f in flags), "faint": sum(f.level == "faint" for f in flags)},
        "leads": {"open": _count(db, select(func.count()).select_from(Lead).where(Lead.investigation_id == inv, Lead.status.in_(OPEN_LEAD)))},
        "watchlist": {"names": _count(db, select(func.count()).select_from(WatchlistEntry).where(WatchlistEntry.investigation_id == inv)),
                      "new_hits": waiting.get("watchlist", 0)},
    }


# --- Decisions ---------------------------------------------------------------------------------------------------

def decision_counts(db: Session, inv: str) -> dict[str, int]:
    counts = {
        "to_check": _count(db, select(func.count()).select_from(CheckItem).where(
            CheckItem.investigation_id == inv, CheckItem.status == "open", CheckItem.gone_at.is_(None), CheckItem.kind != "missing")),
        "missing": _count(db, select(func.count()).select_from(CheckItem).where(
            CheckItem.investigation_id == inv, CheckItem.status == "open", CheckItem.gone_at.is_(None), CheckItem.kind == "missing")),
        "proposal": _count(db, select(func.count()).select_from(ExtractionCandidate).where(
            ExtractionCandidate.investigation_id == inv, ExtractionCandidate.review_status == "proposed")),
        "match": _count(db, select(func.count()).select_from(CrossReferenceProposal).where(
            CrossReferenceProposal.investigation_id == inv, CrossReferenceProposal.status == "open")),
        "outside": _count(db, select(func.count()).select_from(ConnectorFinding).where(
            ConnectorFinding.investigation_id == inv, ConnectorFinding.review_status == "unreviewed")),
        "ai": _count(db, select(func.count()).select_from(AIAnalysisCandidate).where(
            AIAnalysisCandidate.investigation_id == inv, AIAnalysisCandidate.review_status == "proposed")),
        "watchlist": _count(db, select(func.count()).select_from(WatchlistHit).where(
            WatchlistHit.investigation_id == inv, WatchlistHit.status == "new")),
    }
    return {k: v for k, v in counts.items() if v}


def _choice(key: str, label: str, path: str, body: dict[str, Any]) -> dict[str, Any]:
    return {"key": key, "label": label, "method": "POST", "path": path, "body": body}


def _names(db: Session, ids: set[str]) -> dict[str, tuple[str, str]]:
    if not ids:
        return {}
    return {e.id: (e.caption or e.id, e.schema) for e in db.scalars(select(Entity).where(Entity.id.in_(ids)))}


def _parties(ids: list[str], names: dict[str, tuple[str, str]]) -> list[dict[str, str]]:
    return [{"id": p, "name": names.get(p, (p, ""))[0], "schema": names.get(p, ("", "Thing"))[1]} for p in ids]


def _with_parties(question: str, ids: list[str], names: dict[str, tuple[str, str]]) -> str:
    """A checklist question names the parties it is about: one flag kind fires on
    several groups, and without names their items read the same. Found on the
    1MDB case: three "Was there a business reason for the payments?" items, one
    per group of companies."""
    who = [names[p][0] for p in ids if p in names][:3]
    if not who or not question.endswith("?"):
        return question
    more = len([p for p in ids if p in names]) - len(who)
    listed = ", ".join(who[:-1]) + f" and {who[-1]}" if len(who) > 1 else who[0]
    return f"{question[:-1]} ({listed}{f' and {more} more' if more > 0 else ''})?"


def _check_items(db: Session, inv: str) -> list[dict[str, Any]]:
    from app.patterns.checks import as_question
    from app.patterns.engine import _name

    rows = list(db.scalars(select(CheckItem).where(CheckItem.investigation_id == inv, CheckItem.status == "open",
                                                   CheckItem.gone_at.is_(None), CheckItem.kind != "missing")))
    if not rows:
        return []
    flags = {f.id: f for f in db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == inv, PatternFlag.gone_at.is_(None)))}
    names = _names(db, {p for r in rows for p in r.parties})
    docs = {d.id: d.filename for d in db.scalars(select(Document).where(Document.id.in_({r.document_id for r in rows if r.document_id})))}
    out = []
    for r in rows:
        flag = flags.get(r.flag_id) if r.flag_id else None
        level = flag.level if flag else None
        indicator = _name(r.indicator_id)
        reason = f"From the {level.capitalize()} Red Flag {indicator}" if level else f"Asked by the indicator {indicator}"
        evidence = None
        if r.document_id:
            evidence = {"document_id": r.document_id, "filename": docs.get(r.document_id, r.document_id), "locator": r.locator,
                        "excerpt": r.excerpt, "terms": list(r.terms or [])}
        path = f"/api/checks/{r.id}/decide"
        out.append({
            "kind": "to_check", "id": r.id, "question": _with_parties(as_question(r.question), list(r.parties), names) if r.kind == "checklist" else r.question,
            "actor": "Red Flags", "actor_kind": "app",
            "created_at": r.first_seen_at, "rank": 100 * LEVEL_RANK.get(level or "", 0) + (20 if r.kind == "passage" else 10),
            "reason": reason, "level": level,
            "group": {"key": f"doc:{r.document_id}" if r.document_id else f"flag:{r.flag_id or r.indicator_id}",
                      "label": docs.get(r.document_id, "") if r.document_id else indicator},
            "evidence": evidence, "parties": _parties(list(r.parties), names),
            "proposal": f"{indicator}: {'a passage that may show it' if r.kind == 'passage' else 'a part the records cannot show'}",
            "consequences": [f"Your answer is kept on the Red Flag {indicator} as what a person found; the flag's level comes from the records and does not change."
                             if flag else "Your answer is kept with this item."],
            "choices": [_choice("yes", "Shows it", path, {"status": "shows"}), _choice("no", "Does not", path, {"status": "does_not"}),
                        _choice("unsure", "Unclear", path, {"status": "unclear"})],
            "open": {"href": "/check#to-check", "label": "Open To check"},
        })
    return out


MISSING_OPEN = {"entity": "/bring-in#connectors", "relationship": "/see#relationship-graph", "evidence": "/bring-in#source-capture",
                "source": "/bring-in#source-capture", "claim": "/check#claim-verification", "event": "/see#timeline"}


def _missing(db: Session, inv: str) -> list[dict[str, Any]]:
    from app.patterns.missing import RULE_RANK, rule_name

    rows = list(db.scalars(select(CheckItem).where(CheckItem.investigation_id == inv, CheckItem.status == "open",
                                                   CheckItem.gone_at.is_(None), CheckItem.kind == "missing")))
    names = _names(db, {p for r in rows for p in r.parties})
    out = []
    for r in rows:
        path = f"/api/checks/{r.id}/decide"
        out.append({
            "kind": "missing", "id": r.id, "question": r.question, "actor": "Missing values", "actor_kind": "app",
            "created_at": r.first_seen_at, "rank": RULE_RANK.get(r.indicator_id, 10),
            "reason": f"Missing: {rule_name(r.indicator_id).lower()} on {r.excerpt}", "level": None,
            "group": {"key": f"missing:{r.indicator_id}", "label": rule_name(r.indicator_id)}, "evidence": None,
            "parties": _parties(list(r.parties), names), "proposal": f"{rule_name(r.indicator_id)} · {r.excerpt}",
            "consequences": [f"While it is missing: {r.blocks}", "Filling in the value removes this by itself."],
            "choices": [_choice("yes", "Chase it", path, {"status": "chasing"}), _choice("no", "Can't be known", path, {"status": "unknowable"}),
                        _choice("unsure", "Doesn't apply", path, {"status": "not_needed"})],
            "open": {"href": MISSING_OPEN.get(r.record_type or "", "/check"), "label": "Fill it in"},
        })
    return out


PROPOSAL_RANK = {"claim": 60, "relationship": 55, "entity": 50, "evidence": 45, "identifier": 40}


def mentioned(payload: dict[str, Any]) -> str:
    """How often a proposal's name or sentence comes up in its document: " ·
    mentioned 146 times on 120 pages". Empty for a single mention."""
    count = int(payload.get("mention_count") or 1)
    if count < 2:
        return ""
    places = {str(m.get("locator")) for m in payload.get("mentions") or [] if isinstance(m, dict)}
    more = "+" if len(payload.get("mentions") or []) < count else ""
    return f" · mentioned {count} times on {len(places)}{more} {'page' if len(places) == 1 else 'pages'}"


def around(text: str, start: int, end: int, before: int = 160, after: int = 260) -> str:
    """The passage around what a proposal was taken from (its span in the page),
    cut at word boundaries and marked with … where it was cut. Found on the 1MDB
    case: cards showed the first 400 characters of the page, the court caption,
    not the sentence the claim came from."""
    if not text:
        return ""
    start, end = max(0, min(start, len(text))), max(0, min(max(end, start), len(text)))
    lo, hi = max(0, start - before), min(len(text), end + after)
    if lo > 0:
        space = text.find(" ", lo)
        lo = space + 1 if 0 <= space < start else lo
    if hi < len(text):
        space = text.rfind(" ", end, hi)
        hi = space if space > end else hi
    return f"{'… ' if lo > 0 else ''}{text[lo:hi].strip()}{' …' if hi < len(text) else ''}"


# --- table rows (a proposal made by a table mapping, app/services/table_mappings.py) ---------------------------------

TABLE_ROWS_SHOWN = 20
CURRENCY_SIGN = {"USD": "$", "EUR": "€", "GBP": "£"}
MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")


def _rows_phrase(numbers: list[int]) -> str:
    """"row 3", "rows 3 and 4", "rows 3, 4 and 5"; past six rows only the count."""
    if len(numbers) == 1:
        return f"row {numbers[0]}"
    if len(numbers) > 6:
        return f"{len(numbers)} rows"
    return "rows " + ", ".join(str(n) for n in numbers[:-1]) + f" and {numbers[-1]}"


def _amount_text(amount: str | None, currency: str | None) -> str | None:
    """"$65,000,000", "MYR 2,000,000"; the amount as written when it is not a number."""
    if not amount:
        return None
    try:
        value = float(amount.replace(",", ""))
        number = f"{value:,.0f}" if value.is_integer() else f"{value:,.2f}"
    except ValueError:
        number = amount
    code = (currency or "").upper()
    if code in CURRENCY_SIGN:
        return f"{CURRENCY_SIGN[code]}{number}"
    return f"{code} {number}" if code else number


def _date_text(value: str | None) -> str | None:
    """An ISO date as people write it: "23 May 2011", "May 2011", "2011". Only
    the parts the date has; nothing is filled in."""
    if not value:
        return None
    parts = value[:10].split("-")
    try:
        if len(parts) == 3:
            return f"{int(parts[2])} {MONTHS[int(parts[1]) - 1]} {parts[0]}"
        if len(parts) == 2:
            return f"{MONTHS[int(parts[1]) - 1]} {parts[0]}"
    except (ValueError, IndexError):
        return value
    return parts[0]


def _first(props: dict[str, Any], *names: str) -> str | None:
    for name in names:
        for value in props.get(name) or []:
            if str(value).strip():
                return str(value).strip()
    return None


def _table_rows(p: dict[str, Any]) -> list[dict[str, Any]]:
    """The cells of the rows a table proposal came from. Older proposals kept
    only the joined text ("column: value; column: value", one line a row)."""
    kept = p.get("row_cells")
    if isinstance(kept, list):
        return [r for r in kept if isinstance(r, dict)][:TABLE_ROWS_SHOWN]
    numbers = [n for n in p.get("rows") or [] if isinstance(n, int)]
    out = []
    for number, line in zip(numbers, str(p.get("row_text") or "").split("\n")):
        cells = dict(part.partition(": ")[::2] for part in line.split("; ") if ": " in part)
        out.append({"number": number, "cells": cells})
    return out[:TABLE_ROWS_SHOWN]


def _link_facts(schema: str, source: str, target: str, props: dict[str, Any]) -> str:
    """What a table link says, in words: "a payment of $65,000,000 from 1MDB to
    Good Star Limited on 23 May 2011", "Jho Low as owner of Good Star Limited"."""
    if schema == "Payment":
        amount = _amount_text(_first(props, "amount"), _first(props, "currency"))
        start, end = _date_text(_first(props, "date", "startDate")), _date_text(_first(props, "endDate"))
        when = f" between {start} and {end}" if start and end and start != end else (f" on {start}" if start else "")
        return f"a payment{f' of {amount}' if amount else ''} from {source} to {target}{when}"
    info = RELATIONSHIP_SCHEMAS.get(schema)
    if info and schema != "UnknownLink":
        return f"{source} as {info['source_label'].lower()} of {target}"
    return f"a link between {source} and {target}"


def _known_payments(db: Session, inv: str, page: list[dict[str, Any]]) -> None:
    """Notes on each table payment card the payments the case already holds
    between the same payer and beneficiary (by name), so a row is not added
    twice or a total is seen beside its parts. Found on the 1MDB case: four
    2011 rows add up to the $330,000,000 from 1MDB to Good Star already held
    without a date. Run only for the items shown."""
    wanted = [i for i in page if "_payment_ends" in i]
    if not wanted:
        return
    held: dict[tuple[str, str], list[str]] = {}
    for row in investigation_relationships(db, inv, {"Payment"}, include_reconciled_duplicates=False):
        source, target = row.get("source"), row.get("target")
        if not source or not target:
            continue
        props = row.get("properties") or {}
        amount = _amount_text(_first(props, "amount"), _first(props, "currency")) or "no amount"
        when = _date_text(_first(props, "date", "startDate")) or "no date"
        key = (str(source["caption"]).casefold().strip(), str(target["caption"]).casefold().strip())
        held.setdefault(key, []).append(f"{amount} from {source['caption']} to {target['caption']}, {when}")
    for item in wanted:
        source, target = item["_payment_ends"]
        found = held.get((source.casefold().strip(), target.casefold().strip()), [])
        item["known"] = [f"Already in the case: {text}" for text in found[:3]]
        if len(found) > 3:
            item["known"].append(f"and {len(found) - 3} more payments between them")


def _entity_question(item: dict[str, Any], strong: dict[str, Any] | None) -> None:
    """A name proposal asks "add it?", or "same as this record?" when the case has a record of that name."""
    row: ExtractionCandidate = item["_entity_row"]
    p = row.payload if isinstance(row.payload, dict) else {}
    caption = str(p.get("caption") or "").strip()
    schema = str(p.get("suggested_schema") or "Thing")
    path = f"/api/extraction-candidates/{row.id}/review"
    numbers = [n for n in p.get("rows") or [] if isinstance(n, int)]
    where, source = (f"in {_rows_phrase(numbers)}", "these rows") if numbers else ("in this passage", "this passage")
    if strong:
        other = strong.get("caption") or strong.get("entity_id")
        item["question"] = f"Is “{caption}” {where} the record {other}?"
        item["consequences"] = [f"Same: {source} {'are' if numbers else 'is'} added to {other}; no new record.",
                                f"Different: “{caption}” becomes a new {schema}, kept apart from {other}."]
        base = {"decision": "accept", "entity_schema": schema, "matched_entity_id": strong.get("entity_id")}
        item["choices"] = [_choice("yes", "Same record", path, {**base, "entity_identity_decision": "same"}),
                           _choice("no", "A different one", path, {**base, "entity_identity_decision": "different"})]
    else:
        item["question"] = f"Add “{caption}” as a {schema}?"
        item["consequences"] = [f"Creates the record {caption} ({schema}) with {source} as its source."]
        item["choices"] = [_choice("yes", "Add it", path, {"decision": "accept", "entity_schema": schema}),
                           _choice("no", "Not a name", path, {"decision": "reject"})]


def _proposals(db: Session, inv: str) -> list[dict[str, Any]]:
    rows = list(db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.investigation_id == inv,
                                                             ExtractionCandidate.review_status == "proposed")
                           .order_by(ExtractionCandidate.document_id, ExtractionCandidate.created_at)))
    if not rows:
        return []
    docs = {d.id: d.filename for d in db.scalars(select(Document).where(Document.id.in_({r.document_id for r in rows})))}
    chunk_ids = {r.chunk_id for r in rows if r.chunk_id}
    chunks = {c.id: c for c in db.scalars(select(DocumentChunk).where(DocumentChunk.id.in_(chunk_ids)))} if chunk_ids else {}
    # A table link names its ends by their own proposals (app/services/table_mappings.py).
    end_ids = {str(v) for r in rows if isinstance(r.payload, dict) for k, v in r.payload.items()
               if k in ("source_candidate_id", "target_candidate_id") and v}
    ends = {c.id: str((c.payload or {}).get("caption") or "") for c in
            db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.id.in_(end_ids)))} if end_ids else {}
    out: list[dict[str, Any]] = []
    for r in rows:
        p = r.payload if isinstance(r.payload, dict) else {}
        path = f"/api/extraction-candidates/{r.id}/review"
        caption = str(p.get("caption") or p.get("text") or p.get("quote") or "").strip()
        chunk = chunks.get(r.chunk_id or "")
        raw_span = p.get("span")
        span: dict[str, Any] = raw_span if isinstance(raw_span, dict) else {}
        quote = str(p.get("quote") or "") or (around(chunk.text, int(span.get("start_char") or 0), int(span.get("end_char") or 0)) if chunk else "")
        band = "high" if r.confidence >= 0.8 else ("medium" if r.confidence >= 0.5 else "low")
        item: dict[str, Any] = {
            "kind": "proposal", "id": r.id, "actor": "Name-finder" if r.candidate_type in ("entity", "identifier") else "Document reader",
            "actor_kind": "app", "created_at": r.created_at, "rank": PROPOSAL_RANK.get(r.candidate_type, 30), "level": None,
            "reason": f"Proposed from {docs.get(r.document_id, 'a document')}{mentioned(p)} · confidence {band} ({r.confidence:.2f})",
            "group": {"key": f"doc:{r.document_id}", "label": docs.get(r.document_id, r.document_id)},
            "evidence": {"document_id": r.document_id, "filename": docs.get(r.document_id, r.document_id),
                         "locator": (chunk.locator if chunk else p.get("locator")), "excerpt": quote,
                         "terms": [caption] if caption and caption in quote else []},
            "parties": [], "proposal": f"{r.candidate_type.capitalize()}: {caption}" if caption else r.candidate_type.capitalize(),
            "open": {"href": f"/review?document={r.document_id}", "label": "Open in Review"},
        }
        numbers = [n for n in p.get("rows") or [] if isinstance(n, int)]
        if numbers:
            # Read from a table: the rows' cells are what it rests on, not a passage.
            item["evidence"]["rows"] = _table_rows(p)
            item["evidence"]["terms"] = []
        if r.candidate_type == "entity":
            # Whether the case already holds a record of this name is asked only for the items shown (decisions()).
            item["_entity_row"] = r
            _entity_question(item, None)
        elif r.candidate_type == "identifier":
            # Whose email or phone it is needs a pick from the case's records: the Review page asks it.
            item["question"] = f"Whose is “{caption}”?"
            item["consequences"] = ["Answered in Review, where you pick the record it belongs to."]
            item["choices"] = []
        elif r.candidate_type == "claim":
            item["question"] = f"Keep this as a claim to check: “{caption[:180]}”?"
            item["consequences"] = ["Creates the claim as Not yet shown, with this passage linked as supporting evidence."]
            item["choices"] = [_choice("yes", "Keep it", path, {"decision": "accept"}), _choice("no", "Not a claim", path, {"decision": "reject"})]
        elif r.candidate_type == "evidence":
            item["question"] = "Keep this passage as evidence?"
            item["consequences"] = ["Saves the exact words and where they are as evidence of this document's source."]
            item["choices"] = [_choice("yes", "Keep it", path, {"decision": "accept"}), _choice("no", "Not useful", path, {"decision": "reject"})]
        elif numbers:
            schema = str(p.get("schema") or "")
            source = ends.get(str(p.get("source_candidate_id"))) or caption.partition(" → ")[0]
            target = ends.get(str(p.get("target_candidate_id"))) or caption.partition(" → ")[2]
            props = p.get("properties") if isinstance(p.get("properties"), dict) else {}
            phrase = _rows_phrase(numbers)
            item["question"] = f"Do{'es' if len(numbers) == 1 else ''} {phrase} show {_link_facts(schema, source, target, props)}?"
            item["consequences"] = [f"Adds the link between the two records with {'this row' if len(numbers) == 1 else 'these rows'} as evidence."]
            item["choices"] = [_choice("yes", "Link them", path, {"decision": "accept"}), _choice("no", "No", path, {"decision": "reject"})]
            if schema == "Payment" and source and target:
                item["_payment_ends"] = (source, target)
        else:
            label = str(p.get("label") or p.get("schema") or "link")
            item["question"] = f"Does this passage show the {label.lower()} {caption}?".replace("  ", " ")
            item["consequences"] = ["Adds the link between the two records with this passage as evidence."]
            item["choices"] = [_choice("yes", "Link them", path, {"decision": "accept"}), _choice("no", "No", path, {"decision": "reject"})]
        out.append(item)
    return out


def _matches(db: Session, inv: str) -> list[dict[str, Any]]:
    rows = list(db.scalars(select(CrossReferenceProposal).where(CrossReferenceProposal.investigation_id == inv,
                                                                CrossReferenceProposal.status == "open")))
    names = _names(db, {r.entity_id for r in rows} | {r.other_entity_id for r in rows if r.other_entity_id})
    out = []
    for r in rows:
        ours = names.get(r.entity_id, (r.entity_id, ""))[0]
        where = r.match_collection_label or "another collection"
        path = f"/api/cross-references/{r.id}/decision"
        shared = ", ".join(str(m.get("label") or m.get("property_type")).lower() if isinstance(m, dict) else str(m) for m in (r.matched_properties or [])[:3])
        out.append({
            "kind": "match", "id": r.id, "question": f"Is {ours} the same as {r.match_caption} in {where}?",
            "actor": "OpenAleph", "actor_kind": "connector", "created_at": r.first_seen_at, "rank": 35 + int(10 * (r.score or 0)),
            "reason": f"Same {shared}" if shared else f"Cross-reference score {r.score:.2f}", "level": None,
            "group": {"key": f"match:{where}", "label": where}, "evidence": None,
            "parties": _parties([r.entity_id] + ([r.other_entity_id] if r.other_entity_id else []), names),
            "proposal": f"{ours} ↔ {r.match_caption} ({r.match_schema})",
            "consequences": ["Same: the two are recorded as one entity across collections; nothing is merged here."],
            "choices": [_choice("yes", "Same", path, {"decision": "same"}), _choice("no", "Different", path, {"decision": "different"}),
                        _choice("unsure", "Not sure", path, {"decision": "unsure"})],
            "open": {"href": "/bring-in#corpus", "label": "Open in OpenAleph corpus"},
        })
    return out


def _outside(db: Session, inv: str) -> list[dict[str, Any]]:
    rows = list(db.scalars(select(ConnectorFinding).where(ConnectorFinding.investigation_id == inv,
                                                          ConnectorFinding.review_status == "unreviewed")))
    return [{
        "kind": "outside", "id": r.id, "question": f"Is {r.caption} ({r.provider}) about someone in this case?",
        "actor": r.provider, "actor_kind": "connector", "created_at": r.created_at, "rank": 30, "level": None,
        "reason": f"Found by {r.provider}", "group": {"key": f"outside:{r.provider}", "label": r.provider}, "evidence": None,
        "parties": [], "proposal": f"{r.schema or 'Record'}: {r.caption}",
        "consequences": ["Answered in Connector findings, where you pick the record it matches."], "choices": [],
        "open": {"href": "/check#review-queue", "label": "Open Connector findings"},
    } for r in rows]


def _ai(db: Session, inv: str) -> list[dict[str, Any]]:
    rows = list(db.scalars(select(AIAnalysisCandidate).where(AIAnalysisCandidate.investigation_id == inv,
                                                             AIAnalysisCandidate.review_status == "proposed")))
    label = {"case_synthesis": "Case synthesis", "hypothesis_test": "Hypothesis test", "presentation_draft": "Presentation draft"}
    out = []
    for r in rows:
        q = str((r.request or {}).get("question") or "")
        path = f"/api/ai-analysis-candidates/{r.id}/review"
        claims = len((r.payload or {}).get("claims") or [])
        out.append({
            "kind": "ai", "id": r.id, "question": f"Accept this {label.get(r.module, r.module).lower()} as checked analysis?",
            "actor": "AI", "actor_kind": "ai", "created_at": r.created_at, "rank": 80, "level": None,
            "reason": f"AI draft · {r.created_at:%d %b %H:%M}" + (f" · asked: {q[:80]}" if q else ""),
            "group": {"key": "ai", "label": "AI drafts"}, "evidence": None, "parties": [],
            "proposal": f"{label.get(r.module, r.module)}" + (f" · {claims} claims" if claims else ""),
            "consequences": ["Marks the draft as analysis a person checked. It never creates or changes a record."],
            "choices": [_choice("yes", "Accept", path, {"decision": "accept"}), _choice("no", "Reject", path, {"decision": "reject"})],
            "open": {"href": "/act#ai-reasoning-panel", "label": "Read the whole draft"},
        })
    return out


def _watchlist(db: Session, inv: str) -> list[dict[str, Any]]:
    rows = list(db.execute(select(WatchlistHit, WatchlistEntry.query).join(WatchlistEntry, WatchlistHit.entry_id == WatchlistEntry.id)
                           .where(WatchlistHit.investigation_id == inv, WatchlistHit.status == "new")))
    out = []
    for hit, query in rows:
        # Each highlight is a fragment: a list of {text, hit} pieces (app/services/watchlists.py).
        excerpt = " … ".join("".join(str(piece.get("text", "")) for piece in fragment if isinstance(piece, dict))
                             for fragment in (hit.highlights or [])[:2] if isinstance(fragment, list))
        out.append({
            "kind": "watchlist", "id": hit.id, "question": f"Is this mention of {query} worth a lead?",
            "actor": "Watchlist", "actor_kind": "app", "created_at": hit.found_at, "rank": 70, "level": None,
            "reason": f"New hit for {query}" + (f" · page {hit.page_number}" if hit.page_number else ""),
            "group": {"key": f"watch:{query}", "label": f"Watchlist · {query}"},
            "evidence": {"document_id": hit.document_id, "filename": hit.title, "locator": f"page {hit.page_number}" if hit.page_number else None,
                         "excerpt": excerpt, "terms": [query]},
            "parties": [], "proposal": hit.title,
            "consequences": ["Add to leads: opens a lead pointing at this page."],
            "choices": [_choice("yes", "Add to leads", f"/api/watchlist-hits/{hit.id}/lead", {}),
                        _choice("no", "Dismiss", f"/api/watchlist-hits/{hit.id}/dismiss", {})],
            "open": {"href": "/bring-in#corpus", "label": "Open Watchlist"},
        })
    return out


def decisions(db: Session, investigation_id: str, *, kind: str | None = None, order: str = "consequence",
              offset: int = 0, limit: int = 200) -> dict[str, Any]:
    readers: dict[str, Callable[[Session, str], list[dict[str, Any]]]] = {"to_check": _check_items, "missing": _missing, "proposal": _proposals, "match": _matches, "outside": _outside, "ai": _ai, "watchlist": _watchlist}
    items: list[dict[str, Any]] = []
    for k, read in readers.items():
        if kind in (None, k):
            items.extend(read(db, investigation_id))
    if order == "oldest":
        items.sort(key=lambda i: i["created_at"])
    elif order == "source":
        items.sort(key=lambda i: (i["group"]["key"], -i["rank"], i["created_at"]))
    else:
        items.sort(key=lambda i: (-i["rank"], i["created_at"]))
    total = len(items)
    page = items[offset:offset + limit]
    if any("_entity_row" in i for i in page):
        from app.services.documents import preview_entity_candidate_matches

        for item in page:
            if "_entity_row" in item:
                try:
                    strong = preview_entity_candidate_matches(db, item["_entity_row"]).get("strong_match")
                except ValueError:
                    strong = None
                _entity_question(item, strong)
    _known_payments(db, investigation_id, page)
    for item in page:
        item.pop("_entity_row", None)
        item.pop("_payment_ends", None)
    return {"investigation_id": investigation_id, "counts": decision_counts(db, investigation_id), "total": total,
            "offset": offset, "items": page}


# --- Since -------------------------------------------------------------------------------------------------------

def since(db: Session, investigation_id: str, after: datetime) -> dict[str, Any]:
    """What changed after ``after``, from the records' own timestamps."""
    inv = investigation_id
    docs = _count(db, select(func.count()).select_from(Document).where(Document.investigation_id == inv, Document.created_at > after,
                                                                         Document.parent_document_id.is_(None)))
    claims = _count(db, select(func.count()).select_from(ClaimReviewEvent).join(Claim, ClaimReviewEvent.claim_id == Claim.id)
                    .where(Claim.investigation_id == inv, ClaimReviewEvent.created_at > after))
    checks = _count(db, select(func.count()).select_from(CheckItem).where(CheckItem.investigation_id == inv, CheckItem.decided_at > after))
    proposals = _count(db, select(func.count()).select_from(ExtractionCandidate).where(
        ExtractionCandidate.investigation_id == inv, ExtractionCandidate.reviewed_at > after))
    new_flags = list(db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == inv, PatternFlag.first_seen_at > after,
                                                          PatternFlag.gone_at.is_(None))))
    ai = _count(db, select(func.count()).select_from(AIAnalysisCandidate).where(AIAnalysisCandidate.investigation_id == inv,
                                                                                 AIAnalysisCandidate.created_at > after))
    outside = _count(db, select(func.count()).select_from(ConnectorFinding).where(ConnectorFinding.investigation_id == inv,
                                                                                    ConnectorFinding.created_at > after))
    hits = _count(db, select(func.count()).select_from(WatchlistHit).where(WatchlistHit.investigation_id == inv, WatchlistHit.found_at > after))
    top = max(new_flags, key=lambda f: LEVEL_RANK.get(f.level, 0), default=None)
    changes = [
        {"key": "documents", "count": docs, "label": "documents added", "actor_kind": "person", "href": "/bring-in#document-ingestion"},
        {"key": "decided", "count": claims + checks + proposals, "label": "decided by you", "actor_kind": "person", "href": "/check"},
        {"key": "flags", "count": len(new_flags), "label": f"new Red Flag{'s' if len(new_flags) != 1 else ''}" + (f", the strongest {top.level.capitalize()}" if top else ""),
         "actor_kind": "app", "href": "/act#red-flags", "level": top.level if top else None},
        {"key": "ai", "count": ai, "label": f"AI draft{'s' if ai != 1 else ''} to review", "actor_kind": "ai", "href": "/decide?kind=ai"},
        {"key": "outside", "count": outside + hits, "label": "outside findings and watchlist hits", "actor_kind": "connector", "href": "/decide"},
    ]
    return {"investigation_id": inv, "after": after, "changes": [c for c in changes if c["count"]]}


def require(db: Session, investigation_id: str) -> Investigation | None:
    return db.get(Investigation, investigation_id)
