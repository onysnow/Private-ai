/**
 * Fragment shader for the cursor light and its lens flare.
 *
 * Written against real optics rather than approximated with gradients, because
 * gradients cannot do the one thing that matters here. A CSS gradient
 * composites in SDR: nothing can be brighter than white, so a "blown" core has
 * to be hand-authored as a white stop and it reads as a white disc sitting in
 * an orange smear. In a renderer the core clips to white BECAUSE the intensity
 * exceeds 1.0 and the tonemap crushes everything above it — the white is an
 * outcome, not a colour choice.
 *
 * This draws the whole viewport, not a quad following the cursor. It has to:
 * a lens flare is not a property of the light, it is a property of the LENS,
 * and its ghosts march along the axis from the source through the centre of
 * the frame and out the other side. Confined to a box around the cursor there
 * is nowhere for them to go — and the box itself was visible wherever the
 * falloff crossed its edge.
 *
 * The aperture uses the N-blade signed-distance formulation: work in polar
 * coordinates, fold the angle into one blade sector, and measure distance
 * along the blade's flat edge. Mixing that distance back toward the plain
 * radius bends the blades, which is what real ones do as they open.
 */
export const LIGHT_FRAGMENT_SHADER = /* glsl */ `precision highp float;

uniform vec2  uViewport;   // device pixels
uniform float uScale;      // device pixels per CSS pixel
uniform vec2  uLight;      // CSS pixels, viewport-relative
uniform float uCharge;     // 0 to 1, how wound the shutter is
uniform float uClosed;     // 0 to 1, how far the iris has stopped down
uniform float uTime;
uniform float uGain;       // tunable: how far emission exceeds white
uniform float uFalloff;    // tunable: core tightness
uniform float uAperture;   // tunable: hexagon radius
uniform float uSpread;     // tunable: size at zero charge relative to full
uniform float uGhostGain;  // tunable
uniform float uHaloGain;   // tunable
// The lens's make-up (2k; effects/camera). At their defaults the flare is
// exactly what it was before they existed.
uniform float uGhostCount;   // reflections that reach the sensor (7)
uniform float uGhostSpacing; // along the axis (0.34)
uniform float uGhostSize;    // (1)
uniform float uGhostShape;   // -1 crisp polygon .. 1 disc (0)
uniform float uGhostBokeh;   // 0 hollow, rim-bright .. 1 soft filled disc (0)
uniform float uBlades;       // the iris's blade count (6)
uniform float uCatsEye;      // how hard the barrel clips off-axis ghosts (1)
uniform float uRainbow;      // how much the coatings disperse (1)
uniform float uHaloRings;    // rings of the big halo (2)
uniform float uHaloSize;     // (1)
uniform float uSpikes;       // the diffraction star (1)
uniform vec3  uWarm;       // the amber, linear
uniform vec3  uCool;       // the teal, linear
uniform sampler2D uGrit;   // photographed surface, for the ghosts' insides
uniform float uHasGrit;
uniform vec3  uEmit;       // the lamp's visible light against the lamp's own white: 1 for the lamp, the dull leak for the black light

#define TAU 6.28318530718
#define MAX_GHOSTS 24
#define MAX_HALO_RINGS 8

/* A cosine palette: smooth, wrapping, and no lookup texture. */
vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67)));
}

/* The same, as saturated as the coatings' dispersion makes it: 1 is the palette. */
vec3 dispersed(float t) {
  return max(mix(vec3(0.5), spectrum(t), uRainbow), 0.0);
}

/*
 * Distance to an N-bladed aperture edge, in the polygon's own metric.
 * 'roundness' blends toward a circle: real blades are curved, and a perfectly
 * straight-edged polygon looks machined rather than optical.
 */
float apertureDistance(vec2 p, float roundness) {
  float phi = atan(p.y, p.x);
  float r = length(p);
  float anglePerBlade = TAU / uBlades;
  float bladePhi = mod(phi, anglePerBlade) - anglePerBlade * 0.5;
  float d = r * cos(bladePhi);
  return mix(d, r, roundness);
}

/*
 * Diffraction spikes. An aperture with an even number of blades throws that
 * many spikes, which is why this shares the blade count (uBlades) with the geometry above rather
 * than being a separate decorative number. They fringe into spectrum along
 * their length because the grating that makes them is dispersive.
 */
vec3 starburst(vec2 p, float r) {
  float phi = atan(p.y, p.x);
  float lobes = abs(cos(phi * uBlades * 0.5));
  float spike = pow(lobes, 70.0) * exp(-r * 3.4);
  vec3 tint = mix(vec3(1.0), dispersed(r * 1.6 + 0.1), min(0.65 * uRainbow, 1.0));
  return tint * spike * 4.6 * uSpikes;
}

/*
 * One ghost: an out-of-focus image of the aperture, thrown by a reflection
 * between two elements. Bright at its rim and hollow in the middle, because it
 * is a defocused disc rather than a point — that hollow ring is what makes a
 * flare read as photographed rather than as a row of dots.
 */
vec3 ghost(vec2 p, float radius, float thickness, vec3 tint) {
  float d = length(p);
  float disc = smoothstep(radius, radius * 0.55, d) * 0.35;
  float ring = exp(-pow((d - radius) / thickness, 2.0));
  return tint * (disc + ring * 0.9);
}

void main() {
  // gl_FragCoord counts up from the bottom; the page counts down from the top.
  vec2 frag = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y) / uScale;
  vec2 res = uViewport / uScale;

  // Normalised so the flare geometry does not change with window shape.
  /*
   * The flare GROWS as it winds; it does not merely brighten.
   *
   * Scaling intensity alone meant a barely-touched pointer still threw a
   * full-size flare at low opacity, which reads as a big dim light rather than
   * a small one starting up. Shrinking the unit at low charge expands p, and
   * every feature measured against it -- core, halo, spikes, aperture --
   * contracts together.
   */
  float spread = mix(uSpread, 1.0, uCharge * uCharge);
  float unit = min(res.x, res.y) * 0.5 * spread;
  vec2 p = (frag - uLight) / unit;
  float r = length(p);

  // ---- Emission, in linear light with real headroom ----
  // Inverse-square from a small emitter. The +eps keeps the centre finite; the
  // gain is what pushes the core far above 1.0 so the tonemap can clip it.
  /*
   * A tighter core than the emitter wants to be.
   *
   * Left wide, the blown region swallowed the aperture and the spikes whole
   * and what was left read as a torch pointed at the page rather than as a
   * lens looking at a light. The blades and the diffraction they throw ARE
   * the effect; the white disc is just where the sensor gave up.
   */
  /*
   * The blown region is what you actually SEE as the hexagon, and its size is
   * set by the gain, not by the aperture.
   *
   * The tonemap clips everything above 1.0 to white, so the white core reaches
   * out to wherever the emission crosses 1. At gain 22 that is
   * r = sqrt(21/900) = 0.153, which on a 746px-tall window is a 114px hexagon
   * -- the aperture ring underneath it was always small, it was drowned.
   * Gain 8 puts the crossing at r = 0.088, about 66px, and a tighter falloff
   * pulls it in further.
   */
  float falloff = 1.0 / (1.0 + uFalloff * r * r);
  float gain = uGain * uCharge;
  float core = falloff * gain;

  // Two wider lobes. Real bloom sums several kernel sizes; a single falloff
  // stays a disc however bright it is, and the far tail is what makes a light
  // look like it is lighting something rather than sitting on top of it.
  float halo = exp(-r * 3.1) * 2.3 * uCharge;
  float spill = exp(-r * 1.15) * 0.85 * uCharge;

  vec3 intensity = vec3(core + halo + spill);
  intensity += starburst(p, r) * uCharge;

  /*
   * Chromatic dispersion: sample the falloff at slightly different radii per
   * channel. Long wavelengths refract least, so red carries furthest — the
   * reason a real highlight fringes warm on the outside.
   */
  vec3 dispersion = vec3(
    1.0 / (1.0 + 250.0 * r * r),
    1.0 / (1.0 + (250.0 + 18.0 * uRainbow) * r * r),
    1.0 / (1.0 + (250.0 + 40.0 * uRainbow) * r * r)
  ) * gain * 0.34;

  // Warm core, cooler in the far falloff — hot sources read warm at the centre
  // and their scatter goes cool.
  vec3 tint = mix(uWarm, uCool, smoothstep(0.12, 0.62, r));
  vec3 colour = tint * intensity + dispersion;

  /*
   * ---- The flare ----
   *
   * Ghosts are reflections between lens elements, so they are images of the
   * source thrown back through the optical axis: they land on the line from
   * the source through the CENTRE of the frame and walk along it as the
   * source moves. That axis is why a flare reads as a lens rather than as
   * decoration stuck to the light, and it is the one thing baked footage
   * cannot do, which is why these are computed at all.
   *
   * What made them look drawn was not that they were computed. It was that
   * they were CLEAN: perfectly round, perfectly smooth, evenly spaced, evenly
   * sized. Real ones are none of those.
   */
  vec2 centre = res * 0.5;
  vec2 axis = (centre - uLight) / unit;

  for (int i = 0; i < MAX_GHOSTS; i++) {
    float fi = float(i);
    if (fi >= uGhostCount) break;
    float t = 0.35 + fi * uGhostSpacing;
    vec2 gp = p - axis * t;

    /*
     * Optical vignetting — the cat's-eye.
     *
     * A ghost is an image of the aperture, and off the optical axis the lens
     * BARREL clips that image: the further from centre, the more of the disc
     * is cut away, leaving the lens shape everyone recognises from a
     * photograph and almost nobody models. It is the single most identifiable
     * thing about a real ghost.
     */
    vec2 fromCentre = (frag - centre) / unit;
    vec2 clipDir = normalize(fromCentre + 1e-6);
    // A bite, not a bisection. Vignetting clips a ghost; it does not halve it
    // except at the extreme corners of a frame.
    float offAxis = clamp(length(fromCentre) * 0.55 * uCatsEye, 0.0, 1.0);
    float cut = dot(gp, clipDir);

    float radius = (0.045 + 0.075 * fract(fi * 0.62 + 0.2)) * uGhostSize;
    /*
     * How far THIS pair of surfaces sits from focus.
     *
     * Every ghost is formed by a different pair of elements, so each one comes
     * to focus in a different place and none of them at the sensor. Treating
     * them as one defocus made a set of identical stamps; giving each its own
     * is what turns them into separate reflections.
     */
    float defocus = fract(fi * 0.53 + 0.11);
    float thickness = radius * (0.16 + 0.14 * fract(fi * 0.37)) * (1.0 + 2.2 * defocus)
      * (1.0 + 3.0 * uGhostBokeh);

    /*
     * A ghost is an IMAGE OF THE APERTURE, not a disc.
     *
     * That is the thing that makes a real ghost chain recognisable: it is the
     * diaphragm, defocused, repeated — so with a six-bladed iris you get
     * hexagons, and they are hexagons whatever else changes. Drawing circles
     * was the single largest reason these read as computed, because a circle
     * is what you get from a lens wide open and this one is visibly stopped
     * down: the core is a hexagon and the spikes are counting its blades.
     *
     * Same SDF as the iris itself, for exactly that reason — they are images
     * of the same opening, so they cannot be a different shape from it.
     */
    /*
     * A mild anamorphic squash. Lens elements are not perfectly figured, so
     * the internal reflection images the aperture slightly out of round — the
     * reason ghosts in a photograph are ovals rather than regular polygons
     * even from a spherical lens. Kept mild: it should read as imperfection,
     * not as a different aperture.
     */
    /*
     * A badly defocused polygon loses its corners. The blades are sharp at the
     * iris, but the further a ghost is from focus the more its edges wash into
     * one another, so the hexagon relaxes toward a disc. Real ghost chains
     * show both in the same frame, which is a large part of why they do not
     * read as repeats.
     */
    float roundness = clamp(mix(mix(0.55, 0.18, uClosed), 0.95, defocus * 0.8) + uGhostShape, 0.0, 1.0);

    /*
     * And each arrives at its own ORIENTATION. The aperture is one hexagon,
     * but each ghost reaches the sensor by a different path through the
     * group, so its image lands rotated. Without this they are the same
     * hexagon stamped down the axis, which the eye reads as a pattern rather
     * than as optics.
     */
    float ga = fi * 2.39 + 0.7;
    float cs = cos(ga);
    float sn = sin(ga);
    vec2 gr = vec2(gp.x * cs - gp.y * sn, gp.x * sn + gp.y * cs);

    /*
     * Stretched tangentially as it leaves the centre. Coma and astigmatism
     * pull an off-axis image out perpendicular to the optical axis, so a ghost
     * near the edge of frame is not the same shape as one near the middle.
     */
    vec2 tangent = vec2(-clipDir.y, clipDir.x);
    vec2 gs = vec2(dot(gr, clipDir) / (1.0 + 0.5 * offAxis), dot(gr, tangent));
    float d2 = apertureDistance(gs / vec2(1.0, 0.88), roundness);

    /*
     * Sampled three times at slightly different scales, per channel. In a
     * screen-space flare the dispersion comes from splitting the RGB sampling
     * steps along the ghost vector; the same idea applies to an analytic
     * ghost, because the cause is the same — the coating disperses, so each
     * wavelength images the aperture at a fractionally different size.
     */
    vec3 disp = vec3(1.0 - 0.015 * uRainbow, 1.0, 1.0 + 0.018 * uRainbow);
    vec3 ring = exp(-pow((vec3(d2) - radius * disp) / thickness, vec3(2.0)));
    /*
     * A ghost has an inside, not just an edge. It is a defocused image of a
     * lit opening, so the whole opening is bright — the rim is brighter
     * because the defocus piles light up there, but a ghost drawn as an
     * outline reads as a ring rather than as an aperture.
     */
    // Bokeh: a ghost further from focus fills in evenly and loses its bright rim.
    float disc = smoothstep(radius, radius * mix(0.55, 0.25, uGhostBokeh), d2) * mix(0.62, 1.0, uGhostBokeh);
    vec3 shape = vec3(disc) + ring * mix(0.9, 0.25, uGhostBokeh);
    // The barrel takes a bite out of the side nearer the frame edge.
    shape *= mix(
      1.0,
      smoothstep(radius * (0.6 + offAxis), radius * (0.6 + offAxis) - radius * 0.9, cut),
      min(uCatsEye, 1.0)
    );

    /*
     * And the inside is not smooth. A ghost is a defocused image of a real
     * aperture in a real lens, so it carries the dust and the coating flaws
     * of the glass it bounced off — mottling across the disc, not a gradient.
     * The map is the same photographed surface the panes wear.
     */
    /*
     * Sampled three times, offset per channel. Same reason the ghost itself
     * disperses: the debris is ON the glass, so its shadow in the reflected
     * image is spread by the same coating that spreads the image. Sampled once
     * it is a grey mottle; sampled three times it is the faint colour speckle
     * a dirty element actually gives. The Ultimate Lens Flare shader does this
     * to its dirt texture too, which is what pointed at it.
     *
     * Mottling, not masking: the dirt varies the ghost's interior, it does not
     * decide whether the ghost is there.
     */
    vec2 gritUv = gp / max(radius, 1e-3) * 0.28 + 0.5 + fi * 0.21;
    vec2 gritOff = vec2(0.004, -0.003);
    vec3 gritRGB = vec3(
      texture2D(uGrit, fract(gritUv + gritOff) * 0.49 + 0.005).g,
      texture2D(uGrit, fract(gritUv) * 0.49 + 0.005).g,
      texture2D(uGrit, fract(gritUv - gritOff) * 0.49 + 0.005).g
    );
    vec3 grit = mix(vec3(1.0), 0.72 + 1.1 * gritRGB, uHasGrit);

    vec3 gt = dispersed(fi * 0.23 + 0.42) * (0.7 + 0.6 * fract(fi * 0.71));
    /*
     * Not all equally bright. A ghost's energy is the product of the
     * reflectances of the two surfaces that made it, and coatings differ
     * element to element -- so a real chain has a couple of bright ones and a
     * lot of faint ones, not a uniform row. The decay is the later pairs
     * having gone through more glass to get there.
     */
    float pairEfficiency =
      (0.3 + 0.7 * fract(fi * 0.83 + 0.27)) * mix(1.1, 0.45, fi / max(uGhostCount, 1.0));
    colour += gt * shape * grit * uGhostGain * pairEfficiency * uCharge;
  }

  /*
   * The big halo is centred on the OPTICAL AXIS, not on the light.
   *
   * This was wrong before and it is the kind of wrong you feel without being
   * able to name: I had the ring centred on the source, so it travelled with
   * the pointer like a bracelet. A halo is a reflection off the front element
   * back through the system, and the system's axis is the middle of the frame
   * — so the ring sits around the centre of the picture and only its radius
   * and brightness change as the source moves. That is why, in a photograph,
   * the big ring stays put while everything else slides.
   */
  vec2 fromAxis = (frag - centre) / unit;
  float axisR = length(fromAxis);
  float haloR = (0.30 + 0.22 * length(axis)) * uHaloSize;
  float halo1 = exp(-pow((axisR - haloR) / 0.045, 2.0)) * 0.9 * uHaloGain;
  // Its further rings, each wider and fainter (two rings in all was the original).
  for (int k = 1; k < MAX_HALO_RINGS; k++) {
    float fk = float(k);
    if (fk >= uHaloRings) break;
    float ringR = haloR * pow(1.48, fk);
    float width = 0.09 * pow(1.35, fk - 1.0);
    halo1 += exp(-pow((axisR - ringR) / width, 2.0)) * 0.35 * pow(0.7, fk - 1.0);
  }
  colour += dispersed(axisR * 3.4 + 0.12) * halo1 * 0.85 * uCharge;

  /*
   * And the whole flare fades as the source leaves the middle of the frame.
   * Less of the beam finds its way into the barrel off-axis, so a flare is at
   * its most violent when you point the camera near the light and falls away
   * as you swing off it.
   */
  colour *= 1.0 - 0.55 * smoothstep(0.0, 1.25, length(axis));

  /*
   * Dirt on the front element, in SCREEN space.
   *
   * This does more than any other single cue and it is the one nobody adds: a
   * flare does not simply appear over a clean frame, it LIGHTS UP whatever is
   * stuck to the glass. Every smear and speck on the front element glows,
   * anchored to the lens rather than to the scene — so it stays exactly where
   * it is while the flare sweeps across it.
   *
   * Screen coordinates for that reason. Move the pointer and the flare
   * travels; the dirt does not, because the dirt is on the lens.
   */
  /*
   * No lens dirt.
   *
   * There was a full-screen grime pass here, multiplying the flare by a
   * texture so the light picked out smears on the glass. It is a real effect
   * and the screen-space flare references all include it, but it is a
   * photograph of somebody's dirty lens laid over photographs that are the
   * point of the page. The mottling INSIDE the ghosts stays -- that is what
   * separates a photographed ghost from a drawn one -- but nothing is smeared
   * across the frame any more.
   */

  // ---- The aperture, silhouetted against its own light ----
  /*
   * The iris is a silhouette, not a pinch. Stopping all the way down squeezed
   * the light into a small hard shape at exactly the moment it should read as
   * most intense — the charge was full and the light got SMALLER.
   */
  /*
   * Big enough to see, and it does not shrink.
   *
   * It used to stop down to a pinhole at full charge, which made the light
   * SMALLER exactly when it should read as most intense. It now barely closes
   * at all — what changes is how hard the blades cut, not how small the
   * opening is, so the hexagon stays legible across the whole wind.
   */
  float apertureRadius = mix(uAperture, uAperture * 0.855, uClosed);
  float d = apertureDistance(p, mix(0.42, 0.14, uClosed));
  float blades = smoothstep(apertureRadius - 0.0018, apertureRadius + 0.0018, d);
  float occlusion = 1.0 - blades * (0.25 + uClosed * 0.5);
  colour *= occlusion;

  // A thin lit edge where the blades meet the light.
  // The lit edge of the blades. Present from the start, not only once closed:
  // an open iris still has edges and they still catch the light.
  float rim = exp(-pow((d - apertureRadius) * 300.0, 2.0)) * (0.35 + 0.65 * uClosed);
  colour += mix(uWarm, vec3(1.0), 0.4) * rim * 2.4;

  /*
   * Tonemap. THIS is what produces the white core: everything above 1.0 is
   * compressed toward white, so the centre clips and colour survives only
   * where the intensity has fallen off. Authoring a white stop in a gradient
   * imitates the result; this causes it.
   */
  /*
   * What the camera sees of the lamp is its visible light. Held as the black
   * light, that is only the dull violet leak of a 365 nm source -- the UV is
   * invisible -- so the whole flare is that much fainter, and its colour.
   */
  colour *= uEmit;
  colour = colour / (1.0 + colour);
  // Back to display space.
  colour = pow(colour, vec3(1.0 / 2.2));

  float alpha = clamp(max(max(colour.r, colour.g), colour.b), 0.0, 1.0);
  gl_FragColor = vec4(colour, alpha);
}
`;

export const LIGHT_VERTEX_SHADER = /* glsl */ `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;
