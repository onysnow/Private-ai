"""Server metrics for the Overview: uptime, memory, CPU, load, disk. psutil is
optional -- without it the numbers that need it are null, never wrong."""

from __future__ import annotations

import os
import platform
import shutil
import sys
import threading
import time
from pathlib import Path
from typing import Any

PROCESS_STARTED_AT = time.time()

try:  # optional dependency
    import psutil
except ImportError:  # pragma: no cover - exercised only where psutil is absent
    # Whether this needs a type: ignore depends on whether psutil ships type stubs in a
    # given environment (mypy treats `import psutil` as untyped Any without them, making
    # this assignment error-free) -- listing "unused-ignore" alongside "assignment" makes
    # the comment correct either way, per mypy's documented idiom for this exact case.
    psutil = None  # type: ignore[assignment,unused-ignore]


def _rss_mb() -> float | None:
    if psutil is not None:
        return float(round(psutil.Process().memory_info().rss / 1e6, 1))
    try:
        import resource

        usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return round(usage / 1024, 1) if sys.platform != "darwin" else round(usage / 1e6, 1)
    except Exception:
        return None


def _in_docker() -> bool:
    if Path("/.dockerenv").exists():
        return True
    try:
        return "docker" in Path("/proc/1/cgroup").read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False


def server_metrics(*, paths: dict[str, str] | None = None) -> dict[str, Any]:
    """`paths` maps a label to a directory whose free space is reported (e.g.
    {"console_dir": "..."}); the first one is also the headline disk."""
    load: list[float] | None
    try:
        load = [round(x, 2) for x in os.getloadavg()]
    except (AttributeError, OSError):
        load = None
    cpu_pct: float | None = None
    if psutil is not None:
        try:
            cpu_pct = psutil.cpu_percent(interval=None)
        except Exception:
            cpu_pct = None
    disks: dict[str, Any] = {}
    for label, p in (paths or {}).items():
        try:
            usage = shutil.disk_usage(p)
            disks[label] = {"path": p, "free_gb": round(usage.free / 1e9, 2), "total_gb": round(usage.total / 1e9, 2), "used_pct": round(100 * (usage.total - usage.free) / usage.total, 1) if usage.total else None}
        except OSError as exc:
            disks[label] = {"path": p, "error": str(exc)}
    return {
        "uptime_seconds": int(time.time() - PROCESS_STARTED_AT), "started_at": PROCESS_STARTED_AT, "pid": os.getpid(),
        "python": sys.version.split()[0], "platform": platform.platform(), "cpu_count": os.cpu_count(), "load_average": load,
        "cpu_percent": cpu_pct, "rss_mb": _rss_mb(), "threads": threading.active_count(), "in_docker": _in_docker(),
        "disks": disks, "psutil": psutil is not None,
    }
