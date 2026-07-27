/**
 * erd-sample — linkonn 코어 테이블 ERD (users / links / tags / link_tags).
 *
 * ERD 규칙: docKind "erd", 모든 노드는 table (아이콘 없음 — 허용됨),
 * FK 엣지는 sourceColumn/targetColumn으로 컬럼 행에 앵커되고 양끝에
 * 까마귀발 카디널리티가 붙는다. 다섯 가지 카디널리티를 모두 사용한다.
 */
import { diagram } from "../src/dsl/index.ts";

export default diagram("erd-sample", { aspectRatio: 2.6, title: "linkonn — ERD (core tables)", docKind: "erd" }, (d) => {
  const users = d.node("users", {
    label: "users",
    description: "가입 사용자 계정",
    table: {
      columns: [
        { name: "id", type: "uuid", pk: true },
        { name: "email", type: "text", unique: true },
        { name: "display_name", type: "text", nullable: true },
        { name: "created_at", type: "timestamptz" },
      ],
    },
  });

  const links = d.node("links", {
    label: "links",
    description: "사용자가 수집한 링크",
    table: {
      columns: [
        { name: "id", type: "uuid", pk: true },
        // nullable fk → 타깃 카디널리티 0..1이 실제 스키마와 일치
        { name: "user_id", type: "uuid", fk: { table: "users", column: "id" }, nullable: true },
        { name: "url", type: "text" },
        { name: "title", type: "text", nullable: true },
        { name: "created_at", type: "timestamptz" },
      ],
    },
  });

  const tags = d.node("tags", {
    label: "tags",
    description: "링크 분류 태그",
    table: {
      columns: [
        { name: "id", type: "uuid", pk: true },
        { name: "name", type: "text", unique: true },
      ],
    },
  });

  const linkTags = d.node("link_tags", {
    label: "link_tags",
    description: "링크·태그 M:N 조인 테이블",
    table: {
      columns: [
        { name: "link_id", type: "uuid", pk: true, fk: { table: "links", column: "id" } },
        { name: "tag_id", type: "uuid", pk: true, fk: { table: "tags", column: "id" } },
      ],
    },
  });

  d.edge(links, users, {
    sourceColumn: "user_id",
    targetColumn: "id",
    sourceCardinality: "0..N",
    targetCardinality: "0..1",
  });
  d.edge(linkTags, links, {
    sourceColumn: "link_id",
    targetColumn: "id",
    sourceCardinality: "N",
    targetCardinality: "1",
  });
  d.edge(linkTags, tags, {
    sourceColumn: "tag_id",
    targetColumn: "id",
    sourceCardinality: "1..N",
    targetCardinality: "1",
  });
});
