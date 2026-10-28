"""The Workbench's native module (`backend/native`, ADR-0021): code from the ArtCraft apps compiled into one Python
extension, `workbench_native`. This file loads it and names, for the edit trail, exactly which code a result came from.

The module is built at setup (the Docker image and the Windows setup scripts run `maturin`); a computer without it
still runs, and a step that needs it fails with what to run.
"""

from __future__ import annotations

from types import ModuleType

# The forks' commits the module is built from (backend/native/Cargo.toml). Kept here so every derived file and every
# reading names the code that made it.
FILMCRAFT = "FilmCraft audio-dsp (onysnow/filmcraft 0800a8b)"
LIGHTCRAFT = "LightCraft (onysnow/lightcraft 76b5377)"
PDFCRAFT = "PdfCraft (onysnow/pdfcraft fb3fa5d)"

SETUP_HINT = ("The Workbench's native module is not installed on this computer. Run "
              "`pip install ./backend/native` (it needs Rust: https://rustup.rs), or use the Docker image.")


class NativeUnavailable(RuntimeError):
    """The native module is not installed here."""


def native() -> ModuleType:
    try:
        import workbench_native
    except ImportError as exc:
        raise NativeUnavailable(SETUP_HINT) from exc
    module: ModuleType = workbench_native
    return module


def available() -> bool:
    try:
        native()
    except NativeUnavailable:
        return False
    return True
