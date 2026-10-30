// @vitest-environment jsdom
// A recording's sound tools (features/reading-room/sound-tools.tsx; mockup MEDIA_2): the cleaning steps a person
// picks sent as asked, the loudness before and after said, and another recording lined up and accepted.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {CleanAndCut, SyncPanel, clockOf, matchWords} from '../features/reading-room/sound-tools';
import type {DocumentDetailOut} from '../lib/generated/types.gen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const docOf = (id: string, filename: string) => ({id, investigation_id: 'inv-1', filename, source_id: 'src-1', sha256: 'a'.repeat(64),
  extraction_status: 'complete', extraction_error: null, extraction_issues: [], chunk_count: 0, candidate_counts: {}, chunks: [],
  created_at: '2026-10-03T01:00:00'});
const DOC = docOf('r1', 'council-phone.m4a') as unknown as DocumentDetailOut;
const SOUND = {document_id: 'r1', duration: 72.5, hum: {hz: 50, harmonics: 2, above_db: 30}, loudness_lufs: -31.4, cleaned_id: null, sync: null};
const transcript = (id: string, duration: number) => ({document_id: id, kind: 'audio', duration, streams: [], outline: [0.2, 0.8, 0.4], outline_step: duration / 3,
  segments: [], about: {}, publisher: null, parts: [], voices: null, unsure_below: 0.5});

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  vi.stubGlobal('URL', Object.assign(URL, {createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined}));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('sound tools', () => {
  it('says times and how clear a match is', () => {
    expect(clockOf(724.2)).toBe('12:04.2');
    expect(matchWords({confidence: 900.6, distinct: 12.4, reliable: true})).toBe('clear match (peak 901× the background, 12.4× the next best)');
    expect(matchWords({confidence: 5, reliable: false})).toBe('not a clear match');
  });

  it('makes the cleaned copy with the steps picked, and says the hum it found', async () => {
    const api = mockApi({'GET /api/documents/r1/sound': SOUND, 'GET /api/documents/r1/spectrogram.png': {status: 200, body: 'x'},
      'POST /api/documents/r1/derived/cleaned': {status: 201, body: {id: 'c1'}}, 'GET /api/documents/r1/derived': []});
    const said: string[] = [];
    render(<QueryProvider><CleanAndCut doc={DOC} duration={72.5} files={[]} onStatus={s => said.push(s)}/></QueryProvider>);
    expect(await screen.findByText('50 Hz + 2 harmonics')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'light'}));
    await user.click(screen.getByLabelText(/Even out loudness/));
    await user.click(screen.getByRole('button', {name: 'Make the cleaned copy'}));
    await vi.waitFor(() => expect(api.lastBody('POST /api/documents/r1/derived/cleaned')).toEqual({hum: true, noise: 'light', loudness_target: null}));
    expect(screen.getByText('-31.4 → — LUFS')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Cut from the original'})).toBeDisabled();
  });

  it('says it is drawing the sound inside the frame, as a status, until the picture comes', async () => {
    mockApi({'GET /api/documents/r1/sound': SOUND, 'GET /api/documents/r1/spectrogram.png': {status: 200, body: 'x'}, 'GET /api/documents/r1/derived': []});
    render(<QueryProvider><CleanAndCut doc={DOC} duration={72.5} files={[]} onStatus={() => undefined}/></QueryProvider>);
    const waiting = screen.getByRole('status');
    expect(waiting).toHaveTextContent('Drawing the sound…');
    expect(waiting.closest('.snd-frame')).not.toBeNull();
    expect(await screen.findByRole('img', {name: /The sound from 0:00.0 to 1:00.0, original/})).toHaveClass('snd-spectro');
  });

  it('lines up another recording and keeps the offset once accepted', async () => {
    const found = {other_document_id: 'r2', offset_seconds: -2.48, confidence: 900.6, distinct: 12.4, reliable: true};
    const api = mockApi({'GET /api/documents/r1/sound': SOUND,
      'GET /api/investigations/inv-1/documents': [docOf('r1', 'council-phone.m4a'), docOf('r2', 'council-video.mp4'), docOf('p', 'minutes.pdf')],
      'GET /api/documents/r1/transcript': transcript('r1', 72.5), 'GET /api/documents/r2/transcript': transcript('r2', 75),
      'POST /api/documents/r1/sync': found,
      'POST /api/documents/r1/sync/accept': {...found, accepted_by: 'local-owner', accepted_at: '2026-10-29T07:00:00'}});
    render(<QueryProvider><SyncPanel doc={DOC} investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Find the offset'}));
    expect(await screen.findByText(/Offset -2.48 s · clear match/)).toBeInTheDocument();
    expect(screen.getByText('council-video.mp4 started 2.48 s before council-phone.m4a.')).toBeInTheDocument();
    expect(screen.getByRole('option', {name: 'council-video.mp4'})).toBeInTheDocument();
    expect(screen.queryByRole('option', {name: 'minutes.pdf'})).toBeNull();
    await user.click(screen.getByRole('button', {name: 'Accept the offset'}));
    await vi.waitFor(() => expect(api.lastBody('POST /api/documents/r1/sync/accept')).toEqual({other_document_id: 'r2'}));
    expect(await screen.findByText(/Accepted by you, 29 Oct 2026, \d\d:\d\d/)).toBeInTheDocument();
  });
});
