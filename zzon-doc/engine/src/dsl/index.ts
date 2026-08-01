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
    const el: NodeEl = {
      type: "node",
      id,
      path: this.childPath(id),
      icon: opts.icon,
      category: opts.category,
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
      site: callSite(),
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
      hints: opts.hints,
      site: callSite(),
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
  docKind?: "infra" | "data-flow" | "erd" | "agent-topology";
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
