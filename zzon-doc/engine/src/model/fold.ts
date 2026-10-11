/**
 * Zoom levels — the overview ("큰 그림") of a detailed diagram, derived from the
 * SAME model so both sheets share names, icons and colors.
 *
 * foldModel walks the selection-rubric's reduction ladder (§3.3) in its fixed
 * order and stops as soon as the sheet fits the overview budget (≤ 9 nodes):
 *   1. merge duplicates   — siblings with the same icon/card become one node
 *   2. drop cross-cutting — monitoring, secrets and IAM (only those: the rubric's step 2)
 *   3. fold leaf clusters — a group whose children are all nodes becomes one
 *                           node (one level). Wrapper groups stay frames.
 *   4. absorb leaves      — a node with a single connection goes into its neighbor
 *   5. zones as nodes     — still too big: fold one level up (region, account, OU)
 * Edges follow their endpoints, internal edges disappear, parallel edges merge.
 * Every reduced node drills down to the detailed sheet (`href`), and the
 * returned ledger lists what each step did (the rubric's fidelity ledger).
 *
 * zoomPlan decides whether the subject needs one sheet or two
 * (selection-rubric §3.4) from counts measured on the model, not from taste.
 */
import type { DiagramModel, Edge, Element, FlowDef, FlowStep, GroupEl, NodeEl } from "./types.ts";
import { validate } from "./validate.ts";
import { resolveIcon, type IconRef } from "../icons/aliases.ts";
import { GROUP_STYLES } from "../render/group-styles.ts";

/** overview budget — the T1 tier's node limit (quality/metrics TIER_BUDGETS.overview) */
export const OVERVIEW_MAX = 9;
/** detail sheets above this need an overview (the T2 tier's node limit) */
export const STANDARD_MAX = 20;

export type FoldStep = "merge" | "drop" | "fold" | "absorb";

export interface FoldEntry {
  step: FoldStep;
  /** the node that stands for the reduced elements (absent for "drop") */
  into?: string;
  /** reader-facing labels of the elements this entry reduced */
  members: string[];
}

export interface FoldResult {
  model: DiagramModel;
  ledger: FoldEntry[];
  /** node count of the detailed sheet (actors included) */
  detailNodes: number;
  /** node count of the overview */
  overviewNodes: number;
  /** overview nodes left without any line (structure the detail did not connect) */
  orphans: string[];
}

const isGroup = (e: Element): e is GroupEl => e.type === "group";
const isNode = (e: Element): e is NodeEl => e.type === "node";
const lbl = (n: { label?: string; id: string }) => n.label ?? n.id;

/** monitoring, secrets and identity: the rubric's cross-cutting concerns */
const CROSS_CUTTING_ICON =
  /^(cloudwatch|cloudtrail|config|x-ray|systems-manager|secrets-manager|key-management-service|identity-and-access-management|identity-access-management|iam-identity-center|res\.credentials|azure\.(monitor|application-insights|log-analytics-workspaces|key-vaults|managed-identities))/;
const CROSS_CUTTING_CATEGORY = new Set(["monitor", "secret"]);

function countNodes(els: Element[]): number {
  let n = 0;
  for (const e of els) n += isGroup(e) ? countNodes(e.children) : 1;
  return n;
}

function allNodes(els: Element[], out: NodeEl[] = []): NodeEl[] {
  for (const e of els) {
    if (isGroup(e)) allNodes(e.children, out);
    else out.push(e);
  }
  return out;
}

interface Work {
  children: Element[];
  bands: DiagramModel["bands"];
}

/** node path → the node that now stands for it; null = left out of the overview */
type Absorbed = Map<string, string | null>;

function resolvePath(p: string, absorbed: Absorbed): string | null {
  let cur = p;
  for (let hops = 0; hops < 64 && absorbed.has(cur); hops++) {
    const next = absorbed.get(cur)!;
    if (next === null) return null;
    cur = next;
  }
  return cur;
}

function foldEdges(edges: Edge[], absorbed: Absorbed): { edges: Edge[]; remap: Map<string, string> } {
  const out: Edge[] = [];
  const byPair = new Map<string, Edge>();
  const remap = new Map<string, string>();
  for (const e of edges) {
    const from = resolvePath(e.from, absorbed);
    const to = resolvePath(e.to, absorbed);
    if (!from || !to || from === to) continue;
    const key = `${from}\u0000${to}`;
    const kept = byPair.get(key);
    if (kept) {
      if (kept.label !== e.label) kept.label = undefined; // different words on one line: keep the line only
      remap.set(e.id, kept.id);
      continue;
    }
    const moved = from !== e.from || to !== e.to;
    const copy: Edge = { ...e, from, to, ...(moved ? { sourceColumn: undefined, targetColumn: undefined, hints: undefined } : {}) };
    byPair.set(key, copy);
    remap.set(e.id, copy.id);
    out.push(copy);
  }
  return { edges: out, remap };
}

function foldFlows(flows: FlowDef[], remap: Map<string, string>): FlowDef[] {
  const out: FlowDef[] = [];
  for (const f of flows) {
    const steps: FlowStep[] = [];
    for (const s of f.steps) {
      const id = remap.get(s.edge);
      if (!id || (steps.length && steps[steps.length - 1]!.edge === id)) continue;
      steps.push({ ...s, edge: id });
    }
    if (steps.length) out.push({ ...f, steps });
  }
  return out;
}

/**
 * How a folded group looks in the big picture. A cluster of one kind keeps that
 * kind's icon (Lambda ×3). A mixed cluster is shown as what it is: an account,
 * an OU, a VPC or a subnet, with the official icon for that container.
 */
function clusterVisual(g: GroupEl, members: NodeEl[]): Pick<NodeEl, "icon" | "category"> | undefined {
  // containers first: an account or OU is shown as that, whatever it holds
  const label = g.label ?? "";
  if (g.kind === "account") {
    return { icon: (/management|관리/i.test(label) ? "organizations.management-account" : "organizations.account") as IconRef };
  }
  if (/\bOU\b|organizational unit|조직 단위/i.test(label)) return { icon: "organizations.organizational-unit" as IconRef };
  const icons = new Set(members.map((m) => (m.icon ? String(resolveIcon(m.icon as IconRef)) : "")));
  if (members.length && icons.size === 1 && !icons.has("")) return { icon: members[0]!.icon };
  const badge = GROUP_STYLES[g.kind]?.badge;
  if (badge) return { icon: badge };
  return members.find((m) => m.icon) ?? members.find((m) => m.category);
}

/**
 * Column structure for the big picture: inside every container whose children
 * carry no author hints, a child's column is its longest path from a source
 * along the lines between siblings. Children with no line go under the first
 * column. A small sheet with explicit columns reads left to right instead of
 * being packed.
 */
function layerHints(els: Element[], edges: Edge[]): void {
  for (const e of els) if (isGroup(e)) layerHints(e.children, edges);
  if (els.length < 2 || els.some((e) => e.hints?.layer !== undefined || e.hints?.order !== undefined)) return;
  const owner = (p: string) => els.find((e) => p === e.path || p.startsWith(e.path + "/"));
  const succ = new Map<Element, Set<Element>>();
  const indeg = new Map<Element, number>(els.map((e) => [e, 0]));
  const linked = new Set<Element>();
  for (const ed of edges) {
    const a = owner(ed.from);
    const b = owner(ed.to);
    if (!a || !b || a === b) continue;
    linked.add(a);
    linked.add(b);
    const s = succ.get(a) ?? new Set<Element>();
    if (!s.has(b)) {
      s.add(b);
      succ.set(a, s);
      indeg.set(b, (indeg.get(b) ?? 0) + 1);
    }
  }
  const layer = new Map<Element, number>();
  const queue = els.filter((e) => linked.has(e) && indeg.get(e) === 0);
  for (const e of queue) layer.set(e, 0);
  while (queue.length) {
    const e = queue.shift()!;
    for (const n of succ.get(e) ?? []) {
      layer.set(n, Math.max(layer.get(n) ?? 0, layer.get(e)! + 1));
      indeg.set(n, indeg.get(n)! - 1);
      if (indeg.get(n) === 0) queue.push(n);
    }
  }
  const order = new Map<number, number>();
  for (const e of els) {
    // in a cycle or unlinked: first column (unlinked ones sink below the rest)
    const l = layer.get(e) ?? 0;
    const o = order.get(l) ?? 0;
    order.set(l, o + 1);
    e.hints = { ...(e.hints ?? {}), layer: l, order: linked.has(e) ? o : 100 + o };
  }
}

/**
 * The overview of `model`. `href` is the detailed sheet's slug (drilldown).
 * The input is validated first so every reference is an absolute path.
 */
export function foldModel(model: DiagramModel, opts: { href?: string } = {}): FoldResult {
  const v = validate(model);
  if (!v.ok) throw new Error(`fold: diagram "${model.id}" failed validation`);
  const href = opts.href;
  const work: Work = structuredClone({ children: model.children, bands: model.bands });
  const absorbed: Absorbed = new Map();
  const ledger: FoldEntry[] = [];
  const count = () => countNodes(work.children) + model.actors.length + work.bands.reduce((s, b) => s + countNodes(b.children), 0);
  const detailNodes = count();
  const fits = () => count() <= OVERVIEW_MAX;
  const eachList = (fn: (els: Element[]) => Element[]) => {
    work.children = fn(work.children);
    work.bands = work.bands.map((b) => ({ ...b, children: fn(b.children) }));
  };
  const emptyFromStart = new Set<string>();
  const markEmpty = (els: Element[]) => els.forEach((e) => { if (isGroup(e)) { if (!e.children.length) emptyFromStart.add(e.path); markEmpty(e.children); } });
  markEmpty(work.children);
  work.bands.forEach((b) => markEmpty(b.children));
  const prune = (els: Element[]): Element[] =>
    els
      .map((e) => (isGroup(e) ? { ...e, children: prune(e.children) } : e))
      .filter((e) => {
        if (!isGroup(e)) return !absorbed.has(e.path);
        if (e.children.length || emptyFromStart.has(e.path)) return true;
        absorbed.set(e.path, null); // everything inside was left out
        return false;
      });

  // 0. same name, same thing: a node labelled like a group elsewhere (the "Workloads OU"
  //    icon inside the management account) points at that group, so the lines drawn
  //    to the icon survive when the account folds
  {
    const groupByLabel = new Map<string, GroupEl>();
    const collect = (els: Element[]) => els.forEach((e) => { if (isGroup(e)) { if (e.label) groupByLabel.set(e.label.trim(), e); collect(e.children); } });
    collect(work.children);
    work.bands.forEach((b) => collect(b.children));
    const aliases: string[] = [];
    for (const n of [...allNodes(work.children), ...work.bands.flatMap((b) => allNodes(b.children))]) {
      const g = n.label ? groupByLabel.get(n.label.trim()) : undefined;
      if (!g || n.path.startsWith(g.path + "/")) continue;
      absorbed.set(n.path, g.path);
      aliases.push(lbl(n));
    }
    if (aliases.length) {
      eachList(prune);
      ledger.push({ step: "merge", members: aliases });
    }
  }

  // 1. merge duplicates: same icon (or same card + tech) under one parent
  if (!fits()) {
    const dupKey = (n: NodeEl): string | undefined =>
      n.table || n.shape ? undefined : n.icon ? `i:${resolveIcon(n.icon as IconRef)}` : n.category ? `c:${n.category}|${n.tech ?? ""}` : undefined;
    const merge = (els: Element[]): Element[] => {
      const groups = new Map<string, NodeEl[]>();
      for (const e of els) {
        if (!isNode(e)) continue;
        const k = dupKey(e);
        if (k) (groups.get(k) ?? groups.set(k, []).get(k)!).push(e);
      }
      return els.map((e) => {
        if (isGroup(e)) return { ...e, children: merge(e.children) };
        const k = dupKey(e);
        const same = k ? groups.get(k)! : [e];
        if (same.length < 2) return e;
        if (same[0] !== e) {
          absorbed.set(e.path, same[0]!.path);
          return e;
        }
        ledger.push({ step: "merge", into: e.path, members: same.map(lbl) });
        return {
          ...e,
          label: `${lbl(e)} 외 ${same.length - 1}개`,
          description: `${same.map(lbl).join(", ")}를 하나로 묶었다. 더블클릭하면 세부 그림으로 넘어간다.`,
          ...(href ? { href } : {}),
        };
      });
    };
    eachList(merge);
    eachList(prune);
  }

  // 2. drop cross-cutting concerns (monitoring, secrets, identity)
  if (!fits()) {
    const dropped: string[] = [];
    const drop = (els: Element[]): Element[] =>
      els.map((e) => {
        if (isGroup(e)) return { ...e, children: drop(e.children) };
        const icon = e.icon ? String(resolveIcon(e.icon as IconRef)) : "";
        const cross = CROSS_CUTTING_ICON.test(icon) || (e.category ? CROSS_CUTTING_CATEGORY.has(e.category) : false);
        if (cross) {
          absorbed.set(e.path, null);
          dropped.push(lbl(e));
        }
        return e;
      });
    eachList(drop);
    eachList(prune);
    if (dropped.length) ledger.push({ step: "drop", members: dropped });
  }

  // 3. fold leaf clusters — a group holding only nodes becomes one node
  // (one child is enough: an account with a single VPC folds too)
  const isLeafCluster = (g: GroupEl) => g.children.every(isNode) && g.rails.every((r) => r.items.length === 0);
  // a frame holding half the sheet or more (AWS Cloud, the only region) is the system itself:
  // folding it would leave nothing to look at, so it stays a frame
  const isWrapper = (g: GroupEl) => countNodes(g.children) * 2 >= count();
  const foldedPaths = new Set<string>();
  const foldOnce = (): number => {
    let folded = 0;
    const fold = (els: Element[]): Element[] =>
      els.map((e) => {
        if (!isGroup(e)) return e;
        if (!isLeafCluster(e) || isWrapper(e)) return { ...e, children: fold(e.children) };
        const members = e.children as NodeEl[];
        for (const m of members) absorbed.set(m.path, e.path);
        ledger.push({ step: "fold", into: e.path, members: members.map(lbl) });
        folded++;
        foldedPaths.add(e.path);
        const rep = clusterVisual(e, members);
        const node: NodeEl = {
          type: "node",
          id: e.id,
          path: e.path,
          ...(rep?.icon ? { icon: rep.icon } : { category: rep?.category ?? "service" }),
          label: e.label ?? e.id,
          sublabel: members.length === 0 ? undefined : members.length === 1 ? lbl(members[0]!) : `${members.length}개`,
          description: members.length
            ? `${members.map(lbl).join(", ")}${members.length === 1 ? "를 담고 있다" : "를 하나로 묶었다"}. 더블클릭하면 세부 그림으로 넘어간다.`
            : undefined,
          ...(href ? { href } : {}),
          meta: e.meta,
          hints: e.hints,
          site: e.site,
        };
        return node;
      });
    eachList(fold);
    return folded;
  };

  // 4. absorb leaves — a node with one connection goes into its neighbor,
  //    a node with none is left out (actors stay: they are the entry points)
  const absorbLeaves = () => {
    const actors = new Set(model.actors.map((x) => x.path));
    const loose: string[] = [];
    for (let changed = true; changed && !fits(); ) {
      changed = false;
      const nodes = [...allNodes(work.children), ...work.bands.flatMap((x) => allNodes(x.children))].sort((x, y) => x.path.localeCompare(y.path));
      for (const n of nodes) {
        if (fits()) break;
        // actors are the entry points; folded accounts, OUs and clusters are the structure itself
        if (actors.has(n.path) || foldedPaths.has(n.path)) continue;
        const edges = foldEdges(model.edges, absorbed).edges.filter((e) => e.from === n.path || e.to === n.path);
        if (edges.length === 0) {
          absorbed.set(n.path, null);
          loose.push(lbl(n));
        } else if (edges.length === 1) {
          const other = edges[0]!.from === n.path ? edges[0]!.to : edges[0]!.from;
          absorbed.set(n.path, other);
          ledger.push({ step: "absorb", into: other, members: [lbl(n)] });
        } else continue;
        eachList(prune);
        changed = true;
      }
    }
    if (loose.length) ledger.push({ step: "drop", members: loose });
  };

  if (!fits()) foldOnce();
  if (!fits()) absorbLeaves();
  // 5. still too big: zones (region, account, OU) become nodes — the rubric's
  //    "overview sheet with zones as nodes"
  while (!fits() && foldOnce() > 0) {
    /* one level up per pass */
  }

  const { edges, remap } = foldEdges(model.edges, absorbed);
  layerHints(work.children, edges);
  const gone = (p: string) => absorbed.has(p);
  const overview: DiagramModel = {
    ...model,
    ...work,
    id: `${model.id}-overview`,
    title: model.title ? `${model.title} (큰 그림)` : undefined,
    // a big picture that could not reach 9 is still checked, as a standard sheet
    tier: count() <= OVERVIEW_MAX ? "overview" : "standard",
    edges,
    flows: foldFlows(model.flows, remap),
    // overlays and step markers point at elements that no longer exist on their own
    overlays: model.overlays.filter((o) => !o.members.some(gone)),
    markers: model.markers.filter((m) => !gone(m.at)),
  };
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
  const orphans = [...allNodes(overview.children), ...overview.bands.flatMap((b) => allNodes(b.children))].filter((n) => !linked.has(n.path)).map(lbl);
  return { model: overview, ledger, detailNodes, overviewNodes: count(), orphans };
}

/** "합침 2 · 뺌 3 · 접음 4 · 흡수 1" for reports */
export function ledgerSummary(ledger: FoldEntry[]): string {
  const ko: Record<FoldStep, string> = { merge: "합침", drop: "뺌", fold: "접음", absorb: "흡수" };
  const parts = (["merge", "drop", "fold", "absorb"] as FoldStep[])
    .map((s) => [s, ledger.filter((l) => l.step === s).reduce((n, l) => n + l.members.length, 0)] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${ko[s]} ${n}`);
  return parts.join(" · ") || "줄인 것 없음";
}

// ------------------------------------------------------------- zoom decision

export type ZoomDecision = "single" | "overview-optional" | "overview-required";

export interface ZoomPlan {
  decision: ZoomDecision;
  detailNodes: number;
  overviewNodes: number;
  /** one Korean sentence for the check report */
  reason: string;
}

/**
 * selection-rubric §3.4 — does this subject need a big-picture sheet next to
 * the detailed one? Measured on the model:
 *   - ≤ 9 nodes: one sheet is already an overview.
 *   - the ladder neither reaches 9 nor halves the sheet: the model has no
 *     structure to zoom out of — regroup it (more than 20 nodes) or keep one sheet.
 *   - 10–20 nodes: overview optional — add it for a full document set, a mixed
 *     audience, or a README/slide that allows ≤ 9 only.
 *   - more than 20 nodes: overview required, and the detail links from it.
 */
export function zoomPlan(model: DiagramModel): ZoomPlan {
  const r = foldModel(structuredClone(model));
  const n = r.detailNodes;
  const o = r.overviewNodes;
  const how = ledgerSummary(r.ledger);
  if (n <= OVERVIEW_MAX) {
    return { decision: "single", detailNodes: n, overviewNodes: o, reason: `노드 ${n}개라 이 한 장이 곧 큰 그림이다.` };
  }
  // the big picture is worth a sheet when it fits the overview tier or at least halves the detail
  const small = o <= OVERVIEW_MAX || o * 2 <= n;
  // more than a quarter of the big picture floating without lines reads as a list, not a picture
  const loose = r.orphans.length * 4 > o;
  if (small && loose && n > OVERVIEW_MAX) {
    return {
      decision: n > STANDARD_MAX ? "overview-required" : "single",
      detailNodes: n,
      overviewNodes: o,
      reason: `큰 그림(${o}개)에서 ${r.orphans.join(", ")}가 선 없이 남는다. 세부 그림에서 이들과의 관계를 묶음 사이 선으로 그려야 큰 그림이 성립한다.`,
    };
  }
  if (!small) {
    return n > STANDARD_MAX
      ? { decision: "overview-required", detailNodes: n, overviewNodes: o, reason: `노드 ${n}개인데 줄여도 ${o}개에 그친다(${how}). 그룹으로 묶어 큰 그림이 나오게 다시 구성하라.` }
      : { decision: "single", detailNodes: n, overviewNodes: o, reason: `노드 ${n}개, 줄여도 ${o}개라 큰 그림이 따로 의미가 없다. 한 장으로 충분하다.` };
  }
  if (n > STANDARD_MAX) {
    return { decision: "overview-required", detailNodes: n, overviewNodes: o, reason: `노드 ${n}개는 표준 한도 ${STANDARD_MAX}를 넘는다. 큰 그림(${o}개, ${how})을 함께 내고 세부로 잇는다.` };
  }
  return { decision: "overview-optional", detailNodes: n, overviewNodes: o, reason: `노드 ${n}개. 전체 문서 세트이거나 독자·매체가 섞이면 큰 그림(${o}개, ${how})을 함께 낸다.` };
}
