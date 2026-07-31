/**
 * Narrative flows — canvas half only (viewer-frame contract split).
 *
 * Pipeline half: `resolveFlows` runs AFTER routing (edges must have points)
 * and fills `scene.flows` with badge positions on the edge polylines.
 * Render half: `renderFlowBadgesSvg` (badge layers INSIDE the SVG, they
 * pan/zoom with the diagram) plus FLOW_BADGE_CSS (badge visibility, pop-in
 * animation, flow dim/fade/highlight classes) which adapter.ts ships as
 * canvas CSS. The flow CHROME — buttons, narration strips, step focusing
 * UI — is the frame's job now; the frame drives these badges through the
 * adapter's highlight("flow"|"step", …) commands.
 *
 * Legacy UX semantics kept:
 *   - one badge per (flow, edge); an edge used by steps 1 and 4 of the same
 *     flow shows a single "1·4" badge (legacy joined step numbers with "·")
 *   - when the SAME edge carries multiple steps (across all flows), badges
 *     are offset along the polyline (t = 0.5 ± k·0.12) so they never stack
 */
import type { Scene, SceneFlow, SceneFlowStep } from "../layout/scene.ts";
import type { Point } from "../model/geometry.ts";
import type { FlowDef } from "../model/types.ts";
import { cssId } from "../icons/load.ts";
import { measureWidth } from "../text/metrics.ts";

// ------------------------------------------------------------ local primitives

// svg.ts's escaper is renderer-internal; flows stays self-contained.
const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c);
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const fmt = (n: number): string => String(r2(n));

/** flow accent color; themable via --flow (adapter.ts defines it), indigo fallback */
export const FLOW_COLOR = "var(--flow, #4f46e5)";
/** badge circle radius for a single step number */
export const BADGE_RADIUS = 10;
const BADGE_FONT_SIZE = 11;
/** polyline-fraction spacing between badges sharing one edge */
const BADGE_T_STEP = 0.12;

/** Point at fraction `t` (0..1 of total length) along a routed polyline. */
function pointAt(points: readonly Point[], t: number): Point {
  const first = points[0];
  if (!first) throw new Error("pointAt: empty polyline");
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    lens.push(len);
    total += len;
  }
  if (total === 0) return { x: first.x, y: first.y };
  let remain = Math.min(1, Math.max(0, t)) * total;
  for (let i = 0; i < lens.length; i++) {
    const len = lens[i]!;
    if (remain <= len || i === lens.length - 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const u = len === 0 ? 0 : Math.min(1, remain / len);
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    remain -= len;
  }
  return { x: first.x, y: first.y }; // unreachable
}

// ------------------------------------------------------------ resolve (pipeline)

/**
 * Fill `scene.flows` from model FlowDefs. Must run AFTER routing: badge
 * centers sit on the edge polylines (t = 0.5; the k-th badge on an edge
 * already carrying badges lands at 0.62, 0.38, 0.74, … so badges never
 * stack, even across flows). Coordinates are rounded to 2 decimals
 * (canonicalScene convention). Flow titles, step texts, and the badge label
 * strings ("3", "1·4") are registered in `scene.texts` for font subsetting.
 *
 * Throws on a step referencing an unknown or unrouted edge, naming the flow
 * and step.
 */
export function resolveFlows(scene: Scene, flows: FlowDef[]): void {
  const edgeById = new Map(scene.edges.map((e) => [e.id, e]));
  // occurrences of each edge across ALL flows, in (flow, step) order
  const occurrences = new Map<string, number>();
  const addText = (t: string): void => {
    if (!scene.texts.includes(t)) scene.texts.push(t);
  };

  scene.flows = flows.map((flow) => {
    addText(flow.title);
    if (flow.description) addText(flow.description);
    const steps = flow.steps.map((step, i): SceneFlowStep => {
      const edge = edgeById.get(step.edge);
      if (!edge) {
        throw new Error(`flow "${flow.id}" step ${i + 1}: unknown edge "${step.edge}"`);
      }
      if (edge.points.length === 0) {
        throw new Error(
          `flow "${flow.id}" step ${i + 1}: edge "${step.edge}" has no route — resolveFlows must run after routing`,
        );
      }
      const k = occurrences.get(step.edge) ?? 0;
      occurrences.set(step.edge, k + 1);
      // k=0 → 0.5, then alternate ±0.12 steps outward: 0.62, 0.38, 0.74, …
      const t = 0.5 + Math.ceil(k / 2) * BADGE_T_STEP * (k % 2 === 1 ? 1 : -1);
      const p = pointAt(edge.points, Math.min(0.92, Math.max(0.08, t)));
      addText(step.text);
      return { edgeId: step.edge, text: step.text, badge: { x: r2(p.x), y: r2(p.y) }, n: i + 1 };
    });
    const resolved: SceneFlow = { id: flow.id, title: flow.title, description: flow.description, steps };
    for (const b of badgeGroups(resolved)) addText(b.label);
    return resolved;
  });
}

// ------------------------------------------------------------ badge grouping

interface BadgeGroup {
  edgeId: string;
  /** circle center: the badge point of the group's FIRST step */
  at: Point;
  /** 1-based step numbers, ascending */
  ns: number[];
  /** rendered glyphs — numbers joined with "·" (legacy "1·4" semantics) */
  label: string;
}

/** One badge per (flow, edge): steps of a flow sharing an edge merge. */
function badgeGroups(flow: SceneFlow): BadgeGroup[] {
  const byEdge = new Map<string, BadgeGroup>();
  for (const s of flow.steps) {
    const hit = byEdge.get(s.edgeId);
    if (hit) hit.ns.push(s.n);
    else byEdge.set(s.edgeId, { edgeId: s.edgeId, at: s.badge, ns: [s.n], label: "" });
  }
  return [...byEdge.values()].map((g) => ({ ...g, label: g.ns.join("·") }));
}

// ------------------------------------------------------------ SVG badges

/**
 * Per-flow badge layers, appended INSIDE the interactive SVG (after markers)
 * so badges pan/zoom with the diagram. Hidden by default via FLOW_BADGE_CSS;
 * the canvas runtime toggles `.active` on the matching layer when the frame
 * commands highlight("flow"|"step", …). Multi-number labels get a measured
 * radius (never estimated) so "1·4" fits; single digits keep r=10.
 */
export function renderFlowBadgesSvg(scene: Scene): string {
  if (scene.flows.length === 0) return "";
  const layers = scene.flows.map((f) => {
    const bits: string[] = [
      `<g class="flow-badges flow-${cssId(f.id)}" data-flow="${escapeXml(f.id)}">`,
    ];
    for (const b of badgeGroups(f)) {
      const r = Math.max(BADGE_RADIUS, r2(measureWidth(b.label, BADGE_FONT_SIZE, "semibold") / 2 + 5));
      bits.push(
        `<g class="flow-badge" data-edge-id="${escapeXml(b.edgeId)}"` +
          ` data-steps="${b.ns.join(" ")}" style="--step-index:${b.ns[0]! - 1}">` +
          `<circle cx="${fmt(b.at.x)}" cy="${fmt(b.at.y)}" r="${fmt(r)}" fill="${FLOW_COLOR}"/>` +
          `<text x="${fmt(b.at.x)}" y="${fmt(b.at.y + 4)}" font-size="${BADGE_FONT_SIZE}"` +
          ` font-weight="600" text-anchor="middle" fill="#FFFFFF">${escapeXml(b.label)}</text>` +
          `</g>`,
      );
    }
    bits.push(`</g>`);
    return bits.join("");
  });
  return `<g class="flows">\n${layers.join("\n")}\n</g>`;
}

// ------------------------------------------------------------ CSS block

/**
 * Canvas-side flow rules (adapter.ts ships them in the canvas CSS bundle).
 * Badge layers are hidden until the runtime activates one; .flow-dim /
 * .flow-fade are flow-owned so the hover interactions' .dim toggling can
 * never clobber flow state. Badge pop-in is staggered by step (legacy
 * dg-badge-pop), disabled under reduced motion. The flow-chrome rules
 * (buttons, narration strips) moved to the frame.
 */
export const FLOW_BADGE_CSS: string = [
  `.flow-badges{display:none}`,
  `.flow-badges.active{display:initial}`,
  `.flow-badge{cursor:pointer}`,
  `.flow-badge text{user-select:none}`,
  `.flow-badge.on circle{stroke:#FFFFFF;stroke-width:2.5}`,
  `.flow-dim{opacity:.25}`,
  `.flow-fade{opacity:.5}`,
  `.edge.flow-hl path{stroke:var(--flow,#4f46e5);stroke-width:2.25}`,
  `@keyframes flow-pop{to{transform:scale(1)}}`,
  `.flow-badges.active .flow-badge{transform:scale(0);transform-box:fill-box;transform-origin:center;` +
    `animation:flow-pop 280ms cubic-bezier(.34,1.56,.64,1) forwards;` +
    `animation-delay:calc(var(--step-index,0)*220ms + 120ms)}`,
  `@media (prefers-reduced-motion:reduce){.flow-badges.active .flow-badge{animation:none;transform:scale(1)}}`,
].join("\n");
