/**
 * Legacy DiagramSpec (zzon-doc render.mjs JSON, specVersion 1) -> DiagramModel.
 *
 * The converter emits PURE legacy vocabulary: every legacy node becomes either
 * a category-card node or an ERD table node — NEVER an icon node — so the
 * result always passes the vocabulary guard without `allowMixedVocabulary`.
 *
 * Return-shape decision (documented per the consolidation contract): the
 * converter returns `{ model, warnings, notes, section?, order? }` rather than
 * registering issues elsewhere. `warnings` are lossy-mapping facts the caller
 * should surface (unknown category, ignored DOWN direction, dangling refs);
 * `notes` are informational (ignored layout hints). `section`/`order` are NOT
 * part of the model — build-docs reads them straight from the spec JSON — but
 * they are exposed here for caller convenience.
 *
 * Mapping rules:
 *   - node.category      -> card node (category/tech/description/href; badge -> sublabel)
 *   - node.table         -> table node, columns verbatim (incl. legacy category:"table")
 *   - unknown category   -> "service" + warning
 *   - groups             -> nested groups via parentId (created parent-first);
 *                           kind: vpc->vpc region->region account->account
 *                           subnet->private-subnet security->security-group
 *                           onprem->corporate-data-center, else generic (label kept)
 *   - edge.kind          -> edge.layer verbatim; style: event|async dashed,
 *                           read dotted, else solid; erd docs additionally get
 *                           arrowhead "none" and carry columns/cardinalities
 *   - flows              -> steps[].edge legacy ids resolved through the Refs
 *                           returned by d.edge() while edges are emitted
 *   - ordering           -> nodes/groups emitted sorted by (lane ?? 0,
 *                           order ?? 0, spec index); lane/order then DROPPED
 *                           (the engine auto-layouts)
 *   - layout.direction   -> ignored; recorded in notes, warning when "DOWN"
 *   - kind "sequence"    -> rejected (zzon-seq renders sequence diagrams)
 */
import {
  diagram,
  type DiagramBuilder,
  type GroupBuilder,
  type NodeRef,
  type Ref,
  type RefOrPath,
} from "../dsl/index.ts";
import type {
  Cardinality,
  DiagramModel,
  EdgeStyle,
  GroupKind,
  TableColumn,
  TableSpec,
} from "../model/types.ts";
import { CARD_CATEGORY_META } from "../render/card.ts";
import { mapAwsVocabulary } from "./aws-vocab.ts";

// ---------------------------------------------------------------- result

export interface ConvertResult {
  model: DiagramModel;
  /** lossy-mapping facts the caller should surface to the user */
  warnings: string[];
  /** informational notes (ignored hints, defaults applied) */
  notes: string[];
  /** build-docs menu hints from the spec — not part of the model */
  section?: string;
  order?: number;
}

export interface ConvertOptions {
  /** model id (CLI passes the json basename slug); default derives from title */
  id?: string;
  /** 노드 어휘 — 정책은 호출자(스펙의 "vocabulary" 필드/스킬)가 정한다. 기본 "card". */
  vocabulary?: "card" | "aws";
}

export class ConvertError extends Error {}

// ---------------------------------------------------------------- narrowing

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const dicts = (v: unknown): Dict[] => list(v).filter(isDict);

// ---------------------------------------------------------------- mappings

const DOC_KINDS = ["infra", "data-flow", "erd", "agent-topology"] as const;
type DocKind = (typeof DOC_KINDS)[number];

const GROUP_KIND_MAP: Record<string, GroupKind> = {
  vpc: "vpc",
  region: "region",
  account: "account",
  subnet: "private-subnet",
  security: "security-group",
  onprem: "corporate-data-center",
  // zone / stage / layer / boundary / cluster (and anything else) -> generic
};

const CARDINALITIES: readonly Cardinality[] = ["1", "0..1", "N", "0..N", "1..N"];

/**
 * Target canvas aspect ratio per document kind. ERDs pack a few tall tables
 * side by side (wide, short canvas); data-flows are staged pipelines and also
 * run wide. Infra/agent topologies keep the engine default 1.6.
 */
const ASPECT_BY_KIND: Record<DocKind, number> = {
  infra: 1.6,
  "data-flow": 2.0,
  erd: 2.2,
  "agent-topology": 1.6,
};

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "diagram";

/** legacy edge kind -> engine EdgeStyle (undefined = solid default) */
function edgeStyle(kind: string | undefined, erd: boolean): EdgeStyle | undefined {
  const preset =
    kind === "event" || kind === "async" ? ("dashed" as const)
    : kind === "read" ? ("dotted" as const)
    : undefined;
  const arrowhead = erd ? ("none" as const) : undefined;
  if (preset === undefined && arrowhead === undefined) return undefined;
  return {
    ...(preset !== undefined ? { preset } : {}),
    ...(arrowhead !== undefined ? { arrowhead } : {}),
  };
}

/** legacy table spec -> TableSpec, columns verbatim */
function tableSpec(raw: Dict): TableSpec {
  const columns: TableColumn[] = dicts(raw["columns"]).map((c) => {
    const fkRaw = isDict(c["fk"]) ? c["fk"] : undefined;
    const fkTable = fkRaw && str(fkRaw["table"]);
    const fkColumn = fkRaw && str(fkRaw["column"]);
    return {
      name: str(c["name"]) ?? "",
      ...(str(c["type"]) !== undefined ? { type: str(c["type"]) } : {}),
      ...(bool(c["pk"]) !== undefined ? { pk: bool(c["pk"]) } : {}),
      ...(fkTable !== undefined && fkColumn !== undefined
        ? { fk: { table: fkTable, column: fkColumn } }
        : {}),
      ...(bool(c["unique"]) !== undefined ? { unique: bool(c["unique"]) } : {}),
      ...(bool(c["nullable"]) !== undefined ? { nullable: bool(c["nullable"]) } : {}),
    };
  });
  return { columns };
}

/** legacy (lane, order, spec index) reading-order comparator */
interface Ordered {
  lane: number;
  order: number;
  index: number;
}
const readingOrder = (a: Ordered, b: Ordered): number =>
  a.lane - b.lane || a.order - b.order || a.index - b.index;

// ---------------------------------------------------------------- converter

export function convertDiagramSpec(spec: unknown, opts: ConvertOptions = {}): ConvertResult {
  if (!isDict(spec)) {
    throw new ConvertError("DiagramSpec must be a JSON object");
  }

  const warnings: string[] = [];
  const notes: string[] = [];

  // ---- kind
  const rawKind = str(spec["kind"]);
  if (rawKind === "sequence") {
    throw new ConvertError(
      'DiagramSpec kind "sequence" is not handled by this engine — ' +
        "sequence diagrams are zzon-seq's job (use the zzon-seq renderer)",
    );
  }
  let docKind: DocKind = "infra";
  if (rawKind === undefined) {
    warnings.push('spec has no "kind" — defaulting to "infra"');
  } else if ((DOC_KINDS as readonly string[]).includes(rawKind)) {
    docKind = rawKind as DocKind;
  } else {
    warnings.push(`unknown kind "${rawKind}" — defaulting to "infra"`);
  }
  const erd = docKind === "erd";

  // ---- layout hints (ignored: the engine auto-layouts)
  const layout = isDict(spec["layout"]) ? spec["layout"] : undefined;
  const direction = layout && str(layout["direction"]);
  if (direction !== undefined) {
    notes.push(`layout.direction "${direction}" ignored — the engine auto-layouts`);
    if (direction === "DOWN") {
      warnings.push('layout.direction "DOWN" is not supported yet — rendered with auto orientation');
    }
  }

  const title = str(spec["title"]);
  const id = opts.id ?? slugify(title ?? "diagram");

  // ---- collect + sort specs into legacy reading order
  const groupSpecs = dicts(spec["groups"])
    .map((g, index) => ({
      g,
      key: { lane: num(g["lane"]) ?? 0, order: num(g["order"]) ?? 0, index },
    }))
    .sort((a, b) => readingOrder(a.key, b.key))
    .map(({ g }) => g);
  const nodeSpecs = dicts(spec["nodes"])
    .map((n, index) => ({
      n,
      key: { lane: num(n["lane"]) ?? 0, order: num(n["order"]) ?? 0, index },
    }))
    .sort((a, b) => readingOrder(a.key, b.key))
    .map(({ n }) => n);

  const groupById = new Map<string, Dict>();
  for (const g of groupSpecs) {
    const gid = str(g["id"]);
    if (gid !== undefined) groupById.set(gid, g);
  }

  const model = diagram(
    id,
    {
      ...(title !== undefined ? { title } : {}),
      ...(str(spec["description"]) !== undefined ? { description: str(spec["description"]) } : {}),
      docKind,
      // 스펙이 의도를 선언하면 그게 우선 (multi-region 예제와 같은 메커니즘)
      aspectRatio: typeof spec["aspectRatio"] === "number" && spec["aspectRatio"] > 0
        ? (spec["aspectRatio"] as number)
        : ASPECT_BY_KIND[docKind],
    },
    (d) => {
      // ---- groups: parentId nesting, created in dependency (parent-first) order
      const groupBuilders = new Map<string, GroupBuilder>();
      const building = new Set<string>();
      const ensureGroup = (gid: string): GroupBuilder | undefined => {
        const existing = groupBuilders.get(gid);
        if (existing) return existing;
        const g = groupById.get(gid);
        if (!g) return undefined;
        let parent: DiagramBuilder | GroupBuilder = d;
        const parentId = str(g["parentId"]);
        if (parentId !== undefined) {
          if (building.has(gid) || parentId === gid) {
            warnings.push(`group "${gid}" is in a parentId cycle — attached at root`);
          } else {
            building.add(gid);
            const pb = ensureGroup(parentId);
            building.delete(gid);
            if (pb) parent = pb;
            else warnings.push(`group "${gid}" parentId "${parentId}" not found — attached at root`);
          }
        }
        const rawGroupKind = str(g["kind"]);
        const built = parent.group(gid, {
          kind: rawGroupKind !== undefined ? (GROUP_KIND_MAP[rawGroupKind] ?? "generic") : "generic",
          ...(str(g["label"]) !== undefined ? { label: str(g["label"]) } : {}),
        });
        groupBuilders.set(gid, built);
        return built;
      };
      for (const gid of groupById.keys()) ensureGroup(gid);

      // ---- nodes: 어휘는 정책 입력이다 — spec.vocabulary > opts.vocabulary > "card".
      // "aws"는 전부-아니면-카드: 한 노드라도 매핑 실패 시 전체 카드 유지 + warning.
      const vocabDecl = str(spec["vocabulary"]) ?? opts.vocabulary ?? "card";
      let awsIcons: ReturnType<typeof mapAwsVocabulary>["icons"] = null;
      if (vocabDecl === "aws") {
        const probe = nodeSpecs
          .filter((n) => !isDict(n["table"]))
          .map((n) => ({
            id: str(n["id"]) ?? "?",
            category: str(n["category"]) ?? "service",
            tech: str(n["tech"]),
          }));
        const res = mapAwsVocabulary(probe);
        if (res.icons) awsIcons = res.icons;
        else warnings.push(`vocabulary:"aws" 요청됐지만 매핑 불가 노드가 있어 카드 어휘로 폴백: ${res.failures.join(", ")}`);
      } else if (vocabDecl !== "card") {
        warnings.push(`unknown vocabulary "${vocabDecl}" — "card"로 처리`);
      }
      const nodeRefs = new Map<string, NodeRef>();
      for (const n of nodeSpecs) {
        const nid = str(n["id"]);
        if (nid === undefined) {
          warnings.push("node without an id skipped");
          continue;
        }
        let parent: DiagramBuilder | GroupBuilder = d;
        const parentId = str(n["parentId"]);
        if (parentId !== undefined) {
          const pb = groupBuilders.get(parentId);
          if (pb) parent = pb;
          else warnings.push(`node "${nid}" parentId "${parentId}" not found — attached at root`);
        }
        const label = str(n["label"]);
        const description = str(n["description"]);
        const href = str(n["href"]);
        const table = isDict(n["table"]) ? n["table"] : undefined;
        if (table) {
          // table node (covers legacy category:"table" with a table spec)
          nodeRefs.set(
            nid,
            parent.node(nid, {
              ...(label !== undefined ? { label } : {}),
              ...(description !== undefined ? { description } : {}),
              ...(href !== undefined ? { href } : {}),
              table: tableSpec(table),
            }),
          );
          continue;
        }
        const awsIcon = awsIcons?.get(nid);
        if (awsIcon) {
          const tech = str(n["tech"]);
          const badge = str(n["badge"]);
          nodeRefs.set(
            nid,
            parent.node(nid, {
              icon: awsIcon,
              ...(label !== undefined ? { label } : {}),
              // 아이콘 노드는 tech를 sublabel로 (카드의 tech 칩 대응)
              ...(tech !== undefined ? { sublabel: tech } : badge !== undefined ? { sublabel: badge } : {}),
              ...(description !== undefined ? { description } : {}),
              ...(href !== undefined ? { href } : {}),
            }),
          );
          continue;
        }
        let category = str(n["category"]);
        if (category === undefined) {
          warnings.push(`node "${nid}" has no category — mapped to "service"`);
          category = "service";
        } else if (!(category in CARD_CATEGORY_META)) {
          warnings.push(`node "${nid}" has unknown category "${category}" — mapped to "service"`);
          category = "service";
        }
        nodeRefs.set(
          nid,
          parent.node(nid, {
            category,
            ...(str(n["tech"]) !== undefined ? { tech: str(n["tech"]) } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(href !== undefined ? { href } : {}),
            ...(label !== undefined ? { label } : {}),
            // legacy annotation badge ("×3", "Primary") -> card sublabel
            ...(str(n["badge"]) !== undefined ? { sublabel: str(n["badge"]) } : {}),
          }),
        );
      }

      // ---- edges: legacy id -> Ref map built while emitting (flows need it)
      const edgeRefs = new Map<string, Ref>();
      for (const e of dicts(spec["edges"])) {
        const source = str(e["source"]);
        const target = str(e["target"]);
        if (source === undefined || target === undefined) {
          warnings.push(`edge "${str(e["id"]) ?? "?"}" is missing source/target — skipped`);
          continue;
        }
        const endpoint = (nid: string): RefOrPath => {
          const ref = nodeRefs.get(nid);
          if (!ref) warnings.push(`edge endpoint "${nid}" is not a known node id`);
          return ref ?? nid; // raw path falls through to validate()'s resolver
        };
        const kind = str(e["kind"]);
        const style = edgeStyle(kind, erd);
        const card = (v: unknown): Cardinality | undefined => {
          const s = str(v);
          if (s === undefined) return undefined;
          if ((CARDINALITIES as readonly string[]).includes(s)) return s as Cardinality;
          warnings.push(`edge "${str(e["id"]) ?? "?"}" has invalid cardinality "${s}" — dropped`);
          return undefined;
        };
        const sc = card(e["sourceCardinality"]);
        const tc = card(e["targetCardinality"]);
        const ref = d.edge(endpoint(source), endpoint(target), {
          ...(str(e["label"]) !== undefined ? { label: str(e["label"]) } : {}),
          ...(kind !== undefined ? { layer: kind } : {}),
          ...(style !== undefined ? { style } : {}),
          ...(str(e["sourceColumn"]) !== undefined ? { sourceColumn: str(e["sourceColumn"]) } : {}),
          ...(str(e["targetColumn"]) !== undefined ? { targetColumn: str(e["targetColumn"]) } : {}),
          ...(sc !== undefined ? { sourceCardinality: sc } : {}),
          ...(tc !== undefined ? { targetCardinality: tc } : {}),
        });
        const eid = str(e["id"]);
        if (eid !== undefined) edgeRefs.set(eid, ref);
      }

      // ---- flows: steps reference legacy edge ids -> emitted-edge Refs
      for (const f of dicts(spec["flows"])) {
        const fid = str(f["id"]);
        if (fid === undefined) {
          warnings.push("flow without an id skipped");
          continue;
        }
        const steps = dicts(f["steps"]).map((s, i) => {
          const legacyEdge = str(s["edge"]) ?? "";
          const ref = edgeRefs.get(legacyEdge);
          if (!ref) {
            warnings.push(`flow "${fid}" step ${i + 1} references unknown edge "${legacyEdge}"`);
          }
          return { edge: ref ?? legacyEdge, text: str(s["text"]) ?? "" };
        });
        d.flow(fid, {
          // legacy flows title with "label"
          title: str(f["title"]) ?? str(f["label"]) ?? fid,
          ...(str(f["description"]) !== undefined ? { description: str(f["description"]) } : {}),
          steps,
        });
      }
    },
  );

  const section = str(spec["section"]);
  const order = num(spec["order"]);
  return {
    model,
    warnings,
    notes,
    ...(section !== undefined ? { section } : {}),
    ...(order !== undefined ? { order } : {}),
  };
}
