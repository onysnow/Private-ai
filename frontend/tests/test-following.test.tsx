// @vitest-environment jsdom
// Following (Bring in; mockup FOLLOW_1, ADR-0022): the sources and whether they work today, the queue most at risk
// first with Capture, Skip and Record removal, Capture all only with a reason, a source's schedule and route, and a
// closed platform with no monitor.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Following} from '../features/following/following';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {FollowingOut, MonitorItemOut, MonitorOut} from '../lib/generated/types.gen';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/bring-in', useSearchParams: () => new URLSearchParams()}));

function monitor(over: Partial<MonitorOut> = {}): MonitorOut {
  return {id: 'm1', kind: 'feed', platform: null, url: 'https://www.marlow-courier.example/feed.xml', name: 'The Marlow Courier · news feed',
    every_minutes: 30, route: 'direct', health: 'works', health_detail: null, moved_to: null,
    checks: [{state: 'ok', text: 'Answered 200 in 0.4 s'}, {state: 'ok', text: 'Read 14 items'}],
    last_checked_at: '2026-10-28T10:02:00', last_ok_at: '2026-10-28T10:02:00', next_check_at: '2026-10-28T10:32:00', robots_allowed: true,
    waiting: 2, leaves: 'One request every 30 minutes to marlow-courier.example, asking “anything new since my last visit?”.',
    created_by: 'Ony', created_at: '2026-10-19T09:00:00', ...over};
}
function item(over: Partial<MonitorItemOut> = {}): MonitorItemOut {
  return {id: 'i1', monitor_id: 'm1', kind: 'feed', platform: null, title: 'Harbour authority approves Kestrel lease extension',
    url: 'https://www.marlow-courier.example/lease', summary: '', published_at: '2026-10-28T09:48:00', first_seen_at: '2026-10-28T09:50:00',
    state: 'waiting', risks: [{tone: 'amber', text: 'At risk: edited twice since first seen'}, {tone: 'teal', text: 'Wire copy of 3 others'}],
    rank: 2, source: 'The Marlow Courier · news feed', extra: {}, capture_id: null, document_id: null, decision: {}, ...over};
}
function screenData(over: Partial<FollowingOut> = {}): FollowingOut {
  return {monitors: [monitor(), monitor({id: 'm2', kind: 'closed', name: 'instagram.com · closed platform', url: 'https://www.instagram.com/kestrel.sa/',
    health: 'closed', checks: [], waiting: 0, leaves: 'Nothing is fetched: a closed platform has no monitor.'})],
  queue: [item({id: 'gone', title: 'Statement on the Kestrel lease', state: 'gone', rank: 3, risks: [{tone: 'bad', text: 'Removed: now answers 404'}]}),
    item(), item({id: 'i2', title: 'Ferry timetable changes', rank: 0, risks: [{tone: '', text: 'New · no sign of risk'}]})],
  waiting: 3, captured: 0, skipped: 0, copies: [], egress: {sources: 2, third_party: 0, direct: 1, tor: 0, public_server: 0, no_monitor: 1},
  working: 1, followed: 1, ...over};
}

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => cleanup());

describe('Following', () => {
  it('shows the sources, the queue most at risk first, and what leaves this computer', async () => {
    mockApi({'GET /api/investigations/inv-1/following': screenData(), 'GET /api/monitors/m1/versions': []});
    render(<QueryProvider><Following investigationId="inv-1"/></QueryProvider>);
    const sources = await screen.findByRole('listbox', {name: 'Sources'});
    const feed = within(sources).getByRole('option', {name: /The Marlow Courier · news feed/});
    expect(feed).toHaveAttribute('aria-selected', 'true');
    expect(within(feed).getByText('2 new')).toBeInTheDocument();
    expect(within(sources).getByRole('option', {name: /instagram\.com · closed platform/})).toHaveTextContent('none');
    expect(screen.getByText('1 of 1 working today')).toBeInTheDocument();
    const queue = screen.getByRole('region', {name: 'Most at risk first'});
    const rows = within(queue).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Statement on the Kestrel lease');
    expect(within(rows[0]).getByRole('button', {name: 'Record removal'})).toBeInTheDocument();
    expect(within(rows[1]).getByText('At risk: edited twice since first seen')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('button', {name: 'Capture'})).toBeInTheDocument();
    const leaves = screen.getByRole('region', {name: 'What leaves this computer'});
    expect(leaves).toHaveTextContent('0 third-party services. 1 source is asked directly, 1 has no monitor.');
    const chosen = screen.getByRole('region', {name: 'Selected source'});
    // What leaves this computer is one line on screen; its sentence is on hover (Ony, 29 Oct).
    expect(within(chosen).getByText('↗ 1 request · 30 min · direct')).toBeVisible();
    expect(within(chosen).getByText(/Leaves this computer:/).closest('[hidden]')).not.toBeNull();
    // The kind is an icon and the health a shape; their words and the check results are on hover.
    expect(within(feed).queryByText('FEED')).toBeNull();
    expect(within(chosen).getByText('✓ Answered 200 in 0.4 s').closest('[hidden]')).not.toBeNull();
    expect(within(rows[1]).getByText('The Marlow Courier · news feed').closest('[hidden]')).not.toBeNull();
    expect(within(chosen).getByRole('radio', {name: '30 min'})).toHaveAttribute('aria-checked', 'true');
  });

  it('captures, skips, and captures all only with a reason', async () => {
    const after = screenData({queue: [item({state: 'capturing', capture_id: 'c1', decision: {action: 'captured', by: 'Ony', at: '2026-10-28T10:05:00'}})], waiting: 0});
    const api = mockApi({'GET /api/investigations/inv-1/following': screenData(), 'GET /api/monitors/m1/versions': [],
      'POST /api/monitor-items/i1/capture': after,
      'POST /api/monitor-items/i2/skip': screenData({skipped: 1, queue: [...screenData().queue.slice(0, 2),
        item({id: 'i2', title: 'Ferry timetable changes', state: 'skipped', rank: 0, risks: [{tone: '', text: 'New · no sign of risk'}],
          decision: {action: 'skipped', by: 'Ony', at: '2026-10-28T10:04:00'}})]}),
      'POST /api/investigations/inv-1/following/capture-all': after});
    render(<QueryProvider><Following investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    const queue = await screen.findByRole('region', {name: 'Most at risk first'});
    const rows = within(queue).getAllByRole('listitem');
    await user.click(within(rows[2]).getByRole('button', {name: 'Skip'}));
    await waitFor(() => expect(api.calls('POST /api/monitor-items/i2/skip')).toHaveLength(1));
    expect(await within(queue).findByText('Skipped')).toBeInTheDocument();
    expect(within(queue).getByRole('button', {name: 'Undo'})).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Capture all…'}));
    const go = screen.getByRole('button', {name: 'Capture all'});
    expect(go).toBeDisabled();
    await user.click(screen.getByRole('button', {name: 'Account is deleting posts'}));
    expect(go).toBeEnabled();
    await user.click(go);
    await waitFor(() => expect(api.calls('POST /api/investigations/inv-1/following/capture-all')).toHaveLength(1));
    expect(api.calls('POST /api/investigations/inv-1/following/capture-all')[0].body).toEqual({reason: 'Account is deleting posts'});
  });

  it('changes how often a source is asked and its route', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/following': screenData(), 'GET /api/monitors/m1/versions': [],
      'PATCH /api/monitors/m1': monitor({every_minutes: 60})});
    render(<QueryProvider><Following investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    const chosen = await screen.findByRole('region', {name: 'Selected source'});
    await user.click(within(chosen).getByRole('radio', {name: 'hourly'}));
    await user.click(within(chosen).getByRole('radio', {name: 'Neutral route'}));
    await waitFor(() => expect(api.calls('PATCH /api/monitors/m1')).toHaveLength(2));
    expect(api.calls('PATCH /api/monitors/m1').map(c => c.body)).toEqual([{every_minutes: 60}, {route: 'tor'}]);
  });

  it('names a public Telegram channel by what is read of it: the web preview, no login', async () => {
    const channel = monitor({id: 'm3', kind: 'account', platform: 'telegram', url: 'https://t.me/s/harbourwatch',
      name: 'Harbour Watch (t.me/harbourwatch) · public Telegram channel', every_minutes: 15,
      leaves: "One request every 15 minutes to t.me for this channel's public web preview. Telegram learns that this computer read the channel; no account is used."});
    mockApi({'GET /api/investigations/inv-1/following': screenData({monitors: [channel]}), 'GET /api/monitors/m3/versions': []});
    render(<QueryProvider><Following investigationId="inv-1"/></QueryProvider>);
    const chosen = await screen.findByRole('region', {name: 'Selected source'});
    expect(within(chosen).getByText('Public channel · web preview, the latest posts · no login · t.me/harbourwatch')).toBeInTheDocument();
    expect(within(chosen).getByText(/no account is used/)).toBeInTheDocument();
  });

  it('says a closed platform has no monitor and offers link capture', async () => {
    mockApi({'GET /api/investigations/inv-1/following': screenData(), 'GET /api/monitors/m1/versions': []});
    render(<QueryProvider><Following investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('option', {name: /instagram\.com · closed platform/}));
    const chosen = screen.getByRole('region', {name: 'Selected source'});
    expect(within(chosen).getByText('No monitor')).toBeInTheDocument();
    expect(within(chosen).getByText(/The app does not sign in to any account/)).toBeInTheDocument();
    expect(within(chosen).getByRole('link', {name: 'Paste a link'})).toBeInTheDocument();
  });

  it('follows one sender in a newsletter mailbox, its password sent once and never shown', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/following': screenData(), 'GET /api/monitors/m1/versions': [],
      'POST /api/investigations/inv-1/monitors/mailbox': monitor({id: 'm3', kind: 'mailbox', platform: 'email', name: 'Newsletters from news@harbourwatch.example.org'})});
    render(<QueryProvider><Following investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: '+ Follow something'}));
    await user.click(screen.getByRole('radio', {name: 'A newsletter mailbox'}));
    expect(screen.getByRole('button', {name: 'Follow'})).toBeDisabled();
    expect(screen.getByText(/never loads the images in it/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Mail server'), 'imap.example.net');
    await user.type(screen.getByLabelText('User name'), 'desk@example.net');
    await user.type(screen.getByLabelText(/^Password/), 'right horse');
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'password');
    await user.type(screen.getByLabelText('The sender to follow'), 'news@harbourwatch.example.org');
    await user.click(screen.getByRole('button', {name: 'Follow'}));
    await waitFor(() => expect(api.lastBody('POST /api/investigations/inv-1/monitors/mailbox')).toEqual(
      {host: 'imap.example.net', user: 'desk@example.net', password: 'right horse', sender: 'news@harbourwatch.example.org'}));
  });

  it('shows a case that follows nothing the way to follow a first source: a paste field, the kinds as marks', async () => {
    const empty = screenData({monitors: [], queue: [], waiting: 0, egress: {sources: 0, third_party: 0, direct: 0, tor: 0, public_server: 0, no_monitor: 0}, working: 0, followed: 0});
    const api = mockApi({'GET /api/investigations/inv-1/following': empty, 'POST /api/investigations/inv-1/monitors': monitor()});
    render(<QueryProvider><Following investigationId="inv-1"/></QueryProvider>);
    const hero = await screen.findByRole('region', {name: 'Follow a first source'});
    expect(screen.queryByRole('button', {name: '+ Follow something'})).toBeNull();
    expect(screen.queryByText(/working today/)).toBeNull();
    // The kinds are marks named for screen readers, their meaning on hover; how it works is three titles.
    const kinds = within(hero).getByRole('radiogroup', {name: 'What can be followed'});
    expect(within(kinds).getAllByRole('radio').map(r => r.getAttribute('aria-label'))).toEqual(
      ['News feed', 'Watched page', 'Sitemap', 'Podcast', 'Public account', 'Newsletter mailbox', 'Closed platform']);
    expect(within(hero).getByText(/each new entry waits here/).closest('[hidden]')).not.toBeNull();
    expect(within(hero).getByText('You capture')).toBeVisible();
    const user = userEvent.setup();
    await user.click(within(kinds).getByRole('radio', {name: 'Podcast'}));
    expect(within(hero).getByRole('textbox')).toHaveAttribute('placeholder', 'https://show.example/podcast.rss');
    await user.type(within(hero).getByRole('textbox'), 'https://www.marlow-courier.example/feed.xml');
    await user.click(within(hero).getByRole('button', {name: 'Follow'}));
    await waitFor(() => expect(api.lastBody('POST /api/investigations/inv-1/monitors')).toEqual({target: 'https://www.marlow-courier.example/feed.xml', route: 'direct'}));
    await user.click(within(kinds).getByRole('radio', {name: 'Newsletter mailbox'}));
    expect(within(hero).getByLabelText('Mail server')).toBeInTheDocument();
  });
});
