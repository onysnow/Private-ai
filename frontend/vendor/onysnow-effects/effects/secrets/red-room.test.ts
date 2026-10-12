import { afterEach, describe, expect, it } from "vitest";
import {
  SAFELIGHT_COLOUR,
  enterRedRoom,
  leaveRedRoom,
  onRedRoom,
  redRoomFound,
  redRoomOn,
} from "./red-room";
import { PREVIEWS } from "@fx/effects/engine/preview";

describe("the red room (item 39)", () => {
  afterEach(() => leaveRedRoom());

  it("is dark until the shutter finds it, and says so to its watchers", () => {
    const seen: boolean[] = [];
    const stop = onRedRoom((on) => seen.push(on));
    expect(redRoomOn()).toBe(false);
    enterRedRoom();
    enterRedRoom();
    leaveRedRoom();
    stop();
    expect(seen).toEqual([true, false]);
  });

  it("remembers it was found, where the browser can keep it", () => {
    enterRedRoom();
    if (typeof localStorage !== "undefined") expect(redRoomFound()).toBe(true);
  });

  it("lights it with a safelight the paper cannot see: red, almost no green or blue", () => {
    const [r, g, b] = SAFELIGHT_COLOUR;
    expect(r).toBe(1);
    expect(g).toBeLessThan(0.15);
    expect(b).toBeLessThan(g);
  });

  it("is a preview until Ony approves it", () => {
    expect(PREVIEWS).toHaveProperty("redroom");
  });
});
