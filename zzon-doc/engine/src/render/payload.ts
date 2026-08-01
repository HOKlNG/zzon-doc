/**
 * Viewer payload emitter (viewer-frame contract §1).
 *
 * The frame reads ONLY this JSON — never the canvas' internal model — so
 * everything the chrome renders (titlebar, sidebar, flow UI, legend, warning
 * chip, export buttons) must be resolved here. Keys with undefined values are
 * omitted so the serialized payload stays minimal and deterministic.
 */
import type { Scene, SceneNode } from "../layout/scene.ts";
import type { DiagramModel } from "../model/types.ts";
import { legendEntries, type LegendEntry } from "./legend.ts";

export type { LegendEntry };

// ------------------------------------------------------------ contract types

export type PayloadKind = "infra" | "data-flow" | "erd" | "agent-topology";

export interface PayloadTableColumn {
  name: string;
  type?: string;
  pk?: boolean;
  fk?: { table: string; column: string };
  unique?: boolean;
  nullable?: boolean;
}

export interface PayloadNode {
  path: string;
  label: string;
  category?: string;
  tech?: string;
  description?: string;
  href?: string;
  table?: { columns: PayloadTableColumn[] };
}

export interface PayloadEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  layer?: string;
}

export interface PayloadFlowStep {
  edgeId: string;
  text: string;
  /** 1-based step number within the flow */
  n: number;
}

export interface PayloadFlow {
  id: string;
  title: string;
  description?: string;
  steps: PayloadFlowStep[];
}

export interface PayloadAssets {
  svgFile?: string;
  pngFile?: string;
}

export interface ViewerPayload {
  id: string;
  title: string;
  kind: PayloadKind;
  /** titlebar tooltip */
  description?: string;
  /** a11y aria-label */
  counts: { nodes: number; edges: number; flows: number; groups: number };
  /** layout products — the canvas side produces them (none yet for the engine) */
  warnings: string[];
  nodes: PayloadNode[];
  edges: PayloadEdge[];
  flows: PayloadFlow[];
  /** resolved legend entries — the frame only draws them */
  legend: LegendEntry[];
  /** export-button download fallback files, when known */
  assets?: PayloadAssets;
}

// ------------------------------------------------------------ helpers

/** spread-in `key: value` only when the value is defined (keeps JSON minimal) */
function defined<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]: V });
}

const nodeLabel = (n: SceneNode): string => n.label?.text ?? n.path.split("/").pop() ?? n.path;

function payloadNode(n: SceneNode): PayloadNode {
  return {
    path: n.path,
    label: nodeLabel(n),
    ...defined("category", n.category),
    ...defined("tech", n.tech),
    ...defined("description", n.description),
    ...defined("href", n.href),
    ...(n.table
      ? {
          table: {
            columns: n.table.columns.map((c) => ({
              name: c.name,
              ...defined("type", c.type),
              ...defined("pk", c.pk),
              ...defined("fk", c.fk),
              ...defined("unique", c.unique),
              ...defined("nullable", c.nullable),
            })),
          },
        }
      : {}),
  };
}

// ------------------------------------------------------------ entry point

/**
 * Contract §1 payload for one finished Scene. `model` supplies what the
 * scene graph does not carry (docKind fallback); `opts.assets` lets the CLI
 * name the sibling export files it actually writes (defaults to
 * `<scene.id>.svg`, the render command's convention).
 */
export function buildPayload(
  scene: Scene,
  model?: DiagramModel,
  opts: { assets?: PayloadAssets } = {},
): ViewerPayload {
  return {
    id: scene.id,
    title: scene.title ?? scene.id,
    kind: scene.docKind ?? model?.docKind ?? "infra",
    // diagram-level description travels model -> payload (scenes don't carry it)
    ...defined("description", model?.description),
    counts: {
      nodes: scene.nodes.length,
      edges: scene.edges.length,
      flows: scene.flows.length,
      groups: scene.groups.length,
    },
    warnings: [],
    nodes: scene.nodes.map(payloadNode),
    edges: scene.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      ...defined("label", e.label?.text),
      ...defined("layer", e.layer),
    })),
    flows: scene.flows.map((f) => ({
      id: f.id,
      title: f.title,
      ...defined("description", f.description),
      steps: f.steps.map((s) => ({ edgeId: s.edgeId, text: s.text, n: s.n })),
    })),
    legend: legendEntries(scene),
    assets: opts.assets ?? { svgFile: `${scene.id}.svg` },
  };
}
