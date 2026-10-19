import { describe, expect, it } from "vitest";
import { photoSrcSet, photoUrl } from "./photo-url";

const BASE = "https://example.supabase.co/storage/v1/object/public/photos";

describe("photoUrl", () => {
  it("builds a public storage URL", () => {
    expect(photoUrl("gallery/sunset.webp")).toBe(`${BASE}/gallery/sunset.webp`);
  });

  it("returns empty string for missing paths rather than a broken URL", () => {
    // Img renders nothing on an empty src; a half-built URL would 404 loudly on
    // every card with no photograph attached yet.
    expect(photoUrl(null)).toBe("");
    expect(photoUrl(undefined)).toBe("");
    expect(photoUrl("")).toBe("");
  });

  it("strips leading slashes so the path isn't doubled", () => {
    expect(photoUrl("/gallery/a.webp")).toBe(`${BASE}/gallery/a.webp`);
    expect(photoUrl("///gallery/a.webp")).toBe(`${BASE}/gallery/a.webp`);
  });

  it("encodes each segment but keeps the separators", () => {
    expect(photoUrl("fine art/a photo (1).webp")).toBe(`${BASE}/fine%20art/a%20photo%20(1).webp`);
  });

  it("encodes characters that would otherwise break the URL", () => {
    expect(photoUrl("gallery/a?b#c.webp")).toBe(`${BASE}/gallery/a%3Fb%23c.webp`);
  });
});

describe("photoSrcSet", () => {
  it("orders candidates by width ascending", () => {
    const out = photoSrcSet("orig.webp", { "2560": "c.webp", "640": "a.webp", "1280": "b.webp" });
    expect(out).toBe(`${BASE}/a.webp 640w, ${BASE}/b.webp 1280w, ${BASE}/c.webp 2560w`);
  });

  it("returns undefined when there are no variants", () => {
    // Undefined rather than "" — Img spreads it conditionally, and an empty
    // srcset attribute makes some browsers ignore the src entirely.
    expect(photoSrcSet("orig.webp", null)).toBeUndefined();
    expect(photoSrcSet("orig.webp", {})).toBeUndefined();
  });

  it("appends the original when it is genuinely larger than every variant", () => {
    const out = photoSrcSet("orig.webp", { "640": "a.webp" }, 4000);
    expect(out).toBe(`${BASE}/a.webp 640w, ${BASE}/orig.webp 4000w`);
  });

  it("does not append the original when a variant already matches or exceeds it", () => {
    // A 1200px upload generates a 1280 variant by upscale-avoidance; listing the
    // original at 1200w next to it just gives the browser a worse choice.
    expect(photoSrcSet("orig.webp", { "1280": "b.webp" }, 1200)).toBe(`${BASE}/b.webp 1280w`);
    expect(photoSrcSet("orig.webp", { "1280": "b.webp" }, 1280)).toBe(`${BASE}/b.webp 1280w`);
  });

  it("ignores malformed entries instead of emitting NaNw", () => {
    const out = photoSrcSet("orig.webp", { abc: "x.webp", "0": "y.webp", "640": "a.webp" });
    expect(out).toBe(`${BASE}/a.webp 640w`);
  });

  it("survives rows where sources exists but the paths are empty", () => {
    expect(photoSrcSet("orig.webp", { "640": "" })).toBeUndefined();
  });
});
