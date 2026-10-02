"""Investigation visuals: the query catalogue the AI and the chart builder
order from, a preview that cooks, draws and checks one order slip without
the AI, and a restyle that draws a stored chart again in a style and checks
it again (app/visuals). Routes stay thin per STRUCT-0002; all are scoped to
the investigation like every other route (authorize_request_resource).
"""
import math
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Investigation
from app.schemas.api import ChartRestyleRequest
from app.schemas.responses import ChartRestyleOut, ErrorOut, ValidationErrorOut, VisualCatalogOut, VisualPreviewOut
from app.services.presentation_style import resolved_theme, theme as theme_for
from app.visuals.checker import check_visual
from app.visuals.data_service import QueryError, VisualData, describe_catalog, run_query
from app.visuals.echarts import ChartDoesNotFit, UnsupportedChartKind, build_chart
from app.visuals.spec import SERIES_KINDS, VisualSpec
from app.visuals.style import available_presets, default_preset, normalize_chart_style, resolved_options, style_warnings, styled_chart

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/investigations/{investigation_id}/visuals/catalog", response_model=VisualCatalogOut)
def investigation_visual_catalog(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """The menu: every chart query, its parameters, and whether this
    investigation has data for it."""
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    try:
        return describe_catalog(db, investigation_id)
    except QueryError as exc:
        raise HTTPException(404, str(exc))


@router.post("/investigations/{investigation_id}/visuals/preview", response_model=VisualPreviewOut, responses={
    422: {"model": ValidationErrorOut | ErrorOut, "description": "The input does not match the route, or the chart kind cannot be drawn"},
})
def investigation_visual_preview(investigation_id: str, body: VisualSpec, db: Session = Depends(get_db)) -> Any:
    """Cook, draw and check one order slip. The reply carries the data
    (every value with its records), the ECharts option, the check report
    and the chart's words. A failing chart is still returned, with
    `report.ok` false, so the screen can show what is wrong."""
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    try:
        data = run_query(db, investigation_id, body.query)
        theme = theme_for(body.theme)
        built = build_chart(body, data, theme)
    except QueryError as exc:
        raise HTTPException(404, str(exc))
    except (UnsupportedChartKind, ChartDoesNotFit) as exc:
        # Not drawn yet, or a kind that cannot draw this query's rows at all
        # (a scatter plot of one number): no chart exists to check.
        raise HTTPException(422, str(exc))
    report = check_visual(body, data, theme, built)
    return {
        "spec": body.model_dump(mode="json"),
        "data": data.as_dict(),
        "option": built.option,
        "report": report.as_dict(),
        "alt_text": built.alt_text,
        "description": built.description,
        "data_table": built.data_table,
        "source_line": built.source_line,
        "width": built.width,
        "height": built.height,
    }


def _stored_chart(chart: dict[str, Any]) -> tuple[VisualSpec, VisualData]:
    """The order slip and cooked rows of a chart as a draft or a deck keeps
    it, or a 422 that says what is missing. The rows come from the client
    here, so they are held to what the data service writes: finite numbers,
    a known query shape and unit."""
    try:
        spec = VisualSpec.model_validate(chart.get("spec"))
        data = VisualData.from_dict(chart["data"]) if isinstance(chart.get("data"), dict) else None
    except (ValidationError, TypeError, ValueError, AttributeError) as exc:
        raise HTTPException(422, f"the chart is not one the Workbench stored: {exc}")
    if data is None or not data.rows:
        raise HTTPException(422, "the chart has no cooked data to draw")
    if data.series_kind not in SERIES_KINDS or data.unit_kind not in ("amount", "count"):
        raise HTTPException(422, "the chart's data does not say what its rows are (series_kind and unit_kind)")
    if not all(math.isfinite(row.value) and (row.x is None or math.isfinite(row.x)) for row in data.rows):
        raise HTTPException(422, "the chart's data holds a value that is not a finite number")
    return spec, data


@router.post("/investigations/{investigation_id}/visuals/restyle", response_model=ChartRestyleOut, responses={
    422: {"model": ValidationErrorOut | ErrorOut, "description": "The input does not match the route, or the chart cannot be drawn in this style"},
})
def investigation_visual_restyle(investigation_id: str, body: ChartRestyleRequest, db: Session = Depends(get_db)) -> Any:
    """Draw a stored chart again in a style and a deck theme, and check it
    again: what the style panel shows for a chart. The chart's rows are
    drawn as given and never changed, and nothing is stored; a deck that is
    saved or exported checks its charts once more itself. The reply is the
    preview's, plus the style as it will be kept, the presets this chart can
    take, every option its kind offers with its value, and the warnings to
    show beside the controls."""
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    spec, data = _stored_chart(body.chart)
    theme = resolved_theme(body.deck_style.model_dump() if body.deck_style else None)
    raw_style = body.style.model_dump() if body.style else None
    try:
        styled, draw = styled_chart(spec, data, raw_style)
        built = build_chart(styled, data, theme, draw=draw)
    except (UnsupportedChartKind, ChartDoesNotFit) as exc:
        raise HTTPException(422, str(exc))
    report = check_visual(styled, data, theme, built)
    return {
        "spec": styled.model_dump(mode="json"), "data": data.as_dict(), "option": built.option, "report": report.as_dict(),
        "alt_text": built.alt_text, "description": built.description, "data_table": built.data_table, "source_line": built.source_line,
        "width": built.width, "height": built.height,
        "style": normalize_chart_style(spec, data, raw_style) or {"preset": "", "options": {}},
        "presets": [p["id"] for p in available_presets(spec, data)], "default_preset": default_preset(spec),
        "options": resolved_options(styled, data, draw), "warnings": style_warnings(styled, data, draw),
    }
