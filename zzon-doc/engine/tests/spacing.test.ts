/**
 * The canvas grows only when lines crowd: measureScene counts unrelated lines
 * running side by side, and buildScene re-lays out with wider spacing.
 */
import { describe, expect, test } from "bun:test";
import { CROWD_GAP, measureScene } from "../src/quality/metrics.ts";
import { buildScene } from "../src/pipeline.ts";
import type { Scene } from "../src/layout/scene.ts";
import serverless from "../examples/serverless-sample.ts";
import msa from "../examples/msa-sample.ts";

function twoLines(gap: number): Scene {
  const edge = (id: string, from: string, to: string, y: number) => ({
    kind: "edge",
    id,
    from,
    to,
    points: [{ x: 0, y }, { x: 200, y }],
    style: { preset: "default", color: "#52525b", arrowhead: "end" },
  });
  return {
    id: "t",
    width: 300,
    height: 100,
    nodes: [],
    groups: [],
    overlays: [],
    edges: [edge("a", "p", "q", 50), edge("b", "r", "s", 50 + gap)],
    markers: [],
    texts: [],
  } as unknown as Scene;
}

describe("line crowding", () => {
  test("unrelated lines closer than the gap count, lines a nudge apart do not", () => {
    expect(measureScene(twoLines(CROWD_GAP - 3)).crowded).toEqual(["a·b"]);
    expect(measureScene(twoLines(14)).crowded).toEqual([]);
  });

  test("a crowded diagram is laid out again with more room until the lines separate", async () => {
    const scene = await buildScene(structuredClone(serverless));
    expect(measureScene(scene).crowded).toEqual([]);
  });

  test("a clean diagram keeps its compact size", async () => {
    const a = await buildScene(structuredClone(msa));
    expect(measureScene(a).crowded).toEqual([]);
    expect(a.width).toBeLessThan(900); // base spacing, not the widened pass
  });
});
