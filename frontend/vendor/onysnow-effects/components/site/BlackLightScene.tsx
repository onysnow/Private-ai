import { useEffect, useState } from "react";

import { pointer } from "@fx/effects/light/lights";
import { onTuningApplied, t } from "@fx/lib/tuning";

/**
 * The page under a black light (docs/black-light.md; Ony, 2026-10-01: "The
 * blacklight effect is terrible. Did you even look up references to what
 * blacklights do and what things look like under black light").
 *
 * Held, the black light turns the room off -- a black light is used in the
 * dark, and fluorescence is too faint to see in a lit room -- and lights the
 * page with UV round the hand, out to its reach:
 *
 *   the photographs glow as OBA prints do: their own luminance as
 *     brightener blue, the paper's whites most, the ink-dense darks not at
 *     all (an SVG colour matrix and curve, #uv-paper);
 *   what does not fluoresce is seen only by the lamp's violet leak, dark;
 *   light type glows blue-white, as white ink with brighteners;
 *   the day-glo orange buttons blaze;
 *   the lamp's own visible light: a faint violet (365 nm) or a purple wash
 *     (395 nm LED).
 */

/*
 * Colour tokens and strengths from docs/research/uv-blacklight.md (A, B):
 * sRGB as a camera records a black-lit scene. 365 nm: a near-black room,
 * full glow; 395 nm: a violet-washed room, about half the glow.
 */
const hex = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);
const LEAK = [
  { rgb: hex("#1A0F4A"), wash: 0.1, emit: 1.0 }, // 365 nm (BLB / filtered LED): leak365
  // 395 nm LED: leak computed from published spectra, median #8B00FF; body #6A00D9 (uv-blacklight.md R1 §4).
  { rgb: hex("#6A00D9"), wash: 0.3, emit: 0.55 },
] as const;
/** Optical brightener glow (photo whites, paper, cotton): body and halo. */
// Brightener glow as a camera records it, computed from its emission band (uv-blacklight.md R1 §4):
// core #E0E0FF, body #8C8CFF, halo #4C40FF (the first pass was ~25 degrees too cyan).
const OBA_BODY = hex("#8C8CFF");
const OBA_HALO = hex("#4C40FF");
/** The neon-ink option's colours (artistic, off by default: a photo print never does this). */
const HOT_PINK = hex("#FF3FB4");
// Day-glo yellow-green, corrected toward the measured hue (R1 §4).
const NEON_GREEN = hex("#7CFF3A");
const ELECTRIC_BLUE = hex("#4D7BFF");

/** exp(k (x - 1)) as a feFuncX table: the share of the paper's glow one ink lets through. */
const expTable = (k: number) =>
  Array.from({ length: 17 }, (_, i) => Math.exp(k * (i / 16 - 1)).toFixed(4)).join(" ");

const f = (n: number) => Number(n.toFixed(4));

/** A colour matrix: `colour` times (the weights' sum of r, g, b, plus offset). */
function termRow(colour: readonly number[], weights: readonly number[], offset: number): string {
  const rows = colour.map(
    (c) => `${f(c * weights[0]!)} ${f(c * weights[1]!)} ${f(c * weights[2]!)} 0 ${f(c * offset)}`,
  );
  return `${rows.join("  ")}  0 0 0 1 0`;
}

type Settings = {
  type: number;
  paper: number;
  neon: number;
  ink: number;
  dayglo: number;
  dark: number;
  reach: number;
};

const read = (): Settings => ({
  type: Math.round(t("uvType")),
  paper: t("uvPaper"),
  neon: t("uvNeon"),
  ink: t("uvInk"),
  dayglo: t("uvDayglo"),
  dark: t("uvRoomDark"),
  reach: t("uvReach"),
});

export function BlackLightScene() {
  const [s, setS] = useState<Settings>(read);

  useEffect(() => onTuningApplied(() => setS(read())), []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-uv", "");
    let frame = 0;
    const place = () => {
      frame = 0;
      const el = root;
      const away = pointer.x <= -9999;
      // Off the page, the UV is nowhere: the whole room is dark.
      el.style.setProperty("--uv-x", away ? "-2000px" : `${pointer.x}px`);
      el.style.setProperty("--uv-y", away ? "-2000px" : `${pointer.y}px`);
    };
    const move = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", move);
    place();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", move);
      root.removeAttribute("data-uv");
      for (const v of ["--uv-ink", "--uv-dayglo", "--uv-x", "--uv-y"]) root.style.removeProperty(v);
    };
  }, []);

  // The knobs the stylesheet reads.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--uv-ink", s.ink.toFixed(3));
    root.style.setProperty("--uv-dayglo", s.dayglo.toFixed(3));
  }, [s.ink, s.dayglo]);

  const leak = LEAK[s.type === 1 ? 1 : 0];
  const violet = `rgb(${leak.rgb.map((c) => Math.round(c * 255)).join(" ")}`;
  // The leak each pixel reflects: in proportion to its blue-band reflectance, with a gloss floor.
  // The references' skin under 395 nm is #3A2AA8 where a white is near-clipped light blue: the leak is the dimmer by far.
  const leakGain = 0.75;
  const L = leak.rgb.map((c) => c * leakGain);
  // The paper's glow, as the lamp excites it.
  const F = OBA_BODY.map((c) => c * (0.6 + leak.emit) * s.paper * 1.4);
  // The neon-ink option.
  const pk = HOT_PINK.map((c) => c * 2.2 * s.neon);
  const gr = NEON_GREEN.map((c) => c * 1.5 * s.neon);
  const cy = ELECTRIC_BLUE.map((c) => c * 1.3 * s.neon);
  const halo = (0.55 * s.paper * leak.emit).toFixed(3);
  const neonOn = s.neon > 0;

  return (
    <>
      {/*
        A photograph under the black light is a print on brightened paper
        (docs/research/uv-blacklight.md 6.1, calibrated in R1): the paper
        glows blue, the inks block it -- yellow most, then magenta, cyan
        least (measured, Hersch 2008) -- so whites glow, skies keep a faint
        glow, and reds, yellows and magentas go dark. Plus the violet leak the print reflects, in
        proportion to its blue. Then the camera: bright glow clips toward a
        pale core, and the glow (only the glow) blooms in its halo blue.

        T = exp(-(1.6 C + 2.5 M + 3.7 Y)), C = 1 - R, M = 1 - G, Y = 1 - B, is a
        product of one exponential per channel: three lookup tables, then
        the channels multiplied (feComposite k1).
      */}
      <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
        <filter
          id="uv-paper"
          colorInterpolationFilters="sRGB"
          x="-8%"
          y="-8%"
          width="116%"
          height="116%"
        >
          <feComponentTransfer in="SourceGraphic" result="ink">
            {/*
              Ink weights from the measured inkjet data (Hersch 2008, uv-blacklight.md R1 §1):
              yellow blocks the glow most, then magenta, then cyan -- C 1.6, M 2.5, Y 3.7.
            */}
            <feFuncR type="table" tableValues={expTable(1.6)} />
            <feFuncG type="table" tableValues={expTable(2.5)} />
            <feFuncB type="table" tableValues={expTable(3.7)} />
          </feComponentTransfer>
          <feColorMatrix
            in="ink"
            type="matrix"
            values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 1 0"
            result="tc"
          />
          <feColorMatrix
            in="ink"
            type="matrix"
            values="0 1 0 0 0  0 1 0 0 0  0 1 0 0 0  0 0 0 1 0"
            result="tm"
          />
          <feColorMatrix
            in="ink"
            type="matrix"
            values="0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 0 1 0"
            result="ty"
          />
          <feComposite
            in="tc"
            in2="tm"
            operator="arithmetic"
            k1="1"
            k2="0"
            k3="0"
            k4="0"
            result="tcm"
          />
          <feComposite
            in="tcm"
            in2="ty"
            operator="arithmetic"
            k1="1"
            k2="0"
            k3="0"
            k4="0"
            result="T"
          />
          {/* The paper's glow through the ink. */}
          <feColorMatrix in="T" type="matrix" values={termRow(F, [1, 0, 0], 0)} result="glow" />
          {/* The camera clipping it: past about 0.8 it runs to a pale, near-white core. */}
          <feColorMatrix
            in="T"
            type="matrix"
            values={termRow([1, 1, 1], [1.5 * s.paper * (0.6 + leak.emit), 0, 0], -1.25)}
            result="core"
          />
          {/* The neon-ink option (off by default): high-chroma pixels emitting in their hue family. */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values={termRow(pk, [1, -0.7, -0.3], -0.36)}
            result="warm"
          />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values={termRow(gr, [0.15, 1, -1.15], -0.05)}
            result="green"
          />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values={termRow(cy, [-1.2, 0.6, 0.6], 0)}
            result="cyan"
          />
          <feComposite
            in="warm"
            in2="green"
            operator="arithmetic"
            k1="0"
            k2={neonOn ? 1 : 0}
            k3={neonOn ? 1 : 0}
            k4="0"
            result="n1"
          />
          <feComposite
            in="n1"
            in2="cyan"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3={neonOn ? 1 : 0}
            k4="0"
            result="neon"
          />
          <feComposite
            in="glow"
            in2="neon"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3="1"
            k4="0"
            result="emit"
          />
          {/* Bloom: only the emission, in the halo blue, two radii. */}
          <feGaussianBlur in="emit" stdDeviation="5" result="b1" />
          <feGaussianBlur in="emit" stdDeviation="18" result="b2" />
          <feComposite
            in="b1"
            in2="b2"
            operator="arithmetic"
            k1="0"
            k2="0.6"
            k3="0.5"
            k4="0"
            result="bloom"
          />
          <feColorMatrix
            in="bloom"
            type="matrix"
            values={`${f(OBA_HALO[0]! * 0.5)} ${f(OBA_HALO[0]! * 0.5)} ${f(OBA_HALO[0]! * 0.5)} 0 0  ${f(OBA_HALO[1]! * 0.5)} ${f(OBA_HALO[1]! * 0.5)} ${f(OBA_HALO[1]! * 0.5)} 0 0  ${f(OBA_HALO[2]! * 0.5)} ${f(OBA_HALO[2]! * 0.5)} ${f(OBA_HALO[2]! * 0.5)} 0 0  0 0 0 1 0`}
            result="haloTint"
          />
          {/* The leak it reflects: lamp colour x (0.15 + 0.85 blue). */}
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values={termRow(L, [0, 0, 0.85], 0.15)}
            result="leak"
          />
          <feComposite
            in="emit"
            in2="core"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3="1"
            k4="0"
            result="e2"
          />
          <feComposite
            in="e2"
            in2="haloTint"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3={halo}
            k4="0"
            result="lit"
          />
          <feComposite in="lit" in2="leak" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
        </filter>
      </svg>
      {/* The room, off: dark but for the UV's reach round the hand. */}
      <div
        aria-hidden="true"
        className="blacklight-room"
        style={
          {
            "--uv-dark": s.dark.toFixed(3),
            "--uv-reach": `${s.reach}px`,
          } as React.CSSProperties
        }
      />
      {/* The lamp's own visible light: faint violet, or the 395 nm purple wash. */}
      <div
        aria-hidden="true"
        className="blacklight-leak"
        style={
          {
            "--uv-leak": `${violet} / ${leak.wash.toFixed(3)})`,
            "--uv-reach": `${s.reach}px`,
          } as React.CSSProperties
        }
      />
    </>
  );
}
