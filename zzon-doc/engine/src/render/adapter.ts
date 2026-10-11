/**
 * Canvas adapter bundle (viewer-frame contract §2/§3) — everything the frame
 * needs from the engine canvas, as three self-contained strings:
 *
 *   markup  interactive SVG (stable classes + data-* hooks, flow badges inside)
 *   css     asset contract §3: the canvas' OWN custom-property definitions
 *           (--ia-* / --cat-* / --table-* / --flow, light + dark) — namespace
 *           separated from the frame's --frame-* tokens — plus canvas-only
 *           rules (highlight/dim/sonar/labels, flow badge rules split from the
 *           old FLOW_CSS) and the embedded Pretendard subset. FRAME_GLYPHS
 *           (the frame's full chrome text) is merged into the subset input so
 *           chrome strings render in the same embedded font.
 *   js      IIFE implementing the full adapter interface and calling
 *           window.__zzonFrame.register (interactions.ts).
 *
 * Output is byte-stable for identical scenes: glyph sets are sorted
 * (GlyphCollector), subsetting is deterministic, nothing reads clocks or
 * randomness.
 */
import subsetFont from "subset-font";
import type { Scene } from "../layout/scene.ts";
import { FONT_FAMILY, GlyphCollector, fontFileBuffer } from "../text/metrics.ts";
import { renderInteractiveSvg } from "./svg.ts";
import { themeVars } from "./theme.ts";
import { DEFAULT_EDGE_COLOR } from "../route/router.ts";
import { cardCssVars } from "./card.ts";
import { FLOW_BADGE_CSS } from "./flows.ts";
import { CANVAS_JS } from "./interactions.ts";
import { loadViewerFrame } from "./html.ts";
import type { ViewerPayload } from "./payload.ts";

export interface CanvasBundle {
  markup: string;
  css: string;
  js: string;
}

// ------------------------------------------------------------ CSS pieces

/** light-theme surface + table + flow tokens (explicit definitions, not just
 * fallbacks buried in var() usages — the asset contract says the canvas
 * DEFINES its custom properties) */
const LIGHT_EXTRA =
  `--flow:#4f46e5;` +
  `--card:#ffffff;--border:#e4e4e7;--muted:#f4f4f5;--muted-foreground:#71717a;` +
  `--table-head:#f4f4f5;--table-border:#d4d4d8;--table-zebra:rgba(113,113,122,0.07);` +
  `--table-accent:#10B981;--table-fk:#0284C7;`;

/** dark-theme overrides (previously inlined in the old html.ts) */
const DARK_EXTRA =
  `--flow:#6366f1;` +
  `--card:#141417;--border:#2a2a2e;--muted:#1f1f23;--muted-foreground:#a1a1aa;` +
  `--table-head:#1f1f23;--table-border:#3f3f46;--table-zebra:rgba(161,161,170,0.07);` +
  `--table-accent:#34D399;--table-fk:#38BDF8;`;

const lightVars = (): string => themeVars("light") + cardCssVars("light") + LIGHT_EXTRA;
const darkVars = (): string => themeVars("dark") + cardCssVars("dark") + DARK_EXTRA;

/** canvas-only behavior rules; chrome selectors live in the frame */
const CANVAS_RULES: string = [
  `svg.ia-svg{display:block;width:100%;height:100%;cursor:grab;touch-action:none;` +
    `transition:transform .2s ease}`,
  `svg.ia-svg:active{cursor:grabbing}`,
  `.node,.edge{transition:opacity .15s ease}`,
  // default line color follows the theme (the markup carries the light literal for the static export)
  `svg.ia-svg [stroke="${DEFAULT_EDGE_COLOR}"]{stroke:var(--ia-edge)}`,
  `svg.ia-svg [fill="${DEFAULT_EDGE_COLOR}"]{fill:var(--ia-edge)}`,
  `.dim{opacity:var(--ia-dim,.25)}`,
  `.hl{opacity:1}`,
  // zoom-linked label auto-hide (adapter setLabelMode; runtime toggles the class)
  `svg.ia-svg.labels-off .edge text{opacity:0}`,
  // sonar selection ring (legacy 선택 링), reduced-motion falls back to a static glow
  `@keyframes ia-sonar{0%{filter:drop-shadow(0 0 0px rgba(79,70,229,.85))}` +
    `70%{filter:drop-shadow(0 0 9px rgba(79,70,229,0))}` +
    `100%{filter:drop-shadow(0 0 0px rgba(79,70,229,0))}}`,
  `.node.sel{animation:ia-sonar 1.6s ease-out infinite}`,
  `@media (prefers-reduced-motion:reduce){.node.sel{animation:none;` +
    `filter:drop-shadow(0 0 4px rgba(79,70,229,.65))}` +
    `svg.ia-svg{transition:none}}`,
].join("\n");

// ------------------------------------------------------------ glyphs

/** every string the FRAME renders from the payload (chrome-side data text) */
function collectPayloadGlyphs(g: GlyphCollector, p: ViewerPayload): void {
  g.add(p.title);
  g.add(p.kind);
  if (p.description) g.add(p.description);
  for (const w of p.warnings) g.add(w);
  for (const n of p.nodes) {
    g.add(n.label);
    if (n.category) g.add(n.category);
    if (n.tech) g.add(n.tech);
    if (n.description) g.add(n.description);
    if (n.href) g.add(n.href);
    for (const c of n.table?.columns ?? []) {
      g.add(c.name);
      if (c.type) g.add(c.type);
      if (c.fk) g.add(`${c.fk.table}${c.fk.column}`);
    }
  }
  for (const e of p.edges) {
    if (e.label) g.add(e.label);
    if (e.layer) g.add(e.layer);
  }
  for (const f of p.flows) {
    g.add(f.title);
    if (f.description) g.add(f.description);
    for (const s of f.steps) {
      g.add(s.text);
      g.add(String(s.n));
    }
  }
  for (const l of p.legend) g.add(l.label);
}

/**
 * @font-face rules embedding Pretendard regular + semibold, subset to `chars`.
 * Also used by the skill shells (index, wiki, sequence viewer) through
 * `bun ia font-css`, so every page renders in the same face.
 */
export async function fontFaceCss(chars: string): Promise<string> {
  const [regular, semibold] = await Promise.all([
    subsetFont(fontFileBuffer("regular"), chars, { targetFormat: "woff2" }),
    subsetFont(fontFileBuffer("semibold"), chars, { targetFormat: "woff2" }),
  ]);
  return [
    `@font-face{font-family:${FONT_FAMILY};font-weight:400;font-style:normal;font-display:block;` +
      `src:url(data:font/woff2;base64,${regular.toString("base64")}) format("woff2")}`,
    `@font-face{font-family:${FONT_FAMILY};font-weight:600 800;font-style:normal;font-display:block;` +
      `src:url(data:font/woff2;base64,${semibold.toString("base64")}) format("woff2")}`,
  ].join("\n");
}

// ------------------------------------------------------------ entry point

/**
 * Build the canvas bundle for one finished Scene. When `payload` is given
 * its strings join the glyph set (the frame renders them in the same
 * embedded font); FRAME_GLYPHS is merged whenever the frame module exists.
 */
export async function buildCanvas(scene: Scene, payload?: ViewerPayload): Promise<CanvasBundle> {
  const glyphs = new GlyphCollector();
  glyphs.add(scene.title ?? scene.id);
  glyphs.add("0123456789·×→←()");
  for (const t of scene.texts) glyphs.add(t);
  for (const e of scene.edges) if (e.layer) glyphs.add(e.layer);
  for (const m of scene.markers) glyphs.add(String(m.n));
  if (payload) collectPayloadGlyphs(glyphs, payload);
  // contract §3: frame chrome strings MUST be in the subset input
  const frame = await loadViewerFrame();
  if (frame) glyphs.add(frame.FRAME_GLYPHS);
  const css = [
    await fontFaceCss(glyphs.toString()),
    // canvas variables: light default; explicit data-theme wins (the frame
    // stamps it at boot — seq semantics); the media query covers no-JS
    `:root{${lightVars()}}`,
    `:root[data-theme="dark"]{${darkVars()}}`,
    `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${darkVars()}}}`,
    CANVAS_RULES,
    FLOW_BADGE_CSS,
  ].join("\n");

  return { markup: renderInteractiveSvg(scene), css, js: CANVAS_JS };
}
