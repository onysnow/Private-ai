"""Claims for tests that need one already Supported or Confirmed.

POST /api/claims refuses those statuses (app/api/routes_claims.py): a claim
becomes Supported or Confirmed by a review, so the Done rules run and the reason
is kept. A test that needs such a claim as its starting point creates it the same
way a reporter does: as a lead, then reviewed, with the written reason the Done
rules ask for when a rule is not met."""
from __future__ import annotations

from typing import Any

REVIEWED_STATUSES = {"supported", "confirmed"}


class _Reply:
    """What the test sees of the create call: its status code and the claim as it
    stands after the review."""

    def __init__(self, status_code: int, body: Any):
        self.status_code = status_code
        self._body = body
        self.text = str(body)

    def json(self) -> Any:
        return self._body


def post_claim(client: Any, payload: dict[str, Any]) -> Any:
    status = payload.get("status")
    if status not in REVIEWED_STATUSES:
        return client.post("/api/claims", json=payload)
    created = client.post("/api/claims", json={**payload, "status": "lead"})
    if created.status_code != 200:
        return created
    claim = created.json()
    confidence = payload.get("confidence", 0.0)
    reviewed = client.post(f"/api/claims/{claim['id']}/reviews", json={
        "status": status, "confidence": confidence,
        "rationale": "Test setup: the claim starts at this status.",
        "override_reason": "Test setup: the claim starts at this status.",
    })
    if reviewed.status_code != 200:
        return reviewed
    return _Reply(200, {**claim, "status": status, "confidence": confidence})
