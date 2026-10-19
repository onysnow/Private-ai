// A configured API address with a path prefix (https://api.example/workbench) must give /workbench/api/...,
// once, for generated calls as for hand-written ones (Copilot review of PR 60).
import {afterEach, describe, expect, it, vi} from 'vitest';

import {ApiClient} from '../lib/api-client';

function captureUrls(): string[] {
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ok: true}), {status: 200, headers: {'content-type': 'application/json'}});
  });
  return urls;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('ApiClient base path', () => {
  it('does not apply a configured path prefix twice to a generated call', async () => {
    const urls = captureUrls();
    const client = new ApiClient('https://api.example/workbench');
    await client.fetchForGenerated(new Request('https://api.example/workbench/api/investigations?limit=5'));
    await client.unknown('/api/investigations?limit=5');
    expect(urls).toEqual([
      'https://api.example/workbench/api/investigations?limit=5',
      'https://api.example/workbench/api/investigations?limit=5',
    ]);
  });

  it('leaves a base with no prefix alone', async () => {
    const urls = captureUrls();
    await new ApiClient('http://api.test').fetchForGenerated(new Request('http://api.test/api/x'));
    await new ApiClient('').fetchForGenerated(new Request('http://localhost/api/x'));
    expect(urls).toEqual(['http://api.test/api/x', '/api/x']);
  });
});
