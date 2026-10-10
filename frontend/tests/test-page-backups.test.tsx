// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 5: the "Portable investigation backup &
// restore" flow on app/page.tsx (previewBackup/restoreBackup;
// downloadBackup is left for a later cycle -- it needs an investigation
// selected AND jsdom object-URL/anchor-click plumbing, a bigger unit than
// preview+restore together). previewBackup and restoreBackup deliberately
// have no `if(!inv)` guard -- a restore creates a brand-new investigation --
// so, like the API-access and investigation-search flows (cycles 1-2), these
// are reachable with the investigations list kept empty; no per-investigation
// loads are needed for preview. restoreBackup does call selectInvestigation()
// on success, so that one test also gives the stub the restored case's
// routes (test-support/page-routes.ts; replies are keyed by route, not by
// call order -- ADR-0005, line 15).
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import type {MockApi} from '../test-support/mock-api';
import {investigationRecord, investigationRoutes, pageRoutes} from '../test-support/page-routes';

beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function importHome(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../app/page');
  return mod.default;
}

const PREVIEW = 'POST /api/backups/preview';
const RESTORE = 'POST /api/backups/restore';

function backupFile(): File {
  return new File(['fake-zip-bytes'], 'investigation-inv-1.jwbackup.zip', {
    type: 'application/zip',
  });
}

function restorablePreview(overrides: Record<string, unknown> = {}) {
  return {
    format: 'jwbackup',
    version: 1,
    investigation: {id: 'inv-src', name: 'Kestrelwood filings'},
    record_counts: {entities: 4, relationships: 2},
    lineage_integrity: {document_count: 1, chunk_count: 3, candidate_count: 4, candidate_status_counts: {proposed: 4}, accepted_record_counts: {}, valid: true, errors: []},
    document_file_count: 1,
    missing_document_count: 0,
    warnings: [] as string[],
    conflicts: [] as unknown[],
    can_restore: true,
    restore_api_enabled: true,
    ...overrides,
  };
}

async function bootstrapNoInvestigations(): Promise<MockApi> {
  // An empty investigation list: no case is opened, so nothing beyond the
  // three bootstrap routes is requested.
  const api = mockApi(pageRoutes());

  const Home = await importHome();
  render(<Home />);
  await screen.findByText(
    'API: local access',
  );
  return api;
}

function fileInput(): HTMLInputElement {
  // The backup panel's own picker: the page has other file inputs (documents) above it.
  const input = document.querySelector('#backup-restore input[type="file"]');
  if (!input) throw new Error('backup file input not found');
  return input as HTMLInputElement;
}

describe('Home portable investigation backup & restore', () => {
  it('previews a restorable backup and offers the confirmation checkbox', async () => {
    const api = await bootstrapNoInvestigations();
    api.add({[PREVIEW]: restorablePreview({warnings: ['Backup is 3 days old.']})});

    const user = userEvent.setup();
    await user.upload(fileInput(), backupFile());
    await user.click(screen.getByRole('button', {name: 'Preview restore'}));

    await screen.findByText('Kestrelwood filings');
    expect(
      screen.getByText('Preview passed. Review the details before restoring.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Warning: Backup is 3 days old.', {exact: false})).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        'I understand this creates a separate investigation and will not merge with existing records.',
      ),
    ).toBeInTheDocument();
    // Restore stays disabled until the confirmation checkbox is checked.
    expect(screen.getByRole('button', {name: 'Restore investigation'})).toBeDisabled();

    // One multipart POST carrying the chosen file, and nothing else requested.
    expect(api.calls(PREVIEW)).toHaveLength(1);
    expect(((api.lastBody(PREVIEW) as FormData).get('file') as File).name).toBe('investigation-inv-1.jwbackup.zip');
    expect(api.calls(RESTORE)).toHaveLength(0);
    expect(api.unmatched()).toEqual([]);
  });

  it('blocks restore and reports conflicts when the preview cannot restore', async () => {
    const api = await bootstrapNoInvestigations();
    api.add({
      [PREVIEW]: restorablePreview({
        can_restore: false,
        conflicts: [
          {kind: 'id_collision', table: 'entities', id: 'ent-9', message: 'Entity ent-9 already exists.'},
        ],
      }),
    });

    await userEvent.setup().upload(fileInput(), backupFile());
    await userEvent.setup().click(screen.getByRole('button', {name: 'Preview restore'}));

    await screen.findByText(/1 conflict\(s\)/);
    expect(
      screen.getByText('Entity ent-9 already exists.', {exact: false}),
    ).toBeInTheDocument();
    // No confirmation checkbox is offered when the preview can't restore.
    expect(
      screen.queryByLabelText(
        'I understand this creates a separate investigation and will not merge with existing records.',
      ),
    ).not.toBeInTheDocument();
    expect(api.calls(RESTORE)).toHaveLength(0);
  });

  it('restores after confirmation, then selects the new investigation', async () => {
    const api = await bootstrapNoInvestigations();
    api.add({[PREVIEW]: restorablePreview()});

    const user = userEvent.setup();
    await user.upload(fileInput(), backupFile());
    await user.click(screen.getByRole('button', {name: 'Preview restore'}));
    await screen.findByText('Kestrelwood filings');

    await user.click(
      screen.getByLabelText(
        'I understand this creates a separate investigation and will not merge with existing records.',
      ),
    );
    expect(screen.getByRole('button', {name: 'Restore investigation'})).toBeEnabled();

    // After the restore the server lists the new investigation, and opening
    // it loads its (empty) records.
    const restored = {id: 'inv-restored', name: 'Restored investigation'};
    api.add({
      [RESTORE]: {
        investigation_id: 'inv-restored',
        restored_counts: {entities: 4},
        manifest: {format: 'jwbackup', version: 1},
      },
      'GET /api/investigations': [investigationRecord(restored)],
      ...investigationRoutes(restored.id),
    });

    await user.click(screen.getByRole('button', {name: 'Restore investigation'}));

    await screen.findByText('Restored investigation inv-restored.');
    // The new case is opened: its name is selected and every one of its
    // loads has been requested.
    await screen.findByRole('heading', {level: 1, name: 'Restored investigation'});
    await waitFor(() => {
      for (const route of Object.keys(investigationRoutes(restored.id))) {
        expect(api.calls(route).length, route).toBeGreaterThan(0);
      }
    });

    expect(api.calls(RESTORE)).toHaveLength(1);
    expect(((api.lastBody(RESTORE) as FormData).get('file') as File).name).toBe('investigation-inv-1.jwbackup.zip');
    expect(api.calls('GET /api/investigations')).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });
});
