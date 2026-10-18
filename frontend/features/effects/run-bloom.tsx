'use client';
// Rain Noir's bloom on the AI run's lights (research AI §4 "Theme": "the lights read as out-of-focus highlights on a
// wet board; an optional WebGL bloom only there"; ADR-0013). One canvas over the map draws each travelling light as
// additive, soft-edged sprites with a short tail, along the same path and timing as the SVG light it sits on. It draws
// nothing under Calm motion, reduced motion, Effects Light or Off, or when the switch in Settings › Appearance is off.
import {useEffect, useRef} from 'react';
import type {ReactElement, RefObject} from 'react';

export type Flight = {n: number; from: {x: number; y: number}; mid: {x: number; y: number}; to: {x: number; y: number}; start: number; dur: number; status: string};

const VERT = `attribute vec2 a_pos; attribute float a_size; attribute vec4 a_col; uniform vec2 u_res; varying vec4 v_col;
void main() { vec2 c = a_pos / u_res * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); gl_PointSize = a_size; v_col = a_col; }`;
const FRAG = `precision mediump float; varying vec4 v_col;
void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-d * d * 4.0) * v_col.a; gl_FragColor = vec4(v_col.rgb * a, a); }`;

/** A theme colour as linear 0–1 RGB, read through the browser so any CSS colour form works. */
function rgb(css: string, probe: HTMLElement): [number, number, number] {
  probe.style.color = css;
  const v = getComputedStyle(probe).color;
  const n = (v.match(/[\d.]+/g) ?? []).map(Number);
  return v.startsWith('color(') ? [n[0] ?? 1, n[1] ?? 1, n[2] ?? 1] : [(n[0] ?? 255) / 255, (n[1] ?? 255) / 255, (n[2] ?? 255) / 255];
}

export function RunBloom({flights, svgRef, host}: {flights: Flight[]; svgRef: RefObject<SVGSVGElement | null>; host: RefObject<HTMLElement | null>}): ReactElement {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const live = useRef(flights);
  live.current = flights;
  useEffect(() => {
    const cv = canvas.current;
    const gl = cv?.getContext('webgl', {premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: false});
    if (!cv || !gl || gl.isContextLost()) return;
    const shader = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    const loc = {pos: gl.getAttribLocation(prog, 'a_pos'), size: gl.getAttribLocation(prog, 'a_size'), col: gl.getAttribLocation(prog, 'a_col'), res: gl.getUniformLocation(prog, 'u_res')};
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    const probe = document.createElement('span');
    probe.style.display = 'none';
    (host.current ?? document.body).appendChild(probe);
    const colours: Record<string, [number, number, number]> = {};
    const read = () => {
      const root = host.current ?? document.body;
      const css = getComputedStyle(root);
      for (const [k, v] of [['good', '--wr-good'], ['partial', '--wr-partial'], ['bad', '--wr-bad'], ['neutral', '--text'], ['self', '--wr-ai']] as const) {
        colours[k] = rgb(css.getPropertyValue(v).trim() || '#fff', probe);
      }
    };
    read();
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const svg = svgRef.current, box = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      const m = svg?.getScreenCTM();
      if (!svg || !m) return;
      const now = performance.now();
      const data: number[] = [];
      for (const f of live.current) {
        const t0 = (now - f.start) / f.dur;
        if (t0 < 0 || t0 > 1.6) continue;
        // Verified steps and findings travel dimmer with shorter tails; problems glow at full strength (the andon rule).
        const good = f.status === 'good' || f.status === 'neutral';
        const tail = good ? 3 : 6;
        const [r, g, b] = colours[f.status] ?? colours.neutral;
        for (let i = 0; i < tail; i += 1) {
          const t = Math.min(1, Math.max(0, t0 - i * 0.05));
          const x = (1 - t) * (1 - t) * f.from.x + 2 * (1 - t) * t * f.mid.x + t * t * f.to.x;
          const y = (1 - t) * (1 - t) * f.from.y + 2 * (1 - t) * t * f.mid.y + t * t * f.to.y;
          const fade = Math.max(0, 1 - Math.max(0, t0 - 1) / 0.6) * (1 - i / tail);
          const px = (m.a * x + m.c * y + m.e - box.left) * dpr, py = (m.b * x + m.d * y + m.f - box.top) * dpr;
          data.push(px, py, (good ? 26 : 40) * dpr * (1 - i * 0.08), r, g, b, (good ? 0.35 : 0.7) * fade);
        }
      }
      if (!data.length) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
      const stride = 7 * 4;
      gl.enableVertexAttribArray(loc.pos); gl.vertexAttribPointer(loc.pos, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(loc.size); gl.vertexAttribPointer(loc.size, 1, gl.FLOAT, false, stride, 8);
      gl.enableVertexAttribArray(loc.col); gl.vertexAttribPointer(loc.col, 4, gl.FLOAT, false, stride, 12);
      gl.uniform2f(loc.res, w, h);
      gl.drawArrays(gl.POINTS, 0, data.length / 7);
    };
    raf = requestAnimationFrame(frame);
    // The loop sleeps while the tab is hidden (research LOOK: loops sleep when hidden): requestAnimationFrame does.
    // The context is left to the canvas: losing it here would break a remount of the same canvas.
    return () => { cancelAnimationFrame(raf); probe.remove(); gl.deleteBuffer(buf); gl.deleteProgram(prog); };
  }, [svgRef, host]);
  return <canvas ref={canvas} className="wr-bloom" aria-hidden="true"/>;
}
