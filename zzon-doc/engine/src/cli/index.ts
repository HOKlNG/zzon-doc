#!/usr/bin/env bun
/**
 * infra-architect CLI.
 *
 *   bun ia render <diagram.ts|.json> [--out out]      -> .html + .svg + .scene.json
 *   bun ia export <diagram.ts|.json> [--png] [--out]  -> PNG via resvg (vendored fonts)
 *   bun ia watch  <diagram.ts|.json> [--port 4499]    -> dev server + auto reload
 *   bun ia check  <diagram.ts|.json> [--tier overview|standard|reference] [--json]
 *                                                    -> invariants + tier quality gate (exit 1 on fail)
 *   bun ia font-css <text-file> --css <out.css>      -> @font-face CSS (Pretendard subset of the file's characters)
 *                                                    -> used by the skill shells so every page shares one face
 *
 * .json input is a legacy DiagramSpec: converted internally via
 * src/compat/diagramspec.ts, same outputs, slug = json basename.
 * kind "sequence" is rejected (zzon-seq renders sequence diagrams).
 *
 * Watch mode re-runs the render in a CHILD process per change (fresh ESM
 * module graph; a crashing diagram.ts cannot take the watcher down).
 */
import { mkdirSync, writeFileSync, watch as fsWatch, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const [cmd, fileArg, ...rest] = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return rest[i + 1]?.startsWith("--") || rest[i + 1] === undefined ? "true" : rest[i + 1];
}

function usage(): never {
  console.error("usage: bun ia <render|export|watch|check|font-css> <diagram.ts|.json|text-file> [--out dir] [--png] [--port n] [--tier t] [--json]");
  process.exit(2);
}

if (!cmd || !fileArg) usage();
const file = resolve(fileArg);
if (!existsSync(file)) {
  console.error(`no such file: ${file}`);
  process.exit(2);
}
const outDir = resolve(flag("out") ?? "out");
const name = basename(file).replace(/\.([tj]s|json)$/, "");
// --fold: the big-picture sheet of the same model (selection-rubric §3.4), drilling down to `name`
const fold = flag("fold") !== undefined;
const outName = fold ? `${name}-overview` : name;

/** load the model: .json = legacy DiagramSpec (converted), else diagram module */
async function loadModel(): Promise<import("../model/types.ts").DiagramModel> {
  if (file.endsWith(".json")) {
    const { convertDiagramSpec } = await import("../compat/diagramspec.ts");
    const spec: unknown = JSON.parse(await Bun.file(file).text());
    const { model, warnings, notes } = convertDiagramSpec(spec, { id: name });
    for (const n of notes) console.error(`note: ${n}`);
    for (const w of warnings) console.error(`⚠ ${w}`);
    return model;
  }
  const { loadDiagram } = await import("../pipeline.ts");
  return loadDiagram(file);
}

async function renderOnce(withPng = false): Promise<void> {
  const { renderAll } = await import("../pipeline.ts");
  const { renderHtml } = await import("../render/html.ts");
  let model = await loadModel();
  if (fold) {
    const { foldModel, ledgerSummary } = await import("../model/fold.ts");
    const r = foldModel(model, { href: flag("href") ?? name });
    model = r.model;
    console.error(`큰 그림: 노드 ${r.detailNodes} → ${r.overviewNodes} (${ledgerSummary(r.ledger)})`);
  }
  const t0 = performance.now();
  // payload.assets names the sibling files this command actually writes
  // (frame export-button download fallback, contract §6)
  const r = await renderAll(model, {
    assets: { svgFile: `${outName}.svg`, ...(withPng ? { pngFile: `${outName}.png` } : {}) },
  });
  const html = await renderHtml(r.payload, r.canvas);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${outName}.html`), html);
  writeFileSync(join(outDir, `${outName}.svg`), r.staticSvg);
  writeFileSync(join(outDir, `${outName}.scene.json`), r.sceneJson);
  if (flag("gate")) {
    // same scene, no second layout pass: invariants + tier gate for build-docs' manifest
    const { checkScene } = await import("../../tests/invariants.ts");
    const { gateScene } = await import("../quality/metrics.ts");
    const invariants = checkScene(r.scene, { aspectRatio: model.aspectRatio }).filter(
      (v) => !(v.rule === "aspect" && (!!model.direction || r.scene.nodes.length <= 9)),
    );
    const gate = gateScene(r.scene, model);
    writeFileSync(
      join(outDir, `${outName}.gate.json`),
      JSON.stringify({ id: model.id, view: model.view ?? null, docKind: model.docKind ?? "infra", invariants, gate }, null, 1),
    );
  }
  console.log(
    `${outName}: ${r.scene.width.toFixed(0)}x${r.scene.height.toFixed(0)}, ` +
      `${r.scene.nodes.length} nodes, ${r.scene.edges.length} edges — ` +
      `${(performance.now() - t0).toFixed(0)}ms -> ${join(outDir, `${outName}.html`)}`,
  );
}

async function exportPng(): Promise<void> {
  await renderOnce(true);
  const { Resvg } = await import("@resvg/resvg-js");
  const { fontFilePath } = await import("../text/metrics.ts");
  const svg = await Bun.file(join(outDir, `${outName}.svg`)).text();
  const png = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles: [fontFilePath("regular"), fontFilePath("semibold")],
    },
    fitTo: { mode: "zoom", value: 2 },
  })
    .render()
    .asPng();
  writeFileSync(join(outDir, `${outName}.png`), png);
  console.log(`wrote ${join(outDir, `${outName}.png`)} (${(png.length / 1024).toFixed(0)}KB)`);
}

/** child-process render so user code always runs on a fresh module graph */
async function renderInChild(): Promise<boolean> {
  const proc = Bun.spawn([process.execPath, join(import.meta.dir, "index.ts"), "render", file, "--out", outDir], {
    stdout: "inherit",
    stderr: "inherit",
  });
  return (await proc.exited) === 0;
}

async function watchMode(): Promise<void> {
  const port = Number(flag("port") ?? 4499);
  let version = 0;
  const listeners = new Set<ReadableStreamDefaultController>();

  const rebuild = async () => {
    const ok = await renderInChild();
    if (ok) {
      version++;
      for (const l of listeners) l.enqueue(`data: ${version}\n\n`);
    }
  };
  await rebuild();

  const watchDirs = [resolve(file, ".."), resolve("src")];
  let timer: ReturnType<typeof setTimeout> | null = null;
  for (const dir of watchDirs) {
    fsWatch(dir, { recursive: true }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(rebuild, 150);
    });
  }

  Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/events") {
        const stream = new ReadableStream({
          start(controller) {
            listeners.add(controller);
          },
          cancel(controller: ReadableStreamDefaultController) {
            listeners.delete(controller);
          },
        });
        return new Response(stream, {
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        });
      }
      const html = await Bun.file(join(outDir, `${name}.html`)).text();
      const live = html.replace(
        "</body>",
        `<script>new EventSource("/events").onmessage=()=>location.reload()</script></body>`,
      );
      return new Response(live, { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
  console.log(`watching — http://localhost:${port}`);
}

/**
 * Quality gate (selection-rubric §4): collision invariants (hard) + tier
 * readability metrics. Exit 1 when any invariant is violated or the gate fails.
 */
async function checkOnce(): Promise<boolean> {
  const { buildScene } = await import("../pipeline.ts");
  const { checkScene } = await import("../../tests/invariants.ts");
  const { gateScene, formatGate } = await import("../quality/metrics.ts");
  const model = await loadModel();
  const scene = await buildScene(model);
  const tierFlag = flag("tier");
  if (tierFlag && !["overview", "standard", "reference"].includes(tierFlag)) {
    throw new Error(`--tier must be overview|standard|reference (got "${tierFlag}")`);
  }
  // declared direction = the author's column structure; aspect is a gate warning, not an invariant
  // aspect is an invariant only for undeclared, larger-than-overview layouts:
  // a declared direction is the author's column structure, and small
  // diagrams fit any viewport
  const violations = checkScene(scene, { aspectRatio: model.aspectRatio }).filter(
    (v) => !(v.rule === "aspect" && (!!model.direction || scene.nodes.length <= 9)),
  );
  const gate = gateScene(scene, model, tierFlag ? { tier: tierFlag as "overview" | "standard" | "reference" } : {});
  if (flag("json")) {
    const { zoomPlan } = await import("../model/fold.ts");
    console.log(JSON.stringify({ id: model.id, view: model.view, invariants: violations, gate, zoom: zoomPlan(model) }, null, 2));
  } else {
    console.log(`${name}${model.view ? ` [${model.view}]` : ""}`);
    console.log(violations.length ? `불변식: 위반 ${violations.length}건` : "불변식: 위반 0");
    for (const v of violations) console.log(`  ✗ ${v.rule}: ${v.detail}`);
    console.log(formatGate(gate));
    const { zoomPlan } = await import("../model/fold.ts");
    const z = zoomPlan(model);
    const word = { single: "한 장", "overview-optional": "큰 그림 권장", "overview-required": "큰 그림 필수" }[z.decision];
    console.log(`줌 판단: ${word} — ${z.reason}`);
    if (z.decision !== "single") console.log("  큰 그림 만들기: bun ia render <파일> --fold   (스펙 stub이면 \"overview\": true)");
  }
  return violations.length === 0 && !gate.failed;
}

try {
  if (cmd === "check") process.exit((await checkOnce()) ? 0 : 1);
  if (cmd === "font-css") {
    const { fontFaceCss } = await import("../render/adapter.ts");
    const text = await Bun.file(file).text();
    // written to a file: a large stdout write can be cut off by process.exit on a pipe
    await Bun.write(resolve(flag("css") ?? "font.css"), await fontFaceCss([...new Set(text + "0123456789")].join("")));
    process.exit(0);
  }
  if (cmd === "render") await renderOnce();
  else if (cmd === "export") await exportPng();
  else if (cmd === "watch") await watchMode();
  else usage();
  if (cmd !== "watch") process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
