// @vitest-environment jsdom
// Searching the corpus in OpenAleph and similar documents (ADR-0006, Wave A):
// investigation search shows "Documents in the corpus" as its own group with
// highlighted snippets and "Open document"; a document offers "Similar
// documents"; both open a document in the documents panel at the page that
// matched.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {DocumentsPanel} from '../features/documents/documents-panel';
import {SearchPanel} from '../features/search/search-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {dropBody} from '../test-support/library';
import {corpusSearchBody, corpusStatusBody, documentFormatsBody, emptyGraph} from '../test-support/page-routes';

vi.mock('next/navigation', () => ({
  useRouter: () => ({push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn()}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);
const CORPUS = 'GET /api/investigations/inv-1/corpus/search';

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', provenance: null, document: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const emptyLocalSearch = {query: 'Zanzibar', investigation_id: 'inv-1', total: 0, returned: 0, counts: {}, group_counts: {}, results: []};

function doc(id: string, filename: string) {
  return {
    id, investigation_id: 'inv-1', filename, source_id: `src-${id}`, mime_type: null, sha256: 'abc', extraction_status: 'complete',
    extraction_error: null, extraction_issues: [], created_at: '2026-10-02T00:00:00', chunk_count: 2, candidate_counts: {},
    openaleph_document_id: `oa-${id}`, openaleph_schema: 'Pages', parent_document_id: null,
  };
}

const minutesHit = {
  openaleph_entity_id: 'oa-minutes-p2', schema: 'Page', title: 'minutes.pdf', document_id: 'minutes', filename: 'minutes.pdf', page_number: 2,
  highlights: [[{text: 'The ', match: false}, {text: 'Zanzibar', match: true}, {text: ' <b>transfer</b>', match: false}]], score: 2,
};
const foreignHit = {...minutesHit, openaleph_entity_id: 'oa-x', schema: 'PlainText', title: 'elsewhere.txt', document_id: null, filename: null, page_number: null, highlights: []};

describe('Documents in the corpus', () => {
  it('shows OpenAleph\'s hits as their own group, with the matches marked, and opens one', async () => {
    const api = mockApi({'GET /api/search': emptyLocalSearch, [CORPUS]: corpusSearchBody('inv-1', {query: 'Zanzibar', total: 2, results: [minutesHit, foreignHit]})});
    wrap(<SearchPanel investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search this investigation…'), 'Zanzibar{Enter}');
    const group = await screen.findByLabelText('Documents in the corpus');
    await within(group).findByText('minutes.pdf');
    expect(within(group).getByText('Zanzibar', {selector: 'mark'})).toBeInTheDocument();
    // OpenAleph's text is shown as text, never as markup.
    expect(within(group).getByText('<b>transfer</b>', {exact: false})).toBeInTheDocument();
    // The page and the document's kind are on hover of its icon; so is where an OpenAleph-only document lives.
    expect(within(group).getByRole('img', {name: 'Page'})).toBeInTheDocument();
    expect(within(group).getByText('page 2 · Page', {exact: false}).closest('[hidden]')).not.toBeNull();
    expect(within(group).getByText('In OpenAleph, not uploaded to this investigation.').closest('[hidden]')).not.toBeNull();
    expect(api.lastUrl(CORPUS).searchParams.get('q')).toBe('Zanzibar');

    await user.click(within(group).getByRole('button', {name: 'Open document'}));
    expect(useWorkbenchStore.getState().document).toMatchObject({documentId: 'minutes', pageNumber: 2});
  });

  it('says why the corpus could not be searched', async () => {
    mockApi({'GET /api/search': emptyLocalSearch,
      [CORPUS]: corpusSearchBody('inv-1', {state: 'unreachable', detail: 'OpenAleph did not answer (ConnectError)'})});
    wrap(<SearchPanel investigationId="inv-1"/>);
    await userEvent.setup().type(screen.getByPlaceholderText('Search this investigation…'), 'Zanzibar{Enter}');
    await screen.findByText('OpenAleph did not answer (ConnectError).');
  });

  it('lists similar documents and opens one in the documents panel at its page', async () => {
    const api = mockApi({
      'GET /api/investigations/inv-1/documents': [doc('memo', 'memo.txt'), doc('minutes', 'minutes.pdf')],
      'GET /api/investigations/inv-1/entities': [], 'GET /api/investigations/inv-1/graph': emptyGraph(),
      'GET /api/investigations/inv-1/corpus/status': corpusStatusBody('inv-1'), 'GET /api/document-formats': documentFormatsBody(),
      'GET /api/documents/memo/similar': {document_id: 'memo', state: 'ok', detail: null, results: [
        {openaleph_entity_id: 'oa-minutes-p2', schema: 'Page', title: 'minutes.pdf', document_id: 'minutes', filename: 'minutes.pdf', page_number: 2, score: 3}]},
      'GET /api/documents/minutes/candidates': [], 'GET /api/investigations/inv-1/drop': dropBody('inv-1'),
    });
    wrap(<DocumentsPanel investigationId="inv-1"/>);
    await screen.findByTestId('document-memo');
    const user = userEvent.setup();
    // The first file is chosen; its tools are in its pane.
    await user.click(within(screen.getByTestId('library-pane')).getByRole('button', {name: 'Similar documents'}));
    const similar = await screen.findByLabelText('Similar documents');
    await user.click(await within(similar).findByRole('button', {name: 'Open document'}));
    await screen.findByText('minutes.pdf opened at page 2: its proposals are in its pane.');
    expect(api.calls('GET /api/documents/minutes/candidates')).toHaveLength(1);
    expect(screen.getByTestId('document-minutes')).toHaveAttribute('aria-current', 'true');
    expect(api.unmatched()).toEqual([]);
  });
});
