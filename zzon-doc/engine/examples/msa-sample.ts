/**
 * Category-card showcase: a small MSA — gateway + two domain services + db +
 * cache + external payment API. Every node is a generic category card (no AWS
 * icons anywhere); edges span two layers (http / data) for the legend and the
 * HTML layer toggles.
 */
import { diagram } from "../src/dsl/index.ts";

export default diagram("msa-sample", { aspectRatio: 2.6, title: "MSA Sample — Category Cards" }, (d) => {
  const gateway = d.node("gateway", {
    category: "gateway",
    label: "API Gateway",
    tech: "Kong 3.6",
    description: "모든 외부 트래픽의 단일 진입점. 인증 토큰 검증과 서비스별 라우팅을 담당한다.",
  });

  const services = d.group("services", { kind: "generic", label: "Domain Services" });
  const order = services.node("order", {
    category: "service",
    label: "Order Service",
    tech: "NestJS 10",
    description: "주문 생성/조회 도메인. 결제 승인 후 주문 상태를 확정한다.",
  });
  const payment = services.node("payment", {
    category: "service",
    label: "Payment Service",
    tech: "Spring Boot 3",
  });

  const db = d.node("orders-db", { category: "db", label: "Orders DB", tech: "PostgreSQL 16" });
  const cache = d.node("session-cache", { category: "cache", label: "Session Cache", tech: "Redis 7" });
  const pg = d.node("pg-api", {
    category: "external",
    label: "PG API",
    description: "외부 결제 대행사 (Toss Payments). 장애 시 재시도 큐로 우회한다.",
  });

  d.edge(gateway, order, { label: "REST", layer: "http" });
  d.edge(gateway, payment, { layer: "http" });
  d.edge(payment, pg, { label: "결제 승인", layer: "http", style: { preset: "dashed" } });
  d.edge(order, db, { layer: "data" });
  d.edge(order, cache, { layer: "data", style: { preset: "dotted" } });
  d.edge(payment, db, { layer: "data" });
});
