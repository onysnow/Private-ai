"""Shared FastAPI request-layer helpers for the app.api route modules.

Split out of routes.py so every route module (routes.py itself and the
per-domain modules introduced by STRUCT-0002/0008's split) can depend on
the same helpers without one route module importing from another.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.authorization import authorize_routed_resource
from app.db.session import get_db


def authorize_request_resource(request: Request, db: Session = Depends(get_db)):
    return authorize_routed_resource(request, db)


async def read_upload_limited(file: UploadFile, limit: int) -> bytes:
    """Read an UploadFile's contents, raising 413 if it exceeds `limit`
    bytes, without ever holding more than one chunk over the limit in
    memory at a time."""
    chunks = []
    total = 0
    while True:
        chunk = await file.read(min(1024 * 1024, limit - total + 1))
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise HTTPException(413, f"Upload exceeds {limit} byte limit")
        chunks.append(chunk)
    return b"".join(chunks)
