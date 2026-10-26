---
name: zzon-seq
description: 시퀀스 다이어그램 전용 스킬이다. 코드를 추적해 액터 간 시간순 메시지 왕복(요청/응답 짝, alt·opt·loop·par 분기, 활성 구간)을 SeqSpec JSON으로 저작하고, 의존성 0 인터랙티브 .html로 렌더한다.
when_to_use: 사용자가 "시퀀스 다이어그램", "sequence diagram", "호출 순서", "메시지 왕복", "요청/응답 순서"를 지명할 때 쓴다. 지명 없이 "흐름 그려줘"라고만 하면 메인 zzon-doc이 받아 선택 기준으로 판정하고, 시퀀스가 맞으면 이 절차로 넘긴다.
argument-hint: '[그릴 프로세스 — 예: 결제 흐름 / 로그인 토큰 갱신]'
---

# 시퀀스 다이어그램 그리기

코드를 추적해 **SeqSpec JSON**을 저작하고 `scripts/render-seq.mjs`로 렌더한다. 산출물은 의존성 0짜리 단일 `.html`이다.
산출물은 zzon-doc 통합 문서와 zzon-wiki 임베드 파이프라인에 그대로 올라탄다.

> 계약 정본은 `references/seq-spec.md`(스키마·저작 지침)다. 저작 전에 반드시 읽고, 샘플(`references/sample-seq-*.json`)을 최소 1개 훑는다.
> 이 스킬은 메인 스킬 zzon-doc의 뷰 하나다. 분기·재진입(`--status`)·게이트·보고 규칙은 `../zzon-doc/SKILL.md`를 따른다.

## 0. 이 뷰가 맞는지 판별한다 (selection-rubric §2.2)

- **시퀀스**: 추적 경로에 의미 있는 왕복(응답이 다음 행동을 결정)이 2개 이상이거나, 분기·재시도·타임아웃이 1개 이상이다. 또는 요청어에 순서·응답·분기가 있다.
- **구조 위 순번**(어떤 구성요소를 지나가나): zzon-doc `flow` 뷰(`docKind: "data-flow"`)로 간다.
- 둘 다 해당하면 둘 다 그린다. 중복이 아니라 보완이다.

## 1. 범위

- **구체적 요청**("결제 흐름 시퀀스로"): 바로 그 한 장을 그린다.
- **포괄적 요청**("주요 기능들 시퀀스로"): ① 코드에서 왕복·분기가 본질인 프로세스 후보를 센다(라우트·핸들러·외부 호출) → ② "이 N장을 그릴까?" 목록으로 제안하고 승인받는다 → ③ 작성한다.
- 기능당 1장이 원칙이다. 한 장은 **액터 3~8, 메시지 14~28**을 넘기지 않는다. 넘치면 쪼갠다.

## 2. 스펙 저작

1. **코드를 실제로 추적한다**: 라우트 → 핸들러 → 서비스 → 큐·DB → 컨슈머. 읽은 것만 쓴다. 각 message에 `sourceRef`(`path:line`)를 단다.
2. `<docsDir>/specs/<slug>.json`에 쓴다. slug는 `seq-` 접두를 쓴다(예: `seq-booking-pay`).
3. **`sources`에 추적한 파일 glob을 반드시 적는다.** 코드가 바뀌었을 때 이 장이 낡았는지를 이것으로 판정한다.
4. **essential 마킹**: 메시지의 30~40%에 `essential: true`를 단다. essential만 읽어도 이야기가 끝까지 이해되게 고른다(간소화 보기의 근거다).
5. 라벨은 실제 식별자로 짧게 쓴다(`POST /v1/...`, `SendMessage → <큐>`). 설명은 `description`에 넣는다.
6. 제목, 부제, 설명, 메모는 독자가 읽는 글이다. `../zzon-doc/references/writing-style.md`의 여섯 규칙을 따르고, 라벨에 이미 있는 식별자를 설명에서 되풀이하지 않는다.

## 3. 렌더

- **통합 문서에 포함(기본)**: `node ${CLAUDE_PLUGIN_ROOT}/skills/zzon-doc/scripts/build-docs.mjs <docsDir> --title "<제목>"`
  build-docs가 kind를 보고 render-seq로 라우팅하고, 근거를 스탬프한다.
- **단일 장만**: `node ${CLAUDE_PLUGIN_ROOT}/skills/zzon-seq/scripts/render-seq.mjs <spec.json> [-o out.html]`
- 검증 실패는 `path: 메시지`로 전부 출력된다. 스펙을 고쳐 다시 실행한다.
- 렌더한 뒤 브라우저로 열어(또는 사용자에게 안내해) 확인한다.

## 4. 위키에 싣기

- manifest에 올라간 slug는 위키 md에서 `@diagram(seq-booking-pay)` 한 줄로 임베드된다. DocNode.diagrams[]에도 등록한다.
- 자연스러운 소비처: architecture/seq-flows, planning/usecase, interface/authn.
- 이 스킬은 index.html을 만들지 않는다(specs·diagrams·manifest만).

## 뷰어가 제공하는 것

- 전체/간소화 토글, 화살표 클릭 상세(전문 라벨·설명·sourceRef), 액터 하이라이트
- 둘러보기(←/→), 다크·라이트 모드, SVG·PNG 다운로드, zzon 셸 postMessage 연동

## 절대 규칙

- 스펙 JSON까지만 저작한다. HTML을 직접 작성하지 마라.
- 다이어그램을 저작하는 중에는 `render-seq.mjs`와 `seq-engine.js`를 수정하지 마라.
- 라이브러리·CDN 0. 설명·메모 문장은 한국어 합니다체로 쓰고(../zzon-doc/references/writing-style.md), 메시지 라벨은 짧은 동작 명사구로 쓰며, 기술 식별자는 원문을 유지한다.
