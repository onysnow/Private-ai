// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 9: the "Security audit metadata" flow inside
// app/page.tsx's "Local security/settings status" details panel
// (loadSecurityAudit, loadOlderSecurityAudit, previewAuditRetention,
// applyAuditRetention). None of these four handlers depend on `inv`, so --
// like the API-access and investigation-search flows (cycles 1-2) -- the
// investigations list is kept empty and no selectInvestigation() cascade is
// needed. What IS needed that those cycles didn't: the panel lives inside a
// native <details>/<summary>, closed by default, so each test clicks the
// summary text to open it before querying for anything inside.
import {cleanup, render, screen} from '@testing-library/react';
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

function auditRecord(overrides: Record<string, unknown> = {}) {
  return {
    timestamp: '2026-09-23T00:00:00Z',
    event: 'auth_success',
    request_id: 'req-1',
    method: 'GET',
    path: '/api/entities',
    status_code: 200,
    local_request: true,
    client_host: null,
    ...overrides,
  };
}

function auditView(overrides: Record<string, unknown> = {}) {
  return {
    records: [auditRecord()],
    returned: 1,
    total_matched: 150,
    offset: 0,
    has_more: true,
    next_offset: 100,
    malformed_lines: 0,
    file_bytes: 12345,
    ...overrides,
  };
}

const auditSummary = {
  total_records: 150,
  malformed_lines: 0,
  local_records: 140,
  remote_records: 10,
  by_event: {auth_success: 140, auth_rate_limited: 10},
  by_method: {GET: 100, POST: 50},
  by_status: {'200': 140, '429': 10},
  file_bytes: 12345,
};

function retentionPreview(overrides: Record<string, unknown> = {}) {
  return {
    keep_days: 90,
    max_records: 5000,
    total_lines: 200,
    valid_records: 195,
    malformed_lines: 5,
    would_keep: 150,
    would_remove: 50,
    file_bytes: 12345,
    ...overrides,
  };
}

async function bootstrapAndOpenSecurityPanel(): Promise<{
  fetchMock: ReturnType<typeof vi.fn>;
}> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(validSettingsStatus)) // GET /api/settings/status
    .mockResolvedValueOnce(jsonResponse([])) // GET /api/investigations
    .mockResolvedValueOnce(jsonResponse({providers: ['aleph']})); // GET /api/connectors
  vi.stubGlobal('fetch', fetchMock);

  const Home = await importHome();
  render(<Home />);
  await screen.findByText('Local-only API access. No bearer token is required on loopback.');

  await userEvent.setup().click(screen.getByText('Local security/settings status'));
  await screen.findByText('Load recent security events');

  return {fetchMock};
}

describe('Home security audit metadata', () => {
  it('loads recent security events and their summary', async () => {
    const {fetchMock} = await bootstrapAndOpenSecurityPanel();

    fetchMock
      .mockResolvedValueOnce(jsonResponse(auditView())) // GET .../security/audit
      .mockResolvedValueOnce(jsonResponse(auditSummary)); // GET .../security/audit/summary

    await userEvent.setup().click(screen.getByRole('button', {name: 'Load recent security events'}));

    await screen.findByText('Loaded 1 of 150 security event(s).');

    expect(
      screen.getByText((_, node) => node?.textContent === '2026-09-23T00:00:00Z · GET /api/entities · 200 · auth_success · local', {
        selector: 'small',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.textContent === '150 valid event(s) · 140 local · 10 remote · 0 malformed retained', {
        selector: 'small',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 150 matching event(s).')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Load 100 older events'})).toBeInTheDocument();

    const [auditUrl] = fetchMock.mock.calls[3];
    const [summaryUrl] = fetchMock.mock.calls[4];
    expect(auditUrl).toContain('/api/settings/security/audit?limit=100&offset=0');
    expect(summaryUrl).toContain('/api/settings/security/audit/summary');
  });

  it('loads older security events and appends them to the list', async () => {
    const {fetchMock} = await bootstrapAndOpenSecurityPanel();

    fetchMock
      .mockResolvedValueOnce(jsonResponse(auditView())) // initial load
      .mockResolvedValueOnce(jsonResponse(auditSummary));

    await userEvent.setup().click(screen.getByRole('button', {name: 'Load recent security events'}));
    await screen.findByText('Showing 1 of 150 matching event(s).');

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        auditView({
          records: [auditRecord({request_id: 'req-2', event: 'auth_rate_limited', local_request: false})],
          returned: 1,
          has_more: false,
          next_offset: null,
        }),
      ),
    ); // GET older page

    await userEvent.setup().click(screen.getByRole('button', {name: 'Load 100 older events'}));

    await screen.findByText('Showing 2 of 150 matching event(s).');
    expect(
      screen.getByText((_, node) => node?.textContent === '2026-09-23T00:00:00Z · GET /api/entities · 200 · auth_success · local', {
        selector: 'small',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.textContent === '2026-09-23T00:00:00Z · GET /api/entities · 200 · auth_rate_limited · remote', {
        selector: 'small',
      }),
    ).toBeInTheDocument();
    // has_more is now false on the appended page, so the "load older" button
    // should be gone.
    expect(screen.queryByRole('button', {name: 'Load 100 older events'})).not.toBeInTheDocument();

    const [olderUrl] = fetchMock.mock.calls[5];
    expect(olderUrl).toContain('/api/settings/security/audit?limit=100&offset=100');
  });

  it('previews retention, requires the exact confirmation phrase, and applies it', async () => {
    const {fetchMock} = await bootstrapAndOpenSecurityPanel();

    fetchMock.mockResolvedValueOnce(jsonResponse(retentionPreview())); // GET retention-preview

    await userEvent.setup().click(screen.getByRole('button', {name: 'Preview 90-day retention'}));

    await screen.findByText(
      (_, node) => node?.textContent === '200 line(s) · 195 valid · 5 malformed retained · 50 would remove',
    );
    expect(screen.getByText('Preview: 50 old/excess audit record(s) would be removed; malformed lines are retained.')).toBeInTheDocument();

    const pruneButton = screen.getByRole('button', {name: 'Prune old audit records'});
    expect(pruneButton).toBeDisabled();

    const confirmationInput = screen.getByPlaceholderText('Type PRUNE SECURITY AUDIT');
    const user = userEvent.setup();
    await user.type(confirmationInput, 'prune security audit');
    expect(pruneButton).toBeDisabled();

    await user.clear(confirmationInput);
    await user.type(confirmationInput, 'PRUNE SECURITY AUDIT');
    expect(pruneButton).not.toBeDisabled();

    fetchMock
      .mockResolvedValueOnce(jsonResponse({...retentionPreview(), removed: 50, applied: true})) // POST retention
      .mockResolvedValueOnce(jsonResponse(auditView({records: [], returned: 0, total_matched: 100, has_more: false, next_offset: null}))) // loadSecurityAudit() reload
      .mockResolvedValueOnce(jsonResponse({...auditSummary, total_records: 100, local_records: 90, remote_records: 10}));

    await user.click(pruneButton);

    // applyAuditRetention() briefly sets "Removed 50 audit record(s)...",
    // but its own next line -- await loadSecurityAudit() -- immediately
    // overwrites that status with the reload's own message, same pattern as
    // uploadDocument's transient status in cycle 7. What persists is the
    // reload's status text and the refreshed counts, not the "Removed..."
    // message.
    await screen.findByText('Loaded 0 of 100 security event(s).');

    const [pruneUrl, pruneInit] = fetchMock.mock.calls[4];
    expect(pruneUrl).toContain('/api/settings/security/audit/retention');
    expect((pruneInit as RequestInit).method).toBe('POST');
    expect(JSON.parse((pruneInit as RequestInit).body as string)).toMatchObject({
      keep_days: 90,
      max_records: 5000,
      confirmation: 'PRUNE SECURITY AUDIT',
    });
    // Successful retention clears the confirmation field and reloads the
    // audit list + summary.
    expect(screen.getByPlaceholderText('Type PRUNE SECURITY AUDIT')).toHaveValue('');
    expect(
      screen.getByText((_, node) => node?.textContent === '100 valid event(s) · 90 local · 10 remote · 0 malformed retained'),
    ).toBeInTheDocument();
  });
});
