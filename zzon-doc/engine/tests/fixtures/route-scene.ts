/**
 * Synthetic routing fixture: a hand-placed Scene (as the layout stage would
 * produce it) plus matching model edges exercising every §5.3 routing
 * feature — normal edge, group endpoint, 5-edge fan-in (bundling trigger),
 * side hints, and a dotted styled edge.
 *
 * Layout sketch (900×600):
 *   src-1..src-5   left column (x 80..140), 100px pitch
 *   hub            fan-in target at (420,300)
 *   cluster        vpc group (560..820 × 80..280) containing svc-a, svc-b
 */
import type { Scene, SceneNode, SceneGroup } from "../../src/layout/scene.ts";
import type { Edge } from "../../src/model/types.ts";
import type { Rect } from "../../src/model/geometry.ts";
import type { IconRef } from "../../src/icons/aliases.ts";

const NODE_SIZE = 60;

function node(path: string, x: number, y: number, icon: IconRef): SceneNode {
  const rect: Rect = { x, y, width: NODE_SIZE, height: NODE_SIZE };
  return {
    kind: "node",
    path,
    rect,
    icon,
    iconRect: { x: x + 6, y: y + 6, width: 48, height: 48 },
    role: "resource",
  };
}

/** Fresh scene per call — routing mutates it in place. */
export function routeFixtureScene(): Scene {
  const cluster: SceneGroup = {
    kind: "group",
    path: "cluster",
    rect: { x: 560, y: 80, width: 260, height: 200 },
    groupKind: "vpc",
  };
  const nodes: SceneNode[] = [
    node("src-1", 80, 80, "ec2"),
    node("src-2", 80, 180, "ec2"),
    node("src-3", 80, 280, "ec2"),
    node("src-4", 80, 380, "ec2"),
    node("src-5", 80, 480, "ec2"),
    node("hub", 420, 300, "nlb"),
    node("cluster/svc-a", 600, 120, "eks"),
    node("cluster/svc-b", 720, 190, "ecr"),
  ];
  return {
    id: "route-fixture",
    width: 900,
    height: 600,
    groups: [cluster],
    overlays: [],
    edges: [],
    nodes,
    markers: [],
    flows: [],
    icons: ["ec2", "nlb", "eks", "ecr"],
    texts: [],
  };
}

/** Fresh edge list per call (routing never mutates edges, but stay safe). */
export function routeFixtureEdges(): Edge[] {
  const fanIn: Edge[] = [1, 2, 3, 4, 5].map((i) => ({
    id: `e-fan-${i}`,
    from: `src-${i}`,
    to: "hub",
    label: "gRPC", // identical on all 5 → collapses to one trunk label
  }));
  return [
    // plain default-styled edge
    { id: "e-normal", from: "src-1", to: "cluster/svc-a", label: "HTTPS" },
    // group endpoint: attaches to the cluster border
    { id: "e-group", from: "hub", to: "cluster" },
    // 5-edge fan-in on hub → bundling trigger (BUNDLE_MIN_FAN = 4)
    ...fanIn,
    // side hints: leave svc-a south, enter svc-b west
    {
      id: "e-hint",
      from: "cluster/svc-a",
      to: "cluster/svc-b",
      hints: { sourceSide: "S", targetSide: "W" },
    },
    // dotted styled edge with a color override and a layer
    {
      id: "e-dotted",
      from: "src-4",
      to: "cluster/svc-b",
      style: { preset: "dotted", color: "#7AA116" },
      layer: "network",
    },
  ];
}
