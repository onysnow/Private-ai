/**
 * Photograph URLs.
 *
 * Workbench: no base is set, so photoUrl gives "" and nothing is fetched from
 * outside the computer; set NEXT_PUBLIC_PHOTO_BASE to serve photographs.
 *
 * The "photos" bucket is public, so images are served straight from Supabase
 * Storage's public endpoint — no proxy, no per-request signing, and the CDN in
 * front of it can cache them properly.
 */

const BASE =
  (process.env.NEXT_PUBLIC_PHOTO_BASE as string | undefined)?.replace(/\/+$/, "") ?? "";

/** The widths we generate at upload time. Keep in sync with lib/image-upload.ts. */
/*
 * The renditions an upload produces.
 *
 * 320 and 480 are here because the smallest was 640 and the footer strip draws
 * eight tiles at roughly 180 CSS pixels each, on every page of the site — so
 * every visit fetched eight 640px files for 180px boxes. 2560 is dropped: the
 * base is already capped at 2560, so `w < bitmap.width` could never be true
 * for it and it has never once been generated. The original is appended to the
 * srcset separately when it is genuinely larger.
 */
export const VARIANT_WIDTHS = [320, 480, 640, 1280, 1920, 2560] as const;

/** Stable public URL for a stored object. */
export function photoUrl(storagePath: string | null | undefined): string {
  if (!storagePath || !BASE) return "";
  const clean = storagePath.replace(/^\/+/, "");
  const encoded = clean.split("/").map(encodeURIComponent).join("/");
  return `${BASE}/storage/v1/object/public/photos/${encoded}`;
}

/** Map of rendered width → storage path, as stored on `photos.sources`. */
export type PhotoSources = Record<string, string>;

/**
 * Build a `srcset` from the stored variants. Falls back to the single original
 * for photographs uploaded before responsive variants existed, so older rows
 * keep working rather than breaking.
 */
export function photoSrcSet(
  storagePath: string | null | undefined,
  sources: PhotoSources | null | undefined,
  intrinsicWidth?: number | null,
): string | undefined {
  const entries = Object.entries(sources ?? {})
    .map(([w, path]) => [Number(w), path] as const)
    .filter(
      ([w, path]) => Number.isFinite(w) && w > 0 && typeof path === "string" && path.length > 0,
    )
    .sort((a, b) => a[0] - b[0]);

  if (entries.length === 0) return undefined;

  const parts = entries.map(([w, path]) => `${photoUrl(path)} ${w}w`);

  // Include the original as the largest candidate when it is genuinely bigger.
  const widest = entries[entries.length - 1]![0];
  if (intrinsicWidth && intrinsicWidth > widest && storagePath) {
    parts.push(`${photoUrl(storagePath)} ${intrinsicWidth}w`);
  }
  return parts.join(", ");
}
