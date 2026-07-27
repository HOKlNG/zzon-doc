/**
 * ERD feature tests: table sizing/anchoring, both render variants,
 * crow's-foot marker defs, validateErd rules, and the shipped example.
 */
import { describe, expect, test } from "bun:test";
import {
  CARDINALITY_MARKER_ID,
  TABLE_MIN_WIDTH,
  cardinalityMarkerDefs,
  edgeCardinalityAttrs,
  makeSceneTable,
  renderTableStatic,
  renderTableSvg,
  sizeTable,
  tableAnchorY,
} from "../src/render/table.ts";
import { validateErd } from "../src/model/erd.ts";
import { validate } from "../src/model/validate.ts";
import { diagram } from "../src/dsl/index.ts";
import { measureWidth } from "../src/text/metrics.ts";
import type { Cardinality, TableSpec } from "../src/model/types.ts";
import type { SceneEdge, SceneNode } from "../src/layout/scene.ts";
import erdSample from "../examples/erd-sample.ts";

const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

const spec: TableSpec = {
  columns: [
    { name: "id", type: "uuid", pk: true },
    {
      name: "a_really_long_column_name_for_width",
      type: "character varying(255)",
      fk: { table: "users", column: "id" },
      unique: true,
      nullable: true,
    },
    { name: "created_at", type: "timestamptz" },
  ],
};

const sized = sizeTable({ label: "measurements", table: spec });

const tableNode = (): SceneNode => ({
  kind: "node",
  path: "db/measurements",
  rect: { x: 40, y: 100, width: sized.width, height: sized.height },
  role: "table",
  table: makeSceneTable(sized, 100),
  label: { text: "measure <2024>", x: 0, y: 0, fontSize: 12, weight: "semibold", align: "start" },
});

describe("sizeTable", () => {
  test("deterministic", () => {
    expect(sizeTable({ label: "measurements", table: spec })).toEqual(sized);
  });

  test("min width 240 for tiny tables", () => {
    const tiny = sizeTable({ label: "t", table: { columns: [{ name: "id", pk: true }] } });
    expect(tiny.width).toBe(TABLE_MIN_WIDTH);
  });

  test("grows to fit the longest name+type row plus its chips", () => {
    const long = spec.columns[1]!;
    const base =
      12 + 20 + measureWidth(long.name, 11) + 16 + measureWidth(long.type!, 10) + 12;
    expect(sized.width).toBeGreaterThanOrEqual(Math.ceil(base + 3 * 16)); // FK/UQ/N chips
  });

  test("columnYs are strictly monotonic row centers below the header", () => {
    expect(sized.columnYs).toHaveLength(3);
    sized.columnYs.forEach((y, i) => {
      expect(y).toBe(sized.headerHeight + i * sized.rowHeight + sized.rowHeight / 2);
      if (i > 0) expect(y).toBeGreaterThan(sized.columnYs[i - 1]!);
    });
    expect(sized.height).toBeGreaterThan(sized.headerHeight + 3 * sized.rowHeight);
  });
});

describe("tableAnchorY", () => {
  test("maps a column name to its absolute row center", () => {
    const n = tableNode();
    expect(tableAnchorY(n, "id")).toBe(100 + sized.columnYs[0]!);
    expect(tableAnchorY(n, "created_at")).toBe(100 + sized.columnYs[2]!);
  });

  test("undefined for unknown columns and non-table nodes", () => {
    expect(tableAnchorY(tableNode(), "nope")).toBeUndefined();
    const bare: SceneNode = { kind: "node", path: "x", rect: { x: 0, y: 0, width: 1, height: 1 } };
    expect(tableAnchorY(bare, "id")).toBeUndefined();
  });
});

describe("renderTableSvg (interactive)", () => {
  const svg = renderTableSvg(tableNode(), { interactive: true });

  test("node g + per-row data-col hooks", () => {
    expect(svg).toContain('class="node node-table"');
    expect(svg).toContain('data-path="db/measurements"');
    expect(count(svg, "data-col=")).toBe(3);
    expect(svg).toContain('data-col="a_really_long_column_name_for_width"');
  });

  test("header strip uses the --table-head variable, zebra on odd rows", () => {
    expect(svg).toContain("var(--table-head, #f4f4f5)");
    expect(count(svg, "var(--table-zebra")).toBe(1); // row index 1 only
  });

  test("tag chips + escaped user strings", () => {
    for (const tag of ["FK", "UQ", "N"]) expect(svg).toContain(`>${tag}</text>`);
    expect(svg).toContain("measure &lt;2024&gt;");
    expect(svg).not.toContain("measure <2024>");
  });

  test("deterministic", () => {
    expect(renderTableSvg(tableNode(), { interactive: true })).toBe(svg);
  });
});

describe("renderTableStatic", () => {
  const stat = renderTableStatic(tableNode(), "light");

  test("no text elements, classes, data attrs, or CSS vars", () => {
    expect(stat).not.toContain("<text");
    expect(stat).not.toContain("class=");
    expect(stat).not.toContain("data-");
    expect(stat).not.toContain("var(--");
  });

  test("theme literals baked", () => {
    expect(stat).toContain('fill="#FFFFFF"');
    expect(renderTableStatic(tableNode(), "dark")).toContain('fill="#161E2D"');
  });

  test("deterministic", () => {
    expect(renderTableStatic(tableNode(), "light")).toBe(stat);
  });
});

describe("cardinality markers", () => {
  const defs = cardinalityMarkerDefs("#545B64");

  test("five marker defs with the stable ids", () => {
    expect(count(defs, "<marker ")).toBe(5);
    for (const id of Object.values(CARDINALITY_MARKER_ID)) expect(defs).toContain(`id="${id}"`);
    expect(count(defs, 'orient="auto-start-reverse"')).toBe(5);
  });

  test("ring fill overridable for the static variant (no CSS vars)", () => {
    expect(defs).toContain("var(--ia-canvas)");
    expect(cardinalityMarkerDefs("#545B64", "#FFFFFF")).not.toContain("var(--");
  });

  test("edgeCardinalityAttrs maps both endpoints", () => {
    const edge = (src?: Cardinality, tgt?: Cardinality): SceneEdge => ({
      kind: "edge",
      id: "e0",
      from: "a",
      to: "b",
      points: [],
      style: { preset: "default", color: "#545B64", arrowhead: "none" },
      sourceCardinality: src,
      targetCardinality: tgt,
    });
    expect(edgeCardinalityAttrs(edge("0..N", "1"))).toEqual({
      markerStart: "url(#card-0n)",
      markerEnd: "url(#card-1)",
    });
    expect(edgeCardinalityAttrs(edge(undefined, "1..N"))).toEqual({ markerEnd: "url(#card-1n)" });
    expect(edgeCardinalityAttrs(edge())).toEqual({});
  });
});

describe("validateErd", () => {
  test("catches missing tables and bad column refs", () => {
    const bad = diagram("bad-erd", { docKind: "erd" }, (d) => {
      const a = d.node("a", { label: "a", table: { columns: [{ name: "id", pk: true }] } });
      const b = d.node("b", { label: "b" }); // not a table
      d.edge(a, b, { sourceColumn: "nope", targetColumn: "id" });
    });
    expect(validate(bad).ok).toBe(true); // base validation has no erd rules
    const issues = validateErd(bad);
    const errors = issues.filter((i) => i.severity === "error").map((i) => i.message);
    expect(errors.some((m) => m.includes("erd node b has no table"))).toBe(true);
    expect(errors.some((m) => m.includes('sourceColumn "nope" does not exist'))).toBe(true);
    expect(errors.some((m) => m.includes('targetColumn "id" — node b has no table'))).toBe(true);
  });

  test("warns on fk metadata mismatches and undrawn fk columns", () => {
    const warny = diagram("warn-erd", { docKind: "erd" }, (d) => {
      const u = d.node("users", { label: "users", table: { columns: [{ name: "id", pk: true }] } });
      const l = d.node("links", {
        label: "links",
        table: {
          columns: [
            { name: "id", pk: true },
            { name: "user_id", fk: { table: "tags", column: "id" } }, // wrong target
            { name: "orphan_id", fk: { table: "users", column: "id" } }, // no edge
          ],
        },
      });
      d.edge(l, u, { sourceColumn: "user_id", targetColumn: "id" });
    });
    validate(warny);
    const issues = validateErd(warny);
    expect(issues.some((i) => i.severity === "error")).toBe(false);
    const warnings = issues.filter((i) => i.severity === "warning").map((i) => i.message);
    expect(warnings.some((m) => m.includes("declares fk -> tags.id but the edge connects users.id"))).toBe(true);
    expect(warnings.some((m) => m.includes("links.orphan_id declares fk -> users.id but no edge draws it"))).toBe(true);
  });
});

describe("erd-sample example", () => {
  test("validates clean through validate() AND validateErd()", () => {
    const result = validate(erdSample);
    expect(result.ok).toBe(true);
    expect(validateErd(erdSample)).toEqual([]);
  });

  test("uses all five cardinalities across its edges", () => {
    const used = new Set<string>();
    for (const e of erdSample.edges) {
      if (e.sourceCardinality) used.add(e.sourceCardinality);
      if (e.targetCardinality) used.add(e.targetCardinality);
    }
    expect([...used].sort()).toEqual(["0..1", "0..N", "1", "1..N", "N"]);
  });
});
