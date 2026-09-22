"""TestRunner over a pytest subprocess with an isolated environment."""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Mapping, Sequence

from opsconsole.protocols import RunHandle, TestNode, TestSummary

_SUMMARY = re.compile(r"(\d+) (passed|failed|error|errors|skipped|xfailed|xpassed|deselected|warnings?)")


class PytestRunner:
    """`root` is the directory pytest runs in; `env` overrides (e.g. DATABASE_URL
    pointing at a scratch database) are layered over os.environ so the suite can
    never touch the live data."""

    def __init__(self, root: Path, *, env: Mapping[str, str] | None = None, args: Sequence[str] = ("-q", "-o", "addopts=", "-p", "no:cacheprovider", "-W", "ignore::UserWarning"),
                 default_target: str = "tests", python: str | None = None) -> None:
        self.root = Path(root)
        self.env = dict(env or {})
        self.args = list(args)
        self.default_target = default_target
        self.python = python or sys.executable

    def _env(self) -> dict[str, str]:
        env = dict(os.environ)
        env.update(self.env)
        env["PYTHONUNBUFFERED"] = "1"
        return env

    def collect(self) -> list[TestNode]:
        cmd = [self.python, "-m", "pytest", "--collect-only", "-q", "-o", "addopts=", "-p", "no:cacheprovider", self.default_target]
        proc = subprocess.run(cmd, cwd=self.root, env=self._env(), capture_output=True, text=True, timeout=300)
        nodes: dict[str, TestNode] = {}
        for line in proc.stdout.splitlines():
            line = line.strip()
            if "::" not in line or line.startswith(("=", "-", "no tests")):
                continue
            parts = line.split("::")
            file_id = parts[0]
            if file_id not in nodes:
                nodes[file_id] = TestNode(id=file_id, kind="file", parent=None, title=file_id)
            parent = file_id
            for i, part in enumerate(parts[1:], start=1):
                node_id = "::".join(parts[: i + 1])
                is_last = i == len(parts) - 1
                if node_id not in nodes:
                    nodes[node_id] = TestNode(id=node_id, kind="test" if is_last else "class", parent=parent, title=part)
                parent = node_id
        return list(nodes.values())

    def run(self, selection: str | None, handle: RunHandle) -> int:
        cmd = [self.python, "-m", "pytest", *self.args]
        if selection:
            targets = selection.split()
            if all(t.startswith(self.default_target) or "::" in t or t.endswith(".py") for t in targets):
                cmd += targets
            else:
                cmd += ["-k", selection]
        else:
            cmd.append(self.default_target)
        handle.log("$ " + " ".join(cmd))
        proc = subprocess.Popen(cmd, cwd=self.root, env=self._env(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace", bufsize=1)
        run_any: Any = handle
        run_any.process_pid = proc.pid
        run_any.on_cancel = proc.terminate
        assert proc.stdout is not None
        for line in proc.stdout:
            handle.log(line)
        code = proc.wait()
        if handle.cancelled and proc.returncode is None:
            proc.kill()
        return code

    def parse_summary(self, lines: Sequence[str]) -> TestSummary:
        summary = TestSummary()
        for line in reversed(lines):
            if _SUMMARY.search(line) and ("passed" in line or "failed" in line or "error" in line or "no tests ran" in line):
                summary.line = line.strip("= ").strip()
                for n, word in _SUMMARY.findall(line):
                    if word == "passed":
                        summary.passed = int(n)
                    elif word == "failed":
                        summary.failed = int(n)
                    elif word.startswith("error"):
                        summary.errors = int(n)
                    elif word == "skipped":
                        summary.skipped = int(n)
                break
        summary.failed_ids = [ln.split()[1] for ln in lines if ln.startswith(("FAILED ", "ERROR ")) and len(ln.split()) > 1][:500]
        summary.failed_ids = [x.split(" - ")[0] for x in summary.failed_ids]
        return summary
