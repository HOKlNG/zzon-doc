/**
 * viewer-frame.test.mjs — 프레임 모듈 스모크 테스트 (node --test)
 *
 * 검증 대상: skills/zzon-doc/scripts/viewer-frame.js
 * 계약: skills/zzon-doc/references/viewer-frame-contract.md (v1)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildViewerHtml, FRAME_GLYPHS } from "./viewer-frame.js";

const MODULE_URL = new URL("./viewer-frame.js", import.meta.url);

/* ---- 스텁 payload (계약 §1) + 스텁 canvas ---- */
function stubPayload() {
  return {
    id: "sample-flow",
    title: "주문 <데이터> 파이프라인",
    kind: "data-flow",
    description: "주문 이벤트가 흘러가는 경로",
    counts: { nodes: 3, edges: 2, flows: 1, groups: 0 },
    warnings: ["레이아웃 경고: 교차 2건", "라벨 잘림 1건"],
    nodes: [
      { path: "web", label: "웹", category: "frontend", tech: "Next.js", description: "프론트", href: "web-detail" },
      { path: "api", label: "API", category: "backend", tech: "NestJS" },
      {
        path: "db", label: "DB", category: "data",
        table: {
          columns: [
            { name: "id", type: "uuid", pk: true },
            { name: "user_id", type: "uuid", fk: { table: "users", column: "id" }, nullable: true },
          ],
        },
      },
    ],
    edges: [
      { id: "e0", from: "web", to: "api", label: "HTTPS", layer: "app" },
      { id: "e1", from: "api", to: "db", label: "SQL", layer: "data" },
      { id: "e2", from: "api", to: "ghost", label: "누락 endpoint", layer: "data" },
    ],
    flows: [
      {
        id: "order", title: "주문 흐름", description: "주문 생성 경로",
        steps: [
          { edgeId: "e0", text: "요청", n: 1 },
          { edgeId: "e1", text: "저장", n: 2 },
        ],
      },
    ],
    legend: [
      { group: "category", label: "프론트엔드", swatch: { type: "dot", color: "#0ea5e9" } },
      { group: "edge", label: "비동기", swatch: { type: "line", color: "#71717a", dash: "6 4" } },
      { group: "groupKind", label: "VPC", swatch: { type: "border", color: "#10b981", dash: "3 2" } },
    ],
    assets: { svgFile: "sample-flow.svg", pngFile: "sample-flow.png" },
  };
}

function stubCanvas() {
  return {
    markup: '<svg id="stub-canvas" viewBox="0 0 10 10"></svg>',
    css: ".stub-canvas-css{color:red}",
    js: "/* stub-canvas-js */ window.__zzonFrame.register({ el: document.getElementById('stub-canvas'), highlight: function(){}, setLabelMode: function(){}, fit: function(){}, reset: function(){}, canvasShift: function(){}, refresh: function(){}, export: function(){ return null; }, toolbarExtras: function(){ return null; } });",
  };
}

function build() {
  return buildViewerHtml({ payload: stubPayload(), canvas: stubCanvas() });
}

/* ---- 크롬 문자열 목록 (한국어 라벨 — FRAME_GLYPHS 커버리지 대상) ---- */
const CHROME_STRINGS = [
  "인프라", "데이터 흐름", "ERD", "에이전트 구조",
  "화면 맞춤", "보기 초기화", "라벨 항상 표시 (줌아웃해도 유지)",
  "SVG로 내보내기 (벡터 — 문서·Figma에 그대로)", "PNG로 내보내기 (2배 해상도)",
  "테마 전환", "SVG", "PNG",
  "범례", "닫기", "컬럼", "연결", "단계", "상세 보기: ",
  "FK", "UQ", "N", "→", "←",
  "노드", "엣지", "그룹", "플로우", "개", " 외 ", "건",
  "0123456789",
];

/* =========================================================================
 * 기본 구조
 * ========================================================================= */

test("자기완결 HTML 문서를 생성한다", () => {
  const html = build();
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes('<html lang="ko">'));
  assert.ok(html.includes("<title>"));
  assert.ok(html.includes("</html>"));
});

test("스타일: --frame-* 토큰 + 라이트/다크([data-theme]) + prefers 폴백 + canvas.css 포함", () => {
  const html = build();
  assert.ok(html.includes("--frame-bg"));
  assert.ok(html.includes("--frame-accent"));
  assert.ok(html.includes(':root[data-theme="dark"]'));
  assert.ok(html.includes('@media (prefers-color-scheme:dark){:root:not([data-theme="light"])'));
  assert.ok(html.includes(".stub-canvas-css{color:red}"));
  // 프레임/캔버스 CSS는 한 <style>에 합쳐진다
  const styleCount = (html.match(/<style>/g) || []).length;
  assert.equal(styleCount, 1);
});

test("뷰포트가 canvas.markup을 담고, 프레임 런타임이 canvas.js보다 먼저 실행된다", () => {
  const html = build();
  const vp = html.indexOf('<div class="frame-viewport" id="frame-viewport">');
  assert.ok(vp !== -1);
  assert.ok(html.indexOf('<svg id="stub-canvas"') > vp);
  const runtimeAt = html.indexOf("window.__zzonFrame = api");
  const canvasJsAt = html.indexOf("/* stub-canvas-js */");
  assert.ok(runtimeAt !== -1 && canvasJsAt !== -1 && runtimeAt < canvasJsAt);
  assert.ok(html.includes("window.__zzonFrame.register("));
});

/* =========================================================================
 * 크롬 조각 (타이틀바 / 플로우 / 경고 / 범례 / 사이드바 / 툴바 / 툴팁)
 * ========================================================================= */

test("타이틀바: kind 칩(한국어) + 제목(이스케이프) + description 툴팁", () => {
  const html = build();
  assert.ok(html.includes('class="frame-ui frame-titlebar"'));
  assert.ok(html.includes("데이터 흐름")); // kind=data-flow 칩
  assert.ok(html.includes("주문 &lt;데이터&gt; 파이프라인"));
  assert.ok(!html.includes("주문 <데이터> 파이프라인")); // 원문 그대로는 금지
  assert.ok(html.includes('data-tip="주문 이벤트가 흘러가는 경로"'));
});

test("플로우 버튼 + 순번 스트립 컨테이너", () => {
  const html = build();
  assert.ok(html.includes('data-flow-id="order"'));
  assert.ok(html.includes("주문 흐름"));
  assert.ok(html.includes('id="frame-stepstrip"'));
});

test("경고 칩: 첫 경고 + 나머지 개수, 전체는 툴팁으로", () => {
  const html = build();
  assert.ok(html.includes('class="frame-ui frame-warn"'));
  assert.ok(html.includes("레이아웃 경고: 교차 2건 외 1건"));
  assert.ok(html.includes("레이아웃 경고: 교차 2건&#10;라벨 잘림 1건"));
  assert.ok(html.includes('style="top:132px"')); // 플로우가 있으면 스트립 아래
});

test("범례: 접을 수 있는 details + payload 색상 스와치 3종", () => {
  const html = build();
  assert.ok(html.includes('<details class="frame-ui frame-legend" id="frame-legend" data-frame-ui open>'));
  assert.ok(html.includes("<summary>범례</summary>"));
  assert.ok(html.includes("프론트엔드"));
  assert.ok(html.includes('style="background:#0ea5e9"')); // dot
  assert.ok(html.includes('stroke="#71717a" stroke-width="1.5" stroke-dasharray="6 4"')); // line
  assert.ok(html.includes('stroke="#10b981" stroke-width="1.2" stroke-dasharray="3 2"')); // border
  assert.ok(html.includes('<span class="sep">')); // group 경계 구분자
});

test("사이드바 스켈레톤 + 툴팁 싱글턴(#dg-tip)", () => {
  const html = build();
  assert.ok(html.includes('<aside class="frame-ui frame-side" id="frame-side" data-frame-ui></aside>'));
  assert.ok(html.includes('<div id="dg-tip"></div>'));
});

test("툴바: fit·reset·라벨 토글·SVG·PNG·테마 + extras 슬롯 (한국어 라벨)", () => {
  const html = build();
  for (const act of ["fit", "reset", "labels", "export-svg", "export-png", "theme"]) {
    assert.ok(html.includes('data-act="' + act + '"'), "toolbar button: " + act);
  }
  assert.ok(html.includes('aria-label="화면 맞춤"'));
  assert.ok(html.includes('aria-label="보기 초기화"'));
  assert.ok(html.includes('aria-label="라벨 항상 표시 (줌아웃해도 유지)"'));
  assert.ok(html.includes("SVG로 내보내기"));
  assert.ok(html.includes("PNG로 내보내기"));
  assert.ok(html.includes('aria-label="테마 전환"'));
  assert.ok(html.includes('id="frame-extras"'));
});

test("사이드바 런타임 한국어 라벨이 STR 주입으로 포함된다", () => {
  const html = build();
  for (const s of ["컬럼", "연결", "단계", "닫기", "상세 보기: "]) {
    assert.ok(html.includes(s), "sidebar string: " + s);
  }
});

/* =========================================================================
 * 프로토콜 / 계약 리터럴
 * ========================================================================= */

test("셸 프로토콜 (§4): zzon:* 3종 + parent 가드 + 테마 키", () => {
  const html = build();
  assert.ok(html.includes('"zzon:navigate"') || html.includes("zzon:navigate"));
  assert.ok(html.includes("zzon:sidebar"));
  assert.ok(html.includes("zzon:sidebar-close"));
  assert.ok(html.includes("window.parent !== window"));
  assert.ok(html.includes('"zzon-theme"'));
  assert.ok(html.includes("prefers-color-scheme: dark")); // 런타임 폴백
  assert.ok(html.includes('"storage"')); // 형제 iframe 동기화
});

test("드릴다운 (§5): 스킴 검사·slug 정규식·_blank", () => {
  const html = build();
  assert.ok(html.includes("^[a-z][a-z0-9+.-]*:"));
  assert.ok(html.includes("^[a-z0-9_-]+$"));
  assert.ok(html.includes('"_blank"'));
  assert.ok(html.includes("noopener"));
});

test("어댑터 인터페이스 (§2): 명령·콜백·시프트·엠베드 리터럴", () => {
  const html = build();
  for (const name of [
    "highlight", "setLabelMode", "fit", "reset", "canvasShift", "refresh",
    "export", "toolbarExtras",
    "onNodeSelected", "onNodeActivated", "onStepClicked", "onHover",
  ]) {
    assert.ok(html.includes(name), "adapter member: " + name);
  }
  assert.ok(html.includes("-152") && html.includes("152")); // canvasShift(±152)
  assert.ok(html.includes("460")); // 440px 엠베드 컴팩트 임계
  assert.ok(html.includes('"Escape"'));
});

test("내보내기 폴백 (§6): assets 파일명 + svgFile/pngFile 참조", () => {
  const html = build();
  assert.ok(html.includes("svgFile"));
  assert.ok(html.includes("pngFile"));
  assert.ok(html.includes("sample-flow.svg")); // payload JSON
});

test("헤드리스 훅 (§7): window.__zzonFramePayload", () => {
  const html = build();
  assert.ok(html.includes("window.__zzonFramePayload = {"));
});

/* =========================================================================
 * a11y
 * ========================================================================= */

test("role=img + counts 기반 aria-label (0인 그룹은 생략)", () => {
  const html = build();
  assert.ok(html.includes('role="img"'));
  assert.ok(html.includes("노드 3개, 엣지 2개"));
  assert.ok(html.includes("플로우 1개"));
  assert.ok(!/aria-label="[^"]*그룹/.test(html));
});

/* =========================================================================
 * FRAME_GLYPHS
 * ========================================================================= */

test("FRAME_GLYPHS가 모든 크롬 문자열의 문자를 덮는다", () => {
  assert.equal(typeof FRAME_GLYPHS, "string");
  assert.ok(FRAME_GLYPHS.length > 0);
  for (const s of CHROME_STRINGS) {
    for (const ch of s) {
      assert.ok(FRAME_GLYPHS.includes(ch), "글리프 누락: " + JSON.stringify(ch) + " (in " + JSON.stringify(s) + ")");
    }
  }
});

test("FRAME_GLYPHS가 런타임 주입 STR 전체를 덮는다 (구성상 보장 검증)", () => {
  const html = build();
  const m = html.match(/window\.__zzonFrameStr = (.*);/);
  assert.ok(m, "__zzonFrameStr 주입이 없다");
  const injected = JSON.parse(m[1]);
  assert.ok(Object.keys(injected).length >= 20);
  for (const [key, value] of Object.entries(injected)) {
    for (const ch of String(value)) {
      assert.ok(FRAME_GLYPHS.includes(ch), "글리프 누락: " + JSON.stringify(ch) + " (STR." + key + ")");
    }
  }
});

/* =========================================================================
 * 격리 (§8) / 안전성 / 안정성
 * ========================================================================= */

test("엔진 임포트 금지: 모듈은 아무것도 import하지 않는다", () => {
  const src = readFileSync(MODULE_URL, "utf8");
  assert.ok(!/^\s*import[\s("']/m.test(src), "import 구문 발견");
  assert.ok(!/\brequire\s*\(/.test(src), "require 호출 발견");
  assert.ok(!/\bfrom\s+["']/.test(src), "from 절 발견");
  assert.ok(!/engine\//.test(src), "engine 경로 참조 발견");
});

test("사용자 문자열 이스케이프: script 브레이크아웃·HTML 주입 차단", () => {
  const payload = stubPayload();
  payload.title = 'x</script><script>window.evil=1</script><img src=x onerror=alert(1)>';
  payload.warnings = ['경고 "따옴표" & <태그>'];
  payload.legend[0].label = "<b>범례주입</b>";
  const html = buildViewerHtml({ payload, canvas: stubCanvas() });
  assert.ok(!html.includes("</script><script>window.evil"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<b>범례주입</b>"));
  assert.ok(html.includes("\\u003c/script")); // JSON 안에서는 유니코드 이스케이프
  assert.ok(html.includes("&lt;b&gt;범례주입&lt;/b&gt;"));
});

test("같은 입력이면 바이트 단위로 동일한 HTML (그리고 payload를 변형하지 않는다)", () => {
  const p1 = stubPayload();
  const snapshot = JSON.stringify(p1);
  const a = buildViewerHtml({ payload: p1, canvas: stubCanvas() });
  const b = buildViewerHtml({ payload: stubPayload(), canvas: stubCanvas() });
  assert.equal(a, b);
  assert.equal(JSON.stringify(p1), snapshot);
});

test("payload/canvas가 없으면 TypeError", () => {
  assert.throws(() => buildViewerHtml(), TypeError);
  assert.throws(() => buildViewerHtml({ payload: stubPayload() }), TypeError);
  assert.throws(() => buildViewerHtml({ canvas: stubCanvas() }), TypeError);
});

test("선택 섹션 생략: 플로우/범례/경고 없는 payload", () => {
  const html = buildViewerHtml({
    payload: { id: "mini", title: "미니", kind: "erd", counts: { nodes: 0, edges: 0 } },
    canvas: { markup: "", css: "", js: "" },
  });
  assert.ok(!html.includes('class="frame-ui frame-flowcol"'));
  assert.ok(!html.includes('id="frame-legend"'));
  assert.ok(!html.includes('class="frame-ui frame-warn"'));
  assert.ok(html.includes(">ERD<") || html.includes("ERD</span>") || html.includes("ERD")); // kind 칩
  assert.ok(html.includes("노드 0개, 엣지 0개"));
});

test("생성된 인라인 스크립트 3개가 모두 문법적으로 유효하다", () => {
  const html = build();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 3); // payload+STR+ICONS / 프레임 런타임 / canvas.js
  for (const body of scripts) {
    assert.doesNotThrow(() => new Function(body)); // 파싱만 (실행 아님)
  }
});
