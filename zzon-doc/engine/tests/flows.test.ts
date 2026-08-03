/**
 * Narrative-flow tests (canvas half): resolveFlows badge placement /
 * validation / text registration on a synthetic routed scene, plus the SVG
 * badge layers and the canvas-side FLOW_BADGE_CSS. The flow chrome
 * (buttons/strips/step focusing) moved to the viewer frame — the canvas only
 * reflects highlight("flow"|"step") commands.
 */
import { describe, expect, test } from "bun:test";
import type { Scene, SceneEdge, SceneNode } from "../src/layout/scene.ts";
import type { FlowDef } from "../src/model/types.ts";
import { FLOW_BADGE_CSS, renderFlowBadgesSvg, resolveFlows } from "../src/render/flows.ts";

// ------------------------------------------------------------ fixture

const node = (path: string, x: number): SceneNode => ({
  kind: "node",
  path,
  rect: { x, y: 0, width: 60, height: 60 },
});

const edge = (id: string, from: string, to: string, points: { x: number; y: number }[]): SceneEdge => ({
  kind: "edge",
  id,
  from,
  to,
  points,
  style: { preset: "default", color: "#545B64", arrowhead: "end" },
});

/** 5 nodes, 4 hand-routed edges (e2 bends so length-parametrization matters) */
function makeScene(): Scene {
  return {
    id: "flows-fixture",
    width: 600,
    height: 300,
    groups: [],
    overlays: [],
    edges: [
      edge("e1", "a", "b", [{ x: 0, y: 0 }, { x: 100, y: 0 }]),
      edge("e2", "b", "c", [{ x: 0, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 150 }]),
      edge("e3", "c", "d", [{ x: 200, y: 0 }, { x: 200, y: 100 }]),
      edge("e4", "d", "e", [{ x: 300, y: 0 }, { x: 400, y: 0 }]),
    ],
    nodes: [node("a", 0), node("b", 100), node("c", 200), node("d", 300), node("e", 400)],
    markers: [],
    flows: [],
    icons: [],
    texts: [],
  };
}

// checkout reuses e1 (steps 1 and 3 -> one "1·3" badge); refund shares e2
const flowDefs: FlowDef[] = [
  {
    id: "checkout",
    title: "Checkout",
    description: "Happy path",
    steps: [
      { edge: "e1", text: "Add to cart" },
      { edge: "e2", text: "Pay" },
      { edge: "e1", text: "Confirm" },
    ],
  },
  {
    id: "refund",
    title: "Refund",
    description: 'Refund & <admin> "path"',
    steps: [
      { edge: "e2", text: "Request refund" },
      { edge: "e3", text: "Approve" },
    ],
  },
];

function resolvedScene(): Scene {
  const scene = makeScene();
  resolveFlows(scene, flowDefs);
  return scene;
}

// ------------------------------------------------------------ resolveFlows

describe("resolveFlows", () => {
  const scene = resolvedScene();

  test("fills scene.flows with 1-based steps in order", () => {
    expect(scene.flows.length).toBe(2);
    expect(scene.flows[0]!.id).toBe("checkout");
    expect(scene.flows[0]!.steps.map((s) => s.n)).toEqual([1, 2, 3]);
    expect(scene.flows[1]!.steps.map((s) => s.n)).toEqual([1, 2]);
    expect(scene.flows[1]!.description).toBe('Refund & <admin> "path"');
  });

  test("first badge on an edge sits at t=0.5 of the polyline", () => {
    // e1 is a straight 100px segment: t=0.5 -> (50, 0)
    expect(scene.flows[0]!.steps[0]!.badge).toEqual({ x: 50, y: 0 });
    // e2 bends: 50px across then 100px down; t=0.5 -> 75px along -> (50, 75)
    expect(scene.flows[0]!.steps[1]!.badge).toEqual({ x: 50, y: 75 });
  });

  test("same edge reused within one flow -> offset badge, no stacking", () => {
    const [s1, , s3] = scene.flows[0]!.steps;
    expect(s3!.edgeId).toBe(s1!.edgeId);
    expect(s3!.badge).not.toEqual(s1!.badge);
    expect(s3!.badge).toEqual({ x: 62, y: 0 }); // t = 0.5 + 0.12
  });

  test("edge shared across flows -> offset badge, no stacking", () => {
    const checkoutPay = scene.flows[0]!.steps[1]!;
    const refundReq = scene.flows[1]!.steps[0]!;
    expect(refundReq.edgeId).toBe(checkoutPay.edgeId);
    expect(refundReq.badge).not.toEqual(checkoutPay.badge);
    expect(refundReq.badge).toEqual({ x: 50, y: 93 }); // e2 at t = 0.62
  });

  test("badge coords are rounded to 2 decimals", () => {
    for (const f of scene.flows) {
      for (const s of f.steps) {
        expect(s.badge.x).toBe(Math.round(s.badge.x * 100) / 100);
        expect(s.badge.y).toBe(Math.round(s.badge.y * 100) / 100);
      }
    }
  });

  test("unknown edge id throws naming flow and step", () => {
    const bad: FlowDef[] = [
      { id: "broken", title: "Broken", steps: [{ edge: "e1", text: "ok" }, { edge: "e9", text: "nope" }] },
    ];
    expect(() => resolveFlows(makeScene(), bad)).toThrow('flow "broken" step 2: unknown edge "e9"');
  });

  test("unrouted edge (no points) throws", () => {
    const scene2 = makeScene();
    scene2.edges[0]!.points = [];
    expect(() =>
      resolveFlows(scene2, [{ id: "f", title: "F", steps: [{ edge: "e1", text: "x" }] }]),
    ).toThrow('flow "f" step 1');
  });

  test("titles, descriptions, step texts, and badge labels in scene.texts, deduped", () => {
    // descriptions render in the FRAME's flow buttons — their glyphs must
    // survive subsetting, so resolveFlows registers them too
    for (const t of [
      "Checkout",
      "Refund",
      "Happy path",
      'Refund & <admin> "path"',
      "Add to cart",
      "Pay",
      "Confirm",
      "1·3",
      "2",
      "1",
    ]) {
      expect(scene.texts).toContain(t);
    }
    expect(new Set(scene.texts).size).toBe(scene.texts.length);
  });
});

// ------------------------------------------------------------ render hooks

describe("renderFlowBadgesSvg", () => {
  const svg = renderFlowBadgesSvg(resolvedScene());

  test("per-flow layer with class + data-flow hooks", () => {
    expect(svg).toContain('class="flow-badges flow-checkout" data-flow="checkout"');
    expect(svg).toContain('class="flow-badges flow-refund" data-flow="refund"');
  });

  test("single-step badge: r=10 circle, flow color, step number text", () => {
    expect(svg).toContain('r="10"');
    expect(svg).toContain('fill="var(--flow, #4f46e5)"');
    expect(svg).toContain(">2</text>");
    expect(svg).toContain(">1</text>"); // refund step 1
  });

  test('same-flow shared edge renders ONE joined "1·3" badge with measured radius', () => {
    expect(svg).toContain(">1·3</text>");
    expect(svg).toContain('data-steps="1 3"');
    // merged badge: checkout has 2 badges (e1, e2), refund 2 -> 4 total
    expect(svg.split('class="flow-badge"').length - 1).toBe(4);
    const joined = svg.match(/<g class="flow-badge" data-edge-id="e1"[^>]*>[^<]*<circle[^>]*r="([\d.]+)"/);
    expect(Number(joined?.[1] ?? 0)).toBeGreaterThan(10); // "1·3" needs more than r=10
  });

  test("badges carry data-edge-id + stagger index for the pop animation", () => {
    expect(svg).toContain('data-edge-id="e2"');
    expect(svg).toContain("--step-index:0");
  });

  test("empty flows -> empty string", () => {
    expect(renderFlowBadgesSvg(makeScene())).toBe("");
  });
});

describe("FLOW_BADGE_CSS", () => {
  test("hides badge layers by default and defines dim/fade/highlight", () => {
    expect(FLOW_BADGE_CSS).toContain(".flow-badges{display:none}");
    expect(FLOW_BADGE_CSS).toContain(".flow-badges.active{display:initial}");
    expect(FLOW_BADGE_CSS).toContain(".flow-dim{opacity:.25}");
    expect(FLOW_BADGE_CSS).toContain(".flow-fade{opacity:.5}");
    expect(FLOW_BADGE_CSS).toContain(".edge.flow-hl path");
    expect(FLOW_BADGE_CSS).toContain("prefers-reduced-motion");
  });

  test("holds NO chrome selectors (buttons/strips are frame-owned now)", () => {
    for (const chrome of ["#ia-flows", ".flow-btn", ".flow-strip"]) {
      expect(FLOW_BADGE_CSS).not.toContain(chrome);
    }
  });
});


test("스텝 포커스 CSS — 포커스 밖 플로우 엣지는 액센트를 잃는다 (전부 강조 버그 회귀 방지)", () => {
  const { FLOW_BADGE_CSS } = require("../src/render/flows.ts");
  expect(FLOW_BADGE_CSS).toContain(".step-focus .edge.flow-hl.flow-fade path");
  expect(FLOW_BADGE_CSS).toContain(":not(.on){opacity:.35}");
});
