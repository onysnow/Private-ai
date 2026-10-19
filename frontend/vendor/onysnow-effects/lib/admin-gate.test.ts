import { describe, expect, it } from "vitest";
import { asksForExperiments, isLocalDev } from "./admin-gate";
import { previewing, resetPreviews } from "@fx/effects/engine/preview";

describe("only Ony sees the experimental parts (item 48)", () => {
  it("is open only on the dev server on this machine", () => {
    expect(isLocalDev(true, "127.0.0.1")).toBe(true);
    expect(isLocalDev(true, "localhost")).toBe(true);
    // A production build, anywhere.
    expect(isLocalDev(false, "127.0.0.1")).toBe(false);
    expect(isLocalDev(false, "onysnow.studio")).toBe(false);
    // A dev server someone else can reach (a hosted preview).
    expect(isLocalDev(true, "id-preview--abc.lovable.app")).toBe(false);
  });

  it("knows which addresses ask for unreleased work", () => {
    expect(asksForExperiments("?try=redroom")).toBe(true);
    expect(asksForExperiments("?quality=lite")).toBe(true);
    expect(asksForExperiments("?crackphoto=/x.webp")).toBe(true);
    expect(asksForExperiments("?perf=1")).toBe(true);
    expect(asksForExperiments("?laser=green")).toBe(true);
    expect(asksForExperiments("?glass=raster")).toBe(false);
    expect(asksForExperiments("")).toBe(false);
  });

  it("shows no preview where it cannot check (no window: the server)", () => {
    resetPreviews();
    expect(previewing("redroom")).toBe(false);
  });
});
