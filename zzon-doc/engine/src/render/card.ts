/**
 * Generic category CARD nodes (ported from the legacy renderer's card visual).
 *
 * A card is a 192px rounded rect (220px when it carries a description) with a
 * 3px accent bar in the category color, a 32px tinted icon tile holding the
 * category's lucide glyph, a 12px semibold label, a tech chip (or the Korean
 * category name as fallback), and up to 3 muted description lines.
 *
 * Sizing (`sizeCard`) is consumed by layout; the two render entry points
 * mirror the engine's 2-variant renderer: `renderCardSvg` emits CSS-variable
 * driven markup for the interactive HTML, `renderCardStatic` bakes literal
 * palette colors and outlines all text to paths. This module is deliberately
 * self-contained: it never imports from svg.ts/static-svg.ts (local escape,
 * fmt, truncation), only the frozen theme/icon/metrics/category modules.
 */
import type { SceneNode } from "../layout/scene.ts";
import type { Rect, Point } from "../model/geometry.ts";
import { resolveIcon } from "../icons/aliases.ts";
import { cssId } from "../icons/load.ts";
import { measure, measureWidth, textToPathD, wrap, type FontWeight } from "../text/metrics.ts";
import { THEMES, type ThemeName } from "./theme.ts";
import {
  CATEGORY_COLORS_DARK,
  CATEGORY_COLORS_LIGHT,
  CATEGORY_META,
  type CategoryMeta,
} from "./categories.gen.ts";

// ------------------------------------------------------------ category meta

/**
 * The legacy renderer had a 32nd category, "external", whose entry the
 * extractor dropped (its dashed-border flag lived outside the palette table).
 * The palette itself kept the "external" color group, so re-add the meta row
 * here — categories.gen.ts is generated and must not be hand-edited.
 */
export const CARD_CATEGORY_META: Record<string, CategoryMeta> = {
  ...CATEGORY_META,
  external: { labelKo: "외부 서비스", icon: "x.lucide-external-link", colorGroup: "external" },
};

/** categories drawn with a dashed card border (legacy `meta.dashed`) */
const DASHED_CATEGORIES = new Set(["external"]);

/** Meta for a category; throws with the full valid list on unknown names. */
export function categoryMeta(category: string): CategoryMeta {
  const m = CARD_CATEGORY_META[category];
  if (!m) {
    const valid = Object.keys(CARD_CATEGORY_META).sort().join(", ");
    throw new Error(`unknown category "${category}" — valid categories: ${valid}`);
  }
  return m;
}

// ------------------------------------------------------------ geometry constants

/** card width without / with a description (legacy .dg-node-card widths) */
export const CARD_WIDTH = 192;
export const CARD_WIDTH_DESC = 220;

const PAD_X = 12; // right-side text padding
const ACCENT_WIDTH = 3;
const CARD_RADIUS = 8;
const TILE_X = 14; // card padding 12 + row inset 2 (legacy)
const TILE_Y = 10;
const TILE_SIZE = 32;
const TILE_RADIUS = 6;
const TILE_ICON = 16; // lucide glyph inside the tile
const TILE_GAP = 10; // tile -> text column
const LABEL_SIZE = 12;
const SUB_SIZE = 10; // tech chip / category fallback / description
const CHIP_PAD_X = 6;
const CHIP_HEIGHT = 14;
const BASE_HEIGHT = 52; // 10 + 32 + 10 (row + vertical padding)
const DESC_TOP = 44; // description block starts just under the row
const DESC_X = 14;
const DESC_BOTTOM = 9;
const MAX_DESC_LINES = 3;
/** icon tile tint (legacy: category color mixed at 13%) */
const TILE_TINT_OPACITY = 0.13;
const ACCENT_OPACITY = 0.85;

// ------------------------------------------------------------ local primitives

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** local escaper — svg.ts's is reserved for the shared renderer modules */
function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c);
}

const fmt = (n: number): string => String(Math.round(n * 100) / 100);

/** Metrics-exact ellipsis truncation (legacy cards rely on CSS ellipsis). */
function truncateToWidth(text: string, fontSize: number, maxWidth: number, weight: FontWeight): string {
  if (measureWidth(text, fontSize, weight) <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && measureWidth(`${t}…`, fontSize, weight) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// ------------------------------------------------------------ sizing

export interface CardLayout {
  width: number;
  height: number;
  /** 32×32 tinted icon tile, card-local coordinates */
  iconTile: Rect;
  /** label baseline (card-local), 12px semibold */
  labelPos: Point;
  /** tech chip rect + centered chip-text baseline; present iff `tech` */
  techPos?: { chip: Rect; text: Point };
  /** description wrapped at 10px to ≤ 3 lines; present iff `description` */
  descLines?: string[];
  /** first description-line baseline (card-local); present iff `descLines` */
  descPos?: Point;
}

/**
 * Card-local layout from content, all text sized via metrics. Width is fixed
 * (192 / 220 with description); height grows with the wrapped description.
 */
export function sizeCard(node: {
  label?: string;
  category: string;
  tech?: string;
  description?: string;
}): CardLayout {
  categoryMeta(node.category); // throws on unknown category
  const width = node.description ? CARD_WIDTH_DESC : CARD_WIDTH;
  const textX = TILE_X + TILE_SIZE + TILE_GAP;
  const maxTextWidth = width - textX - PAD_X;

  const layout: CardLayout = {
    width,
    height: BASE_HEIGHT,
    iconTile: { x: TILE_X, y: TILE_Y, width: TILE_SIZE, height: TILE_SIZE },
    labelPos: { x: textX, y: TILE_Y + 13 },
  };

  if (node.tech) {
    const chipWidth = Math.min(measureWidth(node.tech, SUB_SIZE) + 2 * CHIP_PAD_X, maxTextWidth);
    const chip: Rect = { x: textX, y: TILE_Y + 18, width: chipWidth, height: CHIP_HEIGHT };
    layout.techPos = { chip, text: { x: textX + chipWidth / 2, y: TILE_Y + 28.5 } };
  }

  if (node.description) {
    const m = measure("Ag", SUB_SIZE);
    const avail = width - DESC_X - PAD_X;
    const lines = wrap(node.description, SUB_SIZE, avail);
    if (lines.length > MAX_DESC_LINES) {
      const clamped = lines.slice(0, MAX_DESC_LINES);
      clamped[MAX_DESC_LINES - 1] = truncateToWidth(
        `${clamped[MAX_DESC_LINES - 1]!}…`,
        SUB_SIZE,
        avail,
        "regular",
      );
      layout.descLines = clamped;
    } else {
      layout.descLines = lines;
    }
    layout.descPos = { x: DESC_X, y: DESC_TOP + m.ascent };
    layout.height = DESC_TOP + layout.descLines.length * m.lineHeight + DESC_BOTTOM;
  }

  return layout;
}

// ------------------------------------------------------------ shared card pieces

interface CardColors {
  /** category accent (CSS var or literal) */
  accent: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  mutedFg: string;
}

/** lucide symbols lose the root <svg>'s stroke attrs when inlined as defs —
 * re-apply them on the <use> so they inherit into the shadow tree. */
function lucideUse(meta: CategoryMeta, tile: Rect, stroke: string): string {
  const x = tile.x + (tile.width - TILE_ICON) / 2;
  const y = tile.y + (tile.height - TILE_ICON) / 2;
  return (
    `<use href="#i-${cssId(resolveIcon(meta.icon))}" x="${fmt(x)}" y="${fmt(y)}"` +
    ` width="${TILE_ICON}" height="${TILE_ICON}" fill="none" stroke="${stroke}"` +
    ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

/** Node label text (scene label wins, path tail as last resort). */
const cardLabelText = (n: SceneNode): string => n.label?.text ?? n.path.split("/").pop() ?? "";

/** Border stroke attributes: dashed categories use the accent at 50%. */
function borderAttrs(category: string, colors: CardColors): string {
  return DASHED_CATEGORIES.has(category)
    ? ` stroke="${colors.accent}" stroke-opacity=".5" stroke-dasharray="4 3"`
    : ` stroke="${colors.border}"`;
}

// ------------------------------------------------------------ interactive variant

/**
 * Interactive card markup: theme-reactive via CSS custom properties — the
 * accent comes from `--cat-<colorGroup>` (cardCssVars), surfaces from
 * `--card`/`--border`/`--muted`/`--muted-foreground` with light fallbacks.
 */
export function renderCardSvg(n: SceneNode, opts: { interactive: boolean }): string {
  if (!n.category) throw new Error(`renderCardSvg: node ${n.path} has no category`);
  const meta = categoryMeta(n.category);
  const colors: CardColors = {
    accent: `var(--cat-${meta.colorGroup})`,
    card: "var(--card,#ffffff)",
    border: "var(--border,#e2e8f0)",
    text: "var(--ia-text)",
    muted: "var(--muted,#f1f5f9)",
    mutedFg: "var(--muted-foreground,#64748b)",
  };
  const s = sizeCard({ label: cardLabelText(n), category: n.category, tech: n.tech, description: n.description });
  const { x, y } = n.rect;
  const w = n.rect.width;
  const h = n.rect.height;
  const maxTextWidth = w - s.labelPos.x - PAD_X;

  let open = "<g>";
  if (opts.interactive) {
    open = `<g class="node node-card" data-path="${escapeXml(n.path)}"`;
    if (n.href) open += ` data-href="${escapeXml(n.href)}"`;
    if (n.meta) open += ` data-meta="${escapeXml(JSON.stringify(n.meta))}"`;
    open += ">";
  }
  const bits: string[] = [
    open,
    // card surface + border (dashed for "external"-style categories)
    `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="${CARD_RADIUS}"` +
      ` fill="${colors.card}" stroke-width="1"${borderAttrs(n.category, colors)}/>`,
    // 3px accent bar (inset 1px like the legacy static export)
    `<rect x="${fmt(x + 1)}" y="${fmt(y + 1)}" width="${ACCENT_WIDTH}" height="${fmt(h - 2)}"` +
      ` fill="${colors.accent}" opacity="${ACCENT_OPACITY}"/>`,
    // tinted icon tile: category color via fill-opacity (NOT color-mix)
    `<rect x="${fmt(x + s.iconTile.x)}" y="${fmt(y + s.iconTile.y)}" width="${fmt(s.iconTile.width)}"` +
      ` height="${fmt(s.iconTile.height)}" rx="${TILE_RADIUS}" fill="${colors.accent}"` +
      ` fill-opacity="${TILE_TINT_OPACITY}"/>`,
    lucideUse(meta, { ...s.iconTile, x: x + s.iconTile.x, y: y + s.iconTile.y }, colors.accent),
    // label — 12px semibold, metrics-truncated
    `<text x="${fmt(x + s.labelPos.x)}" y="${fmt(y + s.labelPos.y)}" font-size="${LABEL_SIZE}"` +
      ` font-weight="600" fill="${colors.text}">` +
      `${escapeXml(truncateToWidth(cardLabelText(n), LABEL_SIZE, maxTextWidth, "semibold"))}</text>`,
  ];

  if (s.techPos && n.tech) {
    const c = s.techPos.chip;
    const tech = truncateToWidth(n.tech, SUB_SIZE, c.width - 2 * CHIP_PAD_X, "regular");
    bits.push(
      `<rect x="${fmt(x + c.x)}" y="${fmt(y + c.y)}" width="${fmt(c.width)}" height="${fmt(c.height)}"` +
        ` rx="4" fill="${colors.muted}"/>`,
      `<text x="${fmt(x + s.techPos.text.x)}" y="${fmt(y + s.techPos.text.y)}" font-size="${SUB_SIZE}"` +
        ` font-weight="500" text-anchor="middle" fill="${colors.mutedFg}">${escapeXml(tech)}</text>`,
    );
  } else {
    // fallback: Korean category name where the chip would sit
    bits.push(
      `<text x="${fmt(x + s.labelPos.x)}" y="${fmt(y + TILE_Y + 28.5)}" font-size="${SUB_SIZE}"` +
        ` fill="${colors.mutedFg}">${escapeXml(meta.labelKo)}</text>`,
    );
  }

  if (s.descLines && s.descPos) {
    const lh = measure("Ag", SUB_SIZE).lineHeight;
    s.descLines.forEach((line, i) => {
      bits.push(
        `<text x="${fmt(x + s.descPos!.x)}" y="${fmt(y + s.descPos!.y + i * lh)}"` +
          ` font-size="${SUB_SIZE}" fill="${colors.mutedFg}">${escapeXml(line)}</text>`,
      );
    });
  }

  bits.push("</g>");
  return bits.join("");
}

// ------------------------------------------------------------ static variant

/** static-only surface tokens (theme.ts has no card/muted tokens) */
const STATIC_SURFACES: Record<ThemeName, { card: string; border: string; muted: string; mutedFg: string }> = {
  light: { card: "#FFFFFF", border: "#E2E8F0", muted: "#F1F5F9", mutedFg: "#64748B" },
  dark: { card: "#1F2937", border: "#334155", muted: "#2B3648", mutedFg: "#94A3B8" },
};

/**
 * Static card markup: literal palette colors (CATEGORY_COLORS_LIGHT/DARK),
 * no classes / data attributes / CSS variables, all text outlined to paths.
 */
export function renderCardStatic(n: SceneNode, theme: ThemeName = "light"): string {
  if (!n.category) throw new Error(`renderCardStatic: node ${n.path} has no category`);
  const meta = categoryMeta(n.category);
  const palette = theme === "dark" ? CATEGORY_COLORS_DARK : CATEGORY_COLORS_LIGHT;
  const surface = STATIC_SURFACES[theme];
  const colors: CardColors = {
    accent: palette[meta.colorGroup],
    card: surface.card,
    border: surface.border,
    text: THEMES[theme].text,
    muted: surface.muted,
    mutedFg: surface.mutedFg,
  };
  const s = sizeCard({ label: cardLabelText(n), category: n.category, tech: n.tech, description: n.description });
  const { x, y } = n.rect;
  const w = n.rect.width;
  const h = n.rect.height;
  const maxTextWidth = w - s.labelPos.x - PAD_X;

  const textPath = (text: string, px: number, py: number, size: number, weight: FontWeight, fill: string): string =>
    `<path d="${textToPathD(text, px, py, size, weight)}" fill="${fill}"/>`;

  const bits: string[] = [
    "<g>",
    `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="${CARD_RADIUS}"` +
      ` fill="${colors.card}" stroke-width="1"${borderAttrs(n.category, colors)}/>`,
    `<rect x="${fmt(x + 1)}" y="${fmt(y + 1)}" width="${ACCENT_WIDTH}" height="${fmt(h - 2)}"` +
      ` fill="${colors.accent}" opacity="${ACCENT_OPACITY}"/>`,
    `<rect x="${fmt(x + s.iconTile.x)}" y="${fmt(y + s.iconTile.y)}" width="${fmt(s.iconTile.width)}"` +
      ` height="${fmt(s.iconTile.height)}" rx="${TILE_RADIUS}" fill="${colors.accent}"` +
      ` fill-opacity="${TILE_TINT_OPACITY}"/>`,
    lucideUse(meta, { ...s.iconTile, x: x + s.iconTile.x, y: y + s.iconTile.y }, colors.accent),
    textPath(
      truncateToWidth(cardLabelText(n), LABEL_SIZE, maxTextWidth, "semibold"),
      x + s.labelPos.x,
      y + s.labelPos.y,
      LABEL_SIZE,
      "semibold",
      colors.text,
    ),
  ];

  if (s.techPos && n.tech) {
    const c = s.techPos.chip;
    const tech = truncateToWidth(n.tech, SUB_SIZE, c.width - 2 * CHIP_PAD_X, "regular");
    const tw = measureWidth(tech, SUB_SIZE);
    bits.push(
      `<rect x="${fmt(x + c.x)}" y="${fmt(y + c.y)}" width="${fmt(c.width)}" height="${fmt(c.height)}"` +
        ` rx="4" fill="${colors.muted}"/>`,
      textPath(tech, x + s.techPos.text.x - tw / 2, y + s.techPos.text.y, SUB_SIZE, "regular", colors.mutedFg),
    );
  } else {
    bits.push(textPath(meta.labelKo, x + s.labelPos.x, y + TILE_Y + 28.5, SUB_SIZE, "regular", colors.mutedFg));
  }

  if (s.descLines && s.descPos) {
    const lh = measure("Ag", SUB_SIZE).lineHeight;
    s.descLines.forEach((line, i) => {
      bits.push(textPath(line, x + s.descPos!.x, y + s.descPos!.y + i * lh, SUB_SIZE, "regular", colors.mutedFg));
    });
  }

  bits.push("</g>");
  return bits.join("");
}

// ------------------------------------------------------------ CSS variables

/**
 * `--cat-<colorGroup>` custom-property declarations for one theme, without a
 * surrounding selector — html.ts wraps them in :root / [data-theme] blocks
 * exactly like themeVars().
 */
export function cardCssVars(theme: ThemeName): string {
  const palette = theme === "dark" ? CATEGORY_COLORS_DARK : CATEGORY_COLORS_LIGHT;
  return Object.entries(palette)
    .map(([group, color]) => `--cat-${group}:${color};`)
    .join("");
}
