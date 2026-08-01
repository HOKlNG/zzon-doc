# viewer-frame 계약 (v1)

> **목적**: 뷰어 크롬(프레임)과 다이어그램 캔버스를 분리한다. 프레임은 레거시
> render.mjs의 UX를 정본으로 단일 모듈(`skills/zzon-doc/scripts/viewer-frame.js`)로
> 재구축하고, 캔버스는 이 계약(payload + adapter)만 구현하면 어떤 엔진이든 꽂힌다.
> v1 프레임은 **새 엔진(SVG) 캔버스만** 수용한다(스트랭글러) — 레거시 render.mjs는
> 동결 상태로 병행하며, F3 패리티 게이트 통과 후에만 퇴역시킨다.
> 종착점: 캔버스 = 엔진 하나, 입력 = DiagramSpec JSON(호환 변환) + TS DSL.

## 1. Payload 스키마 (frame ← 빌드타임 JSON)

엔진 scene.json의 확장이다. 프레임은 payload만 읽는다 — 캔버스 내부 모델을 절대 읽지 않는다.

```jsonc
{
  "id": "slug", "title": "…", "kind": "infra|data-flow|erd|agent-topology",
  "description": "…",                     // 타이틀바 툴팁
  "counts": { "nodes": 0, "edges": 0, "flows": 0, "groups": 0 },  // a11y aria-label
  "warnings": ["…"],                      // 경고 칩 (레이아웃 산출물 — 캔버스가 생산)
  "nodes": [{ "path": "…", "label": "…", "category": "…", "tech": "…",
              "description": "…", "href": "…",
              "table": { "columns": [{ "name": "", "type": "", "pk": false,
                        "fk": {"table":"","column":""}, "unique": false, "nullable": false }] } }],
  "edges": [{ "id": "e0", "from": "path", "to": "path", "label": "…", "layer": "…" }],
  "flows": [{ "id": "…", "title": "…", "description": "…",
              "steps": [{ "edgeId": "e0", "text": "…", "n": 1 }] }],
  "legend": [ /* 캔버스가 해석을 끝낸 범례 항목 — 프레임은 그리기만 한다 */
    { "group": "category|edge|groupKind", "label": "데이터베이스", "swatch": { "type": "dot|line|border", "color": "#…", "dash": "6 4" } } ],
  "assets": { "svgFile": "slug.svg", "pngFile": "slug.png" }   // 내보내기 버튼용 (있을 때만)
}
```

- **연결 목록**: 사이드바의 connections는 프레임이 `edges[].from/to`에서 파생한다
  (payload에 노드 항목이 없는 endpoint는 건너뛴다 — 레거시 DOM 스캔과 동일 의미론).
- **범례는 payload로**: 캔버스 내부 스타일 상수(CATEGORY_META 등)를 프레임이 임포트하지
  않는다. 캔버스가 "사용된 항목 + 확정 색"을 legend 배열로 방출한다.

## 2. Canvas Adapter (frame ↔ 캔버스 런타임)

캔버스는 자기 마크업(엔진: 인라인 SVG)과 함께 다음 인터페이스를 구현해 프레임에 등록한다.

```js
frame.register({
  el,                               // 캔버스 루트 요소 (프레임이 뷰포트에 삽입)
  // ── frame → canvas ──
  highlight(mode, target),          // mode: "hover"|"select"|"flow"|"step"
                                    // target: {path}|{flowId}|{flowId,step}|null(해제)
                                    // 모드별 dim 수준·애니메이션은 캔버스 재량
  setLabelMode(mode),               // "auto"|"always"  (줌 임계 라벨 표시)
  fit(), reset(),                   // 뷰 맞춤/초기화 (팬·줌은 캔버스 소유)
  canvasShift(px),                  // 사이드바 열림/닫힘 시 수평 시프트 (±152)
  refresh(),                        // 리사이즈·폰트 로드 후 재계산 (SVG 캔버스는 no-op 가능)
  export(kind),                     // "svg"|"png" → Blob 반환 or null(프레임이 assets 다운로드로 폴백)
  toolbarExtras(),                  // 캔버스 전용 컨트롤 DOM 반환 (없으면 null) — seq 모드 토글용 슬롯
  // ── canvas → frame (프레임이 넘겨주는 콜백을 캔버스가 호출) ──
  //   onNodeSelected(path|null)    클릭 (사이드바 열기/닫기)
  //   onNodeActivated(path)        더블클릭 (드릴다운은 프레임이 처리)
  //   onStepClicked(flowId, n)     캔버스 안 스텝 배지 클릭
  //   onHover(path|null)
});
```

- **하이라이트 상태의 주인은 프레임**이다(선택·플로우·스텝·호버의 우선순위 판정 포함).
  캔버스는 명령을 반영만 한다. 캔버스 자체 클래스(.hl/.dim 등) 이름은 자유.
- **팬/줌은 캔버스 소유**, fit/reset 버튼만 프레임이 노출한다.
- 툴팁은 프레임이 단일 시스템(#dg-tip)을 소유하고 `frame.tooltip(el, text)` 유틸을 어댑터에 제공한다.

## 3. Asset 계약 (스타일·폰트)

- 캔버스 마크업이 요구하는 **CSS 커스텀 프로퍼티 정의는 캔버스가 `<style>`로 동봉**한다
  (엔진: --ia-*/--cat-*/--table-* 라이트+다크 정의 포함). 프레임 토큰(--frame-*)과 네임스페이스 분리.
- **폰트**: 엔진 캔버스는 Pretendard 서브셋을 임베드한다. **프레임 크롬 문자열은 서브셋
  입력에 포함돼야 한다** — 프레임이 `FRAME_GLYPHS` 상수(크롬 전체 문구)를 export하고,
  엔진 빌드가 이를 scene.texts에 합친다. 프레임 크롬 언어는 **한국어**(레거시 관례).

## 4. 셸 프로토콜 (iframe ↔ 문서/위키 셸)

- iframe→parent: `{type:"zzon:navigate", slug}` · `{type:"zzon:sidebar", open:boolean}`
- parent→iframe: `{type:"zzon:sidebar-close"}`
- postMessage는 `parent !== window`일 때만 (file:// 단독 열람 지원). **셸 밖으로 다른 메시지 금지.**
- **테마(정본 = seq 의미론, 레거시의 무영속 .dark는 버그로 확정)**: localStorage `"zzon-theme"`
  ("light"|"dark") → `<html data-theme>`, 부트 시 읽고(prefers-color-scheme 폴백),
  토글은 저장+스탬프, `storage` 이벤트로 형제 iframe 동기화.
- **위키 엠베드 봉투**: 440px 높이에서 동작(컴팩트 툴바 ≤44px, 부트 시 fit),
  확장 모드 `calc(100vh-118px)` 대응, `zzon:sidebar-close` 수신 시 닫힘.

## 5. 드릴다운 정책 (단일화)

`href` 판정: 스킴(`^[a-z][a-z0-9+.-]*:`) 있으면 외부 URL → `window.open(_blank)`.
아니면 `.html` 제거 후 `^[a-z0-9_-]+$` 매칭 시 형제 slug →
framed면 `zzon:navigate`, 단독이면 `slug + ".html"` 이동. 그 외 형식은 무시하고 콘솔 경고.
(레거시 스킴 검사와 엔진 정규식의 불일치를 이 규칙으로 통일한다.)

## 6. 내보내기 정책

- 프레임 툴바의 SVG/PNG 버튼 → 어댑터 `export(kind)` 우선, null이면 payload
  `assets` 파일 다운로드로 폴백(엔진 캔버스 v1 = 빌드타임 정적 SVG/PNG).
- 알려진 갭: 빌드타임 정적 SVG는 라이트 테마 고정 — 다크 내보내기는 후속 결정.

## 7. 회귀 게이트 (F3) — 이 목록이 통과 기준이다

레거시 render.mjs 실측 기능 목록: 팬/줌/fit(임계값 포함) · 줌 연동 라벨 자동표시 + 항상표시 토글 ·
타이틀바+kind 칩 · 플로우 버튼/순번 스트립/엣지 배지("1·3" 병합·클릭 순환)/스텝 포커스 dim ·
플로우 진입 애니메이션(1회) · 우측 사이드바(노드/플로우 패널, 연결 목록 클릭 이동, ERD 컬럼 표) ·
드릴다운(더블클릭·⊕) · 범례 자동 생성 · 경고 칩 · 툴팁 · SVG/PNG 내보내기 · 다크/라이트 ·
sonar 선택 링 · prefers-reduced-motion · role=img a11y · postMessage 3종 · 440px 엠베드.
검증: 헤드리스 훅(`window.__zzonFramePayload`, `__zzonExportSvg` 패턴) + 스크린샷 대조,
입력은 `references/sample-*.json` 13종(엔진 경로는 변환 후) — 실프로젝트 입력 금지.

## 8. 금지 사항

- 프레임이 캔버스 내부 상수·모델을 임포트하는 것 (payload/adapter 외 경로 일체)
- 캔버스가 크롬 DOM을 만드는 것 (toolbarExtras 슬롯 제외)
- 실프로젝트(예: linkonn) 데이터를 예제·픽스처로 커밋하는 것
