// @vitest-environment jsdom
// Links & captures (The Drop's tab; mockup INTAKE_3, ADR-0018): a pasted link is captured, the lane and receipt say
// what was kept and how, a page that could not be kept says why, and the same page is not captured twice by accident.
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {captureState, isWebAddress, laneSummary, sameLink} from '../features/the-drop/captures';
import {TheDrop} from '../features/the-drop/the-drop';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {CaptureOut} from '../lib/generated/types.gen';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {validSettingsStatus} from '../test-support/page-routes';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/bring-in', useSearchParams: () => new URLSearchParams()}));

const LABELS = [['checked', 'Link checked'], ['fetched', 'Page fetched'], ['source', 'Source saved'], ['screenshot', 'Screenshot'],
  ['archive', 'Archive (WARC)'], ['fingerprint', 'Fingerprint'], ['text', 'Text read']] as const;
const stages = (states: CaptureOut['stages'][number]['state'][], seconds = 0.5) =>
  LABELS.map(([key, label], i) => ({key, label, state: states[i], seconds: states[i] === 'done' ? seconds : null}));
const HASH = 'a3f907c25b81d4e6'.padEnd(56, '0') + '9c2a5d1e';

function capture(over: Partial<CaptureOut> = {}): CaptureOut {
  return {
    id: 'c1', investigation_id: 'inv-1', url: 'https://www.marlow-courier.example/2019/03/harbour-parcel?utm_source=mail',
    final_url: 'https://www.marlow-courier.example/2019/03/harbour-parcel', status: 'finished', outcome: 'saved', suite_outcome: 'OBTAINED',
    reason: null, http_status: 200, collector: 'local-owner', tool: 'Journalism Workbench web capture: Playwright 1.64.1, Chromium 153.0',
    requested_at: '2026-10-19T10:14:01', started_at: '2026-10-19T10:14:02', finished_at: '2026-10-19T10:14:09', captured_at: '2026-10-19T10:14:05',
    files: [{name: 'page.html', role: 'page source as received', bytes: 186_000, sha256: 'b'.repeat(64)},
      {name: 'screenshot.png', role: 'full-page picture with address and clock', bytes: 1_100_000, sha256: 'c'.repeat(64)},
      {name: 'page.warc.gz', role: 'WARC 1.1 archive of the visit', bytes: 2_400_000, sha256: HASH}],
    displayed: {title: 'Harbour parcel sold to Kestrel SA', author: 'Staff reporter', published: '2019-03-18'},
    robots_disallowed: false, stages: stages(['done', 'done', 'done', 'done', 'done', 'done', 'done'], 1),
    exchange: {request: {method: 'GET', target: '/2019/03/harbour-parcel', headers: [['accept-language', 'en-GB'], ['cookie', '(none)']]},
      response: {status: 'HTTP/1.1 200 OK', headers: [['content-type', 'text/html; charset=utf-8'], ['etag', '"7c1e-5a0"']]}},
    source_id: 's1', document_id: 'd1', case_record_id: 'r1', job_id: 'j1', content_verified: 'not done by this system', job: null,
    media: {}, media_document_id: null,
    ...over,
  };
}
const EMPTY_DROP = {investigation_id: 'inv-1', stages: [], lanes: [], totals: {files: 0, files_inside: 0, read: 0, unread: 0, problems: 0, passages: 0, waiting: 0, by_stage: {}},
  ready_for_you: {}, ready_from: 0, ready_unsure: 0};
const BASE = {'GET /api/settings/status': validSettingsStatus, 'GET /api/investigations/inv-1/drop': EMPTY_DROP};

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); useWorkbenchStore.setState({investigationId: 'inv-1', document: null}); });
afterEach(() => cleanup());

describe('capture helpers', () => {
  it('knows a web address and compares links without their tracking parts', () => {
    expect(isWebAddress(' https://example.org/a ')).toBe(true);
    expect(isWebAddress('ftp://example.org/a')).toBe(false);
    expect(isWebAddress('see https://example.org')).toBe(false);
    expect(sameLink('https://Example.org/a/?utm_source=mail&id=4#top')).toBe(sameLink('https://example.org/a?id=4'));
    expect(sameLink('https://example.org/a?id=4')).not.toBe(sameLink('https://example.org/a?id=5'));
  });

  it('words each outcome and the lane', () => {
    expect(captureState(capture())).toMatchObject({word: 'Saved', tone: 'ok'});
    expect(captureState(capture({outcome: 'not_seen'}))).toMatchObject({word: 'Not seen', tone: 'amber'});
    expect(captureState(capture({outcome: 'link_only'}))).toMatchObject({word: 'Link only', tone: 'bad'});
    expect(captureState(capture({status: 'capturing', outcome: null}))).toMatchObject({word: 'Capturing'});
    expect(laneSummary(capture())).toBe('Done · 7.0 s');
    expect(laneSummary(capture({stages: stages(['done', 'stopped', 'skipped', 'skipped', 'skipped', 'skipped', 'skipped'])}))).toBe('Stopped at “Page fetched”');
    expect(laneSummary(capture({outcome: 'link_only', http_status: 404}))).toBe('Stopped at “Page fetched” · 404');
  });
});

describe('Links & captures', () => {
  it('captures a link pasted into the drop and shows its lane and receipt', async () => {
    const saved = capture();
    let listed: CaptureOut[] = [];
    const api = mockApi({...BASE, 'GET /api/investigations/inv-1/captures': () => listed,
      'POST /api/investigations/inv-1/captures': () => { listed = [saved]; return {status: 202, body: {...saved, status: 'queued', outcome: null}}; },
      'GET /api/captures/c1/files/screenshot.png': {status: 200, body: 'png'}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const field = await screen.findByLabelText(/Drop files here, or paste text/);
    fireEvent.paste(field, {clipboardData: {getData: () => saved.url, files: []}});
    await waitFor(() => expect(api.calls('POST /api/investigations/inv-1/captures')).toHaveLength(1));
    expect(api.calls('POST /api/investigations/inv-1/captures')[0].body).toEqual({url: saved.url});

    const main = await screen.findByRole('region', {name: 'The chosen capture'});
    expect(await within(main).findByRole('heading', {name: 'Harbour parcel sold to Kestrel SA'})).toBeInTheDocument();
    const lane = within(main).getByRole('region', {name: 'Capture lane'});
    expect(within(lane).getByText('Done · 7.0 s')).toBeInTheDocument();
    expect(within(lane).getAllByRole('listitem').map(li => li.textContent)).toEqual(LABELS.map(([, label]) => `${label}✓ 1.0 s`));
    expect(within(lane).getByText('you · this computer')).toBeInTheDocument();
    expect(within(lane).getByText('2026-10-19 10:14:02 UTC')).toBeInTheDocument();
    expect(within(lane).getByText('10:14:05 UTC')).toBeInTheDocument();
    expect(lane).toHaveTextContent('cookie: (none)');
    expect(lane).toHaveTextContent('HTTP/1.1 200 OK');

    const receipt = within(main).getByRole('region', {name: 'Capture receipt'});
    expect(within(receipt).getByText('a3f9 07c2 5b81 d4e6 …9c2a 5d1e')).toBeInTheDocument();
    expect(within(receipt).getByRole('button', {name: 'page.warc.gz'})).toBeInTheDocument();
    expect(within(receipt).getByText('2.3 MB · WARC 1.1 archive of the visit')).toBeInTheDocument();
    expect(within(receipt).getByText('as displayed, not verified')).toBeInTheDocument();
    expect(receipt).toHaveTextContent('Content verifiednot done by this system. A capture shows what was at the address, not that it is genuine.');
    const user = userEvent.setup();
    await user.click(within(receipt).getByRole('button', {name: 'Open in reading room'}));
    expect(useWorkbenchStore.getState().document).toMatchObject({documentId: 'd1'});
    expect(within(screen.getByRole('region', {name: 'Capture before use'})).getByText(/Capture exists \(10:14:05 UTC\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /Links & captures/})).toHaveTextContent('1');
  });

  it('says why a link could not be kept, and offers to add a file instead', async () => {
    const gone = capture({outcome: 'link_only', suite_outcome: 'UNABLE_TO_OBTAIN', reason: 'The site answered HTTP 404', files: [], document_id: null,
      displayed: {}, stages: stages(['done', 'stopped', 'skipped', 'skipped', 'skipped', 'skipped', 'skipped'])});
    mockApi({...BASE, 'GET /api/investigations/inv-1/captures': [gone]});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /Links & captures/}));
    const main = await screen.findByRole('region', {name: 'The chosen capture'});
    expect(within(main).getByRole('heading', {name: 'Title not available'})).toBeInTheDocument();
    expect(within(main).getByText('Stopped at “Page fetched”')).toBeInTheDocument();
    const outcome = within(main).getByRole('region', {name: 'Link only'});
    expect(within(outcome).getByText('The site answered HTTP 404')).toBeInTheDocument();
    expect(within(main).queryByRole('region', {name: 'Capture receipt'})).toBeNull();
    const picker = vi.spyOn(document.querySelector<HTMLInputElement>('input[type="file"]:not([webkitdirectory])')!, 'click');
    await user.click(within(outcome).getByRole('button', {name: /Add a file I saved/}));
    expect(picker).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole('region', {name: 'Capture before use'})).getByText(/Nothing to quote/)).toBeInTheDocument();
  });

  it('does not capture a page already in the case unless asked to', async () => {
    const api = mockApi({...BASE, 'GET /api/investigations/inv-1/captures': [capture()],
      'POST /api/investigations/inv-1/captures': {status: 202, body: capture({id: 'c2', status: 'queued', outcome: null})}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /Links & captures/}));
    const paste = await screen.findByRole('region', {name: 'Paste a link'});
    await user.type(within(paste).getByLabelText('Web address to capture'), 'https://www.marlow-courier.example/2019/03/harbour-parcel/#comments');
    await user.click(within(paste).getByRole('button', {name: 'Capture'}));
    expect(within(paste).getByText('Already in the case')).toBeInTheDocument();
    expect(api.calls('POST /api/investigations/inv-1/captures')).toHaveLength(0);
    await user.click(within(paste).getByRole('button', {name: 'Capture again as a new version'}));
    await waitFor(() => expect(api.calls('POST /api/investigations/inv-1/captures')).toHaveLength(1));
  });

  it('refuses what is not a web address before asking the server, and shows the server\'s refusal', async () => {
    const api = mockApi({...BASE, 'GET /api/investigations/inv-1/captures': [],
      'POST /api/investigations/inv-1/captures': {status: 422, body: {detail: '10.0.0.1 is a private or local address: only public web pages are captured'}}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    // Nothing brought in yet: the link field sits under the drop field.
    const paste = await screen.findByRole('region', {name: 'Paste a link'});
    const input = within(paste).getByLabelText('Web address to capture');
    fireEvent.change(input, {target: {value: 'example.org'}});
    fireEvent.submit(input.closest('form')!);
    expect(within(paste).getByText('Give a web address that starts with http:// or https://')).toBeInTheDocument();
    expect(api.calls('POST /api/investigations/inv-1/captures')).toHaveLength(0);
    await user.clear(input);
    await user.type(input, 'http://10.0.0.1/admin');
    await user.click(within(paste).getByRole('button', {name: 'Capture'}));
    expect(await within(paste).findByText(/private or local address/)).toBeInTheDocument();
  });

  it('keeps following a finished capture while its page is still being read', async () => {
    let calls = 0;
    const reading = capture({stages: stages(['done', 'done', 'done', 'done', 'done', 'done', 'waiting'], 1),
      job: {id: 'j1', kind: 'web_capture', status: 'running', finished: false, attempts: 1, runner: 'procrastinate', progress: 85,
        message: 'Reading the page', error: null, investigation_id: 'inv-1', subject_type: 'capture', subject_id: 'c1',
        created_at: '2026-10-19T10:14:01', started_at: '2026-10-19T10:14:02', finished_at: null, updated_at: '2026-10-19T10:14:09'}});
    const api = mockApi({...BASE, 'GET /api/investigations/inv-1/captures': () => { calls += 1; return calls === 1 ? [reading] : [capture()]; }});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    await waitFor(() => expect(api.calls('GET /api/investigations/inv-1/captures').length).toBeGreaterThan(1), {timeout: 4000});
  });

  it('collects the audio on a captured page and opens it in Listen & read', async () => {
    let listed = [capture()];
    const collected = capture({media: {status: 'collected', title: 'Fernhill Notes ep. 41', platform: 'HTML5MediaEmbed', account: 'Fernhill Notes',
      duration: 19, route: 'yt-dlp, logged out, no cookies, through this computer’s own connection'}, media_document_id: 'rec-1',
      files: [...capture().files, {name: 'media.mp3', role: 'the video or audio as served', bytes: 76_257, sha256: 'd'.repeat(64)},
        {name: 'media.info.json', role: 'what yt-dlp read about it', bytes: 2_000, sha256: 'e'.repeat(64)}]});
    const api = mockApi({...BASE, 'GET /api/investigations/inv-1/captures': () => listed,
      'POST /api/captures/c1/media': () => { listed = [collected]; return collected; }});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /Links & captures/}));
    const panel = await screen.findByRole('region', {name: 'Video or audio on this page'});
    expect(panel).toHaveTextContent('One item, logged out, with no cookies.');
    await user.click(within(panel).getByRole('button', {name: 'Collect the video or audio'}));
    await waitFor(() => expect(api.calls('POST /api/captures/c1/media')).toHaveLength(1));
    expect(await within(panel).findByText('Fernhill Notes ep. 41')).toBeInTheDocument();
    expect(panel).toHaveTextContent('HTML5MediaEmbed · Fernhill Notes · 0:19');
    expect(panel).toHaveTextContent('kept with this capture as media.mp3 and media.info.json');
    await user.click(within(panel).getByRole('button', {name: 'Listen & read'}));
    expect(useWorkbenchStore.getState().document).toMatchObject({documentId: 'rec-1'});
  });

  it('says why the media on a page could not be collected, and offers to try again', async () => {
    mockApi({...BASE, 'GET /api/investigations/inv-1/captures': [capture({media: {status: 'failed', reason: 'No video or audio was found on this page'}})]});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /Links & captures/}));
    const panel = await screen.findByRole('region', {name: 'Video or audio on this page'});
    expect(panel).toHaveTextContent('Not collected. No video or audio was found on this page');
    expect(within(panel).getByRole('button', {name: 'Try again'})).toBeInTheDocument();
  });

  it('shows a capture still running as a working lane, without a receipt', async () => {
    mockApi({...BASE, 'GET /api/investigations/inv-1/captures': [capture({status: 'capturing', outcome: null, suite_outcome: null, files: [], finished_at: null,
      captured_at: null, displayed: {}, stages: stages(['waiting', 'waiting', 'waiting', 'waiting', 'waiting', 'waiting', 'waiting'])})]});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /Links & captures/}));
    const lane = await screen.findByRole('region', {name: 'Capture lane'});
    expect(within(lane).getByText('Capturing')).toBeInTheDocument();
    expect(within(lane).getAllByRole('listitem')[0]).toHaveTextContent('Link checked… working');
    expect(screen.queryByRole('region', {name: 'Capture receipt'})).toBeNull();
    expect(screen.getByText(/Visiting the page once, from this computer, in a fresh browser with no stored cookies/)).toBeInTheDocument();
  });
});

describe('Checking a captured page again (INTAKE_3)', () => {
  const follow = (over: Partial<NonNullable<CaptureOut['follow']>> = {}): NonNullable<CaptureOut['follow']> => ({
    monitor_id: 'm1', every: 'weekly', health: 'works', health_detail: null, last_checked_at: '2026-10-19T10:16:20', next_check_at: '2026-10-26T10:16:20',
    checks: [{state: 'ok', text: 'Answered 200 in 0.8 s', status: 200, seconds: 0.8}, {state: 'warn', text: 'Text differs from the last version · 2 lines'}],
    leaves: 'One request a week to fernhill-holdings.example. The site sees a visit from this computer\'s address. Only the page\'s main text is compared.',
    state: 'changed', item_id: 'i2', marked_changed: null, captured_text: 'Fernhill Ltd is owned by Harbour Nominees Ltd.', live_text: 'Fernhill Ltd is a privately held company.',
    versions: [{number: 1, seen_at: '2026-10-12T08:31:00', captured: true, capture_id: 'c1', text_sha256: 'a3f907c2'.padEnd(60, '0') + '5d1e', lines_changed: 0},
      {number: 2, seen_at: '2026-10-19T10:16:20', captured: false, capture_id: null, text_sha256: 'f'.repeat(64), lines_changed: 2}],
    changes: [{unchanged: 0, segments: [{op: 'same', text: 'Fernhill Ltd is '}, {op: 'del', text: 'owned by Harbour Nominees Ltd.'}, {op: 'ins', text: 'a privately held company.'}]}],
    ...over,
  });

  it('shows a page changed since its capture word by word, and captures version 2 keeping both', async () => {
    const changed = capture({follow: follow()});
    const api = mockApi({...BASE, 'GET /api/investigations/inv-1/captures': [changed],
      'POST /api/captures/c1/capture-latest': {status: 202, body: capture({id: 'c2', status: 'queued', outcome: null})},
      'POST /api/captures/c1/mark-changed': capture({follow: follow({marked_changed: {at: '2026-10-19T10:17:00', by: 'local-owner', state: 'changed', version: 2}})}),
      'PUT /api/captures/c1/follow': capture({follow: follow({every: 'daily'})})});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /Links & captures/}));
    const main = await screen.findByRole('region', {name: 'The chosen capture'});
    expect(within(main).getByText('Changed since capture')).toBeInTheDocument();
    const recheck = within(main).getByRole('region', {name: 'Re-check'});
    expect(within(recheck).getAllByRole('listitem').map(li => li.textContent).slice(0, 4))
      .toEqual(['Link checked✓', 'Page fetched✓ 0.8 s · 200', 'Text read✓', 'Compared with v1! 2 lines differ']);
    expect(recheck).toHaveTextContent('Version 2 · seen 2026-10-19 10:16, not captured');
    expect(recheck).toHaveTextContent('Nothing is saved until you say so.');
    const what = within(main).getByRole('region', {name: 'What changed'});
    expect(what.querySelector('del')).toHaveTextContent('owned by Harbour Nominees Ltd.');
    expect(what.querySelector('ins')).toHaveTextContent('a privately held company.');
    await user.click(within(what).getByRole('button', {name: 'Side by side'}));
    expect(what).toHaveTextContent('Version 1 · captured');
    await user.click(within(what).getByRole('button', {name: 'Mark source “changed”'}));
    await waitFor(() => expect(api.calls('POST /api/captures/c1/mark-changed')).toHaveLength(1));
    await user.click(within(what).getByRole('button', {name: 'Capture version 2 · keeps both'}));
    await waitFor(() => expect(api.calls('POST /api/captures/c1/capture-latest')).toHaveLength(1));
    const again = screen.getByRole('region', {name: 'Check again later'});
    expect(within(again).getByRole('radio', {name: 'Weekly'})).toHaveAttribute('aria-checked', 'true');
    await user.click(within(again).getByRole('radio', {name: 'Daily'}));
    await waitFor(() => expect(api.calls('PUT /api/captures/c1/follow')).toHaveLength(1));
    expect(api.calls('PUT /api/captures/c1/follow')[0].body).toEqual({every: 'daily'});
    expect(captureState(changed)).toMatchObject({word: 'Changed since capture', tone: 'amber'});
    expect(captureState(capture({follow: follow({state: 'gone'})}))).toMatchObject({word: 'Gone', tone: 'bad'});
  });

  it('re-checks a saved page from its receipt', async () => {
    const api = mockApi({...BASE, 'GET /api/investigations/inv-1/captures': [capture()],
      'POST /api/captures/c1/recheck': capture({follow: follow({state: 'same', every: 'never', next_check_at: null, changes: [], versions: [follow().versions[0]]})})});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /Links & captures/}));
    const receipt = await screen.findByRole('region', {name: 'Capture receipt'});
    await user.click(within(receipt).getByRole('button', {name: 'Re-check now'}));
    await waitFor(() => expect(api.calls('POST /api/captures/c1/recheck')).toHaveLength(1));
  });

  it('lets a person give a link only its reason and ask again in 7 days', async () => {
    const only = capture({outcome: 'link_only', suite_outcome: 'UNABLE_TO_OBTAIN', reason: 'The site answered HTTP 404', files: [], document_id: null,
      displayed: {}, http_status: 404, reason_kind: 'dead_link', stages: stages(['done', 'stopped', 'skipped', 'skipped', 'skipped', 'skipped', 'skipped'])});
    const api = mockApi({...BASE, 'GET /api/investigations/inv-1/captures': [only],
      'PATCH /api/captures/c1': {...only, reason_kind: 'blocked', reason_kind_by: 'local-owner'},
      'PUT /api/captures/c1/follow': {...only, follow: follow({state: 'unchecked', last_checked_at: null, versions: [], changes: []})}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /Links & captures/}));
    const outcome = await screen.findByRole('region', {name: 'Link only'});
    const reasons = within(outcome).getByRole('radiogroup', {name: 'Why it could not be kept'});
    expect(within(reasons).getByRole('radio', {name: 'Dead link'})).toHaveAttribute('aria-checked', 'true');
    expect(reasons).toHaveTextContent('read from the reply');
    await user.click(within(reasons).getByRole('radio', {name: 'Blocked'}));
    await waitFor(() => expect(api.calls('PATCH /api/captures/c1')[0]?.body).toEqual({reason_kind: 'blocked'}));
    await user.click(within(outcome).getByRole('button', {name: 'Ask again in 7 days'}));
    await waitFor(() => expect(api.calls('PUT /api/captures/c1/follow')[0]?.body).toEqual({every: 'weekly'}));
    expect(within(outcome).getByRole('button', {name: /Look for a copy elsewhere/})).toBeDisabled();
  });
});
