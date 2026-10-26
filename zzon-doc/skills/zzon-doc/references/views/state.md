# 상태 전이도 (`docKind: "state"`)

**질문**: 대상 **하나**(주문·결제·예약·계정…)가 어떤 상태를 거치고, 무엇이 전이를 일으키나.
**등급**: T2. 상태 10개 안팎이 적당하다. 넘으면 하위 상태 그룹으로 나누거나 장을 쪼갠다.
**신호**: scan의 상태 머신 수·상태 enum(`OrderStatus`, `PaymentState` …). 엔터티당 1장이 원칙이다.

> 여러 대상이 메시지를 주고받는 순서가 질문이면 이 뷰가 아니라 시퀀스다.
> 판단 분기를 따라 행동이 이어지는 절차면 플로우차트다(rubric §2.2-5).

## 코드에서 읽는 법

1. 상태 정의를 찾는다: enum·유니온 타입·DB enum·`status` 컬럼의 체크 제약.
2. **전이를 찾는다**: 상태를 대입하는 곳(`order.status = PAID`), 상태 머신 라이브러리 정의(XState `createMachine`, AASM, Spring StateMachine), 가드 조건(`if status === PENDING`).
3. 전이마다 **이벤트**(무엇이 일으키나: API·웹훅·스케줄러)와 **가드**(조건), **액션**(부수효과)을 적는다.
   읽지 못한 전이는 그리지 않는다. 모르면 ❓로 남기거나 묻는다.

## 문법 (DSL 헬퍼)

| 요소 | DSL | 표기 |
|---|---|---|
| 시작 | `d.initial()` | ● |
| 상태 | `d.state(id, { label, tone?, sublabel?: "entry / …", description })` | 아키텍처 그림과 같은 카드. `tone`이 왼쪽 띠 색과 아이콘을 정한다: `"wait"`(주황 시계, 결제 대기처럼 무언가를 기다림), `"done"`(초록 체크, 정상 종료), `"fail"`(빨간 엑스, 취소·실패). 없으면 진행 중(남색). sublabel은 카드의 회색 칩에 "들어갈 때 …" "머무는 동안 …"으로 보인다 |
| 선택(분기점) | `d.choice(id)` | ◇ — 나가는 전이마다 가드 라벨 |
| 종료 | `d.final()` | ◉ |
| 전이 | `d.transition(a, b, { event, guard?, action? })` | 라벨 "이벤트 [가드] / 액션" |
| 같은 상태에 머묾 | `d.transition(a, a, …)` | 자기 루프 (엔진이 모서리를 돌아 그림) |
| 복합 상태 | `d.group(id, { label: "진행 중" })` 안에 `g.state(…)` | 점선 상자 |

- 방향 기본값은 RIGHT다(생명주기를 왼쪽에서 오른쪽으로). 본선은 `hints.order` 0(기본), 예외·취소 경로는 `order: 1`로 아래 줄에 둔다.
- 대표 경로(정상 처리)는 `d.flow()` 1개로 순번을 단다.

## 템플릿 (`engine/examples/state-sample.ts` 요약)

```ts
import { diagram } from "../src/dsl/index.ts";

export default diagram("state-order", { title: "주문 상태 전이", docKind: "state", view: "state", tier: "standard" }, (d) => {
  const start = d.initial();
  const pending = d.state("pending", { label: "결제 대기", tone: "wait", sublabel: "entry / 재고 가예약" });
  const paid = d.state("paid", { label: "결제 완료" });
  const canceled = d.state("canceled", { label: "취소", tone: "fail", hints: { order: 1 } });
  const end = d.final();
  const t1 = d.transition(start, pending, { event: "주문 생성" });
  const t2 = d.transition(pending, paid, { event: "결제 승인" });
  d.transition(pending, pending, { event: "결제 실패", guard: "시도<3", action: "재시도" });
  d.transition(pending, canceled, { event: "취소", guard: "또는 30분 경과" });
  const t3 = d.transition(paid, end);
  d.transition(canceled, end);
  d.flow("happy", { title: "정상 주문", steps: [
    { edge: t1, text: "주문이 생성됩니다" }, { edge: t2, text: "PG가 결제를 승인합니다" }, { edge: t3, text: "주문이 종결됩니다" },
  ] });
});
```

## 게이트가 보는 의미 검사

- 시작 상태가 없거나, 시작에서 도달할 수 없는 상태 → **✗**
- 종료 상태에서 나가는 전이 → **✗**
- 빠져나갈 전이가 없는 상태(막다른 상태) → !
- 분기가 2개 미만이거나 가드 라벨이 없는 선택 → !

## 점검

- [ ] 상태 이름은 코드의 enum 값과 대응한다. 원래 값은 상태 라벨의 보조 줄(sublabel)에 두고, `description`에는 그 상태가 무엇을 뜻하는지 문장으로 쓴다.
- [ ] 전이를 읽은 파일을 `sources`에 남겼다. 사이드바 설명에는 파일 위치 대신 전이의 뜻을 썼다.
- [ ] ERD의 status 컬럼, 시퀀스 장과 서로 `href`로 이었다.
