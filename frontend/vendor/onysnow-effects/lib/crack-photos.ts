import type { GlassKind } from "@fx/effects/optics/fracture";
import { experimentsAllowed } from "@fx/lib/admin-gate";

/**
 * Photographs of broken glass, one list per kind of break (item 10; Ony
 * supplies them). A strike uses one of its kind's photographs as the break
 * itself (effects/optics/crack-photo); a kind with none keeps the generated
 * break (effects/optics/fracture).
 *
 * What makes a good one: the glass photographed square-on, the whole break
 * in frame with unbroken glass round it, dark behind and lit from one side so
 * the cracks glow (dark cracks on a bright sky also read), sharp, 2048 px or
 * more across. Files live in public/cracks/.
 */
export const CRACK_PHOTOS: Readonly<Record<GlassKind, readonly string[]>> = {
  /*
   * Ony's photographed pieces (public/glass-shards, from his 8K set) that
   * carry a star break of their own: three struck in the middle, one from
   * its edge. Cut out on transparent ground, so only their cracks are read,
   * not their outlines (effects/optics/crack-photo, glassInside).
   */
  annealed: [
    "/glass-shards/shard-49.webp",
    "/glass-shards/shard-50.webp",
    "/glass-shards/shard-51.webp",
    "/glass-shards/shard-11.webp",
  ],
  /*
   * Ony's two (2026-10-01): struck hard and held in place -- radials, rings
   * of short chords between them and a hole where the strike went through.
   * Cut out on transparent ground like the pieces above.
   */
  laminated: ["/cracks/laminated-1.webp", "/cracks/laminated-2.webp"],
};

/**
 * The photograph a strike uses: `?crackphoto=<url>` tries any photograph
 * (same site) before it is added to the lists; otherwise the kind's own, a
 * different one strike by strike.
 */
export function crackPhotoFor(kind: GlassKind, seed: number): string | null {
  if (typeof window !== "undefined" && experimentsAllowed()) {
    const tried = new URLSearchParams(window.location.search).get("crackphoto");
    if (tried && tried.startsWith("/")) return tried;
  }
  const list = CRACK_PHOTOS[kind];
  if (!list.length) return null;
  return list[Math.abs(Math.floor(seed)) % list.length]!;
}
