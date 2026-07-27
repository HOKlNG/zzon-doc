/**
 * End-to-end pipeline: model -> validate -> layout -> route -> render.
 */
import type { DiagramModel } from "./model/types.ts";
import { validate, formatIssues } from "./model/validate.ts";
import { validateErd } from "./model/erd.ts";
import { resolveFlows } from "./render/flows.ts";
import { layoutDiagram } from "./layout/compose.ts";
import { routeEdges } from "./route/router.ts";
import { renderHtml } from "./render/html.ts";
import { renderStaticSvg } from "./render/static-svg.ts";
import { canonicalScene, type Scene } from "./layout/scene.ts";

export class DiagramError extends Error {}

export async function buildScene(model: DiagramModel): Promise<Scene> {
  const v = validate(model);
  const erdIssues = validateErd(model);
  const issues = [...v.issues, ...erdIssues];
  if (issues.length) console.error(formatIssues(issues));
  if (!v.ok || erdIssues.some((i) => i.severity === "error")) {
    throw new DiagramError(`diagram "${model.id}" failed validation`);
  }
  const scene = await layoutDiagram(model);
  await routeEdges(scene, model.edges);
  resolveFlows(scene, model.flows);
  // edge labels arrive during routing — extend the subsetting text set
  const texts = new Set(scene.texts);
  for (const e of scene.edges) if (e.label) texts.add(e.label.text);
  scene.texts = [...texts].sort();
  return scene;
}

export interface RenderedDiagram {
  scene: Scene;
  html: string;
  staticSvg: string;
  sceneJson: string;
}

export async function renderAll(model: DiagramModel): Promise<RenderedDiagram> {
  const scene = await buildScene(model);
  return {
    scene,
    html: await renderHtml(scene),
    staticSvg: renderStaticSvg(scene, "light"),
    sceneJson: canonicalScene(scene),
  };
}

/**
 * Load a diagram module (default export = DiagramModel).
 *
 * Sources may live OUTSIDE the engine (e.g. <project>/zzon-doc/terra/x.ts) but
 * are written as if in examples/ (relative "../src/..." imports). External
 * files are copied into examples/.tmp/ so those imports resolve, then removed.
 */
export async function loadDiagram(file: string): Promise<DiagramModel> {
  const { resolve, join, basename } = await import("node:path");
  const { copyFileSync, rmSync, statSync } = await import("node:fs");
  const engineRoot = resolve(join(import.meta.dir, ".."));
  const abs = resolve(file);
  let importPath = abs;
  let tmp: string | null = null;
  if (!abs.startsWith(engineRoot + "/")) {
    // examples/ 바로 아래여야 소스의 "../src/..." 상대 import가 풀린다
    // (mtime in the name busts the ESM cache when the source changes)
    tmp = join(engineRoot, "examples", `.tmp-${statSync(abs).mtimeMs}-${basename(abs)}`);
    copyFileSync(abs, tmp);
    importPath = tmp;
  }
  try {
    return await loadDiagramModule(importPath, file);
  } finally {
    if (tmp) rmSync(tmp, { force: true });
  }
}

async function loadDiagramModule(importPath: string, orig: string): Promise<DiagramModel> {
  const mod = await import(importPath);
  const model = mod.default;
  if (!model || !Array.isArray(model.children)) {
    throw new DiagramError(`${orig} must default-export a diagram(...) model`);
  }
  return model as DiagramModel;
}
