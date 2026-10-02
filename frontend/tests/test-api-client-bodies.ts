// ApiClient.fetchForGenerated hands a generated call's body to fetch as the
// bytes it is: a file in a FormData, a Blob or an ArrayBuffer arrives intact,
// boundary and all. It used to re-read every body as text, which a zip or a
// PDF does not survive (Foundation Fixes, defect 2).
import {afterEach, describe, expect, it, vi} from 'vitest';

import {ApiClient} from '../lib/api-client';

type Sent = {body: BodyInit | null | undefined; headers: Headers};

function captureFetch(): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({body: init?.body, headers: new Headers(init?.headers)});
    return new Response(JSON.stringify({ok: true}), {status: 200, headers: {'content-type': 'application/json'}});
  });
  return sent;
}

/** What a server reads from a sent body: its bytes. */
async function bytesOf(sent: Sent): Promise<Uint8Array> {
  return new Uint8Array(await new Response(sent.body ?? null).arrayBuffer());
}

// Every byte value, so a text round trip would change some of them.
const BINARY = Uint8Array.from({length: 256}, (_, i) => i);

afterEach(() => { vi.unstubAllGlobals(); });

describe('ApiClient.fetchForGenerated', () => {
  it('sends a file in a FormData byte for byte, with its multipart boundary', async () => {
    const sent = captureFetch();
    const form = new FormData();
    form.append('investigation_id', 'inv-1');
    form.append('file', new Blob([BINARY], {type: 'application/zip'}), 'backup.zip');
    const request = new Request('http://api.test/api/backups/inspect', {method: 'POST', body: form});

    await new ApiClient('http://api.test').fetchForGenerated(request);

    const type = sent[0].headers.get('content-type') ?? '';
    expect(type).toMatch(/^multipart\/form-data; boundary=/);
    const received = await new Response(sent[0].body ?? null, {headers: {'content-type': type}}).formData();
    expect(received.get('investigation_id')).toBe('inv-1');
    const file = received.get('file') as File;
    expect(file.name).toBe('backup.zip');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(BINARY);
  });

  it('sends a Blob and an ArrayBuffer unchanged', async () => {
    const sent = captureFetch();
    const client = new ApiClient('http://api.test');
    await client.fetchForGenerated(new Request('http://api.test/api/raw', {method: 'PUT', body: new Blob([BINARY])}));
    await client.fetchForGenerated(new Request('http://api.test/api/raw', {method: 'PUT', body: BINARY.buffer}));
    expect(await bytesOf(sent[0])).toEqual(BINARY);
    expect(await bytesOf(sent[1])).toEqual(BINARY);
  });

  it('sends JSON as it is, and no body at all for a GET or a POST without one', async () => {
    const sent = captureFetch();
    const client = new ApiClient('http://api.test');
    await client.fetchForGenerated(new Request('http://api.test/api/claims', {method: 'POST', body: JSON.stringify({text: 'Ünïcödé — ok'}), headers: {'content-type': 'application/json'}}));
    await client.fetchForGenerated(new Request('http://api.test/api/claims'));
    await client.fetchForGenerated(new Request('http://api.test/api/demo/seed', {method: 'POST'}));
    expect(JSON.parse(new TextDecoder().decode(await bytesOf(sent[0])))).toEqual({text: 'Ünïcödé — ok'});
    expect(sent[0].headers.get('content-type')).toBe('application/json');
    expect(sent[1].body).toBeUndefined();
    expect(sent[2].body).toBeUndefined();
  });
});
