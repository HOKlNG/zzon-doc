/**
 * flowchart-sample — 플로우차트(docKind "flowchart") 정본 예제: 환불 판단 절차.
 * 시작/끝(알약)·처리(사각)·판단(마름모) + 판단 출구마다 조건 라벨(예/아니오).
 * 방향은 docKind 기본값 DOWN. 본선은 order 0, 예외 경로는 order 1로 옆에 둔다.
 */
import { diagram } from "../src/dsl/index.ts";

export default diagram(
  "flowchart-sample",
  { title: "환불 판단 절차", docKind: "flowchart", view: "flowchart", tier: "standard" },
  (d) => {
    const start = d.terminal("start", { label: "환불 요청" });
    const receive = d.process("receive", { label: "요청 접수", sublabel: "주문·결제 조회", description: "주문 상태와 결제 일시를 읽는다." });
    const within = d.decision("within", { label: "결제 후 7일 이내?" });
    const shipped = d.decision("shipped", { label: "이미 출고?" });
    const pickup = d.process("pickup", { label: "회수 접수", sublabel: "물류 API", hints: { order: 1 } });
    const approve = d.process("approve", { label: "환불 승인", tone: "done", sublabel: "PG 부분/전체 취소" });
    // 예외 분기는 판단 바로 옆 열에 둔다 (부분 힌트 — 나머지는 자동 배치)
    const reject = d.process("reject", { label: "반려 안내", tone: "fail", sublabel: "사유 메일", hints: { layer: 3, order: 1 } });
    const done = d.terminal("done", { label: "종료" });

    const e1 = d.edge(start, receive, { layer: "flow" });
    const e2 = d.edge(receive, within, { layer: "flow" });
    const e3 = d.edge(within, shipped, { label: "예", layer: "flow" });
    d.edge(within, reject, { label: "아니오", layer: "flow" });
    d.edge(shipped, pickup, { label: "예", layer: "flow" });
    const e4 = d.edge(shipped, approve, { label: "아니오", layer: "flow" });
    d.edge(pickup, approve, { label: "회수 완료", layer: "flow" });
    const e5 = d.edge(approve, done, { layer: "flow" });
    d.edge(reject, done, { layer: "flow" });

    d.flow("fast", {
      title: "출고 전 환불",
      steps: [
        { edge: e1, text: "고객이 환불을 요청한다" },
        { edge: e2, text: "주문과 결제 정보를 조회한다" },
        { edge: e3, text: "결제 후 7일 이내다" },
        { edge: e4, text: "아직 출고 전이다" },
        { edge: e5, text: "PG 취소로 환불을 마친다" },
      ],
    });
  },
);
