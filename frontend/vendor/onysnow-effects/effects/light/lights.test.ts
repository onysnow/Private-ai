import { describe, expect, it } from "vitest";
import {
  commitLights,
  cursorLamp,
  lightState,
  lights,
  movePointer,
  onCharge,
  onLightChange,
  reportCharge,
} from "./lights";

/** Optics plan step 3: the lights are a list, the cursor lamp first. */
describe("the lights", () => {
  it("are a list, and the cursor lamp is first", () => {
    expect(lights[0]).toBe(cursorLamp);
    expect(cursorLamp.id).toBe("cursor");
    // The old name reads the same lamp.
    expect(lightState).toBe(cursorLamp);
  });

  it("move when the frame commits them, not when the pointer moves", () => {
    movePointer(120, 340);
    expect(cursorLamp.x).not.toBe(120);
    commitLights();
    expect([cursorLamp.x, cursorLamp.y]).toEqual([120, 340]);
  });

  it("say when they change, so the scene can wake", () => {
    let woke = 0;
    const stop = onLightChange(() => (woke += 1));
    movePointer(10, 10);
    reportCharge(0.5);
    stop();
    movePointer(20, 20);
    expect(woke).toBe(2);
  });

  it("report the charge only when it really moved", () => {
    const seen: number[] = [];
    const stop = onCharge((c) => seen.push(c));
    reportCharge(0.2);
    reportCharge(0.201); // below the threshold: the cursor's own loop reporting the same value
    reportCharge(0.4);
    stop();
    expect(seen).toEqual([0.2, 0.4]);
  });
});

/*
 * Light-system design, step A: everything about a light lives in the lights,
 * and nothing else reads a knob for a light value or writes a light's colour.
 * That is what lets a light be off and mean it: the resting edge glowed
 * because two lights (the room, the liquid library's own) lived outside any
 * list.
 */
describe("the lights are the only source of light values", () => {
  it("carry position, height, size, colour and strength", async () => {
    const { roomLight, lampPower, LAMP_COLOUR } = await import("./lights");
    const { t } = await import("@fx/lib/tuning");
    expect(cursorLamp.height).toBe(t("shadowHeight"));
    expect(cursorLamp.radius).toBe(t("shadowSoftness"));
    expect(cursorLamp.gain).toBe(t("coreGain"));
    expect(cursorLamp.colour).toEqual(LAMP_COLOUR);
    expect(roomLight.gain).toBe(t("roomBrightness"));
    expect(lights).toContain(roomLight);
    expect(lampPower()).toBeGreaterThan(0);
  });

  it("are the only thing that reads the light knobs or names the lamp's colour", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join, relative } = await import("node:path");
    const root = join(__dirname, "../..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(root);
    const knob =
      /\bt\(\s*"(coreGain|shadowHeight|shadowSoftness|roomBrightness)"\s*\)|tuning\[\s*"(coreGain|shadowHeight|shadowSoftness|roomBrightness)"\s*\]/;
    const colour = /1\.0,\s*0\.94,\s*0\.84/;
    const offenders = files
      .map((p) => relative(root, p))
      .filter((p) => p !== "effects/light/lights.ts")
      .filter((p) => {
        const src = readFileSync(join(root, p), "utf8");
        return knob.test(src) || colour.test(src);
      });
    expect(offenders).toEqual([]);
  });
});

/*
 * Step B: every light-drawing pass declares the same lights and loops over
 * them, so a light added to the list reaches every pass.
 */
describe("the passes loop over the lights", () => {
  it("glass and floor include the lights chunk once and read no single-lamp uniform", async () => {
    const { LIGHTS_GLSL } = await import("./light-uniforms");
    const { GLASS_LIGHT_FRAGMENT_SHADER } = await import("@fx/lib/glass-light-shader");
    const { FLOOR_FRAGMENT_SHADER } = await import("@fx/lib/floor-light-shader");
    for (const src of [GLASS_LIGHT_FRAGMENT_SHADER, FLOOR_FRAGMENT_SHADER]) {
      expect(src.split(LIGHTS_GLSL).length - 1).toBe(1);
      expect(src).toMatch(/for \(int i = 0; i < MAX_LIGHTS; i\+\+\)/);
      expect(src).toContain("if (i >= uLightCount) break;");
      for (const gone of [
        "uLight;",
        "uCharge",
        "uLightHeight",
        "uLampPower",
        "uLightSize",
        "uLampColour",
      ]) {
        expect(src).not.toContain(gone);
      }
    }
  });

  // Item 19: each light's floor in its own colour, not the first light's for all.
  it("the floor sums each light in its own colour", async () => {
    const { FLOOR_FRAGMENT_SHADER } = await import("@fx/lib/floor-light-shader");
    expect(FLOOR_FRAGMENT_SHADER).toContain("coloured += one.rgb * uLightColour[i];");
    expect(FLOOR_FRAGMENT_SHADER).not.toMatch(/vec3 warm = uLightColour\[0\];/);
  });
});

// Item 22: the road flare.
describe("the road flare", () => {
  it("flickers inside its bounds and sputters now and then", async () => {
    const { flareFlickerAt } = await import("./lights");
    let low = 1;
    let high = 0;
    for (let s = 0; s < 20; s += 0.01) {
      const v = flareFlickerAt(s);
      low = Math.min(low, v);
      high = Math.max(high, v);
    }
    expect(low).toBeGreaterThanOrEqual(0.4);
    expect(high).toBeLessThanOrEqual(1.05);
    // A sputter drops it well below the throb's floor.
    expect(low).toBeLessThan(0.62);
    expect(high - low).toBeGreaterThan(0.3);
  });

  it("puffs at a buoyant flame's frequency for its size, near 9.5 Hz", async () => {
    const { flareFlickerAt } = await import("./lights");
    const { puffingHz, FLARE_END } = await import("./flame");
    expect(puffingHz(FLARE_END)).toBeCloseTo(1.5 / Math.sqrt(0.025), 6);
    // The strongest line in its spectrum above 2 Hz is the puffing.
    const rate = 200;
    const n = 2000;
    let best = 0;
    let bestHz = 0;
    for (let hz = 2; hz <= 40; hz += 0.1) {
      let re = 0;
      let im = 0;
      for (let i = 0; i < n; i++) {
        const v = flareFlickerAt(i / rate);
        re += v * Math.cos((2 * Math.PI * hz * i) / rate);
        im += v * Math.sin((2 * Math.PI * hz * i) / rate);
      }
      const power = re * re + im * im;
      if (power > best) {
        best = power;
        bestHz = hz;
      }
    }
    expect(bestHz).toBeGreaterThan(9);
    expect(bestHz).toBeLessThan(10);
  });

  it("sputters now and then, and recovers within a fraction of a second", async () => {
    const { sputterAt } = await import("./flame");
    let events = 0;
    let was = 0;
    for (let s = 0; s < 60; s += 0.005) {
      const v = sputterAt(s);
      if (v > 0.5 && was <= 0.5) events += 1;
      was = v;
    }
    // About 0.75 a second.
    expect(events).toBeGreaterThan(20);
    expect(events).toBeLessThan(70);
    // Recovered to under a fifth within a quarter second of any peak --
    // unless the next one has broken off by then.
    for (let s = 0; s < 60; s += 0.01) {
      if (sputterAt(s) > 0.55 && sputterAt(s - 0.01) < sputterAt(s)) {
        let another = false;
        for (let u = s + 0.005; u <= s + 0.25; u += 0.005) {
          if (sputterAt(u) > sputterAt(u - 0.005) + 0.01) another = true;
        }
        if (!another) expect(sputterAt(s + 0.25)).toBeLessThan(0.2);
      }
    }
  });

  it("is in the light list only while it burns", async () => {
    const { flareLight, pointLights, strongestCharge } = await import("./lights");
    flareLight.charge = 0;
    expect(pointLights()).not.toContain(flareLight);
    flareLight.charge = 1;
    expect(pointLights()).toContain(flareLight);
    expect(strongestCharge()).toBe(1);
    flareLight.charge = 0;
  });
});

// Item 25c: line lights (a neon tube) light each point from its nearest point.
describe("line lights", () => {
  it("are the point itself with no span, and the nearest point on the segment with one", async () => {
    const { nearestOnLight, LIGHTS_GLSL } = await import("./light-uniforms");
    expect(nearestOnLight([30, 40], [0, 0])).toEqual([0, 0]);
    // A tube from x = -100 to 100 at y = 0.
    expect(nearestOnLight([30, 40], [0, 0], [100, 0])).toEqual([30, 0]);
    expect(nearestOnLight([300, 40], [0, 0], [100, 0])).toEqual([100, 0]);
    expect(nearestOnLight([-300, -5], [0, 0], [100, 0])).toEqual([-100, 0]);
    expect(LIGHTS_GLSL).toContain("vec2 nearestOnLight(vec2 p, vec2 c, vec2 h)");
  });

  it("are what both passes light from", async () => {
    const { GLASS_LIGHT_FRAGMENT_SHADER } = await import("@fx/lib/glass-light-shader");
    const { FLOOR_FRAGMENT_SHADER } = await import("@fx/lib/floor-light-shader");
    expect(GLASS_LIGHT_FRAGMENT_SHADER).toContain(
      "vec2 lightXY = nearestOnLight(frag, uLightPos[i].xy, uLightSpan[i]);",
    );
    expect(FLOOR_FRAGMENT_SHADER).toContain("nearestOnLight(at, uLightPos[i].xy, uLightSpan[i])");
  });
});

// Item 25b: a black light's UV reaches by the physical falloff, far past the lamp's stylised reach.
describe("the physical falloff", () => {
  it("is the inverse square with the slant, 1 straight under the light", async () => {
    const { irradianceFalloff } = await import("@fx/effects/optics/transmission");
    expect(irradianceFalloff(0, 300)).toBeCloseTo(1, 6);
    // At a distance equal to the height: cos^3 of 45 degrees.
    expect(irradianceFalloff(300, 300)).toBeCloseTo(Math.pow(0.5, 1.5), 6);
    // Still a tenth of the light nearly two heights away -- plainly visible in the dark.
    expect(irradianceFalloff(560, 300)).toBeGreaterThan(0.1);
  });

  it("is what the glass's fluorescence reads", async () => {
    const { GLASS_LIGHT_FRAGMENT_SHADER } = await import("@fx/lib/glass-light-shader");
    expect(GLASS_LIGHT_FRAGMENT_SHADER).toContain("uvCos * uvCos * uvCos");
  });
});
