"""Investigation visuals: the query catalogue the AI orders from, and a
preview that cooks, draws and checks one order slip without the AI
(app/visuals). Routes stay thin per STRUCT-0002; both are scoped to the
investigation like every other route (authorize_request_resource).
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Investigation
from app.schemas.responses import VisualCatalogOut, VisualPreviewOut
from app.services.presentation_style import theme as theme_for
from app.visuals.checker import check_visual
from app.visuals.data_service import QueryError, describe_catalog, run_query
from app.visuals.echarts import UnsupportedChartKind, build_chart
from app.visuals.spec import VisualSpec

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


@router.post("/investigations/{investigation_id}/visuals/preview", response_model=VisualPreviewOut)
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
    except UnsupportedChartKind as exc:
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
