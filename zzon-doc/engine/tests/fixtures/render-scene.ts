/**
 * Synthetic, hand-placed COMPLETE Scene for renderer tests.
 *
 * Exercises every Scene feature the renderers must handle: two nested groups
 * (vpc inside region) with corner badges + a grid track label, one overlay
 * spanning two rects, four nodes (one with badges + stack + meta, one with a
 * Korean label for subsetting coverage, one with a multi-line label), three
 * routed edges across two layers (one dotted, one dashed, one with a label
 * and a "both" arrowhead), and two step markers.
 *
 * Geometry is coherent but hand-authored, NOT produced by layout — the
 * renderers must consume it as-is and never recompute positions.
 */
import type { Scene } from "../../src/layout/scene.ts";

export interface RenderSceneOptions {
  /** replace the Korean node label with ASCII (for the subsetting test) */
  omitKorean?: boolean;
}

export function makeRenderScene(opts: RenderSceneOptions = {}): Scene {
  const koreanLabel = opts.omitKorean ? "Private Subnet" : "프라이빗 서브넷";
  return {
    id: "render-fixture",
    title: "Render Fixture",
    width: 800,
    height: 560,

    // z-ordered outer -> inner
    groups: [
      {
        kind: "group",
        path: "region",
        rect: { x: 40, y: 40, width: 720, height: 480 },
        groupKind: "region",
        badgeIcon: "group.region",
        badgeRect: { x: 41, y: 41, width: 24, height: 24 },
        label: {
          text: "ap-northeast-2",
          x: 73,
          y: 58,
          fontSize: 13,
          weight: "semibold",
          align: "start",
        },
      },
      {
        kind: "group",
        path: "region/vpc",
        rect: { x: 80, y: 96, width: 640, height: 390 },
        groupKind: "vpc",
        badgeIcon: "group.vpc",
        badgeRect: { x: 81, y: 97, width: 24, height: 24 },
        label: {
          text: "Main VPC",
          x: 113,
          y: 114,
          fontSize: 13,
          weight: "semibold",
          align: "start",
        },
        trackLabels: [
          {
            text: "Availability Zone A",
            x: 400,
            y: 132,
            fontSize: 11,
            weight: "regular",
            align: "middle",
            color: "#00A4A6",
          },
        ],
      },
    ],

    overlays: [
      {
        kind: "overlay",
        path: "overlay/karpenter-pool",
        rects: [
          { x: 110, y: 300, width: 200, height: 130 },
          { x: 330, y: 300, width: 200, height: 130 },
        ],
        stroke: "#7AA116",
        strokeDasharray: "6 3",
        fill: "rgba(122,161,22,0.05)",
        label: {
          text: "Karpenter NodePool",
          x: 118,
          y: 318,
          fontSize: 11,
          weight: "semibold",
          align: "start",
          color: "#7AA116",
        },
      },
    ],

    edges: [
      {
        kind: "edge",
        id: "e1",
        from: "region/vpc/eks",
        to: "region/vpc/nat",
        points: [
          { x: 240, y: 188 },
          { x: 370, y: 188 },
          { x: 370, y: 172 },
          { x: 500, y: 172 },
        ],
        label: { text: "HTTPS", x: 435, y: 166, fontSize: 11, weight: "regular", align: "middle" },
        style: { preset: "default", color: "#545B64", arrowhead: "end" },
        layer: "network",
      },
      {
        kind: "edge",
        id: "e2",
        from: "region/vpc/nat",
        to: "region/vpc/karpenter",
        points: [
          { x: 560, y: 236 },
          { x: 560, y: 280 },
          { x: 180, y: 280 },
          { x: 180, y: 320 },
        ],
        style: { preset: "dotted", color: "#8C4FFF", arrowhead: "end" },
        layer: "network",
      },
      {
        kind: "edge",
        id: "e3",
        from: "region/vpc/eks",
        to: "region/vpc/karpenter",
        points: [
          { x: 168, y: 236 },
          { x: 168, y: 320 },
        ],
        style: { preset: "dashed", color: "#ED7100", arrowhead: "both" },
        layer: "deploy",
      },
    ],

    nodes: [
      {
        kind: "node",
        path: "region/vpc/eks",
        rect: { x: 120, y: 140, width: 120, height: 96 },
        icon: "eks",
        iconRect: { x: 156, y: 148, width: 48, height: 48 },
        label: { text: "EKS Cluster", x: 180, y: 216, fontSize: 12, weight: "regular", align: "middle" },
        badges: [{ icon: "cw", rect: { x: 172, y: 222, width: 16, height: 16 } }],
        stack: 3,
        meta: { cluster: "prod-eks", version: "1.31", note: 'a<b & "quoted"' },
        role: "resource",
      },
      {
        kind: "node",
        path: "region/vpc/korean",
        rect: { x: 300, y: 140, width: 140, height: 96 },
        icon: "ec2.instances",
        iconRect: { x: 346, y: 148, width: 48, height: 48 },
        label: { text: koreanLabel, x: 370, y: 216, fontSize: 12, weight: "regular", align: "middle" },
      },
      {
        kind: "node",
        path: "region/vpc/nat",
        rect: { x: 500, y: 140, width: 120, height: 96 },
        icon: "vpc.nat-gateway",
        iconRect: { x: 536, y: 148, width: 48, height: 48 },
        label: {
          text: "NAT Gateway",
          x: 560,
          y: 210,
          fontSize: 12,
          weight: "regular",
          align: "middle",
          lines: ["NAT", "Gateway"],
        },
      },
      {
        kind: "node",
        path: "region/vpc/karpenter",
        rect: { x: 120, y: 320, width: 120, height: 90 },
        icon: "x.karpenter",
        iconRect: { x: 156, y: 326, width: 48, height: 48 },
        label: { text: "Karpenter", x: 180, y: 394, fontSize: 12, weight: "regular", align: "middle" },
      },
    ],

    markers: [
      { kind: "marker", n: 1, at: { x: 250, y: 120 }, note: "Ingress path" },
      { kind: "marker", n: 2, at: { x: 470, y: 264 } },
    ],

    // every distinct icon key used (nodes + node badges + group badges)
    flows: [],
    icons: ["group.region", "group.vpc", "eks", "ec2.instances", "vpc.nat-gateway", "x.karpenter", "cw"],

    // every distinct text string (for font subsetting)
    texts: [
      "ap-northeast-2",
      "Main VPC",
      "Availability Zone A",
      "Karpenter NodePool",
      "EKS Cluster",
      koreanLabel,
      "NAT Gateway",
      "NAT",
      "Gateway",
      "Karpenter",
      "HTTPS",
      "1",
      "2",
    ],
  };
}

export const renderScene: Scene = makeRenderScene();
