#!/usr/bin/env node
/**
 * parity-check.mjs — 뷰어 프레임 패리티 게이트 (viewer-frame-contract.md §7).
 *
 * 레거시 render.mjs 산출물과 신형(엔진+viewer-frame) 산출물을 기능 마커 단위로
 * 대조한다. 목적: 레거시가 제공하던 뷰어 기능이 신형에서 사라지지 않았는지의
 * 자동 검출(기능 소실 게이트). 시각 품질·인터랙션 손맛은 수동 대조가 정본이며,
 * 이 스크립트는 그 전제 조건을 기계로 못박는다.
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

function legacyRender(sample) {
  const out = join(t, `legacy-${sample}.html`);
  execFileSync(process.execPath, [RENDER, join(REFS, `${sample}.json`), "-o", out], { stdio: "pipe" });
  return readFileSync(out, "utf8");
}
function engineRender(example) {
  execFileSync("bun", [join(ENGINE, "src", "cli", "index.ts"), "render", join(ENGINE, "examples", `${example}.ts`), "--out", t], { stdio: "pipe", cwd: ENGINE });
  return readFileSync(join(t, `${example}.html`), "utf8");
}

/** 대조쌍: (레거시 샘플, 신형 예제, 플로우 유무) — 내용 1:1이 아니라 "기능 커버리지" 대조다 */
const PAIRS = [
  ["sample-msa-infra", "msa-sample", { legacyFlows: true, newFlows: false }],
  ["sample-erd", "erd-sample", { legacyFlows: false, newFlows: false }],
  ["sample-event-flow", "flow-sample", { legacyFlows: true, newFlows: true }],
];

let failures = 0;
try {
  for (const [legacySample, engineExample, flows] of PAIRS) {
    const legacy = legacyRender(legacySample);
    const fresh = engineRender(engineExample);
    console.log(`\n■ ${legacySample}(구) ↔ ${engineExample}(신)`);
    for (const [name, re, cond, mode] of FEATURES) {
      const applyLegacy = cond !== "flows" || flows.legacyFlows;
      const applyNew = cond !== "flows" || flows.newFlows;
      const inLegacy = applyLegacy ? re.test(legacy) : null;
      const inNew = applyNew ? re.test(fresh) : null;
      // 게이트 조건: 레거시에 있던 기능이 신형(적용 대상일 때)에 없으면 실패.
      const lost = mode !== "new-only-fix" && inLegacy === true && applyNew && inNew === false;
      const missingFix = mode === "new-only-fix" && inNew === false;
      const mark = lost || missingFix ? "✗" : "✓";
      if (lost || missingFix) failures++;
      const fmt = (v, applied) => (applied ? (v ? "있음" : "없음") : "해당없음");
      console.log(`  ${mark} ${name.padEnd(20)} 구:${fmt(inLegacy, applyLegacy)}  신:${fmt(inNew, applyNew)}`);
    }
  }
} finally {
  clean();
}

console.log(failures === 0
  ? "\n게이트 통과 — 레거시 뷰어 기능이 신형 프레임에서 소실되지 않았다."
  : `\n게이트 실패 ${failures}건 — 위 ✗ 항목이 신형에서 소실됐다.`);
process.exit(failures === 0 ? 0 : 1);
