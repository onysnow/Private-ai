"""The demo's pre-made decisions (BACKLOG "Asked for: demo"; DECISIONS_LOG 38): a demo case is a finished
investigation, so what waits in Decide after it loads is decided from what the case already holds, and a few of
each kind are left for the person to try. Only on a demo case (Investigation.is_demo); never on anyone's own.

Every decision is stamped DEMO_DECIDER ("Demo (pre-decided)", app/db/decided_by.py) with the rule that made it in
its note, and ``undo`` puts any of them back as it was. Nothing here makes a record the case did not already hold:

- **accepted**, a proposal that names what the case already holds:
  * a name that is a record's own name or alias, word for word (one record only; for a table's "X (Y)" either part):
    accepted as that record ("Same record", as a person would), so its mentions in the document are kept on it;
  * a passage that holds a quote the case already keeps from the same source: accepted as that quote;
  * a sentence that is a claim's own text, or holds a quote that supports exactly one claim (the quote from the same
    source): accepted as that claim;
  * a table payment whose two ends are accepted and that the case holds already (same payer, payee, amount, currency
    and date): accepted as that payment.
- **rejected**, noise by a rule:
  * a "name" whose words are all court-caption words (Verified Complaint, Forfeiture In Rem, All Right…), a court's
    abbreviation (C.D. Cal), or a role standing for an unnamed person (Deutsche Bank Employee, Christie's VP);
  * a passage too short to stand alone (under six words), not prose (under half letters), or only page furniture
    (Case 2:16-cv-…, Page 3 of 136, Page ID #:3), or an email's header lines (From, To, Date);
  * the same name, sentence or passage proposed again (in another document) after it was decided or left waiting.
- **left waiting**: a table's own rows and names (the money, so Decide can be tried on it), then one name, one
  sentence and one passage per document while fewer than PROPOSALS_WAITING proposals wait in the case.
- **not used**: every other proposal is rejected as not taken by the finished case, which already holds what it
  took from its documents.
- To check, missing values, watchlist hits: a few of each are left waiting (TO_CHECK_WAITING, MISSING_WAITING,
  WATCHLIST_WAITING); the rest are set aside as the finished case left them (a passage or checklist item "unclear",
  a missing value "not needed here", a hit dismissed), never answered "shows" or "does not": that needs a person.

Proposals the OCR quality gate held back (app/jobs/handlers.py hold_illegible) are left as they are: not in Decide.

When it runs: at the end of a demo build (the table's proposals, every missing value and checklist item), and after
each of a demo case's documents is read (that document's proposals, passages and watchlist hits). Each item is seen
once, so a decision undone is not made again (unless the document is read again).
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.db.decided_by import DEMO_DECIDER_ID, DEMO_DECIDER_NAME
from app.models.domain import (
    CheckItem,
    Claim,
    ClaimEvidenceLink,
    Document,
    DocumentChunk,
    Entity,
    Evidence,
    ExtractionCandidate,
    Investigation,
    PatternFlag,
    RelationshipEdge,
    Statement,
    WatchlistHit,
)

PROPOSALS_WAITING = 36
TO_CHECK_WAITING = 8
MISSING_WAITING = 8
WATCHLIST_WAITING = 4

PREFIX = "Demo (pre-decided): "
RULES = {
    "same_name": "the case already holds this name on {caption}.",
    "held_quote": "the case already keeps this passage as a quote from this source.",
    "held_claim": "the case already holds this claim: “{text}”.",
    "held_payment": "the case already holds this payment.",
    "caption_words": "court-caption words, not a party's name.",
    "court_abbreviation": "a court's abbreviation, not a party's name.",
    "role_word": "a role standing for a person the document does not name, not a name.",
    "too_short": "too short to stand alone as evidence.",
    "not_prose": "not prose (numbers and marks, under half letters).",
    "page_furniture": "only the page's own header or footer.",
    "email_headers": "the email's own header lines (From, To, Date), not a passage of its text.",
    "duplicate": "the same {what} is proposed already in this case.",
    "not_used": "not taken by the finished case, which already holds what it took from this document.",
    "set_aside_check": "set aside as the finished case left it; not answered by a person. Open it again to answer.",
    "set_aside_missing": "the finished case was told without this value. Open it again to chase it.",
    "set_aside_hit": "the document is already in the case.",
}

# Words of a court filing's caption and furniture: a "name" made only of these is not a party.
CAPTION_WORDS = frozenset("""
verified complaint complaints amended forfeiture in rem re all right rights title interest interests and of the
real property located plaintiff plaintiffs defendant defendants respondent respondents petitioner exhibit exhibits
case page document filed court district order judgment count counts section paragraph table appendix attachment
memorandum motion notice statement information indictment plea agreement superseding united states of america v vs
""".split()) - {"united", "states", "america"}
ROLE_WORDS = frozenset({"employee", "employees", "vp", "banker", "official", "officer", "executive", "representative",
                        "spokesperson", "staff", "associate", "individual"})
COURT_ABBREVIATION = re.compile(r"^(?:[A-Z]\.){1,3}\s?[A-Z][a-z]{0,4}\.?$")
FURNITURE = re.compile(r"Case\s+\d+:\d{2}-\w{2,4}-\d+(?:-\w+)*|Document\s+\d+(?:-\d+)?|Filed\s+\d{1,2}/\d{1,2}/\d{2,4}"
                       r"|Page\s+\d+\s+of\s+\d+|Page\s*ID\s*#?:?\s*\d+|Pg\s+\d+\s+of\s+\d+", re.I)
TYPE_ORDER = {"entity": 0, "relationship": 1, "claim": 2, "evidence": 3}


def applies(db: Session, investigation_id: str) -> bool:
    inv = db.get(Investigation, investigation_id)
    return inv is not None and bool(inv.is_demo)


def _norm(text: str) -> str:
    return re.sub(r"[^\w]+", " ", (text or "").replace("’", "'").casefold()).strip()


def _squash(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").replace("’", "'").replace("“", '"').replace("”", '"')).strip().casefold()


def _words(text: str) -> list[str]:
    return re.findall(r"[^\W\d_]+(?:'[^\W\d_]+)?|\d+", text or "")


def _stamp(obj: Any, note_rule: str, **fmt: str) -> None:
    obj.decided_by_id, obj.decided_by_name = DEMO_DECIDER_ID, DEMO_DECIDER_NAME
    if hasattr(obj, "reviewer_note"):
        obj.reviewer_note = PREFIX + RULES[note_rule].format(**fmt)
    elif hasattr(obj, "note"):
        obj.note = PREFIX + RULES[note_rule].format(**fmt)


# --- what the case already holds ---------------------------------------------------------------------------------

class _Held:
    """The case's own records, read once per pass."""

    def __init__(self, db: Session, inv: str) -> None:
        relationship_ids = set(db.scalars(select(RelationshipEdge.relationship_entity_id).where(RelationshipEdge.investigation_id == inv)))
        self.names: dict[str, set[str]] = {}
        self.entities: dict[str, Entity] = {}
        for row in db.scalars(select(Entity).where(Entity.investigation_id == inv, Entity.merged_into_entity_id.is_(None))):
            if row.id in relationship_ids:
                continue
            self.entities[row.id] = row
            props = row.properties if isinstance(row.properties, dict) else {}
            for name in [row.caption, *(props.get(p) or [] for p in ("name", "alias", "weakAlias", "previousName"))]:
                for value in (name if isinstance(name, list) else [name]):
                    key = _norm(str(value or ""))
                    if key:
                        self.names.setdefault(key, set()).add(row.id)
        self.quotes: dict[str, list[tuple[str, str]]] = {}
        evidence_source: dict[str, str] = {}
        for ev_id, source_id, quote in db.execute(select(Evidence.id, Evidence.source_id, Evidence.quote).join(
                Document, Document.source_id == Evidence.source_id, isouter=True).where(Document.investigation_id == inv)):
            evidence_source[ev_id] = source_id
            if quote and len(_words(quote)) >= 5:
                self.quotes.setdefault(source_id, []).append((_squash(quote), ev_id))
        for rows in self.quotes.values():
            rows.sort(key=lambda r: -len(r[0]))
        self.claims: dict[str, str] = {}
        self.claim_text: dict[str, str] = {}
        for claim in db.scalars(select(Claim).where(Claim.investigation_id == inv)):
            self.claims.setdefault(_squash(claim.text), claim.id)
            self.claim_text[claim.id] = claim.text
        # A quote that supports a claim, by source: (quote, claim ids).
        self.support: dict[str, dict[str, set[str]]] = {}
        for claim_id, ev_id, source_id, quote in db.execute(
                select(ClaimEvidenceLink.claim_id, Evidence.id, Evidence.source_id, Evidence.quote)
                .join(Evidence, Evidence.id == ClaimEvidenceLink.evidence_id).join(Claim, Claim.id == ClaimEvidenceLink.claim_id)
                .where(Claim.investigation_id == inv, ClaimEvidenceLink.stance == "supports", ClaimEvidenceLink.superseded_at.is_(None))):
            if quote and len(_words(quote)) >= 5:
                self.support.setdefault(source_id, {}).setdefault(_squash(quote), set()).add(claim_id)
        self.payments: dict[tuple[str, str, str, str, str], str] = {}
        for edge in db.scalars(select(RelationshipEdge).where(RelationshipEdge.investigation_id == inv, RelationshipEdge.schema == "Payment")):
            rel = db.get(Entity, edge.relationship_entity_id)
            props = (rel.properties if rel is not None and isinstance(rel.properties, dict) else {}) or {}
            for payment in _payment_keys(edge.source_entity_id, edge.target_entity_id, props):
                self.payments.setdefault(payment, edge.id)

    def record_named(self, caption: str) -> Entity | None:
        """The one record holding this name word for word; for a table's "X (Y)", the full name, then Y, then X."""
        tries = [caption]
        paren = re.fullmatch(r"\s*(.+?)\s*\((.+)\)\s*", caption or "")
        if paren:
            tries += [paren.group(2), paren.group(1)]
        for name in tries:
            ids = self.names.get(_norm(name)) or set()
            if len(ids) == 1:
                return self.entities[next(iter(ids))]
            if ids:
                return None  # two records of the name: a person says which
        return None


def _payment_keys(source: str, target: str, props: dict[str, Any]) -> list[tuple[str, str, str, str, str]]:
    amounts = [str(a).replace(",", "").strip() for a in props.get("amount") or []]
    currencies = [str(c).upper().strip() for c in props.get("currency") or []] or [""]
    dates = [str(d)[:10] for d in props.get("date") or []] or [""]
    return [(source, target, a, c, d) for a in amounts for c in currencies for d in dates if a]


# --- proposals ---------------------------------------------------------------------------------------------------

def _noise(candidate: ExtractionCandidate, chunk_locator: str | None = None) -> str | None:
    p = candidate.payload if isinstance(candidate.payload, dict) else {}
    if candidate.candidate_type == "entity":
        caption = str(p.get("caption") or "").strip()
        words = [w.casefold() for w in _words(caption)]
        if words and all(w in CAPTION_WORDS for w in words):
            return "caption_words"
        if COURT_ABBREVIATION.fullmatch(caption):
            return "court_abbreviation"
        if len(words) >= 2 and words[-1] in ROLE_WORDS:
            return "role_word"
        return None
    if candidate.candidate_type in ("evidence", "claim"):
        text = str(p.get("quote") if candidate.candidate_type == "evidence" else p.get("text") or "")
        if any(str(where or "").endswith("headers") for where in (p.get("locator"), chunk_locator)):
            return "email_headers"  # an email's header block (app/services/container_readers.py)
        if len(_words(FURNITURE.sub(" ", text))) < 6:
            return "page_furniture" if FURNITURE.search(text) else "too_short"
        chars = [ch for ch in text if not ch.isspace()]
        if chars and sum(ch.isalpha() for ch in chars) / len(chars) < 0.5:
            return "not_prose"
    return None


def _key(candidate: ExtractionCandidate) -> tuple[str, str] | None:
    p = candidate.payload if isinstance(candidate.payload, dict) else {}
    text = {"entity": p.get("caption"), "claim": p.get("text"), "evidence": p.get("quote")}.get(candidate.candidate_type)
    return (candidate.candidate_type, _norm(str(text))) if text else None


def _accept_as(candidate: ExtractionCandidate, record_type: str, record_id: str, rule: str, **fmt: str) -> None:
    candidate.review_status, candidate.accepted_record_type, candidate.accepted_record_id = "accepted", record_type, record_id
    candidate.reviewed_at = utcnow_naive()
    _stamp(candidate, rule, **fmt)


def _reject(candidate: ExtractionCandidate, rule: str, **fmt: str) -> None:
    candidate.review_status = "rejected"
    candidate.reviewed_at = utcnow_naive()
    _stamp(candidate, rule, **fmt)


def _match(db: Session, held: _Held, candidate: ExtractionCandidate, doc: Document) -> bool:
    """Accept the proposal when it names what the case already holds; says whether it did."""
    from app.services.documents import review_candidate

    p = candidate.payload if isinstance(candidate.payload, dict) else {}
    kind = candidate.candidate_type
    if kind == "entity":
        record = held.record_named(str(p.get("caption") or ""))
        if record is None:
            return False
        # The app's own "Same record" answer: the document's mentions are kept on the record; nothing new is made.
        db.commit()  # the pass's decisions so far, so a refusal below undoes only this one
        try:
            review_candidate(db, candidate, decision="accept", entity_schema=record.schema, matched_entity_id=record.id,
                             entity_identity_decision="same")
        except ValueError:  # the app's own checks refused it: a person decides
            db.rollback()
            return False
        _stamp(candidate, "same_name", caption=record.caption)
        return True
    if kind == "evidence":
        text = _squash(str(p.get("quote") or ""))
        found = next((ev for quote, ev in held.quotes.get(doc.source_id, []) if quote and quote in text), None)
        if found is None:
            return False
        _accept_as(candidate, "evidence", found, "held_quote")
        return True
    if kind == "claim":
        text = _squash(str(p.get("text") or ""))
        claim_id = held.claims.get(text)
        if claim_id is None and len(_words(text)) >= 6:
            ids = {c for quote, claims in held.support.get(doc.source_id, {}).items() if quote in text or text in quote for c in claims}
            claim_id = next(iter(ids)) if len(ids) == 1 else None
        if claim_id is None:
            return False
        _accept_as(candidate, "claim", claim_id, "held_claim", text=held.claim_text[claim_id])
        return True
    if kind == "relationship" and p.get("source_candidate_id") and p.get("schema") == "Payment":
        ends = [db.get(ExtractionCandidate, p.get(k)) for k in ("source_candidate_id", "target_candidate_id")]
        if any(e is None or e.review_status != "accepted" or e.accepted_record_type != "entity" for e in ends):
            return False
        keys = _payment_keys(str(ends[0].accepted_record_id), str(ends[1].accepted_record_id), p.get("properties") or {})  # type: ignore[union-attr]
        edge = next((held.payments[k] for k in keys if k in held.payments), None)
        if edge is None:
            return False
        _accept_as(candidate, "relationship", edge, "held_payment")
        return True
    return False


def _from_table(candidate: ExtractionCandidate) -> bool:
    p = candidate.payload if isinstance(candidate.payload, dict) else {}
    return bool(p.get("mapping"))


def _position(db: Session, candidate: ExtractionCandidate, ordinals: dict[str, int]) -> tuple[int, int, str, str]:
    p = candidate.payload if isinstance(candidate.payload, dict) else {}
    span = p.get("span")
    start = span["start_char"] if isinstance(span, dict) and isinstance(span.get("start_char"), int) else 0
    return (ordinals.get(candidate.chunk_id or "", -1), start, candidate.created_at.isoformat() if candidate.created_at else "", candidate.id)


def decide_proposals(db: Session, investigation_id: str, document_ids: Iterable[str]) -> Counter[str]:
    """The pass over the documents' waiting proposals, in the order given. Returns how many went each way."""
    order = list(dict.fromkeys(document_ids))
    out: Counter[str] = Counter()
    if not order or not applies(db, investigation_id):
        return out
    batch = list(db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.investigation_id == investigation_id,
                                                              ExtractionCandidate.document_id.in_(order),
                                                              ExtractionCandidate.review_status == "proposed")))
    if not batch:
        return out
    held = _Held(db, investigation_id)
    batch_ids = {c.id for c in batch}
    waiting = int(db.scalar(select(func.count()).select_from(ExtractionCandidate).where(
        ExtractionCandidate.investigation_id == investigation_id, ExtractionCandidate.review_status == "proposed",
        ExtractionCandidate.id.not_in(batch_ids))) or 0)
    # What was proposed before (decided, waiting or held), for the duplicate rule.
    seen: set[tuple[str, str]] = set()
    for row in db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.investigation_id == investigation_id,
                                                            ExtractionCandidate.id.not_in(batch_ids),
                                                            ExtractionCandidate.candidate_type.in_(("entity", "claim", "evidence")))):
        key = _key(row)
        if key and not _from_table(row):
            seen.add(key)
    ordinals: dict[str, int] = {}
    locators: dict[str, str] = {}
    for cid, n, locator in db.execute(select(DocumentChunk.id, DocumentChunk.ordinal, DocumentChunk.locator).where(DocumentChunk.document_id.in_(order))):
        ordinals[cid], locators[cid] = n, locator
    rank = {d: i for i, d in enumerate(order)}
    batch.sort(key=lambda c: (rank[c.document_id], TYPE_ORDER.get(c.candidate_type, 9), *_position(db, c, ordinals)))
    kept: set[tuple[str, str]] = set()
    docs: dict[str, Document | None] = {}
    for candidate in batch:
        doc = docs.setdefault(candidate.document_id, db.get(Document, candidate.document_id))
        if doc is None:
            continue
        if _match(db, held, candidate, doc):
            out["accepted"] += 1
            key = _key(candidate)
            if key and not _from_table(candidate):
                seen.add(key)
            continue
        if _from_table(candidate):
            waiting += 1  # a table's rows and names: the money, left for a person to try
            out["left"] += 1
            continue
        rule = _noise(candidate, locators.get(candidate.chunk_id or ""))
        key = _key(candidate)
        if rule is None and key is not None and key in seen:
            rule = "duplicate"
        if rule is not None:
            _reject(candidate, rule, what={"entity": "name", "claim": "sentence"}.get(candidate.candidate_type, "passage"))
            out["rejected"] += 1
        elif waiting < PROPOSALS_WAITING and (candidate.document_id, candidate.candidate_type) not in kept:
            kept.add((candidate.document_id, candidate.candidate_type))
            waiting += 1
            out["left"] += 1
        else:
            _reject(candidate, "not_used")
            out["not_used"] += 1
        if key is not None:
            seen.add(key)
    db.commit()
    return out


# --- To check, missing values, watchlist hits ----------------------------------------------------------------------

def _open_checks(db: Session, inv: str) -> list[CheckItem]:
    return list(db.scalars(select(CheckItem).where(CheckItem.investigation_id == inv, CheckItem.status == "open",
                                                   CheckItem.gone_at.is_(None), CheckItem.kind != "money")))


def decide_checks(db: Session, investigation_id: str, document_id: str | None = None) -> Counter[str]:
    """Brings To check up to date, then sets aside what is over the few left waiting: every open item (at a build),
    or the passages of one document (after its read)."""
    from app.patterns.engine import bring_up_to_date
    from app.patterns.missing import RULE_RANK

    out: Counter[str] = Counter()
    if not applies(db, investigation_id):
        return out
    bring_up_to_date(db, investigation_id)
    rows = _open_checks(db, investigation_id)
    batch = [r for r in rows if document_id is None or r.document_id == document_id]
    if not batch:
        return out
    batch_ids = {r.id for r in batch}
    levels = {f.id: f.level for f in db.scalars(select(PatternFlag).where(PatternFlag.investigation_id == investigation_id))}
    rank = {"textbook": 0, "strong": 1, "faint": 2}
    # Missing values: one of each rule in turn, the most consequential first.
    missing = sorted((r for r in batch if r.kind == "missing"), key=lambda r: (RULE_RANK.get(r.indicator_id, 10), r.question, r.id))
    by_rule: dict[str, list[CheckItem]] = {}
    for r in missing:
        by_rule.setdefault(r.indicator_id, []).append(r)
    turns: list[CheckItem] = []
    while any(by_rule.values()):
        for rule in list(by_rule):
            if by_rule[rule]:
                turns.append(by_rule[rule].pop(0))
    checks = sorted((r for r in batch if r.kind != "missing"),
                    key=lambda r: (rank.get(levels.get(r.flag_id or "", "") or "", 3), r.kind != "passage", r.question, r.id))
    for items, limit, status, rule in ((turns, MISSING_WAITING, "not_needed", "set_aside_missing"),
                                       (checks, TO_CHECK_WAITING, "unclear", "set_aside_check")):
        kinds = {"missing"} if status == "not_needed" else {"checklist", "passage"}
        waiting = sum(1 for r in rows if r.id not in batch_ids and r.kind in kinds)
        for r in items:
            if waiting < limit:
                waiting += 1
                out["left"] += 1
                continue
            r.status, r.decided_at = status, utcnow_naive()
            _stamp(r, rule)
            out[status] += 1
    db.commit()
    return out


def decide_hits(db: Session, investigation_id: str, document_id: str) -> Counter[str]:
    out: Counter[str] = Counter()
    if not applies(db, investigation_id):
        return out
    rows = list(db.scalars(select(WatchlistHit).where(WatchlistHit.investigation_id == investigation_id, WatchlistHit.status == "new")
                           .order_by(WatchlistHit.found_at, WatchlistHit.id)))
    waiting = sum(1 for r in rows if r.document_id != document_id)
    for hit in (r for r in rows if r.document_id == document_id):
        if waiting < WATCHLIST_WAITING:
            waiting += 1
            out["left"] += 1
            continue
        hit.status, hit.decided_at = "dismissed", utcnow_naive()
        _stamp(hit, "set_aside_hit")
        out["dismissed"] += 1
    db.commit()
    return out


# --- when it runs ------------------------------------------------------------------------------------------------

def after_build(db: Session, investigation_id: str) -> Counter[str]:
    """At the end of a demo build: the proposals made while building (a table's), then To check and missing values."""
    if not applies(db, investigation_id):
        return Counter()
    docs = list(db.scalars(select(Document.id).where(Document.investigation_id == investigation_id).order_by(Document.created_at, Document.id)))
    return decide_proposals(db, investigation_id, docs) + decide_checks(db, investigation_id)


def after_read(db: Session, document_id: str) -> Counter[str]:
    """After one of a demo case's documents is read. Never fails the read."""
    import logging

    doc = db.get(Document, document_id)
    if doc is None or not applies(db, doc.investigation_id):
        return Counter()
    try:
        inv = doc.investigation_id
        return decide_proposals(db, inv, [document_id]) + decide_checks(db, inv, document_id) + decide_hits(db, inv, document_id)
    except Exception:  # noqa: BLE001 - the read stands; the proposals simply wait for a person
        db.rollback()
        logging.getLogger("journalism.demo").warning("demo pre-decisions after a read failed", exc_info=True,
                                                     extra={"document_id": document_id})
        return Counter()


# --- what was decided, and undoing it ----------------------------------------------------------------------------

KINDS = ("proposal", "check", "watchlist")


def summary(db: Session, investigation_id: str) -> dict[str, Any]:
    counts: dict[str, dict[str, int]] = {}
    for kind, model, status in (("proposal", ExtractionCandidate, ExtractionCandidate.review_status),
                                ("check", CheckItem, CheckItem.status), ("watchlist", WatchlistHit, WatchlistHit.status)):
        rows = db.execute(select(status, func.count()).where(model.investigation_id == investigation_id,
                                                             model.decided_by_id == DEMO_DECIDER_ID).group_by(status))
        counts[kind] = {str(s): int(n) for s, n in rows}
    return {"investigation_id": investigation_id, "decided_by": DEMO_DECIDER_NAME, "counts": counts}


def _mention_origins(db: Session, candidate: ExtractionCandidate) -> set[str]:
    """Where review_candidate kept an accepted name's mentions (app/services/documents.py), to take them off again."""
    p = candidate.payload if isinstance(candidate.payload, dict) else {}
    chunk = db.get(DocumentChunk, candidate.chunk_id) if candidate.chunk_id else None
    span = p.get("span")
    suffix = (f"@chars:{span['start_char']}-{span['end_char']}" if isinstance(span, dict) and isinstance(span.get("start_char"), int)
              and isinstance(span.get("end_char"), int) else "")
    origins = {f"document:{candidate.document_id}#{chunk.locator if chunk else (p.get('locator') or 'document')}{suffix}"}
    for m in (p.get("mentions") or [])[1:]:
        if not isinstance(m, dict):
            continue
        m_span = m.get("span")
        m_suffix = f"@chars:{m_span['start_char']}-{m_span['end_char']}" if isinstance(m_span, dict) and isinstance(m_span.get("start_char"), int) else ""
        origins.add(f"document:{candidate.document_id}#{m.get('locator') or 'document'}{m_suffix}")
    provenance = p.get("provenance")
    if isinstance(provenance, dict) and provenance.get("provider_entity_id"):
        origins.add(f"{provenance.get('provider')}:entity:{provenance.get('provider_entity_id')}")
    return origins


def undo(db: Session, investigation_id: str, kind: str | None = None, item_id: str | None = None) -> int:
    """Puts the demo's decisions back as they were before it made them: all of them, one kind, or one item. A
    person's own decisions are never touched. Returns how many were undone."""
    if kind is not None and kind not in KINDS:
        raise ValueError(f"kind is one of {', '.join(KINDS)}")
    undone = 0
    if kind in (None, "proposal"):
        stmt = select(ExtractionCandidate).where(ExtractionCandidate.investigation_id == investigation_id,
                                                 ExtractionCandidate.decided_by_id == DEMO_DECIDER_ID)
        for c in db.scalars(stmt.where(ExtractionCandidate.id == item_id) if item_id else stmt):
            if c.review_status == "accepted" and c.accepted_record_type == "entity" and c.accepted_record_id:
                caption = str((c.payload or {}).get("caption") or "").strip()
                origins = _mention_origins(db, c)
                for st in db.scalars(select(Statement).where(Statement.entity_id == c.accepted_record_id, Statement.prop == "name",
                                                             Statement.value == caption)):
                    if st.origin in origins:
                        db.delete(st)
            c.review_status, c.accepted_record_type, c.accepted_record_id = "proposed", None, None
            c.reviewer_note = c.reviewed_at = None
            c.decided_by_id = c.decided_by_name = None
            undone += 1
    if kind in (None, "check"):
        stmt2 = select(CheckItem).where(CheckItem.investigation_id == investigation_id, CheckItem.decided_by_id == DEMO_DECIDER_ID)
        for r in db.scalars(stmt2.where(CheckItem.id == item_id) if item_id else stmt2):
            r.status, r.note, r.decided_at = "open", None, None
            undone += 1
    if kind in (None, "watchlist"):
        stmt3 = select(WatchlistHit).where(WatchlistHit.investigation_id == investigation_id, WatchlistHit.decided_by_id == DEMO_DECIDER_ID)
        for h in db.scalars(stmt3.where(WatchlistHit.id == item_id) if item_id else stmt3):
            h.status, h.decided_at = "new", None
            undone += 1
    db.commit()
    return undone
