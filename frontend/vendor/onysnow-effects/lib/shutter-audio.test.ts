import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { steady } from "./shutter-audio";

/**
 * The charge bed, against the actual recording.
 *
 * `flash-charge.mp3` is a capacitor really winding up, so it swells and dies
 * across its own length. Looping it replayed that swell every 1.87 seconds and
 * the whine pulsed instead of holding. This runs the shipped flattening over
 * the real decoded samples and asserts the swell is gone.
 *
 * The fixture is the mp3 decoded to mono 48kHz signed 16-bit, so the test
 * needs no audio decoder and no browser, and the file stays under 180kB.
 */
const SAMPLE_RATE = 48_000;

function fixture(): Float32Array {
  const path = fileURLToPath(new URL("./__fixtures__/charge.s16", import.meta.url));
  const raw = readFileSync(path);
  const pcm = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) out[i] = pcm[i]! / 32768;
  return out;
}

/** Just enough of the Web Audio surface for `steady` to work on. */
function fakeBuffer(data: Float32Array) {
  return {
    numberOfChannels: 1,
    length: data.length,
    sampleRate: SAMPLE_RATE,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

const fakeContext = {
  createBuffer(channels: number, length: number, sampleRate: number) {
    const store = [new Float32Array(length)];
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: (i: number) => store[i]!,
    } as unknown as AudioBuffer;
  },
} as unknown as AudioContext;

/** RMS in equal slices, normalised to the loudest, so shape is comparable. */
function envelope(x: Float32Array, slices = 20): number[] {
  const out: number[] = [];
  for (let i = 0; i < slices; i += 1) {
    const from = Math.floor((i * x.length) / slices);
    const to = Math.floor(((i + 1) * x.length) / slices);
    let sum = 0;
    for (let k = from; k < to; k += 1) sum += x[k]! * x[k]!;
    out.push(Math.sqrt(sum / (to - from)));
  }
  const loudest = Math.max(...out);
  return out.map((v) => v / loudest);
}

function peak(x: Float32Array): number {
  let m = 0;
  for (const v of x) if (Math.abs(v) > m) m = Math.abs(v);
  return m;
}

describe("steady", () => {
  const source = fixture();
  const flattened = steady(fakeBuffer(source), fakeContext).getChannelData(0);

  it("starts from a recording that really does swell", () => {
    // If this ever stops being true the fixture has been replaced and the
    // numbers below need revisiting rather than silently passing.
    expect(Math.min(...envelope(source))).toBeLessThan(0.45);
  });

  it("takes the swell out, which is what made the loop pulse", () => {
    expect(Math.min(...envelope(flattened))).toBeGreaterThan(0.85);
  });

  it("leaves the loop join without a step in it", () => {
    const y = flattened;
    expect(Math.abs(y[y.length - 1]! - y[0]!) / peak(y)).toBeLessThan(0.05);
  });

  it("keeps the level it arrived at, so nothing downstream needs retuning", () => {
    expect(peak(flattened)).toBeCloseTo(peak(source), 2);
  });

  it("does not trim away any meaningful length", () => {
    expect(source.length - flattened.length).toBeLessThan(500);
  });

  it("survives silence and a single sample without dividing by zero", () => {
    for (const data of [new Float32Array(2048), new Float32Array([0.5])]) {
      const out = steady(fakeBuffer(data), fakeContext).getChannelData(0);
      for (const v of out) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
