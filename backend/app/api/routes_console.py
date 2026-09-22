"""Operator console routes (/api/console/*). Loopback-only: every handler runs
`_require_local` first, so a remote bearer token -- even an admin's -- cannot
list tables, run SQL, probe endpoints, or start a test run. Logic lives in
app/services/console.py; these are thin adapters (STRUCT-0002).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.access import request_is_local_request
from app.core.app_log import read_app_log
from app.core.config import settings
from app.db.session import get_db
from app.services.console import (
    console_overview,
    list_routes,
    list_tables,
    probe_endpoints,
    read_table,
    run_readonly_sql,
    test_runner,
)

router = APIRouter(prefix="/api/console", dependencies=[Depends(authorize_request_resource)])


def _require_local(request: Request) -> None:
    if not settings.console_enabled:
        raise HTTPException(404, "Console is disabled (CONSOLE_ENABLED=false)")
    if not request_is_local_request(request):
        raise HTTPException(403, "The operator console is only available from the local machine")


class SqlRequest(BaseModel):
    sql: str = Field(min_length=1, max_length=20000)
    max_rows: int = Field(default=200, ge=1, le=500)


class TestRunRequest(BaseModel):
    selection: str | None = Field(default=None, max_length=200)


@router.get("/overview", response_model=None)
def get_overview(request: Request, db: Session = Depends(get_db)) -> Any:
    _require_local(request)
    return console_overview(db)


@router.get("/tables", response_model=None)
def get_tables(request: Request, db: Session = Depends(get_db)) -> Any:
    _require_local(request)
    return {"tables": list_tables(db)}


@router.get("/tables/{name}", response_model=None)
def get_table_rows(
    request: Request, name: str,
    limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0), order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
) -> Any:
    _require_local(request)
    try:
        return read_table(db, name, limit=limit, offset=offset, order=order)
    except LookupError as exc:
        raise HTTPException(404, str(exc))


@router.post("/sql", response_model=None)
def post_sql(request: Request, body: SqlRequest, db: Session = Depends(get_db)) -> Any:
    _require_local(request)
    try:
        return run_readonly_sql(db, body.sql, max_rows=body.max_rows)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:  # the database's own error for a bad query is the useful message here
        db.rollback()
        raise HTTPException(400, f"{exc.__class__.__name__}: {str(exc).splitlines()[0][:500]}")


@router.get("/routes", response_model=None)
def get_routes(request: Request) -> Any:
    _require_local(request)
    return {"routes": list_routes(request.app)}


@router.post("/checks/endpoints", response_model=None)
def post_endpoint_checks(request: Request) -> Any:
    _require_local(request)
    return probe_endpoints(str(request.base_url))


@router.post("/tests/run", response_model=None)
def post_test_run(request: Request, body: TestRunRequest | None = None) -> Any:
    _require_local(request)
    try:
        return test_runner.start(selection=body.selection if body else None)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))


@router.get("/tests/status", response_model=None)
def get_test_status(request: Request, tail_lines: int = Query(40, ge=1, le=500)) -> Any:
    _require_local(request)
    return test_runner.status(tail_lines=tail_lines)


@router.post("/tests/cancel", response_model=None)
def post_test_cancel(request: Request) -> Any:
    _require_local(request)
    return test_runner.cancel()


@router.get("/logs", response_model=None)
def get_logs(
    request: Request,
    limit: int = Query(200, ge=1, le=2000), level: str | None = None,
    request_id: str | None = None, contains: str | None = Query(default=None, max_length=200),
) -> Any:
    _require_local(request)
    return read_app_log(settings.app_log_file, limit=limit, level=level, request_id=request_id, contains=contains)
