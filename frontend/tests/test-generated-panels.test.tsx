// @vitest-environment jsdom
// The first panels moved out of app/page.tsx onto the generated API client
// (Foundation Fixes fixes 2 and 3): local deletion and source & evidence
// capture, plus the wiring that sends generated calls through ApiClient.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {ReactElement} from 'react';

import {DeletionPanel, casefileOutcome} from '../features/deletion/deletion-panel';
import {SourceCapturePanel} from '../features/source-capture/source-capture-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {investigationDeletionPreview} from '../lib/generated/sdk.gen';
import {QueryProvider} from '../lib/query-client';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
const url = (call: unknown[]) => String(call[0]);
const init = (call: unknown[]) => (call[1] || {}) as RequestInit;
/** The JSON a call sent: generated calls hand fetch their body as bytes (ApiClient.fetchForGenerated). */
const sentJson = async (call: unknown[]): Promise<unknown> => JSON.parse(await new Response(init(call).body).text());
const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

let api: ApiClient;
beforeEach(() => {
  api = new ApiClient('http://api.test');
  connectGeneratedClient(api);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const preview = {
  investigation_id: 'inv-1', investigation_name: 'Kestrelwood', record_counts: {investigations: 1, sources: 2}, record_total: 3,
  document_files: [], document_file_summary: {delete: 1, preserve_shared: 0, already_missing: 0, unsafe: 0},
  unsafe_paths: [], can_delete: true, requires_confirmation: 'inv-1', openaleph_collection: null,
};

describe('generated client wiring', () => {
  it('sends the session token and turns failures and bad replies into readable errors', async () => {
    api.setAuthToken('secret-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(preview))
      .mockResolvedValueOnce(json({detail: 'Investigation not found'}, 404))
      .mockResolvedValueOnce(json({...preview, record_total: 'three'}));
    vi.stubGlobal('fetch', fetchMock);

    const ok = await investigationDeletionPreview({path: {investigation_id: 'inv-1'}, throwOnError: true});
    expect(ok.data.record_total).toBe(3);
    expect(url(fetchMock.mock.calls[0])).toBe('http://api.test/api/investigations/inv-1/deletion-preview');
    expect(new Headers(init(fetchMock.mock.calls[0]).headers).get('authorization')).toBe('Bearer secret-token');

    await expect(investigationDeletionPreview({path: {investigation_id: 'gone'}, throwOnError: true}))
      .rejects.toThrow('Investigation not found (404 /api/investigations/gone/deletion-preview)');
    await expect(investigationDeletionPreview({path: {investigation_id: 'inv-1'}, throwOnError: true}))
      .rejects.toThrow(/Invalid API payload from \/api\/investigations\/inv-1\/deletion-preview: record_total/);
  });
});

describe('DeletionPanel', () => {
  it('previews, requires the exact ID, deletes, and hands the result to the page', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(preview))
      .mockResolvedValueOnce(json({investigation_id: 'inv-1', deleted: true, deleted_record_counts: {investigations: 1}, deleted_record_total: 3,
        document_files_deleted: 1, shared_document_files_preserved: 0, missing_document_files: 0, openaleph_collection: null}));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<DeletionPanel investigationId="inv-1" onDeleted={onDeleted}/>);

    await user.click(screen.getByRole('button', {name: 'Preview deletion'}));
    await screen.findByText('Preview ready. Type the exact investigation ID to enable deletion.');
    expect(screen.getByText(/3 record\(s\) · 1 owned file\(s\) to delete/)).toBeInTheDocument();
    const remove = screen.getByRole('button', {name: 'Permanently delete investigation'});
    expect(remove).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Exact investigation ID'), 'inv-1');
    await user.click(remove);

    await screen.findByText('Deleted 3 record(s) and 1 owned document file(s); preserved 0 shared file(s).');
    expect(onDeleted).toHaveBeenCalledWith(expect.objectContaining({deleted_record_total: 3}));
    expect(url(fetchMock.mock.calls[1])).toBe('http://api.test/api/investigations/inv-1?confirmation=inv-1');
    expect(init(fetchMock.mock.calls[1]).method).toBe('DELETE');
  });

  it('names the OpenAleph casefile that goes too, and says when one is left behind', async () => {
    const user = userEvent.setup();
    const casefile = {collection_id: '42', label: 'Kestrelwood'};
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({...preview, openaleph_collection: casefile}))
      .mockResolvedValueOnce(json({investigation_id: 'inv-1', deleted: true, deleted_record_counts: {investigations: 1}, deleted_record_total: 3,
        document_files_deleted: 1, shared_document_files_preserved: 0, missing_document_files: 0,
        openaleph_collection: {...casefile, deleted: false, detail: 'OpenAleph could not be reached to delete its casefile (ConnectError); delete it in OpenAleph.'}})));
    wrap(<DeletionPanel investigationId="inv-1" onDeleted={vi.fn()}/>);
    await user.click(screen.getByRole('button', {name: 'Preview deletion'}));
    expect(await screen.findByText('OpenAleph casefile “Kestrelwood” is deleted too.')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Exact investigation ID'), 'inv-1');
    await user.click(screen.getByRole('button', {name: 'Permanently delete investigation'}));
    expect(await screen.findByText(/Casefile “Kestrelwood” is still in OpenAleph: OpenAleph could not be reached/)).toBeInTheDocument();
    expect(casefileOutcome({...casefile, deleted: true, detail: null})).toBe(' OpenAleph is deleting casefile “Kestrelwood”.');
    expect(casefileOutcome(null)).toBe('');
  });

  it('says why a deletion is blocked and keeps the delete control away', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({...preview, can_delete: false,
      unsafe_paths: [{document_id: 'd1', storage_path: '/etc/passwd', error: 'outside the storage root'}]})));
    wrap(<DeletionPanel investigationId="inv-1" onDeleted={vi.fn()}/>);
    await user.click(screen.getByRole('button', {name: 'Preview deletion'}));
    await screen.findByText('Deletion is blocked by an unsafe document path.');
    expect(screen.getByText('outside the storage root')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Permanently delete investigation'})).not.toBeInTheDocument();
  });
});

describe('SourceCapturePanel', () => {
  it('saves the source then its evidence, clears the form and lets the page reload', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({id: 'src-1', investigation_id: 'inv-1', title: 'Wire log', url: null, source_type: 'web', metadata_json: {capture: 'reporter'}, created_at: '2026-10-01T10:00:00'}))
      .mockResolvedValueOnce(json({id: 'ev-1', source_id: 'src-1', quote: '$2.4M wired', locator: 'row 41', notes: null}));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<SourceCapturePanel investigationId="inv-1" sourceCount={0} evidenceCount={0} onSaved={onSaved}/>);

    const save = screen.getByRole('button', {name: 'Save source + evidence'});
    await user.type(screen.getByPlaceholderText('Source title'), 'Wire log');
    expect(save).toBeDisabled(); // no evidence yet
    await user.type(screen.getByPlaceholderText(/Exact locator/), 'row 41');
    await user.type(screen.getByPlaceholderText('Exact quote / excerpt'), '$2.4M wired');
    await user.click(save);

    await screen.findByText('Saved evidence ev-1. It is now available for claim review.');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText('Source title')).toHaveValue('');
    expect(await sentJson(fetchMock.mock.calls[0])).toEqual(
      {investigation_id: 'inv-1', title: 'Wire log', url: null, source_type: 'web', metadata_json: {capture: 'reporter'}});
    expect(await sentJson(fetchMock.mock.calls[1])).toEqual({source_id: 'src-1', quote: '$2.4M wired', locator: 'row 41', notes: null});
  });

  it('shows the error and keeps what was typed when saving fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({detail: 'Investigation not found'}, 404)));
    wrap(<SourceCapturePanel investigationId="inv-1" sourceCount={2} evidenceCount={5} onSaved={vi.fn()}/>);
    expect(screen.getByText('2 source(s) · 5 evidence record(s) in this investigation.')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Source title'), 'Wire log');
    await user.type(screen.getByPlaceholderText('Exact quote / excerpt'), 'quote');
    await user.click(screen.getByRole('button', {name: 'Save source + evidence'}));
    await waitFor(() => expect(screen.getByText(/Investigation not found \(404 \/api\/sources\)/)).toBeInTheDocument());
    expect(screen.getByPlaceholderText('Source title')).toHaveValue('Wire log');
  });
});
