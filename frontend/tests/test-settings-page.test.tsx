// @vitest-environment jsdom
// The settings screen on the generated client and TanStack Query (Foundation
// Fixes fixes 2 and 3): the API access check (local access, a token asked
// for, saved and cleared, remote access switched off, no connection), and
// demo mode (seed, hide, preview and delete).
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import type {RouteCall, Routes} from '../test-support/mock-api';
import {investigationRecord, validSettingsStatus} from '../test-support/page-routes';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/settings'}));

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

const STATUS = 'GET /api/settings/status';
const LIST = 'GET /api/investigations';
const DEMO = investigationRecord({id: 'inv-demo', name: 'Demo Investigation', is_demo: true});
const CASE = investigationRecord({id: 'inv-1', name: 'Harbor contracts'});

async function renderSettings(routes: Routes) {
  const api = mockApi(routes);
  vi.resetModules();
  const {default: Settings} = await import('../app/settings/page');
  render(<Settings/>);
  return api;
}

const authorization = (call: RouteCall) => new Headers(call.init.headers).get('authorization');

/** The status behind a bearer token: 401 without one, the status with it. */
function behindToken(call: RouteCall): unknown {
  return authorization(call) ? {...validSettingsStatus, access: {...validSettingsStatus.access, remote_api_enabled: true, mode: 'shared_bearer', token_configured: true}}
    : {status: 401, body: {detail: 'Bearer token required'}};
}

describe('Settings: API access', () => {
  it('says the API is local-only and how the backend is configured', async () => {
    const api = await renderSettings({[STATUS]: validSettingsStatus, [LIST]: []});
    await screen.findByText('Local-only API access. No bearer token is required on loopback.');
    expect(screen.getByText(/Access mode: local only/)).toHaveTextContent('Access mode: local only · token configured on backend: no');
    expect(screen.queryByPlaceholderText('Bearer token')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Clear session token'})).not.toBeInTheDocument();
    expect(api.unmatched()).toEqual([]);
  });

  it('asks for a token, uses it for this session, and forgets it again', async () => {
    const api = await renderSettings({[STATUS]: behindToken, [LIST]: []});
    await screen.findByText('This API requires a bearer token for non-local access. Enter it below.');
    const user = userEvent.setup();
    expect(screen.getByRole('button', {name: 'Save token'})).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Bearer token'), '  session-token  ');
    await user.click(screen.getByRole('button', {name: 'Save token'}));

    await screen.findByText('Authenticated for this browser session. The token is held only in memory and is not written to storage.');
    expect(screen.getByText(/Access mode:/)).toHaveTextContent('Access mode: shared bearer for remote clients · token configured on backend: yes');
    expect(screen.getByPlaceholderText('Bearer token')).toHaveValue('');

    await user.click(screen.getByRole('button', {name: 'Clear session token'}));
    await screen.findByText('This API requires a bearer token for non-local access. Enter it below.');
    expect(screen.queryByRole('button', {name: 'Clear session token'})).not.toBeInTheDocument();
    expect(api.calls(STATUS).map(authorization)).toEqual([null, 'Bearer session-token', null]);
  });

  it('says when remote access is switched off on the backend', async () => {
    await renderSettings({[STATUS]: {status: 403, body: {detail: 'Remote API access is disabled'}}, [LIST]: []});
    await screen.findByText('Remote API access is disabled on the backend.');
    expect(screen.queryByPlaceholderText('Bearer token')).not.toBeInTheDocument();
  });

  it('says why the API could not be reached', async () => {
    await renderSettings({[STATUS]: {status: 500, body: {detail: 'Internal server error (request r-1)'}}, [LIST]: []});
    await screen.findByText(/Internal server error \(request r-1\)/);
  });
});

describe('Settings: demo mode', () => {
  it('adds the demo investigation and says when it is ready', async () => {
    let seeded = false;
    const api = await renderSettings({
      [STATUS]: validSettingsStatus,
      [LIST]: () => (seeded ? [CASE, DEMO] : [CASE]),
      'POST /api/demo/seed': () => { seeded = true; return {investigation_id: 'inv-demo', created: true}; },
    });
    await screen.findByText('No demo investigation yet.');
    expect(screen.queryByRole('button', {name: 'Hide demo investigation'})).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', {name: 'Add demo data'}));

    await screen.findByText('Demo investigation is ready.');
    expect(screen.getByText('Demo investigation: "Demo Investigation"')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Re-seed demo data'})).toBeInTheDocument();
    expect(api.calls('POST /api/demo/seed')).toHaveLength(1);
    expect(api.calls(LIST)).toHaveLength(2);
  });

  it('hides the demo investigation in this browser only', async () => {
    await renderSettings({[STATUS]: validSettingsStatus, [LIST]: [DEMO]});
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Hide demo investigation'}));
    expect(window.localStorage.getItem('pai:hide-demo-investigations')).toBe('1');
    expect(screen.getByText(/Hidden from investigation pickers in this browser only/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Show demo investigation'}));
    expect(window.localStorage.getItem('pai:hide-demo-investigations')).toBeNull();
  });

  it('previews the deletion, then deletes only after the exact id is typed', async () => {
    let deleted = false;
    const preview = {
      investigation_id: 'inv-demo', investigation_name: 'Demo Investigation', record_counts: {entities: 9, claims: 3}, record_total: 12,
      document_files: [], document_file_summary: {delete: 2, preserve_shared: 0, already_missing: 0, unsafe: 0}, unsafe_paths: [],
      can_delete: true, requires_confirmation: 'inv-demo',
    };
    const api = await renderSettings({
      [STATUS]: validSettingsStatus,
      [LIST]: () => (deleted ? [CASE] : [CASE, DEMO]),
      'GET /api/investigations/inv-demo/deletion-preview': preview,
      'DELETE /api/investigations/inv-demo': () => {
        deleted = true;
        return {investigation_id: 'inv-demo', deleted: true, deleted_record_counts: {entities: 9, claims: 3}, deleted_record_total: 12,
                document_files_deleted: 2, shared_document_files_preserved: 0, missing_document_files: 0};
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Preview deletion'}));

    await screen.findByText('Preview ready. Type the exact investigation ID to enable deletion.');
    expect(screen.getByText(/This will remove 12 record\(s\)/)).toHaveTextContent('This will remove 12 record(s) and 2 document file(s). Type inv-demo to confirm.');
    const remove = screen.getByRole('button', {name: 'Delete permanently'});
    expect(remove).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Investigation ID'), 'inv-demo');
    await user.click(remove);

    await screen.findByText('Deleted 12 record(s) and 2 document file(s).');
    await screen.findByText('No demo investigation yet.');
    expect(api.lastUrl('DELETE /api/investigations/inv-demo').searchParams.get('confirmation')).toBe('inv-demo');
    expect(api.unmatched()).toEqual([]);
  });

  it('says when the deletion is blocked, and cancels the preview', async () => {
    await renderSettings({
      [STATUS]: validSettingsStatus,
      [LIST]: [DEMO],
      'GET /api/investigations/inv-demo/deletion-preview': {
        investigation_id: 'inv-demo', investigation_name: 'Demo Investigation', record_counts: {}, record_total: 0, document_files: [],
        document_file_summary: {delete: 0, preserve_shared: 0, already_missing: 0, unsafe: 1},
        unsafe_paths: [{document_id: 'doc-1', storage_path: '../outside', error: 'outside storage'}], can_delete: false, requires_confirmation: 'inv-demo',
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Preview deletion'}));
    await screen.findByText('Deletion is blocked by an unsafe document path.');
    await user.type(screen.getByPlaceholderText('Investigation ID'), 'inv-demo');
    expect(screen.getByRole('button', {name: 'Delete permanently'})).toBeDisabled();
    await user.click(screen.getByRole('button', {name: 'Cancel'}));
    expect(screen.getByRole('button', {name: 'Preview deletion'})).toBeInTheDocument();
  });

  it('says why the demo status could not be checked', async () => {
    await renderSettings({[STATUS]: validSettingsStatus, [LIST]: {status: 500, body: {detail: 'Database unavailable'}}});
    await screen.findByText(/Database unavailable/);
    expect(screen.getByText('No demo investigation yet.')).toBeInTheDocument();
  });
});
