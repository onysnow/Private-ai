"""The chart check: every chart the model orders for a presentation draft is
cooked from the investigation's own records and tested before the draft
reaches the review queue (design doc, "How a prompt becomes a chart").

A chart visual in a draft is an order slip, `{"type": "chart", "spec":
{...}}` (app/visuals/spec.py): a chart kind, a title that states the
finding, and a catalogued query. The model never writes a number. This
check runs the query (app/visuals/data_service.py), draws the chart
(app/visuals/echarts.py) and runs the checker (app/visuals/checker.py).
A chart that passes is stored in the draft with its data, its check report
and its words (alt text, description, data table), so the deck, the
write-up and the preview never run the model again. A chart that fails is
removed from the draft and the removal is recorded with the rule numbers
and messages, the way the quote check records its removals
(app/ai/quote_check.py).

When the model can be asked again, `retry_feedback` turns the failures into
a short note for the next attempt; app/ai/reasoning.py asks at most twice
(MAX_CHART_RETRIES), as the design says, then keeps the last answer with
its failing charts removed.
"""

from __future__ import annotations

import copy
from typing import Any

from sqlalchemy.orm import Session

from app.services.presentation_style import theme as theme_for
from app.visuals.checker import check_visual
from app.visuals.data_service import QueryError, describe_catalog, run_query
from app.visuals.echarts import ChartDoesNotFit, UnsupportedChartKind, build_chart
from app.visuals.spec import DRAWN_KINDS, VisualSpec, spec_errors

CHART_VISUAL_TYPE = "chart"
MAX_CHART_RETRIES = 2


def visual_catalog_for_prompt(db: Session, investigation_id: str) -> dict[str, Any]:
    """The menu the model sees in the retrieval packet: the questions a
    chart can answer (FT Visual Vocabulary) with the kinds that answer each
    and the queries that hold that relationship; then each query, its
    parameters, whether this investigation has data for it, and the kinds
    that can draw it. The model picks the question first, then a query
    that answers it, then a kind (PRESENTATION_DRAFT.md)."""
    catalog = describe_catalog(db, investigation_id)
    return {
        "note": ("A chart visual names one of these queries; the Workbench runs it and supplies every number. "
                 "Pick the question the chart answers, then a query listed under it that has data, then one of the question's kinds "
                 f"that can draw that query. Chart kinds that can be drawn now: {', '.join(catalog['drawn_kinds'])}."),
        "questions": [
            {"id": q["id"], "label": q["label"], "description": q["description"], "kinds": q["drawn_kinds"], "queries": q["queries"]}
            for q in catalog["questions"] if q["drawn_kinds"]
        ],
        "queries": [
            {"name": q["name"], "description": q["description"], "params": {k: {"choices": p["choices"], "default": p["default"]} for k, p in q["params"].items()},
             "has_data": q["has_data"], "record_count": q["record_count"], "currencies": q["currencies"], "kinds": q["kinds"], "questions": q["questions"]}
            for q in catalog["queries"]
        ],
    }


def resolve_chart(db: Session, investigation_id: str, visual: dict) -> tuple[dict | None, dict]:
    """Cook, draw and check one chart order. Returns (the resolved visual to
    store, or None when it fails; a record of what happened)."""
    raw_spec = visual.get("spec")
    problems = spec_errors(raw_spec)
    if problems:
        return None, {"reason": "the order slip is not valid", "errors": [{"rule": None, "message": p} for p in problems]}
    spec = VisualSpec.model_validate(raw_spec)
    if spec.kind not in DRAWN_KINDS:
        return None, {"reason": f"chart kind {spec.kind.value!r} is not drawn yet; use {' or '.join(sorted(k.value for k in DRAWN_KINDS))}",
                      "errors": [{"rule": None, "message": f"chart kind {spec.kind.value!r} is not drawn yet"}]}
    try:
        data = run_query(db, investigation_id, spec.query)
    except QueryError as exc:
        return None, {"reason": str(exc), "errors": [{"rule": None, "message": str(exc)}]}
    theme = theme_for(spec.theme)
    try:
        built = build_chart(spec, data, theme)
    except (UnsupportedChartKind, ChartDoesNotFit) as exc:
        # A kind that cannot draw this query (a histogram of periods) is the
        # order's fault, like a failing rule: removed, and the model is told
        # why so it can pick a kind that fits.
        return None, {"reason": str(exc), "errors": [{"rule": None, "message": str(exc)}]}
    report = check_visual(spec, data, theme, built)
    if not report.ok:
        return None, {"reason": "the chart failed the design checks", "errors": [e.as_dict() for e in report.errors],
                      "warnings": [w.as_dict() for w in report.warnings], "rules": report.error_rules()}
    resolved = {
        "type": CHART_VISUAL_TYPE,
        "spec": spec.model_dump(mode="json"),
        "data": data.as_dict(),
        "report": report.as_dict(),
        "text": built.text(),
        # The drawing as checked, so the in-app preview shows exactly what
        # passed; exports draw again from the same data and theme.
        "option": built.option,
        "width": built.width,
        "height": built.height,
    }
    return resolved, {"reason": None, "rules": [], "warnings": [w.as_dict() for w in report.warnings]}


def check_presentation_charts(db: Session, investigation_id: str, payload: dict) -> tuple[dict, dict]:
    """Return (checked payload, report). Every chart visual is replaced by
    its resolved form, or removed with the reasons recorded."""
    checked = copy.deepcopy(payload)
    removed: list[dict] = []
    kept: list[dict] = []
    for i, section in enumerate(checked.get("sections") or []):
        if not isinstance(section, dict):
            continue
        visual = section.get("visual")
        if not isinstance(visual, dict) or visual.get("type") != CHART_VISUAL_TYPE:
            continue
        heading = section.get("heading") or f"section {i + 1}"
        resolved, record = resolve_chart(db, investigation_id, visual)
        title = (visual.get("spec") or {}).get("title") if isinstance(visual.get("spec"), dict) else None
        if resolved is None:
            section["visual"] = None
            removed.append({"where": f"{heading}: chart", "title": title, "spec": visual.get("spec"), **record})
        else:
            section["visual"] = resolved
            kept.append({"where": f"{heading}: chart", "title": title, "warnings": record["warnings"]})
    return checked, {"resolved": kept, "removed": removed}


def retry_feedback(report: dict) -> str | None:
    """A note for the model's next attempt, or None when every chart passed."""
    removed = report.get("removed") or []
    if not removed:
        return None
    lines = [
        "CHART CHECK: the charts below were refused. Return the whole JSON object again with each one fixed, "
        "or with that section's visual set to null. Never add numbers: name a different query, chart kind, "
        "title or parameters instead.",
    ]
    for item in removed:
        lines.append(f"- {item['where']} ({item.get('title') or 'untitled'}): {item.get('reason')}")
        for error in item.get("errors") or []:
            rule = error.get("rule")
            lines.append(f"    rule {rule}: {error['message']}" if rule else f"    {error['message']}")
    return "\n".join(lines)
