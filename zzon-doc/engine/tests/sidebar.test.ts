/**
 * Sidebar data-attribute tests — the canvas-side remnant after the engine
 * diet. The sidebar panel, docs-shell postMessage protocol, and theme sync
 * are FRAME chrome now (viewer-frame contract §2/§4) and are tested with the
 * frame; the canvas only stamps payload-mirroring data-* hooks on nodes.
 */
import { describe, expect, test } from "bun:test";
import type { SceneNode } from "../src/layout/scene.ts";
import { sidebarDataAttrs } from "../src/render/sidebar.ts";

const makeNode = (extra: Partial<SceneNode> = {}): SceneNode => ({
  kind: "node",
  path: "app/api",
  rect: { x: 0, y: 0, width: 96, height: 72 },
  ...extra,
});

const label = (text: string): SceneNode["label"] => ({
  text,
  x: 0,
  y: 0,
  fontSize: 12,
  weight: "regular",
  align: "middle",
});

describe("sidebarDataAttrs", () => {
  test("emits all five attrs, each only when present", () => {
    const full = sidebarDataAttrs(
      makeNode({
        label: label("API"),
        category: "service",
        tech: "NestJS",
        description: "Serves the API",
        href: "api-detail",
      }),
    );
    expect(full).toBe(
      ' data-label="API" data-category="service" data-tech="NestJS"' +
        ' data-desc="Serves the API" data-href="api-detail"',
    );
    expect(sidebarDataAttrs(makeNode())).toBe("");
    const hrefOnly = sidebarDataAttrs(makeNode({ href: "billing" }));
    expect(hrefOnly).toBe(' data-href="billing"');
  });

  test("escapes user strings (label with < & \")", () => {
    const out = sidebarDataAttrs(makeNode({ label: label('a<b & "q"'), description: "x>'y'" }));
    expect(out).toContain('data-label="a&lt;b &amp; &quot;q&quot;"');
    expect(out).toContain("data-desc=\"x&gt;&apos;y&apos;\"");
    expect(out).not.toContain("a<b");
    expect(out).not.toContain('"q"');
  });
});
