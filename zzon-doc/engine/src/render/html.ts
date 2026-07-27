/**
 * Self-contained interactive HTML packaging (DESIGN §8 variant 1).
 *
 * One file, zero external requests: theme CSS variables, the interactive SVG
 * inline, a toolbar (zoom reset / theme toggle / auto-generated layer
 * toggles), INTERACTION_JS, and the vendored font subset to exactly the
 * glyphs the scene uses, embedded as base64 woff2 data URIs.
 *
 * Output is byte-stable for identical scenes: glyph sets are sorted
 * (GlyphCollector), subsetting is deterministic, and nothing here reads
 * clocks or randomness.
 */
import subsetFont from "subset-font";
import type { Scene } from "../layout/scene.ts";
import { FONT_FAMILY, GlyphCollector, fontFileBuffer } from "../text/metrics.ts";
import { INTERACTION_JS } from "./interactions.ts";
import { FLOW_CSS, FLOW_JS, renderFlowUiHtml } from "./flows.ts";
import { SIDEBAR_CSS, SIDEBAR_HTML, SIDEBAR_JS } from "./sidebar.ts";
import { cardCssVars } from "./card.ts";
import { LEGEND_CSS, renderLegendHtml } from "./legend.ts";
import { escapeXml, renderInteractiveSvg } from "./svg.ts";
import { themeVars } from "./theme.ts";

/** Chrome strings rendered by the toolbar/JS — their glyphs must survive subsetting. */
const UI_TEXT = "Reset view Theme 0123456789 Connections Details: ()×→←·";

function buildCss(regularB64: string, semiboldB64: string): string {
  return [
    `@font-face{font-family:${FONT_FAMILY};font-weight:400;font-style:normal;` +
      `src:url(data:font/woff2;base64,${regularB64}) format("woff2")}`,
    `@font-face{font-family:${FONT_FAMILY};font-weight:600;font-style:normal;` +
      `src:url(data:font/woff2;base64,${semiboldB64}) format("woff2")}`,
    // theme variables: light default, explicit data-theme wins, OS preference
    // covers the no-JS case (interactions.ts stamps data-theme on load)
    `:root{${themeVars("light")}${cardCssVars("light")}}`,
    `:root[data-theme="dark"]{${themeVars("dark")}${cardCssVars("dark")}--table-head:#1D2739;--table-border:#2E3B50;--table-zebra:rgba(125,137,152,0.12);--table-accent:#34D399;--table-fk:#38BDF8;--card:#1F2937;--border:#334155;--muted:#2B3648;--muted-foreground:#94A3B8;}`,
    `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${themeVars("dark")}}}`,
    `html,body{margin:0;height:100%;background:var(--ia-canvas);color:var(--ia-text);` +
      `font-family:${FONT_FAMILY},sans-serif}`,
    `#ia-toolbar{display:flex;gap:12px;align-items:center;height:48px;padding:0 16px;` +
      `box-sizing:border-box;border-bottom:1px solid rgba(125,137,152,.35);font-size:13px}`,
    `#ia-toolbar strong{margin-right:auto}`,
    `#ia-toolbar button{font:inherit;background:none;border:1px solid rgba(125,137,152,.5);` +
      `border-radius:4px;color:inherit;padding:2px 10px;cursor:pointer}`,
    `#ia-layers{display:flex;gap:10px;align-items:center}`,
    `#ia-layers label{display:flex;gap:4px;align-items:center;cursor:pointer}`,
    `main{position:relative}`,
    `svg.ia-svg{display:block;width:100%;height:calc(100vh - 48px);cursor:grab}`,
    `.node,.edge{transition:opacity .15s ease}`,
    `.dim{opacity:var(--ia-dim)}`,
    `.hl{opacity:1}`,
    `.pulse{animation:ia-pulse .6s ease-in-out 4}`,
    `@keyframes ia-pulse{50%{opacity:.2}}`,
    `#ia-tooltip{position:absolute;z-index:10;max-width:320px;padding:8px 10px;` +
      `border-radius:4px;background:var(--ia-canvas);color:var(--ia-text);` +
      `border:1px solid rgba(125,137,152,.5);box-shadow:0 2px 8px rgba(0,0,0,.25);` +
      `font-size:12px;line-height:1.5}`,
    `#ia-tooltip .k{font-weight:600;margin-right:6px}`,
  ].join("\n");
}

export async function renderHtml(scene: Scene): Promise<string> {
  const title = scene.title ?? scene.id;

  // Every glyph the page can display: scene texts + toolbar chrome + layer
  // names (shown next to the checkboxes) + step-marker digits.
  const glyphs = new GlyphCollector();
  glyphs.add(UI_TEXT);
  glyphs.add(title);
  for (const t of scene.texts) glyphs.add(t);
  for (const e of scene.edges) if (e.layer) glyphs.add(e.layer);
  for (const m of scene.markers) glyphs.add(String(m.n));
  const chars = glyphs.toString();

  const [regular, semibold] = await Promise.all([
    subsetFont(fontFileBuffer("regular"), chars, { targetFormat: "woff2" }),
    subsetFont(fontFileBuffer("semibold"), chars, { targetFormat: "woff2" }),
  ]);

  const svg = renderInteractiveSvg(scene);
  const css =
    buildCss(regular.toString("base64"), semibold.toString("base64")) +
    "\n" + FLOW_CSS + "\n" + SIDEBAR_CSS + "\n" + LEGEND_CSS;

  return [
    "<!doctype html>",
    `<html lang="en">`,
    "<head>",
    `<meta charset="utf-8"/>`,
    `<meta name="viewport" content="width=device-width, initial-scale=1"/>`,
    `<title>${escapeXml(title)}</title>`,
    `<style>${css}</style>`,
    "</head>",
    "<body>",
    `<header id="ia-toolbar"><strong>${escapeXml(title)}</strong>` +
      `<span id="ia-layers"></span>` +
      `<button id="ia-reset" type="button">Reset view</button>` +
      `<button id="ia-theme" type="button">Theme</button></header>`,
    `<main>${renderFlowUiHtml(scene)}${svg}${renderLegendHtml(scene)}</main>`,
    SIDEBAR_HTML,
    `<script>${INTERACTION_JS}</script>`,
    `<script>${FLOW_JS}</script>`,
    `<script>${SIDEBAR_JS}</script>`,
    "</body>",
    "</html>",
  ].join("\n");
}
