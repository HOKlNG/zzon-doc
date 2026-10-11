/**
 * Notation views (v0.9): state machine / flowchart / screen flow / domain
 * model / dependency shapes, UML relation markers, self-loops, semantic
 * checks, author layout hints, and the tier quality gate. Every example of
 * the new views must build, pass the collision invariants AND the gate's hard
 * checks — they are the model answers the skill points authors to.
 */
import { describe, expect, test } from "bun:test";
import { diagram } from "../src/dsl/index.ts";
import { buildScene } from "../src/pipeline.ts";
import { renderStaticSvg } from "../src/render/static-svg.ts";
import { renderInteractiveSvg } from "../src/render/svg.ts";
import { sizeShape } from "../src/render/shapes.ts";
import { checkSemantics } from "../src/model/semantics.ts";
import { gateScene, measureScene } from "../src/quality/metrics.ts";
import { placeLayered } from "../src/layout/elk-adapter.ts";
import { convertDiagramSpec } from "../src/compat/diagramspec.ts";
import { checkScene } from "./invariants.ts";
import type { DiagramModel } from "../src/model/types.ts";
import stateSample from "../examples/state-sample.ts";
import flowchartSample from "../examples/flowchart-sample.ts";
import screenFlowSample from "../examples/screen-flow-sample.ts";
import domainModelSample from "../examples/domain-model-sample.ts";

const notationExamples: [string, DiagramModel][] = [
  ["state-sample", stateSample],
  ["flowchart-sample", flowchartSample],
  ["screen-flow-sample", screenFlowSample],
  ["domain-model-sample", domainModelSample],
];

describe("notation examples — model answers", () => {
  for (const [name, model] of notationExamples) {
    test(`${name}: invariants 0, gate has no hard failure, semantics clean`, async () => {
      const scene = await buildScene(structuredClone(model));
      const inv = checkScene(scene, { aspectRatio: model.aspectRatio }).filter((v) => v.rule !== "aspect");
      expect(inv.map((v) => `${v.rule}: ${v.detail}`)).toEqual([]);
      const gate = gateScene(scene, model);
      expect(gate.results.filter((r) => r.severity === "fail").map((r) => `${r.label}: ${r.hint ?? r.value}`)).toEqual([]);
      expect(checkSemantics(model).filter((i) => i.severity === "error")).toEqual([]);
    });
  }
});

describe("shapes", () => {
  test("pseudo-states are small fixed glyphs, boxes grow with text", () => {
    expect(sizeShape({ shape: "initial" })).toEqual({ width: 20, height: 20 });
    expect(sizeShape({ shape: "final" })).toEqual({ width: 24, height: 24 });
    const short = sizeShape({ shape: "state", label: "대기" });
    const long = sizeShape({ shape: "state", label: "결제 승인 대기 중 (외부 PG 응답 대기)" });
    expect(long.width).toBeGreaterThan(short.width);
    const cls = sizeShape({ shape: "class", label: "Order", classSpec: { attributes: ["a", "b", "c"], methods: ["m()"] } });
    const bare = sizeShape({ shape: "class", label: "Order" });
    expect(cls.height).toBeGreaterThan(bare.height);
  });

  test("flowchart steps render as architecture cards; static outlines text (no <text>)", async () => {
    const model = diagram("shapes", { docKind: "flowchart" }, (d) => {
      const s = d.terminal("s", { label: "시작" });
      const p = d.process("p", { label: "처리", sublabel: "sub" });
      const q = d.decision("q", { label: "조건?" });
      const e = d.terminal("e", { label: "끝" });
      d.edge(s, p, {});
      d.edge(p, q, {});
      d.edge(q, e, { label: "예" });
      d.edge(q, p, { label: "아니오" });
    });
    const scene = await buildScene(model);
    const live = renderInteractiveSvg(scene);
    // start, process, decision and end all use the shared architecture card
    expect(live.split('class="node node-card').length - 1).toBe(4);
    expect(scene.nodes.map((n) => n.category)).toEqual(["n-start", "n-process", "n-decision", "n-end"]);
    // decision keeps its shape so branch exits still leave from distinct faces
    expect(scene.nodes.find((n) => n.path === "q")?.shape).toBe("decision");
    const flat = renderStaticSvg(scene, "light");
    expect(flat).not.toContain("<text");
  });

  test("UML markers are emitted for class relations", async () => {
    const scene = await buildScene(structuredClone(domainModelSample));
    const svg = renderInteractiveSvg(scene);
    for (const m of ["mk-triangle-", "mk-diamond-", "mk-open-arrow-"]) expect(svg).toContain(m);
  });

  test("self-loop is drawn by hand around the top-right corner, label above it", async () => {
    const scene = await buildScene(structuredClone(stateSample));
    const loop = scene.edges.find((e) => e.from === e.to)!;
    expect(loop.points.length).toBe(5);
    const top = Math.min(...loop.points.map((p) => p.y));
    expect(loop.label!.y).toBeLessThan(top);
  });
});

describe("semantics", () => {
  test("state: unreachable state and dead end are reported", () => {
    const m = diagram("bad-state", { docKind: "state" }, (d) => {
      const i = d.initial();
      const a = d.state("a");
      d.state("orphan");
      d.transition(i, a, { event: "go" });
    });
    const msgs = checkSemantics(m).map((x) => `${x.severity}:${x.message}`);
    expect(msgs.some((s) => s.startsWith("error") && s.includes("orphan"))).toBe(true);
    expect(msgs.some((s) => s.startsWith("warning") && s.includes("'a'"))).toBe(true);
  });

  test("flowchart: a decision exit without a condition label is an error", () => {
    const m = diagram("bad-flow", { docKind: "flowchart" }, (d) => {
      const s = d.terminal("s");
      const q = d.decision("q", { label: "조건?" });
      const a = d.terminal("a");
      const b = d.terminal("b");
      d.edge(s, q, {});
      d.edge(q, a, { label: "예" });
      d.edge(q, b, {});
    });
    expect(checkSemantics(m).some((x) => x.severity === "error" && x.message.includes("라벨"))).toBe(true);
  });

  test("class: inheritance cycle is an error", () => {
    const m = diagram("bad-class", { docKind: "class" }, (d) => {
      const a = d.classNode("a");
      const b = d.classNode("b");
      d.inherits(a, b);
      d.inherits(b, a);
    });
    expect(checkSemantics(m).some((x) => x.severity === "error" && x.message.includes("순환"))).toBe(true);
  });
});

describe("layout hints", () => {
  test("same declared layer stays one column even without connecting edges", async () => {
    const r = await placeLayered(
      [
        { id: "a", width: 70, height: 80, order: 0, layer: 0, slot: 0 },
        { id: "b", width: 70, height: 80, order: 1, layer: 0, slot: 1 },
        { id: "c", width: 70, height: 80, order: 2, layer: 0, slot: 2 },
      ],
      [{ from: "a", to: "b" }],
      "RIGHT",
      1.6,
    );
    const xs = new Set(r.children.map((c) => Math.round(c.rect.x)));
    expect(xs.size).toBe(1);
    const ys = r.children.sort((p, q) => p.rect.y - q.rect.y).map((c) => c.id);
    expect(ys).toEqual(["a", "b", "c"]);
  });

  test("legacy lane/order/direction/nodeDescriptions survive the compat converter", () => {
    const { model } = convertDiagramSpec({
      title: "t",
      kind: "infra",
      layout: { direction: "RIGHT", nodeDescriptions: true },
      nodes: [
        { id: "u", label: "u", category: "user", lane: 0 },
        { id: "s", label: "s", category: "service", lane: 1, order: 2 },
      ],
      edges: [{ id: "e", source: "u", target: "s" }],
    });
    expect(model.direction).toBe("RIGHT");
    expect(model.nodeDescriptions).toBe(true);
    const s = model.children.find((c) => c.id === "s")!;
    expect(s.hints).toEqual({ layer: 1, order: 2 });
  });

  test("card descriptions stay off the canvas unless nodeDescriptions", async () => {
    const make = (on: boolean) =>
      diagram("d", { nodeDescriptions: on }, (d) => {
        d.node("a", { category: "service", label: "A", description: "긴 설명 문장이 여기에 들어간다" });
      });
    const off = await buildScene(make(false));
    const on = await buildScene(make(true));
    expect(off.nodes[0]!.descriptionOnCanvas).toBeUndefined();
    expect(on.nodes[0]!.descriptionOnCanvas).toBe(true);
    expect(on.nodes[0]!.rect.height).toBeGreaterThan(off.nodes[0]!.rect.height);
  });
});

describe("quality gate", () => {
  test("budget overrun fails the declared tier", async () => {
    const model = diagram("big", { tier: "overview" }, (d) => {
      for (let i = 0; i < 11; i++) d.node(`n${i}`, { category: "service", label: `n${i}` });
    });
    const gate = gateScene(await buildScene(model), model);
    expect(gate.failed).toBe(true);
    expect(gate.results.find((r) => r.id === "nodes")!.severity).toBe("fail");
  });

  test("colour groups count hues, not categories (service/worker/backend = 1)", async () => {
    const model = diagram("hues", {}, (d) => {
      d.node("a", { category: "service", label: "a" });
      d.node("b", { category: "worker", label: "b" });
      d.node("c", { category: "backend", label: "c" });
      d.node("e", { category: "db", label: "e" });
    });
    expect(measureScene(await buildScene(model)).legendColors).toBe(2);
  });
});

describe("notation cards", () => {
  test("state tone picks the card accent and icon category", async () => {
    const model = diagram("tones", { docKind: "state" }, (d) => {
      const i = d.initial();
      const w = d.state("w", { label: "대기", tone: "wait", sublabel: "entry / 재고 가예약" });
      const ok = d.state("ok", { label: "완료", tone: "done" });
      const bad = d.state("bad", { label: "취소", tone: "fail" });
      const f = d.final();
      d.transition(i, w, { event: "생성" });
      d.transition(w, ok, { event: "승인" });
      d.transition(w, bad, { event: "취소" });
      d.transition(ok, f, {});
      d.transition(bad, f, {});
    });
    const scene = await buildScene(model);
    const cat = (p: string) => scene.nodes.find((n) => n.path === p)?.category;
    expect([cat("w"), cat("ok"), cat("bad")]).toEqual(["n-state-wait", "n-state-done", "n-state-fail"]);
    // UML activity prefixes read as Korean on the card chip
    expect(scene.nodes.find((n) => n.path === "w")?.tech).toBe("들어갈 때 재고 가예약");
    // initial / final stay UML markers
    expect(scene.nodes.find((n) => n.path === "initial")?.category).toBeUndefined();
  });
});
