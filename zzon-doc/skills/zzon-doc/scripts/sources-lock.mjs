/**
 * sources-lock.mjs — 다이어그램 ↔ 근거 코드 대조 장부 (diagrams.lock.json). Node 내장만.
 *
 * 문제: 코드가 바뀐 뒤 "다시 훑어줘/업데이트해줘"라고 하면 모델이 대충 보고 "최신"이라
 * 말하거나 일부만 고친다. 무엇이 바뀌었는지를 모델의 기억이 아니라 파일 해시로 판정한다.
 *
 * - 스펙 stub의 "sources": ["src/orders/**", "infra/*.tf"] = 그 장을 그릴 때 읽은 근거 파일
 *   (프로젝트 루트 기준 glob). 저작할 때 모델이 적는다.
 * - 빌드할 때 스펙(stub+DSL)이 바뀐 장은 자동 스탬프: 근거 파일 해시·git 커밋을 기록한다
 *   (저작자가 손댔다 = 그 시점 코드 기준으로 갱신했다).
 * - status: 현재 해시와 대조해 fresh / stale(변경·추가·삭제 파일) / untracked(sources 없음) /
 *   edited(스펙 수정 후 미빌드)를 보고하고, 프로젝트 신호(scan) 변화로 재검토할 뷰를 짚는다.
 * - stamp: 변경을 검토했지만 그림을 바꿀 필요가 없을 때 명시적으로 재스탬프한다.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { walk, scan } from "./scan.mjs";

export const LOCK_FILE = "diagrams.lock.json";

const sha1 = (buf) => createHash("sha1").update(buf).digest("hex").slice(0, 16);
const posix = (p) => p.split(sep).join("/");

/** 프로젝트 루트: 기본 산출 폴더 규약(docs/zzon-doc → ../.., 루트 zzon-doc → ..) 우선, 아니면 .git 조상 */
export function findProjectRoot(docsDir) {
  const abs = resolve(docsDir);
  const norm = posix(abs);
  if (/\/docs\/zzon-doc\/?$/.test(norm)) return resolve(abs, "..", "..");
  let dir = dirname(abs);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, ".git"))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return dirname(abs);
}

/** glob → RegExp (`**` 경로 넘기, `*` 세그먼트 안, `?` 한 글자). 디렉터리만 주면 그 아래 전부. */
export function globToRegExp(pattern) {
  let p = posix(pattern).replace(/^\.\//, "").replace(/\/+$/, "");
  if (!/[*?]/.test(p)) p = `${p}{,/**}`; // 파일 또는 디렉터리 전체
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*") {
      if (p[i + 1] === "*") {
        re += p[i + 2] === "/" ? "(?:.*/)?" : ".*";
        i += p[i + 2] === "/" ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = p.indexOf("}", i);
      const alts = p.slice(i + 1, end).split(",").map((a) => (a === "/**" ? "(?:/.*)?" : a.replace(/[.+^$()|[\]\\]/g, "\\$&")));
      re += `(?:${alts.join("|")})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function loadLock(docsDir) {
  const p = join(docsDir, LOCK_FILE);
  if (!existsSync(p)) return { version: 1, diagrams: {} };
  try {
    const l = JSON.parse(readFileSync(p, "utf8"));
    return { version: 1, diagrams: {}, ...l };
  } catch {
    return { version: 1, diagrams: {} };
  }
}

export function saveLock(docsDir, lock) {
  const ordered = { version: 1, scan: lock.scan, diagrams: Object.fromEntries(Object.entries(lock.diagrams).sort(([a], [b]) => a.localeCompare(b))) };
  writeFileSync(join(docsDir, LOCK_FILE), JSON.stringify(ordered, null, 2) + "\n");
}

function gitHead(root) {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, stdio: "pipe", timeout: 10_000 }).toString().trim() || null;
  } catch {
    return null;
  }
}

/** 프로젝트 파일 목록(상대 posix 경로) — 빌드 1회당 한 번만 걷는다 */
export function projectFiles(root) {
  return walk(root).map((f) => posix(relative(root, f)));
}

export function matchSources(files, patterns) {
  const res = patterns.map(globToRegExp);
  return files.filter((f) => res.some((re) => re.test(f)));
}

function hashFiles(root, rels) {
  const out = {};
  for (const r of rels) {
    try {
      out[r] = sha1(readFileSync(join(root, r)));
    } catch { /* 사라짐 */ }
  }
  return out;
}

/** 스펙 해시 = stub JSON + (있으면) DSL 소스 — 저작자가 장을 고쳤는지의 판정 기준 */
export function specHash(docsDir, specPath, spec) {
  let buf = readFileSync(specPath, "utf8");
  if (typeof spec.source === "string") {
    const src = join(docsDir, spec.source);
    if (existsSync(src)) buf += "\0" + readFileSync(src, "utf8");
  }
  return sha1(buf);
}

/** 스캔 결과 중 뷰 판단에 쓰이는 수치만 (드리프트 비교용) */
export function scanSummary(root) {
  const s = scan(root);
  return {
    deployUnits: s.deployUnits.count,
    tfResources: s.iac.terraform.resources,
    k8sWorkloads: s.iac.k8s.deployments,
    tables: s.data.tables,
    routes: s.interfaces.routes,
    messaging: s.messaging.queues + s.messaging.topics + s.messaging.consumers,
    statusEnums: s.state.statusEnums.length + s.state.machines,
    pages: s.ui.pages,
    agents: s.agents.agents + s.agents.skills + s.agents.hooks,
    modules: s.modules.filter((m) => m.files >= 3).length,
  };
}

/** 신호 → 재검토할 뷰 (selection-rubric §2.1 코드 신호 열과 같은 대응) */
const SIGNAL_VIEWS = {
  deployUnits: ["container", "deployment"],
  tfResources: ["deployment"],
  k8sWorkloads: ["deployment", "container"],
  tables: ["erd"],
  routes: ["sequence", "container"],
  messaging: ["flow", "sequence"],
  statusEnums: ["state"],
  pages: ["screen-flow"],
  agents: ["agent-topology"],
  modules: ["dependency", "component"],
};
const SIGNAL_LABEL = {
  deployUnits: "배포 단위", tfResources: "tf 리소스", k8sWorkloads: "k8s 워크로드", tables: "테이블", routes: "라우트",
  messaging: "메시징 신호", statusEnums: "상태 머신/enum", pages: "화면", agents: ".claude 구성", modules: "소스 모듈",
};

/**
 * 빌드 시 호출: 스펙이 바뀐(또는 처음 본) 장을 스탬프하고, 전체 스캔 요약을 갱신한다.
 * @param {{slug:string, specPath:string, spec:object}[]} entries
 * @returns {{stamped:string[]}}
 */
export function stampOnBuild(docsDir, entries, { force = [] } = {}) {
  const root = findProjectRoot(docsDir);
  const lock = loadLock(docsDir);
  const files = projectFiles(root);
  const head = gitHead(root);
  const stamped = [];
  const live = new Set(entries.map((e) => e.slug));
  for (const slug of Object.keys(lock.diagrams)) if (!live.has(slug)) delete lock.diagrams[slug];
  for (const { slug, specPath, spec } of entries) {
    const patterns = Array.isArray(spec.sources) ? spec.sources.filter((s) => typeof s === "string") : [];
    const h = specHash(docsDir, specPath, spec);
    const prev = lock.diagrams[slug];
    const want = force.includes(slug) || force.includes("all") || !prev || prev.specHash !== h || JSON.stringify(prev.sources) !== JSON.stringify(patterns);
    if (!want) continue;
    const matched = matchSources(files, patterns);
    lock.diagrams[slug] = {
      sources: patterns,
      specHash: h,
      stampedAt: new Date().toISOString().slice(0, 19) + "Z",
      commit: head,
      files: hashFiles(root, matched),
    };
    stamped.push(slug);
  }
  lock.scan = { at: new Date().toISOString().slice(0, 19) + "Z", commit: head, summary: scanSummary(root) };
  saveLock(docsDir, lock);
  return { stamped, root };
}

/**
 * 상태 보고 (쓰기 없음).
 * @returns {{root:string, rows:object[], drift:object[], counts:object}}
 */
export function statusReport(docsDir, entries) {
  const root = findProjectRoot(docsDir);
  const lock = loadLock(docsDir);
  const files = projectFiles(root);
  const rows = [];
  for (const { slug, specPath, spec } of entries) {
    const patterns = Array.isArray(spec.sources) ? spec.sources : [];
    const view = spec.view || null;
    const prev = lock.diagrams[slug];
    if (!patterns.length) {
      rows.push({ slug, view, state: "untracked" });
      continue;
    }
    if (!prev) {
      rows.push({ slug, view, state: "unbuilt" });
      continue;
    }
    if (prev.specHash !== specHash(docsDir, specPath, spec)) {
      rows.push({ slug, view, state: "edited" });
      continue;
    }
    const matched = matchSources(files, patterns);
    const now = hashFiles(root, matched);
    const changed = matched.filter((f) => prev.files[f] && prev.files[f] !== now[f]);
    const added = matched.filter((f) => !prev.files[f]);
    const removed = Object.keys(prev.files).filter((f) => !(f in now));
    const state = changed.length || added.length || removed.length ? "stale" : "fresh";
    rows.push({ slug, view, state, changed, added, removed, files: matched.length, commit: prev.commit, stampedAt: prev.stampedAt });
  }
  const drift = [];
  if (lock.scan?.summary) {
    const cur = scanSummary(root);
    for (const [k, v] of Object.entries(cur)) {
      const was = lock.scan.summary[k];
      if (typeof was === "number" && was !== v) drift.push({ signal: k, label: SIGNAL_LABEL[k] || k, was, now: v, views: SIGNAL_VIEWS[k] || [] });
    }
  }
  const counts = rows.reduce((a, r) => ((a[r.state] = (a[r.state] || 0) + 1), a), {});
  return { root, rows, drift, counts, scanCommit: lock.scan?.commit ?? null };
}

export function formatStatus(rep, docsDir) {
  const L = [`다이어그램 근거 대조 — ${docsDir}  (프로젝트 루트: ${rep.root})`];
  const mark = { fresh: "✓ fresh  ", stale: "✗ stale  ", untracked: "? untracked", edited: "! edited ", unbuilt: "! unbuilt" };
  for (const r of rep.rows) {
    const v = r.view ? ` [${r.view}]` : "";
    if (r.state === "fresh") L.push(`  ${mark.fresh} ${r.slug}${v} — 근거 ${r.files}파일, ${r.stampedAt?.slice(0, 10) ?? "?"} 기준`);
    else if (r.state === "stale") {
      const parts = [];
      if (r.changed.length) parts.push(`변경 ${r.changed.length}: ${r.changed.slice(0, 4).join(", ")}${r.changed.length > 4 ? " …" : ""}`);
      if (r.added.length) parts.push(`추가 ${r.added.length}: ${r.added.slice(0, 3).join(", ")}${r.added.length > 3 ? " …" : ""}`);
      if (r.removed.length) parts.push(`삭제 ${r.removed.length}: ${r.removed.slice(0, 3).join(", ")}${r.removed.length > 3 ? " …" : ""}`);
      L.push(`  ${mark.stale} ${r.slug}${v} — ${parts.join(" · ")}`);
      if (r.commit) L.push(`             → git diff ${r.commit} -- ${[...r.changed, ...r.removed].slice(0, 6).join(" ")}`);
    } else if (r.state === "untracked") L.push(`  ${mark.untracked} ${r.slug}${v} — sources 미기록: 스펙 stub에 근거 파일 glob을 적어야 갱신 여부를 판정할 수 있다`);
    else if (r.state === "edited") L.push(`  ${mark.edited} ${r.slug}${v} — 스펙이 수정됐는데 아직 빌드하지 않았다`);
    else L.push(`  ${mark.unbuilt} ${r.slug}${v} — 아직 한 번도 빌드(스탬프)되지 않았다`);
  }
  if (rep.drift.length) {
    L.push("프로젝트 신호 변화 (마지막 빌드 대비 — 그 신호에 기대는 뷰를 재검토):");
    for (const d of rep.drift) L.push(`  · ${d.label} ${d.was} → ${d.now}  → ${d.views.join(", ")}`);
  }
  const c = rep.counts;
  L.push(`요약: fresh ${c.fresh || 0} · stale ${c.stale || 0} · untracked ${c.untracked || 0} · edited ${c.edited || 0} · unbuilt ${c.unbuilt || 0}${rep.drift.length ? ` · 신호 변화 ${rep.drift.length}` : ""}`);
  if (c.stale || rep.drift.length) L.push("다음: stale 장의 변경 파일을 다시 읽고 DSL을 갱신한 뒤 빌드하라(빌드가 재스탬프한다). 검토 결과 그림 변경이 필요 없으면 --stamp <slug>로 명시하라.");
  if (c.untracked) L.push("다음: untracked 장은 근거 파일을 sources에 기록하라 — 기록 전에는 최신 여부를 판정할 수 없다.");
  return L.join("\n");
}
