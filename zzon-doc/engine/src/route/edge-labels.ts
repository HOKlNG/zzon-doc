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
 * every scene node rect, every placed label AND every FOREIGN edge segment
 * wins (a line drawn through a label reads as strike-through — measured by
 * the label-occlusion gate in src/quality/metrics.ts); if none clears, the
 * candidate with the fewest hits is kept.
 */
import { measure } from "../text/metrics.ts";
import type { SceneEdge, SceneLabel } from "../layout/scene.ts";
import type { Edge } from "../model/types.ts";
import type { Rect, Point } from "../model/geometry.ts";
import { rectsOverlap } from "../model/geometry.ts";
import type { BundlePlan, Bundle } from "./bundle.ts";

export const EDGE_LABEL_FONT_SIZE = 11;
/**
 * Label text color. Unset = the theme edge color (readable in light and dark).
 * Branch answers read at a glance: yes = green, no = red.
 */
function labelColor(text: string): string | undefined {
  const t = text.trim().toLowerCase();
  if (/^(예|네|yes|y|true|참|성공)$/.test(t)) return "#059669";
  if (/^(아니오|아니요|no|n|false|거짓|실패)$/.test(t)) return "#e11d48";
  return undefined;
}
/** gap between the polyline and the label box */
const LABEL_GAP = 6;
/** t offsets probed (in order) around the base placement */
const T_CANDIDATES = [0, -0.08, 0.08, -0.16, 0.16, -0.24, 0.24, -0.32, 0.32, -0.4, 0.4] as const;

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
function labelAt(text: string, at: AnchorInfo, flip: boolean, gapMul = 1): LabelBox {
  const m = measure(text, EDGE_LABEL_FONT_SIZE);
  const h = m.ascent + m.descent;
  const gap = LABEL_GAP * gapMul;
  if (at.horizontal) {
    const baseline = flip ? at.point.y + gap + m.ascent : at.point.y - gap - m.descent;
    return {
      label: {
        text,
        x: r2(at.point.x),
        y: r2(baseline),
        fontSize: EDGE_LABEL_FONT_SIZE,
        weight: "regular",
        align: "middle",
        color: labelColor(text),
      },
      box: { x: at.point.x - m.width / 2, y: baseline - m.ascent, width: m.width, height: h },
    };
  }
  const x = flip ? at.point.x - gap - m.width : at.point.x + gap;
  const baseline = at.point.y + (m.ascent - m.descent) / 2;
  return {
    label: {
      text,
      x: r2(x),
      y: r2(baseline),
      fontSize: EDGE_LABEL_FONT_SIZE,
      weight: "regular",
      align: "start",
      color: labelColor(text),
    },
    box: { x, y: baseline - m.ascent, width: m.width, height: h },
  };
}

/**
 * Obstacles in two weights: HARD = node rects, group/overlay titles, placed
 * labels (overlap = invariant violation); SOFT = edge runs (overlap reads as
 * strike-through but is not a collision). Fallback scoring keeps any soft
 * overlap cheaper than a single hard one.
 */
export interface LabelObstacles {
  hard: readonly Rect[];
  soft: readonly Rect[];
}

const HARD_WEIGHT = 1000;

function hitScore(box: Rect, obs: LabelObstacles): number {
  let n = 0;
  for (const r of obs.hard) if (rectsOverlap(box, r, 1)) n += HARD_WEIGHT;
  for (const r of obs.soft) if (rectsOverlap(box, r, 1)) n += 1;
  return n;
}

function clears(box: Rect, obstacles: LabelObstacles): boolean {
  return hitScore(box, obstacles) === 0;
}

/**
 * Probe candidates around base t (two gap rings); first clear position wins.
 * If nothing clears, take the candidate overlapping the FEWEST obstacles —
 * never the blind base position (dense flow graphs defeat the ring search).
 */
function placeAlong(text: string, points: Point[], baseT: number, obstacles: LabelObstacles): LabelBox {
  let best: LabelBox | undefined;
  let bestHits = Infinity;
  for (const gapMul of [1, 2.4, 4.2]) {
    for (const dt of T_CANDIDATES) {
      const t = Math.min(Math.max(baseT + dt, 0.03), 0.97);
      for (const flip of [false, true]) {
        const cand = labelAt(text, pointAt(points, t), flip, gapMul);
        const hits = hitScore(cand.box, obstacles);
        if (hits === 0) return cand;
        if (hits < bestHits) {
          bestHits = hits;
          best = cand;
        }
      }
    }
  }
  return best!;
}

function resolveT(placement: Edge["labelPlacement"], bundle: Bundle | undefined, points: Point[]): number {
  if (typeof placement === "number") return Math.min(Math.max(placement, 0), 1);
  switch (placement) {
    case "source": return 0.15;
    case "target": return 0.85;
    case "center": return 0.5;
    default:
      // bundled default: the edge's DISTINCT end (spec: source for fan-in;
      // fan-out is symmetric), so per-edge labels avoid the shared trunk
      if (bundle) return bundle.end === "target" ? 0.15 : 0.85;
      return longestRunT(points);
  }
}

/** t of the midpoint of the longest run — the polyline midpoint can land on a tiny jog */
function longestRunT(points: Point[]): number {
  const total = polylineLength(points);
  if (total === 0) return 0.5;
  let acc = 0;
  let best = { len: -1, t: 0.5 };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (len > best.len) best = { len, t: (acc + len / 2) / total };
    acc += len;
  }
  return best.t;
}

type Seg = [Point, Point];

/** two orthogonal segments lying on the same line with overlapping extent (a shared run) */
export function collinearOverlap(p: Seg, q: Seg): boolean {
  const ph = Math.abs(p[0].y - p[1].y) < 0.5;
  const qh = Math.abs(q[0].y - q[1].y) < 0.5;
  if (ph !== qh) return false;
  if (ph) {
    if (Math.abs(p[0].y - q[0].y) > 0.5) return false;
    return Math.min(Math.max(p[0].x, p[1].x), Math.max(q[0].x, q[1].x)) - Math.max(Math.min(p[0].x, p[1].x), Math.min(q[0].x, q[1].x)) > 1;
  }
  if (Math.abs(p[0].x - q[0].x) > 0.5) return false;
  return Math.min(Math.max(p[0].y, p[1].y), Math.max(q[0].y, q[1].y)) - Math.max(Math.min(p[0].y, p[1].y), Math.min(q[0].y, q[1].y)) > 1;
}

/** Trunk midpoint label for a collapsed bundle (trunk = segment at the shared end). */
function placeOnTrunk(bundle: Bundle, points: Point[], obstacles: LabelObstacles): LabelBox {
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
  // every routed segment as a thin rect. A label must clear every line —
  // including its OWN edge's other segments (a label parked on a jog would sit
  // on the next run: strike-through) — except runs it SHARES with its own edge
  // (fan-bundle trunks). Labels never touch their anchor run: labelAt offsets
  // the box by LABEL_GAP.
  const segs: { edgeId: string; seg: Seg; rect: Rect }[] = [];
  for (const [id, e] of routed) {
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1]!;
      const b = e.points[i]!;
      segs.push({
        edgeId: id,
        seg: [a, b],
        rect: { x: Math.min(a.x, b.x) - 1, y: Math.min(a.y, b.y) - 1, width: Math.abs(b.x - a.x) + 2, height: Math.abs(b.y - a.y) + 2 },
      });
    }
  }
  const lineObstacles = (ids: ReadonlySet<string>): Rect[] => {
    const own = segs.filter((s) => ids.has(s.edgeId)).map((s) => s.seg);
    return segs.filter((s) => ids.has(s.edgeId) || !own.some((o) => collinearOverlap(o, s.seg))).map((s) => s.rect);
  };
  const all = (ids: ReadonlySet<string> = new Set()): LabelObstacles => ({
    hard: [...obstacles, ...placed],
    soft: lineObstacles(ids),
  });

  // collapsed-bundle labels: one label on the trunk of the first member
  const suppressed = new Set<string>();
  for (const bundle of plan.bundles) {
    if (bundle.collapsedLabel === undefined) continue;
    for (const id of bundle.edgeIds) suppressed.add(id);
    const carrierId = bundle.edgeIds.find((id) => routed.has(id));
    if (carrierId === undefined) continue;
    const carrier = routed.get(carrierId)!;
    const lb = placeOnTrunk(bundle, carrier.points, all(new Set(bundle.edgeIds)));
    carrier.label = lb.label;
    placed.push(lb.box);
  }

  for (const edge of edges) {
    if (edge.label === undefined || suppressed.has(edge.id)) continue;
    const sceneEdge = routed.get(edge.id);
    if (!sceneEdge || sceneEdge.points.length < 2) continue;
    if (edge.from === edge.to && sceneEdge.points.length === 5) {
      // self-loop: centred ABOVE the loop's top run, never on its own verticals
      const [, , a, b] = sceneEdge.points as [Point, Point, Point, Point, Point];
      const lb = labelAt(edge.label, { point: { x: (a.x + b.x) / 2, y: a.y }, horizontal: true }, false);
      sceneEdge.label = lb.label;
      placed.push(lb.box);
      continue;
    }
    const bundle = plan.byEdge.get(edge.id);
    const t = resolveT(edge.labelPlacement, bundle, sceneEdge.points);
    const lb = placeAlong(edge.label, sceneEdge.points, t, all(new Set([edge.id])));
    sceneEdge.label = lb.label;
    placed.push(lb.box);
  }
}
