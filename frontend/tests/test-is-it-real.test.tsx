// @vitest-environment jsdom
// Is it real? (mockup CHECK_3, ADR-0023): the findings as the server recorded them, a status only a person sets with
// what they checked and why, a preview of what it would do to the claims before it is recorded, and the consent card:
// exactly what is sent, allowed once; nothing for a source-protected item.
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {IsItReal, RealnessList} from '../features/is-it-real/is-it-real';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {AuthenticityOut, AuthenticityPreviewOut} from '../lib/generated/types.gen';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/check', useSearchParams: () => new URLSearchParams()}));

const CLAIMS = [
  {id: 'c0000007-a', text: 'The parcel was fenced off by March 2019.', status: 'unverified', outcome: 'unchanged', others: 0, other: null},
  {id: 'c0000012-b', text: 'The sign on the fence named Kestrel SA as owner.', status: 'unverified', outcome: 'unchanged', others: 1,
    other: {source: 'Land registry filing', locator: 'p. 3'}},
];
const preview = (over: Partial<AuthenticityPreviewOut> = {}): AuthenticityPreviewOut => ({
  status: 'unverified', role: 'events', applied: true, blocking: false, headline: 'No change to claims', claims: CLAIMS, losing: 0,
  derived: [], restating: [], ...over});

function item(over: Partial<AuthenticityOut> = {}): AuthenticityOut {
  return {
    item: {document_id: 'd1', kind: 'image', title: 'Aerial photo: “harbour parcel, 12 March 2019”', posted_by: '@harbourwatch.example',
      outlet: 'https://social.example/@harbourwatch/post/88213', captured_at: '2026-10-19T10:21:00', added_at: '2026-10-19T10:21:00',
      from_link: true, filename: 'parcel_aerial.jpg', size: 412_000, width: 1280, height: 853, sha256: 'e41b9c07'.padEnd(60, '0') + 'a2f6',
      note: 'Saved at JPEG quality about 62: a platform or an editor re-saved it.', excerpt: null, quotes: [], words: null},
    status: 'unverified', role: 'events', source_protected: false, decided_by: null, decided_at: null, reason: null, checked: [],
    platform_label: null, examined_at: '2026-10-19T10:21:00',
    findings: {provenance: {kind: 'image', state: 'trusted', signer: 'Pixelforge Studio (sample)', source_types: ['trainedAlgorithmicMedia'],
      xmp_source_types: [], failures: [], trust_list_date: '2026-10-28'},
    flags: [{key: 'ai_declared', text: 'Declares AI origin. The signer says this was made with generative AI.'}],
    source: [{key: 'byline', label: 'Byline history', tone: 'warn', text: 'No named person.'},
      {key: 'content_farm', label: 'Content-farm list', tone: 'none', text: 'No list imported.'}],
    hints: {state: 'off_by_default', text: 'Off for images.'}, jpeg_quality: 62},
    preview: preview(),
    outside: [{key: 'tineye', label: 'Reverse-image search: send only the item’s public address (TinEye)', to: 'To a reverse-image site (TinEye, a third party)',
      sends: 'https://social.example/@harbourwatch/post/88213/photo.jpg', available: true, why_not: null},
    {key: 'upload', label: 'Reverse-image search: upload the image', to: 'Discloses the picture itself.', sends: null, available: false,
      why_not: 'Not offered: no upload service is set up here.'}],
    history: [{id: 'h1', kind: 'provenance', actor: 'system', local: true, at: '2026-10-19T10:21:00',
      text: 'Content credentials read · c2pa-python 0.38.0 · local: found, signature valid, signer trusted.'}],
    ...over,
  } as AuthenticityOut;
}

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', investigationName: 'The harbour land', realness: {serial: 1, documentId: 'd1'}});
});
afterEach(() => cleanup());

describe('Is it real?', () => {
  it('shows the findings, previews a status on the claims, and records a decision only with what was checked and why', async () => {
    const api = mockApi({
      'GET /api/documents/d1/authenticity': item(),
      'GET /api/documents/d1/picture': {status: 200, body: 'jpg'},
      'GET /api/documents/d1/authenticity/preview': preview({status: 'likely_synthetic', applied: false, blocking: true, losing: 1,
        headline: 'These 2 claims lose support from this item',
        claims: [{...CLAIMS[0], outcome: 'loses'}, {...CLAIMS[1], outcome: 'keeps'}]}),
      'POST /api/documents/d1/authenticity/decision': item({status: 'likely_synthetic', decided_at: '2026-10-19T10:46:00',
        preview: preview({status: 'likely_synthetic', blocking: true, headline: 'These 2 claims lose support from this item'})}),
      'GET /api/investigations/inv-1/authenticity': [],
    });
    render(<QueryProvider><IsItReal investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    const cred = await screen.findByRole('region', {name: 'Content credentials'});
    expect(within(cred).getByText('Valid · signer trusted')).toHaveAttribute('data-on', 'true');
    expect(within(cred).getByText(/Pixelforge Studio \(sample\) · on the trust list/)).toBeInTheDocument();
    expect(within(cred).getByText(/Created using generative AI/)).toBeInTheDocument();
    expect(within(cred).getByText('Review flag')).toBeInTheDocument();
    expect(screen.getByText(/quality about 62/)).toBeInTheDocument();

    const decide = screen.getByRole('region', {name: 'Status and your reasons'});
    const record = within(decide).getByRole('button', {name: 'Record decision'});
    expect(record).toBeDisabled();
    expect(within(decide).getByText('Pick a different status to record a decision.')).toBeInTheDocument();
    await user.click(within(decide).getByRole('radio', {name: 'Likely synthetic'}));
    const claims = screen.getByRole('region', {name: 'Which claims lean on it'});
    expect(await within(claims).findByText('These 2 claims lose support from this item')).toBeInTheDocument();
    expect(within(claims).getByText('Supported only by a synthetic source')).toBeInTheDocument();
    expect(within(claims).getByText('Keeps 1 other source')).toBeInTheDocument();
    expect(within(claims).getByText('Preview')).toBeInTheDocument();
    expect(record).toBeDisabled();
    await user.click(within(decide).getByRole('checkbox', {name: 'Read the findings'}));
    await user.type(within(decide).getByRole('textbox', {name: /Why\?/}), 'The signer says generative AI made it.');
    expect(record).toBeEnabled();
    await user.click(record);
    await waitFor(() => expect(api.calls('POST /api/documents/d1/authenticity/decision')).toHaveLength(1));
    expect(api.calls('POST /api/documents/d1/authenticity/decision')[0].body).toEqual(
      {status: 'likely_synthetic', checked: ['read_findings'], reason: 'The signer says generative AI made it.'});
    expect(await within(screen.getByRole('region', {name: 'The item'})).findByText('Likely synthetic')).toBeInTheDocument();
  });

  it('says exactly what an outside check sends, and sends nothing for a source-protected item', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const api = mockApi({
      'GET /api/documents/d1/authenticity': item(),
      'GET /api/documents/d1/picture': {status: 200, body: 'jpg'},
      'POST /api/documents/d1/authenticity/outside': {url: 'https://tineye.com/search?url=x', service: 'TinEye', sent: 'x', outbound_request_id: 'o1'},
      'PATCH /api/documents/d1/authenticity': item({source_protected: true}),
      'GET /api/investigations/inv-1/authenticity': [],
    });
    render(<QueryProvider><IsItReal investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    const card = await screen.findByRole('region', {name: 'Before anything is sent'});
    expect(within(card).getByText('https://social.example/@harbourwatch/post/88213/photo.jpg')).toBeInTheDocument();
    expect(within(card).getByRole('radio', {name: /upload the image/})).toBeDisabled();
    await user.click(within(card).getByRole('button', {name: 'Allow once & send'}));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://tineye.com/search?url=x', '_blank', 'noopener,noreferrer'));
    expect(api.calls('POST /api/documents/d1/authenticity/outside')[0].body).toEqual({option: 'tineye'});
    expect(within(card).getByRole('button', {name: 'TinEye'})).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('checkbox', {name: 'Source-protected item'}));
    const blocked = await screen.findByText('Sending is blocked');
    const panel = blocked.closest('section')!;
    expect(within(panel as HTMLElement).queryByRole('button', {name: 'Allow once & send'})).toBeNull();
    expect(within(panel as HTMLElement).getByRole('radio', {name: /Compare with this case’s files/})).toBeInTheDocument();
    open.mockRestore();
  });

  it('as the subject of the story, offers a claim about the item itself and adds it', async () => {
    const subject = item({status: 'likely_synthetic', role: 'subject', decided_at: '2026-10-19T10:46:00', preview: preview({
      status: 'likely_synthetic', role: 'subject', blocking: true, headline: 'As the subject, it still supports claims about itself',
      suggestion: 'This image was online by 19 Oct 2026, posted by @harbourwatch.example.',
      claims: [{...CLAIMS[0], outcome: 'loses'}, {...CLAIMS[1], outcome: 'keeps'}]})});
    const api = mockApi({
      'GET /api/documents/d1/authenticity': subject,
      'GET /api/documents/d1/picture': {status: 200, body: 'jpg'},
      'POST /api/documents/d1/authenticity/about-claim': {status: 201, body: item({status: 'likely_synthetic', role: 'subject', preview: preview({
        status: 'likely_synthetic', role: 'subject', blocking: true, headline: 'As the subject, it still supports claims about itself',
        claims: [{id: 'c9', text: 'This image circulated from 17 Mar 2019.', status: 'unverified', outcome: 'about', others: 0, other: null}]})})},
      'GET /api/investigations/inv-1/authenticity': [],
    });
    render(<QueryProvider><IsItReal investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    const claims = await screen.findByRole('region', {name: 'Which claims lean on it'});
    expect(within(claims).getByText('As the subject, it still supports claims about itself')).toBeInTheDocument();
    expect(within(claims).getByText(/The 2 claims that cited it as evidence of events lose it/)).toBeInTheDocument();
    const field = within(claims).getByRole('textbox', {name: 'A claim about the item itself'});
    await user.clear(field);
    await user.type(field, 'This image circulated from 17 Mar 2019.');
    await user.click(within(claims).getByRole('button', {name: 'Add this claim'}));
    await waitFor(() => expect(api.calls('POST /api/documents/d1/authenticity/about-claim')[0].body).toEqual({text: 'This image circulated from 17 Mar 2019.'}));
    expect(await within(claims).findByText('Supported by this item')).toBeInTheDocument();
    expect(within(claims).queryByRole('button', {name: 'Add this claim'})).toBeNull();
  });

  it('opens on the item most worth a look, with the files as a rail to move between them by click or key', async () => {
    window.localStorage.clear();
    useWorkbenchStore.setState({realness: null});
    const doc = (id: string, filename: string, mime: string | null = null) => ({id, investigation_id: 'inv-1', filename, source_id: `src-${id}`, mime_type: mime,
      sha256: 'abc', extraction_status: 'done', extraction_error: null, extraction_issues: [], created_at: '2026-10-12T00:00:00', chunk_count: 0,
      candidate_counts: {}, parent_document_id: null});
    const screenFor = (id: string, filename: string, kind: string) => item({item: {...item().item, document_id: id, filename, kind, title: filename}});
    const api = mockApi({
      'GET /api/investigations/inv-1/documents': [doc('e1', 'e01-official.eml'), doc('p1', 'parcel_aerial.jpg', 'image/jpeg'), doc('e2', 'e02-officer.eml'),
        doc('r1', 'call.m4a')],
      'GET /api/investigations/inv-1/authenticity': [{document_id: 'e2', status: 'disputed', flagged: false, role: 'events', source_protected: false}],
      'GET /api/documents/e1/authenticity': screenFor('e1', 'e01-official.eml', 'text'),
      'GET /api/documents/e2/authenticity': screenFor('e2', 'e02-officer.eml', 'text'),
      'GET /api/documents/p1/authenticity': screenFor('p1', 'parcel_aerial.jpg', 'image'),
      'GET /api/documents/r1/authenticity': screenFor('r1', 'call.m4a', 'audio'),
      'GET /api/documents/p1/picture': {status: 200, body: 'jpg'},
    });
    const view = render(<QueryProvider><RealnessList investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    const files = await screen.findByRole('listbox', {name: 'Files'});
    // Disputed first, then the picture and the recording, then plain text; the first is open without a click.
    expect(within(files).getAllByRole('option').map(o => o.getAttribute('data-id'))).toEqual(['e2', 'p1', 'r1', 'e1']);
    expect(within(files).getByRole('option', {name: /e02-officer\.eml, Disputed/})).toHaveAttribute('aria-selected', 'true');
    expect(within(files).getByRole('option', {name: /e02-officer\.eml/})).toHaveAttribute('data-status', 'disputed');
    expect(await screen.findByRole('region', {name: 'Content credentials'})).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('.ir-rail-at')).toHaveTextContent('1 / 4');

    await user.keyboard('j');
    await waitFor(() => expect(within(files).getByRole('option', {name: /parcel_aerial\.jpg/})).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(api.calls('GET /api/documents/p1/authenticity')).toHaveLength(1));
    // J / K do nothing while something is being typed.
    const label = await screen.findByRole('textbox', {name: 'Platform label'});
    await user.click(label);
    await user.keyboard('j');
    expect(within(files).getByRole('option', {name: /parcel_aerial\.jpg/})).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(within(files).getByRole('option', {name: /parcel_aerial\.jpg/}), {key: 'ArrowDown'});
    await waitFor(() => expect(within(files).getByRole('option', {name: /call\.m4a/})).toHaveAttribute('aria-selected', 'true'));
    await user.click(screen.getByRole('button', {name: 'Previous item'}));
    await waitFor(() => expect(within(files).getByRole('option', {name: /parcel_aerial\.jpg/})).toHaveAttribute('aria-selected', 'true'));
    await user.click(within(files).getByRole('option', {name: /e01-official\.eml/}));
    await waitFor(() => expect(api.calls('GET /api/documents/e1/authenticity')).toHaveLength(1));

    // The kind marks filter the rail.
    await user.click(screen.getByRole('button', {name: 'Recordings: 1'}));
    expect(within(files).getAllByRole('option')).toHaveLength(1);
    await user.click(screen.getByRole('button', {name: 'Recordings: 1'}));

    // It opens again on the last one opened here.
    view.unmount();
    render(<QueryProvider><RealnessList investigationId="inv-1"/></QueryProvider>);
    const again = await screen.findByRole('listbox', {name: 'Files'});
    expect(within(again).getByRole('option', {name: /e01-official\.eml/})).toHaveAttribute('aria-selected', 'true');
  });
});
