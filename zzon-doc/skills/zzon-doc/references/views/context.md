# 컨텍스트 · 랜드스케이프 (C4 L1)

**질문**: 이게 무엇이고, 누가 쓰고, 무엇에 기대는가. 포괄적 요청이면 **거의 항상 첫 장**이다.
**독자**: 전원이다. 비기술자도 포함한다.
**등급**: T1 개괄로 고정한다. 중심 시스템 1개 + 주변 5~9개로 그린다.

## 문법

- 중심 시스템은 **1개**다. 내부 구조와 기술 스택은 넣지 않는다. 그건 컨테이너 장의 몫이다.
- 사람(`category: "user"`)은 왼쪽(`layer: 0`), 중심은 가운데(`layer: 1`), 외부 시스템(`category: "external"`)은 오른쪽(`layer: 2`)에 둔다. `direction: "RIGHT"`.
- **모든 엣지에 의도 라벨**을 단다(동사 2어절, 예: "주문", "결제 승인").
- C4 관례대로 카드 안에 한 줄 설명을 보인다: `nodeDescriptions: true`, 각 노드에 `description`.
- 중심 노드에 `href: "<컨테이너 장 slug>"`를 단다. 통합 문서에서 더블클릭하면 그 장으로 이동한다.
- **랜드스케이프**(조직 내 시스템 여러 개): 문법은 같다. 중심 대신 시스템들을 `d.group(…, { kind: "generic", label: "<도메인>" })`으로 묶는다. 요소가 9개를 넘으면 T2다.

## 템플릿

```ts
import { diagram } from "../src/dsl/index.ts";

export default diagram(
  "context",
  { title: "데모숍 시스템 컨텍스트", view: "context", tier: "overview", direction: "RIGHT", nodeDescriptions: true },
  (d) => {
    const buyer = d.node("buyer", { category: "user", label: "구매자", description: "상품을 탐색하고 주문한다", hints: { layer: 0, order: 0 } });
    const admin = d.node("admin", { category: "user", label: "운영자", description: "상품과 주문을 관리한다", hints: { layer: 0, order: 1 } });
    const shop = d.node("shop", {
      category: "service", label: "데모숍", tech: "커머스 플랫폼",
      description: "상품 전시부터 결제와 알림까지 맡는 중심 시스템", href: "container", hints: { layer: 1 },
    });
    const pg = d.node("pg", { category: "external", label: "토스페이먼츠", description: "결제 승인을 맡는 외부 결제대행사", hints: { layer: 2, order: 0 } });
    const mail = d.node("mail", { category: "external", label: "메일 서비스", tech: "SES", description: "주문 알림 메일을 보낸다", hints: { layer: 2, order: 1 } });

    d.edge(buyer, shop, { label: "주문", layer: "http" });
    d.edge(admin, shop, { label: "관리", layer: "http" });
    d.edge(shop, pg, { label: "결제 승인", layer: "http" });
    d.edge(shop, mail, { label: "메일 발송", layer: "async", style: { preset: "dashed" } });
  },
);
```

## 점검

- [ ] 중심이 1개이고, 내부 컴포넌트·DB가 섞이지 않았다.
- [ ] 외부 시스템은 코드에서 읽힌 연동(클라이언트·SDK·웹훅)만 넣었다.
- [ ] 라벨이 짧다. 긴 설명은 `description`에 넣었다.
- [ ] `bun ia check` 통과(T1: 교차 0, 라벨 가림 0).
