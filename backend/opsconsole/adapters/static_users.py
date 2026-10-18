"""An in-memory UserDirectory: for fixtures, demos, and hosts whose users live in config."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, List, Sequence

from opsconsole.protocols import (
    IssuedToken,
    Principal,
    RoleRecord,
    TokenRecord,
    UserRecord,
)


class StaticUsers:
    def __init__(self, users: Sequence[UserRecord], roles: Sequence[RoleRecord] = ()) -> None:
        self._users: dict[str, UserRecord] = {u.id: u for u in users}
        self._roles = list(roles)
        self.log: list[tuple[str, Any]] = []

    def list(self) -> list[UserRecord]:
        return list(self._users.values())

    # List[...]: this class's own `list` method above shadows the builtin `list`
    # name for the rest of this class body, breaking a bare `list[...]` annotation.
    def roles(self) -> List[RoleRecord]:
        return list(self._roles)

    def _user(self, user_id: str) -> UserRecord:
        user = self._users.get(user_id)
        if user is None:
            raise LookupError(f"unknown user {user_id!r}")
        return user

    def set_roles(self, user_id: str, roles: Sequence[str], *, actor: Principal) -> None:
        known = {r.name for r in self._roles}
        bad = [r for r in roles if known and r not in known]
        if bad:
            raise ValueError(f"unknown role(s): {bad}")
        self._user(user_id).roles = list(roles)
        self.log.append(("set_roles", (user_id, list(roles), actor.id)))

    def set_disabled(self, user_id: str, disabled: bool, *, actor: Principal) -> None:
        self._user(user_id).disabled = disabled
        self.log.append(("set_disabled", (user_id, disabled, actor.id)))

    def revoke_token(self, token_id: str, *, actor: Principal) -> None:
        for user in self._users.values():
            for token in user.tokens:
                if token.id == token_id:
                    token.revoked_at = datetime.now(timezone.utc).isoformat()
                    self.log.append(("revoke_token", (token_id, actor.id)))
                    return
        raise LookupError(f"unknown token {token_id!r}")

    def issue_token(self, user_id: str, *, actor: Principal, ttl_seconds: int) -> IssuedToken:
        user = self._user(user_id)
        now = datetime.now(timezone.utc)
        token = TokenRecord(id=f"tok-{secrets.token_hex(4)}", issued_at=now.isoformat(), expires_at=(now + timedelta(seconds=ttl_seconds)).isoformat())
        user.tokens.append(token)
        self.log.append(("issue_token", (user_id, token.id, actor.id)))
        return IssuedToken(token_id=token.id, plaintext=secrets.token_urlsafe(24), expires_at=token.expires_at)
