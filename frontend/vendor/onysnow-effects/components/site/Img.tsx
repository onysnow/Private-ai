import { useCallback, useRef, useState, type CSSProperties } from "react";
import { cn } from "@fx/lib/utils";
import { photoSrcSet, photoUrl, type PhotoSources } from "@fx/lib/photo-url";
import { registerLitSurface } from "@fx/effects/scene/scene";

/** Minimal shape needed to render a stored photograph. */
export type ImgSource = {
  storage_path: string;
  width?: number | null;
  height?: number | null;
  blur_data_url?: string | null;
  sources?: PhotoSources | null;
  alt?: string | null;
};

type ImgProps = {
  image: ImgSource | null | undefined;
  /** Rendered width at each breakpoint. Required for `srcset` to mean anything. */
  sizes?: string;
  className?: string;
  imgClassName?: string;
  eager?: boolean;
  alt?: string;
  /**
   * The point to keep in frame, 0..1 each way from the top-left: a focal
   * point chosen in the Studio (lib/page-photos). Set as the picture's
   * object-position, inline, which is also where the glass reads it from
   * (effects/scene focusOf). Unset: the stylesheet's framing (centred).
   */
  focus?: { x: number; y: number } | null | undefined;
};

const pct = (v: number) => `${(Math.min(1, Math.max(0, v)) * 100).toFixed(1)}%`;

/**
 * The single image abstraction for the site: a blurred placeholder that fades to
 * the photograph, an aspect-ratio box so nothing shifts, and a real `srcset` so
 * the browser downloads a rendition matched to how large it is actually drawn.
 */
export function Img({
  image,
  sizes = "100vw",
  className,
  imgClassName,
  eager = false,
  alt,
  focus,
}: ImgProps) {
  const [loaded, setLoaded] = useState(false);

  /*
   * The photograph is a surface in its own right.
   *
   * It rests ON the glass, so it takes none of the pane's bevel, reflection or
   * grime -- those belong to a sheet it is lying on. What it has instead is
   * photographic paper: a broad, soft, warm gloss rather than glass's tight
   * white specular, and a much fainter view of the same room. Registering it
   * publishes where the light is standing over it; styles.css does the rest.
   */
  const release = useRef<(() => void) | null>(null);
  const surface = useCallback((el: HTMLElement | null) => {
    release.current?.();
    release.current = el ? registerLitSurface(el) : null;
  }, []);
  const width = image?.width ?? 1600;
  const height = image?.height ?? 1067;
  const src = photoUrl(image?.storage_path);
  const srcSet = photoSrcSet(image?.storage_path, image?.sources, image?.width);
  const blur = image?.blur_data_url || undefined;

  // When the caller fixes the box (aspect-*, h-*, size-*, inset-0), that wins.
  // Setting the photograph's intrinsic ratio inline would override the class and
  // let a portrait frame blow out a row of landscape ones.
  const boxed = /(^|\s)(aspect-|h-|size-|inset-)/.test(className ?? "");
  const style = boxed ? undefined : ({ aspectRatio: `${width} / ${height}` } as CSSProperties);

  return (
    <span
      ref={surface}
      className={cn("relative block overflow-hidden", className)}
      {...(style ? { style } : {})}
    >
      {/*
        The loading placeholder, as a child rather than a background on the
        frame itself.

        It was `bg-muted` on the wrapper. That is invisible on the live page --
        the photograph covers it -- and fatal to the rasterised capture, which
        draws media separately from structure and therefore had an opaque
        rectangle sitting exactly where every photograph should have shown
        through. As its own element it can be filtered out of the capture and
        still do its job here.
      */}
      <span aria-hidden="true" data-raster-skip className="absolute inset-0 bg-muted" />
      {blur ? (
        <img
          aria-hidden="true"
          alt=""
          src={blur}
          className="absolute inset-0 size-full scale-110 object-cover blur-xl"
        />
      ) : null}
      {src ? (
        <img
          /*
           * `onLoad` alone is not enough.
           *
           * The markup is server-rendered, so the browser can finish fetching a
           * photograph before React hydrates and attaches this handler — and an
           * image that is already complete never fires `load` again. The result
           * was a frame stuck at `opacity-0` forever, showing nothing but its
           * blurred placeholder. Anything served from cache hit this on every
           * repeat visit.
           *
           * The ref runs at attach time and catches exactly that case.
           */
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0) setLoaded(true);
          }}
          src={src}
          {...(srcSet ? { srcSet } : {})}
          sizes={sizes}
          /*
           * Required before the photograph can be read back out of a canvas.
           *
           * The rasterised glass draws these straight onto its capture with
           * drawImage and then samples that capture in a shader. A canvas that
           * has drawn a cross-origin image WITHOUT this attribute is tainted:
           * the draw succeeds, nothing warns, and the first read throws a
           * SecurityError. Storage already answers with
           * `access-control-allow-origin: *`, so this costs nothing -- but
           * permissive CORS on the server does not taint-proof the canvas on
           * its own, the request has to be made in CORS mode, which is what
           * this attribute does.
           */
          crossOrigin="anonymous"
          alt={alt ?? image?.alt ?? ""}
          width={width}
          height={height}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          {...(focus ? { style: { objectPosition: `${pct(focus.x)} ${pct(focus.y)}` } } : {})}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-700",
            loaded ? "opacity-100" : "opacity-0",
            imgClassName,
          )}
        />
      ) : null}
      {/*
        Paper gloss and a trace of the room. Above the photograph, below
        nothing -- anything laid over the picture itself belongs here.
      */}
      <span aria-hidden="true" className="photo-surface" />
    </span>
  );
}
