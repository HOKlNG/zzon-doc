/**
 * DiagramSpec 호환 변환기 게이트: 레퍼런스 샘플 13종 전부가
 * 변환 → 검증(어휘 가드 포함) → 레이아웃+라우팅 → 불변식까지 통과해야 한다.
 * (kind:"sequence"는 변환 대상이 아니다 — 거부를 별도 확인)
 */
import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { convertDiagramSpec, ConvertError } from "../src/compat/diagramspec.ts";
import { validate } from "../src/model/validate.ts";
import { validateErd } from "../src/model/erd.ts";
import { layoutDiagram } from "../src/layout/compose.ts";
import { routeEdges } from "../src/route/router.ts";
import { checkScene } from "./invariants.ts";

const REFS = join(import.meta.dir, "..", "..", "skills", "zzon-doc", "references");
const load = (f: string) => {
  const raw = JSON.parse(readFileSync(join(REFS, f), "utf8"));
  return raw && raw.spec ? raw.spec : raw;
};

const samples = readdirSync(REFS)
  .filter((f) => f.startsWith("sample-") && f.endsWith(".json"))
  .filter((f) => load(f).kind !== "sequence");

describe("convertDiagramSpec — 레퍼런스 샘플 전수", () => {
  expect(samples.length).toBeGreaterThanOrEqual(12);

  for (const file of samples) {
    test(file, async () => {
      const spec = load(file);
      const { model } = convertDiagramSpec(spec);

      // 검증: 구조 + ERD + 어휘 가드(순수 레거시 어휘여야 플래그 없이 통과)
      const v = validate(model);
      const erd = validateErd(model);
      const errors = [...v.issues, ...erd].filter((i) => i.severity === "error");
      expect(errors.map((e) => e.message)).toEqual([]);

      // 개수 보존: 스펙의 노드/엣지/플로우가 변환에서 흘러내리면 안 된다
      expect(model.edges.length).toBe((spec.edges ?? []).length);
      expect(model.flows.length).toBe((spec.flows ?? []).length);
      const nodeCount =
        model.children.flatMap(function walk(el): unknown[] {
          return el.type === "group"
            ? [...el.children.flatMap(walk), ...(el.grid ? Object.values(el.grid.cells).flatMap((c) => c.children.flatMap(walk)) : [])]
            : [el];
        }).length + model.actors.length + model.bands.flatMap((b) => b.children).length;
      expect(nodeCount).toBe((spec.nodes ?? []).length);

      // 레이아웃 + 라우팅 + 불변식.
      // 레거시 스펙엔 종횡비 의도가 없으므로 aspect는 극단 형상만 차단(±75%),
      // 겹침·관통·라벨 규칙은 엄격 유지한다.
      const scene = await layoutDiagram(model);
      await routeEdges(scene, model.edges);
      const violations = checkScene(scene, { aspectRatio: model.aspectRatio, aspectTolerance: 0.75 });
      expect(violations.map((x) => `${x.rule}: ${x.detail.slice(0, 80)}`)).toEqual([]);
    });
  }
});

test("kind:sequence 스펙은 명확히 거부한다", () => {
  expect(() => convertDiagramSpec({ kind: "sequence", title: "t", actors: [], steps: [] })).toThrow(
    ConvertError,
  );
});

describe("vocabulary 옵션 — 정책은 스펙/호출자, 엔진은 메커니즘", () => {
  const base = {
    title: "t", kind: "infra",
    nodes: [
      { id: "u", label: "사용자", category: "user" },
      { id: "fn", label: "API", category: "lambda", tech: "Node 20" },
      { id: "db", label: "주문 DB", category: "db", tech: "PostgreSQL 16" },
      { id: "q", label: "큐", category: "queue" },
    ],
    edges: [{ id: "e1", source: "u", target: "fn" }],
  };
  const nodesOf = (m: import("../src/model/types.ts").DiagramModel) =>
    m.children.flatMap(function walk(el): import("../src/model/types.ts").NodeEl[] {
      return el.type === "group" ? el.children.flatMap(walk) : [el as import("../src/model/types.ts").NodeEl];
    });

  test('기본은 카드 어휘 그대로', () => {
    const { model } = convertDiagramSpec(base);
    expect(nodesOf(model).every((n) => n.category && !n.icon)).toBe(true);
  });

  test('spec.vocabulary "aws" -> 전 노드 아이콘 어휘 (tech 힌트 우선)', () => {
    const { model, warnings } = convertDiagramSpec({ ...base, vocabulary: "aws" });
    const ns = nodesOf(model);
    expect(ns.every((n) => n.icon && !n.category)).toBe(true);
    expect(ns.find((n) => n.id === "db")!.icon).toBe("rds");
    expect(ns.find((n) => n.id === "q")!.icon).toBe("sqs");
    expect(warnings.some((w) => w.includes("폴백"))).toBe(false);
  });

  test("매핑 불가 노드가 있으면 전체 카드 폴백 + 경고 (혼용 금지)", () => {
    const spec = { ...base, vocabulary: "aws", nodes: [...base.nodes, { id: "x", label: "?", category: "claude" }] };
    const { model, warnings } = convertDiagramSpec(spec);
    expect(nodesOf(model).every((n) => n.category && !n.icon)).toBe(true);
    expect(warnings.some((w) => w.includes('"x"'))).toBe(true);
  });
});
