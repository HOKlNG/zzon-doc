/**
 * Notation semantics — is the diagram a CORRECT state machine / flowchart /
 * class model, independent of how it looks? The layout gate measures
 * readability; this measures meaning. Structural mistakes a reader would act
 * on wrongly are errors; smells are warnings.
 *
 *   state:     an initial pseudo-state exists; every state is reachable from
 *              it; finals have no outgoing transitions; non-final states are
 *              not dead ends; choice branches carry guards.
 *   flowchart: a start terminal exists; every node is reachable from a start;
 *              decisions have ≥2 LABELLED exits; processes lead somewhere.
 *   class:     no inheritance cycle.
 */
import type { DiagramModel, Element, NodeEl } from "./types.ts";

export interface SemanticIssue {
  severity: "error" | "warning";
  message: string;
}

function collectNodes(model: DiagramModel): NodeEl[] {
  const out: NodeEl[] = [];
  const walk = (el: Element) => {
    if (el.type === "node") out.push(el);
    else {
      el.children.forEach(walk);
      if (el.grid) Object.values(el.grid.cells).forEach((c) => c.children.forEach(walk));
    }
  };
  model.children.forEach(walk);
  for (const b of model.bands) b.children.forEach(walk);
  return out;
}

const name = (n: NodeEl) => n.label ?? n.id;

function reachable(starts: string[], edges: { from: string; to: string }[]): Set<string> {
  const seen = new Set(starts);
  const stack = [...starts];
  while (stack.length) {
    const v = stack.pop()!;
    for (const e of edges) {
      if (e.from === v && !seen.has(e.to)) {
        seen.add(e.to);
        stack.push(e.to);
      }
    }
  }
  return seen;
}

export function checkSemantics(model: DiagramModel): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const err = (message: string) => issues.push({ severity: "error", message });
  const warn = (message: string) => issues.push({ severity: "warning", message });
  const nodes = collectNodes(model);
  const edges = model.edges;
  const out = (p: string) => edges.filter((e) => e.from === p);
  const inc = (p: string) => edges.filter((e) => e.to === p);

  if (model.docKind === "state") {
    const initials = nodes.filter((n) => n.shape === "initial");
    const states = nodes.filter((n) => n.shape === "state" || n.shape === "choice" || n.shape === "final");
    if (states.length && initials.length === 0) err("시작 상태(d.initial)가 없다 — 어디서 시작하는지 읽을 수 없다");
    const seen = reachable(initials.map((n) => n.path), edges);
    for (const s of states) if (initials.length && !seen.has(s.path)) err(`'${name(s)}'에 시작 상태에서 도달할 수 없다 (빠진 전이?)`);
    for (const n of nodes.filter((n) => n.shape === "final")) {
      if (out(n.path).length) err(`종료 상태 '${name(n)}'에서 나가는 전이가 있다`);
    }
    for (const n of nodes.filter((n) => n.shape === "state")) {
      if (!out(n.path).some((e) => e.to !== n.path)) warn(`상태 '${name(n)}'에서 빠져나가는 전이가 없다 (막다른 상태 — 의도라면 종료 상태로 잇는다)`);
    }
    for (const n of nodes.filter((n) => n.shape === "choice")) {
      const o = out(n.path);
      if (o.length < 2) warn(`선택 '${name(n)}'의 분기가 ${o.length}개다 (2개 이상이어야 선택이다)`);
      if (o.some((e) => !e.label)) warn(`선택 '${name(n)}'의 분기에 가드 라벨이 없다`);
    }
  }

  if (model.docKind === "flowchart") {
    const terminals = nodes.filter((n) => n.shape === "terminal");
    const starts = terminals.filter((n) => inc(n.path).length === 0);
    if (!starts.length) err("시작(진입 엣지가 없는 d.terminal)이 없다");
    const seen = reachable(starts.map((n) => n.path), edges);
    for (const n of nodes) if (starts.length && !seen.has(n.path)) err(`'${name(n)}'에 시작에서 도달할 수 없다`);
    for (const n of nodes.filter((n) => n.shape === "decision")) {
      const o = out(n.path);
      if (o.length < 2) err(`판단 '${name(n)}'의 출구가 ${o.length}개다 (분기는 2개 이상)`);
      if (o.some((e) => !e.label)) err(`판단 '${name(n)}'의 출구에 조건 라벨이 없다 (예/아니오 등)`);
    }
    for (const n of nodes.filter((n) => n.shape === "process")) {
      if (!out(n.path).length) warn(`처리 '${name(n)}'에서 이어지는 단계가 없다 (끝이면 종료 터미널로 잇는다)`);
    }
  }

  if (model.docKind === "class") {
    const parent = new Map<string, string[]>();
    for (const e of edges) {
      if (e.layer !== "inherit" && e.layer !== "implement") continue;
      parent.set(e.from, [...(parent.get(e.from) ?? []), e.to]);
    }
    for (const n of nodes) {
      // inheritance cycle: n reaches itself through parent links
      const seen = new Set<string>();
      const stack = [...(parent.get(n.path) ?? [])];
      while (stack.length) {
        const v = stack.pop()!;
        if (v === n.path) {
          err(`상속 순환: '${name(n)}'이 자기 자신을 상속한다`);
          break;
        }
        if (seen.has(v)) continue;
        seen.add(v);
        stack.push(...(parent.get(v) ?? []));
      }
    }
  }

  // shapes outside their notation are allowed, but a state diagram made of cards is a smell
  if ((model.docKind === "state" || model.docKind === "flowchart") && !nodes.some((n) => n.shape)) {
    warn(`docKind "${model.docKind}"인데 표기 모양(d.state/d.process 등)이 하나도 없다`);
  }
  return issues;
}
