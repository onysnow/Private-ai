import { useEffect, useRef, useState, type CSSProperties } from "react";
import { previewing } from "@fx/effects/engine/preview";
import {
  findRedRoom,
  leaveRedRoom,
  onRedRoom,
  redRoomOn,
  redRoomPrint,
} from "@fx/effects/secrets/red-room";
import { HangingPrint } from "./HangingPrint";
import { SHUTTER_EVENT } from "@fx/lib/shutter-event";

/** The loupe's radius, CSS px: about a 4x loupe's field at arm's length. */
const LOUPE = 84;

/**
 * Secret 2, the red room (item 39, ?try=redroom; effects/secrets/red-room).
 *
 * Take a picture of a photograph -- wind the shutter and click one -- and the
 * page is lit only by the safelight: everything shows as a negative in red,
 * the way a print looks in the tray. The cursor is a loupe: under it, the
 * true frame. "Lights on" or Escape leaves.
 */
export function RedRoom() {
  const [on, setOn] = useState(false);
  const wash = useRef<HTMLDivElement>(null);
  const tint = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!previewing("redroom")) return;
    setOn(redRoomOn());
    const stop = onRedRoom(setOn);
    const onShutter = (e: Event) => {
      const at = (e as CustomEvent<{ x: number; y: number } | undefined>).detail;
      if (!at) return;
      const photo = document
        .elementsFromPoint(at.x, at.y)
        .map((n) => n.closest("[data-photo]"))
        .find((n): n is Element => !!n);
      if (!photo || redRoomOn()) return;
      // The sharp picture, not a blurred stand-in: the largest one that is loaded.
      const img = [...photo.querySelectorAll("img")]
        .filter((i) => (i.currentSrc || i.src) && !(i.currentSrc || i.src).startsWith("data:"))
        .sort((x, y) => y.naturalWidth * y.naturalHeight - x.naturalWidth * x.naturalHeight)[0];
      // The door, not the room: the flash, then the nav's "Red room" (SiteHeader).
      findRedRoom(img ? img.currentSrc || img.src : null);
    };
    window.addEventListener(SHUTTER_EVENT, onShutter);
    return () => {
      stop();
      window.removeEventListener(SHUTTER_EVENT, onShutter);
      leaveRedRoom();
    };
  }, []);

  useEffect(() => {
    if (!on) return;
    let frame = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    const draw = () => {
      frame = 0;
      for (const n of [wash.current, tint.current, ring.current]) {
        n?.style.setProperty("--lx", `${x}px`);
        n?.style.setProperty("--ly", `${y}px`);
      }
    };
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") leaveRedRoom();
    };
    draw();
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("keydown", key);
    };
  }, [on]);

  if (!on) return null;
  const loupe = { "--loupe": `${LOUPE}px` } as CSSProperties;
  return (
    <>
      <div ref={wash} className="red-room red-room__negative" style={loupe} aria-hidden="true" />
      <div ref={tint} className="red-room red-room__safelight" style={loupe} aria-hidden="true" />
      <div ref={ring} className="red-room__loupe" style={loupe} aria-hidden="true" />
      {redRoomPrint() && <HangingPrint src={redRoomPrint()!} />}
      <button type="button" className="red-room__leave" onClick={() => leaveRedRoom()}>
        Lights on
      </button>
    </>
  );
}
