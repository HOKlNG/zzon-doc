#!/usr/bin/env node
/**
 * build-docs.mjs — 여러 DiagramSpec을 모아 "문서 사이트" 하나로 묶는다.
 *
 * <docsDir>/specs/*.json 을 전부 render.mjs(엔진)로 렌더해
 * <docsDir>/diagrams/<slug>.html 로 떨군 뒤,
 * 좌측 메뉴(접기) + 전체보기(홈) + 뷰어가 들어있는 self-contained <docsDir>/index.html 을 생성한다.
 *
 *   사용법:  node build-docs.mjs <docsDir> [--title "문서 제목"]
 *   예:      node build-docs.mjs ./zzon-doc --title "데모숍 아키텍처 문서"
 *
 * 규칙(소유자 표준):
 * - 라이브러리/프레임워크/CDN 0. 순수 HTML/CSS/바닐라 JS + Node 내장만. 출력도 self-contained.
 * - render.mjs(검증된 엔진)는 손대지 않고 자식 프로세스로만 호출한다.
 * - 디자인은 shadcn 풍(중립 팔레트·옅은 보더/그림자·여백)을 CSS로만 흉내. 아이콘은 엔진과 같은 lucide만 인라인.
 * - 각 다이어그램은 독립 .html 그대로 두고 iframe으로 끼워 보여준다(전체화면 지원).
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { basename, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const RENDER = join(HERE, "render.mjs");
// kind:"sequence" 스펙은 형제 스킬 zzon-seq의 렌더러로 위임한다
const RENDER_SEQ = join(HERE, "..", "..", "zzon-seq", "scripts", "render-seq.mjs");

/* ── CLI ─────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const a = argv.slice(2);
  let docsDir = null;
  let title = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--title") title = a[++i];
    else if (a[i] === "-h" || a[i] === "--help") return { help: true };
    else if (!docsDir) docsDir = a[i];
  }
  return { docsDir, title };
}

function usage() {
  console.log(`zzon-doc build-docs — 여러 다이어그램을 문서 사이트 하나로 묶는다

사용법:
  node build-docs.mjs <docsDir> [--title "문서 제목"]

구조(<docsDir> 기준):
  specs/*.json   입력 — DiagramSpec JSON 들을 여기에 둔다 (파일명이 메뉴 slug)
  diagrams/      출력 — render.mjs가 만든 개별 .html
  index.html     출력 — 통합 메뉴 + 전체보기 + 뷰어 (이 파일을 브라우저로 연다)
  manifest.json  출력 — 생성된 카탈로그

메뉴 그룹: spec.section 이 있으면 그걸로, 없으면 kind(infra/data-flow/erd/agent-topology)로 묶는다.`);
}

/* ── 스펙 로딩 ───────────────────────────────────────────────────────── */

const KIND_ORDER = ["infra", "data-flow", "sequence", "erd", "agent-topology"];

function loadSpec(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return raw && raw.spec ? raw.spec : raw; // { spec: {...} } 래퍼 허용
}

/* ── 메인 ────────────────────────────────────────────────────────────── */

function main() {
  const { docsDir, title, help } = parseArgs(process.argv);
  if (help || !docsDir) {
    usage();
    process.exit(help ? 0 : 1);
  }

  const root = resolve(docsDir);
  const specsDir = join(root, "specs");
  const outDir = join(root, "diagrams");

  if (!existsSync(specsDir)) {
    console.error(`스펙 폴더가 없다: ${specsDir}\n  → 거기에 DiagramSpec JSON들을 넣고 다시 실행해라.`);
    process.exit(1);
  }
  const specFiles = readdirSync(specsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (specFiles.length === 0) {
    console.error(`${specsDir} 에 *.json 이 없다.`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });

  const diagrams = [];
  const failures = [];

  for (const file of specFiles) {
    const specPath = join(specsDir, file);
    const slug = basename(file, ".json");
    const outHtml = join(outDir, `${slug}.html`);
    let spec;
    try {
      spec = loadSpec(specPath);
    } catch (e) {
      failures.push({ slug, msg: `JSON 파싱 실패: ${e.message}` });
      continue;
    }
    const isSeq = spec.kind === "sequence";
    if (isSeq && !existsSync(RENDER_SEQ)) {
      failures.push({ slug, msg: `kind:"sequence" 스펙인데 zzon-seq 스킬이 없다: ${RENDER_SEQ}` });
      continue;
    }
    try {
      execFileSync(process.execPath, [isSeq ? RENDER_SEQ : RENDER, specPath, "-o", outHtml], { stdio: "pipe" });
    } catch (e) {
      const out = (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
      failures.push({ slug, msg: out.trim() || e.message });
      continue;
    }
    const counts = isSeq
      ? (() => {
          const msgs = (spec.steps || []).filter((s) => s && s.type === "message").length;
          const frags = (spec.steps || []).filter((s) => s && s.type === "fragment").length;
          return {
            nodes: (spec.actors || []).length, edges: msgs, flows: 0, groups: frags,
            actors: (spec.actors || []).length, messages: msgs,
          };
        })()
      : {
          nodes: Array.isArray(spec.nodes) ? spec.nodes.length : 0,
          edges: Array.isArray(spec.edges) ? spec.edges.length : 0,
          flows: Array.isArray(spec.flows) ? spec.flows.length : 0,
          groups: Array.isArray(spec.groups) ? spec.groups.length : 0,
        };
    diagrams.push({
      slug,
      title: spec.title || slug,
      kind: spec.kind || "infra",
      section: typeof spec.section === "string" ? spec.section : null,
      order: typeof spec.order === "number" ? spec.order : null,
      summary: spec.description || "",
      file: `diagrams/${slug}.html`,
      counts,
    });
  }

  diagrams.sort((a, b) => {
    const ka = KIND_ORDER.indexOf(a.kind), kb = KIND_ORDER.indexOf(b.kind);
    if (ka !== kb) return (ka < 0 ? 99 : ka) - (kb < 0 ? 99 : kb);
    const oa = a.order ?? 1e9, ob = b.order ?? 1e9;
    if (oa !== ob) return oa - ob;
    return a.title.localeCompare(b.title, "ko");
  });

  const manifest = { title: title || "아키텍처 문서", diagrams };

  writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  // wiki.json이 있으면 index.html은 build-wiki(zzon-wiki 스킬) 소유 — 덮어쓰지 않는다.
  const wikiOwned = existsSync(join(root, "wiki.json"));
  if (wikiOwned) {
    console.log(`다이어그램 갱신 완료 (index.html은 위키 소유라 건너뜀)`);
    console.log(`  위키 갱신: node <플러그인>/skills/zzon-wiki/scripts/build-wiki.mjs ${docsDir}`);
  } else {
    writeFileSync(join(root, "index.html"), buildIndexHtml(manifest));
    console.log(`문서 생성 완료: ${join(root, "index.html")}`);
  }

  const total = diagrams.reduce((a, d) => a + d.counts.nodes, 0);
  console.log(`  다이어그램 ${diagrams.length}개 · 총 노드 ${total}개`);
  if (failures.length) {
    console.log(`\n⚠ 렌더 실패 ${failures.length}건 (인덱스에서 제외됨):`);
    for (const f of failures) console.log(`  - ${f.slug}\n    ${f.msg.replace(/\n/g, "\n    ")}`);
    process.exitCode = 1;
  }
}

/* ── index.html 생성 ─────────────────────────────────────────────────── */

function buildIndexHtml(manifest) {
  const json = JSON.stringify(manifest).replace(/</g, "\\u003c");
  return INDEX_TEMPLATE
    .replace(/__TITLE__/g, escapeHtml(manifest.title))
    .replace("__MANIFEST__", json);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

/* ── 셸 템플릿 (CSS/JS 인라인, 의존성 0, shadcn 풍) ──────────────────── */

const INDEX_CSS = `
*{box-sizing:border-box}
:root{
  --bg:#ffffff; --fg:#09090b; --card:#ffffff; --muted:#f4f4f5; --muted-fg:#71717a;
  --border:#e4e4e7; --accent:#f4f4f5; --accent-fg:#18181b; --ring:#a1a1aa;
  --radius:10px; --shadow:0 1px 2px rgba(0,0,0,.04),0 1px 3px rgba(0,0,0,.06);
}
html[data-theme="dark"]{
  --bg:#09090b; --fg:#fafafa; --card:#0f0f11; --muted:#1c1c1f; --muted-fg:#a1a1aa;
  --border:#27272a; --accent:#1c1c1f; --accent-fg:#fafafa; --ring:#52525b;
  --shadow:0 1px 2px rgba(0,0,0,.4);
}
html,body{margin:0;height:100%}
body{display:flex;background:var(--bg);color:var(--fg);
  font:14px/1.5 "Inter",ui-sans-serif,system-ui,-apple-system,"Apple SD Gothic Neo",Pretendard,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.ic{width:16px;height:16px;flex:0 0 auto;vertical-align:middle}

/* 사이드바 */
#side{width:256px;flex:0 0 256px;height:100vh;overflow-y:auto;border-right:1px solid var(--border);
  background:var(--card);display:flex;flex-direction:column;transition:margin-left .18s ease}
body.side-collapsed #side{margin-left:-256px}
.s-head{padding:18px 18px 14px}
.s-head .t{font-size:14px;font-weight:600;letter-spacing:-.01em}
.s-head .s{font-size:12px;color:var(--muted-fg);margin-top:2px}
.nav{padding:6px 10px 28px;flex:1}
.navhome{display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border-radius:8px;
  font-size:13.5px;font-weight:500;color:var(--fg);background:none;border:0;cursor:pointer;text-align:left}
.navhome:hover{background:var(--accent)}
.navhome.active{background:var(--accent);color:var(--accent-fg);font-weight:600}
.grp{margin-top:6px}
.grp-h{display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border-radius:8px;
  font-size:12px;font-weight:600;color:var(--muted-fg);background:none;border:0;cursor:pointer;
  text-transform:uppercase;letter-spacing:.04em}
.grp-h:hover{background:var(--accent);color:var(--fg)}
.grp-h .cnt{margin-left:auto;font-size:11px;font-weight:600;color:var(--muted-fg)}
.grp-h .chev{transition:transform .15s;color:var(--muted-fg)}
.grp.collapsed .grp-h .chev{transform:rotate(-90deg)}
.grp-items{display:flex;flex-direction:column;gap:1px;padding:2px 0 4px 12px;margin-left:6px;border-left:1px solid var(--border)}
.grp.collapsed .grp-items{display:none}
.navlink{display:block;padding:6.5px 10px;border-radius:7px;font-size:13px;color:var(--muted-fg);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.navlink:hover{background:var(--accent);color:var(--fg)}
.navlink.active{background:var(--accent);color:var(--accent-fg);font-weight:600}

/* 본문 */
#main{flex:1;height:100vh;display:flex;flex-direction:column;min-width:0}
#top{display:flex;align-items:center;gap:10px;padding:0 16px;height:56px;flex:0 0 56px;
  border-bottom:1px solid var(--border);background:var(--card)}
#crumb{display:flex;align-items:center;gap:7px;min-width:0;font-size:13px;color:var(--muted-fg)}
#crumb .sep{opacity:.5}
#crumb b{color:var(--fg);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp{flex:1}
.iconbtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 11px;
  border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--fg);
  font-size:13px;font-weight:500;cursor:pointer}
.iconbtn:hover{background:var(--accent)}
.iconbtn.sq{width:34px;padding:0}
#stage{flex:1;min-height:0;position:relative;background:var(--bg)}
#frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:var(--bg);display:none}
#home{position:absolute;inset:0;overflow-y:auto;padding:30px 34px 56px;display:none}
#home.show{display:block}#frame.show{display:block}
#stage:fullscreen{background:var(--bg)}

/* 홈(전체보기) */
.hero h1{margin:0 0 8px;font-size:25px;font-weight:650;letter-spacing:-.02em}
.hero p{margin:0;color:var(--muted-fg);font-size:14px}
.stats{display:flex;flex-wrap:wrap;gap:7px;margin:18px 0 6px}
.stat{display:inline-flex;align-items:center;gap:7px;padding:5px 11px;border:1px solid var(--border);
  border-radius:8px;background:var(--card);font-size:12.5px;font-weight:500;color:var(--muted-fg)}
.stat b{color:var(--fg);font-weight:600}
.grouphead{display:flex;align-items:center;gap:8px;margin:30px 0 13px;font-size:12px;font-weight:600;
  color:var(--muted-fg);text-transform:uppercase;letter-spacing:.05em}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(288px,1fr));gap:14px}
.card{display:flex;flex-direction:column;border:1px solid var(--border);border-radius:var(--radius);
  background:var(--card);padding:18px;box-shadow:var(--shadow);cursor:pointer;
  transition:border-color .15s,box-shadow .15s}
.card:hover{border-color:var(--ring)}
.kbadge{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;font-size:11.5px;font-weight:600;
  padding:3px 8px;border:1px solid var(--border);border-radius:7px;color:var(--muted-fg)}
.kbadge .ic{width:13px;height:13px}
.card h3{margin:13px 0 6px;font-size:15px;font-weight:600;letter-spacing:-.01em}
.card .sum{color:var(--muted-fg);font-size:13px;margin:0 0 14px;flex:1}
.card .meta{display:flex;gap:10px;color:var(--muted-fg);font-size:11.5px;font-weight:500;
  border-top:1px solid var(--border);padding-top:11px}
.empty{color:var(--muted-fg);padding:48px 0}
@media(max-width:760px){#side{position:absolute;z-index:20;box-shadow:var(--shadow)}}
`;

const INDEX_JS = `
var M = JSON.parse(document.getElementById("zzon-manifest").textContent);
var IC = {
  chevron:'<path d="m9 18 6-6-6-6"/>',
  panel:'<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  max:'<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  ext:'<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  Server:'<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  Webhook:'<path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/>',
  Database:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  Bot:'<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  Seq:'<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>'
};
function ic(n){return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+(IC[n]||"")+'</svg>';}
var KINDS = {
  "infra":{label:"인프라",icon:"Server"},
  "data-flow":{label:"데이터 흐름",icon:"Webhook"},
  "sequence":{label:"시퀀스",icon:"Seq"},
  "erd":{label:"ERD",icon:"Database"},
  "agent-topology":{label:"에이전트 구조",icon:"Bot"}
};
function kmeta(k){return KINDS[k]||{label:k,icon:"Server"};}
var bySlug={}; M.diagrams.forEach(function(d){bySlug[d.slug]=d;});
function gkey(d){return d.section||kmeta(d.kind).label;}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}

// 그룹 빌드 (정렬 순서 유지)
var groups=[],gi={};
M.diagrams.forEach(function(d){var k=gkey(d);if(!(k in gi)){gi[k]=groups.length;groups.push({key:k,kind:d.kind,items:[]});}groups[gi[k]].items.push(d);});

// 사이드바
document.getElementById("doctitle").textContent=M.title;
var nav=document.getElementById("nav");
var html='<button class="navhome" data-home>'+ic("panel")+'<span>전체보기</span></button>';
groups.forEach(function(g,idx){
  html+='<div class="grp" data-grp="'+idx+'"><button class="grp-h">'+ic(kmeta(g.kind).icon)+'<span>'+esc(g.key)+'</span><span class="cnt">'+g.items.length+'</span><span class="chev">'+ic("chevron").replace("ic\\"","ic\\" style=\\"width:14px;height:14px\\"")+'</span></button><div class="grp-items">';
  g.items.forEach(function(d){html+='<a class="navlink" data-slug="'+esc(d.slug)+'" href="#'+encodeURIComponent(d.slug)+'">'+esc(d.title)+'</a>';});
  html+='</div></div>';
});
nav.innerHTML=html;
nav.querySelector("[data-home]").onclick=function(){location.hash="";};
[].forEach.call(nav.querySelectorAll(".grp-h"),function(b){b.onclick=function(){b.parentNode.classList.toggle("collapsed");};});

// 홈(전체보기)
function kbadge(kind){var m=kmeta(kind);return '<span class="kbadge">'+ic(m.icon)+esc(m.label)+'</span>';}
function metaLine(c){
  if(c.actors!=null){var q=['<span>액터 '+c.actors+'</span>','<span>메시지 '+c.messages+'</span>'];if(c.groups)q.push('<span>프래그먼트 '+c.groups+'</span>');return q.join("");}
  var p=['<span>노드 '+c.nodes+'</span>'];if(c.edges)p.push('<span>엣지 '+c.edges+'</span>');if(c.groups)p.push('<span>그룹 '+c.groups+'</span>');if(c.flows)p.push('<span>플로우 '+c.flows+'</span>');return p.join("");}
function buildHome(){
  var byKind={};M.diagrams.forEach(function(d){byKind[d.kind]=(byKind[d.kind]||0)+1;});
  var h='<div class="hero"><h1>'+esc(M.title)+'</h1><p>'+M.diagrams.length+'개의 아키텍처를 한 곳에서 본다. 왼쪽 메뉴나 아래 카드에서 고른다.</p></div>';
  h+='<div class="stats">';
  ["infra","data-flow","sequence","erd","agent-topology"].forEach(function(k){if(!byKind[k])return;var m=kmeta(k);h+='<span class="stat">'+ic(m.icon)+esc(m.label)+' <b>'+byKind[k]+'</b></span>';});
  h+='</div>';
  if(!M.diagrams.length){h+='<div class="empty">아직 다이어그램이 없다. specs/ 에 스펙을 넣고 다시 빌드한다.</div>';}
  groups.forEach(function(g){
    h+='<div class="grouphead">'+ic(kmeta(g.kind).icon)+esc(g.key)+'</div><div class="grid">';
    g.items.forEach(function(d){
      h+='<a class="card" href="#'+encodeURIComponent(d.slug)+'">'+kbadge(d.kind)+'<h3>'+esc(d.title)+'</h3><div class="sum">'+esc(d.summary)+'</div><div class="meta">'+metaLine(d.counts)+'</div></a>';
    });
    h+='</div>';
  });
  document.getElementById("home").innerHTML=h;
}
buildHome();

// 라우팅
var frame=document.getElementById("frame"),home=document.getElementById("home");
var crumb=document.getElementById("crumb"),openTab=document.getElementById("opentab");
function setActive(slug){
  [].forEach.call(document.querySelectorAll(".navlink"),function(a){a.classList.toggle("active",a.dataset.slug===slug);});
  document.querySelector("[data-home]").classList.toggle("active",!slug);
}
function render(){
  var slug=decodeURIComponent((location.hash||"").replace(/^#/,""));
  var d=slug&&bySlug[slug];
  restoreSide(); // 장을 바꾸면 iframe 사이드바가 사라지므로 좌측 메뉴를 되살린다
  if(d){
    frame.src=d.file;frame.classList.add("show");home.classList.remove("show");
    crumb.innerHTML='<a href="#">전체보기</a><span class="sep">/</span>'+kbadge(d.kind)+'<span class="sep">/</span><b>'+esc(d.title)+'</b>';
    openTab.style.display="";openTab.href=d.file;
    setActive(slug);document.title=d.title+" · "+M.title;
  }else{
    frame.classList.remove("show");frame.removeAttribute("src");home.classList.add("show");
    crumb.innerHTML='<b>전체보기</b>';openTab.style.display="none";
    setActive(null);document.title=M.title;
  }
}
addEventListener("hashchange",render);render();

// 다이어그램 iframe 메시지: 드릴다운 이동 + 우측 상세 사이드바 ↔ 좌측 메뉴 상호 배타
var autoCollapsed=false; // 우측 사이드바 때문에 "자동으로" 접었는지 (사용자가 접은 것과 구분)
function restoreSide(){if(autoCollapsed){document.body.classList.remove("side-collapsed");autoCollapsed=false;}}
addEventListener("message",function(e){
  var d=e.data;
  if(!d)return;
  if(d.type==="zzon:navigate"&&typeof d.slug==="string"&&bySlug[d.slug]){
    location.hash="#"+encodeURIComponent(d.slug);
  }
  if(d.type==="zzon:sidebar"&&e.source===frame.contentWindow){
    if(d.open&&!document.body.classList.contains("side-collapsed")){
      document.body.classList.add("side-collapsed");autoCollapsed=true;
    }else if(!d.open){restoreSide();}
  }
});

// 사이드바 접기 / 전체화면 / 테마 — 좌측 메뉴를 다시 열면 iframe의 우측 사이드바를 닫는다
document.getElementById("sidetoggle").onclick=function(){
  var opening=document.body.classList.contains("side-collapsed");
  document.body.classList.toggle("side-collapsed");
  autoCollapsed=false;
  if(opening){try{frame.contentWindow&&frame.contentWindow.postMessage({type:"zzon:sidebar-close"},"*");}catch(err){}}
};
document.getElementById("fs").onclick=function(){
  var s=document.getElementById("stage");
  if(!document.fullscreenElement){(s.requestFullscreen||s.webkitRequestFullscreen||function(){}).call(s);}
  else{document.exitFullscreen();}
};
var root=document.documentElement;
try{var t=localStorage.getItem("zzon-theme");if(t)root.dataset.theme=t;}catch(e){}
function paintTheme(){document.getElementById("themeic").innerHTML=ic(root.dataset.theme==="dark"?"sun":"moon");}
paintTheme();
document.getElementById("theme").onclick=function(){
  root.dataset.theme=root.dataset.theme==="dark"?"light":"dark";
  try{localStorage.setItem("zzon-theme",root.dataset.theme);}catch(e){}
  paintTheme();
};
`;

const INDEX_TEMPLATE = `<!doctype html>
<html lang="ko" data-theme="light">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>__TITLE__</title>
<style>${INDEX_CSS}</style>
</head>
<body>
<aside id="side">
  <div class="s-head">
    <div class="t" id="doctitle">아키텍처 문서</div>
    <div class="s">zzon-doc · 통합 보기</div>
  </div>
  <nav class="nav" id="nav"></nav>
</aside>
<main id="main">
  <header id="top">
    <button id="sidetoggle" class="iconbtn sq" title="사이드바 접기"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg></button>
    <div id="crumb"></div>
    <div class="sp"></div>
    <a id="opentab" class="iconbtn" target="_blank" rel="noopener" style="display:none"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>새 탭</a>
    <button id="fs" class="iconbtn sq" title="전체화면"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg></button>
    <button id="theme" class="iconbtn sq" title="다크/라이트"><span id="themeic"></span></button>
  </header>
  <div id="stage">
    <div id="home"></div>
    <iframe id="frame" title="diagram" allow="fullscreen"></iframe>
  </div>
</main>
<script id="zzon-manifest" type="application/json">__MANIFEST__</script>
<script>${INDEX_JS}</script>
</body>
</html>
`;

main();
