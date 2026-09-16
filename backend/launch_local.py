"""Local desktop-style launcher for Journalism Workbench."""
from __future__ import annotations

import threading
import time
import urllib.request
import webbrowser

import uvicorn


def open_when_ready() -> None:
    for _ in range(40):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8000/api/health", timeout=1) as resp:
                if resp.status == 200:
                    webbrowser.open("http://127.0.0.1:8000")
                    return
        except Exception:
            time.sleep(0.25)


if __name__ == "__main__":
    threading.Thread(target=open_when_ready, daemon=True).start()
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False)
