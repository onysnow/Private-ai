import { describe, expect, it } from "vitest";

import {
  isResult,
  restoreTuning,
  RESULTS,
  serializeTuning,
  setValueIn,
  t,
  TUNING_DEFAULTS,
  tuning,
} from "./tuning";

/*
 * Optics plan step 7: he sets causes, physics sets effects. A result is a
 * locked model constant -- no control, and nothing saved can move it.
 */
describe("results are locked", () => {
  it("names only knobs that exist", () => {
    for (const key of Object.keys(RESULTS)) expect(tuning[key], key).toBeDefined();
  });

  it("keeps the causes the plan lists", () => {
    for (const key of [
      "edgeWidth",
      "roomBrightness",
      "glassBlur",
      "glassChroma",
      "glassTint",
      "coreGain",
      "aperture",
      "shadowHeight",
      "shadowSoftness",
      "floorGap",
      "shadowGap",
      "floorCaustics",
      "grimeRake",
      "grimeSpecks",
    ]) {
      expect(isResult(key), key).toBe(false);
    }
  });

  it("ignores a value set or saved for a result, and still takes one for a cause", () => {
    setValueIn("glassFresnel", "css", 9);
    restoreTuning({ css: { transmit: 0.99, floorLight: 3 }, raster: { transmit: 0.99 } });
    expect(t("glassFresnel")).toBe(TUNING_DEFAULTS["glassFresnel"]);
    expect(t("transmit")).toBe(TUNING_DEFAULTS["transmit"]);
    expect(t("floorLight")).toBe(TUNING_DEFAULTS["floorLight"]);

    restoreTuning({ css: { coreGain: 5 } });
    expect(t("coreGain")).toBe(5);
    restoreTuning({ css: { coreGain: TUNING_DEFAULTS["coreGain"]! } });
  });

  it("leaves results out of what Copy gives back", () => {
    const text = serializeTuning();
    expect(text).not.toMatch(/\bglassFresnel:/);
    expect(text).toMatch(/\bcoreGain:/);
  });
});

describe("saved tuning keeps only what was moved", () => {
  it("does not save values nobody touched", async () => {
    const { tuningSnapshot, resetTuning, TUNING_DEFAULTS } = await import("./tuning");
    resetTuning(TUNING_DEFAULTS);
    const snap = tuningSnapshot();
    expect(Object.keys(snap.css)).toEqual([]);
    expect(Object.keys(snap.raster)).toEqual([]);
  });

  it("ignores an old default in a store written when every knob was saved", async () => {
    const { restoreTuning, resetTuning, TUNING_DEFAULTS, t } = await import("./tuning");
    resetTuning(TUNING_DEFAULTS);
    restoreTuning({ css: { roomBrightness: 0 }, raster: { roomBrightness: 0 } });
    expect(t("roomBrightness")).toBe(1);
    restoreTuning({ css: { roomBrightness: 2.5 }, raster: { roomBrightness: 2.5 } });
    expect(t("roomBrightness")).toBe(2.5);
    resetTuning(TUNING_DEFAULTS);
  });
});

describe("the lab's saved tuning", () => {
  it("sets aside a store written the old way (every knob) and keeps the source's values", async () => {
    const mod = await import("./tuning");
    mod.resetTuning(mod.TUNING_DEFAULTS);
    const store = new Map<string, string>();
    const ls = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    const g = globalThis as unknown as { window?: unknown };
    const hadWindow = "window" in g;
    const before = g.window;
    g.window = { localStorage: ls };
    try {
      store.set(
        mod.TUNING_STORE,
        JSON.stringify({ css: { roomBrightness: 0 }, raster: { roomBrightness: 0 } }),
      );
      mod.loadSavedTuning();
      expect(mod.t("roomBrightness")).toBe(1);
      expect(store.has(mod.TUNING_STORE)).toBe(false);
      expect(store.has(`${mod.TUNING_STORE}:before-2026-09-28`)).toBe(true);

      store.set(
        mod.TUNING_STORE,
        JSON.stringify({ v: 2, css: { roomBrightness: 2 }, raster: { roomBrightness: 2 } }),
      );
      mod.loadSavedTuning();
      expect(mod.t("roomBrightness")).toBe(2);
    } finally {
      if (hadWindow) g.window = before;
      else delete g.window;
      mod.resetTuning(mod.TUNING_DEFAULTS);
    }
  });
});

describe("the site's published tuning", () => {
  it("applies the moved knobs over the source's values, for everyone", async () => {
    const mod = await import("./tuning");
    mod.applySiteTuning(
      JSON.stringify({ v: 2, css: { edgeBloom: 0.4 }, raster: { edgeBloom: 0.4 } }),
    );
    expect(mod.t("edgeBloom")).toBe(0.4);
    // A later publish that no longer moves it puts the source's value back.
    mod.applySiteTuning(JSON.stringify({ v: 2, css: {}, raster: {} }));
    expect(mod.t("edgeBloom")).toBe(mod.TUNING_DEFAULTS["edgeBloom"]);
  });

  it("ignores an empty or malformed row", async () => {
    const mod = await import("./tuning");
    mod.applySiteTuning("");
    mod.applySiteTuning("{not json");
    expect(mod.t("edgeBloom")).toBe(mod.TUNING_DEFAULTS["edgeBloom"]);
  });
});
