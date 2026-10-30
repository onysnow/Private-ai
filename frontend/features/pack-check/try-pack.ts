// A pack to try Check a pack with, made from this case: the pack as made, or a copy with one file changed, one taken
// out and one added, all done here in the browser (the zip's other entries are copied as they are, still compressed).
// Only for trying the check: the altered copy is never kept or sent anywhere but to the check itself.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

type Entry = {name: string; method: number; local: Uint8Array; central: Uint8Array; data: Uint8Array};

/** The zip's entries, each with its local header and data, and its central record, as they are. */
export function readZip(zip: Uint8Array): Entry[] {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Not a .zip');
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const out: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (v.getUint32(at, true) !== 0x02014b50) throw new Error('A broken .zip');
    const method = v.getUint16(at + 10, true);
    const size = v.getUint32(at + 20, true);
    const n = v.getUint16(at + 28, true), e = v.getUint16(at + 30, true), c = v.getUint16(at + 32, true);
    const off = v.getUint32(at + 42, true);
    const name = dec.decode(zip.subarray(at + 46, at + 46 + n));
    const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
    out.push({name, method, local: zip.slice(off, start + size), central: zip.slice(at, at + 46 + n + e + c), data: zip.slice(start, start + size)});
    at += 46 + n + e + c;
  }
  return out;
}

/** A new entry, stored as it is (no compression). */
function stored(name: string, data: Uint8Array): Entry {
  const nm = new TextEncoder().encode(name);
  const crc = crc32(data);
  const local = new Uint8Array(30 + nm.length + data.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
  lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, nm.length, true);
  local.set(nm, 30); local.set(data, 30 + nm.length);
  const central = new Uint8Array(46 + nm.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
  cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nm.length, true);
  central.set(nm, 46);
  return {name, method: 0, local, central, data};
}

/** The entries as one .zip, each central record pointing at where its entry now sits. */
export function writeZip(entries: Entry[]): Uint8Array {
  const size = entries.reduce((s, x) => s + x.local.length + x.central.length, 0) + 22;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  let at = 0;
  const offsets = entries.map(x => { const o = at; out.set(x.local, at); at += x.local.length; return o; });
  const cd = at;
  entries.forEach((x, i) => { out.set(x.central, at); v.setUint32(at + 42, offsets[i], true); at += x.central.length; });
  v.setUint32(at, 0x06054b50, true); v.setUint16(at + 8, entries.length, true); v.setUint16(at + 10, entries.length, true);
  v.setUint32(at + 12, at - cd, true); v.setUint32(at + 16, cd, true);
  return out;
}

async function contents(x: Entry): Promise<Uint8Array> {
  if (x.method === 0) return x.data;
  const stream = new Blob([x.data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export type Altered = {zip: Uint8Array; changed: string; missing: string | null; added: string};

/** A copy of the pack with one exhibit changed (a line added at its end), one custody page taken out and a copy of
 *  the exhibit added beside it: the four states the check tells apart. */
export async function alterForTry(zip: Uint8Array): Promise<Altered> {
  const entries = readZip(zip);
  const listed = (n: string) => !n.endsWith('/') && !/(^|\/)(MANIFEST\.sha256(\.sig)?|PUBLIC_KEY\.pem)$/.test(n);
  const target = entries.find(x => /(^|\/)exhibits\/\d{3}\//.test(x.name)) ?? entries.find(x => listed(x.name));
  if (!target) throw new Error('The pack has no file to change');
  const gone = entries.find(x => /(^|\/)custody\//.test(x.name) && !x.name.endsWith('/')) ?? null;
  const before = await contents(target);
  const after = new Uint8Array(before.length + 1);
  after.set(before); after[before.length] = 0x0a;
  const dot = target.name.lastIndexOf('.');
  const added = dot > target.name.lastIndexOf('/') ? `${target.name.slice(0, dot)} (1)${target.name.slice(dot)}` : `${target.name} (1)`;
  const next = entries.filter(x => x !== gone).map(x => (x === target ? stored(x.name, after) : x));
  next.push(stored(added, before));
  return {zip: writeZip(next), changed: target.name, missing: gone?.name ?? null, added};
}
