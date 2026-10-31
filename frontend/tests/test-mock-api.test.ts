// The page-test fetch stub (test-support/mock-api.ts; review C3): a GET to a route the API has
// answers an empty reply of its documented shape when no test configured it; a route the API does
// not have still fails and is reported; and the shared page fixtures match the API's own shapes.
import {afterEach, describe, expect, it, vi} from 'vitest';

import * as zod from '../lib/generated/zod.gen';
import {documentedRoute, emptyOf, mockApi} from '../test-support/mock-api';
import {pageRoutes} from '../test-support/page-routes';

afterEach(() => { vi.unstubAllGlobals(); });

type Schema = {$ref?: string; type?: string; items?: Schema};
type ZodLike = {safeParse: (value: unknown) => {success: boolean; error?: {issues: unknown[]}}};

/** The generated validator for a documented 200 reply: its component's zod schema, or a list of them. */
function validatorFor(method: string, path: string): ZodLike | undefined {
  const op = documentedRoute(method, path)?.op as {responses?: Record<string, {content?: Record<string, {schema?: Schema}>}>} | undefined;
  const schema = op?.responses?.['200']?.content?.['application/json']?.schema;
  const named = (s?: Schema) => s?.$ref ? (zod as unknown as Record<string, ZodLike>)[`z${s.$ref.split('/').pop()}`] : undefined;
  if (schema?.type === 'array') {
    const item = named(schema.items);
    return item ? {safeParse: value => Array.isArray(value) && value.every(v => item.safeParse(v).success)
      ? {success: true} : {success: false, error: {issues: [value]}}} : undefined;
  }
  return named(schema);
}

describe('mockApi', () => {
  it('answers an unconfigured GET to a documented route with an empty reply of its shape, and says so', async () => {
    const api = mockApi({});
    const list = await fetch('http://api.test/api/investigations');
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([]);
    const one = await (await fetch('http://api.test/api/investigations/inv-1/wire')).json();
    expect(one).toMatchObject({investigation_id: '', entities: [], links: [], events: []});
    expect(api.defaulted()).toEqual(['GET /api/investigations', 'GET /api/investigations/inv-1/wire']);
    expect(api.unmatched()).toEqual([]);
    expect(api.unknown()).toEqual([]);
  });

  it('fails a route the API does not have, and an unconfigured change, loudly', async () => {
    const api = mockApi({});
    expect((await fetch('http://api.test/api/no-such-route')).status).toBe(404);
    expect((await fetch('http://api.test/api/investigations', {method: 'POST', body: '{}'})).status).toBe(404);
    expect(api.unknown()).toEqual(['GET /api/no-such-route']);
    expect(api.unmatched()).toEqual(['GET /api/no-such-route', 'POST /api/investigations']);
    expect(api.defaulted()).toEqual([]);
  });

  it('builds the emptiest value a schema allows', () => {
    expect(emptyOf({type: 'array'})).toEqual([]);
    expect(emptyOf({anyOf: [{type: 'string'}, {type: 'null'}]})).toBeNull();
    expect(emptyOf({type: 'object', required: ['n', 'ok'], properties: {n: {type: 'integer'}, ok: {type: 'boolean'}, x: {type: 'string'}}}))
      .toEqual({n: 0, ok: false});
  });
});

describe('the shared page fixtures (test-support/page-routes.ts)', () => {
  it('answer only routes the API has, each in the shape the API documents', () => {
    const routes = pageRoutes({investigations: [{id: 'inv-1', name: 'Harbour', is_demo: true}]});
    const problems: string[] = [];
    let checked = 0;
    for (const [key, reply] of Object.entries(routes)) {
      const [method, path] = key.split(' ');
      if (!documentedRoute(method, path)) { problems.push(`${key}: not a route of the API`); continue; }
      const validator = validatorFor(method, path);
      // A function answers per call; a {status} reply is an error the test chose: neither is a fixture body.
      const isReply = typeof reply === 'object' && reply !== null && typeof (reply as {status?: unknown}).status === 'number';
      if (!validator || typeof reply === 'function' || isReply) continue;
      checked += 1;
      const result = validator.safeParse(reply);
      if (!result.success) problems.push(`${key}: ${JSON.stringify(result.error?.issues).slice(0, 300)}`);
    }
    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThan(10);
  });
});
