"""The outbound log (ADR-0015): one row for every request that carries case data to a service, written by the code that
sends it and before it goes, so a request that dies on the way is still there. Reading it back is app/services/safety_data.py."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.connectors.base import entity_sent_value
from app.models.domain import OutboundRequest


def record_outbound(db: Session, investigation_id: str, *, service: str, kind: str, value: str, reason: str = "",
                    actor: str = "you", leaves_computer: bool = True, documents: int = 0,
                    outcome: str = "sent", source: dict[str, Any] | None = None) -> str:
    row = OutboundRequest(investigation_id=investigation_id, service=service, kind=kind, value=value, reason=reason[:500],
                          actor=actor, leaves_computer=leaves_computer, documents=documents, outcome=outcome, source=source)
    db.add(row)
    db.commit()
    return row.id


def mark_outbound_failed(db: Session, request_id: str | None) -> None:
    """The request went and an error came back (or never did): the row stays, saying so. A request the app blocked first stays blocked."""
    row = db.get(OutboundRequest, request_id) if request_id else None
    if row is not None and row.outcome == "sent":
        row.outcome = "failed"
        db.commit()


def record_model_call(db: Session, investigation_id: str, *, provider: str, model: str, module_title: str, records: int,
                      prompt_chars: int, leaves_computer: bool, run_id: str | None) -> str:
    """A call to the AI. The words themselves are on the run's trace; the log says how much went and where."""
    return record_outbound(
        db, investigation_id, service=f"ai:{provider}" if provider else "ai", kind="case text",
        value=f"{records} records from this case, {prompt_chars:,} characters, to {model or provider}",
        reason=module_title, actor="you", leaves_computer=leaves_computer, source={"run_id": run_id} if run_id else None)


def enrich_sent_text(connector: Any, payload: dict) -> str:
    """What an enrichment sends, from the connector itself; a connector that does not say is logged by the record's name and details."""
    say = getattr(connector, "enrich_sent", None)
    return say(payload) if callable(say) else entity_sent_value(payload.get("caption"), payload.get("properties"))


def send_outcome(connector: Any) -> str:
    """"blocked" when the connector will refuse before any request is made (it needs a key and has none): the attempt is logged, but nothing left."""
    return "blocked" if getattr(connector, "requires_key", False) and not getattr(connector, "configured", True) else "sent"
