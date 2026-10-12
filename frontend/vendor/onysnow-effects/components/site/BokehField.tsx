import type { CSSProperties } from "react";

/**
 * Drifting points of light, to be placed behind a frosted panel.
 *
 * They are rendered sharp. The panel's `backdrop-filter` is what spreads them
 * into soft discs — which is the same thing a lens does to a highlight that
 * falls outside the focal plane, so the result is bokeh by construction rather
 * than by imitation.
 *
 * Positions are a fixed table rather than random, because random values differ
 * between the server render and the client render and React would discard the
 * markup. Each light also gets its own drift vector, duration and delay so the
 * field never visibly loops as a unit.
 */
type Light = {
  /** Percentages, so the field scales with the section. */
  left: number;
  top: number;
  /** rem — these are large and soft, not dots. */
  size: number;
  tint: "amber" | "teal";
  alpha: number;
  dx: number;
  dy: number;
  duration: number;
  delay: number;
};

const LIGHTS: Light[] = [
  {
    left: 6,
    top: 18,
    size: 17,
    tint: "amber",
    alpha: 0.34,
    dx: 3.5,
    dy: -2.2,
    duration: 26,
    delay: 0,
  },
  {
    left: 22,
    top: 66,
    size: 11,
    tint: "teal",
    alpha: 0.3,
    dx: -2.6,
    dy: -3,
    duration: 31,
    delay: -7,
  },
  {
    left: 41,
    top: 12,
    size: 9,
    tint: "teal",
    alpha: 0.22,
    dx: 2.2,
    dy: 2.8,
    duration: 23,
    delay: -14,
  },
  {
    left: 58,
    top: 72,
    size: 15,
    tint: "amber",
    alpha: 0.28,
    dx: -3.2,
    dy: -1.8,
    duration: 29,
    delay: -4,
  },
  {
    left: 76,
    top: 28,
    size: 20,
    tint: "amber",
    alpha: 0.3,
    dx: 2.8,
    dy: 2.4,
    duration: 34,
    delay: -19,
  },
  {
    left: 90,
    top: 60,
    size: 12,
    tint: "teal",
    alpha: 0.26,
    dx: -2.4,
    dy: -2.6,
    duration: 27,
    delay: -11,
  },
];

export function BokehField({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`bokeh-field ${className ?? ""}`}>
      {LIGHTS.map((l, i) => (
        <span
          key={i}
          className="bokeh"
          style={
            {
              left: `${l.left}%`,
              top: `${l.top}%`,
              width: `${l.size}rem`,
              height: `${l.size}rem`,
              marginLeft: `${-l.size / 2}rem`,
              marginTop: `${-l.size / 2}rem`,
              "--bokeh-tint": `var(--${l.tint})`,
              "--bokeh-alpha": l.alpha,
              "--bokeh-dx": `${l.dx}rem`,
              "--bokeh-dy": `${l.dy}rem`,
              "--bokeh-dur": `${l.duration}s`,
              "--bokeh-delay": `${l.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
