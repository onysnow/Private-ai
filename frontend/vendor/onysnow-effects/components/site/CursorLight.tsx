import { passScaleCap } from "@fx/effects/engine/quality";
import { useEffect, useRef, useState } from "react";
import { LIGHT_FRAGMENT_SHADER, LIGHT_VERTEX_SHADER } from "@fx/lib/cursor-light-shader";
import { LAMP_COLOUR, cursorLamp, onCharge } from "@fx/effects/light/lights";
import { lampSeen, onToolChange } from "@fx/effects/tools/held";
import { camera } from "@fx/effects/camera/camera";
import { sleepingLoop } from "@fx/lib/gl-loop";
import {
  beginPass,
  endPass,
  blitAll,
  buildProgram,
  clear2d,
  fullScreenTriangle,
  onSharedGlLoss,
  sharedGl,
} from "@fx/effects/engine/gl";
import { t } from "@fx/lib/tuning";
import { assetUrl, SITE_ASSETS } from "@fx/lib/site-assets";

/**
 * The cursor light, rendered in WebGL.
 *
 * A canvas rather than CSS because the effect depends on light values above
 * 1.0. CSS composites in SDR — nothing can be brighter than white — so a
 * "blown out" core has to be faked as a white gradient stop, which is exactly
 * why every gradient version of this read as an orange aura with a white dot
 * in it. Here the emission genuinely exceeds the display range and a tonemap
 * clips it, so the white core, the coloured falloff and the dispersion all
 * fall out of the same calculation instead of being drawn separately.
 *
 * Viewport-sized, not a box that follows the cursor. A lens flare's ghosts
 * march along the axis from the source through the centre of the frame and
 * out the other side; penned into a box around the cursor there is nowhere
 * for them to go, and the box's own edge was visible wherever the falloff
 * crossed it.
 */
/*
 * Bloom and flare are low-frequency; the only sharp features are the spikes
 * and the aperture rim. Held at 1.5 they stay crisp and the fill cost of a
 * full-viewport pass is less than half what a dense display would ask.
 */
const MAX_SCALE = 1.5;

/*
 * The LAYOUT viewport, not `window.innerWidth`.
 *
 * These canvases are CSS-sized `position: fixed; inset: 0`, which resolves
 * against the initial containing block and EXCLUDES the classic scrollbar.
 * `window.innerWidth` includes it. Sizing the drawing buffer from the wrong
 * one stretches a buffer ~17px too wide into a box that narrow, squeezing
 * everything the shader draws by about 1.3%: no error at the left edge,
 * seventeen pixels of it by the right. That is why every pane had a bright
 * line inboard of its right edge while the top and bottom sat correctly --
 * there is no horizontal scrollbar to introduce the same error vertically.
 */
const viewportWidth = () => document.documentElement.clientWidth || window.innerWidth;
const viewportHeight = () => document.documentElement.clientHeight || window.innerHeight;

export function CursorLight({
  chargeRef,
  closedRef,
  positionRef,
}: {
  chargeRef: { current: number };
  closedRef: { current: number };
  positionRef: { current: { x: number; y: number } };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /*
   * Bumped when a lost GL context comes back. The effect depends on it, so
   * React tears the old setup down and runs a fresh one -- which is exactly
   * what restoration needs, since every shader, buffer and texture handle
   * from before the loss is dead. Re-running the effect rebuilds all of it
   * with no separate recovery path to keep correct.
   */
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // The gesture that drives this needs a fine pointer, so on a touch device
    // the charge can never leave zero. Without this the page still built a GL
    // context and ran a loop forever for an effect that could not fire --
    // battery spent on the hardware least able to afford it.
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    /*
     * The shared context (effects/engine/gl): the lens is drawn into it and
     * copied onto this canvas, which is now a plain 2D one.
     */
    const shared = sharedGl();
    // No WebGL: the page simply goes without the light rather than falling
    // back to something that doesn't work.
    if (!shared) return;
    const { gl } = shared;

    const program = buildProgram(gl, LIGHT_VERTEX_SHADER, LIGHT_FRAGMENT_SHADER, "cursor light");
    if (!program) return;
    gl.useProgram(program);
    const quad = fullScreenTriangle(gl, program);

    const uCharge = gl.getUniformLocation(program, "uCharge");
    const uClosed = gl.getUniformLocation(program, "uClosed");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uWarm = gl.getUniformLocation(program, "uWarm");
    const uCool = gl.getUniformLocation(program, "uCool");

    // The site's amber and teal, converted to linear light — the shader works
    // in linear and only returns to display space at the very end.
    const toLinear = (c: number) => Math.pow(c, 2.2);
    gl.uniform3f(uWarm, toLinear(1.0), toLinear(0.68), toLinear(0.3));
    gl.uniform3f(uCool, toLinear(0.35), toLinear(0.78), toLinear(0.82));

    const uViewport = gl.getUniformLocation(program, "uViewport");
    const uScale = gl.getUniformLocation(program, "uScale");
    const uLight = gl.getUniformLocation(program, "uLight");
    /*
     * The tunables. Read from the shared store each frame rather than baked in,
     * so the panel at /lab can move them while the page is running. Six extra
     * uniform writes a frame is nothing next to the fill they control.
     */
    const uGain = gl.getUniformLocation(program, "uGain");
    const uEmit = gl.getUniformLocation(program, "uEmit");
    const uFalloff = gl.getUniformLocation(program, "uFalloff");
    const uAperture = gl.getUniformLocation(program, "uAperture");
    const uSpread = gl.getUniformLocation(program, "uSpread");
    const uGhostGain = gl.getUniformLocation(program, "uGhostGain");
    const uHaloGain = gl.getUniformLocation(program, "uHaloGain");
    const lensUniforms = {
      uGhostCount: () => camera.lens.ghostCount,
      uGhostSpacing: () => camera.lens.ghostSpacing,
      uGhostSize: () => camera.lens.ghostSize,
      uGhostShape: () => camera.lens.ghostShape,
      uGhostBokeh: () => camera.lens.ghostBokeh,
      uBlades: () => camera.lens.blades,
      uCatsEye: () => camera.lens.catsEye,
      uRainbow: () => camera.lens.rainbow,
      uHaloRings: () => camera.lens.haloRings,
      uHaloSize: () => camera.lens.haloSize,
      uSpikes: () => camera.lens.spikes,
    };
    const lensLocations = Object.entries(lensUniforms).map(
      ([name, read]) => [gl.getUniformLocation(program, name), read] as const,
    );

    const size = () => {
      const scale = Math.min(window.devicePixelRatio || 1, Math.min(MAX_SCALE, passScaleCap()));
      return {
        scale,
        w: Math.round(viewportWidth() * scale),
        h: Math.round(viewportHeight() * scale),
      };
    };

    /*
     * The same photographed surface the panes wear, reused here to give the
     * ghosts an inside. A defocused image of an aperture carries the dust and
     * coating flaws of the glass it bounced off, and mottling across the disc
     * is most of what separates a photographed ghost from a drawn one.
     */
    gl.uniform1i(gl.getUniformLocation(program, "uGrit"), 0);
    const uHasGrit = gl.getUniformLocation(program, "uHasGrit");
    gl.uniform1f(uHasGrit, 0);
    const grit = gl.createTexture();
    let gritAsked = false;
    const askGrit = () => {
      if (gritAsked) return;
      gritAsked = true;
      const img = new Image();
      img.onload = () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, grit);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.useProgram(program);
        gl.uniform1f(uHasGrit, 1);
      };
      img.src = assetUrl(SITE_ASSETS.glassSurface);
    };

    const start = performance.now();
    let wasLit = false;
    canvas.style.opacity = "0";

    /* Returns whether there is still something to draw; false parks the loop. */
    const step = (now: number) => {
      // The lamp is drawn only while it is in the hand and seen as itself (effects/tools/held).
      const charge = cursorLamp.charge > 0 && lampSeen() ? chargeRef.current : 0;
      if (charge <= 0.002) {
        if (wasLit) {
          clear2d(canvas);
          canvas.style.opacity = "0";
          wasLit = false;
        }
        return false;
      }
      if (!wasLit) {
        canvas.style.opacity = "1";
        wasLit = true;
      }

      const { scale, w, h } = size();
      const pass = beginPass(w, h, "lens");
      if (!pass) return false;
      quad.bind();
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(uViewport, w, h);
      gl.uniform1f(uScale, scale);

      const closed = closedRef.current;
      const { x, y } = positionRef.current;
      askGrit();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, grit);
      gl.uniform2f(uLight, x, y);
      gl.uniform1f(uCharge, charge);
      gl.uniform1f(uClosed, closed);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform1f(uGain, cursorLamp.gain);
      const emit = cursorLamp.colour;
      gl.uniform3f(
        uEmit,
        emit[0] / LAMP_COLOUR[0],
        emit[1] / LAMP_COLOUR[1],
        emit[2] / LAMP_COLOUR[2],
      );
      gl.uniform1f(uFalloff, camera.lens.coreFalloff);
      gl.uniform1f(uAperture, camera.aperture);
      gl.uniform1f(uSpread, camera.apertureGrowth);
      gl.uniform1f(uGhostGain, camera.lens.ghosts);
      gl.uniform1f(uHaloGain, camera.lens.halo);
      for (const [location, read] of lensLocations) gl.uniform1f(location, read());
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Same step as the draw: the next pass clears the buffer.
      blitAll(pass.canvas, canvas);
      endPass();
      return true;
    };

    const loop = sleepingLoop(step, "cursor-light");
    const wake = () => loop.wake();
    window.addEventListener("pointermove", wake, { passive: true });
    /*
     * And on the charge itself. The loop parks at zero charge and used to be
     * woken only by pointer movement -- so winding the shutter by HOLDING
     * still, which is the whole point of the hold trigger, grew the ring and
     * lit nothing. Caught frame by frame: 25, 50, 75, 100% charge with the
     * pointer still, and not one photon on the glass until it moved.
     */
    const stopCharge = onCharge(wake);
    // And on picking up another tool, which lights or puts down the lamp.
    const stopTool = onToolChange(wake);
    loop.wake();

    // Lost with the shared context; rebuilt when it comes back.
    const stopLoss = onSharedGlLoss(
      () => loop.stop(),
      () => setGeneration((g) => g + 1),
    );

    return () => {
      loop.stop();
      window.removeEventListener("pointermove", wake);
      stopCharge();
      stopTool();
      stopLoss();
      gl.deleteProgram(program);
      quad.delete();
      gl.deleteTexture(grit);
    };
  }, [chargeRef, closedRef, positionRef, generation]);

  return <canvas ref={canvasRef} aria-hidden="true" className="cursor-light" />;
}
