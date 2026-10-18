/**
 * Live tuning for the effect layer.
 *
 * Every number in the glass and light system was arrived at by someone
 * describing a screenshot in words and someone else changing a constant. That
 * loop is slow and it is wrong often. These are the same constants, exposed.
 *
 * Deliberately a plain mutable object rather than React state: the shaders and
 * the canvases read it from inside their own rAF loops, sixty times a second,
 * and routing that through a re-render would cost more than the effects do.
 * The panel writes, the loops read, nothing subscribes.
 *
 * CSS-side values are mirrored onto the document element as custom properties
 * by `applyTuning`, because stylesheets cannot read a JS object.
 */

import { getGlassMode, onGlassMode } from "./glass-mode";
import { DEFAULT_EDGE_WIDTH } from "@fx/effects/optics/edge-profile";

export type Knob = {
  label: string;
  group: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Written to the document element as a custom property, with this suffix. */
  cssVar?: string;
  cssUnit?: string;
  /**
   * Written into each pane's `data-config` for the rasterised glass.
   *
   * That library watches the attribute with a MutationObserver and re-reads
   * its configuration when it changes, so this is a live sink exactly like
   * `cssVar` is -- no re-init, no reload.
   *
   * `"band"` and `"bar"` scope a value to the section panes or the fixed
   * header respectively; anything else applies to both.
   */
  glassKey?: string;
  glassScope?: "band" | "bar";
  /**
   * The glass mode this knob has a visible effect in.
   *
   * Omitted means both. `"raster"` means it feeds ybouane's shader and does
   * nothing at all in CSS mode.
   *
   * Declared rather than inferred from `glassKey` because the inverse is not
   * true and it would be a lie to imply it: the CSS-side knobs are NOT dead
   * in raster mode. Only the section bands are rasterised -- the fixed header
   * stays backdrop-filter in both modes -- so `transmit`, the paper gloss and
   * the reflection group still drive the bar when the bands are liquid. The
   * lab says so on the group rather than hiding them.
   */
  modes?: "raster";
  hint?: string;
  /** A choice rather than an amount: the names of min, min + step, ... (the lab shows a list). */
  options?: readonly string[];
  /** Named values the lab offers as one-click buttons under the slider. */
  presets?: readonly { label: string; value: number }[];
};

export const tuning: Record<string, Knob> = {
  // ---- The glass's shape ----
  //
  // A cause, not a result: how wide the rounded-over edge of a pane is. The
  // bend, the light on the edge and the edge of its shadow all work out their
  // own values from this one number, in both glass modes, so they cannot land
  // in different places again. A pane can set its own with data-edge-width;
  // this is the width for every pane that does not.
  //
  // It replaces three knobs that were each a different width for the same
  // edge: "Bevel depth" (150, the liquid bend), "Shadow edge" (90) and the
  // fixed 26 of the CSS bend.
  edgeWidth: {
    label: "Edge width",
    group: "Glass shape",
    value: DEFAULT_EDGE_WIDTH,
    min: 4,
    max: 200,
    step: 1,
    glassKey: "zRadius",
    hint: "How wide the rounded-over edge of the glass is, in pixels. Everything the edge does follows from it: how far it bends what is behind it, where its highlight sits, and where the bright seam and dark rim of its shadow fall. Panes can set their own.",
  },
  // ---- The room the glass reflects ----
  //
  // A cause: how brightly lit the room you are standing in is, which is what
  // the glass reflects (at ~4%, rising at grazing). 1 is a room lit like the
  // screen -- photographic middle grey. Brighter rooms reflect more; a window
  // at night shows the room because outside is darker than 4% of it.
  /*
   * Backlit glass (Ony, 2026-10-01, with a photograph of a backlit frosted
   * slab): light enters the glass from behind one edge and the frost
   * scatters it through the whole pane -- brightest at the edge it comes
   * in by, falling away smoothly across it, the edge itself burning, and a
   * spill of its colour onto what is beyond that edge. Not a circle behind
   * the glass: the old backlight was a lamp at the screen's centre.
   * effects/optics/backlit, drawn in the glass shader. 0 is off.
   */
  backlight: {
    label: "Backlight",
    group: "Environment",
    value: 0.6,
    min: 0,
    max: 3,
    step: 0.05,
    hint: "Light shone into the glass from behind one edge and filling the pane through its frost. 0 is off. Clear glass barely glows -- the light goes straight through it; frosted glass fills with it.",
  },
  backlightEdge: {
    label: "Backlight comes from",
    group: "Environment",
    value: 0,
    min: 0,
    max: 5,
    step: 1,
    // Ony: "the lights would enter from off screen on the left or right side. or both at the same time to make it even".
    options: ["Both sides", "The left", "The right", "Below", "Above", "Behind the whole pane"],
    hint: "Which edge the light enters by: off screen at the left, the right, or both at once to even it out. Behind the whole pane is a lightbox: an even glow, a little dimmer toward the rims.",
  },
  backlightSize: {
    label: "Backlight fill",
    group: "Environment",
    value: 0.45,
    min: 0.05,
    max: 3,
    step: 0.05,
    hint: "How far into the pane the light carries before it fades, against the pane's own size: low is a glow hugging the edge, 1 fades across the whole pane, high fills it almost evenly. More frost scatters it sooner.",
  },
  backlightKelvin: {
    label: "Backlight white",
    group: "Environment",
    value: 6500,
    min: 1900,
    max: 10000,
    step: 100,
    hint: "Its white from its temperature, in kelvin as on a camera: 2700 a warm bulb, 6500 daylight, higher bluer. With colour at 0 this is its colour.",
  },
  backlightHue: {
    label: "Backlight hue",
    group: "Environment",
    value: 175,
    min: 0,
    max: 360,
    step: 1,
    hint: "Its colour round the colour wheel, in degrees: 0 red, 30 orange, 60 yellow, 120 green, 175 teal, 220 blue, 280 violet.",
  },
  backlightSaturation: {
    label: "Backlight colour",
    group: "Environment",
    value: 0,
    min: 0,
    max: 1,
    step: 0.01,
    hint: "How coloured it is: 0 is the white above, 1 the full hue (a coloured LED strip).",
  },
  roomBrightness: {
    label: "Room brightness",
    group: "Environment",
    // The room is lit again (Ony, 2026-09-28: "put it back"): its reflection
    // and the resting edges are that light, so they are as bright as the room
    // is. 0 is a dark room with the lamp the only source.
    value: 1,
    min: 0,
    max: 8,
    step: 0.1,
    hint: "How brightly the room's own lights light it; 0 is a dark room, with the lamp the only source. The glass's own reflectance (from its material) and the room's lamps do the rest; there is no reflection strength setting.",
  },
  // ---- The camera ----
  //
  // Where the viewer is. The eye moves with the pointer by this fraction, and
  // everything behind the glass slides under it by the real parallax of the
  // gap (see effects/optics/viewpoint.ts). Behaviour of the cursor, not a
  // result: how far anything moves follows from this, the gap and the
  // camera's distance.
  //
  // 0 (Ony, 2026-09-30): "I don't want the hero images to pan with mouse
  // movement. Only scrolling will activate the parallax." The eye stays
  // straight in front of the screen; what moves the photographs is scrolling.
  // How far from the screen the viewer is, in viewport widths (the camera the
  // whole page is worked out for: side faces, reflections, parallax). Nearer,
  // the pane's side faces open up; further, they close to a line (2c, Ony
  // 2026-09-30: "at this angle I should be able to see a lot more of the top
  // side"). 1.2 is the distance the site was tuned at.
  viewDistance: {
    label: "Viewing distance",
    group: "Camera",
    value: 1.2,
    min: 0.25,
    max: 3,
    step: 0.05,
    hint: "How far your eye is from the screen, in screen widths. Closer, you see more of each pane's side faces (and the room reflection and parallax change with it); further, the sides close to a line.",
  },
  viewFollow: {
    label: "Viewpoint follows pointer",
    group: "Camera",
    value: 0,
    min: 0,
    max: 1,
    step: 0.05,
    hint: "0 is a fixed eye straight in front of the screen; 1 puts the eye right over the pointer. The photographs behind the glass slide under it by the parallax of the glass's height -- which is how you see the edge bend them.",
  },
  /*
   * A polarising filter on the camera (light engine step H, ?try=polariser):
   * light reflected off the glass is partly polarised, so turning the filter
   * dims or keeps the reflection -- most toward the frame's edges, where the
   * glass is seen at the steepest angle. A photographer's own tool.
   */
  /*
   * Natural vignetting (catalogue item 32, ?try=vignette): a lens passes less
   * light to the edges of its picture than to the middle, as cos^4 of the
   * angle off its axis -- a photograph's darker corners. 1 is the full law
   * for the camera's distance; 0 none.
   */
  vignetting: {
    label: "Vignetting",
    group: "Camera",
    value: 0,
    min: 0,
    max: 1,
    step: 0.05,
    hint: "The lens's darker corners: 1 is the cos^4 law for how far away the camera is (closer, darker corners), 0 none. Needs its switch above (Lens vignetting).",
  },
  polariser: {
    label: "Polarising filter",
    group: "Camera",
    value: 0,
    min: 0,
    max: 1,
    step: 0.05,
    hint: "0 no filter; 1 a perfect polariser on the lens (exposure made up). Turn it with the angle below to cut or keep the glass's reflections. Needs its switch above (Polarising filter).",
  },
  polariserAngle: {
    label: "Polarising filter angle",
    group: "Camera",
    value: 0,
    min: 0,
    max: 180,
    step: 1,
    hint: "The filter's turn, degrees: its axis across the screen at 0, up and down at 90. Reflections fade where the axis runs toward the middle of the frame.",
  },
  // How much light the photograph's blown highlights are taken to have held
  // (effects/optics/bokeh). Their size follows the frost; this is brightness.
  bokeh: {
    label: "Bokeh",
    group: "Camera",
    value: 40,
    min: 0,
    max: 200,
    step: 5,
    hint: "How bright the discs are that the lights in a photograph make behind frosted glass: how many times more light a blown-out bulb held than the file could store. 0 turns the discs off. Their size is the frost's.",
  },
  // ---- The rasterised glass ----
  //
  // These are the shader's own uniforms, not CSS. They only do anything in
  // `?glass=raster`; in CSS mode the panes are backdrop-filter and an SVG
  // displacement map, and none of this reaches them.
  restEdge: {
    label: "Edge at rest",
    group: "Glass",
    value: 0.1,
    min: 0,
    max: 1,
    step: 0.01,
    hint: "How much of the bevel shows with nothing shining on it. Glass does not stop being glass in the dark, but at the old 0.35 this covered up to a third of the pane and read as dust rather than as an edge.",
  },
  shutterTime: {
    label: "Shutter speed",
    group: "Cursor",
    value: 520,
    min: 120,
    max: 1400,
    step: 20,
    cssVar: "--tune-shutter-time",
    cssUnit: "ms",
    hint: "How long the aperture takes to close and reopen. A real leaf shutter is nearer 230ms, which is too fast to read — this one is the whole feedback for a click, so it is deliberately slower than life. All three animations (blades, housing, ring recoil) run off this, so they stay one event.",
  },
  ringOpen: {
    label: "Ring opens with charge",
    group: "Cursor",
    value: 2.4,
    min: 0,
    max: 6,
    step: 0.1,
    cssVar: "--tune-ring-open",
    hint: "How far the ring widens as the flash winds, as a multiple of its resting size. The emitter's bloom widens with charge squared, so the ring has to open at least as fast or the light escapes it. The aperture follows automatically — it derives its size from the ring.",
  },
  glassRefraction: {
    label: "Refraction",
    group: "Liquid glass",
    value: 3.2,
    min: 0,
    max: 4,
    step: 0.01,
    glassKey: "refraction",
    modes: "raster",
    hint: "How far the bevel bends what is behind the pane. This is the effect; everything else is trim.",
  },
  glassEdgeBlur: {
    label: "Edge blur",
    group: "Liquid glass",
    value: 0.7,
    min: 0,
    max: 1,
    step: 0.01,
    glassKey: "edgeBlur",
    modes: "raster",
    hint: "How far out of focus the bent rim goes, on top of the frost. A thick lens edge is where the picture is softest.",
  },
  glassChroma: {
    label: "Dispersion",
    group: "Liquid glass",
    value: 0.04,
    min: 0,
    max: 0.4,
    step: 0.005,
    glassKey: "chromAberration",
    modes: "raster",
    hint: "Chromatic aberration at the rim. Glass splits wavelengths by slightly different amounts, and this is the single strongest cue that something is glass rather than a blur.",
  },
  glassBlur: {
    label: "Frost",
    group: "Liquid glass",
    value: 0.6,
    min: 0,
    max: 1,
    step: 0.01,
    glassKey: "blurAmount",
    modes: "raster",
    hint: "How far from clear the body of the pane is. 0 is optical glass; the photographs read straight through it.",
  },
  glassSpecular: {
    label: "Gloss",
    group: "Liquid glass",
    value: 0.6,
    min: 0,
    max: 2,
    step: 0.02,
    glassKey: "specular",
    modes: "raster",
    hint: "Strength of the hard highlights off the bevel. Four fixed lights, Blinn-Phong, exponents 90/50/6/120.",
  },
  glassDistortion: {
    label: "Roughness",
    group: "Liquid glass",
    value: 0,
    min: 0,
    max: 1,
    step: 0.01,
    glassKey: "distortion",
    modes: "raster",
    hint: "Micro-distortion in the surface. Small amounts read as imperfect glass; large amounts read as water.",
  },
  glassFresnel: {
    label: "Fresnel",
    group: "Liquid glass",
    value: 1.3,
    min: 0,
    max: 2,
    step: 0.02,
    glassKey: "fresnel",
    modes: "raster",
    hint: "How much brighter the pane gets where you see it at a grazing angle. Lives on the bevel, since the face is dead flat.",
  },
  glassEdge: {
    label: "Edge highlight",
    group: "Liquid glass",
    value: 0.25,
    min: 0,
    max: 1,
    step: 0.01,
    glassKey: "edgeHighlight",
    modes: "raster",
    hint: "The inner stroke and rim glow. Trim rather than optics.",
  },
  glassCornerBand: {
    label: "Corner, bands",
    group: "Liquid glass",
    value: 0,
    min: 0,
    max: 140,
    step: 2,
    glassKey: "cornerRadius",
    modes: "raster",
    glassScope: "band",
    hint: "0 runs them straight across, which is what a full-bleed band wants.",
  },
  glassCornerBar: {
    label: "Corner, header",
    group: "Liquid glass",
    value: 65,
    min: 0,
    max: 140,
    step: 2,
    glassKey: "cornerRadius",
    modes: "raster",
    glassScope: "bar",
    hint: "The header is a floating bar, so it keeps a pill.",
  },
  glassTint: {
    label: "Tint",
    group: "Liquid glass",
    value: 0,
    min: 0,
    max: 1,
    step: 0.01,
    glassKey: "tintStrength",
    modes: "raster",
    hint: "Cool cast through the body, as thick glass has.",
  },
  glassSaturation: {
    label: "Saturation",
    group: "Liquid glass",
    value: 0,
    min: -1,
    max: 1,
    step: 0.02,
    glassKey: "saturation",
    modes: "raster",
    hint: "Applied to what is seen THROUGH the pane, not to the page.",
  },
  glassSpecTight: {
    label: "Highlight tightness",
    group: "Liquid glass",
    value: 1.4,
    min: 0.1,
    max: 4,
    step: 0.05,
    glassKey: "specularTightness",
    modes: "raster",
    hint: "Scales all four specular exponents at once (90/50/6/120 at 1.0). Higher is a smaller, harder glint; lower spreads it into a sheen. This is the roughness of the surface in the optical sense.",
  },
  glassLightX: {
    label: "Light across",
    group: "Liquid glass",
    value: 0,
    min: -1.5,
    max: 1.5,
    step: 0.05,
    glassKey: "lightX",
    modes: "raster",
    hint: "Moves the two TIGHT speculars left and right. The two broad fill lights stay put — moving those muddies the face rather than lighting it.",
  },
  glassLightY: {
    label: "Light up",
    group: "Liquid glass",
    value: 0,
    min: -1.5,
    max: 1.5,
    step: 0.05,
    glassKey: "lightY",
    modes: "raster",
    hint: "Same, vertically. 0,0 is the rig the library ships with.",
  },
  glassBlurPasses: {
    label: "Frost quality",
    group: "Liquid glass",
    value: 6,
    min: 1,
    max: 12,
    step: 1,
    glassKey: "blurPasses",
    modes: "raster",
    hint: "Gaussian passes behind the frost. Each one costs two full-screen draws, so this is the knob to drop first if the panes are expensive.",
  },
  glassOpacity: {
    label: "Pane opacity",
    group: "Liquid glass",
    value: 1,
    min: 0,
    max: 1,
    step: 0.01,
    glassKey: "opacity",
    modes: "raster",
    hint: "The whole shader output's alpha. Below 1 the unrefracted page shows through underneath, which reads as thin glass rather than as clear glass.",
  },
  glassBevelMode: {
    label: "Bevel profile",
    group: "Liquid glass",
    value: 0,
    min: 0,
    max: 1,
    step: 1,
    glassKey: "bevelMode",
    modes: "raster",
    hint: "0 is a biconvex pill, curved from both faces. 1 is a dome: flat underneath, quarter-circle on top. Set 1 with bevel depth equal to the corner radius for a half-sphere magnifier.",
  },
  glassShadow: {
    label: "Drop shadow",
    group: "Liquid glass",
    value: 0.3,
    min: 0,
    max: 1,
    step: 0.01,
    glassKey: "shadowOpacity",
    modes: "raster",
    hint: "The shadow the pane casts on the page. Drawn inside a 20px pad around the canvas, so a large spread gets clipped rather than growing.",
  },
  glassShadowSpread: {
    label: "Shadow spread",
    group: "Liquid glass",
    value: 10,
    min: 0,
    max: 20,
    step: 1,
    glassKey: "shadowSpread",
    modes: "raster",
    hint: "Capped by the same 20px pad. Past that the shadow is cut off square, which looks worse than a smaller shadow.",
  },
  glassShadowY: {
    label: "Shadow offset",
    group: "Liquid glass",
    value: 1,
    min: -20,
    max: 20,
    step: 1,
    glassKey: "shadowOffsetY",
    modes: "raster",
    hint: "Vertical only, which is upstream's choice — the implied light is directly above.",
  },
  glassBrightness: {
    label: "Brightness",
    group: "Liquid glass",
    value: 0.08,
    min: -0.5,
    max: 0.5,
    step: 0.01,
    glassKey: "brightness",
    modes: "raster",
  },

  // ---- The light itself ----
  /*
   * The lamp's colour from its temperature (catalogue item 32, ?try=kelvin):
   * a blackbody's glow at that temperature, seen through the eye's colour
   * matching. 5900 K is the nearest to the warm white it has had.
   */
  lampKelvin: {
    label: "Lamp colour temperature",
    group: "Light",
    value: 5900,
    min: 1500,
    max: 10000,
    step: 50,
    hint: "In kelvin, as on a camera: 1900 a candle, 2700 a household bulb, 3200 tungsten, 5500 daylight, 6500 the screen's white, higher is bluer. Needs its switch above (Lamp colour from temperature).",
  },
  coreGain: {
    label: "Core gain",
    group: "Light",
    value: 8,
    min: 1,
    // Up from 30 (2k): room to blow the core out much further.
    max: 80,
    step: 0.5,
    hint: "How far the emission exceeds white. The tonemap clips everything above 1, so this sets how BIG the blown hexagon is — not the aperture.",
  },
  coreFalloff: {
    label: "Core tightness",
    group: "Lens flare",
    value: 1500,
    // Down from 300 (2k): a much wider blown core.
    min: 50,
    max: 4000,
    step: 50,
    hint: "Higher pulls the blown region in.",
  },
  aperture: {
    label: "Aperture radius",
    group: "Light",
    value: 0.062,
    min: 0.02,
    max: 0.2,
    step: 0.002,
    hint: "The hexagon's actual size, as a fraction of half the viewport's short side.",
  },
  spread: {
    label: "Growth with charge",
    group: "Light",
    value: 0.3,
    min: 0.1,
    max: 1,
    step: 0.02,
    hint: "Size at zero charge relative to full. 1 means it never grows.",
  },
  ghostGain: {
    label: "Ghost strength",
    group: "Lens flare",
    value: 2.78,
    min: 0,
    // Up from 6 (2k, Ony: "so I can make it even more intense").
    max: 20,
    step: 0.05,
    hint: "The chain of aperture images thrown back along the optical axis. Up half again from 1.85 — they were reading as an artefact rather than as part of the flare.",
  },
  haloGain: {
    label: "Halo strength",
    group: "Lens flare",
    value: 1.5,
    min: 0,
    // Up from 4 (2k).
    max: 16,
    step: 0.05,
    hint: "The ring of scatter around the source, from the coating rather than the elements.",
  },
  /*
   * The lens itself (2k, Ony 2026-09-30: "more cat's eye, more rainbow, more
   * halos, more ghost chain, shape of ghost chain, bokeh"). Each is a
   * property of the lens -- how many elements, how the barrel clips, how the
   * coatings disperse, how many blades the iris has -- and the flare follows
   * from it. At their defaults the flare is exactly what it was.
   */
  ghostCount: {
    label: "Ghosts in the chain",
    group: "Lens flare",
    value: 7,
    min: 0,
    max: 24,
    step: 1,
    hint: "How many reflections between elements reach the sensor: more elements in the lens, a longer chain.",
  },
  ghostSpacing: {
    label: "Ghost spacing",
    group: "Lens flare",
    value: 0.34,
    min: 0.05,
    max: 1,
    step: 0.01,
    hint: "How far apart the ghosts land along the line through the centre of the frame.",
  },
  ghostSize: {
    label: "Ghost size",
    group: "Lens flare",
    value: 1,
    min: 0.2,
    max: 5,
    step: 0.05,
    hint: "How big each ghost is: how far its pair of surfaces sits from focus.",
  },
  ghostShape: {
    label: "Ghost shape",
    group: "Lens flare",
    value: 0,
    min: -1,
    max: 1,
    step: 0.05,
    hint: "-1 sharp-cornered polygons (the iris, crisp), 0 as photographed, 1 round discs (the blades washed out by defocus).",
  },
  apertureBlades: {
    label: "Aperture blades",
    group: "Lens flare",
    value: 6,
    min: 3,
    max: 16,
    step: 1,
    hint: "The iris's blade count. It shapes the core, every ghost (they are images of the iris) and the star: an even count throws that many spikes.",
  },
  ghostBokeh: {
    label: "Ghost bokeh",
    group: "Lens flare",
    value: 0,
    min: 0,
    max: 1,
    step: 0.05,
    hint: "0 ghosts bright at the rim and hollow; 1 soft, evenly filled discs, like out-of-focus highlights.",
  },
  catsEye: {
    label: "Cat's eye",
    group: "Lens flare",
    value: 1,
    min: 0,
    max: 4,
    step: 0.05,
    hint: "How hard the lens barrel clips ghosts away from the centre of the frame, into the cat's-eye shape. 0 none.",
  },
  flareRainbow: {
    label: "Rainbow",
    group: "Lens flare",
    value: 1,
    min: 0,
    max: 6,
    step: 0.05,
    hint: "How much the coatings disperse: the colour split round the core, in each ghost and across the halo. 0 colourless.",
  },
  haloRings: {
    label: "Halo rings",
    group: "Lens flare",
    value: 2,
    min: 1,
    max: 8,
    step: 1,
    hint: "How many rings of the big halo round the centre of the frame, each wider and fainter than the last.",
  },
  haloSize: {
    label: "Halo size",
    group: "Lens flare",
    value: 1,
    min: 0.3,
    max: 3,
    step: 0.05,
    hint: "The big halo's radius.",
  },
  starSpikes: {
    label: "Star spikes",
    group: "Lens flare",
    value: 1,
    min: 0,
    max: 6,
    step: 0.05,
    hint: "The diffraction star off the iris blades.",
  },

  // ---- The glass surface ----
  grimeRake: {
    label: "Grime, raked",
    group: "Glass",
    value: 2.4,
    min: 0,
    max: 8,
    step: 0.1,
    hint: "Smudges catching the light at a shallow angle.",
  },
  grimeSpecks: {
    label: "Specks",
    group: "Glass",
    value: 9.5,
    min: 0,
    max: 25,
    step: 0.5,
  },
  rimGlare: {
    label: "Edge glare",
    group: "Lens flare",
    value: 0.8,
    min: 0,
    // Up from 1 (2k).
    max: 3,
    step: 0.05,
    hint: "The glow of a lit edge spilling past the rim onto the photograph beyond, the way a bright edge glares in a lens. 0 stops the glow at the glass.",
  },
  rimGlareSize: {
    label: "Edge glare size",
    group: "Lens flare",
    value: 16,
    min: 2,
    // Up from 60 (2k).
    max: 200,
    step: 1,
    hint: "How far the glare spreads, in pixels.",
  },
  edgeBloom: {
    label: "Edge bloom",
    group: "Lens flare",
    // Ony, 2026-09-29: "the bloom is a little strong" (was 1).
    value: 0.65,
    min: 0,
    // Up from 2 (2k).
    max: 6,
    step: 0.05,
    hint: "How much the camera spreads a lit edge into a glow round it. The bright line itself stays; this is only the soft light around it.",
  },
  lampMirror: {
    label: "Lamp's own reflection on the face",
    group: "Reflection",
    value: 0,
    min: 0,
    max: 1,
    step: 1,
    options: [
      "Off (as asked: it read as a flashlight on the glass)",
      "On (the face mirrors the lamp: Fresnel x GGX)",
    ],
    hint: "Whether the glass face shows its mirror image of the lamp. Physically it would; you had it switched off because it read as a flashlight on the glass.",
  },
  pipedLight: {
    label: "Light piped through the glass",
    group: "Glass",
    value: 1,
    min: 0,
    max: 3,
    step: 0.05,
    hint: "Light that gets into a pane (through its frost) is trapped between the faces and runs to the edges, where it escapes: the far edges and the side faces glow when the lamp is on the glass. 1 is today's; 0 off.",
  },
  pipedReach: {
    label: "How far piped light travels",
    group: "Glass",
    value: 780,
    min: 100,
    max: 3000,
    step: 20,
    hint: "The distance, in px, over which light running inside the pane falls to a third (absorbed and scattered out on the way). Longer reaches the far edges brighter.",
  },
  /*
   * The black light's scene (docs/black-light.md; Ony, 2026-10-01: "The
   * blacklight effect is terrible"). components/site/BlackLightScene.
   */
  uvType: {
    label: "Black light type",
    group: "Light",
    value: 1,
    min: 0,
    max: 1,
    step: 1,
    options: ["365 nm (filtered: faint violet)", "395 nm LED (strong purple wash)"],
    hint: "A filtered 365 nm black light gives almost no visible light, so what fluoresces stands out against near-black; a 395 nm LED bar or torch also throws a strong purple that washes faint glows out.",
  },
  uvRoomDark: {
    label: "Room under the black light",
    group: "Light",
    value: 0.92,
    min: 0,
    max: 1,
    step: 0.01,
    hint: "How dark the room is while the black light is held: black lights are used with the lights off, and fluorescence is too faint to see in a lit room. 1 is pitch dark beyond its reach.",
  },
  uvReach: {
    label: "Black light reach",
    group: "Light",
    value: 900,
    min: 150,
    max: 1600,
    step: 10,
    hint: "How far, px, its UV carries across the page before it is too weak to make anything glow.",
  },
  uvPaper: {
    label: "UV: photo paper",
    group: "Light",
    value: 0.9,
    min: 0,
    max: 2,
    step: 0.05,
    hint: "How strongly the photographs' paper glows under UV (its optical brighteners): the whites glow pale blue, skies keep some, reds and magentas and the darks none -- the inks block the glow, magenta and black most, cyan least. 0 is brightener-free (rag) paper: the print only reflects the lamp's violet.",
  },
  uvNeon: {
    label: "UV: neon inks in the photographs (artistic)",
    group: "Light",
    value: 0,
    min: 0,
    max: 2,
    step: 0.05,
    hint: "Off is the truth: a photo print's inks do not fluoresce, they block the paper's glow, so its saturated reds and magentas go dark under a black light (docs/research/uv-blacklight.md). Turn up to print the photographs in fluorescent inks instead, like a blacklight poster: reds hot pink, yellows and greens neon green, cyans electric blue.",
  },
  uvUranium: {
    label: "UV: uranium glass",
    group: "Light",
    value: 1,
    min: 0,
    max: 3,
    step: 0.05,
    hint: "The panes as uranium glass: under the black light the glass itself glows vivid green through its body, its edges brightest, lighting what is round them. 0 is ordinary glass, which barely glows.",
  },
  uvInk: {
    label: "UV: white type",
    group: "Light",
    value: 0.8,
    min: 0,
    max: 2,
    step: 0.05,
    hint: "How strongly the light type glows blue-white under UV, as white ink with brighteners does. 0: ordinary ink, dark.",
  },
  uvDayglo: {
    label: "UV: orange buttons (day-glo)",
    group: "Light",
    value: 1,
    min: 0,
    max: 2,
    step: 0.05,
    hint: "How strongly the orange buttons' fluorescent pigment glows under the black light (its quantum yield, relative). 1 is a day-glo pigment.",
  },
  uvDust: {
    label: "UV: dust and lint on the glass",
    group: "Light",
    value: 0.7,
    min: 0,
    max: 2,
    step: 0.05,
    hint: "How strongly fibres on the glass glow blue-white under UV (laundry brighteners in them).",
  },
  uvGrease: {
    label: "UV: finger grease on the glass",
    group: "Light",
    value: 0.03,
    min: 0,
    max: 1,
    step: 0.01,
    hint: "How strongly smudges glow under UV. Skin oil barely does; raise it for a crime-scene look.",
  },
  roomChoice: {
    label: "Room reflected (HDRI)",
    group: "Reflection",
    value: 0,
    min: 0,
    max: 6,
    step: 1,
    options: [
      "A different room each visit",
      "Metro",
      "Aquarium",
      "Studio",
      "Lobby",
      "Fireplace",
      "Station",
    ],
    hint: "Which photographed room the glass reflects. Each is a real 360-degree HDR photograph; the default hands every visit the next one. Swap the pictures themselves in the Studio's site assets.",
  },
  // ---- CSS-side ----
  displacement: {
    label: "Refraction",
    group: "Reflection",
    value: 1,
    min: 0,
    max: 3,
    step: 0.05,
    hint: "Multiplies the bend. 1 is what Snell's law gives for the glass's own thickness and index — it used to be an absolute pixel figure, which had to be re-picked whenever anything else changed. Chromium only.",
  },

  // ---- Shadows ----
  shadowStrength: {
    label: "Shadow strength",
    group: "Shadows",
    value: 0.8,
    min: 0,
    max: 1,
    step: 0.02,
  },
  castShadowStrength: {
    // docs/research/shadows.md 5.2 item 1: at 0.6 solid type let 40% of the lamp through.
    label: "Caster opacity",
    group: "Shadows",
    value: 1,
    min: 0,
    max: 1,
    step: 0.02,
    hint: "How much of the lamp's light the type and buttons block -- 1 is solid ink blocking all of it, as type does; lower if the shadows read too heavy. How dark a shadow ends up still follows the lamp's own light there.",
  },
  shadowGap: {
    label: "Content depth",
    group: "Shadows",
    value: 22,
    min: 2,
    max: 80,
    step: 1,
    hint: "How far the content floats above the photograph. Drives the throw.",
  },
  shadowHeight: {
    label: "Light height",
    group: "Shadows",
    value: 300,
    min: 60,
    max: 1200,
    step: 10,
    hint: "Lower means a closer light: longer, softer shadows.",
  },
  windSpeed: {
    label: "Wind",
    group: "Wind",
    value: 8,
    min: 0,
    max: 70,
    step: 1,
    presets: [
      { label: "Calm", value: 0 },
      { label: "Breeze", value: 8 },
      { label: "Windy", value: 20 },
      { label: "Strong", value: 35 },
      { label: "Gale", value: 50 },
      { label: "Storm", value: 70 },
    ],
    hint: "The wind's mean speed along the glass, mph (effects/water/wind). A breeze (about 8) is what the rain types were set in: a little wind always drives some rain at a window. Calm: little rain reaches the glass and the streams run straight down. Windy: streams lean, rain comes in waves, drops shiver. A gale: water runs sideways (or up the glass in an updraft), drops are torn apart and sprayed. Wind-driven rain is never below 30.",
  },
  windDirection: {
    label: "Wind blows toward",
    group: "Wind",
    value: 10,
    min: 0,
    max: 359,
    step: 1,
    presets: [
      { label: "Right", value: 0 },
      { label: "Down-right", value: 35 },
      { label: "Down", value: 90 },
      { label: "Left", value: 180 },
      { label: "Up (updraft)", value: 270 },
    ],
    hint: "Which way the wind blows along the glass, degrees: 0 to the right, 90 down the pane, 180 to the left, 270 up it. Up the glass, the wind pushes small drops up while big ones still slide down and the middling ones hover (the windshield study, Phys. Rev. Fluids 2022).",
  },
  windGusts: {
    label: "Gusts",
    group: "Wind",
    value: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
    hint: "0: a steady wind. 1: very gusty -- gusts up to about twice the mean that rise in a second or two and die over a few (a typical gust lasts under 20 s), lulls where the wind all but drops, turbulence between, and the direction veering in the gusts. A gust sweeps across the pane rather than striking it all at once.",
  },
  windSwing: {
    label: "Direction wanders",
    group: "Wind",
    value: 20,
    min: 0,
    max: 90,
    step: 1,
    hint: "How far the wind's direction wanders either way, degrees, slowly over tens of seconds and more in the gusts. The streams bend to follow it in curves, never corners.",
  },
  windRainFollows: {
    label: "Rain follows the wind",
    group: "Wind",
    value: 1,
    min: 0,
    max: 1,
    step: 0.05,
    hint: "How much the rain reaching the glass follows the wind. A vertical window only catches what the wind drives at it: rain on a wall goes up with the wind's speed (BSD-148), so a calm brings few new drops and a gust a burst of them. 0: the rain type's rate, whatever the wind.",
  },
  windPush: {
    label: "Wind's push on water",
    group: "Wind",
    value: 1,
    min: 0,
    max: 3,
    step: 0.05,
    hint: "How hard the wind pushes water on the glass, against the estimate (1: a 1.5 mm drop is pushed with about 0.35 of its weight in a 20 mph wind, 2.2 times in 50). Small drops are pushed more for their weight than big ones.",
  },
  windLean: {
    label: "Drops lean downwind",
    group: "Wind",
    value: 1,
    min: 0,
    max: 2,
    step: 0.05,
    hint: "Drops pool toward where the wind and gravity push them together: the water gathers on that side and the drop leans and bulges that way, its upwind edge thinning. It springs back partway when the gust passes.",
  },
  windWobble: {
    label: "Drops shiver",
    group: "Wind",
    value: 1,
    min: 0,
    max: 2,
    step: 0.05,
    hint: "Air running over a drop sets its surface shivering, more the harder it blows and the bigger the drop, and its highlights twinkle with it. Drops oscillate before they shed (Milne & Amirfazli).",
  },
  windStrip: {
    label: "Wind tears water off",
    group: "Wind",
    value: 1,
    min: 0,
    max: 2,
    step: 0.05,
    hint: "In a strong wind the air tears water off a big drop's downwind edge and flings it on over the glass as small drops.",
  },
  windShudder: {
    label: "Pane shudders in gusts",
    group: "Wind",
    value: 1,
    min: 0,
    max: 2,
    step: 0.05,
    hint: "A hard gust flexes the glass: every drop close to letting go lets go at once, a sudden cascade of new streams.",
  },
  windSpray: {
    label: "Spray",
    group: "Wind",
    value: 1,
    min: 0,
    max: 2,
    step: 0.05,
    hint: "In a strong wind a raindrop bursts on the glass and the wind carries a fine mist of it on downwind, which beads into tiny droplets where enough gathers.",
  },
  windDrying: {
    label: "Wind dries the glass",
    group: "Wind",
    value: 1,
    min: 0,
    max: 2,
    step: 0.05,
    hint: "Moving air dries the glass faster: thin lines, damp tracks and small droplets go sooner the harder it blows.",
  },
  windFrame: {
    label: "Window frame shelters",
    group: "Wind",
    value: 1,
    min: 0,
    max: 2,
    step: 0.05,
    hint: "The frame the wind comes from shelters a strip of glass behind it (less rain, less wind); against the frame it blows toward, the air turns along it and water is driven into the corner and runs along the frame.",
  },
  fallingRain: {
    label: "Falling rain",
    group: "Wind",
    value: 1,
    min: 0,
    max: 2,
    step: 0.05,
    hint: "The rain falling outside, behind the glass: faint, soft streaks (the camera is focused on the glass), as long as a drop falls in the exposure, slanting and gusting with the wind. 0: off.",
  },
  rainType: {
    label: "Rain type",
    group: "Water",
    value: 2,
    min: 0,
    max: 5,
    step: 1,
    options: [
      "Drizzle",
      "Light rain",
      "Steady rain",
      "Downpour",
      "Wind-driven rain",
      "After the rain",
    ],
    hint: "What kind of rain is on the glass (effects/water/rain-types). Drizzle: a dense mist of tiny droplets, few runners. Downpour: big drops landing often, soon streaming. Wind-driven: the wind at 30 mph or more (the Wind group). After the rain: nothing new lands; what is left beads, runs a little and dries.",
  },
  rainStrength: {
    label: "Rain",
    group: "Water",
    value: 1,
    min: 0,
    max: 4,
    step: 0.05,
    hint: "How hard the chosen rain type falls, times its usual rate (0: none). Drops bead where they land, merge, and run once they are heavy enough to overcome the glass's grip (about 9 uL for water on a window).",
  },
  dropSceneDepth: {
    label: "Scene depth in drops",
    group: "Water",
    value: 20,
    min: 1,
    max: 80,
    step: 1,
    hint: "How far behind the glass the scene each drop images is, times the print's gap. 1: the photograph is a print just behind the glass, so a drop magnifies the patch under it and looks like a flat window. Higher: the photograph is the world outside, metres away, as in a real rainy window -- each drop shrinks and turns over a wide view of it, with its lights and darks, so it reads as a round lens. Only the drops' optics use it; the shadows and the floor light keep the print where it is.",
  },
  dropSkyAbove: {
    label: "Light above the window",
    group: "Water",
    value: 1.1,
    min: 0,
    max: 2,
    step: 0.05,
    hint: "How bright the sky or ceiling above the scene is, as the drops see it. A drop is a lens that turns the world upside down: its lower half looks steeply up, past the top of the photograph, at the light above. That is the bright crescent low in every drop on a dark window (measured on Ony's rain clips C and E: inside a drop is about 2.8 times the dark glass round it, its brightest spot 5-6 times). 0: nothing above, the drops show only the photograph.",
  },
  rainPhysics: {
    label: "Water physics",
    group: "Water",
    value: 0,
    min: 0,
    max: 1,
    step: 1,
    options: ["Rules (drops and drawn streams)", "Fluid (beta: the water simulated)"],
    hint: "Rules: each drop is a particle and streams, trails and merges are drawn by rules. Fluid: the water on the glass is simulated as a fluid -- a height field moved by gravity, surface tension, the glass's wetting and grip, drag and the wind -- so drops hold, grow, let go, run, merge, leave trails and bead up by themselves. Needs a GPU that renders float textures; heavier.",
  },
  rainPhysicsCell: {
    label: "Fluid grid",
    group: "Water",
    value: 0.4,
    min: 0.25,
    max: 0.8,
    step: 0.05,
    hint: "The fluid's cell size, mm (Water physics: Fluid). Finer resolves small drops and thin trails better and costs far more (cells times the steps they need: about cell^-3.5). Applies to a fresh start (Reset in the dev tools, or reload).",
  },
  rainPhysicsGrip: {
    label: "Glass grip",
    group: "Water",
    value: 120000,
    min: 20000,
    max: 300000,
    step: 5000,
    hint: "How hard the glass holds the water's edge (Water physics: Fluid), as a static friction, mm/s^2. At 120000 drops up to about 6 uL hold and 10 uL and up let go -- water on a window. Lower: cleaner, slipperier glass; higher: dirtier.",
  },
  rainPhysicsWind: {
    label: "Fluid wind push",
    group: "Water",
    value: 400,
    min: 0,
    max: 3000,
    step: 50,
    hint: "The wind's push on the water for the rain type's wind (Water physics: Fluid), Pa: the air's drag on what stands up off the glass, pushing the water sideways -- thin water most, as a force per depth.",
  },
  rainPhysicsSteps: {
    label: "Fluid steps a frame",
    group: "Water",
    value: 300,
    min: 20,
    max: 1000,
    step: 10,
    hint: "The most substeps the fluid takes a frame. If a frame needs more (a slow GPU), the water runs in slow motion rather than going unstable.",
  },
  rainStreamDrain: {
    label: "Stream drains in",
    group: "Water",
    value: 5,
    min: 1,
    max: 60,
    step: 0.5,
    hint: "Seconds a stream's standing water takes to drain away once its head has passed. A stream is water on the move: the head runs, the wake behind it drains down into it so the tail thins and recedes, and a few seconds after the head stops the stream is gone, leaving a damp line and the beads it shed. Ony's clip E: a stream shows for about 1.3 s at the head, the drained line a few seconds more. Long: the windows of the photo catalogue, that keep their recent streams as lines.",
  },
  rainBeading: {
    label: "Beading",
    group: "Water",
    value: 70,
    min: 30,
    max: 120,
    step: 5,
    hint: "How strongly the glass beads the rain: water's resting contact angle, degrees. Clean glass 30-50, a weathered window 60-90, a rain-repellent coating over 100. A taller bead is a stronger lens -- what is under it (the words printed on the glass, the scene behind) is magnified by about 10% at 50 and by a third at 90 -- and it holds on harder before it runs (Ony, 2026-10-03: the drops on the words must magnify them).",
  },
  trailLines: {
    label: "Streams leaving a water line",
    group: "Water",
    value: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
    hint: "Of the drops that run, the share that leave a clear, continuous line of water behind them, which stands on the glass and slowly dries, pinching into beads as it thins.",
  },
  trailDots: {
    label: "Others leaving a dotted trail",
    group: "Water",
    value: 0.58,
    min: 0,
    max: 1,
    step: 0.05,
    hint: "Of the runners that do not leave a line, the share that leave a dotted line of little beads; the rest leave next to nothing.",
  },
  rainFace: {
    label: "Rain lands on",
    group: "Water",
    value: 0,
    min: 0,
    max: 2,
    step: 1,
    options: [
      "Your side, on the words (wet glass goes clear)",
      "The polished face (over the frost)",
      "The outside, as on a window",
    ],
    hint: "Which face of the frosted glass the rain is on. Etched: the water fills the etch and that spot goes clear, so every drop is a lens onto the sharp photograph and every wet track a clear streak, as frosted glass does in the rain. With the copy on the glass the etched face is the outer one, where the words and buttons are printed: every drop sits on them, magnifies and bends them, and clears the etch under it (Ony, 2026-10-03). Polished: the drop sits on smooth glass over the frost. The outside: the rain is on the far face, as on a window seen from indoors -- every drop and stream seen through the glass, with the dark outline real window rain has (light inside the water turning back at its edge), the words sharp on the near face in front of it, not magnified (Ony, 2026-10-09: keep the inside, develop the outside too).",
  },
  dropletScale: {
    label: "Droplets",
    group: "Water",
    value: 1,
    min: 0,
    max: 4,
    step: 0.05,
    hint: "The tiny droplets (0.1-0.6 mm) settling between the rain drops, times what the rain type brings: the fine spray and drizzle that fill a rainy window. A running drop sweeps them away and leaves a clean track; they evaporate slowly.",
  },
  fogAmount: {
    label: "Condensation",
    group: "Water",
    value: 0,
    min: 0,
    max: 1,
    step: 0.05,
    hint: "Steam condensing on the glass: a fog of droplets too small to see one by one, which scatters light and veils the photograph. It builds up over about half a minute to this density. Separate from the rain, but the two meet: see Condensation side.",
  },
  fogSide: {
    label: "Condensation side",
    group: "Water",
    value: 0,
    min: 0,
    max: 1,
    step: 1,
    options: ["Same side as the rain (drops wipe it)", "The other side (it veils the rain)"],
    hint: "Which face the steam condenses on. Same side: every drop and runner wipes the fog away and leaves a clear track, as on a steamed bathroom mirror. The other side: the fog is between you and the rain, so the drops are seen softly through it.",
  },
  balloonCount: {
    label: "Balloons",
    group: "Water",
    value: 7,
    min: 0,
    max: 20,
    step: 1,
    hint: "How many party balloons float in the room (?try=balloons; a reload brings them back).",
  },
  balloonFill: {
    label: "Balloons filled with",
    group: "Water",
    value: 0,
    min: 0,
    max: 1,
    step: 1,
    options: ["Helium (they rise)", "Air (they fall)"],
    hint: "Helium gives an 11-inch balloon about 9 g of lift, so it rises at about 2 m/s; air makes it a little heavier than the air it displaces, so it sinks at about 1.3 m/s.",
  },
  balloonFinish: {
    label: "Balloon latex",
    group: "Water",
    value: 0,
    min: 0,
    max: 3,
    step: 1,
    options: ["Mixed", "Fashion (opaque)", "Crystal (see-through)", "Neon (glows under UV)"],
  },
  dropperDrop: {
    label: "Dropper drop",
    group: "Water",
    value: 6,
    min: 0.5,
    max: 40,
    step: 0.5,
    hint: "How much water each drop from the eye dropper is, in microlitres (a raindrop is about 1; a drop from a real pipette about 30-50). Water on a window lets go at about 9 uL, so a few drops in one place gather the weight to run. The cursor holds the dropper from Cursor > What the cursor holds, or the tray with Rain on the glass on.",
  },
  dropperRate: {
    label: "Dropper drips",
    group: "Water",
    value: 6,
    min: 1,
    max: 30,
    step: 1,
    hint: "Drops a second while the button is held (Ony: holding it just keeps dropping more drops).",
  },
  sprayLiquid: {
    label: "Spray bottle holds",
    group: "Water",
    value: 0,
    min: 0,
    max: 2,
    step: 1,
    options: ["Water", "Blood", "Slime (green)"],
    hint: "What the spray bottle sprays (the bottle in the tool tray, with Rain on the glass on). Water and blood spray as a fine cone that mists the glass and beads where enough gathers; slime is too thick to atomise and comes out as gobs.",
  },
  roomFill: {
    label: "Room fill",
    group: "Shadows",
    value: 0.25,
    min: 0,
    max: 1,
    step: 0.01,
    hint: "How much of the room's own light reaches the photographs while a lamp burns. 1 is the page as it is; low is a dark room, where the lamp's pool and its shadows are all you see (a dark room is about 0.05-0.1).",
    presets: [
      { label: "Page", value: 1 },
      { label: "Dim room", value: 0.4 },
      { label: "Dark room", value: 0.08 },
    ],
  },
  shadowSoftness: {
    label: "Light size",
    group: "Shadows",
    value: 46,
    min: 1,
    max: 200,
    step: 1,
    hint: "The emitter's radius. This is what sets the penumbra. Point (4 px, about a 1 mm filament or LED die) throws crisp, hard-edged shadows; Bulb is today's lamp; Diffuser is a softbox.",
    // docs/research/shadows.md 6 "Build for task 83": Point R = 4 px.
    presets: [
      { label: "Point", value: 4 },
      { label: "Bulb", value: 46 },
      { label: "Diffuser", value: 120 },
    ],
  },

  floorView: {
    label: "Bend under glass",
    group: "Shadows",
    value: 1,
    min: 0,
    max: 3,
    step: 0.05,
    hint: "How hard the glass bends the light and shadow you see through it, at its top and bottom edges.",
  },
  // A broken pane's surface displacement: how far its pieces stand proud or sink (effects/optics/shard-tilt pieceLift).
  pieceDisplacement: {
    label: "Piece displacement",
    group: "Glass",
    value: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
    hint: "How unevenly a broken pane's pieces sit: 0 flush, 1 each piece up to 15% of the thickness proud or sunk (a step between two pieces up to 30%). Loose pieces near the strike move most; a laminated pane's interlayer holds its pieces nearly flush. Each step shows as the lamp's shadow line on the lower piece and a lit riser seen from the low side.",
  },
  // Whether the page's copy is printed on the glass itself or stands off it (Ony, 2026-10-02).
  typeOnGlass: {
    label: "Type on the glass",
    group: "Glass",
    value: 1,
    min: 0,
    max: 1,
    step: 1,
    hint: "1: the copy is printed on the glass's near face -- one shadow, the lamp's through the glass onto the photograph. Rain on the polished (near) face then sits on the letters and magnifies them, showing the frosted photograph behind; rain on the etched face stays a sharp lens onto the photograph, with the letters flat in front of it (\"Rain lands on\"). 0: the copy floats off the glass by a share of the content depth, with its own shadow on the glass as well.",
  },
  // How thick the site's glass is, CSS px: how deep its side faces are.
  glassThickness: {
    label: "Glass thickness",
    group: "Shadows",
    value: 18,
    min: 4,
    max: 96,
    step: 1,
    hint: "How thick the panes are. Thicker glass shows wider side faces at the same angle, bends more at the bevel and throws a deeper green through its sides. 18 is about 5 mm.",
  },
  floorGap: {
    label: "Glass height",
    group: "Shadows",
    value: 70,
    min: 0,
    max: 240,
    step: 2,
    hint: "How far the glass stands off the photograph behind it. The further, the further its shadow and caustics fall from the pane.",
  },
  floorLight: {
    label: "Light through glass",
    group: "Shadows",
    // Clear float glass passes about 90% of the light (the reflection off its
    // faces is worked out separately, in the shader). This was 0.35, which
    // made clear glass lose two thirds of the light, and the light through it
    // faded out a short way from the lamp.
    value: 0.9,
    min: 0,
    max: 1,
    step: 0.01,
    hint: "How much of the light lands on the photographs behind the glass.",
  },
  floorShadow: {
    label: "Glass shadow",
    group: "Shadows",
    // Under the bevel the light is turned away, not dimmed: the shade there is
    // everything the lamp would have put down. The film curve in the floor
    // shader rolls it off toward black, so it never goes solid.
    value: 1,
    min: 0,
    max: 1,
    step: 0.01,
    hint: "How dark the glass's own shadow goes where its bevel throws the light away.",
  },
  floorCaustics: {
    label: "Glass waviness",
    group: "Shadows",
    value: 0,
    min: 0,
    max: 3,
    step: 0.05,
    hint: "0 is flat sheet glass, which throws no pattern. Raise it for rolled or hammered glass: the waviness focuses the light into the net of lines on the floor of a pool.",
  },
  floorPrism: {
    label: "Edge rainbow",
    group: "Shadows",
    value: 1,
    min: 0,
    max: 3,
    step: 0.05,
    hint: "The bevel is a prism: the bright line it throws splits into colours, red furthest out and blue furthest in.",
  },

  // ---- Cursor ----
  ringSize: {
    label: "Ring",
    group: "Cursor",
    value: 30,
    min: 8,
    max: 80,
    step: 1,
    cssVar: "--tune-ring",
    cssUnit: "px",
  },
  cursorTool: {
    label: "What the cursor holds",
    group: "Cursor",
    value: 0,
    min: 0,
    max: 7,
    step: 1,
    options: [
      "Lamp",
      "Black light (UV)",
      "Road flare",
      "Flashlight",
      "Magnifying glass",
      "Laser pointer",
      "Spray bottle",
      "Eye dropper",
    ],
    hint: "What every visitor's cursor is: the lamp, a black light (only UV: things fluoresce), a burning road flare, a flashlight (press and hold to plant and aim it), an illuminated magnifying glass, a laser pointer, the spray bottle, or an eye dropper (press to let a drop fall on the glass, hold to keep them coming; needs Rain on the glass on). Saved for everyone with the rest.",
  },
  /*
   * The laser pointer (Ony, 2026-10-01: "We need to be able to change what
   * kind of laser it is- like its color and output and maybe beam size. but
   * also make the beam reach further ... the tiniest particles passing
   * through the laser ... a sort of flicker ... not at the parts of the laser
   * that are inside the glass", and "bounce off the inside left and right
   * sides of the glass"). components/site/LaserBeam.
   */
  laserColour: {
    label: "Laser colour",
    group: "Cursor",
    value: 0,
    min: 0,
    max: 6,
    step: 1,
    options: [
      "Red (650 nm)",
      "Orange-red (635 nm)",
      "Yellow (589 nm)",
      "Green (532 nm)",
      "Blue (450 nm)",
      "Violet (405 nm)",
      "White (every colour)",
    ],
    hint: "The laser's wavelength, as real pointers come. The glass bends each colour by its own amount (violet most), and float glass's iron soaks up red over a long path, so a green beam carries further inside a pane. White is every colour at once: a prism fans it into a spectrum.",
  },
  laserPower: {
    label: "Laser output",
    group: "Cursor",
    value: 5,
    min: 1,
    max: 500,
    step: 1,
    hint: "Its power in milliwatts: 1-5 a pointer, 50-100 a burning-bright one, 500 a show laser. More power, a brighter beam, brighter spots where it strikes, and more light thrown on the glass round them.",
  },
  laserWidth: {
    label: "Laser beam width",
    group: "Cursor",
    value: 1.2,
    min: 0.5,
    max: 8,
    step: 0.1,
    hint: "How wide the beam is drawn, px; its glow is four times as wide.",
  },
  laserReach: {
    label: "Laser reach",
    group: "Cursor",
    value: 9000,
    min: 1000,
    max: 30000,
    step: 500,
    hint: "How far the beam is followed, px of path, and so how many bounces it gets before it is let go.",
  },
  laserDust: {
    label: "Dust in the beam",
    group: "Cursor",
    value: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
    hint: "Specks drifting through the beam in the air, each catching it for a moment as it crosses: the flicker you see along a real laser. None inside the glass. 0 is clean air.",
  },
  laserMirrorEnds: {
    label: "Laser bounces off the panes' ends",
    group: "Cursor",
    value: 1,
    min: 0,
    max: 1,
    step: 1,
    options: ["No: it leaves through them", "Yes: they are mirrored"],
    hint: "A beam meeting a pane's left or right end head-on would simply leave through it. With the ends mirrored (as a light guide's ends are silvered), it bounces back along the glass instead.",
  },
  ringWidth: {
    label: "Ring line width",
    group: "Cursor",
    value: 1,
    min: 0.5,
    max: 4,
    step: 0.25,
    cssVar: "--tune-ring-width",
    cssUnit: "px",
    hint: "How thick the cursor's ring is drawn.",
  },
  ringOpacity: {
    label: "Ring brightness",
    group: "Cursor",
    value: 1,
    min: 0.1,
    max: 1,
    step: 0.05,
    cssVar: "--tune-ring-alpha",
    hint: "How solid the ring's white line is: 1 solid, lower more see-through.",
  },
  dotOpacity: {
    label: "Dot brightness",
    group: "Cursor",
    value: 1,
    min: 0,
    max: 1,
    step: 0.05,
    cssVar: "--tune-dot-alpha",
    hint: "How solid the centre dot is: 0 hides it.",
  },
  dotSize: {
    label: "Dot",
    group: "Cursor",
    value: 6,
    min: 1,
    max: 20,
    step: 1,
    cssVar: "--tune-dot",
    cssUnit: "px",
  },
  ringEase: {
    label: "Ring follow",
    group: "Cursor",
    value: 0.16,
    min: 0.05,
    max: 1,
    step: 0.01,
    hint: "Per-frame fraction of the remaining distance. Lower trails more. 0.16 settles in about 0.29s — roughly twice the reference's lag, which is deliberate.",
  },

  // ---- What the flash leaves on the retina ----
  transmit: {
    label: "Light through the glass",
    group: "Glass",
    value: 0.34,
    min: 0,
    max: 1.2,
    step: 0.02,
    cssVar: "--tune-transmit",
    hint: "How much of the light makes it through the pane onto what is behind it, mottled by the same marks you can see on the face.",
  },
  transmitReach: {
    label: "Transmitted spread",
    group: "Glass",
    value: 640,
    min: 160,
    max: 1600,
    step: 20,
    cssVar: "--tune-transmit-reach",
    cssUnit: "px",
  },
  transmitCore: {
    label: "Caustic core",
    group: "Glass",
    value: 210,
    min: 40,
    max: 700,
    step: 10,
    cssVar: "--tune-transmit-core",
    cssUnit: "px",
    hint: "The bright middle where the bevel gathered the light instead of spreading it — the line a glass of water throws inside its own shadow.",
  },

  paperGloss: {
    label: "Paper specular",
    group: "Glass",
    value: 0.95,
    min: 0,
    max: 1,
    step: 0.02,
    cssVar: "--tune-paper",
    hint: "The hard highlight a glossy print throws. Near-white and close to blown out at the centre — this is a mirror image of the source, not a tint.",
  },
  paperCore: {
    label: "Paper specular size",
    group: "Glass",
    value: 26,
    min: 8,
    max: 260,
    step: 2,
    cssVar: "--tune-paper-core",
    cssUnit: "px",
    hint: "How big the hard highlight is. A glossy coating is a smooth dielectric, so this is small and sharp — nearly as tight as the pane's own specular.",
  },
  paperSheen: {
    label: "Paper sheen",
    group: "Glass",
    value: 0.16,
    min: 0,
    max: 0.5,
    step: 0.01,
    cssVar: "--tune-paper-sheen",
    hint: "The faint wide wash around the highlight, off the emulsion under the coating. This is the part that should be dull, and it should be weak.",
  },
  paperReach: {
    label: "Paper sheen spread",
    group: "Glass",
    value: 340,
    min: 80,
    max: 900,
    step: 10,
    cssVar: "--tune-paper-reach",
    cssUnit: "px",
    hint: "How far the faint wash carries. Only the sheen uses this; the hard highlight has its own size.",
  },
  paperRoom: {
    label: "Paper reflection",
    group: "Glass",
    value: 0.45,
    min: 0,
    max: 0.5,
    step: 0.01,
    cssVar: "--tune-paper-room",
    hint: "How much of the room a print catches. Far less than the pane, and offset from it, because it sits a little nearer the eye.",
  },

  grimeFloor: {
    label: "Grime clarity",
    group: "Glass",
    value: 0.34,
    min: 0,
    max: 0.9,
    step: 0.01,
    hint: "Everything in the surface map below this is cleaned off entirely. Higher is clearer glass with fewer, more distinct marks — it removes marks rather than dimming them.",
  },

  afterStrength: {
    label: "Afterimage",
    group: "Afterimage",
    value: 1,
    min: 0,
    max: 2.5,
    step: 0.05,
    cssVar: "--tune-after",
    hint: "Scales both ghosts together. 0 turns them off and leaves the veil.",
  },
  afterDwell: {
    label: "Afterimage dwell",
    group: "Afterimage",
    value: 6.4,
    min: 0.8,
    max: 14,
    step: 0.1,
    cssVar: "--tune-after-dwell",
    cssUnit: "s",
    hint: "How long the negative takes to fade. The decay stays exponential — this stretches the whole curve.",
  },
  afterVeil: {
    label: "Vision washout",
    group: "Afterimage",
    value: 0.34,
    min: 0,
    max: 0.85,
    step: 0.01,
    cssVar: "--tune-after-veil",
    hint: "Peak veiling luminance at the point of discharge. This is contrast loss, not a second flash.",
  },
};

/*
 * ---- Results, not causes (optics plan step 7) ----
 *
 * The rule Ony set: he sets CAUSES -- the light, the glass, its shape and
 * surface, where it sits, the room, the camera -- and physics sets the
 * EFFECTS. A knob for an effect lets the picture disagree with itself: turn
 * up "Fresnel" and the face reflects more than its own index of refraction
 * says it can, while every other term still uses the index.
 *
 * These are those knobs. Each is now a model constant, calibrated and
 * locked: it keeps the value it has here, it has no control in /lab, and a
 * value saved in the browser from before cannot override it. The values are
 * the ones the site already looked right with, so nothing on the page moves.
 * Where the cause that should set it does not exist yet (paper matteness,
 * lens quality), the result waits for that cause rather than keeping a
 * slider in the meantime.
 *
 * Each entry says what it follows from.
 */
export const RESULTS: Readonly<Record<string, string>> = {
  restEdge:
    "the edge's brightness at rest: the room it reflects, through Fresnel at the glass's IOR",
  glassRefraction: "how far the liquid glass bends: its IOR and thickness",
  glassEdgeBlur: "the softness of the bend at the rim: the edge profile",
  glassSpecular: "the gloss: Fresnel at the glass's IOR, and its frost",
  glassDistortion: "surface roughness beyond the frost: the glass's waviness",
  glassFresnel: "the reflectance: the glass's IOR",
  glassEdge: "the rim highlight: the lamp and the edge profile",
  glassSaturation: "the colour through the glass: its tint and absorption",
  glassSpecTight: "the highlight's size: the lamp's size and the frost",
  glassLightX: "where the highlight sits: the lamp's position",
  glassLightY: "where the highlight sits: the lamp's position",
  glassOpacity: "how much of the scene shows through: the glass is clear",
  glassShadow: "the shadow's darkness: the light and the gap",
  glassShadowSpread: "the shadow's softness: the light's size and the gap",
  glassShadowY: "the shadow's offset: the light's position and the gap",
  glassBrightness: "the pane's brightness: the room and the light",
  displacement: "the refraction of the CSS glass: IOR and thickness",
  shadowStrength: "the content's shadow: the light and the content's depth",
  floorView: "the bend of the floor seen through the glass: IOR, thickness and gap",
  floorLight: "the light through the glass: the lamp's power and the absorption",
  floorShadow: "the glass's shadow: its edge profile and absorption",
  floorPrism: "the rainbow at the shadow's edge: the dispersion",
  transmit: "the CSS pool of light through the glass: the lamp and the absorption",
  transmitReach: "that pool's spread: the lamp's height and size",
  transmitCore: "that pool's caustic core: the edge profile and the lamp",
  paperGloss: "the paper's specular: its matteness (off)",
  paperCore: "the paper's specular size: its matteness",
  paperSheen: "the paper's sheen: its matteness",
  paperReach: "the paper's sheen spread: its matteness and the lamp's height",
  paperRoom: "the paper's reflection of the room: its matteness",
  grimeFloor: "how clear the unmarked glass is: the smudge and scratch amounts",
};

/** Whether a knob is a result: locked, with no control. */
export const isResult = (key: string): boolean => Object.hasOwn(RESULTS, key);

/*
 * ---- Two sets of values, one per glass mode ----
 *
 * WHY
 *
 * Most of this panel is NOT mode-specific in the sense of being dead in one
 * mode -- the light pass, the cast shadows, the reflection and the pane's own
 * CSS surface all run whichever glass is in front of them. But they do not
 * want the SAME numbers in both. A sheen that sits right on a backdrop-filter
 * pane is wrong over a refracting one, because the two surfaces return light
 * differently; tuning one used to silently detune the other, and the only
 * symptom was coming back later to find the other mode looked worse than you
 * left it.
 *
 * So those knobs keep a value per mode. Switching the glass swaps the whole
 * set over, live.
 *
 * HOW, AND WHY IT IS DONE THIS WAY
 *
 * `knob.value` stays a single number and stays the live one. Every reader --
 * `t()` in four rAF loops, `applyTuning`, `applyGlassConfig` -- is unchanged
 * and cannot get this wrong. The inactive mode's numbers sit in `stash` and
 * are swapped in on the mode change. The alternative, making `value` a pair,
 * would have put a mode lookup inside loops that run sixty times a second and
 * would have touched every call site to save nothing.
 */

/**
 * The groups whose knobs are live in both systems, and so are kept twice.
 *
 * Not Cursor or Afterimage: the pointer and the flash are in front of the
 * glass rather than part of it, and doubling them would only create two
 * places to set one number. Not Liquid glass either -- those are dead in CSS
 * mode, which is a different thing and is marked with `modes` instead.
 */
const PER_MODE_GROUPS = new Set(["Glass", "Light", "Reflection", "Shadows"]);

export function isPerMode(knob: Knob): boolean {
  return PER_MODE_GROUPS.has(knob.group);
}

let activeMode: TuningMode = "css";
const stash: Record<TuningMode, Record<string, number>> = { css: {}, raster: {} };

export type TuningMode = "css" | "raster";

/** Which set is currently loaded into `knob.value`. */
export function tuningMode(): TuningMode {
  return activeMode;
}

/** A knob's value in a given mode, whether or not that mode is loaded. */
export function valueIn(key: string, mode: TuningMode): number {
  const knob = tuning[key];
  if (!knob) return 0;
  if (mode === activeMode || !isPerMode(knob)) return knob.value;
  return stash[mode][key] ?? knob.value;
}

/** Set a knob's value in a given mode, loaded or not. */
export function setValueIn(key: string, mode: TuningMode, value: number) {
  const knob = tuning[key];
  // A result is locked: nothing sets it, including a value saved before.
  if (!knob || isResult(key)) return;
  if (mode === activeMode || !isPerMode(knob)) {
    knob.value = value;
    applyTuning();
    return;
  }
  stash[mode][key] = value;
}

/**
 * Load a mode's set.
 *
 * An unset mode inherits what is on screen rather than snapping to the
 * defaults. The first switch therefore copies the current tuning across,
 * which is the only sane starting point for a comparison -- landing in the
 * other mode with every number reset would make the two incomparable at
 * exactly the moment you went to compare them.
 */
export function switchTuningMode(mode: TuningMode) {
  if (mode === activeMode) return;
  for (const [key, knob] of Object.entries(tuning)) {
    if (!isPerMode(knob)) continue;
    stash[activeMode][key] = knob.value;
    knob.value = stash[mode][key] ?? knob.value;
  }
  activeMode = mode;
  applyTuning();
}

/**
 * Both sets, for persisting -- only the knobs that differ from the source.
 *
 * It used to write every knob. So a value nobody had touched was saved
 * too, and when a default changed in the source the browser kept the old
 * one: Room brightness went back to 1 in the source and stayed 0 for anyone
 * who had moved any other slider while it was 0. Now only what was moved is
 * remembered, and everything else follows the source.
 */
export function tuningSnapshot(): Record<TuningMode, Record<string, number>> {
  const css: Record<string, number> = {};
  const raster: Record<string, number> = {};
  for (const key of Object.keys(tuning)) {
    if (isResult(key)) continue;
    const base = TUNING_DEFAULTS[key];
    const c = valueIn(key, "css");
    const r = valueIn(key, "raster");
    if (c !== base) css[key] = c;
    if (r !== base) raster[key] = r;
  }
  return { css, raster };
}

/**
 * Defaults a knob has had before, for stores written when the whole set was
 * saved: a saved value equal to one of these was never moved -- it was the
 * source's value at the time -- so the source's value now wins.
 */
const PAST_DEFAULTS: Readonly<Record<string, readonly number[]>> = {
  // 0 from cae9b1c (the dark room) until 6382a63 put the room's light back.
  roomBrightness: [0],
};

/** Whether a saved value is only an old default, not something anyone chose. */
export function isStaleDefault(key: string, value: number): boolean {
  return PAST_DEFAULTS[key]?.includes(value) ?? false;
}

/** Restore both sets. */
export function restoreTuning(saved: Partial<Record<TuningMode, Record<string, number>>>) {
  for (const mode of ["css", "raster"] as const) {
    for (const [key, value] of Object.entries(saved[mode] ?? {})) {
      if (typeof value !== "number" || isStaleDefault(key, value)) continue;
      setValueIn(key, mode, value);
    }
  }
  applyTuning();
}

if (typeof window !== "undefined") {
  activeMode = getGlassMode();
  onGlassMode(switchTuningMode);
}

/** Where the lab keeps what you tuned. */
export const TUNING_STORE = "onysnow:tuning";

/**
 * Load what the lab saved and apply it.
 *
 * WHY THIS IS NOT ONLY THE LAB'S JOB
 *
 * It used to be. `lab.tsx` read localStorage, called `applyTuning`, and
 * nothing else on the site ever did -- so every number tuned in the lab was
 * written down and then read back only by the lab. The preview there looked
 * exactly right and the actual site ignored all of it, which is indis-
 * tinguishable from the sliders not working. Reported as "none of the
 * properties I set have any effect", and correct.
 *
 * Tolerant of every shape the store has had: the flat map written before the
 * per-mode sets existed, and the { css, raster } pair written since.
 */
export function loadSavedTuning() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(TUNING_STORE);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed["v"] === SAVED_TUNING_VERSION) {
      restoreTuning(parsed as Parameters<typeof restoreTuning>[0]);
    } else {
      /*
       * Written before 2026-09-28, when the lab saved EVERY knob, touched or
       * not. Such a store pins each knob to whatever the source said on the
       * day it was written, so every default improved since (the edges'
       * calibration, the room's light) never reached that browser: the site
       * looked different there than everywhere else and nothing said why.
       * It is set aside, not applied -- kept under a backup key, so nothing
       * tuned is lost -- and the source's values stand.
       */
      window.localStorage.setItem(`${TUNING_STORE}:before-2026-09-28`, raw);
      window.localStorage.removeItem(TUNING_STORE);
    }
  } catch {
    // A blocked or corrupt store is not a reason to fail to render the site.
  }
  applyTuning();
}

/**
 * The site's published tuning: the site_settings row the lab writes, which
 * every visitor's browser applies (components/site/CustomCss). What Ony sets
 * in /lab is how the site looks for everyone.
 */
export const SITE_TUNING_KEY = "effect_tuning";

/**
 * Apply the published tuning: back to the source's values, then the knobs
 * the lab moved. An empty or unreadable value leaves the source's values.
 */
export function applySiteTuning(raw: string | undefined | null) {
  resetTuning(TUNING_DEFAULTS);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed["v"] === SAVED_TUNING_VERSION) {
        restoreTuning(parsed as Parameters<typeof restoreTuning>[0]);
      }
    } catch {
      // A malformed row is not a reason to fail to render the site.
    }
  }
  applyTuning();
}

/** The shape the lab saves now: only the knobs that were moved. */
export const SAVED_TUNING_VERSION = 2;

/** What the lab writes to TUNING_STORE. */
export function savedTuning(): string {
  return JSON.stringify({ v: SAVED_TUNING_VERSION, ...tuningSnapshot() });
}

/** Shorthand for the loops: `t("grimeRake")`. Light values are read from the lights, not here. */
export const t = (key: keyof typeof tuning | string): number => tuning[key]?.value ?? 0;

const appliedListeners = new Set<() => void>();

/**
 * Called after every change is applied.
 *
 * For the few things that cannot read a knob inside a loop -- the CSS bevel
 * map is built once per pane geometry, so a new edge width has to ask for a
 * new one.
 */
export function onTuningApplied(fn: () => void): () => void {
  appliedListeners.add(fn);
  return () => appliedListeners.delete(fn);
}

/** Mirrors the CSS-side knobs onto the document element. */
export function applyTuning() {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  for (const knob of Object.values(tuning)) {
    if (!knob.cssVar) continue;
    root.setProperty(knob.cssVar, `${knob.value}${knob.cssUnit ?? ""}`);
  }
  applyGlassConfig();
  for (const fn of appliedListeners) fn();
}

// Development only: set a knob from a test rig or the console, as the lab would.
if ((process.env.NODE_ENV !== "production") && typeof window !== "undefined") {
  (window as unknown as { __setKnob?: unknown }).__setKnob = (key: string, value: number) => {
    const knob = tuning[key];
    if (!knob) return false;
    knob.value = value;
    applyTuning();
    return true;
  };
}

/*
 * The liquid glass's `data-config` is written by its adapter
 * (effects/adapters/liquid-config), which reads the pane's causes and the
 * lights as well as these knobs. It registers itself here, so applying the
 * knobs reaches it without this module depending on the lights.
 */
let glassConfigWriter: () => void = () => {};

export function setGlassConfigWriter(fn: () => void) {
  // Registered only: writing now, while the page may still be hydrating,
  // would put attributes on the panes React did not render.
  glassConfigWriter = fn;
}

/** Write every pane's liquid glass config (through the adapter, once it is loaded). */
export function applyGlassConfig() {
  glassConfigWriter();
}

/** The current settings, as something you can paste back to be baked in. */
export function serializeTuning() {
  const byGroup: Record<string, string[]> = {};
  for (const [key, knob] of Object.entries(tuning)) {
    if (isResult(key)) continue;
    // Both sets for anything kept twice, so pasting this back does not
    // silently bake one mode's numbers into the other.
    const line = isPerMode(knob)
      ? `  ${key}: ${valueIn(key, "css")}, // raster: ${valueIn(key, "raster")}`
      : `  ${key}: ${knob.value},`;
    (byGroup[knob.group] ??= []).push(line);
  }
  return Object.entries(byGroup)
    .map(([group, lines]) => `// ${group}\n${lines.join("\n")}`)
    .join("\n\n");
}

export function resetTuning(defaults: Record<string, number>) {
  for (const [key, value] of Object.entries(defaults)) {
    if (tuning[key]) tuning[key]!.value = value;
  }
  // Both sets, or reset would leave the other mode holding whatever it had
  // and the next switch would bring it straight back.
  stash.css = {};
  stash.raster = {};
  applyTuning();
}

/** Captured at module load, so Reset always has somewhere to go back to. */
export const TUNING_DEFAULTS: Record<string, number> = Object.fromEntries(
  Object.entries(tuning).map(([k, v]) => [k, v.value]),
);
