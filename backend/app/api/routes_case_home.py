"""Case home and Decide (app/services/case_home.py): the standing numbers, the
one list of decisions only a person can make, and what changed since a moment."""

import asyncio
import json
import time
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import SessionLocal, get_db
from app.models.domain import Entity, Investigation
from app.schemas.api import InvestigationUpdate
from app.schemas.decide import DecisionSnoozeCreate, DecisionWake
from app.schemas.responses import CaseDecisionsOut, DecisionSnoozeOut, DecisionWakeOut, CaseSinceOut, CaseStandingOut, ClaimSourceLineOut, DropHistoryOut, DropOut, InvestigationOut, PartyYearsOut, WireOut
from app.services import case_home, case_years, decision_snoozes, drop, wire
from app.services.investigations import update_investigation

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _case(db: Session, investigation_id: str) -> Investigation:
    row = db.get(Investigation, investigation_id)
    if row is None:
        raise HTTPException(404, "Investigation not found")
    return row


@router.patch("/investigations/{investigation_id}", response_model=InvestigationOut)
def patch_investigation(investigation_id: str, body: InvestigationUpdate, db: Session = Depends(get_db)) -> Any:
    return update_investigation(db, _case(db, investigation_id), body.model_dump(exclude_unset=True))


@router.get("/investigations/{investigation_id}/standing", response_model=CaseStandingOut)
def get_standing(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """Red Flags and To check counts are as last computed (POST .../red-flags/run recomputes them)."""
    _case(db, investigation_id)
    return case_home.standing(db, investigation_id)


@router.get("/investigations/{investigation_id}/decisions", response_model=CaseDecisionsOut)
def get_decisions(
    investigation_id: str, db: Session = Depends(get_db),
    kind: Literal["to_check", "missing", "proposal", "match", "outside", "ai", "watchlist"] | None = None,
    order: Literal["consequence", "source", "oldest"] = "consequence",
    offset: int = Query(0, ge=0), limit: int = Query(200, ge=1, le=500),
    snoozed: Annotated[bool, Query(description="Only the decisions put off (H) and still asleep.")] = False,
) -> Any:
    # The Red Flags and To check items as last brought up to date: reading never writes (GET .../red-flags says
    # when they are behind, POST .../red-flags/run brings them up to date). The consequence order puts first what
    # answering Yes would unlock, dry-run on the records (app/services/decision_unlocks.py).
    _case(db, investigation_id)
    return case_home.decisions(db, investigation_id, kind=kind, order=order, offset=offset, limit=limit, snoozed=snoozed)


@router.post("/investigations/{investigation_id}/decision-snoozes", response_model=DecisionSnoozeOut)
def snooze_decision(investigation_id: str, body: DecisionSnoozeCreate, db: Session = Depends(get_db)) -> Any:
    """Puts a waiting decision off (H on Decide): until a time, until the item changes, or whichever comes first."""
    _case(db, investigation_id)
    try:
        return decision_snoozes.snooze(db, investigation_id, body.kind, body.item_id, until=body.until, wake_on_activity=body.wake_on_activity)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/investigations/{investigation_id}/decision-snoozes/wake", response_model=DecisionWakeOut)
def wake_decision(investigation_id: str, body: DecisionWake, db: Session = Depends(get_db)) -> Any:
    """Brings a decision put off back into the queue now (Restore, or Z right after H)."""
    _case(db, investigation_id)
    return decision_snoozes.wake(db, investigation_id, body.kind, body.item_id)


@router.get("/investigations/{investigation_id}/since", response_model=CaseSinceOut)
def get_since(investigation_id: str, after: datetime = Query(...), db: Session = Depends(get_db)) -> Any:
    _case(db, investigation_id)
    return case_home.since(db, investigation_id, after.replace(tzinfo=None))


@router.get("/investigations/{investigation_id}/wire", response_model=WireOut)
def get_wire(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """The Wire (See): every party placed on one map, its links and Red Flags (as the rules last left them;
    reading never runs them), and the dated events."""
    _case(db, investigation_id)
    return wire.wire(db, investigation_id)


@router.get("/entities/{entity_id}/years", response_model=PartyYearsOut)
def get_party_years(entity_id: str, db: Session = Depends(get_db)) -> Any:
    """The years a party's dated events and links touch: pointing at it lights them on the year rail."""
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(404, "Party not found")
    return {"entity_id": entity.id, "years": case_years.party_years(db, entity.investigation_id, entity.id)}


@router.get("/investigations/{investigation_id}/claim-sources", response_model=list[ClaimSourceLineOut])
def get_claim_sources(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """Each claim's lead source and locator, for the source line on its card."""
    _case(db, investigation_id)
    return case_home.claim_sources(db, investigation_id)


@router.get("/investigations/{investigation_id}/drop", response_model=DropOut)
def get_drop(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """The Drop (Bring in): each file brought in as a lane of seven stages, with its read receipt."""
    _case(db, investigation_id)
    return drop.drop(db, investigation_id)


@router.get("/investigations/{investigation_id}/drop/history", response_model=DropHistoryOut)
def get_drop_history(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """The Drop's History tab: every drop, newest first, with what each produced."""
    _case(db, investigation_id)
    return drop.history(db, investigation_id)


# How often the stream looks again, and how long one connection lasts before the screen reconnects.
DROP_STREAM_TICK = 1.0
DROP_STREAM_MAX_SECONDS = 600.0


def _dump(value: Any) -> str:
    return json.dumps(value, sort_keys=True, default=str)


def _drop_snapshot(investigation_id: str) -> dict[str, Any]:
    with SessionLocal() as db:
        return DropOut.model_validate(drop.drop(db, investigation_id)).model_dump(mode="json", by_alias=True)


# Kept out of the OpenAPI schema like the run record's stream (ADR-0012): the generated client has no shape for an
# event stream. ADR-0014; tested in tests/test_drop.py.
@router.get("/investigations/{investigation_id}/drop/stream", response_class=StreamingResponse, include_in_schema=False)
def stream_drop(investigation_id: str, db: Session = Depends(get_db)) -> StreamingResponse:
    """The Drop as Server-Sent Events, one `lane` event per file whose lane changed (the first look sends every
    file), `gone` for a file removed, then a `summary` of the rest; `end` once no file is being read."""
    _case(db, investigation_id)

    async def events() -> AsyncIterator[str]:
        seen: dict[str, str] = {}
        n = 0
        started = time.monotonic()
        while True:
            snapshot = await run_in_threadpool(_drop_snapshot, investigation_id)
            for kind, data in drop.changes(seen, snapshot, _dump):
                n += 1
                yield f"id: {n}\nevent: {kind}\ndata: {json.dumps(data, default=str)}\n\n"
            if not snapshot["totals"]["unread"] and not any(lane["in_progress"] for lane in snapshot["lanes"]):
                yield "event: end\ndata: {}\n\n"
                return
            if time.monotonic() - started > DROP_STREAM_MAX_SECONDS:
                return
            await asyncio.sleep(DROP_STREAM_TICK)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
