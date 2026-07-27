/**
 * Detail sidebar / docs-shell protocol / theme sync string-contract tests.
 * Pure string assertions — the DOM behavior itself ships as inline JS and is
 * exercised in the browser; here we pin the wire protocol and escaping.
 */
import { describe, expect, test } from "bun:test";
import type { SceneNode } from "../src/layout/scene.ts";
import {
  SIDEBAR_CSS,
  SIDEBAR_HTML,
  SIDEBAR_JS,
  sidebarDataAttrs,
} from "../src/render/sidebar.ts";

const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

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

describe("SIDEBAR_JS protocol + theme contract", () => {
  test("docs-shell postMessage literals", () => {
    expect(SIDEBAR_JS).toContain('type: "zzon:navigate", slug: slug');
    expect(SIDEBAR_JS).toContain('type: "zzon:sidebar", open: !!open');
    expect(SIDEBAR_JS).toContain('"zzon:sidebar-close"');
  });

  test("sibling-slug regex and drilldown fallbacks", () => {
    expect(SIDEBAR_JS).toContain("/^[a-z0-9_-]+$/");
    expect(SIDEBAR_JS).toContain('slug + ".html"');
    expect(SIDEBAR_JS).toContain('"_blank"');
  });

  test("theme: reads zzon-theme (the legacy renderer's missed bug), setter, storage sync", () => {
    expect(SIDEBAR_JS).toContain('localStorage.getItem("zzon-theme")');
    expect(SIDEBAR_JS).toContain('localStorage.setItem("zzon-theme"');
    expect(SIDEBAR_JS).toContain("prefers-color-scheme: dark");
    expect(SIDEBAR_JS).toContain("__zzonSetTheme");
    expect(SIDEBAR_JS).toContain('addEventListener("storage"');
    expect(SIDEBAR_JS).toContain("dataset.theme");
  });

  test("safe to embed verbatim in a <script> inside a template literal", () => {
    expect(SIDEBAR_JS).not.toContain("</" + "script>");
    expect(SIDEBAR_JS).not.toContain("`");
    expect(SIDEBAR_JS).not.toContain("${");
  });
});

describe("SIDEBAR_HTML skeleton", () => {
  test("aside with every populate target", () => {
    expect(SIDEBAR_HTML.startsWith('<aside class="dg-sidebar"')).toBe(true);
    expect(SIDEBAR_HTML.endsWith("</aside>")).toBe(true);
    for (const cls of [
      "dg-sidebar-title",
      "dg-chip dg-chip-category",
      "dg-chip dg-chip-tech",
      "dg-sidebar-desc",
      "dg-sidebar-conns",
      "dg-sidebar-href",
      "dg-sidebar-close",
    ]) {
      expect(SIDEBAR_HTML).toContain(`class="${cls}"`);
    }
  });

  test("balanced tags", () => {
    expect(count(SIDEBAR_HTML, "<div")).toBe(count(SIDEBAR_HTML, "</div>"));
    expect(count(SIDEBAR_HTML, "<span")).toBe(count(SIDEBAR_HTML, "</span>"));
    expect(count(SIDEBAR_HTML, "<ul")).toBe(count(SIDEBAR_HTML, "</ul>"));
    expect(count(SIDEBAR_HTML, "<aside")).toBe(1);
  });
});

describe("SIDEBAR_CSS", () => {
  test("304px right panel with slide-in transition", () => {
    expect(SIDEBAR_CSS).toContain(".dg-sidebar{");
    expect(SIDEBAR_CSS).toContain("width:304px");
    expect(SIDEBAR_CSS).toContain("transition:transform .2s ease");
    expect(SIDEBAR_CSS).toContain(".dg-sidebar.open{transform:translateX(0)");
  });

  test("theme-aware vars with dark overrides", () => {
    expect(SIDEBAR_CSS).toContain("--panel-bg:#FFFFFF");
    expect(SIDEBAR_CSS).toContain(':root[data-theme="dark"]{--panel-bg:#161E2D');
    expect(SIDEBAR_CSS).toContain("@media (prefers-color-scheme:dark)");
    expect(count(SIDEBAR_CSS, "{")).toBe(count(SIDEBAR_CSS, "}"));
  });
});
