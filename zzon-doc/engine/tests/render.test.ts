/**
 * Renderer 2-variant tests (DESIGN §8) against the hand-placed fixture scene.
 */
import { describe, expect, test } from "bun:test";
import { makeRenderScene, renderScene } from "./fixtures/render-scene.ts";
import { renderInteractiveSvg } from "../src/render/svg.ts";
import { renderStaticSvg } from "../src/render/static-svg.ts";
import { renderHtml } from "../src/render/html.ts";
import { INTERACTION_JS } from "../src/render/interactions.ts";
import { THEMES } from "../src/render/theme.ts";

const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

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

  test("layer classes for the HTML toggles", () => {
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

describe("renderHtml", () => {
  test("embeds woff2 data URIs + INTERACTION_JS, byte-stable", async () => {
    const a = await renderHtml(renderScene);
    const b = await renderHtml(renderScene);
    expect(a).toContain("data:font/woff2;base64,");
    expect(a).toContain(INTERACTION_JS);
    expect(a).toContain("<title>Render Fixture</title>");
    expect(a).toBe(b);
  }, 30_000);

  test("Korean glyphs survive subsetting (payload shrinks without them)", async () => {
    const grabFont = (html: string): string => {
      const m = html.match(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/);
      if (!m?.[1]) throw new Error("no embedded woff2 found");
      return m[1];
    };
    const withKorean = grabFont(await renderHtml(renderScene));
    const withoutKorean = grabFont(await renderHtml(makeRenderScene({ omitKorean: true })));
    expect(withKorean).not.toBe(withoutKorean);
    expect(withKorean.length).toBeGreaterThan(withoutKorean.length);
  }, 30_000);
});
