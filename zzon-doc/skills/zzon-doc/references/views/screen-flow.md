# 화면 흐름 (`docKind: "screen-flow"`)

**질문**: 사용자가 어떤 화면을 거쳐 목표에 닿나. 분기(로그인 필요·권한)와 되돌아가는 동선은 무엇인가.
**등급**: T2. 사용자 목표(구매·가입·정산 신청…)마다 1장이 원칙이다. 앱 전체 지도(IA)는 화면이 20개를 넘으면 섹션별로 쪼갠다.
**신호**: scan의 화면/페이지 수(Next.js `app/**/page.tsx`·`pages/**`, React Router `<Route path>`, Vue views).

## 코드에서 읽는 법

- **화면** = 라우트 정의(파일 기반 라우팅이면 파일 경로가 곧 라우트)
- **이동** = `<Link href>`, `router.push()`, `navigate()`, 리다이렉트(미들웨어·가드). 이동을 일으키는 사용자 행동(버튼 라벨)을 엣지 라벨로 쓴다.
- 인증 가드·권한 리다이렉트는 점선 분기로 그린다.

## 문법 (DSL 헬퍼)

| 요소 | DSL |
|---|---|
| 화면 | `d.screen(id, { label, route: "/products/[id]", description: "상품 정보와 구매 버튼을 보여 줍니다." })` |
| 이동 | `d.edge(a, b, { label: "<사용자 행동>", layer: "nav" })` |
| 조건부 이동(인증·권한) | `{ layer: "auth", style: { preset: "dashed" } }` |
| 되돌아가는 동선 | `{ back: true, hints: { sourceSide: "E", targetSide: "N" } }` — 본선 순서를 지키고 캔버스 위로 돌아온다 |

- 방향 기본값은 RIGHT다. 화면이 많으면 엔진이 글줄식(Z자)으로 감는다. 분기 화면은 `hints.order: 1`.
- 대표 동선 하나를 `d.flow()`로 순번 표시한다.

## 템플릿 (`engine/examples/screen-flow-sample.ts` 요약)

```ts
import { diagram } from "../src/dsl/index.ts";

export default diagram("buy-flow", { title: "구매 동선", docKind: "screen-flow", view: "screen-flow", tier: "standard" }, (d) => {
  const home = d.screen("home", { label: "홈", route: "/" });
  const detail = d.screen("detail", { label: "상품 상세", route: "/products/[id]" });
  const login = d.screen("login", { label: "로그인", route: "/login", hints: { order: 1 } });
  const checkout = d.screen("checkout", { label: "주문·결제", route: "/checkout" });
  d.edge(home, detail, { label: "상품 선택", layer: "nav" });
  d.edge(detail, checkout, { label: "바로 구매", layer: "nav" });
  d.edge(detail, login, { label: "비로그인", layer: "auth", style: { preset: "dashed" } });
  d.edge(login, checkout, { label: "로그인 성공", layer: "auth", style: { preset: "dashed" } });
  d.edge(checkout, home, { label: "쇼핑 계속", layer: "nav", back: true, hints: { sourceSide: "E", targetSide: "N" } });
});
```

## 점검

- [ ] 라우트는 실제 파일·정의와 일치한다. 화면 파일은 `sources`에 넣고, `description`에는 화면이 하는 일을 썼다.
- [ ] 엣지 라벨은 사용자 행동이다(동사, 2어절 이내).
- [ ] 화면 안의 처리(API 호출·검증)는 그리지 않았다. 필요하면 시퀀스 장으로 `href`를 걸었다.
