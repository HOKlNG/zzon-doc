/**
 * Edge label placement (DESIGN.md §5.3-4).
 *
 * Anchors the label at a fraction t along the routed polyline:
 *   "source" → 0.15, "center" → 0.5 (default), "target" → 0.85, number → t.
 * Bundled edges default to their distinct end (source for fan-in, target for
 * fan-out) so labels don't pile up on the shared trunk; a bundle whose
 * members all carry the same label gets ONE collapsed label on the trunk.
 *
 * Overlap avoidance: a few candidate positions are probed along the polyline
 * (and on both sides of the segment) and the first label box that clears
 * every scene node rect wins; if none clears, the base position is kept.
 */
import { measure } from "../text/metrics.ts";
import type { SceneEdge, SceneLabel } from "../layout/scene.ts";
import type { Edge } from "../model/types.ts";
import type { Rect, Point } from "../model/geometry.ts";
import { rectsOverlap } from "../model/geometry.ts";
import type { BundlePlan, Bundle } from "./bundle.ts";

export const EDGE_LABEL_FONT_SIZE = 11;
const EDGE_LABEL_COLOR = "#545B64";
/** gap between the polyline and the label box */
const LABEL_GAP = 6;
/** t offsets probed (in order) around the base placement */
const T_CANDIDATES = [0, -0.08, 0.08, -0.16, 0.16, -0.24, 0.24] as const;

const r2 = (n: number) => Math.round(n * 100) / 100;

interface AnchorInfo {
  point: Point;
  /** orientation of the segment containing the anchor */
  horizontal: boolean;
}

function polylineLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    len += Math.abs(b.x - a.x) + Math.abs(b.y - a.y); // orthogonal → manhattan = euclid
  }
  return len;
}

function pointAt(points: Point[], t: number): AnchorInfo {
  const total = polylineLength(points);
  const first = points[0]!;
  if (total === 0) return { point: first, horizontal: true };
  let remain = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (remain <= seg && seg > 0) {
      const f = remain / seg;
      return {
        point: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
        horizontal: Math.abs(b.y - a.y) < Math.abs(b.x - a.x),
      };
    }
    remain -= seg;
  }
  const last = points[points.length - 1]!;
  const prev = points[points.length - 2] ?? last;
  return { point: last, horizontal: Math.abs(last.y - prev.y) < Math.abs(last.x - prev.x) };
}

interface LabelBox {
  label: SceneLabel;
  box: Rect;
}

/**
 * Label + bounding box for anchor `at`. `flip` mirrors to the other side of
 * the segment (below instead of above / left instead of right).
 */
function labelAt(text: string, at: AnchorInfo, flip: boolean): LabelBox {
  const m = measure(text, EDGE_LABEL_FONT_SIZE);
  const h = m.ascent + m.descent;
  if (at.horizontal) {
    const baseline = flip ? at.point.y + LABEL_GAP + m.ascent : at.point.y - LABEL_GAP - m.descent;
    return {
      label: {
        text,
        x: r2(at.point.x),
        y: r2(baseline),
        fontSize: EDGE_LABEL_FONT_SIZE,
        weight: "regular",
        align: "middle",
        color: EDGE_LABEL_COLOR,
      },
      box: { x: at.point.x - m.width / 2, y: baseline - m.ascent, width: m.width, height: h },
    };
  }
  const x = flip ? at.point.x - LABEL_GAP - m.width : at.point.x + LABEL_GAP;
  const baseline = at.point.y + (m.ascent - m.descent) / 2;
  return {
    label: {
      text,
      x: r2(x),
      y: r2(baseline),
      fontSize: EDGE_LABEL_FONT_SIZE,
      weight: "regular",
      align: "start",
      color: EDGE_LABEL_COLOR,
    },
    box: { x, y: baseline - m.ascent, width: m.width, height: h },
  };
}

function clears(box: Rect, obstacles: readonly Rect[]): boolean {
  return !obstacles.some((r) => rectsOverlap(box, r, 1));
}

/** Probe candidates around base t; first clear position wins, else base. */
function placeAlong(text: string, points: Point[], baseT: number, obstacles: readonly Rect[]): LabelBox {
  let fallback: LabelBox | undefined;
  for (const dt of T_CANDIDATES) {
    const t = Math.min(Math.max(baseT + dt, 0.03), 0.97);
    for (const flip of [false, true]) {
      const cand = labelAt(text, pointAt(points, t), flip);
      fallback ??= cand;
      if (clears(cand.box, obstacles)) return cand;
    }
  }
  return fallback!;
}

function resolveT(placement: Edge["labelPlacement"], bundle: Bundle | undefined): number {
  if (typeof placement === "number") return Math.min(Math.max(placement, 0), 1);
  switch (placement) {
    case "source": return 0.15;
    case "target": return 0.85;
    case "center": return 0.5;
    default:
      // bundled default: the edge's DISTINCT end (spec: source for fan-in;
      // fan-out is symmetric), so per-edge labels avoid the shared trunk
      if (bundle) return bundle.end === "target" ? 0.15 : 0.85;
      return 0.5;
  }
}

/** Trunk midpoint label for a collapsed bundle (trunk = segment at the shared end). */
function placeOnTrunk(bundle: Bundle, points: Point[], obstacles: readonly Rect[]): LabelBox {
  const mid: Point = {
    x: (bundle.junction.x + bundle.attach.x) / 2,
    y: (bundle.junction.y + bundle.attach.y) / 2,
  };
  const horizontal = bundle.side === "E" || bundle.side === "W";
  for (const flip of [false, true]) {
    const cand = labelAt(bundle.collapsedLabel!, { point: mid, horizontal }, flip);
    if (clears(cand.box, obstacles)) return cand;
  }
  // both sides blocked: fall back to probing along the whole polyline
  return placeAlong(bundle.collapsedLabel!, points, bundle.end === "target" ? 0.9 : 0.1, obstacles);
}

/**
 * Mutates `routed` SceneEdges in place, setting `label`. `obstacles` are the
 * scene node rects labels must not cover.
 */
export function placeEdgeLabels(opts: {
  edges: Edge[];
  routed: Map<string, SceneEdge>;
  plan: BundlePlan;
  obstacles: readonly Rect[];
}): void {
  const { edges, routed, plan, obstacles } = opts;

  // labels already placed become obstacles for the ones that follow, so edge
  // labels never overlap each other (placement order = edge input order)
  const placed: Rect[] = [];
  const all = () => [...obstacles, ...placed];

  // collapsed-bundle labels: one label on the trunk of the first member
  const suppressed = new Set<string>();
  for (const bundle of plan.bundles) {
    if (bundle.collapsedLabel === undefined) continue;
    for (const id of bundle.edgeIds) suppressed.add(id);
    const carrierId = bundle.edgeIds.find((id) => routed.has(id));
    if (carrierId === undefined) continue;
    const carrier = routed.get(carrierId)!;
    const lb = placeOnTrunk(bundle, carrier.points, all());
    carrier.label = lb.label;
    placed.push(lb.box);
  }

  for (const edge of edges) {
    if (edge.label === undefined || suppressed.has(edge.id)) continue;
    const sceneEdge = routed.get(edge.id);
    if (!sceneEdge || sceneEdge.points.length < 2) continue;
    const t = resolveT(edge.labelPlacement, plan.byEdge.get(edge.id));
    const lb = placeAlong(edge.label, sceneEdge.points, t, all());
    sceneEdge.label = lb.label;
    placed.push(lb.box);
  }
}
