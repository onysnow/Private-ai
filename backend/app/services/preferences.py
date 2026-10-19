"""Settings kept on the server: how each person is told about things (Settings › Notifications), what may be looked
up outside and when (Settings › Outside lookups, per case), and what the AI may start on its own and with which
defaults (Settings › AI and research).

Every value is checked against the choices below before it is stored, and read back through them, so a stored value
the app no longer offers falls back to the default instead of reaching the screen.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import Investigation, Preference

# --- Notifications (per person) ----------------------------------------------------------------------------------

ROUTES = ("interrupt", "needs", "else", "off")

# Every kind of thing the inbox can show, in the order Settings lists them: what it is called, its route when the
# person has not chosen one, and whether it may interrupt (only what can mean danger may).
NOTIFICATION_KINDS: list[dict[str, Any]] = [
    {"key": "flag_textbook", "label": "Textbook Red Flag", "default": "interrupt", "can_interrupt": True},
    {"key": "flag_strong", "label": "Strong Red Flag", "default": "needs", "can_interrupt": False},
    {"key": "watch", "label": "A fact you watch changed", "default": "needs", "can_interrupt": False},
    {"key": "watchlist", "label": "Watchlist hit", "default": "needs", "can_interrupt": False},
    {"key": "to_check", "label": "To check items and missing values", "default": "needs", "can_interrupt": False},
    {"key": "proposal", "label": "Proposals from reading documents", "default": "needs", "can_interrupt": False},
    {"key": "outside", "label": "Outside findings", "default": "needs", "can_interrupt": False},
    {"key": "ai", "label": "AI draft ready", "default": "needs", "can_interrupt": False},
    {"key": "research", "label": "New documents since the last AI run", "default": "needs", "can_interrupt": False},
    {"key": "import", "label": "An import finished reading", "default": "needs", "can_interrupt": False},
    {"key": "flag_faint", "label": "Faint Red Flag", "default": "else", "can_interrupt": False},
    {"key": "documents", "label": "Documents added", "default": "else", "can_interrupt": False},
    {"key": "backup", "label": "A case not backed up for a while", "default": "else", "can_interrupt": False},
    {"key": "source", "label": "An outside source updated its data", "default": "else", "can_interrupt": False},
    {"key": "security", "label": "Requests the server refused", "default": "else", "can_interrupt": False},
]
KIND_BY_KEY = {k["key"]: k for k in NOTIFICATION_KINDS}
# After how many days without a backup a changed case is mentioned (0: never).
BACKUP_DAYS = (7, 14, 30, 0)
DEFAULT_BACKUP_DAYS = 14


def _get(db: Session, scope: str, subject: str, key: str) -> Preference | None:
    return db.scalar(select(Preference).where(Preference.scope == scope, Preference.subject == subject, Preference.key == key))


def _put(db: Session, scope: str, subject: str, key: str, value: dict, *, reason: str | None = None,
         investigation_id: str | None = None) -> Preference:
    row = _get(db, scope, subject, key)
    if row is None:
        row = Preference(scope=scope, subject=subject, key=key, investigation_id=investigation_id)
        db.add(row)
    row.value = value
    row.reason = reason
    row.updated_at = utcnow_naive()
    db.commit()
    return row


def _route_allowed(kind: str, route: str) -> bool:
    spec = KIND_BY_KEY.get(kind)
    return spec is not None and route in ROUTES and (route != "interrupt" or spec["can_interrupt"])


def notification_prefs(db: Session, person: str) -> dict[str, Any]:
    stored = (row.value if (row := _get(db, "person", person, "notifications")) else {}) or {}
    raw = stored.get("routes")
    chosen: dict[str, Any] = raw if isinstance(raw, dict) else {}
    routes = {k["key"]: chosen[k["key"]] if _route_allowed(k["key"], str(chosen.get(k["key"]))) else k["default"]
              for k in NOTIFICATION_KINDS}
    backup_days = stored.get("backup_days", DEFAULT_BACKUP_DAYS)
    return {
        "routes": routes,
        "quiet_while_reading": bool(stored.get("quiet_while_reading", True)),
        "desktop": bool(stored.get("desktop", False)),
        "backup_days": backup_days if backup_days in BACKUP_DAYS else DEFAULT_BACKUP_DAYS,
        "kinds": [{**k, "route": routes[k["key"]]} for k in NOTIFICATION_KINDS],
    }


def save_notification_prefs(db: Session, person: str, *, routes: dict[str, str], quiet_while_reading: bool,
                            desktop: bool, backup_days: int | None = None) -> dict[str, Any]:
    for kind, route in routes.items():
        if kind not in KIND_BY_KEY:
            raise ValueError(f"No kind of notification is called {kind!r}")
        if not _route_allowed(kind, route):
            raise ValueError(f"{KIND_BY_KEY[kind]['label']} cannot go to {route!r}")
    if backup_days is not None and backup_days not in BACKUP_DAYS:
        raise ValueError(f"The backup reminder can be {', '.join(str(d) for d in BACKUP_DAYS if d)} days, or never (0)")
    current = notification_prefs(db, person)
    stored = (row.value if (row := _get(db, "person", person, "notifications")) else {}) or {}
    _put(db, "person", person, "notifications",
         {**stored, "routes": {**current["routes"], **routes}, "quiet_while_reading": quiet_while_reading, "desktop": desktop,
          "backup_days": current["backup_days"] if backup_days is None else backup_days})
    return notification_prefs(db, person)


# --- Outside lookups (server default, case override) -------------------------------------------------------------

LOOKUP_MODES = ("automatic", "ask", "off")
DEFAULT_LOOKUP_MODE = "ask"

# What each source is and what a lookup sends it, in the words Settings uses.
PROVIDER_TEXT: dict[str, dict[str, str]] = {
    "opensanctions": {"label": "OpenSanctions", "kind": "sanctions lists and politically exposed people"},
    "aleph": {"label": "OpenAleph", "kind": "names in your OpenAleph collections"},
    "firecrawl": {"label": "Firecrawl", "kind": "web search"},
}


def provider_label(provider: str) -> str:
    return PROVIDER_TEXT.get(provider, {}).get("label", provider.capitalize())


def provider_host(connector: Any) -> str:
    return urlparse(str(getattr(connector, "base_url", "") or "")).hostname or ""


def _modes(value: Any, providers: list[str]) -> dict[str, str]:
    value = value if isinstance(value, dict) else {}
    return {p: value[p] for p in providers if value.get(p) in LOOKUP_MODES}


def lookup_defaults(db: Session, providers: list[str]) -> dict[str, str]:
    row = _get(db, "server", "", "lookups")
    stored = _modes((row.value or {}).get("defaults") if row else None, providers)
    return {p: stored.get(p, DEFAULT_LOOKUP_MODE) for p in providers}


def save_lookup_defaults(db: Session, providers: list[str], defaults: dict[str, str]) -> dict[str, str]:
    _check_modes(defaults, providers)
    _put(db, "server", "", "lookups", {"defaults": {**lookup_defaults(db, providers), **defaults}})
    return lookup_defaults(db, providers)


def _check_modes(modes: dict[str, str], providers: list[str]) -> None:
    for provider, mode in modes.items():
        if provider not in providers:
            raise ValueError(f"No outside source is called {provider!r}")
        if mode not in LOOKUP_MODES:
            raise ValueError(f"{provider_label(provider)} cannot be set to {mode!r}")


def case_lookup_override(db: Session, investigation_id: str, providers: list[str]) -> tuple[dict[str, str], Preference | None]:
    row = _get(db, "case", investigation_id, "lookups")
    return (_modes((row.value or {}).get("modes"), providers) if row else {}), row


def lookup_modes(db: Session, investigation_id: str, providers: list[str]) -> dict[str, str]:
    """Each source's mode for this case: the case's own choice, else the default."""
    own, _ = case_lookup_override(db, investigation_id, providers)
    return {**lookup_defaults(db, providers), **own}


def lookup_mode(db: Session, investigation_id: str, provider: str) -> str:
    return lookup_modes(db, investigation_id, [provider])[provider]


def save_case_lookups(db: Session, investigation_id: str, providers: list[str], modes: dict[str, str], reason: str) -> None:
    if db.get(Investigation, investigation_id) is None:
        raise LookupError("Investigation not found")
    _check_modes(modes, providers)
    if not reason.strip():
        raise ValueError("Say in one line why this case looks up differently")
    _put(db, "case", investigation_id, "lookups", {"modes": modes}, reason=reason.strip()[:300], investigation_id=investigation_id)


def clear_case_lookups(db: Session, investigation_id: str) -> None:
    row = _get(db, "case", investigation_id, "lookups")
    if row is not None:
        db.delete(row)
        db.commit()


def cases_with_own_lookups(db: Session, providers: list[str]) -> list[dict[str, Any]]:
    """Cases whose lookups differ from the defaults, with only what differs."""
    defaults = lookup_defaults(db, providers)
    out = []
    rows = db.execute(select(Preference, Investigation.name).join(Investigation, Investigation.id == Preference.investigation_id)
                      .where(Preference.scope == "case", Preference.key == "lookups").order_by(Investigation.name)).all()
    for row, name in rows:
        differs = {p: m for p, m in _modes((row.value or {}).get("modes"), providers).items() if m != defaults[p]}
        if differs:
            out.append({"investigation_id": row.subject, "name": name, "modes": differs, "reason": row.reason, "set_at": row.updated_at})
    return out


# --- AI and research (server) ------------------------------------------------------------------------------------

# automatic: "Without approval": the case's saved questions run when an import finishes (app/services/saved_questions.py).
RESEARCH_MODES = ("off", "ask", "automatic")
DEFAULT_RESEARCH_MODE = "ask"


def research_mode(db: Session) -> str:
    row = _get(db, "server", "", "research")
    mode = (row.value or {}).get("mode") if row else None
    return mode if mode in RESEARCH_MODES else DEFAULT_RESEARCH_MODE


def save_research_mode(db: Session, mode: str) -> str:
    if mode not in RESEARCH_MODES:
        raise ValueError(f"Research without asking cannot be {mode!r}")
    _put(db, "server", "", "research", {"mode": mode})
    return research_mode(db)


def run_profile_defaults(db: Session) -> tuple[dict, Preference | None]:
    """The run settings a case starts with until it saves its own (Before you run › Save as this case's default)."""
    row = _get(db, "server", "", "run_profile")
    return ((row.value or {}) if row else {}), row


def save_run_profile_defaults(db: Session, *, flags: dict | None, options: dict | None, reason: str) -> None:
    from app.ai.reasoning import normalize_control_flags, normalize_run_options

    if not reason.strip():
        raise ValueError("Say in one line why new cases start with these settings")
    _put(db, "server", "", "run_profile", {"flags": normalize_control_flags(flags), "options": normalize_run_options(options)},
         reason=reason.strip()[:300])
