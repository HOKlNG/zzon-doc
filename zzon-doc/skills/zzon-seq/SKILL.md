---
name: zzon-seq
description: 코드를 추적해 액터 간 시간순 상호작용을 시퀀스 다이어그램으로 그린다. SeqSpec JSON을 저작한 뒤 render-seq.mjs로 의존성 0짜리 인터랙티브 단일 .html을 생성한다. "시퀀스 다이어그램 그려줘", "호출 순서 보여줘", "이 기능 흐름을 시간순으로", "메시지 왕복 그려줘" 같은 요청에 사용한다. 구조·토폴로지 위 순번 흐름은 zzon-doc(data-flow), 문서 위키는 zzon-wiki가 담당한다.
argument-hint: '[그릴 프로세스 — 예: 결제 흐름 / 링크 저장 파이프라인]'
---

# 시퀀스 다이어그램 그리기

코드를 추적해 **SeqSpec JSON**을 저작하고 `scripts/render-seq.mjs`로 의존성 0짜리 단일 `.html`을
만든다. 산출물은 zzon-doc 통합 문서·zzon-wiki 임베드 파이프라인에 그대로 올라탄다.

> 계약 정본: `references/seq-spec.md`(스키마·저작 지침). 저작 전에 반드시 읽고,
> 샘플(`references/sample-seq-*.json`) 최소 1개를 훑는다.

## 0. 이 스킬이 맞는지 먼저 판별한다

- **누가 누구에게 무엇을 순서대로 주고받는가**(요청/응답 왕복, 활성 구간, alt/opt/loop 분기,
  시간축)가 주인공 → **이 스킬**.
- **어떤 구조를 지나가는가**(토폴로지 + 순번 배지)가 주인공 → zzon-doc의 `data-flow`로 위임.
- 정적 구조·인프라·ERD → zzon-doc. 문서 위키 → zzon-wiki.
- 같은 주제를 data-flow와 시퀀스 두 장으로 갖는 것은 중복이 아니라 보완이다.

## 1. 범위를 잡는다

- **구체적 요청**("결제 흐름 시퀀스로") → 바로 그 한 장.
- **포괄적 요청**("주요 기능들 시퀀스로") → **순서를 지킨다: ① 코드에서 기능·프로세스 후보를
  개수로 파악 → ② "이 N장을 그릴까?" 목록으로 제안·승인 → ③ 작성.** 기능당 1장이 원칙이고,
  한 장은 액터 3~10 · 메시지 14~28을 넘기지 않는다(넘치면 쪼갠다).

## 2. 스펙을 저작한다

1. **코드를 실제로 추적한다** — 라우트 → 핸들러 → 서비스 → 큐/DB → 컨슈머. 읽은 것만 쓰고
   추측으로 채우지 마라. 각 message에 `sourceRef`(`path:line`)를 단다.
2. `references/seq-spec.md`의 스키마로 `<출력폴더>/specs/<slug>.json`을 쓴다(출력폴더
   기본값은 `docs/zzon-doc/` — 구버전 루트 `zzon-doc/`가 이미 있으면 그걸 유지). slug는
   `seq-` 접두를 권장한다(예: `seq-booking-pay`) — 기존 data-flow slug와 구분된다.
3. **essential 마킹**: 메시지의 30~40%에 `essential:true`. essential만 읽어도 이야기가
   끝까지 이해되게 고른다(간소화 보기가 이것으로 만들어진다).
4. 라벨은 실제 식별자로 짧게(`POST /v1/...`, `SendMessage → <큐>`), 설명은 description에.

## 3. 렌더한다

- **통합 문서에 포함(기본)** — 다른 다이어그램과 같은 specs/ 폴더에 두고:
  `node ${CLAUDE_PLUGIN_ROOT}/skills/zzon-doc/scripts/build-docs.mjs ./docs/zzon-doc --title "<제목>"`
  build-docs가 kind를 보고 render-seq로 라우팅해 `diagrams/<slug>.html` + manifest에 올린다.
- **단일 장만** — `node ${CLAUDE_PLUGIN_ROOT}/skills/zzon-seq/scripts/render-seq.mjs <spec.json> [-o out.html]`
- 검증 실패는 'path: 메시지'로 전부 출력된다 — 스펙을 고쳐 재실행한다.
- 렌더 후 브라우저로 열어(또는 사용자에게 안내해) 확인한다. file://로 그냥 열린다.

## 4. 위키에 싣는다 (zzon-wiki와의 접점)

- manifest에 올라간 slug는 위키 md에서 `@diagram(seq-booking-pay)` 한 줄로 임베드된다
  (zzon-wiki 절차를 따르고, DocNode.diagrams[]에도 slug를 등록한다).
- 자연스러운 소비처: architecture/event-flow, planning/usecase, 기능별 상세 문서.
- index.html 소유권 규약을 지킨다 — 이 스킬은 index를 만들지 않는다(specs·diagrams·manifest만).

## 뷰어가 제공하는 것 (스펙만 잘 쓰면 공짜)

전체/간소화 토글 · 화살표 클릭 상세(전문 라벨·설명·sourceRef) · 액터 클릭 하이라이트 ·
둘러보기(단계 재생 ←/→) · 다크/라이트(`zzon-theme` 공유) · SVG/PNG 다운로드 ·
zzon 셸 postMessage 연동(우측 패널 ↔ 좌측 메뉴 상호 배타).

## 절대 규칙

- 스펙 JSON까지만 저작한다. **HTML 직접 작성 금지.**
- **엔진 수정 금지**: `scripts/render-seq.mjs`·`scripts/seq-engine.js`는 다이어그램 저작 중에
  손대지 않는다. (엔진 개선은 별도 작업 — 순수 JS 직접 수정 + 브라우저 재검증, render.mjs와 동일 규칙.)
- 라이브러리/CDN 0. 출력은 self-contained.
- 문서·라벨 산문은 한국어(한다체), 기술 식별자는 원문 유지.
