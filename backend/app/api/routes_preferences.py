"""Settings kept on the server, and what they decide: Settings › Notifications and the inbox it routes, watches on a
claim or a Red Flag, Settings › Outside lookups (defaults and each case's own), Settings › AI and research.

A person's notifications are theirs alone (keyed by who is asking). Defaults that change the app for everyone (lookup
defaults, research, run defaults for new cases) need the workstation owner or a global admin; a case's own lookups
need that case's admin.
"""
from typing import Any, Literal

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
from app.models.domain import FactWatch, Investigation, PushSubscription, SavedQuestion
from app.schemas.api import (
    CaseLookupsPut, CaseResearchPut, FactWatchCreate, LookupDefaultsPut, NotificationChannelPut, NotificationPrefsPut, PushSubscriptionIn,
    PushSubscriptionRemove, ResearchSettingsPut, SavedQuestionCreate,
)
from app.schemas.responses import (
    CaseResearchOut, FactWatchOut, InboxOut, KeyCheckOut, LookupSettingsOut, NotificationPrefsOut, NotificationTestOut, ResearchSettingsOut, SavedQuestionOut,
    upstream,
)
from app.services import connector_activity, delivery, notifications, outbound, preferences, run_plan, saved_questions, source_freshness, watches
from app.services.settings import connector_credential_status

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _person(request: Request) -> str:
    return scope_for_request(request).actor_id


# --- Notifications -----------------------------------------------------------------------------------------------

def _notification_prefs(db: Session, person: str) -> dict[str, Any]:
    return {**preferences.notification_prefs(db, person), "outside": delivery.channel_prefs(db, person),
            "server": delivery.server_status(),
            "push_devices": len(list(db.scalars(select(PushSubscription.id).where(PushSubscription.person == person))))}


@router.get("/settings/notifications", response_model=NotificationPrefsOut)
def get_notification_prefs(request: Request, db: Session = Depends(get_db)) -> Any:
    return _notification_prefs(db, _person(request))


@router.put("/settings/notifications", response_model=NotificationPrefsOut)
def put_notification_prefs(body: NotificationPrefsPut, request: Request, db: Session = Depends(get_db)) -> Any:
    try:
        preferences.save_notification_prefs(db, _person(request), routes=dict(body.routes), backup_days=body.backup_days,
                                            quiet_while_reading=body.quiet_while_reading, desktop=body.desktop)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return _notification_prefs(db, _person(request))


@router.put("/settings/notifications/channels/{channel}", response_model=NotificationPrefsOut)
def put_notification_channel(channel: Literal["email", "phone", "webpush"], body: NotificationChannelPut, request: Request,
                             db: Session = Depends(get_db)) -> Any:
    try:
        delivery.save_channel(db, _person(request), channel, mode=body.mode, address=body.address, url=body.url)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return _notification_prefs(db, _person(request))


@router.post("/settings/notifications/channels/{channel}/test", response_model=NotificationTestOut, responses=upstream("The channel", 502))
def test_notification_channel(channel: Literal["email", "phone", "webpush"], request: Request, db: Session = Depends(get_db)) -> Any:
    try:
        sent = delivery.send_test(db, _person(request), channel)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"The test did not go out: {exc}") from exc
    return {"channel": channel, "sent": sent}


@router.post("/settings/push-subscriptions", response_model=NotificationPrefsOut)
def add_push_subscription(body: PushSubscriptionIn, request: Request, db: Session = Depends(get_db)) -> Any:
    try:
        delivery.add_subscription(db, _person(request), body.endpoint, body.keys.model_dump(), body.label)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return _notification_prefs(db, _person(request))


@router.post("/settings/push-subscriptions/remove", response_model=NotificationPrefsOut)
def remove_push_subscription(body: PushSubscriptionRemove, request: Request, db: Session = Depends(get_db)) -> Any:
    delivery.remove_subscription(db, _person(request), body.endpoint)
    return _notification_prefs(db, _person(request))


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
        "key_check": ({"provider": p, **kc} if (kc := source_freshness.last_key_check(db, p)) else None),
    } for p in providers]
    cases = [c for c in preferences.cases_with_own_lookups(db, providers) if scope.allows(c["investigation_id"])]
    week = outbound.recent(db, days=7, investigation_ids=scope.investigation_ids)
    return {"sources": sources, "cases": cases, "week": week, "can_change_defaults": scope.is_global_admin}


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


# --- Saved questions and a case's own research mode --------------------------------------------------------------

def _case_research(db: Session, investigation_id: str) -> dict[str, Any]:
    mode, reason = saved_questions.case_research_mode(db, investigation_id)
    own = preferences._get(db, "case", investigation_id, "research") is not None
    return {"investigation_id": investigation_id, "mode": mode, "own": own, "reason": reason,
            "default": preferences.research_mode(db), "ai_enabled": bool(ai_reasoning_status(settings).get("enabled")),
            "questions": [saved_questions.serialize(q) for q in saved_questions.listing(db, investigation_id)]}


@router.get("/investigations/{investigation_id}/research", response_model=CaseResearchOut)
def get_case_research(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    return _case_research(db, investigation_id)


@router.put("/investigations/{investigation_id}/research", response_model=CaseResearchOut)
def put_case_research(investigation_id: str, body: CaseResearchPut, request: Request, db: Session = Depends(get_db)) -> Any:
    require_scope_investigation_admin(scope_for_request(request), investigation_id)
    try:
        saved_questions.save_case_research_mode(db, investigation_id, body.mode, body.reason)
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return _case_research(db, investigation_id)


@router.post("/investigations/{investigation_id}/saved-questions", response_model=SavedQuestionOut)
def save_question(investigation_id: str, body: SavedQuestionCreate, request: Request, db: Session = Depends(get_db)) -> Any:
    try:
        row = saved_questions.create(db, investigation_id, module=body.module, question=body.question,
                                     working_theory=body.working_theory, created_by=_person(request))
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return saved_questions.serialize(row)


def _saved(db: Session, saved_question_id: str) -> SavedQuestion:
    row = db.get(SavedQuestion, saved_question_id)
    if row is None:
        raise HTTPException(404, "Saved question not found")
    return row


@router.delete("/saved-questions/{saved_question_id}", status_code=204)
def delete_saved_question(saved_question_id: str, db: Session = Depends(get_db)) -> None:
    db.delete(_saved(db, saved_question_id))
    db.commit()


@router.post("/saved-questions/{saved_question_id}/run", response_model=SavedQuestionOut)
def run_saved_question(saved_question_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    from app.ai.reasoning import ReasoningInputError as _Refused

    row = _saved(db, saved_question_id)
    if not settings.enable_ai_features or not (settings.ai_provider or "").strip():
        raise HTTPException(400, "No model is set up on this deployment")
    try:
        saved_questions.queue_run(db, row, actor_id=_person(request))
    except _Refused as exc:
        raise HTTPException(400, str(exc))
    db.refresh(row)
    return saved_questions.serialize(row)



@router.post("/settings/connectors/{provider}/check", response_model=KeyCheckOut, responses=upstream("The source", 502))
def check_connector_key(provider: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """Ask the source whether it accepts its key, sending no search (Settings › Connector keys, "Check the key")."""
    require_scope_global_admin(scope_for_request(request))
    try:
        return {"provider": provider, **source_freshness.check_key(db, provider)}
    except LookupError as exc:
        raise HTTPException(404, str(exc))
