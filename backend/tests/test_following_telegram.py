"""Following a public Telegram channel (DECISIONS call 1: open sources only; app/services/following.py): through
the web preview Telegram shows logged out at t.me/s/<channel>. Nothing else on Telegram is followed: a private
group's invite, a private channel's post or a person's account stays a closed platform.

The preview here is written in the markup t.me serves (checked against three public channels on 29 Oct 2026),
for a made-up channel."""

from __future__ import annotations

from app.services import following
from app.services.following import Fetched
from tests.test_following import _case, _check, _follow, _screen, client

CHANNEL = "harbourwatch"


def _post(n: int, when: str, text: str = "", *, forwarded: str | None = None, edited: bool = False, photo: bool = False) -> str:
    fwd = (f'<div class="tgme_widget_message_forwarded_from accent_color">Forwarded from&nbsp;<a class="tgme_widget_message_forwarded_from_name" '
           f'href="https://t.me/portnews"><span dir="auto">{forwarded}</span></a></div>') if forwarded is not None else ""
    pic = '<a class="tgme_widget_message_photo_wrap" href="#" style="width:800px"></a>' if photo else ""
    body = f'<div class="tgme_widget_message_text js-message_text" dir="auto">{text}</div>' if text else ""
    return (f'<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="{CHANNEL}/{n}">'
            f'<div class="tgme_widget_message_bubble">{fwd}{pic}{body}'
            f'<div class="tgme_widget_message_footer compact js-message_footer"><div class="tgme_widget_message_info short js-message_info">'
            f'<span class="tgme_widget_message_views">1.2K</span><span class="copyonly"> views</span><span class="tgme_widget_message_meta">'
            f'<span class="tgme_widget_message_from_author" dir="auto">Harbour Watch</span>,&nbsp;{"edited &nbsp;" if edited else ""}'
            f'<a class="tgme_widget_message_date" href="https://t.me/{CHANNEL}/{n}"><time datetime="{when}" class="time">09:00</time></a></span>'
            f'</div></div></div></div></div>')


def _preview(posts: list[str]) -> bytes:
    return ('<html><head><meta property="og:title" content="Harbour Watch"></head><body>'
            '<div class="tgme_channel_info"><div class="tgme_channel_info_header_title"><span dir="auto">Harbour Watch</span></div></div>'
            f'<section class="tgme_channel_history js-message_history">{"".join(posts)}</section></body></html>').encode()


POSTS = [
    _post(40, "2026-10-19T08:00:00+00:00", "Council meets <b>tonight</b> on the harbour lease.<br/>Agenda below."),
    _post(41, "2026-10-19T09:30:00+00:00", "Lease extension approved, 20 years.", forwarded="Port News", edited=True),
    _post(42, "2026-10-19T10:15:00+00:00", photo=True),
]


class Telegram:
    """Stands in for t.me: the preview of the one channel, a redirect for any other name, no robots.txt."""

    def __init__(self) -> None:
        self.posts = list(POSTS)
        self.asked: list[str] = []

    def __call__(self, url: str, *, route: str = "direct", etag=None, last_modified=None, accept: str = "*/*") -> Fetched:
        self.asked.append(url)
        if url.endswith("/robots.txt"):
            return Fetched(404, url, {}, b"", 0.1)
        if url == f"https://t.me/s/{CHANNEL}":
            return Fetched(200, url, {"content-type": "text/html"}, _preview(self.posts), 0.2)
        # t.me sends a name with no public preview on to its plain page, which shows no posts.
        name = url.rsplit("/", 1)[-1]
        return Fetched(200, f"https://t.me/{name}", {"content-type": "text/html"}, b"<html><body>Send message</body></html>", 0.2)


def test_the_preview_is_read_post_by_post():
    entries = following.read_telegram(_preview(POSTS))
    assert [e.key for e in entries] == [f"telegram:{CHANNEL}/42", f"telegram:{CHANNEL}/41", f"telegram:{CHANNEL}/40"]
    photo, forwarded, first = entries
    assert first.title == "Council meets tonight on the harbour lease." and first.summary.endswith("\nAgenda below.")
    assert first.url == f"https://t.me/{CHANNEL}/40" and first.published.isoformat() == "2026-10-19T08:00:00"
    assert forwarded.extra == {"forwarded_from": "Port News", "views": "1.2K", "edited": True}
    assert photo.title == "(photo)" and photo.extra["carries"] == "photo"


def test_what_a_telegram_address_follows():
    for typed in (f"https://t.me/{CHANNEL}", f"t.me/s/{CHANNEL}", f"https://t.me/{CHANNEL}/41", f"https://telegram.me/{CHANNEL}"):
        assert following._telegram_channel(typed) == CHANNEL, typed
    for typed in ("https://t.me/+AbCdEfGh123", "https://t.me/joinchat/AbCdEf", "https://t.me/c/1234567/89", "https://t.me/ab"):
        assert following._telegram_channel(typed) is None, typed


def test_a_public_channel_is_followed_and_a_deleted_post_noticed(monkeypatch):
    tg = Telegram()
    monkeypatch.setattr(following, "fetch", tg)
    inv = _case()
    m = _follow(inv, f"https://t.me/{CHANNEL}")
    assert m["status"] in (200, 201), m
    assert m["kind"] == "account" and m["platform"] == "telegram" and m["url"] == f"https://t.me/s/{CHANNEL}"
    assert m["name"] == f"Harbour Watch (t.me/{CHANNEL}) · public Telegram channel"
    assert "public web preview" in m["leaves"] and "no account is used" in m["leaves"]
    screen = _screen(inv)
    titles = {i["title"] for i in screen["queue"]}
    assert {"Council meets tonight on the harbour lease.", "Lease extension approved, 20 years.", "(photo)"} <= titles
    # Post 41 is deleted at the source while older and newer posts are still shown.
    tg.posts = [POSTS[0], POSTS[2]]
    checked = _check(m["id"])
    assert any("1 of the last 3 posts were deleted" in c["text"] for c in checked["checks"]), checked["checks"]


def test_a_channel_with_no_public_preview_is_refused_and_an_invite_stays_closed(monkeypatch):
    monkeypatch.setattr(following, "fetch", Telegram())
    inv = _case()
    r = client.post(f"/api/investigations/{inv}/monitors", json={"target": "https://t.me/someone_private"})
    assert r.status_code in (400, 409, 422) and "no public web preview" in r.text, r.text
    closed = _follow(inv, "https://t.me/+AbCdEfGh123")
    assert closed["kind"] == "closed" and closed["next_check_at"] is None
