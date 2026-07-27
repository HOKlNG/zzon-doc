#!/usr/bin/env bun
/**
 * infra-architect CLI.
 *
 *   bun ia render <diagram.ts> [--out out]      -> .html + .svg + .scene.json
 *   bun ia export <diagram.ts> [--png] [--out]  -> PNG via resvg (vendored fonts)
 *   bun ia watch  <diagram.ts> [--port 4499]    -> dev server + auto reload
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
  console.error("usage: bun ia <render|export|watch> <diagram.ts> [--out dir] [--png] [--port n]");
  process.exit(2);
}

if (!cmd || !fileArg) usage();
const file = resolve(fileArg);
if (!existsSync(file)) {
  console.error(`no such file: ${file}`);
  process.exit(2);
}
const outDir = resolve(flag("out") ?? "out");
const name = basename(file).replace(/\.[tj]s$/, "");

async function renderOnce(): Promise<void> {
  const { loadDiagram, renderAll } = await import("../pipeline.ts");
  const model = await loadDiagram(file);
  const t0 = performance.now();
  const r = await renderAll(model);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.html`), r.html);
  writeFileSync(join(outDir, `${name}.svg`), r.staticSvg);
  writeFileSync(join(outDir, `${name}.scene.json`), r.sceneJson);
  console.log(
    `${name}: ${r.scene.width.toFixed(0)}x${r.scene.height.toFixed(0)}, ` +
      `${r.scene.nodes.length} nodes, ${r.scene.edges.length} edges — ` +
      `${(performance.now() - t0).toFixed(0)}ms -> ${join(outDir, `${name}.html`)}`,
  );
}

async function exportPng(): Promise<void> {
  await renderOnce();
  const { Resvg } = await import("@resvg/resvg-js");
  const { fontFilePath } = await import("../text/metrics.ts");
  const svg = await Bun.file(join(outDir, `${name}.svg`)).text();
  const png = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles: [fontFilePath("regular"), fontFilePath("semibold")],
    },
    fitTo: { mode: "zoom", value: 2 },
  })
    .render()
    .asPng();
  writeFileSync(join(outDir, `${name}.png`), png);
  console.log(`wrote ${join(outDir, `${name}.png`)} (${(png.length / 1024).toFixed(0)}KB)`);
}

/** child-process render so user code always runs on a fresh module graph */
async function renderInChild(): Promise<boolean> {
  const proc = Bun.spawn(["bun", join(import.meta.dir, "index.ts"), "render", file, "--out", outDir], {
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

try {
  if (cmd === "render") await renderOnce();
  else if (cmd === "export") await exportPng();
  else if (cmd === "watch") await watchMode();
  else usage();
  if (cmd !== "watch") process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
