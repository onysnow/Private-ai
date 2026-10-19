"""Settings kept on the server, and what they decide: Settings › Notifications and the inbox it routes, watches on a
claim or a Red Flag, Settings › Outside lookups (defaults and each case's own), Settings › AI and research.

A person's notifications are theirs alone (keyed by who is asking). Defaults that change the app for everyone (lookup
defaults, research, run defaults for new cases) need the workstation owner or a global admin; a case's own lookups
need that case's admin.
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.reasoning import ReasoningInputError, ai_reasoning_status
from app.api.dependencies import authorize_request_resource
from app.connectors.registry import CONNECTOR_SPECS, registry
from app.core.authorization import (
    require_scope_global_admin, require_scope_investigation, require_scope_investigation_admin, scope_for_request,
)
from app.core.config import settings
from app.db.session import get_db
from app.models.domain import FactWatch, Investigation
from app.schemas.api import CaseLookupsPut, FactWatchCreate, LookupDefaultsPut, NotificationPrefsPut, ResearchSettingsPut
from app.schemas.responses import (
    FactWatchOut, InboxOut, LookupSettingsOut, NotificationPrefsOut, ResearchSettingsOut,
)
from app.services import connector_activity, notifications, preferences, run_plan, watches
from app.services.settings import connector_credential_status

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _person(request: Request) -> str:
    return scope_for_request(request).actor_id


# --- Notifications -----------------------------------------------------------------------------------------------

@router.get("/settings/notifications", response_model=NotificationPrefsOut)
def get_notification_prefs(request: Request, db: Session = Depends(get_db)) -> Any:
    return preferences.notification_prefs(db, _person(request))


@router.put("/settings/notifications", response_model=NotificationPrefsOut)
def put_notification_prefs(body: NotificationPrefsPut, request: Request, db: Session = Depends(get_db)) -> Any:
    try:
        return preferences.save_notification_prefs(db, _person(request), routes=dict(body.routes),
                                                   quiet_while_reading=body.quiet_while_reading, desktop=body.desktop)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/investigations/{investigation_id}/inbox", response_model=InboxOut)
def get_inbox(investigation_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    scope = scope_for_request(request)
    return notifications.inbox(db, investigation_id, scope.actor_id, sees_security=scope.is_global_admin)


# --- Watches on facts --------------------------------------------------------------------------------------------

@router.get("/investigations/{investigation_id}/watches", response_model=list[FactWatchOut])
def list_watches(investigation_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    return watches.listing(db, _person(request), investigation_id)


@router.post("/watches", response_model=FactWatchOut)
def create_watch(body: FactWatchCreate, request: Request, db: Session = Depends(get_db)) -> Any:
    scope = scope_for_request(request)
    now = watches.current(db, body.record_type, body.record_id)
    if now is None:
        raise HTTPException(404, "Record not found")
    require_scope_investigation(scope, now[0])
    return watches.describe(db, watches.create(db, scope.actor_id, body.record_type, body.record_id))


def _own_watch(db: Session, request: Request, fact_watch_id: str) -> FactWatch:
    row = db.get(FactWatch, fact_watch_id)
    if row is None or row.owner != _person(request):
        raise HTTPException(404, "Watch not found")
    return row


@router.post("/watches/{fact_watch_id}/seen", response_model=FactWatchOut)
def see_watch(fact_watch_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    return watches.seen(db, _own_watch(db, request, fact_watch_id))


@router.delete("/watches/{fact_watch_id}", status_code=204)
def delete_watch(fact_watch_id: str, request: Request, db: Session = Depends(get_db)) -> None:
    db.delete(_own_watch(db, request, fact_watch_id))
    db.commit()


# --- Outside lookups ---------------------------------------------------------------------------------------------

def _key_saved(provider: str) -> bool:
    if provider in CONNECTOR_SPECS:
        return bool(connector_credential_status(provider).get("configured"))
    return bool(getattr(registry.get(provider), "configured", False))


def _lookup_settings(db: Session, request: Request, investigation_id: str | None) -> dict[str, Any]:
    scope = scope_for_request(request)
    providers = registry.names()
    defaults = preferences.lookup_defaults(db, providers)
    modes = preferences.lookup_modes(db, investigation_id, providers) if investigation_id else {}
    seen = connector_activity.activity(db, providers, investigation_ids=scope.investigation_ids)
    sources = [{
        "key": p, **{k: preferences.PROVIDER_TEXT.get(p, {}).get(k, "") for k in ("label", "kind")},
        "host": preferences.provider_host(registry.get(p)), "key_saved": _key_saved(p),
        "default": defaults[p], "mode": modes.get(p), **seen["providers"][p],
    } for p in providers]
    cases = [c for c in preferences.cases_with_own_lookups(db, providers) if scope.allows(c["investigation_id"])]
    return {"sources": sources, "cases": cases, "week": seen["week"], "can_change_defaults": scope.is_global_admin}


@router.get("/settings/lookups", response_model=LookupSettingsOut)
def get_lookup_settings(request: Request, investigation_id: str | None = None, db: Session = Depends(get_db)) -> Any:
    if investigation_id and db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _lookup_settings(db, request, investigation_id)


@router.put("/settings/lookups", response_model=LookupSettingsOut)
def put_lookup_defaults(body: LookupDefaultsPut, request: Request, investigation_id: str | None = None,
                        db: Session = Depends(get_db)) -> Any:
    require_scope_global_admin(scope_for_request(request))
    try:
        preferences.save_lookup_defaults(db, registry.names(), dict(body.defaults))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return _lookup_settings(db, request, investigation_id)


@router.put("/investigations/{investigation_id}/lookups", response_model=LookupSettingsOut)
def put_case_lookups(investigation_id: str, body: CaseLookupsPut, request: Request, db: Session = Depends(get_db)) -> Any:
    require_scope_investigation_admin(scope_for_request(request), investigation_id)
    try:
        preferences.save_case_lookups(db, investigation_id, registry.names(), dict(body.modes), body.reason)
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return _lookup_settings(db, request, investigation_id)


@router.delete("/investigations/{investigation_id}/lookups", response_model=LookupSettingsOut)
def clear_case_lookups(investigation_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    require_scope_investigation_admin(scope_for_request(request), investigation_id)
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    preferences.clear_case_lookups(db, investigation_id)
    return _lookup_settings(db, request, investigation_id)


# --- AI and research ---------------------------------------------------------------------------------------------

def _research_settings(db: Session, request: Request) -> dict[str, Any]:
    scope = scope_for_request(request)
    value, row = preferences.run_profile_defaults(db)
    start = run_plan._new_case_defaults(db)
    table = run_plan.settings_table({"flags": run_plan.normalize_control_flags(start.get("flags")),
                                     "options": run_plan.normalize_run_options(start.get("options"))})
    new_case = {r["key"]: r["case_default"] for r in table}
    cases = []
    for inv in db.scalars(select(Investigation).where(Investigation.ai_run_profile.is_not(None)).order_by(Investigation.name)):
        if not scope.allows(inv.id) or not inv.ai_run_profile:
            continue
        own = run_plan.get_profile(db, inv.id)
        differs = [r["label"] for r in table if {**own["flags"], **own["options"]}.get(r["key"]) != new_case[r["key"]]]
        if differs:
            cases.append({"investigation_id": inv.id, "name": inv.name, "differs": differs,
                          "reason": own["reason"], "saved_at": own["saved_at"]})
    ai = ai_reasoning_status(settings)
    return {
        "mode": preferences.research_mode(db), "ai_enabled": bool(ai.get("enabled")), "model": ai.get("model"),
        "settings": table, "defaults_reason": row.reason if row and value else None,
        "defaults_saved_at": row.updated_at if row and value else None, "locked": run_plan.LOCKED, "cases": cases,
        "can_change_defaults": scope.is_global_admin,
    }


@router.get("/settings/research", response_model=ResearchSettingsOut)
def get_research_settings(request: Request, db: Session = Depends(get_db)) -> Any:
    return _research_settings(db, request)


@router.put("/settings/research", response_model=ResearchSettingsOut)
def put_research_settings(body: ResearchSettingsPut, request: Request, db: Session = Depends(get_db)) -> Any:
    require_scope_global_admin(scope_for_request(request))
    try:
        if body.mode is not None:
            preferences.save_research_mode(db, body.mode)
        if body.flags is not None or body.options is not None:
            preferences.save_run_profile_defaults(db, flags=body.flags, options=body.options, reason=body.reason or "")
    except (ValueError, ReasoningInputError) as exc:
        raise HTTPException(400, str(exc))
    return _research_settings(db, request)
