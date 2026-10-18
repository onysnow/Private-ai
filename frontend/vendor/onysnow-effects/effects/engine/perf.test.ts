import { describe, expect, it } from "vitest";
import { summarise } from "./perf";

describe("the performance readout's arithmetic", () => {
  it("averages, takes the 95th percentile and the worst", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const s = summarise(values);
    expect(s.avg).toBeCloseTo(50.5, 10);
    expect(s.p95).toBe(95);
    expect(s.max).toBe(100);
    expect(s.n).toBe(100);
  });

  it("is empty with nothing measured", () => {
    expect(summarise([])).toEqual({ avg: 0, p95: 0, max: 0, n: 0 });
  });

  it("is off unless asked for (no window here, so off)", async () => {
    const { perfEnabled, record, perfSnapshot } = await import("./perf");
    expect(perfEnabled()).toBe(false);
    record("cpu:x", 5);
    expect(perfSnapshot()).toEqual({});
  });
});
