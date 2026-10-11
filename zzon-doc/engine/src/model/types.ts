/**
 * Core diagram model — the plain-data output of the DSL and the input to
 * layout. No coordinates live here; layout produces a separate scene graph.
 *
 * Identity: every element has an `id` (unique among siblings) and a `path`
 * ("/"-joined ids from the diagram root) unique across the diagram. String
 * references in edges/overlays/markers use paths.
 */
import type { GroupKind } from "../render/group-styles.ts";
import type { IconRef } from "../icons/aliases.ts";

export type { GroupKind };

export type Side = "N" | "S" | "E" | "W";
export type BandPosition = "top" | "bottom" | "left" | "right";
export type ActorSide = "left" | "right" | "top" | "bottom";
export type Anchor = "nw" | "ne" | "sw" | "se" | "mid";

/** Captured DSL call site for error reporting ("examples/eks.ts:42"). */
export type CallSite = string | undefined;

// ---------------------------------------------------------------- elements

/** ERD table column (ported from the legacy zzon-doc erd kind) */
export interface TableColumn {
  name: string;
  type?: string;
  pk?: boolean;
  fk?: { table: string; column: string };
  unique?: boolean;
  nullable?: boolean;
}

export interface TableSpec {
  columns: TableColumn[];
}

export type Cardinality = "1" | "0..1" | "N" | "0..N" | "1..N";

/** manifest/document kind (build-docs menu grouping + viewer kind chip) */
export type DocKind =
  | "infra"
  | "data-flow"
  | "erd"
  | "agent-topology"
  | "state"
  | "flowchart"
  | "dependency"
  | "screen-flow"
  | "class";

/**
 * Notation shapes for the behaviour/structure views (render/shapes.ts):
 * UML state machine (state/initial/final/choice), flowchart (process/
 * decision/terminal), screen flow (screen), class/domain model (class),
 * module dependency graph (module). A node has exactly one visual driver:
 * table > shape > category > icon.
 */
export type NodeShape =
  | "state"
  | "initial"
  | "final"
  | "choice"
  | "process"
  | "decision"
  | "terminal"
  | "screen"
  | "class"
  | "module";

/**
 * What a state or flowchart step means for the reader. It picks the card's
 * accent and icon: wait = amber clock, done = green check, fail = red cross.
 * Unset = the plain in-progress card.
 */
export type NodeTone = "wait" | "done" | "fail" | "shared";

/** UML class box compartments (shape "class") */
export interface ClassSpec {
  /** «interface», «entity», «value object», «aggregate root» … (without guillemets) */
  stereotype?: string;
  attributes?: string[];
  methods?: string[];
}

/** end decorations beyond the plain arrowhead (UML relations) */
export type EdgeMarker = "none" | "arrow" | "open-arrow" | "triangle" | "diamond" | "diamond-open";

/** density tier of the selection rubric: T1 overview / T2 standard / T3 reference */
export type Tier = "overview" | "standard" | "reference";

export interface NodeEl {
  type: "node";
  id: string;
  path: string;
  /** AWS/vendor icon; optional when `category` or `table` drives the visual */
  icon?: IconRef;
  /** generic category (31 kinds, categories.gen.ts) — renders as a card node
   * with accent color + lucide icon instead of an AWS icon node */
  category?: string;
  /** tech chip on card nodes (e.g. "NestJS", "PostgreSQL 16") */
  tech?: string;
  /** one-sentence description — shown in the detail sidebar */
  description?: string;
  /** drilldown: sibling diagram slug or full URL */
  href?: string;
  /** ERD table node — renders header + column rows, FK edges anchor per column */
  table?: TableSpec;
  /** notation shape (state machine / flowchart / screen / class / module) */
  shape?: NodeShape;
  /** state / process meaning — card accent + icon (see NodeTone) */
  tone?: NodeTone;
  /** class compartments, shape "class" only */
  classSpec?: ClassSpec;
  label?: string;
  sublabel?: string;
  /** small icons rendered in a row under/next to the label */
  badges?: IconRef[];
  /** shadow-stack visual for repeated resources ("-N") */
  stack?: true | number;
  /** freeform metadata shown in the HTML tooltip */
  meta?: Record<string, string>;
  hints?: ElementHints;
  site?: CallSite;
}

export interface GroupEl {
  type: "group";
  id: string;
  path: string;
  kind: GroupKind;
  label?: string;
  badges?: IconRef[];
  stack?: true | number;
  /** layout strategy; "auto" resolves to pack (no internal edges) or layered */
  layout: "auto" | "grid" | "pack" | "layered";
  children: Element[];
  rails: Rail[];
  /** present iff layout === "grid" */
  grid?: GridSpec;
  meta?: Record<string, string>;
  hints?: ElementHints;
  site?: CallSite;
}

export type Element = NodeEl | GroupEl;

export interface TrackDef {
  id: string;
  label?: string;
  icon?: IconRef;
}

export interface GridSpec {
  columns: TrackDef[];
  rows: TrackDef[];
  /**
   * cell containers keyed "col/row"; each is a GroupEl whose children are
   * laid out inside that cell. Cells may span via `colSpan`/`rowSpan` hints.
   */
  cells: Record<string, GroupEl>;
}

export interface Rail {
  side: Side;
  items: RailItem[];
}

export interface RailItem {
  id: string;
  path: string;
  icon: IconRef;
  label?: string;
  site?: CallSite;
}

export interface ActorEl {
  type: "actor";
  id: string;
  path: string;
  icon: IconRef;
  label?: string;
  side: ActorSide;
  meta?: Record<string, string>;
  site?: CallSite;
}

export interface BandEl {
  type: "band";
  id: string;
  path: string;
  position: BandPosition;
  children: Element[];
  site?: CallSite;
}

// ---------------------------------------------------------------- edges

export interface EdgeStyle {
  preset?: "default" | "dotted" | "dashed";
  color?: string;
  arrowhead?: "none" | "end" | "both";
  /** UML end decorations — override `arrowhead` at that end when set */
  sourceMarker?: EdgeMarker;
  targetMarker?: EdgeMarker;
}

export interface EdgeHints {
  sourceSide?: Side;
  targetSide?: Side;
  waypoints?: { x: number; y: number }[];
  /** force this edge into a named bundle (fan-in or fan-out) */
  bundle?: string;
}

export interface Edge {
  id: string;
  /** element paths; may resolve to node, group, actor, or rail item */
  from: string;
  to: string;
  label?: string;
  labelPlacement?: "source" | "center" | "target" | number;
  style?: EdgeStyle;
  /** CSS-class layer for the HTML visibility toggle */
  layer?: string;
  /** ERD: anchor endpoints at these column rows of the endpoint tables */
  sourceColumn?: string;
  targetColumn?: string;
  /** ERD: crow's-foot decorations at the endpoints */
  sourceCardinality?: Cardinality;
  targetCardinality?: Cardinality;
  /**
   * placement only: treat the edge as to→from when layering (UML
   * inheritance/realization point child→parent but parents sit on top)
   */
  layoutReverse?: boolean;
  hints?: EdgeHints;
  site?: CallSite;
}

/** Edge-sequenced narrative flow (ported from the legacy renderer's flows). */
export interface FlowStep {
  /** edge id ("e0"…) — the edge this step travels */
  edge: string;
  text: string;
}

export interface FlowDef {
  id: string;
  title: string;
  description?: string;
  steps: FlowStep[];
  site?: CallSite;
}

// ---------------------------------------------------------------- overlays & markers

export interface Overlay {
  id: string;
  path: string;
  /** member element paths; layout clusters same-overlay members adjacently */
  members: string[];
  /** inherit official group styling (e.g. auto-scaling) */
  kind?: GroupKind;
  style?: OverlayStyle;
  label?: string;
  labelCorner?: Anchor;
  site?: CallSite;
}

export interface OverlayStyle {
  stroke?: string;
  strokeDasharray?: string;
  fill?: string;
}

export interface Marker {
  n: number;
  at: string;
  anchor?: Anchor;
  offset?: { dx: number; dy: number };
  note?: string;
  site?: CallSite;
}

// ---------------------------------------------------------------- hints

export interface ElementHints {
  /**
   * layer (column for RIGHT, row for DOWN) inside a layered container — lower
   * first. Siblings sharing a value share a layer; gaps collapse. Unhinted
   * siblings are derived from their hinted neighbours along edges.
   */
  layer?: number;
  /** slot within the layer (cross axis) — lower first */
  order?: number;
  /** @deprecated not implemented — use `layer` (validate warns) */
  rank?: string;
  /** @deprecated not implemented (validate warns) */
  minWidth?: number;
  /** @deprecated not implemented (validate warns) */
  minHeight?: number;
  /** @deprecated not implemented — use rails (validate warns) */
  onBorder?: { side: Side; offset?: number };
  /** grid cell span (only meaningful on cell groups) */
  colSpan?: number;
  rowSpan?: number;
  /** escape hatch: absolute position (emits a warning) */
  pin?: { x: number; y: number };
}

// ---------------------------------------------------------------- diagram

export interface DiagramModel {
  id: string;
  title?: string;
  /** diagram-level description — titlebar tooltip in the viewer frame */
  description?: string;
  /** manifest kind for the docs site (default "infra") */
  docKind?: DocKind;
  /** target aspect ratio for the overall canvas */
  aspectRatio: number;
  /**
   * main flow direction for layered containers. Declared = honored as is;
   * omitted = RIGHT, flipped to DOWN only when RIGHT overshoots the aspect
   * band on a diagram larger than the overview tier.
   */
  direction?: "RIGHT" | "DOWN";
  /** draw card descriptions ON the canvas (C4 context style). Default false:
   * descriptions live in the detail sidebar only. */
  nodeDescriptions?: boolean;
  /** selection rubric metadata (references/selection-rubric.md) — drives the
   * tier-specific quality gate in `bun ia check` */
  view?: string;
  tier?: Tier;
  /**
   * Opt out of the vocabulary-mixing validation error: by default a diagram
   * may not mix category-card nodes with icon nodes (AWS/lucide `icon:`) —
   * actors, band members, and rail items count; table nodes are exempt.
   */
  allowMixedVocabulary?: boolean;
  children: Element[];
  actors: ActorEl[];
  bands: BandEl[];
  edges: Edge[];
  overlays: Overlay[];
  markers: Marker[];
  flows: FlowDef[];
}

// ---------------------------------------------------------------- indexes (built by validate)

export interface DiagramIndex {
  /** every addressable element by path (nodes, groups, actors, rail items, bands) */
  byPath: Map<string, Element | ActorEl | RailItem | BandEl>;
  parentOf: Map<string, string | null>;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
  site?: CallSite;
}
