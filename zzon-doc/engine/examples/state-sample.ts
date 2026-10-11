/**
 * state-sample — 상태 전이도(docKind "state") 정본 예제: 주문 생명주기.
 * UML 상태(둥근 박스)·시작(●)·종료(◉)·선택(◇) + 전이 라벨 "이벤트 [가드] / 액션"
 * + 재시도 자기 루프. 레이아웃 의도는 hints.layer(단계 열)·order(본선 위, 예외 아래).
 */
import { diagram } from "../src/dsl/index.ts";

export default diagram(
  "state-sample",
  { title: "주문 상태 전이", docKind: "state", view: "state", tier: "standard" },
  (d) => {
    const start = d.initial("start", { hints: { layer: 0 } });
    const pending = d.state("pending", {
      tone: "wait",
      label: "결제 대기",
      sublabel: "entry / 재고 가예약",
      description: "주문이 생성되고 결제를 기다린다. 30분 안에 결제가 없으면 만료된다.",
      hints: { layer: 1 },
    });
    const paid = d.state("paid", { label: "결제 완료", description: "결제가 승인되어 출고 지시를 기다린다.", hints: { layer: 2 } });
    const shipping = d.state("shipping", { label: "배송 중", sublabel: "do / 배송 추적", hints: { layer: 3 } });
    const delivered = d.state("delivered", { label: "배송 완료", tone: "done", hints: { layer: 4 } });
    const end = d.final("end", { hints: { layer: 5 } });
    const canceled = d.state("canceled", { label: "취소", tone: "fail", description: "결제 전에 취소했거나 결제 기한이 지났다.", hints: { layer: 2, order: 1 } });
    const refunding = d.state("refunding", { label: "환불 중", tone: "wait", hints: { layer: 3, order: 1 } });
    const refunded = d.state("refunded", { label: "환불 완료", tone: "done", hints: { layer: 4, order: 1 } });

    const t1 = d.transition(start, pending, { event: "주문 생성" });
    const t2 = d.transition(pending, paid, { event: "결제 승인" });
    d.transition(pending, pending, { event: "결제 실패", guard: "시도<3", action: "재시도" });
    d.transition(pending, canceled, { event: "취소", guard: "또는 30분 경과" });
    const t3 = d.transition(paid, shipping, { event: "출고" });
    const t4 = d.transition(shipping, delivered, { event: "수령 확인" });
    const t5 = d.transition(delivered, end);
    d.transition(paid, refunding, { event: "환불 요청" });
    d.transition(refunding, refunded, { event: "PG 환불 완료" });
    d.transition(refunded, end);
    d.transition(canceled, end);

    d.flow("happy", {
      title: "정상 주문",
      steps: [
        { edge: t1, text: "주문이 생성되며 재고를 가예약한다" },
        { edge: t2, text: "결제대행사가 결제를 승인한다" },
        { edge: t3, text: "물류에 출고를 지시한다" },
        { edge: t4, text: "고객이 수령을 확인한다" },
        { edge: t5, text: "주문이 종결된다" },
      ],
    });
  },
);
