/**
 * Big picture + detail of the same model (selection-rubric §3.4).
 */
import { describe, expect, test } from "bun:test";
import { foldModel, zoomPlan, OVERVIEW_MAX } from "../src/model/fold.ts";
import { validate } from "../src/model/validate.ts";
import { buildScene } from "../src/pipeline.ts";
import type { DiagramModel, Element, NodeEl } from "../src/model/types.ts";
import serverless from "../examples/serverless-sample.ts";
import landingZone from "../examples/multi-account-lz.ts";
import azure from "../examples/azure-aks-sample.ts";
import state from "../examples/state-sample.ts";

const nodes = (els: Element[]): NodeEl[] => els.flatMap((e) => (e.type === "group" ? nodes(e.children) : [e]));
const fresh = (m: DiagramModel) => structuredClone(m);

describe("foldModel", () => {
  test("the big picture is valid, small, and every reduced node drills down", async () => {
    const r = foldModel(fresh(serverless), { href: "serverless-sample" });
    expect(r.overviewNodes).toBeLessThan(r.detailNodes / 2 + 1);
    expect(validate(r.model).ok).toBe(true);
    const reduced = nodes(r.model.children).filter((n) => r.ledger.some((l) => l.into === n.path));
    expect(reduced.length).toBeGreaterThan(0);
    for (const n of reduced) expect(n.href).toBe("serverless-sample");
    await buildScene(r.model); // lays out and routes
  });

  test("lines drawn to a same-named icon follow the group, accounts and OUs keep container icons", () => {
    const r = foldModel(fresh(landingZone), { href: "multi-account-lz" });
    expect(r.overviewNodes).toBeLessThanOrEqual(OVERVIEW_MAX);
    const byLabel = new Map(nodes(r.model.children).map((n) => [n.label, n]));
    const workloads = byLabel.get("Workloads OU")!;
    const mgmt = byLabel.get("Management Account")!;
    expect(String(workloads.icon)).toBe("organizations.organizational-unit");
    expect(String(mgmt.icon)).toBe("organizations.management-account");
    // governance lines from the management account reach the OU (via the "Workloads OU" icon)
    expect(r.model.edges.some((e) => e.from === mgmt.path && e.to === workloads.path)).toBe(true);
    expect(r.orphans.length * 4).toBeLessThanOrEqual(r.overviewNodes);
    // columns follow the lines: management first, infrastructure after workloads
    expect(mgmt.hints?.layer).toBe(0);
    expect(byLabel.get("Infrastructure OU")!.hints!.layer!).toBeGreaterThan(workloads.hints!.layer!);
  });

  test("the input model is left untouched", () => {
    const m = fresh(azure);
    const before = JSON.stringify(m.children);
    foldModel(m);
    expect(JSON.stringify(m.children)).toBe(before);
  });
});

describe("zoomPlan", () => {
  test("decisions follow the measured counts", () => {
    expect(zoomPlan(fresh(state)).decision).toBe("single"); // 9 nodes: already a big picture
    expect(zoomPlan(fresh(azure)).decision).toBe("overview-optional"); // 11 nodes
    expect(zoomPlan(fresh(serverless)).decision).toBe("overview-required"); // 22 nodes
    expect(zoomPlan(fresh(landingZone)).decision).toBe("overview-required"); // 28 nodes
  });
});
