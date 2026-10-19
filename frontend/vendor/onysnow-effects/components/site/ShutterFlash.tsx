import { useEffect, useRef } from "react";
import { SHUTTER_EVENT } from "@fx/lib/shutter-event";
import { flashPanes, viewState } from "@fx/effects/scene/scene";
import { fireFlash, onCharge } from "@fx/effects/light/lights";
import { previewing } from "@fx/effects/engine/preview";
import { discardBurn, prepareBurn, takeBurn, type PageBurn } from "@fx/lib/page-burn";

/**
 * The shutter firing: one flash across the page, corner frame lines, the
 * frosted panels answering the light with a glare and a rim flare, and then
 * the eye recovering from it.
 *
 * Exposed through a window event rather than props so the cursor — which owns
 * the gesture that triggers this — doesn't need a reference to it. Anything
 * else that should fire the shutter later can dispatch the same event.
 *
 * A full-screen luminance jump is a photosensitivity hazard, so this is a
 * single rise-and-decay rather than a strobe, the gesture that fires it has a
 * cooldown, and under `prefers-reduced-motion` the overlays are not rendered at
 * all (see styles.css).
 */
/** A photographic surface worth leaving an afterimage of. */
const SUBJECT = "img, video, picture, .gallery-frame, [data-photo]";

export function ShutterFlash() {
  const flashRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const positiveRef = useRef<HTMLDivElement>(null);
  const negativeRef = useRef<HTMLDivElement>(null);
  const residueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const onFire = (event: Event) => {
      const at = (event as CustomEvent<{ x: number; y: number } | undefined>).detail;
      const flash = flashRef.current;
      const frame = frameRef.current;
      const veil = veilRef.current;

      // The burst originates where the gesture was made rather than always at
      // the centre of the screen, and the bleaching is strongest there too.
      const fx = at ? (at.x / viewportWidth()) * 100 : 50;
      const fy = at ? (at.y / viewportHeight()) * 100 : 50;

      // Previewing ?try=flash: the flash is a light the whole scene answers.
      if (previewing("flash")) {
        fireFlash(
          viewportWidth() / 2 + viewState.eyeX,
          viewportHeight() / 2 + viewState.eyeY,
          viewportWidth(),
        );
      }
      if (flash) {
        flash.style.setProperty("--flash-x", `${fx}%`);
        flash.style.setProperty("--flash-y", `${fy}%`);
        restart(flash, 1000);
      }
      if (frame) restart(frame, 1000);
      if (veil) {
        veil.style.setProperty("--flash-x", `${fx}%`);
        veil.style.setProperty("--flash-y", `${fy}%`);
        restart(veil, 2600);
      }

      /*
       * The ghost of the room the flash lit.
       *
       * A flash does not illuminate one photograph, it illuminates everything
       * in front of it, so the afterimage is the WHOLE VIEWPORT -- header,
       * type, glass and all -- not the <img> that happened to be under the
       * pointer. `takeBurn` returns the capture taken while the shutter was
       * winding; the subject clone is only the fallback for when the gesture
       * was too short for one to finish, because a smaller ghost still beats
       * none.
       */
      if (at) {
        const capture = asCapture(takeBurn()) ?? captureSubject(at);
        for (const host of [positiveRef.current, negativeRef.current, residueRef.current]) {
          if (!host) continue;
          if (!capture) {
            host.removeAttribute("data-firing");
            continue;
          }
          // Each host needs its own copy: appending one node to two parents
          // moves it, and the second ghost would silently steal the first's.
          dressGhost(host, capture, at);
          restart(host, 20_000);
        }
        // Whatever it was, it has been used and the page will have moved on
        // by the next release.
        discardBurn();
      }

      // The glass reacts to the same light.
      flashPanes();
    };

    /*
     * Start photographing the page halfway up the meter.
     *
     * Rasterising the document is far too slow to do at the moment of
     * release -- the ghost would arrive after the flash that is supposed to
     * have caused it. The wind is two to three seconds of sustained movement,
     * which is exactly the warning needed, and it is what a real camera is
     * doing with that time too.
     *
     * A quarter rather than the first flicker: below that the gesture is
     * usually somebody moving the pointer across the page rather than winding
     * anything, and capturing on every stray sweep would be the most expensive
     * thing on the site. It was halfway, and measured that was too late: the
     * capture takes a couple of seconds on an ordinary machine, so a shot fired
     * right after a full hold arrived before the page had been photographed and
     * burned in only the photograph under the pointer.
     */
    const stopWatching = onCharge((charge) => {
      if (charge > 0.25) prepareBurn();
    });

    // Anything that moves the page makes a held capture a lie.
    const onShift = () => discardBurn();
    window.addEventListener("scroll", onShift, { passive: true });
    window.addEventListener("resize", onShift);

    window.addEventListener(SHUTTER_EVENT, onFire);
    return () => {
      window.removeEventListener(SHUTTER_EVENT, onFire);
      window.removeEventListener("scroll", onShift);
      window.removeEventListener("resize", onShift);
      stopWatching();
    };
  }, []);

  return (
    <>
      {/*
       * Order matters and is the order light reaches you: the discharge, then
       * the ghost of the scene it lit, then the veil of bleached receptors
       * over everything. The two ghosts sit above the cursor because an
       * afterimage is on the retina — it is in front of the whole world,
       * including the pointer. The negative is split in two: detail that goes
       * quickly and a coarse residue that outlives it.
       */}
      <div ref={flashRef} aria-hidden="true" className="shutter-flash" />
      <div ref={frameRef} aria-hidden="true" className="shutter-frame">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div ref={residueRef} aria-hidden="true" className="afterimage afterimage--residue" />
      <div ref={negativeRef} aria-hidden="true" className="afterimage afterimage--negative" />
      <div ref={positiveRef} aria-hidden="true" className="afterimage afterimage--positive" />
      <div ref={veilRef} aria-hidden="true" className="afterimage-veil" />
    </>
  );
}

/**
 * The picture inside a photographic band, and specifically not its stand-in.
 *
 * `Img` renders a blurred base64 placeholder *and* the photograph, in that
 * order, so taking the first child would burn the placeholder into the retina
 * every time. Prefer whichever candidate is decoded and drawn largest; fall
 * back to the placeholder only if nothing real has arrived yet, where a blurred
 * low-resolution stand-in is a perfectly good afterimage anyway.
 */
function pickMedia(scene: HTMLElement): HTMLImageElement | HTMLVideoElement | null {
  if (scene instanceof HTMLImageElement || scene instanceof HTMLVideoElement) return scene;

  const candidates = [...scene.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video")];
  const area = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width * r.height;
  };
  const decoded = candidates.filter(
    (el) =>
      el.getAttribute("aria-hidden") !== "true" &&
      (el instanceof HTMLVideoElement ? el.videoWidth > 0 : el.complete && el.naturalWidth > 32),
  );

  const pool = decoded.length ? decoded : candidates;
  return pool.sort((a, b) => area(b) - area(a))[0] ?? null;
}

/**
 * A whole-page burn, in the shape the ghost machinery already speaks.
 *
 * Its rect is the viewport, pinned in fixed coordinates at the moment of
 * firing -- which is the same rule the subject ghost follows and the same
 * rule the retina follows. Scroll out from under it and the burn stays
 * where you were looking.
 */
function asCapture(burn: PageBurn | null): Capture | null {
  if (!burn) return null;
  const paint = document.createElement("img");
  paint.src = burn.src;
  paint.decoding = "sync";
  paint.style.cssText = "width:100%;height:100%;object-fit:fill;";
  return {
    rect: new DOMRect(0, 0, burn.width, burn.height),
    paint,
  };
}

type Capture = {
  rect: DOMRect;
  /** A detached node that paints the subject, already sized to fill the host. */
  paint: HTMLElement;
};

/**
 * What the eye was actually looking at when the flash went off.
 *
 * Hit-testing rather than guessing: the cursor arms itself on the same test,
 * so if it decided there was a photograph under the pointer, this finds the
 * same element.
 */
function captureSubject(at: { x: number; y: number }): Capture | null {
  const under = document.elementFromPoint(at.x, at.y);
  const scene = under?.closest<HTMLElement>(SUBJECT);
  if (!scene) return null;

  const media = pickMedia(scene);

  if (media instanceof HTMLImageElement) {
    const src = media.currentSrc || media.src;
    if (!src) return null;
    const style = getComputedStyle(media);
    const clone = document.createElement("img");
    clone.src = src;
    clone.decoding = "sync";
    clone.style.cssText = `width:100%;height:100%;object-fit:${style.objectFit};object-position:${style.objectPosition};`;
    return { rect: media.getBoundingClientRect(), paint: clone };
  }

  if (media instanceof HTMLVideoElement && media.videoWidth > 0) {
    // A cloned <video> would start from nothing, so freeze the frame that was
    // on screen when the shutter fired.
    const frame = document.createElement("canvas");
    frame.width = media.videoWidth;
    frame.height = media.videoHeight;
    frame.getContext("2d")?.drawImage(media, 0, 0);
    const style = getComputedStyle(media);
    frame.style.cssText = `width:100%;height:100%;object-fit:${style.objectFit};object-position:${style.objectPosition};`;
    return { rect: media.getBoundingClientRect(), paint: frame };
  }

  // Last case: the picture is a CSS background on the band itself.
  const style = getComputedStyle(scene);
  if (style.backgroundImage && style.backgroundImage !== "none") {
    const fill = document.createElement("div");
    fill.style.cssText =
      `width:100%;height:100%;` +
      `background-image:${style.backgroundImage};` +
      `background-size:${style.backgroundSize};` +
      `background-position:${style.backgroundPosition};` +
      `background-repeat:${style.backgroundRepeat};`;
    return { rect: scene.getBoundingClientRect(), paint: fill };
  }

  return null;
}

/**
 * Pin a ghost over where its subject was.
 *
 * Fixed, not absolute, and the rect is frozen at the moment of firing: this
 * image is burned into the retina, so it stays where you were looking even
 * after the page scrolls out from under it.
 */
function dressGhost(host: HTMLElement, capture: Capture, at: { x: number; y: number }) {
  const { rect, paint } = capture;
  host.style.left = `${rect.left}px`;
  host.style.top = `${rect.top}px`;
  host.style.width = `${rect.width}px`;
  host.style.height = `${rect.height}px`;

  /*
   * Bleaching follows the light, and the light fell off radially from the
   * point of discharge -- so the ghost is strongest there and dies out around
   * it.
   *
   * Sized against the VIEWPORT, not the subject: how far a flash bleaches is a
   * property of the flash, not of how big the photograph happened to be. A
   * subject smaller than the burn is simply inside it, which is correct --
   * point a camera at a thumbnail and all of it goes.
   *
   * It reaches the far corner, because the flash does. An earlier pass held
   * this to 0.42 of the short edge while the burst itself faded out at 72%,
   * and the pair read as a spotlight: a pool of light near the pointer and a
   * small stain afterwards. Both now fill the frame, with the falloff carrying
   * the sense of where it fired rather than the edge of a circle.
   */
  const reach = Math.hypot(viewportWidth(), viewportHeight());
  const mask = `radial-gradient(circle ${reach}px at ${at.x - rect.left}px ${at.y - rect.top}px, rgba(0,0,0,1) 0%, rgba(0,0,0,0.92) 30%, rgba(0,0,0,0.6) 62%, rgba(0,0,0,0.28) 100%)`;
  host.style.setProperty("-webkit-mask-image", mask);
  host.style.setProperty("mask-image", mask);

  host.replaceChildren(paint.cloneNode(true));
}

/** `position: fixed; inset: 0` excludes the scrollbar; `innerWidth` includes it. */
function viewportWidth() {
  return document.documentElement.clientWidth || window.innerWidth;
}

function viewportHeight() {
  return document.documentElement.clientHeight || window.innerHeight;
}

/**
 * Re-applying a running animation is a no-op unless the browser sees a change.
 *
 * The clear-down waits for the animation to end rather than for a number.
 * Hard-coded milliseconds were wrong twice: first too short, so `data-firing`
 * was stripped mid-decay and the burn snapped out instead of fading; then set
 * long enough for the dwell knob's maximum, which left the attribute sitting
 * there for eighteen seconds after a two-second effect. `animationend` is
 * exact at every setting, and the fallback only exists for the case where no
 * animation runs at all and the event therefore never arrives.
 */
type Pending = { timer: number; done: (e: AnimationEvent) => void };
const pending = new WeakMap<HTMLElement, Pending>();

function restart(el: HTMLElement, fallbackMs: number) {
  const previous = pending.get(el);
  if (previous) {
    window.clearTimeout(previous.timer);
    el.removeEventListener("animationend", previous.done);
  }

  el.removeAttribute("data-firing");
  void el.offsetWidth;
  el.setAttribute("data-firing", "");

  const clear = () => {
    const current = pending.get(el);
    if (current) {
      window.clearTimeout(current.timer);
      el.removeEventListener("animationend", current.done);
      pending.delete(el);
    }
    el.removeAttribute("data-firing");
  };

  // Several layers animate at once; the element is done when its own longest
  // one is, so anything earlier is ignored.
  const done = (event: AnimationEvent) => {
    if (event.target === el) clear();
  };

  el.addEventListener("animationend", done);
  pending.set(el, { timer: window.setTimeout(clear, fallbackMs), done });
}
