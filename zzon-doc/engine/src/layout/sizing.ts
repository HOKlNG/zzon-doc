/**
 * Content-derived sizing for nodes and group chrome. All text goes through
 * src/text/metrics.ts so sizes are exact for the embedded font.
 */
import { measure, wrap } from "../text/metrics.ts";
import type { ActorEl, GroupKind, NodeEl, RailItem } from "../model/types.ts";
import type { Rect } from "../model/geometry.ts";
import type { SceneLabel } from "./scene.ts";

export const NODE_ICON = 48;
export const RAIL_ICON = 36;
export const ACTOR_ICON = 44;
export const BADGE_ICON = 18;
export const LABEL_SIZE = 12;
export const SUBLABEL_SIZE = 10;
export const GROUP_LABEL_SIZE = 13;
export const GROUP_BADGE = 24;
export const CELL_GAP = 14;
export const NODE_GAP = 18;
export const LABEL_MAX = 130;

/** node visual, positions relative to the node rect origin */
export interface NodeVisual {
  width: number;
  height: number;
  iconRect: Rect;
  labelLines?: string[];
  labelY?: number; // baseline of first label line
  sublabelLines?: string[];
  sublabelY?: number;
  badgeRects?: Rect[];
}

export function sizeNode(
  el: Pick<NodeEl, "label" | "sublabel" | "badges">,
  iconSize: number = NODE_ICON,
): NodeVisual {
  const labelLines = el.label ? wrap(el.label, LABEL_SIZE, LABEL_MAX) : [];
  const sublabelLines = el.sublabel ? wrap(el.sublabel, SUBLABEL_SIZE, LABEL_MAX) : [];
  const labelWidths = labelLines.map((l) => measure(l, LABEL_SIZE).width);
  const sublabelWidths = sublabelLines.map((l) => measure(l, SUBLABEL_SIZE).width);
  const badgeCount = el.badges?.length ?? 0;
  const badgesWidth = badgeCount > 0 ? badgeCount * BADGE_ICON + (badgeCount - 1) * 4 : 0;

  const width = Math.max(iconSize, ...labelWidths, ...sublabelWidths, badgesWidth) + 8;

  const labelLineH = measure("Ag", LABEL_SIZE).lineHeight;
  const sublabelLineH = measure("Ag", SUBLABEL_SIZE).lineHeight;

  let y = 0;
  const iconRect: Rect = { x: (width - iconSize) / 2, y, width: iconSize, height: iconSize };
  y += iconSize;

  let labelY: number | undefined;
  if (labelLines.length) {
    y += 4;
    labelY = y + labelLineH * 0.8; // first baseline
    y += labelLineH * labelLines.length;
  }
  let sublabelY: number | undefined;
  if (sublabelLines.length) {
    sublabelY = y + sublabelLineH * 0.8;
    y += sublabelLineH * sublabelLines.length;
  }
  let badgeRects: Rect[] | undefined;
  if (badgeCount > 0) {
    y += 4;
    badgeRects = Array.from({ length: badgeCount }, (_, i) => ({
      x: (width - badgesWidth) / 2 + i * (BADGE_ICON + 4),
      y,
      width: BADGE_ICON,
      height: BADGE_ICON,
    }));
    y += BADGE_ICON;
  }

  return {
    width,
    height: y + 2,
    iconRect,
    labelLines: labelLines.length ? labelLines : undefined,
    labelY,
    sublabelLines: sublabelLines.length ? sublabelLines : undefined,
    sublabelY,
    badgeRects,
  };
}

export const sizeActor = (el: ActorEl): NodeVisual => sizeNode(el, ACTOR_ICON);
export const sizeRailItem = (it: RailItem): NodeVisual => sizeNode(it, RAIL_ICON);

// ------------------------------------------------------------- group chrome

export interface GroupChrome {
  padTop: number;
  padRight: number;
  padBottom: number;
  padLeft: number;
  /** places for badge glyph + title, relative to group rect */
  badgeRect?: Rect;
  labelPos?: { x: number; y: number };
}

const TITLELESS: GroupKind[] = [];

export function groupChrome(kind: GroupKind, label: string | undefined): GroupChrome {
  const hasTitle = label !== undefined || !TITLELESS.includes(kind);
  const titleH = hasTitle ? Math.max(GROUP_BADGE, measure("Ag", GROUP_LABEL_SIZE).lineHeight) + 10 : 0;
  const badgeRect: Rect | undefined = hasTitle
    ? { x: 0, y: 0, width: GROUP_BADGE, height: GROUP_BADGE }
    : undefined;
  return {
    padTop: titleH + 8,
    padRight: 14,
    padBottom: 14,
    padLeft: 14,
    badgeRect,
    labelPos: hasTitle ? { x: GROUP_BADGE + 8, y: GROUP_BADGE / 2 } : undefined,
  };
}

/** minimum inner width so the title itself fits */
export function groupTitleMinWidth(label: string | undefined): number {
  if (!label) return GROUP_BADGE + 16;
  return GROUP_BADGE + 8 + measure(label, GROUP_LABEL_SIZE, "semibold").width + 16;
}

export function makeLabel(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  opts: Partial<SceneLabel> = {},
): SceneLabel {
  return {
    text,
    x,
    y,
    fontSize,
    weight: opts.weight ?? "regular",
    align: opts.align ?? "middle",
    color: opts.color,
    lines: opts.lines,
  };
}
