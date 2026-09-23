// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 5: the "Portable investigation backup &
// restore" flow on app/page.tsx (previewBackup/restoreBackup;
// downloadBackup is left for a later cycle -- it needs an investigation
// selected AND jsdom object-URL/anchor-click plumbing, a bigger unit than
// preview+restore together). previewBackup and restoreBackup deliberately
// have no `if(!inv)` guard -- a restore creates a brand-new investigation --
// so, like the API-access and investigation-search flows (cycles 1-2), these
// are reachable with the investigations list kept empty; no need to drive
// selectInvestigation()'s cascade for preview. restoreBackup does call
// selectInvestigation() on success, so that one test mocks the full 9-call
// cascade plus AiReasoningPanel's own post-select fetch (see
// test-page-leads.test.tsx's docstring for why that 10th call exists).
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

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

const validSettingsStatus = {
  environment: 'test',
  database: 'sqlite',
  document_storage_dir: '/tmp/docs',
  limits: {},
  restore_api_enabled: true,
  document_extraction: {
    pdf_ocr_enabled: false,
    pdf_ocr_language: 'eng',
    pdf_ocr_dpi: 300,
    pdf_ocr_min_native_chars: 200,
    local_entity_suggestions_enabled: false,
    entity_extraction_owner: 'workbench_local',
    ocr_runtime: {
      available: false,
      requested_languages: [],
      missing_languages: [],
      detail: 'not checked',
    },
  },
  access: {
    remote_api_enabled: false,
    mode: 'local_only',
    token_configured: false,
  },
  cors_allowed_origins: [],
  connectors: {},
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  });
}

async function importHome(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../app/page');
  return mod.default;
}

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
    lineage_integrity: {valid: true},
    document_file_count: 1,
    missing_document_count: 0,
    warnings: [] as string[],
    conflicts: [] as unknown[],
    can_restore: true,
    restore_api_enabled: true,
    ...overrides,
  };
}

async function bootstrapNoInvestigations(): Promise<{
  fetchMock: ReturnType<typeof vi.fn>;
}> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(validSettingsStatus)) // GET settings/status
    .mockResolvedValueOnce(jsonResponse([])) // GET investigations (none -- no auto-select)
    .mockResolvedValueOnce(jsonResponse({providers: ['aleph']})); // GET connectors
  vi.stubGlobal('fetch', fetchMock);

  const Home = await importHome();
  render(<Home />);
  await screen.findByText(
    'Local-only API access. No bearer token is required on loopback.',
  );
  return {fetchMock};
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error('backup file input not found');
  return input as HTMLInputElement;
}

describe('Home portable investigation backup & restore', () => {
  it('previews a restorable backup and offers the confirmation checkbox', async () => {
    const {fetchMock} = await bootstrapNoInvestigations();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(restorablePreview({warnings: ['Backup is 3 days old.']})),
    ); // POST /api/backups/preview

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

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [previewUrl, previewInit] = fetchMock.mock.calls[3];
    expect(previewUrl).toContain('/api/backups/preview');
    expect((previewInit as RequestInit).method).toBe('POST');
  });

  it('blocks restore and reports conflicts when the preview cannot restore', async () => {
    const {fetchMock} = await bootstrapNoInvestigations();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        restorablePreview({
          can_restore: false,
          conflicts: [
            {kind: 'id_collision', table: 'entities', id: 'ent-9', message: 'Entity ent-9 already exists.'},
          ],
        }),
      ),
    );

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
  });

  it('restores after confirmation, then selects the new investigation', async () => {
    const {fetchMock} = await bootstrapNoInvestigations();
    fetchMock.mockResolvedValueOnce(jsonResponse(restorablePreview())); // preview

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

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          investigation_id: 'inv-restored',
          restored_counts: {entities: 4},
          manifest: {format: 'jwbackup', version: 1},
        }),
      ) // POST /api/backups/restore
      .mockResolvedValueOnce(jsonResponse([{id: 'inv-restored', name: 'Restored investigation'}])) // GET investigations reload
      .mockResolvedValueOnce(jsonResponse([])) // findings
      .mockResolvedValueOnce(jsonResponse([])) // entities (parseEntityList expects the raw array)
      .mockResolvedValueOnce(
        jsonResponse({
          nodes: [],
          edges: [],
          schemas: [],
          reconciliation: {
            collapsed_by_default: true,
            suppressed_duplicate_count: 0,
            underlying_edge_count: 0,
            visible_edge_count: 0,
          },
        }),
      ) // graph
      .mockResolvedValueOnce(jsonResponse({events: [], verification_counts: {}})) // timeline
      .mockResolvedValueOnce(jsonResponse({items: []})) // leads/queue
      .mockResolvedValueOnce(jsonResponse([])) // claims
      .mockResolvedValueOnce(jsonResponse([])) // evidence
      .mockResolvedValueOnce(jsonResponse([])) // sources
      .mockResolvedValueOnce(jsonResponse([])) // documents
      .mockResolvedValueOnce(jsonResponse({candidates: []})); // AiReasoningPanel queue

    await user.click(screen.getByRole('button', {name: 'Restore investigation'}));

    await screen.findByText('Restored investigation inv-restored.');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(16));

    const [restoreUrl, restoreInit] = fetchMock.mock.calls[4];
    expect(restoreUrl).toContain('/api/backups/restore');
    expect((restoreInit as RequestInit).method).toBe('POST');
  });
});
