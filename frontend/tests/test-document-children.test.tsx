// @vitest-environment jsdom
// Files inside an archive and an email's attachments (ADR-0006, Wave A): the
// documents panel lists each under the document it came from, offers "Look
// for files inside again" on an archive or email, and shows an email's
// headers and thread (GET /api/documents/{id}/email).
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {nestDocuments} from '../features/documents/document-tree';
import {DocumentsPanel} from '../features/documents/documents-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {dropBody} from '../test-support/library';
import {corpusStatusBody, documentFormatsBody, emptyGraph} from '../test-support/page-routes';

vi.mock('next/navigation', () => ({
  useRouter: () => ({push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn()}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);
const DOCUMENTS = 'GET /api/investigations/inv-1/documents';

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', provenance: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function doc(id: string, filename: string, overrides: Record<string, unknown> = {}) {
  return {
    id, investigation_id: 'inv-1', filename, source_id: `src-${id}`, mime_type: null, sha256: 'abc', extraction_status: 'complete',
    extraction_error: null, extraction_issues: [], created_at: '2026-10-02T00:00:00', chunk_count: 1, candidate_counts: {},
    openaleph_document_id: `oa-${id}`, openaleph_schema: 'PlainText', parent_document_id: null, ...overrides,
  };
}

const documents = [
  doc('memo', 'memo.txt'),
  doc('ledger', 'ledger.txt', {parent_document_id: 'mail'}),
  doc('mail', 'transfer.eml', {openaleph_schema: 'Email'}),
  doc('zip', 'bundle.zip', {openaleph_schema: 'Package', chunk_count: 0}),
  doc('first', 'letters/first.txt', {parent_document_id: 'zip'}),
];

function routes(extra: Record<string, unknown> = {}) {
  return {
    [DOCUMENTS]: documents, 'GET /api/investigations/inv-1/entities': [], 'GET /api/investigations/inv-1/graph': emptyGraph(),
    'GET /api/investigations/inv-1/corpus/status': corpusStatusBody('inv-1'), 'GET /api/document-formats': documentFormatsBody(),
    'GET /api/investigations/inv-1/drop': dropBody('inv-1'), ...extra,
  };
}

const rowOf = (id: string) => screen.getByTestId(`document-${id}`);
const pane = () => screen.getByTestId('library-pane');
/** Chooses a file in the list; its pane shows. */
async function choose(user: ReturnType<typeof userEvent.setup>, id: string) {
  await user.click(within(rowOf(id)).getAllByRole('button').find(b => b.id === `lib-pick-${id}`)!);
}
/** The OpenAleph actions the chosen file's menu offers. */
async function openAlephMenu(user: ReturnType<typeof userEvent.setup>): Promise<string[]> {
  await user.click(within(pane()).getByRole('button', {name: /^OpenAleph/}));
  const items = within(pane()).getAllByRole('menuitem').map(item => item.textContent ?? '');
  return items;
}

describe('Files found inside other documents', () => {
  it('nests each file under its container, in the list\'s order', () => {
    const rows = nestDocuments(documents).map(row => `${'  '.repeat(row.depth)}${row.document.filename}`);
    expect(rows).toEqual(['memo.txt', 'transfer.eml', '  ledger.txt', 'bundle.zip', '  letters/first.txt']);
  });

  it('shows each file under the archive or email it was found in', async () => {
    const api = mockApi(routes());
    wrap(<DocumentsPanel investigationId="inv-1"/>);
    await screen.findByTestId('document-first');
    const order = screen.getAllByTestId(/^document-/).map(element => element.getAttribute('data-testid'));
    expect(order).toEqual(['document-memo', 'document-mail', 'document-ledger', 'document-zip', 'document-first']);
    expect(within(rowOf('ledger')).getByText('Inside transfer.eml')).toBeInTheDocument();
    expect(within(rowOf('first')).getByText('Inside bundle.zip')).toBeInTheDocument();
    // A container folds the files inside it.
    const user = userEvent.setup();
    await user.click(within(rowOf('zip')).getByRole('button', {name: 'Hide the 1 file inside'}));
    expect(screen.queryByTestId('document-first')).not.toBeInTheDocument();
    await user.click(within(rowOf('zip')).getByRole('button', {name: 'Show the 1 file inside'}));
    expect(rowOf('first')).toBeInTheDocument();
    // The actions are in the chosen file's pane; OpenAleph's are one menu.
    expect(within(pane()).queryByRole('button', {name: 'Headers & thread'})).not.toBeInTheDocument();
    expect(await openAlephMenu(user)).not.toContain('Look for files inside again');
    for (const id of ['zip', 'mail']) {
      await choose(user, id);
      expect(await openAlephMenu(user)).toContain('Look for files inside again');
    }
    expect(api.unmatched()).toEqual([]);
  });

  it('looks for the files inside again and reloads the list', async () => {
    const children = 'POST /api/documents/zip/openaleph/children';
    const api = mockApi(routes({[children]: {
      id: 'job-c', kind: 'openaleph_children', investigation_id: 'inv-1', subject_type: 'document', subject_id: 'zip', status: 'succeeded',
      finished: true, progress: 100, message: '1 file(s) inside added as documents; 1 file(s) inside were already added', error: null,
      attempts: 1, runner: 'inline', result: null, created_at: '2026-10-02T00:00:00', started_at: null, finished_at: null, updated_at: '2026-10-02T00:00:00',
    }}));
    wrap(<DocumentsPanel investigationId="inv-1"/>);
    await screen.findByTestId('document-first');
    const user = userEvent.setup();
    await choose(user, 'zip');
    await openAlephMenu(user);
    await user.click(within(pane()).getByRole('menuitem', {name: 'Look for files inside again'}));
    await screen.findByText(/bundle\.zip: .*1 file\(s\) inside added as documents/);
    expect(api.calls(children)).toHaveLength(1);
    expect(api.calls(DOCUMENTS).length).toBeGreaterThanOrEqual(2);
  });

  it('shows an email\'s headers and its thread, and opens another message of it', async () => {
    const email = {
      document_id: 'mail',
      headers: {from: ['Jane Doe <jane.doe@meridian.example>'], to: ['Audit Desk <audit@kestrelwood.example>'], cc: [], bcc: [],
        date: '2026-09-01T10:00:00', subject: 'Transfer to Meridian', message_id: 'first@meridian.example', in_reply_to: []},
      thread: [
        {openaleph_entity_id: 'oa-mail', subject: 'Transfer to Meridian', sender: 'Jane Doe', date: '2026-09-01', document_id: 'mail', current: true},
        {openaleph_entity_id: 'oa-reply', subject: 'Re: Transfer to Meridian', sender: 'Audit Desk', date: '2026-09-02', document_id: 'reply', current: false},
        {openaleph_entity_id: 'oa-elsewhere', subject: 'Re: Re: Transfer', sender: null, date: null, document_id: null, current: false},
      ],
      thread_note: null,
    };
    const api = mockApi(routes({'GET /api/documents/mail/email': email, 'GET /api/documents/reply/candidates': []}));
    wrap(<DocumentsPanel investigationId="inv-1"/>);
    await screen.findByTestId('document-mail');
    const user = userEvent.setup();
    await choose(user, 'mail');
    await user.click(within(pane()).getByRole('button', {name: 'Headers & thread'}));
    const view = await screen.findByLabelText('Email headers and thread');
    expect(within(view).getByText('Transfer to Meridian', {selector: 'dd'})).toBeInTheDocument();
    expect(within(view).getByText('Jane Doe <jane.doe@meridian.example>')).toBeInTheDocument();
    expect(within(view).getByText('· not uploaded to this investigation', {exact: false})).toBeInTheDocument();
    await user.click(within(view).getByRole('button', {name: 'Review proposals'}));
    expect(api.calls('GET /api/documents/reply/candidates')).toHaveLength(1);
    expect(api.unmatched()).toEqual([]);
  });
});
