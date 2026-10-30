"""What kind of payment a Payment link is (DECISIONS_LOG 32).

FollowTheMoney's Payment has no property for it: ``purpose`` is the stated purpose in free text and ``programme`` a
sanctions or funding programme. So the kind is the app's own column on the link (RelationshipEdge.payment_kind),
set by a person where a payment is added (Add by hand, POST /relationships) or opened (PATCH
/relationships/{id}/payment-kind). Nothing guesses it.

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
