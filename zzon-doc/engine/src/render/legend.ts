/**
 * Auto legend (ported from the legacy renderer's bottom-left legend): lists
 * ONLY what the scene actually uses — card categories (color dot + Korean
 * name), edge layers (line swatch in the layer's first-edge style), and group
 * kinds (border-style swatch). Collapsible with zero state via <details>.
 *
 * Pure string producer — html.ts appends renderLegendHtml() to the shell and
 * LEGEND_CSS to the stylesheet; nothing here touches the DOM or the Scene.
 */
import type { Scene, SceneEdge } from "../layout/scene.ts";
import { GROUP_STYLES, type GroupKind } from "./group-styles.ts";
import { CARD_CATEGORY_META } from "./card.ts";

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

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** local escaper — svg.ts's is reserved for the shared renderer modules */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

// ------------------------------------------------------------ markup

const item = (swatch: string, label: string): string =>
  `<span class="item">${swatch}${escapeHtml(label)}</span>`;

const SEP = `<span class="sep"></span>`;

/**
 * Bottom-left collapsible legend for one finished Scene. Returns "" when the
 * scene uses no categories, edge layers, or groups (nothing to explain).
 * Category dots reference the same `--cat-*` variables cardCssVars() emits.
 */
export function renderLegendHtml(scene: Scene): string {
  const sections: string[][] = [];

  // -- used card categories, first-use order (unknowns fall back to "other")
  const cats: string[] = [];
  for (const n of scene.nodes) {
    if (n.category && !cats.includes(n.category)) cats.push(n.category);
  }
  if (cats.length > 0) {
    sections.push(
      cats.map((c) => {
        const m = CARD_CATEGORY_META[c] ?? CARD_CATEGORY_META["other"]!;
        return item(`<span class="dot" style="background:var(--cat-${m.colorGroup})"></span>`, m.labelKo);
      }),
    );
  }

  // -- edge layers present, first-use order; swatch mirrors the layer's first edge
  const layerEdges = new Map<string, SceneEdge>();
  for (const e of scene.edges) {
    if (e.layer && !layerEdges.has(e.layer)) layerEdges.set(e.layer, e);
  }
  if (layerEdges.size > 0) {
    sections.push(
      [...layerEdges.entries()].map(([layer, e]) => {
        const dash = EDGE_DASH[e.style.preset];
        const line =
          `<svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3"` +
          ` stroke="${e.style.color}" stroke-width="1.5"${dash ? ` stroke-dasharray="${dash}"` : ""}/></svg>`;
        return item(line, layer);
      }),
    );
  }

  // -- group kinds present, first-use order; border-style swatch from GROUP_STYLES
  const kinds: GroupKind[] = [];
  for (const g of scene.groups) {
    if (!kinds.includes(g.groupKind)) kinds.push(g.groupKind);
  }
  if (kinds.length > 0) {
    sections.push(
      kinds.map((k) => {
        const s = GROUP_STYLES[k];
        const rect =
          `<svg width="16" height="10"><rect x="1" y="1" width="14" height="8" rx="2"` +
          ` fill="${s.fill ?? "none"}" stroke="${s.stroke}" stroke-width="1.2"` +
          `${s.strokeDasharray ? ` stroke-dasharray="3 2"` : ""}/></svg>`;
        return item(rect, GROUP_KIND_LABEL_KO[k]);
      }),
    );
  }

  if (sections.length === 0) return "";
  const body = sections.map((s) => s.join("")).join(SEP);
  return (
    `<details class="ia-legend" open><summary>범례</summary>` +
    `<div class="ia-legend-items">${body}</div></details>`
  );
}

// ------------------------------------------------------------ styles

/** Appended once to the interactive HTML stylesheet (html.ts). */
export const LEGEND_CSS = `
.ia-legend{position:absolute;left:12px;bottom:12px;z-index:30;max-width:60%;
  border:1px solid var(--border,#e2e8f0);border-radius:8px;
  background:var(--card,#ffffff);padding:6px 12px 8px;
  box-shadow:0 1px 3px rgba(0,0,0,.06);}
.ia-legend summary{cursor:pointer;font-size:11px;font-weight:600;
  color:var(--muted-foreground,#64748b);user-select:none;list-style:none;}
.ia-legend summary::-webkit-details-marker{display:none;}
.ia-legend[open] summary{margin-bottom:6px;}
.ia-legend-items{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;}
.ia-legend .item{display:inline-flex;align-items:center;gap:4px;font-size:11px;
  color:var(--muted-foreground,#64748b);}
.ia-legend .dot{width:8px;height:8px;border-radius:9999px;display:inline-block;}
.ia-legend .sep{width:1px;height:12px;background:var(--border,#e2e8f0);}
`;
