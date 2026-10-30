// @vitest-environment jsdom
// The portable backup & restore panel, moved out of app/page.tsx onto the
// generated reply checks (Foundation Fixes fixes 2 and 3): download the
// archive, preview a restore, restore only after the reporter confirms.
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {BackupPanel, backupHolds} from '../features/backups/backup-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (URL as unknown as {createObjectURL?: unknown}).createObjectURL;
  delete (URL as unknown as {revokeObjectURL?: unknown}).revokeObjectURL;
});

const PREVIEW = 'POST /api/backups/preview';
const RESTORE = 'POST /api/backups/restore';
const EXPORT = 'GET /api/investigations/inv-1/export';
const CASES = 'GET /api/investigations';
const SAFETY = 'GET /api/investigations/inv-1/safety-data';
const STANDING = 'GET /api/investigations/inv-1/standing';
const caseRow = (last_backup: unknown) => [{id: 'inv-1', name: 'Harbour land', is_demo: false, created_at: '2026-10-01T00:00:00Z', last_backup}];
const CONFIRMATION = 'I understand this creates a separate investigation and will not merge with existing records.';

const backupFile = () => new File(['fake-zip-bytes'], 'investigation-inv-1.jwbackup.zip', {type: 'application/zip'});

function restorablePreview(overrides: Record<string, unknown> = {}) {
  return {
    format: 'jwbackup', version: 1,
    investigation: {id: 'inv-src', name: 'Kestrelwood filings', description: null},
    record_counts: {entities: 4, relationships: 2},
    lineage_integrity: {document_count: 1, chunk_count: 3, candidate_count: 4, candidate_status_counts: {proposed: 4}, accepted_record_counts: {}, valid: true, errors: []},
    document_file_count: 1, missing_document_count: 0, warnings: [] as string[], conflicts: [] as unknown[],
    can_restore: true, restore_api_enabled: true, ...overrides,
  };
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error('backup file input not found');
  return input as HTMLInputElement;
}

// jsdom has no object URLs; the download makes one for the archive and clicks a link to it.
function captureDownload() {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock-url');
  const revokeObjectURL = vi.fn();
  (URL as unknown as {createObjectURL: typeof createObjectURL}).createObjectURL = createObjectURL;
  (URL as unknown as {revokeObjectURL: typeof revokeObjectURL}).revokeObjectURL = revokeObjectURL;
  const clicked: {href: string, download: string}[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({href: this.href, download: this.download});
  });
  return {createObjectURL, revokeObjectURL, clicked};
}

describe('BackupPanel download', () => {
  it('is disabled until an investigation is selected', () => {
    const api = mockApi();
    wrap(<BackupPanel investigationId="" onRestored={vi.fn()}/>);
    expect(screen.getByRole('button', {name: 'Download backup'})).toBeDisabled();
    expect(api.calls(EXPORT)).toHaveLength(0);
  });

  it('downloads the archive with its documents and saves it through an object URL', async () => {
    // A Response body can be read once, so the route makes a fresh one per request.
    const api = mockApi({[EXPORT]: () => new Response('zip-bytes', {status: 200, headers: {'content-type': 'application/zip'}})});
    const {createObjectURL, revokeObjectURL, clicked} = captureDownload();
    wrap(<BackupPanel investigationId="inv-1" onRestored={vi.fn()}/>);

    await userEvent.setup().click(screen.getByRole('button', {name: 'Download backup'}));
    await screen.findByText('Backup downloaded.');

    expect(api.lastUrl(EXPORT).searchParams.get('include_documents')).toBe('true');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect((createObjectURL.mock.calls[0][0] as Blob).size).toBe('zip-bytes'.length);
    expect(clicked).toEqual([{href: 'blob:mock-url', download: 'investigation-inv-1.jwbackup.zip'}]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(document.querySelectorAll('a[download]').length).toBe(0);
  });

  it('shows the failure when the export cannot be fetched', async () => {
    mockApi({[EXPORT]: () => { throw new Error('export endpoint unreachable'); }});
    const {createObjectURL} = captureDownload();
    wrap(<BackupPanel investigationId="inv-1" onRestored={vi.fn()}/>);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Download backup'}));
    await screen.findByText('export endpoint unreachable');
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

describe('BackupPanel last backup', () => {
  it('says when the case was last backed up, its size and that it carries a checksum', async () => {
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
    mockApi({[CASES]: caseRow({at: '2026-10-16T12:00:00Z', bytes: 1_400_000_000, sha256: 'ab', documents_included: true})});
    wrap(<BackupPanel investigationId="inv-1" onRestored={vi.fn()}/>);
    expect(await screen.findByText('Last backup 3 days ago')).toBeInTheDocument();
    // When, and the ✓ checksum, show; the size is revealed on the check.
    expect(screen.getByText('✓ checksum').closest('.rv')).toHaveAccessibleDescription(/^1\.4 GB · checksum kept/);
    vi.useRealTimers();
  });

  it('says when there is none yet, and asks again after a download', async () => {
    const api = mockApi({[CASES]: caseRow(null), [EXPORT]: () => new Response('zip-bytes', {status: 200, headers: {'content-type': 'application/zip'}})});
    captureDownload();
    wrap(<BackupPanel investigationId="inv-1" onRestored={vi.fn()}/>);
    expect(await screen.findByText('No backup of this case yet')).toBeInTheDocument();
    api.add({[CASES]: caseRow({at: new Date().toISOString(), bytes: 9, sha256: 'ab', documents_included: true})});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Download backup'}));
    expect(await screen.findByText('Last backup just now')).toBeInTheDocument();
  });
});

describe('BackupPanel preview and restore', () => {
  it('previews a restorable archive and offers the confirmation checkbox', async () => {
    const api = mockApi({[PREVIEW]: restorablePreview({warnings: ['Backup is 3 days old.']})});
    wrap(<BackupPanel investigationId="" onRestored={vi.fn()}/>);
    const user = userEvent.setup();
    expect(screen.getByRole('button', {name: 'Preview restore'})).toBeDisabled();
    await user.upload(fileInput(), backupFile());
    await user.click(screen.getByRole('button', {name: 'Preview restore'}));

    await screen.findByText('Kestrelwood filings');
    // The counts show big, as tiles; the sentence is their name for screen readers.
    expect(screen.getByLabelText('6 records · 1 stored document file(s) · 0 missing raw file(s)')).toBeInTheDocument();
    expect(screen.getByText('✓ lineage · ✓ restore').closest('.rv')).toHaveAccessibleDescription('Lineage: valid · Restore API: enabled');
    expect(screen.getByText('Preview passed. Review the details before restoring.')).toBeInTheDocument();
    expect(screen.getByText('Warning: Backup is 3 days old.')).toBeInTheDocument();
    expect(screen.getByLabelText(CONFIRMATION)).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Restore investigation'})).toBeDisabled();

    // One multipart POST carrying the chosen file, and nothing else requested.
    expect(api.calls(PREVIEW)).toHaveLength(1);
    expect(((api.lastBody(PREVIEW) as FormData).get('file') as File).name).toBe('investigation-inv-1.jwbackup.zip');
    expect(api.calls(RESTORE)).toHaveLength(0);
    expect(api.unmatched()).toEqual([]);
  });

  it('blocks the restore and lists the conflicts when the archive cannot be restored', async () => {
    const api = mockApi({[PREVIEW]: restorablePreview({
      can_restore: false, lineage_integrity: null,
      conflicts: [{kind: 'database_record', table: 'entities', id: 'ent-9', message: 'entities record already exists'}],
    })});
    wrap(<BackupPanel investigationId="" onRestored={vi.fn()}/>);
    const user = userEvent.setup();
    await user.upload(fileInput(), backupFile());
    await user.click(screen.getByRole('button', {name: 'Preview restore'}));

    await screen.findByText('Restore blocked by 1 conflict(s).');
    expect(screen.getByText('entities / ent-9 — entities record already exists', {exact: false})).toBeInTheDocument();
    expect(screen.getByText('✕ lineage · ✓ restore').closest('.rv')).toHaveAccessibleDescription('Lineage: not declared/invalid · Restore API: enabled');
    expect(screen.queryByLabelText(CONFIRMATION)).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Restore investigation'})).toBeDisabled();
    expect(api.calls(RESTORE)).toHaveLength(0);
  });

  it('restores after confirmation and hands the new investigation to the page', async () => {
    const api = mockApi({
      [CASES]: caseRow(null),
      [PREVIEW]: restorablePreview(),
      [RESTORE]: {investigation_id: 'inv-restored', restored_counts: {entities: 4}, manifest: {format: 'jwbackup', version: 1}},
      [SAFETY]: {status: 404, body: {detail: 'Investigation not found'}},
      [STANDING]: {status: 404, body: {detail: 'Investigation not found'}},
    });
    const onRestored = vi.fn();
    wrap(<BackupPanel investigationId="inv-1" onRestored={onRestored}/>);
    const user = userEvent.setup();
    await user.upload(fileInput(), backupFile());
    await user.click(screen.getByRole('button', {name: 'Preview restore'}));
    await screen.findByText('Kestrelwood filings');

    await user.click(screen.getByLabelText(CONFIRMATION));
    expect(screen.getByRole('button', {name: 'Restore investigation'})).toBeEnabled();
    await user.click(screen.getByRole('button', {name: 'Restore investigation'}));

    await screen.findByText('Restored investigation inv-restored.');
    expect(onRestored).toHaveBeenCalledWith('inv-restored');
    expect(api.calls(RESTORE)).toHaveLength(1);
    expect(((api.lastBody(RESTORE) as FormData).get('file') as File).name).toBe('investigation-inv-1.jwbackup.zip');
    // The confirmation does not carry over to a second restore.
    expect(screen.getByRole('button', {name: 'Restore investigation'})).toBeDisabled();
    expect(api.unmatched()).toEqual([]);
  });

  it('shows the server\'s reason when an archive is refused, and forgets a preview when the file changes', async () => {
    const api = mockApi({[PREVIEW]: {status: 400, body: {detail: 'Invalid Journalism Workbench backup'}}});
    wrap(<BackupPanel investigationId="" onRestored={vi.fn()}/>);
    const user = userEvent.setup();
    await user.upload(fileInput(), backupFile());
    await user.click(screen.getByRole('button', {name: 'Preview restore'}));
    await screen.findByText(/Invalid Journalism Workbench backup/);

    api.add({[PREVIEW]: restorablePreview()});
    await user.click(screen.getByRole('button', {name: 'Preview restore'}));
    await screen.findByText('Kestrelwood filings');
    await user.upload(fileInput(), new File(['other'], 'other.jwbackup.zip', {type: 'application/zip'}));
    expect(screen.queryByText('Kestrelwood filings')).not.toBeInTheDocument();
    expect(screen.queryByText('Preview passed. Review the details before restoring.')).not.toBeInTheDocument();
  });
});

describe('BackupPanel at rest (Keep › Backup & restore)', () => {
  const stores = [
    {id: 'records', name: 'Case records', count: 4812, count_note: '37 claims', where: 'Database on this machine', in_backups: true},
    {id: 'documents', name: 'Documents & pictures', count: 86, bytes: 1_400_000_000, where: 'Kept as received, checksummed', in_backups: true},
    {id: 'keys', name: 'Service keys', count: 2, count_note: 'of 3 set', where: 'Stored here, never shown again', in_backups: false},
    {id: 'log', name: 'Security log', count: 1204, where: 'Who asked what, never the content', in_backups: false},
  ];
  const safety = {
    period: '7d', totals: {requests_left: 0, services_reached: 0, documents_sent_out: 0, ai_calls_outside: 0}, exposure: '', stores, services: [],
    backup: {last_backup_at: null, encrypted: false, restore_enabled: true}, access: {mode: 'local_only', refused_24h: 0, log_readable: true},
    housekeeping: {stray_files: 0, stray_bytes: 0}, outbound: [], outbound_total: 0,
  };

  const standing = {
    investigation_id: 'inv-1', claims: {total: 37, supported: 0, disputed: 0, unshown: 0, ruled_out: 0}, to_check: 0, missing: 0, to_decide: 0,
    to_decide_by_kind: {}, money: {currency: null, amount: 0, payments: 0, starting_payers: 0, others: []},
    timeline: {events: 12, from: null, to: null, years: []}, documents: {total: 86, unread: 0, failed: 0}, sources: 9, evidence: 140,
    network: {parties: 4812, links: 1}, flags: {open: 0, textbook: 0, strong: 0, faint: 0}, leads: {open: 3}, watchlist: {names: 0, new_hits: 0},
  };

  it('counts what a backup holds by kind, names what stays out, and shows sealed or not as a colour with its word on hover', async () => {
    mockApi({[CASES]: caseRow(null), [SAFETY]: safety, [STANDING]: standing});
    wrap(<BackupPanel investigationId="inv-1" onRestored={vi.fn()}/>);
    const holds = within(await screen.findByRole('list', {name: 'What a backup holds'}));
    expect(await holds.findByText('4,812')).toBeInTheDocument();
    expect(holds.getByText('parties')).toBeInTheDocument();
    // One of each reads in the singular.
    expect(holds.getByText('link')).toBeInTheDocument();
    expect(holds.getByText('37').nextSibling).toHaveTextContent('claims');
    expect(holds.getByText('140').nextSibling).toHaveTextContent('evidence');
    expect(holds.getByText('3').nextSibling).toHaveTextContent('open leads');
    // The documents' size and where they live are revealed on their name.
    expect(await holds.findByText('documents')).toBeInTheDocument();
    await waitFor(() => expect(holds.getByText('documents').closest('.rv')).toHaveAccessibleDescription('1.4 GB · Kept as received, checksummed, with their read text'));
    expect(screen.getByText('Service keys · Security log', {exact: false})).toBeInTheDocument();
    // Not sealed is the status colour; its word is there for screen readers and on hover with what it means.
    const seal = screen.getByRole('img', {name: 'Not sealed'});
    expect(seal).toHaveAccessibleDescription(/not encrypted/);
    expect(seal.querySelector('.st.kp-unsealed .st-word')).toHaveTextContent('not sealed');
  });

  it('holds nothing to count until the case\'s standing is in', () => {
    expect(backupHolds(undefined, null)).toEqual([]);
    expect(backupHolds(standing as never, null).find(h => h.id === 'documents')).toMatchObject({n: 86, unit: 'documents', detail: undefined});
  });

  it('takes a backup dropped on the target, and previews it from there', async () => {
    mockApi({[PREVIEW]: restorablePreview()});
    wrap(<BackupPanel investigationId="" onRestored={vi.fn()}/>);
    expect(screen.getByText('Drop a backup here')).toBeInTheDocument();
    const target = screen.getByText('Drop a backup here').closest('label')!;
    fireEvent.dragOver(target, {dataTransfer: {files: [backupFile()]}});
    expect(target).toHaveClass('over');
    fireEvent.drop(target, {dataTransfer: {files: [backupFile()]}});
    expect(screen.getByText('investigation-inv-1.jwbackup.zip')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', {name: 'Preview restore'}));
    expect(await screen.findByText('Kestrelwood filings')).toBeInTheDocument();
  });
});
