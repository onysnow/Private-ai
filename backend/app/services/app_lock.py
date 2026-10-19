"""Your name and the app lock (ADR-0016, mockups ACCOUNT_1, ACCOUNT_3, ACCOUNT_4).

What is kept: the name; Argon2id hashes of the passphrase, the recovery words, the PIN and each locked case's
passphrase (`argon2-cffi`); an age key pair for backups whose secret half is stored only encrypted with the
passphrase and with the recovery words (`pyrage`). Nothing here can recover a passphrase.

Sessions live in this process's memory: a restart locks every one of them. A session is unlocked by the passphrase
(or the recovery words); it locks again when idle, on Hide screen, on sleep, or on request; a PIN reopens a session
that the passphrase unlocked since the server started, until 3 wrong tries. A case locked on its own stays outside
the session's scope until its own passphrase is given in that session.
"""
from __future__ import annotations

import base64
import secrets
import threading
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.identity import LocalProfile
from app.models.investigations import Investigation

PIN_TRIES = 3
MIN_PASSPHRASE = 12
SESSION_HEADER = "x-workbench-session"
_hasher = PasswordHasher()   # Argon2id with the library's current recommended cost


class LockError(ValueError):
    """A wrong secret or a request the lock does not allow; the message is safe to show."""


# --- the profile ------------------------------------------------------------------------------------------------

def profile(db: Session) -> LocalProfile:
    row = db.get(LocalProfile, 1)
    if row is None:
        row = LocalProfile(id=1)
        db.add(row)
        db.flush()
    return row


def protected(db: Session) -> bool:
    row = db.get(LocalProfile, 1)
    return row is not None and row.protection == "passphrase" and bool(row.passphrase_hash)


def owner_name(db: Session) -> str | None:
    row = db.get(LocalProfile, 1)
    return row.display_name if row is not None else None


def set_name(db: Session, name: str) -> LocalProfile:
    clean = " ".join(name.split())
    if not clean:
        raise LockError("Type the name you sign your work with.")
    if len(clean) > 120:
        raise LockError("That name is longer than 120 characters.")
    row = profile(db)
    row.display_name = clean
    db.commit()
    return row


# --- hashing and the recovery words -----------------------------------------------------------------------------

def _hash(secret: str) -> str:
    return _hasher.hash(secret)


def _matches(stored: str | None, secret: str) -> bool:
    if not stored or not secret:
        return False
    try:
        return _hasher.verify(stored, secret)
    except (VerificationError, InvalidHashError):
        return False


def _words(phrase: str) -> str:
    """Recovery words as typed: case, spacing and accents do not matter (BIP-39 normalises to NFKD)."""
    return " ".join(unicodedata.normalize("NFKD", phrase).lower().split())


def new_recovery_words() -> list[str]:
    from mnemonic import Mnemonic

    return Mnemonic("english").generate(128).split()


def valid_recovery_words(phrase: str) -> bool:
    from mnemonic import Mnemonic

    words = _words(phrase)
    try:
        return len(words.split()) == 12 and Mnemonic("english").check(words)
    except (ValueError, LookupError):
        return False


# --- the backup key -----------------------------------------------------------------------------------------------

def _wrap(secret_key: str, by: str) -> str:
    from pyrage import passphrase

    return base64.b64encode(passphrase.encrypt(secret_key.encode(), by)).decode()


def _unwrap(wrapped: str | None, by: str) -> str:
    from pyrage import passphrase

    if not wrapped:
        raise LockError("No backup key is kept on this computer.")
    try:
        opened: bytes = passphrase.decrypt(base64.b64decode(wrapped), by)
        return opened.decode()
    except Exception as exc:  # pyrage raises its own DecryptError
        raise LockError("That does not open the backup key.") from exc


def backup_identity(row: LocalProfile, *, passphrase: str | None = None, words: str | None = None) -> str:
    """The backup key's secret half, opened with the passphrase or the recovery words."""
    if passphrase is not None:
        return _unwrap(row.identity_by_passphrase, passphrase)
    if words is not None:
        return _unwrap(row.identity_by_recovery, _words(words))
    raise LockError("Give the passphrase or the recovery words.")


# --- setting and changing the passphrase -------------------------------------------------------------------------

def check_passphrase_strength(passphrase: str) -> None:
    if len(passphrase) < MIN_PASSPHRASE:
        raise LockError(f"Use at least {MIN_PASSPHRASE} characters; four or more unrelated words are best.")


def set_up_passphrase(db: Session, passphrase: str) -> list[str]:
    """Turn on "Protect with a passphrase": returns the recovery words, which are shown once and kept nowhere."""
    from pyrage import x25519

    row = profile(db)
    if row.protection == "passphrase" and row.passphrase_hash:
        raise LockError("A passphrase is already set. Change it in Settings › Your safety.")
    check_passphrase_strength(passphrase)
    words = new_recovery_words()
    identity = x25519.Identity.generate()
    now = utcnow_naive()
    row.protection = "passphrase"
    row.passphrase_hash = _hash(passphrase)
    row.recovery_hash = _hash(" ".join(words))
    row.backup_recipient = str(identity.to_public())
    row.identity_by_passphrase = _wrap(str(identity), passphrase)
    row.identity_by_recovery = _wrap(str(identity), " ".join(words))
    row.passphrase_set_at = row.recovery_set_at = now
    db.commit()
    return words


def change_passphrase(db: Session, old: str, new: str) -> None:
    row = profile(db)
    if not _matches(row.passphrase_hash, old):
        raise LockError("That is not the current passphrase.")
    check_passphrase_strength(new)
    identity = backup_identity(row, passphrase=old)
    row.passphrase_hash = _hash(new)
    row.identity_by_passphrase = _wrap(identity, new)
    row.passphrase_set_at = utcnow_naive()
    db.commit()


def new_recovery_key(db: Session, passphrase: str) -> list[str]:
    row = profile(db)
    if not _matches(row.passphrase_hash, passphrase):
        raise LockError("That is not the passphrase.")
    identity = backup_identity(row, passphrase=passphrase)
    words = new_recovery_words()
    row.recovery_hash = _hash(" ".join(words))
    row.identity_by_recovery = _wrap(identity, " ".join(words))
    row.recovery_set_at = utcnow_naive()
    db.commit()
    return words


def recover(db: Session, words: str, new_passphrase: str) -> None:
    """Forgot the passphrase: the recovery words unlock, and a new passphrase replaces the old one."""
    row = profile(db)
    if not row.recovery_hash or not _matches(row.recovery_hash, _words(words)):
        raise LockError("Those are not the recovery words. Check each word and its order.")
    check_passphrase_strength(new_passphrase)
    identity = backup_identity(row, words=words)
    row.passphrase_hash = _hash(new_passphrase)
    row.identity_by_passphrase = _wrap(identity, new_passphrase)
    row.passphrase_set_at = utcnow_naive()
    db.commit()


def turn_off(db: Session, passphrase: str) -> None:
    """Back to "Nothing to unlock". The backup key is kept, so backups made while it was on still open."""
    row = profile(db)
    if not _matches(row.passphrase_hash, passphrase):
        raise LockError("That is not the passphrase.")
    row.protection = "none"
    row.pin_hash = None
    row.quick_pin = False
    db.commit()


def set_pin(db: Session, pin: str | None) -> None:
    row = profile(db)
    if pin is None:
        row.pin_hash, row.quick_pin = None, False
    else:
        if not (pin.isdigit() and 4 <= len(pin) <= 8):
            raise LockError("A PIN is 4 to 8 digits.")
        row.pin_hash, row.quick_pin = _hash(pin), True
    db.commit()


def update_locking(db: Session, *, idle_minutes: int | None = None, lock_on_hide: bool | None = None,
                   lock_on_sleep: bool | None = None, quick_pin: bool | None = None) -> LocalProfile:
    row = profile(db)
    if idle_minutes is not None:
        if idle_minutes not in (0, 5, 10, 30):
            raise LockError("Lock after 5, 10 or 30 minutes, or never.")
        row.idle_minutes = idle_minutes
    if lock_on_hide is not None:
        row.lock_on_hide = lock_on_hide
    if lock_on_sleep is not None:
        row.lock_on_sleep = lock_on_sleep
    if quick_pin is not None:
        if quick_pin and not row.pin_hash:
            raise LockError("Set a PIN first.")
        row.quick_pin = quick_pin
    db.commit()
    return row


# --- sessions -----------------------------------------------------------------------------------------------------

@dataclass
class LockSession:
    unlocked: bool = False
    by_passphrase: bool = False          # unlocked with the passphrase since the server started: the PIN may reopen it
    last_seen: datetime = field(default_factory=utcnow_naive)
    pin_failures: int = 0
    open_cases: set[str] = field(default_factory=set)


_sessions: dict[str, LockSession] = {}
_guard = threading.Lock()


def start_session(db: Session) -> tuple[str, LockSession]:
    token = secrets.token_urlsafe(32)
    session = LockSession(unlocked=not protected(db))
    with _guard:
        _sessions[token] = session
    return token, session


def get_session(token: str | None) -> LockSession | None:
    if not token:
        return None
    with _guard:
        return _sessions.get(token)


def forget_sessions() -> None:
    """Lock everything (tests, and a passphrase reset that must not leave old sessions open)."""
    with _guard:
        _sessions.clear()


def is_open(db: Session, session: LockSession | None) -> bool:
    """Whether the session may use the app now; an idle one is locked here, on first sight."""
    if not protected(db):
        return True
    if session is None or not session.unlocked:
        return False
    minutes = profile(db).idle_minutes
    if minutes and utcnow_naive() - session.last_seen > timedelta(minutes=minutes):
        session.unlocked = False
        return False
    return True


def touch(session: LockSession) -> None:
    session.last_seen = utcnow_naive()


def lock(session: LockSession) -> None:
    session.unlocked = False


def unlock_with_passphrase(db: Session, session: LockSession, passphrase: str) -> None:
    if not _matches(profile(db).passphrase_hash, passphrase):
        raise LockError("That is not the passphrase.")
    session.unlocked = session.by_passphrase = True
    session.pin_failures = 0
    touch(session)


def pin_allowed(db: Session, session: LockSession | None) -> bool:
    row = profile(db)
    return bool(session and row.quick_pin and row.pin_hash and session.by_passphrase and session.pin_failures < PIN_TRIES)


def unlock_with_pin(db: Session, session: LockSession, pin: str) -> None:
    if not pin_allowed(db, session):
        raise LockError("Use the passphrase.")
    if not _matches(profile(db).pin_hash, pin):
        session.pin_failures += 1
        left = PIN_TRIES - session.pin_failures
        raise LockError(f"Wrong PIN. {left} {'try' if left == 1 else 'tries'} left." if left else "Wrong PIN. Use the passphrase now.")
    session.unlocked = True
    session.pin_failures = 0
    touch(session)


# --- cases locked on their own --------------------------------------------------------------------------------------

def locked_case_ids(db: Session) -> set[str]:
    return {i for i, lock_ in db.execute(select(Investigation.id, Investigation.case_lock)) if lock_}


def closed_cases(db: Session, session: LockSession | None) -> set[str]:
    """Cases locked on their own and not opened in this session."""
    return locked_case_ids(db) - (session.open_cases if session else set())


def lock_case(db: Session, investigation_id: str, passphrase: str, *, old: str | None = None) -> None:
    inv = db.get(Investigation, investigation_id)
    if inv is None:
        raise LockError("No such case.")
    if inv.case_lock and not _matches(inv.case_lock.get("hash"), old or ""):
        raise LockError("That is not this case's current passphrase.")
    check_passphrase_strength(passphrase)
    inv.case_lock = {"hash": _hash(passphrase), "set_at": utcnow_naive().isoformat()}
    db.commit()


def unlock_case_for_good(db: Session, investigation_id: str, passphrase: str) -> None:
    inv = db.get(Investigation, investigation_id)
    if inv is None or not inv.case_lock:
        raise LockError("That case is not locked.")
    if not _matches(inv.case_lock.get("hash"), passphrase):
        raise LockError("That is not this case's passphrase.")
    inv.case_lock = None
    db.commit()


def open_case(db: Session, session: LockSession, investigation_id: str, passphrase: str) -> None:
    inv = db.get(Investigation, investigation_id)
    if inv is None or not inv.case_lock:
        raise LockError("That case is not locked.")
    if not _matches(inv.case_lock.get("hash"), passphrase):
        raise LockError("That is not this case's passphrase.")
    session.open_cases.add(investigation_id)


def close_case(session: LockSession, investigation_id: str) -> None:
    session.open_cases.discard(investigation_id)


def unsigned_decisions(db: Session) -> int:
    """Decisions saved before names were kept: they stay "a person" (first open says how many, ACCOUNT_1)."""
    from sqlalchemy import func

    from app.models.claims import ClaimEvidenceLink, ClaimReviewEvent
    from app.models.documents import ExtractionCandidate

    human = func.upper(func.coalesce(ClaimReviewEvent.reviewer_type, "HUMAN")).in_(("HUMAN", "LEGAL_COUNSEL"))
    counts = (select(func.count()).select_from(ClaimEvidenceLink).where(ClaimEvidenceLink.decided_by_name.is_(None)),
              select(func.count()).select_from(ClaimReviewEvent).where(ClaimReviewEvent.decided_by_name.is_(None), human),
              select(func.count()).select_from(ExtractionCandidate).where(
                  ExtractionCandidate.decided_by_name.is_(None), ExtractionCandidate.review_status.is_not(None),
                  ExtractionCandidate.review_status != "proposed"))
    return sum(int(db.execute(q).scalar_one()) for q in counts)


def summary(db: Session, session: LockSession | None) -> dict[str, Any]:
    """What the screens need. While locked, only that it is locked and how to open it: no name, no cases."""
    row = profile(db)
    open_ = is_open(db, session)
    base: dict[str, Any] = {"protection": row.protection if row.passphrase_hash else "none", "locked": not open_,
                            "pin": pin_allowed(db, session) if not open_ else bool(row.quick_pin and row.pin_hash)}
    if not open_:
        return base
    cases = db.execute(select(Investigation.id, Investigation.name, Investigation.case_lock)
                       .where(Investigation.case_lock.is_not(None))).all()
    return {**base, "name": row.display_name, "idle_minutes": row.idle_minutes, "lock_on_hide": row.lock_on_hide,
            "lock_on_sleep": row.lock_on_sleep, "quick_pin": row.quick_pin, "pin_set": bool(row.pin_hash),
            "passphrase_set_at": row.passphrase_set_at, "recovery_set_at": row.recovery_set_at,
            "backups_encrypted": bool(row.backup_recipient and row.protection == "passphrase"),
            "disk_answer": row.disk_answer,
            "unsigned_decisions": None if row.display_name else unsigned_decisions(db),
            "locked_cases": [{"id": i, "name": n, "set_at": (lk or {}).get("set_at"),
                              "open": bool(session and i in session.open_cases)} for i, n, lk in cases]}
