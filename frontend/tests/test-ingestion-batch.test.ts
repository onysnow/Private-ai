// The helpers behind a recorded import (features/documents/ingestion-batch.ts)
// and the structured error message an upload's 409 carries (lib/api-client.ts).
import {afterEach, describe, expect, it, vi} from 'vitest';

import {reviewOrderFrom, stillReading} from '../features/documents/ingestion-batch';
import {ApiClient, ApiHttpError} from '../lib/api-client';

afterEach(() => vi.unstubAllGlobals());

describe('ingestion batch helpers', () => {
  it('starts the review where the reporter chose and keeps the rest in order', () => {
    expect(reviewOrderFrom(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(reviewOrderFrom(['a', 'b', 'c'], null)).toEqual(['a', 'b', 'c']);
    expect(reviewOrderFrom(['a', 'b'], 'gone')).toEqual(['a', 'b']);
  });

  it('knows when a file is still being read', () => {
    const doc = (finished: boolean | null) => ({job: finished === null ? null : {finished}}) as never;
    expect(stillReading(undefined)).toBe(false);
    expect(stillReading({documents: [doc(true), doc(null)]} as never)).toBe(false);
    expect(stillReading({documents: [doc(true), doc(false)]} as never)).toBe(true);
  });
});

describe('a structured error detail', () => {
  it('is read by its message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({detail: {message: 'Already in this investigation as “memo.txt”', document: {id: 'doc-1'}}}),
      {status: 409, headers: {'content-type': 'application/json'}})));
    const error = await new ApiClient('http://api.test').unknown('/api/documents/upload', {method: 'POST', body: {}}).catch(e => e);
    expect(error).toBeInstanceOf(ApiHttpError);
    expect((error as ApiHttpError).status).toBe(409);
    expect((error as ApiHttpError).detail).toBe('Already in this investigation as “memo.txt”');
  });
});
