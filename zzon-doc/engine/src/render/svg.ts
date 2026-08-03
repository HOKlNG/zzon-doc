/**
 * Interactive SVG renderer — variant 1 of the 2-variant renderer (DESIGN §8).
 *
 * Consumes a finished Scene (absolute coordinates, routed edges) and emits
 * SVG markup with stable CSS classes, data-* attributes, and theme CSS
 * variables; html.ts wraps it with styles + INTERACTION_JS. Geometry is
 * NEVER recomputed here — the scene graph is the contract.
 *
 * Z-order: groups (outer→inner, as given) → overlays → edges → nodes →
 * step markers. Output is deterministic: scene arrays are iterated as given,
 * no randomness, no timestamps.
 *
 * This module also exports the shared low-level primitives (escaping, number
 * formatting, edge geometry, overlay style resolution, arrowhead defs)
 * consumed by static-svg.ts so the two variants cannot drift.
 */
import type {
  Scene,
  SceneEdge,
  SceneGroup,
  SceneLabel,
  SceneMarker,
  SceneNode,
  SceneOverlay,
} from "../layout/scene.ts";
import type { Rect } from "../model/geometry.ts";
import type { IconRef } from "../icons/aliases.ts";
import { resolveIcon } from "../icons/aliases.ts";
import { cssId, iconSymbolDefs } from "../icons/load.ts";
import { FONT_FAMILY, measure, type FontWeight } from "../text/metrics.ts";
import { GROUP_STYLES } from "./group-styles.ts";
import { THEME_VAR } from "./theme.ts";
import { sidebarDataAttrs } from "./sidebar.ts";
import { renderFlowBadgesSvg } from "./flows.ts";
import { renderTableSvg, cardinalityMarkerDefs, edgeCardinalityAttrs } from "./table.ts";
import { renderCardSvg } from "./card.ts";

// ------------------------------------------------------------ shared primitives

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * THE escaping helper — every user-supplied string (labels, ids, paths,
 * meta) passes through here before entering markup, in both variants.
 */
export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c);
}

/** SVG number formatting: round to 2 decimals (matches canonicalScene). */
export const fmt = (n: number): string => String(Math.round(n * 100) / 100);

export const STROKE_WIDTH = 1.5;
/** step-marker circle radius (black circle, white number) */
export const MARKER_RADIUS = 11;
/** shadow offsets for the stack visual, drawn back-to-front */
export const STACK_OFFSETS: readonly number[] = [8, 4];
/** neutral gray for stack shadows (matches the "generic" group stroke) */
export const STACK_STROKE = "#7D8998";

export const EDGE_DASH: Record<SceneEdge["style"]["preset"], string | undefined> = {
  default: undefined,
  dotted: "2 3",
  dashed: "6 4",
};

const lineHeights = new Map<string, number>();

/** Line height for multi-line labels (dy between tspans/path lines). */
export function lineHeightFor(fontSize: number, weight: FontWeight): number {
  const key = `${weight}:${fontSize}`;
  let lh = lineHeights.get(key);
  if (lh === undefined) {
    lh = measure("Ag", fontSize, weight).lineHeight;
    lineHeights.set(key, lh);
  }
  return lh;
}

/** Stable id fragment for per-color arrowhead markers. */
export const colorId = (color: string): string => color.replace(/[^a-zA-Z0-9]/g, "");

/** One <marker> per distinct arrowhead color, in first-use order. */
export function arrowMarkerDefs(edges: readonly SceneEdge[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const e of edges) {
    if (e.style.arrowhead === "none" || seen.has(e.style.color)) continue;
    seen.add(e.style.color);
    parts.push(
      `<marker id="arw-${colorId(e.style.color)}" viewBox="0 0 10 10" refX="8.5" refY="5" ` +
        `markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">` +
        `<path d="M0 0L10 5L0 10z" fill="${e.style.color}"/></marker>`,
    );
  }
  return parts.join("\n");
}

/**
 * SVG <style> elements are DOCUMENT-scoped: a rule like "path{fill:#5C62B0}"
 * inside one icon restyles every path in the diagram (CSS wins over
 * presentation attributes — observed live: edge fill="none" turned into
 * giant filled polygons). Some vendored non-AWS icons (x.karpenter) carry
 * such rules, so both variants pass iconSymbolDefs output through here:
 * every <style> block is removed, and a lone "path{fill:<color>}" rule is
 * re-applied as a fill attribute on each fill-less <path> of that symbol
 * (attribute on the element itself, because the rule targeted the elements
 * directly and must keep beating ancestor fills like Inkscape's
 * <g style="fill:none">).
 */
export function sanitizeSymbolStyles(defs: string): string {
  return defs.replace(/<symbol([^>]*)>([\s\S]*?)<\/symbol>/g, (whole, attrs: string, body: string) => {
    if (!/<style[\s>]/.test(body)) return whole;
    let fill: string | undefined;
    let stripped = body.replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (_m, css: string) => {
      fill ??= /(?:^|[^-\w])path\s*\{[^}]*?fill:\s*([^;}!]+)/.exec(css)?.[1]?.trim();
      return "";
    });
    if (fill) {
      stripped = stripped.replace(/<path\b([^>]*?)(\/?)>/g, (m, pAttrs: string, close: string) =>
        /fill\s*[:=]/.test(pAttrs) ? m : `<path${pAttrs} fill="${fill}"${close}>`,
      );
    }
    return `<symbol${attrs}>${stripped}</symbol>`;
  });
}

/** Sanitized <symbol> defs for every icon the scene uses (both variants). */
export function sceneIconDefs(icons: readonly IconRef[]): string {
  return sanitizeSymbolStyles(iconSymbolDefs(icons));
}

export interface EdgeGeometry {
  d: string;
  dash?: string;
  markerStart?: string;
  markerEnd?: string;
}

/** Path data + dash + arrowhead refs for one routed edge (both variants). */
export function edgeGeometry(e: SceneEdge): EdgeGeometry {
  const d = e.points.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`).join("");
  const url = `url(#arw-${colorId(e.style.color)})`;
  return {
    d,
    dash: EDGE_DASH[e.style.preset],
    markerStart: e.style.arrowhead === "both" ? url : undefined,
    markerEnd: e.style.arrowhead !== "none" ? url : undefined,
  };
}

export interface ResolvedOverlayStyle {
  stroke: string;
  strokeDasharray?: string;
  fill: string;
  labelColor: string;
}

/** Overlay styling: explicit style wins, then GroupKind style, then generic. */
export function resolveOverlayStyle(o: SceneOverlay): ResolvedOverlayStyle {
  const base = o.groupKind ? GROUP_STYLES[o.groupKind] : undefined;
  const stroke = o.stroke ?? base?.stroke ?? STACK_STROKE;
  return {
    stroke,
    strokeDasharray: o.strokeDasharray ?? base?.strokeDasharray ?? "4 3",
    fill: o.fill ?? base?.fill ?? "none",
    labelColor: base?.labelColor ?? stroke,
  };
}

// ------------------------------------------------------------ interactive markup

/** ` name="value"` when value is present; values must be pre-escaped. */
const attr = (name: string, value: string | number | undefined): string =>
  value === undefined ? "" : ` ${name}="${value}"`;

const rectEl = (r: Rect, extra: string): string =>
  `<rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.width)}" height="${fmt(r.height)}"${extra}/>`;

function useIcon(icon: IconRef, r: Rect): string {
  return (
    `<use href="#i-${cssId(resolveIcon(icon))}" x="${fmt(r.x)}" y="${fmt(r.y)}"` +
    ` width="${fmt(r.width)}" height="${fmt(r.height)}"/>`
  );
}

function textEl(label: SceneLabel, defaultFill: string, pill = false): string {
  const fill = label.color ?? defaultFill;
  const weight = label.weight === "semibold" ? 600 : 400;
  let bg = "";
  if (pill) {
    const w = measure(label.text, label.fontSize, label.weight ?? "regular").width;
    const x = label.align === "middle" ? label.x - w / 2 : label.align === "end" ? label.x - w : label.x;
    bg =
      `<rect x="${fmt(x - 5)}" y="${fmt(label.y - label.fontSize - 1)}" width="${fmt(w + 10)}"` +
      ` height="${fmt(label.fontSize + 8)}" rx="4" fill="var(--ia-canvas, #fff)" fill-opacity="0.92"/>`;
  }
  const open = bg +
    `<text x="${fmt(label.x)}" y="${fmt(label.y)}" font-size="${fmt(label.fontSize)}"` +
    ` font-weight="${weight}" text-anchor="${label.align}" fill="${fill}">`;
  if (label.lines && label.lines.length > 1) {
    const lh = lineHeightFor(label.fontSize, label.weight);
    const spans = label.lines
      .map((ln, i) => `<tspan x="${fmt(label.x)}" dy="${i === 0 ? 0 : fmt(lh)}">${escapeXml(ln)}</tspan>`)
      .join("");
    return `${open}${spans}</text>`;
  }
  return `${open}${escapeXml(label.text)}</text>`;
}

/** Two offset shadow rects behind a stacked node icon / group box. */
function stackShadows(base: Rect, stack: number | undefined, stroke: string, dash?: string): string {
  if (!stack) return "";
  return STACK_OFFSETS.map((off) =>
    rectEl(
      { x: base.x + off, y: base.y + off, width: base.width, height: base.height },
      ` class="stack-shadow" rx="4" fill="${THEME_VAR.canvas}" stroke="${stroke}"` +
        ` stroke-width="1"${attr("stroke-dasharray", dash)}`,
    ),
  ).join("");
}

function groupMarkup(g: SceneGroup): string {
  const style = GROUP_STYLES[g.groupKind];
  const bits: string[] = [
    `<g class="group group-${g.groupKind}" data-path="${escapeXml(g.path)}">`,
    stackShadows(g.rect, g.stack, style.stroke, style.strokeDasharray),
    rectEl(
      g.rect,
      ` class="group-box" rx="4" fill="${style.fill ?? "none"}" stroke="${style.stroke}"` +
        ` stroke-width="${STROKE_WIDTH}"${attr("stroke-dasharray", style.strokeDasharray)}`,
    ),
  ];
  if (g.badgeIcon && g.badgeRect) bits.push(useIcon(g.badgeIcon, g.badgeRect));
  if (g.label) bits.push(textEl(g.label, style.labelColor ?? THEME_VAR.text));
  for (const t of g.trackLabels ?? []) bits.push(textEl(t, THEME_VAR.text));
  bits.push("</g>");
  return bits.join("");
}

function overlayMarkup(o: SceneOverlay): string {
  const s = resolveOverlayStyle(o);
  const cls = `overlay${o.groupKind ? ` overlay-${o.groupKind}` : ""}`;
  const bits: string[] = [`<g class="${cls}" data-path="${escapeXml(o.path)}">`];
  for (const r of o.rects) {
    bits.push(
      rectEl(
        r,
        ` rx="4" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${STROKE_WIDTH}"` +
          attr("stroke-dasharray", s.strokeDasharray),
      ),
    );
  }
  if (o.label) bits.push(textEl(o.label, s.labelColor));
  bits.push("</g>");
  return bits.join("");
}

function edgeMarkup(e: SceneEdge, withLabel = true): string {
  const geo = edgeGeometry(e);
  const card = edgeCardinalityAttrs(e);
  if (card.markerStart) geo.markerStart = card.markerStart;
  if (card.markerEnd) geo.markerEnd = card.markerEnd;
  const cls = `edge${e.layer ? ` layer-${cssId(e.layer)}` : ""}${e.bundle ? " bundled" : ""}`;
  const bits: string[] = [
    `<g class="${cls}" data-edge-id="${escapeXml(e.id)}"` +
      ` data-from="${escapeXml(e.from)}" data-to="${escapeXml(e.to)}">`,
    `<path d="${geo.d}" fill="none" stroke="${e.style.color}" stroke-width="${STROKE_WIDTH}"` +
      `${attr("stroke-dasharray", geo.dash)}${attr("marker-start", geo.markerStart)}` +
      `${attr("marker-end", geo.markerEnd)}/>`,
  ];
  if (withLabel && e.label) bits.push(textEl(e.label, THEME_VAR.edge));
  bits.push("</g>");
  return bits.join("");
}

/** 엣지 라벨 상층 레이어 — 레거시 패리티: 라벨 pill은 카드 위에 뜬다 */
function edgeLabelsLayer(edges: readonly SceneEdge[]): string {
  const bits: string[] = [];
  for (const e of edges) {
    if (!e.label) continue;
    const cls = `edge-label${e.layer ? ` layer-${cssId(e.layer)}` : ""}`;
    bits.push(`<g class="${cls}" data-edge-id="${escapeXml(e.id)}">${textEl(e.label, THEME_VAR.edge, true)}</g>`);
  }
  return bits.length ? `<g class="edge-labels">${bits.join("")}</g>` : "";
}

function nodeMarkup(n: SceneNode): string {
  if (n.table) return renderTableSvg(n, { interactive: true });
  if (n.category) return renderCardSvg(n, { interactive: true });
  const cls = `node${n.role && n.role !== "resource" ? ` node-${n.role}` : ""}`;
  let open = `<g class="${cls}" data-path="${escapeXml(n.path)}"`;
  open += sidebarDataAttrs(n);
  if (n.meta) open += ` data-meta="${escapeXml(JSON.stringify(n.meta))}"`;
  open += ">";
  const bits: string[] = [open];
  if (n.icon && n.iconRect) {
    bits.push(stackShadows(n.iconRect, n.stack, STACK_STROKE), useIcon(n.icon, n.iconRect));
  }
  if (n.label) bits.push(textEl(n.label, THEME_VAR.text));
  if (n.sublabel) bits.push(textEl(n.sublabel, THEME_VAR.edge));
  for (const b of n.badges ?? []) bits.push(useIcon(b.icon, b.rect));
  bits.push("</g>");
  return bits.join("");
}

function markerMarkup(m: SceneMarker): string {
  const title = m.note ? `<title>${escapeXml(m.note)}</title>` : "";
  return (
    `<g class="marker" data-n="${m.n}">${title}` +
    `<circle cx="${fmt(m.at.x)}" cy="${fmt(m.at.y)}" r="${MARKER_RADIUS}" fill="#000000"/>` +
    `<text x="${fmt(m.at.x)}" y="${fmt(m.at.y + 4)}" font-size="12" font-weight="600"` +
    ` text-anchor="middle" fill="#FFFFFF">${m.n}</text></g>`
  );
}

// ------------------------------------------------------------ entry point

export function renderInteractiveSvg(scene: Scene): string {
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" class="ia-svg"` +
      ` viewBox="0 0 ${fmt(scene.width)} ${fmt(scene.height)}"` +
      ` width="${fmt(scene.width)}" height="${fmt(scene.height)}" font-family="${FONT_FAMILY}">`,
    `<defs>${sceneIconDefs(scene.icons)}\n${arrowMarkerDefs(scene.edges) + (scene.edges.some((e) => e.sourceCardinality || e.targetCardinality) ? cardinalityMarkerDefs(scene.edges.find((e) => e.sourceCardinality || e.targetCardinality)!.style.color) : "")}</defs>`,
    `<rect class="canvas-bg" x="0" y="0" width="${fmt(scene.width)}" height="${fmt(scene.height)}"` +
      ` fill="${THEME_VAR.canvas}"/>`,
    `<g class="groups">${scene.groups.map(groupMarkup).join("\n")}</g>`,
    `<g class="overlays">${scene.overlays.map(overlayMarkup).join("\n")}</g>`,
    `<g class="edges">${scene.edges.map((e) => edgeMarkup(e, false)).join("\n")}</g>`,
    `<g class="nodes">${scene.nodes.map(nodeMarkup).join("\n")}</g>`,
    edgeLabelsLayer(scene.edges),
    `<g class="markers">${scene.markers.map(markerMarkup).join("\n")}</g>`,
    renderFlowBadgesSvg(scene),
    `</svg>`,
  ];
  return out.join("\n");
}
