/**
 * Static SVG renderer — variant 2 of the 2-variant renderer (DESIGN §8).
 *
 * Same visuals as the interactive variant, but every style is baked as a
 * presentation attribute for ONE chosen theme: no classes, no scripts, no
 * CSS variables, no data-* attributes, and ALL text is converted to outline
 * paths via textToPathD so the file renders identically with no fonts
 * installed. This is the `.svg` deliverable and the resvg/PNG input.
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
import { cssId } from "../icons/load.ts";
import { measureWidth, textToPathD } from "../text/metrics.ts";
import { GROUP_STYLES } from "./group-styles.ts";
import { renderTableStatic, cardinalityMarkerDefs as cardDefs, edgeCardinalityAttrs } from "./table.ts";
import { renderCardStatic } from "./card.ts";
import { THEMES, type ThemeName, type ThemeTokens } from "./theme.ts";
import {
  MARKER_RADIUS,
  STACK_OFFSETS,
  STACK_STROKE,
  STROKE_WIDTH,
  arrowMarkerDefs,
  edgeGeometry,
  fmt,
  lineHeightFor,
  resolveOverlayStyle,
  sceneIconDefs,
} from "./svg.ts";

// ------------------------------------------------------------ primitives

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

/**
 * Text-as-outline: one <path> per line, x adjusted for the label's anchor
 * alignment (textToPathD always draws from the left edge). Baseline `y`
 * matches the <text> element of the interactive variant exactly.
 */
function labelPaths(label: SceneLabel, defaultFill: string): string {
  const fill = label.color ?? defaultFill;
  const lines = label.lines && label.lines.length > 0 ? label.lines : [label.text];
  const lh = lineHeightFor(label.fontSize, label.weight);
  return lines
    .map((ln, i) => {
      let x = label.x;
      if (label.align !== "start") {
        const w = measureWidth(ln, label.fontSize, label.weight);
        x -= label.align === "middle" ? w / 2 : w;
      }
      const d = textToPathD(ln, x, label.y + i * lh, label.fontSize, label.weight);
      return `<path d="${d}" fill="${fill}"/>`;
    })
    .join("");
}

function stackShadows(base: Rect, stack: number | undefined, t: ThemeTokens, stroke: string, dash?: string): string {
  if (!stack) return "";
  return STACK_OFFSETS.map((off) =>
    rectEl(
      { x: base.x + off, y: base.y + off, width: base.width, height: base.height },
      ` rx="4" fill="${t.canvas}" stroke="${stroke}" stroke-width="1"${attr("stroke-dasharray", dash)}`,
    ),
  ).join("");
}

// ------------------------------------------------------------ element markup

function groupMarkup(g: SceneGroup, t: ThemeTokens): string {
  const style = GROUP_STYLES[g.groupKind];
  const bits: string[] = [
    "<g>",
    stackShadows(g.rect, g.stack, t, style.stroke, style.strokeDasharray),
    rectEl(
      g.rect,
      ` rx="4" fill="${style.fill ?? "none"}" stroke="${style.stroke}"` +
        ` stroke-width="${STROKE_WIDTH}"${attr("stroke-dasharray", style.strokeDasharray)}`,
    ),
  ];
  if (g.badgeIcon && g.badgeRect) bits.push(useIcon(g.badgeIcon, g.badgeRect));
  if (g.label) bits.push(labelPaths(g.label, style.labelColor ?? t.text));
  for (const tl of g.trackLabels ?? []) bits.push(labelPaths(tl, t.text));
  bits.push("</g>");
  return bits.join("");
}

function overlayMarkup(o: SceneOverlay, t: ThemeTokens): string {
  const s = resolveOverlayStyle(o);
  const bits: string[] = ["<g>"];
  for (const r of o.rects) {
    bits.push(
      rectEl(
        r,
        ` rx="4" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${STROKE_WIDTH}"` +
          attr("stroke-dasharray", s.strokeDasharray),
      ),
    );
  }
  if (o.label) bits.push(labelPaths(o.label, s.labelColor));
  bits.push("</g>");
  return bits.join("");
}

function edgeMarkup(e: SceneEdge, t: ThemeTokens): string {
  const geo = edgeGeometry(e);
  const card = edgeCardinalityAttrs(e);
  if (card.markerStart) geo.markerStart = card.markerStart;
  if (card.markerEnd) geo.markerEnd = card.markerEnd;
  const bits: string[] = [
    "<g>",
    `<path d="${geo.d}" fill="none" stroke="${e.style.color}" stroke-width="${STROKE_WIDTH}"` +
      `${attr("stroke-dasharray", geo.dash)}${attr("marker-start", geo.markerStart)}` +
      `${attr("marker-end", geo.markerEnd)}/>`,
  ];
  if (e.label) bits.push(labelPaths(e.label, t.edge));
  bits.push("</g>");
  return bits.join("");
}

function nodeMarkup(n: SceneNode, t: ThemeTokens, themeName: ThemeName): string {
  if (n.table) return renderTableStatic(n, themeName);
  if (n.category) return renderCardStatic(n, themeName);
  const bits: string[] = ["<g>"];
  if (n.icon && n.iconRect) bits.push(stackShadows(n.iconRect, n.stack, t, STACK_STROKE), useIcon(n.icon, n.iconRect));
  if (n.label) bits.push(labelPaths(n.label, t.text));
  if (n.sublabel) bits.push(labelPaths(n.sublabel, t.edge));
  for (const b of n.badges ?? []) bits.push(useIcon(b.icon, b.rect));
  bits.push("</g>");
  return bits.join("");
}

function markerMarkup(m: SceneMarker): string {
  const num = String(m.n);
  const w = measureWidth(num, 12, "semibold");
  const d = textToPathD(num, m.at.x - w / 2, m.at.y + 4, 12, "semibold");
  return (
    `<g><circle cx="${fmt(m.at.x)}" cy="${fmt(m.at.y)}" r="${MARKER_RADIUS}" fill="#000000"/>` +
    `<path d="${d}" fill="#FFFFFF"/></g>`
  );
}

// ------------------------------------------------------------ entry point

export function renderStaticSvg(scene: Scene, theme: ThemeName = "light"): string {
  const t = THEMES[theme];
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg"` +
      ` viewBox="0 0 ${fmt(scene.width)} ${fmt(scene.height)}"` +
      ` width="${fmt(scene.width)}" height="${fmt(scene.height)}">`,
    `<defs>${sceneIconDefs(scene.icons)}\n${arrowMarkerDefs(scene.edges)}${scene.edges.some((e) => e.sourceCardinality || e.targetCardinality) ? cardDefs(scene.edges.find((e) => e.sourceCardinality || e.targetCardinality)!.style.color, t.canvas) : ""}</defs>`,
    `<rect x="0" y="0" width="${fmt(scene.width)}" height="${fmt(scene.height)}" fill="${t.canvas}"/>`,
    scene.groups.map((g) => groupMarkup(g, t)).join("\n"),
    scene.overlays.map((o) => overlayMarkup(o, t)).join("\n"),
    scene.edges.map((e) => edgeMarkup(e, t)).join("\n"),
    scene.nodes.map((n) => nodeMarkup(n, t, theme)).join("\n"),
    scene.markers.map(markerMarkup).join("\n"),
    `</svg>`,
  ];
  return out.join("\n");
}
