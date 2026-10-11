/**
 * The canvas copies colors from skills/zzon-doc/scripts/design-tokens.mjs (the
 * single source for every zzon page). This keeps the copies honest: a canvas
 * that drifts from the shell/viewer palette looks like a different product.
 */
import { describe, expect, test } from "bun:test";
// @ts-expect-error — plain .mjs module outside the engine's TS project
import { THEME } from "../../skills/zzon-doc/scripts/design-tokens.mjs";
import { THEMES } from "../src/render/theme.ts";
import { buildCanvas } from "../src/render/adapter.ts";
import { renderScene as scene } from "./fixtures/render-scene.ts";

const lc = (s: string) => s.toLowerCase();

describe("engine canvas follows the shared design tokens", () => {
  for (const name of ["light", "dark"] as const) {
    test(`${name}: canvas background and text`, () => {
      expect(lc(THEMES[name].canvas)).toBe(THEME[name].bg);
      expect(lc(THEMES[name].text)).toBe(THEME[name].fg);
    });
  }

  test("card surface variables match the tokens in both themes", async () => {
    const { css } = await buildCanvas(scene);
    const block = (sel: string) => {
      const i = css.indexOf(sel + "{");
      return lc(css.slice(i, css.indexOf("}", i)));
    };
    for (const [name, sel] of [["light", ":root"], ["dark", ':root[data-theme="dark"]']] as const) {
      const t = THEME[name];
      const b = block(sel);
      expect(b).toContain(`--card:${t.card};`);
      expect(b).toContain(`--border:${t.border};`);
      expect(b).toContain(`--muted:${t.muted};`);
      expect(b).toContain(`--muted-foreground:${t["muted-fg"]};`);
      expect(b).toContain(`--flow:${t.accent};`);
    }
  });
});
