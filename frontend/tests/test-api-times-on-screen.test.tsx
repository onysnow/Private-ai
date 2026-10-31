// @vitest-environment jsdom
// Times from the API are UTC, mostly without an offset (lib/timestamps.ts). A screen that reads one with a bare
// new Date() shows it hours off anywhere but UTC: the Drop's history and "Since", the story's versions and
// "saved", Red Flags' "first seen", Money's "last run" did. They read it through apiTime now.
import {readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';

import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';

import {TheDrop} from '../features/the-drop/the-drop';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {validSettingsStatus} from '../test-support/page-routes';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/bring-in', useSearchParams: () => new URLSearchParams()}));

const zone = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/New_York'; });   // UTC-4 in October
afterAll(() => { process.env.TZ = zone; });
beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); useWorkbenchStore.setState({investigationId: 'inv-1', document: null}); });
afterEach(() => cleanup());

const root = path.resolve(__dirname, '..');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'generated' ? [] : sources(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('API times on screen', () => {
  it('no screen reads an API time with a bare new Date() or its own offset test', () => {
    const bare = /new Date\((?:[\w!?]+\.)*\w+_at\)|new Date\(iso\)|endsWith\('Z'\)/;
    const found = ['features', 'components', 'app'].flatMap(d => sources(path.join(root, d)))
      .flatMap(file => readFileSync(file, 'utf8').split('\n').map((line, i) => bare.test(line) ? `${path.relative(root, file)}:${i + 1}` : null))
      .filter(Boolean);
    expect(found).toEqual([]);
  });

  it("shows a drop's time in the reader's own time", async () => {
    const stages = [['received', 'Received'], ['checked', 'Checked'], ['read', 'Read']].map(([key, label]) => ({key, label}));
    const drop = {investigation_id: 'inv-1', stages, ready_for_you: {}, ready_from: 0, ready_unsure: 0,
      lanes: [{document_id: 'd1', filename: 'minutes.pdf', problem: false, in_progress: false, issues: [],
        stages: stages.map(s => ({...s, state: 'done', detail: ''})),
        receipt: {fingerprint: 'ab'.repeat(32), pages: 1, how_read: 'text', passages: 3, proposals: {}, waiting: {}, watchlist_hits: 0, flags_fed: [], files_inside: 0}}],
      totals: {files: 1, files_inside: 0, read: 1, unread: 0, problems: 0, passages: 3, waiting: 0, by_stage: {}}};
    mockApi({'GET /api/settings/status': validSettingsStatus, 'GET /api/investigations/inv-1/drop': drop,
      'GET /api/investigations/inv-1/drop/history': {investigation_id: 'inv-1', drops: [{id: 'b1', batch_id: 'b1', label: 'minutes.pdf',
        created_at: '2026-10-14T02:30:00', one_at_a_time: false, document_ids: ['d1'], files: 1, duplicates: 0, refused: 0, read: 1, problems: 0,
        in_progress: 0, files_inside: 0, passages: 3, proposals: {}, accepted: 0, waiting: 0}]}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    await screen.findByRole('grid');
    await userEvent.setup().click(screen.getByRole('button', {name: 'History'}));
    const history = await screen.findByRole('list', {name: 'Every drop, newest first'});
    // 02:30 UTC on the 14th is 22:30 on the 13th in New York.
    expect(within(history).getByText('13 Oct 2026, 22:30')).toBeInTheDocument();
  });
});
