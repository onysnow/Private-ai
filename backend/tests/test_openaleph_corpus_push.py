"""Reporter-confirmed records go to the investigation's OpenAleph collection
(ADR-0006, Wave B, item 1): what is sent, under which ids, what is not sent
again, what is removed and when, and how a failure is recorded and retried.

OpenAleph is faked at its HTTP surface (tests/openaleph_fake.py), behind the
real openaleph-client and httpx code paths.
"""

from __future__ import annotations

from typing import Any

import pytest
from followthemoney.namespace import Namespace
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.jobs import corpus as corpus_jobs
from app.models.domain import (
    CorpusSyncState, Entity, Investigation, InvestigationCorpusBinding, OpenAlephEntityLink, OpenAlephOperationFailure,
)
from app.schemas.api import EntityCreate, EntityUpdate
from app.services.corpus_push import build_corpus_records, corpus_sync_status, pending_changes, push_confirmed_records
from app.services.entities import create_entity, update_entity
from app.services.entity_merge import execute_entity_merge, preview_entity_merge
from app.services.relationships import create_relationship
from app.services.resolution import record_canonical_resolution
from tests.openaleph_fake import BASE_URL, FakeOpenAleph


@pytest.fixture()
def openaleph(monkeypatch):
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    monkeypatch.setattr(settings, "openaleph_base_url", BASE_URL)
    monkeypatch.setattr(settings, "openaleph_api_key", "test-key")
    fake = FakeOpenAleph()
    monkeypatch.setattr(corpus_jobs, "gateway_factory", fake.gateway)
    return fake


def _investigation(db, name="Harbour contracts", **extra) -> Investigation:
    inv = Investigation(name=name, **extra)
    db.add(inv); db.commit(); db.refresh(inv)
    return inv


def _entity(db, inv: Investigation, schema: str, caption: str, **props: list[str]) -> Entity:
    return create_entity(db, EntityCreate(investigation_id=inv.id, schema=schema, caption=caption, properties=dict(props)))


def _seeded(db):
    inv = _investigation(db)
    meridian = _entity(db, inv, "Company", "Meridian Holdings Ltd", jurisdiction=["gb"], incorporationDate=["not a date"])
    jane = _entity(db, inv, "Person", "Jane Doe")
    edge = create_relationship(db, investigation_id=inv.id, schema="Directorship", source_entity_id=jane.id,
                               target_entity_id=meridian.id, properties={"role": ["director"]})
    return inv, meridian, jane, edge


def _links(db, inv) -> dict[str, OpenAlephEntityLink]:
    return {row.record_id: row for row in db.scalars(select(OpenAlephEntityLink).where(OpenAlephEntityLink.investigation_id == inv.id))}


def test_confirmed_entities_and_relationships_are_sent_under_their_workbench_ids(openaleph):
    with SessionLocal() as db:
        inv, meridian, jane, edge = _seeded(db)
        result = push_confirmed_records(db, inv.id, gateway=openaleph.gateway())

        assert (result.sent, result.removed, result.unchanged, result.skipped) == (3, 0, 0, [])
        binding = db.scalar(select(InvestigationCorpusBinding).where(InvestigationCorpusBinding.investigation_id == inv.id))
        assert binding is not None and binding.foreign_id == "fake-ns-1"
        namespace = Namespace("fake-ns-1")
        links = _links(db, inv)
        assert {row.record_type for row in links.values()} == {"entity", "relationship"}
        assert links[meridian.id].openaleph_entity_id == namespace.sign(meridian.id)
        assert links[edge.relationship_entity_id].record_type == "relationship"
        sent = {row["id"]: row for row in openaleph.bulk_batches[0]}
        # FollowTheMoney cleaned the payload: the invalid date is not sent.
        assert sent[meridian.id] == {"id": meridian.id, "schema": "Company",
                                     "properties": {"jurisdiction": ["gb"], "name": ["Meridian Holdings Ltd"]}}
        # The relationship points at the Workbench ids of its two ends, which
        # OpenAleph signs on arrival like the ids themselves.
        relationship = sent[edge.relationship_entity_id]
        assert relationship["schema"] == "Directorship"
        assert relationship["properties"]["director"] == [jane.id]
        assert relationship["properties"]["organization"] == [meridian.id]
        assert relationship["properties"]["role"] == ["director"]
        stored = openaleph.entities[binding.collection_id][namespace.sign(edge.relationship_entity_id)]
        assert stored["properties"]["organization"] == [namespace.sign(meridian.id)]


def test_unchanged_records_are_not_sent_again_and_an_edit_resends_only_that_record(openaleph):
    with SessionLocal() as db:
        inv, meridian, jane, edge = _seeded(db)
        gateway = openaleph.gateway()
        push_confirmed_records(db, inv.id, gateway=gateway)
        again = push_confirmed_records(db, inv.id, gateway=gateway)
        assert (again.sent, again.unchanged) == (0, 3)
        assert len(openaleph.bulk_batches) == 1
        assert again.message() == "Nothing changed since the last push"
        first_hash = _links(db, inv)[jane.id].content_hash

        update_entity(db, db.get(Entity, jane.id), EntityUpdate(properties={"nationality": ["gb"]}))
        assert pending_changes(db, inv.id)["to_send"] == 1
        edited = push_confirmed_records(db, inv.id, gateway=gateway)
        assert (edited.sent, edited.unchanged) == (1, 2)
        assert [row["id"] for row in openaleph.bulk_batches[1]] == [jane.id]
        assert openaleph.bulk_batches[1][0]["properties"]["nationality"] == ["gb"]
        assert _links(db, inv)[jane.id].content_hash != first_hash


def _merge(db, source: Entity, target: Entity) -> None:
    record_canonical_resolution(db, source, target, decision="same", confidence=0.95, rationale="Same registry number")
    preview = preview_entity_merge(db, source, target)
    execute_entity_merge(db, source, target, preview_digest=preview["preview_digest"])


def test_a_merged_away_record_is_removed_once_indexing_is_idle_and_its_relationships_follow(openaleph):
    with SessionLocal() as db:
        inv, meridian, jane, edge = _seeded(db)
        duplicate = _entity(db, inv, "Company", "Meridian Holdings Limited")
        bellcastle = _entity(db, inv, "Company", "Bellcastle Trading Group")
        owner = create_relationship(db, investigation_id=inv.id, schema="Ownership", source_entity_id=bellcastle.id,
                                    target_entity_id=duplicate.id)
        gateway = openaleph.gateway()
        push_confirmed_records(db, inv.id, gateway=gateway)
        openaleph.finish_indexing()
        collection = "1"
        namespace = Namespace("fake-ns-1")

        _merge(db, db.get(Entity, duplicate.id), db.get(Entity, meridian.id))
        assert pending_changes(db, inv.id) == {"to_send": 1, "to_remove": 1, "pushed": 6, "cannot_send": []}

        # OpenAleph is still indexing: the relationship is re-sent pointing at
        # the record that stays, and the removal waits.
        result = push_confirmed_records(db, inv.id, gateway=gateway)
        assert (result.sent, result.removed, result.removals_waiting) == (1, 0, 1)
        assert openaleph.bulk_batches[-1][0]["id"] == owner.relationship_entity_id
        assert openaleph.bulk_batches[-1][0]["properties"]["asset"] == [meridian.id]
        assert duplicate.id in _links(db, inv)
        assert result.message() == "Sent 1 record(s); 1 removal(s) wait for OpenAleph to finish indexing"

        # Indexing is done, but the search index has not refreshed: it still
        # shows the ownership pointing at the duplicate, so removing the
        # duplicate now would have OpenAleph prune the ownership with it.
        openaleph.finish_indexing(refresh=False)
        result = push_confirmed_records(db, inv.id, gateway=gateway)
        assert (result.sent, result.removed, result.removals_waiting) == (0, 0, 1)
        assert duplicate.id in _links(db, inv) and openaleph.pruned == []

        openaleph.refresh()
        result = push_confirmed_records(db, inv.id, gateway=gateway)
        assert (result.sent, result.removed, result.removals_waiting) == (0, 1, 0)
        assert ("DELETE", f"/api/2/entities/{namespace.sign(duplicate.id)}") in openaleph.calls
        assert duplicate.id not in _links(db, inv)
        assert namespace.sign(duplicate.id) not in openaleph.entities[collection]
        assert openaleph.pruned == []
        assert openaleph.entities[collection][namespace.sign(owner.relationship_entity_id)]["properties"]["asset"] == [namespace.sign(meridian.id)]

        # A record OpenAleph no longer has counts as removed (404 = already gone).
        stray = _entity(db, inv, "Person", "Stray Person")
        push_confirmed_records(db, inv.id, gateway=gateway)
        openaleph.finish_indexing()
        openaleph.index[collection].pop(namespace.sign(stray.id))
        openaleph.entities[collection].pop(namespace.sign(stray.id))
        _merge(db, db.get(Entity, stray.id), db.get(Entity, jane.id))
        assert push_confirmed_records(db, inv.id, gateway=gateway).removed == 1


def test_without_the_reference_check_the_fake_prunes_like_openaleph(openaleph):
    """The fake deletes as OpenAleph does, which is what the test above relies
    on: deleting a record also deletes whatever the index shows pointing at it."""
    with SessionLocal() as db:
        inv, meridian, jane, edge = _seeded(db)
        push_confirmed_records(db, inv.id, gateway=openaleph.gateway())
        openaleph.finish_indexing()
        namespace = Namespace("fake-ns-1")
        assert openaleph.gateway().delete_entity(namespace.sign(meridian.id)) is True
        assert openaleph.pruned == [namespace.sign(edge.relationship_entity_id)]
        assert openaleph.gateway().delete_entity(namespace.sign(meridian.id)) is False


def test_what_cannot_be_sent_is_named_and_the_demo_never_reaches_openaleph(openaleph):
    with SessionLocal() as db:
        inv = _investigation(db)
        thing = _entity(db, inv, "Thing", "Unclassified name")
        person = _entity(db, inv, "Person", "Jane Doe")
        create_relationship(db, investigation_id=inv.id, schema="UnknownLink", source_entity_id=person.id, target_entity_id=thing.id)
        records, skipped = build_corpus_records(db, inv.id)
        assert set(records) == {person.id}
        assert skipped[0] == "Unclassified name: Thing is an abstract FollowTheMoney type; choose a concrete type to send it"
        assert skipped[1].endswith("one end of this relationship cannot be sent")

        demo = _investigation(db, name="Demo", is_demo=True)
        _entity(db, demo, "Person", "Sample Person")
        result = push_confirmed_records(db, demo.id, gateway=openaleph.gateway())
        assert result.skipped == ["The demo investigation is never sent to OpenAleph"] and openaleph.calls == []
        assert corpus_sync_status(db, demo.id, background=False)["pending"]["cannot_send"] == [
            "The demo investigation is never sent to OpenAleph"]

        with pytest.raises(LookupError):
            push_confirmed_records(db, "no-such-investigation", gateway=openaleph.gateway())


def test_the_binding_follows_the_collection_openaleph_holds(openaleph):
    with SessionLocal() as db:
        inv = _investigation(db)
        _entity(db, inv, "Person", "Jane Doe")
        openaleph.add_collection("40", "real-namespace", "Harbour contracts (renamed)")
        db.add(InvestigationCorpusBinding(investigation_id=inv.id, provider="openaleph", collection_id="40",
                                          foreign_id="journalism-workbench:stale", collection_label="old", status="active"))
        db.commit()
        push_confirmed_records(db, inv.id, gateway=openaleph.gateway())
        binding = db.scalar(select(InvestigationCorpusBinding).where(InvestigationCorpusBinding.investigation_id == inv.id))
        assert (binding.foreign_id, binding.collection_label) == ("real-namespace", "Harbour contracts (renamed)")
        assert all(row.openaleph_entity_id.endswith(Namespace("real-namespace").signature(row.record_id))
                   for row in _links(db, inv).values())

        openaleph.collections["40"]["foreign_id"] = ""
        update_entity(db, db.scalars(select(Entity).where(Entity.investigation_id == inv.id)).one(), EntityUpdate(caption="J. Doe"))
        with pytest.raises(RuntimeError, match="namespace"):
            push_confirmed_records(db, inv.id, gateway=openaleph.gateway())


# --- the job step: state, failures, retries ------------------------------------

def _state(db, inv) -> CorpusSyncState:
    db.expire_all()
    return db.scalar(select(CorpusSyncState).where(CorpusSyncState.investigation_id == inv.id))


def test_push_step_records_progress_for_the_corpus_sync_line(openaleph):
    with SessionLocal() as db:
        inv, *_ = _seeded(db)
        follow_ups = corpus_jobs.push_step(SessionLocal, inv.id, gateway=openaleph.gateway())
        assert follow_ups == []
        state = _state(db, inv)
        assert (state.push_status, state.push_message, state.consecutive_failures) == ("succeeded", "Sent 3 record(s)", 0)
        assert state.push_counts == {"sent": 3, "removed": 0, "unchanged": 0, "removals_waiting": 0, "skipped": []}
        assert state.changed_at is not None and state.push_finished_at is not None
        status = corpus_sync_status(db, inv.id, background=False)
        assert status["pushed_records"] == 3 and status["pending"] == {"to_send": 0, "to_remove": 0, "cannot_send": []}
        assert status["push"]["status"] == "succeeded" and status["collection_label"] == "Harbour contracts"

        # Waiting removals ask for another push after the poll interval.
        jane = db.scalars(select(Entity).where(Entity.caption == "Jane Doe")).one()
        other = _entity(db, inv, "Person", "Jane D.")
        corpus_jobs.push_step(SessionLocal, inv.id, gateway=openaleph.gateway())
        _merge(db, db.get(Entity, other.id), db.get(Entity, jane.id))
        follow_ups = corpus_jobs.push_step(SessionLocal, inv.id, gateway=openaleph.gateway())
        assert follow_ups == [corpus_jobs.FollowUp(corpus_jobs.PUSH_TASK, settings.openaleph_corpus_poll_seconds, {"investigation_id": inv.id})]
        assert _state(db, inv).push_status == "waiting"


def test_a_temporary_failure_is_recorded_and_tried_again_later(openaleph, monkeypatch):
    monkeypatch.setattr(settings, "openaleph_corpus_max_retries", 2)
    with SessionLocal() as db:
        inv, *_ = _seeded(db)
        openaleph.fail[("POST", "/api/2/collections/1/_bulk")] = 503
        openaleph.add_collection("1", "fake-ns-1", "Harbour contracts")
        db.add(InvestigationCorpusBinding(investigation_id=inv.id, provider="openaleph", collection_id="1",
                                          foreign_id="fake-ns-1", collection_label="Harbour contracts", status="active"))
        db.commit()
        retry = corpus_jobs.FollowUp(corpus_jobs.PUSH_TASK, 30.0, {"investigation_id": inv.id}, retry=True)
        assert corpus_jobs.push_step(SessionLocal, inv.id, gateway=openaleph.gateway()) == [retry]
        state = _state(db, inv)
        assert state.push_status == "failed" and state.consecutive_failures == 1 and "503" in (state.push_error or "")
        failure = db.scalars(select(OpenAlephOperationFailure)).one()
        assert failure.operation == "corpus_push" and failure.investigation_id == inv.id
        assert corpus_sync_status(db, inv.id, background=True)["failures"][0]["operation"] == "corpus_push"
        # Nothing was recorded as sent, so everything is still pending.
        assert pending_changes(db, inv.id)["to_send"] == 3

        second = corpus_jobs.push_step(SessionLocal, inv.id, gateway=openaleph.gateway())
        assert second == [corpus_jobs.FollowUp(corpus_jobs.PUSH_TASK, 60.0, {"investigation_id": inv.id}, retry=True)]
        # Past OPENALEPH_CORPUS_MAX_RETRIES the job stops; a change or Sync now tries again.
        assert corpus_jobs.push_step(SessionLocal, inv.id, gateway=openaleph.gateway()) == []
        assert _state(db, inv).consecutive_failures == 3

        del openaleph.fail[("POST", "/api/2/collections/1/_bulk")]
        assert corpus_jobs.push_step(SessionLocal, inv.id, gateway=openaleph.gateway()) == []
        assert _state(db, inv).consecutive_failures == 0 and _state(db, inv).push_error is None


def test_a_refusal_is_recorded_and_not_retried(openaleph):
    with SessionLocal() as db:
        inv, *_ = _seeded(db)
        openaleph.fail[("POST", "/api/2/collections")] = 403
        assert corpus_jobs.push_step(SessionLocal, inv.id, gateway=openaleph.gateway()) == []
        state = _state(db, inv)
        assert state.push_status == "failed" and state.consecutive_failures == 1


def test_retry_delay_doubles_up_to_the_ceiling(monkeypatch):
    monkeypatch.setattr(settings, "openaleph_corpus_retry_max_seconds", 100.0)
    assert [corpus_jobs.retry_delay(n) for n in (1, 2, 3, 4)] == [30.0, 60.0, 100.0, 100.0]


def test_what_counts_as_temporary():
    import httpx
    import requests
    from openaleph_client.errors import AlephException

    request = httpx.Request("GET", BASE_URL)
    assert corpus_jobs.is_temporary(httpx.ConnectError("refused"))
    assert corpus_jobs.is_temporary(httpx.HTTPStatusError("x", request=request, response=httpx.Response(502, request=request)))
    assert not corpus_jobs.is_temporary(httpx.HTTPStatusError("x", request=request, response=httpx.Response(400, request=request)))
    assert corpus_jobs.is_temporary(AlephException(requests.ConnectionError("refused")))
    assert not corpus_jobs.is_temporary(AlephException(ValueError("bad request")))
    assert not corpus_jobs.is_temporary(ValueError("bad data"))


def test_push_step_does_nothing_when_disabled_or_for_the_demo(openaleph, monkeypatch):
    with SessionLocal() as db:
        demo = _investigation(db, name="Demo", is_demo=True)
        assert corpus_jobs.push_step(SessionLocal, demo.id, gateway=openaleph.gateway()) == []
        assert corpus_jobs.push_step(SessionLocal, "gone", gateway=openaleph.gateway()) == []
        monkeypatch.setattr(settings, "openaleph_enabled", False)
        inv, *_ = _seeded(db)
        assert corpus_jobs.push_step(SessionLocal, inv.id, gateway=openaleph.gateway()) == []
        assert openaleph.calls == []


# --- queueing from the services ---------------------------------------------------

class RecordingQueue:
    def __init__(self, *, fail: bool = False) -> None:
        self.deferred: list[tuple[corpus_jobs.FollowUp, bool]] = []
        self.fail = fail

    def defer(self, follow_up: corpus_jobs.FollowUp, *, now: bool = False) -> bool:
        if self.fail:
            raise RuntimeError("queue database unavailable")
        self.deferred.append((follow_up, now))
        return True


@pytest.fixture()
def queue(openaleph, monkeypatch):
    recording = RecordingQueue()
    monkeypatch.setitem(corpus_jobs._queues, corpus_jobs._engine_key(engine), recording)
    return recording


def _pushes(queue: RecordingQueue) -> list[str]:
    return [follow_up.kwargs["investigation_id"] for follow_up, _now in queue.deferred]


def test_every_change_to_confirmed_records_queues_a_push(queue, tmp_path):
    from app.models.domain import ConnectorFinding, ExtractionCandidate, ResolutionDecision, StatementAssessment
    from app.services.documents import ingest_document, review_candidate
    from app.services.exports import build_investigation_export, restore_investigation_export
    from app.services.external_relationships import create_review, promote_review
    from app.services.promotion import promote_assessment

    with SessionLocal() as db:
        inv, meridian, jane, edge = _seeded(db)                         # create x3
        assert _pushes(queue) == [inv.id] * 3
        assert queue.deferred[0][0].delay == settings.openaleph_corpus_push_delay_seconds and queue.deferred[0][1] is False
        update_entity(db, db.get(Entity, jane.id), EntityUpdate(caption="Jane A. Doe"))   # edit
        duplicate = _entity(db, inv, "Person", "Jane Doe (duplicate)")
        _merge(db, db.get(Entity, duplicate.id), db.get(Entity, jane.id))                # merge
        assert _pushes(queue) == [inv.id] * 6

        doc = ingest_document(db, investigation_id=inv.id, title="Memo", filename="memo.txt", mime_type="text/plain",
                              data=b"Kestrel Shipping Ltd hired Jane Doe in 2021.\n", storage_dir=tmp_path / "docs")
        entity_candidate = db.scalars(select(ExtractionCandidate).where(
            ExtractionCandidate.document_id == doc.id, ExtractionCandidate.candidate_type == "entity")).first()
        before = len(queue.deferred)
        review_candidate(db, entity_candidate, decision="accept", entity_identity_decision="create_new")  # accept
        assert len(queue.deferred) == before + 1
        evidence_candidate = db.scalars(select(ExtractionCandidate).where(
            ExtractionCandidate.document_id == doc.id, ExtractionCandidate.candidate_type == "evidence")).first()
        review_candidate(db, evidence_candidate, decision="accept")      # evidence is not sent to the corpus
        assert len(queue.deferred) == before + 1

        finding = ConnectorFinding(investigation_id=inv.id, provider="opensanctions", provider_record_id="os-1",
                                   caption="Meridian Holdings Ltd", schema="Company", properties={"jurisdiction": ["gb", "cy"]})
        db.add(finding); db.commit()
        db.add(ResolutionDecision(investigation_id=inv.id, finding_id=finding.id, entity_id=meridian.id, decision="positive", confidence=1.0))
        assessment = StatementAssessment(investigation_id=inv.id, finding_id=finding.id, entity_id=meridian.id,
                                         prop="jurisdiction", value="cy", status="accepted")
        db.add(assessment); db.commit()
        promote_assessment(db, assessment)                                # promotion edits the entity
        assert len(queue.deferred) == before + 2

        link = ConnectorFinding(investigation_id=inv.id, provider="opensanctions", provider_record_id="os-2",
                                caption="Directorship", schema="Directorship", properties={"director": ["p"], "organization": ["os-1"]})
        db.add(link); db.commit()
        review = create_review(db, link, meridian.id, jane.id, "supported", None)
        promote_review(db, review)                                        # an external relationship
        assert len(queue.deferred) == before + 4  # create_relationship and the promotion itself

        inv_id = inv.id
        package, _manifest = build_investigation_export(db, inv_id, include_documents=False)
        from app.services.lifecycle import delete_investigation
        delete_investigation(db, inv_id, tmp_path / "docs", confirmation=inv_id)
        before = len(queue.deferred)
        restore_investigation_export(db, package, tmp_path / "restored")  # a restore
        assert _pushes(queue)[before:] == [inv_id]


def test_queueing_never_fails_a_change_and_skips_what_is_never_sent(openaleph, monkeypatch):
    broken = RecordingQueue(fail=True)
    monkeypatch.setitem(corpus_jobs._queues, corpus_jobs._engine_key(engine), broken)
    with SessionLocal() as db:
        inv = _investigation(db)
        entity = _entity(db, inv, "Person", "Jane Doe")   # the queue raised; the entity is saved
        assert db.get(Entity, entity.id) is not None
        assert corpus_jobs.request_corpus_sync(db, inv.id) is False

        working = RecordingQueue()
        monkeypatch.setitem(corpus_jobs._queues, corpus_jobs._engine_key(engine), working)
        demo = _investigation(db, name="Demo", is_demo=True)
        assert corpus_jobs.request_corpus_sync(db, demo.id) is False
        assert corpus_jobs.request_corpus_sync(db, "gone") is False
        monkeypatch.setattr(settings, "openaleph_enabled", False)
        assert corpus_jobs.request_corpus_sync(db, inv.id) is False
        assert working.deferred == []


def test_without_a_worker_a_change_is_only_counted_as_pending(openaleph):
    with SessionLocal() as db:
        inv, *_ = _seeded(db)
        assert corpus_jobs.request_corpus_sync(db, inv.id) is False
        assert corpus_jobs.runs_in_background(db) is False
        assert pending_changes(db, inv.id)["to_send"] == 3
        with pytest.raises(RuntimeError):
            corpus_jobs.queue_sync_now(db, inv.id)


def test_sync_now_with_a_worker_queues_a_push_at_once(queue):
    with SessionLocal() as db:
        inv = _investigation(db)
        assert corpus_jobs.queue_sync_now(db, inv.id) is True
        assert queue.deferred[-1] == (corpus_jobs.FollowUp(corpus_jobs.PUSH_TASK, 0, {"investigation_id": inv.id}), True)


# --- the Procrastinate side, without a database ------------------------------------

class FakeJobManager:
    def __init__(self, already: bool = False) -> None:
        self.jobs: list[Any] = []
        self.already = already

    def defer_job(self, job: Any, connection: Any = None) -> Any:
        from procrastinate.exceptions import AlreadyEnqueued

        if self.already:
            raise AlreadyEnqueued("waiting")
        self.jobs.append(job)
        return job.evolve(id=len(self.jobs))


def test_the_queue_debounces_with_procrastinate_locks():
    queue = corpus_jobs.CorpusQueue("dbname=unused", queue_name="workbench")
    queue.manager = FakeJobManager()
    step = corpus_jobs.FollowUp(corpus_jobs.PUSH_TASK, 5.0, {"investigation_id": "inv-1"})
    assert queue.defer(step) is True
    job = queue.manager.jobs[0]
    assert (job.task_name, job.queue, job.lock, job.queueing_lock, job.priority) == (
        "workbench.corpus_push", "workbench", "workbench.corpus_push:inv-1", "workbench.corpus_push:inv-1", 0)
    assert job.task_kwargs == {"investigation_id": "inv-1"} and job.scheduled_at is not None

    assert queue.defer(corpus_jobs.FollowUp(corpus_jobs.PUSH_TASK, 0, {"investigation_id": "inv-1"}), now=True) is True
    now_job = queue.manager.jobs[1]
    assert (now_job.lock, now_job.queueing_lock, now_job.priority, now_job.scheduled_at) == (
        "workbench.corpus_push:inv-1", "workbench.corpus_push:inv-1:now", 1, None)

    queue.manager = FakeJobManager(already=True)
    assert queue.defer(step) is False


def test_registered_tasks_run_the_step_and_queue_what_follows(openaleph, monkeypatch):
    registered: dict[str, Any] = {}

    class FakeApp:
        def task(self, *, name: str, queue: str, retry: bool):
            assert queue == "workbench" and retry is False

            def wrap(func):
                registered[name] = func
                return func

            return wrap

    recording = RecordingQueue()
    monkeypatch.setitem(corpus_jobs._queues, corpus_jobs._engine_key(engine), recording)
    corpus_jobs.register_tasks(FakeApp(), SessionLocal, engine, queue_name="workbench")
    with SessionLocal() as db:
        inv, *_ = _seeded(db)
        recording.deferred.clear()
        openaleph.fail[("POST", "/api/2/collections")] = 502
        registered[corpus_jobs.PUSH_TASK](investigation_id=inv.id)
        assert recording.deferred == [(corpus_jobs.FollowUp(corpus_jobs.PUSH_TASK, 30.0, {"investigation_id": inv.id}, retry=True), False)]


def test_sync_now_runs_the_steps_and_waits_between_them(openaleph):
    sleeps: list[float] = []
    clock = iter(range(0, 10_000, 10))
    with SessionLocal() as db:
        inv, meridian, jane, edge = _seeded(db)
        corpus_jobs.sync_now(SessionLocal, inv.id, gateway=openaleph.gateway(), sleep=sleeps.append, clock=lambda: next(clock))
        assert len(_links(db, inv)) == 3 and sleeps == []

        other = _entity(db, inv, "Person", "J. Doe")
        corpus_jobs.sync_now(SessionLocal, inv.id, gateway=openaleph.gateway(), sleep=sleeps.append, clock=lambda: next(clock))
        _merge(db, db.get(Entity, other.id), db.get(Entity, jane.id))

        polls = iter([True, False])

        class Finishing:
            def __init__(self, gateway):
                self.gateway = gateway

            def __getattr__(self, name):
                return getattr(self.gateway, name)

            def index_busy(self, collection_id):
                busy = next(polls)
                if not busy:
                    openaleph.finish_indexing()
                return busy

        corpus_jobs.sync_now(SessionLocal, inv.id, gateway=Finishing(openaleph.gateway()), sleep=sleeps.append, clock=lambda: next(clock))
        assert sleeps == [settings.openaleph_corpus_poll_seconds]
        assert other.id not in _links(db, inv)


def test_sync_now_stops_waiting_at_the_deadline(openaleph, monkeypatch):
    monkeypatch.setattr(settings, "openaleph_xref_timeout_seconds", 3.0)
    with SessionLocal() as db:
        inv, meridian, jane, edge = _seeded(db)
        other = _entity(db, inv, "Person", "J. Doe")
        corpus_jobs.sync_now(SessionLocal, inv.id, gateway=openaleph.gateway(), sleep=lambda s: None, clock=lambda: 0.0)
        _merge(db, db.get(Entity, other.id), db.get(Entity, jane.id))
        sleeps: list[float] = []
        corpus_jobs.sync_now(SessionLocal, inv.id, gateway=openaleph.gateway(), sleep=sleeps.append, clock=lambda: 0.0)
        assert sleeps == [] and other.id in _links(db, inv)  # still waiting: indexing never finished


def test_stalled_jobs_are_handed_back_one_at_a_time(caplog):
    """A stalled corpus job that cannot go back to waiting (a newer one holds
    its queueing lock) is closed, and the other stalled jobs still go back."""
    import asyncio

    from procrastinate.exceptions import UniqueViolation
    from procrastinate.jobs import Status

    from app.jobs.runner import JobRunner

    class Manager:
        def __init__(self) -> None:
            self.retried: list[int] = []
            self.finished: list[tuple[int, Status]] = []

        async def get_stalled_jobs(self, *, queue: str, seconds_since_heartbeat: float):
            return [type("J", (), {"id": 1})(), type("J", (), {"id": 2})(), type("J", (), {"id": 3})()]

        async def retry_job(self, job):
            if job.id == 1:
                raise UniqueViolation(constraint_name="procrastinate_jobs_queueing_lock_idx_v1", queueing_lock="x")
            if job.id == 2:
                raise RuntimeError("connection lost")
            self.retried.append(job.id)

        async def finish_job(self, *, job, status, delete_job):
            self.finished.append((job.id, status))

    runner = JobRunner("inline", SessionLocal, engine)
    manager = Manager()
    runner.queue = type("Q", (), {"job_manager": manager})()
    asyncio.run(runner._retry_stalled())
    assert manager.retried == [3]
    assert manager.finished == [(1, Status.FAILED)]

    class Broken(Manager):
        async def get_stalled_jobs(self, *, queue: str, seconds_since_heartbeat: float):
            raise RuntimeError("database away")

    runner.queue = type("Q", (), {"job_manager": Broken()})()
    asyncio.run(runner._retry_stalled())  # logged, not raised
    assert "could not check for stalled jobs" in caplog.text


def test_run_step_rejects_an_unknown_task(openaleph):
    with pytest.raises(ValueError):
        corpus_jobs.run_step(SessionLocal, corpus_jobs.FollowUp("workbench.unknown", 0, {"investigation_id": "x"}), openaleph.gateway())
