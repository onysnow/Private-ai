"""What the 1MDB demo case follows (Following, ADR-0022; mockup FOLLOW_1), so the screen shows real material.

Four public sources and one closed platform, with what they turned up already in the queue: the US Justice
Department's press releases (its 1MDB releases, 2016–2019), Sarawak Report's news feed (the 2015 PetroSaudi story),
the E.D.N.Y. docket of United States v. Ng Chong Hwa (two versions of the page: Ng's arraignment in May 2019 changed
it since it was captured), WNYC's Money Talking podcast (the December 2018 1MDB episode) and Sarawak Report on X (no
monitor: link capture only). One Sarawak Report item restates the Justice Department's October 2019 settlement, so
the two are counted once.

Nothing is fetched here: the monitors and their items are written straight into the case. The items' titles and
dates are the publishers' own where the address was checked by hand (the Justice Department's four releases, the
Sarawak Report "Heist of the century" article, the WNYC episode); the rest are written for the demo and say so in
their summary. No monitor is checked automatically: a demo never contacts a site on its own, and an address that
does not answer cannot turn "broken" while the reporter looks around. "Check now" asks once when a person presses it.

Seeding is idempotent: a monitor whose address the case already follows is left alone, items included.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.following import Monitor, MonitorItem, PageVersion

DEMO_NOTE = "Demo item: written for the 1MDB demo case, not the publisher's text."
DOJ_PR = "https://www.justice.gov/archives/opa/pr/"
SR_SEARCH = "https://www.sarawakreport.org/?s="

DOCKET_V1 = """United States v. Ng Chong Hwa, et al. · 1:18-cr-00538 (E.D.N.Y.)
Assigned to: Judge Margo K. Brodie
2018-10-03 Indictment returned as to Low Taek Jho and Ng Chong Hwa (sealed)
2018-11-01 Order unsealing the indictment
2018-11-01 Information and plea agreement as to Tim Leissner unsealed
Status: Ng Chong Hwa held in Malaysia pending extradition"""

DOCKET_V2 = """United States v. Ng Chong Hwa, et al. · 1:18-cr-00538 (E.D.N.Y.)
Assigned to: Judge Margo K. Brodie
2018-10-03 Indictment returned as to Low Taek Jho and Ng Chong Hwa (sealed)
2018-11-01 Order unsealing the indictment
2018-11-01 Information and plea agreement as to Tim Leissner unsealed
2019-05-06 Arraignment as to Ng Chong Hwa: plea of not guilty entered
2019-05-06 Bond set as to Ng Chong Hwa"""


def _d(text: str) -> datetime:
    return datetime.fromisoformat(text)


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# Each source: the monitor's fields, then what it turned up. An item's `ago` is how long before seeding the app first
# saw it; `edits` adds versions of its text (an edit since first seen is a risk); `state`/`decided_ago` a decision.
SOURCES: list[dict[str, Any]] = [
    {"kind": "feed", "url": "https://www.justice.gov/news/rss?type=press_release&m=1",
     "name": "DOJ · press releases", "every": 60, "seconds": 0.6, "read": 25, "items": [
         {"key": "doj-2016-07-20", "slug": "us-seeks-recover-more-1-billion-obtained-corruption-involving-malaysian-sovereign-wealth-fund",
          "title": "U.S. Seeks to Recover More Than $1 Billion Obtained from Corruption Involving Malaysian Sovereign Wealth Fund",
          "published": "2016-07-20T14:00:00", "ago": timedelta(days=2, hours=5), "state": "skipped",
          "decided_ago": timedelta(days=1, hours=20), "summary": "Civil forfeiture complaints against assets bought with money "
          "allegedly diverted from 1MDB: New York and Los Angeles property, a jet, art, and rights to a film."},
         {"key": "doj-2017-06-15", "slug": "us-seeks-recover-approximately-540-million-obtained-corruption-involving-malaysian-sovereign",
          "title": "U.S. Seeks to Recover Approximately $540 Million Obtained From Corruption Involving Malaysian Sovereign Wealth Fund",
          "published": "2017-06-15T15:00:00", "ago": timedelta(hours=3, minutes=12), "summary": "More forfeiture complaints, "
          "among them the superyacht Equanimity and jewellery."},
         {"key": "doj-2018-11-01", "slug": "malaysian-financier-low-taek-jho-also-known-jho-low-and-former-banker-ng-chong-hwa-also-known-roger-ng",
          "title": "Malaysian Financier Low Taek Jho and Former Banker Ng Chong Hwa Indicted; Former Goldman Partner Tim Leissner Pleads Guilty",
          "published": "2018-11-01T16:00:00", "ago": timedelta(hours=3, minutes=12), "summary": "Charges unsealed in the "
          "Eastern District of New York: conspiracy to launder billions embezzled from 1MDB and to violate the FCPA."},
         {"key": "doj-2019-10-30", "slug": "united-states-reaches-settlement-recover-more-700-million-assets-allegedly-traceable-corruption",
          "title": "United States Reaches Settlement to Recover More Than $700 Million in Assets Allegedly Traceable to Corruption "
          "Involving Malaysian Sovereign Wealth Fund", "published": "2019-10-30T18:00:00", "ago": timedelta(hours=3, minutes=12),
          "summary": "Jho Low and his family agree to give up assets in the US, UK and Switzerland bought with money allegedly "
          "diverted from 1MDB; the settlement is not an admission of wrongdoing.", "original_of": "sr-2019-10-31"},
     ]},
    {"kind": "feed", "url": "https://www.sarawakreport.org/feed/", "name": "Sarawak Report · news feed", "every": 30,
     "seconds": 0.9, "read": 10, "items": [
         {"key": "sr-2015-02-28",
          "url": "https://www.sarawakreport.org/2015/02/heist-of-the-century-how-jho-low-used-petrosaudi-as-a-front-to-siphon-billions-out-of-1mdb-world-exclusive/",
          "title": "Heist of the century: how Jho Low used PetroSaudi as “a front” to siphon billions out of 1MDB",
          "published": "2015-02-28T09:00:00", "ago": timedelta(hours=2, minutes=40), "edits": 2,
          "summary": "The PetroSaudi joint venture and where its money went, from leaked emails."},
         {"key": "sr-2015-07-03", "title": "Najib's accounts: what the documents show about the $700 million",
          "published": "2015-07-03T08:00:00", "ago": timedelta(hours=2, minutes=40), "summary": DEMO_NOTE},
         {"key": "sr-2019-10-31", "title": "Jho Low settles with the US: more than $700 million in assets to be given up",
          "published": "2019-10-31T07:00:00", "ago": timedelta(hours=2, minutes=40), "state": "copy", "similarity": 0.72,
          "summary": "Jho Low and his family agree to give up assets in the US, UK and Switzerland bought with money allegedly "
          "diverted from 1MDB; the settlement is not an admission of wrongdoing. " + DEMO_NOTE},
     ]},
    {"kind": "page", "url": "https://www.courtlistener.com/docket/4377470/united-states-v-ng/",
     "name": "US v. Ng · court docket", "every": 1440, "seconds": 1.2,
     "versions": [{"text": DOCKET_V1, "ago": timedelta(days=3), "captured": True},
                  {"text": DOCKET_V2, "ago": timedelta(hours=4, minutes=5), "layout": timedelta(hours=1)}]},
    {"kind": "podcast", "url": "https://www.wnyc.org/feeds/shows/moneytalking", "name": "Money Talking · podcast",
     "every": 1440, "seconds": 0.8, "read": 30, "items": [
         {"key": "wnyc-2018-12-21", "url": "https://www.wnyc.org/story/money-talking-1mdb-scandal-malaysia-goldman-sachs/",
          "title": "Malaysian '1MDB' Scandal And Goldman Sachs", "published": "2018-12-21T10:00:00", "ago": timedelta(hours=5),
          "summary": "Charlie Herman talks to Ben Walsh (Barron's) and Peter Eavis (NYT) about 1MDB and Goldman Sachs after "
          "Malaysia's criminal charges against the bank.",
          "extra": {"audio": {"url": "https://waaa.wnyc.org/6e587fa5-1787-4893-8e32-8391c7e2b4ee/episodes/58e0a4ec-3e3d-445e-8839-"
                              "5400253e1f13/audio/128/default.mp3", "type": "audio/mpeg", "bytes": 7408138}}},
     ]},
    {"kind": "closed", "url": "https://x.com/sarawakreport", "name": "Sarawak Report on X", "platform": "x"},
]


def seed_following(db: Session, investigation_id: str, *, now: datetime | None = None) -> int:
    """Give the case the demo's followed sources. Returns how many monitors were added (0 when all were there)."""
    now = now or utcnow_naive()
    have = set(db.scalars(select(Monitor.url).where(Monitor.investigation_id == investigation_id)))
    originals: dict[str, MonitorItem] = {}
    copies: list[tuple[MonitorItem, float, str]] = []
    added = 0
    for src in SOURCES:
        if src["url"] in have:
            continue
        added += 1
        closed = src["kind"] == "closed"
        checked = now - timedelta(minutes=8)
        monitor = Monitor(investigation_id=investigation_id, kind=src["kind"], platform=src.get("platform"), url=src["url"],
                          name=src["name"], every_minutes=0 if closed else src["every"], route="direct",
                          health="closed" if closed else "works", created_by="1MDB demo", created_at=now - timedelta(days=3),
                          last_checked_at=None if closed else checked, last_ok_at=None if closed else checked,
                          # No automatic checks: a demo never contacts a site on its own; "Check now" asks once when a person presses it.
                          next_check_at=None, robots_allowed=None if closed else True)
        if not closed:
            checks = [{"state": "ok", "text": f"Answered 200 in {src['seconds']:.1f} s", "status": 200, "seconds": src["seconds"]}]
            if src["kind"] == "page":
                checks.append({"state": "warn", "text": "Text differs from the last version · 2 lines"})
            else:
                noun = "episodes" if src["kind"] == "podcast" else "items"
                checks.append({"state": "ok", "text": f"Read {src['read']} {noun}"})
            monitor.checks = checks
        db.add(monitor)
        db.flush()
        for item in src.get("items", []):
            seen = now - item["ago"]
            published = _d(item["published"])
            url = item.get("url") or (DOJ_PR + item["slug"] if "slug" in item else SR_SEARCH + item["title"].replace(" ", "+"))
            versions = [{"at": (seen + timedelta(hours=i)).isoformat(), "sha256": _sha(f"{item['title']}\n{i}"), "title": item["title"]}
                        for i in range(1 + item.get("edits", 0))]
            row = MonitorItem(investigation_id=investigation_id, monitor_id=monitor.id, key=item["key"], url=url,
                              title=item["title"], summary=item.get("summary", ""), published_at=published, first_seen_at=seen,
                              last_seen_at=checked, versions=versions, extra={"demo": "1mdb", **item.get("extra", {})},
                              state=item.get("state", "waiting"))
            if "decided_ago" in item:
                row.decision = {"action": item["state"], "by": "1MDB demo", "at": (now - item["decided_ago"]).isoformat()}
            db.add(row)
            db.flush()
            if "original_of" in item:
                originals[item["original_of"]] = row
            if item.get("state") == "copy":
                copies.append((row, item["similarity"], item["key"]))
        previous: PageVersion | None = None
        for number, ver in enumerate(src.get("versions", []), start=1):
            seen = now - ver["ago"]
            diff: list[str] = []
            changed = 0
            if previous is not None:
                old, new = previous.text.splitlines(), ver["text"].splitlines()
                diff = [f"-{line}" for line in old if line not in new] + [f"+{line}" for line in new if line not in old]
                changed = max(sum(d.startswith("-") for d in diff), sum(d.startswith("+") for d in diff))
            layout = [{"at": (now - ver["layout"]).isoformat(), "sha256": _sha(f"layout {number} b")}] if "layout" in ver else []
            version = PageVersion(investigation_id=investigation_id, monitor_id=monitor.id, number=number, seen_at=seen,
                                  text_sha256=_sha(ver["text"]), layout_sha256=_sha(f"layout {number}"), text=ver["text"],
                                  lines_changed=changed, diff=diff, layout_changes=layout, captured=bool(ver.get("captured")))
            db.add(version)
            db.flush()
            if number > 1:
                # A new version waits for a person, as a check that found it would leave it.
                db.add(MonitorItem(investigation_id=investigation_id, monitor_id=monitor.id, key=f"version:{number}", url=src["url"],
                                   title=f"{src['name'].split(' · ')[0]} · new version", summary="\n".join(ver["text"].splitlines()[:6]),
                                   first_seen_at=seen, last_seen_at=seen, published_at=seen,
                                   extra={"page_version": number, "version_id": version.id, "lines_changed": changed, "demo": "1mdb"},
                                   versions=[{"at": seen.isoformat(), "sha256": version.text_sha256, "title": src["name"]}]))
            previous = version
    # Copies of one story: the earliest is the original, the later one leaves the queue as a copy.
    for row, similarity, key in copies:
        original = originals.get(key)
        if original is not None:
            original.cluster = original.id
            row.cluster, row.similarity = original.id, similarity
    db.commit()
    return added
