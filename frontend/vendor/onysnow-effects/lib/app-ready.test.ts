import { describe, expect, it, vi } from "vitest";

import { heldCount, holdLoader, whenAppReady } from "./app-ready";

describe("app-ready", () => {
  it("waits for every hold, then resolves", async () => {
    const a = holdLoader("a");
    const b = holdLoader("b");
    let done = false;
    const ready = whenAppReady().then(() => {
      done = true;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(done).toBe(false);
    a();
    await new Promise((r) => setTimeout(r, 50));
    expect(done).toBe(false);
    b();
    b(); // twice is fine
    await ready;
    expect(done).toBe(true);
    expect(heldCount()).toBe(0);
  });

  it("never keeps anyone out: a hold lets go by itself", async () => {
    vi.useFakeTimers();
    holdLoader("stuck", 1000);
    expect(heldCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1001);
    expect(heldCount()).toBe(0);
    vi.useRealTimers();
  });
});
