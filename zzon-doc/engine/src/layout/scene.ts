/**
 * Scene graph — the CONTRACT between layout, routing, and rendering.
 *
 * Layout (place + overlay resolve) produces a Scene with absolute coordinates
 * for every visual; routing fills in edge geometry; rendering consumes the
 * finished Scene and never recomputes geometry.
 *
 * All coordinates are absolute canvas coordinates (px), origin top-left.
 * Determinism: scenes are serialized for snapshots via `canonicalScene`
 * (stable key order, coords rounded to 2 decimals).
 */
import type { Rect, Point } from "../model/geometry.ts";
import type { GroupKind, Side, Anchor, TableColumn, Cardinality } from "../model/types.ts";
import type { IconRef } from "../icons/aliases.ts";

export interface SceneLabel {
  text: string;
  /** anchor point; meaning depends on `align` */
  x: number;
  y: number;
  fontSize: number;
  weight: "regular" | "semibold";
  align: "start" | "middle" | "end";
  color?: string;
  /** multi-line support: pre-wrapped lines, dy = lineHeight */
  lines?: string[];
}

/** placed ERD table visual: header strip + per-column rows with absolute Y */
export interface SceneTable {
  headerHeight: number;
  rowHeight: number;
  /** columns with the absolute canvas Y of each row's vertical center */
  columns: (TableColumn & { y: number })[];
}

export interface SceneNode {
  kind: "node";
  path: string;
  rect: Rect;
  /** absent on card (category) and table nodes */
  icon?: IconRef;
  iconRect?: Rect;
  /** generic category card styling (categories.gen.ts) */
  category?: string;
  tech?: string;
  description?: string;
  href?: string;
  table?: SceneTable;
  label?: SceneLabel;
  sublabel?: SceneLabel;
  badges?: { icon: IconRef; rect: Rect }[];
  stack?: number;
  meta?: Record<string, string>;
  /** actor / rail-item / band-member nodes carry their origin for styling */
  role?: "resource" | "actor" | "rail-item" | "chip" | "card" | "table";
}

export interface SceneGroup {
  kind: "group";
  path: string;
  rect: Rect;
  groupKind: GroupKind;
  label?: SceneLabel;
  /** corner badge glyph (official group icon) */
  badgeIcon?: IconRef;
  badgeRect?: Rect;
  stack?: number;
  /** grid chrome: track header labels (AZ headers, tier labels) */
  trackLabels?: SceneLabel[];
  meta?: Record<string, string>;
}

export interface SceneOverlay {
  kind: "overlay";
  path: string;
  /** one rect per contiguous cell-run */
  rects: Rect[];
  groupKind?: GroupKind;
  stroke?: string;
  strokeDasharray?: string;
  fill?: string;
  label?: SceneLabel;
}

export interface SceneEdge {
  kind: "edge";
  id: string;
  from: string;
  to: string;
  /** polyline points, absolute coords; filled by routing */
  points: Point[];
  label?: SceneLabel;
  style: {
    preset: "default" | "dotted" | "dashed";
    color: string;
    arrowhead: "none" | "end" | "both";
  };
  layer?: string;
  /** id of the bundle this edge joined, if any */
  bundle?: string;
  /** ERD crow's-foot decorations */
  sourceCardinality?: Cardinality;
  targetCardinality?: Cardinality;
}

/** flow step badge placed on its edge after routing */
export interface SceneFlowStep {
  edgeId: string;
  text: string;
  /** badge circle center on the edge polyline */
  badge: Point;
  /** 1-based step number within the flow */
  n: number;
}

export interface SceneFlow {
  id: string;
  title: string;
  description?: string;
  steps: SceneFlowStep[];
}

export interface SceneMarker {
  kind: "marker";
  n: number;
  /** circle center */
  at: Point;
  note?: string;
}

export interface Scene {
  id: string;
  title?: string;
  /** manifest kind for the docs site */
  docKind?: "infra" | "data-flow" | "erd" | "agent-topology";
  /** total canvas size including margins */
  width: number;
  height: number;
  /** z-ordered: groups (outer->inner), overlays, edges, nodes, markers */
  groups: SceneGroup[];
  overlays: SceneOverlay[];
  edges: SceneEdge[];
  nodes: SceneNode[];
  markers: SceneMarker[];
  /** narrative flows; badge positions filled after routing */
  flows: SceneFlow[];
  /** every distinct icon key used (for symbol defs + subsetting) */
  icons: IconRef[];
  /** every distinct text string (for font subsetting) */
  texts: string[];
}

// ------------------------------------------------------------- helpers

const r2 = (n: number) => Math.round(n * 100) / 100;

export function roundRect(r: Rect): Rect {
  return { x: r2(r.x), y: r2(r.y), width: r2(r.width), height: r2(r.height) };
}

/** Deterministic, snapshot-safe serialization (stable ordering, rounded). */
export function canonicalScene(scene: Scene): string {
  const sortByPath = <T extends { path?: string; id?: string }>(arr: T[]) =>
    [...arr].sort((a, b) => (a.path ?? a.id ?? "").localeCompare(b.path ?? b.id ?? ""));
  const canon = {
    ...scene,
    width: r2(scene.width),
    height: r2(scene.height),
    groups: sortByPath(scene.groups).map((g) => ({ ...g, rect: roundRect(g.rect) })),
    overlays: sortByPath(scene.overlays).map((o) => ({ ...o, rects: o.rects.map(roundRect) })),
    nodes: sortByPath(scene.nodes).map((n) => ({ ...n, rect: roundRect(n.rect), iconRect: n.iconRect ? roundRect(n.iconRect) : undefined })),
    edges: sortByPath(scene.edges).map((e) => ({
      ...e,
      points: e.points.map((p) => ({ x: r2(p.x), y: r2(p.y) })),
    })),
    markers: [...scene.markers]
      .sort((a, b) => a.n - b.n)
      .map((m) => ({ ...m, at: { x: r2(m.at.x), y: r2(m.at.y) } })),
  };
  return JSON.stringify(canon, null, 1);
}

// ------------------------------------------------------------- layout intermediate

/**
 * Placed element tree used during bottom-up composition, before flattening
 * into the Scene. `rect` is RELATIVE to the parent until `absolutize` runs.
 */
export interface Placed {
  path: string;
  rect: Rect;
  children: Placed[];
}

export interface SideSpec {
  side: Side;
}

export type { Rect, Point, Side, Anchor };
