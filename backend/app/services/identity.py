from __future__ import annotations

import hashlib
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.authorization import AuthorizationScope
from app.models.domain import AppUser, InvestigationMembership
from app.core.time import utcnow_naive

VALID_MEMBERSHIP_ROLES = {"viewer", "reporter", "admin"}


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def scope_for_persisted_token(db: Session, token: str, *, mark_used: bool = False) -> AuthorizationScope | None:
    """Resolve a bearer token without storing plaintext credentials in the database."""
    if not token:
        return None
    user = db.scalar(select(AppUser).where(AppUser.token_digest == token_digest(token)))
    if user is None or user.disabled or user.token_revoked_at is not None:
        return None
    if mark_used:
        user.token_last_used_at = utcnow_naive()
        db.commit()
    if user.global_role == "admin":
        return AuthorizationScope(actor_id=user.id, investigation_ids=None, role="admin")

    memberships = db.scalars(
        select(InvestigationMembership).where(InvestigationMembership.user_id == user.id)
    ).all()
    roles = tuple(sorted(
        (membership.investigation_id, membership.role)
        for membership in memberships
        if membership.role in VALID_MEMBERSHIP_ROLES
    ))
    return AuthorizationScope(
        actor_id=user.id,
        investigation_ids=frozenset(investigation_id for investigation_id, _role in roles),
        role="member",
        investigation_roles=roles,
    )
