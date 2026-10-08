"""Tools for the indicator catalogue (ADR-0007).

    python tools/catalogue.py ingest RESULT.json [RESULT.json ...]
        Turn research-workflow results into catalogue/indicators/<area>.yaml
        and catalogue/glossary/<area>.yaml. The checking agent's verdicts
        decide what counts as verified: a quote is verified only if it was
        found word for word (or replaced by the exact text the checker
        found), a case only if its outcome was confirmed (or corrected).
    python tools/catalogue.py schema
        Write the JSON Schema files in catalogue/schema/ from the models.
    python tools/catalogue.py coverage
        Print the coverage report as Markdown.

Run with the backend virtualenv's python.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import yaml  # type: ignore[import-untyped]  # noqa: E402

from app.catalogue.loader import load, problems  # noqa: E402
from app.catalogue.models import AREAS, Area, Glossary, Indicator, Outcome, has_threshold_number  # noqa: E402

CAT = ROOT / "catalogue"

AREA_NAMES = AREAS
# Words in a free-text area name that decide which area it means; checked in order.
AREA_WORDS = [
    ("SA", ["safety", "investigator", "journalist", "witness protection"]),
    ("HT", ["trafficking in persons", "human trafficking", "forced labour", "forced labor", "labour exploitation", "migrant smuggling", "child", "supply chain"]),
    ("EN", ["environment", "wildlife", "fishing", "logging", "mining", "waste", "pollution"]),
    ("HR", ["human rights", "war crime", "atrocity", "cultural property", "antiquit", "state abuse"]),
    ("SF", ["sanction", "terror", "prolifera", "export control", "maritime"]),
    ("BO", ["ownership", "shell", "nominee", "front compan"]),
    ("PP", ["procurement", "bid", "non-profit", "nonprofit", "charit", "election", "campaign"]),
    ("CO", ["corruption", "bribery", "influence", "conflict of interest", "lobby", "politically exposed", "state capture", "political figure", "diplomat", "interference", "transnational repression"]),
    ("FR", ["fraud", "elder", "tax", "ponzi", "securities", "insurance", "healthcare"]),
    ("CY", ["cyber", "ransomware", "scam", "crypto", "source reliab", "grading"]),
    ("IN", ["disinformation", "information", "forg", "academic", "media manipulation", "sock"]),
    ("OC", ["organised crime", "organized crime", "drug", "arms", "counterfeit", "match-fixing", "illicit goods", "gambling", "sport"]),
    ("ML", ["laundering"]),
]


def area_key(text: str) -> str | None:
    t = text.strip()
    if t in AREA_NAMES:
        return t
    for key, name in AREA_NAMES.items():
        if t.lower() == name.lower():
            return key
    low = t.lower()
    for key, words in AREA_WORDS:
        if any(w in low for w in words):
            return key
    return None


WEAK_FIT = re.compile(r"weak fit|only a general example|does not specifically|loosely relevant|only loosely|loose fit", re.IGNORECASE)


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')).strip()


def ingest(paths: list[str]) -> None:
    today = date.today()
    unresolved: list[str] = []
    refused: list[str] = []
    for path in paths:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        data = data.get("result", data)
        for res in data["results"]:
            area, research, verdicts = res["area"], res.get("research"), res.get("verdicts") or {"indicators": []}
            if not research:
                print(f"{area['key']}: no research returned", file=sys.stderr)
                continue
            by_id = {v["id"]: v for v in verdicts.get("indicators", [])}
            indicators = []
            for raw in research["indicators"]:
                v = by_id.get(raw["id"])
                if v is not None and not v.get("keep", True):
                    continue
                src_verdicts = {s["url"]: s for s in (v or {}).get("sources", [])}
                sources = []
                for s in raw["sources"]:
                    sv = src_verdicts.get(s["url"])
                    quote, ok = s["quote"], False
                    if sv and sv.get("opened"):
                        if sv.get("quote_verbatim"):
                            ok = True
                        elif (sv.get("corrected_quote") or "").strip():
                            quote, ok = sv["corrected_quote"].strip(), True
                    sources.append({**{k: s.get(k) for k in ("title", "publisher", "year", "url", "locator", "licence")}, "quote": quote,
                                    "quote_verified": ok, "checked": today if sv and sv.get("opened") else None})
                case_verdicts = {norm(c["name"]): c for c in (v or {}).get("cases", [])}
                cases = []
                for c in raw.get("cases", []):
                    cv = case_verdicts.get(norm(c["name"]))
                    outcome, ok = c["outcome"], False
                    if cv:
                        if WEAK_FIT.search(cv.get("note") or ""):
                            continue  # the checker found the case does not show this indicator
                        if cv.get("correct_outcome") in Outcome.__members__:
                            outcome, ok = cv["correct_outcome"], True
                        elif cv.get("outcome_confirmed"):
                            ok = True
                    cases.append({**{k: c.get(k) for k in ("name", "year", "jurisdiction", "what_happened", "source_url", "source_title")},
                                  "outcome": outcome, "outcome_verified": ok})
                hints = []
                for h in raw.get("cross_hints", []):
                    key = area_key(h["target_area"])
                    if key is None:
                        unresolved.append(f"{raw['id']}: {h['target_area']}")
                        continue
                    hints.append({"target_area": key, "reason": h["reason"], "source_url": h["source_url"]})
                ind = {
                    "id": raw["id"], "name": raw["name"], "definition": raw["definition"],
                    "areas": sorted({area["key"], *[k for k in (area_key(a) for a in raw.get("areas", [])) if k]}),
                    "typology": raw.get("typology"), "sources": sources, "examples": raw.get("examples", []), "cases": cases,
                    "data_needed": raw.get("data_needed", []), "checkable": raw["checkable"], "lookup_sources": raw.get("lookup_sources", []),
                    "levels": raw["levels"], "threshold_verified": bool(v and v.get("threshold_confirmed")),
                    "cross_hints": hints, "innocent_explanations": raw.get("innocent_explanations") or ["None recorded yet."],
                    "jurisdictions": raw.get("jurisdictions"),
                }
                try:
                    draft = Indicator.model_validate(ind)
                except ValueError as exc:
                    refused.append(f"{raw['id']}: {exc.errors()[0]['msg'] if hasattr(exc, 'errors') else exc} | {raw['levels']}")
                    continue
                ok_all = all(s.quote_verified for s in draft.sources) and all(c.outcome_verified for c in draft.cases) and (
                    draft.threshold_verified or not has_threshold_number(draft.levels.faint, draft.levels.strong, draft.levels.textbook))
                ind["status"] = "verified" if ok_all and v is not None else "pending"
                indicators.append(Indicator.model_validate(ind))
            model = Area(key=area["key"], name=area["name"], scope=area["scope"], indicators=indicators, not_reached=research.get("not_reached", []))
            dump(CAT / "indicators" / f"{area['key'].lower()}.yaml", model.model_dump(mode="json", exclude_none=True))
            terms = [{"term": t["term"], "definition": t["definition"], "examples": t.get("examples", []), "source_url": t["source_url"],
                      "related": t.get("related", []), "areas": [area["key"]]} for t in research.get("glossary", [])]
            dump(CAT / "glossary" / f"{area['key'].lower()}.yaml", Glossary(area=area["key"], terms=terms).model_dump(mode="json", exclude_none=True))
            print(f"{area['key']}: {len(indicators)} indicators ({sum(i.status.value == 'verified' for i in indicators)} verified), {len(terms)} glossary terms")
    if refused:
        print("Refused (fix by hand, then ingest again):", *refused, sep="\n  ", file=sys.stderr)
    if unresolved:
        print("Cross-hints to an area no file covers (dropped):", *unresolved, sep="\n  ", file=sys.stderr)


def dump(path: Path, data: object) -> None:
    path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=100), encoding="utf-8")


def schema() -> None:
    for name, model in (("indicator-area", Area), ("glossary", Glossary)):
        (CAT / "schema" / f"{name}.schema.json").write_text(json.dumps(model.model_json_schema(), indent=2) + "\n", encoding="utf-8")


def coverage() -> None:
    cat = load()
    print("| Area | Indicators | Verified | From records | After lookups | Person only | Sources not reached |")
    print("|---|---|---|---|---|---|---|")
    for a in cat.areas:
        n = len(a.indicators)
        by = {k: sum(i.checkable.value == k for i in a.indicators) for k in ("records", "lookups", "person")}
        ver = sum(i.status.value == "verified" for i in a.indicators)
        print(f"| {a.name} | {n} | {ver} | {by['records']} | {by['lookups']} | {by['person']} | {len(a.not_reached)} |")
    issues = problems(cat)
    if issues:
        print("\nProblems:", *issues, sep="\n- ")


if __name__ == "__main__":
    cmd, *rest = sys.argv[1:] or ["help"]
    {"ingest": lambda: ingest(rest), "schema": schema, "coverage": coverage}.get(cmd, lambda: print(__doc__))()
