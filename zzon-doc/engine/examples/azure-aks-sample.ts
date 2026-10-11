/**
 * azure-aks-sample — Azure 공식 아이콘(V24)과 쿠버네티스 커뮤니티 아이콘을 함께 쓰는 예제.
 * 실제 프로젝트와 무관한 익명 예제다.
 *
 * 구성: 사용자 → Front Door → Application Gateway → AKS 클러스터(인그레스 → 서비스 → 디플로이먼트·파드)
 * → Azure SQL·Redis, 비밀은 Key Vault, 이미지는 ACR, 관측은 Application Insights.
 * Azure 아이콘은 "azure.<이름>", 쿠버네티스 아이콘은 "k8s.<이름>"으로 부른다(aliases.ts에 짧은 이름).
 */
import { diagram } from "../src/dsl/index.ts";

export default diagram(
  "azure-aks-sample",
  { title: "Azure 쇼핑몰 서비스 (AKS)", view: "deployment", tier: "standard", direction: "RIGHT" },
  (d) => {
    const user = d.actor("user", { icon: "res.users", label: "사용자", side: "left" });

    const sub = d.group("sub", { kind: "generic", label: "운영 구독" });
    const fd = sub.node("fd", { icon: "azure.front-door", label: "Front Door", sublabel: "전역 진입점", hints: { layer: 0 } });
    const vnet = sub.group("vnet", { kind: "generic", label: "VNet 10.0.0.0/16", hints: { layer: 1 } });
    const agw = vnet.node("agw", { icon: "azure.appgw", label: "Application Gateway", sublabel: "WAF", hints: { layer: 0 } });

    const aks = vnet.group("aks", { kind: "generic", label: "AKS 클러스터", hints: { layer: 1 } });
    const ing = aks.node("ing", { icon: "k8s.ingress", label: "ingress", hints: { layer: 0 } });
    const svc = aks.node("svc", { icon: "k8s.service", label: "shop-api", hints: { layer: 1 } });
    const dep = aks.node("dep", { icon: "k8s.deployment", label: "shop-api", sublabel: "파드 3개", hints: { layer: 2 } });

    const data = vnet.group("data", { kind: "generic", label: "데이터", hints: { layer: 2 } });
    const sql = data.node("sql", { icon: "azure.sql", label: "Azure SQL", sublabel: "주문", hints: { order: 0 } });
    const redis = data.node("redis", { icon: "azure.redis", label: "Azure Cache for Redis", sublabel: "세션", hints: { order: 1 } });

    const kv = sub.node("kv", { icon: "azure.key-vault", label: "Key Vault", hints: { layer: 2, order: 1 } });
    const acr = sub.node("acr", { icon: "azure.acr", label: "Container Registry", hints: { layer: 0, order: 1 } });
    const ai = sub.node("ai", { icon: "azure.app-insights", label: "Application Insights", hints: { layer: 2, order: 2 } });

    d.edge(user, fd, { label: "HTTPS", layer: "요청" });
    d.edge(fd, agw, { layer: "요청" });
    d.edge(agw, ing, { layer: "요청" });
    d.edge(ing, svc, { layer: "요청" });
    d.edge(svc, dep, { layer: "요청" });
    d.edge(dep, sql, { label: "주문 저장", layer: "요청" });
    d.edge(dep, redis, { label: "세션", layer: "요청" });
    d.edge(dep, kv, { label: "비밀 읽기", layer: "설정", style: { preset: "dashed" } });
    d.edge(acr, dep, { label: "이미지", layer: "배포", style: { preset: "dotted" } });
    d.edge(dep, ai, { label: "추적", layer: "관측", style: { preset: "dotted" } });
  },
);
