import { addTask, ORDER } from "@fx/effects/engine/scheduler";
/**
 * Winding the shutter with sustained fast pointer movement.
 *
 * No particular shape is required — circling, scrubbing, shaking, whatever.
 * Charge comes from SPEED alone, and what makes it a deliberate act is that it
 * has to be SUSTAINED: the bleed is constant, so several seconds of continuous
 * fast movement are needed before it fills, and it starts draining the moment
 * you slow down.
 *
 * That duration requirement is what keeps it from triggering by accident. A
 * single fast flick across the page lasts a fraction of a second and barely
 * registers; only someone deliberately keeping the pointer moving gets there.
 *
 * A generous locality bound remains, so that continuously travelling in one
 * direction — dragging a scrollbar, sweeping to a far corner — isn't mistaken
 * for winding. It is wide enough not to be felt while moving vigorously.
 */
const SAMPLE_MS = 700;
/*
 * Speed thresholds, calibrated against measured pointer motion rather than
 * guessed. Vigorous circling in place produces roughly 1300–1500 px/s; an
 * earlier REF_SPEED of 2200 meant even hard circling only earned about half
 * the gain rate, leaving a net of +0.08/s against the bleed — twelve seconds
 * to fill, which reads as broken rather than as difficult.
 */
const MIN_SPEED = 250;
const REF_SPEED = 1400;
/**
 * Max distance from the recent path's own centre. Wide on purpose: this is not
 * meant to demand small circles, only to exclude movement that is going
 * somewhere rather than staying put.
 */
const MAX_DRIFT = 520;
/*
 * Charge per second at reference speed, and the constant bleed.
 *
 * GAIN must exceed DECAY by a clear margin or the charge can never rise at all
 * — an earlier pair had the bleed larger than the gain, so the meter sat at
 * zero no matter how hard the pointer was moved.
 *
 * The difference between them is the fill rate: ~0.3/s here, so a bit over
 * three seconds of sustained movement. That is deliberately long — winding a
 * shutter should feel like work, and a charge that arrives in a second isn't
 * something anyone notices earning.
 */
const GAIN = 0.8;
const DECAY = 0.5;

/*
 * The second way in: press and hold.
 *
 * WHY THERE ARE TWO
 *
 * The movement trigger measures pointer SPEED, and speed is sampled from
 * `pointermove` events, which the browser throttles to the frame rate. On a
 * page that is dropping frames -- an old machine, a heavy scroll, a tab that
 * has been backgrounded and come back -- you get a handful of samples, the
 * computed speed collapses, and winding becomes impossible at exactly the
 * moment the page is least pleasant to use. Holding is measured in elapsed
 * time instead, which does not care how many frames arrived.
 *
 * So this is not a shortcut. It is the path that still works when the other
 * one cannot, and it fills at a deliberately similar rate -- about three
 * seconds net, same as vigorous circling -- because winding a shutter should
 * feel like work whichever way you do it.
 *
 * It also happens to be what a camera does: half-press to charge, full press
 * to fire. Releasing produces a click, and the click already fires the
 * shutter when armed, so the two halves were always there.
 */
/*
 * How long a hold takes to fill, in milliseconds of WALL CLOCK.
 *
 * Not a per-frame gain, which is what this was first. Integrating a rate
 * frame by frame loses whatever time the clamp discards, so on a page running
 * at 3fps a 3.6 second hold reached 0.73 and never armed -- on the exact kind
 * of page this trigger exists to rescue. Measured, not reasoned about.
 *
 * Reading the clock instead makes the promise simple and keepable: hold for
 * this long and it is full, whatever the frame rate, whatever the page is
 * doing. Matched to the movement path's own fill time so neither is the
 * obviously correct choice.
 */
const HOLD_FULL_MS = 2600;

/*
 * Where a hold does NOT wind.
 *
 * Anything you press and hold as part of using it: a slider you are dragging,
 * a button you are pressing, a field you are selecting text in. Tuning the
 * lab means holding a slider knob for seconds at a time, and charging the
 * flash every time you adjust one would be maddening.
 *
 * Anchors are deliberately NOT here. Every photograph on the site is wrapped
 * in a link, and a photograph is precisely what you want to be holding over.
 * A hold on a link that never arms still ends in an ordinary click, so
 * navigation is untouched.
 */
const NO_HOLD = 'input, textarea, select, button, [role="button"], [role="slider"], label, summary';
/*
 * Once armed, it STAYS armed until a click spends it. No timer.
 *
 * The charge is hard to earn, so putting it on a countdown means losing it
 * while deciding where to point — which is the moment the whole thing is
 * building toward. Holding it makes the state something you own rather than
 * something you race.
 */

type Sample = { x: number; y: number; t: number };

/**
 * Whether moving the pointer (circling it quickly in one spot) winds the
 * shutter. OFF, by request: for now only press-and-hold charges the flash.
 * The movement trigger's code stays, behind this switch.
 */
export const MOVEMENT_WINDS = false;

export type ShutterChargeHandlers = {
  /** 0 → 1, every frame the value changes. */
  onCharge?: (charge: number, armed: boolean) => void;
};

export function watchShutterCharge({ onCharge }: ShutterChargeHandlers) {
  let samples: Sample[] = [];
  let charge = 0;
  let armed = false;
  let lastFrame = performance.now();
  let lastReported = -1;
  let stopped = false;
  /*
   * A task in the page's one loop (effects/engine/scheduler). It needs frames
   * only while something can change the charge: a press held, a charge
   * draining, or (with the movement trigger on) pointer samples to read.
   * Otherwise it sleeps; a press or a move wakes it.
   */
  let task: ReturnType<typeof addTask> | null = null;
  const wake = () => task?.wake();
  let holding = false;
  let heldSince = 0;
  let endedAHold = false;

  function onMove(event: PointerEvent) {
    samples.push({ x: event.clientX, y: event.clientY, t: performance.now() });
    if (MOVEMENT_WINDS) wake();
  }

  /*
   * How long a press has to last before it counts as a gesture rather than a
   * click. Comfortably longer than a deliberate click and far shorter than
   * anything that charges usefully, so neither is ever mistaken for the
   * other.
   */
  const HOLD_GESTURE_MS = 300;

  function onDown(event: PointerEvent) {
    // Primary button only: a right-click opens a menu and a middle-click
    // opens a tab, and neither is someone winding a shutter.
    if (event.button !== 0) return;
    const node = event.target as Element | null;
    if (node?.closest?.(NO_HOLD)) return;
    holding = true;
    heldSince = performance.now();
    wake();
  }

  /*
   * Every way a hold can end, including the ones that fire no pointerup:
   * the pointer leaving the window, a gesture being cancelled by the browser,
   * the tab going away mid-press. Missing any of these leaves the charge
   * winding forever with nothing held down.
   */
  function release() {
    /*
     * A press that WOUND is not a press that FIRES.
     *
     * Holding charges; letting go is just the end of charging. The shot is a
     * separate, second press -- which is the only way the two can coexist,
     * since otherwise every hold would end by immediately spending what it
     * had just earned, and the meter could never be seen full at all.
     *
     * Recorded here and read once by whoever handles the click, because the
     * click arrives after this and has no other way to know what preceded it.
     */
    if (holding && performance.now() - heldSince >= HOLD_GESTURE_MS) endedAHold = true;
    holding = false;
    setWinding(false);
    wake();
  }

  /*
   * A hold is not a text selection.
   *
   * Holding the button and moving is also exactly how you drag-select, so
   * winding the shutter across the category cards painted them amber with
   * selection -- measured, not guessed: the visual check caught "Cosplay" and
   * "Street" highlighted mid-charge. Once a press has lasted long enough to be
   * a hold, the page stops selecting and whatever got selected on the way in
   * is dropped. A quick press-and-drag is still a selection, so copying the
   * studio's email address keeps working.
   */
  let winding = false;
  function setWinding(on: boolean) {
    if (on === winding) return;
    winding = on;
    document.documentElement.classList.toggle("is-winding", on);
    if (on) window.getSelection()?.removeAllRanges();
  }
  function onSelectStart(event: Event) {
    if (winding) event.preventDefault();
  }
  /*
   * Nor is it a drag. Pressing on a photograph and moving lifts a ghost copy
   * of it, and the browser cancels the pointer the moment that starts -- which
   * ends the hold after a few pixels of movement.
   */
  function onDragStart(event: DragEvent) {
    if (holding && (event.target as Element | null)?.closest?.("img, picture")) {
      event.preventDefault();
    }
  }

  function frame(now: number): boolean {
    if (stopped) return false;
    /*
     * ONE time base, wall clock, capped at a quarter second.
     *
     * The cap was 50ms, which exists so a tab returning from the background
     * cannot dump ten seconds of charge in a single frame. But 50ms is also
     * about three frames of ordinary jank, so on a page rendering at 20fps
     * the integration ran at a third of real time -- and a slow page is the
     * entire reason the hold trigger exists. Worse, gain and decay were on
     * different bases for a while, which made the fill rate depend on the
     * frame rate in both directions at once: measured 0.49 in the first half
     * second on a slow page against 0.35/s on a fast one.
     *
     * A quarter second still blocks the background-tab jump -- ten seconds
     * away yields 0.25s of charge -- and lets ordinary jank through. Speed is
     * computed from timestamped samples over a fixed window, so the movement
     * path never cared about this value anyway.
     */
    const dt = Math.min(0.25, (now - lastFrame) / 1000);
    /*
     * The hold is measured against the CLOCK, not against the frame budget.
     *
     * `dt` is clamped to 50ms so a tab returning from the background cannot
     * dump ten seconds of charge in one frame. That clamp is right for the
     * movement path, which is sampled per frame anyway -- but applying it to
     * the hold meant that on a page rendering at 20fps the charge accrued at
     * a third of wall-clock speed. Measured: 0.47 after four seconds of
     * holding, where the constants say it should have been full.
     *
     * Which is precisely backwards, because a slow page is the entire reason
     * this trigger exists. A wider ceiling keeps the background-tab guard
     * while letting ordinary jank through untouched.
     */
    lastFrame = now;

    samples = samples.filter((s) => now - s.t <= SAMPLE_MS);

    let speed = 0;
    let local = false;

    if (samples.length >= 3) {
      let distance = 0;
      for (let i = 1; i < samples.length; i += 1) {
        const a = samples[i - 1]!;
        const b = samples[i]!;
        distance += Math.hypot(b.x - a.x, b.y - a.y);
      }
      const span = (samples[samples.length - 1]!.t - samples[0]!.t) / 1000;
      speed = span > 0 ? distance / span : 0;

      let cx = 0;
      let cy = 0;
      for (const s of samples) {
        cx += s.x;
        cy += s.y;
      }
      cx /= samples.length;
      cy /= samples.length;
      const furthest = Math.max(...samples.map((s) => Math.hypot(s.x - cx, s.y - cy)));
      local = furthest <= MAX_DRIFT;
    }

    if (armed) {
      // Held at full until spent, so the glow stays up while you choose a target.
      charge = 1;
    } else {
      if (MOVEMENT_WINDS && local && speed > MIN_SPEED) {
        const strength = Math.min(1, (speed - MIN_SPEED) / (REF_SPEED - MIN_SPEED));
        charge += strength * GAIN * dt;
      }
      charge -= DECAY * dt;

      /*
       * The hold sets a FLOOR, it does not add a rate.
       *
       * Applied after the bleed and as a maximum, so the two triggers cannot
       * fight: movement can carry the charge above where the hold has got to,
       * and the hold guarantees its own progress regardless of what the bleed
       * is doing. Holding and circling together still beats either alone,
       * which is the forgiving behaviour worth keeping.
       */
      if (holding) {
        charge = Math.max(charge, (now - heldSince) / HOLD_FULL_MS);
        if (now - heldSince >= HOLD_GESTURE_MS) setWinding(true);
      }
      charge = Math.max(0, Math.min(1, charge));

      if (charge >= 1) armed = true;
    }

    const rounded = Math.round(charge * 100) / 100;
    if (rounded !== lastReported) {
      lastReported = rounded;
      onCharge?.(rounded, armed);
    }

    // Asleep once nothing can move the charge: not held, drained (or armed
    // and waiting to be spent), and no movement samples to read.
    const draining = !armed && charge > 0;
    return holding || draining || (MOVEMENT_WINDS && samples.length > 0);
  }

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", release, { passive: true });
  window.addEventListener("pointercancel", release, { passive: true });
  document.addEventListener("selectstart", onSelectStart);
  document.addEventListener("dragstart", onDragStart);
  window.addEventListener("blur", release);
  document.addEventListener("visibilitychange", release);
  task = addTask("shutter-charge", ORDER.charge, (now) => frame(now));
  task.wake();

  return {
    isArmed: () => armed,
    /**
     * Was the click now arriving merely the end of a hold?
     *
     * Reads once and clears, so a single release can only swallow a single
     * click and a genuine click straight afterwards still counts.
     */
    consumeHoldRelease: () => {
      const was = endedAHold;
      endedAHold = false;
      return was;
    },
    /** Called after the shutter fires, so the charge has to be earned again. */
    spend: () => {
      armed = false;
      charge = 0;
      /*
       * A shot ends the hold that earned it.
       *
       * Without this, firing while still pressed starts winding again from
       * the same press -- so one deliberate hold becomes a burst of shots as
       * the meter refills under your finger. The next shot needs a new press.
       */
      holding = false;
      setWinding(false);
      lastReported = -1;
      onCharge?.(0, false);
    },
    stop: () => {
      stopped = true;
      task?.stop();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      document.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("dragstart", onDragStart);
      setWinding(false);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    },
  };
}
