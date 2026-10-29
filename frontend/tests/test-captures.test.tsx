// @vitest-environment jsdom
// Links & captures (The Drop's tab; mockup INTAKE_3, ADR-0018): a pasted link is captured, the lane and receipt say
// what was kept and how, a page that could not be kept says why, and the same page is not captured twice by accident.
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {captureState, isWebAddress, laneSummary, sameLink, timeProofWords} from '../features/the-drop/captures';
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
    media: {}, media_document_id: null, witnesses: {}, source_protected: false, time_server: 'freetsa.org',
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
    // Each stage shows its mark; its seconds are on hover (in the page for screen readers, hidden until asked).
    expect(within(lane).getAllByRole('listitem').map(li => li.textContent)).toEqual(LABELS.map(([, label]) => `${label}✓1.0 s`));
    expect(within(lane).getAllByText('1.0 s').every(el => el.closest('[hidden]'))).toBe(true);
    expect(within(lane).getByText('Done · 7.0 s').closest('[hidden]')).not.toBeNull();
    expect(within(lane).getByText('you · this computer').closest('[hidden]')).not.toBeNull();
    expect(within(lane).getByText('no login')).toBeVisible();
    expect(within(lane).getByText('2026-10-19 10:14:02 UTC')).toBeInTheDocument();
    expect(within(lane).getByText('10:14:05 UTC')).toBeInTheDocument();
    expect(lane).toHaveTextContent('cookie: (none)');
    expect(lane).toHaveTextContent('HTTP/1.1 200 OK');

    const receipt = within(main).getByRole('region', {name: 'Capture receipt'});
    // The fingerprint is an icon with a copy button; the hash is on hover.
    expect(within(receipt).getByText(HASH).closest('[hidden]')).not.toBeNull();
    expect(within(receipt).getByRole('button', {name: 'Copy the fingerprint'})).toBeInTheDocument();
    expect(within(receipt).getByRole('button', {name: 'page.warc.gz'})).toBeInTheDocument();
    expect(within(receipt).getByText('2.3 MB · WARC 1.1 archive of the visit')).toBeInTheDocument();
    expect(within(receipt).getByText('as displayed, not verified')).toBeInTheDocument();
    // The custody verdict stays on screen; what a capture shows is on hover.
    expect(within(receipt).getByText('not done by this system.')).toBeVisible();
    expect(within(receipt).getByText('A capture shows what was at the address, not that it is genuine.').closest('[hidden]')).not.toBeNull();
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
    expect(within(lane).getAllByRole('listitem')[0]).toHaveTextContent('Link checked…working');
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
      .toEqual(['Link checked✓', 'Page fetched✓ 2000.8 s', 'Text read✓', 'Compared with v1! 2 lines differ']);
    // The seconds are on hover; the status code and the lines that differ show.
    expect(within(recheck).getByText('0.8 s').closest('[hidden]')).not.toBeNull();
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
  });
});

describe('Outside witnesses (INTAKE_3, ADR-0025)', () => {
  const stamped = {state: 'stamped', server: 'https://freetsa.org/tsr', asked_at: '2026-10-19T10:14:10', answered_at: '2026-10-19T10:14:11', by: 'local-owner',
    of: 'page.warc.gz', sent: HASH, token: 'timestamp.tsr', time: '2026-10-19T10:14:11', signer: 'www.freetsa.org', serial: '159801710', policy: '1.2.3.4.1',
    fingerprint: HASH, check: 'checked', check_detail: 'Signed by a certificate that chains to the Free TSA root'} as const;

  it('asks for the switches with the next capture only, and says what will leave', async () => {
    const api = mockApi({...BASE, 'GET /api/investigations/inv-1/captures': [capture()], 'GET /api/captures/c1/files/screenshot.png': {status: 200, body: 'png'},
      'POST /api/investigations/inv-1/captures': {status: 202, body: capture({id: 'c2', status: 'queued', outcome: null})}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /Links & captures/}));
    const leaves = await screen.findByRole('region', {name: 'What leaves this computer'});
    expect(leaves).toHaveTextContent('Nothing third-party is contacted.');
    await user.click(within(leaves).getByRole('switch', {name: /Second witness/}));
    await user.click(within(leaves).getByRole('switch', {name: /Time proof/}));
    expect(leaves).toHaveTextContent('2 outside services will be asked. The link goes to a public web archive. The 64-character fingerprint, not the page, goes to a time server.');
    const paste = screen.getByRole('region', {name: 'Paste a link'});
    await user.type(within(paste).getByLabelText('Web address to capture'), 'https://fernhill-holdings.example/about');
    await user.click(within(paste).getByRole('button', {name: 'Capture'}));
    await waitFor(() => expect(api.calls('POST /api/investigations/inv-1/captures')).toHaveLength(1));
    expect(api.calls('POST /api/investigations/inv-1/captures')[0].body).toEqual({url: 'https://fernhill-holdings.example/about', time_proof: true, second_witness: true});
    // Per capture: off again for the next one.
    await waitFor(() => expect(within(leaves).getByRole('switch', {name: /Time proof/})).not.toBeChecked());
    expect(leaves).toHaveTextContent('Nothing third-party is contacted.');
  });

  it('asks a time server only after saying what goes, then shows the stamp and Trace', async () => {
    let listed = [capture()];
    const api = mockApi({...BASE, 'GET /api/investigations/inv-1/captures': () => listed, 'GET /api/captures/c1/files/screenshot.png': {status: 200, body: 'png'},
      'POST /api/captures/c1/time-proof': () => { listed = [capture({witnesses: {time_proof: stamped}})]; return listed[0]; }});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /Links & captures/}));
    const receipt = await screen.findByRole('region', {name: 'Capture receipt'});
    expect(receipt).toHaveTextContent('Local clock only (10:14:05 UTC). Independent proof not asked for.');
    expect(receipt).toHaveTextContent('Second witnessNot asked.');
    await user.click(within(receipt).getByRole('button', {name: /Ask a time server/}));
    expect(api.calls('POST /api/captures/c1/time-proof')).toHaveLength(0);
    const ask = within(receipt).getByRole('group', {name: 'Ask a time server…'});
    expect(ask).toHaveTextContent('Sends the 64-character fingerprint a3f9 07c2 5b81 d4e6 …9c2a 5d1e to freetsa.org. Not the page. Written in the outbound log before it goes.');
    await user.click(within(ask).getByRole('button', {name: 'Send it'}));
    await waitFor(() => expect(api.calls('POST /api/captures/c1/time-proof')).toHaveLength(1));
    expect(await within(receipt).findByText('Stamped')).toBeInTheDocument();
    expect(receipt).toHaveTextContent('RFC 3161 token, 10:14:11 UTC by www.freetsa.org. Sent: the fingerprint only.');
    expect(receipt).toHaveTextContent('Checked here: its signature, its chain to the time server’s root, this fingerprint and this request.');
    expect(receipt).not.toHaveTextContent('after the capture');  // asked with the capture: nothing more to say
    expect(timeProofWords({...stamped, time: '2026-10-19T13:37:05'}, '2026-10-19T10:14:05').gap)
      .toBe('Asked 3 h 23 min after the capture: it proves the kept file existed by then, not when the page was captured.');
    await user.click(within(receipt).getByRole('button', {name: 'Trace'}));
    expect(useWorkbenchStore.getState().provenance?.request).toMatchObject({kind: 'document', documentId: 'd1'});
  });

  it('shows the archive’s copy as the second witness, and sends nothing for a source-protected capture', async () => {
    mockApi({...BASE, 'GET /api/captures/c1/files/screenshot.png': {status: 200, body: 'png'}, 'GET /api/investigations/inv-1/captures': [capture({
      source_protected: true, witnesses: {archive: {state: 'saved', service: 'Internet Archive', asked_at: '2026-10-19T10:14:12', by: 'local-owner',
        sent: 'https://www.marlow-courier.example/2019/03/harbour-parcel', url: 'https://web.archive.org/web/20261019101412/https://www.marlow-courier.example/2019/03/harbour-parcel',
        archived_at: '2026-10-19T10:14:12'}}})]});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /Links & captures/}));
    const receipt = await screen.findByRole('region', {name: 'Capture receipt'});
    expect(receipt).toHaveTextContent('Internet Archive asked 10:14:12 UTC. Sent: the link only.');
    expect(within(receipt).getByRole('link', {name: /Its copy, 2026-10-19 10:14/})).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(receipt).getByRole('button', {name: /Ask a time server/})).toBeDisabled();
  });

  it('looks for a copy elsewhere of a page not kept, and captures that copy', async () => {
    const only = capture({outcome: 'link_only', suite_outcome: 'UNABLE_TO_OBTAIN', reason: 'The site answered HTTP 404', files: [], document_id: null,
      displayed: {}, http_status: 404, stages: stages(['done', 'stopped', 'skipped', 'skipped', 'skipped', 'skipped', 'skipped'])});
    const copy = 'https://web.archive.org/web/20190318094011/https://www.marlow-courier.example/2019/03/harbour-parcel';
    let listed = [only];
    const api = mockApi({...BASE, 'GET /api/investigations/inv-1/captures': () => listed,
      'POST /api/captures/c1/look-elsewhere': () => { listed = [{...only, witnesses: {elsewhere: {state: 'found', service: 'Internet Archive', asked_at: '2026-10-19T10:20:00',
        by: 'local-owner', sent: only.url, url: copy, archived_at: '2019-03-18T09:40:11', archived_status: '200'}}}]; return listed[0]; },
      'POST /api/investigations/inv-1/captures': {status: 202, body: capture({id: 'c3', url: copy, status: 'queued', outcome: null})}});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /Links & captures/}));
    const outcome = await screen.findByRole('region', {name: 'Link only'});
    await user.click(within(outcome).getByRole('button', {name: /Look for a copy elsewhere/}));
    const ask = within(outcome).getByRole('group', {name: 'Look for a copy elsewhere…'});
    expect(ask).toHaveTextContent(`Sends the address, ${only.url}, to the Internet Archive’s lookup`);
    await user.click(within(ask).getByRole('button', {name: 'Send it'}));
    expect(await within(outcome).findByText(/holds a copy from 2019-03-18 09:40 \(the page answered 200 then\)/)).toBeInTheDocument();
    await user.click(within(outcome).getByRole('button', {name: 'Capture that copy'}));
    await waitFor(() => expect(api.calls('POST /api/investigations/inv-1/captures')[0]?.body).toEqual({url: copy}));
  });
});

describe('Pin a quote · finds itself again (INTAKE_3)', () => {
  const quote = {evidence_id: 'e1', quote: 'Kestrel SA paid €4.2 million for the freehold', characters: 45, captured_version: 1, unanchored: false, live: null,
    saved: {state: 'held', match: 'exact', occurrences: 1, prefix: '…seen by the Courier. ', suffix: ', the harbour authority confirmed', place: 'characters 1,204–1,249 of the page text'}} as const;

  it('shows a quote found again in the saved copy, and a quote not on the live page in the tray', async () => {
    const gone = {...quote, evidence_id: 'e2', quote: 'owned by Harbour Nominees Ltd (40%) and Kestrel SA (60%)', unanchored: true,
      live: {checked: true, found: false, version: 2, same_as_saved: false, match: null}};
    const api = mockApi({...BASE, 'GET /api/investigations/inv-1/captures': [capture()], 'GET /api/captures/c1/files/screenshot.png': {status: 200, body: 'png'},
      'GET /api/captures/c1/quotes': [quote, gone], 'POST /api/captures/c1/quotes/refind': [quote]});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /Links & captures/}));
    const pin = await screen.findByRole('region', {name: 'Pin a quote'});
    expect(await within(pin).findByText(quote.quote)).toBeInTheDocument();
    expect(pin).toHaveTextContent('45 characters');
    expect(pin).toHaveTextContent('22 before · 33 after');
    expect(pin).toHaveTextContent('characters 1,204–1,249 of the page text');
    expect(pin).toHaveTextContent('Found again in the saved copy: exact match, 1 of 1.');
    expect(within(pin).getByText('Unanchored · 1')).toBeInTheDocument();
    await user.click(within(pin).getByRole('button', {name: 'Show'}));
    expect(pin).toHaveTextContent('Not on the live page. Still found in version 1, the saved copy: exact match, 1 of 1.');
    await user.click(within(pin).getByRole('button', {name: 'Re-read the page'}));
    await waitFor(() => expect(api.calls('POST /api/captures/c1/quotes/refind')).toHaveLength(1));
    await waitFor(() => expect(within(pin).queryByText('Unanchored · 1')).toBeNull());
  });

  it('says what to do when nothing is pinned yet', async () => {
    mockApi({...BASE, 'GET /api/investigations/inv-1/captures': [capture()], 'GET /api/captures/c1/files/screenshot.png': {status: 200, body: 'png'},
      'GET /api/captures/c1/quotes': []});
    render(<QueryProvider><TheDrop investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /Links & captures/}));
    const pin = await screen.findByRole('region', {name: 'Pin a quote'});
    expect(await within(pin).findByText(/Nothing pinned from this page yet/)).toBeInTheDocument();
    await user.click(within(pin).getByRole('button', {name: 'Pin a quote in the reading room'}));
    expect(useWorkbenchStore.getState().document).toMatchObject({documentId: 'd1'});
  });
});
