# ERD (`docKind: "erd"`)

**질문**: 어떤 테이블이 있고 어떻게 관계 맺나.
**등급**: T2. 장당 테이블 12개 이하다. 넘으면 **도메인(주제 영역)별로 분할**하고 장끼리 `href`로 잇는다.
**신호**: `scan.mjs`의 테이블 수와 출처(prisma·SQL·ORM)다.

## 문법

- 모든 노드는 `table:` 노드다(어휘 검사에서 제외).
- FK는 컬럼에 앵커를 단다: `d.edge(child, parent, { sourceColumn: "user_id", targetColumn: "id", sourceCardinality: "0..N", targetCardinality: "1", layer: "fk", style: { arrowhead: "none" } })`.
  - 카디널리티 값: `"1" | "0..1" | "N" | "0..N" | "1..N"`(까마귀발로 렌더된다).
- 컬럼: `{ name, type?, pk?, fk?: { table, column }, unique?, nullable? }`. 감사 컬럼(created_at 등)은 T1·T2에서 생략할 수 있다(축소 사다리 4단계). 생략했으면 보고한다.
- 분할한 장 사이의 FK는 상대 장의 테이블을 **이름만 있는 1컬럼 테이블**로 경계 밖에 두고 `href`로 잇는다.

## 템플릿

```ts
export default diagram("erd-order", { title: "주문 도메인 ERD", view: "erd", tier: "standard", docKind: "erd" }, (d) => {
  const users = d.node("users", { label: "users", table: { columns: [{ name: "id", type: "uuid", pk: true }, { name: "email", type: "text", unique: true }] } });
  const orders = d.node("orders", { label: "orders", table: { columns: [
    { name: "id", type: "uuid", pk: true },
    { name: "user_id", type: "uuid", fk: { table: "users", column: "id" } },
    { name: "status", type: "order_status" },
  ] } });
  d.edge(orders, users, { sourceColumn: "user_id", targetColumn: "id", sourceCardinality: "0..N", targetCardinality: "1", layer: "fk", style: { arrowhead: "none" } });
});
```

## 점검

- [ ] 스키마 원본(prisma·마이그레이션·엔티티)을 실제로 읽었다. `sources`에 그 경로를 넣었다.
- [ ] 장당 테이블 12개 이하다. 넘으면 분할했고, 분할 기준(도메인)을 보고했다.
- [ ] 상태 컬럼(status enum)이 있으면 상태 전이도(`state.md`) 장을 제안했다.
