// Validator coverage for lib/api-validate.ts (STRUCT-0015): the runtime
// guards that are supposed to catch a malformed backend response before it's
// trusted as typed. Each test feeds a payload missing/wrong-typing a
// required field and confirms the guard rejects it (returns false) or the
// parse/json helper throws ApiPayloadError, rather than silently passing a
// bad shape through.
import {describe, expect, it} from 'vitest';
import {
  ApiPayloadError,
  isCanonicalEntity,
  isFinding,
  isInvestigation,
  isRelationship,
  isSettingsStatus,
  isTimelineEvent,
  jsonArray,
  jsonObject,
  parseEntityList,
  parseInvestigationList,
  parseSearchBody,
} from '../lib/api-validate';

const validInvestigation = {id: 'inv-1', name: 'Example Investigation'};
const validEntity = {id: 'ent-1', caption: 'Example Entity', schema: 'Person', properties: {}};
const validFinding = {id: 'f-1', provider: 'aleph', caption: 'Example', properties: {}, review_status: 'pending'};
const validTimelineEvent = {
  id: 't-1', kind: 'event', title: 'Something happened', date_start: '2026-01-01',
  precision: 'day', verification_status: 'unverified', provenance: {}, refs: {},
};
const validEndpoint = {id: 'e-1', caption: 'Endpoint', schema: 'Person'};
const validRelationship = {
  id: 'r-1', relationship_entity_id: 're-1', schema: 'UnknownLink', caption: 'Linked to',
  properties: {}, source: validEndpoint, target: validEndpoint,
};

describe('isInvestigation', () => {
  it('accepts a well-formed investigation', () => {
    expect(isInvestigation(validInvestigation)).toBe(true);
  });
  it('rejects a missing id', () => {
    const {id: _id, ...rest} = validInvestigation;
    expect(isInvestigation(rest)).toBe(false);
  });
  it('rejects a non-string name', () => {
    expect(isInvestigation({...validInvestigation, name: 42})).toBe(false);
  });
  it('rejects null and arrays', () => {
    expect(isInvestigation(null)).toBe(false);
    expect(isInvestigation([validInvestigation])).toBe(false);
  });
});

describe('isCanonicalEntity', () => {
  it('accepts a well-formed entity', () => {
    expect(isCanonicalEntity(validEntity)).toBe(true);
  });
  it('rejects a missing schema', () => {
    const {schema: _schema, ...rest} = validEntity;
    expect(isCanonicalEntity(rest)).toBe(false);
  });
  it('rejects properties that are not an object', () => {
    expect(isCanonicalEntity({...validEntity, properties: 'not-an-object'})).toBe(false);
  });
});

describe('isFinding', () => {
  it('accepts a well-formed finding', () => {
    expect(isFinding(validFinding)).toBe(true);
  });
  it('rejects a missing review_status', () => {
    const {review_status: _rs, ...rest} = validFinding;
    expect(isFinding(rest)).toBe(false);
  });
});

describe('isTimelineEvent', () => {
  it('accepts a well-formed event', () => {
    expect(isTimelineEvent(validTimelineEvent)).toBe(true);
  });
  it('rejects a missing verification_status', () => {
    const {verification_status: _vs, ...rest} = validTimelineEvent;
    expect(isTimelineEvent(rest)).toBe(false);
  });
  it('rejects provenance that is not an object', () => {
    expect(isTimelineEvent({...validTimelineEvent, provenance: 'not-an-object'})).toBe(false);
  });
});

describe('isRelationship', () => {
  it('accepts a well-formed relationship', () => {
    expect(isRelationship(validRelationship)).toBe(true);
  });
  it('rejects a source endpoint missing a schema', () => {
    const {schema: _schema, ...brokenSource} = validEndpoint;
    expect(isRelationship({...validRelationship, source: brokenSource})).toBe(false);
  });
});

describe('isSettingsStatus', () => {
  it('rejects a payload missing the connectors object entirely', () => {
    expect(isSettingsStatus({})).toBe(false);
  });
});

describe('jsonObject / jsonArray (response-shape guarding)', () => {
  const endpoint = '/api/test';

  it('throws ApiPayloadError when the response body is not valid JSON', async () => {
    const response = new Response('not json', {status: 200});
    await expect(jsonObject(response, endpoint, 'investigation', isInvestigation)).rejects.toThrow(ApiPayloadError);
  });

  it('throws ApiPayloadError when the parsed JSON does not match the guard', async () => {
    const response = new Response(JSON.stringify({unexpected: 'shape'}), {status: 200});
    await expect(jsonObject(response, endpoint, 'investigation', isInvestigation)).rejects.toThrow(ApiPayloadError);
  });

  it('returns the parsed value when it matches the guard', async () => {
    const response = new Response(JSON.stringify(validInvestigation), {status: 200});
    await expect(jsonObject(response, endpoint, 'investigation', isInvestigation)).resolves.toEqual(validInvestigation);
  });

  it('jsonArray rejects a non-array payload', async () => {
    const response = new Response(JSON.stringify({not: 'an array'}), {status: 200});
    await expect(jsonArray(response, endpoint, 'investigations', isInvestigation)).rejects.toThrow(ApiPayloadError);
  });

  it('jsonArray rejects an array containing one malformed item', async () => {
    const response = new Response(JSON.stringify([validInvestigation, {id: 'bad-only'}]), {status: 200});
    await expect(jsonArray(response, endpoint, 'investigations', isInvestigation)).rejects.toThrow(ApiPayloadError);
  });
});

describe('parseInvestigationList / parseEntityList', () => {
  const endpoint = '/api/test';

  it('parses a valid investigation array', () => {
    expect(parseInvestigationList([validInvestigation], endpoint)).toEqual([validInvestigation]);
  });

  it('throws on a malformed investigation in the array', () => {
    expect(() => parseInvestigationList([{name: 'missing id'}], endpoint)).toThrow(ApiPayloadError);
  });

  it('throws on a malformed entity in the array', () => {
    expect(() => parseEntityList([{id: 'e', caption: 'c'}], endpoint)).toThrow(ApiPayloadError);
  });
});

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
