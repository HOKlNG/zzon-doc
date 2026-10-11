/**
 * TypeScript builder DSL. Builder methods return typed ref objects; edges and
 * overlays accept refs or "/"-joined path strings (parent-scoped escape hatch).
 *
 * Every builder call captures its call site so validation errors can point at
 * the user's diagram.ts line.
 */
import type {
  ActorEl,
  ActorSide,
  Anchor,
  BandEl,
  BandPosition,
  DiagramModel,
  DocKind,
  Edge,
  EdgeHints,
  EdgeStyle,
  Element,
  ElementHints,
  GridSpec,
  GroupEl,
  GroupKind,
  Marker,
  NodeEl,
  Overlay,
  OverlayStyle,
  Rail,
  RailItem,
  Side,
  TableSpec,
  Tier,
  NodeShape,
  NodeTone,
  ClassSpec,
  EdgeMarker,
  Cardinality,
  TrackDef,
} from "../model/types.ts";
import type { IconRef } from "../icons/aliases.ts";

// ---------------------------------------------------------------- refs

export interface Ref {
  readonly path: string;
}

const isRef = (v: unknown): v is Ref =>
  typeof v === "object" && v !== null && "path" in v && typeof (v as Ref).path === "string";

export type RefOrPath = Ref | string;

export const refPath = (r: RefOrPath): string => (isRef(r) ? r.path : r);

function callSite(): string | undefined {
  const stack = new Error().stack?.split("\n") ?? [];
  // 0: Error, 1: callSite, 2: builder method, 3: user code
  const line = stack[3] ?? "";
  const m = line.match(/\(?([^()\s]+:\d+):\d+\)?$/);
  return m?.[1];
}

// ---------------------------------------------------------------- option types

export interface NodeOpts {
  /** AWS/vendor icon — optional when category or table drives the visual */
  icon?: IconRef;
  category?: string;
  /** notation shape (state machine / flowchart / screen / class / module) — prefer the helpers */
  shape?: NodeShape;
  tone?: NodeTone;
  classSpec?: ClassSpec;
  tech?: string;
  description?: string;
  href?: string;
  table?: TableSpec;
  label?: string;
  sublabel?: string;
  badges?: IconRef[];
  stack?: true | number;
  meta?: Record<string, string>;
  hints?: ElementHints;
}

/** options shared by the notation helpers (state/process/screen/…) */
export interface ShapeOpts {
  label?: string;
  sublabel?: string;
  /** state / process meaning: "wait" | "done" | "fail" — card accent and icon */
  tone?: NodeTone;
  description?: string;
  href?: string;
  meta?: Record<string, string>;
  hints?: ElementHints;
}

export interface GroupOpts {
  kind?: GroupKind;
  label?: string;
  badges?: IconRef[];
  stack?: true | number;
  layout?: "auto" | "pack" | "layered";
  meta?: Record<string, string>;
  hints?: ElementHints;
}

export type Track = string | TrackDef;

export interface GridOpts extends Omit<GroupOpts, "layout"> {
  columns: Track[];
  rows: Track[];
}

export interface CellOpts {
  kind?: GroupKind;
  label?: string;
  layout?: "auto" | "pack" | "layered";
  colSpan?: number;
  rowSpan?: number;
  hints?: ElementHints;
}

export interface EdgeOpts {
  label?: string;
  sourceColumn?: string;
  targetColumn?: string;
  sourceCardinality?: Cardinality;
  targetCardinality?: Cardinality;
  labelPlacement?: "source" | "center" | "target" | number;
  style?: EdgeStyle;
  layer?: string;
  hints?: EdgeHints;
  /**
   * a RETURN edge ("쇼핑 계속", "재시도", "다시 로그인"): placement treats it as
   * to→from so it does not break the reading order of the main flow
   */
  back?: boolean;
}

export interface OverlayOpts {
  members: RefOrPath[];
  kind?: GroupKind;
  style?: OverlayStyle | "dashed-green" | "dashed-orange" | "dashed-red" | "dashed-gray";
  label?: string;
  labelCorner?: Anchor;
}

export interface ActorOpts {
  icon: IconRef;
  label?: string;
  side?: ActorSide;
  meta?: Record<string, string>;
}

export interface StepOpts {
  at: RefOrPath;
  anchor?: Anchor;
  offset?: { dx: number; dy: number };
  note?: string;
}

const OVERLAY_PRESETS: Record<string, OverlayStyle> = {
  "dashed-green": { stroke: "#7AA116", strokeDasharray: "6 4" },
  "dashed-orange": { stroke: "#ED7100", strokeDasharray: "6 4" },
  "dashed-red": { stroke: "#DD344C", strokeDasharray: "6 4" },
  "dashed-gray": { stroke: "#7D8998", strokeDasharray: "6 4" },
};

/** class-diagram relation options */
export interface RelationOpts {
  label?: string;
  hints?: EdgeHints;
  sourceCardinality?: Cardinality;
  targetCardinality?: Cardinality;
}

function relation(opts: RelationOpts, layer: string, sourceMarker: EdgeMarker): EdgeOpts {
  // multiplicities ride in the label ("1 — 0..N") — crow's feet are ERD notation
  const mult = opts.sourceCardinality || opts.targetCardinality
    ? `${opts.sourceCardinality ?? ""} — ${opts.targetCardinality ?? ""}`.trim()
    : "";
  const label = [opts.label, mult].filter(Boolean).join(" · ") || undefined;
  return { label, layer, style: { sourceMarker, targetMarker: "none", arrowhead: "none" }, hints: opts.hints };
}

/** default main direction per notation view (declared direction always wins) */
const DEFAULT_DIRECTION: Partial<Record<DocKind, "RIGHT" | "DOWN">> = {
  flowchart: "DOWN",
  dependency: "DOWN",
  class: "DOWN",
  state: "RIGHT",
  "screen-flow": "RIGHT",
};

// ---------------------------------------------------------------- builders

const track = (t: Track): TrackDef => (typeof t === "string" ? { id: t } : t);

/** Shared logic for anything that owns child elements. */
abstract class ContainerBuilder {
  constructor(
    protected readonly model: DiagramModel,
    protected readonly children: Element[],
    protected readonly basePath: string,
  ) {}

  protected childPath(id: string): string {
    return this.basePath ? `${this.basePath}/${id}` : id;
  }

  node(id: string, opts: NodeOpts): NodeRef {
    return this.addNode(id, opts, callSite());
  }

  // ---- notation helpers (each captures its own call site: callSite() reads
  // stack[3], so helpers must not route through node())

  /** UML state (rounded box); `sublabel` = internal activity, e.g. "entry / 재고 예약" */
  state(id: string, opts: ShapeOpts = {}): NodeRef {
    return this.addNode(id, { ...opts, label: opts.label ?? id, shape: "state" }, callSite());
  }
  /** UML initial pseudo-state (filled dot) */
  initial(id = "initial", opts: ShapeOpts = {}): NodeRef {
    return this.addNode(id, { ...opts, label: opts.label ?? "시작", shape: "initial" }, callSite());
  }
  /** UML final state (bullseye) */
  final(id = "final", opts: ShapeOpts = {}): NodeRef {
    return this.addNode(id, { ...opts, label: opts.label ?? "종료", shape: "final" }, callSite());
  }
  /** UML choice pseudo-state (small diamond) — guards go on outgoing transitions */
  choice(id: string, opts: ShapeOpts = {}): NodeRef {
    return this.addNode(id, { ...opts, label: opts.label ?? id, shape: "choice" }, callSite());
  }
  /** flowchart step (rectangle) */
  process(id: string, opts: ShapeOpts = {}): NodeRef {
    return this.addNode(id, { ...opts, label: opts.label ?? id, shape: "process" }, callSite());
  }
  /** flowchart decision (diamond with the question inside) */
  decision(id: string, opts: ShapeOpts = {}): NodeRef {
    return this.addNode(id, { ...opts, label: opts.label ?? id, shape: "decision" }, callSite());
  }
  /** flowchart start/end (pill) */
  terminal(id: string, opts: ShapeOpts = {}): NodeRef {
    return this.addNode(id, { ...opts, label: opts.label ?? id, shape: "terminal" }, callSite());
  }
  /** screen-flow page (browser-chrome frame); `route` is shown as the sublabel */
  screen(id: string, opts: ShapeOpts & { route?: string } = {}): NodeRef {
    const { route, ...rest } = opts;
    return this.addNode(id, { ...rest, label: rest.label ?? id, sublabel: rest.sublabel ?? route, shape: "screen" }, callSite());
  }
  /** UML class box with compartments (`d.classNode` — `class` is a reserved word) */
  classNode(id: string, opts: ShapeOpts & ClassSpec = {}): NodeRef {
    const { stereotype, attributes, methods, ...rest } = opts;
    return this.addNode(
      id,
      { ...rest, label: rest.label ?? id, shape: "class", classSpec: { stereotype, attributes, methods } },
      callSite(),
    );
  }
  /** dependency-graph module card; `files` goes to the sidebar, never the canvas */
  module(id: string, opts: ShapeOpts & { files?: number; shared?: boolean } = {}): NodeRef {
    const { files, shared, ...rest } = opts;
    if (shared) rest.tone = "shared";
    const fileNote = files !== undefined ? `파일 ${files}개로 이루어진 모듈이다.` : undefined;
    return this.addNode(
      id,
      { ...rest, label: rest.label ?? id, description: rest.description ?? fileNote, shape: "module" },
      callSite(),
    );
  }

  protected addNode(id: string, opts: NodeOpts, site: string | undefined): NodeRef {
    const el: NodeEl = {
      type: "node",
      id,
      path: this.childPath(id),
      icon: opts.icon,
      category: opts.category,
      shape: opts.shape,
      tone: opts.tone,
      classSpec: opts.classSpec,
      tech: opts.tech,
      description: opts.description,
      href: opts.href,
      table: opts.table,
      label: opts.label,
      sublabel: opts.sublabel,
      badges: opts.badges,
      stack: opts.stack,
      meta: opts.meta,
      hints: opts.hints,
      site,
    };
    this.children.push(el);
    return new NodeRef(el);
  }

  group(id: string, opts: GroupOpts = {}): GroupBuilder {
    const el: GroupEl = {
      type: "group",
      id,
      path: this.childPath(id),
      kind: opts.kind ?? "generic",
      label: opts.label,
      badges: opts.badges,
      stack: opts.stack,
      layout: opts.layout ?? "auto",
      children: [],
      rails: [],
      meta: opts.meta,
      hints: opts.hints,
      site: callSite(),
    };
    this.children.push(el);
    return new GroupBuilder(this.model, el);
  }

  grid(id: string, opts: GridOpts): GridBuilder {
    const grid: GridSpec = {
      columns: opts.columns.map(track),
      rows: opts.rows.map(track),
      cells: {},
    };
    const el: GroupEl = {
      type: "group",
      id,
      path: this.childPath(id),
      kind: opts.kind ?? "generic",
      label: opts.label,
      badges: opts.badges,
      layout: "grid",
      children: [],
      rails: [],
      grid,
      meta: opts.meta,
      hints: opts.hints,
      site: callSite(),
    };
    this.children.push(el);
    return new GridBuilder(this.model, el);
  }
}

export class NodeRef implements Ref {
  constructor(private readonly el: NodeEl) {}
  get path(): string {
    return this.el.path;
  }
}

export class RailItemRef implements Ref {
  constructor(private readonly item: RailItem) {}
  get path(): string {
    return this.item.path;
  }
}

export class GroupBuilder extends ContainerBuilder implements Ref {
  constructor(
    model: DiagramModel,
    protected readonly el: GroupEl,
  ) {
    super(model, el.children, el.path);
  }

  get path(): string {
    return this.el.path;
  }

  rail(side: Side, items: { id: string; icon: IconRef; label?: string }[]): RailItemRef[] {
    const rail: Rail = {
      side,
      items: items.map((it) => ({
        id: it.id,
        path: `${this.el.path}/${it.id}`,
        icon: it.icon,
        label: it.label,
        site: callSite(),
      })),
    };
    this.el.rails.push(rail);
    return rail.items.map((it) => new RailItemRef(it));
  }

  overlay(id: string, opts: OverlayOpts): Ref {
    return addOverlay(this.model, this.el.path, id, opts);
  }
}

export class GridBuilder extends GroupBuilder {
  /** get-or-create the cell container at (col, row) */
  cell(col: string, row: string, opts: CellOpts = {}): GroupBuilder {
    const grid = this.el.grid!;
    const key = `${col}/${row}`;
    const existing = grid.cells[key];
    if (existing) return new GroupBuilder(this.model, existing);
    const cell: GroupEl = {
      type: "group",
      id: key,
      path: `${this.el.path}/${key}`,
      kind: opts.kind ?? "generic",
      label: opts.label,
      layout: opts.layout ?? "auto",
      children: [],
      rails: [],
      hints: { ...opts.hints, colSpan: opts.colSpan, rowSpan: opts.rowSpan },
      site: callSite(),
    };
    grid.cells[key] = cell;
    return new GroupBuilder(this.model, cell);
  }
}

export class BandBuilder extends ContainerBuilder {
  constructor(model: DiagramModel, band: BandEl) {
    super(model, band.children, band.path);
  }
}

function addOverlay(model: DiagramModel, basePath: string, id: string, opts: OverlayOpts): Ref {
  const style =
    typeof opts.style === "string" ? OVERLAY_PRESETS[opts.style] : opts.style;
  const overlay: Overlay = {
    id,
    path: basePath ? `${basePath}/${id}` : id,
    members: opts.members.map(refPath),
    kind: opts.kind,
    style,
    label: opts.label,
    labelCorner: opts.labelCorner,
    site: callSite(),
  };
  model.overlays.push(overlay);
  return { path: overlay.path };
}

export class DiagramBuilder extends ContainerBuilder {
  constructor(private readonly m: DiagramModel) {
    super(m, m.children, "");
  }

  actor(id: string, opts: ActorOpts): Ref {
    const el: ActorEl = {
      type: "actor",
      id,
      path: id,
      icon: opts.icon,
      label: opts.label,
      side: opts.side ?? "left",
      meta: opts.meta,
      site: callSite(),
    };
    this.m.actors.push(el);
    return { path: el.path };
  }

  band(position: BandPosition, build: (b: BandBuilder) => void): Ref {
    const band: BandEl = {
      type: "band",
      id: `band-${position}`,
      path: `band-${position}`,
      position,
      children: [],
      site: callSite(),
    };
    this.m.bands.push(band);
    build(new BandBuilder(this.m, band));
    return { path: band.path };
  }

  edge(from: RefOrPath, to: RefOrPath, opts: EdgeOpts = {}): Ref {
    return this.addEdge(from, to, opts, callSite(), opts.back === true);
  }

  // ---- relation helpers (state machine / class diagram / dependency graph)

  /** state transition labelled "event [guard] / action" */
  transition(
    from: RefOrPath,
    to: RefOrPath,
    opts: { event?: string; guard?: string; action?: string; layer?: string; style?: EdgeStyle; hints?: EdgeHints; back?: boolean } = {},
  ): Ref {
    const label = [opts.event, opts.guard ? `[${opts.guard}]` : "", opts.action ? `/ ${opts.action}` : ""]
      .filter(Boolean)
      .join(" ")
      .trim();
    return this.addEdge(from, to, { label: label || undefined, layer: opts.layer ?? "transition", style: opts.style, hints: opts.hints }, callSite(), opts.back === true);
  }
  /** UML generalization child ▷ parent (parents are laid out first) */
  inherits(child: RefOrPath, parent: RefOrPath, opts: { label?: string } = {}): Ref {
    return this.addEdge(child, parent, { ...opts, layer: "inherit", style: { targetMarker: "triangle" } }, callSite(), true);
  }
  /** UML realization class ⇢▷ interface */
  implements(cls: RefOrPath, iface: RefOrPath, opts: { label?: string } = {}): Ref {
    return this.addEdge(cls, iface, { ...opts, layer: "implement", style: { preset: "dashed", targetMarker: "triangle" } }, callSite(), true);
  }
  /** UML composition whole ◆— part */
  composes(whole: RefOrPath, part: RefOrPath, opts: RelationOpts = {}): Ref {
    return this.addEdge(whole, part, relation(opts, "compose", "diamond"), callSite());
  }
  /** UML aggregation whole ◇— part */
  aggregates(whole: RefOrPath, part: RefOrPath, opts: RelationOpts = {}): Ref {
    return this.addEdge(whole, part, relation(opts, "aggregate", "diamond-open"), callSite());
  }
  /** UML association (plain line, optional multiplicities in the label) */
  associates(a: RefOrPath, b: RefOrPath, opts: RelationOpts = {}): Ref {
    return this.addEdge(a, b, relation(opts, "assoc", "none"), callSite());
  }
  /** dependency (solid line, open arrow) — module graphs, «use» relations; `cycle` paints it red */
  dependsOn(a: RefOrPath, b: RefOrPath, opts: { label?: string; cycle?: boolean; layer?: string; hints?: EdgeHints } = {}): Ref {
    return this.addEdge(
      a,
      b,
      {
        label: opts.label,
        layer: opts.layer ?? (opts.cycle ? "cycle" : "depends"),
        style: { targetMarker: "open-arrow", ...(opts.cycle ? { color: "#DC2626" } : {}) },
        hints: opts.hints,
      },
      callSite(),
    );
  }

  private addEdge(from: RefOrPath, to: RefOrPath, opts: EdgeOpts, site: string | undefined, layoutReverse = false): Ref {
    const edge: Edge = {
      id: `e${this.m.edges.length}`,
      from: refPath(from),
      to: refPath(to),
      label: opts.label,
      labelPlacement: opts.labelPlacement,
      style: opts.style,
      layer: opts.layer,
      sourceColumn: opts.sourceColumn,
      targetColumn: opts.targetColumn,
      sourceCardinality: opts.sourceCardinality,
      targetCardinality: opts.targetCardinality,
      ...(layoutReverse ? { layoutReverse: true } : {}),
      hints: opts.hints,
      site,
    };
    this.m.edges.push(edge);
    return { path: edge.id };
  }

  overlay(id: string, opts: OverlayOpts): Ref {
    return addOverlay(this.m, "", id, opts);
  }

  /** edge-sequenced narrative flow; edge refs are the Refs returned by d.edge() */
  flow(id: string, opts: { title: string; description?: string; steps: { edge: RefOrPath; text: string }[] }): void {
    this.m.flows.push({
      id,
      title: opts.title,
      description: opts.description,
      steps: opts.steps.map((s) => ({ edge: refPath(s.edge), text: s.text })),
      site: callSite(),
    });
  }

  step(n: number, opts: StepOpts): void {
    const marker: Marker = {
      n,
      at: refPath(opts.at),
      anchor: opts.anchor,
      offset: opts.offset,
      note: opts.note,
      site: callSite(),
    };
    this.m.markers.push(marker);
  }

  set title(t: string) {
    this.m.title = t;
  }
}

export interface DiagramOpts {
  title?: string;
  /** diagram-level description — surfaces as the viewer titlebar tooltip */
  description?: string;
  aspectRatio?: number;
  docKind?: DocKind;
  /** main flow direction — declared = honored as is (no aspect flip) */
  direction?: "RIGHT" | "DOWN";
  /** draw card descriptions on the canvas (C4 context style); default sidebar-only */
  nodeDescriptions?: boolean;
  /** selection-rubric view name (references/selection-rubric.md §2.1) */
  view?: string;
  /** selection-rubric density tier — drives `bun ia check` thresholds */
  tier?: Tier;
  /** allow mixing category-card and icon node vocabularies in one diagram */
  allowMixedVocabulary?: boolean;
}

export function diagram(
  id: string,
  optsOrBuild: DiagramOpts | ((d: DiagramBuilder) => void),
  maybeBuild?: (d: DiagramBuilder) => void,
): DiagramModel {
  const opts = typeof optsOrBuild === "function" ? {} : optsOrBuild;
  const build = typeof optsOrBuild === "function" ? optsOrBuild : maybeBuild!;
  const model: DiagramModel = {
    id,
    title: opts.title,
    description: opts.description,
    docKind: opts.docKind,
    aspectRatio: opts.aspectRatio ?? 1.6,
    direction: opts.direction ?? (opts.docKind ? DEFAULT_DIRECTION[opts.docKind] : undefined),
    nodeDescriptions: opts.nodeDescriptions,
    view: opts.view,
    tier: opts.tier,
    allowMixedVocabulary: opts.allowMixedVocabulary,
    children: [],
    actors: [],
    bands: [],
    edges: [],
    overlays: [],
    markers: [],
    flows: [],
  };
  build(new DiagramBuilder(model));
  return model;
}
