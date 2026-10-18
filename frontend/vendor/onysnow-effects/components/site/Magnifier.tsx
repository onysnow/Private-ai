import { Fragment, useEffect, useMemo, useRef } from "react";
import {
  FOCAL_RADII,
  MAP_SCALE,
  holdHeight,
  lensPatch,
  magnifierMap,
} from "@fx/effects/optics/magnifier";
import { castShadow } from "@fx/effects/optics/shadow";
import {
  cursorLamp,
  flashLight,
  onFlash,
  onLightChange,
  pointer,
  roomLight,
  type Light,
} from "@fx/effects/light/lights";
import { viewState } from "@fx/effects/scene/scene";
import { camera } from "@fx/effects/camera/camera";

/** The lens's radius, CSS px: a big reading glass held near the page. */
const LENS_RADIUS = 96;
/** The texture the displacement is read from. The lens is smooth; 256 is plenty. */
const MAP_SIZE = 256;
/** The brass rim's width round the lens, CSS px (.magnifier__rim's inset). */
const RIM = 11;
/**
 * The room's lights, taken as one broad source overhead: the ceiling seen
 * from the page is most of a hemisphere, so its radius is a large share of
 * its height, and what it casts is a soft, faint shade.
 */
const ROOM_SPREAD = 0.5;
/** How much of what lights the page each source's shade takes at full strength. */
const ROOM_SHADE = 0.3;
const FLASH_SHADE = 0.55;

/**
 * Where one source throws the magnifier's shadow and bright patch, as styles
 * for its cast element. The lens's own ring lamp is not one of them: a light
 * cannot shadow the thing it is fixed to.
 */
function castBy(
  cast: { shade: HTMLElement | null; patch: HTMLElement | null },
  light: Light,
  strength: number,
  x: number,
  y: number,
) {
  const el = cast.shade;
  const patchEl = cast.patch;
  if (!el || !patchEl) return;
  if (strength <= 0.002) {
    el.style.opacity = "0";
    patchEl.style.opacity = "0";
    return;
  }
  const d = holdHeight(LENS_RADIUS);
  const shadow = castShadow({
    lampX: light.x,
    lampY: light.y,
    height: light.height,
    radius: light.radius,
    gap: d,
    x,
    y,
  });
  const patch = lensPatch(FOCAL_RADII * LENS_RADIUS, d, light.height - d);
  const size = (LENS_RADIUS + RIM) * 2;
  const [r, g, b] = light.colour;
  const blur = `${(shadow.across / shadow.scale).toFixed(1)}px`;
  const place = `translate3d(${shadow.x - size / 2}px, ${shadow.y - size / 2}px, 0) scale(${shadow.scale.toFixed(4)})`;
  el.style.opacity = "1";
  el.style.transform = place;
  el.style.setProperty(
    "--shade",
    (strength * (light === flashLight ? FLASH_SHADE : ROOM_SHADE)).toFixed(3),
  );
  el.style.setProperty("--blur", blur);
  /*
   * The patch: the light the lens passed, gathered into a disc its share of
   * the rim's footprint, brighter by the areas' ratio. Added to the page, so
   * it is its own element (a blend inside the shade's group would only
   * blend with the shade).
   */
  patchEl.style.transform = place;
  patchEl.style.setProperty("--blur", blur);
  patchEl.style.setProperty("--patch", (patch.spread / patch.shadow).toFixed(4));
  patchEl.style.opacity = Math.min(1, strength * (patch.gain - 1) * 0.12).toFixed(3);
  patchEl.style.setProperty(
    "--patch-colour",
    `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`,
  );
}

/**
 * The magnifying glass (item 21, redone in 25e), held in the hand.
 *
 * The lens is a backdrop-filter: the real page behind it, live -- photographs,
 * glass, light and all -- pulled through a displacement map that is the
 * lens's own mapping (effects/optics/magnifier): enlarged in the middle,
 * swimming outward toward the rim, and read three times at slightly different
 * strengths so the colours come apart where the lens bends most, as a simple
 * lens's do.
 *
 * It is an illuminated magnifier: the lamp is a ring of light in its rim
 * (effects/tools/held), glowing as the lamp is wound. Everything else it
 * shows comes from the scene: its face and its brass mirror the room the
 * panes mirror, at the room's brightness, and it throws its shadow -- the
 * rim and the handle, with the lens's bright patch inside -- from the room's
 * light overhead and from the flash, by the one shadow model.
 *
 * Chromium only (SVG filters in backdrop-filter); elsewhere the lens shows
 * the page unmagnified, which is a clear disc in a brass rim -- still a glass.
 */
export function Magnifier() {
  const holder = useRef<HTMLDivElement>(null);

  // The lens's map, drawn once, as an image the filter can load.
  const href = useMemo(() => {
    if (typeof document === "undefined") return "";
    const canvas = document.createElement("canvas");
    canvas.width = MAP_SIZE;
    canvas.height = MAP_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const image = ctx.createImageData(MAP_SIZE, MAP_SIZE);
    image.data.set(magnifierMap(MAP_SIZE));
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  }, []);

  const roomCast = useRef<HTMLDivElement>(null);
  const roomPatch = useRef<HTMLDivElement>(null);
  const flashCast = useRef<HTMLDivElement>(null);
  const flashPatch = useRef<HTMLDivElement>(null);

  // Follow the hand: moved only when the lights move, not every frame.
  useEffect(() => {
    let frame = 0;
    const place = () => {
      frame = 0;
      const el = holder.current;
      if (!el) return;
      const off = pointer.x <= -9999;
      el.style.opacity = off ? "0" : "1";
      if (off) {
        for (const c of [roomCast, roomPatch, flashCast, flashPatch]) {
          if (c.current) c.current.style.opacity = "0";
        }
        return;
      }
      const x = pointer.x;
      const y = pointer.y;
      el.style.transform = `translate3d(${x - LENS_RADIUS}px, ${y - LENS_RADIUS}px, 0)`;
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      /*
       * What the glass shows of the scene's lights. Its ring lamp is the
       * lamp: it glows as the lamp is wound. The face and the brass mirror
       * the room, as the panes do -- where in it depends on where the lens
       * is -- at the room's brightness.
       */
      el.style.setProperty("--ring", cursorLamp.charge.toFixed(3));
      el.style.setProperty("--lens-room", Math.min(1, roomLight.gain).toFixed(3));
      el.style.setProperty("--lens-rx", `${((x / vw) * 100).toFixed(1)}%`);
      el.style.setProperty("--lens-ry", `${((y / vh) * 100).toFixed(1)}%`);
      /*
       * What it casts. The room is lit from overhead, where the viewer's eye
       * is; the flash is at the eye (effects/light). Each throws the rim's
       * shade and the lens's bright patch by the one shadow model.
       */
      const room: Light = {
        ...roomLight,
        x: vw / 2 + viewState.eyeX,
        y: vh / 2 + viewState.eyeY,
        height: camera.distance(vw),
        radius: camera.distance(vw) * ROOM_SPREAD,
        colour: [1, 1, 1],
      };
      castBy(
        { shade: roomCast.current, patch: roomPatch.current },
        room,
        Math.min(1, roomLight.gain),
        x,
        y,
      );
      castBy(
        { shade: flashCast.current, patch: flashPatch.current },
        flashLight,
        flashLight.charge,
        x,
        y,
      );
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    const stop = onLightChange(wake);
    const stopFlash = onFlash(wake);
    place();
    return () => {
      stop();
      stopFlash();
      cancelAnimationFrame(frame);
    };
  }, []);

  const scale = MAP_SCALE * LENS_RADIUS;
  return (
    <>
      <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
        <filter
          id="magnifier-lens"
          colorInterpolationFilters="sRGB"
          x="0"
          y="0"
          width="100%"
          height="100%"
        >
          <feImage href={href} preserveAspectRatio="none" result="lens" />
          {/* Red bent least, blue most: the colours part where the lens bends hardest. */}
          <feDisplacementMap
            in="SourceGraphic"
            in2="lens"
            scale={scale * 0.97}
            xChannelSelector="R"
            yChannelSelector="G"
            result="bentR"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="lens"
            scale={scale}
            xChannelSelector="R"
            yChannelSelector="G"
            result="bentG"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="lens"
            scale={scale * 1.04}
            xChannelSelector="R"
            yChannelSelector="G"
            result="bentB"
          />
          <feColorMatrix
            in="bentR"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="onlyR"
          />
          <feColorMatrix
            in="bentG"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="onlyG"
          />
          <feColorMatrix
            in="bentB"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="onlyB"
          />
          <feBlend in="onlyR" in2="onlyG" mode="screen" result="rg" />
          <feBlend in="rg" in2="onlyB" mode="screen" />
        </filter>
      </svg>
      {[
        [roomCast, roomPatch],
        [flashCast, flashPatch],
      ].map(([shade, patch], i) => (
        <Fragment key={i}>
          <div
            ref={shade}
            aria-hidden="true"
            className="magnifier-cast"
            style={{ width: (LENS_RADIUS + RIM) * 2, height: (LENS_RADIUS + RIM) * 2, opacity: 0 }}
          >
            <div className="magnifier-cast__shade" />
            <div className="magnifier-cast__handle" />
          </div>
          <div
            ref={patch}
            aria-hidden="true"
            className="magnifier-patch"
            style={{ width: (LENS_RADIUS + RIM) * 2, height: (LENS_RADIUS + RIM) * 2, opacity: 0 }}
          />
        </Fragment>
      ))}
      <div
        ref={holder}
        aria-hidden="true"
        className="magnifier"
        style={{ width: LENS_RADIUS * 2, height: LENS_RADIUS * 2, opacity: 0 }}
      >
        <div className="magnifier__handle" />
        <div className="magnifier__lens" />
        <div className="magnifier__rim" />
      </div>
    </>
  );
}
