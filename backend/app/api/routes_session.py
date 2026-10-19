"""Your name and the app lock (ADR-0016): /session/* opens and closes this browser's session (not gated by the
lock), /me/* changes the name, the passphrase, the PIN, the locking settings and locked cases (gated: the app must
be unlocked). Both answer only requests from this computer: the lock belongs to its owner, and people with their
own keys (ADR-0002) are not behind it.
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.access import request_is_local_request
from app.core.config import settings
from app.db.session import get_db
from app.models.investigations import Investigation
from app.schemas.api import (
    CaseLockIn, ChangePassphraseIn, DiskAnswerIn, LockingIn, LockReasonIn, NameIn, PinIn, PinSetIn, RecoverIn, SecretIn,
)
from app.schemas.responses import LockStateOut, RecoveryWordsOut
from app.services import app_lock
from app.services.disk_encryption import disk_status

router = APIRouter(prefix="/api")


def _local(request: Request) -> None:
    if not request_is_local_request(request):
        raise HTTPException(403, "Only on the computer the app runs on")


def _session(request: Request) -> app_lock.LockSession:
    session = app_lock.get_session(request.headers.get(app_lock.SESSION_HEADER))
    if session is None:
        raise HTTPException(409, "This browser has no session: start one first")
    return session


def _refused(exc: app_lock.LockError) -> HTTPException:
    return HTTPException(400, str(exc))


def _disk(db: Session) -> dict[str, Any]:
    row = app_lock.profile(db)
    found = dict(disk_status(settings.document_storage_dir))
    if found["state"] == "unknown" and row.disk_answer in ("encrypted", "not_encrypted"):
        found.update(state=row.disk_answer, answered=True)
    return found


def _state(db: Session, lock_session: app_lock.LockSession | None, token: str | None = None) -> dict[str, Any]:
    state = {**app_lock.summary(db, lock_session), "known": lock_session is not None}
    if not state["locked"]:
        state["disk"] = _disk(db)
    return {**state, "session": token} if token else state


# --- /session: not behind the lock -------------------------------------------------------------------------------

@router.post("/session/start", response_model=LockStateOut)
def start_session(request: Request, db: Session = Depends(get_db)) -> Any:
    _local(request)
    token, session = app_lock.start_session(db)
    return _state(db, session, token)


@router.get("/session", response_model=LockStateOut)
def session_state(request: Request, db: Session = Depends(get_db)) -> Any:
    _local(request)
    return _state(db, app_lock.get_session(request.headers.get(app_lock.SESSION_HEADER)))


@router.post("/session/unlock", response_model=LockStateOut)
def unlock(body: SecretIn, request: Request, db: Session = Depends(get_db)) -> Any:
    _local(request)
    session = _session(request)
    try:
        app_lock.unlock_with_passphrase(db, session, body.passphrase)
    except app_lock.LockError as exc:
        raise _refused(exc)
    return _state(db, session)


@router.post("/session/unlock-pin", response_model=LockStateOut)
def unlock_pin(body: PinIn, request: Request, db: Session = Depends(get_db)) -> Any:
    _local(request)
    session = _session(request)
    try:
        app_lock.unlock_with_pin(db, session, body.pin)
    except app_lock.LockError as exc:
        raise _refused(exc)
    return _state(db, session)


@router.post("/session/recover", response_model=LockStateOut)
def recover(body: RecoverIn, request: Request, db: Session = Depends(get_db)) -> Any:
    """Forgot the passphrase: the recovery words, and a new passphrase."""
    _local(request)
    session = _session(request)
    try:
        app_lock.recover(db, body.words, body.new_passphrase)
        app_lock.unlock_with_passphrase(db, session, body.new_passphrase)
    except app_lock.LockError as exc:
        raise _refused(exc)
    return _state(db, session)


@router.post("/session/lock", response_model=LockStateOut)
def lock(request: Request, body: LockReasonIn | None = None, db: Session = Depends(get_db)) -> Any:
    _local(request)
    session = _session(request)
    app_lock.lock(session)
    return _state(db, session)


@router.post("/session/active", status_code=204)
def active(request: Request, db: Session = Depends(get_db)) -> None:
    """The screen saw you working: what the idle lock measures from (polling alone does not count)."""
    _local(request)
    session = _session(request)
    if app_lock.is_open(db, session):
        app_lock.touch(session)


@router.post("/session/cases/{investigation_id}/open", response_model=LockStateOut)
def open_case(investigation_id: str, body: SecretIn, request: Request, db: Session = Depends(get_db)) -> Any:
    _local(request)
    session = _session(request)
    if not app_lock.is_open(db, session):
        raise HTTPException(423, "The app is locked.")
    try:
        app_lock.open_case(db, session, investigation_id, body.passphrase)
    except app_lock.LockError as exc:
        raise _refused(exc)
    return _state(db, session)


@router.post("/session/cases/{investigation_id}/close", response_model=LockStateOut)
def close_case(investigation_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    _local(request)
    session = _session(request)
    app_lock.close_case(session, investigation_id)
    return _state(db, session)


def _reopened_scope(request: Request, investigation_id: str) -> None:
    """The case was opened during this request: the scope the gate set at its start still lists it as closed."""
    from dataclasses import replace

    from app.core.authorization import current_authorization_scope, set_current_authorization_scope

    scope = current_authorization_scope()
    if scope is not None and investigation_id in scope.closed_investigation_ids:
        set_current_authorization_scope(replace(scope, closed_investigation_ids=scope.closed_investigation_ids - {investigation_id}))


# --- /me: behind the lock -----------------------------------------------------------------------------------------

def _me(request: Request) -> app_lock.LockSession | None:
    _local(request)
    return app_lock.get_session(request.headers.get(app_lock.SESSION_HEADER))


@router.get("/me", response_model=LockStateOut)
def me(request: Request, db: Session = Depends(get_db)) -> Any:
    return _state(db, _me(request))


@router.put("/me/name", response_model=LockStateOut)
def set_name(body: NameIn, request: Request, db: Session = Depends(get_db)) -> Any:
    session = _me(request)
    try:
        app_lock.set_name(db, body.name)
    except app_lock.LockError as exc:
        raise _refused(exc)
    return _state(db, session)


@router.post("/me/protection", response_model=RecoveryWordsOut)
def turn_on(body: SecretIn, request: Request, db: Session = Depends(get_db)) -> Any:
    """Protect with a passphrase: returns the recovery words, once. This browser stays unlocked."""
    session = _me(request)
    try:
        words = app_lock.set_up_passphrase(db, body.passphrase)
        if session is not None:
            app_lock.unlock_with_passphrase(db, session, body.passphrase)
    except app_lock.LockError as exc:
        raise _refused(exc)
    return {"words": words}


@router.post("/me/protection/off", response_model=LockStateOut)
def turn_off(body: SecretIn, request: Request, db: Session = Depends(get_db)) -> Any:
    session = _me(request)
    try:
        app_lock.turn_off(db, body.passphrase)
    except app_lock.LockError as exc:
        raise _refused(exc)
    return _state(db, session)


@router.post("/me/passphrase", response_model=LockStateOut)
def change_passphrase(body: ChangePassphraseIn, request: Request, db: Session = Depends(get_db)) -> Any:
    session = _me(request)
    try:
        app_lock.change_passphrase(db, body.old, body.new)
    except app_lock.LockError as exc:
        raise _refused(exc)
    return _state(db, session)


@router.post("/me/recovery-key", response_model=RecoveryWordsOut)
def new_recovery_key(body: SecretIn, request: Request, db: Session = Depends(get_db)) -> Any:
    _me(request)
    try:
        return {"words": app_lock.new_recovery_key(db, body.passphrase)}
    except app_lock.LockError as exc:
        raise _refused(exc)


@router.put("/me/pin", response_model=LockStateOut)
def set_pin(body: PinSetIn, request: Request, db: Session = Depends(get_db)) -> Any:
    session = _me(request)
    try:
        app_lock.set_pin(db, body.pin)
    except app_lock.LockError as exc:
        raise _refused(exc)
    return _state(db, session)


@router.put("/me/locking", response_model=LockStateOut)
def locking(body: LockingIn, request: Request, db: Session = Depends(get_db)) -> Any:
    session = _me(request)
    try:
        app_lock.update_locking(db, **body.model_dump())
    except app_lock.LockError as exc:
        raise _refused(exc)
    return _state(db, session)


@router.put("/me/disk", response_model=LockStateOut)
def disk_answer(body: DiskAnswerIn, request: Request, db: Session = Depends(get_db)) -> Any:
    session = _me(request)
    if body.answer not in (None, "encrypted", "not_encrypted"):
        raise HTTPException(400, "answer must be encrypted, not_encrypted or empty")
    app_lock.profile(db).disk_answer = body.answer
    db.commit()
    return _state(db, session)


@router.put("/me/cases/{investigation_id}/lock", response_model=LockStateOut)
def lock_case(investigation_id: str, body: CaseLockIn, request: Request, db: Session = Depends(get_db)) -> Any:
    """Lock a case on its own, or change its passphrase (the old one is asked)."""
    session = _me(request)
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    try:
        app_lock.lock_case(db, investigation_id, body.passphrase, old=body.old)
    except app_lock.LockError as exc:
        raise _refused(exc)
    if session is not None:
        app_lock.close_case(session, investigation_id)
    return _state(db, session)


@router.post("/me/cases/{investigation_id}/unlock-for-good", response_model=LockStateOut)
def remove_case_lock(investigation_id: str, body: SecretIn, request: Request, db: Session = Depends(get_db)) -> Any:
    session = _me(request)
    if session is None:
        raise HTTPException(409, "This browser has no session: start one first")
    try:
        # Opened first: a closed case is outside the request's scope, and the write guard refuses changes to it.
        app_lock.open_case(db, session, investigation_id, body.passphrase)
        _reopened_scope(request, investigation_id)
        app_lock.unlock_case_for_good(db, investigation_id, body.passphrase)
    except app_lock.LockError as exc:
        raise _refused(exc)
    return _state(db, session)
