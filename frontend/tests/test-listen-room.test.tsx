// @vitest-environment jsdom
// Listen & read (mockup INTAKE_4, ADR-0020): a recording opens beside its transcript; the parts with no speech are kept
// apart; words the machine was unsure of are marked; a pinned quote is saved only after its part was played through
// and the reporter says they heard it.
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {clock, joinWords, partOf, partsOf, placeOf} from '../features/reading-room/listen-room';
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
  'GET /api/documents/d1/derived': [],
};
const CLIP = {id: 'df-1', document_id: 'd1', parent_id: null, parent_sha256: DOC.sha256, sha256: 'e'.repeat(64), size: 299_000, mime_type: 'audio/wav',
  operation: 'clip', params: {start: 3.3, end: 5.8, locator: 't=3.3,5.8', sample_rate: 44100, channels: 1, from: 'the original'},
  tool: 'decoded and cut by PyAV 17.0.0 (FFmpeg)', model: null, model_sha256: null, job_id: null, created_by: 'local-owner', created_at: '2026-10-28T10:30:00'};

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

// A longer recording with many voices and no parts from its feed: three voices hold the floor, five are heard briefly.
const MANY = (() => {
  const segs = [seg('a', 0, 25, 'speech', 'Welcome to the show about the harbour land today.'), seg('b', 40, 70, 'speech', 'The minutes say the parcel was to be transferred.'),
    seg('c', 70, 84, 'no_speech', ''), seg('d', 84, 120, 'speech', 'I never saw a valuation before we voted.')]
    .map(x => ({...x, speaker: x.id === 'a' ? '1' : x.id === 'b' ? '2' : x.id === 'd' ? '3' : null}));
  const brief = ['4', '5', '6', '7', '8'].map((voice, i) => ({voice, spoken: 1 + i * 0.5, turns: 1, name: null, entity_id: null, named_by: null, named_at: null}));
  return {...TRANSCRIPT, duration: 120, segments: segs, voices: {voices: [
    {voice: '1', spoken: 25, turns: 1, name: 'Host', entity_id: null, named_by: 'local-owner', named_at: '2026-10-29T10:00:00'},
    {voice: '2', spoken: 30, turns: 1, name: null, entity_id: null, named_by: null, named_at: null},
    {voice: '3', spoken: 36, turns: 1, name: null, entity_id: null, named_by: null, named_at: null}, ...brief],
  turns: [[0, 25, 1], [25, 26, 4], [40, 70, 2], [84, 120, 3]], found_by: {tool: 'sherpa-onnx 2.0.1', where: 'this computer', ran_at: '2026-10-29T09:59:00'},
  history: [], unavailable: null}};
})();

describe('Parts of a recording', () => {
  it('takes the feed\'s parts when it names them, and otherwise finds them where one voice holds the floor', () => {
    expect(partsOf({...TRANSCRIPT, parts: [{start: 0, title: 'Welcome'}]} as never)).toEqual({parts: [{start: 0, title: 'Welcome'}], fromFeed: true});
    const {parts, fromFeed} = partsOf(MANY as never);
    expect(fromFeed).toBe(false);
    expect(parts.map(p => [p.start, p.voice ?? null, p.title])).toEqual([
      [0, '1', 'Welcome to the show about the…'], [40, '2', 'The minutes say the parcel was…'], [70, null, 'No speech'], [84, '3', 'I never saw a valuation before…']]);
    // Without speaker turns nothing honest can be shown: no parts.
    expect(partsOf(TRANSCRIPT as never).parts).toEqual([]);
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
    let made: unknown[] = [];
    const api = mockApi({...ROUTES, 'POST /api/evidence': {id: 'ev-1', source_id: 'src-1', quote: VALUATION.text, locator: 't=3.3,5.8', heard_by: 'you'},
      'GET /api/documents/d1/derived': () => made, 'POST /api/documents/d1/derived/clip': () => { made = [CLIP]; return {status: 201, body: CLIP}; }});
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
    // The part is kept as its own file too, cut from the original.
    await waitFor(() => expect(api.calls('POST /api/documents/d1/derived/clip')).toHaveLength(1));
    expect(api.calls('POST /api/documents/d1/derived/clip')[0].body).toEqual({start: 3.3, end: 5.8});
    const files = screen.getByRole('region', {name: 'Files'});
    expect(await within(files).findByText('clip_3.3-5.8.wav')).toBeInTheDocument();
    expect(files).toHaveTextContent('Quotes play from the original.');
  });

  it('shows the voices as guesses, names one as a party of the case, and says who said a pinned quote', async () => {
    const voiced = {...TRANSCRIPT, segments: TRANSCRIPT.segments.map(x => ({...x, speaker: x.kind === 'speech' ? (x.id === 's2' ? '2' : '1') : null})),
      voices: {voices: [{voice: '1', spoken: 5.8, turns: 2, name: 'Host', entity_id: null, named_by: 'local-owner', named_at: '2026-10-29T10:00:00'},
        {voice: '2', spoken: 2.5, turns: 1, name: null, entity_id: null, named_by: null, named_at: null}],
      turns: [[0, 2.9, 1], [3.2, 5.9, 2]], found_by: {tool: 'sherpa-onnx 2.0.1', segmentation: 'pyannote segmentation-3.0 (MIT)',
        embedding: '3D-Speaker CAM++ VoxCeleb 16k (Apache-2.0)', where: 'this computer', ran_at: '2026-10-29T09:59:00'}, history: [], unavailable: null}};
    const api = mockApi({...ROUTES, 'GET /api/documents/d1/transcript': voiced,
      'GET /api/investigations/inv-1/entities': [{id: 'e-holt', ftm_id: 'ftm-holt', caption: 'Maren Holt', schema: 'Person', investigation_id: 'inv-1', properties: {}, created_at: '2026-10-29T09:00:00'}],
      'PATCH /api/documents/d1/voices/2': voiced.voices});
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    const panel = await screen.findByRole('region', {name: 'Voices'});
    // One row a voice: its name, or "Voice 2 · a guess"; its turns and time are on hover.
    expect(await within(panel).findByText('Host')).toBeInTheDocument();
    expect(within(panel).getByText('Voice 2')).toBeInTheDocument();
    expect(within(panel).getByText('a guess')).toBeVisible();
    expect(within(panel).getByText('2 turns · 6 s').closest('[hidden]')).not.toBeNull();
    expect(panel).toHaveTextContent('a voice is never matched to another recording');
    // Each line says its voice in words; the machine's guess carries a "?".
    const lines = screen.getByRole('main', {name: 'Transcript'});
    expect(within(lines).getAllByText('Host')).toHaveLength(2);
    // Who named a voice, or that it is a guess, is on hover of its tag (Ony, 29 Oct).
    expect(within(lines).getAllByText('A guess by the speaker model').every(el => el.closest('[hidden]'))).toBe(true);

    // A click on the voice's row names it in place.
    await user.click(within(panel).getByRole('button', {name: 'Voice 2, a guess: name this voice'}));
    const box = within(panel).getByRole('combobox', {name: 'Name voice 2'});
    await waitFor(() => expect(panel.querySelector('datalist option[value="Maren Holt"]')).not.toBeNull());
    await user.type(box, 'Maren Holt');
    await user.click(within(panel).getByRole('button', {name: 'Name it'}));
    await waitFor(() => expect(api.calls('PATCH /api/documents/d1/voices/2')).toHaveLength(1));
    expect(api.calls('PATCH /api/documents/d1/voices/2')[0].body).toEqual({entity_id: 'e-holt'});

    await user.click(screen.getByRole('button', {name: 'Pin the line at 0:03.3'}));
    const quote = screen.getByRole('region', {name: 'Pinned quote'});
    expect(within(quote).getByText('Said by Voice 2 · a guess by the speaker model').closest('[hidden]')).not.toBeNull();
  });

  it('shows the parts from the feed and compares the publisher\'s transcript with ours', async () => {
    const withFeed = {...TRANSCRIPT, parts: [{start: 0, title: 'Welcome'}, {start: 3.3, title: 'The board meeting'}],
      publisher: {url: 'https://fernhillnotes.example/ep41.vtt', type: 'text/vtt', sha256: 'a'.repeat(64), bytes: 120, fetched_at: '2026-10-28T10:20:00', error: null,
        cues: [{start: 0, end: 2.8, text: 'Last week we spoke about the harbour land.', speaker: 'Host'}, {start: 3.3, end: 5.8, text: 'I never saw an evaluation before we voted.', speaker: 'Guest'}]}};
    const api = mockApi({...ROUTES, 'GET /api/documents/d1/transcript': withFeed, 'GET /api/documents/d1/transcript/compare': [
      {segment_id: 's2', start: 3.3, end: 5.8, kind: 'speech', speaker: null, differs: 4, no_speech_text: null,
        ours: 'I never saw a valuation'.split(' ').map((w, i) => ({w, differs: i >= 3})), theirs: 'I never saw an evaluation'.split(' ').map((w, i) => ({w, differs: i >= 3}))},
      {segment_id: 's3', start: 5.8, end: 12.4, kind: 'no_speech', speaker: null, differs: 0, no_speech_text: 'Thank you for watching.', ours: [], theirs: []}]});
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    const parts = await screen.findByRole('region', {name: 'Parts'});
    await user.click(within(parts).getByRole('button', {name: /The board meeting/}));
    expect(at).toBe(3.3);
    await user.click(screen.getByRole('tab', {name: 'Publisher’s transcript'}));
    const theirs = screen.getByLabelText("The publisher's transcript");
    expect(theirs).toHaveTextContent('I never saw an evaluation before we voted.');
    await user.click(screen.getByRole('tab', {name: 'Compare'}));
    const cmp = await screen.findByLabelText("Our transcription beside the publisher's");
    expect([...cmp.querySelectorAll('mark')].map(m => m.textContent)).toEqual(['a', 'valuation', 'an', 'evaluation']);
    expect(cmp).toHaveTextContent('(nothing written here)');
    expect(api.calls('GET /api/documents/d1/transcript/compare')).toHaveLength(1);
  });

  it('has no publisher\'s transcript to compare when the feed gave none', async () => {
    mockApi(ROUTES);
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    expect(await screen.findByRole('tab', {name: 'Compare'})).toBeDisabled();
    expect(screen.getByRole('tab', {name: 'Publisher’s transcript'})).toBeDisabled();
    expect(screen.queryByRole('region', {name: 'Parts'})).toBeNull();
  });

  it('lists the files made from the recording and makes a cleaned copy', async () => {
    const CLEANED = {...CLIP, id: 'df-2', operation: 'speech_cleaned', size: 608_000, params: {sample_rate: 16000, channels: 1, chain: []},
      tool: 'FilmCraft audio-dsp (onysnow/filmcraft 0800a8b); decoded by PyAV 17.0.0 (FFmpeg)'};
    let made: unknown[] = [CLIP];
    const api = mockApi({...ROUTES, 'GET /api/documents/d1/derived': () => made,
      'POST /api/documents/d1/derived/cleaned': () => { made = [CLIP, CLEANED]; return {status: 201, body: CLEANED}; },
      'GET /api/derived-files/df-1/file': {status: 200, body: 'RIFF'}, 'GET /api/derived-files/df-2/file': {status: 200, body: 'RIFF'}});
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', {name: /Edit trail · 1/}));
    const tab = screen.getByRole('region', {name: 'Edit trail'});
    expect(tab).toHaveTextContent('clip_3.3-5.8.wav');
    expect(tab).toHaveTextContent('made by you');
    await user.click(within(tab).getByRole('button', {name: 'Make a cleaned copy for listening'}));
    await waitFor(() => expect(api.calls('POST /api/documents/d1/derived/cleaned')).toHaveLength(1));
    expect(await within(tab).findByText('speech-cleaned.wav')).toBeInTheDocument();
    expect(tab).toHaveTextContent('16 kHz mono, hum taken out, light noise reduction. For listening only.');
    await user.click(screen.getByRole('tab', {name: 'Original'}));
    const orig = screen.getByRole('region', {name: 'The original'});
    expect(orig).toHaveTextContent('Unaltered, in the case’s own folder. Quotes play from these bytes.');
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

  it('lists the voices one row each, folds the brief ones, and lays each voice in its own lane under the parts', async () => {
    mockApi({...ROUTES, 'GET /api/documents/d1/transcript': MANY});
    render(<QueryProvider><ReadingRoom investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    const panel = await screen.findByRole('region', {name: 'Voices'});
    // Heard longest first; the five heard for a moment fold behind one row.
    expect((await within(panel).findAllByRole('button', {name: /name this voice|rename this voice/})).map(b => b.getAttribute('aria-label')))
      .toEqual(['Voice 3, a guess: name this voice', 'Voice 2, a guess: name this voice', 'Host: rename this voice']);
    await user.click(within(panel).getByRole('button', {name: /\+5/}));
    expect(within(panel).getAllByRole('button', {name: /name this voice|rename this voice/})).toHaveLength(8);
    const parts = screen.getByRole('region', {name: 'Parts'});
    expect(parts).toHaveTextContent('by who speaks');
    await user.click(within(parts).getByRole('button', {name: /I never saw a valuation/}));
    expect(at).toBe(84);
    // The player: a lane for each voice heard in the window, and nothing pinned says so in one line.
    expect(document.querySelectorAll('.lr-wave .lr-lane')).toHaveLength(4);
    const empty = screen.getByRole('region', {name: 'Pinned quote'});
    expect(within(empty).getByText('Nothing pinned')).toBeVisible();
    expect(within(empty).getByText(/Choose words in a line/).closest('[hidden]')).not.toBeNull();
    // The counts are on hover; the proposals waiting in Decide stay on screen.
    const facts = screen.getByRole('region', {name: 'In this recording'});
    expect(within(facts).getByText('Spoken parts').closest('[hidden]')).not.toBeNull();
    expect(within(facts).getByRole('link', {name: '1 proposal from this transcript'})).toBeVisible();
  });
});
