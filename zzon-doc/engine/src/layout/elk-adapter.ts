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
  /** author hint: layer index (ElementHints.layer) — layered containers only */
  layer?: number;
  /** author hint: slot within the layer (ElementHints.order) */
  slot?: number;
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
const BASE_SPACING = 44;
/** corridor width between layered columns — this is where edges route, so it
 * must fit several nudged parallel edges plus their labels */
const BASE_LAYER_SPACING = 64;

/**
 * Spacing multiplier for the current layout pass. buildScene raises it when the
 * routed lines crowd or cover labels, so a dense diagram gets a bigger canvas
 * and a sparse one keeps the compact default.
 */
let spacingScale = 1;
export function setSpacingScale(scale: number): void {
  spacingScale = scale;
}
let SPACING = BASE_SPACING;
let LAYER_SPACING = BASE_LAYER_SPACING;
function applyScale(): void {
  SPACING = Math.round(BASE_SPACING * spacingScale);
  LAYER_SPACING = Math.round(BASE_LAYER_SPACING * spacingScale);
}

export async function placePack(
  boxes: ChildBox[],
  aspectRatio: number,
): Promise<PlacementResult> {
  applyScale();
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
  aspectRatio?: number,
  minCorridor = 0,
  /** "rows" = text-like row wrapping (top-level canvas, RIGHT); "elk" = ELK MULTI_EDGE (nested groups) */
  wrap: "rows" | "elk" | "none" = "elk",
): Promise<PlacementResult> {
  if (boxes.length === 0) return { children: [], width: 0, height: 0 };
  applyScale();
  const rowWrap = wrap === "rows" && direction === "RIGHT";
  // label- and lane-sized corridors widen with the canvas too
  const corridor = Math.max(LAYER_SPACING, Math.round(minCorridor * spacingScale));
  const hinted = boxes.some((b) => b.layer !== undefined || b.slot !== undefined);
  const baseOptions = {
    "elk.algorithm": "layered",
    "elk.direction": direction,
    "elk.edgeRouting": "POLYLINE", // ignored downstream; we route globally
    "elk.spacing.nodeNode": String(SPACING),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(corridor),
    "elk.padding": "[top=0,left=0,bottom=0,right=0]",
    // NOTE: cycleBreaking MODEL_ORDER was tried (2026-10-04) and rejected — it
    // reverses every edge pointing against declaration order even in acyclic
    // graphs and regressed 4 corpus samples. Return edges are declared instead
    // (EdgeOpts.back → Edge.layoutReverse).
  };
  const elkEdges = edges.map((e, i) => ({ id: `pe${i}`, sources: [e.from], targets: [e.to] }));
  const sorted = [...boxes].sort((a, b) => a.order - b.order);
  const graph = await elkLayout({
    id: "layered",
    layoutOptions: {
      ...baseOptions,
      // 긴 레이어 체인을 종횡비에 맞춰 감는다. 최상위 RIGHT 캔버스는 아래 wrapRows(글줄식)가
      // 담당한다 — 작은 그래프에서 ELK 절단점이 1/1/1…로 흩어지는 것을 실측했다(5단
      // 파이프라인이 세로 지그재그). 중첩 그룹은 ELK MULTI_EDGE 그대로(그룹이 넓은 건
      // 전체 캔버스 균형의 일부일 뿐). 작성자가 레이어를 지정한 컨테이너는 감지 않는다.
      ...(aspectRatio && !hinted && !rowWrap && wrap !== "none"
        ? {
            "elk.layered.wrapping.strategy": "MULTI_EDGE",
            "elk.aspectRatio": String(aspectRatio),
            "elk.layered.wrapping.additionalEdgeSpacing": String(corridor),
          }
        : {}),
    },
    children: sorted.map((b) => ({ id: b.id, width: b.width, height: b.height })),
    edges: elkEdges,
  });
  let placed = graph.children ?? [];
  if (hinted) {
    // 2nd pass: ELK's layerChoice/positionChoice constraints are no-ops outside
    // interactive mode (probed on elkjs 0.12), so hints become seed coordinates
    // for the INTERACTIVE layerer + crossing minimizer instead.
    const seeds = seedCoordinates(sorted, edges, placed, direction);
    // Placement-only graph: edges between two children the author put in the
    // SAME layer are dropped (ELK forbids in-layer edges and would push the
    // target one layer on); the global router still draws them.
    const layerOf = new Map(sorted.filter((b) => b.layer !== undefined).map((b) => [b.id, b.layer!]));
    const placementEdges = elkEdges.filter((e) => {
      const a = layerOf.get(e.sources[0]!);
      const b = layerOf.get(e.targets[0]!);
      return a === undefined || b === undefined || a !== b;
    });
    const second = await elkLayout({
      id: "layered-hinted",
      layoutOptions: {
        ...baseOptions,
        // all three phases read the seed coordinates — a GREEDY cycle breaker
        // would reverse arbitrary edges of a cycle and reorder declared layers
        "elk.layered.cycleBreaking.strategy": "INTERACTIVE",
        // disconnected children are otherwise packed as separate components side
        // by side — a declared layer of three unconnected nodes must stay one column
        "elk.separateConnectedComponents": "false",
        "elk.layered.layering.strategy": "INTERACTIVE",
        "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
      },
      children: sorted.map((b) => ({ id: b.id, width: b.width, height: b.height, ...seeds.get(b.id)! })),
      edges: placementEdges,
    });
    placed = second.children ?? placed;
  }
  // text-like row wrap runs on the FINAL placement — order-only hints keep it;
  // declared layers (columns) are the author's structure and are never folded
  if (aspectRatio && rowWrap && !boxes.some((x) => x.layer !== undefined)) {
    placed = (wrapRows(placed, edges, aspectRatio, corridor) as typeof placed | null) ?? placed;
  }
  const result = normalize(placed);
  centerWithinLayers(result.children, direction);
  return result;
}

/**
 * Text-like row wrapping for an over-wide RIGHT layout: the layers of the
 * unwrapped run are split into k CONTIGUOUS chunks (balanced width), each
 * chunk becomes a row read left→right, rows stack top→bottom (Z order) with a
 * corridor sized for the edges that cross between rows. k is the one whose
 * canvas ratio lands closest to the target (log distance); null = keep.
 */
function wrapRows(
  children: { id?: string; x?: number; y?: number; width?: number; height?: number }[],
  edges: ChildEdge[],
  aspectRatio: number,
  corridor: number,
): typeof children | null {
  if (children.length < 3) return null;
  const box = (c: (typeof children)[number]) => ({ x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0 });
  const totalW = Math.max(...children.map((c) => box(c).x + box(c).w)) - Math.min(...children.map((c) => box(c).x));
  const totalH = Math.max(...children.map((c) => box(c).y + box(c).h)) - Math.min(...children.map((c) => box(c).y));
  if (totalH <= 0 || totalW / totalH <= aspectRatio * 1.75) return null;
  // overview-sized canvases read fine wide (fit-to-width); fold them only when
  // the strip is extreme — a 6-node context must stay one row
  if (children.length <= 9 && totalW / totalH <= aspectRatio * 3.5) return null;

  // layers = distinct x starts of the unwrapped run
  const starts = [...new Set(children.map((c) => Math.round(box(c).x)))].sort((a, b) => a - b);
  if (starts.length < 2) return null;
  const layerOf = new Map(children.map((c) => [c.id!, starts.indexOf(Math.round(box(c).x))]));
  const layers = starts.map((s, i) => {
    const members = children.filter((c) => layerOf.get(c.id!) === i);
    return {
      start: s,
      end: Math.max(...members.map((c) => box(c).x + box(c).w)),
      top: Math.min(...members.map((c) => box(c).y)),
      bottom: Math.max(...members.map((c) => box(c).y + box(c).h)),
    };
  });

  const rowGapFor = (crossing: number) => corridor + 14 * Math.min(crossing, 4);
  let best: { chunks: number[][]; score: number } | null = null;
  let fits: { chunks: number[][]; score: number } | null = null;
  const logDist = (r: number) => Math.abs(Math.log(r / aspectRatio));
  const unwrappedScore = logDist(totalW / totalH);
  for (let k = 2; k <= Math.min(layers.length, 6); k++) {
    // greedy balanced split: cut when the running width passes total/k
    const target = (layers[layers.length - 1]!.end - layers[0]!.start) / k;
    const chunks: number[][] = [[]];
    for (let i = 0; i < layers.length; i++) {
      const cur = chunks[chunks.length - 1]!;
      const width = cur.length ? layers[i]!.end - layers[cur[0]!]!.start : 0;
      if (cur.length && width > target * 1.15 && chunks.length < k) chunks.push([i]);
      else cur.push(i);
    }
    if (chunks.length < 2) continue;
    const w = Math.max(...chunks.map((ch) => layers[ch[ch.length - 1]!]!.end - layers[ch[0]!]!.start));
    let h = 0;
    chunks.forEach((ch, r) => {
      h += Math.max(...ch.map((i) => layers[i]!.bottom)) - Math.min(...ch.map((i) => layers[i]!.top));
      if (r > 0) {
        const inRow = new Set(chunks[r - 1]);
        const crossing = edges.filter((e) => inRow.has(layerOf.get(e.from)!) && ch.includes(layerOf.get(e.to)!)).length;
        h += rowGapFor(crossing);
      }
    });
    const score = logDist(w / h);
    // FEWEST rows that land inside the aspect band: every extra row is another
    // carriage-return edge cutting back across the canvas
    if (w / h <= aspectRatio * 1.75) {
      if (!fits) fits = { chunks, score };
    }
    if (!best || score < best.score - 1e-9) best = { chunks, score };
  }
  if (fits) best = fits;
  if (!best || best.score >= unwrappedScore) return null;

  const out: typeof children = [];
  let rowTop = 0;
  best.chunks.forEach((ch, r) => {
    const x0 = layers[ch[0]!]!.start;
    const y0 = Math.min(...ch.map((i) => layers[i]!.top));
    if (r > 0) {
      const prev = new Set(best!.chunks[r - 1]);
      rowTop += rowGapFor(edges.filter((e) => prev.has(layerOf.get(e.from)!) && ch.includes(layerOf.get(e.to)!)).length);
    }
    for (const c of children) {
      if (!ch.includes(layerOf.get(c.id!)!)) continue;
      const b = box(c);
      out.push({ ...c, x: b.x - x0, y: rowTop + (b.y - y0) });
    }
    rowTop += Math.max(...ch.map((i) => layers[i]!.bottom)) - y0;
  });
  return out;
}

const SEED_STEP = 10_000;

/**
 * Seed (x, y) per child for the interactive pass. Main axis = layer, cross
 * axis = slot. Unhinted children keep their first-pass layer and cross-axis
 * rank; hinted ones move to the declared layer/slot.
 */
function seedCoordinates(
  boxes: ChildBox[],
  _edges: ChildEdge[],
  firstPass: { id?: string; x?: number; y?: number }[],
  direction: "RIGHT" | "DOWN",
): Map<string, { x: number; y: number }> {
  const horiz = direction === "RIGHT";
  const main = (c: { x?: number; y?: number }) => (horiz ? c.x : c.y) ?? 0;
  const cross = (c: { x?: number; y?: number }) => (horiz ? c.y : c.x) ?? 0;
  // first-pass layer index = rank of the distinct main-axis starts
  const starts = [...new Set(firstPass.map((c) => Math.round(main(c))))].sort((a, b) => a - b);
  const passLayer = new Map(firstPass.map((c) => [c.id!, starts.indexOf(Math.round(main(c)))]));
  const passCross = new Map(firstPass.map((c) => [c.id!, cross(c)]));

  const layer = new Map<string, number>();
  for (const b of boxes) if (b.layer !== undefined) layer.set(b.id, b.layer);
  // Unhinted children are layered by TOPOLOGICAL propagation from the hinted
  // ones: a node waits until every predecessor has a layer and takes max + 1
  // (constrained longest path). Waiting matters — taking the first known
  // predecessor pulled a flowchart's end node above its other predecessors.
  // Hint scales differ (legacy lanes are diagram-global, first-pass indices
  // start at 0 per container), so first-pass layers are only the last resort.
  const unhinted = boxes.filter((b) => !layer.has(b.id));
  const preds = (id: string) => _edges.filter((e) => e.to === id && e.from !== id).map((e) => e.from);
  const succs = (id: string) => _edges.filter((e) => e.from === id && e.to !== id).map((e) => e.to);
  for (let guard = 0; guard <= boxes.length && unhinted.some((b) => !layer.has(b.id)); guard++) {
    let progress = false;
    for (const b of unhinted) {
      if (layer.has(b.id)) continue;
      const p = preds(b.id);
      if (p.length && p.every((x) => layer.has(x))) {
        layer.set(b.id, Math.max(...p.map((x) => layer.get(x)!)) + 1);
        progress = true;
      }
    }
    if (progress) continue;
    // stalled (sources or cycles): seed ONE node from what is known, then resume
    const b = unhinted.find((u) => !layer.has(u.id))!;
    const knownP = preds(b.id).filter((x) => layer.has(x));
    const knownS = succs(b.id).filter((x) => layer.has(x));
    if (knownP.length) layer.set(b.id, Math.max(...knownP.map((x) => layer.get(x)!)) + 1);
    else if (knownS.length) layer.set(b.id, Math.min(...knownS.map((x) => layer.get(x)!)) - 1);
    else layer.set(b.id, passLayer.get(b.id) ?? 0);
  }

  // slot: explicit order first-class; otherwise first-pass cross rank within layer
  const seeds = new Map<string, { x: number; y: number }>();
  const byLayer = new Map<number, ChildBox[]>();
  for (const b of boxes) byLayer.set(layer.get(b.id)!, [...(byLayer.get(layer.get(b.id)!) ?? []), b]);
  for (const [l, members] of byLayer) {
    const ranked = [...members].sort((a, b) => (passCross.get(a.id) ?? 0) - (passCross.get(b.id) ?? 0));
    for (const [i, b] of ranked.entries()) {
      // unspecified order = 0 (the main lane); equal slots keep first-pass order via +i
      const slot = b.slot ?? 0;
      // tie-break equal slots by first-pass position (deterministic)
      const c = slot * SEED_STEP + i;
      const m = l * SEED_STEP;
      seeds.set(b.id, horiz ? { x: m, y: c } : { x: c, y: m });
    }
  }
  return seeds;
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
