/**
 * elkjs under Bun: the default entry crashes and the bundled fake-worker path
 * hangs (oven-sh/bun#15737), so we load elk-api.js with a REAL Web Worker —
 * verified working. All ELK usage must go through this module.
 */
import ELKApi from "elkjs/lib/elk-api.js";
import type { ELK, ElkNode } from "elkjs/lib/elk-api";

const WORKER_PATH = new URL("../../node_modules/elkjs/lib/elk-worker.min.js", import.meta.url)
  .pathname;

let instance: ELK | null = null;

export function getElk(): ELK {
  if (!instance) {
    instance = new ELKApi({
      workerFactory: () => new Worker(WORKER_PATH),
    }) as unknown as ELK;
  }
  return instance;
}

/** Fails fast (5s) if a Bun upgrade breaks the worker path again. */
export async function elkSmokeTest(): Promise<void> {
  const result = await Promise.race([
    getElk().layout({
      id: "smoke",
      layoutOptions: { "elk.algorithm": "layered" },
      children: [
        { id: "a", width: 10, height: 10 },
        { id: "b", width: 10, height: 10 },
      ],
      edges: [{ id: "e", sources: ["a"], targets: ["b"] }],
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("elkjs smoke test timed out — Bun/elkjs worker loading broke (see src/layout/elk-loader.ts)")), 5000),
    ),
  ]);
  if (result.children?.[0]?.x === undefined) {
    throw new Error("elkjs smoke test returned no coordinates");
  }
}

/**
 * Deep-copies the graph before layout (elkjs mutates input and injects
 * nondeterministic $H keys) and extracts only canonical geometry.
 */
export async function elkLayout(graph: ElkNode): Promise<ElkNode> {
  return getElk().layout(structuredClone(graph));
}

export type { ElkNode };
