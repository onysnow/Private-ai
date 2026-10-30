// The Library's list (features/documents/library-model.ts): what kind each file is, where it is in its reading,
// filtering with the containers above a match kept as context, folding, sorting, and titles told apart by their end.
import {describe, expect, it} from 'vitest';

import {fileKind, fileState, lanesById, libraryRows, sharedOpenings, sharedPrefix, tally} from '../features/documents/library-model';
import type {DocumentOut, DropLaneOut} from '../lib/generated/types.gen';
import {dropLane} from '../test-support/library';

function doc(id: string, filename: string, overrides: Partial<DocumentOut> = {}): DocumentOut {
  return {id, investigation_id: 'inv-1', source_id: `src-${id}`, filename, mime_type: null, sha256: 'abc', extraction_status: 'complete',
    extraction_error: null, extraction_issues: [], created_at: '2026-10-02T00:00:00', chunk_count: 1, candidate_counts: {},
    openaleph_document_id: null, openaleph_schema: null, parent_document_id: null, ...overrides};
}
const lane = (id: string, overrides: Record<string, unknown> = {}, receipt: Record<string, unknown> = {}) =>
  dropLane(id, id, overrides, receipt) as unknown as DropLaneOut;
const none = {query: '', kinds: new Set<never>(), states: new Set<never>()};
const byAdded = {key: 'added' as const, descending: false};
const ids = (rows: {document: DocumentOut}[]) => rows.map(r => r.document.id);

describe('The Library list', () => {
  it('names each file\'s kind by its extension, else by what OpenAleph read it as or its declared type', () => {
    expect(fileKind(doc('a', 'minutes.PDF'))).toBe('pdf');
    expect(fileKind(doc('a', 'thread.mbox'))).toBe('archive');
    expect(fileKind(doc('a', 'Who bought it?', {openaleph_schema: 'Email'}))).toBe('email');
    expect(fileKind(doc('a', 'capture', {mime_type: 'image/jpeg'}))).toBe('picture');
    expect(fileKind(doc('a', 'ledger.xlsx'))).toBe('table');
    expect(fileKind(doc('a', 'unknown.bin'))).toBe('other');
  });

  it('puts each file in one state, worst first', () => {
    expect(fileState(doc('a', 'a.pdf', {extraction_status: 'failed'}))).toBe('problem');
    expect(fileState(doc('a', 'a.pdf'), lane('a', {problem: true}))).toBe('problem');
    expect(fileState(doc('a', 'a.pdf', {extraction_status: 'extracting'}), lane('a', {stalled_minutes: 9}))).toBe('stuck');
    expect(fileState(doc('a', 'a.pdf', {extraction_status: 'queued'}))).toBe('reading');
    expect(fileState(doc('a', 'a.pdf'), lane('a', {}, {waiting: {entity: 2}}))).toBe('waiting');
    expect(fileState(doc('a', 'a.pdf'), lane('a'))).toBe('clean');
  });

  it('keeps each file under its container, folds it, and shows a container above a file that matches as context', () => {
    const documents = [doc('box', 'bundle.zip'), doc('memo', 'memo.txt'), doc('in', 'letter.pdf', {parent_document_id: 'box', extraction_status: 'failed'})];
    const lanes = lanesById([lane('box', {children: [lane('in')]}), lane('memo')]);
    expect(ids(libraryRows(documents, lanes, none, byAdded))).toEqual(['box', 'in', 'memo']);
    expect(ids(libraryRows(documents, lanes, none, byAdded, new Set(['box'])))).toEqual(['box', 'memo']);
    // A filter sets folding aside: the file that matches shows, under its container, which is only context.
    const problems = libraryRows(documents, lanes, {...none, states: new Set(['problem'])}, byAdded, new Set(['box']));
    expect(problems.map(r => [r.document.id, r.context])).toEqual([['box', true], ['in', false]]);
    expect(ids(libraryRows(documents, lanes, {...none, query: 'MEMO'}, byAdded))).toEqual(['memo']);
    expect(ids(libraryRows(documents, lanes, {...none, kinds: new Set(['pdf'])}, byAdded))).toEqual(['box', 'in']);
    expect(libraryRows(documents, lanes, none, byAdded)[0].children).toBe(1);
  });

  it('sorts by a number, most first, ties by name', () => {
    const documents = [doc('a', 'a.pdf'), doc('b', 'b.pdf'), doc('c', 'c.pdf')];
    const lanes = lanesById([lane('a', {}, {waiting: {entity: 1}}), lane('b', {}, {waiting: {entity: 5}}), lane('c', {}, {waiting: {entity: 1}})]);
    expect(ids(libraryRows(documents, lanes, none, {key: 'waiting', descending: true}))).toEqual(['b', 'a', 'c']);
  });

  it('counts the files of each kind and in each state', () => {
    const {kinds, states} = tally([doc('a', 'a.pdf'), doc('b', 'b.pdf', {extraction_status: 'failed'}), doc('c', 'c.eml')], new Map());
    expect(Object.fromEntries(kinds)).toEqual({pdf: 2, email: 1});
    expect(Object.fromEntries(states)).toEqual({clean: 2, problem: 1});
  });

  it('finds the long opening titles share with the files around them, so their ends tell them apart', () => {
    const titles = ['Email rebuilt from United States v. Real Property ¶64: 1MDB official',
      'Email rebuilt from United States v. Real Property ¶72: compliance officer', 'Board minutes, March'];
    expect(sharedOpenings(titles)).toEqual([50, 50, 0]);
    expect(titles[0].slice(50)).toBe('¶64: 1MDB official');
    expect(sharedPrefix('Board minutes', 'Board minutes, March')).toBe(0);   // one is the other's start
    expect(sharedOpenings(['Report on A', 'Report on B'])).toEqual([0, 0]);   // too short to be worth folding
  });
});
