from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Iterable

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.core.access import request_is_local_request
from app.core.config import settings
from app.services.security import parse_csv


@dataclass(frozen=True)
class AuthorizationScope:
    """The investigations one authenticated request may access.

    ``investigation_ids=None`` means unrestricted. A concrete frozenset is a
    fail-closed allowlist. The local single-user workstation remains unrestricted;
    remote shared-bearer access can be narrowed with JW_API_AUTH_INVESTIGATION_IDS.

    Two independent remote-auth paths feed this scope -- persisted per-user
    tokens (app/services/identity.py) and the shared JW_API_AUTH_TOKEN
    fallback -- and both are meant to coexist permanently as different
    tiers rather than one migrating away. See
    docs/adr/0002-authorization-two-tier-end-state.md (STRUCT-0023) before
    changing either path.
    """

    actor_id: str
    investigation_ids: frozenset[str] | None = None
    role: str = "owner"
    investigation_roles: tuple[tuple[str, str], ...] = ()

    @property
    def unrestricted(self) -> bool:
        return self.investigation_ids is None

    def allows(self, investigation_id: str | None) -> bool:
        if not investigation_id:
            return False
        # Written as `is None` (not `self.unrestricted`) so mypy can narrow
        # investigation_ids to frozenset[str] on the right side of `or` --
        # the two are equivalent by construction (STRUCT-0013), but going
        # through the property loses that narrowing for the type checker.
        return self.investigation_ids is None or investigation_id in self.investigation_ids

    def role_for(self, investigation_id: str) -> str:
        if self.unrestricted:
            return self.role
        return dict(self.investigation_roles).get(investigation_id, self.role)

    def allows_write(self, investigation_id: str) -> bool:
        return self.allows(investigation_id) and self.role_for(investigation_id) in {"owner", "admin", "reporter", "shared"}

    def allows_admin(self, investigation_id: str) -> bool:
        return self.allows(investigation_id) and self.role_for(investigation_id) in {"owner", "admin"}

    @property
    def is_global_admin(self) -> bool:
        return self.unrestricted and self.role in {"owner", "admin"}


class InvestigationAuthorizationError(PermissionError):
    """Raised when a scoped principal attempts to mutate another investigation."""


def ensure_scope_allows_ids(scope: AuthorizationScope | None, investigation_ids: Iterable[str]) -> None:
    if scope is None or scope.unrestricted:
        return
    denied = sorted({value for value in investigation_ids if value and not scope.allows(value)})
    if denied:
        raise InvestigationAuthorizationError("Investigation access denied")

def ensure_scope_can_mutate_ids(scope: AuthorizationScope | None, investigation_ids: Iterable[str]) -> None:
    if scope is None:
        return
    denied = sorted({value for value in investigation_ids if value and not scope.allows_write(value)})
    if denied:
        raise InvestigationAuthorizationError("Investigation write access denied")


_current_scope: ContextVar[AuthorizationScope | None] = ContextVar("jw_authorization_scope", default=None)


def current_authorization_scope() -> AuthorizationScope | None:
    """Return the request authorization scope, if code is running inside a request."""
    return _current_scope.get()


def set_current_authorization_scope(scope: AuthorizationScope) -> Token:
    return _current_scope.set(scope)


def reset_current_authorization_scope(token: Token) -> None:
    _current_scope.reset(token)


@contextmanager
def authorization_scope_context(scope: AuthorizationScope):
    token = set_current_authorization_scope(scope)
    try:
        yield scope
    finally:
        reset_current_authorization_scope(token)


def configured_remote_investigation_ids(value: str | None = None) -> frozenset[str] | None:
    """Parse the optional remote shared-token investigation allowlist.

    Blank retains the existing unrestricted shared-bearer behavior for compatibility.
    Once IDs are configured, every remote request is constrained to exactly those IDs.
    """
    values = parse_csv(settings.api_auth_investigation_ids if value is None else value)
    return frozenset(values) if values else None


def scope_for_request(request: Request) -> AuthorizationScope:
    resolved = getattr(request.state, "authorization_scope", None)
    if isinstance(resolved, AuthorizationScope):
        return resolved
    if request_is_local_request(request):
        return AuthorizationScope(actor_id="local-owner", investigation_ids=None, role="owner")
    return AuthorizationScope(
        actor_id="shared-bearer",
        investigation_ids=configured_remote_investigation_ids(),
        role="shared",
    )


def require_scope_investigation(scope: AuthorizationScope, investigation_id: str) -> None:
    if not scope.allows(investigation_id):
        # Deliberately hide whether a different investigation exists.
        raise HTTPException(status_code=404, detail="Investigation not found")


def require_scope_investigation_admin(scope: AuthorizationScope, investigation_id: str) -> None:
    """Require destructive/admin authority for one investigation.

    Read access remains hidden as 404. A visible investigation with insufficient role
    returns 403 so reporters can distinguish "not mine" from "admin required".
    """
    require_scope_investigation(scope, investigation_id)
    if not scope.allows_admin(investigation_id):
        raise HTTPException(status_code=403, detail="Investigation admin role required")


def require_scope_global_admin(scope: AuthorizationScope) -> None:
    """Require workstation owner or global persisted admin authority."""
    if not scope.is_global_admin:
        raise HTTPException(status_code=403, detail="Global admin role required")


def filter_visible_investigation_ids(scope: AuthorizationScope, ids: Iterable[str]) -> list[str]:
    return [value for value in ids if scope.allows(value)]


def _resource_investigation_id(db: Session, key: str, value: str) -> str | None:
    # Lazy import keeps authorization infrastructure independent from ORM import order.
    from app.models.domain import (
        AIAnalysisCandidate,
        Claim,
        ConnectorFinding,
        Document,
        Entity,
        EnrichmentSession,
        Evidence,
        ExternalRelationshipReview,
        ExtractionCandidate,
        Lead,
        ReportingTask,
        Source,
        StatementAssessment,
    )

    direct = {
        "entity_id": (Entity, "investigation_id"),
        "source_id": (Source, "investigation_id"),
        "claim_id": (Claim, "investigation_id"),
        "lead_id": (Lead, "investigation_id"),
        "task_id": (ReportingTask, "investigation_id"),
        "finding_id": (ConnectorFinding, "investigation_id"),
        "assessment_id": (StatementAssessment, "investigation_id"),
        "review_id": (ExternalRelationshipReview, "investigation_id"),
        "session_id": (EnrichmentSession, "investigation_id"),
        "document_id": (Document, "investigation_id"),
    }
    if key in direct:
        model, attr = direct[key]
        row = db.get(model, value)
        return getattr(row, attr, None) if row is not None else None

    if key == "evidence_id":
        row = db.get(Evidence, value)
        if row is None:
            return None
        source = db.get(Source, row.source_id)
        return source.investigation_id if source is not None else None

    if key == "candidate_id":
        # Two candidate tables share this path-parameter name:
        # /extraction-candidates/{candidate_id}/... and /ai-analysis-candidates/{candidate_id}[/review].
        # Both are UUID-keyed, so try each; an id found in neither resolves to None and the
        # route's own 404 applies.
        row = db.get(ExtractionCandidate, value)
        if row is not None:
            document = db.get(Document, row.document_id)
            return document.investigation_id if document is not None else None
        ai_row = db.get(AIAnalysisCandidate, value)
        return ai_row.investigation_id if ai_row is not None else None

    return None


def authorize_routed_resource(request: Request, db: Session) -> AuthorizationScope:
    """FastAPI router dependency enforcing read access for routed resource IDs.

    This covers path/query resources generically. Write authorization is also enforced
    at ORM flush time, so a future mutation route cannot bypass the investigation
    boundary merely by forgetting a route-specific check.
    """
    scope = scope_for_request(request)
    request.state.authorization_scope = scope
    if scope.unrestricted:
        return scope

    explicit_ids: set[str] = set()
    investigation_id = request.path_params.get("investigation_id") or request.query_params.get("investigation_id")
    if investigation_id:
        explicit_ids.add(investigation_id)

    for key, value in request.path_params.items():
        if key == "investigation_id" or not value:
            continue
        resolved = _resource_investigation_id(db, key, str(value))
        if resolved:
            explicit_ids.add(resolved)

    for value in explicit_ids:
        require_scope_investigation(scope, value)
    return scope
