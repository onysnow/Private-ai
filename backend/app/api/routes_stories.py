"""What the story needs (research Act §7, mockup ACT_2): the story tree, its gates and the ready decision.

Every route is under /investigations/{investigation_id}, so the request is scoped to that case; a section named in
the path is checked to belong to the case's story.
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Investigation, WriteupVersion
from app.schemas.api import StoryClaimPlace, StoryGateSet, StoryReady, StorySectionCreate, StorySectionUpdate, StoryThesisSet, WriteupVersionCreate
from app.schemas.responses import StoryOut, WriteupOut, WriteupVersionDetailOut, WriteupVersionOut, WriteupVersionsOut
from app.services import stories
from app.services import writeup_versions as versions
from app.services.writeups import serialize_writeup

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _case(db: Session, investigation_id: str) -> None:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")


def _section(db: Session, investigation_id: str, section_id: str) -> Any:
    section = stories.section_of(db, investigation_id, section_id)
    if section is None:
        raise HTTPException(404, "Section not found")
    return section


@router.get("/investigations/{investigation_id}/story", response_model=StoryOut)
def get_story(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """The story tree with its readiness. Reading writes nothing; a case with no story yet gets an empty one."""
    _case(db, investigation_id)
    return stories.story_tree(db, investigation_id)


@router.put("/investigations/{investigation_id}/story", response_model=StoryOut)
def set_story_thesis(investigation_id: str, body: StoryThesisSet, db: Session = Depends(get_db)) -> Any:
    _case(db, investigation_id)
    stories.set_thesis(db, investigation_id, body.thesis)
    return stories.story_tree(db, investigation_id)


@router.post("/investigations/{investigation_id}/story/sections", response_model=StoryOut)
def add_story_section(investigation_id: str, body: StorySectionCreate, db: Session = Depends(get_db)) -> Any:
    _case(db, investigation_id)
    stories.add_section(db, investigation_id, body.title)
    return stories.story_tree(db, investigation_id)


@router.patch("/investigations/{investigation_id}/story/sections/{section_id}", response_model=StoryOut)
def update_story_section(investigation_id: str, section_id: str, body: StorySectionUpdate, db: Session = Depends(get_db)) -> Any:
    stories.update_section(db, _section(db, investigation_id, section_id), body.title, body.position)
    return stories.story_tree(db, investigation_id)


@router.delete("/investigations/{investigation_id}/story/sections/{section_id}", response_model=StoryOut)
def delete_story_section(investigation_id: str, section_id: str, db: Session = Depends(get_db)) -> Any:
    stories.delete_section(db, _section(db, investigation_id, section_id))
    return stories.story_tree(db, investigation_id)


@router.post("/investigations/{investigation_id}/story/sections/{section_id}/claims", response_model=StoryOut)
def place_story_claim(investigation_id: str, section_id: str, body: StoryClaimPlace, db: Session = Depends(get_db)) -> Any:
    try:
        stories.place_claim(db, investigation_id, _section(db, investigation_id, section_id), body.claim_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return stories.story_tree(db, investigation_id)


@router.delete("/investigations/{investigation_id}/story/sections/{section_id}/claims/{claim_id}", response_model=StoryOut)
def remove_story_claim(investigation_id: str, section_id: str, claim_id: str, db: Session = Depends(get_db)) -> Any:
    stories.remove_claim(db, _section(db, investigation_id, section_id), claim_id)
    return stories.story_tree(db, investigation_id)


@router.put("/investigations/{investigation_id}/story/gates", response_model=StoryOut)
def record_story_gate(investigation_id: str, body: StoryGateSet, db: Session = Depends(get_db)) -> Any:
    """Right of reply sent (to whom, when) or legal read (by whom, when); both empty clears it."""
    _case(db, investigation_id)
    try:
        stories.record_gate(db, investigation_id, body.gate, body.who, body.on)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return stories.story_tree(db, investigation_id)


@router.post("/investigations/{investigation_id}/story/ready", response_model=StoryOut)
def mark_story_ready(investigation_id: str, body: StoryReady, db: Session = Depends(get_db)) -> Any:
    """Ready to run: refused, naming what is left, until every gate has passed."""
    _case(db, investigation_id)
    try:
        stories.mark_ready(db, investigation_id, body.by)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return stories.story_tree(db, investigation_id)


@router.post("/investigations/{investigation_id}/story/writeup", response_model=StoryOut)
def start_story_writeup(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """The write-up the story is told in, made if it does not exist yet."""
    _case(db, investigation_id)
    stories.ensure_writeup(db, investigation_id)
    return stories.story_tree(db, investigation_id)


# --- the write-up's version history (app/services/writeup_versions.py) ------------------------------------------

def _writeup(db: Session, investigation_id: str) -> Any:
    _case(db, investigation_id)
    writeup = stories.story_writeup(db, investigation_id)
    if writeup is None:
        raise HTTPException(404, "The story has no write-up yet")
    return writeup


def _version(db: Session, investigation_id: str, version_id: str) -> tuple[Any, Any]:
    writeup = _writeup(db, investigation_id)
    version = db.get(WriteupVersion, version_id)
    if version is None or version.writeup_id != writeup.id:
        raise HTTPException(404, "Version not found")
    return writeup, version


@router.get("/investigations/{investigation_id}/story/versions", response_model=WriteupVersionsOut)
def list_story_versions(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """The write-up's versions, newest first: named ones, automatic ones and those kept before a restore."""
    _case(db, investigation_id)
    writeup = stories.story_writeup(db, investigation_id)
    if writeup is None:
        return {"writeup_id": None, "versions": []}
    return {"writeup_id": writeup.id, "versions": [versions.serialize_version(v) for v in versions.list_versions(db, writeup)]}


@router.post("/investigations/{investigation_id}/story/versions", response_model=WriteupVersionOut)
def name_story_version(investigation_id: str, body: WriteupVersionCreate, db: Session = Depends(get_db)) -> Any:
    """Keep the write-up as it stands under a name ("Before legal read")."""
    writeup = _writeup(db, investigation_id)
    try:
        return versions.serialize_version(versions.name_version(db, writeup, body.name))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/investigations/{investigation_id}/story/versions/{version_id}", response_model=WriteupVersionDetailOut)
def get_story_version(investigation_id: str, version_id: str, db: Session = Depends(get_db)) -> Any:
    """One version with its text, to read (never to edit)."""
    _writeup_row, version = _version(db, investigation_id, version_id)
    return versions.serialize_version(version, include_content=True)


@router.post("/investigations/{investigation_id}/story/versions/{version_id}/restore", response_model=WriteupOut)
def restore_story_version(investigation_id: str, version_id: str, db: Session = Depends(get_db)) -> Any:
    """Put this version's text back. The text it replaces is kept first, as a version of its own."""
    writeup, version = _version(db, investigation_id, version_id)
    versions.restore_version(db, writeup, version)
    return serialize_writeup(writeup)
