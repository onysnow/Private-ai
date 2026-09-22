"""opsconsole -- a reusable operator console for FastAPI + SQLAlchemy backends.

    from opsconsole import ConsoleConfig, mount
    handle = mount(app, ConsoleConfig(metadata=Base.metadata, engine=engine, ...))

The package never imports the host application: everything app-specific
arrives through `ConsoleConfig` (see docs/opsconsole/DESIGN.md and ADR-0003).
"""

from __future__ import annotations

from opsconsole.config import ConsoleConfig, Limits, TablePolicy, WritePolicy
from opsconsole.mount import ConsoleHandle, mount
from opsconsole.protocols import (
    AuthPolicy,
    Check,
    CheckResult,
    LogFilter,
    LogLine,
    LogSource,
    Principal,
    Probe,
    RouteMeta,
    RunHandle,
    TestNode,
    TestRunner,
    TestSummary,
    Tile,
    TileProvider,
)
from opsconsole.version import __version__

__all__ = [
    "AuthPolicy", "Check", "CheckResult", "ConsoleConfig", "ConsoleHandle", "Limits", "LogFilter", "LogLine",
    "LogSource", "Principal", "Probe", "RouteMeta", "RunHandle", "TablePolicy", "TestNode", "TestRunner",
    "TestSummary", "Tile", "TileProvider", "WritePolicy", "mount",
]
