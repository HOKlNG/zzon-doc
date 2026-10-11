# 플로우차트 (`docKind: "flowchart"`)

**질문**: 판단 분기를 따라 **무엇을 하나**. 비즈니스 규칙(환불·승인 정책), 운영 절차(런북·장애 대응), 알고리즘이 대상이다.
**등급**: T2. 판단 3~4개, 단계 15개 이하가 적당하다. 넘으면 하위 절차를 별도 장으로 빼고 `href`로 잇는다.

> 구성요소끼리 데이터가 오가는 경로면 flow 뷰, 메시지 왕복이면 시퀀스, 한 대상의 상태 변화면 상태도다.

## 코드에서 읽는 법

- 서비스 함수의 분기(`if/switch/early return`), 검증 규칙, 정책 상수(기간·한도)를 읽는다.
- 런북·장애 대응은 코드에 없는 경우가 많다. 문서나 인터뷰에서 읽은 것만 그리고, 출처를 `description`에 적는다.

## 문법 (DSL 헬퍼)

| 요소 | DSL | 표기 |
|---|---|---|
| 시작·끝 | `d.terminal(id, { label })` | 재생·깃발 아이콘 카드 (시작 = 들어오는 엣지가 없는 terminal) |
| 처리 | `d.process(id, { label, tone?, sublabel? })` | 아키텍처 그림과 같은 카드 (sublabel: 호출하는 API·함수, 회색 칩). `tone: "done"`은 초록(승인·완료), `"fail"`은 빨강(반려·예외), `"wait"`은 주황(대기) |
| 판단 | `d.decision(id, { label: "…?" })` | 주황 갈림 아이콘 카드, 질문형 라벨 |
| 흐름 | `d.edge(a, b, { label?, layer })` | 판단 출구에는 **조건 라벨 필수**(예/아니오, 이내/초과). 라벨이 예·아니오면 초록·빨강 알약으로 보인다 |
| 되돌아감(재시도) | `d.edge(a, b, { back: true })` | 배치에서 역방향 취급 — 본선 순서 유지 |

- 방향 기본값은 DOWN이다. 판단의 출구는 엔진이 나눈다(곧장 가는 출구는 아래, 나머지는 옆).
- 예외 분기는 `hints: { layer: <판단 다음 열>, order: 1 }`로 판단 바로 옆에 둔다. 부분 힌트로도 된다(나머지는 자동 배치).

## 템플릿 (`engine/examples/flowchart-sample.ts` 요약)

```ts
import { diagram } from "../src/dsl/index.ts";

export default diagram("refund-flow", { title: "환불 판단 절차", docKind: "flowchart", view: "flowchart", tier: "standard" }, (d) => {
  const start = d.terminal("start", { label: "환불 요청" });
  const within = d.decision("within", { label: "결제 후 7일 이내?" });
  const approve = d.process("approve", { label: "환불 승인", tone: "done", sublabel: "PG 취소" });
  const reject = d.process("reject", { label: "반려 안내", tone: "fail", hints: { layer: 2, order: 1 } });
  const done = d.terminal("done", { label: "종료" });
  d.edge(start, within, { layer: "flow" });
  d.edge(within, approve, { label: "예", layer: "flow" });
  d.edge(within, reject, { label: "아니오", layer: "flow" });
  d.edge(approve, done, { layer: "flow" });
  d.edge(reject, done, { layer: "flow" });
});
```

## 게이트가 보는 의미 검사

- 시작이 없거나, 시작에서 도달할 수 없는 단계 → **✗**
- 출구가 2개 미만이거나 조건 라벨 없는 출구가 있는 판단 → **✗**
- 이어지는 단계가 없는 처리(끝이면 종료 터미널로 이어야 함) → !

## 점검

- [ ] 판단 라벨은 질문형이고, 출구 라벨은 그 질문의 답이다.
- [ ] 정책 값(7일, 3회 등)이 코드 상수와 일치한다. 상수가 있는 파일을 `sources`에 넣었다.
- [ ] 대표 경로를 `d.flow()`로 순번 표시했다(선택).
