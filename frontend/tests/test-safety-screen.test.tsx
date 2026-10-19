// @vitest-environment jsdom
// Keep › Safety & data (mockup KEEP-safety-and-data; features/safety/*; ADR-0015): the totals, the six stores and the
// services with their modes and lines, the outbound log word for word with its filters and CSV export, the four
// Keep cards and where their buttons go. What the app does not log says so instead of showing a zero.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';

import {SafetyScreen} from '../features/safety/safety-screen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {mockApi} from '../test-support/mock-api';

const INV = 'inv-1';
const NOW = '2026-10-10T11:00:00';

const service = (over: Record<string, unknown>) => ({key: 'opensanctions', label: 'OpenSanctions', role: 'Sanctions and officials', host: 'https://api.opensanctions.org', mode: 'on_click',
  why: 'Sends only when you start a lookup.', sent: 8, sends: ['name and details'], last: '2026-10-10T10:00:00', counted: true, ...over});
const reply = (over: Record<string, unknown> = {}) => ({
  investigation: {id: INV, name: 'Harbour land'}, period: '7d', now: NOW,
  totals: {requests_left: 39, services_reached: 3, documents_sent_out: 0, ai_calls_outside: 0},
  stores: {
    case_records: {records: 4812, claims: 37, in_backups: true}, documents: {files: 86, bytes: 1_400_000_000, in_backups: true},
    backups: {count: 1, last: '2026-10-07T09:00:00', encrypted: false}, service_keys: {set: 2, total: 3},
    security_log: {events: 1204, since: '2026-07-11T08:00:00+00:00', bytes: 640_000},
    private_ai: {enabled: true, provider: 'ollama', model: 'qwen2.5', on_this_computer: true, remote_allowed: false},
  },
  services: [
    service({key: 'aleph', label: 'Aleph', role: 'Investigative archive (OCCRP)', host: 'https://aleph.occrp.org', sent: 31, sends: ['search words']}),
    service({}),
    service({key: 'openaleph', label: 'OpenAleph', role: 'Search across the case’s documents', host: 'http://127.0.0.1:8001', mode: 'off', why: 'Not connected to this case.', sent: 0, sends: [], last: null}),
    service({key: 'ai', label: 'Outside AI services', role: '', host: 'ollama', mode: 'blocked', why: 'Not allowed on this server.', sent: 0, sends: [], last: null}),
  ],
  cards: {backup: {last: '2026-10-07T09:00:00', size_bytes: 1_400_000_000, sha256: 'a'.repeat(64), with_documents: true, records: 4812, documents: 86},
    access: {refused_24h: 0}, housekeeping: {stray_files: 2, stray_bytes: 4_100_000}, delete: {records: 4812, files: 86, shared_files: 0}},
  not_counted: ['Traffic to OpenAleph, the watchlist check and the corpus push are not logged yet.'],
  ...over,
});
const entry = (id: string, service: string, value: string, over: Record<string, unknown> = {}) => ({id, at: '2026-10-10T10:42:00', service, destination: 'https://x.example', local: false,
  value_sent: value, value_kind: 'search words', reason: 'lookup', actor: 'you clicked', status: 'sent', error: null, run_id: null, detail: null, ...over});
const log = (entries: ReturnType<typeof entry>[], total = entries.length) => ({period: '7d', service: null, total, entries});

function renderScreen() {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  return render(<QueryClientProvider client={client}><SafetyScreen investigationId={INV}/></QueryClientProvider>);
}

beforeAll(() => { process.env.TZ = 'UTC'; });
beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); window.location.hash = ''; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); delete (URL as unknown as {createObjectURL?: unknown}).createObjectURL; delete (URL as unknown as {revokeObjectURL?: unknown}).revokeObjectURL; });

describe('what lives where', () => {
  it('shows the totals and the six stores from what the app stores', async () => {
    mockApi({[`GET /api/investigations/${INV}/safety-and-data`]: reply(), [`GET /api/investigations/${INV}/outbound-log`]: log([])});
    renderScreen();
    expect(await screen.findByText('requests left this computer')).toBeInTheDocument();
    const totals = screen.getByText('requests left this computer').closest('dl')!;
    expect(within(totals).getByText('39')).toBeInTheDocument();
    expect(screen.getByText('4,812 records · 37 claims')).toBeInTheDocument();
    expect(screen.getByText('86 files · 1.4 GB')).toBeInTheDocument();
    expect(screen.getByText(/1 made · last 7 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByText('Not encrypted: keep it safe')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 set')).toBeInTheDocument();
    expect(screen.getByText(/1,204 events · since 11 Jul 2026/)).toBeInTheDocument();
    expect(screen.getByText('Local model')).toBeInTheDocument();
  });

  it('puts a word beside each service mode and says what each line carries', async () => {
    mockApi({[`GET /api/investigations/${INV}/safety-and-data`]: reply(), [`GET /api/investigations/${INV}/outbound-log`]: log([])});
    renderScreen();
    await screen.findByText('requests left this computer');
    const list = screen.getByRole('list', {name: 'Outside services the case can reach'});
    expect(within(list).getAllByText('ON CLICK')).toHaveLength(2);
    expect(within(list).getByText('OFF')).toBeInTheDocument();
    expect(within(list).getByText('BLOCKED')).toBeInTheDocument();
    expect(screen.getByText('search words · 31')).toBeInTheDocument();
    expect(screen.getByText('name and details · 8')).toBeInTheDocument();
    expect(screen.getByText('nothing (off)')).toBeInTheDocument();
    expect(screen.getByText('✕ blocked')).toBeInTheDocument();
  });

  it('never shows a zero for a service whose traffic is not logged', async () => {
    mockApi({[`GET /api/investigations/${INV}/safety-and-data`]: reply({services: [service({key: 'openaleph', label: 'OpenAleph', mode: 'automatic', counted: false, sent: 0, sends: []})]}),
      [`GET /api/investigations/${INV}/outbound-log`]: log([])});
    renderScreen();
    expect(await screen.findByText('not counted yet')).toBeInTheDocument();
  });

  it('asks for the same figures over another period when you switch it', async () => {
    const api = mockApi({[`GET /api/investigations/${INV}/safety-and-data`]: reply(), [`GET /api/investigations/${INV}/outbound-log`]: log([])});
    renderScreen();
    await screen.findByText('requests left this computer');
    expect(api.lastUrl(`GET /api/investigations/${INV}/safety-and-data`).searchParams.get('period')).toBe('7d');
    await userEvent.click(screen.getByRole('button', {name: '30 days'}));
    await waitFor(() => expect(api.lastUrl(`GET /api/investigations/${INV}/safety-and-data`).searchParams.get('period')).toBe('30d'));
    expect(screen.getByRole('button', {name: '30 days'})).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(api.lastUrl(`GET /api/investigations/${INV}/outbound-log`).searchParams.get('period')).toBe('30d'));
  });

  it('lists a service’s last requests when you point at it', async () => {
    mockApi({[`GET /api/investigations/${INV}/safety-and-data`]: reply(), [`GET /api/investigations/${INV}/outbound-log`]: log([entry('e1', 'aleph', '14 Quay Street, Douglas')])});
    renderScreen();
    const card = (await screen.findByRole('listitem', {name: /Aleph, ON CLICK/}));
    expect(within(card).getByRole('tooltip')).toHaveTextContent('14 Quay Street, Douglas');
  });
});

describe('the outbound log', () => {
  it('shows what left, word for word, with the kind, the reason and who started it', async () => {
    mockApi({[`GET /api/investigations/${INV}/safety-and-data`]: reply(), [`GET /api/investigations/${INV}/outbound-log`]: log([
      entry('e1', 'opensanctions', 'M. Ross', {value_kind: 'name and details', reason: 'enrich'}),
      entry('e2', 'aleph', 'Harbour Nominees Ltd', {at: '2026-10-08T09:00:00'}),
    ])});
    renderScreen();
    const list = await screen.findByRole('list', {name: /Requests that left this computer, newest first/});
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('10:42')).toBeInTheDocument();
    expect(within(rows[0]).getByText('M. Ross')).toBeInTheDocument();
    expect(within(rows[0]).getByText('name and details · enrich · you clicked')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Thu')).toBeInTheDocument();
  });

  it('marks a failed request as possibly arrived', async () => {
    mockApi({[`GET /api/investigations/${INV}/safety-and-data`]: reply(), [`GET /api/investigations/${INV}/outbound-log`]: log([entry('e1', 'aleph', 'Kestrel SA', {status: 'failed'})])});
    renderScreen();
    expect(await screen.findByText(/failed, it may still have arrived/)).toBeInTheDocument();
  });

  it('says plainly when nothing has left, and what is not logged', async () => {
    mockApi({[`GET /api/investigations/${INV}/safety-and-data`]: reply(), [`GET /api/investigations/${INV}/outbound-log`]: log([])});
    renderScreen();
    expect(await screen.findByText(/Nothing has left this computer in this period/)).toBeInTheDocument();
    expect(screen.getByText(/Not logged yet: Traffic to OpenAleph/)).toBeInTheDocument();
  });

  it('filters by service', async () => {
    const api = mockApi({[`GET /api/investigations/${INV}/safety-and-data`]: reply(), [`GET /api/investigations/${INV}/outbound-log`]: log([])});
    renderScreen();
    const select = await screen.findByRole('combobox', {name: 'Show requests to'});
    await userEvent.selectOptions(select, 'aleph');
    await waitFor(() => expect(api.lastUrl(`GET /api/investigations/${INV}/outbound-log`).searchParams.get('service')).toBe('aleph'));
    expect(within(select).queryByRole('option', {name: 'OpenAleph'})).toBeInTheDocument();
  });

  it('exports the whole log as a CSV file', async () => {
    const api = mockApi({[`GET /api/investigations/${INV}/safety-and-data`]: reply(), [`GET /api/investigations/${INV}/outbound-log`]: log([]),
      [`GET /api/investigations/${INV}/outbound-log.csv`]: new Response('time_utc,service\n', {headers: {'content-type': 'text/csv'}})});
    const createObjectURL = vi.fn(() => 'blob:csv');
    (URL as unknown as {createObjectURL: unknown}).createObjectURL = createObjectURL;
    (URL as unknown as {revokeObjectURL: unknown}).revokeObjectURL = vi.fn();
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
    renderScreen();
    await userEvent.click(await screen.findByRole('button', {name: 'Export log'}));
    await waitFor(() => expect(downloads).toEqual(['Harbour_land-outbound-log.csv']));
    expect(api.lastUrl(`GET /api/investigations/${INV}/outbound-log.csv`).searchParams.get('period')).toBe('all');
    expect(await screen.findByText('Log saved as a CSV file.')).toBeInTheDocument();
  });
});

describe('the Keep cards', () => {
  it('shows the last backup, the refusals, the stray files and what a deletion would remove', async () => {
    mockApi({[`GET /api/investigations/${INV}/safety-and-data`]: reply(), [`GET /api/investigations/${INV}/outbound-log`]: log([])});
    renderScreen();
    expect(await screen.findByText('Last backup 3 days ago')).toBeInTheDocument();
    expect(screen.getByText('1.4 GB · ✓ checksum')).toBeInTheDocument();
    expect(screen.getByText('0 refused · 24 h')).toBeInTheDocument();
    expect(screen.getByText('2 stray files')).toBeInTheDocument();
    expect(screen.getByText(/See what goes first: 4,812 records, 86 files\./)).toBeInTheDocument();
  });

  it('says so when no backup has been made', async () => {
    mockApi({[`GET /api/investigations/${INV}/safety-and-data`]: reply({cards: {...reply().cards, backup: {last: null, size_bytes: null, sha256: null, with_documents: null, records: null, documents: null}}}),
      [`GET /api/investigations/${INV}/outbound-log`]: log([])});
    renderScreen();
    expect(await screen.findByText('No backup made yet')).toBeInTheDocument();
  });

  it('takes you to the part of Keep that does the work', async () => {
    mockApi({[`GET /api/investigations/${INV}/safety-and-data`]: reply(), [`GET /api/investigations/${INV}/outbound-log`]: log([])});
    renderScreen();
    await userEvent.click(await screen.findByRole('button', {name: 'Restore…'}));
    expect(window.location.hash).toBe('#backup-restore');
    await userEvent.click(screen.getByRole('button', {name: 'Preview deletion'}));
    expect(window.location.hash).toBe('#deletion');
    await userEvent.click(screen.getByRole('button', {name: 'Access settings'}));
    expect(window.location.hash).toBe('#access');
  });

  it('makes a backup file here and reads the record again', async () => {
    const api = mockApi({[`GET /api/investigations/${INV}/safety-and-data`]: reply(), [`GET /api/investigations/${INV}/outbound-log`]: log([]),
      [`GET /api/investigations/${INV}/export`]: new Response('zip', {headers: {'content-type': 'application/zip'}})});
    (URL as unknown as {createObjectURL: unknown}).createObjectURL = vi.fn(() => 'blob:zip');
    (URL as unknown as {revokeObjectURL: unknown}).revokeObjectURL = vi.fn();
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
    renderScreen();
    await userEvent.click(await screen.findByRole('button', {name: 'Back up now'}));
    await waitFor(() => expect(downloads).toEqual(['investigation-inv-1.jwbackup.zip']));
    expect(api.lastUrl(`GET /api/investigations/${INV}/export`).searchParams.get('include_documents')).toBe('true');
    await waitFor(() => expect(api.calls(`GET /api/investigations/${INV}/safety-and-data`).length).toBeGreaterThanOrEqual(2));
    expect(screen.getByText(/Keep it somewhere safe: it is not encrypted/)).toBeInTheDocument();
  });
});

describe('states', () => {
  it('asks you to open a case when none is open', () => {
    mockApi({});
    render(<QueryClientProvider client={new QueryClient()}><SafetyScreen investigationId=""/></QueryClientProvider>);
    expect(screen.getByText(/Open a case to see what lives on this computer/)).toBeInTheDocument();
  });

  it('says it could not read the figures and lets you try again', async () => {
    const api = mockApi({[`GET /api/investigations/${INV}/safety-and-data`]: {status: 500, body: {detail: 'boom'}}, [`GET /api/investigations/${INV}/outbound-log`]: log([])});
    renderScreen();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be read/);
    api.add({[`GET /api/investigations/${INV}/safety-and-data`]: reply()});
    await userEvent.click(screen.getByRole('button', {name: 'Try again'}));
    expect(await screen.findByText('requests left this computer')).toBeInTheDocument();
  });
});
