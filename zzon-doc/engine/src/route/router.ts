/**
 * Global orthogonal edge routing (DESIGN.md §5.3) — the single post-placement
 * routing pass over the flattened scene.
 *
 * Obstacles are the scene NODE rects; the 8px margin is applied via libavoid's
 * shapeBufferDistance so pins stay exactly on the node borders (group rects
 * are NOT obstacles — edges may cross group borders, as AWS diagrams do).
 * Determinism: shapes are registered sorted by path, connectors sorted by
 * edge id, and every routing parameter is set explicitly.
 *
 * Invariant (§5.3-5): every model edge produces a SceneEdge with ≥ 2 points.
 * Endpoints that match no scene node/group throw, naming the edge id; a
 * degenerate libavoid route falls back to an L-shaped route (flagged via
 * `RoutedSceneEdge.fallback`) so the invariant still holds.
 */
import type { Scene, SceneEdge, SceneLabel } from "../layout/scene.ts";
import type { Edge, EdgeStyle, Side } from "../model/types.ts";
import type { Rect, Point } from "../model/geometry.ts";
import { rectCenter } from "../model/geometry.ts";
import { AvoidRouter, type AvoidEndpoint } from "./avoid-adapter.ts";
import {
  planBundles,
  dominantSide,
  type BundlePlan,
  type EndpointInfo,
  type EdgeEndpoints,
} from "./bundle.ts";
import { placeEdgeLabels } from "./edge-labels.ts";
import { tableAnchorY } from "../render/table.ts";
import { measureWidth } from "../text/metrics.ts";

/** clearance kept between routes and node rects (the §5.3 obstacle margin).
 * NOTE: raising this past ~8 makes endpoint pins fall inside NEIGHBOR shapes'
 * buffers in dense packs — libavoid then gives up and emits straight diagonal
 * routes (caught by the invariant suite). Widen container spacing instead. */
export const OBSTACLE_MARGIN = 8;
/** separation between nudged parallel segments — at 8px parallel edges read
 * as one merged line at overview zoom; 14px keeps them distinguishable */
export const NUDGING_DISTANCE = 14;
export const DEFAULT_EDGE_COLOR = "#545B64";
/** keep group-border attach points away from corners */
const CORNER_CLEARANCE = 12;
const EPS = 0.01;

/** preset → SVG stroke-dasharray (consumed by the renderer; solid = undefined) */
export const EDGE_DASHARRAY: Record<SceneEdge["style"]["preset"], string | undefined> = {
  default: undefined,
  dotted: "2 3",
  dashed: "6 4",
};

/** SceneEdge + routing metadata (SceneEdge itself is frozen in scene.ts). */
export interface RoutedSceneEdge extends SceneEdge {
  /** set when libavoid returned a degenerate route and the L-fallback was used */
  fallback?: true;
}

export function resolveEdgeStyle(style: EdgeStyle | undefined): SceneEdge["style"] {
  return {
    preset: style?.preset ?? "default",
    color: style?.color ?? DEFAULT_EDGE_COLOR,
    arrowhead: style?.arrowhead ?? "end",
  };
}

// ------------------------------------------------------------- geometry

const r2 = (n: number) => Math.round(n * 100) / 100;
const roundPoint = (p: Point): Point => ({ x: r2(p.x), y: r2(p.y) });

/** Drop consecutive duplicates, then merge collinear middles (orthogonal). */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < EPS && Math.abs(last.y - p.y) < EPS) continue;
    out.push(p);
  }
  let i = 1;
  while (i < out.length - 1) {
    const a = out[i - 1]!;
    const b = out[i]!;
    const c = out[i + 1]!;
    const vertical = Math.abs(a.x - b.x) < EPS && Math.abs(b.x - c.x) < EPS;
    const horizontal = Math.abs(a.y - b.y) < EPS && Math.abs(b.y - c.y) < EPS;
    if (vertical || horizontal) out.splice(i, 1);
    else i++;
  }
  return out;
}

/** L-shaped orthogonal fallback between endpoint centers (always ≥ 2 points). */
function fallbackRoute(source: Rect, target: Rect): Point[] {
  const a = roundPoint(rectCenter(source));
  const b = roundPoint(rectCenter(target));
  const route = simplify([a, { x: b.x, y: a.y }, b]);
  return route.length >= 2 ? route : [a, b];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Attach point on a group border: `ref` projected onto `side`, corner-clamped. */
function groupBorderAttach(rect: Rect, side: Side, ref: Point): Point {
  const x = clamp(ref.x, rect.x + CORNER_CLEARANCE, rect.x + rect.width - CORNER_CLEARANCE);
  const y = clamp(ref.y, rect.y + CORNER_CLEARANCE, rect.y + rect.height - CORNER_CLEARANCE);
  switch (side) {
    case "N": return { x, y: rect.y };
    case "S": return { x, y: rect.y + rect.height };
    case "W": return { x: rect.x, y };
    case "E": return { x: rect.x + rect.width, y };
  }
}

// ------------------------------------------------------------- routing

/** conservative bbox of a placed SceneLabel (start/middle/end aware) */
function labelBBox(label: SceneLabel): Rect {
  const lines = label.lines ?? [label.text];
  const width = Math.max(...lines.map((l) => measureWidth(l, label.fontSize, label.weight)));
  const height = lines.length * label.fontSize * 1.4;
  const x = label.align === "start" ? label.x : label.align === "end" ? label.x - width : label.x - width / 2;
  return { x, y: label.y - label.fontSize, width, height };
}

/** true when p sits inside any of the (slightly inflated) obstacle rects */
function insideAnyObstacle(p: Point, obstacles: readonly Rect[]): boolean {
  const PAD = 4;
  return obstacles.some(
    (r) =>
      p.x > r.x - PAD && p.x < r.x + r.width + PAD && p.y > r.y - PAD && p.y < r.y + r.height + PAD,
  );
}

/**
 * Slide a group-border attach point along its face until it clears every
 * obstacle — rail items sit ON the border, so the naive projected point can
 * land inside one. Deterministic alternating ± scan, 12px steps.
 */
function clearBorderAttach(rect: Rect, side: Side, p: Point, obstacles: readonly Rect[]): Point {
  if (!insideAnyObstacle(p, obstacles)) return p;
  const horizontal = side === "N" || side === "S";
  const lo = horizontal ? rect.x + CORNER_CLEARANCE : rect.y + CORNER_CLEARANCE;
  const hi = horizontal
    ? rect.x + rect.width - CORNER_CLEARANCE
    : rect.y + rect.height - CORNER_CLEARANCE;
  for (let step = 12; step <= hi - lo; step += 12) {
    for (const sign of [1, -1]) {
      const v = clamp((horizontal ? p.x : p.y) + sign * step, lo, hi);
      const cand = horizontal ? { x: v, y: p.y } : { x: p.x, y: v };
      if (!insideAnyObstacle(cand, obstacles)) return cand;
    }
  }
  return p;
}

/**
 * Node endpoints attach via face-midpoint pins, groups via border points.
 * Unhinted endpoints get the deterministic dominant side toward the other
 * endpoint (libavoid-chosen "any" pins proved nondeterministic — see
 * src/route/avoid-adapter.ts).
 */
function endpointSpec(
  info: EndpointInfo,
  other: EndpointInfo,
  hintSide: Side | undefined,
  obstacles: readonly Rect[],
): AvoidEndpoint {
  const side = hintSide ?? dominantSide(rectCenter(info.rect), rectCenter(other.rect));
  if (info.kind === "node") return { kind: "shape", shapeId: info.path, side };
  const p = clearBorderAttach(
    info.rect,
    side,
    groupBorderAttach(info.rect, side, rectCenter(other.rect)),
    obstacles,
  );
  return { kind: "point", x: r2(p.x), y: r2(p.y) };
}

/**
 * ERD column-anchored endpoint: pin at the column row's Y on the E/W face
 * facing the other endpoint. Falls back (null) when not a table/column.
 */
function columnEndpoint(
  node: import("../layout/scene.ts").SceneNode | undefined,
  column: string | undefined,
  self: EndpointInfo,
  other: EndpointInfo,
): AvoidEndpoint | null {
  if (!node || !column || !node.table) return null;
  const y = tableAnchorY(node, column);
  if (y === undefined) return null;
  const east = rectCenter(other.rect).x >= rectCenter(self.rect).x;
  return { kind: "point", x: r2(east ? self.rect.x + self.rect.width : self.rect.x), y: r2(y) };
}

/**
 * Routes every model edge and fills `scene.edges` in edge input order
 * (mutates the scene in place; also appends new label texts to
 * `scene.texts`). `edges` are validated model edges with absolute paths.
 */
export async function routeEdges(scene: Scene, edges: Edge[]): Promise<void> {
  const nodeByPath = new Map(scene.nodes.map((n) => [n.path, n]));
  const groupByPath = new Map(scene.groups.map((g) => [g.path, g]));

  const resolveEndpoint = (edge: Edge, path: string): EndpointInfo => {
    const node = nodeByPath.get(path);
    if (node) return { path, rect: node.rect, kind: "node" };
    const group = groupByPath.get(path);
    if (group) return { path, rect: group.rect, kind: "group" };
    throw new Error(`routeEdges: edge "${edge.id}" endpoint "${path}" matches no scene node or group`);
  };

  const endpoints = new Map<string, EdgeEndpoints>();
  for (const edge of edges) {
    endpoints.set(edge.id, {
      source: resolveEndpoint(edge, edge.from),
      target: resolveEndpoint(edge, edge.to),
    });
  }

  const obstacleRects: Rect[] = scene.nodes.map((n) => n.rect);
  const plan: BundlePlan = planBundles(
    edges,
    endpoints,
    scene.nodes.map((n) => ({ path: n.path, rect: n.rect })),
  );

  const router = await AvoidRouter.create({
    shapeBufferDistance: OBSTACLE_MARGIN,
    idealNudgingDistance: NUDGING_DISTANCE,
  });
  let routes: Map<string, Point[]>;
  try {
    // deterministic registration order: shapes by path, connectors by edge id
    for (const node of [...scene.nodes].sort((a, b) => a.path.localeCompare(b.path))) {
      router.addShape(node.path, node.rect);
    }
    for (const edge of [...edges].sort((a, b) => a.id.localeCompare(b.id))) {
      const eps = endpoints.get(edge.id)!;
      const bundle = plan.byEdge.get(edge.id);
      const src =
        columnEndpoint(nodeByPath.get(edge.from), edge.sourceColumn, eps.source, eps.target) ??
        endpointSpec(eps.source, eps.target, edge.hints?.sourceSide, obstacleRects);
      const dst =
        columnEndpoint(nodeByPath.get(edge.to), edge.targetColumn, eps.target, eps.source) ??
        endpointSpec(eps.target, eps.source, edge.hints?.targetSide, obstacleRects);
      if (!bundle) {
        router.addConnector(edge.id, src, dst);
      } else if (bundle.end === "target") {
        // fan-in branch: source → junction (the trunk is appended after routing)
        router.addConnector(edge.id, src, { kind: "point", ...roundPoint(bundle.junction) });
      } else {
        // fan-out branch: junction → target
        router.addConnector(edge.id, { kind: "point", ...roundPoint(bundle.junction) }, dst);
      }
    }
    routes = router.route();
  } finally {
    router.dispose();
  }

  const routed = new Map<string, RoutedSceneEdge>();
  const routedList: RoutedSceneEdge[] = [];
  for (const edge of edges) {
    const eps = endpoints.get(edge.id)!;
    const bundle = plan.byEdge.get(edge.id);
    const raw = routes.get(edge.id);

    let points: Point[];
    let fellBack = false;
    if (!raw || raw.length < 2) {
      points = fallbackRoute(eps.source.rect, eps.target.rect);
      fellBack = true;
    } else if (bundle) {
      // stitch branch + trunk, KEEPING the junction vertex (it is the shared
      // bundle point even when collinear with the trunk stub)
      const branch = simplify(raw);
      const attach = roundPoint(bundle.attach);
      points = bundle.end === "target" ? [...branch, attach] : [attach, ...branch];
    } else {
      points = simplify(raw);
    }
    if (points.length < 2) {
      points = fallbackRoute(eps.source.rect, eps.target.rect);
      fellBack = true;
    }

    const sceneEdge: RoutedSceneEdge = {
      kind: "edge",
      id: edge.id,
      from: edge.from,
      to: edge.to,
      points,
      style: resolveEdgeStyle(edge.style),
      ...(edge.layer !== undefined ? { layer: edge.layer } : {}),
      ...(bundle ? { bundle: bundle.id } : {}),
      ...(edge.sourceCardinality ? { sourceCardinality: edge.sourceCardinality } : {}),
      ...(edge.targetCardinality ? { targetCardinality: edge.targetCardinality } : {}),
      ...(fellBack ? { fallback: true as const } : {}),
    };
    routed.set(edge.id, sceneEdge);
    routedList.push(sceneEdge);
  }

  placeEdgeLabels({
    edges,
    routed,
    plan,
    obstacles: [
      ...scene.nodes.map((n) => n.rect),
      ...[...scene.groups, ...scene.overlays].flatMap((g) => (g.label ? [labelBBox(g.label)] : [])),
    ],
  });

  scene.edges = routedList;

  // register label texts for font subsetting (append-only, deduped)
  const known = new Set(scene.texts);
  for (const sceneEdge of routedList) {
    const text = sceneEdge.label?.text;
    if (text !== undefined && !known.has(text)) {
      known.add(text);
      scene.texts.push(text);
    }
  }
}
