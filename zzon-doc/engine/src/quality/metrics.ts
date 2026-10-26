/**
 * Readability metrics + tier gate (skills/zzon-doc/references/selection-rubric.md §3–§4).
 *
 * The invariant suite (tests/invariants.ts) only rejects COLLISIONS. A scene
 * can pass it and still read badly: crossings, long detours, edges running
 * through edge labels, a rainbow legend. This module measures those on the
 * canonical Scene and judges them against the declared density tier.
 *
 * Severity policy: hard FAIL only for facts that are unambiguous (budget
 * overrun, label occlusion). Readability metrics WARN — their thresholds are
 * initial values from the literature (Purchase 1997 crossings, Ware 2002
 * continuity, Moody PoN ~6 colours, Burattin 2016 flow consistency) and are
 * calibrated on the sample corpus, not laws.
 */
import type { Scene, SceneLabel } from "../layout/scene.ts";
import type { DiagramModel, Tier } from "../model/types.ts";
import type { Point, Rect } from "../model/geometry.ts";
import { measureWidth } from "../text/metrics.ts";
import { CATEGORY_META } from "../render/categories.gen.ts";
import { checkSemantics } from "../model/semantics.ts";
import { collinearOverlap } from "../route/edge-labels.ts";

export type Severity = "pass" | "warn" | "fail";

export interface MetricResult {
  id: string;
  label: string;
  value: number | string;
  limit: string;
  severity: Severity;
  hint?: string;
}

export interface TierBudget {
  maxNodes: number;
  maxEdgesPerNode: number;
  maxEdgesAbs?: number;
  crossingsPerEdge: number;
  bendsPerEdge: number;
  legendColors: number;
  flowConsistency: number;
}

/** selection-rubric §3.1 / §4 — keep in sync with the rubric document */
export const TIER_BUDGETS: Record<Tier, TierBudget> = {
  overview: { maxNodes: 9, maxEdgesPerNode: 1.5, maxEdgesAbs: 12, crossingsPerEdge: 0, bendsPerEdge: 2, legendColors: 6, flowConsistency: 0.8 },
  standard: { maxNodes: 20, maxEdgesPerNode: 1.5, crossingsPerEdge: 0.1, bendsPerEdge: 2.5, legendColors: 6, flowConsistency: 0.8 },
  reference: { maxNodes: 50, maxEdgesPerNode: 1.5, crossingsPerEdge: 0.25, bendsPerEdge: 3, legendColors: 8, flowConsistency: 0.7 },
};

export const TIER_LABEL: Record<Tier, string> = { overview: "T1 개괄", standard: "T2 표준", reference: "T3 원장" };

/** tier from node count when the author did not declare one */
export function inferTier(nodeCount: number): Tier {
  return nodeCount <= TIER_BUDGETS.overview.maxNodes ? "overview" : nodeCount <= TIER_BUDGETS.standard.maxNodes ? "standard" : "reference";
}

// ------------------------------------------------------------- geometry

type Seg = [Point, Point];

function segments(points: readonly Point[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < points.length - 1; i++) out.push([points[i]!, points[i + 1]!]);
  return out;
}

const EPS = 1;

/** proper crossing of an orthogonal H and V segment (shared endpoints excluded) */
function crosses(a: Seg, b: Seg): boolean {
  const aH = Math.abs(a[0].y - a[1].y) < 0.5;
  const bH = Math.abs(b[0].y - b[1].y) < 0.5;
  if (aH === bH) return false; // parallel/collinear: overlap, not a crossing
  const [h, v] = aH ? [a, b] : [b, a];
  const hy = h[0].y;
  const hx1 = Math.min(h[0].x, h[1].x);
  const hx2 = Math.max(h[0].x, h[1].x);
  const vx = v[0].x;
  const vy1 = Math.min(v[0].y, v[1].y);
  const vy2 = Math.max(v[0].y, v[1].y);
  return vx > hx1 + EPS && vx < hx2 - EPS && hy > vy1 + EPS && hy < vy2 - EPS;
}

function segHitsRect(s: Seg, r: Rect, pad = 0): boolean {
  const x1 = Math.min(s[0].x, s[1].x);
  const x2 = Math.max(s[0].x, s[1].x);
  const y1 = Math.min(s[0].y, s[1].y);
  const y2 = Math.max(s[0].y, s[1].y);
  return x2 > r.x - pad && x1 < r.x + r.width + pad && y2 > r.y - pad && y1 < r.y + r.height + pad;
}

function labelBox(label: SceneLabel): Rect {
  const lines = label.lines ?? [label.text];
  const width = Math.max(...lines.map((l) => measureWidth(l, label.fontSize, label.weight)));
  const height = lines.length * label.fontSize * 1.3;
  const x = label.align === "start" ? label.x : label.align === "end" ? label.x - width : label.x - width / 2;
  return { x, y: label.y - label.fontSize * 0.9, width, height };
}

// ------------------------------------------------------------- measurement

export interface SceneMeasure {
  nodes: number;
  edges: number;
  crossings: number;
  crossingsPerEdge: number;
  bendsPerEdge: number;
  /** edge labels with a FOREIGN edge segment running through their box */
  occludedLabels: string[];
  /** pairs of unrelated lines running side by side closer than CROWD_GAP — they read as one line */
  crowded: string[];
  legendColors: number;
  flowConsistency: number | null;
  orphanNodes: string[];
  canvasDescriptions: number;
  aspect: number;
}

/** two unrelated lines closer than this, side by side, read as one line */
export const CROWD_GAP = 6;
/** …over at least this much shared length (a brief touch at a corner is not crowding) */
const CROWD_MIN_SHARED = 16;

function crowdedPair(a: Seg, b: Seg): boolean {
  const aH = Math.abs(a[0].y - a[1].y) < 0.5;
  const bH = Math.abs(b[0].y - b[1].y) < 0.5;
  const aV = Math.abs(a[0].x - a[1].x) < 0.5;
  const bV = Math.abs(b[0].x - b[1].x) < 0.5;
  if (aH && bH) {
    if (Math.abs(a[0].y - b[0].y) >= CROWD_GAP) return false;
    const lo = Math.max(Math.min(a[0].x, a[1].x), Math.min(b[0].x, b[1].x));
    const hi = Math.min(Math.max(a[0].x, a[1].x), Math.max(b[0].x, b[1].x));
    return hi - lo >= CROWD_MIN_SHARED;
  }
  if (aV && bV) {
    if (Math.abs(a[0].x - b[0].x) >= CROWD_GAP) return false;
    const lo = Math.max(Math.min(a[0].y, a[1].y), Math.min(b[0].y, b[1].y));
    const hi = Math.min(Math.max(a[0].y, a[1].y), Math.max(b[0].y, b[1].y));
    return hi - lo >= CROWD_MIN_SHARED;
  }
  return false;
}

export function measureScene(scene: Scene): SceneMeasure {
  const edges = scene.edges.filter((e) => e.points.length >= 2);
  let crossings = 0;
  let bends = 0;
  for (let i = 0; i < edges.length; i++) {
    const a = edges[i]!;
    bends += a.points.length - 2;
    for (let j = i + 1; j < edges.length; j++) {
      const b = edges[j]!;
      // fan bundles legitimately share trunks/junctions
      if (a.from === b.from || a.to === b.to || a.from === b.to || a.to === b.from) continue;
      for (const sa of segments(a.points)) for (const sb of segments(b.points)) if (crosses(sa, sb)) crossings++;
    }
  }

  // lines of different edges glued together (fans that share an endpoint may share a trunk)
  const crowded: string[] = [];
  for (let i = 0; i < edges.length; i++) {
    const a = edges[i]!;
    for (let j = i + 1; j < edges.length; j++) {
      const b = edges[j]!;
      if (a.from === b.from || a.to === b.to || a.from === b.to || a.to === b.from) continue;
      if (segments(a.points).some((sa) => segments(b.points).some((sb) => crowdedPair(sa, sb)))) crowded.push(`${a.id}·${b.id}`);
    }
  }

  const occludedLabels: string[] = [];
  for (const e of edges) {
    if (!e.label) continue;
    const box = labelBox(e.label);
    const own = segments(e.points);
    // any line through the label counts — its own edge's other runs included —
    // except runs it shares with its own edge (fan trunks)
    const hit = edges.some((o) =>
      segments(o.points).some(
        (s) => (o.id === e.id || !own.some((m) => collinearOverlap(m, s))) && segHitsRect(s, box, -1),
      ),
    );
    if (hit) occludedLabels.push(`${e.id}「${e.label.text}」`);
  }

  // legend colours: distinct HUES actually drawn — card categories share 9
  // colour groups (service/worker/backend are one hue). Icon vocabulary uses
  // official art, not hue coding, so it does not count.
  const legendColors = new Set(
    scene.nodes
      .filter((n) => n.category)
      .map((n) => (CATEGORY_META as Record<string, { colorGroup: string }>)[n.category!]?.colorGroup ?? n.category),
  ).size;

  // flow consistency: share of edges whose net vector points along the dominant axis direction
  let flowConsistency: number | null = null;
  if (edges.length) {
    let right = 0;
    let down = 0;
    for (const e of edges) {
      const a = e.points[0]!;
      const b = e.points[e.points.length - 1]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx > 0) right++;
      } else if (dy > 0) down++;
    }
    flowConsistency = Math.max(right, down) / edges.length;
  }

  const touched = new Set(edges.flatMap((e) => [e.from, e.to]));
  const orphanNodes = scene.nodes
    .filter((n) => n.role !== "rail-item" && !touched.has(n.path) && ![...touched].some((t) => t.startsWith(n.path + "/")))
    .map((n) => n.path);

  return {
    nodes: scene.nodes.length,
    edges: edges.length,
    crossings,
    crossingsPerEdge: edges.length ? crossings / edges.length : 0,
    bendsPerEdge: edges.length ? bends / edges.length : 0,
    occludedLabels,
    crowded,
    legendColors,
    flowConsistency,
    orphanNodes,
    canvasDescriptions: scene.nodes.filter((n) => n.descriptionOnCanvas).length,
    aspect: scene.height > 0 ? scene.width / scene.height : 0,
  };
}

// ------------------------------------------------------------- gate

export interface GateReport {
  tier: Tier;
  tierSource: "declared" | "flag" | "inferred";
  measure: SceneMeasure;
  results: MetricResult[];
  failed: boolean;
}

const f2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Decision records, ticket and question ids, section signs in text a reader sees
 * (title, labels, flow names, descriptions). Ids belong in the source document's
 * links, not on the canvas or in the sidebar.
 */
export const TRACKING_CODE = /\b(?:ADR|FL|OPS|TKT|JIRA)-\d+\b|\bq-\d{2,}\b|§\s?\d|\b[DB]-\d{3}\b/g;
const READER_KEYS = new Set(["title", "label", "sublabel", "name", "description", "text"]);

/** "A·B·C" chains (three or more items) inside description sentences */
export function dotChains(model: unknown): string[] {
  const found: string[] = [];
  const seen = new WeakSet<object>();
  const walk = (v: unknown, key?: string) => {
    if (typeof v === "string") {
      if (key === "description" || key === "text") for (const m of v.matchAll(/[^\s·,()"]+(?:·[^\s·,()"]+){2,}/g)) found.push(m[0]);
      return;
    }
    if (!v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(model);
  return found;
}

export function trackingCodes(model: unknown): string[] {
  const found: string[] = [];
  const seen = new WeakSet<object>();
  const walk = (v: unknown, key?: string) => {
    if (typeof v === "string") {
      if (key && READER_KEYS.has(key)) for (const m of v.matchAll(TRACKING_CODE)) found.push(m[0]);
      return;
    }
    if (!v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(model);
  return found;
}

export function gateScene(
  scene: Scene,
  model: DiagramModel,
  opts: { tier?: Tier } = {},
): GateReport {
  const m = measureScene(scene);
  const semantic = checkSemantics(model);
  const tier = opts.tier ?? model.tier ?? inferTier(m.nodes);
  const tierSource: GateReport["tierSource"] = opts.tier ? "flag" : model.tier ? "declared" : "inferred";
  const b = TIER_BUDGETS[tier];
  const results: MetricResult[] = [];
  const push = (r: MetricResult) => results.push(r);

  push({
    id: "nodes",
    label: "노드 수",
    value: m.nodes,
    limit: `≤ ${b.maxNodes}`,
    severity: m.nodes > b.maxNodes ? "fail" : "pass",
    hint: m.nodes > b.maxNodes ? "축소 사다리(selection-rubric §3.3)를 순서대로 적용하거나 등급을 올리거나 분할하라" : undefined,
  });
  const edgeMax = Math.min(b.maxEdgesAbs ?? Infinity, Math.ceil(b.maxEdgesPerNode * Math.max(m.nodes, 1)));
  push({
    id: "edges",
    label: "엣지 수",
    value: m.edges,
    limit: `≤ ${edgeMax}`,
    severity: m.edges > edgeMax ? "fail" : "pass",
    hint: m.edges > edgeMax ? "같은 의미의 엣지를 묶거나(허브 노드) 관점별로 장을 나눠라" : undefined,
  });
  push({
    id: "label-occlusion",
    label: "라벨 가림",
    value: m.occludedLabels.length,
    limit: "0",
    severity: m.occludedLabels.length ? "fail" : "pass",
    hint: m.occludedLabels.length ? `다른 엣지가 라벨을 관통: ${m.occludedLabels.slice(0, 4).join(", ")} — 라벨 축약·생략 또는 진입면(hints) 조정` : undefined,
  });
  push({
    id: "crowding",
    label: "선 겹침",
    value: m.crowded.length,
    limit: "0",
    severity: m.crowded.length ? "warn" : "pass",
    hint: m.crowded.length
      ? `서로 다른 선이 ${CROWD_GAP}px 안으로 나란히 붙는다: ${m.crowded.slice(0, 4).join(", ")} — 엔진이 간격을 넓혀 다시 배치했는데도 남았다. 열 구조(hints.layer)를 나누거나 선을 묶어라(hints.bundle)`
      : undefined,
  });
  push({
    id: "crossings",
    label: "엣지당 교차",
    value: f2(m.crossingsPerEdge),
    limit: `≤ ${b.crossingsPerEdge}`,
    severity: m.crossingsPerEdge > b.crossingsPerEdge + 1e-9 ? "warn" : "pass",
    hint: m.crossingsPerEdge > b.crossingsPerEdge ? "레이어·순서 힌트(hints.layer/order)로 열 구조를 지정하거나 진입면을 고정하라" : undefined,
  });
  push({
    id: "bends",
    label: "엣지당 꺾임",
    value: f2(m.bendsPerEdge),
    limit: `≤ ${b.bendsPerEdge}`,
    severity: m.bendsPerEdge > b.bendsPerEdge + 1e-9 ? "warn" : "pass",
  });
  push({
    id: "legend-colors",
    label: "색 그룹 수",
    value: m.legendColors,
    limit: `≤ ${b.legendColors}`,
    severity: m.legendColors > b.legendColors ? "warn" : "pass",
    hint: m.legendColors > b.legendColors ? "색으로 구분하는 역할이 너무 많다 — 보조 역할(모니터링·시크릿·CI 등)을 보조 띠로 모으거나 생략하라(축소 사다리 2단계)" : undefined,
  });
  if (model.docKind === "data-flow" && m.flowConsistency !== null) {
    push({
      id: "flow-consistency",
      label: "흐름 방향 일관성",
      value: f2(m.flowConsistency),
      limit: `≥ ${b.flowConsistency}`,
      severity: m.flowConsistency < b.flowConsistency ? "warn" : "pass",
      hint: m.flowConsistency < b.flowConsistency ? "direction을 선언하고 단계별 layer 힌트를 주어라" : undefined,
    });
  }
  if (m.canvasDescriptions > 0 && tier !== "overview") {
    push({
      id: "canvas-text",
      label: "캔버스 설명 문장",
      value: m.canvasDescriptions,
      limit: "개괄(컨텍스트)만",
      severity: "warn",
      hint: "nodeDescriptions는 C4 컨텍스트(T1) 관례다 — 설명은 사이드바로",
    });
  }
  // 개괄 규모는 화면 맞춤으로 충분 — 넓어도 읽힌다. 큰 그림에서만 극단 형상을 경고한다
  if (m.nodes > TIER_BUDGETS.overview.maxNodes && (m.aspect > 4 || (m.aspect > 0 && m.aspect < 0.25))) {
    push({
      id: "aspect",
      label: "종횡비",
      value: f2(m.aspect),
      limit: "0.25–4",
      severity: "warn",
      hint: "매체(위키 임베드 등)에 맞추려면 direction 전환·분할을 검토하라",
    });
  }
  if (m.orphanNodes.length) {
    push({
      id: "orphans",
      label: "엣지 없는 노드",
      value: m.orphanNodes.length,
      limit: "의도된 주석 노드만",
      severity: "warn",
      hint: `확인: ${m.orphanNodes.slice(0, 4).join(", ")}`,
    });
  }
  // meaning before looks: a wrong state machine / flowchart fails regardless of layout
  const semErr = semantic.filter((i) => i.severity === "error");
  const semWarn = semantic.filter((i) => i.severity === "warning");
  if (semErr.length || semWarn.length) {
    push({
      id: "semantics",
      label: "표기 의미 검사",
      value: semErr.length ? `오류 ${semErr.length}` : `경고 ${semWarn.length}`,
      limit: "0",
      severity: semErr.length ? "fail" : "warn",
      hint: [...semErr, ...semWarn].slice(0, 3).map((i) => i.message).join(" / "),
    });
  }
  // reader-facing text carries no tracking codes (writing-style.md 규칙 7)
  const codes = trackingCodes(model);
  if (codes.length) {
    push({
      id: "tracking-codes",
      label: "추적 코드",
      value: codes.length,
      limit: "0",
      severity: "warn",
      hint: `제목·라벨·설명에서 결정 번호·티켓 코드를 빼고 내용을 써라: ${codes.slice(0, 4).map((c) => `「${c}」`).join(", ")}`,
    });
  }
  // "구매·갱신·해지·환불" — three or more words chained by middle dots read as a symbol list
  const chains = dotChains(model);
  if (chains.length) {
    push({
      id: "dot-chains",
      label: "가운뎃점 나열",
      value: chains.length,
      limit: "0",
      severity: "warn",
      hint: `설명 문장에서 셋 이상을 ·로 잇지 말고 쉼표나 "와/과"로 써라: ${chains.slice(0, 3).map((c) => `「${c}」`).join(", ")}`,
    });
  }
  if (tier === "reference" && model.flows.length === 0) {
    push({
      id: "reference-flows",
      label: "원장 대표 플로우",
      value: 0,
      limit: "≥ 1",
      severity: "warn",
      hint: "T3 원장은 경로를 flow로 강조해야 읽힌다 (selection-rubric §3.1)",
    });
  }
  return { tier, tierSource, measure: m, results, failed: results.some((r) => r.severity === "fail") };
}

export function formatGate(report: GateReport): string {
  const icon: Record<Severity, string> = { pass: "✓", warn: "!", fail: "✗" };
  const src = { declared: "선언", flag: "플래그", inferred: "노드 수로 추정" }[report.tierSource];
  const lines = [`등급: ${TIER_LABEL[report.tier]} (${src})`];
  for (const r of report.results) {
    lines.push(`  ${icon[r.severity]} ${r.label.padEnd(12)} ${String(r.value).padStart(6)}  (${r.limit})${r.hint ? `  — ${r.hint}` : ""}`);
  }
  lines.push(report.failed ? "게이트: 실패 — ✗ 항목을 고쳐라" : "게이트: 통과" + (report.results.some((r) => r.severity === "warn") ? " (경고 있음 — ! 항목을 검토하라)" : ""));
  return lines.join("\n");
}
