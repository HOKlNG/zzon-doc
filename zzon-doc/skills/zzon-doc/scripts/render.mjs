#!/usr/bin/env node
/**
 * render.mjs — DiagramSpec JSON → 단일 self-contained .html
 *
 * info-hub의 React 다이어그램 엔진을 바닐라 JS/CSS/SVG로 포팅해 한 파일에 인라인한다.
 * 출력 .html은 서버·React·CDN·외부 라이브러리 없이 브라우저에서 그대로 열린다.
 *
 * 사용법:  node render.mjs <spec.json> [-o out.html]
 *   기본 출력은 <spec이름>.html
 *
 * Node 20+ 내장 모듈만 사용 (외부 npm 의존 0).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve, dirname, join } from "node:path";

/* =========================================================================
 * 1. CLI 파싱
 * ========================================================================= */

function parseArgs(argv) {
  const args = argv.slice(2);
  let input = null;
  let output = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-o" || a === "--out") {
      output = args[++i];
    } else if (a === "-h" || a === "--help") {
      return { help: true };
    } else if (!input) {
      input = a;
    }
  }
  return { input, output };
}

function usage() {
  console.log(`zzon-doc render — DiagramSpec JSON을 단일 .html로 렌더링한다

사용법:
  node render.mjs <spec.json> [-o out.html]

옵션:
  -o, --out <파일>   출력 경로 (기본: <spec이름>.html)
  -h, --help         도움말

spec.json은 { "spec": {...} } 래퍼(info-hub 픽스처 형태)거나
DiagramSpec 본문 {...} 자체 둘 다 허용한다.`);
}

/* =========================================================================
 * 2. 스펙 검증 (가벼운 필수필드 + 참조 무결성)
 *    info-hub의 zod superRefine을 standalone 기준으로 축약 이식.
 * ========================================================================= */

const NODE_CATEGORIES = [
  "user", "frontend", "mobile", "backend", "service", "worker", "lambda",
  "db", "table", "cache", "queue", "storage", "cdn", "gateway", "auth",
  "scheduler", "external", "agent", "skill", "hook", "doc", "other",
  "lb", "dns", "firewall", "monitor", "secret", "ml", "analytics",
  "topic", "pipeline", "device",
];
const EDGE_KINDS = ["http", "event", "read", "write", "depends", "reference"];
const EDGE_CARDINALITIES = ["1", "0..1", "N", "0..N", "1..N"];
const GROUP_KINDS = [
  "layer", "vpc", "boundary", "zone", "subnet",
  "region", "az", "account", "security", "onprem", "stage", "cluster",
];
const DIAGRAM_KINDS = ["infra", "data-flow", "erd", "agent-topology"];

function validate(spec) {
  const errs = [];
  const E = (path, msg) => errs.push(`${path}: ${msg}`);

  if (typeof spec !== "object" || spec === null) {
    return ["spec: 객체가 아닙니다"];
  }
  if (!spec.title) E("title", "필수 항목이 비어 있습니다");
  if (!DIAGRAM_KINDS.includes(spec.kind)) {
    E("kind", `유효하지 않은 kind '${spec.kind}'. 허용: ${DIAGRAM_KINDS.join(", ")}`);
  }
  if (!Array.isArray(spec.nodes) || spec.nodes.length === 0) {
    E("nodes", "노드가 최소 1개 필요합니다");
    return errs; // 노드 없으면 이후 검증 의미 없음
  }

  spec.groups ??= [];
  spec.edges ??= [];
  spec.flows ??= [];
  spec.layout ??= { direction: "RIGHT" };
  if (spec.layout.direction !== "RIGHT" && spec.layout.direction !== "DOWN") {
    spec.layout.direction = "RIGHT";
  }
  if (spec.layout.align !== "start" && spec.layout.align !== "center") {
    spec.layout.align = "center";
  }
  spec.layout.nodeDescriptions = spec.layout.nodeDescriptions === true;

  const groupIds = new Set();
  const nodeIds = new Set();
  const edgeIds = new Set();

  spec.groups.forEach((g, i) => {
    if (!g.id) E(`groups[${i}].id`, "id가 비어 있습니다");
    else if (groupIds.has(g.id)) E(`groups[${i}].id`, `그룹 id '${g.id}'가 중복됩니다`);
    groupIds.add(g.id);
    if (g.kind && !GROUP_KINDS.includes(g.kind)) {
      E(`groups[${i}].kind`, `유효하지 않은 group kind '${g.kind}'. 허용: ${GROUP_KINDS.join(", ")}`);
    }
  });

  spec.nodes.forEach((n, i) => {
    if (!n.id) E(`nodes[${i}].id`, "id가 비어 있습니다");
    else if (nodeIds.has(n.id) || groupIds.has(n.id)) {
      E(`nodes[${i}].id`, `id '${n.id}'가 다른 노드 또는 그룹과 중복됩니다`);
    }
    nodeIds.add(n.id);
    if (!NODE_CATEGORIES.includes(n.category)) {
      E(`nodes[${i}].category`, `유효하지 않은 category '${n.category}'. 허용: ${NODE_CATEGORIES.join(", ")}`);
    }
    if (n.parentId !== undefined && !groupIds.has(n.parentId)) {
      E(`nodes[${i}].parentId`, `'${n.parentId}'에 해당하는 그룹이 없습니다. 사용 가능: ${[...groupIds].join(", ") || "(없음)"}`);
    }
    if (spec.kind === "erd" && !n.table) {
      E(`nodes[${i}].table`, `ERD 다이어그램의 노드 '${n.id}'에 table.columns가 없습니다`);
    }
  });

  spec.groups.forEach((g, i) => {
    if (g.parentId !== undefined && !groupIds.has(g.parentId)) {
      E(`groups[${i}].parentId`, `'${g.parentId}'에 해당하는 그룹이 없습니다`);
    }
  });

  spec.edges.forEach((e, i) => {
    if (!e.id) E(`edges[${i}].id`, "id가 비어 있습니다");
    else if (edgeIds.has(e.id)) E(`edges[${i}].id`, `엣지 id '${e.id}'가 중복됩니다`);
    edgeIds.add(e.id);
    if (e.kind && !EDGE_KINDS.includes(e.kind)) {
      E(`edges[${i}].kind`, `유효하지 않은 edge kind '${e.kind}'. 허용: ${EDGE_KINDS.join(", ")}`);
    }
    for (const cardSide of ["sourceCardinality", "targetCardinality"]) {
      if (e[cardSide] !== undefined && !EDGE_CARDINALITIES.includes(e[cardSide])) {
        E(`edges[${i}].${cardSide}`, `유효하지 않은 카디널리티 '${e[cardSide]}'. 허용: ${EDGE_CARDINALITIES.join(", ")}`);
      }
    }
    for (const side of ["source", "target"]) {
      if (!nodeIds.has(e[side])) {
        E(`edges[${i}].${side}`, `'${e[side]}'에 해당하는 노드가 없습니다 (그룹은 엣지 끝점 불가)`);
      }
    }
  });

  spec.flows.forEach((f, i) => {
    if (!f.id) E(`flows[${i}].id`, "id가 비어 있습니다");
    if (!Array.isArray(f.steps) || f.steps.length === 0) {
      E(`flows[${i}].steps`, "스텝이 최소 1개 필요합니다");
      return;
    }
    f.steps.forEach((s, j) => {
      if (!edgeIds.has(s.edge)) {
        E(`flows[${i}].steps[${j}].edge`, `엣지 '${s.edge}'가 없습니다. 사용 가능: ${[...edgeIds].join(", ") || "(없음)"}`);
      }
    });
  });

  return errs;
}

/* =========================================================================
 * 3. 입력 정규화 — kind 기본값/edge.kind 기본값 등을 채운다
 * ========================================================================= */

function normalize(spec) {
  for (const e of spec.edges) e.kind ??= spec.kind === "erd" ? "reference" : "http";
  for (const g of spec.groups) g.kind ??= "layer";
  return spec;
}

/* =========================================================================
 * 4. HTML 생성 — 엔진 JS/CSS는 모두 문자열로 인라인
 * ========================================================================= */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

function buildHtml(spec) {
  const json = JSON.stringify(spec).replace(/</g, "\\u003c");
  return TEMPLATE
    .replace("__TITLE__", escapeHtml(spec.title))
    .replace("__SPEC_JSON__", json);
}

/* =========================================================================
 * 5. 엔진 (CSS / 아이콘 / JS) — 아래 문자열들을 TEMPLATE에 조립
 * ========================================================================= */

// lucide 아이콘 inner SVG (color는 currentColor, stroke 기반). categories.ts의 icon 이름과 1:1.
const ICONS = {
  User: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  Monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  Smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  Server: '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  Boxes: '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/>',
  Cog: '<path d="M11 10.27 7 3.34"/><path d="m11 13.73-4 6.93"/><path d="M12 22v-2"/><path d="M12 2v2"/><path d="M14 12h8"/><path d="m17 20.66-1-1.73"/><path d="m17 3.34-1 1.73"/><path d="M2 12h2"/><path d="m20.66 17-1.73-1"/><path d="m20.66 7-1.73 1"/><path d="m3.34 17 1.73-1"/><path d="m3.34 7 1.73 1"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="8"/>',
  Zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  Clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  Database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  Table2: '<path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>',
  MemoryStick: '<path d="M12 12v-2"/><path d="M12 18v-2"/><path d="M16 12v-2"/><path d="M16 18v-2"/><path d="M2 11h1.5"/><path d="M20 18v-2"/><path d="M20.5 11H22"/><path d="M4 18v-2"/><path d="M8 12v-2"/><path d="M8 18v-2"/><rect x="2" y="6" width="20" height="10" rx="2"/>',
  ListOrdered: '<path d="M11 5h10"/><path d="M11 12h10"/><path d="M11 19h10"/><path d="M4 4h1v5"/><path d="M4 9h2"/><path d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02"/>',
  HardDrive: '<path d="M10 16h.01"/><path d="M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M21.946 12.013H2.054"/><path d="M6 16h.01"/>',
  Globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  DoorOpen: '<path d="M11 20H2"/><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z"/><path d="M11 4H8a2 2 0 0 0-2 2v14"/><path d="M14 12h.01"/><path d="M22 20h-3"/>',
  ShieldCheck: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  ExternalLink: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  Bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  Wand2: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
  Webhook: '<path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/>',
  FileText: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  Box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  KeyRound: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  Cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  Grid2x2: '<path d="M12 3v18"/><path d="M3 12h18"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
  Hexagon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
  Layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  Network: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
  Route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  Plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  Minus: '<path d="M5 12h14"/>',
  Maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  X: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  ArrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  GripVertical: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
  Sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  Moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
  Shuffle: '<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/>',
  BrickWall: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 9v6"/><path d="M16 15v6"/><path d="M16 3v6"/><path d="M3 15h18"/><path d="M3 9h18"/><path d="M8 15v6"/><path d="M8 3v6"/>',
  Activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  Sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  ChartColumn: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  Rss: '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  Workflow: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
  Cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
  Landmark: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  Building2: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  Columns3: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  ZoomIn: '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>',
};

const ICONS_JSON = JSON.stringify(ICONS);

/* ---- CSS (info-hub globals.css 다이어그램 관련 토큰/키프레임 + shadcn 토큰 축약) ---- */
const CSS = String.raw`
:root {
  --background:#ffffff; --foreground:#0a0a0a;
  --card:#ffffff; --card-foreground:#0a0a0a;
  --muted:#f4f4f5; --muted-foreground:#71717a;
  --border:#e4e4e7; --ring:#a1a1aa;
  --cat-user:#64748b; --cat-frontend:#0ea5e9; --cat-backend:#8b5cf6;
  --cat-compute:#f59e0b; --cat-data:#10b981; --cat-data-aux:#14b8a6;
  --cat-edge:#f43f5e; --cat-external:#71717a; --cat-claude:#a855f7;
  --cat-neutral:#6b7280; --diagram-flow:#4f46e5;
  --color-background:var(--background); --color-foreground:var(--foreground);
  --color-card:var(--card); --color-card-foreground:var(--card-foreground);
  --color-muted:var(--muted); --color-muted-foreground:var(--muted-foreground);
  --color-border:var(--border);
}
.dark {
  --background:#0a0a0a; --foreground:#fafafa;
  --card:#171717; --card-foreground:#fafafa;
  --muted:#262626; --muted-foreground:#a1a1aa;
  --border:#2a2a2a; --ring:#52525b;
  --cat-user:#94a3b8; --cat-frontend:#38bdf8; --cat-backend:#a78bfa;
  --cat-compute:#fbbf24; --cat-data:#34d399; --cat-data-aux:#2dd4bf;
  --cat-edge:#fb7185; --cat-external:#a1a1aa; --cat-claude:#c084fc;
  --cat-neutral:#9ca3af; --diagram-flow:#818cf8;
}

* { box-sizing:border-box; }
html, body { margin:0; height:100%; }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue",
    "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif;
  background:var(--background); color:var(--foreground);
  -webkit-font-smoothing:antialiased;
}
.dg-icon { display:inline-block; vertical-align:middle; }
.dg-icon svg { display:block; fill:none; stroke:currentColor; stroke-width:2;
  stroke-linecap:round; stroke-linejoin:round; }

/* ---- 뷰포트 ---- */
#dg-root { position:fixed; inset:0; overflow:hidden; }
.dg-viewport {
  position:absolute; inset:0; overflow:hidden; touch-action:none; user-select:none;
  cursor:grab;
  background-image: radial-gradient(color-mix(in oklab, var(--color-border) 72%, transparent) 1px, transparent 1px);
  background-size:16px 16px;
}
.dg-viewport.dg-panning { cursor:grabbing; }
.dg-content { position:absolute; left:0; top:0; transform-origin:top left; }

/* ---- 레인 흐름 ---- */
.dg-lanes { position:relative; z-index:10; display:flex; align-items:center;
  width:max-content; gap:88px; padding:72px; }
.dg-lanes.dir-RIGHT { flex-direction:row; }
.dg-lanes.dir-DOWN { flex-direction:column; }
.dg-lane { display:flex; flex-shrink:0; gap:40px; }
.dir-RIGHT .dg-lane { flex-direction:column; }
.dir-DOWN .dg-lane { flex-direction:row; align-items:flex-start; }

/* ---- 노드 카드 ---- */
.dg-node {
  position:relative; cursor:pointer; overflow:hidden; border-radius:8px;
  border:1px solid var(--color-border); background:var(--card);
  text-align:left; font:inherit; color:inherit; padding:0;
  box-shadow:0 1px 2px rgba(0,0,0,.05);
  transition: transform .15s ease-out, box-shadow .15s ease-out, opacity .15s ease-out;
}
.dg-node:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,.12); }
.dg-node.dimmed { opacity:.25; }
.dg-node.soft-dim { opacity:.55; }
.dg-node-card { width:192px; padding:10px 12px; }
.dg-node-card .dg-row { display:flex; align-items:center; gap:10px; padding-left:2px; }
.dg-accent { position:absolute; top:0; bottom:0; left:0; width:3px; opacity:.85; }
.dg-tile { flex-shrink:0; width:32px; height:32px; border-radius:6px;
  display:flex; align-items:center; justify-content:center; }
.dg-node-body { min-width:0; }
.dg-node-label { font-size:12px; font-weight:600; line-height:1.2;
  color:var(--card-foreground); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dg-tech { margin-top:2px; display:inline-block; max-width:100%; border-radius:4px;
  background:var(--muted); padding:1px 6px; font-size:10px; font-weight:500; line-height:1.2;
  color:var(--muted-foreground); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dg-meta { margin-top:2px; font-size:10px; line-height:1.2; color:var(--muted-foreground); }
.dg-node-card.with-desc { width:220px; }
.dg-desc { padding:0 12px 9px 14px; font-size:10.5px; line-height:1.45; color:var(--muted-foreground);
  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
.dg-node-badge { position:absolute; top:5px; right:6px; z-index:1; border-radius:9999px;
  border:1px solid var(--color-border); background:var(--muted); padding:0 6px;
  font-size:9px; font-weight:600; line-height:14px; color:var(--muted-foreground); }
.dg-node-card .dg-node-badge + .dg-row .dg-node-label { padding-right:26px; }
.dg-drill { flex-shrink:0; margin-left:auto; padding-left:4px; display:inline-flex;
  color:color-mix(in oklab, var(--muted-foreground) 70%, transparent); }
.dg-thead .dg-drill { margin-left:2px; }

/* ---- ERD 노드 ---- */
.dg-node-table { width:240px; }
.dg-thead { display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--color-border);
  padding:8px 12px; }
.dg-thead .dg-tname { font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:12px; font-weight:600; letter-spacing:-.01em; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; }
.dg-tcount { margin-left:auto; flex-shrink:0; font-size:9px; font-weight:500; color:var(--muted-foreground); }
.dg-cols { list-style:none; margin:0; padding:0; }
.dg-col { display:flex; align-items:center; gap:6px; padding:6px 12px; font-size:12px; }
.dg-col.odd { background:color-mix(in oklab, var(--muted) 35%, transparent); }
.dg-col .dg-pkslot { width:14px; flex-shrink:0; display:inline-flex; }
.dg-col .dg-cname { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px; }
.dg-col .dg-cname.pk { font-weight:600; }
.dg-col .dg-ctype { margin-left:auto; padding-left:8px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10px;
  color:color-mix(in oklab, var(--muted-foreground) 80%, transparent);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dg-col .dg-tags { display:flex; flex-shrink:0; gap:2px; }
.dg-tag { border-radius:4px; border:1px solid var(--color-border); padding:1px 4px;
  font-size:9px; font-weight:500; line-height:1; color:var(--muted-foreground); }
.dg-tag.fk { border-color:color-mix(in oklab,#0ea5e9 40%,transparent);
  background:color-mix(in oklab,#0ea5e9 10%,transparent); color:#0284c7; }
.dark .dg-tag.fk { color:#38bdf8; }

/* ---- 그룹 언더레이 ---- */
.dg-group { position:absolute; border-radius:12px; transition:opacity .15s; }
.dg-group.dimmed { opacity:.25; }
.dg-group-tab { position:absolute; top:-10px; left:12px; display:flex; align-items:center; gap:4px;
  border-radius:9999px; border:1px solid var(--color-border); background:var(--card);
  padding:1px 8px; font-size:10px; font-weight:600; letter-spacing:.02em;
  box-shadow:0 1px 2px rgba(0,0,0,.05); white-space:nowrap; }

/* ---- 엣지 SVG ---- */
.dg-edges { position:absolute; left:0; top:0; z-index:20; overflow:visible; pointer-events:none; }
.dg-edge-hit { pointer-events:stroke; cursor:pointer; }
.dg-edge-label { width:max-content; transform:translate(-50%,-50%); white-space:nowrap;
  border-radius:9999px; border:1px solid var(--color-border); background:var(--card);
  padding:0 8px; font-size:10px; font-weight:500; color:var(--muted-foreground);
  box-shadow:0 1px 1px rgba(0,0,0,.04); user-select:none; }
.dg-edge-label.active { border-color:transparent; color:#fff; background:var(--diagram-flow); }
.dg-badge-text { fill:#fff; font-size:10px; font-weight:700; user-select:none;
  font-feature-settings:"tnum"; }

/* ---- 패널/툴바 (shadcn 풍) ---- */
.dg-ui { position:absolute; z-index:30; }
.dg-btn { display:inline-flex; align-items:center; justify-content:center; gap:4px;
  border-radius:6px; border:1px solid var(--color-border); background:var(--card);
  color:var(--foreground); font:inherit; font-size:12px; font-weight:500; cursor:pointer;
  padding:0 10px; height:28px; white-space:nowrap;
  box-shadow:0 1px 2px rgba(0,0,0,.04); transition:background .12s, color .12s, border-color .12s; }
.dg-btn:hover { background:var(--muted); }
.dg-btn.icon { width:28px; height:28px; padding:0; }
.dg-btn.active { border-color:transparent; color:#fff; background:var(--diagram-flow); }
.dg-btn.active:hover { background:var(--diagram-flow); filter:brightness(1.05); }

.dg-titlebar { left:12px; top:12px; display:flex; align-items:center; gap:8px; max-width:64%;
  border-radius:8px; border:1px solid var(--color-border);
  background:color-mix(in oklab,var(--card) 95%,transparent); padding:5px 10px;
  box-shadow:0 1px 2px rgba(0,0,0,.05); backdrop-filter:blur(6px); }
.dg-kind-chip { display:inline-flex; align-items:center; gap:4px; flex-shrink:0;
  border-radius:6px; border:1px solid var(--color-border); background:var(--muted);
  padding:1px 7px; font-size:10px; font-weight:600; color:var(--muted-foreground); }
.dg-title-text { font-size:12.5px; font-weight:600; letter-spacing:-.01em;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dg-flowsel { left:12px; top:52px; display:flex; flex-wrap:wrap; align-items:center; gap:6px;
  max-width:60%; }
.dg-flowsel .dg-route { color:var(--muted-foreground); }
.dg-toolbar { right:12px; top:12px; display:flex; flex-direction:column; gap:4px; }
.dg-warn { left:12px; top:90px; }
.dg-warn .chip { display:inline-block; border:1px solid color-mix(in oklab,#f59e0b 50%,transparent);
  background:color-mix(in oklab,#f59e0b 10%,transparent); color:#b45309;
  border-radius:6px; padding:2px 8px; font-size:11px; }
.dark .dg-warn .chip { color:#fbbf24; }

.dg-legend { bottom:12px; left:12px; max-width:60%; display:flex; flex-wrap:wrap;
  align-items:center; gap:6px 12px; border-radius:8px; border:1px solid var(--color-border);
  background:color-mix(in oklab,var(--card) 95%,transparent); padding:8px 12px;
  box-shadow:0 1px 3px rgba(0,0,0,.06); backdrop-filter:blur(6px); }
.dg-legend .item { display:flex; align-items:center; gap:4px; font-size:11px;
  color:var(--muted-foreground); }
.dg-legend .sep { width:1px; height:12px; background:var(--color-border); }

.dg-panel { width:288px; border-radius:8px; border:1px solid var(--color-border);
  background:color-mix(in oklab,var(--card) 96%,transparent); box-shadow:0 8px 24px rgba(0,0,0,.14);
  backdrop-filter:blur(8px); }
.dg-detail { right:48px; top:12px; }
.dg-steps { right:12px; bottom:12px; }
.dg-panel-head { display:flex; align-items:flex-start; gap:8px; border-bottom:1px solid var(--color-border);
  padding:12px; cursor:grab; touch-action:none; }
.dg-panel-head:active { cursor:grabbing; }
.dg-panel-head .grip { color:color-mix(in oklab,var(--muted-foreground) 60%,transparent);
  flex-shrink:0; }
.dg-panel-title { font-size:14px; font-weight:600; line-height:1.2; }
.dg-panel-sub { font-size:12px; color:var(--muted-foreground); }
.dg-panel-close { margin-left:auto; }
.dg-panel-body { padding:10px 12px; font-size:12px; line-height:1.6; color:var(--muted-foreground); }
.dg-steps ol { list-style:none; margin:0; padding:12px; max-height:256px; overflow-y:auto; }
.dg-steps li { display:flex; gap:8px; font-size:12px; line-height:1.6; margin-bottom:8px; }
.dg-steps li:last-child { margin-bottom:0; }
.dg-stepnum { flex-shrink:0; width:20px; height:20px; border-radius:9999px; display:flex;
  align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#fff;
  background:var(--diagram-flow); transition:box-shadow 120ms; }
.dg-steps li { cursor:pointer; border-radius:7px; padding:3px 6px; margin:0 -6px 8px; transition:background 120ms; }
.dg-steps li:hover { background:var(--muted); }
.dg-steps li.active { background:color-mix(in oklab, var(--diagram-flow) 16%, transparent); }
.dg-steps li.active .dg-stepnum { box-shadow:0 0 0 3px color-mix(in oklab, var(--diagram-flow) 30%, transparent); }
#dg-tip { position:fixed; z-index:1000; left:0; top:0; pointer-events:none; opacity:0;
  max-width:260px; padding:6px 9px; border-radius:7px; font-size:11.5px; font-weight:500; line-height:1.45;
  white-space:pre-line; background:var(--foreground); color:var(--background);
  box-shadow:0 4px 16px rgba(0,0,0,.22); transition:opacity 120ms; }
#dg-tip.show { opacity:1; }
.dg-href { border-top:1px solid var(--color-border); padding:8px; }
.dg-href a { display:flex; align-items:center; justify-content:space-between; width:100%;
  height:28px; padding:0 8px; border-radius:6px; font-size:12px; color:var(--foreground);
  text-decoration:none; }
.dg-href a:hover { background:var(--muted); }

/* ---- 애니메이션 (info-hub globals.css) ---- */
@keyframes dg-dash { to { stroke-dashoffset:-20; } }
.dg-edge-animated { animation: dg-dash 1.2s linear infinite; }
@keyframes dg-draw { from { stroke-dashoffset:1; } to { stroke-dashoffset:0; } }
.dg-edge-draw { stroke-dasharray:1; stroke-dashoffset:1;
  animation: dg-draw 450ms ease-out forwards;
  animation-delay: calc(var(--step-index,0) * 320ms); }
@keyframes dg-pop { to { transform:scale(1); } }
.dg-badge-pop { transform:scale(0); transform-box:fill-box; transform-origin:center;
  animation: dg-pop 280ms cubic-bezier(.34,1.56,.64,1) forwards;
  animation-delay: calc(var(--step-index,0) * 320ms + 360ms); }
@keyframes dg-sonar { to { box-shadow:0 0 0 9px transparent; } }
.dg-node.selected::after { content:""; position:absolute; inset:-2px; border-radius:inherit;
  pointer-events:none;
  box-shadow:0 0 0 0 var(--sonar-color, color-mix(in oklab, var(--ring) 45%, transparent));
  animation: dg-sonar 1.4s ease-out 2; }
@media (prefers-reduced-motion: reduce) {
  .dg-edge-draw, .dg-badge-pop, .dg-edge-animated { animation:none; stroke-dashoffset:0; transform:scale(1); }
  .dg-node.selected::after { animation:none; }
}
`;

/* ---- 엔진 JS (바닐라 포팅) ---- */
const ENGINE_JS = String.raw`
"use strict";
(function () {
  const SPEC = window.__DIAGRAM_SPEC__;
  const ICONS = window.__DIAGRAM_ICONS__;

  /* ===== categories.ts: CATEGORY_META ===== */
  const CATEGORY_META = {
    user:{labelKo:"사용자",icon:"User",colorGroup:"user"},
    frontend:{labelKo:"프론트엔드",icon:"Monitor",colorGroup:"frontend"},
    mobile:{labelKo:"모바일",icon:"Smartphone",colorGroup:"frontend"},
    backend:{labelKo:"백엔드",icon:"Server",colorGroup:"backend"},
    service:{labelKo:"서비스",icon:"Boxes",colorGroup:"backend"},
    worker:{labelKo:"워커",icon:"Cog",colorGroup:"backend"},
    lambda:{labelKo:"람다",icon:"Zap",colorGroup:"compute"},
    scheduler:{labelKo:"스케줄러",icon:"Clock",colorGroup:"compute"},
    db:{labelKo:"데이터베이스",icon:"Database",colorGroup:"data"},
    table:{labelKo:"테이블",icon:"Table2",colorGroup:"data"},
    cache:{labelKo:"캐시",icon:"MemoryStick",colorGroup:"data-aux"},
    queue:{labelKo:"큐",icon:"ListOrdered",colorGroup:"data-aux"},
    storage:{labelKo:"스토리지",icon:"HardDrive",colorGroup:"data-aux"},
    cdn:{labelKo:"CDN",icon:"Globe",colorGroup:"edge"},
    gateway:{labelKo:"게이트웨이",icon:"DoorOpen",colorGroup:"edge"},
    auth:{labelKo:"인증",icon:"ShieldCheck",colorGroup:"edge"},
    external:{labelKo:"외부 서비스",icon:"ExternalLink",colorGroup:"external",dashed:true},
    agent:{labelKo:"에이전트",icon:"Bot",colorGroup:"claude"},
    skill:{labelKo:"스킬",icon:"Wand2",colorGroup:"claude"},
    hook:{labelKo:"훅",icon:"Webhook",colorGroup:"claude"},
    doc:{labelKo:"문서",icon:"FileText",colorGroup:"neutral"},
    other:{labelKo:"기타",icon:"Box",colorGroup:"neutral"},
    lb:{labelKo:"로드밸런서",icon:"Shuffle",colorGroup:"edge"},
    dns:{labelKo:"DNS",icon:"Globe",colorGroup:"edge"},
    firewall:{labelKo:"방화벽",icon:"BrickWall",colorGroup:"edge"},
    monitor:{labelKo:"관측",icon:"Activity",colorGroup:"neutral"},
    secret:{labelKo:"시크릿",icon:"KeyRound",colorGroup:"edge"},
    ml:{labelKo:"ML/AI",icon:"Sparkles",colorGroup:"compute"},
    analytics:{labelKo:"분석",icon:"ChartColumn",colorGroup:"data"},
    topic:{labelKo:"토픽",icon:"Rss",colorGroup:"data-aux"},
    pipeline:{labelKo:"파이프라인",icon:"Workflow",colorGroup:"compute"},
    device:{labelKo:"디바이스",icon:"Cpu",colorGroup:"frontend"},
  };
  const meta = (cat) => CATEGORY_META[cat] || CATEGORY_META.other;
  const catColor = (cat) => "var(--cat-" + meta(cat).colorGroup + ")";
  const catIconName = (cat) => meta(cat).icon;

  const EDGE_KIND_LABEL = { http:"호출", event:"이벤트", read:"읽기", write:"쓰기", depends:"의존", reference:"참조(FK)" };
  const EDGE_KIND_DASH = { http:null, event:"5 3", read:"2 3", write:null, depends:"4 3", reference:null };
  const KIND_STYLE = {
    http:{width:1.5}, event:{width:1.5,dash:"6 4",animated:true}, read:{width:1.5,dash:"2 4"},
    write:{width:2.25}, depends:{width:1.25,dash:"4 4"}, reference:{width:1.25},
  };

  const GROUP_KIND_STYLE = {
    boundary:{color:"var(--cat-user)",dash:"6 5",icon:"Cloud",fillAlpha:3},
    vpc:{color:"var(--cat-backend)",icon:"Network",fillAlpha:4},
    zone:{color:"var(--cat-data-aux)",dash:"5 5",icon:"Hexagon",fillAlpha:3},
    subnet:{color:"var(--cat-data)",icon:"Grid2x2",fillAlpha:5},
    layer:{color:"var(--cat-neutral)",icon:"Layers",fillAlpha:4},
    // AWS/Azure/GCP 관례: 논리 경계(region/az)는 점선·파선, 물리/소유(account/security 등)는 실선
    region:{color:"var(--cat-data-aux)",dash:"2 4",borderStyle:"dotted",icon:"Globe",fillAlpha:2},
    az:{color:"var(--cat-data-aux)",dash:"8 5",icon:"Layers",fillAlpha:2},
    account:{color:"var(--cat-edge)",icon:"Landmark",fillAlpha:3},
    security:{color:"var(--cat-edge)",dash:"4 4",icon:"ShieldCheck",fillAlpha:3},
    onprem:{color:"var(--cat-neutral)",icon:"Building2",fillAlpha:5},
    stage:{color:"var(--cat-neutral)",icon:"Columns3",fillAlpha:5,borderAlpha:22},
    cluster:{color:"var(--cat-compute)",icon:"Boxes",fillAlpha:3},
  };
  const GROUP_KIND_LABEL = {
    layer:"레이어", vpc:"VPC", boundary:"경계", zone:"존", subnet:"서브넷",
    region:"리전", az:"가용영역", account:"계정", security:"보안 경계",
    onprem:"온프레미스", stage:"단계 밴드", cluster:"클러스터",
  };

  /* ===== util ===== */
  const SVGNS = "http://www.w3.org/2000/svg";
  function iconSpan(name, size, color) {
    const s = document.createElement("span");
    s.className = "dg-icon";
    s.style.width = size + "px"; s.style.height = size + "px";
    if (color) s.style.color = color;
    s.innerHTML = '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '">' + (ICONS[name] || ICONS.Box) + "</svg>";
    return s;
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svgEl(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* ===== layout.ts: buildLayout ===== */
  function buildLayout(spec) {
    const warnings = [];
    const groupById = new Map(spec.groups.map(g => [g.id, g]));
    const chainOf = (gid) => {
      const chain = []; const seen = new Set(); let cur = gid;
      while (cur !== undefined && groupById.has(cur) && !seen.has(cur)) {
        seen.add(cur); chain.unshift(cur); cur = groupById.get(cur).parentId;
      }
      return chain;
    };
    const nodeChain = new Map(spec.nodes.map(n => [n.id, chainOf(n.parentId)]));

    const lane = new Map();
    const indegree = new Map(spec.nodes.map(n => [n.id, 0]));
    const out = new Map(spec.nodes.map(n => [n.id, []]));
    for (const e of spec.edges) {
      if (!indegree.has(e.source) || !indegree.has(e.target)) continue;
      if (e.source === e.target) continue;
      out.get(e.source).push(e.target);
      indegree.set(e.target, indegree.get(e.target) + 1);
    }
    const queue = [];
    for (const n of spec.nodes) if (indegree.get(n.id) === 0) { lane.set(n.id, 0); queue.push(n.id); }
    const remaining = new Map(indegree);
    while (queue.length) {
      const id = queue.shift();
      for (const next of out.get(id)) {
        lane.set(next, Math.max(lane.get(next) || 0, lane.get(id) + 1));
        remaining.set(next, remaining.get(next) - 1);
        if (remaining.get(next) === 0) queue.push(next);
      }
    }
    const inCycle = spec.nodes.filter(n => !lane.has(n.id));
    if (inCycle.length) {
      warnings.push("엣지에 사이클이 있어 일부 노드의 레인을 추정으로 배정했습니다: " + inCycle.map(n => n.id).join(", "));
      const incoming = new Map(spec.nodes.map(n => [n.id, []]));
      for (const e of spec.edges) if (incoming.has(e.target) && e.source !== e.target) incoming.get(e.target).push(e.source);
      for (const n of inCycle) {
        const pl = incoming.get(n.id).map(p => lane.get(p)).filter(v => v !== undefined);
        lane.set(n.id, pl.length ? Math.max.apply(null, pl) + 1 : 0);
      }
    }
    for (const n of spec.nodes) if (n.lane !== undefined) lane.set(n.id, n.lane);

    const usedLanes = [...new Set(spec.nodes.map(n => lane.get(n.id)))].sort((a, b) => a - b);
    const compact = new Map(usedLanes.map((v, i) => [v, i]));

    const buckets = new Map();
    spec.nodes.forEach(n => {
      const li = { node:n, lane:compact.get(lane.get(n.id)), groupChain:nodeChain.get(n.id) };
      if (!buckets.has(li.lane)) buckets.set(li.lane, []);
      buckets.get(li.lane).push(li);
    });
    const originalIndex = new Map(spec.nodes.map((n, i) => [n.id, i]));
    for (const items of buckets.values()) {
      items.sort((a, b) => {
        const ao = a.node.order != null ? a.node.order : Infinity;
        const bo = b.node.order != null ? b.node.order : Infinity;
        if (ao !== bo) return ao - bo;
        const ag = a.groupChain.join("/") || "￿";
        const bg = b.groupChain.join("/") || "￿";
        if (ag !== bg) return ag < bg ? -1 : 1;
        return originalIndex.get(a.node.id) - originalIndex.get(b.node.id);
      });
    }
    const lanes = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([index, items]) => ({ index, items }));

    const groups = spec.groups.map(g => {
      const chain = chainOf(g.id);
      const memberNodeIds = spec.nodes.filter(n => nodeChain.get(n.id).includes(g.id)).map(n => n.id);
      if (memberNodeIds.length === 0) warnings.push("그룹 '" + g.id + "'에 속한 노드가 없어 표시되지 않습니다");
      return { group:g, depth:chain.length - 1, chain, memberNodeIds };
    }).sort((a, b) => a.depth - b.depth);

    return { direction: spec.layout.direction, lanes, groups, warnings };
  }

  function adjacency(spec, nodeId) {
    const nodes = new Set([nodeId]); const edges = new Set();
    for (const e of spec.edges) if (e.source === nodeId || e.target === nodeId) {
      edges.add(e.id); nodes.add(e.source); nodes.add(e.target);
    }
    return { nodes, edges };
  }
  function flowHighlight(spec, flowId) {
    const flow = spec.flows.find(f => f.id === flowId);
    if (!flow) return null;
    const edgeById = new Map(spec.edges.map(e => [e.id, e]));
    const nodes = new Set(); const steps = new Map();
    flow.steps.forEach((s, i) => {
      const e = edgeById.get(s.edge); if (!e) return;
      nodes.add(e.source); nodes.add(e.target);
      if (!steps.has(e.id)) steps.set(e.id, []);
      steps.get(e.id).push(i + 1);
    });
    return { nodes, steps };
  }

  /* ===== geometry.ts ===== */
  const CORNER_RADIUS = 8, GUTTER_HALF = 44, CLEAR_PAD = 14;
  const cx = r => r.x + r.w / 2, cy = r => r.y + r.h / 2;
  function clearBand(desired, obstacles, axis) {
    if (!obstacles.length) return desired;
    const intervals = obstacles.map(r => axis === "y"
      ? [r.y - CLEAR_PAD, r.y + r.h + CLEAR_PAD]
      : [r.x - CLEAR_PAD, r.x + r.w + CLEAR_PAD]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const iv of intervals) {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]); else merged.push([iv[0], iv[1]]);
    }
    for (const m of merged) if (desired > m[0] && desired < m[1]) return desired - m[0] < m[1] - desired ? m[0] : m[1];
    return desired;
  }
  function dedupe(points) {
    return points.filter((p, i) => i === 0 || Math.abs(p.x - points[i - 1].x) > 0.5 || Math.abs(p.y - points[i - 1].y) > 0.5);
  }
  function roundedPath(raw, radius) {
    radius = radius || CORNER_RADIUS;
    const pts = dedupe(raw);
    if (pts.length < 2) return "";
    let d = "M " + pts[0].x + " " + pts[0].y;
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
      const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
      const r = Math.min(radius, inLen / 2, outLen / 2);
      if (r < 1) { d += " L " + cur.x + " " + cur.y; continue; }
      const inUx = (cur.x - prev.x) / inLen, inUy = (cur.y - prev.y) / inLen;
      const outUx = (next.x - cur.x) / outLen, outUy = (next.y - cur.y) / outLen;
      d += " L " + (cur.x - inUx * r) + " " + (cur.y - inUy * r) +
           " Q " + cur.x + " " + cur.y + " " + (cur.x + outUx * r) + " " + (cur.y + outUy * r);
    }
    const last = pts[pts.length - 1];
    d += " L " + last.x + " " + last.y;
    return d;
  }
  function longestSegmentMid(raw) {
    const pts = dedupe(raw); let best = 0; let mid = pts[0] || { x:0, y:0 };
    for (let i = 1; i < pts.length; i++) {
      const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (len > best) { best = len; mid = { x:(pts[i].x + pts[i - 1].x) / 2, y:(pts[i].y + pts[i - 1].y) / 2 }; }
    }
    return mid;
  }
  const geo = pts => ({ d: roundedPath(pts), mid: longestSegmentMid(pts), start: pts[0] });
  function edgeGeometry(i) { return i.direction === "DOWN" ? vertical(i) : horizontal(i); }
  function horizontal(i) {
    const sy = i.sourceAnchor != null ? i.sourceAnchor : cy(i.source);
    const ty = i.targetAnchor != null ? i.targetAnchor : cy(i.target);
    const span = Math.abs(i.targetLane - i.sourceLane);
    if (i.targetLane !== i.sourceLane) {
      const fwd = i.targetLane > i.sourceLane;
      const sx = fwd ? i.source.x + i.source.w : i.source.x;
      const tx = fwd ? i.target.x : i.target.x + i.target.w;
      if (span === 1) {
        const midX = (sx + tx) / 2 + i.gutterOffset;
        return geo([{x:sx,y:sy},{x:midX,y:sy},{x:midX,y:ty},{x:tx,y:ty}]);
      }
      const dir = fwd ? 1 : -1;
      const g1 = sx + dir * GUTTER_HALF + i.gutterOffset;
      const g2 = tx - dir * GUTTER_HALF + i.gutterOffset;
      const runY = clearBand((sy + ty) / 2, i.obstacles || [], "y");
      return geo([{x:sx,y:sy},{x:g1,y:sy},{x:g1,y:runY},{x:g2,y:runY},{x:g2,y:ty},{x:tx,y:ty}]);
    }
    const scy = i.sourceAnchor != null ? i.sourceAnchor : cy(i.source);
    const tcy = i.targetAnchor != null ? i.targetAnchor : cy(i.target);
    const g = Math.min(i.source.x, i.target.x) - GUTTER_HALF / 1.6 + i.gutterOffset;
    return geo([{x:i.source.x,y:scy},{x:g,y:scy},{x:g,y:tcy},{x:i.target.x,y:tcy}]);
  }
  function vertical(i) {
    const sx = i.sourceAnchor != null ? i.sourceAnchor : cx(i.source);
    const tx = i.targetAnchor != null ? i.targetAnchor : cx(i.target);
    const span = Math.abs(i.targetLane - i.sourceLane);
    if (i.targetLane !== i.sourceLane) {
      const fwd = i.targetLane > i.sourceLane;
      const sy = fwd ? i.source.y + i.source.h : i.source.y;
      const ty = fwd ? i.target.y : i.target.y + i.target.h;
      if (span === 1) {
        const midY = (sy + ty) / 2 + i.gutterOffset;
        return geo([{x:sx,y:sy},{x:sx,y:midY},{x:tx,y:midY},{x:tx,y:ty}]);
      }
      const dir = fwd ? 1 : -1;
      const g1 = sy + dir * GUTTER_HALF + i.gutterOffset;
      const g2 = ty - dir * GUTTER_HALF + i.gutterOffset;
      const runX = clearBand((sx + tx) / 2, i.obstacles || [], "x");
      return geo([{x:sx,y:sy},{x:sx,y:g1},{x:runX,y:g1},{x:runX,y:g2},{x:tx,y:g2},{x:tx,y:ty}]);
    }
    const scx = i.sourceAnchor != null ? i.sourceAnchor : cx(i.source);
    const tcx = i.targetAnchor != null ? i.targetAnchor : cx(i.target);
    const g = Math.min(i.source.y, i.target.y) - GUTTER_HALF / 1.6 + i.gutterOffset;
    return geo([{x:scx,y:i.source.y},{x:scx,y:g},{x:tcx,y:g},{x:tcx,y:i.target.y}]);
  }
  function unionRect(rects, pad) {
    if (!rects.length) return null;
    const x1 = Math.min.apply(null, rects.map(r => r.x)) - pad;
    const y1 = Math.min.apply(null, rects.map(r => r.y)) - pad;
    const x2 = Math.max.apply(null, rects.map(r => r.x + r.w)) + pad;
    const y2 = Math.max.apply(null, rects.map(r => r.y + r.h)) + pad;
    return { x:x1, y:y1, w:x2 - x1, h:y2 - y1 };
  }

  /* ========================================================================
   * 상태
   * ======================================================================== */
  const layout = buildLayout(SPEC);
  const laneOf = new Map();
  for (const ln of layout.lanes) for (const it of ln.items) laneOf.set(it.node.id, ln.index);
  const isRight = layout.direction === "RIGHT";

  let transform = { x:0, y:0, k:1 };
  let nodeRects = new Map(), colRects = new Map(), contentSize = { w:0, h:0 };
  let selected = null, flowId = null, hovered = null, hoveredEdge = null, activeStep = null;
  let flowAnimate = false; // 플로우를 막 켰을 때만 1회 진입 애니메이션. 이후 재렌더(호버·팬·줌)는 정적.
  let firstFit = false;

  const MIN_K = 0.2, MAX_K = 2.5;

  /* DOM refs */
  const root = document.getElementById("dg-root");
  const viewport = el("div", "dg-viewport");
  const content = el("div", "dg-content");
  viewport.appendChild(content);
  root.appendChild(viewport);

  const groupLayer = el("div"); groupLayer.style.position = "absolute"; groupLayer.style.inset = "0";
  content.appendChild(groupLayer);
  const lanesEl = el("div", "dg-lanes dir-" + layout.direction);
  if (SPEC.layout.align === "start") lanesEl.style.alignItems = "flex-start";
  content.appendChild(lanesEl);
  const svg = svgEl("svg", { class:"dg-edges" });
  content.appendChild(svg);

  /* ===== 노드 렌더 ===== */
  function renderNodes() {
    lanesEl.innerHTML = "";
    for (const ln of layout.lanes) {
      const laneEl = el("div", "dg-lane");
      ln.items.forEach((item, idx) => {
        const prev = ln.items[idx - 1];
        const boundary = prev && prev.groupChain.join() !== item.groupChain.join();
        const wrap = el("div");
        if (boundary) { if (isRight) wrap.style.marginTop = "36px"; else wrap.style.marginLeft = "36px"; }
        wrap.appendChild(item.node.table ? renderTableNode(item.node) : renderCardNode(item.node));
        laneEl.appendChild(wrap);
      });
      lanesEl.appendChild(laneEl);
    }
  }
  /* ===== 드릴다운 (href → 통합 문서 내 다른 다이어그램 or 외부 URL) ===== */
  function navigateHref(href) {
    if (!href) return;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href)) { window.open(href, "_blank", "noopener"); return; }
    const slug = String(href).replace(/\.html$/i, "");
    if (window.parent !== window) {
      window.parent.postMessage({ type: "zzon:navigate", slug }, "*");
    } else {
      window.location.href = slug + ".html";
    }
  }

  function nodeCommon(btn, node) {
    btn.type = "button";
    btn.setAttribute("data-node-id", node.id);
    btn.addEventListener("click", (e) => { e.stopPropagation(); onSelectNode(node.id); });
    btn.addEventListener("mouseenter", () => { hovered = node.id; applyHighlight(); });
    btn.addEventListener("mouseleave", () => { hovered = null; applyHighlight(); });
    if (node.href) {
      btn.addEventListener("dblclick", (e) => { e.stopPropagation(); navigateHref(node.href); });
    }
  }
  function renderCardNode(node) {
    const color = catColor(node.category), m = meta(node.category);
    const showDesc = SPEC.layout.nodeDescriptions && node.description;
    const btn = el("button", "dg-node dg-node-card" + (showDesc ? " with-desc" : ""));
    nodeCommon(btn, node);
    btn.style.borderColor = m.dashed
      ? "color-mix(in oklab, " + color + " 50%, transparent)"
      : "color-mix(in oklab, " + color + " 28%, var(--color-border))";
    if (m.dashed) btn.style.borderStyle = "dashed";
    btn.style.setProperty("--sonar-color", "color-mix(in oklab, " + color + " 40%, transparent)");

    const accent = el("span", "dg-accent"); accent.style.backgroundColor = color;
    btn.appendChild(accent);
    if (node.badge) btn.appendChild(el("span", "dg-node-badge", node.badge));
    const row = el("div", "dg-row");
    const tile = el("div", "dg-tile");
    tile.style.backgroundColor = "color-mix(in oklab, " + color + " 13%, transparent)";
    tile.appendChild(iconSpan(catIconName(node.category), 16, color));
    const body = el("div", "dg-node-body");
    body.appendChild(el("div", "dg-node-label", node.label));
    if (node.tech) body.appendChild(el("div", "dg-tech", node.tech));
    else body.appendChild(el("div", "dg-meta", m.labelKo));
    row.appendChild(tile); row.appendChild(body);
    if (node.href) {
      const drill = el("span", "dg-drill");
      drill.appendChild(iconSpan("ZoomIn", 12));
      attachTip(drill, "더블클릭: 상세 보기 (" + node.href + ")");
      row.appendChild(drill);
    }
    btn.appendChild(row);
    if (showDesc) btn.appendChild(el("div", "dg-desc", node.description));
    return btn;
  }
  function renderTableNode(node) {
    const color = catColor(node.category);
    const cols = (node.table && node.table.columns) || [];
    const btn = el("button", "dg-node dg-node-table");
    nodeCommon(btn, node);
    btn.style.borderColor = "color-mix(in oklab, " + color + " 30%, var(--color-border))";
    btn.style.setProperty("--sonar-color", "color-mix(in oklab, " + color + " 40%, transparent)");
    const head = el("div", "dg-thead");
    head.style.backgroundColor = "color-mix(in oklab, " + color + " 9%, transparent)";
    head.appendChild(iconSpan("Table2", 16, color));
    head.appendChild(el("span", "dg-tname", node.label));
    if (node.badge) head.appendChild(el("span", "dg-tag", node.badge));
    head.appendChild(el("span", "dg-tcount", cols.length + " cols"));
    if (node.href) {
      const drill = el("span", "dg-drill");
      drill.appendChild(iconSpan("ZoomIn", 12));
      attachTip(drill, "더블클릭: 상세 보기 (" + node.href + ")");
      head.appendChild(drill);
    }
    btn.appendChild(head);
    const ul = el("ul", "dg-cols");
    cols.forEach((c, i) => {
      const li = el("li", "dg-col" + (i % 2 === 1 ? " odd" : ""));
      li.setAttribute("data-col-id", node.id + "::" + c.name);
      const pk = el("span", "dg-pkslot");
      if (c.pk) { const ic = iconSpan("KeyRound", 12, "#f59e0b"); pk.appendChild(ic); }
      li.appendChild(pk);
      li.appendChild(el("span", "dg-cname" + (c.pk ? " pk" : ""), c.name));
      li.appendChild(el("span", "dg-ctype", c.type));
      const tags = el("span", "dg-tags");
      if (c.fk) tags.appendChild(el("span", "dg-tag fk", "FK"));
      if (c.unique) tags.appendChild(el("span", "dg-tag", "UQ"));
      if (c.nullable) tags.appendChild(el("span", "dg-tag", "N"));
      li.appendChild(tags);
      ul.appendChild(li);
    });
    btn.appendChild(ul);
    return btn;
  }

  /* ===== 측정 (useDiagramMeasure) ===== */
  function measure() {
    const scale = transform.k || 1;
    const rootRect = content.getBoundingClientRect();
    const collect = (selector, attr) => {
      const map = new Map();
      content.querySelectorAll(selector).forEach(node => {
        const r = node.getBoundingClientRect();
        map.set(node.getAttribute(attr), {
          x:(r.left - rootRect.left) / scale, y:(r.top - rootRect.top) / scale,
          w:r.width / scale, h:r.height / scale,
        });
      });
      return map;
    };
    nodeRects = collect("[data-node-id]", "data-node-id");
    colRects = collect("[data-col-id]", "data-col-id");
    contentSize = { w:content.scrollWidth, h:content.scrollHeight };
  }

  /* ===== 엣지 기하 계산 ===== */
  const GUTTER_STEP = 12;
  let edgeGeos = [];
  function computeEdges() {
    edgeGeos = [];
    if (nodeRects.size === 0) return;
    const gutterKey = e => {
      const sl = laneOf.get(e.source) || 0, tl = laneOf.get(e.target) || 0;
      return sl === tl ? "v" + sl : "g" + Math.min(sl, tl) + "-" + Math.max(sl, tl);
    };
    const byGutter = new Map();
    for (const e of SPEC.edges) { const k = gutterKey(e); if (!byGutter.has(k)) byGutter.set(k, []); byGutter.get(k).push(e); }
    const offsetOf = new Map();
    for (const list of byGutter.values()) list.forEach((e, i) => offsetOf.set(e.id, (i - (list.length - 1) / 2) * GUTTER_STEP));

    // 분산 앵커: 한 노드의 같은 변(邊)에 여러 엣지가 붙으면 변을 따라 펼쳐 fan-out/fan-in 겹침을 막는다.
    const RIGHT_DIR = layout.direction !== "DOWN";
    const sideMap = new Map();
    const pushSide = (nodeId, side, edge, role, sortVal) => {
      const k = nodeId + "|" + side;
      if (!sideMap.has(k)) sideMap.set(k, []);
      sideMap.get(k).push({ edge, role, sortVal });
    };
    for (const e of SPEC.edges) {
      const s = nodeRects.get(e.source), t = nodeRects.get(e.target);
      if (!s || !t) continue;
      const sl = laneOf.get(e.source) || 0, tl = laneOf.get(e.target) || 0;
      if (sl === tl) continue; // 같은 레인은 측면 라우팅 — 분산 제외
      const fwd = tl > sl;
      const sSide = RIGHT_DIR ? (fwd ? "R" : "L") : (fwd ? "B" : "T");
      const tSide = RIGHT_DIR ? (fwd ? "L" : "R") : (fwd ? "T" : "B");
      pushSide(e.source, sSide, e, "S", RIGHT_DIR ? t.y + t.h / 2 : t.x + t.w / 2);
      pushSide(e.target, tSide, e, "T", RIGHT_DIR ? s.y + s.h / 2 : s.x + s.w / 2);
    }
    const anchorOf = new Map();
    for (const [k, list] of sideMap) {
      if (list.length <= 1) continue; // 엣지 1개면 중앙 유지
      const nodeId = k.slice(0, k.lastIndexOf("|"));
      const r = nodeRects.get(nodeId); if (!r) continue;
      list.sort((a, b) => a.sortVal - b.sortVal); // 상대 노드 위치순 → 교차 최소화
      const span = RIGHT_DIR ? r.h : r.w, start = RIGHT_DIR ? r.y : r.x;
      const pad = Math.min(span * 0.2, 16), usable = Math.max(1, span - 2 * pad);
      list.forEach((item, idx) => {
        const frac = idx / (list.length - 1);
        anchorOf.set(item.edge.id + "|" + item.role, start + pad + usable * frac);
      });
    }

    const rectsByLane = new Map();
    for (const [id, rect] of nodeRects) {
      const lane = laneOf.get(id); if (lane === undefined) continue;
      if (!rectsByLane.has(lane)) rectsByLane.set(lane, []);
      rectsByLane.get(lane).push(rect);
    }

    // 관통 금지: 그룹 박스를 (시각 박스와 동일한 패딩으로) 미리 계산해 둔다.
    // 엣지의 소스/타깃이 그 그룹 안에 없고(=조상 아님) 그룹이 두 노드 사이 레인에 걸치면 장애물로 쓴다.
    const groupHeight = new Map();
    for (const g of layout.groups.slice().sort((a, b) => b.depth - a.depth)) {
      const kids = layout.groups.filter(c => c.group.parentId === g.group.id);
      groupHeight.set(g.group.id, kids.length === 0 ? 0
        : Math.max.apply(null, kids.map(c => groupHeight.get(c.group.id) || 0)) + 1);
    }
    const groupBoxes = [];
    for (const g of layout.groups) {
      const rects = g.memberNodeIds.map(id => nodeRects.get(id)).filter(Boolean);
      if (!rects.length) continue;
      const box = unionRect(rects, 16 + (groupHeight.get(g.group.id) || 0) * 16);
      if (!box) continue;
      const lanes = new Set();
      for (const id of g.memberNodeIds) { const L = laneOf.get(id); if (L !== undefined) lanes.add(L); }
      groupBoxes.push({ box, members: new Set(g.memberNodeIds), lanes });
    }

    for (const e of SPEC.edges) {
      const source = nodeRects.get(e.source), target = nodeRects.get(e.target);
      if (!source || !target) continue;
      const sourceCol = e.sourceColumn ? colRects.get(e.source + "::" + e.sourceColumn) : undefined;
      const targetCol = e.targetColumn ? colRects.get(e.target + "::" + e.targetColumn) : undefined;
      const sl = laneOf.get(e.source) || 0, tl = laneOf.get(e.target) || 0;
      const loLane = Math.min(sl, tl), hiLane = Math.max(sl, tl);
      const obstacles = [];
      for (let lane = loLane + 1; lane <= hiLane - 1; lane++) {
        const arr = rectsByLane.get(lane); if (arr) for (const r of arr) obstacles.push(r);
      }
      // 소스/타깃이 속하지 않은 그룹 박스가 사이 레인에 걸치면 관통 금지 장애물로 추가
      for (const gb of groupBoxes) {
        if (gb.members.has(e.source) || gb.members.has(e.target)) continue;
        let between = false;
        for (let lane = loLane + 1; lane <= hiLane - 1; lane++) if (gb.lanes.has(lane)) { between = true; break; }
        if (between) obstacles.push(gb.box);
      }
      const g = edgeGeometry({
        source, target, sourceLane:sl, targetLane:tl, direction:layout.direction, obstacles,
        gutterOffset: offsetOf.get(e.id) || 0,
        sourceAnchor: sourceCol ? (layout.direction === "RIGHT" ? sourceCol.y + sourceCol.h / 2 : sourceCol.x + sourceCol.w / 2) : anchorOf.get(e.id + "|S"),
        targetAnchor: targetCol ? (layout.direction === "RIGHT" ? targetCol.y + targetCol.h / 2 : targetCol.x + targetCol.w / 2) : anchorOf.get(e.id + "|T"),
      });
      edgeGeos.push({ edge:e, geo:g });
    }
  }

  /* ===== 엣지 SVG 렌더 ===== */
  // ERD 카디널리티(까마귀발) 마커. refX=13 → 기호 끝이 노드 경계에 닿는다.
  // orient=auto-start-reverse 하나로 marker-start(소스쪽)·marker-end(타깃쪽) 둘 다 노드를 향한다.
  const CARD_ID = { "1":"c1", "0..1":"c01", "N":"cn", "0..N":"c0n", "1..N":"c1n" };
  function cardMarker(token) {
    const m = svgEl("marker", { id:"dg-card-" + CARD_ID[token], viewBox:"0 0 14 12",
      refX:"13", refY:"6", markerWidth:"14", markerHeight:"12",
      markerUnits:"userSpaceOnUse", orient:"auto-start-reverse" });
    const line = (d) => m.appendChild(svgEl("path", { d, fill:"none", stroke:"context-stroke",
      "stroke-width":"1.3", "stroke-linecap":"round" }));
    const ring = (cx) => m.appendChild(svgEl("circle", { cx, cy:"6", r:"2.3",
      fill:"var(--color-background)", stroke:"context-stroke", "stroke-width":"1.3" }));
    if (token === "1") { line("M 8 1.5 L 8 10.5"); }
    else if (token === "0..1") { line("M 9.5 1.5 L 9.5 10.5"); ring(4); }
    else if (token === "N") { line("M 4 6 L 13 1.5 M 4 6 L 13 6 M 4 6 L 13 10.5"); }
    else if (token === "0..N") { line("M 5.5 6 L 13 1.5 M 5.5 6 L 13 6 M 5.5 6 L 13 10.5"); ring(2.8); }
    else if (token === "1..N") { line("M 3 1.5 L 3 10.5"); line("M 4.5 6 L 13 1.5 M 4.5 6 L 13 6 M 4.5 6 L 13 10.5"); }
    return m;
  }
  function renderEdges() {
    svg.innerHTML = "";
    svg.setAttribute("width", contentSize.w);
    svg.setAttribute("height", contentSize.h);
    const defs = svgEl("defs");
    const marker = svgEl("marker", { id:"dg-chevron", viewBox:"0 0 10 10", refX:"7.5", refY:"5",
      markerWidth:"9", markerHeight:"9", orient:"auto-start-reverse" });
    marker.appendChild(svgEl("path", { d:"M 2 1.5 L 7.5 5 L 2 8.5", fill:"none", stroke:"context-stroke",
      "stroke-width":"1.6", "stroke-linecap":"round", "stroke-linejoin":"round" }));
    defs.appendChild(marker);
    for (const token in CARD_ID) defs.appendChild(cardMarker(token));
    svg.appendChild(defs);

    const hl = computeHighlight();
    const activeEdges = hl ? hl.edges : null;
    const flowSteps = hl && hl.steps ? hl.steps : null;
    const mode = hl ? hl.mode : null;
    const showLabels = transform.k >= 0.55;
    const animateEntrance = flowAnimate; flowAnimate = false; // 첫 렌더에만 진입 연출, 이후 정적

    const stateOf = (id) => {
      const active = activeEdges ? activeEdges.has(id) : false;
      const dimmed = activeEdges !== null && !active;
      return { active, dimmed, isHover: hoveredEdge === id };
    };
    const ordered = edgeGeos.slice().sort((a, b) => Number(stateOf(a.edge.id).active) - Number(stateOf(b.edge.id).active));

    // 1층: 경로
    for (const { edge, geo } of ordered) {
      const st = stateOf(edge.id);
      const style = KIND_STYLE[edge.kind] || KIND_STYLE.http;
      const isFlow = flowSteps ? flowSteps.has(edge.id) : false;
      const stepIndex = flowSteps && flowSteps.get(edge.id) ? flowSteps.get(edge.id)[0] : 0;

      const g = svgEl("g");
      g.style.opacity = st.dimmed ? (mode === "hover" ? 0.35 : 0.1) : 1;
      g.style.transition = "opacity 150ms";

      const stroke = st.active ? "var(--diagram-flow)"
        : st.isHover ? "color-mix(in oklab, var(--color-foreground) 65%, transparent)"
        : "color-mix(in oklab, var(--color-muted-foreground) 45%, transparent)";

      const markerEnd = edge.targetCardinality
        ? "url(#dg-card-" + CARD_ID[edge.targetCardinality] + ")" : "url(#dg-chevron)";
      const markerStart = edge.sourceCardinality
        ? "url(#dg-card-" + CARD_ID[edge.sourceCardinality] + ")" : null;

      let path;
      if (isFlow) {
        path = svgEl("path", { d:geo.d, fill:"none", pathLength:"1",
          class: animateEntrance ? "dg-edge-draw" : null,
          stroke:"var(--diagram-flow)", "stroke-width": style.width + 0.75,
          "marker-end":markerEnd, "marker-start":markerStart, "stroke-linecap":"round" });
        if (animateEntrance) path.style.setProperty("--step-index", stepIndex - 1);
      } else {
        path = svgEl("path", { d:geo.d, fill:"none", stroke,
          "stroke-width": st.active || st.isHover ? style.width + 0.75 : style.width,
          "stroke-dasharray": style.dash || null, "marker-end":markerEnd, "marker-start":markerStart,
          "stroke-linecap":"round" });
        if (style.animated && !st.dimmed) path.setAttribute("class", "dg-edge-animated");
        path.style.transition = "stroke 120ms, stroke-width 120ms";
      }
      g.appendChild(path);

      if (!markerStart) {
        const dot = svgEl("circle", { cx:geo.start.x, cy:geo.start.y, r:"3.2",
          fill:"var(--color-background)", stroke: isFlow || st.active ? "var(--diagram-flow)" : stroke, "stroke-width":"1.5" });
        g.appendChild(dot);
      }

      const hit = svgEl("path", { d:geo.d, fill:"none", stroke:"transparent", "stroke-width":"14", class:"dg-edge-hit" });
      hit.addEventListener("mouseenter", () => { hoveredEdge = edge.id; renderEdges(); });
      hit.addEventListener("mouseleave", () => { hoveredEdge = null; renderEdges(); });
      g.appendChild(hit);

      svg.appendChild(g);
    }

    // 2층: 라벨/배지
    for (const { edge, geo } of ordered) {
      const st = stateOf(edge.id);
      const steps = flowSteps ? flowSteps.get(edge.id) : null;
      const g = svgEl("g");
      g.style.opacity = st.dimmed ? (mode === "hover" ? 0.35 : 0.08) : 1;
      g.style.transition = "opacity 150ms";

      if (steps) {
        const badge = svgEl("g", animateEntrance ? { class:"dg-badge-pop" } : null);
        badge.setAttribute("data-diagram-ui", "");
        badge.style.cursor = "pointer";
        badge.style.pointerEvents = "auto";
        if (animateEntrance) badge.style.setProperty("--step-index", (steps[0] || 1) - 1);
        const label = steps.join("·");
        const on = steps.indexOf(activeStep) !== -1;
        const circle = svgEl("circle", { cx:geo.mid.x, cy:geo.mid.y, r: (label.length > 1 ? 11.5 : 9.5) + (on ? 2 : 0),
          fill:"var(--diagram-flow)", stroke:"var(--color-background)", "stroke-width": on ? "3.5" : "2.5" });
        const txt = svgEl("text", { x:geo.mid.x, y:geo.mid.y, "text-anchor":"middle",
          "dominant-baseline":"central", class:"dg-badge-text" });
        txt.textContent = label;
        badge.appendChild(circle); badge.appendChild(txt);
        const flow = SPEC.flows.find(f => f.id === flowId);
        if (flow) attachTip(badge, steps.map(n => n + ". " + (flow.steps[n - 1] ? flow.steps[n - 1].text : "")).join("\n"));
        badge.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const i = steps.indexOf(activeStep);
          activeStep = i === -1 ? steps[0] : (i + 1 < steps.length ? steps[i + 1] : null);
          hideTip(); renderEdges(); updateStepHighlight();
        });
        g.appendChild(badge);
      } else if (edge.label && (showLabels || st.isHover || st.active)) {
        const fo = svgEl("foreignObject", { x:geo.mid.x, y:geo.mid.y, width:1, height:1 });
        fo.style.overflow = "visible";
        const div = el("div", "dg-edge-label" + (st.active || st.isHover ? " active" : ""), edge.label);
        fo.appendChild(div); g.appendChild(fo);
      }
      svg.appendChild(g);
    }
  }

  /* ===== 그룹 언더레이 ===== */
  function renderGroups() {
    groupLayer.innerHTML = "";
    const heightOf = new Map();
    const sorted = layout.groups.slice().sort((a, b) => b.depth - a.depth);
    for (const g of sorted) {
      const children = layout.groups.filter(c => c.group.parentId === g.group.id);
      heightOf.set(g.group.id, children.length === 0 ? 0
        : Math.max.apply(null, children.map(c => heightOf.get(c.group.id) || 0)) + 1);
    }
    const hl = computeHighlight();
    const strongDimmed = (hl && (hl.mode === "flow" || hl.mode === "select"))
      ? new Set(SPEC.nodes.filter(n => !hl.nodes.has(n.id)).map(n => n.id)) : null;

    for (const g of layout.groups) {
      const rects = g.memberNodeIds.map(id => nodeRects.get(id)).filter(Boolean);
      const pad = 16 + (heightOf.get(g.group.id) || 0) * 16;
      const box = unionRect(rects, pad);
      if (!box) continue;
      const style = GROUP_KIND_STYLE[g.group.kind] || GROUP_KIND_STYLE.layer;
      const allDimmed = strongDimmed !== null && g.memberNodeIds.length > 0 &&
        g.memberNodeIds.every(id => strongDimmed.has(id));
      const div = el("div", "dg-group");
      div.style.left = box.x + "px"; div.style.top = box.y + "px";
      div.style.width = box.w + "px"; div.style.height = box.h + "px";
      div.style.border = "1.5px " + (style.borderStyle || (style.dash ? "dashed" : "solid")) +
        " color-mix(in oklab, " + style.color + " " + (style.borderAlpha || 45) + "%, transparent)";
      div.style.backgroundColor = "color-mix(in oklab, " + style.color + " " + style.fillAlpha + "%, transparent)";
      if (allDimmed) div.style.opacity = "0.25";
      const tab = el("span", "dg-group-tab");
      tab.style.color = style.color;
      tab.style.borderColor = "color-mix(in oklab, " + style.color + " 40%, var(--color-border))";
      tab.appendChild(iconSpan(style.icon, 12, style.color));
      tab.appendChild(document.createTextNode(g.group.label));
      div.appendChild(tab);
      groupLayer.appendChild(div);
    }
  }

  /* ===== 하이라이트 계산 ===== */
  function computeHighlight() {
    if (flowId) {
      const f = flowHighlight(SPEC, flowId);
      if (f) return { nodes:f.nodes, edges:new Set(f.steps.keys()), steps:f.steps, mode:"flow" };
    }
    if (selected) { const a = adjacency(SPEC, selected); return { nodes:a.nodes, edges:a.edges, steps:null, mode:"select" }; }
    if (hovered) { const a = adjacency(SPEC, hovered); return { nodes:a.nodes, edges:a.edges, steps:null, mode:"hover" }; }
    return null;
  }

  /* ===== 노드 dim/selected 적용 ===== */
  function applyHighlight() {
    const hl = computeHighlight();
    const strong = hl && (hl.mode === "flow" || hl.mode === "select");
    content.querySelectorAll("[data-node-id]").forEach(node => {
      const id = node.getAttribute("data-node-id");
      const inHl = hl ? hl.nodes.has(id) : false;
      node.classList.toggle("dimmed", strong ? !inHl : false);
      node.classList.toggle("soft-dim", hl && hl.mode === "hover" ? !inHl : false);
      node.classList.toggle("selected", selected === id);
    });
    renderEdges();
    renderGroups();
  }

  /* ===== 선택/플로우 ===== */
  function onSelectNode(id) {
    flowId = null; updateFlowButtons();
    selected = (selected === id) ? null : id;
    renderDetailPanel(); renderStepsPanel(); applyHighlight();
  }
  function setFlow(id) {
    selected = null;
    flowId = id;
    flowAnimate = !!id; // 켤 때만 진입 애니메이션 1회
    activeStep = null; hideTip();
    updateFlowButtons(); renderDetailPanel(); renderStepsPanel(); applyHighlight();
  }

  /* ===== 팬/줌 (usePanZoom) ===== */
  function applyTransform() {
    content.style.transform = "translate(" + transform.x + "px," + transform.y + "px) scale(" + transform.k + ")";
  }
  function zoomAt(clientX, clientY, factor) {
    const rect = viewport.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    const k = Math.min(MAX_K, Math.max(MIN_K, transform.k * factor));
    const ratio = k / transform.k;
    transform = { k, x: px - (px - transform.x) * ratio, y: py - (py - transform.y) * ratio };
    applyTransform();
  }
  function fit() {
    const cw = content.scrollWidth, ch = content.scrollHeight;
    if (!cw || !ch) return;
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const k = Math.min(MAX_K, Math.max(MIN_K, Math.min(vw / cw, vh / ch) * 0.94));
    transform = { k, x:(vw - cw * k) / 2, y:(vh - ch * k) / 2 };
    applyTransform();
    renderEdges();
  }
  viewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || !e.shiftKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.002));
    else { transform.x -= e.deltaX; transform.y -= e.deltaY; applyTransform(); }
    renderEdges();
  }, { passive:false });

  let dragging = null, downAt = null;
  viewport.addEventListener("pointerdown", (e) => {
    downAt = { x:e.clientX, y:e.clientY };
    if (e.target.closest("[data-node-id],[data-diagram-ui]")) return;
    dragging = { sx:e.clientX, sy:e.clientY, ox:transform.x, oy:transform.y };
    viewport.classList.add("dg-panning");
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    transform.x = dragging.ox + (e.clientX - dragging.sx);
    transform.y = dragging.oy + (e.clientY - dragging.sy);
    applyTransform();
  });
  function endDrag(e) {
    dragging = null; viewport.classList.remove("dg-panning");
    try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  viewport.addEventListener("click", (e) => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5) {
      if (!e.target.closest("[data-node-id],[data-diagram-ui]")) {
        selected = null; renderDetailPanel(); applyHighlight();
      }
    }
  });

  /* ========================================================================
   * UI 패널/툴바
   * ======================================================================== */
  /* ---- 호버 툴팁 (버튼·배지 설명) ---- */
  let tipEl = null;
  function tipNode() {
    if (!tipEl) { tipEl = el("div"); tipEl.id = "dg-tip"; tipEl.setAttribute("data-diagram-ui", ""); document.body.appendChild(tipEl); }
    return tipEl;
  }
  function placeTip(e) {
    const t = tipNode(), r = t.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 16;
    if (x + r.width > window.innerWidth - 8) x = e.clientX - 14 - r.width;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - 12 - r.height;
    t.style.left = Math.max(8, x) + "px"; t.style.top = Math.max(8, y) + "px";
  }
  function attachTip(target, text) {
    if (!text) return target;
    target.addEventListener("mouseenter", (e) => { const t = tipNode(); t.textContent = text; t.classList.add("show"); placeTip(e); });
    target.addEventListener("mousemove", placeTip);
    target.addEventListener("mouseleave", () => { if (tipEl) tipEl.classList.remove("show"); });
    return target;
  }
  function hideTip() { if (tipEl) tipEl.classList.remove("show"); }

  /* ---- 단계 강조 (배지 클릭 ↔ 단계 패널) ---- */
  function setActiveStep(n) { activeStep = (activeStep === n ? null : n); renderEdges(); updateStepHighlight(); }
  function updateStepHighlight() {
    if (!stepsEl) return;
    let target = null;
    stepsEl.querySelectorAll("[data-step]").forEach((li) => {
      const on = Number(li.getAttribute("data-step")) === activeStep;
      li.classList.toggle("active", on); if (on) target = li;
    });
    if (target) target.scrollIntoView({ block: "nearest" });
  }

  function uiIcon(name, size) { return iconSpan(name, size || 14).outerHTML; }

  /* ---- 타이틀바 (제목 + kind 배지 — "모든 다이어그램에 유형+범위 제목" 관례) ---- */
  function renderTitleBar() {
    const KIND_META = {
      "infra":{label:"인프라",icon:"Server"},
      "data-flow":{label:"데이터 흐름",icon:"Webhook"},
      "erd":{label:"ERD",icon:"Database"},
      "agent-topology":{label:"에이전트 구조",icon:"Bot"},
    };
    const km = KIND_META[SPEC.kind] || KIND_META.infra;
    const bar = el("div", "dg-ui dg-titlebar");
    bar.setAttribute("data-diagram-ui", "");
    const chip = el("span", "dg-kind-chip");
    chip.appendChild(iconSpan(km.icon, 11));
    chip.appendChild(document.createTextNode(km.label));
    bar.appendChild(chip);
    bar.appendChild(el("span", "dg-title-text", SPEC.title));
    if (SPEC.description) attachTip(bar, SPEC.description);
    root.appendChild(bar);
  }

  /* ---- 플로우 셀렉터 ---- */
  let flowSelEl = null;
  function renderFlowSelector() {
    if (!SPEC.flows.length) return;
    flowSelEl = el("div", "dg-ui dg-flowsel");
    flowSelEl.setAttribute("data-diagram-ui", "");
    const route = el("span", "dg-route"); route.appendChild(iconSpan("Route", 16)); flowSelEl.appendChild(route);
    SPEC.flows.forEach(f => {
      const b = el("button", "dg-btn", f.label);
      b.setAttribute("data-flow-id", f.id);
      attachTip(b, f.description || f.label);
      b.addEventListener("click", () => setFlow(flowId === f.id ? null : f.id));
      flowSelEl.appendChild(b);
    });
    root.appendChild(flowSelEl);
  }
  function updateFlowButtons() {
    if (!flowSelEl) return;
    flowSelEl.querySelectorAll("[data-flow-id]").forEach(b =>
      b.classList.toggle("active", b.getAttribute("data-flow-id") === flowId));
  }

  /* ---- 툴바 + 테마 토글 ---- */
  function renderToolbar() {
    const bar = el("div", "dg-ui dg-toolbar");
    bar.setAttribute("data-diagram-ui", "");
    const mk = (icon, title, fn) => {
      const b = el("button", "dg-btn icon"); b.setAttribute("aria-label", title); attachTip(b, title); b.innerHTML = uiIcon(icon, 14);
      b.addEventListener("click", fn); return b;
    };
    bar.appendChild(mk("Plus", "확대", () => { const r = viewport.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25); renderEdges(); }));
    bar.appendChild(mk("Minus", "축소", () => { const r = viewport.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8); renderEdges(); }));
    bar.appendChild(mk("Maximize", "화면 맞춤", () => fit()));
    const themeBtn = mk(document.documentElement.classList.contains("dark") ? "Sun" : "Moon", "테마 전환", () => {
      document.documentElement.classList.toggle("dark");
      themeBtn.innerHTML = uiIcon(document.documentElement.classList.contains("dark") ? "Sun" : "Moon", 14);
    });
    bar.appendChild(themeBtn);
    root.appendChild(bar);
  }

  /* ---- 경고 칩 ---- */
  function renderWarning() {
    if (!layout.warnings.length) return;
    const w = el("div", "dg-ui dg-warn"); w.setAttribute("data-diagram-ui", "");
    if (!SPEC.flows.length) w.style.top = "52px";
    w.appendChild(el("span", "chip", layout.warnings[0]));
    root.appendChild(w);
  }

  /* ---- 범례 ---- */
  function renderLegend() {
    const cats = [...new Set(SPEC.nodes.map(n => n.category))];
    const kinds = [...new Set(SPEC.edges.map(e => e.kind))];
    const gkinds = [...new Set(SPEC.groups.map(g => g.kind))];
    const lg = el("div", "dg-ui dg-legend"); lg.setAttribute("data-diagram-ui", "");
    cats.forEach(c => {
      const it = el("span", "item");
      it.appendChild(iconSpan(catIconName(c), 12, catColor(c)));
      it.appendChild(document.createTextNode(meta(c).labelKo));
      lg.appendChild(it);
    });
    if (kinds.length) lg.appendChild(el("span", "sep"));
    kinds.forEach(k => {
      const it = el("span", "item");
      const s = svgEl("svg", { width:18, height:6 });
      s.appendChild(svgEl("line", { x1:0, y1:3, x2:18, y2:3, stroke:"currentColor",
        "stroke-width": k === "write" ? 2.25 : 1.5, "stroke-dasharray": EDGE_KIND_DASH[k] || null }));
      it.appendChild(s);
      it.appendChild(document.createTextNode(EDGE_KIND_LABEL[k] || k));
      lg.appendChild(it);
    });
    if (gkinds.length) lg.appendChild(el("span", "sep"));
    gkinds.forEach(k => {
      const style = GROUP_KIND_STYLE[k] || GROUP_KIND_STYLE.layer;
      const it = el("span", "item");
      const s = svgEl("svg", { width:16, height:10 });
      const r = svgEl("rect", { x:1, y:1, width:14, height:8, rx:2, "stroke-width":1.2,
        "stroke-dasharray": style.dash ? "3 2" : null });
      r.style.stroke = style.color;
      r.style.fill = "color-mix(in oklab, " + style.color + " " + style.fillAlpha + "%, transparent)";
      s.appendChild(r);
      it.appendChild(s);
      it.appendChild(document.createTextNode(GROUP_KIND_LABEL[k] || k));
      lg.appendChild(it);
    });
    root.appendChild(lg);
  }

  /* ---- 드래그 가능한 패널 헤드 ---- */
  function makeDraggable(handle, panel) {
    let drag = null;
    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".dg-panel-close")) return;
      const m = (panel.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/));
      const ox = m ? parseFloat(m[1]) : 0, oy = m ? parseFloat(m[2]) : 0;
      drag = { sx:e.clientX, sy:e.clientY, ox, oy };
      handle.setPointerCapture(e.pointerId); e.stopPropagation();
    });
    handle.addEventListener("pointermove", (e) => {
      if (!drag) return;
      panel.style.transform = "translate(" + (drag.ox + e.clientX - drag.sx) + "px," + (drag.oy + e.clientY - drag.sy) + "px)";
    });
    handle.addEventListener("pointerup", (e) => { drag = null; try { handle.releasePointerCapture(e.pointerId); } catch (_) {} });
  }

  /* ---- 노드 상세 패널 ---- */
  let detailEl = null;
  function renderDetailPanel() {
    if (detailEl) { detailEl.remove(); detailEl = null; }
    if (!selected) return;
    const node = SPEC.nodes.find(n => n.id === selected);
    if (!node) return;
    const color = catColor(node.category), m = meta(node.category);
    const panel = el("div", "dg-ui dg-panel dg-detail"); panel.setAttribute("data-diagram-ui", "");
    const head = el("div", "dg-panel-head");
    const left = el("div"); left.style.display = "flex"; left.style.alignItems = "center"; left.style.gap = "10px";
    const tile = el("div", "dg-tile");
    tile.style.width = "36px"; tile.style.height = "36px";
    tile.style.backgroundColor = "color-mix(in oklab, " + color + " 14%, transparent)";
    tile.appendChild(iconSpan(catIconName(node.category), 20, color));
    const txt = el("div");
    txt.appendChild(el("div", "dg-panel-title", node.label));
    txt.appendChild(el("div", "dg-panel-sub", m.labelKo + (node.tech ? " · " + node.tech : "")));
    left.appendChild(tile); left.appendChild(txt);
    head.appendChild(left);
    const close = el("button", "dg-btn icon dg-panel-close"); close.innerHTML = uiIcon("X", 14);
    close.addEventListener("click", () => { selected = null; renderDetailPanel(); applyHighlight(); });
    head.appendChild(close);
    panel.appendChild(head);
    if (node.description) panel.appendChild(el("div", "dg-panel-body", node.description));
    if (node.table) {
      const p = el("div", "dg-panel-body", (node.table.columns.length) + "개 컬럼");
      panel.appendChild(p);
    }
    if (node.href) {
      const wrap = el("div", "dg-href");
      const a = el("a"); a.href = "#"; a.title = node.href;
      a.appendChild(document.createTextNode("상세 보기: " + node.href));
      a.appendChild(iconSpan("ZoomIn", 14));
      a.addEventListener("click", (e) => { e.preventDefault(); navigateHref(node.href); });
      wrap.appendChild(a); panel.appendChild(wrap);
    }
    root.appendChild(panel);
    makeDraggable(head, panel);
    detailEl = panel;
  }

  /* ---- 플로우 단계 패널 ---- */
  let stepsEl = null;
  function renderStepsPanel() {
    if (stepsEl) { stepsEl.remove(); stepsEl = null; }
    if (!flowId) return;
    const flow = SPEC.flows.find(f => f.id === flowId);
    if (!flow) return;
    const panel = el("div", "dg-ui dg-panel dg-steps"); panel.setAttribute("data-diagram-ui", "");
    const head = el("div", "dg-panel-head");
    head.appendChild(iconSpan("GripVertical", 14)).classList.add("grip");
    head.appendChild(el("span", "dg-panel-title", flow.label));
    const close = el("button", "dg-btn icon dg-panel-close"); close.innerHTML = uiIcon("X", 14);
    close.addEventListener("click", () => setFlow(null));
    head.appendChild(close);
    panel.appendChild(head);
    if (flow.description) panel.appendChild(el("div", "dg-panel-body", flow.description));
    const ol = el("ol");
    flow.steps.forEach((s, i) => {
      const li = el("li"); li.setAttribute("data-step", String(i + 1));
      if (activeStep === i + 1) li.classList.add("active");
      li.appendChild(el("span", "dg-stepnum", String(i + 1)));
      li.appendChild(el("span", null, s.text));
      li.addEventListener("click", () => setActiveStep(i + 1));
      ol.appendChild(li);
    });
    panel.appendChild(ol);
    root.appendChild(panel);
    makeDraggable(head, panel);
    stepsEl = panel;
  }

  /* ========================================================================
   * 부트
   * ======================================================================== */
  function remeasureAndDraw() {
    measure(); computeEdges(); renderEdges(); renderGroups();
  }

  renderNodes();
  renderTitleBar();
  renderFlowSelector();
  renderToolbar();
  renderWarning();
  renderLegend();
  applyTransform();
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", SPEC.title + " — 노드 " + SPEC.nodes.length + "개, 엣지 " +
    SPEC.edges.length + "개" + (SPEC.groups.length ? ", 그룹 " + SPEC.groups.length + "개" : "") +
    (SPEC.flows.length ? ", 플로우 " + SPEC.flows.length + "개" : ""));

  // 레이아웃 안정화 후 측정 → 엣지/그룹 → fit (useDiagramMeasure 패턴)
  requestAnimationFrame(() => {
    remeasureAndDraw();
    if (!firstFit && contentSize.w > 0) { firstFit = true; fit(); }
    remeasureAndDraw();
  });

  // 웹폰트 적용 후 재측정 (document.fonts.ready)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { remeasureAndDraw(); }).catch(() => {});
  }

  // 리사이즈 시 재측정
  const ro = new ResizeObserver(() => remeasureAndDraw());
  ro.observe(content);
  window.addEventListener("resize", () => remeasureAndDraw());
})();
`;

/* ---- HTML 셸 ---- */
const TEMPLATE = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>__TITLE__</title>
<style>${CSS}</style>
</head>
<body>
<div id="dg-root"></div>
<script>
window.__DIAGRAM_SPEC__ = __SPEC_JSON__;
window.__DIAGRAM_ICONS__ = ${ICONS_JSON};
</script>
<script>${ENGINE_JS}</script>
</body>
</html>
`;

/* =========================================================================
 * 6. main
 * ========================================================================= */

function main() {
  const { input, output, help } = parseArgs(process.argv);
  if (help) { usage(); process.exit(0); }
  if (!input) {
    console.error("오류: spec.json 경로가 필요합니다.\n");
    usage();
    process.exit(1);
  }

  const inPath = resolve(input);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(inPath, "utf8"));
  } catch (e) {
    console.error(`오류: '${inPath}' 를 읽거나 파싱할 수 없습니다 — ${e.message}`);
    process.exit(1);
  }

  // info-hub 픽스처는 { slug, title, kind, spec:{...} } 래퍼. spec 본문을 꺼낸다.
  const spec = parsed && typeof parsed === "object" && parsed.spec ? parsed.spec : parsed;

  const errs = validate(spec);
  if (errs.length) {
    console.error(`검증 실패 (${errs.length}건):`);
    for (const e of errs) console.error("  - " + e);
    process.exit(1);
  }
  normalize(spec);

  const html = buildHtml(spec);
  const outPath = output
    ? resolve(output)
    : join(dirname(inPath), basename(inPath).replace(/\.json$/i, "") + ".html");
  writeFileSync(outPath, html, "utf8");

  const nodeCount = spec.nodes.length;
  const edgeCount = spec.edges.length;
  const flowCount = spec.flows.length;
  console.log(`렌더 완료: ${outPath}`);
  console.log(`  노드 ${nodeCount} · 엣지 ${edgeCount} · 플로우 ${flowCount} · ${(html.length / 1024).toFixed(0)}KB`);
}

main();
