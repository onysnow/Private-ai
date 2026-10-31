// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 9: the "Security audit metadata" flow inside
// app/page.tsx's "Local security/settings status" details panel
// (loadSecurityAudit, loadOlderSecurityAudit, previewAuditRetention,
// applyAuditRetention). None of these four handlers depend on `inv`, so --
// like the API-access and investigation-search flows (cycles 1-2) -- the
// investigations list is kept empty and no per-investigation loads are
// needed. What IS needed that those cycles didn't: the panel lives inside a
// native <details>/<summary>, closed by default, so each test clicks the
// summary text to open it before querying for anything inside. The stub
// answers by route (ADR-0005, line 15): the audit log route answers by the
// offset asked for, the way the API pages.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import type {MockApi, RouteCall} from '../test-support/mock-api';
import {pageRoutes} from '../test-support/page-routes';

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
  const mod = await import('../components/case/workbench-all');
  return mod.default;
}

const AUDIT = 'GET /api/settings/security/audit';
const SUMMARY = 'GET /api/settings/security/audit/summary';
const RETENTION_PREVIEW = 'GET /api/settings/security/audit/retention-preview';
const RETENTION = 'POST /api/settings/security/audit/retention';

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

async function bootstrapAndOpenSecurityPanel(): Promise<MockApi> {
  // An empty investigation list: nothing beyond the three bootstrap routes.
  const api = mockApi(pageRoutes());

  const Home = await importHome();
  render(<Home />);
  await screen.findByText('API: local access');

  await userEvent.setup().click(screen.getByText('Local security/settings status'));
  await screen.findByText('Load recent security events');

  return api;
}

/** The limit and offset an audit-log request asked for. */
function page(call: {url: URL}): {limit: string | null; offset: string | null} {
  return {limit: call.url.searchParams.get('limit'), offset: call.url.searchParams.get('offset')};
}

describe('Home security audit metadata', () => {
  it('loads recent security events and their summary', async () => {
    const api = await bootstrapAndOpenSecurityPanel();

    api.add({[AUDIT]: auditView(), [SUMMARY]: auditSummary});

    await userEvent.setup().click(screen.getByRole('button', {name: 'Load recent security events'}));

    await screen.findByText('Loaded 1 of 150 security event(s).');

    expect(
      screen.getByText((_, node) => /^✓ opened a page of the app2026-09-2\d \d\d:\d\d · this computer · allowed$/.test(node?.textContent ?? ''), {
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

    expect(api.calls(AUDIT).map(page)).toEqual([{limit: '100', offset: '0'}]);
    expect(api.calls(SUMMARY)).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });

  it('loads older security events and appends them to the list', async () => {
    const api = await bootstrapAndOpenSecurityPanel();

    // The log answers by page: the first page, then the older one.
    const olderPage = auditView({
      records: [auditRecord({request_id: 'req-2', event: 'auth_rate_limited', local_request: false})],
      returned: 1,
      has_more: false,
      next_offset: null,
    });
    api.add({
      [AUDIT]: ({url}: RouteCall) => (url.searchParams.get('offset') === '100' ? olderPage : auditView()),
      [SUMMARY]: auditSummary,
    });

    await userEvent.setup().click(screen.getByRole('button', {name: 'Load recent security events'}));
    await screen.findByText('Showing 1 of 150 matching event(s).');

    await userEvent.setup().click(screen.getByRole('button', {name: 'Load 100 older events'}));

    await screen.findByText('Showing 2 of 150 matching event(s).');
    expect(
      screen.getByText((_, node) => /^✓ opened a page of the app2026-09-2\d \d\d:\d\d · this computer · allowed$/.test(node?.textContent ?? ''), {
        selector: 'small',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => /^✕ opened a page of the app2026-09-2\d \d\d:\d\d · another device.* · refused$/.test(node?.textContent ?? ''), {
        selector: 'small',
      }),
    ).toBeInTheDocument();
    // has_more is now false on the appended page, so the "load older" button
    // should be gone.
    expect(screen.queryByRole('button', {name: 'Load 100 older events'})).not.toBeInTheDocument();

    expect(api.calls(AUDIT).map(page)).toEqual([{limit: '100', offset: '0'}, {limit: '100', offset: '100'}]);
    expect(api.unmatched()).toEqual([]);
  });

  it('previews retention, requires the exact confirmation phrase, and applies it', async () => {
    const api = await bootstrapAndOpenSecurityPanel();

    api.add({[RETENTION_PREVIEW]: retentionPreview()});

    await userEvent.setup().click(screen.getByRole('button', {name: 'Preview 90-day retention'}));

    await screen.findByText(
      (_, node) => node?.textContent === '200 line(s) · 195 valid · 5 malformed retained · 50 would remove',
    );
    expect(screen.getByText('Preview: 50 old/excess audit record(s) would be removed; malformed lines are retained.')).toBeInTheDocument();
    expect(api.calls(RETENTION_PREVIEW)).toHaveLength(1);
    expect(api.lastUrl(RETENTION_PREVIEW).searchParams.get('keep_days')).toBe('90');
    expect(api.lastUrl(RETENTION_PREVIEW).searchParams.get('max_records')).toBe('5000');

    const pruneButton = screen.getByRole('button', {name: 'Prune old audit records'});
    expect(pruneButton).toBeDisabled();

    const confirmationInput = screen.getByPlaceholderText('Type PRUNE SECURITY AUDIT');
    const user = userEvent.setup();
    await user.type(confirmationInput, 'prune security audit');
    expect(pruneButton).toBeDisabled();
    expect(api.calls(RETENTION)).toHaveLength(0);

    await user.clear(confirmationInput);
    await user.type(confirmationInput, 'PRUNE SECURITY AUDIT');
    expect(pruneButton).not.toBeDisabled();

    // After the prune the log is shorter, and loadSecurityAudit() reloads it.
    api.add({
      [RETENTION]: {...retentionPreview(), removed: 50, applied: true},
      [AUDIT]: auditView({records: [], returned: 0, total_matched: 100, has_more: false, next_offset: null}),
      [SUMMARY]: {...auditSummary, total_records: 100, local_records: 90, remote_records: 10},
    });

    await user.click(pruneButton);

    // applyAuditRetention() briefly sets "Removed 50 audit record(s)...",
    // but its own next line -- await loadSecurityAudit() -- immediately
    // overwrites that status with the reload's own message, same pattern as
    // uploadDocument's transient status in cycle 7. What persists is the
    // reload's status text and the refreshed counts, not the "Removed..."
    // message.
    await screen.findByText('Loaded 0 of 100 security event(s).');

    expect(api.calls(RETENTION)).toHaveLength(1);
    expect(api.lastBody(RETENTION)).toMatchObject({
      keep_days: 90,
      max_records: 5000,
      confirmation: 'PRUNE SECURITY AUDIT',
    });
    // Successful retention clears the confirmation field and reloads the
    // audit list + summary.
    expect(screen.getByPlaceholderText('Type PRUNE SECURITY AUDIT')).toHaveValue('');
    expect(
      screen.getByText((_, node) => node?.textContent === '100 valid event(s) · 90 local · 10 remote · 0 malformed retained', {selector: 'small'}),
    ).toBeInTheDocument();
    expect(api.calls(AUDIT)).toHaveLength(1);
    expect(api.calls(SUMMARY)).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });
});
