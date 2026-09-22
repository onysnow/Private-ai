"""What Journalism Workbench tells opsconsole about itself (ADR-0003, §12 of
docs/opsconsole/DESIGN.md). Everything app-specific about the operator console
lives here; the package under backend/opsconsole/ knows nothing about the app.
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import json
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, List

from fastapi import Request
from fastapi.routing import APIRoute
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session

from app.core.access import request_is_local_request
from app.core.audit_log import recent_security_denials
from app.core.authorization import scope_for_request
from app.core.config import Settings
from app.db.session import Base
from app.models.domain import (
    AIAnalysisCandidate,
    AppUser,
    Claim,
    ClaimEvidenceLink,
    Document,
    DocumentChunk,
    Entity,
    Evidence,
    ExtractionCandidate,
    InvestigationMembership,
    RelationshipEdge,
    Source,
)
from app.services.exports import (
    build_investigation_export,
    preview_investigation_restore,
    restore_investigation_export,
)
from app.services.security import redact_database_url, resolve_storage_root
from opsconsole import (
    Check,
    CheckResult,
    ConsoleConfig,
    Principal,
    Probe,
    RouteMeta,
    RunHandle,
    TablePolicy,
    Tile,
    TileProvider,
    WritePolicy,
)
from opsconsole.adapters.auth_policies import LoopbackOrRole
from opsconsole.adapters.jsonl_log import JsonlLogSource
from opsconsole.adapters.pytest_runner import PytestRunner
from opsconsole.protocols import (
    BackupRecord,
    IssuedToken,
    RestorePlan,
    RoleRecord,
    TokenRecord,
    UserRecord,
)

BACKEND_ROOT = Path(__file__).resolve().parents[1]

# The ten domain groups of app/models/*, used to colour the ER diagram and group the data dictionary.
DOMAIN_OF_TABLE: dict[str, str] = {}
TABLE_DOCS: dict[str, str | None] = {}
for _module_name in ("investigations", "entities", "sources", "claims", "leads", "connectors", "relationships", "documents", "ai", "identity"):
    _module = __import__(f"app.models.{_module_name}", fromlist=["*"])
    for _value in vars(_module).values():
        if isinstance(_value, type) and issubclass(_value, Base) and _value is not Base and hasattr(_value, "__tablename__"):
            DOMAIN_OF_TABLE[_value.__tablename__] = _module_name
            TABLE_DOCS[_value.__tablename__] = (_value.__doc__ or "").strip() or None


# --- auth ---------------------------------------------------------------------------------------

def _principal_for(request: Request) -> Principal | None:
    scope = scope_for_request(request)
    roles: tuple[str, ...] = ("admin",) if scope.is_global_admin else (scope.role,)
    return Principal(id=scope.actor_id, label=scope.actor_id, roles=roles, is_local=request_is_local_request(request))


def auth_policy() -> LoopbackOrRole:
    """Reads: loopback only (a remote admin token still cannot see the console).
    Writes: loopback callers whose scope is a global admin/owner -- which the
    local single-user workstation always is, and a browser tab on the same
    machine without a token also is (it is the owner's machine)."""
    return LoopbackOrRole(request_is_local_request, _principal_for, role="__never__", write_role="admin", local_write_needs_role=True, remote_writes=False)


# --- checks (the app-specific integrity rules; the generic ones are opsconsole built-ins) -------

def _sample(rows: list[Any], n: int = 10) -> list[str]:
    return [str(r) for r in rows[:n]]


def _evidence_without_source(db: Session) -> CheckResult:
    rows = db.execute(select(Evidence.id).outerjoin(Source, Source.id == Evidence.source_id).where(Source.id.is_(None))).scalars().all()
    return CheckResult(count=len(rows), samples=_sample(list(rows)), table="evidence", hint="Evidence rows whose source was deleted; every quote must trace to a source.")


def _claim_links_dangling(db: Session) -> CheckResult:
    rows = db.execute(
        select(ClaimEvidenceLink.id).outerjoin(Evidence, Evidence.id == ClaimEvidenceLink.evidence_id).outerjoin(Claim, Claim.id == ClaimEvidenceLink.claim_id)
        .where((Evidence.id.is_(None)) | (Claim.id.is_(None)))
    ).scalars().all()
    return CheckResult(count=len(rows), samples=_sample(list(rows)), table="claim_evidence_links", hint="Claim-evidence links pointing at a missing claim or evidence row.")


def _claims_without_evidence(db: Session) -> CheckResult:
    linked = select(ClaimEvidenceLink.claim_id)
    rows = db.execute(select(Claim.id).where(Claim.status != "unverified").where(Claim.id.not_in(linked))).scalars().all()
    return CheckResult(count=len(rows), samples=_sample(list(rows)), table="claims", hint="Claims with a non-unverified status but no evidence link -- status should follow evidence.")


def _accepted_candidates_without_record(db: Session) -> CheckResult:
    bad: list[str] = []
    for cand in db.execute(select(ExtractionCandidate.id, ExtractionCandidate.accepted_record_type, ExtractionCandidate.accepted_record_id).where(ExtractionCandidate.review_status == "accepted")).all():
        model = {"entity": Entity, "claim": Claim, "evidence": Evidence}.get(cand.accepted_record_type or "")
        if model is None or not cand.accepted_record_id or db.get(model, cand.accepted_record_id) is None:
            bad.append(cand.id)
    return CheckResult(count=len(bad), samples=_sample(bad), table="extraction_candidates", hint="Accepted extraction candidates whose materialized record no longer exists.")


def _document_files(db: Session) -> CheckResult:
    missing = [d.id for d in db.execute(select(Document.id, Document.storage_path)).all() if not d.storage_path or not Path(d.storage_path).is_file()]
    return CheckResult(count=len(missing), samples=_sample(missing), table="documents", hint="Document rows whose file is not on disk at storage_path; restore from a backup or re-upload.")


def _chunks_without_document(db: Session) -> CheckResult:
    rows = db.execute(select(DocumentChunk.id).outerjoin(Document, Document.id == DocumentChunk.document_id).where(Document.id.is_(None))).scalars().all()
    return CheckResult(count=len(rows), samples=_sample(list(rows)), table="document_chunks", hint="Extracted chunks whose document row is gone.")


def _relationship_endpoints(db: Session) -> CheckResult:
    bad: list[str] = []
    for edge in db.execute(select(RelationshipEdge.id, RelationshipEdge.source_entity_id, RelationshipEdge.target_entity_id, RelationshipEdge.relationship_entity_id)).all():
        if any(db.get(Entity, eid) is None for eid in (edge.source_entity_id, edge.target_entity_id, edge.relationship_entity_id)):
            bad.append(edge.id)
    return CheckResult(count=len(bad), samples=_sample(bad), table="relationship_edges", hint="Relationship edges referencing a missing entity.")


def _stale_ai_candidates(db: Session) -> CheckResult:
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=14)
    rows = db.execute(select(AIAnalysisCandidate.id).where(AIAnalysisCandidate.review_status == "proposed").where(AIAnalysisCandidate.created_at < cutoff)).scalars().all()
    return CheckResult(count=len(rows), samples=_sample(list(rows)), table="ai_analysis_candidates", hint="AI analyses proposed more than 14 days ago and never reviewed.")


def _ai_citations_exist(db: Session) -> CheckResult:
    bad: list[str] = []
    for cand in db.execute(select(AIAnalysisCandidate.id, AIAnalysisCandidate.checked_citation_ids).where(AIAnalysisCandidate.review_status == "accepted")).all():
        for ref in cand.checked_citation_ids or []:
            model = {"entity": Entity, "evidence": Evidence, "claim": Claim, "source": Source, "document": Document}.get(ref.get("record_type", ""))
            if model is not None and db.get(model, ref.get("record_id")) is None:
                bad.append(cand.id)
                break
    return CheckResult(count=len(bad), samples=_sample(bad), table="ai_analysis_candidates", hint="Accepted AI analyses citing records that have since been deleted.")


def _revoked_users_with_memberships(db: Session) -> CheckResult:
    rows = db.execute(select(AppUser.id).join(InvestigationMembership, InvestigationMembership.user_id == AppUser.id).where(AppUser.token_revoked_at.is_not(None)).distinct()).scalars().all()
    return CheckResult(count=len(rows), samples=_sample(list(rows)), table="app_users", hint="Users whose token is revoked but who still hold investigation memberships (harmless, but tidy up).")


CHECKS: list[Check] = [
    Check(id="evidence_has_source", title="Every evidence row has its source", run=_evidence_without_source, section="data"),
    Check(id="claim_links_intact", title="Claim-evidence links point at real rows", run=_claim_links_dangling, section="data"),
    Check(id="claims_backed_by_evidence", title="Verified claims have evidence", run=_claims_without_evidence, section="data"),
    Check(id="accepted_candidates_materialized", title="Accepted extraction candidates still have their record", run=_accepted_candidates_without_record, section="data"),
    Check(id="document_files_present", title="Document files exist on disk", run=_document_files, section="data"),
    Check(id="chunks_have_document", title="Extracted chunks have their document", run=_chunks_without_document, section="data"),
    Check(id="relationship_endpoints_exist", title="Relationships point at existing entities", run=_relationship_endpoints, section="data"),
    Check(id="ai_candidates_reviewed", title="AI analyses are not left unreviewed", run=_stale_ai_candidates, section="data", severity="info"),
    Check(id="ai_citations_exist", title="Accepted AI analyses cite records that still exist", run=_ai_citations_exist, section="data"),
    Check(id="revoked_users_tidy", title="Revoked users hold no memberships", run=_revoked_users_with_memberships, section="users", severity="info"),
]


# --- tiles ---------------------------------------------------------------------------------------

def _state(ok: bool, warn: bool = False) -> Any:
    return "ok" if ok and not warn else ("warn" if ok else "fail")


def tiles(settings: Settings) -> list[TileProvider]:
    def openaleph(db: Session) -> Tile:
        if not settings.openaleph_enabled:
            return Tile(state="fail", headline="disabled by configuration (OPENALEPH_ENABLED=false) -- it is part of the product stack", details={"enabled": False, "base_url": settings.openaleph_base_url}, section="config")
        from app.services.openaleph import probe_openaleph

        try:
            status = asyncio.run(probe_openaleph()).to_dict()
        except RuntimeError:  # already inside an event loop: run on a helper thread
            with concurrent.futures.ThreadPoolExecutor(1) as pool:
                status = pool.submit(lambda: asyncio.run(probe_openaleph()).to_dict()).result()
        return Tile(state=_state(bool(status["api_usable"])), headline=status["detail"], details=status, section="config")

    def connectors(db: Session) -> Tile:
        from app.services.settings import (
            CONNECTOR_PROVIDERS,
            connector_credential_status,
        )

        conn = {p: connector_credential_status(p) for p in sorted(CONNECTOR_PROVIDERS)}
        configured = [p for p, s in conn.items() if s.get("configured")]
        return Tile(state=_state(True, len(configured) < len(conn)), headline=f"{len(configured)}/{len(conn)} with credentials: {', '.join(configured) or 'none'}", details=conn, section="config")

    def ai(db: Session) -> Tile:
        from app.ai.reasoning import ai_reasoning_status

        status = ai_reasoning_status(settings)
        last = db.execute(select(AIAnalysisCandidate.created_at, AIAnalysisCandidate.review_status).order_by(AIAnalysisCandidate.created_at.desc()).limit(1)).first()
        proposed = db.execute(select(func.count()).select_from(AIAnalysisCandidate).where(AIAnalysisCandidate.review_status == "proposed")).scalar_one()
        if status["endpoints_callable"]:
            headline = f"{status['provider']} · {status['model']} · TAS v{status['tas_spec']['version']} · {proposed} awaiting review"
        else:
            headline = "not callable: " + ("disabled" if not status["enabled"] else ("no provider" if not status["provider"] else ("no key" if not status["provider_key_configured"] else "spec missing")))
        return Tile(state=_state(True, not status["endpoints_callable"]), headline=headline,
                    details={**status, "last_run_at": last.created_at.isoformat() if last else None, "last_run_status": last.review_status if last else None, "proposed": int(proposed)}, section="config")

    def storage(db: Session) -> Tile:
        root = resolve_storage_root(settings.document_storage_dir)
        files = 0
        size = 0
        if root.exists():
            for p in root.rglob("*"):
                if p.is_file():
                    files += 1
                    try:
                        size += p.stat().st_size
                    except OSError:
                        pass
        missing = _document_files(db).count
        return Tile(state=_state(missing == 0), headline=f"{files} files · {round(size / 1e6, 1)} MB · {missing} referenced file(s) missing", details={"path": str(root), "files": files, "bytes": size, "missing_files": missing}, section="checks")

    def security(db: Session) -> Tile:
        sec = recent_security_denials(settings.audit_log_file, window_hours=24.0, attention_threshold=settings.security_alert_denials_per_day, max_examples=3)
        return Tile(state=_state(not sec["needs_attention"]), headline=f"{sec['total_denials']} denial(s) in 24h · {sec['by_event'].get('auth_rate_limited', 0)} lockout(s) · {settings.app_environment}", details=sec, section="logs")

    return [
        TileProvider(id="openaleph", title="OpenAleph", run=openaleph, section="config", refresh_seconds=30),
        TileProvider(id="connectors", title="Connectors", run=connectors, section="config", refresh_seconds=60),
        TileProvider(id="ai", title="AI reasoning", run=ai, section="config", refresh_seconds=30),
        TileProvider(id="storage", title="Storage", run=storage, section="checks", refresh_seconds=60),
        TileProvider(id="security", title="Security", run=security, section="logs", refresh_seconds=30),
    ]


# --- users ---------------------------------------------------------------------------------------

class WorkbenchUsers:
    """UserDirectory over app_users (one persisted bearer token per user) and
    investigation_memberships. Roles are `global:<member|admin>` plus one
    `inv:<investigation_id>:<viewer|reporter|admin>` per membership."""

    def __init__(self, session_factory: Callable[[], Session]) -> None:
        self.session_factory = session_factory

    def _iso(self, value: datetime | None) -> str | None:
        return value.isoformat() if value else None

    def list(self) -> list[UserRecord]:
        with self.session_factory() as db:
            users = db.scalars(select(AppUser).order_by(AppUser.display_name, AppUser.id)).all()
            memberships = db.scalars(select(InvestigationMembership)).all()
            by_user: dict[str, list[str]] = {}
            for m in memberships:
                by_user.setdefault(m.user_id, []).append(f"inv:{m.investigation_id}:{m.role}")
            out = []
            for u in users:
                token = TokenRecord(id=u.id, issued_at=self._iso(u.token_created_at), last_used_at=self._iso(u.token_last_used_at), revoked_at=self._iso(u.token_revoked_at))
                out.append(UserRecord(id=u.id, label=u.display_name, roles=[f"global:{u.global_role}", *by_user.get(u.id, [])], disabled=bool(u.disabled),
                                      last_seen_at=self._iso(u.token_last_used_at), tokens=[token], extra={"created_at": self._iso(u.created_at), "token_rotated_at": self._iso(u.token_rotated_at)}))
            return out

    # List[...]: this class's own `list` method above shadows the builtin `list`
    # name for the rest of this class body, breaking a bare `list[...]` annotation.
    def roles(self) -> List[RoleRecord]:
        return [
            RoleRecord(name="global:member", description="Signed-in user; access only through investigation memberships", grants=["read own memberships"]),
            RoleRecord(name="global:admin", description="Global admin: every investigation, settings, restores", grants=["read all", "write all", "admin"]),
            RoleRecord(name="inv:<id>:viewer", description="Read one investigation", grants=["read"]),
            RoleRecord(name="inv:<id>:reporter", description="Read and write one investigation", grants=["read", "write"]),
            RoleRecord(name="inv:<id>:admin", description="Administer one investigation", grants=["read", "write", "admin"]),
        ]

    def set_roles(self, user_id: str, roles: Any, *, actor: Principal) -> None:
        from app.services.settings import (
            delete_investigation_membership,
            put_investigation_membership,
        )

        with self.session_factory() as db:
            user = db.get(AppUser, user_id)
            if user is None:
                raise LookupError("User not found")
            wanted_global = [r.split(":", 1)[1] for r in roles if r.startswith("global:")]
            if len(wanted_global) != 1 or wanted_global[0] not in ("member", "admin"):
                raise ValueError("exactly one global:<member|admin> role is required")
            user.global_role = wanted_global[0]
            db.commit()
            wanted = {}
            for r in roles:
                if r.startswith("inv:"):
                    _, inv, role = r.split(":", 2)
                    wanted[inv] = role
            current = {m.investigation_id: m.role for m in db.scalars(select(InvestigationMembership).where(InvestigationMembership.user_id == user_id)).all()}
            for inv, role in wanted.items():
                if current.get(inv) != role:
                    put_investigation_membership(db, user_id, inv, role)
            for inv in current:
                if inv not in wanted:
                    delete_investigation_membership(db, user_id, inv)

    def set_disabled(self, user_id: str, disabled: bool, *, actor: Principal) -> None:
        from app.core.time import utcnow_naive

        with self.session_factory() as db:
            user = db.get(AppUser, user_id)
            if user is None:
                raise LookupError("User not found")
            user.disabled = disabled
            user.disabled_at = utcnow_naive() if disabled else None
            db.commit()

    def revoke_token(self, token_id: str, *, actor: Principal) -> None:
        from app.services.settings import revoke_app_user_token

        with self.session_factory() as db:
            user = db.get(AppUser, token_id)
            if user is None:
                raise LookupError("User not found")
            revoke_app_user_token(db, user)

    def issue_token(self, user_id: str, *, actor: Principal, ttl_seconds: int) -> IssuedToken:
        """The workbench has one token per user, so issuing is a rotation; ttl is not modelled."""
        from app.services.settings import rotate_app_user_token

        with self.session_factory() as db:
            user = db.get(AppUser, user_id)
            if user is None:
                raise LookupError("User not found")
            result = rotate_app_user_token(db, user)
            return IssuedToken(token_id=user.id, plaintext=result["token"], expires_at=None)


# --- backups ----------------------------------------------------------------------------------

class WorkbenchBackups:
    """BackupProvider over app/services/exports.py's per-investigation export/restore.
    These are per-investigation export archives (a signed zip with a manifest.json,
    per EXPORT_FORMAT/EXPORT_VERSION), not whole-database dumps -- see DESIGN.md §12.
    Today's /api/backups/* endpoints are upload-only (inspect/preview/restore a file
    the caller already has); nothing persists an export to disk. create() closes that
    gap for the console by exporting one investigation (the run's `selection`, an
    investigation id) to a .zip under console_dir/backups, so it can be listed and
    re-downloaded or restored later. restore_plan()/restore() reuse the exact same
    preview_investigation_restore/restore_investigation_export functions the REST
    endpoints call, including the same ENABLE_RESTORE_API gate -- the console does
    not get a more privileged restore path than the app's own API."""

    kind = "investigation_export"

    def __init__(self, backups_dir: Path, session_factory: Callable[[], Session], document_storage_dir: Path, settings: Settings) -> None:
        self.backups_dir = backups_dir
        self.session_factory = session_factory
        self.document_storage_dir = document_storage_dir
        self.settings = settings
        self.backups_dir.mkdir(parents=True, exist_ok=True)

    def _manifest_of(self, path: Path) -> dict[str, Any] | None:
        try:
            with zipfile.ZipFile(path) as zf:
                manifest: dict[str, Any] = json.loads(zf.read("manifest.json"))
                return manifest
        except (OSError, KeyError, ValueError, zipfile.BadZipFile):
            return None

    def list(self) -> list[BackupRecord]:
        out: list[BackupRecord] = []
        for path in sorted(self.backups_dir.glob("*.zip"), reverse=True):
            manifest = self._manifest_of(path)
            stat = path.stat()
            label = manifest["investigation"]["name"] if manifest else path.stem
            created_at = manifest["generated_at"] if manifest else datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat()
            out.append(BackupRecord(id=path.stem, created_at=created_at, bytes=stat.st_size, kind=self.kind, label=label, verified=manifest is not None))
        return out

    def create(self, handle: RunHandle, *, selection: str | None) -> BackupRecord:
        if not selection:
            raise ValueError("selection must be an investigation id")
        handle.log(f"[console] exporting investigation {selection}")
        with self.session_factory() as db:
            data, manifest = build_investigation_export(db, selection, include_documents=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_id = f"{stamp}-{selection}"
        path = self.backups_dir / f"{backup_id}.zip"
        path.write_bytes(data)
        handle.log(f"[console] wrote {path.name} ({len(data)} bytes)")
        return BackupRecord(id=backup_id, created_at=manifest["generated_at"], bytes=len(data), kind=self.kind, label=manifest["investigation"]["name"], verified=True)

    def _path(self, backup_id: str) -> Path:
        path = self.backups_dir / f"{backup_id}.zip"
        if not path.is_file():
            raise LookupError(f"unknown backup {backup_id!r}")
        return path

    def restore_plan(self, backup_id: str) -> RestorePlan:
        data = self._path(backup_id).read_bytes()
        with self.session_factory() as db:
            preview = preview_investigation_restore(db, data, self.document_storage_dir)
        # A restore always targets an isolated investigation graph -- any collision is a
        # hard conflict that blocks the restore rather than replacing anything, so
        # will_replace is always empty here; conflicts show up in warnings instead.
        summary = f"Restores {preview['investigation']['name']!r} ({preview['investigation']['id']}): {sum(preview['record_counts'].values())} record(s) across {len(preview['record_counts'])} table(s)"
        warnings = list(preview["warnings"])
        if not preview["can_restore"]:
            details = "; ".join(c["message"] for c in preview["conflicts"][:5])
            if len(preview["conflicts"]) > 5:
                details += f"; plus {len(preview['conflicts']) - 5} more"
            warnings.append(f"BLOCKED by {len(preview['conflicts'])} conflict(s): {details}")
        if not preview["restore_api_enabled"]:
            warnings.append("Restore is disabled (set ENABLE_RESTORE_API=true to enable it)")
        return RestorePlan(backup_id=backup_id, summary=summary, will_replace=[], warnings=warnings)

    def restore(self, backup_id: str, handle: RunHandle) -> None:
        if not self.settings.enable_restore_api:
            raise RuntimeError("Backup restore is disabled; set ENABLE_RESTORE_API=true to enable it")
        path = self._path(backup_id)
        data = path.read_bytes()
        handle.log(f"[console] restoring from {path.name}")
        with self.session_factory() as db:
            result = restore_investigation_export(db, data, self.document_storage_dir)
        handle.log(f"[console] restored {sum(result['restored_counts'].values())} record(s) into investigation {result['investigation_id']}")

    def path_for_download(self, backup_id: str) -> str | None:
        try:
            return str(self._path(backup_id))
        except LookupError:
            return None


# --- routes ---------------------------------------------------------------------------------------

def describe_route(route: APIRoute) -> RouteMeta:
    names = {getattr(d.call, "__name__", "") for d in route.dependant.dependencies}
    if route.path.startswith("/api/console"):
        return RouteMeta(auth="console: loopback", notes="opsconsole")
    if "authorize_request_resource" in names:
        return RouteMeta(auth="token or local; scoped to the investigation in the path", roles=("viewer", "reporter", "admin"))
    return RouteMeta(auth="token or local")


PROBES: tuple[Probe, ...] = (
    Probe("GET", "/health", (200,), "Liveness"),
    Probe("GET", "/api/investigations", (200,), "Investigations list"),
    Probe("GET", "/api/settings/status", (200,), "Settings status"),
    Probe("GET", "/api/relationship-schemas", (200,), "Relationship schemas"),
    Probe("GET", "/api/integrations/openaleph/status", (200,), "OpenAleph status"),
    Probe("GET", "/api/search?q=smoke", (200,), "Search"),
    Probe("GET", "/docs", (200,), "Swagger UI"),
)


# --- assembly -------------------------------------------------------------------------------------

def build_console_config(settings: Settings, engine: Engine, session_factory: Callable[[], Session], *, app_version: str) -> ConsoleConfig:
    console_dir = Path(settings.console_dir).resolve()
    test_db = console_dir / "console-tests.db"
    runner = PytestRunner(BACKEND_ROOT, env={
        "DATABASE_URL": f"sqlite:///{test_db.as_posix()}",
        "DOCUMENT_STORAGE_DIR": str(console_dir / "test-documents"),
        "AUDIT_LOG_FILE": str(console_dir / "test-audit.jsonl"),
        "API_AUTH_FAILURE_STATE_FILE": "",
        "APP_LOG_FILE": str(console_dir / "test-app.jsonl"),
        "CONNECTOR_CREDENTIALS_FILE": str(console_dir / "test-connectors.json"),
        "CONSOLE_DIR": str(console_dir / "test-console"),
        "ENABLE_AI_FEATURES": "false",
        "AI_PROVIDER": "",
        "OPENALEPH_ENABLED": "false",
    })
    writes = {"disabled": WritePolicy.DISABLED, "changesets": WritePolicy.CHANGESETS, "changesets_and_sql": WritePolicy.CHANGESETS_AND_SQL}.get(settings.console_writes, WritePolicy.DISABLED)
    return ConsoleConfig(
        metadata=Base.metadata, engine=engine, session_factory=session_factory, auth=auth_policy(), console_dir=console_dir,
        settings=settings, env_file=BACKEND_ROOT / ".env", env_example_file=BACKEND_ROOT.parent / ".env.example",
        alembic_ini=BACKEND_ROOT / "alembic.ini", alembic_script_location=BACKEND_ROOT / "alembic",
        tests=runner,
        log_sources=[JsonlLogSource(settings.app_log_file, id="app", title="Application log"), JsonlLogSource(settings.audit_log_file, id="security", title="Security audit")],
        users=WorkbenchUsers(session_factory),
        backups=[WorkbenchBackups(console_dir / "backups", session_factory, resolve_storage_root(settings.document_storage_dir), settings)],
        checks=CHECKS, tiles=tiles(settings), api_probe_suite=PROBES,
        mutable_flags=("enable_ai_features", "enable_pdf_ocr", "enable_local_entity_suggestions", "openaleph_auto_sync_documents"),
        writes=writes,
        table_policy=TablePolicy(readonly=frozenset({"alembic_version"}), masked_columns=frozenset({"app_users.token_digest"})),
        app_name="Journalism Workbench", app_version=app_version, database_label=redact_database_url(settings.database_url),
        domain_of_table=lambda name: DOMAIN_OF_TABLE.get(name, ""), table_docs=lambda name: TABLE_DOCS.get(name), describe_route=describe_route,
        links={"Swagger": "/docs", "ReDoc": "/redoc", "OpenAPI": "/openapi.json", "Adminer": "http://127.0.0.1:8081/?pgsql=workbench-db&username=journalism&db=journalism",
               **({"OpenAleph UI": settings.openaleph_ui_url} if settings.openaleph_enabled else {})},
        frame_ancestors=tuple(settings.cors_origins),
    )


__all__ = ["CHECKS", "PROBES", "WorkbenchBackups", "WorkbenchUsers", "auth_policy", "build_console_config", "describe_route", "tiles"]
