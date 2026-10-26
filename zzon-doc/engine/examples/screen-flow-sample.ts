/**
 * screen-flow-sample — 화면 흐름(docKind "screen-flow") 정본 예제: 쇼핑 앱 구매 동선.
 * 화면(브라우저 프레임 + 라우트)과 이동(사용자 행동 라벨). 방향은 docKind 기본값
 * RIGHT — 길면 엔진이 글줄식으로 감는다. 인증 분기는 order 1로 본선 아래에 둔다.
 */
import { diagram } from "../src/dsl/index.ts";

export default diagram(
  "screen-flow-sample",
  { title: "구매 동선 화면 흐름", docKind: "screen-flow", view: "screen-flow", tier: "standard" },
  (d) => {
    const home = d.screen("home", { label: "홈", route: "/", description: "추천 상품과 기획전을 보여 주는 첫 화면입니다." });
    const list = d.screen("list", { label: "상품 목록", route: "/products?category=" });
    const detail = d.screen("detail", { label: "상품 상세", route: "/products/[id]" });
    const cart = d.screen("cart", { label: "장바구니", route: "/cart" });
    const login = d.screen("login", { label: "로그인", route: "/login", hints: { order: 1 } });
    const checkout = d.screen("checkout", { label: "주문·결제", route: "/checkout" });
    const done = d.screen("done", { label: "주문 완료", route: "/orders/[id]/complete" });

    const n1 = d.edge(home, list, { label: "카테고리", layer: "nav" });
    const n2 = d.edge(list, detail, { label: "상품 선택", layer: "nav" });
    const n3 = d.edge(detail, cart, { label: "담기", layer: "nav" });
    const n4 = d.edge(cart, checkout, { label: "주문하기", layer: "nav" });
    d.edge(cart, login, { label: "비로그인", layer: "auth", style: { preset: "dashed" } });
    d.edge(login, checkout, { label: "로그인 성공", layer: "auth", style: { preset: "dashed" } });
    const n5 = d.edge(checkout, done, { label: "결제 승인", layer: "nav" });
    // 되돌아가는 엣지는 back: true(배치에서 역방향 취급 — 본선 읽는 순서 유지) +
    // 진입면 힌트로 캔버스 바깥을 돌아 들어오게 한다(본선 선분과 겹치지 않음)
    d.edge(done, home, { label: "쇼핑 계속", layer: "nav", style: { preset: "dotted" }, back: true, hints: { sourceSide: "E", targetSide: "N" } });

    d.flow("buy", {
      title: "첫 구매",
      steps: [
        { edge: n1, text: "홈에서 카테고리로 들어갑니다" },
        { edge: n2, text: "상품을 고릅니다" },
        { edge: n3, text: "장바구니에 담습니다" },
        { edge: n4, text: "주문을 시작합니다" },
        { edge: n5, text: "결제가 승인되면 완료 화면으로 갑니다" },
      ],
    });
  },
);
