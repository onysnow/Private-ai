/**
 * Files the effect layer loads, and where they actually come from.
 *
 * These used to be string literals in the components that loaded them --
 * `img.src = "/glass-surface.jpg"` in two separate files, and a hardcoded
 * array of room names inlined into a script string. Changing any of them
 * meant editing source and redeploying, which put the look of the glass
 * permanently out of reach of the person whose glass it is.
 *
 * Now each is a settings row the studio can upload to. The shipped file stays
 * as the fallback, so an empty setting is not a broken site -- it is the
 * default, which is also what "Reset to default" leaves behind.
 *
 * WHY A DATA ATTRIBUTE AND NOT A HOOK
 *
 * The consumers are WebGL initialisers inside effects that run once and then
 * own an rAF loop; they are not subscribed to anything and should not be.
 * `CustomCss` already reads the settings and writes to the document element,
 * so one more attribute costs nothing and keeps the effect layer ignorant of
 * React Query, which is the arrangement the rest of it already has.
 */

export const SITE_ASSETS = {
  /** The smudge and scratch map the glass shader and cursor light sample. */
  glassSurface: { key: "glass_surface_url", attr: "glassSurface", fallback: "/glass-surface.jpg" },
  /**
   * The glass's surface layers, one photograph each: where the smudge film is,
   * and where the scratches are. Greyscale, the mark's amount in the
   * brightness, black where the glass is clean. Must tile without a seam; any
   * size (it is fitted to a power of two), shown one texel per CSS pixel.
   */
  glassSmudge: { key: "glass_smudge_url", attr: "glassSmudge", fallback: "/glass-smudge.jpg" },
  glassScratch: { key: "glass_scratch_url", attr: "glassScratch", fallback: "/glass-scratch.jpg" },
} as const;

/**
 * Where to load an asset from right now.
 *
 * Falls back on an empty or whitespace value as well as a missing one: a
 * settings row cleared in the portal stores "", and treating that as a URL
 * would ask the browser to fetch the current page as an image.
 */
/**
 * The six room reflections, as settings keys.
 *
 * One row per slot rather than one row holding a list, because the upload
 * control is per file and replacing a single room should not mean re-uploading
 * the other five. The fallback is the graded HDRI that ships with the site.
 *
 * Their order matches ROOMS in `rooms.ts`, which is what the pre-paint script
 * cycles through. Keep the two in step.
 */
export const ROOM_KEYS = [
  "room_metro_url",
  "room_aquarium_url",
  "room_studio_url",
  "room_lobby_url",
  "room_fireplace_url",
  "room_station_url",
] as const;

/**
 * The same six rooms in real brightness -- the files the glass reflects.
 *
 * Log-encoded HDR JPEGs (2048 x 512, the band round eye level), made from an
 * .hdr or .exr with art-source/rooms/build_hdr_rooms.py. An ordinary photo
 * uploaded here would read as far too bright: the encoding is not sRGB.
 * Same order as ROOMS and ROOM_KEYS.
 */
export const ROOM_HDR_KEYS = [
  "room_metro_hdr_url",
  "room_aquarium_hdr_url",
  "room_studio_hdr_url",
  "room_lobby_hdr_url",
  "room_fireplace_hdr_url",
  "room_station_hdr_url",
] as const;

export function assetUrl(asset: (typeof SITE_ASSETS)[keyof typeof SITE_ASSETS]): string {
  if (typeof document === "undefined") return asset.fallback;
  const set = document.documentElement.dataset[asset.attr];
  return set && set.trim() ? set : asset.fallback;
}
