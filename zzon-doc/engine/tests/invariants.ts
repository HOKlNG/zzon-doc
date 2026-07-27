/**
 * Layout-quality invariant checkers (DESIGN.md §11 테스트).
 *
 * Pure functions over the frozen Scene contract: given a finished scene
 * (placed + routed), report every broken layout rule as data instead of
 * throwing. Deterministic — violations are sorted by (rule, paths, detail)
 * so CI output and snapshots are stable across runs. All pair scans are
 * naive O(n²), fine below ~1000 scene elements.
 *
 * Rules:
 *   node-node            no two node rects overlap (strict, 0 tolerance)
 *   node-group           node rects sit fully inside every ancestor group
 *                        (ancestry = path prefixes; rail-items are exempt —
 *                        they dock ON the parent border by design)
 *   edge-through-node    no edge segment crosses a non-endpoint node interior
 *                        (node rect deflated by 1px before the test)
 *   label-overlap        no two label bboxes overlap; labels do not overlap
 *                        non-associated node rects (a node's own labels and
 *                        an edge label over its endpoints are associated)
 *   all-edges-routed     every edge has >= 2 points, all coords finite
 *   overlay-containment  member rects covered by the overlay rect union,
 *                        non-members intruded by <= 30% of their area
 *                        (needs opts.overlayMembers — scenes carry no lists)
 *   aspect               width/height within aspectRatio*(1 ± tolerance)
 *   canvas-fit           every rect / edge point / marker inside [0,0,w,h]
 */
import type { Scene, SceneEdge, SceneGroup, SceneLabel, SceneNode, SceneOverlay } from "../src/layout/scene.ts";
import {
  rectArea,
  rectContains,
  rectCoveredArea,
  rectInflate,
  rectsOverlap,
  segmentIntersectsRect,
  type Point,
  type Rect,
} from "../src/model/geometry.ts";
import { measure, measureWidth } from "../src/text/metrics.ts";

export interface Violation {
  rule: string;
  detail: string;
  paths: string[];
}

export interface CheckOptions {
  /** target canvas aspect ratio (width/height); default 1.6 */
  aspectRatio?: number;
  /** allowed relative deviation from the target; default 0.4 (±40%) */
  aspectTolerance?: number;
  /**
   * overlay path → member node paths. Scene overlays carry only resolved
   * rects (membership is a model-level fact), so overlay-containment runs
   * only for the overlays listed here.
   */
  overlayMembers?: Record<string, string[]>;
}

// ------------------------------------------------------------- internals

/** float-noise slack for containment / area comparisons (not overlap: rule 1 is 0-tolerance) */
const EPS = 1e-6;
/** edge-through-node deflates node rects by this much before the segment test */
const NODE_INTERIOR_INSET = 1;
/** max fraction of a non-member node's area an overlay may cover */
const OVERLAY_INTRUSION_MAX = 0.3;

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const fmtRect = (r: Rect) => `[${fmt(r.x)},${fmt(r.y)} ${fmt(r.width)}x${fmt(r.height)}]`;
const fmtPoint = (p: Point) => `(${fmt(p.x)},${fmt(p.y)})`;

const containsEps = (outer: Rect, inner: Rect) => rectContains(rectInflate(outer, EPS), inner);
const isFinitePoint = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);

const byPath = <T extends { path: string }>(arr: readonly T[]): T[] =>
  [...arr].sort((a, b) => a.path.localeCompare(b.path));
const byId = <T extends { id: string }>(arr: readonly T[]): T[] =>
  [...arr].sort((a, b) => a.id.localeCompare(b.id));

/**
 * Text bounding box of a label, measured with the SAME vendored font the
 * renderer embeds. Anchor semantics: `y` is the first line's baseline; `x`
 * is the left / center / right of the box per `align`. Multi-line labels
 * stack `lines` at the font's lineHeight.
 */
export function labelBBox(l: SceneLabel): Rect {
  const lines = l.lines && l.lines.length > 0 ? l.lines : [l.text];
  let width = 0;
  for (const line of lines) width = Math.max(width, measureWidth(line, l.fontSize, l.weight));
  const m = measure(lines[0] ?? "", l.fontSize, l.weight);
  const height = m.ascent + m.descent + (lines.length - 1) * m.lineHeight;
  const x = l.align === "middle" ? l.x - width / 2 : l.align === "end" ? l.x - width : l.x;
  return { x, y: l.y - m.ascent, width, height };
}

interface PlacedLabel {
  /** path (or edge id) of the owning scene element */
  owner: string;
  /** slot on the owner: "label" | "sublabel" | "trackLabel[i]" */
  slot: string;
  text: string;
  bbox: Rect;
  /** node paths this label may legitimately overlap (its own element) */
  associated: ReadonlySet<string>;
}

function collectLabels(
  nodes: readonly SceneNode[],
  groups: readonly SceneGroup[],
  overlays: readonly SceneOverlay[],
  edges: readonly SceneEdge[],
): PlacedLabel[] {
  const out: PlacedLabel[] = [];
  const push = (owner: string, slot: string, l: SceneLabel | undefined, associated: readonly string[]) => {
    if (!l) return;
    const bbox = labelBBox(l);
    if (bbox.width <= 0) return; // empty text renders nothing
    const text = l.lines && l.lines.length > 0 ? l.lines.join(" ") : l.text;
    out.push({ owner, slot, text, bbox, associated: new Set(associated) });
  };
  for (const n of nodes) {
    push(n.path, "label", n.label, [n.path]);
    push(n.path, "sublabel", n.sublabel, [n.path]);
  }
  for (const g of groups) {
    push(g.path, "label", g.label, []);
    (g.trackLabels ?? []).forEach((tl, i) => push(g.path, `trackLabel[${i}]`, tl, []));
  }
  for (const o of overlays) push(o.path, "label", o.label, []);
  for (const e of edges) push(e.id, "label", e.label, [e.from, e.to]);
  return out;
}

// ------------------------------------------------------------- rules

/** 1. node-node: no two node rects overlap (strict, 0 tolerance). */
function checkNodeNode(nodes: readonly SceneNode[], out: Violation[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]!;
      if (rectsOverlap(a.rect, b.rect)) {
        out.push({
          rule: "node-node",
          detail: `node rects overlap: ${fmtRect(a.rect)} vs ${fmtRect(b.rect)}`,
          paths: [a.path, b.path],
        });
      }
    }
  }
}

/** 2. node-group: every node rect inside every ancestor group rect. */
function checkNodeGroup(nodes: readonly SceneNode[], groups: readonly SceneGroup[], out: Violation[]): void {
  const groupByPath = new Map(groups.map((g) => [g.path, g]));
  for (const n of nodes) {
    if (n.role === "rail-item") continue; // rails straddle the parent border by design
    const parts = n.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const g = groupByPath.get(parts.slice(0, i).join("/"));
      if (g && !containsEps(g.rect, n.rect)) {
        out.push({
          rule: "node-group",
          detail: `node rect ${fmtRect(n.rect)} escapes ancestor group "${g.path}" ${fmtRect(g.rect)}`,
          paths: [n.path, g.path],
        });
      }
    }
  }
}

/** 3. edge-through-node: no segment crosses a non-endpoint node interior. */
function checkEdgeThroughNode(edges: readonly SceneEdge[], nodes: readonly SceneNode[], out: Violation[]): void {
  for (const e of edges) {
    for (const n of nodes) {
      if (n.path === e.from || n.path === e.to) continue;
      const interior = rectInflate(n.rect, -NODE_INTERIOR_INSET);
      if (interior.width <= 0 || interior.height <= 0) continue;
      for (let i = 0; i + 1 < e.points.length; i++) {
        const p = e.points[i]!;
        const q = e.points[i + 1]!;
        if (!isFinitePoint(p) || !isFinitePoint(q)) continue; // all-edges-routed reports these
        if (segmentIntersectsRect(p, q, interior)) {
          out.push({
            rule: "edge-through-node",
            detail: `edge segment ${i} ${fmtPoint(p)}→${fmtPoint(q)} passes through node ${fmtRect(n.rect)}`,
            paths: [e.id, n.path],
          });
          break; // one violation per (edge, node) pair
        }
      }
    }
  }
}

/** 4. label-overlap: label-label and label-vs-foreign-node-rect overlaps. */
function checkLabelOverlap(labels: readonly PlacedLabel[], nodes: readonly SceneNode[], out: Violation[]): void {
  for (let i = 0; i < labels.length; i++) {
    const a = labels[i]!;
    for (let j = i + 1; j < labels.length; j++) {
      const b = labels[j]!;
      if (rectsOverlap(a.bbox, b.bbox)) {
        out.push({
          rule: "label-overlap",
          detail: `label "${a.text}" (${a.owner}#${a.slot}) overlaps label "${b.text}" (${b.owner}#${b.slot})`,
          paths: [a.owner, b.owner],
        });
      }
    }
  }
  for (const l of labels) {
    for (const n of nodes) {
      if (l.associated.has(n.path)) continue;
      if (rectsOverlap(l.bbox, n.rect)) {
        out.push({
          rule: "label-overlap",
          detail: `label "${l.text}" (${l.owner}#${l.slot}) overlaps node rect ${fmtRect(n.rect)}`,
          paths: [l.owner, n.path],
        });
      }
    }
  }
}

/** 5. all-edges-routed: >= 2 points, all coordinates finite. */
function checkEdgesRouted(edges: readonly SceneEdge[], out: Violation[]): void {
  for (const e of edges) {
    if (e.points.length < 2) {
      out.push({
        rule: "all-edges-routed",
        detail: `edge has ${e.points.length} route point(s), needs >= 2`,
        paths: [e.id],
      });
      continue;
    }
    const bad = e.points.findIndex((p) => !isFinitePoint(p));
    if (bad >= 0) {
      out.push({
        rule: "all-edges-routed",
        detail: `edge route point ${bad} has non-finite coordinates`,
        paths: [e.id],
      });
    }
  }
}

/** 6. overlay-containment: members covered by the rect union, non-members mostly clear. */
function checkOverlayContainment(
  overlays: readonly SceneOverlay[],
  nodes: readonly SceneNode[],
  overlayMembers: Record<string, string[]> | undefined,
  out: Violation[],
): void {
  if (!overlayMembers) return;
  const overlayByPath = new Map(overlays.map((o) => [o.path, o]));
  const nodeByPath = new Map(nodes.map((n) => [n.path, n]));
  for (const overlayPath of Object.keys(overlayMembers).sort()) {
    const o = overlayByPath.get(overlayPath);
    if (!o) {
      out.push({
        rule: "overlay-containment",
        detail: `overlay "${overlayPath}" has declared members but is not present in the scene`,
        paths: [overlayPath],
      });
      continue;
    }
    const memberPaths = overlayMembers[overlayPath] ?? [];
    const memberSet = new Set(memberPaths);
    for (const memberPath of [...memberPaths].sort()) {
      const n = nodeByPath.get(memberPath);
      if (!n) {
        out.push({
          rule: "overlay-containment",
          detail: `overlay member "${memberPath}" not found among scene nodes`,
          paths: [overlayPath, memberPath],
        });
        continue;
      }
      const area = rectArea(n.rect);
      if (area <= 0) continue;
      const covered = rectCoveredArea(n.rect, o.rects);
      if (covered < area - EPS) {
        out.push({
          rule: "overlay-containment",
          detail: `member rect ${fmtRect(n.rect)} only ${fmt((covered / area) * 100)}% inside the overlay rect union`,
          paths: [overlayPath, memberPath],
        });
      }
    }
    for (const n of nodes) {
      if (memberSet.has(n.path)) continue;
      const area = rectArea(n.rect);
      if (area <= 0) continue;
      const covered = rectCoveredArea(n.rect, o.rects);
      if (covered > OVERLAY_INTRUSION_MAX * area + EPS) {
        out.push({
          rule: "overlay-containment",
          detail: `overlay covers ${fmt((covered / area) * 100)}% of non-member node ${fmtRect(n.rect)} (max ${fmt(OVERLAY_INTRUSION_MAX * 100)}%)`,
          paths: [overlayPath, n.path],
        });
      }
    }
  }
}

/** 7. aspect: canvas ratio within target*(1 ± tolerance). */
function checkAspect(scene: Scene, opts: CheckOptions, out: Violation[]): void {
  const target = opts.aspectRatio ?? 1.6;
  const tolerance = opts.aspectTolerance ?? 0.4;
  if (!(scene.width > 0) || !(scene.height > 0)) {
    out.push({
      rule: "aspect",
      detail: `canvas ${fmt(scene.width)}x${fmt(scene.height)} has non-positive dimensions`,
      paths: [],
    });
    return;
  }
  const ratio = scene.width / scene.height;
  const lo = target * (1 - tolerance);
  const hi = target * (1 + tolerance);
  if (ratio < lo - EPS || ratio > hi + EPS) {
    out.push({
      rule: "aspect",
      detail: `canvas aspect ${fmt(ratio)} outside [${fmt(lo)}, ${fmt(hi)}] (target ${fmt(target)} ±${fmt(tolerance * 100)}%)`,
      paths: [],
    });
  }
}

/** 8. canvas-fit: every rect / edge point / marker center inside [0,0,w,h]. */
function checkCanvasFit(
  scene: Scene,
  nodes: readonly SceneNode[],
  groups: readonly SceneGroup[],
  overlays: readonly SceneOverlay[],
  edges: readonly SceneEdge[],
  out: Violation[],
): void {
  const canvas: Rect = { x: 0, y: 0, width: scene.width, height: scene.height };
  const outside = (p: Point) =>
    p.x < -EPS || p.y < -EPS || p.x > scene.width + EPS || p.y > scene.height + EPS;
  const fit = (path: string, what: string, r: Rect) => {
    if (!containsEps(canvas, r)) {
      out.push({
        rule: "canvas-fit",
        detail: `${what} ${fmtRect(r)} outside canvas ${fmt(scene.width)}x${fmt(scene.height)}`,
        paths: [path],
      });
    }
  };
  for (const g of groups) fit(g.path, "group rect", g.rect);
  for (const n of nodes) fit(n.path, "node rect", n.rect);
  for (const o of overlays) o.rects.forEach((r, i) => fit(o.path, `overlay rect ${i}`, r));
  for (const e of edges) {
    const bad = e.points.findIndex((p) => isFinitePoint(p) && outside(p));
    if (bad >= 0) {
      const p = e.points[bad]!;
      out.push({
        rule: "canvas-fit",
        detail: `edge route point ${bad} ${fmtPoint(p)} outside canvas ${fmt(scene.width)}x${fmt(scene.height)}`,
        paths: [e.id],
      });
    }
  }
  for (const m of [...scene.markers].sort((a, b) => a.n - b.n)) {
    if (isFinitePoint(m.at) && outside(m.at)) {
      out.push({
        rule: "canvas-fit",
        detail: `marker ${m.n} center ${fmtPoint(m.at)} outside canvas ${fmt(scene.width)}x${fmt(scene.height)}`,
        paths: [`marker:${m.n}`],
      });
    }
  }
}

// ------------------------------------------------------------- entry point

/** Run every layout invariant against a finished scene. Returns sorted violations ([] = clean). */
export function checkScene(scene: Scene, opts: CheckOptions = {}): Violation[] {
  const out: Violation[] = [];
  // stable element order so pair scans emit violations deterministically
  const nodes = byPath(scene.nodes);
  const groups = byPath(scene.groups);
  const overlays = byPath(scene.overlays);
  const edges = byId(scene.edges);

  checkNodeNode(nodes, out);
  checkNodeGroup(nodes, groups, out);
  checkEdgeThroughNode(edges, nodes, out);
  checkLabelOverlap(collectLabels(nodes, groups, overlays, edges), nodes, out);
  checkEdgesRouted(edges, out);
  checkOverlayContainment(overlays, nodes, opts.overlayMembers, out);
  checkAspect(scene, opts, out);
  checkCanvasFit(scene, nodes, groups, overlays, edges, out);

  return out.sort(
    (a, b) =>
      a.rule.localeCompare(b.rule) ||
      a.paths.join(" ").localeCompare(b.paths.join(" ")) ||
      a.detail.localeCompare(b.detail),
  );
}
