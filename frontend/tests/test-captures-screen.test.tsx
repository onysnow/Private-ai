// @vitest-environment jsdom
// Links & captures (mockup INTAKE_3; features/captures/*; ADR-0016): paste a link and the capture lane, receipt and
// outcomes appear as the record holds them. A capture that kept no page says why and offers no quote; a re-check names
// the copy it found; a refused link says so. The screen never says the page is genuine.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';

import {CapturesView} from '../features/captures/captures-view';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {mockApi} from '../test-support/mock-api';

const INV = 'inv-1';
const sha = (c: string) => c.repeat(64);

const step = (key: string, label: string, state = 'done', seconds = 0.1, detail = '') => ({key, label, state, seconds, detail});
const STEPS = [step('link', 'Link checked'), step('page', 'Page fetched', 'done', 0.9, '200 OK'), step('source', 'Source saved'),
  step('screenshot', 'Screenshot', 'skipped', 0, 'No browser is set up on this computer, so only the fetched page was kept.'),
  step('archive', 'Archive (WARC)'), step('fingerprint', 'Fingerprint'), step('text', 'Text read', 'done', 0, '1,204 characters')];
const capture = (over: Record<string, unknown> = {}) => ({
  id: 'cap-1', investigation_id: INV, source_id: 's1', document_id: 'doc-1', supersedes_id: null, url: 'https://www.marlow-courier.example/2019/03/harbour-parcel-sold',
  final_url: 'https://www.marlow-courier.example/2019/03/harbour-parcel-sold', outcome: 'saved', reason: null, title: 'Harbour parcel sold to Kestrel SA',
  started_at: '2026-10-19T10:14:02', ended_at: '2026-10-19T10:14:09', collector: {tool: 'httpx', version: 'httpx 0.28.1', runs_on: 'this computer', cookies_sent: false, signed_in: false},
  request: {line: 'GET /2019/03/harbour-parcel-sold HTTP/1.1', headers: [['accept-language', 'en-GB'], ['user-agent', 'Mozilla/5.0 (compatible; Capture)']], cookie: '(none)'},
  response: {status: 200, reason: 'OK', http_version: 'HTTP/1.1', headers: [['content-type', 'text/html; charset=utf-8'], ['last-modified', 'Mon, 18 Mar 2019 09:40:11 GMT']], redirects: []},
  steps: STEPS, files: [
    {name: 'page.html', role: 'page', note: 'the page source, as the site sent it', size: 190464, sha256: sha('a')},
    {name: 'page.warc', role: 'archive', note: 'the request and the answer (WARC)', size: 2516582, sha256: sha('b')},
    {name: 'text.txt', role: 'text', note: 'the working copy of the text, hashed apart', size: 9216, sha256: sha('c')}],
  page_sha256: sha('a'), text_sha256: sha('c'), displayed: {title: 'Harbour parcel sold', byline: 'Staff reporter', published: '2019-03-18T09:12:00Z', language: 'en-GB'},
  checks: [], change: null, has_screenshot: false, created_at: '2026-10-19T10:14:09', ...over,
});
const result = (cap: ReturnType<typeof capture>, state = 'new', over: Record<string, unknown> = {}) =>
  ({capture: cap, state, already_in_case: state === 'already_in_case' || state === 'same', document_id: cap.document_id, job: null, ...over});

function renderView(props: Partial<React.ComponentProps<typeof CapturesView>> = {}) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  return render(<QueryClientProvider client={client}><CapturesView investigationId={INV} incoming={[]} onIncomingDone={() => undefined} {...props}/></QueryClientProvider>);
}

beforeAll(() => { process.env.TZ = 'UTC'; });
beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const LIST = 'GET /api/investigations/inv-1/captures';
const CREATE = 'POST /api/investigations/inv-1/captures';

describe('Links & captures', () => {
  it('says what to do when nothing is captured yet', async () => {
    mockApi({[LIST]: {captures: []}});
    renderView();
    expect(await screen.findByText(/Nothing captured yet/)).toBeTruthy();
    expect(screen.getByText(/Paste a web address on the left/)).toBeTruthy();
    expect((screen.getByRole('button', {name: 'Capture'}) as HTMLButtonElement).disabled).toBe(true);
  });

  it('captures a pasted link and shows the lane, the receipt and the fingerprints', async () => {
    const saved = capture();
    const api = mockApi({[LIST]: {captures: []}, [CREATE]: () => { api.add({[LIST]: {captures: [saved]}}); return result(saved); }});
    renderView();
    await userEvent.type(await screen.findByLabelText('Web address'), 'https://www.marlow-courier.example/2019/03/harbour-parcel-sold');
    await userEvent.click(screen.getByRole('button', {name: 'Capture'}));
    expect(await screen.findByRole('heading', {name: 'Harbour parcel sold to Kestrel SA'})).toBeTruthy();
    expect((api.lastBody(CREATE) as {url: string}).url).toBe('https://www.marlow-courier.example/2019/03/harbour-parcel-sold');

    const lane = screen.getByLabelText('Capture lane');
    for (const label of ['Link checked', 'Page fetched', 'Source saved', 'Screenshot', 'Archive (WARC)', 'Fingerprint', 'Text read']) expect(within(lane).getByText(label)).toBeTruthy();
    expect(within(lane).getByText(/Screenshot: No browser is set up on this computer/)).toBeTruthy();
    expect(within(lane).getByText(/19 Oct 2026 10:14:02 UTC/)).toBeTruthy();
    expect(within(lane).getByLabelText('What was sent').textContent).toContain('Cookie: (none)');
    expect(within(lane).getByLabelText('What came back').textContent).toContain('HTTP/1.1 200 OK');

    const receipt = screen.getByLabelText('Capture receipt');
    expect(within(receipt).getByText('a'.repeat(4) + ' ' + 'a'.repeat(4) + ' ' + 'a'.repeat(4) + ' ' + 'a'.repeat(4) + ' …' + 'a'.repeat(4) + ' ' + 'a'.repeat(4))).toBeTruthy();
    expect(within(receipt).getByText('page.warc')).toBeTruthy();
    expect(within(receipt).getByText('2.4 MB')).toBeTruthy();
    expect(within(receipt).getByText(/No screenshot: the page was fetched without a browser/)).toBeTruthy();
    expect(within(receipt).getByText(/By Staff reporter · 18 Mar 2019 09:12 UTC/)).toBeTruthy();
    expect(within(receipt).getByText('As displayed, not verified')).toBeTruthy();
    expect(receipt.textContent).toMatch(/Content verified\s*not done by this system/);
    expect(receipt.textContent).not.toMatch(/\bverified\b(?! not)(?!:)[^.]*genuine\./);
    expect(screen.getByLabelText('Capture before use').textContent).toMatch(/Capture exists \(19 Oct 2026 10:14 UTC\)/);
  });

  it('keeps a capture that saved no page as an outcome with its reason, and offers no quote from it', async () => {
    const wall = capture({id: 'cap-2', outcome: 'not_seen', document_id: null, source_id: null, title: null, files: [], page_sha256: null,
      reason: 'The site asked for a login or refused access. Nothing behind it was seen, and captures never log in.',
      steps: [step('link', 'Link checked'), step('page', 'Page fetched', 'done', 0.4, '403 Forbidden'), step('source', 'Source saved', 'skipped', 0, 'nothing to cite')]});
    mockApi({[LIST]: {captures: [wall]}});
    renderView();
    expect(await screen.findByLabelText('Why nothing was saved')).toBeTruthy();
    expect(screen.getByLabelText('Why nothing was saved').textContent).toMatch(/Nothing behind it was seen, and captures never log in/);
    expect(screen.getByLabelText('Why nothing was saved').textContent).toMatch(/not captured and not shown/);
    expect(screen.queryByLabelText('Capture receipt')).toBeNull();
    expect(screen.queryByLabelText('Capture before use')).toBeNull();
    expect(screen.queryByRole('button', {name: /Open to quote/})).toBeNull();
    expect(within(screen.getByLabelText('Captures in this case')).getByText('Not seen')).toBeTruthy();
  });

  it('says a refused link is refused, in the words the server gave', async () => {
    mockApi({[LIST]: {captures: []}, [CREATE]: {status: 422, body: {detail: '127.0.0.1 is on this computer or a private network, not the public internet.'}}});
    renderView();
    await userEvent.type(await screen.findByLabelText('Web address'), 'http://127.0.0.1/admin');
    await userEvent.click(screen.getByRole('button', {name: 'Capture'}));
    expect(await screen.findByText(/on this computer or a private network/)).toBeTruthy();
  });

  it('names a page already in the case instead of saving it twice', async () => {
    const saved = capture({checks: [{at: '2026-10-19T10:20:00', state: 'same', capture_id: null}], change: 'same'});
    mockApi({[LIST]: {captures: [saved]}, [CREATE]: result(saved, 'already_in_case')});
    renderView();
    await userEvent.type(await screen.findByLabelText('Web address'), 'https://www.marlow-courier.example/2019/03/harbour-parcel-sold');
    await userEvent.click(screen.getByRole('button', {name: 'Capture'}));
    expect(await screen.findByText(/Already in the case as “Harbour parcel sold to Kestrel SA” · same fingerprint/)).toBeTruthy();
  });

  it('re-checks a page, finds it changed, and points to the new copy while the first stays as it was', async () => {
    const first = capture();
    const second = capture({id: 'cap-3', supersedes_id: 'cap-1', page_sha256: sha('d')});
    const firstAfter = capture({checks: [{at: '2026-10-20T10:00:00', state: 'changed', capture_id: 'cap-3'}], change: 'changed'});
    const api = mockApi({[LIST]: {captures: [first]},
      'POST /api/investigations/inv-1/captures/cap-1/recheck': () => { api.add({[LIST]: {captures: [second, firstAfter]}}); return result(second, 'changed'); }});
    renderView();
    await userEvent.click(await screen.findByRole('button', {name: 'Re-check now'}));
    expect(await screen.findByText(/has changed\. The new copy is saved; the first is kept as it was/)).toBeTruthy();
    await waitFor(() => expect(within(screen.getByLabelText('Captures in this case')).getByText('Changed since capture')).toBeTruthy());
    // The new copy is shown, and says it follows the first.
    expect(screen.getByText(/This copy follows an earlier one/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', {name: 'Show it'}));
    expect(screen.getByText(/A newer copy exists/)).toBeTruthy();
    expect(screen.getByLabelText('Re-checks').textContent).toMatch(/Changed: a new copy was kept · 20 Oct 2026 10:00 UTC/);
  });

  it('captures links pasted into the Drop one after another, then tells the Drop it is done', async () => {
    const one = capture({id: 'cap-a', url: 'https://a.example/1', final_url: 'https://a.example/1', title: 'One'});
    const two = capture({id: 'cap-b', url: 'https://b.example/2', final_url: 'https://b.example/2', title: 'Two'});
    const queue = [result(one), result(two)];
    const api = mockApi({[LIST]: {captures: []}, [CREATE]: () => queue.shift()});
    const done = vi.fn();
    renderView({incoming: ['https://a.example/1', 'https://b.example/2'], onIncomingDone: done});
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(api.calls(CREATE).map(c => (c.body as {url: string}).url)).toEqual(['https://a.example/1', 'https://b.example/2']);
  });

  it('says what leaves this computer: the page’s own site sees one visit, nothing third-party, no cookies', async () => {
    mockApi({[LIST]: {captures: []}});
    renderView();
    const card = await screen.findByLabelText('What leaves this computer');
    expect(card.textContent).toMatch(/Nothing third-party is contacted/);
    expect(card.textContent).toMatch(/one visit from this computer’s address/);
    expect(card.textContent).toMatch(/No cookies are sent/);
  });
});
