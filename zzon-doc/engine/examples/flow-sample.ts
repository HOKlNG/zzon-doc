/**
 * flow-sample — 소형 데이터 플로우 예제 (docKind "data-flow"): 카테고리 카드
 * 5장 + 내러티브 플로우 2개. 두 플로우가 같은 엣지(client→api)를 공유해 배지
 * 오프셋(겹침 방지)과 프레임 플로우 UI(버튼/순번 스트립/스텝 포커스)를 함께
 * 검증한다. 실제 프로젝트와 무관한 익명 예제다.
 */
import { diagram } from "../src/dsl/index.ts";

export default diagram(
  "flow-sample",
  { title: "주문 처리 데이터 플로우", docKind: "data-flow", aspectRatio: 2.2 },
  (d) => {
    const client = d.node("client", {
      category: "frontend",
      label: "웹 클라이언트",
      tech: "Next.js 14",
    });
    const api = d.node("api", {
      category: "gateway",
      label: "주문 API",
      tech: "NestJS 10",
      description: "주문 접수와 상태 조회를 처리하는 단일 진입점.",
    });
    const queue = d.node("queue", { category: "queue", label: "주문 큐", tech: "SQS" });
    const worker = d.node("worker", {
      category: "worker",
      label: "정산 워커",
      description: "큐 이벤트를 소비해 주문 레코드를 확정한다.",
    });
    const db = d.node("orders-db", { category: "db", label: "주문 DB", tech: "PostgreSQL 16" });

    const submit = d.edge(client, api, { label: "주문 제출", layer: "sync" });
    const publish = d.edge(api, queue, { label: "이벤트 발행", layer: "async" });
    const consume = d.edge(queue, worker, { label: "소비", layer: "async" });
    const persist = d.edge(worker, db, { label: "저장", layer: "data" });
    const read = d.edge(api, db, {
      label: "상태 조회",
      layer: "data",
      style: { preset: "dotted" },
    });

    d.flow("order", {
      title: "주문 접수",
      description: "클라이언트 제출부터 워커 저장까지의 해피 패스",
      steps: [
        { edge: submit, text: "클라이언트가 주문을 제출한다" },
        { edge: publish, text: "API가 주문 이벤트를 큐에 발행한다" },
        { edge: consume, text: "워커가 이벤트를 소비한다" },
        { edge: persist, text: "주문 레코드를 저장한다" },
      ],
    });

    // shares the client→api edge with "order" — badge offset + frame step UI
    d.flow("status", {
      title: "상태 조회",
      description: "폴링 조회 경로 — 제출 엣지를 공유한다",
      steps: [
        { edge: submit, text: "클라이언트가 주문 상태를 폴링한다" },
        { edge: read, text: "API가 DB에서 주문 상태를 읽는다" },
      ],
    });
  },
);
