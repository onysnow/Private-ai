// A fetch stub that answers by route, not by call order (ADR-0005, line 15).
//
// Page tests used to list the server's replies in the exact order the page
// requested them. That order is an implementation detail: once panels load
// their own data through TanStack Query, requests run side by side and the
// order changes with every move. Here each reply is keyed by method and
// path, the way Mock Service Worker matches requests, so a test says what
// the server holds and asserts on what the screen shows.
//
// Usage:
//   const api = mockApi({
//     'GET /api/investigations': [],
//     'GET /api/search': ({url}) => searchBody(url.searchParams.get('q')),
//     'POST /api/timeline-events': {status: 201, body: event},
//   });
//   ...
//   expect(api.calls('GET /api/search')).toHaveLength(1);
//   expect(api.lastUrl('GET /api/search').searchParams.get('q')).toBe('Kestrelwood');
import {vi} from 'vitest';

export type RouteCall = {method: string; url: URL; init: RequestInit; body: unknown};
type Reply = {status?: number; body?: unknown; headers?: Record<string, string>};
type Handler = Reply | unknown | ((call: RouteCall) => Reply | unknown);
export type Routes = Record<string, Handler>;

function isReply(value: unknown): value is Reply {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'status' in value && typeof (value as Reply).status === 'number';
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {status, headers: {'content-type': 'application/json', ...headers}});
}

function routeKey(method: string, url: URL): string {
  return `${method.toUpperCase()} ${url.pathname}`;
}

function parsedText(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

/** Bytes, not a form or a string. Checked by shape rather than instanceof:
 * under jsdom the Blob a Request hands back is Node's, not the window's. */
function isBytes(value: unknown): value is Blob | ArrayBuffer | ArrayBufferView {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
  return typeof value === 'object' && value !== null && typeof (value as Blob).arrayBuffer === 'function' && typeof (value as Blob).size === 'number';
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  const raw = init?.body ?? (input instanceof Request && !['GET', 'HEAD'].includes(input.method.toUpperCase()) ? await input.blob() : undefined);
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') return parsedText(raw);
  // Bytes -- how the generated client's calls arrive, through
  // ApiClient.fetchForGenerated -- are read the way the server reads them: a
  // multipart body as its form, anything else as JSON when it parses.
  if (isBytes(raw)) {
    const type = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get('content-type') ?? '';
    const bytes = new Response(raw, {headers: type ? {'content-type': type} : {}});
    return type.startsWith('multipart/form-data') ? bytes.formData() : parsedText(await bytes.text());
  }
  return raw;
}

export type MockApi = {
  fetch: ReturnType<typeof vi.fn>;
  /** Every call to a route, oldest first. */
  calls: (route: string) => RouteCall[];
  lastUrl: (route: string) => URL;
  lastBody: (route: string) => unknown;
  /** Adds or replaces routes after the stub is installed. */
  add: (routes: Routes) => void;
  /** Routes that were requested but never configured; a test can assert this is empty. */
  unmatched: () => string[];
};

/** Installs the stub on `globalThis.fetch` for the current test. A route is
 * `METHOD /path` (the query string is not part of the key; read it from the
 * recorded call's URL). An unconfigured route answers 404 with a JSON body
 * naming it, so a missing route fails loudly in the panel, not silently. */
export function mockApi(routes: Routes = {}): MockApi {
  const table: Routes = {...routes};
  const seen: RouteCall[] = [];
  const unmatched: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://api.test');
    const call: RouteCall = {method, url, init: init ?? {}, body: await readBody(input, init)};
    seen.push(call);
    const key = routeKey(method, url);
    if (!(key in table)) {
      unmatched.push(key);
      return jsonResponse({detail: `no mock for ${key}`}, 404);
    }
    const handler = table[key];
    const produced = typeof handler === 'function' ? (handler as (c: RouteCall) => Reply | unknown)(call) : handler;
    if (produced instanceof Response) return produced;
    if (isReply(produced)) return jsonResponse(produced.body, produced.status, produced.headers);
    return jsonResponse(produced);
  });
  vi.stubGlobal('fetch', fetchMock);
  const normalize = (route: string): string => {
    const [method, ...rest] = route.trim().split(/\s+/);
    return `${method.toUpperCase()} ${rest.join(' ')}`;
  };
  const calls = (route: string) => seen.filter(c => routeKey(c.method, c.url) === normalize(route));
  const last = (route: string): RouteCall => {
    const rows = calls(route);
    if (!rows.length) throw new Error(`${route} was never requested; seen: ${seen.map(c => routeKey(c.method, c.url)).join(', ') || 'nothing'}`);
    return rows[rows.length - 1];
  };
  return {
    fetch: fetchMock,
    calls,
    lastUrl: route => last(route).url,
    lastBody: route => last(route).body,
    add: more => { Object.assign(table, more); },
    unmatched: () => [...unmatched],
  };
}
