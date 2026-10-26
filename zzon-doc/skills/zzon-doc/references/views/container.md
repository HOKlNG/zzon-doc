# 컨테이너 · 컴포넌트 (C4 L2 · L3)

## 컨테이너 (L2)

**질문**: 무엇이 따로 배포·실행되고, 어떤 기술이며, 어떻게 통신하나.
**독자**: 개발자와 운영자.
**등급**: T2 표준(10–20).

**신호**는 `scan.mjs`의 배포 단위 수(Dockerfile·compose 서비스·워크스페이스)다. 배포 단위가 1개면 이 장 대신 컴포넌트 장을 그린다.

### 문법

- 시스템 경계를 그룹으로 그린다: `d.group("platform", { kind: "generic", label: "<시스템명>" })`.
- 경계 **밖에는 컨텍스트 장의 이웃(사람·외부 시스템)을 그대로** 둔다. L1~L2를 한 장에 담는 게 표준 문법이다.
- 각 컨테이너에는 `tech`를 필수로 단다(예: "NestJS 10", "PostgreSQL 16").
- 열 구조는 `direction: "RIGHT"` + `hints.layer`로 잡는다. 기본 순서는 다음과 같다.
  사람(0) → 프론트(1) → 게이트웨이·인증(2) → 서비스(3) → 데이터스토어(4) → 비동기·워커(5) → 외부(6)
- 같은 열 안의 순서는 `hints.order`로 정한다. 같은 도메인의 서비스와 DB는 같은 order로 가로로 맞춘다.
- 로드밸런서·복제·AZ는 **넣지 않는다**. 그건 배포 장의 몫이다.
- 대표 요청 경로를 `d.flow()`로 1~2개 넣는다.
- 각 서비스 노드에 `href`로 해당 기능 흐름이나 컴포넌트 장을 잇는다.

### 템플릿 (요지)

```ts
export default diagram("container", { title: "데모숍 컨테이너", view: "container", tier: "standard", direction: "RIGHT" }, (d) => {
  const buyer = d.node("buyer", { category: "user", label: "구매자", hints: { layer: 0 } });
  const p = d.group("platform", { kind: "generic", label: "데모숍" });
  const web = p.node("web", { category: "frontend", label: "웹 앱", tech: "Next.js", hints: { layer: 1 } });
  const gw = p.node("gw", { category: "gateway", label: "API 게이트웨이", tech: "Kong", hints: { layer: 2 } });
  const order = p.node("order", { category: "service", label: "주문 서비스", tech: "NestJS", hints: { layer: 3, order: 0 }, href: "flow-order" });
  const orderDb = p.node("order-db", { category: "db", label: "주문 DB", tech: "PostgreSQL", hints: { layer: 4, order: 0 } });
  const pg = d.node("pg", { category: "external", label: "PG사", hints: { layer: 6 } });
  const e1 = d.edge(buyer, web, { label: "이용", layer: "http" });
  const e2 = d.edge(web, gw, { label: "REST", layer: "http" });
  const e3 = d.edge(gw, order, { layer: "http" });
  d.edge(order, orderDb, { layer: "data" });
  d.edge(order, pg, { label: "결제 승인", layer: "http" });
  d.flow("checkout", { title: "주문 접수", steps: [{ edge: e1, text: "구매자가 주문합니다" }, { edge: e2, text: "웹이 API를 호출합니다" }, { edge: e3, text: "요청이 주문 서비스로 갑니다" }] });
});
```

## 컴포넌트 (L3)

**질문**: 컨테이너 **하나**의 내부는 어떤 책임으로 나뉘나.
**등급**: T2.
**조건**: 해당 컨테이너에 모듈이 5개 이상이고(scan의 소스 모듈), 그 컨테이너가 질문의 초점일 때만 그린다. C4 권고상 기본 세트가 아니다.

- 컨테이너 경계를 그룹으로 그린다. 경계 **밖에는 호출자와 협력자**(게이트웨이·DB·브로커·이웃 컨테이너)를 둔다. L2~L3를 한 장에 담는다.
- 경계 안은 진입(API·핸들러) → 유스케이스·서비스 → 어댑터(리포지토리·클라이언트) 순서의 열로 놓는다(`hints.layer`).
- **한 장 = 한 부모의 내부**다. 컨테이너 둘을 동시에 까지 마라.
- 모듈 간 import 관계 자체가 질문이라면 이 장이 아니라 `dependency.md`(기계 추출)를 쓴다.

## 점검

- [ ] 컨텍스트 장에서 시스템을 드나들던 연결이 여기서도 전부 보인다(밸런싱).
- [ ] 노드마다 tech가 있다(컨테이너 장).
- [ ] 같은 도메인의 서비스와 DB가 같은 order로 가로로 정렬된다.
- [ ] `bun ia check` 통과, 경고는 이유와 함께 보고.
