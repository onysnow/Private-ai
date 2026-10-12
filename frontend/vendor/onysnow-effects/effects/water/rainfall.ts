/**
 * The rain falling outside, behind the glass (Ony, 2026-10-10: "do we have
 * the actual falling rain visible? it would need to change with the wind").
 *
 * What a camera records of falling rain (Garg & Nayar, "Photorealistic
 * rendering of rain streaks", 2006; Tatarchuk, ATI's ToyShop rain, 2006):
 * a raindrop is a tiny lens that crosses many pixels while the shutter is
 * open, so each shows as a faint, thin streak as long as its fall in the
 * exposure -- not a dot -- brighter against a dark background than a light
 * one, and mostly transparent. Behind a window whose glass is in focus the
 * rain is out of focus: the near rain broad, soft and faint, the far rain
 * thin and dim, in between the sharpest. All of it slants together at the
 * angle of the wind across the drops' fall (terminal speeds 4-9 m/s), and
 * swings and gusts with the wind.
 *
 * Here three depths of streaks in a pane's own pixels; the wind is the
 * pane's (effects/water/wind via the sim). No DOM, no GL: a 2D canvas.
 */
import { RAIN_FALL_MS } from "./sim";

type Layer = {
  /** Screen speed for a fall of RAIN_FALL_MS, px/s per px of pane height. */
  speed: number;
  /** How many per 100 000 px^2 at a rain rate of 0.1 drops/cm^2/s. */
  density: number;
  /** Streak width, px per 500 px of pane height, and its softness (blur in widths). */
  width: number;
  alpha: number;
};

/** Far to near: more, thinner and dimmer far off; few, broad, soft and faint close to the glass (out of focus). */
const LAYERS: readonly Layer[] = [
  { speed: 1.6, density: 70, width: 0.9, alpha: 0.16 },
  { speed: 2.8, density: 22, width: 2.2, alpha: 0.1 },
  { speed: 5.0, density: 4, width: 7, alpha: 0.05 },
];

/** The exposure the streaks are drawn for, s (a video frame's shutter, 1/30 s). */
const EXPOSURE = 1 / 30;

export class RainFall {
  private x: Float32Array;
  private y: Float32Array;
  private layer: Uint8Array;
  private jitter: Float32Array;
  private n = 0;
  private w = 0;
  private h = 0;
  private seedState: number;
  private sprites: HTMLCanvasElement[] = [];

  constructor(seed = 1) {
    this.seedState = (seed * 2654435761) % 2147483647 || 1;
    this.x = new Float32Array(0);
    this.y = new Float32Array(0);
    this.layer = new Uint8Array(0);
    this.jitter = new Float32Array(0);
  }

  private rand(): number {
    this.seedState = (this.seedState * 16807) % 2147483647;
    return this.seedState / 2147483647;
  }

  /** A streak: a soft vertical line, a pixel wide and long, blurred by `soft` (drawn scaled). */
  private sprite(k: number): HTMLCanvasElement {
    if (this.sprites[k]) return this.sprites[k]!;
    const c = document.createElement("canvas");
    const W = 16;
    const H = 64;
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    // Brightest in the middle of its length (the drop is in the frame for all of it, a gaussian across).
    const img = g.createImageData(W, H);
    const soft = [0.18, 0.28, 0.42][k]!;
    for (let j = 0; j < H; j++) {
      const v = (j + 0.5) / H;
      const along = Math.sin(Math.PI * v) ** 0.6;
      for (let i = 0; i < W; i++) {
        const u = (i + 0.5) / W - 0.5;
        const across = Math.exp(-((u / soft) ** 2) * 2);
        const a = Math.round(255 * along * across);
        const o = (j * W + i) * 4;
        img.data[o] = 255;
        img.data[o + 1] = 255;
        img.data[o + 2] = 255;
        img.data[o + 3] = a;
      }
    }
    g.putImageData(img, 0, 0);
    this.sprites[k] = c;
    return c;
  }

  /** How many streaks for a pane of w x h px at this rain (drops / cm^2 / s) and amount (the Lab's "Falling rain"). */
  private resize(w: number, h: number, rate: number, amount: number) {
    const want = LAYERS.map((l) =>
      Math.round(((l.density * w * h) / 1e5) * Math.min(4, rate / 0.1) * amount),
    );
    const total = want.reduce((a, b) => a + b, 0);
    if (w === this.w && h === this.h && total === this.n) return;
    const x = new Float32Array(total);
    const y = new Float32Array(total);
    const layer = new Uint8Array(total);
    const jitter = new Float32Array(total);
    let k = 0;
    for (let li = 0; li < LAYERS.length; li++)
      for (let q = 0; q < want[li]!; q++, k++) {
        // Keep the ones there were (no pop when the rain changes).
        if (k < this.n && this.layer[k] === li && w === this.w && h === this.h) {
          x[k] = this.x[k]!;
          y[k] = this.y[k]!;
          jitter[k] = this.jitter[k]!;
        } else {
          x[k] = this.rand() * w;
          y[k] = this.rand() * h;
          jitter[k] = 0.75 + 0.5 * this.rand();
        }
        layer[k] = li;
      }
    this.x = x;
    this.y = y;
    this.layer = layer;
    this.jitter = jitter;
    this.n = total;
    this.w = w;
    this.h = h;
  }

  /**
   * Move the rain on by dt s and draw it into a pane-sized 2D canvas.
   * wind: [x, y] m/s along the glass (y down); rate: drops / cm^2 / s.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    dt: number,
    wind: readonly [number, number],
    rate: number,
    amount: number,
  ) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!(rate > 0) || !(amount > 0)) return;
    this.resize(w, h, rate, amount);
    // Falling at its fall speed plus the wind's push along the glass; never upward (an updraft slows it).
    const fx = wind[0];
    const fy = Math.max(1.5, RAIN_FALL_MS + wind[1]);
    const len = Math.hypot(fx, fy);
    const ux = fx / len;
    const uy = fy / len;
    const scale = len / RAIN_FALL_MS;
    ctx.globalCompositeOperation = "screen";
    for (let k = 0; k < this.n; k++) {
      const L = LAYERS[this.layer[k]!]!;
      const v = L.speed * h * scale * this.jitter[k]!;
      let x = this.x[k]! + ux * v * dt;
      let y = this.y[k]! + uy * v * dt;
      const streak = v * EXPOSURE;
      // Off the pane: in again from the side the rain comes from.
      const pad = streak + 20;
      if (y - streak > h + 10 || x < -pad || x > w + pad) {
        if (Math.abs(ux) > 0.25 && this.rand() < Math.abs(ux) / (Math.abs(ux) + uy)) {
          x = ux > 0 ? -this.rand() * pad : w + this.rand() * pad;
          y = this.rand() * h;
        } else {
          x = this.rand() * (w + 2 * pad) - pad;
          y = -this.rand() * streak - 5;
        }
      }
      this.x[k] = x;
      this.y[k] = y;
      const width = Math.max(0.6, (L.width * h) / 500);
      ctx.globalAlpha = L.alpha * Math.min(1, amount);
      // The sprite stood along the fall, its head at (x, y).
      ctx.setTransform(uy, -ux, ux, uy, x, y);
      ctx.drawImage(this.sprite(this.layer[k]!), -width * 2, -streak, width * 4, streak);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}
