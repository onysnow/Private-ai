/**
 * Natural vignetting (catalogue item 32, ?try=vignette).
 *
 * A lens passes less light to the edge of its picture than to the middle:
 * a point off the axis by angle theta sees the aperture foreshortened
 * (cos), further away (cos^2) and at a slant (cos), so its brightness falls
 * as cos^4 theta -- the "cosine fourth law" of natural vignetting (Ray,
 * Applied Photographic Optics). The camera here stands `distance` px from
 * the screen, so a point r px from the axis is at tan theta = r / distance.
 */

/** How much light reaches a point `r` px off the axis, against the middle: cos^4. */
export function cos4(r: number, distance: number): number {
  const d2 = distance * distance;
  const c2 = d2 / (d2 + r * r);
  return c2 * c2;
}

/**
 * The vignette as a CSS radial gradient of black: at each stop, the share of
 * light cos^4 takes away, times `strength`. Centred on the axis (cx, cy),
 * out to `reach` px (the frame's far corner).
 */
export function vignetteGradient(
  cx: number,
  cy: number,
  reach: number,
  distance: number,
  strength: number,
  stops = 12,
): string {
  const parts: string[] = [];
  for (let i = 0; i <= stops; i++) {
    const r = (reach * i) / stops;
    const alpha = Math.min(1, Math.max(0, strength * (1 - cos4(r, distance))));
    parts.push(`rgb(0 0 0 / ${alpha.toFixed(4)}) ${r.toFixed(1)}px`);
  }
  return `radial-gradient(circle at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, ${parts.join(", ")})`;
}
