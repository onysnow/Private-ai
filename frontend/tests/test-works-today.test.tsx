// @vitest-environment jsdom
// Does it work today? (mockup WORKS_1): each platform today in shape and word, the last 14 days, the broken one in
// detail with what still works; the daily check off until turned on; Check all now.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {WorksToday} from '../features/following/works-today';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {PlatformChecksOut, PlatformOut} from '../lib/generated/types.gen';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const days = (last: PlatformOut['state'], n = 14) => Array.from({length: n}, (_, i) => ({day: `2026-10-${String(16 + i).padStart(2, '0')}`, state: i === n - 1 ? last : 'works' as const}));
const platform = (key: string, name: string, state: PlatformOut['state'], extra: Partial<PlatformOut> = {}): PlatformOut => ({
  key, name, route: 'video · yt-dlp', saves: 'video, title', test_url: `https://${key}.example/t`, shipped_url: `https://${key}.example/t`,
  state, detail: state === 'broken' ? 'A login wall came back instead of the post' : 'Saved as expected', missing: [], seconds: 2.1,
  checked_at: '2026-10-29T06:10:00', broken_since: null, days: days(state), ...extra});
const DATA: PlatformChecksOut = {daily: false, warn: true, last_checked_at: '2026-10-29T06:10:00', working: 1, checked: 2, platforms: [
  platform('youtube', 'YouTube', 'works'),
  platform('instagram', 'Instagram', 'broken', {route: 'post · page capture', saves: 'the post’s picture and caption', missing: ['the post'], broken_since: '2026-10-26T06:10:00'}),
  platform('vimeo', 'Vimeo', null, {days: days(null).map(d => ({...d, state: null}))}),
]};

beforeEach(() => connectGeneratedClient(new ApiClient('http://api.test')));
afterEach(() => cleanup());

describe('Does it work today?', () => {
  it('shows each platform in words, the broken one first in detail, and turns the daily check on', async () => {
    const api = mockApi({'GET /api/platform-checks': DATA, 'PATCH /api/platform-checks': {...DATA, daily: true},
      'POST /api/platform-checks/run': {status: 202, body: {id: 'j1', kind: 'check_platforms', status: 'queued', progress: null, message: 'Waiting', attempts: 0, error: null, finished: false, finished_at: null,
      investigation_id: null, runner: 'inline', started_at: null, subject_id: 'all', subject_type: 'platforms', created_at: '2026-10-29T06:10:00', updated_at: '2026-10-29T06:10:00'}}});
    render(<QueryProvider><WorksToday/></QueryProvider>);
    const list = await screen.findByRole('region', {name: 'Platforms'});
    expect(within(list).getByRole('button', {name: 'YouTube: ✓ works'})).toBeInTheDocument();
    expect(within(list).getByRole('button', {name: 'Instagram: ✕ broken'})).toHaveTextContent('A login wall came back instead of the post');
    expect(within(list).getByRole('button', {name: 'Vimeo: not checked'})).toBeInTheDocument();
    const detail = screen.getByRole('region', {name: 'Instagram in detail'});
    expect(detail).toHaveTextContent('broken since 2026-10-26');
    expect(detail).toHaveTextContent('What still works: paste the link');
    const user = userEvent.setup();
    await user.click(within(screen.getByRole('region', {name: 'What leaves this computer'})).getByRole('checkbox', {name: 'Check once a day'}));
    await waitFor(() => expect(api.calls('PATCH /api/platform-checks')[0]?.body).toEqual({daily: true}));
    await user.click(screen.getByRole('button', {name: 'Check all now'}));
    await waitFor(() => expect(api.calls('POST /api/platform-checks/run')).toHaveLength(1));
    expect(await screen.findByText('Trying every platform now, one request each, logged.')).toBeInTheDocument();
  });
});
