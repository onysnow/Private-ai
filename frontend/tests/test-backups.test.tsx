// @vitest-environment jsdom
// The portable backup & restore panel, moved out of app/page.tsx onto the
// generated reply checks (Foundation Fixes fixes 2 and 3): download the
// archive, preview a restore, restore only after the reporter confirms.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {BackupPanel} from '../features/backups/backup-panel';
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

describe('BackupPanel preview and restore', () => {
  it('previews a restorable archive and offers the confirmation checkbox', async () => {
    const api = mockApi({[PREVIEW]: restorablePreview({warnings: ['Backup is 3 days old.']})});
    wrap(<BackupPanel investigationId="" onRestored={vi.fn()}/>);
    const user = userEvent.setup();
    expect(screen.getByRole('button', {name: 'Preview restore'})).toBeDisabled();
    await user.upload(fileInput(), backupFile());
    await user.click(screen.getByRole('button', {name: 'Preview restore'}));

    await screen.findByText('Kestrelwood filings');
    expect(screen.getByText('6 records · 1 stored document file(s) · 0 missing raw file(s)')).toBeInTheDocument();
    expect(screen.getByText('Lineage: valid · Restore API: enabled')).toBeInTheDocument();
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
    expect(screen.getByText('Lineage: not declared/invalid · Restore API: enabled')).toBeInTheDocument();
    expect(screen.queryByLabelText(CONFIRMATION)).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Restore investigation'})).toBeDisabled();
    expect(api.calls(RESTORE)).toHaveLength(0);
  });

  it('restores after confirmation and hands the new investigation to the page', async () => {
    const api = mockApi({
      [PREVIEW]: restorablePreview(),
      [RESTORE]: {investigation_id: 'inv-restored', restored_counts: {entities: 4}, manifest: {format: 'jwbackup', version: 1}},
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
