"""Where money appears or vanishes: the integrity checks of the money view (research §2.8, mockup SEE_2).

Four standing questions, asked of the euro (or any one currency's) ledger on its own, never summed across
currencies. Each answer is a lead to chase, not a finding; each carries the innocent explanation that could
account for it.

* grey hole: a party sends out more than the case records coming in (something came in; not enough);
* miracle: a party sends money out and nothing is recorded coming in;
* black hole: a party receives money and nothing is recorded leaving;
* round trip: money goes round and comes back to a party it left. A round trip that is not found is said so
  ("none found"), so a check that ran is never mistaken for one that did not.

Read-only. The ledger is ``financial_flows.investigation_financial_ledger`` (complete payments only, reviewed
duplicates once). ``as_of`` keeps the payments dated up to the end of that year; undated payments stay in,
because nothing says they came later.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.services.financial_flows import investigation_financial_ledger

CHECK_RULE = (
    "Worked out by the app from the ledger of one currency at a time: what each party received and sent in "
    "the payments the case holds. A check is a question to chase, not a finding."
)
INNOCENT = {
    "grey_hole": "a bank loan, or money from the owners, that the case does not hold yet",
    "miracle": "income from its other clients or business, outside this case",
    "black_hole": "a holding company keeping cash, or payments out that the case does not hold yet",
    "round_trip": "a loan being repaid, or a refund",
}


def _years(dates: list[str]) -> str:
    years = sorted({d[:4] for d in dates if d})
    if not years:
        return ""
    return years[0] if len(years) == 1 else f"{years[0]}–{years[-1][2:]}"


def _cycles(edges: list[dict]) -> list[list[dict]]:
    """Simple cycles in the payment graph, each as the payments around it, found once each."""
    out_edges: dict[str, list[dict]] = defaultdict(list)
    for e in edges:
        out_edges[e["from_entity_id"]].append(e)
    found: list[list[dict]] = []
    seen: set[frozenset[str]] = set()
    nodes = sorted(out_edges)

    def walk(start: str, node: str, path: list[dict], visited: set[str]) -> None:
        for e in out_edges.get(node, []):
            nxt = e["to_entity_id"]
            if nxt == start:
                key = frozenset(p["id"] for p in [*path, e])
                if key not in seen:
                    seen.add(key)
                    found.append([*path, e])
            elif nxt not in visited and nxt > start and len(path) < 8:
                walk(start, nxt, [*path, e], visited | {nxt})

    for n in nodes:
        walk(n, n, [], {n})
    return found


def _checks_for(currency: str, txs: list[dict]) -> dict[str, Any]:
    received: dict[str, float] = defaultdict(float)
    sent: dict[str, float] = defaultdict(float)
    n_in: dict[str, int] = defaultdict(int)
    n_out: dict[str, int] = defaultdict(int)
    dates_out: dict[str, list[str]] = defaultdict(list)
    dates_in: dict[str, list[str]] = defaultdict(list)
    name: dict[str, str] = {}
    for t in txs:
        a, b = t["from_entity_id"], t["to_entity_id"]
        name[a], name[b] = t["from"], t["to"]
        sent[a] += t["amount"]
        received[b] += t["amount"]
        n_out[a] += 1
        n_in[b] += 1
        dates_out[a].append(t["dateTime"] or "")
        dates_in[b].append(t["dateTime"] or "")
    checks: list[dict[str, Any]] = []
    for pid in sorted(name, key=lambda p: (-(sent[p] + received[p]), name[p])):
        base = {"party_id": pid, "party": name[pid], "amount_in": received[pid], "amount_out": sent[pid],
                "payments_in": n_in[pid], "payments_out": n_out[pid]}
        if received[pid] > 0 and sent[pid] > received[pid]:
            span = _years(dates_out[pid] + dates_in[pid])
            checks.append({**base, "kind": "grey_hole", "gap": sent[pid] - received[pid], "innocent": INNOCENT["grey_hole"],
                           "lead_idea": f"ask for {name[pid]}’s {span + ' ' if span else ''}accounts"})
        elif received[pid] == 0 and sent[pid] > 0:
            checks.append({**base, "kind": "miracle", "gap": sent[pid], "innocent": INNOCENT["miracle"],
                           "lead_idea": f"ask where {name[pid]}’s money came from: its accounts or bank statements"})
        elif sent[pid] == 0 and received[pid] > 0:
            last = max((d for d in dates_in[pid] if d), default="")
            checks.append({**base, "kind": "black_hole", "gap": received[pid], "innocent": INNOCENT["black_hole"],
                           "lead_idea": f"ask for {name[pid]}’s bank statements{' after ' + last if last else ''}"})
    trips = []
    for cycle in _cycles(txs):
        latest = max(cycle, key=lambda e: (e["dateTime"] or "", e["id"]))
        trips.append({"kind": "round_trip", "party_id": latest["to_entity_id"], "party": latest["to"],
                      "path": [cycle[0]["from"], *[e["to"] for e in cycle]], "payment_ids": [e["id"] for e in cycle],
                      "returning_payment_id": latest["id"], "gap": latest["amount"], "innocent": INNOCENT["round_trip"],
                      "lead_idea": f"ask {latest['from']} what the {latest['amount']:,.0f} {currency} paid back to {latest['to']} was for"})
    return {"currency": currency, "payments": len(txs), "checks": checks, "round_trips": trips}


def investigation_money_checks(db: Session, investigation_id: str, as_of: int | None = None) -> dict[str, Any]:
    ledger = investigation_financial_ledger(db, investigation_id)
    txs = [t for t in ledger["transactions"] if as_of is None or not t["dateTime"] or int(t["dateTime"][:4]) <= as_of]
    by_currency: dict[str, list[dict]] = defaultdict(list)
    for t in txs:
        by_currency[t["currency"]].append(t)
    return {
        "investigation_id": investigation_id,
        "as_of": as_of,
        "ran_at": datetime.now(timezone.utc),
        "rule": CHECK_RULE,
        "currencies": [_checks_for(c, by_currency[c]) for c in sorted(by_currency, key=lambda c: (-len(by_currency[c]), c))],
    }
