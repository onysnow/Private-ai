import { addTask, ORDER } from "@fx/effects/engine/scheduler";

/**
 * A render loop that stops when there is nothing left to draw.
 *
 * Both WebGL canvases used to re-arm unconditionally and then early-return
 * when the charge was zero, so a page nobody was touching still woke sixty
 * times a second to decide it had nothing to do. That is not just wasted
 * work: a tab with a live rAF loop never lets the browser idle its
 * compositor, so the cost is paid in battery on a page that is visually
 * static.
 *
 * `step` returns whether it still has work. False parks the loop until
 * something calls `wake`.
 *
 * The wake signal is pointer movement, and that is complete rather than
 * approximate: the charge is wound by moving the pointer and can only rise
 * from pointer motion, so nothing can light the effect up while the pointer
 * is still. Waking is idempotent and `pointermove` is throttled to the frame
 * rate anyway, so a moving cursor costs exactly what the old loop cost and a
 * still one costs nothing.
 */
export function sleepingLoop(
  step: (now: number) => boolean,
  name = "pass",
  order: number = ORDER.passes,
) {
  // One loop for the page now (effects/engine/scheduler): this is a task in it.
  const task = addTask(name, order, (now) => step(now));
  return {
    wake: () => task.wake(),
    stop: () => task.stop(),
  };
}
