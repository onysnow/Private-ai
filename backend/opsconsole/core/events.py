"""In-process event bus feeding one SSE endpoint. Producers run on request
threads and supervisor threads; each subscriber has a bounded queue and is
told (with a `gap` event) when it fell behind so the UI re-syncs by polling."""

from __future__ import annotations

import json
import queue
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Iterator


@dataclass(eq=False)
class _Subscriber:
    """eq=False keeps identity-based __eq__/__hash__ (the default object
    behavior) so instances can live in a set — value equality is meaningless
    here (two subscribers can share topics) and dataclass's auto-generated
    eq=True would otherwise set __hash__ to None."""

    topics: frozenset[str]
    q: "queue.Queue[tuple[str, dict[str, Any]]]"
    dropped: int = 0
    lock: threading.Lock = field(default_factory=threading.Lock)


class EventBus:
    def __init__(self, *, queue_size: int = 500) -> None:
        self.queue_size = queue_size
        self._subs: set[_Subscriber] = set()
        self._lock = threading.Lock()
        self.published = 0

    def subscribe(self, topics: frozenset[str]) -> _Subscriber:
        sub = _Subscriber(topics=topics, q=queue.Queue(maxsize=self.queue_size))
        with self._lock:
            self._subs.add(sub)
        return sub

    def unsubscribe(self, sub: _Subscriber) -> None:
        with self._lock:
            self._subs.discard(sub)

    @property
    def subscribers(self) -> int:
        with self._lock:
            return len(self._subs)

    def publish(self, topic: str, data: dict[str, Any]) -> None:
        self.published += 1
        with self._lock:
            subs = list(self._subs)
        family = topic.split(":", 1)[0]
        for sub in subs:
            if "*" in sub.topics or topic in sub.topics or family in sub.topics:
                try:
                    sub.q.put_nowait((topic, data))
                except queue.Full:
                    with sub.lock:
                        sub.dropped += 1
                    try:  # drop the oldest and keep the newest
                        sub.q.get_nowait()
                        sub.q.put_nowait((topic, data))
                    except (queue.Empty, queue.Full):
                        pass

    def stream(self, topics: frozenset[str], *, keepalive_seconds: float = 15.0, stop: threading.Event | None = None) -> Iterator[str]:
        sub = self.subscribe(topics)
        try:
            yield _format("hello", {"topics": sorted(topics), "at": time.time()})
            while stop is None or not stop.is_set():
                try:
                    topic, data = sub.q.get(timeout=keepalive_seconds)
                except queue.Empty:
                    yield ": keepalive\n\n"
                    continue
                with sub.lock:
                    if sub.dropped:
                        yield _format("gap", {"dropped": sub.dropped})
                        sub.dropped = 0
                yield _format(topic, data)
        finally:
            self.unsubscribe(sub)


def _format(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"
