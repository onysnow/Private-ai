"""How the backend's modules depend on each other, and which ones write which tables.

    python tools/dependency_report.py                      # Markdown to stdout
    python tools/dependency_report.py --out docs/project-notes/DEPENDENCY_REPORT.md

Read from the source alone (Python's ast), so it needs nothing installed and
imports nothing. It answers the 23 Oct 2026 audit's P1 "cross-domain
dependencies" questions for the commit it is run on:

- import cycles among modules imported at load time (an import inside a
  function, made to break a cycle, is counted separately);
- imports that go the wrong way between layers (a model importing a service,
  a service importing a route module, ...);
- the largest modules and the most depended-on ones;
- for each module, the tables it creates, updates or deletes rows in, grouped
  by the model file that defines them, so a module that writes across many
  areas stands out;
- for each route module, the services it calls and whether it writes rows
  itself.

What it cannot see: writes made by setting an attribute on a row that was
loaded elsewhere, and calls made through a variable. It reports what the code
says, not what runs.
"""
from __future__ import annotations

import argparse
import ast
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "backend" / "app"

# Which layers may not import which (the importer's layer -> layers it must not import).
FORBIDDEN = {
    "models": {"api", "services", "jobs", "ai", "connectors", "web"},
    "db": {"api", "services", "jobs", "ai", "connectors", "web"},
    "core": {"api", "services", "jobs", "ai", "connectors", "web"},
    "schemas": {"api", "services", "jobs"},
    "services": {"api", "web"},
    "ai": {"api", "web"},
    "jobs": {"api", "web"},
    "connectors": {"api", "web"},
}
WRITE_CALLS = {"update", "delete", "insert"}


@dataclass
class Module:
    name: str
    path: Path
    lines: int
    load_imports: set[str] = field(default_factory=set)      # at import time
    deferred_imports: set[str] = field(default_factory=set)  # inside a function
    typing_imports: set[str] = field(default_factory=set)    # under TYPE_CHECKING
    writes: set[str] = field(default_factory=set)            # model class names


def module_name(path: Path) -> str:
    parts = list(path.relative_to(APP.parent).with_suffix("").parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def layer(name: str) -> str:
    parts = name.split(".")
    return parts[1] if len(parts) > 1 else ""


def model_classes(modules: dict[str, Module]) -> dict[str, str]:
    """Model class name -> the models module that defines it."""
    found: dict[str, str] = {}
    for name, mod in modules.items():
        if not name.startswith("app.models.") or name in ("app.models.domain", "app.models.base"):
            continue
        tree = ast.parse(mod.path.read_text(encoding="utf-8"))
        for node in tree.body:
            if isinstance(node, ast.ClassDef) and any(
                isinstance(item, ast.Assign) and any(getattr(t, "id", None) == "__tablename__" for t in item.targets)
                or isinstance(item, ast.AnnAssign) and getattr(item.target, "id", None) == "__tablename__"
                for item in node.body
            ):
                found[node.name] = name
    return found


class Reader(ast.NodeVisitor):
    def __init__(self, mod: Module, known: set[str], models: set[str]) -> None:
        self.mod, self.known, self.models = mod, known, models
        self.depth = 0          # inside a function
        self.typing = 0         # inside `if TYPE_CHECKING:`

    def _target(self, base: str, names: list[str]) -> list[str]:
        out = []
        for name in names:
            full = f"{base}.{name}" if base else name
            out.append(full if full in self.known else base)
        return [m for m in out if m in self.known]

    def _add(self, targets: list[str]) -> None:
        bucket = (self.mod.typing_imports if self.typing else
                  self.mod.deferred_imports if self.depth else self.mod.load_imports)
        bucket.update(t for t in targets if t != self.mod.name)

    def visit_Import(self, node: ast.Import) -> None:
        self._add([alias.name for alias in node.names if alias.name in self.known])

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        base = node.module or ""
        if node.level:
            package = self.mod.name.split(".")
            if self.mod.path.name != "__init__.py":
                package = package[:-1]
            package = package[: len(package) - (node.level - 1)]
            base = ".".join([*package, base] if base else package)
        if base.startswith("app"):
            self._add(self._target(base, [alias.name for alias in node.names]))

    def visit_If(self, node: ast.If) -> None:
        test = node.test
        typing = (isinstance(test, ast.Name) and test.id == "TYPE_CHECKING") or (
            isinstance(test, ast.Attribute) and test.attr == "TYPE_CHECKING")
        if typing:
            self.typing += 1
            for child in node.body:
                self.visit(child)
            self.typing -= 1
            for child in node.orelse:
                self.visit(child)
        else:
            self.generic_visit(node)

    def _function(self, node: ast.AST) -> None:
        self.depth += 1
        self.generic_visit(node)
        self.depth -= 1

    visit_FunctionDef = visit_AsyncFunctionDef = visit_Lambda = _function

    def visit_Call(self, node: ast.Call) -> None:
        func = node.func
        # Model(...): a new row (or a query object, which is rare for a model class).
        if isinstance(func, ast.Name) and func.id in self.models:
            self.mod.writes.add(func.id)
        # update(Model) / delete(Model) / insert(Model)
        if isinstance(func, ast.Name) and func.id in WRITE_CALLS and node.args:
            arg = node.args[0]
            if isinstance(arg, ast.Name) and arg.id in self.models:
                self.mod.writes.add(arg.id)
        # db.delete(row) is a write we cannot type; Model.__table__.update() is
        if isinstance(func, ast.Attribute) and func.attr in WRITE_CALLS:
            value = func.value
            if isinstance(value, ast.Attribute) and value.attr == "__table__" and isinstance(value.value, ast.Name) \
                    and value.value.id in self.models:
                self.mod.writes.add(value.value.id)
        self.generic_visit(node)


def read_modules() -> tuple[dict[str, Module], dict[str, str]]:
    modules = {}
    for path in sorted(APP.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        modules[module_name(path)] = Module(module_name(path), path, len(path.read_text(encoding="utf-8").splitlines()))
    models = model_classes(modules)
    for mod in modules.values():
        Reader(mod, set(modules), set(models)).visit(ast.parse(mod.path.read_text(encoding="utf-8")))
    return modules, models


def cycles(modules: dict[str, Module]) -> list[list[str]]:
    """Strongly connected components with more than one module (Tarjan)."""
    index: dict[str, int] = {}
    low: dict[str, int] = {}
    stack: list[str] = []
    on_stack: set[str] = set()
    found: list[list[str]] = []
    counter = [0]
    sys.setrecursionlimit(10000)

    def visit(node: str) -> None:
        index[node] = low[node] = counter[0]
        counter[0] += 1
        stack.append(node); on_stack.add(node)
        for nxt in modules[node].load_imports:
            if nxt not in index:
                visit(nxt)
                low[node] = min(low[node], low[nxt])
            elif nxt in on_stack:
                low[node] = min(low[node], index[nxt])
        if low[node] == index[node]:
            group = []
            while True:
                top = stack.pop(); on_stack.discard(top); group.append(top)
                if top == node:
                    break
            if len(group) > 1:
                found.append(sorted(group))

    for name in sorted(modules):
        if name not in index:
            visit(name)
    return sorted(found, key=len, reverse=True)


def area(model_module: str) -> str:
    return model_module.rsplit(".", 1)[-1]


def report(modules: dict[str, Module], models: dict[str, str]) -> str:
    try:
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    except OSError:
        sha = "unknown"
    out: list[str] = []
    w = out.append
    w("# Backend dependency report\n")
    w(f"Generated by `tools/dependency_report.py` from commit `{sha}`. Read from the source, not run; "
      "see the script's docstring for what it cannot see.\n")
    total = sum(m.lines for m in modules.values())
    w(f"{len(modules)} modules, {total:,} lines, {len(models)} tables.\n")

    w("## Import cycles at load time\n")
    found = cycles(modules)
    if not found:
        w("None.\n")
    for group in found:
        w(f"- {len(group)} modules: " + ", ".join(f"`{g}`" for g in group))
    w("")
    deferred = sum(len(m.deferred_imports) for m in modules.values())
    w(f"Imports made inside a function instead (often to break a cycle): {deferred}.\n")

    w("## Imports that go the wrong way between layers\n")
    wrong = []
    for mod in modules.values():
        banned = FORBIDDEN.get(layer(mod.name), set())
        for target in sorted(mod.load_imports | mod.deferred_imports):
            if layer(target) in banned:
                when = "load" if target in mod.load_imports else "in a function"
                wrong.append(f"| `{mod.name}` | `{target}` | {when} |")
    if wrong:
        w("| Module | Imports | When |\n|---|---|---|")
        out.extend(sorted(wrong))
    else:
        w("None.")
    w("")

    w("## Largest modules\n")
    w("| Module | Lines | Imported by |\n|---|---:|---:|")
    importers: dict[str, int] = defaultdict(int)
    for mod in modules.values():
        for target in mod.load_imports | mod.deferred_imports:
            importers[target] += 1
    for mod in sorted(modules.values(), key=lambda m: m.lines, reverse=True)[:20]:
        w(f"| `{mod.name}` | {mod.lines:,} | {importers[mod.name]} |")
    w("")
    w("## Most depended-on modules\n")
    w("| Module | Imported by | Lines |\n|---|---:|---:|")
    for name, count in sorted(importers.items(), key=lambda kv: kv[1], reverse=True)[:15]:
        w(f"| `{name}` | {count} | {modules[name].lines:,} |")
    w("")

    w("## Modules that write rows in many areas\n")
    w("An area is the model file that defines the table. Writing across areas is not wrong in itself "
      "(promotion writes evidence, entities and statements by design); it is where a change in one "
      "area can break another.\n")
    w("| Module | Areas | Tables |\n|---|---:|---|")
    spread = []
    for mod in modules.values():
        if mod.name.startswith("app.models") or not mod.writes:
            continue
        areas = sorted({area(models[t]) for t in mod.writes})
        spread.append((len(areas), mod.name, areas, sorted(mod.writes)))
    for count, name, areas, tables in sorted(spread, reverse=True)[:20]:
        w(f"| `{name}` | {count} ({', '.join(areas)}) | {', '.join(tables)} |")
    w("")

    w("## Route modules\n")
    w("| Route module | Lines | Services and other modules it calls | Writes rows itself |\n|---|---:|---|---|")
    for mod in sorted(modules.values(), key=lambda m: m.name):
        if not mod.name.startswith("app.api.routes"):
            continue
        calls = sorted({t.split(".", 2)[-1] for t in mod.load_imports | mod.deferred_imports
                        if layer(t) in ("services", "ai", "jobs", "connectors")})
        writes = ", ".join(sorted(mod.writes)) or "no"
        w(f"| `{mod.name.rsplit('.', 1)[-1]}` | {mod.lines:,} | {', '.join(calls) or '-'} | {writes} |")
    w("")
    return "\n".join(out)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, help="write the Markdown here instead of stdout")
    args = parser.parse_args()
    modules, models = read_modules()
    text = report(modules, models)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
