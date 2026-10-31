"""What kind of payment a Payment link is (DECISIONS_LOG 33).

FollowTheMoney's Payment has no property for it: ``purpose`` is the stated purpose in free text and ``programme`` a
sanctions or funding programme. So the kind is the app's own column on the link (RelationshipEdge.payment_kind),
set by a person where a payment is added (Add by hand, POST /relationships) or opened (PATCH
/relationships/{id}/payment-kind). Nothing guesses it. Two places read it from what the record itself says
(DECISIONS_LOG 42): a spreadsheet column a person maps as the kind (``from_value``: the cell must name a kind), and a
payment proposed from an extracted sentence that states an amount owed in so many words (``stated_in``).

Two groups:

* money that moved: a transfer, a loan, a fee, a settlement. A payment whose kind no one has said (None) is read
  this way, as every payment was before kinds existed.
* an amount owed: an agreed price, a fine or penalty, an amount ordered by a court or authority (a judgment debt,
  compensation, restitution, disgorgement). It records what was set or agreed, not that money moved, so the money
  views list it apart and leave it out of what they add up and draw as flows (the ledger's ``owed``), the money
  checks, the Case home's money traced, the charts, and the Red Flag rules that read payments (structuring, round
  trips, payments between parties held by the same people, payments with no purpose).

The frontend names each kind by its mark (components/network/marks.tsx PAYMENT_KIND); the words there follow these.
"""
from __future__ import annotations

import re

PAYMENT_KINDS: dict[str, dict[str, object]] = {
    "transfer": {"word": "A transfer", "moved": True},
    "loan": {"word": "A loan", "moved": True},
    "fee": {"word": "A fee or payment for services", "moved": True},
    "settlement": {"word": "A settlement", "moved": True},
    "price": {"word": "An agreed price", "moved": False},
    "fine": {"word": "A fine or penalty", "moved": False},
    "ordered": {"word": "Ordered by a court or authority", "moved": False},
}
OWED = frozenset(k for k, v in PAYMENT_KINDS.items() if not v["moved"])


def check(kind: str | None) -> str | None:
    """The kind as stored: None for not said; refused with the list when it is not one of them."""
    if kind is None or not str(kind).strip():
        return None
    k = str(kind).strip().lower()
    if k not in PAYMENT_KINDS:
        raise ValueError(f"A payment's kind is one of: {', '.join(PAYMENT_KINDS)}")
    return k


def is_owed(kind: str | None) -> bool:
    """True for an amount owed (a price, a fine, an order), which is not a record that money moved."""
    return kind in OWED


# What a cell may say for each kind, besides the kind's own name and word. Whole values only: "fine" names a kind, "fine
# art purchase" does not. The words are the kinds' own words and the names the module notes give each kind.
_VALUES: dict[str, tuple[str, ...]] = {
    "transfer": ("wire", "wire transfer", "bank transfer", "money transfer", "transfer of funds"),
    "loan": ("credit facility", "loan advance"),
    "fee": ("payment for services", "service fee", "fees", "professional fee", "consulting fee"),
    "settlement": ("settlement payment",),
    "price": ("agreed price", "purchase price", "sale price", "contract price"),
    "fine": ("penalty", "penalties", "fine or penalty", "fines"),
    "ordered": ("ordered by a court or authority", "court order", "judgment", "judgment debt", "judgement", "judgement debt",
                "compensation", "restitution", "disgorgement", "confiscation", "forfeiture order"),
}


def _plain(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", text.lower())).strip()


_BY_VALUE: dict[str, str] = {}
for _kind, _info in PAYMENT_KINDS.items():
    for _value in (_kind, str(_info["word"]), re.sub(r"^an? ", "", str(_info["word"]).lower()), *_VALUES[_kind]):
        _BY_VALUE[_plain(_value)] = _kind


def from_value(value: str | None) -> str | None:
    """The kind a mapped cell names (its kind, its word, or one of the names in ``_VALUES``), or None when the cell is
    empty or names no kind; a caller reports a cell that names none."""
    return _BY_VALUE.get(_plain(value or "")) if value else None


# Phrases that say, in so many words, that an amount is owed and why: a fine or penalty, an order of a court or
# authority, an agreed price. Only these: words that may only describe a payment ("loan", "settlement", "fee") are left
# out, since a sentence quoting how a payment was represented ("a loan", as told to a bank) is often what the case
# disputes (DECISIONS_LOG 33); "fine" counts only where it is plainly the noun (fined, a fine of, a statutory fine).
_STATED: dict[str, tuple[str, ...]] = {
    "fine": (r"\bfined\b", r"\bfines?\s+(?:of|totall?ing|amounting)\b",
             r"\b(?:statutory|criminal|civil|administrative|regulatory|composition|monetary)\s+fines?\b",
             r"\b(?:pay|pays|paid|paying|impose[sd]?|imposing|levie[sd]|levy|issued)\s+(?:a|the)\s+fine\b",
             r"\b(?:financial|monetary|civil|regulatory|administrative)\s+penalt(?:y|ies)\b", r"\bpenalt(?:y|ies)\s+of\b"),
    "ordered": (r"\bdisgorge(?:ment|d)?\b", r"\brestitution\b", r"\bjudge?ment\s+debt\b", r"\bcompensation\s+order\b",
                r"\bordered\s+(?:\w+\s+){0,3}to\s+pay\b", r"\bconfiscation\s+order\b"),
    "price": (r"\bpurchase\s+price\b", r"\bagreed\s+price\b", r"\bsale\s+price\b", r"\bcontract\s+price\b"),
}
_STATED_RE = {kind: [re.compile(p, re.IGNORECASE) for p in patterns] for kind, patterns in _STATED.items()}


def stated_in(text: str | None) -> tuple[str, str] | None:
    """(kind, the words that state it) when the text states exactly one amount-owed kind in so many words; None when it
    states none, or more than one (a sentence naming a fine and a purchase price does not say which this payment is)."""
    found: dict[str, str] = {}
    for kind, patterns in _STATED_RE.items():
        for pattern in patterns:
            match = pattern.search(text or "")
            if match:
                found[kind] = match.group(0)
                break
    return next(iter(found.items())) if len(found) == 1 else None
