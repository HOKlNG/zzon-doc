/**
 * Legend DATA emitter (viewer-frame contract §1 `legend`).
 *
 * The frame never imports canvas style constants (CARD_CATEGORY_META,
 * GROUP_STYLES, …) — the canvas resolves "what the scene actually uses +
 * the final color" here and ships it as plain data; the frame only draws.
 *
 * Entry order mirrors the legacy auto-legend: used card categories
 * (first-use order), then edge layers (swatch = the layer's first edge
 * style), then group kinds. Colors are literal (light palette — same
 * known gap as the light-fixed static SVG export).
 */
import type { Scene, SceneEdge } from "../layout/scene.ts";
import { GROUP_STYLES, type GroupKind } from "./group-styles.ts";
import { CARD_CATEGORY_META } from "./card.ts";
import { CATEGORY_COLORS_LIGHT } from "./categories.gen.ts";

// ------------------------------------------------------------ contract types

export interface LegendSwatch {
  type: "dot" | "line" | "border";
  color: string;
  /** stroke-dasharray value, only for dashed line/border swatches */
  dash?: string;
}

export interface LegendEntry {
  group: "category" | "edge" | "groupKind";
  label: string;
  swatch: LegendSwatch;
}

// ------------------------------------------------------------ label + style tables

/** Korean display names for the engine's group kinds (legacy legend UX). */
const GROUP_KIND_LABEL_KO: Record<GroupKind, string> = {
  "aws-cloud": "AWS 클라우드",
  region: "리전",
  "availability-zone": "가용영역",
  account: "계정",
  vpc: "VPC",
  "public-subnet": "퍼블릭 서브넷",
  "private-subnet": "프라이빗 서브넷",
  "security-group": "보안 그룹",
  "auto-scaling": "오토 스케일링",
  "corporate-data-center": "데이터 센터",
  "server-contents": "서버",
  "spot-fleet": "스팟 플릿",
  generic: "그룹",
};

/** local copy of the edge dash presets (svg.ts is off-limits to this module) */
const EDGE_DASH: Record<SceneEdge["style"]["preset"], string | undefined> = {
  default: undefined,
  dotted: "2 3",
  dashed: "6 4",
};

// ------------------------------------------------------------ emitter

/**
 * Resolved legend entries for one finished Scene: ONLY what the scene uses.
 * Returns [] when the scene has no categories, edge layers, or groups.
 */
export function legendEntries(scene: Scene): LegendEntry[] {
  const entries: LegendEntry[] = [];

  // -- used card categories, first-use order (unknowns fall back to "other")
  const cats: string[] = [];
  for (const n of scene.nodes) {
    if (n.category && !cats.includes(n.category)) cats.push(n.category);
  }
  for (const c of cats) {
    const m = CARD_CATEGORY_META[c] ?? CARD_CATEGORY_META["other"]!;
    entries.push({
      group: "category",
      label: m.labelKo,
      swatch: { type: "dot", color: CATEGORY_COLORS_LIGHT[m.colorGroup] },
    });
  }

  // -- edge layers present, first-use order; swatch mirrors the layer's first edge
  const layerEdges = new Map<string, SceneEdge>();
  for (const e of scene.edges) {
    if (e.layer && !layerEdges.has(e.layer)) layerEdges.set(e.layer, e);
  }
  for (const [layer, e] of layerEdges) {
    const dash = EDGE_DASH[e.style.preset];
    entries.push({
      group: "edge",
      label: layer,
      swatch: { type: "line", color: e.style.color, ...(dash ? { dash } : {}) },
    });
  }

  // -- group kinds present, first-use order; border swatch from GROUP_STYLES
  const kinds: GroupKind[] = [];
  for (const g of scene.groups) {
    if (!kinds.includes(g.groupKind)) kinds.push(g.groupKind);
  }
  for (const k of kinds) {
    const s = GROUP_STYLES[k];
    entries.push({
      group: "groupKind",
      label: GROUP_KIND_LABEL_KO[k],
      swatch: {
        type: "border",
        color: s.stroke,
        ...(s.strokeDasharray ? { dash: s.strokeDasharray } : {}),
      },
    });
  }

  return entries;
}
