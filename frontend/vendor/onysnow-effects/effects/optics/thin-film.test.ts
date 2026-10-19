import { describe, expect, it } from "vitest";
import {
  BOW_X,
  NM_PER_PX,
  PRESS,
  FILM_LUT_SCALE,
  coherence,
  contactGap,
  darkRingRadius,
  faceR0,
  faceRoughnessNm,
  filmLut,
  filmReflectance,
  filmRgb,
  ftirTransmission,
  incoherentFilm,
} from "./thin-film";

/*
 * Item 29, light step G: two panes resting on each other. An air film
 * between them rings like Newton's (Hecht 9.7), touches black, washes out
 * to the incoherent sum, is lost on a rough face (Bennett & Porteus 1961),
 * and leaks guided light where it is thinner than a wavelength (Zhu 1986).
 */

const N = 1.518;

describe("the air film between two panes", () => {
  it("where the glass touches, the two faces are gone: nothing is reflected", () => {
    for (const lambda of [450, 550, 650]) expect(filmReflectance(0, lambda, N)).toBe(0);
  });

  it("is brightest a quarter wave thick: 4 R0 / (1 + R0)^2, about 15.5%", () => {
    const R0 = faceR0(N);
    expect(filmReflectance(550 / 4, 550, N)).toBeCloseTo((4 * R0) / (1 + R0) ** 2, 10);
    expect(filmReflectance(550 / 4, 550, N)).toBeCloseTo(0.156, 3);
    // And dark again every half wave.
    expect(filmReflectance(550, 550, N)).toBeCloseTo(0, 10);
  });

  it("averages, over a cycle, to the incoherent sum of its two faces (8.1%)", () => {
    let sum = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) sum += filmReflectance((i / n) * 275, 550, N);
    expect(sum / n).toBeCloseTo(incoherentFilm(N), 4);
    expect(incoherentFilm(N)).toBeCloseTo(0.081, 3);
  });

  it("in white light: black at contact, then colours, washing out to grey", () => {
    const black = filmRgb(0, N);
    for (const c of black) expect(c).toBeLessThan(0.002);
    // Past two microns the film is the incoherent grey on every channel.
    const thick = filmRgb(4000, N);
    for (const c of thick) expect(c).toBeCloseTo(incoherentFilm(N), 2);
    // In between it is coloured: the channels disagree.
    const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
    const colourful = [300, 500, 700, 900].map((d) => spread(filmRgb(d, N)));
    expect(Math.max(...colourful)).toBeGreaterThan(0.02);
    expect(spread(thick)).toBeLessThan(0.004);
  });

  it("follows Newton's sequence: grey, straw, purple, blue, then second-order yellow", () => {
    // (The path difference is twice the gap: a 200 nm gap is 400 nm of path.)
    const [r0, g0, b0] = filmRgb(100, N);
    expect(Math.max(r0, g0, b0) - Math.min(r0, g0, b0)).toBeLessThan(0.05); // lavender grey
    const [r1, , b1] = filmRgb(200, N);
    expect(r1).toBeGreaterThan(b1 * 3); // straw to orange
    const [r2, , b2] = filmRgb(300, N);
    expect(b2).toBeGreaterThan(r2 * 3); // blue
    const [r3, g3, b3] = filmRgb(420, N);
    expect(Math.min(r3, g3)).toBeGreaterThan(b3 * 3); // yellow
  });

  it("shows no colours through a satin-etched face; a polished one keeps them", () => {
    expect(coherence(1, 550)).toBeGreaterThan(0.99);
    expect(coherence(800, 550)).toBeLessThan(1e-3);
    const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
    expect(spread(filmRgb(300, N, 800))).toBeLessThan(0.001);
  });

  it("a satin-etched face is rough enough to lose them; float glass's own faces are not", () => {
    const satin = { frost: 0.6, frostedFace: "back" as const };
    expect(faceRoughnessNm(satin, "back")).toBe(600);
    expect(faceRoughnessNm(satin, "front")).toBe(1);
    expect(coherence(faceRoughnessNm(satin, "back"), 550)).toBeLessThan(0.01);
  });

  it("lets guided light through where thinner than a wavelength (frustrated TIR)", () => {
    const sin = Math.sin((70 * Math.PI) / 180);
    expect(ftirTransmission(0, 550, N, sin)).toBe(1);
    const t50 = ftirTransmission(50, 550, N, sin);
    const t100 = ftirTransmission(100, 550, N, sin);
    // Exponential in the gap: doubling it squares the share.
    expect(t100).toBeCloseTo(t50 * t50, 10);
    expect(ftirTransmission(1000, 550, N, sin)).toBeLessThan(1e-8);
  });

  it("packs into the shader's table without clipping", () => {
    const lut = filmLut(N, 64);
    expect(Math.max(...lut)).toBeLessThanOrEqual(255);
    for (let d = 0; d <= 2000; d += 25)
      for (const c of filmRgb(d, N)) expect(c).toBeLessThan(FILM_LUT_SCALE);
  });
});

describe("where two resting panes touch", () => {
  it("touch in a small black disc, pressed flat by the upper pane's weight", () => {
    expect(contactGap(0, 0)).toBe(0);
    expect(contactGap(3, 3)).toBe(0);
    expect(contactGap(40, 0)).toBeGreaterThan(0);
  });

  it("ring out as Newton's rings: the m-th dark ring at sqrt(m lambda R)", () => {
    for (const m of [1, 2, 5]) {
      const r = darkRingRadius(m, 550);
      // A half wave of gap (plus the press) there: dark.
      expect(contactGap(r, 0)).toBeCloseTo((m * 550) / 2, 6);
      expect(filmReflectance(contactGap(r, 0), 550, N)).toBeCloseTo(0, 8);
    }
    // Radii grow as the square root of the order.
    const r1 = darkRingRadius(1, 550) ** 2;
    const r4 = darkRingRadius(4, 550) ** 2;
    const press = (2 * BOW_X * PRESS) / NM_PER_PX ** 2;
    expect((r4 - press) / (r1 - press)).toBeCloseTo(4, 6);
  });

  it("from a float glass bow: the first ring a few millimetres out, ellipses", () => {
    const mm = (px: number) => (px * NM_PER_PX) / 1e6;
    expect(mm(darkRingRadius(1, 550))).toBeGreaterThan(5);
    expect(mm(darkRingRadius(1, 550))).toBeLessThan(15);
    expect(contactGap(60, 0)).toBeGreaterThan(contactGap(0, 60));
  });
});
