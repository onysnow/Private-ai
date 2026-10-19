/**
 * The scheduler: one animation loop for everything that moves (optics plan
 * step 5).
 *
 * There were eight loops. Each effect ran its own requestAnimationFrame, and
 * three of them never slept: the cursor follower kept easing after it had
 * arrived, the shutter charge kept sampling with nothing held, and the
 * refraction filters re-checked a setting every frame. A tab with a live rAF
 * loop never lets the browser idle its compositor, so a page nobody was
 * touching paid for sixty frames a second -- in battery, on a page that was
 * visually still. The liquid glass library ran a fourth.
 *
 * Now there is one. Work registers as a TASK; a task sleeps until something
 * wakes it, and says after each step whether it still has work. When no task
 * is awake there is no frame at all (e2e/scheduler.spec.ts holds it there).
 *
 * ORDER. Tasks run in a fixed order within a frame, lowest first, so a frame
 * always sees the same sequence: the input moves the lamp, the charge
 * advances, the scene measures, the passes draw, the overlays go last.
 *
 * TIME. Every step gets the frame's time and the time since the last frame
 * it ran in, in milliseconds. Easing is done by time, not by frame, so the
 * page does not move slower when it is busy: see `ease`.
 */

import { markFrame, perfEnabled, record } from "./perf";
import { noteFrame } from "./quality";

export const ORDER = {
  /** The cursor follower: where the lamp is. */
  input: 0,
  /** The shutter charge: how hard it burns. */
  charge: 10,
  /** The scene: measure the page, write what the light does to it. */
  scene: 20,
  /** The WebGL passes: the light on, through and under the glass. */
  passes: 30,
  /** The liquid glass render. */
  liquid: 35,
  /** Overlays: the lens flare, the shutter's afterimage. */
  overlay: 40,
  /** Everything else that animates: text scrambles. */
  ui: 50,
} as const;

/** A task's step: return true while it still has work, false to sleep. */
export type Step = (now: number, dt: number) => boolean;

type Task = {
  name: string;
  order: number;
  step: Step;
  awake: boolean;
  last: number;
};

const tasks: Task[] = [];
/** How many frames each task has run in, by name: for tests and the dev panel. */
const ran: Record<string, number> = {};
let frame = 0;
let running = false;

/** The longest gap a step is told about, so a tab back from the background cannot jump. */
export const MAX_DT = 250;

function request() {
  if (!frame && typeof requestAnimationFrame === "function") frame = requestAnimationFrame(tick);
}

/** When the light passes last ran, for the quality tiers' frame check; -1 if not last frame. */
let passesLast = -1;

function tick(now: number) {
  frame = 0;
  running = true;
  // The light passes running frame after frame: how fast they are coming (item 34).
  const passesAwake = tasks.some((t) => t.awake && t.order === ORDER.passes);
  if (passesAwake && passesLast >= 0) noteFrame(now - passesLast);
  passesLast = passesAwake ? now : -1;
  const timing = perfEnabled();
  if (timing) markFrame(now);
  try {
    for (const task of tasks) {
      if (!task.awake) continue;
      // Cleared before stepping, so a wake from inside the step is kept.
      task.awake = false;
      const dt = task.last < 0 ? 1000 / 60 : Math.min(Math.max(now - task.last, 0), MAX_DT);
      task.last = now;
      ran[task.name] = (ran[task.name] ?? 0) + 1;
      let again = false;
      try {
        if (timing) {
          const t0 = performance.now();
          again = task.step(now, dt);
          record(`cpu:${task.name}`, performance.now() - t0);
        } else {
          again = task.step(now, dt);
        }
      } catch (error) {
        // One task failing must not stop the others.
        console.error(`[scheduler] ${task.name}:`, error);
      }
      if (again) task.awake = true;
    }
  } finally {
    running = false;
  }
  if (tasks.some((t) => t.awake)) request();
}

export type TaskHandle = {
  /** Run on the next frame (and keep running while the step returns true). */
  wake(): void;
  /** Sleep now; a later wake starts it again. */
  sleep(): void;
  /** Leave the scheduler for good. */
  stop(): void;
};

/**
 * Register work. It starts asleep; call `wake` when something changes that
 * it has to respond to.
 */
export function addTask(name: string, order: number, step: Step): TaskHandle {
  const task: Task = { name, order, step, awake: false, last: -1 };
  let i = tasks.findIndex((t) => t.order > order);
  if (i < 0) i = tasks.length;
  tasks.splice(i, 0, task);
  return {
    wake() {
      if (!tasks.includes(task)) return;
      // A task that slept for a while starts its clock again rather than
      // being told the whole nap was one long frame.
      if (!task.awake && !running) task.last = -1;
      task.awake = true;
      request();
    },
    sleep() {
      task.awake = false;
    },
    stop() {
      task.awake = false;
      const at = tasks.indexOf(task);
      if (at >= 0) tasks.splice(at, 1);
    },
  };
}

/** How many tasks are awake: for tests and the dev panel. */
export function awakeTasks(): string[] {
  return tasks.filter((t) => t.awake).map((t) => t.name);
}

/**
 * Close a fraction of the distance to a target by TIME: `rate` is the
 * fraction closed per 60 fps frame, and a frame that took twice as long
 * closes what two would have. Per-frame easing made the lag depend on how
 * busy the page was.
 */
export function ease(rate: number, dt: number): number {
  return 1 - Math.pow(1 - Math.min(Math.max(rate, 0), 1), dt / (1000 / 60));
}

/** Frames each task has run in since the page loaded (or since `resetRan`). */
export function taskRuns(): Readonly<Record<string, number>> {
  return { ...ran };
}

export function resetRuns() {
  for (const k of Object.keys(ran)) delete ran[k];
}

// A handle in development, so what is awake can be looked at from the console.
if ((process.env.NODE_ENV !== "production") && typeof window !== "undefined") {
  (window as unknown as { __scheduler?: unknown }).__scheduler = {
    awake: awakeTasks,
    runs: taskRuns,
    reset: resetRuns,
  };
}
