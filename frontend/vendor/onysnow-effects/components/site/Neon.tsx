import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { addEmitter, emitterChanged, makeEmitter } from "@fx/effects/light/lights";

/**
 * The gases, by the colour a lit tube gives. True neon is the red-orange;
 * argon is blue; the rest are phosphor-coated or tinted tube.
 */
export const NEON_GASES = {
  neon: "#ff4a1c",
  pink: "#ff3fa4",
  blue: "#3fa9ff",
  green: "#3dff7a",
  white: "#f4f0ff",
} as const;
export type NeonGas = keyof typeof NEON_GASES;

/**
 * How a tube burns.
 *
 *   steady   a healthy tube: the gas's faint shimmer, nothing more.
 *   flicker  a loose electrode: lit, then every few seconds a stutter of
 *            quick drop-outs, now and then dark for a beat.
 *   dying    a failing transformer: dim and buzzing, dropping out often,
 *            flaring back to full for moments.
 */
export type NeonFlicker = "steady" | "flicker" | "dying";

/**
 * Tilt Neon (Andy Clymer, Google Fonts, SIL OFL 1.1): drawn the way neon
 * tube letters are built -- as few strokes as possible, monoline, from
 * shop-window neon (claude/tools-research.md).
 *
 * Workbench: the font is bundled (@fontsource/tilt-neon, imported in
 * app/layout.tsx, ADR-0008), so nothing is fetched from Google Fonts; the
 * site loaded it from there on a page that shows a sign.
 */
function useNeonFont() {}

/** The tube's diameter, as a share of the lettering's size (Tilt Neon's stroke). */
const TUBE = 0.075;

function rgbOf(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  const c: [number, number, number] = [
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  ];
  const peak = Math.max(...c, 1e-3);
  return [c[0] / peak, c[1] / peak, c[2] / peak];
}

/** How brightly a tube burns next, 0 to 1, from how it has been burning. */
function nextLevel(
  mode: NeonFlicker,
  state: { until: number; level: number; burst: number },
  now: number,
) {
  if (mode === "steady") return 0.97 + 0.03 * Math.sin(now / 37);
  if (now < state.until) return state.level;
  if (mode === "flicker") {
    if (state.burst > 0) {
      state.burst -= 1;
      state.level = state.level > 0.5 ? 0.04 : 1;
      state.until = now + 30 + Math.random() * 90;
    } else if (Math.random() < 0.18) {
      state.burst = 3 + Math.floor(Math.random() * 6);
      state.level = 0.04;
      state.until = now + 40 + Math.random() * 60;
    } else {
      state.level = Math.random() < 0.08 ? 0.03 : 1;
      state.until =
        now + (state.level < 0.5 ? 250 + Math.random() * 300 : 1500 + Math.random() * 3500);
    }
    return state.level;
  }
  const r = Math.random();
  state.level = r < 0.25 ? 0.03 : r < 0.9 ? 0.45 + Math.random() * 0.2 : 1;
  state.until = now + (state.level > 0.9 ? 120 + Math.random() * 400 : 25 + Math.random() * 90);
  return state.level;
}

type Plumbing = {
  width: number;
  height: number;
  /** The blacked-out runs of tube between letters: [x1, y, x2]. */
  runs: [number, number, number][];
  /** The electrodes, where the tube turns back into the wall at each end. */
  ends: [number, number][];
  tube: number;
};

/**
 * A neon sign (item 23, redone as 25c): a real tube, and a line of light.
 *
 * What a sign is, and so what is drawn:
 *
 *   ONE TUBE. A word is bent from a single glass tube (claude/tools-
 *   research.md). Where it runs from one letter to the next it is painted
 *   black ("blockout"), so only the letters read -- the runs are there,
 *   dark, along the baseline. At each end the tube turns back into the wall
 *   to an electrode: a dark cap at the start and the end.
 *
 *   THE TUBE, DARK OR LIT. Unlit, it is pale glass with the colour faintly
 *   in it and a highlight along its top. Lit, the gas burns white-hot in the
 *   middle of the tube and in its colour at the walls, and throws a glow into
 *   the air and a wash onto the wall. Flicker only fades the lit layer
 *   (opacity -- composited, never repainted), so a dropped-out tube shows the
 *   glass it is.
 *
 *   A LINE OF LIGHT. While it burns the sign is an emitter in the light list
 *   spanning the lettering's width, so everything near it is lit from the
 *   nearest part of the tube -- the glass catches it along its rims, the
 *   photographs under the glass are lit by it.
 */
export function Neon({
  children,
  gas = "pink",
  flicker = "steady",
  className,
  lights = true,
}: {
  children: string;
  gas?: NeonGas;
  flicker?: NeonFlicker;
  className?: string;
  /** Whether it lights the scene (an emitter). */
  lights?: boolean;
}) {
  useNeonFont();
  const root = useRef<HTMLSpanElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const lit = useRef<HTMLSpanElement>(null);
  const wash = useRef<HTMLSpanElement>(null);
  const [plumbing, setPlumbing] = useState<Plumbing | null>(null);
  const hex = NEON_GASES[gas];
  const letters = [...children];

  // Where the letters are, once the face has loaded: the runs and the ends.
  useLayoutEffect(() => {
    const host = word.current;
    if (!host) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const box = host.getBoundingClientRect();
      const size = Number.parseFloat(getComputedStyle(host).fontSize) || 16;
      const tube = Math.max(1.5, size * TUBE);
      const spans = [...host.querySelectorAll<HTMLElement>("[data-letter]")].map((el) => {
        const r = el.getBoundingClientRect();
        return {
          left: r.left - box.left,
          right: r.right - box.left,
          blank: !el.textContent?.trim(),
        };
      });
      const drawn = spans.filter((s) => !s.blank);
      // The run sits on the baseline.
      const y = box.height * 0.78;
      const runs: [number, number, number][] = [];
      for (let i = 0; i + 1 < drawn.length; i++) {
        const a = drawn[i]!;
        const b = drawn[i + 1]!;
        const x1 = a.right - tube * 0.8;
        const x2 = b.left + tube * 0.8;
        if (x2 > x1) runs.push([x1, y, x2]);
      }
      const first = drawn[0];
      const last = drawn[drawn.length - 1];
      const ends: [number, number][] =
        first && last
          ? [
              [first.left + tube * 0.6, y],
              [last.right - tube * 0.6, y],
            ]
          : [];
      setPlumbing({ width: box.width, height: box.height, runs, ends, tube });
    };
    void document.fonts?.load(`1em "Tilt Neon"`).then(measure, measure);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [children]);

  // Burn: flicker the lit layer, and be a line of light while lit.
  useEffect(() => {
    const node = root.current;
    const gasLayer = lit.current;
    if (!node || !gasLayer) return;
    let level = 1;
    let rect = node.getBoundingClientRect();
    const light = makeEmitter(
      `neon-${gas}`,
      rgbOf(hex),
      36,
      () => Math.max(3, Number.parseFloat(getComputedStyle(node).fontSize) * TUBE * 2),
      0.8,
      // The tube runs the lettering's width.
      () => [Math.max(0, rect.width / 2 - 8), 0],
    );
    const remove = lights ? addEmitter(light) : () => {};
    const state = { until: 0, level: 1, burst: 0 };
    let frame = 0;
    let lastPlaced = -1;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const next = nextLevel(flicker, state, now);
      const moved = now - lastPlaced > 120;
      if (moved) {
        rect = node.getBoundingClientRect();
        lastPlaced = now;
      }
      if (Math.abs(next - level) < 0.01 && !moved) return;
      level = next;
      // Opacity only: the compositor fades the lit layers, nothing repaints.
      gasLayer.style.opacity = level.toFixed(3);
      if (wash.current) wash.current.style.opacity = (level * 0.22).toFixed(3);
      if (!lights) return;
      const onScreen = rect.bottom > -200 && rect.top < window.innerHeight + 200;
      light.x = rect.left + rect.width / 2;
      light.y = rect.top + rect.height * 0.55;
      light.level = level;
      light.charge = onScreen ? 1 : 0;
      emitterChanged();
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      remove();
    };
  }, [gas, flicker, hex, lights]);

  const text = letters.map((ch, i) => (
    <span key={i} data-letter>
      {ch}
    </span>
  ));

  return (
    <span
      ref={root}
      className={className ? `neon ${className}` : "neon"}
      data-gas={gas}
      role="img"
      aria-label={children}
      style={{ "--neon-colour": hex } as CSSProperties}
    >
      {/* The wall wash: what the lit tube throws onto what it hangs on. */}
      <span ref={wash} className="neon__wash" aria-hidden="true" />
      {/* The glass tube, always there: the letters. */}
      <span ref={word} className="neon__tube" aria-hidden="true">
        {text}
      </span>
      {/* The blacked-out runs between letters, and the electrode caps at the ends. */}
      {plumbing ? (
        <svg
          className="neon__plumbing"
          aria-hidden="true"
          width={plumbing.width}
          height={plumbing.height}
          viewBox={`0 0 ${plumbing.width} ${plumbing.height}`}
        >
          {plumbing.runs.map(([x1, y, x2], i) => (
            <g key={i}>
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                className="neon__run"
                strokeWidth={plumbing.tube}
              />
              <line
                x1={x1}
                y1={y - plumbing.tube * 0.22}
                x2={x2}
                y2={y - plumbing.tube * 0.22}
                className="neon__run-glint"
                strokeWidth={Math.max(0.6, plumbing.tube * 0.18)}
              />
            </g>
          ))}
          {plumbing.ends.map(([x, y], i) => (
            <g key={`e${i}`}>
              <circle cx={x} cy={y} r={plumbing.tube * 1.05} className="neon__electrode" />
              <circle cx={x} cy={y} r={plumbing.tube * 0.55} className="neon__electrode-cap" />
            </g>
          ))}
        </svg>
      ) : null}
      {/* The gas, burning: fades as the tube flickers. */}
      <span ref={lit} className="neon__gas" aria-hidden="true">
        {text}
      </span>
    </span>
  );
}
