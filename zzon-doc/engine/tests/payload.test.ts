/**
 * Viewer payload tests (viewer-frame contract §1): the frame reads ONLY this
 * JSON, so its shape is a wire contract — schema fields, docKind→kind,
 * counts, warnings, node/edge/flow projections, resolved legend entries,
 * asset filenames, and JSON round-trip determinism.
 */
import { describe, expect, test } from "bun:test";
import type { Scene } from "../src/layout/scene.ts";
import type { DiagramModel } from "../src/model/types.ts";
import { buildPayload } from "../src/render/payload.ts";
import { CATEGORY_COLORS_LIGHT } from "../src/render/categories.gen.ts";

// ------------------------------------------------------------ fixture

/** hand-built COMPLETE scene: cards + an ERD table node + flows + a group */
function makeScene(): Scene {
  return {
    id: "pay-fixture",
    title: "Payload Fixture",
    docKind: "data-flow",
    width: 640,
    height: 400,
    groups: [
      {
        kind: "group",
        path: "svc",
        rect: { x: 10, y: 10, width: 620, height: 380 },
        groupKind: "generic",
      },
    ],
    overlays: [],
    edges: [
      {
        kind: "edge",
        id: "e0",
        from: "gw",
        to: "svc/order",
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        label: { text: "REST", x: 50, y: -6, fontSize: 11, weight: "regular", align: "middle" },
        style: { preset: "default", color: "#545B64", arrowhead: "end" },
        layer: "http",
      },
      {
        kind: "edge",
        id: "e1",
        from: "svc/order",
        to: "orders",
        points: [{ x: 100, y: 0 }, { x: 200, y: 0 }],
        style: { preset: "dotted", color: "#545B64", arrowhead: "end" },
        layer: "data",
      },
    ],
    nodes: [
      {
        kind: "node",
        path: "gw",
        rect: { x: 20, y: 40, width: 192, height: 52 },
        category: "gateway",
        tech: "Kong",
        href: "gw-detail",
        label: { text: "API <GW>", x: 0, y: 0, fontSize: 12, weight: "semibold", align: "start" },
        role: "card",
      },
      {
        kind: "node",
        path: "svc/order",
        rect: { x: 240, y: 40, width: 192, height: 52 },
        category: "service",
        description: "주문 도메인",
        label: { text: "Order", x: 0, y: 0, fontSize: 12, weight: "semibold", align: "start" },
        role: "card",
      },
      {
        // no label -> path tail fallback; ERD table with per-column scene Y
        kind: "node",
        path: "orders",
        rect: { x: 460, y: 40, width: 240, height: 82 },
        role: "table",
        table: {
          headerHeight: 30,
          rowHeight: 26,
          columns: [
            { name: "id", type: "uuid", pk: true, y: 83 },
            { name: "user_id", type: "uuid", fk: { table: "users", column: "id" }, nullable: true, y: 109 },
          ],
        },
      },
    ],
    markers: [],
    flows: [
      {
        id: "order",
        title: "주문 접수",
        description: "해피 패스",
        steps: [
          { edgeId: "e0", text: "제출", badge: { x: 50, y: 0 }, n: 1 },
          { edgeId: "e1", text: "저장", badge: { x: 150, y: 0 }, n: 2 },
        ],
      },
    ],
    icons: [],
    texts: [],
  };
}

const model = { docKind: "erd" } as DiagramModel; // scene.docKind must win

// ------------------------------------------------------------ tests

describe("buildPayload", () => {
  const p = buildPayload(makeScene(), model);

  test("identity: id/title/kind (scene docKind wins over model)", () => {
    expect(p.id).toBe("pay-fixture");
    expect(p.title).toBe("Payload Fixture");
    expect(p.kind).toBe("data-flow");
  });

  test("kind falls back to model docKind, then infra; title falls back to id", () => {
    const bare = { ...makeScene(), docKind: undefined, title: undefined };
    expect(buildPayload(bare, model).kind).toBe("erd");
    expect(buildPayload(bare).kind).toBe("infra");
    expect(buildPayload(bare).title).toBe("pay-fixture");
  });

  test("counts + warnings (a11y aria-label inputs; no layout warnings yet)", () => {
    expect(p.counts).toEqual({ nodes: 3, edges: 2, flows: 1, groups: 1 });
    expect(p.warnings).toEqual([]);
  });

  test("nodes: contract fields only, label fallback, optional keys omitted", () => {
    expect(p.nodes[0]).toEqual({
      path: "gw",
      label: "API <GW>", // RAW string — the FRAME escapes at render time
      category: "gateway",
      tech: "Kong",
      href: "gw-detail",
    });
    expect(p.nodes[1]).toEqual({
      path: "svc/order",
      label: "Order",
      category: "service",
      description: "주문 도메인",
    });
    expect(p.nodes[2]!.label).toBe("orders"); // path-tail fallback
    const json = JSON.stringify(p);
    expect(json).not.toContain('"rect"'); // scene geometry never leaks
    expect(json).not.toContain('"role"');
  });

  test("ERD table columns survive without scene-only Y coordinates", () => {
    expect(p.nodes[2]!.table).toEqual({
      columns: [
        { name: "id", type: "uuid", pk: true },
        { name: "user_id", type: "uuid", fk: { table: "users", column: "id" }, nullable: true },
      ],
    });
  });

  test("edges: id/from/to + optional label/layer", () => {
    expect(p.edges).toEqual([
      { id: "e0", from: "gw", to: "svc/order", label: "REST", layer: "http" },
      { id: "e1", from: "svc/order", to: "orders", layer: "data" },
    ]);
  });

  test("flows: steps as {edgeId, text, n} — no badge geometry", () => {
    expect(p.flows).toEqual([
      {
        id: "order",
        title: "주문 접수",
        description: "해피 패스",
        steps: [
          { edgeId: "e0", text: "제출", n: 1 },
          { edgeId: "e1", text: "저장", n: 2 },
        ],
      },
    ]);
  });

  test("legend: resolved entries (categories + layers + group kinds)", () => {
    expect(p.legend).toEqual([
      { group: "category", label: "게이트웨이", swatch: { type: "dot", color: CATEGORY_COLORS_LIGHT.edge } },
      { group: "category", label: "서비스", swatch: { type: "dot", color: CATEGORY_COLORS_LIGHT.backend } },
      { group: "edge", label: "http", swatch: { type: "line", color: "#545B64" } },
      { group: "edge", label: "data", swatch: { type: "line", color: "#545B64", dash: "2 3" } },
      { group: "groupKind", label: "그룹", swatch: { type: "border", color: "#7D8998", dash: "4 3" } },
    ]);
  });

  test("assets: defaults to <id>.svg, CLI can name what it writes", () => {
    expect(p.assets).toEqual({ svgFile: "pay-fixture.svg" });
    const cli = buildPayload(makeScene(), model, {
      assets: { svgFile: "out.svg", pngFile: "out.png" },
    });
    expect(cli.assets).toEqual({ svgFile: "out.svg", pngFile: "out.png" });
  });

  test("deterministic and JSON round-trip clean (no undefined holes)", () => {
    const a = JSON.stringify(buildPayload(makeScene(), model));
    const b = JSON.stringify(buildPayload(makeScene(), model));
    expect(a).toBe(b);
    expect(JSON.parse(a)).toEqual(buildPayload(makeScene(), model) as unknown as Record<string, unknown>);
  });
});
