/**
 * Notation shapes for the behaviour / structure views — UML state machine
 * (state, initial, final, choice), flowchart (process, decision, terminal),
 * screen flow (screen), class / domain model (class), module dependency graph
 * (module).
 *
 * One geometry pass (`shapePrims`) produces absolute primitives with SEMANTIC
 * colour roles; the two emitters resolve the roles — CSS variables + <text>
 * for the interactive variant, literal palette + outlined text paths for the
 * static one — so the variants cannot drift (same contract as card.ts).
 * Sizing (`sizeShape`) is consumed by layout; label texts are measured with
 * the vendored font (never estimated).
 */
import type { SceneNode } from "../layout/scene.ts";
import type { ClassSpec, NodeShape } from "../model/types.ts";
import { measure, measureWidth, textToPathD, wrap, type FontWeight } from "../text/metrics.ts";
import { THEMES, type ThemeName } from "./theme.ts";
import { CATEGORY_COLORS_DARK, CATEGORY_COLORS_LIGHT } from "./categories.gen.ts";

const LABEL = 12;
const SUB = 10;
const MAX_TEXT = 200;
const ROW = 16; // class compartment row height
const MAX_ROWS = 8;

type ColorGroup = keyof typeof CATEGORY_COLORS_LIGHT;

/** accent hue per shape (category colour groups — legend-consistent) */
export const SHAPE_ACCENT: Record<NodeShape, ColorGroup> = {
  state: "backend",
  initial: "neutral",
  final: "neutral",
  choice: "compute",
  process: "backend",
  decision: "compute",
  terminal: "user",
  screen: "frontend",
  class: "data",
  module: "data-aux",
};

export const SHAPE_LABEL_KO: Record<NodeShape, string> = {
  state: "상태",
  initial: "시작",
  final: "종료",
  choice: "분기",
  process: "처리",
  decision: "판단",
  terminal: "시작/끝",
  screen: "화면",
  class: "클래스",
  module: "모듈",
};

// ------------------------------------------------------------ sizing

export interface ShapeInput {
  shape: NodeShape;
  label?: string;
  sublabel?: string;
  classSpec?: ClassSpec;
}

export interface ShapeSize {
  width: number;
  height: number;
}

const lh = (size: number, weight: FontWeight = "regular") => measure("Ag", size, weight).lineHeight;

function labelLines(text: string | undefined, max = MAX_TEXT, size = LABEL): string[] {
  if (!text) return [];
  const lines = wrap(text, size, max, "semibold");
  return lines.length > 2 ? [lines[0]!, truncate(lines.slice(1).join(" "), size, max, "semibold")] : lines;
}

function truncate(text: string, size: number, max: number, weight: FontWeight = "regular"): string {
  if (measureWidth(text, size, weight) <= max) return text;
  let t = text;
  while (t.length && measureWidth(`${t}…`, size, weight) > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

const widest = (lines: string[], size: number, weight: FontWeight) =>
  Math.max(0, ...lines.map((l) => measureWidth(l, size, weight)));

function classRows(spec: ClassSpec | undefined, key: "attributes" | "methods"): string[] {
  const rows = spec?.[key] ?? [];
  if (rows.length <= MAX_ROWS) return rows;
  return [...rows.slice(0, MAX_ROWS - 1), `… +${rows.length - (MAX_ROWS - 1)}`];
}

export function sizeShape(n: ShapeInput): ShapeSize {
  const lines = labelLines(n.label);
  const textW = widest(lines, LABEL, "semibold");
  const textH = lines.length * lh(LABEL, "semibold");
  const subW = n.sublabel ? measureWidth(n.sublabel, SUB) : 0;
  switch (n.shape) {
    case "initial":
      return { width: 20, height: 20 };
    case "final":
      return { width: 24, height: 24 };
    case "choice":
      return { width: 28, height: 28 };
    case "state": {
      const w = Math.max(96, Math.min(240, Math.max(textW, subW) + 32));
      return { width: w, height: Math.max(40, textH + 22 + (n.sublabel ? lh(SUB) + 8 : 0)) };
    }
    case "process": {
      const w = Math.max(120, Math.min(240, Math.max(textW, subW) + 32));
      return { width: w, height: Math.max(40, textH + 22 + (n.sublabel ? lh(SUB) + 2 : 0)) };
    }
    case "decision": {
      const dl = labelLines(n.label, 150);
      const w = Math.max(116, widest(dl, LABEL, "semibold") * 1.5 + 36);
      const h = Math.max(64, dl.length * lh(LABEL, "semibold") * 1.7 + 30);
      return { width: w, height: h };
    }
    case "terminal":
      return { width: Math.max(96, textW + 44), height: 34 };
    case "screen": {
      const w = Math.max(168, Math.min(240, Math.max(textW, subW) + 32));
      return { width: w, height: 18 + 12 + textH + (n.sublabel ? lh(SUB) + 4 : 0) + 10 };
    }
    case "module": {
      const w = Math.max(132, Math.min(240, Math.max(textW, subW) + 32));
      return { width: w, height: 8 + 12 + textH + (n.sublabel ? lh(SUB) + 2 : 0) + 12 };
    }
    case "class": {
      const attrs = classRows(n.classSpec, "attributes");
      const methods = classRows(n.classSpec, "methods");
      const stereo = n.classSpec?.stereotype ? `«${n.classSpec.stereotype}»` : "";
      const rowsW = widest([...attrs, ...methods], SUB, "regular");
      const w = Math.max(140, Math.min(300, Math.max(textW, measureWidth(stereo, SUB), rowsW) + 28));
      const header = 10 + (stereo ? lh(SUB) : 0) + textH + 8;
      const comp = (rows: string[]) => (rows.length ? rows.length * ROW + 8 : 10);
      return { width: w, height: header + comp(attrs) + comp(methods) };
    }
  }
}

// ------------------------------------------------------------ primitives

type Role = "surface" | "border" | "text" | "muted" | "mutedFg" | "accent" | "accentTint" | "ink" | "canvas" | "none";

type Prim =
  | { k: "rect"; x: number; y: number; w: number; h: number; rx?: number; fill: Role; stroke: Role; sw?: number; dash?: string }
  | { k: "circle"; cx: number; cy: number; r: number; fill: Role; stroke: Role; sw?: number }
  | { k: "path"; d: string; fill: Role; stroke: Role; sw?: number; dash?: string }
  | { k: "text"; x: number; y: number; text: string; size: number; weight: FontWeight; anchor: "start" | "middle"; fill: Role };

const f = (n: number) => Math.round(n * 100) / 100;

function centeredLines(lines: string[], cx: number, top: number, size: number, weight: FontWeight, fill: Role): Prim[] {
  const h = lh(size, weight);
  const m = measure("Ag", size, weight);
  return lines.map((t, i) => ({ k: "text" as const, x: cx, y: top + m.ascent + i * h, text: t, size, weight, anchor: "middle" as const, fill }));
}

export function shapePrims(n: SceneNode): Prim[] {
  const shape = n.shape!;
  const { x, y, width: w, height: h } = n.rect;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const label = n.label?.text;
  const sub = n.sublabel?.text;
  const out: Prim[] = [];
  switch (shape) {
    case "initial":
      out.push({ k: "circle", cx, cy, r: w / 2, fill: "ink", stroke: "none" });
      break;
    case "final":
      out.push({ k: "circle", cx, cy, r: w / 2 - 0.75, fill: "canvas", stroke: "ink", sw: 1.5 });
      out.push({ k: "circle", cx, cy, r: w / 2 - 5, fill: "ink", stroke: "none" });
      break;
    case "choice":
      out.push({ k: "path", d: `M${f(cx)} ${f(y)}L${f(x + w)} ${f(cy)}L${f(cx)} ${f(y + h)}L${f(x)} ${f(cy)}Z`, fill: "surface", stroke: "accent", sw: 1.5 });
      break;
    case "state": {
      out.push({ k: "rect", x, y, w, h, rx: 14, fill: "surface", stroke: "accent", sw: 1.5 });
      const lines = labelLines(label);
      const textH = lines.length * lh(LABEL, "semibold");
      if (sub) {
        out.push(...centeredLines(lines, cx, y + 11, LABEL, "semibold", "text"));
        const sepY = y + 11 + textH + 5;
        out.push({ k: "path", d: `M${f(x)} ${f(sepY)}H${f(x + w)}`, fill: "none", stroke: "border", sw: 1 });
        out.push(...centeredLines([truncate(sub, SUB, w - 16)], cx, sepY + 4, SUB, "regular", "mutedFg"));
      } else out.push(...centeredLines(lines, cx, cy - textH / 2, LABEL, "semibold", "text"));
      break;
    }
    case "process": {
      out.push({ k: "rect", x, y, w, h, rx: 4, fill: "surface", stroke: "accent", sw: 1.25 });
      const lines = labelLines(label);
      const block = lines.length * lh(LABEL, "semibold") + (sub ? lh(SUB) + 2 : 0);
      const top = cy - block / 2;
      out.push(...centeredLines(lines, cx, top, LABEL, "semibold", "text"));
      if (sub) out.push(...centeredLines([truncate(sub, SUB, w - 16)], cx, top + lines.length * lh(LABEL, "semibold") + 2, SUB, "regular", "mutedFg"));
      break;
    }
    case "decision": {
      out.push({ k: "path", d: `M${f(cx)} ${f(y)}L${f(x + w)} ${f(cy)}L${f(cx)} ${f(y + h)}L${f(x)} ${f(cy)}Z`, fill: "accentTint", stroke: "accent", sw: 1.5 });
      const lines = labelLines(label, 150);
      const block = lines.length * lh(LABEL, "semibold");
      out.push(...centeredLines(lines, cx, cy - block / 2, LABEL, "semibold", "text"));
      break;
    }
    case "terminal": {
      out.push({ k: "rect", x, y, w, h, rx: h / 2, fill: "accentTint", stroke: "accent", sw: 1.5 });
      const lines = [truncate(label ?? "", LABEL, w - 24, "semibold")];
      out.push(...centeredLines(lines, cx, cy - lh(LABEL, "semibold") / 2, LABEL, "semibold", "text"));
      break;
    }
    case "screen": {
      out.push({ k: "rect", x, y, w, h, rx: 6, fill: "surface", stroke: "border", sw: 1 });
      out.push({ k: "rect", x: x + 0.5, y: y + 0.5, w: w - 1, h: 17, rx: 5.5, fill: "muted", stroke: "none" });
      out.push({ k: "path", d: `M${f(x)} ${f(y + 18)}H${f(x + w)}`, fill: "none", stroke: "border", sw: 1 });
      for (let i = 0; i < 3; i++) out.push({ k: "circle", cx: x + 10 + i * 9, cy: y + 9, r: 2.6, fill: i === 0 ? "accent" : "border", stroke: "none" });
      const lines = labelLines(label);
      out.push(...centeredLines(lines, cx, y + 18 + 10, LABEL, "semibold", "text"));
      if (sub) out.push(...centeredLines([truncate(sub, SUB, w - 16)], cx, y + 18 + 10 + lines.length * lh(LABEL, "semibold") + 4, SUB, "regular", "mutedFg"));
      break;
    }
    case "module": {
      // folder tab + body
      out.push({ k: "path", d: `M${f(x)} ${f(y + 8)}V${f(y + 2)}Q${f(x)} ${f(y)} ${f(x + 2)} ${f(y)}H${f(x + 40)}L${f(x + 46)} ${f(y + 8)}Z`, fill: "accentTint", stroke: "accent", sw: 1.25 });
      out.push({ k: "rect", x, y: y + 8, w, h: h - 8, rx: 4, fill: "surface", stroke: "accent", sw: 1.25 });
      const lines = labelLines(label);
      out.push(...centeredLines(lines, cx, y + 8 + 12, LABEL, "semibold", "text"));
      if (sub) out.push(...centeredLines([truncate(sub, SUB, w - 16)], cx, y + 8 + 12 + lines.length * lh(LABEL, "semibold") + 2, SUB, "regular", "mutedFg"));
      break;
    }
    case "class": {
      out.push({ k: "rect", x, y, w, h, rx: 4, fill: "surface", stroke: "accent", sw: 1.25 });
      const spec = n.classSpec;
      const stereo = spec?.stereotype ? `«${spec.stereotype}»` : "";
      let top = y + 10;
      if (stereo) {
        out.push(...centeredLines([stereo], cx, top, SUB, "regular", "mutedFg"));
        top += lh(SUB);
      }
      const lines = labelLines(label);
      out.push(...centeredLines(lines, cx, top, LABEL, "semibold", "text"));
      top += lines.length * lh(LABEL, "semibold") + 8;
      const m = measure("Ag", SUB);
      for (const key of ["attributes", "methods"] as const) {
        out.push({ k: "path", d: `M${f(x)} ${f(top)}H${f(x + w)}`, fill: "none", stroke: "accent", sw: 1 });
        const rows = classRows(spec, key);
        if (!rows.length) {
          top += 10;
          continue;
        }
        top += 4;
        for (const r of rows) {
          out.push({ k: "text", x: x + 10, y: top + (ROW - (m.ascent + m.descent)) / 2 + m.ascent, text: truncate(r, SUB, w - 20), size: SUB, weight: "regular", anchor: "start", fill: "text" });
          top += ROW;
        }
        top += 4;
      }
      break;
    }
  }
  return out;
}

// ------------------------------------------------------------ emitters

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function emit(prims: Prim[], color: (r: Role) => string, textMode: "text" | "path"): string {
  const paint = (r: Role) => (r === "none" ? "none" : color(r));
  const tintOpacity = (r: Role) => (r === "accentTint" ? ` fill-opacity="0.12"` : "");
  return prims
    .map((p) => {
      switch (p.k) {
        case "rect":
          return `<rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${f(p.h)}"${p.rx ? ` rx="${f(p.rx)}"` : ""} fill="${paint(p.fill)}"${tintOpacity(p.fill)} stroke="${paint(p.stroke)}"${p.sw ? ` stroke-width="${p.sw}"` : ""}${p.dash ? ` stroke-dasharray="${p.dash}"` : ""}/>`;
        case "circle":
          return `<circle cx="${f(p.cx)}" cy="${f(p.cy)}" r="${f(p.r)}" fill="${paint(p.fill)}"${tintOpacity(p.fill)} stroke="${paint(p.stroke)}"${p.sw ? ` stroke-width="${p.sw}"` : ""}/>`;
        case "path":
          return `<path d="${p.d}" fill="${paint(p.fill)}"${tintOpacity(p.fill)} stroke="${paint(p.stroke)}"${p.sw ? ` stroke-width="${p.sw}"` : ""}${p.dash ? ` stroke-dasharray="${p.dash}"` : ""}/>`;
        case "text": {
          if (textMode === "path") {
            const w = measureWidth(p.text, p.size, p.weight);
            const x0 = p.anchor === "middle" ? p.x - w / 2 : p.x;
            return `<path d="${textToPathD(p.text, x0, p.y, p.size, p.weight)}" fill="${paint(p.fill)}"/>`;
          }
          return `<text x="${f(p.x)}" y="${f(p.y)}" font-size="${p.size}" font-weight="${p.weight === "semibold" ? 600 : 400}"${p.anchor === "middle" ? ` text-anchor="middle"` : ""} fill="${paint(p.fill)}">${esc(p.text)}</text>`;
        }
      }
    })
    .join("");
}

/** interactive markup: theme CSS variables, live <text>, .node hook for interactions */
export function renderShapeSvg(n: SceneNode, dataAttrs: string): string {
  const group = SHAPE_ACCENT[n.shape!];
  const color = (r: Role): string =>
    ({
      surface: "var(--card,#ffffff)",
      border: "var(--border,#e4e4e7)",
      text: "var(--ia-text)",
      muted: "var(--muted,#f4f4f5)",
      mutedFg: "var(--muted-foreground,#71717a)",
      accent: `var(--cat-${group})`,
      accentTint: `var(--cat-${group})`,
      ink: "var(--ia-text)",
      canvas: "var(--ia-canvas)",
      none: "none",
    })[r];
  return `<g class="node node-shape shape-${n.shape}" data-path="${esc(n.path)}"${dataAttrs}>${emit(shapePrims(n), color, "text")}</g>`;
}

const STATIC_SURFACES: Record<ThemeName, { card: string; border: string; muted: string; mutedFg: string }> = {
  light: { card: "#ffffff", border: "#e4e4e7", muted: "#f4f4f5", mutedFg: "#71717a" },
  dark: { card: "#141417", border: "#2a2a2e", muted: "#1f1f23", mutedFg: "#a1a1aa" },
};

/** static markup: literal palette, text outlined to paths (no font dependency) */
export function renderShapeStatic(n: SceneNode, theme: ThemeName = "light"): string {
  const palette = theme === "dark" ? CATEGORY_COLORS_DARK : CATEGORY_COLORS_LIGHT;
  const s = STATIC_SURFACES[theme];
  const accent = palette[SHAPE_ACCENT[n.shape!]];
  const t = THEMES[theme];
  const color = (r: Role): string =>
    ({
      surface: s.card,
      border: s.border,
      text: t.text,
      muted: s.muted,
      mutedFg: s.mutedFg,
      accent,
      accentTint: accent,
      ink: t.text,
      canvas: t.canvas,
      none: "none",
    })[r];
  return `<g>${emit(shapePrims(n), color, "path")}</g>`;
}
