/**
 * Category card + legend-data tests: metrics-driven sizing, the two render
 * variants, the --cat-* variable block, legendEntries used-only filtering
 * (contract §1 data — the frame draws it), and the msa-sample example
 * validating clean with zero icons.
 */
import { describe, expect, test } from "bun:test";
import type { Scene, SceneNode } from "../src/layout/scene.ts";
import {
  CARD_WIDTH,
  CARD_WIDTH_DESC,
  cardCssVars,
  renderCardStatic,
  renderCardSvg,
  sizeCard,
} from "../src/render/card.ts";
import { legendEntries } from "../src/render/legend.ts";
import { CATEGORY_COLORS_DARK, CATEGORY_COLORS_LIGHT } from "../src/render/categories.gen.ts";
import { validate, formatIssues } from "../src/model/validate.ts";
import msaSample from "../examples/msa-sample.ts";

const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

/** card SceneNode with coherent rect from sizeCard */
function cardNode(over: Partial<SceneNode> & { category: string }): SceneNode {
  const s = sizeCard({
    label: over.label?.text ?? "Card",
    category: over.category,
    tech: over.tech,
    description: over.description,
  });
  return {
    kind: "node",
    path: "services/card",
    rect: { x: 100, y: 80, width: s.width, height: s.height },
    role: "card",
    label: { text: "Card", x: 0, y: 0, fontSize: 12, weight: "semibold", align: "start" },
    ...over,
  };
}

describe("sizeCard", () => {
  test("base card is 192 wide, fixed row height", () => {
    const s = sizeCard({ label: "Order Service", category: "service", tech: "NestJS" });
    expect(s.width).toBe(CARD_WIDTH);
    expect(s.height).toBe(52);
    expect(s.iconTile).toEqual({ x: 14, y: 10, width: 32, height: 32 });
    expect(s.techPos).toBeDefined();
    expect(s.descLines).toBeUndefined();
  });

  test("description widens to 220 and grows height per wrapped line", () => {
    const short = sizeCard({ label: "GW", category: "gateway", description: "짧은 설명." });
    const long = sizeCard({
      label: "GW",
      category: "gateway",
      description: "모든 외부 트래픽의 단일 진입점으로 인증 토큰 검증, 유량 제어, 서비스별 라우팅을 담당하는 컴포넌트.",
    });
    expect(short.width).toBe(CARD_WIDTH_DESC);
    expect(long.width).toBe(CARD_WIDTH_DESC);
    expect(short.height).toBeGreaterThan(52);
    expect(long.descLines!.length).toBeGreaterThan(short.descLines!.length);
    expect(long.height).toBeGreaterThan(short.height);
  });

  test("description clamps at 3 lines with ellipsis", () => {
    const s = sizeCard({ label: "GW", category: "gateway", description: "아주 긴 설명 ".repeat(40).trim() });
    expect(s.descLines!.length).toBe(3);
    expect(s.descLines![2]!.endsWith("…")).toBe(true);
  });

  test("unknown category throws listing valid categories", () => {
    expect(() => sizeCard({ category: "warehouse" })).toThrow(/unknown category "warehouse"/);
    expect(() => sizeCard({ category: "warehouse" })).toThrow(/backend/);
    expect(() => sizeCard({ category: "warehouse" })).toThrow(/external/);
  });
});

describe("renderCardSvg", () => {
  const n = cardNode({
    category: "backend",
    tech: "NestJS 10",
    href: "order-detail",
    label: { text: "Order <Svc>", x: 0, y: 0, fontSize: 12, weight: "semibold", align: "start" },
  });
  const svg = renderCardSvg(n, { interactive: true });

  test("accent bar + tile use the category CSS variable (tint via fill-opacity)", () => {
    expect(count(svg, "var(--cat-backend)")).toBeGreaterThanOrEqual(3); // accent + tile + icon stroke
    expect(svg).toContain(`fill-opacity="0.13"`);
    expect(svg).not.toContain("color-mix");
  });

  test("lucide icon referenced via <use> with re-applied stroke attrs", () => {
    expect(svg).toContain(`<use href="#i-x_lucide-server"`);
    expect(svg).toContain(`stroke-linecap="round"`);
  });

  test("interactive attrs, tech chip, escaped label", () => {
    expect(svg).toContain(`data-path="services/card"`);
    expect(svg).toContain(`data-href="order-detail"`);
    expect(svg).toContain("NestJS 10");
    expect(svg).toContain("Order &lt;Svc&gt;");
    expect(svg).not.toContain("Order <Svc>");
  });

  test("non-interactive drops data attributes and classes", () => {
    const plain = renderCardSvg(n, { interactive: false });
    expect(plain).not.toContain("data-");
    expect(plain).not.toContain("class=");
  });

  test('category "external" gets a dashed accent-colored border', () => {
    const ext = renderCardSvg(cardNode({ category: "external" }), { interactive: true });
    expect(ext).toContain(`stroke-dasharray="4 3"`);
    expect(ext).toContain("var(--cat-external)");
    // fallback sublabel: Korean category name instead of a tech chip
    expect(ext).toContain("외부 서비스");
  });

  test("deterministic", () => {
    expect(renderCardSvg(n, { interactive: true })).toBe(svg);
  });
});

describe("renderCardStatic", () => {
  const n = cardNode({ category: "db", tech: "PostgreSQL 16" });

  test("literal palette colors per theme, no vars/classes/text", () => {
    const light = renderCardStatic(n, "light");
    const dark = renderCardStatic(n, "dark");
    expect(light).toContain(CATEGORY_COLORS_LIGHT.data); // db -> "data" color group
    expect(dark).toContain(CATEGORY_COLORS_DARK.data);
    for (const out of [light, dark]) {
      expect(out).not.toContain("var(--");
      expect(out).not.toContain("class=");
      expect(out).not.toContain("data-");
      expect(out).not.toContain("<text");
    }
  });
});

describe("cardCssVars", () => {
  test("emits one --cat-* declaration per color group, themed", () => {
    const light = cardCssVars("light");
    const dark = cardCssVars("dark");
    expect(light).toContain(`--cat-backend:${CATEGORY_COLORS_LIGHT.backend};`);
    expect(light).toContain(`--cat-external:${CATEGORY_COLORS_LIGHT.external};`);
    expect(dark).toContain(`--cat-backend:${CATEGORY_COLORS_DARK.backend};`);
    expect(count(light, "--cat-")).toBe(Object.keys(CATEGORY_COLORS_LIGHT).length);
  });
});

describe("legendEntries", () => {
  const scene: Scene = {
    id: "legend-fixture",
    width: 400,
    height: 300,
    groups: [
      { kind: "group", path: "services", rect: { x: 10, y: 10, width: 380, height: 200 }, groupKind: "generic" },
    ],
    overlays: [],
    edges: [
      {
        kind: "edge",
        id: "e0",
        from: "gw",
        to: "services/order",
        points: [],
        style: { preset: "default", color: "#545B64", arrowhead: "end" },
        layer: "http",
      },
      {
        kind: "edge",
        id: "e1",
        from: "services/order",
        to: "db",
        points: [],
        style: { preset: "dotted", color: "#545B64", arrowhead: "end" },
        layer: "data",
      },
    ],
    nodes: [
      cardNode({ category: "gateway", path: "gw" }),
      cardNode({ category: "service", path: "services/order" }),
      cardNode({ category: "db", path: "db" }),
    ],
    markers: [],
    flows: [],
    icons: [],
    texts: [],
  };
  const entries = legendEntries(scene);
  const labels = entries.map((e) => e.label);

  test("emits DATA, not HTML — resolved literal colors, no markup/vars", () => {
    const json = JSON.stringify(entries);
    expect(json).not.toContain("<");
    expect(json).not.toContain("var(--");
    for (const e of entries) expect(e.swatch.color).toMatch(/^#|^rgba?\(/);
  });

  test("lists only used categories as dot entries with labelKo", () => {
    const cats = entries.filter((e) => e.group === "category");
    expect(cats.map((e) => e.label)).toEqual(["게이트웨이", "서비스", "데이터베이스"]);
    expect(cats[0]!.swatch).toEqual({ type: "dot", color: CATEGORY_COLORS_LIGHT.edge }); // gateway
    expect(cats[2]!.swatch.color).toBe(CATEGORY_COLORS_LIGHT.data); // db
    expect(labels).not.toContain("캐시"); // cache unused
    expect(labels).not.toContain("프론트엔드");
  });

  test("lists edge layers as line entries mirroring the first edge's style", () => {
    const lines = entries.filter((e) => e.group === "edge");
    expect(lines.map((e) => e.label)).toEqual(["http", "data"]);
    expect(lines[0]!.swatch).toEqual({ type: "line", color: "#545B64" }); // default: no dash
    expect(lines[1]!.swatch).toEqual({ type: "line", color: "#545B64", dash: "2 3" }); // dotted
  });

  test("lists group kinds as border entries with Korean labels", () => {
    const borders = entries.filter((e) => e.group === "groupKind");
    expect(borders).toEqual([
      { group: "groupKind", label: "그룹", swatch: { type: "border", color: "#7D8998", dash: "4 3" } },
    ]);
    expect(labels).not.toContain("VPC");
  });

  test("category entries come first (legacy legend order), empty scene -> []", () => {
    expect(entries.map((e) => e.group)).toEqual(["category", "category", "category", "edge", "edge", "groupKind"]);
    expect(legendEntries({ ...scene, nodes: [], edges: [], groups: [] })).toEqual([]);
  });
});

describe("msa-sample example", () => {
  const result = validate(msaSample);

  test("validates with zero errors (no icons anywhere)", () => {
    expect(formatIssues(result.issues.filter((i) => i.severity === "error"))).toBe("");
    expect(result.ok).toBe(true);
  });

  test("only category nodes, spanning two edge layers", () => {
    const nodes = [...result.index.byPath.values()].filter((e) => "type" in e && e.type === "node");
    expect(nodes.length).toBe(6);
    for (const n of nodes) {
      expect("category" in n && n.category).toBeTruthy();
      expect("icon" in n ? n.icon : undefined).toBeUndefined();
    }
    expect(new Set(msaSample.edges.map((e) => e.layer))).toEqual(new Set(["http", "data"]));
  });

  test("every category sizes cleanly", () => {
    for (const el of result.index.byPath.values()) {
      if ("type" in el && el.type === "node" && el.category) {
        const s = sizeCard({ ...el, category: el.category });
        expect(s.width).toBeGreaterThanOrEqual(CARD_WIDTH);
        expect(s.height).toBeGreaterThanOrEqual(52);
      }
    }
  });
});
