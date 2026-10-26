#!/usr/bin/env node
/**
 * build-wiki.mjs — wiki.json + docs/*.md (+ 다이어그램) → self-contained 위키 index.html
 *
 * 계약 (wiki-spec.md 정본):
 * - wiki.json이 단일 상태 소스. 이 스크립트는 strict 검증 후에만 빌드한다.
 * - 다이어그램 렌더·manifest는 build-docs.mjs를 자식 프로세스로 호출해 위임한다(엔진 불가침).
 * - 문서 md는 raw HTML 금지: 전량 이스케이프 후 마크다운 변환. 링크 스킴 허용목록.
 * - `@diagram(slug)` 한 줄 → iframe 블록 치환(존재 검증). `q-NNN` 마커 ↔ 질문 대장 대조.
 * - todo/na 문서는 md 파일이 없어야 한다(빈 파일 무덤 금지).
 * - `--status`: 파일 해시 대조 리포트(unchanged / edited-by-human / new / missing) + 질문 마커 대조.
 *
 * 사용법:
 *   node build-wiki.mjs <docsDir>            # 빌드 (예: node build-wiki.mjs ./docs/zzon-doc)
 *   node build-wiki.mjs <docsDir> --status   # 상태 리포트만 (쓰기 없음)
 *
 * Node 20+ 내장만 사용 (외부 의존 0). 출력 index.html도 self-contained.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { BREAKPOINT, CONTROL, FONT_STACK, MONO_STACK, RADIUS, themeCss } from "../../zzon-doc/scripts/design-tokens.mjs";
import { fontFaceCss } from "../../zzon-doc/scripts/engine-cli.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD_DOCS = join(HERE, "..", "..", "zzon-doc", "scripts", "build-docs.mjs");

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;
const QID_RE = /^q-\d{3,}$/;
const TIERS = ["lite", "standard", "full"];
const STATUSES = ["todo", "draft", "done", "na"];
const Q_STATUSES = ["open", "answered", "dropped"];
const HISTORY_CAP = 200;

/* =========================================================================
 * 1. wiki.json 검증 (strict — 실패 시 `path: 메시지`)
 * ========================================================================= */

export function validateWiki(wiki, manifestSlugs) {
  const errs = [];
  const E = (path, msg) => errs.push(`${path}: ${msg}`);
  if (typeof wiki !== "object" || wiki === null) return ["wiki: 객체가 아니다"];

  if (wiki.version !== 1) E("version", "1이어야 한다");
  if (!wiki.title || typeof wiki.title !== "string") E("title", "필수 문자열이다");
  if (!TIERS.includes(wiki.tier)) E("tier", `허용: ${TIERS.join(", ")}`);
  if (!Array.isArray(wiki.sections) || wiki.sections.length === 0) {
    E("sections", "섹션이 최소 1개 필요하다");
    return errs;
  }
  wiki.questions ??= [];
  wiki.history ??= [];
  wiki.interview ??= {};

  const docPaths = new Set();
  const qIds = new Set();

  wiki.questions.forEach((q, i) => {
    const P = `questions[${i}]`;
    if (!QID_RE.test(q.id || "")) E(`${P}.id`, `'${q.id}' — 형식은 q-001 (q-숫자 3자리+)`);
    else if (qIds.has(q.id)) E(`${P}.id`, `'${q.id}' 중복`);
    qIds.add(q.id);
    if (!q.text) E(`${P}.text`, "질문 문장이 비어 있다");
    if (!Q_STATUSES.includes(q.status)) E(`${P}.status`, `허용: ${Q_STATUSES.join(", ")}`);
    if (q.status === "answered" && !q.answer) E(`${P}.answer`, "answered면 answer가 필수다");
  });

  const sectionIds = new Set();
  wiki.sections.forEach((s, si) => {
    const SP = `sections[${si}]`;
    if (!SLUG_RE.test(s.id || "")) E(`${SP}.id`, `'${s.id}' — slug 형식이어야 한다`);
    else if (sectionIds.has(s.id)) E(`${SP}.id`, `'${s.id}' 중복`);
    sectionIds.add(s.id);
    if (!s.title) E(`${SP}.title`, "필수다");
    if (!Array.isArray(s.items)) { E(`${SP}.items`, "배열이어야 한다"); return; }

    const walk = (nodes, parentPath, jsonPath, depth) => {
      if (depth > 3) { E(jsonPath, "중첩은 최대 3단이다"); return; }
      const siblings = new Set();
      nodes.forEach((n, ni) => {
        const P = `${jsonPath}[${ni}]`;
        if (!SLUG_RE.test(n.slug || "")) E(`${P}.slug`, `'${n.slug}' — slug 형식이어야 한다`);
        else if (siblings.has(n.slug)) E(`${P}.slug`, `'${n.slug}' — 같은 부모 안에서 중복`);
        siblings.add(n.slug);
        const path = `${parentPath}/${n.slug}`;
        if (docPaths.has(path)) E(`${P}.slug`, `트리 경로 '${path}' 중복`);
        docPaths.add(path);

        if (!n.title) E(`${P}.title`, "필수다");
        if (!STATUSES.includes(n.status)) E(`${P}.status`, `허용: ${STATUSES.join(", ")}`);
        if (n.status === "na" && !n.naReason) E(`${P}.naReason`, "na면 사유가 필수다");
        if ((n.status === "draft" || n.status === "done") && !n.file) {
          E(`${P}.file`, `${n.status}면 file이 필수다`);
        }
        if ((n.status === "todo" || n.status === "na") && n.file) {
          E(`${P}.file`, `${n.status} 문서는 파일을 갖지 않는다 (빈 md 금지 — wiki.json 엔트리로만 존재)`);
        }
        if (n.file && !/^docs\//.test(n.file)) E(`${P}.file`, `'${n.file}' — docs/ 하위 상대 경로여야 한다`);
        (n.diagrams ?? []).forEach((d, di) => {
          if (!manifestSlugs) {
            E(`${P}.diagrams[${di}]`, `'${d}' 참조가 있는데 manifest.json이 없다 — 다이어그램을 먼저 빌드해라(build-docs)`);
          } else if (!manifestSlugs.has(d)) {
            E(`${P}.diagrams[${di}]`, `'${d}' — manifest에 없다. 사용 가능: ${[...manifestSlugs].join(", ") || "(없음)"}`);
          }
        });
        (n.questions ?? []).forEach((qid, qi) => {
          if (!qIds.has(qid)) E(`${P}.questions[${qi}]`, `'${qid}' — 질문 대장에 없다`);
        });
        if (n.children?.length) walk(n.children, path, `${P}.children`, depth + 1);
      });
    };
    walk(s.items, s.id, `${SP}.items`, 1);
  });

  wiki.questions.forEach((q, i) => {
    if (q.doc && !docPaths.has(q.doc)) {
      E(`questions[${i}].doc`, `'${q.doc}' — 트리에 없는 경로다`);
    }
  });
  wiki.history.forEach((h, i) => {
    if (!h.ts || !h.actor || !h.action) E(`history[${i}]`, "ts·actor·action이 필수다");
  });

  return errs;
}

/* =========================================================================
 * 2. 마크다운 렌더러 (raw HTML 금지 — 전량 이스케이프 후 변환)
 * ========================================================================= */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

function safeHref(url) {
  const u = url.trim();
  if (/^(https?:|#)/i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null; // javascript:, data: 등 스킴은 전부 강등
  return u; // 상대경로
}

function inline(text) {
  // 입력은 이미 esc()된 상태. 코드 스팬 → 굵게 → 기울임 → 링크 순.
  let out = text.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const href = safeHref(url);
    if (!href) return `${label} (${url})`;
    const ext = /^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${esc(href)}"${ext}>${label}</a>`;
  });
  return out;
}

const DGM = "\u0000DGM:"; // @diagram 자리표시 (esc를 통과하는 제어문자)

/**
 * renderMarkdown(src) → { html, diagrams: [slug…], questions: [q-id…] }
 * html의 @diagram 자리에는 "\u0000DGM:slug\u0000" 토큰이 남는다 — 호출자가 검증 후 치환한다.
 */
export function renderMarkdown(src) {
  const lines = String(src).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const diagrams = [];
  const questions = [...new Set(String(src).match(/q-\d{3,}/g) || [])];

  let para = [];
  let list = null; // { tag, items }
  let quote = [];
  let table = null; // { header, rows }
  let code = null; // { lang, lines }

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(esc(para.join(" ")))}</p>`); para = []; }
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.tag}>` + list.items.map((i) => `<li>${inline(esc(i))}</li>`).join("") + `</${list.tag}>`);
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      const isQ = /^❓/.test(quote[0]);
      // 질문 id(q-001)는 추적용이다 — 원문 md에는 남기고 화면에는 "확인 필요" 표식만 보인다
      const lines = isQ ? [quote[0].replace(/^❓\s*(미확인)?\s*(\(q-\d+\))?\s*[:：]?\s*/, ""), ...quote.slice(1)] : quote;
      const body = (isQ ? '<span class="qlabel">확인 필요</span>' : "") + lines.map((l) => inline(esc(l))).join("<br>");
      out.push(`<blockquote${isQ ? ' class="callout-q"' : ""}>${body}</blockquote>`);
      quote = [];
    }
  };
  const flushTable = () => {
    if (table) {
      const cells = (row) => row.split("|").slice(1, -1).map((c) => c.trim());
      const th = cells(table.header).map((c) => `<th>${inline(esc(c))}</th>`).join("");
      const trs = table.rows.map((r) => "<tr>" + cells(r).map((c) => `<td>${inline(esc(c))}</td>`).join("") + "</tr>").join("");
      out.push(`<div class="tbl"><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`);
      table = null;
    }
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); flushTable(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (code) {
      if (/^```/.test(line)) { out.push(`<pre><code${code.lang ? ` class="lang-${esc(code.lang)}"` : ""}>${esc(code.lines.join("\n"))}</code></pre>`); code = null; }
      else code.lines.push(line);
      continue;
    }
    const fence = line.match(/^```(\S*)/);
    if (fence) { flushAll(); code = { lang: fence[1] || "", lines: [] }; continue; }

    const dgm = line.match(/^@diagram\(([^)]+)\)\s*$/);
    if (dgm) { flushAll(); diagrams.push(dgm[1].trim()); out.push(`${DGM}${dgm[1].trim()}\u0000`); continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flushAll(); out.push(`<h${h[1].length}>${inline(esc(h[2]))}</h${h[1].length}>`); continue; }

    if (/^\s*$/.test(line)) { flushAll(); continue; }
    if (/^---+\s*$/.test(line)) { flushAll(); out.push("<hr>"); continue; }

    if (/^>\s?/.test(line)) { flushPara(); flushList(); flushTable(); quote.push(line.replace(/^>\s?/, "")); continue; }
    flushQuote();

    if (/^\|/.test(line)) {
      flushPara(); flushList();
      if (!table) {
        const next = lines[i + 1] || "";
        if (/^\|[\s:|-]+\|?\s*$/.test(next)) { table = { header: line, rows: [] }; i++; continue; }
      } else { table.rows.push(line); continue; }
    } else flushTable();

    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const tag = ul ? "ul" : "ol";
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((ul || ol)[1]);
      continue;
    }
    flushList();

    para.push(line.trim());
  }
  if (code) out.push(`<pre><code>${esc(code.lines.join("\n"))}</code></pre>`);
  flushAll();

  return { html: out.join("\n"), diagrams, questions };
}

/* =========================================================================
 * 3. 트리 유틸
 * ========================================================================= */

function walkDocs(wiki, fn) {
  for (const s of wiki.sections) {
    const walk = (nodes, parentPath) => {
      for (const n of nodes) {
        const path = `${parentPath}/${n.slug}`;
        fn(n, path, s);
        if (n.children?.length) walk(n.children, path);
      }
    };
    walk(s.items, s.id);
  }
}

function sha256File(p) {
  return "sha256:" + createHash("sha256").update(readFileSync(p)).digest("hex");
}

function listMdFiles(dir, base) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listMdFiles(p, base));
    else if (name.endsWith(".md")) out.push(relative(base, p).split(sep).join("/"));
  }
  return out;
}

/* =========================================================================
 * 4. --status 리포트 (쓰기 없음)
 * ========================================================================= */

/** 결정 번호·티켓·질문 번호·절 기호 — 독자 문장에 남기지 않는다 (엔진 metrics.ts TRACKING_CODE와 같은 식) */
const TRACKING_CODE = /\b(?:ADR|FL|OPS|TKT|JIRA)-\d+\b|\bq-\d{2,}\b|§\s?\d|\b[DB]-\d{3}\b/g;

/** 문체 검사 대상 본문 — 코드 블록, 질문 표식 줄, 끝의 관련 자료·더 보기 절을 뺀다 */
function proseOf(md) {
  const lines = md.replace(/\r\n/g, "\n").replace(/```[\s\S]*?```/g, "").split("\n");
  const out = [];
  for (const line of lines) {
    if (/^##\s*(관련 자료|더 보기|참고 자료)\s*$/.test(line)) break;
    if (/❓/.test(line)) continue;
    out.push(line.replace(/`[^`]*`/g, ""));
  }
  return out.join("\n");
}

function statusReport(root, wiki) {
  const unchanged = [], edited = [], missing = [], noHash = [];
  const referenced = new Set();
  const markerLoss = []; // 질문 open인데 본문에서 마커 소멸

  const openByDoc = new Map();
  for (const q of wiki.questions) {
    if (q.status === "open") {
      if (!openByDoc.has(q.doc)) openByDoc.set(q.doc, []);
      openByDoc.get(q.doc).push(q.id);
    }
  }

  walkDocs(wiki, (n, path) => {
    if (!n.file) return;
    referenced.add(n.file);
    const abs = join(root, n.file);
    if (!existsSync(abs)) { missing.push(path); return; }
    const cur = sha256File(abs);
    if (!n.hash) noHash.push(path);
    else if (n.hash === cur) unchanged.push(path);
    else edited.push(path);
    const openIds = openByDoc.get(path) || [];
    if (openIds.length) {
      const body = readFileSync(abs, "utf8");
      for (const qid of openIds) if (!body.includes(qid)) markerLoss.push({ doc: path, qid });
    }
  });

  const orphan = listMdFiles(join(root, "docs"), root).filter((f) => !referenced.has(f));
  const openCount = wiki.questions.filter((q) => q.status === "open").length;

  console.log(`상태 리포트 — ${wiki.title} (tier: ${wiki.tier})`);
  console.log(`  동기화됨 ${unchanged.length} · 사람 수정 감지 ${edited.length} · 미동기화(해시 없음) ${noHash.length} · 파일 유실 ${missing.length} · 미등록 md ${orphan.length}`);
  if (edited.length) console.log(`  ✎ 사람 수정 (재독 후 반영 여부를 물어라 — 자동 덮어쓰기 금지):\n` + edited.map((d) => `    - ${d}`).join("\n"));
  if (missing.length) console.log(`  ✗ 파일 유실 (wiki.json은 있는데 md가 없다):\n` + missing.map((d) => `    - ${d}`).join("\n"));
  if (orphan.length) console.log(`  ? 미등록 md (트리에 없는 파일):\n` + orphan.map((f) => `    - ${f}`).join("\n"));
  console.log(`  열린 질문 ${openCount}건` + (markerLoss.length
    ? ` — 그중 ${markerLoss.length}건은 본문 마커가 사라졌다(사람이 답했을 가능성 — 확인 질문으로 승격):\n`
      + markerLoss.map((m) => `    - ${m.doc} (${m.qid})`).join("\n")
    : ""));
  const todo = [];
  walkDocs(wiki, (n, path) => { if (n.status === "todo") todo.push(path); });
  console.log(`  todo ${todo.length}건` + (todo.length ? `: ${todo.slice(0, 8).join(", ")}${todo.length > 8 ? " …" : ""}` : ""));

  // 문체 검사(writing-style.md 규칙 7·12) — 본문 문장에 남은 추적 코드와 문장을 잇는 줄표
  const style = [];
  walkDocs(wiki, (n, path) => {
    if (!n.file || !existsSync(join(root, n.file))) return;
    const s = proseOf(readFileSync(join(root, n.file), "utf8"));
    const codes = s.match(TRACKING_CODE) || [];
    const dashes = (s.match(/\s—\s/g) || []).length;
    if (codes.length || dashes > 5) style.push({ path, codes: codes.length, dashes, sample: [...new Set(codes)].slice(0, 3) });
  });
  if (style.length) {
    console.log(`  문체 검사 — 본문에 추적 코드나 줄표가 남은 문서 ${style.length}개 (관련 자료 절·질문 표식·코드 블록은 제외):`);
    for (const d of style.slice(0, 12)) {
      console.log(`    - ${d.path}: 추적 코드 ${d.codes}${d.sample.length ? ` (${d.sample.join(", ")})` : ""} · 줄표 ${d.dashes}`);
    }
    if (style.length > 12) console.log(`    … 외 ${style.length - 12}개`);
  }

  // 임베드 다이어그램도 근거 코드와 대조한다 — 문서는 최신인데 그림만 낡는 경우를 잡는다
  if (existsSync(join(root, "specs"))) {
    try {
      const out = execFileSync(process.execPath, [BUILD_DOCS, root, "--status"], { stdio: "pipe" }).toString().trimEnd();
      console.log(out.split("\n").map((l) => "  " + l).join("\n"));
    } catch (e) {
      console.log(`  ⚠ 다이어그램 근거 대조 실패: ${(e.stderr?.toString() || e.message).split("\n")[0]}`);
    }
  }
}

/* =========================================================================
 * 5. 빌드
 * ========================================================================= */

function loadManifest(root) {
  const p = join(root, "manifest.json");
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

/**
 * 임베드 창 비율: 그림의 가로세로 비율을 따르되, 뷰어의 제목·범례가 덮는 위아래 여백(140px)을 더한다.
 * 높이는 CSS가 320–720px로 묶는다 — 넓은 그림은 낮게, 키 큰 그림은 높게.
 */
function frameRatio(d) {
  if (!d || !d.size) return null;
  return `${d.size.width} / ${d.size.height + 140}`;
}

function diagramIframe(slug, manifest) {
  const d = manifest.diagrams.find((x) => x.slug === slug);
  const title = d ? d.title : slug;
  const ratio = frameRatio(d);
  return `<figure class="dgm${ratio ? " sized" : ""}"${ratio ? ` style="--dgm-ratio:${ratio}"` : ""}><iframe src="diagrams/${esc(slug)}.html" title="${esc(title)}" loading="lazy"></iframe>` +
    `<figcaption><span>${esc(title)}</span><a href="diagrams/${esc(slug)}.html" target="_blank" rel="noopener">크게 보기 ↗</a></figcaption></figure>`;
}

function build(root, wiki) {
  // 1) 다이어그램 위임 빌드 (specs가 있으면) — build-docs가 wiki.json을 보고 index.html은 건너뛴다
  const specsDir = join(root, "specs");
  if (existsSync(specsDir) && readdirSync(specsDir).some((f) => f.endsWith(".json"))) {
    try {
      const out = execFileSync(process.execPath, [BUILD_DOCS, root], { stdio: "pipe" }).toString();
      process.stdout.write(out.split("\n").map((l) => (l ? "  [다이어그램] " + l : l)).join("\n") + "\n");
    } catch (e) {
      const out = (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
      console.error("  [다이어그램] 일부 실패 — 계속 진행:\n" + out.trim().split("\n").map((l) => "    " + l).join("\n"));
    }
  }

  const manifest = loadManifest(root);
  const manifestSlugs = manifest ? new Set(manifest.diagrams.map((d) => d.slug)) : null;

  // 2) 검증 (manifest 반영 후)
  const errs = validateWiki(wiki, manifestSlugs);
  if (errs.length) {
    console.error(`wiki.json 검증 실패 (${errs.length}건):`);
    for (const e of errs) console.error("  - " + e);
    process.exit(1);
  }

  // 3) 문서 렌더 + 해시 동기화 + 사람 수정 감지
  const now = new Date().toISOString();
  const humanEdited = [];
  const warnings = [];
  const docErrors = [];

  // 섹션 code는 "포함된 섹션" 기준 00부터 연속 순번 — 제외 섹션의 카탈로그 번호를 비워두지 않는다
  wiki.sections.forEach((s, i) => {
    const want = String(i).padStart(2, "0");
    if (s.code !== want) warnings.push(`sections[${i}].code '${s.code}' — 연속 순번 '${want}' 권장 (제외 섹션 번호는 재부여, doc-catalog.md 인스턴스화 절차 6)`);
  });

  walkDocs(wiki, (n, path) => {
    if (!n.file) { n.html = null; return; }
    const abs = join(root, n.file);
    if (!existsSync(abs)) { docErrors.push(`${path}: 파일이 없다 — ${n.file}`); return; }
    const raw = readFileSync(abs, "utf8");
    const cur = sha256File(abs);
    if (n.hash && n.hash !== cur) humanEdited.push(path);

    const { html, diagrams, questions } = renderMarkdown(raw);
    let rendered = html;
    for (const slug of diagrams) {
      if (!manifestSlugs || !manifestSlugs.has(slug)) {
        docErrors.push(`${path}: @diagram(${slug}) — manifest에 없다. 사용 가능: ${manifestSlugs ? [...manifestSlugs].join(", ") : "(manifest 없음)"}`);
        continue;
      }
      // 큰 그림이 있는 세부 그림은 큰 그림을 먼저 보여 준다 (문서가 큰 그림을 따로 넣었으면 그대로)
      const ov = `${slug}-overview`;
      const withOverview = manifestSlugs.has(ov) && !diagrams.includes(ov);
      rendered = rendered.split(`${DGM}${slug}\u0000`).join((withOverview ? diagramIframe(ov, manifest) : "") + diagramIframe(slug, manifest));
    }
    // 본문에 남은 q 마커가 대장에 없는 경우 경고 (역방향 — 마커 소멸은 --status가 담당)
    const ledger = new Set(wiki.questions.map((q) => q.id));
    for (const qid of questions) if (!ledger.has(qid)) warnings.push(`${path}: 본문 마커 '${qid}'가 질문 대장에 없다`);

    n.html = rendered;
    n.hash = cur;
    n.syncedAt = now;
  });

  if (docErrors.length) {
    console.error(`문서 빌드 실패 (${docErrors.length}건):`);
    for (const e of docErrors) console.error("  - " + e);
    process.exit(1);
  }
  for (const w of warnings) console.log("  ⚠ " + w);

  if (humanEdited.length) {
    wiki.history.push({ ts: now, actor: "human", action: "edited", docs: humanEdited, note: "사람이 직접 고친 문서를 빌드에서 확인했다" });
    console.log(`  ✎ 사람 수정 감지 ${humanEdited.length}건: ${humanEdited.join(", ")} (해시 동기화됨 — 내용은 건드리지 않음)`);
  }

  // 4) 페이로드 구성
  const stats = { todo: 0, draft: 0, done: 0, na: 0 };
  walkDocs(wiki, (n) => { stats[n.status]++; });
  const toPayloadNode = (n, parentPath) => {
    const path = `${parentPath}/${n.slug}`;
    return {
      slug: n.slug, path, title: n.title, summary: n.summary || "",
      tier: n.tier ?? 2, status: n.status, naReason: n.naReason || null,
      html: n.html || null, diagrams: n.diagrams || [], questions: n.questions || [],
      children: (n.children || []).map((c) => toPayloadNode(c, path)),
    };
  };
  const payload = {
    title: wiki.title,
    tier: wiki.tier,
    projectMode: wiki.interview?.projectMode || "existing",
    generatedAt: now,
    stats,
    sections: wiki.sections.map((s) => ({
      code: s.code, id: s.id, title: s.title, purpose: s.purpose || "",
      items: s.items.map((n) => toPayloadNode(n, s.id)),
    })),
    questions: wiki.questions,
    history: wiki.history.slice(-50).reverse(),
    excluded: wiki.interview?.excludedSections || [],
  };

  // 5) index.html + wiki.json 쓰기
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const html = TEMPLATE
    .replace(/__TITLE__/g, esc(wiki.title))
    .replace("__DATA__", () => json);
  // 다이어그램 뷰어와 같은 글꼴(Pretendard 서브셋) — bun이 없으면 OS 글꼴
  writeFileSync(join(root, "index.html"), html.replace("/*__FONT__*/", () => fontFaceCss(html)));

  // html 필드는 wiki.json에 저장하지 않는다 (파생물)
  walkDocs(wiki, (n) => { delete n.html; });
  wiki.updatedAt = now;
  if (wiki.history.length > HISTORY_CAP) wiki.history = wiki.history.slice(-HISTORY_CAP);
  writeFileSync(join(root, "wiki.json"), JSON.stringify(wiki, null, 2) + "\n");

  const total = stats.todo + stats.draft + stats.done;
  console.log(`위키 생성 완료: ${join(root, "index.html")}`);
  console.log(`  문서 ${total}개 (완료 ${stats.done} · 초안 ${stats.draft} · 예정 ${stats.todo} · 해당없음 ${stats.na})` +
    ` · 열린 질문 ${wiki.questions.filter((q) => q.status === "open").length}건` +
    (manifest ? ` · 다이어그램 ${manifest.diagrams.length}개` : ""));
}

/* =========================================================================
 * 6. 위키 셸 (CSS/JS 인라인 — 의존성 0). 색·글꼴·모서리·폭 구간은 zzon-doc/scripts/design-tokens.mjs
 * ========================================================================= */

/** 공용 토큰 → 셸 변수 이름 (통합 문서 셸과 같은 이름) */
const SHELL_TOKENS = {
  bg: "--bg", fg: "--fg", card: "--card", muted: "--muted", "muted-fg": "--muted-fg",
  border: "--border", ring: "--ring", accent: "--primary", "accent-fg": "--primary-fg",
  ok: "--ok", warn: "--warn", shadow: "--shadow", "shadow-lg": "--shadow-lg",
};

const WIKI_CSS = `
*{box-sizing:border-box}
${themeCss(SHELL_TOKENS, { light: ":root", dark: 'html[data-theme="dark"]' })}
:root{--accent:var(--muted);--accent-fg:var(--fg);--idle:#a1a1aa;--radius:${RADIUS.lg};--side-w:280px}
html[data-theme="dark"]{--idle:#71717a}
html,body{margin:0;height:100%}
body{display:flex;background:var(--bg);color:var(--fg);
  font:14px/1.6 ${FONT_STACK};
  -webkit-font-smoothing:antialiased;overflow:hidden}
a{color:inherit;text-decoration:none}
.ic{width:16px;height:16px;flex:0 0 auto;vertical-align:middle}

#side{width:var(--side-w);flex:0 0 var(--side-w);height:100vh;height:100dvh;overflow-y:auto;border-right:1px solid var(--border);
  background:var(--card);display:flex;flex-direction:column;transition:margin-left .18s ease,transform .2s ease}
.s-head{padding:18px 18px 12px}
.s-head .t{font-size:14px;font-weight:600;letter-spacing:-.01em}
.s-head .s{font-size:12px;color:var(--muted-fg);margin-top:2px}
.nav{padding:6px 10px 28px;flex:1}
.navhome{display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border-radius:${RADIUS.md};
  font:inherit;font-size:13.5px;font-weight:500;color:var(--fg);background:none;border:0;cursor:pointer;text-align:left}
.navhome:hover{background:var(--accent)}
.navhome.active{background:var(--accent);font-weight:600}
.grp{margin-top:6px}
.grp-h{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border-radius:${RADIUS.md};
  font:inherit;font-size:12.5px;font-weight:600;color:var(--muted-fg);background:none;border:0;cursor:pointer;text-align:left}
.grp-h:hover{background:var(--accent);color:var(--fg)}
.grp-h .chev{margin-left:auto;transition:transform .15s}
.grp.collapsed .grp-h .chev{transform:rotate(-90deg)}
.grp-items{display:flex;flex-direction:column;gap:1px;padding:2px 0 4px 10px;margin-left:8px;border-left:1px solid var(--border)}
.grp.collapsed .grp-items{display:none}
.navlink{display:flex;align-items:center;gap:7px;padding:6px 10px;border-radius:${RADIUS.md};font-size:13px;color:var(--muted-fg);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.navlink:hover{background:var(--accent);color:var(--fg)}
.navlink.active{background:var(--accent);color:var(--accent-fg);font-weight:600}
.navlink.lv2{padding-left:24px;font-size:12.5px}
.navlink.lv3{padding-left:38px;font-size:12.5px}
.navlink .dot{width:7px;height:7px;border-radius:99px;flex:0 0 auto}
.navlink.na{text-decoration:line-through;opacity:.55}
/* 자식 있는 문서 노드 — 접이식 서브트리 */
.nrow{display:flex;align-items:center;gap:2px}
.nrow .navlink{flex:1;min-width:0}
.ntog{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;
  border:0;background:none;color:var(--muted-fg);cursor:pointer;border-radius:${RADIUS.sm};padding:0}
.ntog:hover{background:var(--accent);color:var(--fg)}
.ntog .ic{width:13px;height:13px;transition:transform .15s;transform:rotate(90deg)}
.nsub.collapsed>.nrow .ntog .ic{transform:none}
.nsub .nkids{display:flex;flex-direction:column;gap:1px}
.nsub.collapsed>.nkids{display:none}
.dot.done{background:var(--ok)} .dot.draft{background:var(--warn)}
.dot.todo{background:transparent;border:1.5px solid var(--idle)} .dot.na{background:var(--idle)}
#scrim{display:none}

#main{flex:1;height:100vh;height:100dvh;display:flex;flex-direction:column;min-width:0}
#top{display:flex;align-items:center;gap:10px;padding:0 16px;height:56px;flex:0 0 56px;
  border-bottom:1px solid var(--border);background:var(--card)}
#crumb{display:flex;align-items:center;gap:7px;min-width:0;font-size:13px;color:var(--muted-fg)}
#crumb .sep{opacity:.5}
#crumb b{color:var(--fg);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp{flex:1}
.iconbtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:${CONTROL.bar};padding:0 11px;flex:0 0 auto;
  border:1px solid var(--border);border-radius:${RADIUS.md};background:var(--card);color:var(--fg);
  font:inherit;font-size:13px;font-weight:500;cursor:pointer}
.iconbtn:hover{background:var(--accent)}
.iconbtn.sq{width:${CONTROL.bar};padding:0}
#stage{flex:1;min-height:0;overflow-y:auto}
.page{max-width:1240px;margin:0 auto;padding:32px 40px 80px} /* 네비가 접히면 같이 넓어진다 */

.badge{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border:1px solid var(--border);
  border-radius:999px;font-size:11.5px;font-weight:600;color:var(--muted-fg);background:var(--card);white-space:nowrap}
.badge.done{color:var(--ok);border-color:color-mix(in oklab,var(--ok) 35%,transparent)}
.badge.draft{color:var(--warn);border-color:color-mix(in oklab,var(--warn) 40%,transparent)}
.badge.na{opacity:.7}
.pagehead .meta{font-size:12.5px;color:var(--muted-fg);margin-bottom:10px}
.pagehead h1{margin:0 0 8px;font-size:26px;font-weight:650;letter-spacing:-.02em;overflow-wrap:break-word}
.pagehead .sum{color:var(--muted-fg);margin:0 0 14px}
.pagehead .why{font-size:12.5px;color:var(--muted-fg);margin-left:6px}
.pagehead{border-bottom:1px solid var(--border);padding-bottom:18px;margin-bottom:22px}

.prose{font-size:14.5px;overflow-wrap:break-word;word-break:keep-all}
html[data-theme="dark"] .prose{color:#e4e4e7} /* 검정 위 순백 본문은 굵어 보인다 */
.prose h2{font-size:19px;font-weight:650;letter-spacing:-.01em;margin:30px 0 10px}
.prose h3{font-size:16px;font-weight:600;margin:24px 0 8px}
.prose h4{font-size:14px;font-weight:600;margin:18px 0 6px}
.prose p{margin:0 0 12px}
.prose ul,.prose ol{margin:0 0 12px;padding-left:22px}
.prose li{margin:3px 0}
.prose code{background:var(--muted);border:1px solid var(--border);border-radius:5px;padding:1px 5px;
  font:12.5px ${MONO_STACK}}
.prose pre{background:var(--muted);border:1px solid var(--border);border-radius:${RADIUS.md};padding:14px 16px;
  overflow-x:auto;margin:0 0 14px}
.prose pre code{background:none;border:0;padding:0;font-size:12.5px;line-height:1.55}
.prose blockquote{border-left:3px solid var(--border);margin:0 0 12px;padding:6px 14px;color:var(--muted-fg)}
.prose blockquote.callout-q{border-left-color:var(--warn);background:color-mix(in oklab,var(--warn) 7%,transparent);
  border-radius:0 ${RADIUS.md} ${RADIUS.md} 0;color:var(--fg)}
.prose .qlabel{display:inline-block;margin-right:6px;padding:0 7px;border-radius:999px;font-size:11.5px;font-weight:600;
  color:var(--warn);border:1px solid color-mix(in oklab,var(--warn) 40%,transparent)}
.prose .tbl{overflow-x:auto;margin:0 0 14px;-webkit-overflow-scrolling:touch}
.prose table{border-collapse:collapse;width:100%;font-size:13px}
.prose th,.prose td{border:1px solid var(--border);padding:7px 11px;text-align:left}
.prose th{background:var(--muted);font-weight:600;white-space:nowrap}
.prose td code{white-space:nowrap}
.prose hr{border:0;border-top:1px solid var(--border);margin:22px 0}
.prose a{color:inherit;text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--ring)}
.dgm{margin:6px 0 18px;transition:width .2s ease,margin-left .2s ease}
.dgm iframe{width:100%;height:440px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);
  transition:height .2s ease}
.dgm figcaption{display:flex;justify-content:space-between;gap:10px;margin-top:6px;font-size:12px;color:var(--muted-fg)}
.dgm figcaption a:hover{color:var(--fg)}
/* 다이어그램 상세가 열리면 figure를 화면 크기로 넓힌다 (왼쪽 메뉴는 자동으로 접힌다) */
.dgm{scroll-margin-top:14px}
.dgm.expanded{width:min(96vw,1720px);margin-left:calc((100% - min(96vw,1720px))/2)}
.dgm.expanded iframe{height:calc(100vh - 118px);height:calc(100dvh - 118px)}
/* 그림 크기를 아는 임베드는 그림 비율대로 — 넓으면 낮게, 키가 크면 높게 (320–720px) */
.dgm.sized:not(.expanded) iframe{height:auto;aspect-ratio:var(--dgm-ratio);min-height:320px;max-height:720px}
/* 글처럼 흐르는 그림(와이어프레임·토큰 시각판)은 스스로 높이를 알려 온다(zzon:height) — 스크롤 없이 본문처럼 펼친다 */
.dgm.fit iframe{transition:none}

.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:12px;margin-top:14px}
.card{display:flex;flex-direction:column;gap:6px;border:1px solid var(--border);border-radius:var(--radius);min-width:0;
  background:var(--card);padding:15px 16px;box-shadow:var(--shadow);transition:border-color .15s}
.card:hover{border-color:var(--ring)}
.card .t{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
.card .s{font-size:12.5px;color:var(--muted-fg)}
.qlist{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.qitem{border:1px solid var(--border);border-radius:${RADIUS.md};padding:10px 13px;font-size:13px;background:var(--card)}
.qitem.answered{opacity:.65}
.qitem .qdoc{display:inline-block;margin-top:3px;font-size:12.5px;color:var(--muted-fg);text-decoration:underline;text-underline-offset:3px}
.qitem .ans{color:var(--muted-fg);font-size:12.5px;margin-top:3px}
.hist{margin-top:12px;font-size:12.5px;color:var(--muted-fg);display:flex;flex-direction:column;gap:6px}
.hist .row{display:flex;gap:10px}
.hist .ts{flex:0 0 auto;font-variant-numeric:tabular-nums;opacity:.8}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 4px}
.stat{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border:1px solid var(--border);
  border-radius:${RADIUS.md};background:var(--card);font-size:12.5px;font-weight:500;color:var(--muted-fg)}
.stat b{color:var(--fg)}
.pbar{height:7px;border-radius:99px;background:var(--muted);overflow:hidden;margin-top:9px}
.pbar>div{height:100%;background:var(--ok)}
.secrow{border:1px solid var(--border);border-radius:var(--radius);background:var(--card);padding:15px 17px;margin-top:10px;display:block}
.secrow:hover{border-color:var(--ring)}
.secrow .t{display:flex;align-items:baseline;gap:9px;font-weight:600}
.secrow .t .pct{margin-left:auto;font-size:12px;color:var(--muted-fg);font-weight:500;white-space:nowrap}
.hero h1{margin:0 0 6px;font-size:24px;font-weight:650;letter-spacing:-.02em}
.hero p{margin:0;color:var(--muted-fg)}
.hero .herolink{color:var(--fg);text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--ring);white-space:nowrap}
.h2{margin:32px 0 4px;font-size:13px;font-weight:600;color:var(--muted-fg)}
.secdesc{margin:2px 0 12px;font-size:13px;color:var(--muted-fg)}
.card.faded{opacity:.6}
.card.faded:hover{opacity:1}
.empty{color:var(--muted-fg);font-size:13px;padding:10px 0}

/* 넓은 화면: 메뉴 접기 */
@media(min-width:${BREAKPOINT.drawer + 1}px){
  body.side-collapsed #side{margin-left:calc(-1 * var(--side-w))}
}
/* 태블릿·휴대폰: 메뉴는 본문을 덮는 서랍 */
@media(max-width:${BREAKPOINT.drawer}px){
  #side{position:fixed;left:0;top:0;bottom:0;z-index:40;width:min(var(--side-w),86vw);box-shadow:var(--shadow-lg);transform:translateX(-102%)}
  body.nav-open #side{transform:none}
  body.nav-open #scrim{display:block;position:fixed;inset:0;z-index:35;background:rgba(0,0,0,.4)}
  .page{padding:28px 28px 64px}
}
@media(max-width:${BREAKPOINT.narrow}px){
  #top{padding:0 10px;gap:6px;height:52px;flex-basis:52px}
  #crumb a,#crumb .sep,#crumb span:not(.sep){display:none}
  .page{padding:22px 16px 56px}
  .hero h1,.pagehead h1{font-size:21px}
  .prose{font-size:14px}
  .dgm iframe{height:380px}
  .prose td{min-width:6.5em}
  .dgm.sized:not(.expanded) iframe{max-height:70vh;min-height:min(440px,70vh)}
}
@media(prefers-reduced-motion:reduce){#side,.dgm,.dgm iframe,.grp-h .chev,.ntog .ic{transition:none}}
`;

const WIKI_JS = `
var W = JSON.parse(document.getElementById("zzon-wiki-data").textContent);
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function ic(d){return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+d+'</svg>';}
var IC={
  home:'<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  chev:'<path d="m9 18 6-6-6-6"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  file:'<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8l6 6v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/>',
  chart:'<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>'
};
var STATUS_KO={todo:"작성 예정",draft:"초안",done:"완료",na:"해당 없음"};

// 평탄 색인
var byPath={}, flat=[];
W.sections.forEach(function(s){
  (function walk(nodes,depth){nodes.forEach(function(n){n._section=s;n._depth=depth;byPath[n.path]=n;flat.push(n);if(n.children)walk(n.children,depth+1);});})(s.items,0);
});
function secStats(s){var st={todo:0,draft:0,done:0,na:0};(function walk(ns){ns.forEach(function(n){st[n.status]++;if(n.children)walk(n.children);});})(s.items);return st;}
function pct(st){var t=st.done+st.draft+st.todo;return t?Math.round(st.done/t*100):0;}

// 사이드바
document.getElementById("doctitle").textContent=W.title;
document.getElementById("docsub").textContent="개발 문서";
var nav=document.getElementById("nav");
var h='<button class="navhome" data-home>'+ic(IC.home)+'<span>개요</span></button>'
  +'<button class="navhome" data-progress>'+ic(IC.chart)+'<span>진행 현황</span></button>';
W.sections.forEach(function(s,idx){
  h+='<div class="grp" data-grp="'+idx+'"><button class="grp-h"><span>'+esc(s.title)+'</span><span class="chev">'+ic(IC.chev)+'</span></button><div class="grp-items">';
  (function walk(nodes,depth){nodes.forEach(function(n){
    var link='<a class="navlink lv'+depth+(n.status==="na"?" na":"")+'" data-path="'+esc(n.path)+'" href="#/'+esc(n.path)+'"><span class="dot '+n.status+'"></span><span style="overflow:hidden;text-overflow:ellipsis">'+esc(n.title)+'</span></a>';
    if(n.children&&n.children.length){
      h+='<div class="nsub collapsed"><div class="nrow">'+link+'<button class="ntog" title="하위 문서 펼치기/접기">'+ic(IC.chev)+'</button></div><div class="nkids">';
      walk(n.children,depth+1);
      h+='</div></div>';
    }else{
      h+=link;
    }
  });})(s.items,1);
  h+='</div></div>';
});
nav.innerHTML=h;
nav.querySelector("[data-home]").onclick=function(){location.hash="";closeNav();};
nav.querySelector("[data-progress]").onclick=function(){location.hash="#/_progress";closeNav();};
nav.addEventListener("click",function(e){if(e.target.closest&&e.target.closest(".navlink"))closeNav();});
// 태블릿·휴대폰 폭에서는 왼쪽 메뉴가 서랍이다
var drawerMQ=matchMedia("(max-width:${BREAKPOINT.drawer}px)");
function isDrawer(){return drawerMQ.matches;}
function closeNav(){document.body.classList.remove("nav-open");}
document.getElementById("scrim").onclick=closeNav;
addEventListener("keydown",function(e){if(e.key==="Escape")closeNav();});
(drawerMQ.addEventListener?drawerMQ.addEventListener.bind(drawerMQ,"change"):drawerMQ.addListener.bind(drawerMQ))(function(){closeNav();});
[].forEach.call(nav.querySelectorAll(".grp-h"),function(b){b.onclick=function(){b.parentNode.classList.toggle("collapsed");};});
[].forEach.call(nav.querySelectorAll(".ntog"),function(b){b.onclick=function(e){e.preventDefault();b.closest(".nsub").classList.toggle("collapsed");};});

function badge(st){return '<span class="badge '+st+'">'+STATUS_KO[st]+'</span>';}
function qhtml(q){
  var d=q.doc&&byPath[q.doc];
  return '<div class="qitem'+(q.status==="answered"?" answered":"")+'"><div>'+esc(q.text)+'</div>'
    +(d?'<a class="qdoc" href="#/'+esc(q.doc)+'">'+esc(d.title)+'</a>':"")
    +(q.answer?'<div class="ans">답: '+esc(q.answer)+'</div>':"")+'</div>';
}

// 개요 (홈) — 문서가 주인공: 섹션 소개 + 문서 카드
function renderOverview(){
  var st=W.stats,total=st.done+st.draft+st.todo;
  var open=W.questions.filter(function(q){return q.status==="open";});
  var h='<div class="hero"><h1>'+esc(W.title)+'</h1><p>'
    +(total?'문서 '+total+'개 중 '+st.done+'개를 마쳤다. ':'')
    +(open.length?'확인이 필요한 질문이 '+open.length+'건 있다. ':'')
    +'<a href="#/_progress" class="herolink">진행 현황 보기</a></p></div>';
  W.sections.forEach(function(s){
    var hasVisible=false;
    (function chk(ns){ns.forEach(function(n){if(n.status!=="na")hasVisible=true;if(n.children)chk(n.children);});})(s.items);
    if(!hasVisible)return;
    h+='<div class="h2">'+esc(s.title)+'</div>';
    if(s.purpose)h+='<p class="secdesc">'+esc(s.purpose)+'</p>';
    h+='<div class="cards">';
    (function walk(ns){ns.forEach(function(n){
      if(n.status!=="na"){
        h+='<a class="card'+(n.status==="todo"?" faded":"")+'" href="#/'+esc(n.path)+'"><span class="t">'+ic(IC.file)+esc(n.title)+'</span><span class="s">'+esc(n.summary||"")+'</span><span>'+badge(n.status)+'</span></a>';
      }
      if(n.children)walk(n.children);
    });})(s.items);
    h+='</div>';
  });
  return h;
}

// 진행 현황 (#/_progress)
function renderProgress(){
  var st=W.stats,total=st.done+st.draft+st.todo;
  var open=W.questions.filter(function(q){return q.status==="open";});
  var h='<div class="hero"><h1>진행 현황</h1><p>'+(total?'문서 '+total+'개 중 '+st.done+'개를 마쳤다. ':'')+'마지막 빌드 '+esc((W.generatedAt||"").slice(0,10))+'</p></div>';
  h+='<div class="stats"><span class="stat">완료 <b>'+st.done+'</b></span><span class="stat">초안 <b>'+st.draft+'</b></span><span class="stat">예정 <b>'+st.todo+'</b></span><span class="stat">해당 없음 <b>'+st.na+'</b></span><span class="stat">열린 질문 <b>'+open.length+'</b></span></div>';
  h+='<div class="h2">섹션별 진행</div>';
  W.sections.forEach(function(s){
    var ss=secStats(s),p=pct(ss);
    h+='<a class="secrow" href="#/'+esc(s.items.length?s.items[0].path:"")+'"><div class="t"><span>'+esc(s.title)+'</span><span class="pct">'+((ss.done+ss.draft+ss.todo)?(ss.done+ss.draft+ss.todo)+'개 중 '+ss.done+'개 완료':'해당 없음')+'</span></div><div class="pbar"><div style="width:'+p+'%"></div></div></a>';
  });
  if(W.excluded&&W.excluded.length){
    h+='<div class="h2">제외된 섹션</div>';
    W.excluded.forEach(function(x){h+='<div class="empty">'+esc(x.reason||x.title||x.id)+'</div>';});
  }
  h+='<div class="h2">열린 질문</div><div class="qlist">'+(open.length?open.map(qhtml).join(""):'<div class="empty">열린 질문이 없다.</div>')+'</div>';
  h+='<div class="h2">최근 이력</div><div class="hist">'+W.history.slice(0,12).map(function(e){
    var docs=(e.docs||[]).map(function(p){return byPath[p]?byPath[p].title:p;}).join(", ");
    return '<div class="row"><span class="ts">'+esc((e.ts||"").slice(0,10))+'</span><span>'+esc(e.note||docs)+'</span></div>';
  }).join("")+'</div>';
  return h;
}

// 문서 페이지
function renderDoc(n){
  var s=n._section;
  var h='<div class="pagehead"><div class="meta">'+esc(s.title)+'</div>';
  h+='<h1>'+esc(n.title)+'</h1>';
  if(n.summary)h+='<p class="sum">'+esc(n.summary)+'</p>';
  h+=badge(n.status);
  if(n.status==="na"&&n.naReason)h+='<span class="why">'+esc(n.naReason)+'</span>';
  h+='</div>';
  if(n.html){h+='<div class="prose">'+n.html+'</div>';}
  else if(n.status==="todo"){h+='<div class="empty">아직 본문이 없다. 위키 스킬을 다시 실행하면 이어서 채운다.</div>';}
  else if(n.status==="na"){h+='<div class="empty">이 문서는 이 프로젝트에 해당하지 않는다.</div>';}
  var oq=W.questions.filter(function(q){return q.doc===n.path&&q.status==="open";});
  if(oq.length){h+='<div class="h2">이 문서의 열린 질문</div><div class="qlist">'+oq.map(qhtml).join("")+'</div>';}
  if(n.children&&n.children.length){
    h+='<div class="h2">하위 문서</div><div class="cards">';
    n.children.forEach(function(c){
      h+='<a class="card" href="#/'+esc(c.path)+'"><span class="t">'+ic(IC.file)+esc(c.title)+'</span><span class="s">'+esc(c.summary||"")+'</span><span>'+badge(c.status)+'</span></a>';
    });
    h+='</div>';
  }
  return h;
}

// 라우팅
var stage=document.getElementById("stage"),crumb=document.getElementById("crumb");
function setActive(path){
  [].forEach.call(document.querySelectorAll(".navlink"),function(a){
    var on=a.dataset.path===path;
    a.classList.toggle("active",on);
    if(on){ // 활성 문서의 조상 서브트리를 펼친다 (직접 URL 진입·드릴다운 대비)
      var p=a.parentNode;
      while(p&&p!==nav){if(p.classList&&p.classList.contains("nsub"))p.classList.remove("collapsed");p=p.parentNode;}
    }
  });
  document.querySelector("[data-home]").classList.toggle("active",!path);
  document.querySelector("[data-progress]").classList.toggle("active",path==="_progress");
}
function render(){
  var path=decodeURIComponent((location.hash||"").replace(/^#\\/?/,""));
  var n=path&&byPath[path];
  restoreSide(); // 문서를 바꾸면 다이어그램 iframe이 사라지므로 좌측 네비 복원
  if(path==="_progress"){
    stage.innerHTML='<div class="page">'+renderProgress()+'</div>';
    crumb.innerHTML='<a href="#">개요</a><span class="sep">/</span><b>진행 현황</b>';
    setActive("_progress");document.title="진행 현황 · "+W.title;
  }else if(n){
    stage.innerHTML='<div class="page">'+renderDoc(n)+'</div>';
    crumb.innerHTML='<a href="#">개요</a><span class="sep">/</span><span>'+esc(n._section.title)+'</span><span class="sep">/</span><b>'+esc(n.title)+'</b>';
    setActive(path);document.title=n.title+" · "+W.title;
  }else{
    stage.innerHTML='<div class="page">'+renderOverview()+'</div>';
    crumb.innerHTML='<b>개요</b>';
    setActive(null);document.title=W.title;
  }
  stage.scrollTop=0;
}
addEventListener("hashchange",render);render();

// 다이어그램 iframe 메시지: 드릴다운(zzon:navigate) + 우측 상세 사이드바(zzon:sidebar) 연동
// 사이드바가 열리면 그 figure를 확장하고 좌측 네비를 자동으로 접는다. 닫히면 복원.
var autoCollapsed=false,sideOpenCount=0;
function dgmFrames(){return [].slice.call(document.querySelectorAll(".dgm iframe"));}
function restoreSide(){sideOpenCount=0;if(autoCollapsed){document.body.classList.remove("side-collapsed");autoCollapsed=false;}}
addEventListener("message",function(e){
  var d=e.data;
  if(!d)return;
  if(d.type==="zzon:navigate"&&typeof d.slug==="string"){
    var hit=null;
    flat.some(function(n){if((n.diagrams||[]).indexOf(d.slug)!==-1){hit=n;return true;}return false;});
    if(hit)location.hash="#/"+encodeURIComponent(hit.path).replace(/%2F/g,"/");
    return;
  }
  if(d.type==="zzon:height"&&typeof d.height==="number"){
    var hf=dgmFrames().filter(function(f){return f.contentWindow===e.source;})[0];
    if(!hf)return;
    var hfig=hf.closest(".dgm");
    if(hfig)hfig.classList.add("fit");
    hf.style.height=Math.max(120,Math.min(20000,Math.ceil(d.height)+(hf.offsetHeight-hf.clientHeight)))+"px"; // 테두리만큼 더해 안쪽 스크롤바를 없앤다
    return;
  }
  if(d.type==="zzon:sidebar"){
    var frame=dgmFrames().filter(function(f){return f.contentWindow===e.source;})[0];
    if(!frame)return;
    var fig=frame.closest(".dgm");
    if(d.open){
      sideOpenCount++;
      if(fig){fig.classList.add("expanded");try{fig.scrollIntoView({block:"start"});}catch(err){}}
      if(isDrawer()){closeNav();return;}
      if(!document.body.classList.contains("side-collapsed")){document.body.classList.add("side-collapsed");autoCollapsed=true;}
    }else{
      sideOpenCount=Math.max(0,sideOpenCount-1);
      if(fig)fig.classList.remove("expanded");
      if(sideOpenCount===0)restoreSide();
    }
  }
});

// 사이드바 접기 / 테마 — 좌측 네비를 다시 열면 모든 다이어그램의 우측 사이드바를 닫는다
document.getElementById("sidetoggle").onclick=function(){
  if(isDrawer()){
    var open=document.body.classList.toggle("nav-open");
    if(open){sideOpenCount=0;dgmFrames().forEach(function(f){try{f.contentWindow&&f.contentWindow.postMessage({type:"zzon:sidebar-close"},"*");}catch(err){}});}
    return;
  }
  var opening=document.body.classList.contains("side-collapsed");
  document.body.classList.toggle("side-collapsed");
  autoCollapsed=false;
  if(opening){sideOpenCount=0;dgmFrames().forEach(function(f){try{f.contentWindow&&f.contentWindow.postMessage({type:"zzon:sidebar-close"},"*");}catch(err){}});}
};
var root=document.documentElement;
try{var t=localStorage.getItem("zzon-theme");if(t)root.dataset.theme=t;}catch(e){}
function paintTheme(){document.getElementById("themeic").innerHTML=ic(root.dataset.theme==="dark"?IC.sun:IC.moon);}
paintTheme();
document.getElementById("theme").onclick=function(){
  root.dataset.theme=root.dataset.theme==="dark"?"light":"dark";
  try{localStorage.setItem("zzon-theme",root.dataset.theme);}catch(e){}
  paintTheme();
};
`;

const TEMPLATE = `<!doctype html>
<html lang="ko" data-theme="light">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>__TITLE__</title>
<style>/*__FONT__*/
${WIKI_CSS}</style>
</head>
<body>
<aside id="side">
  <div class="s-head">
    <div class="t" id="doctitle">개발 문서</div>
    <div class="s" id="docsub">zzon-wiki</div>
  </div>
  <nav class="nav" id="nav"></nav>
</aside>
<div id="scrim"></div>
<main id="main">
  <header id="top">
    <button id="sidetoggle" class="iconbtn sq" title="메뉴" aria-label="메뉴"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg></button>
    <div id="crumb"></div>
    <div class="sp"></div>
    <button id="theme" class="iconbtn sq" title="다크/라이트"><span id="themeic"></span></button>
  </header>
  <div id="stage"></div>
</main>
<script id="zzon-wiki-data" type="application/json">__DATA__</script>
<script>${WIKI_JS}</script>
</body>
</html>
`;

/* =========================================================================
 * 7. main
 * ========================================================================= */

function usage() {
  console.log(`zzon-wiki build — wiki.json + docs/*.md → self-contained 위키 index.html

사용법:
  node build-wiki.mjs <docsDir>            빌드 (다이어그램은 build-docs에 위임)
  node build-wiki.mjs <docsDir> --status   상태 리포트만 (쓰기 없음)

<docsDir>에 wiki.json이 있어야 한다. 스키마는 references/wiki-spec.md 참조.`);
}

function main() {
  const args = process.argv.slice(2);
  let docsDir = null, statusMode = false;
  for (const a of args) {
    if (a === "--status") statusMode = true;
    else if (a === "-h" || a === "--help") { usage(); process.exit(0); }
    else if (!docsDir) docsDir = a;
  }
  if (!docsDir) { usage(); process.exit(1); }
  const root = resolve(docsDir);
  const wikiPath = join(root, "wiki.json");
  if (!existsSync(wikiPath)) {
    console.error(`wiki.json이 없다: ${wikiPath}\n  → zzon-wiki 스킬로 초기화하거나 references/sample-wiki.json을 참고해 만들어라.`);
    process.exit(1);
  }
  let wiki;
  try { wiki = JSON.parse(readFileSync(wikiPath, "utf8")); }
  catch (e) { console.error(`wiki.json 파싱 실패 — ${e.message}`); process.exit(1); }

  if (statusMode) {
    const manifest = loadManifest(root);
    const errs = validateWiki(wiki, manifest ? new Set(manifest.diagrams.map((d) => d.slug)) : null);
    if (errs.length) {
      console.error(`wiki.json 검증 실패 (${errs.length}건):`);
      for (const e of errs) console.error("  - " + e);
      process.exit(1);
    }
    statusReport(root, wiki);
    return;
  }
  build(root, wiki);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
