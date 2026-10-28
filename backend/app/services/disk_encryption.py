"""Whether the disk the app runs from is encrypted (ADR-0016, mockups ACCOUNT_1 and ACCOUNT_4).

Protecting the data at rest is the operating system's job (BitLocker / Device encryption, FileVault, dm-crypt). The
app only says what it can find out without administrator rights, and "unknown" when it cannot: inside a Docker
container it cannot see the host's disk at all.
"""
from __future__ import annotations

import os
import platform
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Any

# Windows Shell's System.Volume.BitLockerProtection, readable by an ordinary user (manage-bde needs an administrator).
# Microsoft does not document its values; these are the ones community scripts report (1 on, 2 off, 3 encrypting,
# 4 decrypting, 5 paused, 6 on and locked). Not yet checked on a Windows computer: the reporter can correct it.
_BITLOCKER = {1: "encrypted", 6: "encrypted", 3: "encrypting", 5: "paused", 2: "not_encrypted", 4: "decrypting"}
HOW_TO = {
    "windows": "Windows Settings › Privacy & security › Device encryption (on Windows Pro: BitLocker drive encryption).",
    "mac": "System Settings › Privacy & Security › FileVault.",
    "linux": "Encrypt the disk when installing Linux (LUKS); an existing disk cannot be encrypted in place easily.",
    "docker": "Turn it on in Windows: Settings › Privacy & security › Device encryption. That also covers Docker's disk.",
}


def _run(args: list[str]) -> str:
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=8, check=False).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return ""


def _in_container() -> bool:
    if Path("/.dockerenv").exists():
        return True
    cgroup = Path("/proc/1/cgroup")
    return cgroup.exists() and "docker" in cgroup.read_text(errors="ignore")


def _windows(drive: str) -> str:
    script = f"(New-Object -ComObject Shell.Application).NameSpace('{drive}').Self.ExtendedProperty('System.Volume.BitLockerProtection')"
    out = _run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script])
    try:
        return _BITLOCKER.get(int(out), "unknown")
    except ValueError:
        return "unknown"


def _mac() -> str:
    out = _run(["fdesetup", "status"]).lower()
    return "encrypted" if "filevault is on" in out else "not_encrypted" if "filevault is off" in out else "unknown"


def _linux(path: str) -> str:
    """dm-crypt: the device holding the data folder, or one it sits on, is of type 'crypt'."""
    out = _run(["findmnt", "-n", "-o", "SOURCE", "--target", path])
    if not out:
        return "unknown"
    tree = _run(["lsblk", "-s", "-n", "-o", "TYPE", out.split("[")[0]])
    if not tree:
        return "unknown"
    return "encrypted" if "crypt" in tree.split() else "not_encrypted"


@lru_cache(maxsize=4)
def disk_status(data_dir: str) -> dict[str, Any]:
    system = platform.system().lower()
    if system == "linux" and _in_container():
        return {"state": "unknown", "system": "docker", "why": "the app runs inside Docker and cannot see your computer's disk", "how_to": HOW_TO["docker"]}
    if system == "windows":
        drive = os.path.splitdrive(os.path.abspath(data_dir))[0] or "C:"
        return {"state": _windows(drive + "\\"), "system": "windows", "why": "", "how_to": HOW_TO["windows"]}
    if system == "darwin":
        return {"state": _mac(), "system": "mac", "why": "", "how_to": HOW_TO["mac"]}
    if system == "linux":
        return {"state": _linux(data_dir), "system": "linux", "why": "", "how_to": HOW_TO["linux"]}
    return {"state": "unknown", "system": system, "why": "this system is not one the app knows how to check", "how_to": ""}
