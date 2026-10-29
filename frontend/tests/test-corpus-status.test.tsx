// @vitest-environment jsdom
// Reading progress for the corpus (ADR-0006, Wave A): while files are in
// flight the documents panel shows how far OpenAleph has got, stage by stage
// (GET /api/investigations/{id}/corpus/status), asks again while OpenAleph
// works, and stops once it is idle.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {CORPUS_STATUS_POLL_MS, CorpusStatus, corpusStatusPollMs} from '../features/documents/corpus-status';
import {DocumentsPanel} from '../features/documents/documents-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {corpusStatusBody, documentFormatsBody, emptyGraph} from '../test-support/page-routes';

vi.mock('next/navigation', () => ({
  useRouter: () => ({push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn()}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);
const STATUS = 'GET /api/investigations/inv-1/corpus/status';

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', provenance: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const stage = (queue: string, label: string, counts: Partial<Record<'pending' | 'running' | 'finished' | 'failed', number>>) =>
  ({queue, label, pending: 0, running: 0, finished: 0, failed: 0, ...counts});

const working = corpusStatusBody('inv-1', {
  state: 'working', active: true, collection_id: '7',
  stages: [stage('ingest', 'Reading files', {pending: 1, running: 1, finished: 6, failed: 1}), stage('analyze', 'Finding names', {pending: 2})],
});

describe('Reading progress for the corpus', () => {
  it('asks again only while something is in flight', () => {
    expect(corpusStatusPollMs(undefined, false)).toBe(false);
    expect(corpusStatusPollMs(corpusStatusBody('inv-1'), false)).toBe(false);
    expect(corpusStatusPollMs(corpusStatusBody('inv-1'), true)).toBe(CORPUS_STATUS_POLL_MS);
    expect(corpusStatusPollMs(working, false)).toBe(CORPUS_STATUS_POLL_MS);
  });

  it('shows each stage while OpenAleph works, then goes quiet once it is idle', async () => {
    const api = mockApi({[STATUS]: working});
    const onIdle = vi.fn();
    wrap(<CorpusStatus investigationId="inv-1" watch={false} onIdle={onIdle} pollMs={20}/>);
    const box = await screen.findByRole('status', {name: 'OpenAleph progress'});
    expect(within(box).getByText('Reading files: 1 waiting · 1 in progress · 6 done · 1 failed').closest('[hidden]')).not.toBeNull();  // on hover (Ony, 29 Oct)
    expect(within(box).getByText('Finding names: 2 waiting · 0 in progress · 0 done')).toBeInTheDocument();

    api.add({[STATUS]: corpusStatusBody('inv-1', {collection_id: '7'})});
    await waitFor(() => expect(screen.queryByRole('status', {name: 'OpenAleph progress'})).not.toBeInTheDocument());
    expect(onIdle).toHaveBeenCalledTimes(1);
    const asked = api.calls(STATUS).length;
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(api.calls(STATUS)).toHaveLength(asked);
    expect(api.unmatched()).toEqual([]);
  });

  it('keeps asking while the panel knows a file is being read, and says when OpenAleph does not answer', async () => {
    const api = mockApi({[STATUS]: corpusStatusBody('inv-1', {state: 'unreachable', collection_id: '7', detail: 'OpenAleph did not answer (ConnectError)'})});
    wrap(<CorpusStatus investigationId="inv-1" watch pollMs={20}/>);
    await screen.findByText('OpenAleph’s progress is unknown: OpenAleph did not answer (ConnectError).');
    await waitFor(() => expect(api.calls(STATUS).length).toBeGreaterThan(2));
  });

  it('shows nothing when OpenAleph has nothing to do or is not set up', async () => {
    const api = mockApi({[STATUS]: corpusStatusBody('inv-1', {state: 'not_configured', detail: 'OpenAleph is not switched on for this deployment'})});
    const {container} = wrap(<CorpusStatus investigationId="inv-1" watch={false} pollMs={20}/>);
    await waitFor(() => expect(api.calls(STATUS)).toHaveLength(1));
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(api.calls(STATUS)).toHaveLength(1);
    expect(container).toBeEmptyDOMElement();
  });

  it('appears in the documents panel while a document is being read', async () => {
    const queued = {
      id: 'doc-1', investigation_id: 'inv-1', filename: 'memo.txt', source_id: 'src-1', mime_type: 'text/plain', sha256: 'abc',
      extraction_status: 'queued', extraction_error: null, extraction_issues: [], created_at: '2026-10-02T00:00:00',
      chunk_count: 0, candidate_counts: {}, openaleph_document_id: null,
    };
    const api = mockApi({
      'GET /api/investigations/inv-1/documents': [queued], 'GET /api/investigations/inv-1/entities': [],
      'GET /api/investigations/inv-1/graph': emptyGraph(), [STATUS]: working,
      'GET /api/document-formats': documentFormatsBody(),
    });
    wrap(<DocumentsPanel investigationId="inv-1"/>);
    const box = await screen.findByRole('status', {name: 'OpenAleph progress'});
    expect(within(box).getByText('OpenAleph is working on this investigation’s files')).toBeInTheDocument();
    expect(api.unmatched()).toEqual([]);
  });
});
