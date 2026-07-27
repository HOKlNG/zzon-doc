/**
 * ELK-backed placement for PRE-SIZED children of a single container.
 * ELK never sees grandchildren (SEPARATE_CHILDREN composition) and never
 * routes edges — placement only (DESIGN.md §5.1/§5.3).
 */
import { elkLayout } from "./elk-loader.ts";
import type { Rect } from "../model/geometry.ts";

export interface PlacedChild {
  id: string;
  rect: Rect;
}

export interface ChildBox {
  id: string;
  width: number;
  height: number;
  /** stable ordering hint (declaration order) */
  order: number;
}

export interface ChildEdge {
  from: string;
  to: string;
}

export interface PlacementResult {
  children: PlacedChild[];
  width: number;
  height: number;
}

/** node-node spacing inside one container */
const SPACING = 44;
/** corridor width between layered columns — this is where edges route, so it
 * must fit several nudged parallel edges plus their labels */
const LAYER_SPACING = 64;

export async function placePack(
  boxes: ChildBox[],
  aspectRatio: number,
): Promise<PlacementResult> {
  if (boxes.length === 0) return { children: [], width: 0, height: 0 };
  if (boxes.length === 1) {
    const b = boxes[0]!;
    return {
      children: [{ id: b.id, rect: { x: 0, y: 0, width: b.width, height: b.height } }],
      width: b.width,
      height: b.height,
    };
  }
  const graph = await elkLayout({
    id: "pack",
    layoutOptions: {
      "elk.algorithm": "rectpacking",
      "elk.aspectRatio": String(aspectRatio),
      "elk.spacing.nodeNode": String(SPACING),
      "elk.padding": "[top=0,left=0,bottom=0,right=0]",
    },
    children: [...boxes]
      .sort((a, b) => a.order - b.order)
      .map((b) => ({ id: b.id, width: b.width, height: b.height })),
  });
  return normalize(graph.children ?? []);
}

export async function placeLayered(
  boxes: ChildBox[],
  edges: ChildEdge[],
  direction: "RIGHT" | "DOWN" = "RIGHT",
): Promise<PlacementResult> {
  if (boxes.length === 0) return { children: [], width: 0, height: 0 };
  const graph = await elkLayout({
    id: "layered",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "POLYLINE", // ignored downstream; we route globally
      "elk.spacing.nodeNode": String(SPACING),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYER_SPACING),
      "elk.padding": "[top=0,left=0,bottom=0,right=0]",
    },
    children: [...boxes]
      .sort((a, b) => a.order - b.order)
      .map((b) => ({ id: b.id, width: b.width, height: b.height })),
    edges: edges.map((e, i) => ({ id: `pe${i}`, sources: [e.from], targets: [e.to] })),
  });
  const result = normalize(graph.children ?? []);
  centerWithinLayers(result.children, direction);
  return result;
}

/**
 * ELK left/top-aligns nodes within a layer, so different node widths make the
 * icon axis jitter down a column. Cluster nodes into true columns and center
 * each node within its column band — same-column icons share one vertical
 * axis, as AWS diagrams do.
 *
 * A node joins a cluster only while it overlaps the running INTERSECTION of
 * the cluster's ranges (every member overlaps every other). Chained union
 * ranges must NOT merge — that squeezes unrelated neighbors on top of each
 * other (caught by the invariant suite on the landing-zone example).
 */
function centerWithinLayers(children: PlacedChild[], direction: "RIGHT" | "DOWN"): void {
  const horiz = direction === "RIGHT"; // layers are vertical columns
  const pos = (r: Rect) => (horiz ? r.x : r.y);
  const size = (r: Rect) => (horiz ? r.width : r.height);
  const overlaps = (a: Rect, b: Rect) =>
    a.x < b.x + b.width + 4 && a.x + a.width > b.x - 4 && a.y < b.y + b.height + 4 && a.y + a.height > b.y - 4;

  const sorted = [...children].sort((a, b) => pos(a.rect) - pos(b.rect));
  let cluster: PlacedChild[] = [];
  let interHi = Infinity;
  const flush = () => {
    if (cluster.length >= 2) {
      const lo = Math.min(...cluster.map((c) => pos(c.rect)));
      const hi = Math.max(...cluster.map((c) => pos(c.rect) + size(c.rect)));
      const original = cluster.map((c) => ({ ...c.rect }));
      for (const c of cluster) {
        const centered = lo + (hi - lo - size(c.rect)) / 2;
        if (horiz) c.rect.x = centered;
        else c.rect.y = centered;
      }
      // safety net: ELK component packing can put unrelated groups in the same
      // axis band; if centering created any new overlap, revert this cluster
      const inCluster = new Set(cluster);
      const conflict = cluster.some((c) =>
        children.some((o) => o !== c && !inCluster.has(o) && overlaps(c.rect, o.rect)),
      );
      if (conflict) cluster.forEach((c, i) => Object.assign(c.rect, original[i]));
    }
    cluster = [];
    interHi = Infinity;
  };
  for (const c of sorted) {
    if (cluster.length && pos(c.rect) >= interHi) flush();
    cluster.push(c);
    interHi = Math.min(interHi, pos(c.rect) + size(c.rect));
  }
  flush();
}

/** shift so the bounding box starts at (0,0); size = tight bbox */
function normalize(children: { id?: string; x?: number; y?: number; width?: number; height?: number }[]): PlacementResult {
  const placed = children.map((c) => ({
    id: c.id!,
    rect: { x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? 0, height: c.height ?? 0 },
  }));
  const minX = Math.min(...placed.map((p) => p.rect.x));
  const minY = Math.min(...placed.map((p) => p.rect.y));
  for (const p of placed) {
    p.rect.x -= minX;
    p.rect.y -= minY;
  }
  return {
    children: placed,
    width: Math.max(...placed.map((p) => p.rect.x + p.rect.width)),
    height: Math.max(...placed.map((p) => p.rect.y + p.rect.height)),
  };
}
