// @vitest-environment jsdom
// The Drop: lanes of seven stages, the read receipt, the problems filter (F), and Ready for you.
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {TheDrop, boxDetail, problemsFirst} from '../features/the-drop/the-drop';
import {validSettingsStatus} from '../test-support/page-routes';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/bring-in', useSearchParams: () => new URLSearchParams()}));

const STAGES = [['received', 'Received'], ['checked', 'Checked'], ['read', 'Read'], ['passages', 'Split into passages'], ['inside', 'Files inside'],
  ['names', 'Names & facts'], ['ready', 'Ready for you']] as const;
const lane = (id: string, filename: string, states: string[], extra: Record<string, unknown> = {}) => ({
  document_id: id, filename, problem: states.includes('stopped'), in_progress: states.some(s => s === 'active' || s === 'waiting'), issues: [],
  stages: STAGES.map(([key, label], i) => ({key, label, state: states[i], detail: states[i] === 'stopped' ? 'The file is damaged' : ''})),
  receipt: {fingerprint: 'ab'.repeat(32), pages: 4, how_read: 'OCR', passages: 12, proposals: {entity: 3}, waiting: {entity: 2}, watchlist_hits: 1, flags_fed: ['BO-001'], files_inside: 0},
  ...extra,
});
const SETTINGS = {'GET /api/settings/status': validSettingsStatus};
const laneButtons = (line: HTMLElement) => Array.from(line.querySelectorAll<HTMLButtonElement>('.dp-lane > button'));
const drop = {
  investigation_id: 'inv-1', stages: STAGES.map(([key, label]) => ({key, label})),
  lanes: [lane('d1', 'minutes.pdf', ['done', 'done', 'done', 'done', 'skipped', 'done', 'needs_you']),
    lane('d2', 'broken.pdf', ['done', 'done', 'stopped', 'stopped', 'skipped', 'waiting', 'waiting'])],
  totals: {files: 2, files_inside: 0, read: 1, unread: 0, problems: 1, passages: 12, waiting: 2, by_stage: {received: 2, checked: 2, read: 1}},
  ready_for_you: {entity: 2}, ready_from: 1, ready_unsure: 1,
};

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); useWorkbenchStore.setState({investigationId: 'inv-1', document: null}); });
afterEach(() => cleanup());

describe('The Drop', () => {
  it('shows each file as a lane of stages, problems first, with its read receipt', async () => {
    mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': drop});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const line = await screen.findByRole('region', {name: 'Digestion line'});
    const lanes = laneButtons(line);
    expect(lanes[0]).toHaveAccessibleName(/^broken\.pdf: .*Read stopped/);
    expect(lanes[1]).toHaveAccessibleName(/Ready for you needs you$/);
    const receipt = screen.getByRole('region', {name: 'Read receipt: broken.pdf'});
    expect(within(receipt).getByText('✕ Not read')).toBeInTheDocument();
    expect(within(screen.getByRole('region', {name: 'Problems first'})).getByRole('button', {name: /broken\.pdf/})).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(lanes[1]);
    const minutes = screen.getByRole('region', {name: 'Read receipt: minutes.pdf'});
    expect(within(minutes).getByText(/3 names/)).toBeInTheDocument();
    await user.click(within(minutes).getByRole('button', {name: 'Open in reading room'}));
    expect(useWorkbenchStore.getState().document).toMatchObject({documentId: 'd1'});
    const ready = screen.getByRole('region', {name: 'Ready for you'});
    expect(within(ready).getByRole('link', {name: '2 names proposed'})).toBeInTheDocument();
    expect(within(ready).getByText('proposals waiting, from 1 document')).toBeInTheDocument();
    expect(within(ready).getByText('1 is medium or low and asks a question')).toBeInTheDocument();
    expect(within(line).getByLabelText('All files, stage by stage')).toHaveTextContent('All 2 files');
  });

  it('F shows only problems and files still in progress', async () => {
    mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': drop});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const line = await screen.findByRole('region', {name: 'Digestion line'});
    expect(laneButtons(line)).toHaveLength(2);
    fireEvent.keyDown(window, {key: 'f'});
    expect(laneButtons(line)).toHaveLength(1);
    expect(screen.getByRole('button', {name: /Problems & in progress/})).toHaveAttribute('aria-pressed', 'true');
  });

  it('stops a file being read', async () => {
    const reading = lane('d3', 'long.pdf', ['done', 'done', 'active', 'waiting', 'skipped', 'waiting', 'waiting'], {job_id: 'j9'});
    const api = mockApi({...SETTINGS,
      'GET /api/investigations/inv-1/drop': {...drop, lanes: [reading]},
      'POST /api/jobs/j9/cancel': {id: 'j9', kind: 'extract_document', investigation_id: 'inv-1', subject_type: 'document', subject_id: 'd3', status: 'running',
        finished: false, progress: 40, message: 'Stopping…', error: null, attempts: 1, runner: 'inline', result: null, created_at: '2026-10-12T00:00:00',
        started_at: '2026-10-12T00:00:01', finished_at: null, updated_at: '2026-10-12T00:00:02'},
    });
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    await userEvent.setup().click(await screen.findByRole('button', {name: 'Stop reading'}));
    expect(await screen.findByText('It stops at the next page; nothing half-read is kept.')).toBeInTheDocument();
    expect(api.calls('POST /api/jobs/j9/cancel')).toHaveLength(1);
  });

  it('offers a large drop field while the case has no files', async () => {
    mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': {...drop, lanes: [], totals: {...drop.totals, files: 0}, ready_for_you: {}}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    expect(await screen.findByText(/nothing leaves it/)).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'a folder'})).toBeInTheDocument();
  });

  it('reads a failed file again, and sends a second copy to the first', async () => {
    const failed = lane('d4', 'locked.pdf', ['done', 'done', 'stopped', 'stopped', 'skipped', 'waiting', 'waiting'], {retry_job_id: 'j4', note: 'Password-protected'});
    const copy = lane('d5', 'minutes (copy).pdf', ['done', 'done', 'done', 'done', 'skipped', 'done', 'done'], {same_as: 'd1', note: 'Already in the case: same fingerprint'});
    const api = mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': {...drop, lanes: [drop.lanes[0], failed, copy]},
      'POST /api/jobs/j4/retry': {id: 'j4', kind: 'extract_document', investigation_id: 'inv-1', subject_type: 'document', subject_id: 'd4', status: 'queued',
        finished: false, progress: 0, message: null, error: null, attempts: 2, runner: 'inline', result: null, created_at: '2026-10-12T00:00:00',
        started_at: null, finished_at: null, updated_at: '2026-10-12T00:00:02'}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Try again'}));
    expect(api.calls('POST /api/jobs/j4/retry')).toHaveLength(1);
    await user.click(screen.getByRole('button', {name: 'Open that one'}));
    expect(screen.getByRole('region', {name: 'Read receipt: minutes.pdf'})).toBeInTheDocument();
  });

  it('starts a big drop on problems, and folds the files read cleanly', async () => {
    const clean = Array.from({length: 41}, (_, i) => lane(`c${i}`, `clean-${i}.pdf`, ['done', 'done', 'done', 'done', 'skipped', 'done', 'done']));
    mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': {...drop, lanes: [drop.lanes[1], ...clean]}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const line = await screen.findByRole('region', {name: 'Digestion line'});
    expect(screen.getByRole('button', {name: /Problems & in progress/})).toHaveAttribute('aria-pressed', 'true');
    expect(laneButtons(line)).toHaveLength(1);
    fireEvent.keyDown(window, {key: 'f'});
    expect(laneButtons(line)).toHaveLength(1);
    expect(line.querySelector('.dp-fold')).toHaveTextContent('41 read cleanly, nothing waits');
    await userEvent.setup().click(within(line).getByRole('button', {name: 'Show them'}));
    expect(laneButtons(line)).toHaveLength(42);
  });

  it('writes each box as the mockup does, and lists problems first', () => {
    const st = (key: string, state: string, detail: string) => ({key, label: key, state, detail}) as Parameters<typeof boxDetail>[0];
    expect(boxDetail(st('received', 'done', '12 Oct 11:06'))).toBe('');
    expect(boxDetail(st('passages', 'done', '214 passages'))).toBe('214');
    expect(boxDetail(st('inside', 'active', '18 of 23 read'))).toBe('18/23');
    expect(boxDetail(st('inside', 'skipped', 'None'))).toBe('none');
    expect(boxDetail(st('read', 'active', 'OCR, page 12 of 40'))).toBe('OCR, page 12 of 40');
    const warn = {...lane('w', 'w.pdf', ['done', 'done', 'done', 'done', 'skipped', 'done', 'done']), issues: ['Faint text on 2 regions']};
    expect(problemsFirst([warn, drop.lanes[1]] as never).map(l => l.filename)).toEqual(['broken.pdf', 'w.pdf']);
  });
});
