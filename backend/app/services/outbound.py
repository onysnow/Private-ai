"""What leaves this computer, and whether it may (research Keep §7 and §14; mockup KEEP-safety-and-data).

Every call to an outside service goes through two steps here, at the place the call is made:

1. ``require_allowed`` reads the case's mode for that service (Off / Ask first / Automatic) and refuses the call
   before anything is sent: Off refuses every call; Ask first lets through only what a person started (a search they
   typed, an entity they chose to enrich, an AI run they started), so an automatic check never sends on its own;
   Automatic lets both through.
2. ``record`` adds one row to the append-only outbound log with the value sent word for word, before the request
   goes out (a request that then fails has still left the computer).

The outside services are the registered connectors (app/connectors/registry.py) and an AI model that does not run on
this computer (app/ai/llm_client.py). A model on this computer sends nothing out and is not logged.
"""
from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.connectors.base import Connector
from app.connectors.registry import CONNECTOR_SPECS, registry
from app.core.authorization import current_authorization_scope
from app.core.config import Settings
from app.core.time import utcnow_naive
from app.models.safety import OutboundRequest, ServiceMode

OUTSIDE_AI = "outside_ai"
MODES = ("OFF", "ASK", "AUTOMATIC")
# The starting mode of every service in every case. Ask first keeps every call a person makes working and stops
# automatic ones. Which default the app should have is Ony's open question (docs/handoff/04_OPEN_ITEMS.md item 3).
DEFAULT_MODE = "ASK"

# What each service is called on screen and what it is for. A connector added to the registry without a line here
# is still governed and logged, under its own name.
SERVICE_TEXT: dict[str, tuple[str, str]] = {
    "aleph": ("Aleph", "Records and leaks archive (OCCRP)"),
    "opensanctions": ("OpenSanctions", "Sanctions and officials"),
    "firecrawl": ("Firecrawl", "Web search"),
    OUTSIDE_AI: ("Outside AI services", "An AI model that is not on this computer"),
}
MODE_WORDS = {"OFF": "Off", "ASK": "Ask first", "AUTOMATIC": "Automatic"}


class ServiceRefused(Exception):
    """The case's mode for this service does not let the call go out. Nothing was sent."""


def services() -> list[str]:
    """Every outside service: each connector (registered in the table, or at run time) and the outside AI."""
    return [*sorted(set(CONNECTOR_SPECS) | set(registry.names())), OUTSIDE_AI]


def service_name(service: str) -> str:
    return SERVICE_TEXT.get(service, (service[:1].upper() + service[1:], ""))[0]


def _provider(settings: Settings) -> str:
    return (settings.ai_provider or "").strip().lower()


def ai_is_outside(settings: Settings) -> bool:
    """Whether the configured AI model runs somewhere other than this computer."""
    from app.ai.llm_client import is_local_endpoint

    provider = _provider(settings)
    if provider in ("anthropic", "openai"):
        return True
    if provider == "ollama":
        model = settings.ollama_model.strip()
        return not is_local_endpoint(settings.ollama_base_url) or model.split(":")[-1].endswith("cloud")
    return False


def outside_ai_allowed(settings: Settings) -> bool:
    """Whether this server lets case material go to an AI model elsewhere at all (its settings file decides)."""
    return bool(settings.ai_allow_remote_endpoint) or (bool(settings.enable_ai_features) and _provider(settings) in ("anthropic", "openai"))


def locked_reason(service: str, settings: Settings) -> str | None:
    """Why a service's mode cannot be changed from the case, or None."""
    if service == OUTSIDE_AI and not outside_ai_allowed(settings):
        return "Not allowed on this server"
    return None


def stored_modes(db: Session, investigation_id: str) -> dict[str, str]:
    rows = db.scalars(select(ServiceMode).where(ServiceMode.investigation_id == investigation_id))
    return {row.service: row.mode for row in rows}


def mode_of(db: Session, investigation_id: str, service: str, settings: Settings) -> str:
    if locked_reason(service, settings):
        return "OFF"
    return stored_modes(db, investigation_id).get(service, DEFAULT_MODE)


def set_mode(db: Session, investigation_id: str, service: str, mode: str, settings: Settings) -> ServiceMode:
    if service not in services():
        raise LookupError(f"Unknown service {service!r}")
    if mode not in MODES:
        raise ValueError(f"Mode must be one of {list(MODES)}")
    reason = locked_reason(service, settings)
    if reason:
        raise ValueError(f"{service_name(service)}: {reason.lower()}, so it stays Off")
    row = db.scalar(select(ServiceMode).where(ServiceMode.investigation_id == investigation_id, ServiceMode.service == service))
    if row is None:
        row = ServiceMode(investigation_id=investigation_id, service=service, mode=mode)
        db.add(row)
    else:
        row.mode = mode
        row.updated_at = utcnow_naive()
    db.commit()
    db.refresh(row)
    return row


def require_allowed(db: Session, investigation_id: str, service: str, settings: Settings, *, started_by: str = "person") -> None:
    """Refuse the call before anything leaves when the case's mode does not allow it."""
    mode = mode_of(db, investigation_id, service, settings)
    name = service_name(service)
    if mode == "OFF":
        why = locked_reason(service, settings)
        raise ServiceRefused(f"{name} is Off for this case{f' ({why.lower()})' if why else ''}. Nothing was sent. "
                             "Change it in Keep › Safety & data.")
    if mode == "ASK" and started_by != "person":
        raise ServiceRefused(f"{name} is set to Ask first for this case, so an automatic check may not send anything. "
                             "Nothing was sent.")


def _actor() -> str:
    scope = current_authorization_scope()
    return scope.actor_id if scope is not None else "local-owner"


def record(db: Session, investigation_id: str, service: str, *, kind: str, value: str, value_kind: str, reason: str,
           started_by: str = "person", documents: int = 0) -> OutboundRequest:
    """One row in the append-only outbound log, committed before the request goes out."""
    row = OutboundRequest(investigation_id=investigation_id, service=service, kind=kind, value_sent=value,
                          value_kind=value_kind[:64], reason=reason[:255], started_by=started_by, actor_id=_actor(),
                          documents_sent=documents)
    db.add(row)
    db.commit()
    return row


def connector_will_send(connector: Any) -> bool:
    """A connector that needs a key it does not have refuses before sending (OpenSanctions); others send anyway."""
    return bool(getattr(connector, "configured", True)) or not hasattr(connector, "_require_key")


def enrichment_value(connector: Any, entity: dict) -> tuple[str, str]:
    """What a connector's enrich() sends for an entity: the entity itself for a connector with its own matching
    (OpenSanctions sends schema and properties), else the search text the base class builds from it."""
    what = re.sub(r"(?<!^)(?=[A-Z])", " ", str(entity.get("schema") or "entity")).lower()  # LegalEntity -> legal entity
    if type(connector).enrich is not Connector.enrich:
        sent = {"schema": entity.get("schema"), "properties": entity.get("properties") or {}}
        return json.dumps(sent, ensure_ascii=False, sort_keys=True), f"{what} details"
    return connector.entity_query(entity), f"{what} search"


def documents_in_packet(packet: dict) -> int:
    """How many document passages an AI packet carries (citations of documents and their chunks)."""
    seen = {(c.get("record_type"), c.get("record_id")) for c in packet.get("citations") or []
            if "document" in str(c.get("record_type") or "") or "chunk" in str(c.get("record_type") or "")}
    return len(seen)


def guard_ai(db: Session, investigation_id: str, settings: Settings) -> None:
    """Before an AI run builds its packet: refuse when the model is elsewhere and the case does not allow it."""
    if ai_is_outside(settings):
        require_allowed(db, investigation_id, OUTSIDE_AI, settings)


def record_ai_call(db: Session, investigation_id: str, settings: Settings, *, user_prompt: str, system_prompt: str,
                   packet: dict, module: str) -> None:
    """Log what an AI call to a model elsewhere sends: the case material word for word. The suite's own instructions
    (the system prompt) go too; they are not case material and are counted, not copied."""
    if not ai_is_outside(settings):
        return
    record(db, investigation_id, OUTSIDE_AI, kind="ai", value=user_prompt, value_kind="question and case passages",
           reason=f"AI run ({module}) to {_provider(settings)}; with the suite's instructions ({len(system_prompt)} characters)",
           documents=documents_in_packet(packet))
