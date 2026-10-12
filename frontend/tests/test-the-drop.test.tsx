// @vitest-environment jsdom
// The Drop: lanes of seven stages, the read receipt, the problems filter (F), and Ready for you.
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {TheDrop} from '../features/the-drop/the-drop';
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
const drop = {
  investigation_id: 'inv-1', stages: STAGES.map(([key, label]) => ({key, label})),
  lanes: [lane('d1', 'minutes.pdf', ['done', 'done', 'done', 'done', 'skipped', 'done', 'needs_you']),
    lane('d2', 'broken.pdf', ['done', 'done', 'stopped', 'stopped', 'skipped', 'waiting', 'waiting'])],
  totals: {files: 2, files_inside: 0, read: 1, unread: 0, problems: 1, passages: 12, waiting: 2},
  ready_for_you: {entity: 2},
};

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); useWorkbenchStore.setState({investigationId: 'inv-1', document: null}); });
afterEach(() => cleanup());

describe('The Drop', () => {
  it('shows each file as a lane of stages, problems first, with its read receipt', async () => {
    mockApi({'GET /api/investigations/inv-1/drop': drop});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const line = await screen.findByRole('region', {name: 'Digestion line'});
    const lanes = within(line).getAllByRole('button');
    expect(lanes[0]).toHaveAccessibleName(/^broken\.pdf: .*Read stopped/);
    expect(lanes[1]).toHaveAccessibleName(/Ready for you needs you$/);
    const receipt = screen.getByRole('complementary', {name: 'Read receipt: broken.pdf'});
    expect(within(receipt).getByText('OCR')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(lanes[1]);
    const minutes = screen.getByRole('complementary', {name: 'Read receipt: minutes.pdf'});
    expect(within(minutes).getByText(/3 names/)).toBeInTheDocument();
    await user.click(within(minutes).getByRole('button', {name: 'Open in reading room'}));
    expect(useWorkbenchStore.getState().document).toMatchObject({documentId: 'd1'});
    expect(within(screen.getByRole('region', {name: 'Ready for you'})).getByRole('link', {name: '2 names'})).toBeInTheDocument();
  });

  it('F shows only problems and files still in progress', async () => {
    mockApi({'GET /api/investigations/inv-1/drop': drop});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const line = await screen.findByRole('region', {name: 'Digestion line'});
    expect(within(line).getAllByRole('button')).toHaveLength(2);
    fireEvent.keyDown(window, {key: 'f'});
    expect(within(line).getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', {name: /Problems & in progress/})).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers a large drop field while the case has no files', async () => {
    mockApi({'GET /api/investigations/inv-1/drop': {...drop, lanes: [], totals: {...drop.totals, files: 0}, ready_for_you: {}}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    expect(await screen.findByText(/nothing leaves it/)).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Choose a folder'})).toBeInTheDocument();
  });
});
