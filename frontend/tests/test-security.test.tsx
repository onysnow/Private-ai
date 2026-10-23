// @vitest-environment jsdom
// The local security and settings block, moved out of app/page.tsx onto the
// generated client (Foundation Fixes fixes 2 and 3): what the server is
// configured with, connector credentials (saved and removed locally, never
// returned), the unreferenced files under document storage, and the
// metadata-only security audit log with its retention.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {SecurityPanel} from '../features/security/security-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {SettingsStatusOut} from '../lib/generated/types.gen';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';
import type {RouteCall, Routes} from '../test-support/mock-api';
import {validSettingsStatus} from '../test-support/page-routes';

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const AUDIT = 'GET /api/settings/security/audit';
const SUMMARY = 'GET /api/settings/security/audit/summary';
const RETENTION_PREVIEW = 'GET /api/settings/security/audit/retention-preview';
const RETENTION = 'POST /api/settings/security/audit/retention';
const SETTINGS = 'GET /api/settings/status';

const credentialStatus = {configured: true, source: 'local_store', local_store_present: true, permissions_restricted: true, storage_protection: 'owner_permissions'};
const status = validSettingsStatus as SettingsStatusOut;

function auditRecord(overrides: Record<string, unknown> = {}) {
  return {timestamp: '2026-09-23T00:00:00Z', event: 'auth_success', request_id: 'req-1', method: 'GET', path: '/api/entities', status_code: 200, local_request: true, ...overrides};
}

function auditView(overrides: Record<string, unknown> = {}) {
  return {records: [auditRecord()], returned: 1, total_matched: 150, offset: 0, has_more: true, next_offset: 100, malformed_lines: 0, file_bytes: 12345, ...overrides};
}

const auditSummary = {total_records: 150, malformed_lines: 0, local_records: 140, remote_records: 10, by_event: {auth_success: 140, auth_rate_limited: 10}, by_method: {GET: 100, POST: 50}, by_status: {'200': 140, '429': 10}, file_bytes: 12345};

function retentionPreview(overrides: Record<string, unknown> = {}) {
  return {keep_days: 90, max_records: 5000, total_lines: 200, valid_records: 195, malformed_lines: 5, would_keep: 150, would_remove: 50, file_bytes: 12345, ...overrides};
}

async function renderOpen(routes: Routes = {}, settings: SettingsStatusOut = status) {
  const api = mockApi(routes);
  wrap(<SecurityPanel settingsStatus={settings} providers={['aleph', 'opensanctions']}/>);
  await userEvent.setup().click(screen.getByText('Local security/settings status'));
  await screen.findByText('Load recent security events');
  return api;
}

const page = (call: RouteCall) => ({limit: call.url.searchParams.get('limit'), offset: call.url.searchParams.get('offset')});

describe('SecurityPanel', () => {
  it('shows the server\'s configuration and the denial summary', async () => {
    await renderOpen({}, {
      ...status, environment: 'production', database: 'postgresql://***@db/journalism', cors_allowed_origins: ['https://workbench.example'],
      connectors: {aleph: credentialStatus, opensanctions: {...credentialStatus, configured: false, source: 'none', local_store_present: false}},
      security: {...status.security, total_denials: 25, needs_attention: true, by_event: {...status.security.by_event, auth_rate_limited: 2}, remote_hosts: [{client_host: '203.0.113.9', count: 20}]},
    });
    expect(screen.getByText('Environment: production')).toBeInTheDocument();
    expect(screen.getByText('Database: postgresql://***@db/journalism')).toBeInTheDocument();
    expect(screen.getByText("Entity extraction owner: Workbench's own name-finder (switched off)")).toBeInTheDocument();
    expect(screen.getByText('Allowed browser origins: https://workbench.example')).toBeInTheDocument();
    expect(screen.getByText('Connector credentials: Aleph: configured (local_store) · Opensanctions: not configured (none)')).toBeInTheDocument();
    expect(screen.getByText('API access: local only · token configured: no')).toBeInTheDocument();
    expect(screen.getByTestId('security-alerts')).toHaveTextContent('⚠ Access denials in the last 24h: 25 · 2 lockout(s) · busiest remote host 203.0.113.9 (20) — worth a look at the audit log');
  });

  it('says OpenAleph finds names, with the Workbench finder only as the fallback, when OpenAleph reads uploads', async () => {
    const extraction = {...status.document_extraction, entity_extraction_owner: 'openaleph_ftm_analyze' as const, local_entity_suggestions_enabled: true};
    await renderOpen({}, {...status, document_extraction: extraction});
    expect(screen.getByText("Entity extraction owner: OpenAleph / ftm-analyze (the Workbench's own name-finder only for documents OpenAleph did not analyse)")).toBeInTheDocument();
    cleanup();
    await renderOpen({}, {...status, document_extraction: {...extraction, local_entity_suggestions_enabled: false}});
    expect(screen.getByText("Entity extraction owner: OpenAleph / ftm-analyze (the Workbench's own name-finder only for documents OpenAleph did not analyse; switched off)")).toBeInTheDocument();
  });

  it('saves a credential for the chosen connector, clears the field, and marks the settings status stale', async () => {
    const save = 'PUT /api/settings/connectors/opensanctions/credential';
    const api = await renderOpen({[save]: {provider: 'opensanctions', ...credentialStatus}, [SETTINGS]: status});
    expect(screen.getByRole('button', {name: 'Save local credential'})).toBeDisabled();
    const user = userEvent.setup();
    const trigger = screen.getAllByRole('combobox').find(el => el.textContent === 'Aleph')!;
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', {name: 'Opensanctions'}));
    await user.type(screen.getByPlaceholderText('Paste credential'), 'os-secret');
    await user.click(screen.getByRole('button', {name: 'Save local credential'}));

    await screen.findByText('Opensanctions credential saved. Active source: local_store. The secret is not returned by the API.');
    expect(api.lastBody(save)).toEqual({credential: 'os-secret'});
    expect(screen.getByPlaceholderText('Paste credential')).toHaveValue('');
    // The settings status is only marked stale: the page's access check reads it, not this panel.
    expect(api.calls(SETTINGS)).toHaveLength(0);
    expect(api.unmatched()).toEqual([]);
  });

  it('removes a local credential and says whether the connector is still configured from elsewhere', async () => {
    const remove = 'DELETE /api/settings/connectors/aleph/credential';
    const api = await renderOpen({[remove]: {provider: 'aleph', removed: true, ...credentialStatus, source: 'environment', local_store_present: false}});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Remove local credential'}));
    await screen.findByText('Local credential removed; aleph is still configured from environment.');

    api.add({[remove]: {provider: 'aleph', removed: true, ...credentialStatus, configured: false, source: 'none', local_store_present: false}});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Remove local credential'}));
    await screen.findByText('aleph credential removed; connector is now unconfigured.');
    expect(api.calls(remove)).toHaveLength(2);
  });

  it('shows why a credential could not be saved', async () => {
    await renderOpen({'PUT /api/settings/connectors/aleph/credential': {status: 500, body: {detail: 'Could not securely store connector credential'}}});
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Paste credential'), 'secret');
    await user.click(screen.getByRole('button', {name: 'Save local credential'}));
    await screen.findByText(/Could not securely store connector credential/);
    expect(screen.getByPlaceholderText('Paste credential')).toHaveValue('');
  });

  it('previews the unreferenced document files', async () => {
    const orphans = 'GET /api/settings/storage/orphans';
    const api = await renderOpen({[orphans]: {
      storage_root: '/tmp/docs', orphan_files: [{relative_path: 'stray.bin', size_bytes: 6, modified_at: 1759300000, action: 'retain_until_explicit_cleanup'}],
      orphan_file_count: 1, orphan_bytes: 6, unsafe_document_references: [{document_id: 'doc-9', storage_path: '../outside', error: 'escapes the storage root'}], cleanup_available: false, policy: 'preview_only_retain_by_default',
    }});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Preview retained orphan files'}));
    await screen.findByText('Found 1 unreferenced file(s). They are retained; cleanup is not automatic.');
    expect(screen.getByText('1 file(s) · 6 bytes · policy: retain by default')).toBeInTheDocument();
    expect(screen.getByText('stray.bin — 6 bytes')).toBeInTheDocument();
    expect(screen.getByText('Unsafe database paths detected: 1')).toBeInTheDocument();
    expect(api.calls(orphans)).toHaveLength(1);
  });

  it('loads recent security events with their summary, then older ones', async () => {
    const older = auditView({records: [auditRecord({request_id: 'req-2', event: 'auth_rate_limited', local_request: false, client_host: '203.0.113.9'})], has_more: false, next_offset: null});
    const api = await renderOpen({[AUDIT]: ({url}: RouteCall) => (url.searchParams.get('offset') === '100' ? older : auditView()), [SUMMARY]: auditSummary});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Load recent security events'}));

    await screen.findByText('Loaded 1 of 150 security event(s).');
    expect(screen.getByText((_, node) => /^2026-09-2\d \d\d:\d\d · this computer · opened a page of the app · ✓ allowed$/.test(node?.textContent ?? ''), {selector: 'small'})).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === '150 valid event(s) · 140 local · 10 remote · 0 malformed retained', {selector: 'small'})).toBeInTheDocument();
    expect(screen.getByText('Methods: GET 100 · POST 50')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 150 matching event(s).')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', {name: 'Load 100 older events'}));
    await screen.findByText('Showing 2 of 150 matching event(s).');
    expect(screen.getByText((_, node) => /^2026-09-2\d \d\d:\d\d · another device.* · opened a page of the app · ✕ refused$/.test(node?.textContent ?? ''), {selector: 'small'})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Load 100 older events'})).not.toBeInTheDocument();
    expect(api.calls(AUDIT).map(page)).toEqual([{limit: '100', offset: '0'}, {limit: '100', offset: '100'}]);
    expect(api.calls(SUMMARY)).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });

  it('reports malformed lines kept for review', async () => {
    await renderOpen({[AUDIT]: auditView({malformed_lines: 3, has_more: false, next_offset: null}), [SUMMARY]: {...auditSummary, malformed_lines: 3}});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Load recent security events'}));
    await screen.findByText('Loaded 1 of 150 event(s); 3 malformed line(s) retained for review.');
  });

  it('previews retention, requires the exact confirmation phrase, applies it and reloads the log', async () => {
    const api = await renderOpen({[RETENTION_PREVIEW]: retentionPreview()});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Preview 90-day retention'}));
    await screen.findByText((_, node) => node?.textContent === '200 line(s) · 195 valid · 5 malformed retained · 50 would remove');
    expect(screen.getByText('Preview: 50 old/excess audit record(s) would be removed; malformed lines are retained.')).toBeInTheDocument();
    expect(api.lastUrl(RETENTION_PREVIEW).searchParams.get('keep_days')).toBe('90');
    expect(api.lastUrl(RETENTION_PREVIEW).searchParams.get('max_records')).toBe('5000');

    const prune = screen.getByRole('button', {name: 'Prune old audit records'});
    expect(prune).toBeDisabled();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Type PRUNE SECURITY AUDIT'), 'prune security audit');
    expect(prune).toBeDisabled();
    await user.clear(screen.getByPlaceholderText('Type PRUNE SECURITY AUDIT'));
    await user.type(screen.getByPlaceholderText('Type PRUNE SECURITY AUDIT'), 'PRUNE SECURITY AUDIT');
    expect(prune).toBeEnabled();

    api.add({
      [RETENTION]: {...retentionPreview(), removed: 50, applied: true},
      [AUDIT]: auditView({records: [], returned: 0, total_matched: 100, has_more: false, next_offset: null}),
      [SUMMARY]: {...auditSummary, total_records: 100, local_records: 90},
    });
    await user.click(prune);

    await screen.findByText('Loaded 0 of 100 security event(s).');
    expect(api.lastBody(RETENTION)).toEqual({keep_days: 90, max_records: 5000, confirmation: 'PRUNE SECURITY AUDIT'});
    expect(screen.getByPlaceholderText('Type PRUNE SECURITY AUDIT')).toHaveValue('');
    expect(screen.getByText((_, node) => node?.textContent === '100 valid event(s) · 90 local · 10 remote · 0 malformed retained')).toBeInTheDocument();
    expect(api.calls(AUDIT)).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });

  it('says nothing would be removed when the preview finds nothing', async () => {
    await renderOpen({[RETENTION_PREVIEW]: retentionPreview({would_remove: 0})});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Preview 90-day retention'}));
    await screen.findByText('Preview: no audit records would be removed.');
    expect(screen.queryByPlaceholderText('Type PRUNE SECURITY AUDIT')).not.toBeInTheDocument();
  });

  it('shows the server\'s reason when the audit log cannot be read', async () => {
    const api = await renderOpen({[AUDIT]: {status: 403, body: {detail: 'Audit access is for the local machine only'}}, [SUMMARY]: auditSummary});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Load recent security events'}));
    await screen.findByText(/Audit access is for the local machine only/);
    await waitFor(() => expect(api.calls(SUMMARY)).toHaveLength(1));
    expect(screen.queryByText('Showing 1 of 150 matching event(s).')).not.toBeInTheDocument();
  });
});
