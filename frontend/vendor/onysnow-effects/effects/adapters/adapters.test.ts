import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Light-system design, step C: the CSS layers and the liquid glass get their
 * light and matter through these adapters and nowhere else.
 */
const root = join(__dirname, "../..");
function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
    }
  };
  walk(root);
  return out.map((p) => relative(root, p));
}

describe("the adapters are the only way light reaches CSS and the liquid glass", () => {
  it("only the CSS adapter writes a light variable", () => {
    const lightVar = /setProperty\(\s*["'`]--(lit-|reflect-|cast-|lamp-|glow-on)/;
    const offenders = sources()
      .filter((p) => p !== "effects/adapters/css-vars.ts")
      .filter((p) => lightVar.test(readFileSync(join(root, p), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("only the liquid adapter writes a pane's data-config", () => {
    const write = /dataset\[\s*["']config["']\s*\]\s*=[^=]/;
    const offenders = sources()
      .filter((p) => p !== "effects/adapters/liquid-config.ts")
      .filter((p) => write.test(readFileSync(join(root, p), "utf8")));
    expect(offenders).toEqual([]);
  });
});
