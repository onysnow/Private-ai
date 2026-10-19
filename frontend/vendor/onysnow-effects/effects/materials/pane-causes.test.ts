import { describe, expect, it } from "vitest";
import { readPaneCauses } from "./pane-causes";

const el = (attrs: Record<string, string>) => ({ getAttribute: (n: string) => attrs[n] ?? null });
const defaults = { frost: 0.45, gap: 70 };

describe("what a pane is made of", () => {
  it("takes the site's Frost setting when its glass is etched", () => {
    expect(readPaneCauses(el({}), defaults).material.frost).toBe(0.45);
    expect(readPaneCauses(el({ "data-material": "frosted-float" }), defaults).material.frost).toBe(
      0.45,
    );
  });

  it("stays polished when its glass is polished", () => {
    expect(readPaneCauses(el({ "data-material": "optical-crown" }), defaults).material.frost).toBe(
      0,
    );
    expect(readPaneCauses(el({ "data-material": "dense-flint" }), defaults).material.frost).toBe(0);
  });
});
