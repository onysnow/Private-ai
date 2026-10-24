"""Ask TAS Modules 06 and 08, and one module of every suite system, real questions with a real local model,
and record what the app accepts.

    TZ=UTC python tools/model_trial.py --model qwen2.5:3b --out docs/project-notes/MODEL_TRIAL.md

The reasoning tests (backend/tests/test_reasoning_endpoints.py) use a fake
model, so whether a model a reporter can run on their own computer follows
the Authority System Suite's schemas had not been measured
(docs/authority-suite/SUITE_COVERAGE.md). This loads one of the demo cases,
then asks Case Synthesis (TAS Module 08) and Hypothesis and Contradiction
Testing (Module 06) each question through the app's own endpoints, with
Ollama as the provider, and records for each run: whether the answer was
staged for review or refused, the app's reason when refused (an invented
citation, a quote not in the source, a schema the answer broke), how many
claims, hypotheses or records it gave and how many citations the app checked, and how
long it took.

Needs Ollama answering at --ollama-url with the model pulled. Runs the
Workbench in this process on a throwaway SQLite database.
"""
from __future__ import annotations

import argparse
import os
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
WORK = Path(tempfile.mkdtemp(prefix="model-trial-"))
os.environ.setdefault("TZ", "UTC")
os.environ["DATABASE_URL"] = f"sqlite:///{WORK / 'trial.db'}"
os.environ["JOB_RUNNER"] = "inline"
os.environ["DOCUMENT_READ_IN_SUBPROCESS"] = "false"

QUESTIONS = {
    "case_synthesis": [
        "What does the record establish about who made the cash deposits, and what is still unproven?",
        "Which claims in this case are corroborated, and by which evidence?",
    ],
    "hypothesis_test": [
        "Were the deposits structured to avoid the reporting threshold, or is there an innocent explanation?",
        "Did a single person control every account in this case?",
    ],
}
# Module 06 tests a stated working theory against the record (HypothesisTestRequest.working_theory).
WORKING_THEORIES = {
    QUESTIONS["hypothesis_test"][0]: "The cash deposits were split to stay under the $10,000 reporting threshold.",
    QUESTIONS["hypothesis_test"][1]: "One person controlled every account the deposits went into.",
}
ROUTES = {"case_synthesis": "case-synthesis", "hypothesis_test": "hypothesis-test"}
# One module of each Authority System Suite system (ADR-0015), asked about the same case.
SUITE_QUESTIONS = {
    "suite:ras.01": "Frame a research question on how banks and regulators detect cash structuring.",
    "suite:tas.01": "Extract the evidence about who made the cash deposits and when.",
    "suite:qas.01": "Frame the question of whether the deposits were kept under the $10,000 reporting threshold.",
    "suite:las.01": "Reconstruct the argument that the deposits were structured to avoid the reporting requirement.",
    "suite:das.01": "Frame the decision: publish the structuring finding now, or wait for the account holder's reply?",
    "suite:egs.01": "Plan how to obtain the bank's records of these deposits.",
    "suite:ehs.01": "Is naming the account holder in the public interest, and is it proportionate?",
}
for key, question in SUITE_QUESTIONS.items():
    QUESTIONS[key] = [question]
    system, number = key.removeprefix("suite:").split(".")
    ROUTES[key] = f"suite/{system}/{number}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", required=True)
    parser.add_argument("--ollama-url", default="http://127.0.0.1:11434")
    parser.add_argument("--case", default="us-v-anise-structuring")
    parser.add_argument("--repeat", type=int, default=1, help="runs per question")
    parser.add_argument("--max-results", type=int, default=10, help="records the packet holds")
    parser.add_argument("--only", nargs="*", help="modules to run (default: all)")
    parser.add_argument("--timeout", type=float, default=900, help="seconds the app waits for the model")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    from fastapi.testclient import TestClient

    from app.ai.governor import governor
    from app.core.config import settings
    from app.db.migrations import ensure_database_schema
    from app.db.session import engine
    from app.main import app

    ensure_database_schema(engine)
    settings.document_storage_dir = str(WORK / "docs")
    settings.enable_ai_features = True
    settings.ai_provider = "ollama"
    settings.ollama_base_url = args.ollama_url
    settings.ollama_model = args.model
    settings.ai_request_timeout_seconds = args.timeout
    client = TestClient(app)

    loaded = client.post(f"/api/demo/cases/{args.case}").json()
    inv = loaded.get("investigation_id") or loaded.get("investigation", {}).get("id")
    if not inv:
        raise SystemExit(f"the demo case did not load: {loaded}")

    rows = []
    for module, questions in QUESTIONS.items():
        if args.only and module not in args.only:
            continue
        for question in questions:
            for attempt in range(1, args.repeat + 1):
                governor.reset()
                started = time.monotonic()
                body_in = {"question": question, "max_results": args.max_results}
                if module == "hypothesis_test":
                    body_in["working_theory"] = WORKING_THEORIES[question]
                reply = client.post(f"/api/investigations/{inv}/assistant/{ROUTES[module]}", json=body_in)
                seconds = round(time.monotonic() - started)
                body = reply.json()
                payload = body.get("payload") or {}
                detail = body.get("detail")
                reason = (detail if isinstance(detail, str) else (detail or {}).get("message") if isinstance(detail, dict)
                          else "; ".join(str(e.get("msg")) for e in detail) if isinstance(detail, list) else None)
                items = payload.get("claims") or payload.get("hypothesis_matrix") or payload.get("records") or []
                rows.append({
                    "module": module, "question": question, "attempt": attempt, "http": reply.status_code, "seconds": seconds,
                    "outcome": body.get("review_status") or "refused",
                    "reason": (reason or (body.get("job") or {}).get("error") or "")[:220],
                    "items": len(items),
                    "citations": sum(len(i.get("supporting_evidence") or []) + len(i.get("contradicting_evidence") or [])
                                     + len(i.get("cites") or []) for i in items if isinstance(i, dict)),
                })
                print(rows[-1], flush=True)

    staged = sum(1 for r in rows if r["outcome"] == "proposed")
    lines = [
        "# A real local model on TAS Modules 06 and 08 and one module of each suite system\n",
        f"Generated by `tools/model_trial.py` on {time.strftime('%Y-%m-%d')}: `{args.model}` through Ollama, on the "
        f"`{args.case}` demo case, {args.repeat} run(s) per question, {args.max_results} records per packet, CPU only. "
        "Staged means the answer passed every "
        "check the app makes (its schema, the evidence it may cite, quotes found in their source) and waits for a "
        "reporter's review; refused means the app turned it away, with its reason.\n",
        f"**{staged} of {len(rows)} answers staged.**\n",
        "| Module | Question | Run | Outcome | Items | Citations | Seconds | App's reason |",
        "|---|---|---:|---|---:|---:|---:|---|",
    ]
    for r in rows:
        lines.append(f"| {r['module']} | {r['question'][:70]} | {r['attempt']} | {r['outcome']} | {r['items']} | "
                     f"{r['citations']} | {r['seconds']} | {r['reason'].replace('|', '/')} |")
    text = "\n".join(lines) + "\n"
    print(text)
    if args.out:
        args.out.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
