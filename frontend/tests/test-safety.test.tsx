// @vitest-environment jsdom
// Keep › Safety & data (mockup KEEP-safety-and-data; features/safety/*): totals with zeroes stated and the period
// switch; the six stores; the services with their mode chips (a change goes to the server); the lines' words; the
// outbound log word for word; the private answers; deleting by typing the case's name.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import SafetyPage from '../app/keep/safety/page';
import {ago, bytes, lineLabel, sinceOf} from '../features/safety/format';
import {safetySigns} from '../features/safety/your-safety';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {RedFlagOut, SafetyServiceOut, SafetySummaryOut} from '../lib/generated/types.gen';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import type {RouteCall} from '../test-support/mock-api';

const push = vi.fn();
vi.mock('next/navigation', () => ({useRouter: () => ({push}), usePathname: () => '/keep/safety', useSearchParams: () => new URLSearchParams()}));

const INV = 'inv-1';
const request = (id: string, service: string, value: string, kind: string, at: string) => ({id, service, service_name: service === 'aleph' ? 'Aleph' : 'OpenSanctions',
  kind: 'lookup', value_sent: value, value_kind: kind, reason: 'lookup', started_by: 'person', documents_sent: 0, created_at: at});
const service = (over: Partial<SafetyServiceOut> & {service: string; name: string}): SafetyServiceOut => ({line: '', mode: 'ASK', locked_reason: null, configured: true,
  sent_count: 0, sent_kinds: [], ever_used: false, last: [], ...over});

function summary(over: Partial<SafetySummaryOut> = {}): SafetySummaryOut {
  const quay = request('r1', 'aleph', '14 Quay Street, Douglas', 'search text', '2026-10-19T10:42:00');
  return {
    investigation_id: INV, investigation_name: 'Harbour land', since: null,
    totals: {requests: 2, services_reached: 1, documents_sent: 0, ai_calls_outside: 0},
    stores: {
      records: {total: 4812, claims: 37}, documents: {files: 86, size_bytes: 1_503_238_000, missing: 0},
      backups: {count: 1, last_at: '2026-10-07T09:00:00', last_size_bytes: 1_503_238_000, last_sha256: 'ab'.repeat(32), encrypted: false},
      service_keys: {set: 2, total: 3}, security_log: {events: 1204, size_bytes: 9000, keep_days: 90},
      private_ai: {enabled: true, provider: 'ollama', model: 'qwen3:8b', on_this_computer: true, outside_allowed: false},
    },
    services: [
      service({service: 'aleph', name: 'Aleph', line: 'Records and leaks archive (OCCRP)', sent_count: 2, ever_used: true,
        sent_kinds: [{value_kind: 'search text', count: 2}], last: [quay]}),
      service({service: 'firecrawl', name: 'Firecrawl', line: 'Web search', mode: 'OFF'}),
      service({service: 'opensanctions', name: 'OpenSanctions', line: 'Sanctions and officials', mode: 'AUTOMATIC'}),
      service({service: 'outside_ai', name: 'Outside AI services', line: 'An AI model that is not on this computer', mode: 'OFF',
        locked_reason: 'Not allowed on this server', configured: null}),
    ],
    access: {mode: 'local_only', remote_api_enabled: false, refused_24h: 0, needs_attention: false, restore_api_enabled: false},
    delete: {record_total: 4812, files_to_delete: 86, shared_files_kept: 3, can_delete: true},
    questions: [
      {id: 'threats', text: 'Have you, a source or family received threats, or been followed?', indicators: ['SA-013', 'SA-014'], answer: null, answered_at: null},
      {id: 'doxxing', text: 'Has your home address or other private detail been posted online?', indicators: ['SA-018'], answer: 'NO', answered_at: '2026-10-18T09:00:00'},
    ],
    ...over,
  };
}

const redFlags = {investigation_id: INV, rules: [], cannot_run: [], flags: [], gone: [],
  investigation_type: {set_by: 'reporter', areas: [], suggested: []}};
const log = {items: [request('r1', 'aleph', '14 Quay Street, Douglas', 'search text', '2026-10-19T10:42:00'),
  request('r2', 'aleph', 'Harbour Nominees Ltd', 'search text', '2026-10-19T10:41:00')], total: 2, since: null};
const deletion = {investigation_id: INV, investigation_name: 'Harbour land', record_counts: {claims: 37, entities: 120, investigations: 1}, record_total: 4812,
  document_files: [], document_file_summary: {delete: 86, preserve_shared: 3, already_missing: 0, unsafe: 0}, unsafe_paths: [], can_delete: true,
  requires_confirmation: INV, openaleph_collection: null};

function routes(state: {summary: SafetySummaryOut}) {
  return {
    [`GET /api/investigations/${INV}/safety`]: () => state.summary,
    [`GET /api/investigations/${INV}/outbound-log`]: log,
    [`GET /api/investigations/${INV}/red-flags`]: redFlags,
    [`GET /api/investigations/${INV}/deletion-preview`]: deletion,
    'GET /api/settings/status': {status: 403, body: {detail: 'Local only'}},
    'GET /api/settings/storage/orphans': {status: 403, body: {detail: 'Local only'}},
    [`PUT /api/investigations/${INV}/service-modes`]: ({body}: RouteCall) => {
      const b = body as {service: string; mode: SafetyServiceOut['mode']};
      state.summary = {...state.summary, services: state.summary.services.map(s => s.service === b.service ? {...s, mode: b.mode} : s)};
      return state.summary;
    },
    [`PUT /api/investigations/${INV}/safety/answers`]: ({body}: RouteCall) => {
      const b = body as {question: string; answer: 'YES' | 'NO' | 'NOT_SURE' | null};
      state.summary = {...state.summary, questions: state.summary.questions.map(q => q.id === b.question ? {...q, answer: b.answer, answered_at: b.answer ? '2026-10-19T10:00:00' : null} : q)};
      return state.summary;
    },
    [`DELETE /api/investigations/${INV}`]: {investigation_id: INV, deleted: true, deleted_record_counts: {}, deleted_record_total: 4812, document_files_deleted: 86,
      missing_document_files: 0, shared_document_files_preserved: 3, openaleph_collection: null},
  };
}

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: '', investigationName: ''});
  window.history.replaceState(null, '', `/keep/safety?inv=${INV}`);
  push.mockReset();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Safety & data words', () => {
  it('formats sizes, ages, periods and line labels', () => {
    expect(bytes(1_503_238_000)).toBe('1.4 GB');
    expect(bytes(430)).toBe('430 B');
    expect(ago('2026-10-16T09:00:00', new Date('2026-10-19T12:00:00Z'))).toBe('3 days ago');
    expect(sinceOf('all')).toBeNull();
    const now = new Date('2026-10-19T15:30:20');
    expect(new Date(sinceOf('today', now)!).getHours()).toBe(0);
    expect(new Date(sinceOf('week', now)!).getTime()).toBe(new Date('2026-10-12T15:30:00').getTime());
    const s = summary().services;
    expect(lineLabel(s[0])).toBe('search text · 2');
    expect(lineLabel(s[1])).toBe('nothing (off)');
    expect(lineLabel(s[2])).toBe('never used');
    expect(lineLabel(s[3])).toBe('✕ blocked');
  });

  it('keeps only open safety signs, strongest first', () => {
    const flag = (id: string, level: RedFlagOut['level'], status: RedFlagOut['status'] = 'open') => ({id, indicator_id: id, level, status, weight: 1}) as RedFlagOut;
    expect(safetySigns([flag('BO-007', 'textbook'), flag('SA-020', 'faint'), flag('SA-008', 'strong'), flag('SA-001', 'textbook', 'dismissed')]).map(f => f.indicator_id))
      .toEqual(['SA-008', 'SA-020']);
  });
});

describe('Keep › Safety & data', () => {
  it('states the totals with zeroes, the stores and the services, and asks again for a new period', async () => {
    const state = {summary: summary()};
    const api = mockApi(routes(state));
    render(<SafetyPage/>);
    const totals = await screen.findByRole('list', {name: 'What left this computer in this period'});
    expect(within(totals).getByText('requests left this computer').previousSibling?.textContent).toBe('2');
    expect(within(totals).getByText('documents sent out').previousSibling).toHaveProperty('className', 'zero');
    const region = screen.getByRole('group', {name: 'This computer, local only'});
    expect(within(region).getByText('4,812 records · 37 claims')).toBeTruthy();
    expect(within(region).getByText('86 files · 1.4 GB')).toBeTruthy();
    expect(screen.getByText('Not encrypted: keep it safe')).toBeTruthy();
    expect(within(region).getByText('2 of 3 set')).toBeTruthy();
    expect(screen.getByText('Private AI · local model · nothing sent')).toBeTruthy();
    expect(screen.getByText('Not allowed on this server')).toBeTruthy();
    expect(await screen.findByText('No safety signs from your records')).toBeTruthy();
    const week = api.lastUrl(`GET /api/investigations/${INV}/safety`).searchParams.get('since');
    expect(week).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', {name: 'All'}));
    await waitFor(() => expect(api.lastUrl(`GET /api/investigations/${INV}/safety`).searchParams.get('since')).toBeNull());
  });

  it('lists what left word for word, and filters the log by the line you choose', async () => {
    const api = mockApi(routes({summary: summary()}));
    render(<SafetyPage/>);
    const list = await screen.findByLabelText('Requests that left this computer');
    expect(await within(list).findByText('Harbour Nominees Ltd', {selector: 'q'})).toBeTruthy();
    expect(within(list).getByText('14 Quay Street, Douglas', {selector: 'q'})).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', {name: /^Aleph: search text · 2/}));
    await waitFor(() => expect(api.lastUrl(`GET /api/investigations/${INV}/outbound-log`).searchParams.get('service')).toBe('aleph'));
    expect(screen.getByText(/Aleph only/)).toBeTruthy();
  });

  it('changes a service’s mode on the server; a blocked service has no switch', async () => {
    const state = {summary: summary()};
    const api = mockApi(routes(state));
    render(<SafetyPage/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'OpenSanctions: Automatic. Change'}));
    await user.click(within(screen.getByRole('radiogroup', {name: 'OpenSanctions: what may leave'})).getByRole('radio', {name: /Off/}));
    await waitFor(() => expect(api.calls(`PUT /api/investigations/${INV}/service-modes`)).toHaveLength(1));
    expect(api.calls(`PUT /api/investigations/${INV}/service-modes`)[0].body).toEqual({service: 'opensanctions', mode: 'OFF'});
    expect(screen.queryByRole('button', {name: /Outside AI services: Off. Change/})).toBeNull();
  });

  it('keeps the reporter’s answers through the server', async () => {
    const api = mockApi(routes({summary: summary()}));
    render(<SafetyPage/>);
    const group = await screen.findByRole('radiogroup', {name: 'Have you, a source or family received threats, or been followed?'});
    await userEvent.setup().click(within(group).getByRole('radio', {name: 'Not sure'}));
    await waitFor(() => expect(api.calls(`PUT /api/investigations/${INV}/safety/answers`)[0]?.body).toEqual({question: 'threats', answer: 'NOT_SURE'}));
    await waitFor(() => expect(within(group).getByRole('radio', {name: 'Not sure'}).getAttribute('aria-checked')).toBe('true'));
  });

  it('deletes only after the case’s name is typed, and says what went', async () => {
    const api = mockApi(routes({summary: summary()}));
    render(<SafetyPage/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Preview deletion'}));
    const sheet = await screen.findByRole('dialog', {name: 'Delete this case'});
    expect(within(sheet).getByText('120 people and companies')).toBeTruthy();
    await user.click(within(sheet).getByRole('button', {name: 'Continue'}));
    const button = within(sheet).getByRole('button', {name: 'Delete Harbour land from this computer'});
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(sheet).getByRole('textbox'), 'Harbour land');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    await user.click(button);
    expect(await screen.findByText(/Harbour land was deleted: 4,812 records, 86 files\. 3 shared files kept\./)).toBeTruthy();
    expect(api.lastUrl(`DELETE /api/investigations/${INV}`).searchParams.get('confirmation')).toBe(INV);
  });
  it('backs up with a passphrase by default, says the last backup was protected, and saves without one only by choice', async () => {
    const state = {summary: summary()};
    const createObjectURL = vi.fn(() => 'blob:mock');
    (URL as unknown as {createObjectURL: unknown}).createObjectURL = createObjectURL;
    (URL as unknown as {revokeObjectURL: unknown}).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const api = mockApi({...routes(state), [`POST /api/investigations/${INV}/safety/backup`]: ({body}: RouteCall) => {
      const passphrase = (body as {passphrase: string | null}).passphrase;
      state.summary = {...state.summary, stores: {...state.summary.stores,
        backups: {...state.summary.stores.backups, count: 2, last_at: new Date().toISOString(), encrypted: passphrase !== null}}};
      return new Response('zip', {status: 200, headers: {'content-type': 'application/zip'}});
    }});
    render(<SafetyPage/>);
    const user = userEvent.setup();
    expect(await screen.findByText('no passphrase')).toBeTruthy();
    await user.click(screen.getByRole('button', {name: 'Back up now'}));
    const sheet = await screen.findByRole('dialog', {name: 'Back up now'});
    expect(within(sheet).getByText('4,812 records · 37 claims')).toBeTruthy();
    expect(within(sheet).getByRole('checkbox', {name: 'Protect with a passphrase'})).toHaveProperty('checked', true);
    expect(within(sheet).getByText('If you lose this passphrase, nobody can open this backup — not even you.')).toBeTruthy();
    const save = within(sheet).getByRole('button', {name: 'Back up'});
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(sheet).getByLabelText('Passphrase'), 'harbour-lamp');
    await user.type(within(sheet).getByLabelText('Repeat the passphrase'), 'harbour-lamp');
    await user.click(save);
    expect(await within(sheet).findByText('Backup saved, protected with your passphrase. Checked against its checksum.')).toBeTruthy();
    expect(api.lastBody(`POST /api/investigations/${INV}/safety/backup`)).toEqual({passphrase: 'harbour-lamp'});
    expect(await screen.findByText('passphrase')).toBeTruthy();
    await user.click(within(sheet).getByRole('checkbox', {name: 'Protect with a passphrase'}));
    await user.click(within(sheet).getByRole('button', {name: 'Back up without a passphrase'}));
    await within(sheet).findByText('Backup saved without a passphrase. Checked against its checksum.');
    expect(api.lastBody(`POST /api/investigations/${INV}/safety/backup`)).toEqual({passphrase: null});
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });

  it('acts on each stray file: Keep, Add back (opens The Drop), Delete after naming it and its size', async () => {
    const files = [{relative_path: 'a1b2c3d4e5f60718_interview.txt', size_bytes: 2048, modified_at: 1_760_000_000, action: 'retain_until_explicit_cleanup'},
      {relative_path: 'old-scan.pdf', size_bytes: 4_300_000, modified_at: 1_760_000_000, action: 'retain_until_explicit_cleanup'},
      {relative_path: 'photo.jpg', size_bytes: 1000, modified_at: 1_760_000_000, action: 'retain_until_explicit_cleanup'}];
    const state = {files, kept: 0};
    const preview = () => ({storage_root: '/data/documents', orphan_files: state.files, orphan_file_count: state.files.length,
      orphan_bytes: state.files.reduce((n, f) => n + f.size_bytes, 0), kept_file_count: state.kept, unsafe_document_references: [],
      cleanup_available: true, policy: 'retain_until_reporter_decides'});
    const drop = (paths: string[]) => { state.files = state.files.filter(f => !paths.includes(f.relative_path)); };
    const api = mockApi({...routes({summary: summary()}),
      'GET /api/settings/storage/orphans': preview,
      'POST /api/settings/storage/orphans/keep': ({body}: RouteCall) => { const p = (body as {paths: string[]}).paths; drop(p); state.kept += 1; return {kept: p, kept_count: 1}; },
      'POST /api/settings/storage/orphans/delete': ({body}: RouteCall) => { const p = (body as {paths: string[]}).paths; drop(p);
        return {deleted: [{relative_path: p[0], size_bytes: 4_300_000}], deleted_count: 1, freed_bytes: 4_300_000}; },
      [`POST /api/investigations/${INV}/storage/orphans/add-back`]: ({body}: RouteCall) => { drop([(body as {path: string}).path]);
        return {investigation_id: INV, document_id: 'doc-9', filename: 'interview.txt', job_id: 'job-9'}; },
    });
    render(<SafetyPage/>);
    const user = userEvent.setup();
    expect(await screen.findByText('3 stray files')).toBeTruthy();
    await user.click(screen.getByRole('button', {name: 'Look at them'}));
    const sheet = await screen.findByRole('dialog', {name: 'Stray files'});

    await user.click(within(sheet).getByRole('button', {name: 'Keep photo.jpg'}));
    expect(await within(sheet).findByText('photo.jpg is kept and will not be offered again.')).toBeTruthy();
    expect(api.lastBody('POST /api/settings/storage/orphans/keep')).toEqual({paths: ['photo.jpg']});
    expect(await within(sheet).findByText(/1 file you kept is not listed\./)).toBeTruthy();

    await user.click(within(sheet).getByRole('button', {name: 'Delete old-scan.pdf…'}));
    const confirm = within(sheet).getByRole('group', {name: 'Delete old-scan.pdf?'});
    expect(within(confirm).getByText('Delete old-scan.pdf (4.1 MB)? Cannot be undone.')).toBeTruthy();
    expect(api.calls('POST /api/settings/storage/orphans/delete')).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', {name: 'Delete'}));
    expect(await within(sheet).findByText('old-scan.pdf was deleted (4.1 MB).')).toBeTruthy();
    expect(api.lastBody('POST /api/settings/storage/orphans/delete')).toEqual({paths: ['old-scan.pdf']});

    await user.click(within(sheet).getByRole('button', {name: 'Add a1b2c3d4e5f60718_interview.txt back to the case'}));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/bring-in?inv=${INV}#the-drop`));
    expect(api.lastBody(`POST /api/investigations/${INV}/storage/orphans/add-back`)).toEqual({path: 'a1b2c3d4e5f60718_interview.txt'});
  });
});
