#!/usr/bin/env node
/**
 * scan.mjs — 선택 기준(references/selection-rubric.md §1)의 "코드 사실(C)"을 기계적으로 센다.
 *
 *   사용법:  node scan.mjs <프로젝트 루트> [--json]
 *
 * 모델이 "대충 훑어보고" 판단하던 입력을 숫자로 고정한다 — 같은 코드면 같은 결과.
 * 세는 것: IaC 리소스 · 배포 단위 · 테이블 · 라우트 · 큐/토픽 · 상태 머신/상태 enum ·
 * 화면(페이지) · 에이전트 구성 · 소스 모듈. 정규식 휴리스틱이라 정확한 정의가 아니라
 * "신호"다 — 판단은 rubric이, 확인은 실제 코드 읽기가 한다.
 * 규칙: Node 내장만. 출력은 사람용 요약(기본) 또는 JSON(--json).
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, basename, sep, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "target", "vendor", ".next", ".nuxt", ".venv", "venv",
  "__pycache__", "coverage", ".terraform", ".idea", ".vscode", "playground", ".turbo", ".cache",
  "bin", "obj", ".gradle", ".pytest_cache", ".mypy_cache", "tmp",
]);
const MAX_FILES = 25_000;
const MAX_BYTES = 1_000_000;

const CODE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".java", ".kt", ".rb", ".cs", ".php", ".rs",
  ".swift", ".scala", ".vue", ".svelte",
]);
const LANG = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript",
  ".cjs": "JavaScript", ".py": "Python", ".go": "Go", ".java": "Java", ".kt": "Kotlin", ".rb": "Ruby",
  ".cs": "C#", ".php": "PHP", ".rs": "Rust", ".swift": "Swift", ".scala": "Scala", ".vue": "Vue", ".svelte": "Svelte",
};

export function walk(root) {
  const files = [];
  const stack = [root];
  while (stack.length && files.length < MAX_FILES) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".claude" && e.name !== ".github") {
        if (e.isDirectory()) continue;
      }
      const p = join(dir, e.name);
      // git 워크트리·중첩 리포(.git 파일이나 폴더를 가진 하위 폴더)는 다른 체크아웃이다 — 같은 파일이
      // 몇 벌씩 들어와 파일 상한에 걸리면 진짜 근거 파일이 목록에서 빠져 "삭제"로 보인다
      if (e.isDirectory() && dir !== root && existsSync(join(p, ".git"))) continue;
      if (e.isDirectory() && e.name === "worktrees" && dir.endsWith(".claude")) continue;
      if (e.isDirectory()) {
        // zzon 산출 폴더(docs/zzon-doc·구 루트 zzon-doc)는 건너뛰되, 같은 이름의 소스 폴더는 스캔한다
        const isOutput = existsSync(join(p, "manifest.json")) || existsSync(join(p, "specs")) || existsSync(join(p, "wiki.json"));
        if (!SKIP_DIRS.has(e.name) && !isOutput) stack.push(p);
      } else if (e.isFile()) files.push(p);
    }
  }
  return files.sort();
}

function read(p) {
  try {
    if (statSync(p).size > MAX_BYTES) return "";
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

const count = (text, re) => (text.match(re) || []).length;

export function scan(root) {
  root = resolve(root);
  const files = walk(root);
  const rel = (p) => relative(root, p).split(sep).join("/");
  const out = {
    root,
    files: files.length,
    truncated: files.length >= MAX_FILES,
    languages: {},
    iac: { terraform: { files: 0, resources: 0, byProvider: {}, modules: 0 }, cdk: false, k8s: { manifests: 0, deployments: 0 }, compose: { files: 0, services: [] } },
    deployUnits: { dockerfiles: [], workspaces: [], count: 0 },
    data: { tables: 0, bySource: {}, migrationDirs: 0 },
    interfaces: { routes: 0, byFramework: {} },
    messaging: { queues: 0, topics: 0, consumers: 0 },
    state: { machines: 0, statusEnums: [] },
    ui: { pages: 0, routes: 0 },
    agents: { agents: 0, skills: 0, hooks: 0 },
    modules: [],
  };
  const bump = (obj, key, n = 1) => {
    if (n) obj[key] = (obj[key] || 0) + n;
  };
  const statusEnums = new Set();
  const migrationDirs = new Set();
  const moduleFiles = new Map();

  for (const p of files) {
    const r = rel(p);
    const name = basename(p);
    const ext = extname(p).toLowerCase();
    if (LANG[ext]) bump(out.languages, LANG[ext]);

    // ---- source modules: first path segment under a source root
    if (CODE_EXT.has(ext) && !r.startsWith(".claude/")) {
      const parts = r.split("/");
      const srcIdx = parts.findIndex((s) => ["src", "lib", "app", "apps", "packages", "services", "internal", "pkg", "cmd"].includes(s));
      const mod = srcIdx >= 0 && parts.length > srcIdx + 2 ? parts.slice(0, srcIdx + 2).join("/") : parts.length > 1 ? parts[0] : "(root)";
      moduleFiles.set(mod, (moduleFiles.get(mod) || 0) + 1);
    }
    if (/(^|\/)migrations?(\/|$)/i.test(r)) migrationDirs.add(r.split("/").slice(0, -1).join("/"));

    // ---- agents
    if (/^\.claude\/agents\/.+\.md$/.test(r)) out.agents.agents++;
    if (/^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(r)) out.agents.skills++;
    if (r === ".claude/settings.json") out.agents.hooks += count(read(p), /"hooks"\s*:/g) ? 1 : 0;

    // ---- deploy units
    if (/^Dockerfile(\..+)?$/i.test(name) || name.endsWith(".Dockerfile")) out.deployUnits.dockerfiles.push(r);
    if (name === "package.json" && r === "package.json") {
      try {
        const pkg = JSON.parse(read(p));
        const ws = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages;
        if (Array.isArray(ws)) out.deployUnits.workspaces.push(...ws);
      } catch { /* not json */ }
    }

    // ---- IaC
    if (ext === ".tf") {
      const t = read(p);
      out.iac.terraform.files++;
      for (const m of t.matchAll(/^\s*resource\s+"([a-z0-9]+)_[^"]*"\s+"[^"]+"/gm)) {
        out.iac.terraform.resources++;
        bump(out.iac.terraform.byProvider, m[1]);
      }
      out.iac.terraform.modules += count(t, /^\s*module\s+"[^"]+"/gm);
    }
    if (name === "cdk.json") out.iac.cdk = true;
    if ((ext === ".yaml" || ext === ".yml") && !r.startsWith(".github/")) {
      const t = read(p);
      if (/^\s*apiVersion:/m.test(t) && /^\s*kind:/m.test(t)) {
        out.iac.k8s.manifests++;
        out.iac.k8s.deployments += count(t, /^\s*kind:\s*(Deployment|StatefulSet|DaemonSet)\b/gm);
      }
      if (/^(docker-)?compose(\..+)?\.ya?ml$/i.test(name)) {
        out.iac.compose.files++;
        const block = t.split(/^services:\s*$/m)[1] || "";
        for (const m of block.matchAll(/^ {2}([A-Za-z0-9_.-]+):\s*$/gm)) out.iac.compose.services.push(m[1]);
      }
    }

    // ---- data (tables)
    if (name.endsWith(".prisma")) bump(out.data.bySource, "prisma", count(read(p), /^\s*model\s+\w+\s*\{/gm));
    if (ext === ".sql") bump(out.data.bySource, "sql", count(read(p), /create\s+table\s+(if\s+not\s+exists\s+)?["`\w.]+/gi));

    // .claude/ is agent config, not product code — counted above, never scanned as source
    if (!CODE_EXT.has(ext) || r.startsWith(".claude/")) continue;
    const t = read(p);
    if (!t) continue;
    bump(out.data.bySource, "typeorm/jpa", count(t, /@Entity\s*\(/g));
    bump(out.data.bySource, "sqlalchemy/django", count(t, /__tablename__\s*=|class\s+\w+\((?:models\.Model|Base|db\.Model|SQLModel[^)]*table\s*=\s*True)/g));
    bump(out.data.bySource, "mongoose", count(t, /new\s+(?:mongoose\.)?Schema\s*\(/g));
    bump(out.data.bySource, "drizzle", count(t, /\b(?:pgTable|mysqlTable|sqliteTable)\s*\(/g));

    // ---- routes
    bump(out.interfaces.byFramework, "express/koa/fastify", count(t, /(?<!@)\b(?:app|router|server|fastify)\.(?:get|post|put|patch|delete)\s*\(\s*["'`]/g));
    bump(out.interfaces.byFramework, "nestjs", count(t, /@(?:Get|Post|Put|Patch|Delete)\s*\(/g));
    bump(out.interfaces.byFramework, "fastapi/flask", count(t, /@(?:app|router|bp|blueprint)\.(?:get|post|put|patch|delete|route)\s*\(/g));
    bump(out.interfaces.byFramework, "spring", count(t, /@(?:Get|Post|Put|Patch|Delete|Request)Mapping\b/g));
    bump(out.interfaces.byFramework, "go-http", count(t, /\.(?:HandleFunc|GET|POST|PUT|PATCH|DELETE)\(\s*"/g));
    if (/(^|\/)app\/.*\/route\.(t|j)sx?$/.test(r)) bump(out.interfaces.byFramework, "next-route-handler");

    // ---- messaging
    out.messaging.queues += count(t, /\b(?:QueueUrl|new\s+Queue\s*\(|SendMessageCommand|sqs\.send|amqp\.connect|channel\.assertQueue)/g);
    out.messaging.topics += count(t, /\b(?:topic\s*:\s*["'`]|SNS|PublishCommand|kafka\.producer|EventBridge|PutEventsCommand)/g);
    out.messaging.consumers += count(t, /@(?:KafkaListener|RabbitListener|SqsListener|EventPattern|MessagePattern)\b|\.consumer\s*\(|new\s+Worker\s*\(/g);

    // ---- state machines / status enums
    out.state.machines += count(t, /\bcreateMachine\s*\(|\baasm\b|StateMachineBuilder|@EnableStateMachine|transitions\s*=\s*\[/g);
    for (const m of t.matchAll(/\b(?:enum|type)\s+(\w*(?:Status|State|Phase|Stage))\b/g)) statusEnums.add(m[1]);
    for (const m of t.matchAll(/class\s+(\w*(?:Status|State))\s*\(\s*(?:str\s*,\s*)?(?:Enum|TextChoices|IntegerChoices)/g)) statusEnums.add(m[1]);

    // ---- UI pages
    if (/(^|\/)app\/(.+\/)?page\.(t|j)sx?$/.test(r) || /(^|\/)pages\/(?!api\/).+\.(t|j)sx?$/.test(r) || /(^|\/)(views|screens)\/.+\.(t|j)sx?$|\.vue$/.test(r)) out.ui.pages++;
    out.ui.routes += count(t, /<Route\s[^>]*path=|\bpath\s*:\s*["'`]\/[^"'`]*["'`]\s*,\s*(?:component|element|loadChildren)/g);
  }

  out.data.tables = Object.values(out.data.bySource).reduce((a, b) => a + b, 0);
  out.data.migrationDirs = migrationDirs.size;
  out.interfaces.routes = Object.values(out.interfaces.byFramework).reduce((a, b) => a + b, 0);
  out.state.statusEnums = [...statusEnums].sort();
  out.deployUnits.count = Math.max(out.deployUnits.dockerfiles.length, out.iac.compose.services.length, out.deployUnits.workspaces.length);
  out.modules = [...moduleFiles.entries()].sort((a, b) => b[1] - a[1]).map(([path, files]) => ({ path, files }));
  out.suggestions = suggest(out);
  return out;
}

/** selection-rubric §2.1 코드 신호(2점) + §2.3 기본 세트 조건 — 결정이 아니라 후보 */
function suggest(s) {
  const v = [];
  const tf = s.iac.terraform.resources;
  v.push({ view: "context", why: "큰 요청의 첫 장 (항상)", tier: "overview" });
  if (s.deployUnits.count >= 2 || s.iac.k8s.deployments >= 2) v.push({ view: "container", why: `배포 단위 ${s.deployUnits.count}개 / k8s 워크로드 ${s.iac.k8s.deployments}개`, tier: "standard" });
  else v.push({ view: "container", why: "배포 단위 1개 — 컨테이너 대신 컴포넌트 장을 검토", tier: "standard" });
  if (tf || s.iac.cdk || s.iac.k8s.manifests || s.iac.compose.files) {
    v.push({ view: "deployment", why: `IaC: tf 리소스 ${tf}${s.iac.cdk ? " · CDK" : ""}${s.iac.k8s.manifests ? ` · k8s ${s.iac.k8s.manifests}` : ""}${s.iac.compose.files ? ` · compose ${s.iac.compose.services.length}서비스` : ""}`, tier: tf > 40 ? "reference" : "standard", skill: tf ? "terra-form" : "zzon-doc" });
  }
  if (s.data.tables >= 3) v.push({ view: "erd", why: `테이블 ${s.data.tables}개`, tier: s.data.tables > 12 ? "standard (도메인 분할)" : "standard" });
  if (s.messaging.queues + s.messaging.topics + s.messaging.consumers >= 2) v.push({ view: "flow", why: `큐/토픽/컨슈머 신호 ${s.messaging.queues + s.messaging.topics + s.messaging.consumers}`, tier: "standard" });
  if (s.interfaces.routes >= 5) v.push({ view: "sequence", why: `라우트 ${s.interfaces.routes}개 — 왕복·분기가 본질인 대표 프로세스(인증·결제 등)마다 1장`, tier: "seq" , skill: "zzon-seq" });
  if (s.state.machines || s.state.statusEnums.length) v.push({ view: "state", why: `상태 머신 ${s.state.machines} · 상태 enum ${s.state.statusEnums.slice(0, 5).join(", ")}${s.state.statusEnums.length > 5 ? " …" : ""}`, tier: "standard" });
  const bigModules = s.modules.filter((m) => m.files >= 3).length;
  if (bigModules >= 3) v.push({ view: "dependency", why: `소스 모듈 ${bigModules}개 (파일 3개 이상)`, tier: bigModules > 20 ? "reference" : "standard" });
  if (s.ui.pages >= 3) v.push({ view: "screen-flow", why: `화면/페이지 ${s.ui.pages}개`, tier: "standard" });
  if (s.agents.agents + s.agents.skills + s.agents.hooks) v.push({ view: "agent-topology", why: `.claude 에이전트 ${s.agents.agents} · 스킬 ${s.agents.skills} · 훅 ${s.agents.hooks}`, tier: "overview" });
  return v;
}

function human(s) {
  const L = [];
  L.push(`스캔: ${s.root}  (파일 ${s.files}${s.truncated ? "+ — 상한 도달, 일부만" : ""})`);
  const langs = Object.entries(s.languages).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ${n}`).join(" · ");
  if (langs) L.push(`언어: ${langs}`);
  const tf = s.iac.terraform;
  L.push(`IaC: terraform 리소스 ${tf.resources}(${Object.entries(tf.byProvider).map(([k, n]) => `${k} ${n}`).join(", ") || "-"}) · 모듈 ${tf.modules} · CDK ${s.iac.cdk ? "있음" : "없음"} · k8s 매니페스트 ${s.iac.k8s.manifests}(워크로드 ${s.iac.k8s.deployments}) · compose 서비스 ${s.iac.compose.services.length}`);
  L.push(`배포 단위: ${s.deployUnits.count} (Dockerfile ${s.deployUnits.dockerfiles.length}${s.deployUnits.workspaces.length ? ` · workspaces ${s.deployUnits.workspaces.join(",")}` : ""})`);
  L.push(`데이터: 테이블 ${s.data.tables} (${Object.entries(s.data.bySource).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") || "-"}) · 마이그레이션 폴더 ${s.data.migrationDirs}`);
  L.push(`인터페이스: 라우트 ${s.interfaces.routes} (${Object.entries(s.interfaces.byFramework).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") || "-"})`);
  L.push(`메시징: 큐 ${s.messaging.queues} · 토픽/이벤트 ${s.messaging.topics} · 컨슈머 ${s.messaging.consumers}`);
  L.push(`상태: 상태 머신 ${s.state.machines} · 상태 enum ${s.state.statusEnums.length}${s.state.statusEnums.length ? ` (${s.state.statusEnums.slice(0, 6).join(", ")})` : ""}`);
  L.push(`UI: 화면/페이지 ${s.ui.pages} · 라우트 정의 ${s.ui.routes}`);
  L.push(`에이전트(.claude): 에이전트 ${s.agents.agents} · 스킬 ${s.agents.skills} · 훅 ${s.agents.hooks}`);
  L.push(`소스 모듈 상위: ${s.modules.slice(0, 8).map((m) => `${m.path}(${m.files})`).join(", ") || "-"}`);
  L.push("");
  L.push("뷰 후보 (selection-rubric §2 — 결정 아님, 요청어와 함께 점수화):");
  for (const v of s.suggestions) L.push(`  - ${v.view}${v.skill && v.skill !== "zzon-doc" ? ` [${v.skill}]` : ""}: ${v.why} → 기본 ${v.tier}`);
  return L.join("\n");
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith("--"));
  if (!root || args.includes("-h") || args.includes("--help")) {
    console.log("사용법: node scan.mjs <프로젝트 루트> [--json]");
    process.exit(root ? 0 : 1);
  }
  if (!existsSync(root)) {
    console.error(`없는 경로: ${root}`);
    process.exit(1);
  }
  const s = scan(root);
  console.log(args.includes("--json") ? JSON.stringify(s, null, 2) : human(s));
}
