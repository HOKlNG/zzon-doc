# 도메인 모델 — 클래스 표기 (`docKind: "class"`)

**질문**: 도메인 개념(엔터티·값 객체·애그리거트)이 무엇이고, 서로 어떻게 묶이고 상속하나.
**등급**: T2. 애그리거트 1~2개 + 주변 개념으로 그린다. 클래스가 12개를 넘으면 애그리거트별로 쪼갠다.

> **ERD와 구분한다.** 저장 스키마(테이블·FK)가 질문이면 ERD다. 이 뷰는 코드의 **개념 모델**(합성·상속·인터페이스)을 그린다.
> C4 권고상 코드 수준 다이어그램은 IDE가 더 잘 만든다. 이 뷰는 **설계 의도**(애그리거트 경계·불변식)를 전할 때만 쓴다.

## 코드에서 읽는 법

- 엔터티·값 객체 클래스, 애그리거트 루트(리포지토리가 있는 엔터티), 인터페이스와 구현체를 찾는다.
- **속성은 의미 있는 것만** 3~5개 적는다. getter·setter·감사 필드는 생략하고, 생략했다고 보고한다.
- 메서드는 도메인 행위(`place()`, `cancel()`)만 적는다.

## 문법 (DSL 헬퍼)

| 요소 | DSL | 표기 |
|---|---|---|
| 클래스 | `d.classNode(id, { label, stereotype?, attributes?, methods? })` | 칸 3개 상자 · «stereotype» |
| 합성(생명주기 공유) | `d.composes(whole, part, { sourceCardinality?, targetCardinality? })` | ◆— |
| 집약 | `d.aggregates(whole, part)` | ◇— |
| 연관 | `d.associates(a, b, { label?, sourceCardinality?, targetCardinality? })` | 선 + "1 — 0..N" |
| 상속 | `d.inherits(child, parent)` | ▷ (부모가 위로 배치된다) |
| 구현 | `d.implements(cls, iface)` | 점선 ▷ |
| 의존·사용 | `d.dependsOn(a, b, { label?, hints? })` | 점선 열린 화살표 |

- 스테레오타입 예: `aggregate root`, `entity`, `value object`, `interface`, `abstract`.
- 상속 줄기와 다른 관계가 같은 면을 쓰면 `hints: { sourceSide: "E" }`로 옆 면에서 나가게 한다.
- 애그리거트 루트에 `href`를 달아 그 엔터티의 상태 전이도로 잇는다.

## 템플릿 (`engine/examples/domain-model-sample.ts` 요약)

```ts
import { diagram } from "../src/dsl/index.ts";

export default diagram("order-model", { title: "주문 도메인 모델", docKind: "class", view: "domain-model", tier: "standard" }, (d) => {
  const order = d.classNode("order", { label: "Order", stereotype: "aggregate root", attributes: ["id: OrderId", "status: OrderStatus"], methods: ["place()", "cancel(reason)"] });
  const line = d.classNode("line", { label: "OrderLine", stereotype: "entity", attributes: ["quantity: int", "price: Money"] });
  const payment = d.classNode("payment", { label: "Payment", stereotype: "abstract", methods: ["refund()"] });
  const card = d.classNode("card", { label: "CardPayment" });
  d.composes(order, line, { sourceCardinality: "1", targetCardinality: "1..N" });
  d.associates(order, payment, { sourceCardinality: "1", targetCardinality: "0..1" });
  d.inherits(card, payment);
});
```

## 게이트가 보는 의미 검사

- 상속 순환 → **✗**
