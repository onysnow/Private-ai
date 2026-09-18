"""Shared FastAPI dependencies for the app.api route modules.

Split out of routes.py so every route module (routes.py itself and the
per-domain modules introduced by STRUCT-0002/0008's split) can depend on
the same request-authorization check without one module importing from
another.
"""
from __future__ import annotations

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.authorization import authorize_routed_resource
from app.db.session import get_db


def authorize_request_resource(request: Request, db: Session = Depends(get_db)):
    return authorize_routed_resource(request, db)
