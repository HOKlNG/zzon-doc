/**
 * Fan-in / fan-out edge bundling (DESIGN.md §5.3-3).
 *
 * Edges sharing an endpoint AND an approach side are bundled when the fan
 * count reaches BUNDLE_MIN_FAN or any member carries a `hints.bundle` name.
 * The bundle is realized as a junction point one BUNDLE_MARGIN outside the
 * shared endpoint's attach face: branches route to the junction, a single
 * straight trunk continues junction → endpoint. (This build of libavoid-js
 * exposes no JunctionRef, so the junction is a plain point endpoint — see
 * src/route/avoid-adapter.ts.) Fan-out is symmetric on the source side.
 *
 * Identical labels across a bundle collapse to ONE label on the trunk
 * (applied in src/route/edge-labels.ts via `collapsedLabel`).
 */
import type { Edge, Side } from "../model/types.ts";
import type { Rect, Point } from "../model/geometry.ts";
import { rectCenter } from "../model/geometry.ts";

/** distance from the shared endpoint's border to the junction point */
export const BUNDLE_MARGIN = 24;
/** minimum fan size that triggers bundling without an explicit hint */
export const BUNDLE_MIN_FAN = 4;

export interface EndpointInfo {
  path: string;
  rect: Rect;
  kind: "node" | "group";
}

export interface EdgeEndpoints {
  source: EndpointInfo;
  target: EndpointInfo;
}

export interface Bundle {
  id: string;
  /** which end of its member edges is shared */
  end: "source" | "target";
  endpointPath: string;
  /** approach side on the shared endpoint */
  side: Side;
  /** attach point on the shared endpoint's border (face midpoint) */
  attach: Point;
  /** junction one BUNDLE_MARGIN outside `attach` */
  junction: Point;
  /** member edge ids in input order */
  edgeIds: string[];
  /** set when every labeled member carries the same label (≥ 2 of them) */
  collapsedLabel?: string;
}

export interface BundlePlan {
  bundles: Bundle[];
  byEdge: Map<string, Bundle>;
}

// ------------------------------------------------------------- geometry

/** Side of `from` that faces toward `to` (dominant axis; ties go horizontal). */
export function dominantSide(from: Point, to: Point): Side {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "W" : "E";
  return dy < 0 ? "N" : "S";
}

export function faceMidpoint(rect: Rect, side: Side): Point {
  switch (side) {
    case "N": return { x: rect.x + rect.width / 2, y: rect.y };
    case "S": return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    case "W": return { x: rect.x, y: rect.y + rect.height / 2 };
    case "E": return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  }
}

/** Move a point `dist` outward along the outward normal of `side`. */
export function offsetOutward(p: Point, side: Side, dist: number): Point {
  switch (side) {
    case "N": return { x: p.x, y: p.y - dist };
    case "S": return { x: p.x, y: p.y + dist };
    case "W": return { x: p.x - dist, y: p.y };
    case "E": return { x: p.x + dist, y: p.y };
  }
}

// ------------------------------------------------------------- planning

/** Approach side on the shared endpoint of `edge` at `end`. */
function approachSide(edge: Edge, end: "source" | "target", eps: EdgeEndpoints): Side {
  if (end === "target" && edge.hints?.targetSide) return edge.hints.targetSide;
  if (end === "source" && edge.hints?.sourceSide) return edge.hints.sourceSide;
  const shared = end === "target" ? eps.target : eps.source;
  const other = end === "target" ? eps.source : eps.target;
  return dominantSide(rectCenter(shared.rect), rectCenter(other.rect));
}

interface Candidate {
  end: "source" | "target";
  endpointPath: string;
  side: Side;
  endpoint: EndpointInfo;
  edges: Edge[];
}

/**
 * Junction placement must clear every foreign obstacle plus the router's
 * shape buffer — a junction inside a nearby node's buffer makes libavoid
 * give up and route branches straight through the node. Prefer shrinking the
 * outward margin (the attach->junction trunk stays obstacle-free by
 * construction); fall back to the default margin if nothing fits.
 */
const JUNCTION_CLEARANCE = 10;

function clearJunction(
  attach: Point,
  side: Side,
  obstacles: readonly { path: string; rect: Rect }[],
  ownPath: string,
): Point {
  const foreign = obstacles.filter((o) => o.path !== ownPath).map((o) => o.rect);
  const clear = (p: Point) =>
    !foreign.some(
      (r) =>
        p.x > r.x - JUNCTION_CLEARANCE &&
        p.x < r.x + r.width + JUNCTION_CLEARANCE &&
        p.y > r.y - JUNCTION_CLEARANCE &&
        p.y < r.y + r.height + JUNCTION_CLEARANCE,
    );
  for (const margin of [BUNDLE_MARGIN, 18, 14, 10, 6]) {
    const cand = offsetOutward(attach, side, margin);
    if (clear(cand)) return cand;
  }
  return offsetOutward(attach, side, BUNDLE_MARGIN);
}

/**
 * Group edges into bundles by (shared endpoint, approach side). An edge can
 * qualify at both ends; it joins the larger group (ties prefer the target /
 * fan-in side). Deterministic: candidates keep edge input order.
 */
export function planBundles(
  edges: Edge[],
  endpoints: Map<string, EdgeEndpoints>,
  obstacles: readonly { path: string; rect: Rect }[] = [],
): BundlePlan {
  const candidates = new Map<string, Candidate>();
  for (const edge of edges) {
    const eps = endpoints.get(edge.id);
    if (!eps) continue;
    for (const end of ["target", "source"] as const) {
      const endpoint = end === "target" ? eps.target : eps.source;
      const side = approachSide(edge, end, eps);
      const key = `${end}|${endpoint.path}|${side}`;
      let cand = candidates.get(key);
      if (!cand) {
        cand = { end, endpointPath: endpoint.path, side, endpoint, edges: [] };
        candidates.set(key, cand);
      }
      cand.edges.push(edge);
    }
  }

  const qualifies = (c: Candidate) =>
    c.edges.length >= BUNDLE_MIN_FAN || c.edges.some((e) => e.hints?.bundle !== undefined);

  // Assign each edge to at most one qualified candidate (larger wins; tie → target).
  const qualified = [...candidates.values()].filter(qualifies);
  const byEdgeCand = new Map<string, Candidate>();
  for (const cand of qualified) {
    for (const edge of cand.edges) {
      const prev = byEdgeCand.get(edge.id);
      const better =
        !prev ||
        cand.edges.length > prev.edges.length ||
        (cand.edges.length === prev.edges.length && cand.end === "target" && prev.end === "source");
      if (better) byEdgeCand.set(edge.id, cand);
    }
  }

  const bundles: Bundle[] = [];
  const byEdge = new Map<string, Bundle>();
  for (const cand of qualified) {
    const members = cand.edges.filter((e) => byEdgeCand.get(e.id) === cand);
    // re-check after overlap resolution (no cascading — one pass is enough here)
    if (members.length < BUNDLE_MIN_FAN && !members.some((e) => e.hints?.bundle !== undefined)) continue;
    if (members.length < 2) continue;

    const hintNames = [...new Set(members.map((e) => e.hints?.bundle).filter((n): n is string => n !== undefined))];
    const id =
      hintNames.length === 1
        ? hintNames[0]!
        : `bundle:${cand.end === "target" ? "in" : "out"}:${cand.endpointPath}:${cand.side}`;

    const labels = members.map((e) => e.label).filter((l): l is string => l !== undefined);
    const collapsedLabel =
      labels.length >= 2 && labels.every((l) => l === labels[0]) ? labels[0] : undefined;

    const attach = faceMidpoint(cand.endpoint.rect, cand.side);
    const bundle: Bundle = {
      id,
      end: cand.end,
      endpointPath: cand.endpointPath,
      side: cand.side,
      attach,
      junction: clearJunction(attach, cand.side, obstacles, cand.endpointPath),
      edgeIds: members.map((e) => e.id),
      ...(collapsedLabel !== undefined ? { collapsedLabel } : {}),
    };
    bundles.push(bundle);
    for (const e of members) byEdge.set(e.id, bundle);
  }

  bundles.sort((a, b) => a.id.localeCompare(b.id));
  return { bundles, byEdge };
}
