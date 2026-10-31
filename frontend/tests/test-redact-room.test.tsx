// @vitest-environment jsdom
// Redact before sharing (features/reading-room/redact-room.tsx; mockup MEDIA_3): proposals accepted only with a
// reason, rejected ones dropped, the hidden data and PDF/A asked for, and the copy's body sent as the person set it.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {RedactRoom, groupByKind, groupProposals, newFileName} from '../features/reading-room/redact-room';
import type {DocumentDetailOut, RedactProposalOut} from '../lib/generated/types.gen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const DOC = {id: 'm1', investigation_id: 'inv-1', filename: 'minutes-2019-10-02.pdf', source_id: 'src-1', sha256: '7d2a41c9'.padEnd(64, '0'),
  extraction_status: 'complete', extraction_error: null, extraction_issues: [], chunk_count: 1, candidate_counts: {}, chunks: [],
  created_at: '2026-10-03T01:00:00'} as unknown as DocumentDetailOut;
const proposal = (id: string, kind: string, text: string, y: number): RedactProposalOut =>
  ({id, kind, page: 1, rect: [100, y, 180, y + 12], text, entity_id: null, why: kind === 'person' ? 'a person named in this case' : 'found by pattern'});
const VIEW = {document_id: 'm1', sha256: DOC.sha256, tool: 'PdfCraft', pages: [{page: 1, width: 595, height: 842}, {page: 2, width: 595, height: 842}],
  proposals: [proposal('phone-1', 'phone', '07700 900 431', 300), proposal('person-2', 'person', 'Hendry', 100), proposal('person-3', 'person', 'Hendry', 200)],
  hidden: [{category: 'metadata', label: 'Metadata', count: 6}, {category: 'comments', label: 'Comments and markups', count: 2},
    {category: 'attachments', label: 'File attachments', count: 0}],
  pdfa: {compliant: false, declared: null, issues: [{clause: '6.2.11.4', message: "The font Helvetica isn't embedded", fixable: false}]}};

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  vi.stubGlobal('URL', Object.assign(URL, {createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined}));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('redact before sharing', () => {
  it('names the new file and groups the same words across the file, then by kind', () => {
    expect(newFileName('minutes-2019-10-02.pdf', 'editor', new Date(2026, 9, 28))).toBe('minutes-2019-10-02-redacted-for-editor-28-Oct.pdf');
    const spread = [...VIEW.proposals, {...proposal('person-4', 'person', 'HENDRY', 300), page: 2}, {...proposal('person-5', 'person', 'Ann\nExample', 400), page: 2}];
    const groups = groupProposals(spread);
    expect(groups.map(g => [g.text, g.items.length, g.pages])).toEqual([['Hendry', 3, [1, 2]], ['07700 900 431', 1, [1]], ['Ann Example', 1, [2]]]);
    expect(groupByKind(spread).map(k => [k.kind, k.items.length, k.texts.length, k.pages])).toEqual([['person', 4, 2, [1, 2]], ['phone', 1, 1, [1]]]);
  });

  it('decides a whole kind, or everything on a page, in one move, and lists each page behind a click', async () => {
    const many = {...VIEW, proposals: [...VIEW.proposals, {...proposal('person-4', 'person', 'Hendry', 300), page: 2}]};
    mockApi({'GET /api/documents/m1/redaction': many, 'GET /api/documents/m1/derived': [], 'GET /api/documents/m1/page-image': {status: 200, body: 'x'}});
    render(<QueryProvider><RedactRoom doc={DOC} caseName="The harbour land" onClose={() => undefined}/></QueryProvider>);
    const user = userEvent.setup();
    const panel = await screen.findByRole('region', {name: 'This redaction'});
    expect(await within(panel).findByText('This redaction · 0 done, 4 proposed')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', {name: /“Hendry”/}));
    expect(within(panel).getByRole('button', {name: 'p.2'})).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', {name: 'p.2'}));
    expect(screen.getByRole('button', {name: 'p.2'})).toHaveAttribute('aria-current', 'page');
    // Page 2 holds one proposal; keep everything on it in one move.
    await user.click(within(screen.getByRole('group', {name: 'Proposed on page 2'})).getByRole('button', {name: 'Keep all'}));
    expect(within(panel).getByText('This redaction · 0 done, 3 proposed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Yes: redact every name (2)'}));
    await user.click(screen.getByRole('button', {name: 'a private person'}));
    await user.click(screen.getByRole('button', {name: 'Redact it'}));
    expect(within(panel).getByText('This redaction · 2 done, 1 proposed')).toBeInTheDocument();
    expect(within(panel).getByText('Names × 2, p.1')).toBeInTheDocument();
  });

  it('keeps a proposal only with a reason, drops a rejected one, and sends the copy as set', async () => {
    const api = mockApi({'GET /api/documents/m1/redaction': VIEW, 'GET /api/documents/m1/derived': [],
      'GET /api/documents/m1/page-image': {status: 200, body: 'x'},
      'POST /api/documents/m1/derived/redacted': {status: 201, body: {id: 'c1', document_id: 'm1', filename: 'minutes-2019-10-02-redacted-for-lawyer-29-Oct.pdf',
        parent_sha256: DOC.sha256, sha256: 'b'.repeat(64), size: 10, mime_type: 'application/pdf', operation: 'redacted', params: {}, tool: 'PdfCraft',
        created_by: 'local-owner', created_at: '2026-10-29T07:00:00'}}});
    render(<QueryProvider><RedactRoom doc={DOC} caseName="The harbour land" onClose={() => undefined}/></QueryProvider>);
    const user = userEvent.setup();
    const panel = await screen.findByRole('region', {name: 'This redaction'});
    expect(await within(panel).findByText('This redaction · 0 done, 3 proposed')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Make the redacted copy'})).toBeDisabled();

    await user.click(screen.getByRole('button', {name: 'Yes: redact Hendry'}));
    expect(screen.getByRole('button', {name: 'Redact it'})).toBeDisabled();
    await user.click(screen.getByRole('button', {name: 'source protection'}));
    await user.click(screen.getByRole('button', {name: 'Redact it'}));
    await user.click(screen.getByRole('button', {name: 'No: keep 07700 900 431'}));
    expect(within(panel).getByText('This redaction · 2 done, 0 proposed')).toBeInTheDocument();
    expect(within(panel).getAllByText('reason: source protection')).toHaveLength(1);

    await user.click(screen.getByLabelText('Comments and markups'));
    await user.click(screen.getByLabelText('Make it PDF/A for archiving'));
    await user.selectOptions(screen.getByLabelText('For'), 'lawyer');
    await user.click(screen.getByRole('button', {name: 'Make the redacted copy'}));
    await vi.waitFor(() => expect(api.lastBody('POST /api/documents/m1/derived/redacted')).toEqual({
      boxes: [{page: 1, rect: [100, 100, 180, 112], reason: 'source protection', kind: 'person'},
        {page: 1, rect: [100, 200, 180, 212], reason: 'source protection', kind: 'person'}],
      remove: ['metadata'], pdfa: true, made_for: 'lawyer'}));
    expect(await screen.findByText('minutes-2019-10-02-redacted-for-lawyer-29-Oct.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Open the redacted copy'})).toBeInTheDocument();
  });

  it('lists every kind of hidden data and what PDF/A the file breaks', async () => {
    mockApi({'GET /api/documents/m1/redaction': VIEW, 'GET /api/documents/m1/derived': [], 'GET /api/documents/m1/page-image': {status: 200, body: 'x'}});
    render(<QueryProvider><RedactRoom doc={DOC} caseName="The harbour land" onClose={() => undefined}/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', {name: 'Hidden data · 8'}));
    expect(screen.getByLabelText('File attachments')).toBeDisabled();
    await user.click(screen.getByRole('tab', {name: 'Archive (PDF/A)'}));
    expect(screen.getByText(/breaks 1 rule; 0 can be fixed in the copy, so a PDF\/A copy would still break 1/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', {name: 'Compare · 0'}));
    expect(screen.getByText(/No redacted copy yet/)).toBeInTheDocument();
  });
});
