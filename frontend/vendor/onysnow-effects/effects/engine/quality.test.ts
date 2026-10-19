import { afterEach, describe, expect, it } from "vitest";
import { resetPreviews } from "./preview";
import {
  SLOW_FRAME_MS,
  SLOW_RUN,
  isSoftwareRenderer,
  noteFrame,
  passScaleCap,
  surfaceScaleCap,
  quality,
  resetQuality,
  startingTier,
  stepDown,
} from "./quality";

/*
 * Item 34: quality tiers.
 */
describe("where a device starts", () => {
  it("is minimal on a phone or with reduced motion", () => {
    expect(startingTier({ coarse: true, reducedMotion: false })).toBe("minimal");
    expect(startingTier({ coarse: false, reducedMotion: true })).toBe("minimal");
  });

  it("is lite with little memory or few cores, else full", () => {
    expect(startingTier({ coarse: false, reducedMotion: false, memoryGb: 4, cores: 16 })).toBe(
      "lite",
    );
    expect(startingTier({ coarse: false, reducedMotion: false, memoryGb: 16, cores: 4 })).toBe(
      "lite",
    );
    expect(startingTier({ coarse: false, reducedMotion: false, memoryGb: 8, cores: 8 })).toBe(
      "full",
    );
    // A browser that says nothing is taken at its word: full.
    expect(startingTier({ coarse: false, reducedMotion: false })).toBe("full");
  });

  it("knows a renderer with no GPU behind it", () => {
    expect(isSoftwareRenderer("Google SwiftShader")).toBe(true);
    expect(isSoftwareRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(true);
    expect(isSoftwareRenderer("Microsoft Basic Render Driver")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11)")).toBe(false);
  });
});

describe("the tier while the page runs", () => {
  afterEach(() => {
    resetQuality();
    resetPreviews();
  });

  it("is full, at the passes' usual scale, unless tried", () => {
    expect(quality()).toBe("full");
    expect(passScaleCap()).toBe(1.5);
    // The light on the glass carries the fine smudge and scratch detail: drawn at a 2x display's own density.
    expect(surfaceScaleCap()).toBe(2);
    stepDown("lite");
    expect(quality()).toBe("full");
  });

  it("steps down after a long run of slow frames, when tried, and never back up", () => {
    resetPreviews(["quality"]);
    expect(quality()).toBe("full");
    for (let i = 0; i < SLOW_RUN - 1; i++) noteFrame(SLOW_FRAME_MS + 10);
    expect(quality()).toBe("full");
    // A good frame starts the count again.
    noteFrame(16);
    for (let i = 0; i < SLOW_RUN - 1; i++) noteFrame(SLOW_FRAME_MS + 10);
    expect(quality()).toBe("full");
    noteFrame(SLOW_FRAME_MS + 10);
    expect(quality()).toBe("lite");
    expect(passScaleCap()).toBe(1);
    expect(surfaceScaleCap()).toBe(1);
    stepDown("full");
    expect(quality()).toBe("lite");
  });
});
