#!/usr/bin/env node
/**
 * scan-deps.mjs — 모듈 의존성 그래프를 코드에서 기계 추출해 엔진 DSL(.ts)을 생성한다.
 *
 *   사용법:  node scan-deps.mjs <프로젝트 루트> [--src <소스 루트>] [--depth N]
 *                               [--out <docsDir>/terra/deps.ts] [--slug deps] [--title "…"] [--json]
 *
 * 모델이 import를 눈으로 훑어 그리면 빠지거나 지어낸다. 이 스크립트는 import 문을
 * 정규식으로 읽어 모듈(디렉터리) 단위로 집계하고, 순환(SCC)을 표시한 DSL을 쓴다 —
 * 같은 코드면 같은 그림. 지원: JS/TS(상대경로·tsconfig paths), Python(절대·상대),
 * Go(go.mod 모듈 경로), Java/Kotlin(package 선언). 외부 패키지는 집계에서 뺀다.
 * 모노레포: 패키지별 tsconfig paths와 워크스페이스 패키지 이름(package.json name)을 해석한다.
 * 타입 전용 import(import type)는 런타임 의존이 아니라서 기본 제외한다(--types로 포함).
 *
 * 집계 깊이: --depth가 없으면 모듈 수가 4~20(T2 표준)에 들도록 1부터 늘린다.
 * 20을 넘으면 원장(T3, ≤50)으로 쓰고, 그것도 넘으면 상위 깊이로 접는다.
 * 규칙: Node 내장만.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname, extname, sep, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { walk } from "./scan.mjs";

const JS_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"];
const PY_EXT = [".py"];
const GO_EXT = [".go"];
const JVM_EXT = [".java", ".kt"];
const CODE = new Set([...JS_EXT, ...PY_EXT, ...GO_EXT, ...JVM_EXT]);
const TEST_RE = /(^|\/)(__tests__|tests?|spec|e2e|fixtures?|mocks?)(\/|$)|\.(test|spec)\.[a-z]+$/i;

const toPosix = (p) => p.split(sep).join("/");
const read = (p) => {
  try {
    return statSync(p).size > 1_000_000 ? "" : readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

/** 소스 루트 자동 결정: src/lib/app/packages/... 중 코드 파일이 가장 많은 곳, 없으면 프로젝트 루트 */
function pickSrcRoot(root, files) {
  const counts = new Map();
  for (const f of files) {
    const top = f.split("/")[0];
    if (f.includes("/")) counts.set(top, (counts.get(top) || 0) + 1);
  }
  const preferred = ["src", "app", "lib", "packages", "apps", "services", "internal", "pkg", "backend", "server"];
  const cands = [...counts.entries()].filter(([d]) => preferred.includes(d)).sort((a, b) => b[1] - a[1]);
  if (cands.length && cands[0][1] >= files.length * 0.4) return cands[0][0];
  return "";
}

/** every tsconfig/jsconfig in the repo: dir -> path aliases (monorepos keep them per package) */
function loadTsPaths(root, allFiles) {
  const out = new Map();
  for (const f of allFiles) {
    const name = f.split("/").pop();
    if (name !== "tsconfig.json" && name !== "jsconfig.json") continue;
    const dir = posix.dirname(f) === "." ? "" : posix.dirname(f);
    try {
      const txt = read(join(root, f)).replace(/\/\*[\s\S]*?\*\/|(^|[^:"])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1");
      const co = JSON.parse(txt).compilerOptions || {};
      const base = posix.join(dir, co.baseUrl || ".");
      const aliases = Object.entries(co.paths || {}).map(([k, v]) => ({
        prefix: k.replace(/\*$/, ""),
        target: posix.normalize(posix.join(base, String(v[0] || "").replace(/\*$/, ""))),
      }));
      if (aliases.length) out.set(dir, aliases);
    } catch { /* 주석 섞인 tsconfig 등 — 별칭 없이 진행 */ }
  }
  return out;
}

/** aliases of the nearest ancestor tsconfig */
function aliasesFor(fileRel, byDir) {
  let dir = posix.dirname(fileRel);
  for (;;) {
    const key = dir === "." ? "" : dir;
    if (byDir.has(key)) return byDir.get(key);
    if (!key) return [];
    dir = posix.dirname(dir);
  }
}

/** workspace packages: package.json "name" -> its directory */
function workspacePackages(root, allFiles) {
  const out = [];
  for (const f of allFiles) {
    if (!f.endsWith("package.json") || f.includes("node_modules")) continue;
    try {
      const name = JSON.parse(read(join(root, f))).name;
      if (name) out.push({ name, dir: posix.dirname(f) === "." ? "" : posix.dirname(f) });
    } catch { /* not json */ }
  }
  return out.sort((a, b) => b.name.length - a.name.length);
}

function resolveJs(fromRel, spec, fileSet, aliases, pkgs) {
  let base = null;
  if (spec.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(fromRel), spec));
  else {
    const a = aliases.find((x) => x.prefix && spec.startsWith(x.prefix));
    if (a) base = posix.normalize(posix.join(a.target, spec.slice(a.prefix.length)));
    else {
      // workspace package import ("@repo/ui", "@repo/ui/button")
      const p = pkgs.find((w) => spec === w.name || spec.startsWith(w.name + "/"));
      if (p) {
        const sub = spec.slice(p.name.length).replace(/^\//, "");
        const roots = sub ? [posix.join(p.dir, sub), posix.join(p.dir, "src", sub)] : [posix.join(p.dir, "src/index"), posix.join(p.dir, "index")];
        for (const r of roots) {
          const hit = [r, ...JS_EXT.map((e) => r + e), ...JS_EXT.map((e) => `${r}/index${e}`)].find((t) => fileSet.has(t));
          if (hit) return hit;
        }
        // any file of the package keeps the module edge
        return [...fileSet].find((f) => f.startsWith((p.dir ? p.dir + "/" : ""))) ?? null;
      }
    }
  }
  if (base === null) return null; // 외부 패키지
  const stripped = base.replace(/\.(js|mjs|cjs|jsx)$/, "");
  const tries = [base, ...JS_EXT.map((e) => stripped + e), ...JS_EXT.map((e) => `${base}/index${e}`)];
  return tries.find((t) => fileSet.has(t)) ?? null;
}

function jsImports(text, withTypes) {
  const out = [];
  // type-only imports/exports are compile-time coupling, not runtime dependencies
  if (!withTypes) text = text.replace(/(?:^|[\s;])(?:import|export)\s+type\s[^;]*?from\s*["'][^"']+["']/g, " ");
  for (const m of text.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*["']([^"']+)["']|(?:^|[\s;])import\s*["']([^"']+)["']|\brequire\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    out.push(m[1] || m[2] || m[3] || m[4]);
  }
  return out;
}

function pyImports(text) {
  const out = [];
  for (const m of text.matchAll(/^\s*from\s+(\.*[\w.]*)\s+import\s+([\w*,\s()]+)/gm)) out.push({ from: m[1], names: m[2].replace(/[()\s]/g, "").split(",") });
  for (const m of text.matchAll(/^\s*import\s+([\w.,\s]+)$/gm)) for (const n of m[1].split(",")) out.push({ from: n.trim().split(/\s+as\s+/)[0], names: [] });
  return out;
}

function resolvePy(fromRel, imp, fileSet, pyRoots) {
  const candidates = [];
  const mod = imp.from;
  const toPaths = (dotted, baseDir) => {
    const p = posix.join(baseDir, dotted.replace(/\./g, "/"));
    return [`${p}.py`, `${p}/__init__.py`];
  };
  if (mod.startsWith(".")) {
    const level = mod.match(/^\.+/)[0].length;
    let dir = posix.dirname(fromRel);
    for (let i = 1; i < level; i++) dir = posix.dirname(dir);
    const rest = mod.slice(level);
    if (rest) candidates.push(...toPaths(rest, dir));
    for (const n of imp.names) if (n && n !== "*") candidates.push(...toPaths(rest ? `${rest}.${n}` : n, dir));
  } else {
    for (const r of pyRoots) {
      candidates.push(...toPaths(mod, r));
      for (const n of imp.names) if (n && n !== "*") candidates.push(...toPaths(`${mod}.${n}`, r));
    }
  }
  return candidates.find((c) => fileSet.has(posix.normalize(c))) ?? null;
}

function goModule(root) {
  const p = join(root, "go.mod");
  if (!existsSync(p)) return null;
  return (read(p).match(/^module\s+(\S+)/m) || [])[1] || null;
}

/**
 * @returns {{ srcRoot: string, files: string[], fileEdges: Map<string, Map<string, number>> }}
 */
export function extractFileGraph(root, srcOpt, { types = false } = {}) {
  root = resolve(root);
  const all = walk(root).map((f) => toPosix(relative(root, f)));
  const codeFiles = all.filter((f) => CODE.has(extname(f).toLowerCase()) && !TEST_RE.test(f) && !f.startsWith(".claude/"));
  const srcRoot = srcOpt !== undefined ? srcOpt.replace(/^\.\/|\/$/g, "") : pickSrcRoot(root, codeFiles);
  const files = codeFiles.filter((f) => !srcRoot || f === srcRoot || f.startsWith(srcRoot + "/"));
  const fileSet = new Set(codeFiles);
  const aliasByDir = loadTsPaths(root, all);
  const pkgs = workspacePackages(root, all);
  const goMod = goModule(root);
  const pyRoots = ["", srcRoot].filter((v, i, a) => a.indexOf(v) === i);
  // java/kotlin: package -> directory
  const pkgDir = new Map();
  for (const f of files) {
    if (!JVM_EXT.includes(extname(f))) continue;
    const pkg = (read(join(root, f)).match(/^\s*package\s+([\w.]+)/m) || [])[1];
    if (pkg) pkgDir.set(pkg, posix.dirname(f));
  }
  const fileEdges = new Map();
  const add = (a, b) => {
    if (!b || a === b) return;
    if (!fileEdges.has(a)) fileEdges.set(a, new Map());
    fileEdges.get(a).set(b, (fileEdges.get(a).get(b) || 0) + 1);
  };
  for (const f of files) {
    const ext = extname(f).toLowerCase();
    const text = read(join(root, f));
    if (!text) continue;
    if (JS_EXT.includes(ext)) for (const s of jsImports(text, types)) add(f, resolveJs(f, s, fileSet, aliasesFor(f, aliasByDir), pkgs));
    else if (PY_EXT.includes(ext)) for (const imp of pyImports(text)) add(f, resolvePy(f, imp, fileSet, pyRoots));
    else if (GO_EXT.includes(ext) && goMod) {
      for (const m of text.matchAll(/"([^"]+)"/g)) {
        if (!m[1].startsWith(goMod + "/")) continue;
        const dir = m[1].slice(goMod.length + 1);
        const target = codeFiles.find((c) => posix.dirname(c) === dir && c.endsWith(".go"));
        add(f, target);
      }
    } else if (JVM_EXT.includes(ext)) {
      for (const m of text.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+)\.[\w*]+\s*;?$/gm)) {
        const dir = pkgDir.get(m[1]);
        if (dir) add(f, files.find((c) => posix.dirname(c) === dir));
      }
    }
  }
  return { srcRoot, files, fileEdges };
}

function moduleOf(file, srcRoot, depth) {
  const rel = srcRoot ? file.slice(srcRoot.length + 1) : file;
  const parts = rel.split("/");
  const dirs = parts.slice(0, -1);
  // 최상위 파일은 파일 이름이 곧 모듈 이름이다 ("(root)" 같은 이름은 읽는 사람에게 뜻이 없다)
  if (dirs.length === 0) return parts[0].replace(/.[^.]+$/, "");
  return dirs.slice(0, depth).join("/");
}

function aggregate(graph, depth) {
  const modFiles = new Map();
  for (const f of graph.files) {
    const m = moduleOf(f, graph.srcRoot, depth);
    modFiles.set(m, (modFiles.get(m) || 0) + 1);
  }
  const edges = new Map();
  for (const [a, targets] of graph.fileEdges) {
    const ma = moduleOf(a, graph.srcRoot, depth);
    for (const [b, n] of targets) {
      if (!modFiles.has(moduleOf(b, graph.srcRoot, depth))) continue; // 소스 루트 밖
      const mb = moduleOf(b, graph.srcRoot, depth);
      if (ma === mb) continue;
      const k = `${ma}\u0000${mb}`;
      edges.set(k, (edges.get(k) || 0) + n);
    }
  }
  return { modules: modFiles, edges };
}

/** Tarjan SCC — 크기 2 이상 성분의 내부 엣지 = 순환 */
function cycles(modules, edges) {
  const adj = new Map([...modules.keys()].map((m) => [m, []]));
  for (const k of edges.keys()) {
    const [a, b] = k.split("\u0000");
    adj.get(a).push(b);
  }
  let index = 0;
  const idx = new Map(), low = new Map(), on = new Set(), stack = [], comp = new Map();
  const strong = (v) => {
    idx.set(v, index); low.set(v, index); index++;
    stack.push(v); on.add(v);
    for (const w of adj.get(v)) {
      if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const c = [];
      let w;
      do { w = stack.pop(); on.delete(w); c.push(w); } while (w !== v);
      for (const x of c) comp.set(x, c.length > 1 ? v : null);
    }
  };
  for (const v of adj.keys()) if (!idx.has(v)) strong(v);
  const cyc = new Set();
  for (const k of edges.keys()) {
    const [a, b] = k.split("\u0000");
    if (comp.get(a) && comp.get(a) === comp.get(b)) cyc.add(k);
  }
  return cyc;
}

export function buildDeps(root, { src, depth, types } = {}) {
  const graph = extractFileGraph(root, src, { types });
  let chosen = depth;
  let agg;
  if (chosen) agg = aggregate(graph, chosen);
  else {
    // 4~20(T2)에 드는 가장 얕은 깊이; 없으면 그 구간에 가장 가까운 깊이(≤50 우선)
    const tries = [1, 2, 3, 4].map((d) => ({ d, a: aggregate(graph, d) }));
    const dist = (n) => (n < 4 ? 4 - n : n > 20 ? n - 20 : 0) + (n > 50 ? 1000 : 0);
    const fit = tries.find((t) => dist(t.a.modules.size) === 0)
      ?? [...tries].sort((a, b) => dist(a.a.modules.size) - dist(b.a.modules.size) || a.d - b.d)[0];
    chosen = fit.d;
    agg = fit.a;
  }
  const cyc = cycles(agg.modules, agg.edges);
  const n = agg.modules.size;
  const tier = n <= 9 ? "overview" : n <= 20 ? "standard" : "reference";
  return { srcRoot: graph.srcRoot, depth: chosen, tier, files: graph.files.length, modules: agg.modules, edges: agg.edges, cycles: cyc };
}

const ident = (s) => s.replace(/[^A-Za-z0-9_-]/g, "_") || "root";

/**
 * selection-rubric §3.3 축소 사다리를 의존성 그래프에 객관 규칙으로 적용한다 —
 * 엣지가 등급 예산(1.5×N, T1은 최대 12)을 넘을 때만, 이 순서로:
 *   2단계(횡단 관심사): 다른 모듈의 절반 이상(≥3)이 의존하는 비순환 모듈 = 공용 모듈 →
 *          하단 밴드로 내리고 그쪽으로 들어오는 엣지는 그리지 않는다(노드에 "N개 모듈이 의존").
 *   추이 간선: 그래도 넘으면 a→…→b 우회 경로가 있는 직접 간선 a→b를 생략한다(도달성 보존).
 * 순환 간선은 절대 생략하지 않는다. 생략 수는 충실도 장부로 남는다.
 */
export function simplify(deps) {
  const N = deps.modules.size;
  const budget = N <= 9 ? Math.min(12, Math.ceil(1.5 * N)) : Math.ceil(1.5 * N);
  let edges = new Map(deps.edges);
  const foundation = new Set();
  let droppedFoundation = 0;
  let droppedTransitive = 0;
  const inCycle = new Set([...deps.cycles].flatMap((k) => k.split("\u0000")));
  if (edges.size > budget && N > 3) {
    const fanIn = new Map();
    for (const k of edges.keys()) {
      const b = k.split("\u0000")[1];
      fanIn.set(b, (fanIn.get(b) || 0) + 1);
    }
    const need = Math.max(3, Math.ceil((N - 1) / 2));
    for (const [m, n] of fanIn) if (n >= need && !inCycle.has(m)) foundation.add(m);
    for (const k of [...edges.keys()]) {
      if (foundation.has(k.split("\u0000")[1])) {
        edges.delete(k);
        droppedFoundation++;
      }
    }
  }
  if (edges.size > budget) {
    const adj = new Map();
    for (const k of edges.keys()) {
      const [a, b] = k.split("\u0000");
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push(b);
    }
    const reachableWithout = (a, b) => {
      // path a -> b of length >= 2 (skipping the direct edge)
      const seen = new Set();
      const stack = (adj.get(a) || []).filter((x) => x !== b);
      while (stack.length) {
        const v = stack.pop();
        if (v === b) return true;
        if (seen.has(v)) continue;
        seen.add(v);
        for (const w of adj.get(v) || []) stack.push(w);
      }
      return false;
    };
    for (const k of [...edges.keys()].sort()) {
      if (deps.cycles.has(k)) continue;
      const [a, b] = k.split("\u0000");
      if (reachableWithout(a, b)) {
        edges.delete(k);
        adj.set(a, adj.get(a).filter((x) => x !== b));
        droppedTransitive++;
      }
    }
  }
  return { edges, foundation, droppedFoundation, droppedTransitive, budget };
}

export function toDsl(deps, { slug = "deps", title } = {}) {
  const ids = new Map();
  const used = new Set();
  for (const m of [...deps.modules.keys()].sort()) {
    let id = ident(m.replace(/\//g, "-"));
    while (used.has(id)) id += "_";
    used.add(id);
    ids.set(m, id);
  }
  const fanIn = new Map(), fanOut = new Map();
  for (const k of deps.edges.keys()) {
    const [a, b] = k.split("\u0000");
    fanOut.set(a, (fanOut.get(a) || 0) + 1);
    fanIn.set(b, (fanIn.get(b) || 0) + 1);
  }
  const t = title ?? `모듈 의존성 (${deps.srcRoot || "루트"})`;
  const sim = simplify(deps);
  const ref = (m) => (sim.foundation.has(m) ? JSON.stringify(`band-bottom/${ids.get(m)}`) : ids.get(m).replace(/-/g, "_"));
  const L = [];
  L.push(`// GENERATED by scan-deps.mjs — 손으로 고치지 말고 다시 생성하라 (node scan-deps.mjs <루트> --out …)`);
  L.push(`// 소스 루트 "${deps.srcRoot || "."}" · 집계 깊이 ${deps.depth} · 파일 ${deps.files} · 모듈 ${deps.modules.size} · 의존 ${deps.edges.size} · 순환 엣지 ${deps.cycles.size}`);
  L.push(`// 충실도 장부: 원천 의존 ${deps.edges.size} → 그림 ${sim.edges.size} (공용 모듈 ${sim.foundation.size}개로 흡수 ${sim.droppedFoundation} · 추이 간선 생략 ${sim.droppedTransitive}) — 예산 ${sim.budget}`);
  L.push(`import { diagram } from "../src/dsl/index.ts";`);
  L.push("");
  L.push(`export default diagram(`);
  L.push(`  ${JSON.stringify(slug)},`);
  L.push(`  { title: ${JSON.stringify(t)}, docKind: "dependency", view: "dependency", tier: ${JSON.stringify(deps.tier)} },`);
  L.push(`  (d) => {`);
  const sorted = [...deps.modules.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [m, files] of sorted) {
    if (sim.foundation.has(m)) continue;
    const fo = fanOut.get(m) || 0, fi = fanIn.get(m) || 0;
    // 사이드바 문장 — references/writing-style.md (기호 나열·필드 이름 없이 한 문장)
    const desc = `파일 ${files}개로 된 모듈로, ${fo ? `다른 모듈 ${fo}개를 가져다 쓰고` : "다른 모듈을 쓰지 않고"} ${fi ? `모듈 ${fi}개가 이 모듈을 쓴다` : "이 모듈을 쓰는 모듈은 없다"}.`;
    L.push(`    const ${ids.get(m).replace(/-/g, "_")} = d.module(${JSON.stringify(ids.get(m))}, { label: ${JSON.stringify(m)}, files: ${files}, description: ${JSON.stringify(desc)} });`);
  }
  if (sim.foundation.size) {
    L.push(`    // 공용 모듈(축소 사다리 2단계): 들어오는 선은 그리지 않고 회색 공용 카드로 둔다`);
    L.push(`    d.band("bottom", (b) => {`);
    for (const [m, files] of sorted) {
      if (!sim.foundation.has(m)) continue;
      const desc = `모듈 ${fanIn.get(m) || 0}개가 함께 쓰는 공용 모듈이라 들어오는 선은 그리지 않았다.`;
      L.push(`      b.module(${JSON.stringify(ids.get(m))}, { label: ${JSON.stringify(m)}, shared: true, description: ${JSON.stringify(desc)} });`);
    }
    L.push(`    });`);
  }
  for (const [k, count] of [...sim.edges.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const [a, b] = k.split("\u0000");
    const opts = deps.cycles.has(k) ? `{ cycle: true, label: "순환" }` : `{}`;
    L.push(`    d.dependsOn(${ref(a)}, ${ref(b)}, ${opts}); // import ${count}건`);
  }
  L.push(`  },`);
  L.push(`);`);
  return L.join("\n") + "\n";
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (n) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const root = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !["--json", "--types"].includes(args[i - 1])));
  if (!root || args.includes("-h") || args.includes("--help")) {
    console.log("사용법: node scan-deps.mjs <프로젝트 루트> [--src <소스 루트>] [--depth N] [--out <파일.ts>] [--slug deps] [--title …] [--types] [--json]");
    process.exit(root ? 0 : 1);
  }
  const deps = buildDeps(root, { src: flag("src"), depth: flag("depth") ? Number(flag("depth")) : undefined, types: args.includes("--types") });
  if (args.includes("--json")) {
    console.log(JSON.stringify({ ...deps, modules: Object.fromEntries(deps.modules), edges: Object.fromEntries([...deps.edges].map(([k, v]) => [k.replace("\u0000", " -> "), v])), cycles: [...deps.cycles].map((k) => k.replace("\u0000", " -> ")) }, null, 2));
  } else {
    console.log(`소스 루트 "${deps.srcRoot || "."}" · 파일 ${deps.files} · 집계 깊이 ${deps.depth} → 모듈 ${deps.modules.size}(${deps.tier}) · 의존 ${deps.edges.size} · 순환 엣지 ${deps.cycles.size}`);
    if (deps.cycles.size) console.log(`순환: ${[...deps.cycles].map((k) => k.replace("\u0000", " → ")).join(", ")}`);
    if (deps.modules.size > 50) console.log("⚠ 모듈이 50개를 넘는다 — --depth를 낮추거나 --src로 하위 패키지별로 나눠 그려라.");
    const sim = simplify(deps);
    if (sim.droppedFoundation || sim.droppedTransitive) {
      console.log(`충실도 장부: 원천 의존 ${deps.edges.size} → 그림 ${sim.edges.size} (공용 모듈 ${[...sim.foundation].join(", ") || "-"}로 흡수 ${sim.droppedFoundation} · 추이 간선 생략 ${sim.droppedTransitive})`);
    }
    console.log(`sources 권장: ["${deps.srcRoot ? deps.srcRoot + "/**" : "**/*"}"]`);
  }
  const out = flag("out");
  if (out) {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, toDsl(deps, { slug: flag("slug") ?? "deps", title: flag("title") }));
    console.log(`DSL 생성: ${out}`);
  }
}
