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
const EXPORT = 'POST /api/investigations/inv-1/safety/backup';
const PASSPHRASE = 'harbour-lamp-violet-41';
const LOST = 'If you lose this passphrase, nobody can open this backup — not even you.';
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

  it('protects the backup with a passphrase by default: asked twice, with the warning, sent in the body', async () => {
    // A Response body can be read once, so the route makes a fresh one per request.
    const api = mockApi({[EXPORT]: () => new Response('zip-bytes', {status: 200, headers: {'content-type': 'application/zip'}})});
    const {createObjectURL, revokeObjectURL, clicked} = captureDownload();
    wrap(<BackupPanel investigationId="inv-1" onRestored={vi.fn()}/>);
    const user = userEvent.setup();

    expect(screen.getByRole('checkbox', {name: 'Protect with a passphrase'})).toBeChecked();
    expect(screen.getByText(LOST)).toBeInTheDocument();
    const download = screen.getByRole('button', {name: 'Download backup'});
    expect(download).toBeDisabled();
    await user.type(screen.getByLabelText('Passphrase'), PASSPHRASE);
    await user.type(screen.getByLabelText('Repeat the passphrase'), 'something else');
    expect(screen.getByText('The two passphrases are not the same.')).toBeInTheDocument();
    expect(download).toBeDisabled();
    await user.clear(screen.getByLabelText('Repeat the passphrase'));
    await user.type(screen.getByLabelText('Repeat the passphrase'), PASSPHRASE);
    await user.click(download);
    await screen.findByText('Backup downloaded, protected with your passphrase.');

    expect(api.calls(EXPORT)).toHaveLength(1);
    expect(api.lastBody(EXPORT)).toEqual({passphrase: PASSPHRASE});
    expect(api.lastUrl(EXPORT).search).toBe('');
    // The passphrase is not kept on screen once the backup is saved.
    expect(screen.getByLabelText('Passphrase')).toHaveValue('');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect((createObjectURL.mock.calls[0][0] as Blob).size).toBe('zip-bytes'.length);
    expect(clicked).toEqual([{href: 'blob:mock-url', download: 'investigation-inv-1.jwbackup.zip'}]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(document.querySelectorAll('a[download]').length).toBe(0);
  });

  it('saves without a passphrase only when the reporter chooses to', async () => {
    const api = mockApi({[EXPORT]: () => new Response('zip-bytes', {status: 200, headers: {'content-type': 'application/zip'}})});
    captureDownload();
    wrap(<BackupPanel investigationId="inv-1" onRestored={vi.fn()}/>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', {name: 'Protect with a passphrase'}));
    expect(screen.queryByLabelText('Passphrase')).not.toBeInTheDocument();
    expect(screen.getByText('Saving without a passphrase: anyone who has the file can open the case.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Download without a passphrase'}));
    await screen.findByText('Backup downloaded, without a passphrase.');
    expect(api.lastBody(EXPORT)).toEqual({passphrase: null});
  });

  it('shows the failure when the export cannot be fetched', async () => {
    mockApi({[EXPORT]: () => { throw new Error('export endpoint unreachable'); }});
    const {createObjectURL} = captureDownload();
    wrap(<BackupPanel investigationId="inv-1" onRestored={vi.fn()}/>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', {name: 'Protect with a passphrase'}));
    await user.click(screen.getByRole('button', {name: 'Download without a passphrase'}));
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

  it('asks for the passphrase when the chosen file is protected and sends it beside the file', async () => {
    const api = mockApi({
      [PREVIEW]: ({body}: {body: unknown}) => ((body as FormData).get('passphrase') === PASSPHRASE ? restorablePreview()
        : {status: 400, body: {detail: 'The passphrase is wrong, or the backup file was changed after it was made. Nothing was opened.'}}),
    });
    wrap(<BackupPanel investigationId="" onRestored={vi.fn()}/>);
    const user = userEvent.setup();
    await user.upload(fileInput(), new File(['JWBACKUP-SEALED\n\x01sealed-bytes'], 'investigation-inv-1.jwbackup.zip', {type: 'application/zip'}));
    const unlock = await screen.findByLabelText('This backup is protected. Passphrase');
    expect(screen.getByRole('button', {name: 'Preview restore'})).toBeDisabled();
    await user.type(unlock, 'not it');
    await user.click(screen.getByRole('button', {name: 'Preview restore'}));
    await screen.findByText(/The passphrase is wrong/);
    await user.clear(unlock);
    await user.type(unlock, PASSPHRASE);
    await user.click(screen.getByRole('button', {name: 'Preview restore'}));
    await screen.findByText('Kestrelwood filings');
    expect((api.lastBody(PREVIEW) as FormData).get('passphrase')).toBe(PASSPHRASE);
  });

  it('does not ask for a passphrase for an unprotected file', async () => {
    const api = mockApi({[PREVIEW]: restorablePreview()});
    wrap(<BackupPanel investigationId="" onRestored={vi.fn()}/>);
    const user = userEvent.setup();
    await user.upload(fileInput(), backupFile());
    await user.click(screen.getByRole('button', {name: 'Preview restore'}));
    await screen.findByText('Kestrelwood filings');
    expect(screen.queryByLabelText('This backup is protected. Passphrase')).not.toBeInTheDocument();
    expect((api.lastBody(PREVIEW) as FormData).get('passphrase')).toBeNull();
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
