"""Stamped on records as they are saved, whichever code path saves them (mockup CHECK_2):

* who made a decision: a claim review by a person, a quote linked to a claim (and marked superseded), a proposal
  accepted or rejected. The
  person is the request's signed-in account (app/core/authorization.py): its id, and its name as it was then. On
  this computer without an account the id is "local-owner" and there is no name; outside a request (seeding a demo
  case, a restore) nothing is stamped. A To check item answered (a missing value too) and a watchlist hit decided are
  stamped the same way; opened again, their stamp goes.
* a stamp the code set itself in the same change wins over the request's person: the demo's pre-made decisions
  (app/services/demo_decided.py) are stamped DEMO_DECIDER, so they read as the demo's, never a person's, and can be
  undone.
* where a new or changed quote stands in its document (ADR-0015, app/services/anchors.py).
"""
from __future__ import annotations

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from app.core.authorization import current_authorization_scope

# Who made the demo's pre-made decisions (app/services/demo_decided.py): never a person, so a person's own decisions
# on the demo case stay apart from them, and undoing them finds exactly these.
DEMO_DECIDER_ID = "demo-pre-decided"
DEMO_DECIDER_NAME = "Demo (pre-decided)"


def _actor(db: Session) -> tuple[str, str | None] | None:
    scope = current_authorization_scope()
    if scope is None:
        return None
    from app.models.identity import AppUser, LocalProfile

    if scope.actor_id == "local-owner":
        # The owner of this computer signs with the name they gave (ADR-0016); none given yet: "a person".
        owner = db.get(LocalProfile, 1)
        return scope.actor_id, (owner.display_name if owner is not None else None)
    user = db.get(AppUser, scope.actor_id)
    return scope.actor_id, (user.display_name if user is not None else None)


def person_name(db: Session) -> str | None:
    """The signed-in person's name as it is now (None outside a request, or when none was given)."""
    actor = _actor(db)
    return actor[1] if actor is not None else None


def _changed(obj: object, attr: str) -> bool:
    state = inspect(obj, raiseerr=False)
    return state is not None and bool(state.attrs[attr].history.has_changes())


@event.listens_for(Session, "before_flush")
def _stamp_before_flush(db: Session, _flush_context: object, _instances: object) -> None:
    from app.models.claims import ClaimEvidenceLink, ClaimReviewEvent
    from app.models.documents import ExtractionCandidate
    from app.models.patterns import CheckItem
    from app.models.sources import Evidence
    from app.models.watchlists import WatchlistHit
    from app.services.anchors import anchor_evidence

    if db.info.get("restoring"):
        # A restore puts back records as they were saved: their deciders and anchors come from the backup.
        return
    with db.no_autoflush:
        decisions: list[ClaimEvidenceLink | ClaimReviewEvent | ExtractionCandidate | CheckItem | WatchlistHit] = [o for o in db.new if (isinstance(o, ClaimEvidenceLink)
                     or (isinstance(o, ClaimReviewEvent) and (o.reviewer_type or "HUMAN").upper() in ("HUMAN", "LEGAL_COUNSEL")))
                     and o.decided_by_id is None]
        # A proposal decided again (reopened, then decided) is stamped with whoever decided it last.
        decisions += [o for o in (*db.new, *db.dirty) if isinstance(o, ExtractionCandidate)
                      and o.review_status not in (None, "proposed") and _changed(o, "review_status")]
        # A To check item answered, a watchlist hit decided; opened again (open, new), the stamp goes.
        answers = [o for o in (*db.new, *db.dirty) if isinstance(o, (CheckItem, WatchlistHit)) and _changed(o, "status")]
        for answer in answers:
            if answer.status in ("open", "new"):
                answer.decided_by_id = answer.decided_by_name = None
            else:
                decisions.append(answer)
        # A stamp set in this same change (the demo's, app/services/demo_decided.py) is kept as it is.
        decisions = [o for o in decisions if not _changed(o, "decided_by_id")]
        # A link marked superseded (again, after an undo) is stamped with whoever marked it; undone, the stamp goes too.
        superseded = [o for o in (*db.new, *db.dirty) if isinstance(o, ClaimEvidenceLink) and o.superseded_at is not None
                      and (o in db.new or _changed(o, "superseded_at")) and o.superseded_decided_by_id is None]
        actor = _actor(db) if decisions or superseded else None
        if actor is not None:
            for obj in decisions:
                obj.decided_by_id, obj.decided_by_name = actor
            for link in superseded:
                link.superseded_decided_by_id, link.superseded_decided_by_name = actor
        passages: dict = {}
        for obj in db.new:
            if isinstance(obj, Evidence) and obj.anchor is None and obj.quote:
                anchor_evidence(db, obj, passages)
        for obj in db.dirty:
            if isinstance(obj, Evidence) and _changed(obj, "quote") and not _changed(obj, "anchor"):
                anchor_evidence(db, obj, passages)
