// @vitest-environment jsdom
// Keep › Safety & data (mockup KNOWLEDGE_KEEP_2): the totals with zeroes stated, the six places and the services with
// their state in a word, the log word for word with its filters and CSV, the cards that point at the other tabs.
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {ago, bytesInWords, logCsv, SafetyScreen} from '../features/safety/safety-screen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const row = (id: string, service: string, value: string, extra: Record<string, unknown> = {}) => ({
  id, at: '2026-10-22T10:42:00', service, service_name: service === 'opensanctions' ? 'OpenSanctions' : service === 'firecrawl' ? 'Firecrawl' : 'AI', kind: 'search text',
  value, reason: 'A search you ran', actor: 'you', leaves_computer: true, outcome: 'sent', source: null, ...extra,
});
const PAGE = (over: Record<string, unknown> = {}) => ({
  period: '7d', totals: {requests_left: 2, services_reached: 1, documents_sent_out: 0, ai_calls_outside: 0},
  exposure: 'This case has sent 2 items to 1 service (OpenSanctions) and 0 requests to an outside AI.',
  stores: [
    {id: 'records', name: 'Case records', count: 4812, count_note: '37 claims · 12 pieces of evidence', where: 'Database on this machine', in_backups: true},
    {id: 'documents', name: 'Documents & pictures', count: 86, bytes: 1_400_000_000, where: 'Kept as received, checksummed', in_backups: true},
    {id: 'backups', name: 'Backups', count: 0, where: 'Wherever you saved the file', in_backups: null, warning: 'Not encrypted: keep it safe'},
    {id: 'keys', name: 'Service keys', count: 2, count_note: 'of 3 set', where: 'Stored here, never shown again', in_backups: false},
    {id: 'log', name: 'Security log', count: 1204, where: 'Who asked what, never the content', in_backups: false},
    {id: 'ai', name: 'Private AI', count: null, where: 'Off', in_backups: null},
  ],
  services: [
    {id: 'opensanctions', name: 'OpenSanctions', about: 'Sanctions lists', state: 'on_request', state_note: 'Only when you press it', sent_count: 2, sends: ['search text'], where: 'outside'},
    {id: 'firecrawl', name: 'Firecrawl', about: 'Web search', state: 'off', state_note: 'No key stored: nothing can be sent', sent_count: 0, sends: [], where: 'outside'},
    {id: 'openaleph', name: 'OpenAleph', about: 'Reads your documents', state: 'off', state_note: 'Not connected to this case', sent_count: 0, sends: [], where: 'inside'},
  ],
  backup: {last_backup_at: null, encrypted: false, restore_enabled: false}, access: {mode: 'local_only', refused_24h: 0, log_readable: true},
  housekeeping: {stray_files: 2, stray_bytes: 4_100_000},
  outbound: [row('a', 'opensanctions', 'Harbour Nominees Ltd'), row('b', 'opensanctions', '“M. Ross”', {outcome: 'failed', actor: 'automatic'})], outbound_total: 2, ...over,
});
const wrap = (ui: ReactElement) => render(<QueryProvider>{ui}</QueryProvider>);
const show = (over: Record<string, unknown> = {}) => {
  const api = mockApi({'GET /api/investigations/inv-1/safety-data': ({url}: {url: URL}) => PAGE({period: url.searchParams.get('period'), ...over})});
  wrap(<SafetyScreen investigationId="inv-1" caseName="Harbour land"/>);
  return api;
};

beforeEach(() => connectGeneratedClient(new ApiClient('http://api.test')));
afterEach(() => cleanup());

describe('the helpers', () => {
  it('says how long ago in words, and sizes in plain units', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    expect([ago(null, now), ago('2026-10-23T01:00:00Z', now), ago('2026-10-22T01:00:00Z', now), ago('2026-10-20T01:00:00Z', now)]).toEqual(['never', 'today', 'yesterday', '3 days ago']);
    expect([bytesInWords(900), bytesInWords(4_100_000), bytesInWords(1_400_000_000)]).toEqual(['900 B', '4.1 MB', '1.4 GB']);
  });
  it('writes the log as CSV with quotes doubled', () => {
    const csv = logCsv([row('a', 'opensanctions', 'say "hi"') as never]);
    expect(csv.split('\n')[0]).toContain('"value sent"');
    expect(csv).toContain('"say ""hi"""');
  });
});

describe('Safety & data', () => {
  it('states the totals, the six places and each service with its state', async () => {
    show();
    expect(await screen.findByText(/What lives on/)).toBeTruthy();
    const tiles = within(document.querySelector('.sd-tiles') as HTMLElement);
    expect(tiles.getByText('requests left this computer').nextSibling?.textContent).toBe('2');
    expect(tiles.getByText('documents sent out').nextSibling?.textContent).toBe('0');
    const stores = within(document.querySelector('.sd-stores') as HTMLElement);
    expect(stores.getByText('4,812 records · 37 claims · 12 pieces of evidence')).toBeTruthy();
    expect(stores.getByText('86 files · 1.4 GB')).toBeTruthy();
    expect(stores.getByText('▲ Not encrypted: keep it safe')).toBeTruthy();
    // The screen-reader twin of the diagram says the same in a table.
    expect(within(screen.getByRole('table', {hidden: true})).getAllByRole('row', {hidden: true}).length).toBeGreaterThan(8);
    expect(screen.getByRole('button', {name: /OpenSanctions: ON REQUEST/})).toBeTruthy();
    expect(screen.getByRole('button', {name: /Firecrawl: OFF/})).toBeTruthy();
    expect(screen.getByText('↗ 2 left in this period')).toBeTruthy();
  });

  it('shows the log word for word, with how it was started and a failed request saying so', async () => {
    show();
    const log = await screen.findByRole('list', {name: 'Requests, newest first'});
    expect(within(log).getByText('Harbour Nominees Ltd')).toBeTruthy();
    expect(within(log).getByText(/automatic · ✕ failed on the way/)).toBeTruthy();
  });

  it('asks the server again for another period, and filters the log to a service', async () => {
    const api = show();
    await screen.findByText(/What lives on/);
    fireEvent.click(screen.getByRole('button', {name: '30 days'}));
    await screen.findByText(/What lives on/);
    expect(api.lastUrl('GET /api/investigations/inv-1/safety-data').searchParams.get('period')).toBe('30d');
    fireEvent.click(screen.getByRole('button', {name: /Firecrawl: OFF/}));
    expect(await screen.findByText('Nothing has been sent to that service in this period.')).toBeTruthy();
  });

  it('points the cards at the tabs that do the work', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', {name: 'Back up now'}));
    expect(window.location.hash).toBe('#backup-restore');
    fireEvent.click(screen.getByRole('button', {name: 'Preview deletion'}));
    expect(window.location.hash).toBe('#deletion');
    expect(screen.getByText('2 stray files')).toBeTruthy();
    expect(screen.getByText('No backup made from here yet')).toBeTruthy();
  });

  it('says plainly when the server cannot be reached', async () => {
    mockApi({'GET /api/investigations/inv-1/safety-data': {status: 500, body: {detail: 'broken'}}});
    wrap(<SafetyScreen investigationId="inv-1"/>);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
