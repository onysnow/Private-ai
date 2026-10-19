import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Optics plan step 5: one loop for the page, tasks in a fixed order, asleep
 * unless something woke them.
 */

let queued: ((t: number) => void)[] = [];
let clock = 0;

beforeEach(() => {
  queued = [];
  clock = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
    queued.push(cb);
    return queued.length;
  });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Run one browser frame, `ms` after the last. */
function frame(ms = 16) {
  clock += ms;
  const run = queued;
  queued = [];
  for (const cb of run) cb(clock);
}

describe("the scheduler", () => {
  it("asks for no frame until something wakes a task", async () => {
    const { addTask } = await import("./scheduler");
    addTask("a", 0, () => false);
    expect(queued).toHaveLength(0);
  });

  it("runs awake tasks once a frame, in order, and sleeps when they are done", async () => {
    const { addTask, ORDER } = await import("./scheduler");
    const seen: string[] = [];
    let left = 2;
    const late = addTask("pass", ORDER.passes, () => {
      seen.push("pass");
      return --left > 0;
    });
    const early = addTask("input", ORDER.input, () => {
      seen.push("input");
      return false;
    });
    late.wake();
    early.wake();
    expect(queued).toHaveLength(1); // one frame, however many wake
    frame();
    expect(seen).toEqual(["input", "pass"]);
    frame();
    expect(seen).toEqual(["input", "pass", "pass"]);
    // Nothing awake: no more frames asked for.
    expect(queued).toHaveLength(0);
  });

  it("a wake from inside a step is kept, for the next frame", async () => {
    const { addTask } = await import("./scheduler");
    let runs = 0;
    const task = addTask("self", 0, () => {
      runs += 1;
      if (runs === 1) task.wake();
      return false;
    });
    task.wake();
    frame();
    frame();
    frame();
    expect(runs).toBe(2);
  });

  it("tells each step the time since its last frame, capped", async () => {
    const { addTask, MAX_DT } = await import("./scheduler");
    const dts: number[] = [];
    const task = addTask("t", 0, (_now, dt) => {
      dts.push(dt);
      return dts.length < 3;
    });
    task.wake();
    frame(16);
    frame(33);
    frame(5000);
    expect(dts[1]).toBe(33);
    expect(dts[2]).toBe(MAX_DT);
  });

  it("one task failing does not stop the others", async () => {
    const { addTask } = await import("./scheduler");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let ran = false;
    addTask("bad", 0, () => {
      throw new Error("boom");
    }).wake();
    addTask("good", 1, () => {
      ran = true;
      return false;
    }).wake();
    frame();
    expect(ran).toBe(true);
    error.mockRestore();
  });

  it("eases by time: two short frames close what one long one does", async () => {
    const { ease } = await import("./scheduler");
    const one = ease(0.2, 1000 / 30);
    const two = 1 - (1 - ease(0.2, 1000 / 60)) ** 2;
    expect(one).toBeCloseTo(two, 10);
    expect(ease(0.2, 1000 / 60)).toBeCloseTo(0.2, 10);
  });
});
