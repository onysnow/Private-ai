// @vitest-environment jsdom
// Bring in › Sources & evidence: the browser of the case's sources and their evidence (BACKLOG: "It is only a capture
// form"), with the capture form one click away.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {SourcesBrowser} from '../features/source-capture/sources-browser';
import {originOf} from '../features/source-capture/source-kinds';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
const at = '2026-10-01T10:00:00';
const source = (id: string, title: string, extra: Record<string, unknown> = {}) =>
  ({id, investigation_id: 'inv-1', title, url: null, source_type: 'web', metadata_json: {}, created_at: at, ...extra});
const evidence = (id: string, source_id: string, quote: string, locator: string | null = null) => ({id, source_id, quote, locator, notes: null});

const sources = [
  source('s-filing', 'Forfeiture complaint', {source_type: 'public_record', metadata_json: {filename: 'complaint.pdf', sha256: 'ab'}}),
  source('s-link', 'Registry page', {url: 'https://registry.example/acme', metadata_json: {link_only: 'Read, not downloaded'}}),
  source('s-hand', 'Phone call notes', {metadata_json: {capture: 'reporter'}}),
];
const pool = [
  {evidence: evidence('e1', 's-filing', 'Wire of $576 million to Falcon Bank', 'page 62'), source: sources[0]},
  {evidence: evidence('e2', 's-filing', 'The deposit was refundable', 'page 54'), source: sources[0]},
  {evidence: evidence('e3', 's-link', 'Acme Ltd, registered 2009'), source: sources[1]},
  {evidence: evidence('e4', 's-hand', 'He said the money came from Falcon'), source: sources[2]},
];
const claims = [
  {id: 'c-disp', investigation_id: 'inv-1', text: 'The payment was a deposit', status: 'disputed', confidence: 0, created_at: at},
  {id: 'c-ok', investigation_id: 'inv-1', text: 'Acme was registered in 2009', status: 'confirmed', confidence: 0, created_at: at},
];
const links = [
  {evidence_id: 'e2', claim_id: 'c-disp', stance: 'contradicts'},
  {evidence_id: 'e3', claim_id: 'c-ok', stance: 'supports'},
];
const documents = [{id: 'doc-1', investigation_id: 'inv-1', source_id: 's-filing', filename: 'complaint.pdf', title: null, mime_type: 'application/pdf',
  sha256: 'ab', extraction_status: 'done', extraction_error: null, extraction_issues: [], created_at: at, chunk_count: 3, candidate_counts: {},
  openaleph_document_id: null, openaleph_schema: null, parent_document_id: null}];

function serve(overrides: Record<string, () => Response> = {}) {
  return vi.fn(async (input: unknown) => {
    const path = new URL(String(input instanceof Request ? input.url : input)).pathname;
    for (const [suffix, reply] of Object.entries(overrides)) if (path.endsWith(suffix)) return reply();
    if (path.endsWith('/sources')) return json(sources);
    if (path.endsWith('/evidence-claim-links')) return json(links);
    if (path.endsWith('/evidence')) return json(pool);
    if (path.endsWith('/claims')) return json(claims);
    if (path.endsWith('/documents')) return json(documents);
    return json({detail: 'not found'}, 404);
  });
}

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const draw = () => render(<QueryProvider><SourcesBrowser investigationId="inv-1"/></QueryProvider>);
const list = () => screen.getByRole('complementary', {name: 'Sources'});

describe('originOf', () => {
  it('reads the kind of a source from what was stored when it was made', () => {
    expect(originOf(sources[0])).toBe('document');
    expect(originOf(sources[1])).toBe('link');
    expect(originOf(sources[2])).toBe('hand');
    expect(originOf(source('x', 'x', {metadata_json: {added_by_hand: true}}))).toBe('hand');
    expect(originOf(source('x', 'x', {metadata_json: {capture_id: 'c1'}}))).toBe('capture');
    expect(originOf(source('x', 'x', {metadata_json: {followed_from: 'feed'}}))).toBe('followed');
    expect(originOf(source('x', 'x', {source_type: 'document'}), {openaleph_document_id: 'oa-1'})).toBe('openaleph');
  });
});

describe('SourcesBrowser', () => {
  it('lists every source with its evidence count, sources that back claims first, and shows the picked one\'s evidence', async () => {
    vi.stubGlobal('fetch', serve());
    draw();
    expect(await screen.findByText('pieces of evidence')).toBeInTheDocument();
    await waitFor(() => expect(within(list()).getAllByRole('button')).toHaveLength(3));
    const rows = within(list()).getAllByRole('button');
    expect(rows[0]).toHaveAccessibleName(/^Forfeiture complaint\. Document brought in\. 2 pieces of evidence\. Backs 1 claim, 1 disputed\.$/);
    expect(rows[2]).toHaveAccessibleName(/Phone call notes\. Typed by hand\. 1 pieces of evidence\. Not used in a claim yet\./);

    // The first source is open: the piece that bears on a claim comes first, its claim a status mark.
    const pane = screen.getByRole('region', {name: 'Evidence from Forfeiture complaint'});
    const quotes = within(pane).getAllByRole('blockquote').map(q => q.textContent);
    expect(quotes).toEqual(['The deposit was refundable', 'Wire of $576 million to Falcon Bank']);
    const claim = within(pane).getByRole('button', {name: 'Cuts against it: The payment was a deposit (Disputed). Open the claim'});
    expect(claim).toHaveClass('st-disputed');

    await userEvent.setup().click(claim);
    expect(useWorkbenchStore.getState().claim?.claimId).toBe('c-disp');
  });

  it('opens the reading room at the piece\'s page and its chain of custody', async () => {
    vi.stubGlobal('fetch', serve());
    const user = userEvent.setup();
    draw();
    const pane = await screen.findByRole('region', {name: 'Evidence from Forfeiture complaint'});
    await user.click(within(pane).getAllByRole('button', {name: 'Open it in the reading room'})[1]);
    expect(useWorkbenchStore.getState().document).toMatchObject({documentId: 'doc-1', pageNumber: 62});
    await user.click(within(pane).getAllByRole('button', {name: 'Its chain of custody'})[0]);
    expect(useWorkbenchStore.getState().provenance?.request).toMatchObject({acceptedRecordType: 'evidence', acceptedRecordId: 'e2', sourceId: 's-filing'});
  });

  it('filters by kind, by use and by disputed claims, and searches the quotes', async () => {
    vi.stubGlobal('fetch', serve());
    const user = userEvent.setup();
    draw();
    await waitFor(() => expect(within(list()).getAllByRole('button')).toHaveLength(3));

    await user.click(screen.getByRole('radio', {name: 'Not used yet'}));
    expect(within(list()).getAllByRole('button').map(b => b.getAttribute('data-source'))).toEqual(['s-hand']);
    await user.click(screen.getByRole('radio', {name: 'All'}));

    await user.click(screen.getByRole('button', {name: 'On a disputed claim'}));
    expect(within(list()).getAllByRole('button').map(b => b.getAttribute('data-source'))).toEqual(['s-filing']);
    await user.click(screen.getByRole('button', {name: 'On a disputed claim'}));

    await user.click(screen.getByRole('button', {name: 'Web link, not downloaded'}));
    expect(within(list()).getAllByRole('button').map(b => b.getAttribute('data-source'))).toEqual(['s-link']);
    await user.click(screen.getByRole('button', {name: 'Web link, not downloaded'}));

    await user.type(screen.getByRole('searchbox', {name: /Search the quotes/}), 'falcon');
    await waitFor(() => expect(within(list()).getAllByRole('button').map(b => b.getAttribute('data-source'))).toEqual(['s-filing', 's-hand']));
    const pane = screen.getByRole('region', {name: 'Evidence from Forfeiture complaint'});
    expect(within(pane).getAllByRole('blockquote').map(q => q.textContent)).toEqual(['Wire of $576 million to Falcon Bank']);
    expect(within(pane).getByText('Falcon', {selector: 'mark'})).toBeInTheDocument();
  });

  it('keeps the capture form one click away, and still lists sources when the claim links cannot be read', async () => {
    vi.stubGlobal('fetch', serve({'/evidence-claim-links': () => json({detail: 'Not Found'}, 404)}));
    const user = userEvent.setup();
    draw();
    await waitFor(() => expect(within(list()).getAllByRole('button')).toHaveLength(3));
    expect(await screen.findByText('The claims each piece backs could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Source title')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Add a source'}));
    expect(screen.getByPlaceholderText('Source title')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Back to the sources'}));
    expect(screen.queryByPlaceholderText('Source title')).not.toBeInTheDocument();
  });

  it('leads with the capture form when the case has no sources yet', async () => {
    vi.stubGlobal('fetch', serve({'/sources': () => json([]), '/evidence': () => json([])}));
    draw();
    expect(await screen.findByText('No sources yet')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Source title')).toBeInTheDocument();
  });
});
