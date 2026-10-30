// @vitest-environment jsdom
// Keep › Access (30 Oct) and Settings › Security log, converted: who can reach the case (the people and their keys),
// the ways in as big words with their detail revealed, the server's setup as spaced marks, the stray files as one quiet
// action; and the log pane loading its events with the pane, the previews as small secondary actions.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {AccessScreen} from '../features/security/access-screen';
import {SecurityPanel} from '../features/security/security-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {useLockStore} from '../lib/app-lock';
import type {SettingsStatusOut} from '../lib/generated/types.gen';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';
import {validSettingsStatus} from '../test-support/page-routes';

vi.mock('next/link', () => ({default: ({href, children, ...rest}: {href: string; children: React.ReactNode}) => <a href={href} {...rest}>{children}</a>}));

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);
const status = validSettingsStatus as SettingsStatusOut;

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); useLockStore.setState({state: null}); });

const AUDIT = 'GET /api/settings/security/audit';
const SUMMARY = 'GET /api/settings/security/audit/summary';
const ORPHANS = 'GET /api/settings/storage/orphans';
const auditView = {records: [{timestamp: '2026-09-23T00:00:00Z', event: 'auth_success', request_id: 'req-1', method: 'GET', path: '/api/entities', status_code: 200, local_request: true}],
  returned: 1, total_matched: 1, offset: 0, has_more: false, next_offset: null, malformed_lines: 0, file_bytes: 10};
const auditSummary = {total_records: 1, malformed_lines: 0, local_records: 1, remote_records: 0, by_event: {auth_success: 1}, by_method: {GET: 1}, by_status: {'200': 1}, file_bytes: 10};

describe('Settings › Security log', () => {
  it('loads the events with the pane, shows the setup as marks with their values revealed, and keeps the previews small', async () => {
    const api = mockApi({[AUDIT]: auditView, [SUMMARY]: auditSummary});
    wrap(<SecurityPanel settingsStatus={status} providers={['aleph']} part="log"/>);
    expect(await screen.findByText('Loaded 1 of 1 security event(s).')).toBeInTheDocument();
    expect(api.calls(AUDIT)).toHaveLength(1);
    expect(screen.queryByRole('button', {name: 'Load recent security events'})).not.toBeInTheDocument();
    // Each fact is its own item in a list, so the names never run together.
    const facts = screen.getByRole('list', {name: "This server's setup"});
    expect(facts.querySelectorAll('li')).toHaveLength(8);
    expect(screen.getByText('Database').closest('.rv')).toHaveAccessibleDescription('Database: sqlite');
    // The denial count shows; its sentence is revealed on it.
    expect(screen.getByTestId('security-alerts')).toHaveTextContent('0 denied · 24h');
    // The two previews are small secondary actions.
    expect(screen.getByRole('button', {name: 'Preview 90-day retention'})).toHaveClass('sec-quiet');
    expect(screen.getByRole('button', {name: 'Stray files'})).toHaveClass('sec-quiet');
  });
});

describe('Keep › Access', () => {
  it('says who can reach the case and how: the network, the lock, the refusals, the seal, the keys', async () => {
    useLockStore.setState({state: {protection: 'passphrase', locked: false, pin: false, idle_minutes: 15, backups_encrypted: true, name: 'Ony'}});
    mockApi({'GET /api/settings/security/users': [], 'GET /api/investigations/inv-1/deciders': {days: 30, people: []},
      [ORPHANS]: {storage_root: '/tmp/docs', orphan_file_count: 2, orphan_bytes: 4100, unsafe_document_references: [], cleanup_available: false, policy: 'preview_only_retain_by_default',
        orphan_files: ['a.bin', 'b.bin'].map(relative_path => ({relative_path, size_bytes: 2050, modified_at: 1759300000, action: 'retain_until_explicit_cleanup'}))}});
    wrap(<AccessScreen investigationId="inv-1" caseName="1MDB" settingsStatus={status}/>);
    expect(screen.getByRole('heading', {name: 'Who can reach 1MDB, and how'})).toBeInTheDocument();
    expect(screen.getByText('Only this computer', {selector: 'strong'}).closest('.rv')).toHaveAccessibleDescription(/local only/);
    expect(screen.getByText('Passphrase', {selector: 'strong'}).closest('.rv')).toHaveAccessibleDescription(/locks after 15 min away/);
    expect(screen.getByText('Sealed', {selector: 'strong'})).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Security log ›'})).toHaveAttribute('href', '/settings#log');
    expect(screen.getByRole('link', {name: 'Connector keys ›'})).toHaveAttribute('href', '/settings#keys');
    // The people and their keys, as in Settings › People and access.
    expect(await screen.findByText('Who can reach 1MDB')).toBeInTheDocument();
    // The server's setup sits in the people's column, under who decided what; the ways in have the right column alone.
    const people = screen.getByRole('region', {name: 'People and access keys'});
    expect(within(people).getByRole('list', {name: "This server's setup"})).toBeInTheDocument();
    expect(within(screen.getByRole('complementary', {name: 'Ways in'})).queryByRole('list', {name: "This server's setup"})).toBeNull();
    // The stray files: one quiet action, the count after it.
    await userEvent.setup().click(screen.getByRole('button', {name: 'Look at stray files'}));
    expect(await screen.findByText('2 file(s) · 4 KB')).toBeInTheDocument();
  });

  it('keeps an alert written out when the refusals need a look', () => {
    useLockStore.setState({state: {protection: 'none', locked: false, pin: false}});
    mockApi({'GET /api/settings/security/users': [], 'GET /api/investigations/inv-1/deciders': {days: 30, people: []}});
    const busy = {...status, security: {...status.security, total_denials: 25, needs_attention: true}} as SettingsStatusOut;
    wrap(<AccessScreen investigationId="inv-1" settingsStatus={busy}/>);
    expect(screen.getByRole('alert')).toHaveTextContent('⚠ Access denials in the last 24h: 25');
    expect(screen.getByText('Nothing to unlock', {selector: 'strong'})).toBeInTheDocument();
    expect(screen.getByText('Not sealed', {selector: 'strong'})).toBeInTheDocument();
  });
});
