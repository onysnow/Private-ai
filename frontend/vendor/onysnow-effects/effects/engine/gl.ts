/**
 * One WebGL context for the light passes (optics plan step 6).
 *
 * The light on the glass (GlassLight), the light through it (FloorLight) and
 * the lens (CursorLight) each made their own context. A browser allows a page
 * a handful -- Chromium starts dropping the oldest at sixteen -- and each one
 * holds its own drawing buffer, its own copy of every texture, and its own
 * chance of being lost when the GPU is reset. Three contexts drawing into
 * three viewport-sized buffers was three times what one needs.
 *
 * Now they share this one. It is offscreen: nothing displays it. A pass
 * draws into it and copies what it drew into its own 2D canvases (the pane
 * layers, the page-wide floor, the lens) in the same scheduler step, before
 * the next pass clears it. The passes run one after another in the
 * scheduler's frame, so the buffer is never wanted by two at once.
 *
 * STATE. A WebGL context is one big set of switches, and a pass that leaves
 * blending on or a scissor set would change what the next one draws.
 * `beginPass` puts every switch any pass touches back to its default, so each
 * pass starts from the same clean context it had when it owned one: blend
 * off, scissor off, no textures bound, the viewport the whole buffer.
 *
 * ALPHA. Not premultiplied. Two of the three passes were written for that; the
 * floor writes premultiplied light and divides it back out (see
 * floor-light-shader.ts). The browser premultiplies when it copies the buffer
 * into a 2D canvas, exactly as it did when it composited the old canvases.
 *
 * LOSS. When the GPU drops the context all three passes lose it together.
 * Each one listens here, stops, and rebuilds when it comes back.
 */

import { noteRenderer } from "./quality";
import { gpuBegin, gpuEnd, gpuTiming, setGpuMode } from "./perf";

/** Texture units a pass may use; `beginPass` unbinds them all. */
export const GL_TEXTURE_UNITS = 8;

type Shared = {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
};

let shared: Shared | null = null;
let failed = false;
const lostListeners = new Set<() => void>();
const restoredListeners = new Set<() => void>();

/** The shared context, made on first use; null where there is no WebGL. */
export function sharedGl(): Shared | null {
  if (shared) return shared.gl.isContextLost() ? null : shared;
  if (failed || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!gl) {
    failed = true;
    return null;
  }
  // A software renderer (no GPU) runs the lighter tier (item 34).
  noteRenderer(gl);
  canvas.addEventListener("webglcontextlost", (event) => {
    // Without this the browser does not even try to give it back.
    event.preventDefault();
    for (const cb of [...lostListeners]) cb();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    for (const cb of [...restoredListeners]) cb();
  });
  shared = { canvas, gl };
  setGpuMode(gpuTiming(gl));
  return shared;
}

/** Called when the shared context is lost, and when it comes back. */
export function onSharedGlLoss(lost: () => void, restored: () => void): () => void {
  lostListeners.add(lost);
  restoredListeners.add(restored);
  return () => {
    lostListeners.delete(lost);
    restoredListeners.delete(restored);
  };
}

/**
 * Start a pass: size the buffer (only if it changed -- resizing reallocates
 * it), put the context's switches back to their defaults, and clear.
 */
export function beginPass(width: number, height: number, name = "pass"): Shared | null {
  const s = sharedGl();
  if (!s) return null;
  const { canvas, gl } = s;
  // Timed only when the performance readout is on (engine/perf).
  gpuBegin(gl, name);
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  // A pass that drew into a texture (the water's drop map) must not leave it bound.
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ZERO);
  gl.disable(gl.SCISSOR_TEST);
  gl.colorMask(true, true, true, true);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  for (let unit = GL_TEXTURE_UNITS - 1; unit >= 0; unit--) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return s;
}

/** End a pass started with beginPass: closes its GPU timing when the readout is on. */
export function endPass() {
  if (shared) gpuEnd(shared.gl);
}

/** Compile and link a pass's program; null (and a console error) on failure. */
export function buildProgram(
  gl: WebGLRenderingContext,
  vertex: string,
  fragment: string,
  label: string,
): WebGLProgram | null {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(`${label} shader:`, gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, vertex);
  const fs = compile(gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  // The program keeps them; flagged for deletion, they go with it.
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(`${label} link:`, gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * The one triangle that covers the buffer, for a program whose vertex shader
 * takes `aPosition`. `bind` re-points the attribute at it -- attribute state
 * belongs to the context, not the program, so every pass does it every draw.
 */
export function fullScreenTriangle(gl: WebGLRenderingContext, program: WebGLProgram) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPosition = gl.getAttribLocation(program, "aPosition");
  return {
    bind() {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
    },
    delete() {
      gl.deleteBuffer(buffer);
    },
  };
}

/** Copy the whole shared buffer into a 2D canvas of the same size. */
export function blitAll(source: HTMLCanvasElement, target: HTMLCanvasElement) {
  if (target.width !== source.width) target.width = source.width;
  if (target.height !== source.height) target.height = source.height;
  const ctx = target.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0);
}

/** Clear a 2D canvas, if it has been given a context. */
export function clear2d(target: HTMLCanvasElement | null | undefined) {
  target?.getContext("2d")?.clearRect(0, 0, target.width, target.height);
}
