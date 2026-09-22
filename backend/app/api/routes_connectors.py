"""Connector search endpoints (STRUCT-0002/0008, REMEDIATION_PROMPT.md
Stage E group 3). Connector execution and finding persistence live in
app/services/connectors.py, shared with the /entities/{id}/enrich*
endpoints still in routes.py (group 7 will move those here later).
"""
from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.connectors.registry import registry
from app.db.session import get_db
from app.schemas.api import AlephSearchRequest, ConnectorSearchRequest
from app.services.connectors import run_connector

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/connectors", response_model=None)
def connectors() -> dict[str, Any]:
    return {
        "providers": registry.names(),
        "status": {
            name: {"configured": bool(getattr(registry.get(name), "configured", True))}
            for name in registry.names()
        },
    }


@router.post("/connectors/{provider}/search", response_model=None)
async def connector_search(provider: str, body: ConnectorSearchRequest, db: Session = Depends(get_db)) -> Any:
    return await run_connector(provider, body, db)


@router.post("/connectors/aleph/search", response_model=None)
async def aleph_search(body: AlephSearchRequest, db: Session = Depends(get_db)) -> Any:
    return await run_connector("aleph", ConnectorSearchRequest(**body.model_dump()), db)
