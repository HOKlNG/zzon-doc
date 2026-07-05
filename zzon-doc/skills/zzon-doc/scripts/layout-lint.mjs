#!/usr/bin/env node
// layout-lint.mjs — render.mjs의 배치 수식(플렉스 열·간격 상수)을 재현해
// 그룹 박스 겹침과 "비멤버 노드 삼킴"을 렌더 전에 검사한다. 스펙 저작 후 실행: node layout-lint.mjs <spec.json>
// 상수 출처: .dg-lanes padding 72 / lane gap 88 / item gap 40 / 그룹 경계 마진 36
//            카드 192×~55, 테이블 240×(34+28*cols), 그룹 pad 16+height*16
import { readFileSync } from "node:fs";

const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));
spec.groups ??= []; spec.edges ??= []; spec.layout ??= { direction: "RIGHT" };
const isRight = (spec.layout.direction || "RIGHT") === "RIGHT";

const groupById = new Map(spec.groups.map(g => [g.id, g]));
const chainOf = (gid) => {
  const chain = []; const seen = new Set(); let cur = gid;
  while (cur !== undefined && groupById.has(cur) && !seen.has(cur)) {
    seen.add(cur); chain.unshift(cur); cur = groupById.get(cur).parentId;
  }
  return chain;
};
const nodeChain = new Map(spec.nodes.map(n => [n.id, chainOf(n.parentId)]));

// 레인 배정 (엔진 buildLayout 재현: 위상 최장경로 + lane 오버라이드 + 압축)
const lane = new Map();
const indeg = new Map(spec.nodes.map(n => [n.id, 0]));
const out = new Map(spec.nodes.map(n => [n.id, []]));
for (const e of spec.edges) {
  if (!indeg.has(e.source) || !indeg.has(e.target) || e.source === e.target) continue;
  out.get(e.source).push(e.target);
  indeg.set(e.target, indeg.get(e.target) + 1);
}
const q = [];
for (const n of spec.nodes) if (indeg.get(n.id) === 0) { lane.set(n.id, 0); q.push(n.id); }
const rem = new Map(indeg);
while (q.length) {
  const id = q.shift();
  for (const nx of out.get(id)) {
    lane.set(nx, Math.max(lane.get(nx) || 0, lane.get(id) + 1));
    rem.set(nx, rem.get(nx) - 1);
    if (rem.get(nx) === 0) q.push(nx);
  }
}
for (const n of spec.nodes) if (!lane.has(n.id)) lane.set(n.id, 0);
for (const n of spec.nodes) if (n.lane !== undefined) lane.set(n.id, n.lane);
const used = [...new Set(spec.nodes.map(n => lane.get(n.id)))].sort((a, b) => a - b);
const compact = new Map(used.map((v, i) => [v, i]));

const buckets = new Map();
spec.nodes.forEach(n => {
  const li = compact.get(lane.get(n.id));
  if (!buckets.has(li)) buckets.set(li, []);
  buckets.get(li).push(n);
});
const origIdx = new Map(spec.nodes.map((n, i) => [n.id, i]));
for (const items of buckets.values()) {
  items.sort((a, b) => {
    const ao = a.order ?? Infinity, bo = b.order ?? Infinity;
    if (ao !== bo) return ao - bo;
    const ag = nodeChain.get(a.id).join("/") || "￿";
    const bg = nodeChain.get(b.id).join("/") || "￿";
    if (ag !== bg) return ag < bg ? -1 : 1;
    return origIdx.get(a.id) - origIdx.get(b.id);
  });
}

const PAD = 72, LANE_GAP = 88, ITEM_GAP = 40, BOUNDARY = 36;
const sizeOf = (n) => {
  if (n.table) return { w: 240, h: 36 + 29 * (n.table.columns?.length || 0) };
  const desc = spec.layout.nodeDescriptions && n.description;
  return { w: desc ? 220 : 192, h: desc ? 92 : 55 };
};

// 주축 진행: 각 레인의 교차축 길이 계산 → 교차축 center 정렬
const lanesArr = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
const laneCross = new Map(); // 교차축 총 길이
for (const [li, items] of lanesArr) {
  let acc = 0;
  items.forEach((n, i) => {
    const s = sizeOf(n);
    const prev = items[i - 1];
    if (i > 0) acc += ITEM_GAP;
    if (prev && nodeChain.get(prev.id).join() !== nodeChain.get(n.id).join()) acc += BOUNDARY;
    acc += isRight ? s.h : s.w;
  });
  laneCross.set(li, acc);
}
const maxCross = Math.max(...laneCross.values());
const alignStart = spec.layout.align === "start";

const rects = new Map();
let main = PAD;
for (const [li, items] of lanesArr) {
  const laneMainSize = Math.max(...items.map(n => (isRight ? sizeOf(n).w : sizeOf(n).h)));
  let cross = PAD + (alignStart ? 0 : (maxCross - laneCross.get(li)) / 2);
  items.forEach((n, i) => {
    const s = sizeOf(n);
    const prev = items[i - 1];
    if (i > 0) cross += ITEM_GAP;
    if (prev && nodeChain.get(prev.id).join() !== nodeChain.get(n.id).join()) cross += BOUNDARY;
    rects.set(n.id, isRight
      ? { x: main, y: cross, w: s.w, h: s.h }
      : { x: cross, y: main, w: s.w, h: s.h });
    cross += isRight ? s.h : s.w;
  });
  main += laneMainSize + LANE_GAP;
}

// 그룹 박스
const heightOf = new Map();
const sorted = spec.groups.map(g => ({ g, depth: chainOf(g.id).length - 1 })).sort((a, b) => b.depth - a.depth);
for (const { g } of sorted) {
  const kids = spec.groups.filter(c => c.parentId === g.id);
  heightOf.set(g.id, kids.length === 0 ? 0 : Math.max(...kids.map(c => heightOf.get(c.id) || 0)) + 1);
}
const boxes = [];
for (const g of spec.groups) {
  const members = spec.nodes.filter(n => nodeChain.get(n.id).includes(g.id)).map(n => n.id);
  const rs = members.map(id => rects.get(id)).filter(Boolean);
  if (!rs.length) continue;
  const pad = 16 + (heightOf.get(g.id) || 0) * 16;
  const x1 = Math.min(...rs.map(r => r.x)) - pad, y1 = Math.min(...rs.map(r => r.y)) - pad;
  const x2 = Math.max(...rs.map(r => r.x + r.w)) + pad, y2 = Math.max(...rs.map(r => r.y + r.h)) + pad;
  boxes.push({ id: g.id, chain: chainOf(g.id), members: new Set(members), box: { x1, y1, x2, y2 } });
}

// 검사 1: 조상-자손 아닌 그룹끼리 박스 겹침
let bad = 0;
for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
  const A = boxes[i], B = boxes[j];
  if (A.chain.includes(B.id) || B.chain.includes(A.id)) continue;
  const ox = Math.min(A.box.x2, B.box.x2) - Math.max(A.box.x1, B.box.x1);
  const oy = Math.min(A.box.y2, B.box.y2) - Math.max(A.box.y1, B.box.y1);
  if (ox > 4 && oy > 4) { bad++; console.log(`  ✗ 그룹 겹침: ${A.id} × ${B.id} (${Math.round(ox)}×${Math.round(oy)}px)`); }
}
// 검사 2: 비멤버 노드 중심이 그룹 박스 안 (삼킴)
for (const b of boxes) {
  for (const n of spec.nodes) {
    if (b.members.has(n.id)) continue;
    const r = rects.get(n.id);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (cx > b.box.x1 && cx < b.box.x2 && cy > b.box.y1 && cy < b.box.y2) {
      bad++; console.log(`  ✗ 삼킴: 노드 '${n.id}'가 그룹 '${b.id}' 박스 안에 있음`);
    }
  }
}
console.log(bad === 0
  ? `  ✓ ${spec.title} — 그룹 ${boxes.length}개 겹침/삼킴 0 (노드 ${spec.nodes.length}, 레인 ${lanesArr.length})`
  : `FAIL: ${bad}건`);
process.exit(bad === 0 ? 0 : 1);
