/**
 * Global routing invariants (DESIGN.md §5.3) over the synthetic fixture.
 */
import { describe, test, expect } from "bun:test";
import { canonicalScene, type Scene, type SceneEdge } from "../src/layout/scene.ts";
import type { Point, Rect } from "../src/model/geometry.ts";
import { routeEdges, EDGE_DASHARRAY } from "../src/route/router.ts";
import { BUNDLE_MARGIN } from "../src/route/bundle.ts";
import { routeFixtureScene, routeFixtureEdges } from "./fixtures/route-scene.ts";

const TOL = 1;

/** Does an axis-aligned segment enter the rect interior deflated by `tol`? */
function segmentEntersRect(a: Point, b: Point, rect: Rect, tol: number): boolean {
  const x0 = rect.x + tol;
  const x1 = rect.x + rect.width - tol;
  const y0 = rect.y + tol;
  const y1 = rect.y + rect.height - tol;
  if (x0 >= x1 || y0 >= y1) return false;
  return (
    Math.min(a.x, b.x) < x1 &&
    Math.max(a.x, b.x) > x0 &&
    Math.min(a.y, b.y) < y1 &&
    Math.max(a.y, b.y) > y0
  );
}

const scene: Scene = routeFixtureScene();
const edges = routeFixtureEdges();
await routeEdges(scene, edges);
const byId = new Map<string, SceneEdge>(scene.edges.map((e) => [e.id, e]));

describe("routeEdges", () => {
  test("every input edge is routed with >= 2 points", () => {
    expect(scene.edges.length).toBe(edges.length);
    for (const edge of edges) {
      const routed = byId.get(edge.id);
      expect(routed).toBeDefined();
      expect(routed!.from).toBe(edge.from);
      expect(routed!.to).toBe(edge.to);
      expect(routed!.points.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("every segment is axis-parallel (orthogonal routing)", () => {
    for (const routed of scene.edges) {
      for (let i = 1; i < routed.points.length; i++) {
        const a = routed.points[i - 1]!;
        const b = routed.points[i]!;
        const axisParallel = Math.abs(a.x - b.x) < 0.02 || Math.abs(a.y - b.y) < 0.02;
        expect(
          axisParallel,
          `${routed.id} segment ${i} (${a.x},${a.y})→(${b.x},${b.y}) is diagonal`,
        ).toBe(true);
      }
    }
  });

  test("no route passes through the interior of a non-endpoint node", () => {
    for (const routed of scene.edges) {
      const obstacles = scene.nodes.filter((n) => n.path !== routed.from && n.path !== routed.to);
      for (let i = 1; i < routed.points.length; i++) {
        const a = routed.points[i - 1]!;
        const b = routed.points[i]!;
        for (const node of obstacles) {
          expect(
            segmentEntersRect(a, b, node.rect, TOL),
            `${routed.id} segment (${a.x},${a.y})→(${b.x},${b.y}) enters ${node.path}`,
          ).toBe(false);
        }
      }
    }
  });

  test("fan-in bundles: branches share a junction one margin off the target", () => {
    const fan = scene.edges.filter((e) => e.id.startsWith("e-fan-"));
    expect(fan.length).toBe(5);
    const bundleIds = new Set(fan.map((e) => e.bundle));
    expect(bundleIds.size).toBe(1);
    expect([...bundleIds][0]).toBeDefined();

    // last-but-one point = the junction, shared across branches (>= 3 required)
    const penults = fan.map((e) => e.points[e.points.length - 2]!);
    const ref = penults[0]!;
    const sharing = penults.filter((p) => Math.abs(p.x - ref.x) <= 1 && Math.abs(p.y - ref.y) <= 1);
    expect(sharing.length).toBeGreaterThanOrEqual(3);
    expect(sharing.length).toBe(5);

    // the trunk stub is exactly BUNDLE_MARGIN long and ends on the hub border
    for (const e of fan) {
      const junction = e.points[e.points.length - 2]!;
      const attach = e.points[e.points.length - 1]!;
      const stub = Math.abs(attach.x - junction.x) + Math.abs(attach.y - junction.y);
      expect(stub).toBeCloseTo(BUNDLE_MARGIN, 1);
      expect(attach.x).toBeCloseTo(420, 1); // hub W face
      expect(attach.y).toBeCloseTo(330, 1);
    }
  });

  test("deterministic: routing a fresh fixture twice gives identical scenes", async () => {
    const sceneA = routeFixtureScene();
    await routeEdges(sceneA, routeFixtureEdges());
    const sceneB = routeFixtureScene();
    await routeEdges(sceneB, routeFixtureEdges());
    expect(canonicalScene(sceneA)).toBe(canonicalScene(sceneB));
    // also match the very first in-process run (catches warm-wasm drift)
    expect(canonicalScene(sceneA)).toBe(canonicalScene(scene));
  });

  test("side hints: leaves svc-a on S, enters svc-b on W", () => {
    const hinted = byId.get("e-hint")!;
    const pts = hinted.points;
    const first = pts[0]!;
    const second = pts[1]!;
    // S face midpoint of svc-a (600,120,60,60), heading down
    expect(first.x).toBeCloseTo(630, 0);
    expect(first.y).toBeCloseTo(180, 0);
    expect(Math.abs(second.x - first.x)).toBeLessThan(0.02);
    expect(second.y).toBeGreaterThan(first.y);
    // W face midpoint of svc-b (720,190,60,60), entering rightward
    const last = pts[pts.length - 1]!;
    const prev = pts[pts.length - 2]!;
    expect(last.x).toBeCloseTo(720, 0);
    expect(last.y).toBeCloseTo(220, 0);
    expect(Math.abs(prev.y - last.y)).toBeLessThan(0.02);
    expect(prev.x).toBeLessThan(last.x);
  });

  test("group endpoint attaches to the group border", () => {
    const grouped = byId.get("e-group")!;
    const last = grouped.points[grouped.points.length - 1]!;
    // cluster rect is (560,80,260,200); hub sits W of it → attach on the W border
    expect(last.x).toBeCloseTo(560, 1);
    expect(last.y).toBeGreaterThanOrEqual(80);
    expect(last.y).toBeLessThanOrEqual(280);
  });

  test("edge style resolution", () => {
    const normal = byId.get("e-normal")!;
    expect(normal.style).toEqual({ preset: "default", color: "#545B64", arrowhead: "end" });
    const dotted = byId.get("e-dotted")!;
    expect(dotted.style).toEqual({ preset: "dotted", color: "#7AA116", arrowhead: "end" });
    expect(dotted.layer).toBe("network");
    expect(EDGE_DASHARRAY.dotted).toBe("2 3");
    expect(EDGE_DASHARRAY.dashed).toBe("6 4");
    expect(EDGE_DASHARRAY.default).toBeUndefined();
  });

  test("labels: identical bundle labels collapse to one; texts registered", () => {
    const fanLabels = scene.edges.filter((e) => e.id.startsWith("e-fan-") && e.label);
    expect(fanLabels.length).toBe(1);
    expect(fanLabels[0]!.label!.text).toBe("gRPC");
    expect(fanLabels[0]!.label!.fontSize).toBe(11);

    const normal = byId.get("e-normal")!;
    expect(normal.label?.text).toBe("HTTPS");
    expect(normal.label?.fontSize).toBe(11);

    expect(scene.texts).toContain("HTTPS");
    expect(scene.texts).toContain("gRPC");
  });

  test("unknown endpoint path throws naming the edge id", async () => {
    const fresh = routeFixtureScene();
    await expect(
      routeEdges(fresh, [{ id: "e-bad", from: "no-such-node", to: "hub" }]),
    ).rejects.toThrow(/e-bad/);
  });
});
