"""Reference AuthPolicy implementations. The host supplies the two
predicates it already has (is this request local? who is the caller?)."""

from __future__ import annotations

from typing import Callable

from fastapi import Request

from opsconsole.protocols import Principal

IsLocal = Callable[[Request], bool]
PrincipalFor = Callable[[Request], Principal | None]


class LoopbackOnly:
    """Read and write only from the local machine; every local caller is the operator."""

    def __init__(self, is_local: IsLocal, *, label: str = "local operator", writes: bool = True) -> None:
        self.is_local = is_local
        self.label = label
        self.writes = writes

    def allow_read(self, request: Request) -> Principal | None:
        if self.is_local(request):
            return Principal(id="local", label=self.label, roles=("operator",), is_local=True)
        return None

    def allow_write(self, request: Request) -> Principal | None:
        principal = self.allow_read(request)
        return principal if (principal is not None and self.writes) else None


class LoopbackOrRole:
    """Read: local callers, or an authenticated principal holding `role`.
    Write: local callers (optionally required to also hold the role), or a
    remote principal holding `write_role` when `remote_writes` is on."""

    def __init__(self, is_local: IsLocal, principal_for: PrincipalFor, *, role: str = "admin", write_role: str | None = None,
                 local_write_needs_role: bool = False, remote_writes: bool = False, local_label: str = "local operator") -> None:
        self.is_local = is_local
        self.principal_for = principal_for
        self.role = role
        self.write_role = write_role or role
        self.local_write_needs_role = local_write_needs_role
        self.remote_writes = remote_writes
        self.local_label = local_label

    def _principal(self, request: Request) -> Principal | None:
        try:
            return self.principal_for(request)
        except Exception:
            return None

    def allow_read(self, request: Request) -> Principal | None:
        principal = self._principal(request)
        if self.is_local(request):
            if principal is not None:
                return Principal(id=principal.id, label=principal.label, roles=principal.roles, is_local=True)
            return Principal(id="local", label=self.local_label, roles=("operator",), is_local=True)
        if principal is not None and self.role in principal.roles:
            return principal
        return None

    def allow_write(self, request: Request) -> Principal | None:
        principal = self._principal(request)
        if self.is_local(request):
            if self.local_write_needs_role:
                return principal if (principal is not None and self.write_role in principal.roles) else None
            return self.allow_read(request)
        if self.remote_writes and principal is not None and self.write_role in principal.roles:
            return principal
        return None
