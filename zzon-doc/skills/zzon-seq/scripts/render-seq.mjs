#!/usr/bin/env node
/**
 * render-seq.mjs — SeqSpec JSON 하나를 인터랙티브 시퀀스 다이어그램 단일 .html로 렌더한다.
 *
 *   사용법:  node render-seq.mjs <spec.json> [-o out.html]
 *
 * 규칙(소유자 표준):
 * - 라이브러리/프레임워크/CDN 0. 순수 바닐라 JS + Node 내장만. 출력은 self-contained —
 *   브라우저로 그냥 연다(file:// 포함).
 * - 뷰어 엔진은 옆의 seq-engine.js가 정본(순수 JS) — 수정 시 브라우저 렌더로 재검증한다.
 * - zzon 셸 규약 구현: zzon:sidebar postMessage, zzon-theme 테마 키.
 * - 스펙 검증 실패 시 'path: 메시지' 형태로 전부 출력하고 exit 1.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = readFileSync(join(HERE, "seq-engine.js"), "utf8");

/* ── 허용값 (정본: references/seq-spec.md) ───────────────────────────── */

const ACTOR_TYPES = [
  "user", "browser", "mobile", "frontend",
  "server", "service", "worker", "auth",
  "database", "cache", "storage",
  "queue", "email", "scheduler",
  "external", "cloud", "container", "cdn", "gateway",
];
const ARROWS = ["sync", "async", "reply"];
const FRAGMENT_KINDS = ["alt", "opt", "loop", "par"];
const STEP_TYPES = ["message", "note", "fragment", "fragment_else", "fragment_end"];
const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

/* ── 검증 ────────────────────────────────────────────────────────────── */

function validate(spec) {
  const errs = [];
  const push = (path, msg) => errs.push(`${path}: ${msg}`);

  if (spec.specVersion !== 1) push("specVersion", "1 이어야 한다");
  if (spec.kind !== "sequence") push("kind", `"sequence" 여야 한다 (지금: ${JSON.stringify(spec.kind)})`);
  if (typeof spec.title !== "string" || !spec.title.trim()) push("title", "비어 있지 않은 문자열이어야 한다");
  for (const k of ["subtitle", "description", "section"]) {
    if (spec[k] !== undefined && typeof spec[k] !== "string") push(k, "문자열이어야 한다");
  }
  if (spec.order !== undefined && typeof spec.order !== "number") push("order", "숫자여야 한다");

  if (!Array.isArray(spec.actors) || spec.actors.length === 0) {
    push("actors", "액터가 1개 이상 있어야 한다");
    return errs;
  }
  const ids = new Set();
  spec.actors.forEach((a, i) => {
    const at = `actors[${i}]`;
    if (!a || typeof a !== "object") { push(at, "객체여야 한다"); return; }
    if (typeof a.id !== "string" || !SLUG_RE.test(a.id)) push(`${at}.id`, `slug 형식이어야 한다 (${SLUG_RE})`);
    else if (ids.has(a.id)) push(`${at}.id`, `중복 id "${a.id}"`);
    else ids.add(a.id);
    if (typeof a.name !== "string" || !a.name.trim()) push(`${at}.name`, "비어 있지 않은 문자열이어야 한다");
    if (!ACTOR_TYPES.includes(a.type)) push(`${at}.type`, `허용값이 아니다: ${JSON.stringify(a.type)} — 사용 가능: ${ACTOR_TYPES.join(", ")}`);
  });

  if (!Array.isArray(spec.steps) || spec.steps.length === 0) {
    push("steps", "스텝이 1개 이상 있어야 한다");
    return errs;
  }
  const used = new Set();
  let depth = 0;
  let msgCount = 0;
  spec.steps.forEach((s, i) => {
    const at = `steps[${i}]`;
    if (!s || typeof s !== "object" || !STEP_TYPES.includes(s.type)) {
      push(at, `type이 허용값이 아니다 — 사용 가능: ${STEP_TYPES.join(", ")}`);
      return;
    }
    switch (s.type) {
      case "message":
        msgCount++;
        for (const key of ["from", "to"]) {
          if (!ids.has(s[key])) push(`${at}.${key}`, `알 수 없는 actor ${JSON.stringify(s[key])} — 사용 가능: ${[...ids].join(", ")}`);
          else used.add(s[key]);
        }
        if (!ARROWS.includes(s.arrow)) push(`${at}.arrow`, `허용값이 아니다 — 사용 가능: ${ARROWS.join(", ")}`);
        if (typeof s.label !== "string" || !s.label.trim()) push(`${at}.label`, "비어 있지 않은 문자열이어야 한다");
        break;
      case "note":
        if (!ids.has(s.actor)) push(`${at}.actor`, `알 수 없는 actor ${JSON.stringify(s.actor)}`);
        else used.add(s.actor);
        if (typeof s.text !== "string" || !s.text.trim()) push(`${at}.text`, "비어 있지 않은 문자열이어야 한다");
        break;
      case "fragment":
        depth++;
        if (!FRAGMENT_KINDS.includes(s.kind)) push(`${at}.kind`, `허용값이 아니다 — 사용 가능: ${FRAGMENT_KINDS.join(", ")}`);
        if (typeof s.label !== "string" || !s.label.trim()) push(`${at}.label`, "비어 있지 않은 문자열이어야 한다");
        break;
      case "fragment_else":
        if (depth === 0) push(at, "fragment 밖의 fragment_else");
        break;
      case "fragment_end":
        if (depth === 0) push(at, "짝이 없는 fragment_end");
        else depth--;
        break;
    }
  });
  if (depth !== 0) push("steps", `닫히지 않은 fragment가 ${depth}개 있다`);
  if (msgCount === 0) push("steps", "message 스텝이 1개 이상 있어야 한다");
  for (const a of spec.actors) {
    if (a.id && !used.has(a.id)) push(`actors(${a.id})`, "어떤 메시지/노트에도 등장하지 않는다");
  }
  const essential = spec.steps.filter((s) => s.type === "message" && s.essential).length;
  if (msgCount >= 8 && essential === 0) {
    push("steps", "essential:true 메시지가 하나도 없다 — 간소화 보기가 비게 된다 (핵심 30~40%에 표시해라)");
  }
  return errs;
}

/* ── 템플릿 ──────────────────────────────────────────────────────────── */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function buildHtml(spec, slug) {
  const payload = JSON.stringify({ ...spec, slug }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(spec.title)}</title>
</head>
<body>
<script id="zzon-seq-spec" type="application/json">${payload}</script>
<script>${ENGINE}</script>
</body>
</html>
`;
}

/* ── CLI ─────────────────────────────────────────────────────────────── */

function main() {
  const args = process.argv.slice(2);
  let specPath = null;
  let outPath = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o") outPath = args[++i];
    else if (args[i] === "-h" || args[i] === "--help") { usage(); process.exit(0); }
    else if (!specPath) specPath = args[i];
  }
  if (!specPath) { usage(); process.exit(1); }

  let raw;
  try {
    raw = JSON.parse(readFileSync(specPath, "utf8"));
  } catch (e) {
    console.error(`JSON 파싱 실패: ${e.message}`);
    process.exit(1);
  }
  const spec = raw && raw.spec ? raw.spec : raw; // { spec: {...} } 래퍼 허용

  const errs = validate(spec);
  if (errs.length) {
    console.error(`SeqSpec 검증 실패 (${errs.length}건):`);
    for (const e of errs) console.error(`  - ${e}`);
    process.exit(1);
  }

  const slug = basename(specPath, ".json");
  const out = outPath || join(dirname(specPath), `${slug}.html`);
  writeFileSync(out, buildHtml(spec, slug));
  const msgs = spec.steps.filter((s) => s.type === "message").length;
  console.log(`렌더 완료: ${out} (액터 ${spec.actors.length} · 메시지 ${msgs})`);
}

function usage() {
  console.log(`zzon-seq render — SeqSpec JSON을 시퀀스 다이어그램 .html로 렌더한다

사용법:
  node render-seq.mjs <spec.json> [-o out.html]

스펙 정본: ../references/seq-spec.md (kind:"sequence", actors[], steps[])`);
}

main();
