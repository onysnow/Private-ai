import { useEffect, useRef } from "react";
import { addTask, ORDER } from "@fx/effects/engine/scheduler";

/**
 * The lens flare, as footage.
 *
 * Everything else the light does is computed, and for the core and the
 * diffraction spikes that is right — they have to be pin-sharp and exactly on
 * the pointer. But the parts of a flare that sell it are the parts synthesis
 * is worst at: an anamorphic streak is not a smooth gradient, it is a dirty,
 * asymmetric, faintly banded smear that breathes as the source moves, and no
 * amount of `exp()` produces that. So those come from real footage of real
 * flares, shot through real glass.
 *
 * The clips carry no alpha — they are black-background overlays, which is what
 * lens flare footage always is. `mix-blend-mode: screen` is the right
 * compositor for that and needs no alpha channel at all: screen is
 * 1-(1-a)(1-b), so black leaves the backdrop untouched while light adds. That
 * also makes alpha-WebM, which is bigger and patchily supported, unnecessary.
 *
 * The one problem with footage is that its flare is baked where the camera put
 * it, and ours has to follow the cursor. Solved the way a compositor solves
 * it: each clip is tagged with where its light source actually sits in frame,
 * and the layer is translated so that point lands on the pointer. The flare
 * then travels as a whole, which is also what a real one does — the ghosts
 * keep their spacing relative to the source because that spacing is a property
 * of the lens, not of the scene.
 */

type Flare = {
  name: string;
  /** Where the light source sits in the clip, as a fraction of its frame. */
  anchor: { x: number; y: number };
  /** Rendered width as a fraction of the viewport's smaller side. */
  scale: number;
  opacity: number;
};

/*
 * Four clips survived the pack. The others were colour washes and haze with no
 * structure in them — bright, but nothing a flare is made of.
 */
/*
 * Scales are deliberately close to one. At 2.6 the clip covered the whole
 * viewport, so what reached the screen was not a flare but the clip's average
 * colour laid over the page — and an overlay you cannot see the edges of reads
 * as a colour cast rather than as light.
 */
const STREAK_BLUE: Flare = {
  name: "streak-blue",
  anchor: { x: 0.42, y: 0.46 },
  scale: 0.85,
  opacity: 0.26,
};
const STREAK_GREEN: Flare = {
  name: "streak-green",
  anchor: { x: 0.55, y: 0.18 },
  scale: 2.4,
  opacity: 0.5,
};
const BEAM: Flare = { name: "beam", anchor: { x: 0.12, y: 0.86 }, scale: 1.4, opacity: 0.18 };
const CHROMA: Flare = { name: "chroma", anchor: { x: 0.78, y: 0.2 }, scale: 0.75, opacity: 0.22 };

/** Kept so swapping which flare plays is a one-line change. */
void STREAK_GREEN;

/*
 * OFF.
 *
 * The computed flare carries it -- the core, the aperture, the diffraction
 * spikes and the ghost chain, all of which respond to the light because they
 * are derived from it. The footage never did. Three attempts at making it read
 * as something happening inside a lens rather than as a video laid over the
 * page: translated to follow the cursor (it dragged the camera around after
 * the light), looped (it animated while the pointer sat still and ignored it
 * while it moved), scrubbed and locked to the frame (better, still a rectangle
 * of somebody else's footage with its own grain and its own colour).
 *
 * Nothing is fetched and no decoder starts while this list is empty, so the
 * cost is zero rather than hidden. The clips stay in public/flares and the
 * anchors and scales stay below, so turning it back on is putting names in
 * this array -- worth doing only with a clear idea of what the footage is
 * meant to add that the shader cannot compute.
 */
const ACTIVE: Flare[] = [];
void STREAK_BLUE;
void CHROMA;
void BEAM;

export function FlareOverlay({
  chargeRef,
  positionRef,
}: {
  chargeRef: { current: number };
  positionRef: { current: { x: number; y: number } };
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // The gesture that drives this needs a fine pointer, so on touch the
    // charge never leaves zero and there would be nothing to show.
    if (!window.matchMedia?.("(pointer: fine)").matches) return;

    const videos: HTMLVideoElement[] = [];
    let started = false;

    /*
     * Nothing is fetched until the shutter is first wound. A visitor who never
     * touches it never downloads a frame of this, and the decoders never spin
     * up — which matters more than the file size, because a decoding video is
     * a cost the whole page pays whether or not anyone can see it.
     */
    const start = () => {
      if (started) return;
      started = true;
      for (const flare of ACTIVE) {
        const video = document.createElement("video");
        video.className = "flare-clip";
        video.muted = true;
        video.loop = false;
        /*
         * Not autoplaying. The clip advances only when the pointer moves --
         * see the tick below.
         */
        video.autoplay = false;
        video.playsInline = true;
        video.preload = "auto";
        // WebM first; the MP4 is there for Safari, which came to VP9 late and
        // on older iOS never will.
        for (const [src, type] of [
          [`/flares/${flare.name}.webm`, "video/webm"],
          [`/flares/${flare.name}.mp4`, "video/mp4"],
        ] as const) {
          const source = document.createElement("source");
          source.src = src;
          source.type = type;
          video.appendChild(source);
        }
        host.appendChild(video);
        videos.push(video);
        // Autoplay can still be refused; a flare that will not play just does
        // not appear, rather than throwing on every frame.
        video.pause();
      }
    };

    let lastX = 0;
    let lastY = 0;
    let prevX = 0;
    let prevY = 0;
    let smoothSpeed = 0;
    /* Signed travel, in clip-seconds. Right and down advance; left and up rewind. */
    let scrub = 0;
    const tick = (): boolean => {
      const charge = chargeRef.current;
      if (charge <= 0.002) {
        if (started) for (const v of videos) v.style.opacity = "0";
        return true;
      }
      start();

      const { x, y } = positionRef.current;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = document.documentElement.clientHeight || window.innerHeight;
      const unit = Math.min(vw, vh);
      // Eased, so the noise floor of a drifting pointer stays dark.
      const lit = charge * charge * (3 - 2 * charge);

      /*
       * The footage advances WITH the light, not on its own clock.
       *
       * Left looping, a clip animated while the pointer sat still and ignored
       * it while it moved -- the opposite of what a flare does. A real flare
       * changes because the source moved relative to the lens; nothing about
       * it is on a timer. So pointer speed drives playback: a still pointer
       * freezes the frame, and how fast it moves is how fast the flare
       * evolves. Driving `playbackRate` rather than seeking `currentTime`
       * keeps it smooth -- seeking every frame lands on keyframes and judders.
       */
      const speed = Math.hypot(x - lastX, y - lastY);
      lastX = x;
      lastY = y;
      smoothSpeed += (speed - smoothSpeed) * 0.25;
      scrub += (x - prevX + (y - prevY)) * 0.004;
      prevX = x;
      prevY = y;

      /*
       * And the whole layer rotates to the optical axis. A flare's streaks and
       * ghosts lie along the line from the source through the centre of the
       * frame, so that line -- not the clip's baked-in orientation -- is what
       * decides which way they point.
       */
      const axis = (Math.atan2(y - vh / 2, x - vw / 2) * 180) / Math.PI;

      for (let i = 0; i < videos.length; i += 1) {
        const video = videos[i];
        const flare = ACTIVE[i];
        if (!video || !flare) continue;

        /*
         * The clip fills the WINDOW. It does not follow the pointer.
         *
         * A flare belongs to the camera, not to the light: the streaks and
         * ghosts are reflections between elements that are bolted in place, so
         * they live in frame coordinates. The footage was shot with a fixed
         * camera, which means the clip's frame IS the camera's frame. Sliding
         * the whole clip to put its light source on the pointer was dragging
         * the camera around after the light, which is why they read as
         * stickers rather than as something happening inside the lens.
         *
         * What the light's position actually controls is the AXIS -- and that
         * is a rotation about the centre of the frame, below.
         *
         * Sized to the diagonal so rotation never swings a corner into view,
         * which also retires the edge-feathering: the clip's own edges are
         * off-screen now, so there is no box to hide.
         */
        /*
         * Covered by force, in BOTH axes, with object-fit doing the fitting.
         *
         * Sizing from the clip's aspect ratio was the bug: before metadata
         * loads videoWidth is 0, so the ratio is a guess, and a clip that is
         * not 16:9 does not cover -- its own edge lands on screen and reads as
         * a box. Square and oversized cannot fail, whatever the clip turns out
         * to be, and leaves room for the rotation to swing without bringing a
         * corner in.
         */
        const span = Math.hypot(vw, vh) * 1.2;
        video.style.width = `${span.toFixed(0)}px`;
        video.style.height = `${span.toFixed(0)}px`;
        video.style.transformOrigin = "50% 50%";
        video.style.transform =
          `translate3d(${(vw / 2 - span / 2).toFixed(1)}px, ${(vh / 2 - span / 2).toFixed(1)}px, 0) ` +
          `rotate(${axis.toFixed(1)}deg)`;

        const offAxis = Math.hypot(x - vw / 2, y - vh / 2) / (Math.hypot(vw, vh) / 2);
        const presence = 1 - 0.55 * Math.min(1, offAxis);
        video.style.opacity = (lit * flare.opacity * presence).toFixed(3);

        /*
         * Scrubbed by MOVEMENT, forwards and backwards.
         *
         * The clip has no clock. Its frame is wherever the cursor has driven
         * it: move one way and it advances, move back and it rewinds. That is
         * what makes it feel alive rather than played -- a flare changes
         * because the source moved, and moving back retraces it.
         *
         * Distance-from-centre was the previous mapping and it was nearly
         * static, which is why nothing appeared to animate. Signed
         * displacement wraps around the clip instead, so there is always
         * somewhere further to go in both directions.
         */
        if (!video.paused) video.pause();
        const dur = video.duration;
        if (dur > 0 && Number.isFinite(dur)) {
          const want = ((scrub % dur) + dur) % dur;
          if (Math.abs(video.currentTime - want) > dur / 120) {
            video.currentTime = Math.min(dur - 0.001, want);
          }
        }
      }
      return true;
    };
    /*
     * No clips, no loop.
     *
     * `ACTIVE` is empty by design — the footage is switched off — and this
     * still armed a 60Hz callback for the life of every page, doing nothing.
     * A tab with a live rAF loop never lets the browser idle its compositor,
     * so it was paid for in battery on a page that was visually static. This
     * is the cost lib/gl-loop.ts exists to avoid; the shaders adopted it and
     * this never did.
     */
    // A task in the page's one loop (effects/engine/scheduler), only when armed.
    const task = ACTIVE.length > 0 ? addTask("flare", ORDER.overlay, () => tick()) : null;
    task?.wake();

    return () => {
      task?.stop();
      for (const v of videos) {
        v.pause();
        v.remove();
      }
    };
  }, [chargeRef, positionRef]);

  return <div ref={hostRef} aria-hidden="true" className="flare-overlay" />;
}
