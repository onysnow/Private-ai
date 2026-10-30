// @vitest-environment jsdom
// A photo's own page (features/reading-room/photo-room.tsx; mockup MEDIA_1): the file's claims shown as claims, faces
// found by a detector only and blurred in a copy when a person says yes, a redaction that needs its reason, and the
// edit trail as a tree from the original.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {PhotoRoom, photoLine, trailLine, trailTree} from '../features/reading-room/photo-room';
import type {DerivedFileOut, DocumentDetailOut} from '../lib/generated/types.gen';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const DOC = {id: 'd1', investigation_id: 'inv-1', filename: 'IMG_4471.jpg', title: 'Fences on the harbour land', sha256: 'a'.repeat(64),
  mime_type: 'image/jpeg'} as unknown as DocumentDetailOut;
const PHOTO = {document_id: 'd1', filename: 'IMG_4471.jpg', sha256: 'a'.repeat(64), kind: 'JPEG', width: 4032, height: 3024, date_tag: 'DateTimeOriginal',
  claims: {make: 'Apple', model: 'iPhone 11', software: 'iOS 12.4', capture_time: '2019-08-14T10:42:07', capture_time_has_offset: false, gps: {latitude: 51.4823, longitude: -3.1792}},
  nearest_place: {metres: 30, entity_id: 'p1', caption: 'plot 14'}, place_proposal: {id: 'c1', status: 'proposed'}, text: ['KESTREL SA — PRIVATE'], face_model_here: true};
const row = (id: string, operation: string, extra: Partial<DerivedFileOut> = {}): DerivedFileOut => ({id, document_id: 'd1', parent_id: null, parent_sha256: 'a'.repeat(64),
  sha256: id.repeat(64).slice(0, 64), size: 10, mime_type: 'image/jpeg', operation, params: {}, tool: 'Pillow 11.0.0', model: null, model_sha256: null, job_id: null,
  created_by: 'local-owner', created_at: '2026-10-28T14:02:00', ...extra});

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  vi.stubGlobal('URL', Object.assign(URL, {createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined}));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('photo trail', () => {
  it('draws copies under the copy they were made from, and says each in a line', () => {
    const rows = [row('a', 'blur_faces', {params: {radius: 24, regions: 2}, tool: 'LightCraft (onysnow/lightcraft 76b5377)'}), row('b', 'strip_metadata', {parent_id: 'a'}), row('c', 'turn', {params: {degrees: 90}})];
    expect(trailTree(rows).map(t => [t.row.id, t.depth])).toEqual([['a', 1], ['b', 2], ['c', 1]]);
    expect(trailLine(rows[0])).toBe('blur r=24 · 2 regions · LightCraft · you');
    expect(trailLine(row('d', 'redact', {params: {reason: 'a car plate'}}))).toBe('“a car plate” · Pillow 11.0.0 · you');
  });
});

describe('photo line', () => {
  it('says what the photo is and its day by its own clock, or that it gives none', () => {
    expect(photoLine(PHOTO as never, '2019-08-14T10:42:07')).toBe('A photo · 4032 × 3024 JPEG · 14 Aug 2019 by its own clock');
    expect(photoLine({...PHOTO, claims: {}} as never, null)).toBe('A photo · 4032 × 3024 JPEG · no date of its own');
  });
});

describe('PhotoRoom', () => {
  it('says once that a file claims nothing about itself, and why no text was read', async () => {
    mockApi({'GET /api/documents/d1/photo': {...PHOTO, claims: {}, date_tag: null, nearest_place: null, place_proposal: null, text: []},
      'GET /api/documents/d1/derived': [], 'GET /api/documents/d1/picture': {status: 200, body: 'x'}});
    const doc = {...DOC, extraction_issues: ['The text in this picture could not be read: Tesseract is not installed.']} as DocumentDetailOut;
    render(<QueryProvider><PhotoRoom doc={doc} caseName="The harbour land" onClose={() => undefined} onText={() => undefined}/></QueryProvider>);
    const claims = await screen.findByRole('complementary', {name: 'What the file claims'});
    expect(within(claims).getByText('Nothing about itself')).toBeInTheDocument();
    expect(within(claims).queryByText('no GPS in the file')).not.toBeInTheDocument();
    expect(await within(claims).findByText('4032 × 3024 · JPEG')).toBeInTheDocument();
    expect(screen.getByText('Text in it: not read')).toBeInTheDocument();
    expect(screen.getByText('No place: no GPS')).toBeInTheDocument();
    expect(screen.getByText(/No copies yet/)).toBeInTheDocument();
  });

  it('shows what the file claims, and blurs the faces the detector found when a person says yes', async () => {
    const api = mockApi({'GET /api/documents/d1/photo': PHOTO, 'GET /api/documents/d1/derived': [],
      'GET /api/documents/d1/picture': {status: 200, body: 'x'},
      'POST /api/documents/d1/faces': {faces: [{x: 0.5, y: 0.3, w: 0.1, h: 0.2, score: 0.9}], model: 'YuNet', model_sha256: 'f'.repeat(64)},
      'POST /api/documents/d1/derived/photo': {status: 201, body: row('n1', 'blur_faces', {params: {radius: 24, regions: 1}})}});
    render(<QueryProvider><PhotoRoom doc={DOC} caseName="The harbour land" onClose={() => undefined} onText={() => undefined}/></QueryProvider>);
    expect(await screen.findByText('Apple iPhone 11')).toBeInTheDocument();
    expect(screen.getByText('30 m from plot 14')).toBeInTheDocument();
    expect(screen.getByText(/from “DateTimeOriginal”; no time zone in the file/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Look for faces'}));
    expect(await screen.findByText('1 face found')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Yes: blur them for export'}));
    await vi.waitFor(() => expect(api.lastBody('POST /api/documents/d1/derived/photo')).toEqual({params: {radius: 24, boxes: [{x: 0.5, y: 0.3, w: 0.1, h: 0.2, score: 0.9}]},
      operation: 'blur_faces', from_id: null}));
    expect(await screen.findByText('kept: blurred in a copy')).toBeInTheDocument();
  });

  it('keeps or rejects the place its GPS proposes', async () => {
    const api = mockApi({'GET /api/documents/d1/photo': PHOTO, 'GET /api/documents/d1/derived': [], 'GET /api/documents/d1/picture': {status: 200, body: 'x'},
      'POST /api/extraction-candidates/c1/review': {candidate: {}, record: null}});
    render(<QueryProvider><PhotoRoom doc={DOC} caseName="The harbour land" onClose={() => undefined} onText={() => undefined}/></QueryProvider>);
    await userEvent.setup().click(await screen.findByRole('button', {name: 'Yes: keep the place'}));
    await vi.waitFor(() => expect(api.lastBody('POST /api/extraction-candidates/c1/review')).toEqual({decision: 'accept', entity_schema: 'Address'}));
  });

  it('lists the trail from the original', async () => {
    mockApi({'GET /api/documents/d1/photo': PHOTO, 'GET /api/documents/d1/picture': {status: 200, body: 'x'},
      'GET /api/documents/d1/derived': [row('a', 'blur_faces', {params: {radius: 24, regions: 2}}), row('b', 'strip_metadata', {parent_id: 'a'})]});
    render(<QueryProvider><PhotoRoom doc={DOC} caseName="The harbour land" onClose={() => undefined} onText={() => undefined}/></QueryProvider>);
    const trail = await screen.findByRole('region', {name: 'Edit trail'});
    expect(await within(trail).findByText('Metadata removed')).toBeInTheDocument();
    expect(within(trail).getByText('IMG_4471.jpg · original')).toBeInTheDocument();
    expect(screen.getByRole('tab', {name: 'Edit trail · 2'})).toBeInTheDocument();
  });
});
