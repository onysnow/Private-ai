// @vitest-environment jsdom
// The Drop: lanes of seven stages, the read receipt, the problems filter (F), and Ready for you.
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {TheDrop, boxDetail, boxName, gridMove, problemsFirst} from '../features/the-drop/the-drop';
import {mergeDropEvent} from '../features/the-drop/drop-stream';
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
const laneButtons = (line: HTMLElement) => Array.from(line.querySelectorAll<HTMLElement>('[role="row"].dp-lane'));
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
    expect(within(lanes[0]).getByRole('gridcell', {name: 'broken.pdf, Read: stopped, The file is damaged'})).toBeInTheDocument();
    expect(within(lanes[1]).getByRole('gridcell', {name: 'minutes.pdf, Ready for you: needs you'})).toBeInTheDocument();
    const receipt = screen.getByRole('region', {name: 'Read receipt: broken.pdf'});
    // The verdict is its mark; the words are its name and on hover (Ony, 29 Oct).
    expect(within(receipt).getByRole('img', {name: 'Not read'})).toHaveTextContent('✕');
    expect(within(screen.getByRole('region', {name: 'Problems first'})).getByRole('button', {name: /broken\.pdf/})).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(lanes[1]);
    const minutes = screen.getByRole('region', {name: 'Read receipt: minutes.pdf'});
    expect(within(minutes).getByText(/3 names/)).toBeInTheDocument();
    await user.click(within(minutes).getByRole('button', {name: 'Open in reading room'}));
    expect(useWorkbenchStore.getState().document).toMatchObject({documentId: 'd1'});
    const ready = screen.getByRole('region', {name: 'Ready for you'});
    expect(within(ready).getByRole('link', {name: '2 names proposed'})).toBeInTheDocument();
    // Sub-text is in the page for screen readers but not on screen until asked.
    expect(within(ready).getByText('proposals waiting, from 1 document').closest('[hidden]')).not.toBeNull();
    expect(within(ready).getByText('1 is medium or low and asks a question').closest('[hidden]')).not.toBeNull();
    expect(within(line).getByLabelText('All files, stage by stage')).toHaveTextContent('All 2 files');
  });

  it('shows on the receipt what each proposer\'s proposals came to', async () => {
    const counted = lane('d1', 'minutes.pdf', ['done', 'done', 'done', 'done', 'skipped', 'done', 'needs_you']);
    counted.receipt = {...counted.receipt, by_proposer: [
      {rule: 'capitalized_name_sequence', accepted: 31, rejected: 9, waiting: 1},
      {rule: 'openaleph_ingest_file', accepted: 2, rejected: 0, waiting: 0}, {rule: 'openaleph_ftm_analyze', accepted: 1, rejected: 1, waiting: 0},
      {rule: 'sentence_assertion', accepted: 0, rejected: 0, waiting: 4},   // nothing answered yet: left out
    ]} as typeof counted.receipt;
    mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': {...drop, lanes: [counted]}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const receipt = await screen.findByRole('region', {name: 'Read receipt: minutes.pdf'});
    // On hover of the proposals (sub-text), so in the page but hidden until asked.
    const list = within(receipt).getByRole('list', {name: 'What each proposer\'s proposals came to', hidden: true});
    expect(list.closest('[hidden]')).not.toBeNull();
    const rows = within(list).getAllByRole('listitem', {hidden: true});
    expect(rows.map(r => r.textContent)).toEqual(['Name-finder (rules): 31 of 40 accepted · 1 waits', 'OpenAleph: 3 of 4 accepted']);
  });

  it('leaves the proposers out of a receipt with nothing answered', async () => {
    mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': {...drop, lanes: [drop.lanes[0]]}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const receipt = await screen.findByRole('region', {name: 'Read receipt: minutes.pdf'});
    expect(within(receipt).queryByText('By proposer')).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', {name: 'Choose a folder'})).toBeInTheDocument();
  });

  it('offers the sample case on an empty Drop only when the sample has documents to bring in', async () => {
    const empty = {...drop, lanes: [], totals: {...drop.totals, files: 0}, ready_for_you: {}};
    const sample = {id: 'demo-1', name: 'Demo Investigation', description: null, question: null, is_demo: true, type_areas: null, ai_run_profile: null, created_at: '2026-10-12T00:00:00'};
    const file = {id: 'f1', investigation_id: 'demo-1', source_id: 's1', filename: 'note.txt', title: 'note', mime_type: 'text/plain', sha256: 'ab'.repeat(32),
      extraction_status: 'complete', extraction_error: null, extraction_issues: [], created_at: '2026-10-12T00:00:00', chunk_count: 1, candidate_counts: {}, parent_document_id: null};
    const api = mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': empty, 'GET /api/investigations': [sample], 'GET /api/investigations/demo-1/documents': []});
    const first = render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    await screen.findByText(/nothing leaves it/);
    await waitFor(() => expect(api.calls('GET /api/investigations/demo-1/documents')).toHaveLength(1));
    expect(screen.queryByRole('link', {name: 'Try with the sample case'})).not.toBeInTheDocument();
    first.unmount();
    mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': empty, 'GET /api/investigations': [sample], 'GET /api/investigations/demo-1/documents': [file]});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    expect(await screen.findByRole('link', {name: 'Try with the sample case'})).toHaveAttribute('href', '/bring-in?inv=demo-1');
  });

  it('names the identifier proposals as the mockup does: Emails & phones', async () => {
    mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': {...drop, ready_for_you: {identifier: 3}}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const ready = await screen.findByRole('region', {name: 'Ready for you'});
    const link = within(ready).getByRole('link', {name: '3 emails & phones proposed'});
    expect(link).toHaveTextContent(/^3$/);  // the kind is its icon; named on hover or focus
    fireEvent.focus(link);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Emails & phones');
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

  it('moves over the line as a keyboard grid: arrows, Home and End, Enter shows the receipt or presses the button', async () => {
    const failed = lane('d4', 'locked.pdf', ['done', 'done', 'stopped', 'stopped', 'skipped', 'waiting', 'waiting'], {retry_job_id: 'j4', note: 'Password-protected'});
    const api = mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': {...drop, lanes: [drop.lanes[0], failed]},
      'POST /api/jobs/j4/retry': {id: 'j4', kind: 'extract_document', investigation_id: 'inv-1', subject_type: 'document', subject_id: 'd4', status: 'queued',
        finished: false, progress: 0, message: null, error: null, attempts: 2, runner: 'inline', result: null, created_at: '2026-10-12T00:00:00',
        started_at: null, finished_at: null, updated_at: '2026-10-12T00:00:02'}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const grid = await screen.findByRole('grid', {name: 'Files, stage by stage'});
    expect(within(grid).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['File', ...STAGES.map(s => s[1]), 'Waiting']);
    // One tab stop: the first file's name (problems first).
    const stops = grid.querySelectorAll('[tabindex="0"]');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveTextContent('locked.pdf');
    const start = stops[0] as HTMLElement;
    start.focus();
    fireEvent.keyDown(start, {key: 'ArrowRight'});
    expect(document.activeElement).toHaveAccessibleName('locked.pdf, Received: done');
    fireEvent.keyDown(document.activeElement!, {key: 'ArrowDown'});
    expect(document.activeElement).toHaveAccessibleName('minutes.pdf, Received: done');
    fireEvent.keyDown(document.activeElement!, {key: 'End'});
    expect(document.activeElement).toHaveClass('dp-waiting-cell');
    expect(grid.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    fireEvent.keyDown(document.activeElement!, {key: 'Home'});
    fireEvent.keyDown(document.activeElement!, {key: 'Enter'});
    expect(screen.getByRole('region', {name: 'Read receipt: minutes.pdf'})).toBeInTheDocument();
    expect(useWorkbenchStore.getState().document).toBeNull();  // Enter in the grid shows the receipt; it does not open the reading room
    fireEvent.keyDown(document.activeElement!, {key: 'ArrowUp'});
    fireEvent.keyDown(document.activeElement!, {key: 'End'});
    fireEvent.keyDown(document.activeElement!, {key: 'Enter'});
    await waitFor(() => expect(api.calls('POST /api/jobs/j4/retry')).toHaveLength(1));
  });

  it('says when a read has not moved for six minutes, with Check', async () => {
    const stuck = lane('d6', 'stuck.pdf', ['done', 'done', 'active', 'waiting', 'skipped', 'waiting', 'waiting'],
      {job_id: 'j6', stalled_minutes: 7, note: 'No progress for 7 min · it may have stopped'});
    stuck.stages[2].detail = 'No progress for 7 min';
    mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': {...drop, lanes: [drop.lanes[0], stuck]}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const cell = await screen.findByRole('gridcell', {name: 'stuck.pdf, Read: no progress, No progress for 7 min'});
    expect(cell).toHaveClass('dp-stalled');
    expect(cell).toHaveTextContent('⧗7 min');
    await userEvent.setup().click(screen.getByRole('button', {name: 'Check'}));
    const receipt = screen.getByRole('region', {name: 'Read receipt: stuck.pdf'});
    expect(within(receipt).getByRole('note')).toHaveTextContent('No progress for 7 min. Stop reading, then read it again with Try again.');
    expect(within(receipt).getByRole('button', {name: 'Stop reading'})).toBeInTheDocument();
  });

  it('names a file already in the case, and keeps a second copy only when asked', async () => {
    const doc = {id: 'd1', investigation_id: 'inv-1', filename: 'minutes.pdf', source_id: 'src-1', mime_type: 'application/pdf', sha256: 'ab'.repeat(32),
      extraction_status: 'complete', extraction_error: null, extraction_issues: [], created_at: '2026-10-01T00:00:00', chunk_count: 12, candidate_counts: {}};
    const api = mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': drop,
      'POST /api/investigations/inv-1/ingestion-batches': {id: 'batch-1', investigation_id: 'inv-1', label: 'minutes again.pdf', created_by: null,
        created_at: '2026-10-19T01:00:00', items: [], documents: [], review_order: []},
      'POST /api/documents/upload': (call: {body: unknown}) => ((call.body as FormData).get('allow_duplicate') === 'true'
        ? {...doc, id: 'd9', filename: 'minutes again.pdf', job: null, openaleph_sync: null}
        : {status: 409, body: {detail: {message: 'Already in this investigation as “minutes.pdf”', document: doc}}})});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    await screen.findByRole('grid');
    const input = document.querySelector<HTMLInputElement>('.dp-field input[type="file"]:not([webkitdirectory])')!;
    fireEvent.change(input, {target: {files: [new File(['same bytes'], 'minutes again.pdf', {type: 'application/pdf'})]}});
    const card = await screen.findByRole('region', {name: 'Already in the case'});
    expect(within(card).getByText('Already in the case as minutes.pdf · same fingerprint')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 files saved. 1 already in the case.');
    expect((api.lastBody('POST /api/documents/upload') as FormData).get('batch_id')).toBe('batch-1');
    const user = userEvent.setup();
    await user.click(within(card).getByRole('button', {name: 'Open that one'}));
    expect(screen.getByRole('region', {name: 'Read receipt: minutes.pdf'})).toBeInTheDocument();
    await user.click(within(card).getByRole('button', {name: 'Keep a second copy'}));
    await waitFor(() => expect(screen.queryByRole('region', {name: 'Already in the case'})).toBeNull());
    const uploads = api.calls('POST /api/documents/upload');
    expect(uploads.map(c => (c.body as FormData).get('allow_duplicate'))).toEqual([null, 'true']);
  });

  it('lists every drop in History with what it produced, and shows one drop alone on the line', async () => {
    const entry = (id: string, label: string, ids: string[], extra: Record<string, unknown> = {}) => ({id, batch_id: id, label, created_at: '2026-10-14T09:00:00',
      one_at_a_time: false, document_ids: ids, files: ids.length, duplicates: 0, refused: 0, read: ids.length, problems: 0, in_progress: 0, files_inside: 0,
      passages: 214, proposals: {entity: 24, claim: 8}, accepted: 3, waiting: 29, ...extra});
    mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': drop,
      'GET /api/investigations/inv-1/drop/history': {investigation_id: 'inv-1', drops: [
        entry('b2', 'broken.pdf', ['d2'], {read: 0, problems: 1, passages: 0, proposals: {}, accepted: 0, waiting: 0, duplicates: 1}),
        entry('day:2026-10-12', 'minutes.pdf', ['d1'], {batch_id: null, one_at_a_time: true})]}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    await screen.findByRole('grid');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'History'}));
    const history = await screen.findByRole('list', {name: 'Every drop, newest first'});
    const [first, second] = within(history).getAllByRole('listitem').filter(li => li.parentElement === history);
    expect(first).toHaveTextContent('1 file saved');
    expect(within(first).getByText('1 already in the case').closest('[hidden]')).not.toBeNull();
    expect(first).toHaveTextContent('1 could not be read');
    expect(second).toHaveTextContent('One at a time');
    expect(within(second).getByRole('list', {name: 'What it produced'})).toHaveTextContent('✓1 read214 passages24 names, 8 claims found3 accepted!29 wait for you');
    await user.click(within(second).getByRole('button', {name: 'Show it on the line'}));
    const line = screen.getByRole('region', {name: 'Digestion line'});
    expect(laneButtons(line)).toHaveLength(1);
    expect(within(line).getByText(/One drop: minutes\.pdf/)).toBeInTheDocument();
    await user.click(within(line).getByRole('button', {name: 'Show all 2'}));
    expect(laneButtons(line)).toHaveLength(2);
  });

  it('follows each file on the event stream instead of polling', async () => {
    const reading = lane('d3', 'long.pdf', ['done', 'done', 'active', 'waiting', 'skipped', 'waiting', 'waiting'], {note: 'Reading'});
    const readNow = {...lane('d3', 'long.pdf', ['done', 'done', 'done', 'done', 'skipped', 'done', 'needs_you']), note: 'Read cleanly · 42 s'};
    const summary = {investigation_id: 'inv-1', stages: drop.stages, totals: {...drop.totals, files: 1, unread: 0}, ready_for_you: {entity: 2}, ready_from: 1, ready_unsure: 0, order: ['d3']};
    const sse = `id: 1\nevent: lane\ndata: ${JSON.stringify(readNow)}\n\nid: 2\nevent: summary\ndata: ${JSON.stringify(summary)}\n\nevent: end\ndata: {}\n\n`;
    let opened = 0;
    const api = mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': () => (opened ? {...drop, lanes: [readNow]} : {...drop, lanes: [reading], totals: {...drop.totals, unread: 1}}),
      'GET /api/investigations/inv-1/drop/stream': () => { opened += 1; return new Response(sse, {headers: {'content-type': 'text/event-stream'}}); }});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    await screen.findByRole('gridcell', {name: 'long.pdf, Read: done'});
    expect(api.calls('GET /api/investigations/inv-1/drop/stream')).toHaveLength(1);
    expect(screen.getByText('Read cleanly · 42 s')).toBeInTheDocument();
    // Said once, politely, when the read finishes (research §2: summaries, never every stage).
    expect(within(screen.getByRole('list', {name: 'What changed on the line'})).getByText('long.pdf read: 12 passages, 3 proposals')).toBeInTheDocument();
  });

  it('counts a file saved but not read as saved, and says why in words', async () => {
    const doc = {id: 'd7', investigation_id: 'inv-1', filename: 'scan.pdf', source_id: 'src-1', mime_type: 'application/pdf', sha256: 'cd'.repeat(32),
      extraction_status: 'failed', extraction_error: 'The file is damaged', extraction_issues: [], created_at: '2026-10-01T00:00:00', chunk_count: 0, candidate_counts: {}};
    mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': drop,
      'POST /api/investigations/inv-1/ingestion-batches': {id: 'batch-2', investigation_id: 'inv-1', label: 'scan.pdf', created_by: null,
        created_at: '2026-10-19T01:00:00', items: [], documents: [], review_order: []},
      'POST /api/documents/upload': {status: 422, body: {detail: {message: 'Document saved but extraction failed', document: doc, error: 'The file is damaged', job: null}}}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    await screen.findByRole('grid');
    const input = document.querySelector<HTMLInputElement>('.dp-field input[type="file"]:not([webkitdirectory])')!;
    fireEvent.change(input, {target: {files: [new File(['%PDF'], 'scan.pdf', {type: 'application/pdf'})]}});
    await waitFor(() => expect(screen.getByText(/^1 file saved/)).toHaveTextContent('1 file saved. scan.pdf was saved but could not be read: The file is damaged.'));
    expect(screen.getByText(/^1 file saved/).textContent).not.toMatch(/422|\/api\//);
  });

  it('opens the file picker with Enter on the drop field, and shows a file\'s receipt while it is pointed at', async () => {
    mockApi({...SETTINGS, 'GET /api/investigations/inv-1/drop': drop});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const line = await screen.findByRole('region', {name: 'Digestion line'});
    const field = screen.getByLabelText(/Drop files here, or paste text/);
    const input = document.querySelector<HTMLInputElement>('.dp-field input[type="file"]:not([webkitdirectory])')!;
    const picker = vi.spyOn(input, 'click');
    fireEvent.keyDown(field, {key: 'Enter'});
    expect(picker).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('region', {name: 'Read receipt: broken.pdf'})).toBeInTheDocument();
    const [, minutes] = laneButtons(line);
    fireEvent.mouseEnter(minutes);
    expect(screen.getByRole('region', {name: 'Read receipt: minutes.pdf'})).toBeInTheDocument();
    fireEvent.mouseLeave(within(line).getByRole('grid'));
    expect(screen.getByRole('region', {name: 'Read receipt: broken.pdf'})).toBeInTheDocument();
  });

  it('merges stream messages into the drop as last read', () => {
    const base = {...drop, lanes: [drop.lanes[0]]} as never;
    const moved = {...drop.lanes[0], note: 'moved'};
    const once = mergeDropEvent(base, 'lane', moved)!;
    expect(once.lanes[0].note).toBe('moved');
    const added = mergeDropEvent(once, 'lane', drop.lanes[1])!;
    expect(added.lanes.map(l => l.document_id)).toEqual(['d1', 'd2']);
    const ordered = mergeDropEvent(added, 'summary', {...drop, lanes: undefined, order: ['d2', 'd1']})!;
    expect(ordered.lanes.map(l => l.document_id)).toEqual(['d2', 'd1']);
    expect(mergeDropEvent(ordered, 'gone', {document_id: 'd2'})!.lanes.map(l => l.document_id)).toEqual(['d1']);
  });

  it('names each box as research §3 does, and moves like a grid', () => {
    const l = lane('x', 'Fernhill board minutes', ['done', 'done', 'active', 'waiting', 'skipped', 'waiting', 'waiting']) as never as Parameters<typeof boxName>[0];
    expect(boxName(l, {...l.stages[2], detail: 'OCR, page 12 of 40'})).toBe('Fernhill board minutes, Read: working, OCR, page 12 of 40');
    const rows = [9, 9, 1, 9];
    expect(gridMove('ArrowDown', false, {row: 1, col: 4}, rows)).toEqual({row: 2, col: 0});  // a folded row has one cell
    expect(gridMove('ArrowRight', false, {row: 0, col: 8}, rows)).toEqual({row: 0, col: 8});
    expect(gridMove('End', true, {row: 0, col: 0}, rows)).toEqual({row: 3, col: 8});
    expect(gridMove('PageUp', false, {row: 3, col: 2}, rows)).toEqual({row: 0, col: 2});
    expect(gridMove('j', false, {row: 0, col: 0}, rows)).toBeNull();
  });

  it('writes each box as the mockup does, and lists problems first', () => {
    const st = (key: string, state: string, detail: string) => ({key, label: key, state, detail}) as Parameters<typeof boxDetail>[0];
    expect(boxDetail(st('received', 'done', '12 Oct 11:06'))).toBe('');
    expect(boxDetail(st('passages', 'done', '214 passages'))).toBe('214');
    expect(boxDetail(st('inside', 'active', '18 of 23 read'))).toBe('18/23');
    expect(boxDetail(st('inside', 'skipped', 'None'))).toBe('none');
    expect(boxDetail(st('read', 'active', 'OCR, page 12 of 40'))).toBe('OCR, page 12 of 40');
    expect(boxDetail(st('read', 'stopped', 'The document reader stopped unexpectedly on this file'))).toBe('');  // only its ✕, as the mockup draws it
    const warn = {...lane('w', 'w.pdf', ['done', 'done', 'done', 'done', 'skipped', 'done', 'done']), issues: ['Faint text on 2 regions']};
    expect(problemsFirst([warn, drop.lanes[1]] as never).map(l => l.filename)).toEqual(['broken.pdf', 'w.pdf']);
    const stuck = {...lane('s', 's.pdf', ['done', 'done', 'active', 'waiting', 'skipped', 'waiting', 'waiting']), stalled_minutes: 8};
    expect(problemsFirst([warn, stuck, drop.lanes[1]] as never).map(l => l.filename)).toEqual(['broken.pdf', 's.pdf', 'w.pdf']);
  });
});
