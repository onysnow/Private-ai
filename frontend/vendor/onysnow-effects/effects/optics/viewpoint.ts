/**
 * Where the viewer's eye is, and what that does to everything behind the glass.
 *
 * WHY
 *
 * The site looked at the page from one fixed point, straight on. With the
 * photographs a gap behind the glass, that means nothing behind the pane ever
 * moves relative to it: the bend at the edge always sits over the same part of
 * the picture, so you cannot see it bending anything. Real glass is seen from
 * a head that moves, and the picture behind slides under the pane as it does
 * -- through the bevel, which is where you watch it bend.
 *
 * THE MODEL
 *
 * The eye sits CAMERA_DISTANCE viewport widths in front of the screen, and
 * moves with the pointer by the "Viewpoint follows pointer" fraction (0 is a
 * fixed eye, 1 follows the pointer exactly). The glass is the screen plane.
 * A photograph `gap` pixels behind it, seen from an eye moved by e, lands on
 * the glass plane moved by
 *
 *     e * gap / (distance + gap)
 *
 * toward the eye's side -- similar triangles, the same geometry as the cast
 * shadows. Things resting ON the glass (text, buttons, prints) are in the
 * glass plane and do not move. The room reflected in the face shifts too:
 * the reflected ray from a point is (point - eye), so it is read from there.
 */

/** Where the eye is, relative to the middle of the viewport, in CSS pixels. */
export function eyeOffset(
  pointerX: number,
  pointerY: number,
  viewportWidth: number,
  viewportHeight: number,
  follow: number,
): { x: number; y: number } {
  // A pointer that has left the page (or never arrived) leaves the eye centred.
  if (pointerX < -1000 || pointerY < -1000) return { x: 0, y: 0 };
  const f = Math.min(1, Math.max(0, follow));
  // `+ 0` keeps a zero eye positive zero, not -0.
  return { x: (pointerX - viewportWidth / 2) * f + 0, y: (pointerY - viewportHeight / 2) * f + 0 };
}

/** How far something `gap` px behind the glass appears to move on it, for that eye. */
export function behindGlassShift(
  eye: { x: number; y: number },
  gap: number,
  cameraDistance: number,
): { x: number; y: number } {
  const k = Math.max(gap, 0) / (Math.max(cameraDistance, 1) + Math.max(gap, 0));
  return { x: eye.x * k, y: eye.y * k };
}

/**
 * How much a photograph behind the glass must be oversized so the slide never
 * shows its edge: the largest shift these settings can produce (the eye over
 * a corner of the screen), on both sides, as a scale factor.
 */
export function oversizeFor(
  viewportWidth: number,
  viewportHeight: number,
  follow: number,
  gap: number,
  cameraDistance: number,
): number {
  const corner = eyeOffset(viewportWidth, viewportHeight, viewportWidth, viewportHeight, follow);
  const s = behindGlassShift(corner, gap, cameraDistance);
  return 1 + 2 * Math.max(Math.abs(s.x) / viewportWidth, Math.abs(s.y) / viewportHeight) + 0.005;
}

/**
 * How far a photograph `gap` px behind the glass slides against the glass
 * as the page scrolls by `delta` (item 33, ?try=gapparallax). Scrolling moves
 * the glass and the photograph together; on the screen the glass moves the
 * full delta and the photograph, further from the eye, a little less -- it
 * lags by delta * gap / (distance + gap), the same similar triangles as an
 * eye moving by delta. So a pane standing further off its photograph slides
 * further over it, and nothing is a setting but the gap and the eye.
 */
export function scrollSlide(delta: number, gap: number, cameraDistance: number): number {
  return behindGlassShift({ x: 0, y: delta }, gap, cameraDistance).y;
}
