// @vitest-environment jsdom
// Listen & read (mockup INTAKE_4, ADR-0020): a recording opens beside its transcript; the parts with no speech are kept
// apart; words the machine was unsure of are marked; a pinned quote is saved only after its part was played through
// and the reporter says they heard it.
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {clock, joinWords, partOf, placeOf} from '../features/reading-room/listen-room';
import {ReadingRoom} from '../features/reading-room/reading-room';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {TranscriptSegmentOut} from '../lib/generated/types.gen';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/bring-in', useSearchParams: () => new URLSearchParams()}));

const seg = (id: string, start: number, end: number, kind: 'speech' | 'no_speech', text: string, words: TranscriptSegmentOut['words'] = []): TranscriptSegmentOut =>
  ({id, chunk_id: kind === 'speech' ? `ch-${id}` : null, ordinal: 0, start, end, kind, text, words, speaker: null});
const VALUATION = seg('s2', 3.3, 5.8, 'speech', 'I never saw a valuation before we voted.', [
  {w: 'I', s: 3.3, e: 3.4, p: 0.98}, {w: 'never', s: 3.4, e: 3.6, p: 0.99}, {w: 'saw', s: 3.6, e: 3.8, p: 1}, {w: 'a', s: 3.8, e: 3.9, p: 0.97},
  {w: 'valuation', s: 3.96, e: 4.6, p: 0.31}, {w: 'before', s: 4.6, e: 4.9, p: 0.95}, {w: 'we', s: 4.9, e: 5.1, p: 0.9}, {w: 'voted.', s: 5.1, e: 5.8, p: 0.93}]);
const TRANSCRIPT = {
  document_id: 'd1', kind: 'audio', duration: 19, streams: [{type: 'audio', codec: 'mp3', sample_rate: 16000}], outline: [0.1, 0.8, 1, 0.2, 0.6],
  outline_step: 3.8, unsure_below: 0.5,
  transcript: {tool: 'faster-whisper 1.2.1', model: 'small', language: 'en', language_probability: 0.98, ran_at: '2026-10-28T10:25:00', where: 'this computer'},
  segments: [seg('s1', 0, 2.8, 'speech', 'Last week we spoke about the harbour land.', [{w: 'Last', s: 0, e: 0.4, p: 0.9}]), VALUATION,
    seg('s3', 5.8, 12.4, 'no_speech', 'Thank you for watching.'), seg('s4', 12.4, 15.4, 'speech', 'Mister Ross handled the paperwork.')],
};
const DOC = {id: 'd1', investigation_id: 'inv-1', source_id: 'src-1', filename: 'ep41_original.mp3', mime_type: 'audio/mpeg', sha256: 'c71a33e0'.padEnd(60, '0') + '09be',
  extraction_status: 'complete', extraction_error: null, extraction_issues: ['1 word the machine was unsure of: listen before quoting them.'], chunks: [],
  created_at: '2026-10-28T10:00:00', chunk_count: 3, candidate_counts: {entity: 1}, parent_document_id: null};

let at = 0;
beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', document: {serial: 1, documentId: 'd1', pageNumber: null}});
  at = 0;
  // jsdom has no media playback: the element keeps a time of its own and says when it plays and pauses.
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {configurable: true, get: () => at, set: (v: number) => { at = v; }});
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {configurable: true, get() { return !(this as HTMLMediaElement & {_on?: boolean})._on; }});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement & {_on?: boolean}) { this._on = true; this.dispatchEvent(new Event('play')); return Promise.resolve(); });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement & {_on?: boolean}) { this._on = false; this.dispatchEvent(new Event('pause')); });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 10) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  URL.createObjectURL = vi.fn(() => 'blob:recording');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const ROUTES = {
  'GET /api/documents/d1': DOC, 'GET /api/documents/d1/transcript': TRANSCRIPT, 'GET /api/documents/d1/media': {status: 200, body: 'ID3'},
  'GET /api/documents/d1/candidates': [{id: 'c1', investigation_id: 'inv-1', document_id: 'd1', chunk_id: 'ch-s4', candidate_type: 'entity', confidence: 0.8,
    review_status: 'proposed', payload: {caption: 'Mister Ross', suggested_schema: 'Person', rationale: {rule: 'capitalized_name_sequence'}}, created_at: '2026-10-28T10:00:00'}],
  'GET /api/investigations': [{id: 'inv-1', name: 'The harbour land'}], 'GET /api/investigations/inv-1/documents': [],
};

describe('Listen & read helpers', () => {
  it('writes times and places as the transcript and the evidence keep them', () => {
    expect(clock(731.84)).toBe('12:11.8');
    expect(clock(3725.2)).toBe('1:02:05.2');
    expect(clock(65, false)).toBe('1:05');
    expect(placeOf({start: 731.84, end: 740.21})).toBe('t=731.8,740.2');
  });

  it('pins the words chosen in a line, with their own times and the unsure ones', () => {
    expect(partOf(VALUATION, 'saw a valuation', 0.5)).toEqual({segmentId: 's2', start: 3.6, end: 4.6, text: 'saw a valuation', unsure: ['valuation']});
    expect(partOf(VALUATION, '', 0.5)).toMatchObject({start: 3.3, end: 5.8, text: VALUATION.text, unsure: ['valuation']});
    expect(partOf(VALUATION, 'not in this line', 0.5).start).toBe(3.3);
    expect(joinWords([{w: 'was'}, {w: '4'}, {w: '.2'}, {w: 'million,'}, {w: 'euros'}, {w: '.'}])).toBe('was 4.2 million, euros.');
  });
});

describe('Listen & read', () => {
  it('opens a recording beside its transcript, with the parts with no speech kept apart', async () => {
    mockApi(ROUTES);
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const transcript = await screen.findByRole('main', {name: 'Transcript'});
    // Where it ran stays on screen; the tool, model and time are on hover (Ony, 29 Oct).
    expect((await within(transcript).findByText(/faster-whisper 1.2.1 · small · run on this computer/)).closest('[hidden]')).not.toBeNull();
    expect(within(transcript).getByText('⌂ on this computer')).toBeVisible();
    const silence = within(transcript).getByRole('group', {name: 'No speech, 0:05.8 to 0:12.4'});
    expect(silence).toHaveTextContent('No speech was found from 0:05.8 to 0:12.4. Words here may be invented by the model. They are kept apart and never used as evidence.');
    expect(within(silence).queryByRole('button', {name: /Pin/})).toBeNull();
    expect(within(transcript).getByTitle('Machine unsure: 31%. Listen before quoting it.')).toHaveTextContent('valuation');
    expect(screen.getByText('Audio · 0:19')).toBeInTheDocument();
    const facts = screen.getByRole('complementary', {name: 'This recording'});
    expect(facts).toHaveTextContent('Spoken parts3');
    expect(facts).toHaveTextContent('No speech1');
    expect(within(facts).getByRole('link', {name: '1 proposal from this transcript'})).toBeInTheDocument();
  });

  it('saves a quote only after its part was played through and heard', async () => {
    const api = mockApi({...ROUTES, 'POST /api/evidence': {id: 'ev-1', source_id: 'src-1', quote: VALUATION.text, locator: 't=3.3,5.8', heard_by: 'you'}});
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Pin the line at 0:03.3'}));
    const quote = screen.getByRole('region', {name: 'Pinned quote'});
    expect(quote).toHaveTextContent('“I never saw a valuation before we voted.”');
    expect(within(quote).getByText('media:#t=3.3,5.8')).toBeInTheDocument();
    expect(quote).toHaveTextContent('The machine was unsure of valuation. Listen before you quote.');
    const heard = within(quote).getByRole('button', {name: /I heard this/});
    const save = within(quote).getByRole('button', {name: /Save as evidence/});
    expect(heard).toBeDisabled();
    expect(save).toBeDisabled();

    await waitFor(() => expect(within(quote).getByRole('button', {name: /Play this part · 2.5 s/})).toBeEnabled());
    await user.click(within(quote).getByRole('button', {name: /Play this part/}));
    expect(at).toBe(3.3);
    await act(async () => { at = 5.81; await new Promise(r => setTimeout(r, 40)); });
    await waitFor(() => expect(heard).toBeEnabled());
    await user.click(heard);
    expect(quote).toHaveTextContent('Heard by you');
    await user.click(save);
    await waitFor(() => expect(api.calls('POST /api/evidence')).toHaveLength(1));
    expect(api.calls('POST /api/evidence')[0].body).toEqual({source_id: 'src-1', quote: VALUATION.text, locator: 't=3.3,5.8', heard: true});
    expect(await within(quote).findByText(/Saved as evidence, heard by you/)).toBeInTheDocument();
  });

  it('plays, pauses and moves five seconds with the keys', async () => {
    mockApi(ROUTES);
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    await screen.findByRole('main', {name: 'Transcript'});
    await waitFor(() => expect(screen.getByRole('button', {name: 'Play'})).toBeEnabled());
    fireEvent.keyDown(window, {key: ' '});
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    fireEvent.keyDown(window, {key: 'ArrowRight'});
    expect(at).toBe(5);
    fireEvent.keyDown(window, {key: 'ArrowLeft'});
    expect(at).toBe(0);
  });
});
