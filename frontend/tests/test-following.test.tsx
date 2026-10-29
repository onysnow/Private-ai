// @vitest-environment jsdom
// Following (Bring in › Following; mockup FOLLOW_1, ADR-0021), built to the rule that a screen shows titles, numbers,
// icons and alerts and keeps the rest for hover, focus or click: the sub-text is not on screen until asked for, a
// source's kind and health are marks named in their reveal, and a person captures or skips what a monitor found.
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Reveal, REVEAL_DWELL_MS} from '../components/ui/reveal';
import {FollowingScreen, itemAlerts} from '../features/following/following-screen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {FollowingOut, MonitorItemOut, MonitorOut} from '../lib/generated/types.gen';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

function monitor(over: Partial<MonitorOut> = {}): MonitorOut {
  return {
    id: 'm1', investigation_id: 'inv-1', kind: 'feed', url: 'https://www.marlow-courier.example/feed.xml', host: 'www.marlow-courier.example',
    title: 'The Marlow Courier', interval_minutes: 30, route: 'direct', active: true, health: 'ok', health_reason: null, http_status: 200,
    failures: 0, moved_to: null, last_checked_at: '2026-10-19T10:02:00', last_ok_at: '2026-10-19T10:02:00', next_check_at: '2026-10-19T10:32:00',
    last_poll: {at: '2026-10-19T10:02:00', items_seen: 14, items_new: 4, not_modified: false, seconds: 0.4}, new_items: 1, versions: 0,
    egress: 'One request every 30 minutes to www.marlow-courier.example, asking "anything new since my last visit?" (an ETag).',
    created_by: 'you', created_at: '2026-10-12T08:00:00', ...over,
  };
}

function item(over: Partial<MonitorItemOut> = {}): MonitorItemOut {
  return {
    id: 'i1', monitor_id: 'm1', monitor_kind: 'feed', monitor_title: 'The Marlow Courier', url: 'https://www.marlow-courier.example/a',
    title: 'Harbour authority approves Kestrel lease extension', displayed: {published: 'Mon, 19 Oct 2026 09:48:00 GMT'}, edits: 2,
    flags: ['edited'], state: 'new', reason: null, decided_by: null, decided_at: null, capture_id: null,
    first_seen_at: '2026-10-19T09:48:00', last_seen_at: '2026-10-19T10:02:00', ...over,
  };
}

const following = (over: Partial<FollowingOut> = {}): FollowingOut => ({
  monitors: [monitor(), monitor({id: 'm2', kind: 'page', title: 'Fernhill Ltd · About page', host: 'fernhill.example', health: 'moved',
    moved_to: 'https://fernhill-holdings.example/about', health_reason: 'The address now points to https://fernhill-holdings.example/about', new_items: 0, versions: 2})],
  at_risk: [item()], counts: {monitors: 2, working: 1, waiting: 1, direct: 2, tor: 0}, ...over,
});

beforeEach(() => connectGeneratedClient(new ApiClient('http://api.test')));
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Reveal', () => {
  it('keeps its detail off screen until hover, focus or a click, and Esc closes it', async () => {
    const user = userEvent.setup();
    render(<Reveal label="Feed" detail="An RSS or Atom feed">◎</Reveal>);
    const mark = screen.getByRole('img', {name: 'Feed'});
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(mark).toHaveAccessibleDescription('An RSS or Atom feed');  // read with the mark, never hidden from a screen reader
    await user.click(mark);
    expect(screen.getByRole('tooltip')).toHaveTextContent('An RSS or Atom feed');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens on hover after a short dwell', async () => {
    vi.useFakeTimers();
    render(<Reveal detail="Answered 200 in 0.4 s"><span>Works</span></Reveal>);
    fireEvent.mouseEnter(screen.getByText('Works').parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => { vi.advanceTimersByTime(REVEAL_DWELL_MS + 10); });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Answered 200 in 0.4 s');
  });
});

describe('Following', () => {
  it('words an item’s alerts short enough to stay on screen', () => {
    expect(itemAlerts(item())).toEqual([{word: 'Edited 2×', tone: 'amber'}]);
    expect(itemAlerts(item({flags: ['changed'], edits: 0, displayed: {lines_added: 2, lines_removed: 1}}))).toEqual([{word: 'Changed +2 −1', tone: 'amber'}]);
    expect(itemAlerts(item({flags: [], edits: 0}))).toEqual([]);
  });

  it('shows titles, numbers, marks and alerts, and keeps the sub-text for a reveal', async () => {
    mockApi({'GET /api/investigations/inv-1/following': following(), 'GET /api/monitors/m1/versions': []});
    render(<QueryProvider><FollowingScreen investigationId="inv-1"/></QueryProvider>);
    const sources = await screen.findByRole('region', {name: 'Sources followed'});
    expect(await within(sources).findByText('The Marlow Courier')).toBeVisible();
    expect(within(sources).getByLabelText('1 new')).toHaveTextContent('1');
    // No timings, read counts or explanations on screen: they are in reveals.
    // (Their words are in the page for screen readers, in hidden elements read with each mark.)
    for (const words of [/0\.4 s/, /Read 14/, /never captures by itself/, /Posted Mon/]) {
      expect(screen.queryAllByText(words, {exact: false}).filter(el => !el.closest('[hidden]'))).toEqual([]);
    }
    // The alert stays on screen; the item's posted date does not.
    const queue = screen.getByRole('region', {name: 'Most at risk first'});
    expect(within(queue).getByText('Edited 2×')).toBeVisible();
    expect(screen.queryByRole('tooltip')).toBeNull();
    // The selected source's kind is a mark named on demand.
    const selected = screen.getByRole('region', {name: /Selected source/});
    await userEvent.click(within(selected).getByRole('img', {name: 'News feed'}));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/RSS or Atom feed/);
  });

  it('offers the new address of a moved source and accepts it', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/following': following(), 'GET /api/monitors/m2/versions': [],
      'PATCH /api/monitors/m2': monitor({id: 'm2', kind: 'page', health: 'waiting'})});
    render(<QueryProvider><FollowingScreen investigationId="inv-1"/></QueryProvider>);
    await userEvent.click(await screen.findByRole('button', {name: /Fernhill Ltd/}));
    await userEvent.click(screen.getByRole('button', {name: 'Use the new address'}));
    await waitFor(() => expect(api.calls('PATCH /api/monitors/m2')).toHaveLength(1));
    expect(api.calls('PATCH /api/monitors/m2')[0].body).toEqual({url: 'https://fernhill-holdings.example/about'});
  });

  it('a person captures or skips what was found', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/following': following(), 'GET /api/monitors/m1/versions': [],
      'POST /api/monitor-items/i1/capture': {item: item({state: 'captured'}), capture: {}}, 'POST /api/monitor-items/i1/skip': item({state: 'skipped'}),
      'GET /api/investigations/inv-1/captures': [], 'GET /api/investigations/inv-1/drop': {}});
    render(<QueryProvider><FollowingScreen investigationId="inv-1"/></QueryProvider>);
    const queue = await screen.findByRole('region', {name: 'Most at risk first'});
    await userEvent.click(await within(queue).findByRole('button', {name: 'Capture'}));
    await waitFor(() => expect(api.calls('POST /api/monitor-items/i1/capture')).toHaveLength(1));
    await userEvent.click(within(queue).getByRole('button', {name: 'Skip'}));
    await waitFor(() => expect(api.calls('POST /api/monitor-items/i1/skip')).toHaveLength(1));
  });

  it('capturing all asks for a reason first', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/following': following(), 'GET /api/monitors/m1/versions': [],
      'POST /api/investigations/inv-1/following/capture-all': {captured: [], left: 0}, 'GET /api/investigations/inv-1/captures': []});
    render(<QueryProvider><FollowingScreen investigationId="inv-1"/></QueryProvider>);
    await userEvent.click(await screen.findByRole('button', {name: 'Capture all…'}));
    await userEvent.type(screen.getByLabelText('Why capture all of them'), 'Named in the Kestrel story');
    await userEvent.click(screen.getByRole('button', {name: /Capture 1/}));
    await waitFor(() => expect(api.calls('POST /api/investigations/inv-1/following/capture-all')).toHaveLength(1));
    expect(api.calls('POST /api/investigations/inv-1/following/capture-all')[0].body).toEqual({reason: 'Named in the Kestrel story'});
  });

  it('follows a new address with how often and which route', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/following': following({monitors: [], at_risk: [], counts: {monitors: 0, working: 0, waiting: 0, direct: 0, tor: 0}}),
      'POST /api/investigations/inv-1/monitors': {status: 201, body: monitor()}});
    render(<QueryProvider><FollowingScreen investigationId="inv-1"/></QueryProvider>);
    await userEvent.click(await screen.findByRole('button', {name: '+ Follow something'}));
    const form = screen.getByRole('form', {name: 'Follow something'});
    await userEvent.type(within(form).getByLabelText('Address to follow'), 'https://www.marlow-courier.example/feed.xml');
    await userEvent.click(within(form).getByRole('button', {name: 'hourly'}));
    await userEvent.click(within(form).getByRole('button', {name: 'Tor'}));
    await userEvent.click(within(form).getByRole('button', {name: 'Follow'}));
    await waitFor(() => expect(api.calls('POST /api/investigations/inv-1/monitors')).toHaveLength(1));
    expect(api.calls('POST /api/investigations/inv-1/monitors')[0].body).toEqual(
      {url: 'https://www.marlow-courier.example/feed.xml', interval_minutes: 60, route: 'tor', poll: true});
  });

  it('says why an item cannot be captured, and does not capture it', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/following': following({at_risk: [item({capture_blocked: 'This source is followed through Tor.'})]}),
      'GET /api/monitors/m1/versions': []});
    render(<QueryProvider><FollowingScreen investigationId="inv-1"/></QueryProvider>);
    const capture = await screen.findByRole('button', {name: 'Capture'});
    expect(capture).toHaveAttribute('aria-disabled', 'true');
    expect(capture).toHaveAccessibleDescription('This source is followed through Tor.');
    await userEvent.click(capture);
    expect(api.calls('POST /api/monitor-items/i1/capture')).toHaveLength(0);
  });
});

describe('Following: same story and removed pages', () => {
  it('lists the copies of a story with how much of the wording is the same, and marks the original', async () => {
    const original = item({id: 'i1', copies: 1});
    const copy = item({id: 'i2', monitor_id: 'm2', copy_of: 'i1', similarity: 0.91, flags: [], edits: 0});
    mockApi({'GET /api/investigations/inv-1/following': following({at_risk: [original], same_story: [{original, copies: [copy]}]}),
      'GET /api/monitors/m1/versions': []});
    render(<QueryProvider><FollowingScreen investigationId="inv-1"/></QueryProvider>);
    const story = await screen.findByRole('region', {name: 'Same story'});
    expect(within(story).getByText('91%')).toBeVisible();
    expect(within(story).getByText('Fernhill Ltd · About page')).toBeVisible();
    expect(within(screen.getByRole('region', {name: 'Most at risk first'})).getByText('+1 copy')).toBeVisible();
  });

  it('offers Record removal, not Capture, for a page the site removed', async () => {
    const gone = item({flags: ['gone'], edits: 0, displayed: {http_status: 410, captured_at: '2026-10-12T08:00:00'},
      capture_blocked: 'Nothing to capture: the address answers 410 now.'});
    const api = mockApi({'GET /api/investigations/inv-1/following': following({at_risk: [gone]}), 'GET /api/monitors/m1/versions': [],
      'POST /api/monitor-items/i1/record': item({state: 'recorded'}), 'GET /api/investigations/inv-1/captures': [], 'GET /api/investigations/inv-1/drop': {}});
    render(<QueryProvider><FollowingScreen investigationId="inv-1"/></QueryProvider>);
    const queue = await screen.findByRole('region', {name: 'Most at risk first'});
    expect(await within(queue).findByText('Gone · 410')).toBeVisible();
    expect(within(queue).queryByRole('button', {name: 'Capture'})).toBeNull();
    await userEvent.click(within(queue).getByRole('button', {name: 'Record removal'}));
    await waitFor(() => expect(api.calls('POST /api/monitor-items/i1/record')).toHaveLength(1));
  });
});

describe('Reveal around a control', () => {
  it('gives the control itself the description, since it is the one that takes focus', () => {
    render(<Reveal tabbable={false} detail="Sent through the Tor running on this computer"><button type="button">Tor</button></Reveal>);
    expect(screen.getByRole('button', {name: 'Tor'})).toHaveAccessibleDescription('Sent through the Tor running on this computer');
  });
});
