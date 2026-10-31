// Try a pack (features/pack-check/try-pack.ts): a copy of a pack with one file changed, one taken out and one added,
// made in the browser; the other entries are copied as they are.
import {deflateRawSync, inflateRawSync} from 'node:zlib';
import {describe, expect, it} from 'vitest';

import {alterForTry, crc32, readZip, writeZip} from '../features/pack-check/try-pack';

/** A zip whose entries are deflated, as the app's packs are. */
function makeZip(files: Record<string, string>): Uint8Array {
  const enc = new TextEncoder();
  const entries = Object.entries(files).map(([name, text]) => {
    const raw = enc.encode(text), data = new Uint8Array(deflateRawSync(raw)), nm = enc.encode(name);
    const local = new Uint8Array(30 + nm.length + data.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(8, 8, true); lv.setUint32(14, crc32(raw), true);
    lv.setUint32(18, data.length, true); lv.setUint32(22, raw.length, true); lv.setUint16(26, nm.length, true);
    local.set(nm, 30); local.set(data, 30 + nm.length);
    const central = new Uint8Array(46 + nm.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, 8, true); cv.setUint32(16, crc32(raw), true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, raw.length, true); cv.setUint16(28, nm.length, true); central.set(nm, 46);
    return {name, method: 8, local, central, data};
  });
  return writeZip(entries);
}

const text = (zip: Uint8Array, name: string): string => {
  const x = readZip(zip).find(e => e.name === name);
  if (!x) throw new Error(`no ${name}`);
  return new TextDecoder().decode(x.method === 0 ? x.data : inflateRawSync(x.data));
};

describe('try a pack', () => {
  it('knows the CRC-32 of a known string', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('changes one exhibit, takes out one custody page and adds a copy; the rest stay as they were', async () => {
    const zip = makeZip({'MANIFEST.sha256': 'list', 'README.txt': 'read me', 'custody/c1.txt': 'chain', 'exhibits/001/exhibit.html': '<p>one</p>'});
    const out = await alterForTry(zip);
    expect(out).toMatchObject({changed: 'exhibits/001/exhibit.html', missing: 'custody/c1.txt', added: 'exhibits/001/exhibit (1).html'});
    expect(readZip(out.zip).map(e => e.name)).toEqual(['MANIFEST.sha256', 'README.txt', 'exhibits/001/exhibit.html', 'exhibits/001/exhibit (1).html']);
    expect(text(out.zip, 'exhibits/001/exhibit.html')).toBe('<p>one</p>\n');
    expect(text(out.zip, 'exhibits/001/exhibit (1).html')).toBe('<p>one</p>');
    expect(text(out.zip, 'README.txt')).toBe('read me');
  });
});
