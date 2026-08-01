/**
 * Unit tests for the layout-quality invariant checkers.
 * Each rule gets one passing synthetic scene and one violating scene built
 * from small hand-written Scene literals (default canvas 800x500 → aspect 1.6).
 */
import { describe, expect, test } from "bun:test";
import type { Scene, SceneEdge, SceneGroup, SceneLabel, SceneNode, SceneOverlay } from "../src/layout/scene.ts";
import { rectCoveredArea, segmentIntersectsRect, type Point, type Rect } from "../src/model/geometry.ts";
import { measure, measureWidth } from "../src/text/metrics.ts";
import { checkScene, labelBBox, type Violation } from "./invariants.ts";

// ------------------------------------------------------------- fixtures

const P = (x: number, y: number): Point => ({ x, y });
const R = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

function mkScene(partial: Partial<Scene> = {}): Scene {
  return {
    id: "t",
    width: 800,
    height: 500,
    groups: [],
    overlays: [],
    edges: [],
    nodes: [],
    markers: [],
    flows: [],
    icons: [],
    texts: [],
    ...partial,
  };
}

function mkNode(path: string, x: number, y: number, width = 60, height = 60, extra: Partial<SceneNode> = {}): SceneNode {
  return {
    kind: "node",
    path,
    rect: R(x, y, width, height),
    icon: "ec2",
    iconRect: R(x + (width - 40) / 2, y + 4, 40, 40),
    ...extra,
  };
}

function mkGroup(path: string, x: number, y: number, width: number, height: number, extra: Partial<SceneGroup> = {}): SceneGroup {
  return { kind: "group", path, rect: R(x, y, width, height), groupKind: "vpc", ...extra };
}

function mkLabel(text: string, x: number, y: number, extra: Partial<SceneLabel> = {}): SceneLabel {
  return { text, x, y, fontSize: 12, weight: "regular", align: "start", ...extra };
}

function mkEdge(id: string, from: string, to: string, points: Point[], extra: Partial<SceneEdge> = {}): SceneEdge {
  return {
    kind: "edge",
    id,
    from,
    to,
    points,
    style: { preset: "default", color: "#5A6B86", arrowhead: "end" },
    ...extra,
  };
}

function mkOverlay(path: string, rects: Rect[], extra: Partial<SceneOverlay> = {}): SceneOverlay {
  return { kind: "overlay", path, rects, ...extra };
}

const ofRule = (vs: Violation[], rule: string) => vs.filter((v) => v.rule === rule);

// ------------------------------------------------------------- rule 1: node-node

describe("node-node", () => {
  test("disjoint (even touching) nodes pass", () => {
    const s = mkScene({ nodes: [mkNode("a", 10, 10), mkNode("b", 70, 10)] }); // edges touch at x=70
    expect(checkScene(s)).toEqual([]);
  });

  test("overlapping node rects are caught", () => {
    const s = mkScene({ nodes: [mkNode("a", 10, 10), mkNode("b", 40, 40)] });
    const vs = checkScene(s);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.rule).toBe("node-node");
    expect(vs[0]!.paths).toEqual(["a", "b"]);
  });
});

// ------------------------------------------------------------- rule 2: node-group

describe("node-group", () => {
  test("nodes inside all ancestors pass; rail-items may straddle the border", () => {
    const s = mkScene({
      groups: [mkGroup("g", 0, 0, 400, 300), mkGroup("g/h", 20, 40, 200, 150, { groupKind: "private-subnet" })],
      nodes: [
        mkNode("g/h/n", 40, 60),
        // rail item docked ON g's right border (x 380..420 vs g right 400) — exempt
        mkNode("g/railW/ecr", 380, 100, 40, 40, { role: "rail-item" }),
      ],
    });
    expect(checkScene(s)).toEqual([]);
  });

  test("node escaping its ancestors is caught once per ancestor", () => {
    const s = mkScene({
      groups: [mkGroup("g", 0, 0, 400, 300), mkGroup("g/h", 20, 40, 200, 150)],
      nodes: [mkNode("g/h/n", 390, 60)],
    });
    const vs = checkScene(s);
    expect(vs.map((v) => v.rule)).toEqual(["node-group", "node-group"]);
    expect(vs.map((v) => v.paths)).toEqual([
      ["g/h/n", "g"],
      ["g/h/n", "g/h"],
    ]);
  });
});

// ------------------------------------------------------------- rule 3: edge-through-node

describe("edge-through-node", () => {
  const a = mkNode("a", 0, 0);
  const b = mkNode("b", 240, 0);

  test("routes that avoid or only graze foreign nodes pass", () => {
    const s = mkScene({
      nodes: [a, b, mkNode("c", 110, 140)],
      edges: [
        mkEdge("e1", "a", "b", [P(60, 30), P(240, 30)]), // straight, clear of c
        mkEdge("e2", "a", "b", [P(60, 30), P(60, 140), P(240, 140)]), // runs along c's top border
      ],
    });
    expect(checkScene(s)).toEqual([]);
  });

  test("segment crossing a non-endpoint node interior is caught", () => {
    const s = mkScene({
      nodes: [a, b, mkNode("c", 110, 0)],
      edges: [mkEdge("e1", "a", "b", [P(60, 30), P(240, 30)])],
    });
    const vs = checkScene(s);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.rule).toBe("edge-through-node");
    expect(vs[0]!.paths).toEqual(["e1", "c"]);
  });
});

// ------------------------------------------------------------- rule 4: label-overlap

describe("label-overlap", () => {
  test("clear labels pass; own-node and edge-endpoint overlaps are associated", () => {
    const s = mkScene({
      nodes: [
        // label inside its OWN rect — allowed
        mkNode("self", 0, 0, 60, 60, { label: mkLabel("self", 30, 55, { align: "middle" }) }),
        mkNode("b2", 700, 300, 60, 60, { label: mkLabel("beta", 500, 300) }),
      ],
      groups: [mkGroup("grp", 200, 100, 150, 80, { trackLabels: [mkLabel("AZ A", 275, 95, { align: "middle" })] })],
      // edge label sits over its source node rect — associated, allowed
      edges: [
        mkEdge("e-lab", "self", "b2", [P(60, 30), P(700, 30), P(700, 300)], { label: mkLabel("conn", 40, 30) }),
      ],
    });
    expect(checkScene(s)).toEqual([]);
  });

  test("two label bboxes overlapping is caught", () => {
    const s = mkScene({
      nodes: [
        mkNode("a", 0, 0, 60, 60, { label: mkLabel("Hello", 300, 300) }),
        mkNode("b", 100, 0, 60, 60, { label: mkLabel("World", 302, 300) }),
      ],
    });
    const vs = checkScene(s);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.rule).toBe("label-overlap");
    expect(vs[0]!.paths).toEqual(["a", "b"]);
  });

  test("label overlapping a non-associated node rect is caught", () => {
    const s = mkScene({
      nodes: [
        mkNode("a", 0, 200, 60, 60, { label: mkLabel("Intrude", 110, 30) }),
        mkNode("b", 100, 0, 60, 60),
      ],
    });
    const vs = checkScene(s);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.rule).toBe("label-overlap");
    expect(vs[0]!.paths).toEqual(["a", "b"]);
  });

  test("multi-line bbox extends below the first line", () => {
    const c = mkNode("c", 370, 110);
    const twoLines = mkScene({
      groups: [mkGroup("g2", 0, 400, 100, 50, { label: mkLabel("aaa bbb", 400, 100, { align: "middle", lines: ["aaa", "bbb"] }) })],
      nodes: [c],
    });
    const vs = checkScene(twoLines);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.rule).toBe("label-overlap");
    expect(vs[0]!.paths).toEqual(["g2", "c"]);
    // same anchor, single line: bbox ends above node c → clean
    const oneLine = mkScene({
      groups: [mkGroup("g2", 0, 400, 100, 50, { label: mkLabel("aaa", 400, 100, { align: "middle" }) })],
      nodes: [c],
    });
    expect(checkScene(oneLine)).toEqual([]);
  });
});

// ------------------------------------------------------------- rule 5: all-edges-routed

describe("all-edges-routed", () => {
  test("edges with >= 2 finite points pass", () => {
    const s = mkScene({ edges: [mkEdge("e1", "a", "b", [P(10, 10), P(100, 10)])] });
    expect(checkScene(s)).toEqual([]);
  });

  test("empty, single-point, and non-finite routes are caught", () => {
    const s = mkScene({
      edges: [
        mkEdge("e0", "a", "b", []),
        mkEdge("e1", "a", "b", [P(10, 10)]),
        mkEdge("e2", "a", "b", [P(10, 10), P(NaN, 20)]),
      ],
    });
    const vs = checkScene(s);
    expect(vs.map((v) => v.rule)).toEqual(["all-edges-routed", "all-edges-routed", "all-edges-routed"]);
    expect(vs.map((v) => v.paths)).toEqual([["e0"], ["e1"], ["e2"]]);
  });
});

// ------------------------------------------------------------- rule 6: overlay-containment

describe("overlay-containment", () => {
  // two contiguous cell-run rects: [0..150] + [150..300], y 0..100
  const runRects = [R(0, 0, 150, 100), R(150, 0, 150, 100)];

  test("members inside the rect UNION pass (even straddling two rects)", () => {
    const s = mkScene({
      overlays: [mkOverlay("ov", runRects)],
      nodes: [
        mkNode("m1", 10, 10, 50, 50),
        mkNode("m2", 120, 10, 60, 50), // spans both rects; neither contains it alone
        mkNode("z", 400, 10, 60, 60),
      ],
    });
    expect(checkScene(s, { overlayMembers: { ov: ["m1", "m2"] } })).toEqual([]);
  });

  test("escaped member, missing member, and >30% non-member intrusion are caught", () => {
    const s = mkScene({
      overlays: [mkOverlay("ov", runRects)],
      nodes: [
        mkNode("m3", 400, 200), // member entirely outside the union
        mkNode("q", 80, 20), // non-member 100% covered → intrusion
        mkNode("p", 120, 85), // non-member 25% covered → tolerated
      ],
    });
    const vs = checkScene(s, { overlayMembers: { ov: ["m3", "ghost"] } });
    expect(vs.map((v) => v.rule)).toEqual([
      "overlay-containment",
      "overlay-containment",
      "overlay-containment",
    ]);
    expect(vs.map((v) => v.paths)).toEqual([
      ["ov", "ghost"],
      ["ov", "m3"],
      ["ov", "q"],
    ]);
    // without a member map the rule cannot run → scene reports clean
    expect(checkScene(s)).toEqual([]);
  });

  test("member map for an overlay missing from the scene is caught", () => {
    const s = mkScene({ nodes: [mkNode("m1", 10, 10)] });
    const vs = checkScene(s, { overlayMembers: { gone: ["m1"] } });
    expect(vs).toHaveLength(1);
    expect(vs[0]!.rule).toBe("overlay-containment");
    expect(vs[0]!.paths).toEqual(["gone"]);
  });
});

// ------------------------------------------------------------- rule 7: aspect

describe("aspect", () => {
  test("800x500 (1.6) passes the default 1.6 ±40%", () => {
    expect(checkScene(mkScene())).toEqual([]);
  });

  test("800x200 (4.0) violates the default window", () => {
    const vs = checkScene(mkScene({ width: 800, height: 200 }));
    expect(vs).toHaveLength(1);
    expect(vs[0]!.rule).toBe("aspect");
    expect(vs[0]!.paths).toEqual([]);
  });

  test("custom target and tolerance are honored", () => {
    const opts = { aspectRatio: 1, aspectTolerance: 0.1 };
    expect(ofRule(checkScene(mkScene(), opts), "aspect")).toHaveLength(1); // 1.6 > 1.1
    expect(checkScene(mkScene({ width: 500, height: 500 }), opts)).toEqual([]);
  });
});

// ------------------------------------------------------------- rule 8: canvas-fit

describe("canvas-fit", () => {
  test("everything inside [0,0,w,h] passes", () => {
    const s = mkScene({
      groups: [mkGroup("g", 100, 100, 300, 200)],
      nodes: [mkNode("g/n", 120, 120)],
      overlays: [mkOverlay("ov", [R(110, 110, 100, 100)])],
      edges: [mkEdge("e1", "g/n", "g", [P(180, 150), P(390, 150)])],
      markers: [{ kind: "marker", n: 1, at: P(50, 50) }],
    });
    // overlay covers g/n but no member map is provided → containment not checked
    expect(checkScene(s)).toEqual([]);
  });

  test("each element type sticking out of the canvas is caught", () => {
    const s = mkScene({
      nodes: [mkNode("n", -10, 10)],
      groups: [mkGroup("g", 700, 400, 200, 80)],
      overlays: [mkOverlay("ov", [R(750, 10, 100, 40)])],
      edges: [mkEdge("e1", "n", "zz", [P(10, 10), P(10, 900)])],
      markers: [{ kind: "marker", n: 1, at: P(900, 20) }],
    });
    const vs = checkScene(s);
    expect(vs.map((v) => v.rule)).toEqual(["canvas-fit", "canvas-fit", "canvas-fit", "canvas-fit", "canvas-fit"]);
    expect(vs.map((v) => v.paths)).toEqual([["e1"], ["g"], ["marker:1"], ["n"], ["ov"]]);
  });
});

// ------------------------------------------------------------- determinism

describe("determinism", () => {
  test("repeated runs return identical, rule-sorted output", () => {
    const s = mkScene({
      width: 800,
      height: 200, // aspect violation
      nodes: [mkNode("a", 10, 10), mkNode("b", 40, 40)], // node-node violation
    });
    const v1 = checkScene(s);
    const v2 = checkScene(s);
    expect(v1).toEqual(v2);
    expect(v1.map((v) => v.rule)).toEqual(["aspect", "node-node"]);
  });
});

// ------------------------------------------------------------- geometry helpers

describe("segmentIntersectsRect", () => {
  const r = R(10, 10, 20, 20);
  test("crossing the interior", () => {
    expect(segmentIntersectsRect(P(0, 20), P(40, 20), r)).toBe(true);
  });
  test("running along a border does not count", () => {
    expect(segmentIntersectsRect(P(0, 10), P(40, 10), r)).toBe(false);
  });
  test("grazing a corner does not count", () => {
    expect(segmentIntersectsRect(P(0, 20), P(20, 0), r)).toBe(false);
  });
  test("endpoint inside counts", () => {
    expect(segmentIntersectsRect(P(20, 20), P(100, 20), r)).toBe(true);
  });
  test("fully inside counts", () => {
    expect(segmentIntersectsRect(P(15, 15), P(25, 25), r)).toBe(true);
  });
  test("fully outside does not count", () => {
    expect(segmentIntersectsRect(P(0, 0), P(5, 40), r)).toBe(false);
  });
});

describe("rectCoveredArea", () => {
  const clip = R(0, 0, 10, 10);
  test("full, overlapping, partial, and empty coverage", () => {
    expect(rectCoveredArea(clip, [R(0, 0, 10, 10)])).toBe(100);
    expect(rectCoveredArea(clip, [R(0, 0, 6, 10), R(4, 0, 6, 10)])).toBe(100); // overlap not double-counted
    expect(rectCoveredArea(clip, [R(0, 0, 5, 5)])).toBe(25);
    expect(rectCoveredArea(clip, [R(0, 0, 10, 5), R(0, 0, 5, 10)])).toBe(75); // L-shape
    expect(rectCoveredArea(clip, [])).toBe(0);
    expect(rectCoveredArea(clip, [R(20, 20, 5, 5)])).toBe(0);
  });
});

describe("labelBBox", () => {
  test("single line matches font metrics; align shifts x", () => {
    const m = measure("Hello", 12, "regular");
    const w = measureWidth("Hello", 12, "regular");
    const start = labelBBox(mkLabel("Hello", 100, 100));
    expect(start.x).toBeCloseTo(100);
    expect(start.y).toBeCloseTo(100 - m.ascent);
    expect(start.width).toBeCloseTo(w);
    expect(start.height).toBeCloseTo(m.ascent + m.descent);
    expect(labelBBox(mkLabel("Hello", 100, 100, { align: "middle" })).x).toBeCloseTo(100 - w / 2);
    expect(labelBBox(mkLabel("Hello", 100, 100, { align: "end" })).x).toBeCloseTo(100 - w);
  });

  test("multi-line uses widest line and stacks at lineHeight", () => {
    const m = measure("Hello", 12, "regular");
    const bbox = labelBBox(mkLabel("Hello Hi", 100, 100, { lines: ["Hello", "Hi"] }));
    expect(bbox.width).toBeCloseTo(Math.max(measureWidth("Hello", 12), measureWidth("Hi", 12)));
    expect(bbox.height).toBeCloseTo(m.ascent + m.descent + m.lineHeight);
  });
});
