/**
 * domain-model-sample — 도메인 모델(docKind "class") 정본 예제: 주문 애그리거트.
 * UML 클래스 상자(스테레오타입·속성·메서드)와 관계 — 합성(◆), 상속(▷), 구현(⇢▷),
 * 연관(다중성 라벨). 상속·구현은 배치에서 부모가 위로 오도록 뒤집힌다(layoutReverse).
 */
import { diagram } from "../src/dsl/index.ts";

export default diagram(
  "domain-model-sample",
  { title: "주문 도메인 모델", docKind: "class", view: "domain-model", tier: "standard" },
  (d) => {
    const customer = d.classNode("customer", {
      label: "Customer",
      stereotype: "entity",
      attributes: ["id: CustomerId", "email: Email", "grade: Grade"],
    });
    const order = d.classNode("order", {
      label: "Order",
      stereotype: "aggregate root",
      attributes: ["id: OrderId", "status: OrderStatus", "total: Money"],
      methods: ["place()", "pay(payment)", "cancel(reason)"],
      description: "주문 애그리거트의 루트입니다. 더블클릭하면 주문 상태가 어떻게 바뀌는지 볼 수 있습니다.",
      href: "state-sample",
    });
    const line = d.classNode("line", {
      label: "OrderLine",
      stereotype: "entity",
      attributes: ["productId: ProductId", "quantity: int", "price: Money"],
    });
    const money = d.classNode("money", { label: "Money", stereotype: "value object", attributes: ["amount: Decimal", "currency: Currency"] });
    const payment = d.classNode("payment", { label: "Payment", stereotype: "abstract", attributes: ["amount: Money", "paidAt: Instant"], methods: ["refund()"] });
    const card = d.classNode("card", { label: "CardPayment", attributes: ["approvalNo: string"] });
    const transfer = d.classNode("transfer", { label: "BankTransfer", attributes: ["virtualAccount: string"] });
    const gateway = d.classNode("gateway", { label: "PaymentGateway", stereotype: "interface", methods: ["approve(req)", "cancel(id)"] });
    const toss = d.classNode("toss", { label: "TossGateway", methods: ["approve(req)", "cancel(id)"] });

    d.associates(customer, order, { label: "주문", sourceCardinality: "1", targetCardinality: "0..N" });
    d.composes(order, line, { sourceCardinality: "1", targetCardinality: "1..N" });
    d.associates(order, payment, { sourceCardinality: "1", targetCardinality: "0..1" });
    d.dependsOn(line, money, {});
    d.inherits(card, payment);
    d.inherits(transfer, payment);
    d.implements(toss, gateway);
    // 상속 줄기(아래 면)와 겹치지 않게 의존은 옆 면에서 나간다
    d.dependsOn(payment, gateway, { label: "승인 요청", hints: { sourceSide: "E", targetSide: "E" } });
  },
);
