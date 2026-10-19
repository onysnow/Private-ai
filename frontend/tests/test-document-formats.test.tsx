// @vitest-environment jsdom
// What the upload pickers offer (ADR-0006, Wave A): every format OpenAleph's
// ingest-file reads while OpenAleph reads uploads, else the Workbench's own
// reader's list -- both from GET /api/document-formats, the list the upload
// route checks against, so the picker and the server cannot disagree.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

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
const FORMATS = 'GET /api/document-formats';

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', provenance: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function panelRoutes(formats: unknown) {
  return {
    [FORMATS]: formats, 'GET /api/investigations/inv-1/documents': [], 'GET /api/investigations/inv-1/entities': [],
    'GET /api/investigations/inv-1/graph': emptyGraph(), 'GET /api/investigations/inv-1/corpus/status': corpusStatusBody('inv-1'),
  };
}

const fileInputs = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));

describe('What the upload pickers offer', () => {
  it('offers every format OpenAleph reads while OpenAleph reads uploads', async () => {
    const openaleph = documentFormatsBody({
      reader: 'openaleph', extensions: ['eml', 'pdf', 'zip'], mime_types: ['message/rfc822'], openaleph_only_extensions: ['eml', 'zip'],
      accept: '.eml,.pdf,.zip,message/rfc822', ingest_file_image: 'ghcr.io/openaleph/ingest-file:5.3.1',
    });
    const api = mockApi(panelRoutes(openaleph));
    wrap(<DocumentsPanel investigationId="inv-1"/>);
    await screen.findByText(/OpenAleph reads every upload/);
    expect(screen.getByText(/3 kinds of file/)).toBeInTheDocument();
    await waitFor(() => expect(fileInputs().map(input => input.accept)).toEqual(['.eml,.pdf,.zip,message/rfc822', '.eml,.pdf,.zip,message/rfc822']));
    expect(api.unmatched()).toEqual([]);
  });

  it('keeps the Workbench reader\'s list when OpenAleph does not read uploads', async () => {
    mockApi(panelRoutes(documentFormatsBody()));
    wrap(<DocumentsPanel investigationId="inv-1"/>);
    await screen.findByText(/PDF, DOCX, text, Markdown, CSV and HTML are extracted/);
    expect(fileInputs().map(input => input.accept)).toEqual(['.csv,.docx,.htm,.html,.md,.pdf,.txt', '.csv,.docx,.htm,.html,.md,.pdf,.txt']);
  });

  it('says why the server refused a kind of file', async () => {
    const api = mockApi({...panelRoutes(documentFormatsBody()),
      'POST /api/documents/upload': {status: 415, body: {detail: 'OpenAleph cannot read .exe files, so this file was not uploaded.'}}});
    wrap(<DocumentsPanel investigationId="inv-1"/>);
    // The picker would not offer it; a file dropped in anyway still reaches the server's check.
    const user = userEvent.setup({applyAccept: false});
    await user.upload(fileInputs()[0], new File(['MZ'], 'setup.exe', {type: 'application/octet-stream'}));
    await user.click(screen.getByRole('button', {name: 'Upload & extract'}));
    await screen.findByText(/OpenAleph cannot read \.exe files, so this file was not uploaded\./);
    expect(api.calls('POST /api/documents/upload')).toHaveLength(1);
  });
});
