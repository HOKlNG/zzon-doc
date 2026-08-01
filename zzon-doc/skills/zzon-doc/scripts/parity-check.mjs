#!/usr/bin/env node
/**
 * parity-check.mjs — 뷰어 프레임 패리티 게이트 (viewer-frame-contract.md §7).
 *
 * 레거시 render.mjs 산출물과 신형(엔진+viewer-frame) 산출물을 기능 마커 단위로
 * 대조한다. 목적: 레거시가 제공하던 뷰어 기능이 신형에서 사라지지 않았는지의
 * 자동 검출(기능 소실 게이트). 시각 품질·인터랙션 손맛은 수동 대조가 정본이며,
 * 이 스크립트는 그 전제 조건을 기계로 못박는다.
 *
 * 두 가지 대조 모드:
 *   A) 같은 입력(SAME-INPUT): 동일한 레거시 DiagramSpec JSON을 render.mjs와
 *      엔진 CLI(변환 내장) 양쪽으로 렌더해 기능 매트릭스를 돌리고,
 *      스펙의 node/edge/flow 개수가 엔진 scene.json과 일치하는지까지 못박는다.
 *   B) 근사쌍: 레거시 샘플 ↔ 비슷한 엔진 예제(.ts) — 기능 커버리지 대조(기존 방식).
 *
 *   사용법: node parity-check.mjs   (플러그인 어디서 실행해도 됨, bun 필요)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const RENDER = join(HERE, "render.mjs");
const REFS = join(HERE, "..", "references");
const ENGINE = join(HERE, "..", "..", "..", "engine");

/** 기능 마커: [이름, 판정 regex, 조건("flows"면 플로우 있는 문서만), 적용 대상] */
const FEATURES = [
  ["타이틀바+종류 칩", /(dg-titlebar|frame-titlebar)/, null],
  ["툴바: 맞춤/리셋", /(맞춤|화면에 맞춤|frame-toolbar)[\s\S]*?(리셋|초기화|reset)/i, null],
  ["툴바: 라벨 토글", /(라벨|label)/i, null],
  ["툴바: SVG 내보내기", /(SVG)/, null],
  ["툴바: PNG 내보내기", /(PNG)/, null],
  ["테마 토글", /(테마|theme)/i, null],
  ["테마 영속(zzon-theme)", /zzon-theme/, null, "new-only-fix"], // 레거시 버그 — 신형만 요구
  ["우측 상세 사이드바", /(dg-side|frame-side)/, null],
  ["툴팁 시스템", /dg-tip/, null],
  ["범례", /(범례|dg-legend|frame-legend)/, null],
  ["플로우 버튼/스트립", /(dg-flow|frame-flow|frame-stepstrip)/, "flows"],
  ["스텝 배지", /(step-badge|flow-badges|data-step)/, "flows"],
  ["팬/줌 뷰포트", /(dg-viewport|frame-viewport)/, null],
  ["드릴다운 postMessage", /zzon:navigate/, null],
  ["사이드바 postMessage", /zzon:sidebar/, null],
  ["a11y role=img", /role="img"/, null],
  ["reduced-motion 배려", /prefers-reduced-motion/, null],
];

const t = mkdtempSync(join(tmpdir(), "parity-"));
const clean = () => rmSync(t, { recursive: true, force: true });

function loadSpec(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return raw && raw.spec ? raw.spec : raw; // { spec: {...} } 래퍼 허용
}
function legacyRender(sample) {
  const out = join(t, `legacy-${sample}.html`);
  execFileSync(process.execPath, [RENDER, join(REFS, `${sample}.json`), "-o", out], { stdio: "pipe" });
  return readFileSync(out, "utf8");
}
function engineRender(example) {
  execFileSync("bun", [join(ENGINE, "src", "cli", "index.ts"), "render", join(ENGINE, "examples", `${example}.ts`), "--out", t], { stdio: "pipe", cwd: ENGINE });
  return readFileSync(join(t, `${example}.html`), "utf8");
}
/** 같은입력 모드: 레거시 JSON을 엔진 CLI로 렌더 (계약상 slug = json 파일명) */
function engineRenderJson(sample) {
  execFileSync("bun", [join(ENGINE, "src", "cli", "index.ts"), "render", join(REFS, `${sample}.json`), "--out", t], { stdio: "pipe", cwd: ENGINE });
  return {
    html: readFileSync(join(t, `${sample}.html`), "utf8"),
    scene: JSON.parse(readFileSync(join(t, `${sample}.scene.json`), "utf8")),
  };
}

/** 기능 매트릭스를 돌리고 소실 건수를 돌려준다 */
function checkFeatures(legacy, fresh, flows) {
  let lostCount = 0;
  for (const [name, re, cond, mode] of FEATURES) {
    const applyLegacy = cond !== "flows" || flows.legacyFlows;
    const applyNew = cond !== "flows" || flows.newFlows;
    const inLegacy = applyLegacy ? re.test(legacy) : null;
    const inNew = applyNew ? re.test(fresh) : null;
    // 게이트 조건: 레거시에 있던 기능이 신형(적용 대상일 때)에 없으면 실패.
    const lost = mode !== "new-only-fix" && inLegacy === true && applyNew && inNew === false;
    const missingFix = mode === "new-only-fix" && inNew === false;
    const mark = lost || missingFix ? "✗" : "✓";
    if (lost || missingFix) lostCount++;
    const fmt = (v, applied) => (applied ? (v ? "있음" : "없음") : "해당없음");
    console.log(`  ${mark} ${name.padEnd(20)} 구:${fmt(inLegacy, applyLegacy)}  신:${fmt(inNew, applyNew)}`);
  }
  return lostCount;
}

/** A) 같은입력 대조 대상: 동일 JSON을 양쪽으로 렌더한다 (kind:"sequence"는 엔진 대상 아님) */
const SAME_INPUT = ["sample-context", "sample-erd", "sample-msa-infra", "sample-event-flow"];

/** B) 근사쌍: (레거시 샘플, 신형 예제, 플로우 유무) — 내용 1:1이 아니라 "기능 커버리지" 대조다 */
const PAIRS = [
  ["sample-msa-infra", "msa-sample", { legacyFlows: true, newFlows: false }],
  ["sample-erd", "erd-sample", { legacyFlows: false, newFlows: false }],
  ["sample-event-flow", "flow-sample", { legacyFlows: true, newFlows: true }],
];

let failures = 0;
try {
  // A) 같은입력 게이트: 기능 소실 + node/edge/flow 개수 불일치 모두 실패
  for (const sample of SAME_INPUT) {
    const spec = loadSpec(join(REFS, `${sample}.json`));
    const hasFlows = Array.isArray(spec.flows) && spec.flows.length > 0;
    const legacy = legacyRender(sample);
    console.log(`\n■ [같은입력] ${sample}.json — render.mjs(구) ↔ 엔진 CLI(신)`);
    let fresh;
    try {
      fresh = engineRenderJson(sample);
    } catch (e) {
      const out = (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
      console.log(`  ✗ 엔진 CLI가 이 .json을 렌더하지 못했다: ${(out.trim() || e.message).split("\n")[0]}`);
      failures++;
      continue;
    }
    failures += checkFeatures(legacy, fresh.html, { legacyFlows: hasFlows, newFlows: hasFlows });
    // 개수 대조: 레거시 스펙 ↔ 엔진 scene.json — 변환이 요소를 흘리면 여기서 걸린다
    for (const key of ["nodes", "edges", "flows"]) {
      const inSpec = Array.isArray(spec[key]) ? spec[key].length : 0;
      const inScene = Array.isArray(fresh.scene[key]) ? fresh.scene[key].length : 0;
      const ok = inSpec === inScene;
      if (!ok) failures++;
      console.log(`  ${ok ? "✓" : "✗"} count:${key.padEnd(6)} 스펙:${inSpec}  scene.json:${inScene}`);
    }
  }

  // B) 근사쌍 게이트 (기존 방식 유지)
  for (const [legacySample, engineExample, flows] of PAIRS) {
    const legacy = legacyRender(legacySample);
    const fresh = engineRender(engineExample);
    console.log(`\n■ ${legacySample}(구) ↔ ${engineExample}(신)`);
    failures += checkFeatures(legacy, fresh, flows);
  }
} finally {
  clean();
}

console.log(failures === 0
  ? "\n게이트 통과 — 레거시 뷰어 기능이 신형 프레임에서 소실되지 않았고, 같은입력 개수도 일치한다."
  : `\n게이트 실패 ${failures}건 — 위 ✗ 항목(기능 소실 또는 같은입력 개수/렌더 불일치)을 고쳐라.`);
process.exit(failures === 0 ? 0 : 1);
