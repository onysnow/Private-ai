// @vitest-environment jsdom
// Settings › Notifications, Outside lookups, AI and research and Connector keys (Settings
// panes mockup), and the top-band notice the Interrupt route raises.
import {act, cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {FOLD_MS, InterruptNotice} from '../features/inbox/interrupt-notice';
import {SavedQuestions} from '../features/ai/saved-questions';
import {KeysPane} from '../features/settings/keys-pane';
import {leavesShort, LookupsPane, shortSent, whatLeaves} from '../features/settings/lookups-pane';
import {NotificationsPane} from '../features/settings/notifications-pane';
import {ResearchPane} from '../features/settings/research-pane';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {LookupSourceOut} from '../lib/generated/types.gen';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/', useSearchParams: () => new URLSearchParams()}));

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1'});
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const KINDS = [
  {key: 'flag_textbook', label: 'Textbook Red Flag', default: 'interrupt', can_interrupt: true},
  {key: 'flag_strong', label: 'Strong Red Flag', default: 'needs', can_interrupt: false},
  {key: 'flag_faint', label: 'Faint Red Flag', default: 'else', can_interrupt: false},
];
const prefs = (routes: Record<string, string> = {}) => {
  const r = {flag_textbook: 'interrupt', flag_strong: 'needs', flag_faint: 'else', ...routes};
  return {routes: r, quiet_while_reading: true, desktop: false, kinds: KINDS.map(k => ({...k, route: r[k.key as keyof typeof r]})), backup_days: 14,
    outside: {email: {mode: 'off', address: ''}, phone: {mode: 'off', url: ''}, webpush: {mode: 'off'}},
    server: {email: false, webpush: false, webpush_key: null}, push_devices: 0};
};
const inbox = (extra: Record<string, unknown> = {}) => ({investigation_id: 'inv-1', interrupt: [], needs: [], else: [],
  week: {flag_textbook: 1, flag_strong: 2, flag_faint: 9}, quiet_while_reading: true, desktop: false, ...extra});

describe('Settings › Notifications', () => {
  it('replays last week with the routes on screen and saves a route as it is chosen', async () => {
    const api = mockApi({
      'GET /api/settings/notifications': prefs(),
      'PUT /api/settings/notifications': ({body}: {body: {routes: Record<string, string>}}) => prefs(body.routes),
      'GET /api/investigations/inv-1/inbox': inbox(),
      'GET /api/investigations/inv-1/watches': [],
    });
    render(<QueryProvider><NotificationsPane investigationId="inv-1" caseName="Kestrel SA"/></QueryProvider>);
    const bins = await screen.findByText('would have interrupted you');
    expect(bins.previousSibling).toHaveTextContent('1');
    expect(screen.getByText('in Everything else').previousSibling).toHaveTextContent('9');
    // Only what can mean danger is offered Interrupt.
    expect(within(screen.getByRole('radiogroup', {name: 'Faint Red Flag'})).queryByRole('radio', {name: /Interrupt/})).toBeNull();
    // A grid of dots, kinds × places: the place is named on the dot, the default too; no wall of words.
    expect(within(screen.getByRole('radiogroup', {name: 'Textbook Red Flag'})).getByRole('radio', {name: 'Interrupt (default)'})).toHaveAttribute('aria-checked', 'true');
    expect(within(screen.getByRole('radiogroup', {name: 'Strong Red Flag'})).getByRole('radio', {name: 'Needs you (default)'})).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('default')).toBeNull();

    await userEvent.setup().click(within(screen.getByRole('radiogroup', {name: 'Faint Red Flag'})).getByRole('radio', {name: 'Off'}));
    expect(api.lastBody('PUT /api/settings/notifications')).toMatchObject({routes: {flag_faint: 'off'}});
    expect(await screen.findByText('not shown')).toBeInTheDocument();
    expect(screen.getByText('not shown').previousSibling).toHaveTextContent('9');
  });
});

describe('Settings › Notifications › Outside the app', () => {
  it('says what the server cannot send, saves a phone address with its mode, and sends a test', async () => {
    const on = {...prefs(), outside: {...prefs().outside, phone: {mode: 'interrupts', url: 'ntfys://ntfy.example.org/desk'}}};
    const api = mockApi({
      'GET /api/settings/notifications': prefs(),
      'PUT /api/settings/notifications/channels/phone': on,
      'POST /api/settings/notifications/channels/phone/test': {channel: 'phone', sent: true},
      'PUT /api/settings/notifications': prefs(),
      'GET /api/investigations/inv-1/inbox': inbox(),
      'GET /api/investigations/inv-1/watches': [],
    });
    render(<QueryProvider><NotificationsPane investigationId="inv-1" caseName="Kestrel SA"/></QueryProvider>);
    // Plain words at rest; the server's setting name only on the reveal, for whoever sets up the server.
    const notSet = await screen.findAllByText('Not set up on this server');
    expect(notSet).toHaveLength(2);
    expect(notSet[0].closest('.rv')).toHaveAccessibleDescription(/NOTIFY_MAIL_URL/);
    expect(notSet[1].closest('.rv')).toHaveAccessibleDescription(/NOTIFY_PUSH_SUBJECT/);
    for (const el of screen.queryAllByText(/NOTIFY_/)) expect(el.closest('[hidden]')).not.toBeNull();
    expect(screen.queryByLabelText('Your email address')).toBeNull();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Your ntfy address'), 'ntfys://ntfy.example.org/desk');
    await user.click(within(screen.getByRole('radiogroup', {name: 'Phone: what it sends'})).getByRole('radio', {name: 'Textbook Red Flags'}));
    expect(api.lastBody('PUT /api/settings/notifications/channels/phone')).toEqual({mode: 'interrupts', address: null, url: 'ntfys://ntfy.example.org/desk'});
    await user.click(await screen.findByRole('button', {name: 'Send a test'}));
    expect(await screen.findByText(/Sent. If it does not arrive/)).toBeInTheDocument();

    await user.click(within(screen.getByRole('radiogroup', {name: 'Remind me to back up'})).getByRole('radio', {name: 'A month'}));
    expect(api.lastBody('PUT /api/settings/notifications')).toMatchObject({backup_days: 30});
  });
});

const source = (over: Partial<LookupSourceOut> = {}): LookupSourceOut => ({key: 'opensanctions', label: 'OpenSanctions', kind: 'sanctions lists',
  host: 'api.opensanctions.org', key_saved: true, default: 'ask', mode: 'ask', last: null, cases_this_month: 0, ...over});

describe('Settings › Outside lookups', () => {
  it('says in one sentence what leaves the computer', () => {
    expect(whatLeaves([source(), source({key: 'firecrawl', label: 'Firecrawl', host: 'api.firecrawl.dev', mode: 'off'})]))
      .toBe('Nothing leaves this computer for an outside lookup except: the name of a party you choose to OpenSanctions (api.opensanctions.org), when you say so.');
    expect(whatLeaves([source({mode: 'off'})])).toBe('Nothing leaves this computer for an outside lookup.');
    // At rest, a few words; the sentence above is revealed on them.
    expect(leavesShort([source(), source({key: 'aleph', label: 'OpenAleph', mode: 'ask'}), source({key: 'firecrawl', label: 'Firecrawl', mode: 'automatic'})]))
      .toBe('A party’s name, to OpenSanctions and OpenAleph, when you say so; to Firecrawl, as each new party joins.');
    expect(leavesShort([source({mode: 'off'})])).toBe('Nothing leaves for an outside lookup.');
  });

  it('names the site of an address it sent, the full address revealed', async () => {
    expect(shortSent('a request for https://www.malaymail.com/news/malaysia/2025/12/26/x')).toBe('a request for malaymail.com');
    expect(shortSent('Fernhill Ltd')).toBe('Fernhill Ltd');
    mockApi({'GET /api/settings/lookups': {sources: [source()], cases: [], can_change_defaults: true,
      week: [{id: 'w1', kind: 'download', service: 'web', destination: 'www.malaymail.com', sent: 'a request for https://www.malaymail.com/news/a-long-path', outcome: 'ok', case: 'Kestrel SA', at: '2026-10-19T10:00:00'}]},
    'GET /api/connectors': {providers: [], status: {}}});
    render(<QueryProvider><LookupsPane investigationId="" caseName="" providers={[]}/></QueryProvider>);
    expect((await screen.findByText('a request for malaymail.com')).closest('.rv')).toHaveAccessibleDescription(/https:\/\/www\.malaymail\.com\/news\/a-long-path/);
  });

  it('asks why before a case looks up differently', async () => {
    const looks = {sources: [source()], cases: [], week: [], can_change_defaults: true};
    const api = mockApi({
      'GET /api/settings/lookups': looks,
      'PUT /api/investigations/inv-1/lookups': {...looks, sources: [source({mode: 'off'})],
        cases: [{investigation_id: 'inv-1', name: 'Kestrel SA', modes: {opensanctions: 'off'}, reason: 'source protection', set_at: '2026-10-19T10:00:00'}]},
      'GET /api/connectors': {providers: [], status: {}},
    });
    render(<QueryProvider><LookupsPane investigationId="inv-1" caseName="Kestrel SA" providers={[]}/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Set this case’s own'}));
    await user.click(within(screen.getByRole('radiogroup', {name: 'OpenSanctions in this case'})).getByRole('radio', {name: 'Off'}));
    await user.click(screen.getByRole('button', {name: 'Save for this case'}));
    expect(await screen.findByText('Say in one line why this case looks up differently.')).toBeInTheDocument();
    expect(api.calls('PUT /api/investigations/inv-1/lookups')).toHaveLength(0);

    await user.type(screen.getByLabelText('Why this case is different'), 'source protection');
    await user.click(screen.getByRole('button', {name: 'Save for this case'}));
    expect(api.lastBody('PUT /api/investigations/inv-1/lookups')).toEqual({modes: {opensanctions: 'off'}, reason: 'source protection'});
    // The reason shows; when it was set is revealed on it.
    expect((await screen.findByText('“source protection”')).closest('.rv')).toHaveAccessibleDescription(/^Set /);
  });
});

describe('Settings › Connector keys', () => {
  it('says a refused key plainly and checks a pasted key before it is sent', async () => {
    const api = mockApi({
      'GET /api/settings/lookups': {sources: [
        source({last: {id: 'r1', provider: 'opensanctions', sent: 'Fernhill Ltd', is_party: true, investigation_id: 'inv-1', case: 'Kestrel SA', status: 'refused', results: 0, at: '2026-10-16T16:03:00'}}),
        source({key: 'aleph', label: 'OpenAleph', key_saved: false, host: 'aleph.example.org'}),
      ], cases: [], week: [], can_change_defaults: true},
      'PUT /api/settings/connectors/aleph/credential': {provider: 'aleph', configured: true},
    });
    render(<QueryProvider><KeysPane/></QueryProvider>);
    expect(await screen.findByText('! refused')).toBeInTheDocument();
    const aleph = screen.getByRole('region', {name: 'OpenAleph'});
    const user = userEvent.setup();
    await user.type(within(aleph).getByLabelText('Paste the key'), 'abc def');
    await user.click(within(aleph).getByRole('button', {name: 'Save the key'}));
    expect(await within(aleph).findByText(/There is a space or a line break inside it/)).toBeInTheDocument();
    expect(api.calls('PUT /api/settings/connectors/aleph/credential')).toHaveLength(0);

    await user.clear(within(aleph).getByLabelText('Paste the key'));
    await user.type(within(aleph).getByLabelText('Paste the key'), '  0123456789abcdef  ');
    await user.click(within(aleph).getByRole('button', {name: 'Save the key'}));
    expect(api.lastBody('PUT /api/settings/connectors/aleph/credential')).toEqual({credential: '0123456789abcdef'});
  });
});

describe('Settings › Connector keys › Check the key', () => {
  it('asks the source about the key and shows the answer', async () => {
    const before = {sources: [source()], cases: [], week: [], can_change_defaults: true};
    const after = {...before, sources: [source({key_check: {provider: 'opensanctions', state: 'refused', detail: 'The source refused the key (HTTP 401).', at: '2026-10-19T10:00:00'}})]};
    let checked = false;
    const api = mockApi({
      'GET /api/settings/lookups': () => (checked ? after : before),
      'POST /api/settings/connectors/opensanctions/check': () => { checked = true; return after.sources[0].key_check; },
    });
    render(<QueryProvider><KeysPane/></QueryProvider>);
    // A key's state is a colour; its word and what it means are revealed on it.
    expect(await screen.findByRole('img', {name: 'saved'})).toHaveAccessibleDescription(/^saved · Not used yet/);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Check the key'}));
    expect(api.calls('POST /api/settings/connectors/opensanctions/check')).toHaveLength(1);
    expect(await screen.findByText('! refused')).toBeInTheDocument();
    expect(screen.getByText(/the source refused this key/)).toBeInTheDocument();
  });
});

describe('Saved questions', () => {
  const research = (over: Record<string, unknown> = {}) => ({investigation_id: 'inv-1', mode: 'ask', default: 'ask', own: false, reason: null, ai_enabled: true,
    questions: [{id: 'q1', investigation_id: 'inv-1', module: 'case_synthesis', question: 'Who controlled Fernhill?', created_at: '2026-10-18T10:00:00'}], ...over});

  it('runs one now, and asks why before the case runs them without approval', async () => {
    const api = mockApi({
      'GET /api/investigations/inv-1/research': research(),
      'POST /api/saved-questions/q1/run': {...research().questions[0], last_run_id: 'j1', last_run_at: '2026-10-19T10:00:00'},
      'PUT /api/investigations/inv-1/research': research({mode: 'automatic', own: true, reason: 'daily leak drops'}),
      'GET /api/investigations/inv-1/ai-runs': {runs: []},
    });
    const onAsk = vi.fn();
    render(<QueryProvider><SavedQuestions investigationId="inv-1" onAsk={onAsk}/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Ask it'}));
    expect(onAsk).toHaveBeenCalledWith(expect.objectContaining({question: 'Who controlled Fernhill?'}));
    await user.click(screen.getByRole('button', {name: 'Run now'}));
    expect(api.calls('POST /api/saved-questions/q1/run')).toHaveLength(1);
    expect(await screen.findByText(/Running in the background/)).toBeInTheDocument();

    await user.click(within(screen.getByRole('radiogroup', {name: 'This case: research without asking'})).getByRole('radio', {name: 'Without approval'}));
    expect(screen.getByRole('button', {name: 'Save for this case'})).toBeDisabled();
    await user.type(screen.getByLabelText('Why this case does research differently'), 'daily leak drops');
    await user.click(screen.getByRole('button', {name: 'Save for this case'}));
    expect(api.lastBody('PUT /api/investigations/inv-1/research')).toEqual({mode: 'automatic', reason: 'daily leak drops'});
    expect(await screen.findByText(/This case’s own choice: “daily leak drops”/)).toBeInTheDocument();
  });
});

describe('Settings › AI and research', () => {
  it('asks why before new cases start with changed run settings', async () => {
    const research = {mode: 'ask', ai_enabled: true, model: 'qwen', defaults_reason: null, defaults_saved_at: null, locked: [{text: 'Citations must be in the packet', by: 'the citation check'}],
      cases: [], can_change_defaults: true, settings: [{key: 'devils_advocate', label: 'Devil’s advocate', group: 'Extra passes', help: 'h',
        suite_default: 'OFF', case_default: 'OFF', allowed: [{value: 'OFF', label: 'Off'}, {value: 'ON', label: 'On'}], source: 's', effect: 'prompt'}]};
    const api = mockApi({'GET /api/settings/research': research, 'PUT /api/settings/research': research});
    render(<QueryProvider><ResearchPane model={null} rules={null}/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(within(await screen.findByRole('radiogroup', {name: 'Devil’s advocate'})).getByRole('radio', {name: 'On'}));
    await user.click(screen.getByRole('button', {name: 'Save as the default for new cases'}));
    expect(await screen.findByText('Say in one line why new cases start with these settings.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Why new cases start this way'), 'contested cases');
    await user.click(screen.getByRole('button', {name: 'Save as the default for new cases'}));
    expect(api.lastBody('PUT /api/settings/research')).toMatchObject({options: {devils_advocate: 'ON'}, reason: 'contested cases'});

    await user.click(within(screen.getByRole('radiogroup', {name: 'Research without asking'})).getByRole('radio', {name: /^Off/}));
    expect(api.lastBody('PUT /api/settings/research')).toEqual({mode: 'off'});
  });
});

describe('The top-band notice', () => {
  const textbook = {key: 'f:f1', kind: 'flag_textbook', title: 'Textbook Red Flag: round trip', reason: 'Fernhill Ltd', href: '/act#red-flags',
    created_at: '2026-10-19T10:00:00', level: 'textbook', actor: 'Red Flags', actor_kind: 'app', route: 'interrupt'};

  it('shows an interrupt once, and never again on this computer', async () => {
    mockApi({'GET /api/investigations/inv-1/inbox': inbox({interrupt: [textbook], needs: [textbook]})});
    const {unmount} = render(<QueryProvider><InterruptNotice/></QueryProvider>);
    const alarm = await screen.findByRole('alert');
    expect(alarm).toHaveTextContent('Textbook Red Flag: round trip');
    await userEvent.setup().click(within(alarm).getByRole('button', {name: 'Dismiss'}));
    expect(screen.queryByRole('alert')).toBeNull();
    unmount();
    render(<QueryProvider><InterruptNotice/></QueryProvider>);
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('docks in a corner, folds to its mark by hand or after a while, and opens again from the mark', async () => {
    mockApi({'GET /api/investigations/inv-1/inbox': inbox({interrupt: [textbook], needs: [textbook]})});
    render(<QueryProvider><InterruptNotice/></QueryProvider>);
    const user = userEvent.setup();
    const alarm = await screen.findByRole('alert');
    await user.click(within(alarm).getByRole('button', {name: 'Fold to its mark'}));
    expect(screen.queryByRole('alert')).toBeNull();
    const mark = screen.getByRole('button', {name: 'Textbook Red Flag: round trip. Show the notice'});
    expect(mark).toHaveFocus();
    await user.click(mark);
    // Opened again by hand it is a plain region (it was announced once), with Open in focus and Dismiss beside it.
    const region = screen.getByRole('region', {name: 'Textbook Red Flag notice'});
    expect(within(region).getByRole('link', {name: 'Open'})).toHaveFocus();
    await user.click(within(region).getByRole('button', {name: 'Dismiss'}));
    expect(screen.queryByRole('region', {name: 'Textbook Red Flag notice'})).toBeNull();
    expect(screen.queryByRole('button', {name: /Show the notice/})).toBeNull();
  });

  it('folds by itself after a few seconds when nothing holds it open', async () => {
    mockApi({'GET /api/investigations/inv-1/inbox': inbox({interrupt: [textbook], needs: [textbook]})});
    vi.useFakeTimers({shouldAdvanceTime: true});
    render(<QueryProvider><InterruptNotice/></QueryProvider>);
    await screen.findByRole('alert');
    // The alert is found as soon as React puts it on the page; the effect that starts the fold
    // timer runs after that, on a task of its own. Let it run before moving the clock, or the
    // clock moves first and the timer starts after it (whether it had run was a matter of luck).
    await act(async () => {});
    try {
      act(() => { vi.advanceTimersByTime(FOLD_MS + 10); });
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('button', {name: /Show the notice/})).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it('waits while a calm zone is on screen', async () => {
    mockApi({'GET /api/investigations/inv-1/inbox': inbox({interrupt: [textbook], needs: [textbook]})});
    const zone = document.createElement('div');
    zone.setAttribute('data-calm-zone', '');
    document.body.appendChild(zone);
    render(<QueryProvider><InterruptNotice/></QueryProvider>);
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(screen.queryByRole('alert')).toBeNull();
    zone.remove();
    expect(await screen.findByRole('alert', {}, {timeout: 3000})).toHaveTextContent('round trip');
  });

  it('is not held by a calm zone kept mounted behind a hidden wrapper', async () => {
    mockApi({'GET /api/investigations/inv-1/inbox': inbox({interrupt: [textbook], needs: [textbook]})});
    const wrap = document.createElement('div');
    wrap.hidden = true;
    const zone = document.createElement('div');
    zone.setAttribute('data-calm-zone', '');
    wrap.appendChild(zone);
    document.body.appendChild(wrap);
    render(<QueryProvider><InterruptNotice/></QueryProvider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('round trip');
    wrap.remove();
  });

  it('drops the notice when another case is opened', async () => {
    mockApi({'GET /api/investigations/inv-1/inbox': inbox({interrupt: [textbook], needs: [textbook]}),
      'GET /api/investigations/inv-2/inbox': inbox({investigation_id: 'inv-2'})});
    render(<QueryProvider><InterruptNotice/></QueryProvider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('round trip');
    act(() => { useWorkbenchStore.setState({investigationId: 'inv-2'}); });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hears a snooze made in another part of the app', async () => {
    const {useSnoozed} = await import('../features/inbox/inbox');
    let snooze: (id: string, ms: number) => void = () => undefined;
    function Snoozer(): null { snooze = useSnoozed()[1]; return null; }
    mockApi({'GET /api/investigations/inv-1/inbox': inbox({interrupt: [textbook], needs: [textbook]})});
    const zone = document.createElement('div');
    zone.setAttribute('data-calm-zone', '');
    document.body.appendChild(zone);
    render(<QueryProvider><Snoozer/><InterruptNotice/></QueryProvider>);
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    act(() => { snooze('f:f1', 60_000); });
    zone.remove();
    await act(async () => { await new Promise(r => setTimeout(r, 2500)); });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('(control) without the snooze the same notice does show', async () => {
    mockApi({'GET /api/investigations/inv-1/inbox': inbox({interrupt: [textbook], needs: [textbook]})});
    const zone = document.createElement('div');
    zone.setAttribute('data-calm-zone', '');
    document.body.appendChild(zone);
    render(<QueryProvider><InterruptNotice/></QueryProvider>);
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    zone.remove();
    await act(async () => { await new Promise(r => setTimeout(r, 2500)); });
    expect(screen.queryByRole('alert')).not.toBeNull();
  });
});
