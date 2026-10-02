// Validator coverage for lib/api-validate.ts (STRUCT-0015): the runtime
// guards that are supposed to catch a malformed backend response before it's
// trusted as typed. Each test feeds a payload missing/wrong-typing a
// required field and confirms the parse helper throws ApiPayloadError,
// rather than silently passing a bad shape through. (The validators of the
// replies that moved onto the generated API client went with them; the
// generated Zod checks cover those, tests/test-generated-panels.test.tsx.)
import {describe, expect, it} from 'vitest';
import {ApiPayloadError, parseSearchBody} from '../lib/api-validate';

describe('parseSearchBody', () => {
  const endpoint = '/api/search';

  it('parses a well-formed search response body', () => {
    const body = {results: [], counts: {}, group_counts: {}};
    expect(parseSearchBody(body, endpoint)).toEqual(body);
  });

  it('throws when counts is missing', () => {
    expect(() => parseSearchBody({results: [], group_counts: {}}, endpoint)).toThrow(ApiPayloadError);
  });

  it('throws when results is not an array', () => {
    expect(() => parseSearchBody({results: 'nope', counts: {}, group_counts: {}}, endpoint)).toThrow(ApiPayloadError);
  });
});
