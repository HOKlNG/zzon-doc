/**
 * ERD table nodes + crow's-foot cardinality markers, ported from the legacy
 * zzon-doc renderer (render.mjs: renderTableNode, cardMarker, static export).
 *
 * Self-contained module: `sizeTable` is consumed by layout sizing,
 * `makeSceneTable`/`tableAnchorY` by scene assembly + routing (column-anchored
 * FK edges), `renderTableSvg`/`renderTableStatic` by the two render variants,
 * and `cardinalityMarkerDefs`/`edgeCardinalityAttrs` by both variants' defs +
 * edge markup. All text sizing goes through src/text/metrics.ts — never
 * estimated. Both variants share ONE body builder so they cannot drift.
 */
import type { SceneEdge, SceneNode, SceneTable } from "../layout/scene.ts";
import type { Cardinality, TableColumn, TableSpec } from "../model/types.ts";
import type { IconRef } from "../icons/aliases.ts";
import { loadIcon } from "../icons/load.ts";
import { measureWidth, textToPathD, type FontWeight } from "../text/metrics.ts";
import { THEMES, type ThemeName } from "./theme.ts";

// ------------------------------------------------------------ metrics constants

export const TABLE_MIN_WIDTH = 240;
export const TABLE_HEADER_H = 30;
export const TABLE_ROW_H = 26;
/** bottom inset so the last zebra row clears the rx-8 rounded corner */
const BOTTOM_PAD = 6;
const PAD_X = 12;
/** key-icon slot before the column name (12px glyph + 8px gap) */
const PK_SLOT = 20;
const NAME_SIZE = 11;
const TYPE_SIZE = 10;
const TITLE_SIZE = 12;
const COUNT_SIZE = 9;
const CHIP_SIZE = 8.5;
const CHIP_PAD = 4;
const CHIP_GAP = 3;
const CHIP_H = 14;
const HEAD_ICON = 16;
const KEY_ICON = 12;
/** minimum gap between the column name and the right-aligned type */
const NAME_TYPE_GAP = 16;

/** right-edge chip labels for a column, outermost-first (legacy order: N, UQ, FK) */
function chipTags(c: TableColumn): string[] {
  const tags: string[] = [];
  if (c.nullable) tags.push("N");
  if (c.unique) tags.push("UQ");
  if (c.fk) tags.push("FK");
  return tags;
}

const chipWidth = (tag: string): number =>
  Math.max(16, Math.ceil(measureWidth(tag, CHIP_SIZE) + CHIP_PAD * 2));

// ------------------------------------------------------------ sizing

export interface SizedTable {
  width: number;
  height: number;
  headerHeight: number;
  rowHeight: number;
  /** per-column row vertical centers, RELATIVE to the node's top edge */
  columnYs: number[];
  /** source columns in row order (carried into makeSceneTable) */
  columns: TableColumn[];
}

/** Content-derived table size: min 240 wide, grows to fit header + rows. */
export function sizeTable(node: { label?: string; table: TableSpec }): SizedTable {
  const cols = node.table.columns;
  // header: [table icon] title ......... "N cols"
  let need =
    PAD_X + HEAD_ICON + 8 + measureWidth(node.label ?? "", TITLE_SIZE, "semibold") +
    12 + measureWidth(`${cols.length} cols`, COUNT_SIZE) + PAD_X;
  // rows: [pk slot] name ......... type [FK][UQ][N]
  for (const c of cols) {
    const chipsW = chipTags(c).reduce((w, t) => w + chipWidth(t) + CHIP_GAP, 0);
    need = Math.max(
      need,
      PAD_X + PK_SLOT + measureWidth(c.name, NAME_SIZE, c.pk ? "semibold" : "regular") +
        NAME_TYPE_GAP + measureWidth(c.type ?? "", TYPE_SIZE) + chipsW + PAD_X,
    );
  }
  return {
    width: Math.max(TABLE_MIN_WIDTH, Math.ceil(need)),
    height: TABLE_HEADER_H + cols.length * TABLE_ROW_H + BOTTOM_PAD,
    headerHeight: TABLE_HEADER_H,
    rowHeight: TABLE_ROW_H,
    columnYs: cols.map((_, i) => TABLE_HEADER_H + i * TABLE_ROW_H + TABLE_ROW_H / 2),
    columns: cols,
  };
}

/** Bind a sized table to its absolute node top-edge Y (layout absolutize step). */
export function makeSceneTable(sized: SizedTable, absY: number): SceneTable {
  return {
    headerHeight: sized.headerHeight,
    rowHeight: sized.rowHeight,
    columns: sized.columns.map((c, i) => ({ ...c, y: absY + (sized.columnYs[i] ?? 0) })),
  };
}

/** Absolute Y of a column's row center — the router anchors FK edges here. */
export function tableAnchorY(n: SceneNode, column: string): number | undefined {
  return n.table?.columns.find((c) => c.name === column)?.y;
}

// ------------------------------------------------------------ shared primitives

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** local escaper — every user string passes through before entering markup */
const escapeXml = (s: string): string => s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c);

const fmt = (n: number): string => String(Math.round(n * 100) / 100);

interface TableColors {
  bg: string;
  border: string;
  head: string;
  zebra: string;
  text: string;
  muted: string;
  accent: string;
  key: string;
  chipStroke: string;
  fkText: string;
  fkFill: string;
  fkStroke: string;
}

/** interactive variant: CSS vars so the theme toggle restyles live */
const VAR_COLORS: TableColors = {
  bg: "var(--ia-canvas)",
  border: "var(--table-border, #D4D4D8)",
  head: "var(--table-head, #f4f4f5)",
  zebra: "var(--table-zebra, rgba(125,137,152,0.09))",
  text: "var(--ia-text)",
  muted: "var(--ia-edge)",
  accent: "var(--table-accent, #10B981)",
  key: "#F59E0B",
  chipStroke: "var(--table-border, #D4D4D8)",
  fkText: "var(--table-fk, #0284C7)",
  fkFill: "rgba(14,165,233,0.10)",
  fkStroke: "rgba(14,165,233,0.45)",
};

/** static variant: literals baked per theme (canvas/text/muted from theme.ts) */
const STATIC_COLORS: Record<ThemeName, TableColors> = {
  light: {
    bg: THEMES.light.canvas, border: "#D4D4D8", head: "#F4F4F5", zebra: "#F7F7F8",
    text: THEMES.light.text, muted: THEMES.light.edge, accent: "#10B981", key: "#F59E0B",
    chipStroke: "#D4D4D8", fkText: "#0284C7", fkFill: "#E0F2FE", fkStroke: "#7DD3FC",
  },
  dark: {
    bg: THEMES.dark.canvas, border: "#2E3B50", head: "#1D2739", zebra: "#1A2334",
    text: THEMES.dark.text, muted: THEMES.dark.edge, accent: "#34D399", key: "#FBBF24",
    chipStroke: "#3A4961", fkText: "#38BDF8", fkFill: "#123B55", fkStroke: "#1E5B80",
  },
};

type TextAnchor = "start" | "middle" | "end";
/** text emitter — <text> for interactive, outline <path> for static */
type EmitText = (
  text: string, x: number, y: number, size: number,
  weight: FontWeight, fill: string, anchor: TextAnchor,
) => string;

const emitTextEl: EmitText = (text, x, y, size, weight, fill, anchor) =>
  `<text x="${fmt(x)}" y="${fmt(y)}" font-size="${fmt(size)}"` +
  ` font-weight="${weight === "semibold" ? 600 : 400}"` +
  `${anchor === "start" ? "" : ` text-anchor="${anchor}"`} fill="${fill}">${escapeXml(text)}</text>`;

const emitTextPath: EmitText = (text, x, y, size, weight, fill, anchor) => {
  let tx = x;
  if (anchor !== "start") {
    const w = measureWidth(text, size, weight);
    tx -= anchor === "middle" ? w / 2 : w;
  }
  return `<path d="${textToPathD(text, tx, y, size, weight)}" fill="${fill}"/>`;
};

/**
 * Lucide glyphs are stroke-drawn with root-level presentation attributes that
 * iconSymbolDefs drops, so tables inline the body via loadIcon under a <g>
 * that re-applies them (`color=` feeds the body's currentColor fills). No
 * <symbol> defs / scene.icons entries are needed for table chrome.
 */
function inlineIcon(ref: IconRef, x: number, y: number, size: number, color: string): string {
  const icon = loadIcon(ref);
  const vb = icon.viewBox.split(/\s+/).map(Number);
  const scale = size / (vb[2] || 24);
  return (
    `<g transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(scale)})" fill="none"` +
    ` stroke="${color}" color="${color}" stroke-width="2" stroke-linecap="round"` +
    ` stroke-linejoin="round">${icon.body}</g>`
  );
}

// ------------------------------------------------------------ table markup

/** Everything inside the node <g>; identical structure in both variants. */
function tableMarkup(n: SceneNode, c: TableColors, txt: EmitText, interactive: boolean): string {
  const t = n.table;
  if (!t) return "";
  const r = n.rect;
  const title = n.label?.text ?? n.path.split("/").pop() ?? "";
  const headB = r.y + t.headerHeight;
  const bits: string[] = [
    // card, then header strip with top corners matching the rx-8 card
    `<rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.width)}" height="${fmt(r.height)}"` +
      ` rx="8" fill="${c.bg}" stroke="${c.border}"/>`,
    `<path d="M${fmt(r.x)} ${fmt(headB)}V${fmt(r.y + 8)}Q${fmt(r.x)} ${fmt(r.y)} ${fmt(r.x + 8)} ${fmt(r.y)}` +
      `H${fmt(r.x + r.width - 8)}Q${fmt(r.x + r.width)} ${fmt(r.y)} ${fmt(r.x + r.width)} ${fmt(r.y + 8)}` +
      `V${fmt(headB)}Z" fill="${c.head}"/>`,
    `<line x1="${fmt(r.x)}" y1="${fmt(headB)}" x2="${fmt(r.x + r.width)}" y2="${fmt(headB)}" stroke="${c.border}"/>`,
  ];
  const hc = r.y + t.headerHeight / 2;
  bits.push(inlineIcon("x.lucide-table2", r.x + PAD_X, hc - HEAD_ICON / 2, HEAD_ICON, c.accent));
  bits.push(txt(title, r.x + PAD_X + HEAD_ICON + 8, hc + 4, TITLE_SIZE, "semibold", c.text, "start"));
  bits.push(txt(`${t.columns.length} cols`, r.x + r.width - PAD_X, hc + 3.5, COUNT_SIZE, "regular", c.muted, "end"));

  // column rows (col.y is the ABSOLUTE row center from makeSceneTable)
  t.columns.forEach((col, i) => {
    const cy = col.y;
    const row: string[] = [];
    if (i % 2 === 1)
      row.push(
        `<rect x="${fmt(r.x + 1)}" y="${fmt(cy - t.rowHeight / 2)}" width="${fmt(r.width - 2)}"` +
          ` height="${fmt(t.rowHeight)}" fill="${c.zebra}"/>`,
      );
    if (col.pk) row.push(inlineIcon("x.lucide-key-round", r.x + PAD_X, cy - KEY_ICON / 2, KEY_ICON, c.key));
    row.push(txt(col.name, r.x + PAD_X + PK_SLOT, cy + 3.5, NAME_SIZE, col.pk ? "semibold" : "regular", c.text, "start"));
    // chips hug the right edge outermost-first; the type right-aligns against them
    let rx = r.x + r.width - PAD_X;
    for (const tag of chipTags(col)) {
      const w = chipWidth(tag);
      const fk = tag === "FK";
      row.push(
        `<rect x="${fmt(rx - w)}" y="${fmt(cy - CHIP_H / 2)}" width="${fmt(w)}" height="${CHIP_H}"` +
          ` rx="4" fill="${fk ? c.fkFill : "none"}" stroke="${fk ? c.fkStroke : c.chipStroke}"/>`,
      );
      row.push(txt(tag, rx - w / 2, cy + 3, CHIP_SIZE, "regular", fk ? c.fkText : c.muted, "middle"));
      rx -= w + CHIP_GAP;
    }
    if (col.type) row.push(txt(col.type, rx, cy + 3.5, TYPE_SIZE, "regular", c.muted, "end"));
    bits.push(interactive ? `<g class="table-row" data-col="${escapeXml(col.name)}">${row.join("")}</g>` : row.join(""));
  });
  return bits.join("");
}

/** Interactive variant: CSS-var colors, stable classes, data-col row hooks. */
export function renderTableSvg(n: SceneNode, opts: { interactive: boolean }): string {
  const body = tableMarkup(n, VAR_COLORS, emitTextEl, opts.interactive);
  if (!opts.interactive) return `<g>${body}</g>`;
  let open = `<g class="node node-table" data-path="${escapeXml(n.path)}"`;
  if (n.meta) open += ` data-meta="${escapeXml(JSON.stringify(n.meta))}"`;
  return `${open}>${body}</g>`;
}

/** Static variant: one theme baked as literals, ALL text as outline paths. */
export function renderTableStatic(n: SceneNode, theme: ThemeName): string {
  return `<g>${tableMarkup(n, STATIC_COLORS[theme], emitTextPath, false)}</g>`;
}

// ------------------------------------------------------------ crow's-foot markers

export const CARDINALITY_MARKER_ID: Record<Cardinality, string> = {
  "1": "card-1",
  "0..1": "card-01",
  "N": "card-n",
  "0..N": "card-0n",
  "1..N": "card-1n",
};

/**
 * Crow's-foot <marker> defs (legacy cardMarker): bar=1, ring+bar=0..1,
 * crow=N, ring+crow=0..N, bar+crow=1..N. refX 13 puts the symbol tip on the
 * node border; orient="auto-start-reverse" lets ONE def face the node from
 * either end (marker-start AND marker-end). `ringFill` must be the canvas
 * color so rings knock out the edge line — pass a literal for the static
 * variant (no CSS vars allowed there).
 */
export function cardinalityMarkerDefs(color: string, ringFill = "var(--ia-canvas)"): string {
  const stroke = ` fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round"`;
  const line = (d: string) => `<path d="${d}"${stroke}/>`;
  const ring = (cx: number) =>
    `<circle cx="${fmt(cx)}" cy="6" r="2.3" fill="${ringFill}" stroke="${color}" stroke-width="1.3"/>`;
  const crow = (x: number) => line(`M ${fmt(x)} 6 L 13 1.5 M ${fmt(x)} 6 L 13 6 M ${fmt(x)} 6 L 13 10.5`);
  const shapes: Record<Cardinality, string> = {
    "1": line("M 8 1.5 L 8 10.5"),
    "0..1": line("M 9.5 1.5 L 9.5 10.5") + ring(4),
    "N": crow(4),
    "0..N": crow(5.5) + ring(2.8),
    "1..N": line("M 3 1.5 L 3 10.5") + crow(4.5),
  };
  return (Object.keys(shapes) as Cardinality[])
    .map(
      (k) =>
        `<marker id="${CARDINALITY_MARKER_ID[k]}" viewBox="0 0 14 12" refX="13" refY="6"` +
        ` markerWidth="14" markerHeight="12" markerUnits="userSpaceOnUse"` +
        ` orient="auto-start-reverse">${shapes[k]}</marker>`,
    )
    .join("\n");
}

/** marker-start/-end attrs for an edge's cardinalities (replace arrowheads). */
export function edgeCardinalityAttrs(e: SceneEdge): { markerStart?: string; markerEnd?: string } {
  const out: { markerStart?: string; markerEnd?: string } = {};
  if (e.sourceCardinality) out.markerStart = `url(#${CARDINALITY_MARKER_ID[e.sourceCardinality]})`;
  if (e.targetCardinality) out.markerEnd = `url(#${CARDINALITY_MARKER_ID[e.targetCardinality]})`;
  return out;
}
