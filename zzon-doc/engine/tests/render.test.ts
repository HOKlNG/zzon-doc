/**
 * Renderer tests against the hand-placed fixture scene: the two SVG variants
 * plus the canvas adapter bundle (viewer-frame contract §2/§3). The full
 * framed HTML is exercised only when the frame module exists (F1 artifact —
 * the engine must stay green while the frame is built in parallel).
 */
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeRenderScene, renderScene } from "./fixtures/render-scene.ts";
import { renderInteractiveSvg } from "../src/render/svg.ts";
import { renderStaticSvg } from "../src/render/static-svg.ts";
import { buildCanvas } from "../src/render/adapter.ts";
import { buildPayload } from "../src/render/payload.ts";
import { renderHtml } from "../src/render/html.ts";
import { CANVAS_JS } from "../src/render/interactions.ts";
import { THEMES } from "../src/render/theme.ts";

const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

const FRAME_PATH = fileURLToPath(
  new URL("../../skills/zzon-doc/scripts/viewer-frame.js", import.meta.url),
);
const frameExists = existsSync(FRAME_PATH);

describe("renderInteractiveSvg", () => {
  const svg = renderInteractiveSvg(renderScene);

  test("one <symbol> def per distinct icon", () => {
    expect(count(svg, "<symbol ")).toBe(renderScene.icons.length); // 7
  });

  test("data-path on every group and node", () => {
    for (const p of [
      "region",
      "region/vpc",
      "region/vpc/eks",
      "region/vpc/korean",
      "region/vpc/nat",
      "region/vpc/karpenter",
      "overlay/karpenter-pool",
    ]) {
      expect(svg).toContain(`data-path="${p}"`);
    }
  });

  test("edges carry id + endpoints + resolved style", () => {
    expect(svg).toContain('data-edge-id="e1"');
    expect(svg).toContain('data-from="region/vpc/eks"');
    expect(svg).toContain('data-to="region/vpc/nat"');
    expect(svg).toContain('stroke-dasharray="2 3"'); // dotted preset baked
    expect(svg).toContain('marker-start="url(#arw-ED7100)"'); // arrowhead "both"
  });

  test("layer classes stay on edges", () => {
    expect(count(svg, "layer-network")).toBe(2);
    expect(count(svg, "layer-deploy")).toBe(1);
  });

  test("one arrowhead <marker> per distinct color", () => {
    expect(count(svg, "<marker ")).toBe(3); // #545B64, #8C4FFF, #ED7100
  });

  test("step markers: black circle r=11 + white number, at highest z", () => {
    expect(count(svg, 'r="11"')).toBe(2);
    expect(svg.lastIndexOf('class="markers"')).toBeGreaterThan(svg.lastIndexOf('class="nodes"'));
  });

  test("stack visual: two offset shadow rects", () => {
    expect(count(svg, 'class="stack-shadow"')).toBe(2);
  });

  test("multi-line label rendered as tspans", () => {
    expect(count(svg, "<tspan ")).toBe(2);
    expect(svg).toContain(">Gateway</tspan>");
  });

  test("user strings escaped (meta with < & \")", () => {
    expect(svg).toContain("&quot;quoted");
    expect(svg).toContain("a&lt;b");
    expect(svg).not.toContain('a<b');
  });

  test("Korean label present as real text", () => {
    expect(svg).toContain("프라이빗 서브넷");
  });

  test("deterministic output", () => {
    expect(renderInteractiveSvg(renderScene)).toBe(svg);
  });

  test("icon <style> rules never leak into the document", () => {
    // x.karpenter ships "path{fill:#5C62B0}" — document-scoped CSS that would
    // repaint every edge/text path; the rule must instead be stamped onto the
    // symbol's own fill-less paths as presentation attributes.
    expect(svg).not.toContain("<style");
    const karpenter = svg.match(/<symbol id="i-x_karpenter"[\s\S]*?<\/symbol>/)?.[0] ?? "";
    expect(karpenter).toContain('fill="#5C62B0"');
  });
});

describe("renderStaticSvg", () => {
  const stat = renderStaticSvg(renderScene);

  test("no <text> elements — all text outlined to paths", () => {
    expect(stat).not.toContain("<text");
    expect(stat).not.toContain("<tspan");
  });

  test("no classes, scripts, data attributes, or CSS variables", () => {
    expect(stat).not.toContain("class=");
    expect(stat).not.toContain("<script");
    expect(stat).not.toContain("data-");
    expect(stat).not.toContain("var(--");
  });

  test("same number of icon <use> references as interactive", () => {
    const inter = renderInteractiveSvg(renderScene);
    expect(count(stat, '<use href="#i-')).toBe(count(inter, '<use href="#i-')); // 7
    expect(count(stat, '<use href="#i-')).toBe(7);
  });

  test("theme literals baked as presentation attributes", () => {
    expect(stat).toContain(`fill="${THEMES.light.canvas}"`);
    const dark = renderStaticSvg(renderScene, "dark");
    expect(dark).toContain(`fill="${THEMES.dark.canvas}"`);
    expect(dark).not.toContain("class=");
  });

  test("deterministic output", () => {
    expect(renderStaticSvg(renderScene)).toBe(stat);
  });
});

describe("buildCanvas (adapter bundle)", () => {
  test("markup is the interactive SVG, js is the adapter runtime", async () => {
    const canvas = await buildCanvas(renderScene);
    expect(canvas.markup).toBe(renderInteractiveSvg(renderScene));
    expect(canvas.js).toBe(CANVAS_JS);
  }, 30_000);

  test("css: embedded woff2 subset + canvas var namespaces, light and dark", async () => {
    const { css } = await buildCanvas(renderScene);
    expect(count(css, "data:font/woff2;base64,")).toBe(2); // regular + semibold
    for (const ns of ["--ia-canvas:", "--cat-backend:", "--table-head:", "--flow:"]) {
      expect(css).toContain(ns);
    }
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain("@media (prefers-color-scheme:dark)");
    // canvas-side flow badge rules ride along (split from the old FLOW_CSS)
    expect(css).toContain(".flow-badges{display:none}");
    // sonar selection ring + reduced-motion opt-out
    expect(css).toContain("ia-sonar");
    expect(css).toContain("prefers-reduced-motion");
    // no frame-chrome selectors in canvas css
    expect(css).not.toContain("--frame-");
    expect(css).not.toContain("#ia-toolbar");
  }, 30_000);

  test("adapter runtime registers with the frame and stays embedding-safe", () => {
    expect(CANVAS_JS).toContain("window.__zzonFrame");
    expect(CANVAS_JS).toContain("register(adapter)");
    for (const member of [
      "highlight:",
      "setLabelMode:",
      "fit:",
      "reset:",
      "canvasShift:",
      "refresh:",
      '"export":',
      "toolbarExtras:",
      "onNodeSelected",
      "onNodeActivated",
      "onStepClicked",
      "onHover",
    ]) {
      expect(CANVAS_JS).toContain(member);
    }
    expect(CANVAS_JS).not.toContain("</" + "script>");
    expect(CANVAS_JS).not.toContain("`");
    expect(CANVAS_JS).not.toContain("${");
  });

  test("byte-stable for identical scenes", async () => {
    const a = await buildCanvas(renderScene);
    const b = await buildCanvas(renderScene);
    expect(a.css).toBe(b.css);
    expect(a.markup).toBe(b.markup);
  }, 30_000);

  test("Korean glyphs survive subsetting (font shrinks without them)", async () => {
    const grabFont = (css: string): string => {
      const m = css.match(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/);
      if (!m?.[1]) throw new Error("no embedded woff2 found");
      return m[1];
    };
    const withKorean = grabFont((await buildCanvas(renderScene)).css);
    const withoutKorean = grabFont((await buildCanvas(makeRenderScene({ omitKorean: true }))).css);
    expect(withKorean).not.toBe(withoutKorean);
    expect(withKorean.length).toBeGreaterThan(withoutKorean.length);
  }, 30_000);
});

describe("renderHtml (frame packaging)", () => {
  test.skipIf(frameExists)("missing frame module fails loudly", async () => {
    const payload = buildPayload(renderScene);
    const canvas = await buildCanvas(renderScene);
    await expect(renderHtml(payload, canvas)).rejects.toThrow("viewer-frame");
  }, 30_000);

  test.skipIf(!frameExists)("frame wraps the canvas: chrome + svg in one file", async () => {
    const payload = buildPayload(renderScene);
    const canvas = await buildCanvas(renderScene);
    const html = await renderHtml(payload, canvas);
    expect(html).toContain(canvas.markup); // our SVG, verbatim
    expect(html).toContain('class="ia-svg"');
    expect(html).toContain("data:font/woff2;base64,"); // canvas css inlined
    expect(html).toContain("__zzonFrame"); // adapter registration wired
  }, 30_000);
});
