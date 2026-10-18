import { claimLamp, moveLamp, reportCharge } from "@fx/effects/light/lights";
import { addTask, ease, ORDER } from "@fx/effects/engine/scheduler";
import { mountPerfPanel } from "@fx/effects/engine/perf";
import { CameraIris } from "./CameraIris";
import { t } from "@fx/lib/tuning";
import { useEffect, useRef } from "react";
import { watchShutterCharge } from "@fx/lib/shutter-charge";
import { cameraInHand, onToolChange } from "@fx/effects/tools/held";
import { CursorLight } from "./CursorLight";
import { GlassLight } from "./GlassLight";
import { FlareOverlay } from "./FlareOverlay";
import { fireShutter } from "@fx/lib/shutter-event";
import {
  playShutterClick,
  playShutterFlash,
  primeShutterAudio,
  setShutterCharge,
} from "@fx/lib/shutter-audio";

/**
 * A photograph the pointer is directly on top of.
 */
const PHOTO = "img, picture, video, .gallery-frame";

/**
 * A photographic *surface* — a hero or parallax band where the picture is the
 * background and scrims, vignettes and copy are stacked over it. A hit test
 * there lands on one of those overlays, never on the image, so the container
 * carries `data-photo` and stands in for it.
 */
const PHOTO_SCENE = "[data-photo]";

/*
 * The widest the ring is allowed to open over something clickable, and the
 * size it uses whenever the control is at least this big. Matches the value
 * the link state used to hard-code in the stylesheet.
 */
const LINK_RING = 56;

/**
 * The cursor.
 *
 * A single element that follows the pointer in `mix-blend-mode: difference`.
 * That one choice does all the work: over a photograph the disc inverts what's
 * underneath and reads as a negative, and over text it knocks the letters out
 * rather than covering them. No per-surface styling, no second element for
 * images — the blend mode handles every background the site has.
 *
 * Three states:
 *   default — a thin ring with a dot at its centre
 *   link    — a filled disc, sized to sit behind a nav item or button
 *   media   — a wider ring over photographs, so the frame stays readable
 *
 * Deliberately absent on touch and for anyone who has asked for reduced motion:
 * there is no pointer to follow in the first case, and a lagging element chasing
 * the cursor is exactly the kind of movement that setting is asking us to drop.
 */
export function CustomCursor() {
  // The performance readout, when asked for with ?perf=1 (effects/engine/perf).
  useEffect(() => mountPerfPanel(), []);
  const ringRef = useRef<HTMLDivElement>(null);
  const chargeRef = useRef(0);
  const closedRef = useRef(0);
  const lightPos = useRef({ x: 0, y: 0 });
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || still) return;

    const el = ringRef.current;
    const dot = dotRef.current;
    if (!el || !dot) return;

    // The native cursor is hidden only once we know we're replacing it, so a
    // failure above leaves the visitor with a working pointer.
    document.documentElement.classList.add("has-custom-cursor");
    el.style.opacity = "1";
    dot.style.opacity = "1";

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    /*
     * ONE follower. The pilot light is the lamp's own centre.
     *
     * The ring and the dot used to ease at different rates, so while the
     * pointer moved the dot ran ahead of the ring -- and on a busy frame it
     * stayed visibly off-centre for most of a second. The pilot light is the
     * red lamp at the middle of the lens, and the light the glass responds
     * to is drawn from the same point; it cannot be somewhere else. Both are
     * now written from one position.
     */
    let ringX = targetX;
    let ringY = targetY;
    /*
     * A task in the page's one loop (effects/engine/scheduler), first in the
     * frame: where the lamp is comes before anything that draws with it.
     * It sleeps once the follower has arrived; a pointer move wakes it.
     */
    let follow: ReturnType<typeof addTask> | null = null;

    const onMove = (event: PointerEvent) => {
      follow?.wake();
      targetX = event.clientX;
      targetY = event.clientY;

      const node = event.target as Element | null;
      // A link, a button, or anything the site has made behave like one.
      const interactive = node?.closest?.(
        'a, button, [role="button"], input, textarea, select, label, summary',
      );
      const media = node?.closest?.(PHOTO);
      const scene = node?.closest?.(PHOTO_SCENE);

      /*
       * Photographs win over links; photographic *scenes* lose to them.
       *
       * Nearly every photograph on the site is wrapped in something clickable —
       * a lightbox trigger, a card link — so testing for `interactive` first
       * meant the media state almost never fired. What's under the pointer
       * matters more than what it does: over a picture you want the wide
       * negative lens, over a line of text the smaller disc that sits behind it.
       *
       * A scene is the other way round. The hero is a photograph, but it also
       * carries the headline and both calls to action, and those sit *on* the
       * picture rather than in it. Over one of them the link state is the
       * truthful one; the wide lens only takes over where the picture is bare.
       */
      const state = media ? "media" : interactive ? "link" : scene ? "media" : "default";
      if (el.dataset["state"] !== state) {
        el.dataset["state"] = state;
        dot.dataset["state"] = state;
      }

      /*
       * The ring must never overhang what it is pointing at.
       *
       * The link state opened the ring to a flat 56px whatever it was over.
       * On a nav word that looked deliberate. On a slider, a small icon
       * button, a radio, it is several times the control: the thing you are
       * aiming at disappears inside the cursor and there is no longer any way
       * to tell whether you are still on it. Aim feedback is the one job a
       * pointer has.
       *
       * TWO axes, and the tight one is the one that decides.
       *
       * A range input measures 608 x 16. Capping on the larger axis -- which
       * is what I wrote first -- reads that as a big control and hands it the
       * full 56px ring, which is exactly the case that was reported. What you
       * aim at on a slider is a 16px band, so the ring has to fit the 16.
       * The overall size still caps it too, for something small in both axes.
       *
       * +4 rather than a tight fit, so a sliver of the control shows around
       * the ring on every side: a visible margin is the thing that says "still
       * on it", and a ring exactly the size of its target reads as covering it.
       * Floored at 14px so it cannot collapse into the dot.
       *
       * The consequence worth naming: a nav link is about 20px tall, so its
       * ring is now ~24px rather than 56px. The big disc behind a nav word is
       * gone. That is the same rule doing its job rather than an oversight --
       * one rule that always fits beats two with a threshold between them.
       *
       * Written to `--ring-base`, not `--ring-size`, so the charge still opens
       * it on top -- the old hard override silently disabled the wind growth
       * over every link on the site.
       */
      if (state === "link" && interactive instanceof HTMLElement) {
        const r = interactive.getBoundingClientRect();
        const overall = Math.max(r.width, r.height);
        const tight = Math.min(r.width, r.height);
        let base = overall < LINK_RING ? overall + 4 : LINK_RING;
        if (tight + 4 < base) base = tight + 4;
        base = Math.max(base, 14);
        const px = `${Math.round(base)}px`;
        if (el.style.getPropertyValue("--ring-base") !== px) {
          el.style.setProperty("--ring-base", px);
          dot.style.setProperty("--ring-base", px);
        }
      } else if (el.style.getPropertyValue("--ring-base")) {
        el.style.removeProperty("--ring-base");
        dot.style.removeProperty("--ring-base");
      }
    };

    /*
     * Two independent reasons the negative can be hidden — the pointer has left
     * the window, and the shutter is winding — so both go through one function.
     * Setting `style.opacity` from either handler on its own meant whichever
     * fired last won: re-entering the window mid-charge snapped the ring back
     * to full over the middle of the light.
     */
    let inside = true;
    const applyVisibility = () => {
      /*
       * The follower never goes away.
       *
       * An earlier version faded it out as the charge came up, on the grounds
       * that a difference-blended ring over a blown highlight reads as a hole
       * punched through it. That was solving the wrong problem: the fix is for
       * the ring to stop being a filled disc, not for it to vanish. Winding is
       * meant to be the ring TRANSFORMING — tightening, brightening, closing
       * into an iris — and there is nothing to transform if it has gone.
       *
       * Leaving the window is the only thing that hides it.
       */
      const value = inside ? 1 : 0;
      el.style.opacity = value.toFixed(2);
      dot.style.opacity = value.toFixed(2);
    };

    const onLeave = () => {
      inside = false;
      applyVisibility();
    };
    const onEnter = () => {
      inside = true;
      applyVisibility();
    };

    /*
     * Eased toward the pointer rather than pinned to it.
     *
     * Each frame closes a fixed fraction of the remaining distance, so the
     * follower moves fastest when it is furthest behind and decelerates as it
     * converges — it never overshoots, and it always ends up exactly on the
     * pointer once you stop moving. That acceleration curve is the whole effect;
     * pinning the element to the pointer event instead makes it feel stuck to
     * the glass, and a constant speed makes it feel mechanical.
     *
     * The loop only ever writes `transform`, so it stays on the compositor.
     */
    /*
     * Measured off the reference rather than chosen.
     *
     * bryanminear.com moves both circles with CSS transitions -- 0.125s ease
     * on the ring, 0.1s on the dot. What matters there is the RATIO: 1.25x,
     * not the 4x this had at 0.13 and 0.55, which is the whole reason his
     * never looks off-centre and this did. The dot ran four times ahead of the
     * ring and the light, and the faster you moved the further they came
     * apart.
     *
     * The ratio is kept and the pair is deliberately slower than the
     * reference: 0.16 and 0.20 settle in about 0.29s against his 0.125s. That
     * trail is wanted here -- it is a camera, and the follower having weight
     * suits it -- and because both move together the extra lag costs nothing
     * in alignment.
     */

    const tick = (_now: number, dt: number) => {
      /*
       * Eased by TIME, not by frame. "Ring follow" is the fraction closed per
       * 60 fps frame; a frame that took twice as long closes as much as two
       * would have. Per-frame easing made the lag depend on how busy the page
       * was -- on a heavy frame the follower fell far behind and crawled back.
       *
       * Capped at a second, not 100 ms. At 100 ms a slow frame closed only a
       * tenth of the time it had taken, so on a slow device the follower crept
       * for many seconds -- and since the follower is now the lamp the whole
       * scene is lit from, the light crept with it. The ease can never
       * overshoot however long the frame, so the cap only has to stop a
       * frame's time from being nonsense.
       */
      const k = ease(t("ringEase"), Math.min(dt, 1000));
      ringX += (targetX - ringX) * k;
      ringY += (targetY - ringY) * k;
      // Arrived: land exactly on the pointer, and stop asking for frames.
      const arrived = Math.abs(targetX - ringX) < 0.05 && Math.abs(targetY - ringY) < 0.05;
      if (arrived) {
        ringX = targetX;
        ringY = targetY;
      }

      const at = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      el.style.transform = at;
      dot.style.transform = at;
      // The emitter rides with the ring but lives outside the difference layer.
      // The shader reads these; it runs its own loop.
      lightPos.current.x = ringX;
      lightPos.current.y = ringY;
      // And the whole scene lights from here: the lamp is where it is drawn.
      moveLamp(ringX, ringY);
      return !arrived;
    };
    follow = addTask("cursor", ORDER.input, tick);
    follow.wake();
    const releaseLamp = claimLamp();

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    /*
     * Browsers refuse to let a page make a sound until somebody has clicked or
     * typed, and winding is neither — it is pointer movement, which does not
     * count. That restriction happens to be doing something useful, so it is
     * honoured rather than worked around: nothing makes a noise until the
     * visitor has chosen to interact at least once.
     */
    window.addEventListener("pointerdown", primeShutterAudio, { once: true });
    window.addEventListener("keydown", primeShutterAudio, { once: true });
    document.addEventListener("pointerenter", onEnter);

    /*
     * Winding the shutter.
     *
     * Moving the pointer hard in one place charges it; the ring brightens as it
     * fills and fades back the moment you stop, so the charge has to be held
     * rather than merely reached. At full it arms, and a click fires — the
     * flash never goes off on its own.
     */
    /*
     * Named, rather than inline, so a test can drive it.
     *
     * The charge is a GESTURE -- sustained pointer speed held for a couple of
     * seconds -- and synthetic pointer events have no believable timing, so
     * an automated browser winds it to about 0.1 where 0.6 is needed. That
     * has cost real time more than once: the occlusion maths had to be
     * mirrored into a unit test because the shader term it modifies could not
     * be reached, and the bloom's clipping could not be photographed at all.
     *
     * Exposing THIS function rather than a stand-in matters: everything the
     * light does hangs off this one callback, so driving it exercises the
     * real path -- the CSS variables, the pilot lamp, the shader's charge
     * ref, the shadows, the blades -- rather than a parallel fake that can
     * quietly stop matching.
     *
     * Dev only. It is a global, and globals belong in the build nobody ships.
     */
    const applyCharge = (charge: number, armed: boolean) => {
      el.style.setProperty("--wind", charge.toFixed(2));
      dot.style.setProperty("--wind", charge.toFixed(2));
      /*
       * The pilot lamp needs its own blend, so it needs its own flag.
       *
       * The dot lives in a second `.custom-cursor` element, which is
       * `mix-blend-mode: difference` like the ring -- and a red thing
       * inside a difference group comes out as whatever red inverted
       * against the page happens to be, which is teal more often than not.
       * The attribute lets the stylesheet composite it normally for exactly
       * as long as it is lit, and leave the resting dot inverting the way
       * it always has.
       */
      dot.toggleAttribute("data-pilot", charge > 0.01);
      /*
       * And on the root, because the glass needs it too. At rest a pane
       * holds only the faintest reflection and its edge is a hairline; the
       * light is what reveals both. That has to be a CSS custom property,
       * since the layers doing the revealing are CSS, not the shader.
       */
      document.documentElement.style.setProperty("--wind", charge.toFixed(2));
      chargeRef.current = charge;
      reportCharge(charge);
      setShutterCharge(charge);
      // Blades close over the back half, once it's clearly deliberate.
      const closed = Math.max(0, (charge - 0.5) / 0.5);
      el.style.setProperty("--iris", closed.toFixed(2));
      closedRef.current = closed;
      el.toggleAttribute("data-winding", charge > 0.06);
      el.toggleAttribute("data-armed", armed);
    };

    /*
     * Another tool in the hand: the camera is put away -- no ring, no dot, no
     * winding, no shutter (cameraInHand). Marked on <html> for the
     * stylesheet, and the charge held at nothing while it is.
     */
    const showCamera = () => {
      const on = cameraInHand();
      document.documentElement.toggleAttribute("data-other-tool", !on);
      if (!on) applyCharge(0, false);
    };
    const charger = watchShutterCharge({
      onCharge: (charge, armed) => (cameraInHand() ? applyCharge(charge, armed) : undefined),
    });
    showCamera();
    const stopTool = onToolChange(() => {
      if (!cameraInHand()) charger.spend();
      showCamera();
    });

    /*
     * The seam. `window.__charge(0.9)` winds it; `window.__charge(0)` lets go.
     *
     * Returns nothing and takes the same two arguments the real gesture
     * supplies, so a test is driving the identical code path a hand does.
     */
    if ((process.env.NODE_ENV !== "production")) {
      (window as unknown as { __charge?: (c: number, armed?: boolean) => void }).__charge = (
        c,
        armed = c >= 1,
      ) => applyCharge(Math.min(1, Math.max(0, c)), armed);
    }

    const onClick = (event: MouseEvent) => {
      // Another tool is in the hand: its clicks are its own, the shutter is put away.
      if (!cameraInHand()) return;
      /*
       * The click that ends a hold is swallowed whole.
       *
       * Press-and-hold winds the shutter; letting go is the end of winding,
       * not the taking of a photograph. Firing here would spend the charge
       * the same gesture had just earned, so the meter could never be seen
       * full and the second trigger would be indistinguishable from a very
       * slow click. The shot is a separate press.
       *
       * It swallows navigation too, which is intended: a link held down for
       * a third of a second and released is a gesture, not a click on a link.
       */
      if (charger.consumeHoldRelease()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      /*
       * Resolved fresh from the pointer position rather than read off the last
       * pointermove. Content moves under a stationary cursor — a carousel
       * advancing, the page scrolling — and the cached target goes stale, so
       * clicking a photograph could be judged against whatever happened to be
       * there a moment earlier.
       */
      const under = document.elementFromPoint(targetX, targetY);
      const atPhoto = !!under?.closest(`${PHOTO}, ${PHOTO_SCENE}`);

      /*
       * The shutter only FIRES at a photograph, and only when wound — but it
       * always makes a noise. A camera clicks whether or not there is film in
       * it, and the mechanism answering every click is what tells you the
       * thing in your hand is a camera at all.
       *
       * Firing into empty page does nothing else — not even spending the
       * charge — so the discovery is "I'm armed, but not here", which points
       * at what to try next. Consuming the charge on a miss would just be
       * punishing.
       */
      if (!charger.isArmed() || !atPhoto) {
        playShutterClick();
        /*
         * And the blades move, because they do on a real camera.
         *
         * The sound was already firing on every click -- the mechanism
         * answering is what tells you the thing in your hand is a camera --
         * but the cursor sat there unmoved, so the click read as a sound
         * effect bolted onto a pointer rather than as a shutter.
         *
         * Removed and re-set around a forced reflow, which is what restarts a
         * CSS animation; without it a second click inside the same 170ms does
         * nothing, and rapid clicking is exactly when you notice.
         */
        el.removeAttribute("data-click");
        void el.offsetWidth;
        el.setAttribute("data-click", "");
        return;
      }
      /*
       * Swallow the click.
       *
       * Photographs are wrapped in links, so without this the shutter fires
       * and the page immediately navigates away from it. Arming is deliberate
       * and unmistakable — the aperture is closed and pulsing — so a click in
       * that state means "take the photograph", not "follow this link".
       */
      event.preventDefault();
      event.stopPropagation();

      charger.spend();
      playShutterFlash();
      fireShutter({ x: targetX, y: targetY });
    };
    // Capture phase so the shutter still fires when the click lands on a link.
    window.addEventListener("click", onClick, true);

    return () => {
      releaseLamp();
      stopTool();
      document.documentElement.removeAttribute("data-other-tool");
      charger.stop();
      window.removeEventListener("click", onClick, true);
      follow?.stop();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", primeShutterAudio);
      window.removeEventListener("keydown", primeShutterAudio);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerenter", onEnter);
      document.documentElement.classList.remove("has-custom-cursor");
    };
  }, []);

  return (
    <>
      {/*
        The light is a WebGL canvas, not CSS.

        It has to be: the blown core depends on emission exceeding 1.0 and
        being tonemapped back down, and CSS composites in SDR where nothing can
        exceed white. Every gradient version of this ended up as an orange
        aura with a white dot in the middle, because that is the most a
        gradient can express.
      */}
      {/*
        The glass sits UNDER the cursor light, both in z-order and in fact: it
        is the light landing on the panels, so it cannot be brighter than the
        source of it.
      */}
      <GlassLight chargeRef={chargeRef} positionRef={lightPos} />
      {/* Real footage, for the parts of a flare that synthesis cannot reach. */}
      <FlareOverlay chargeRef={chargeRef} positionRef={lightPos} />
      <CursorLight chargeRef={chargeRef} closedRef={closedRef} positionRef={lightPos} />
      <div ref={ringRef} aria-hidden="true" className="custom-cursor" data-state="default">
        <span className="custom-cursor__ring" />
        {/* The blades. Shared with the site loader -- see CameraIris. */}
        <CameraIris className="custom-cursor__iris" />
      </div>
      <div ref={dotRef} aria-hidden="true" className="custom-cursor" data-state="default">
        <span className="custom-cursor__dot" />
      </div>
    </>
  );
}
