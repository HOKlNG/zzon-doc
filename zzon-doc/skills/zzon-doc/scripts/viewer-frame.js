/**
 * viewer-frame.js — 뷰어 프레임(크롬) 단일 모듈
 *
 * 계약: skills/zzon-doc/references/viewer-frame-contract.md (v1)
 *   - 프레임은 payload(계약 §1)만 읽고, 캔버스는 adapter(계약 §2)로만 대화한다.
 *   - 캔버스 내부 상수·모델 임포트 금지(§8) — 이 파일은 어떤 것도 import하지 않는다.
 *   - 크롬 언어는 한국어, 시각 스타일은 레거시 render.mjs(shadcn 풍 토큰)를 정본으로 한다.
 *
 * Node 20 ESM · zero deps.
 *
 * export:
 *   buildViewerHtml({ payload, canvas }) => string   // 자기완결 HTML
 *     payload: 계약 §1 JSON 객체
 *     canvas:  { markup, css, js } — js는 반드시 window.__zzonFrame.register({...adapter}) 호출
 *   FRAME_GLYPHS: string  // 크롬 전체 문구(라벨·버튼·단위 포함) — 엔진 폰트 서브셋 입력(§3)
 */

/* =========================================================================
 * 1. 크롬 문자열 (전부 여기 — 빌드타임 크롬과 런타임이 같은 표를 쓴다)
 * ========================================================================= */

const STR = {
  kindInfra: "인프라",
  kindDataFlow: "데이터 흐름",
  kindErd: "ERD",
  kindAgentTopology: "에이전트 구조",
  fit: "화면 맞춤",
  reset: "보기 초기화",
  labelAlways: "라벨 항상 표시 (줌아웃해도 유지)",
  exportSvg: "SVG로 내보내기 (벡터 — 문서·Figma에 그대로)",
  exportPng: "PNG로 내보내기 (2배 해상도)",
  themeToggle: "테마 전환",
  svg: "SVG",
  png: "PNG",
  legend: "범례",
  close: "닫기",
  columns: "컬럼",
  connections: "연결",
  steps: "단계",
  detailPrefix: "상세 보기: ",
  tagFk: "FK",
  tagUq: "UQ",
  tagNullable: "N",
  dirOut: "→",
  dirIn: "←",
  nodesLabel: "노드",
  edgesLabel: "엣지",
  groupsLabel: "그룹",
  flowsLabel: "플로우",
  countUnit: "개",
  warnMorePrefix: " 외 ",
  warnMoreSuffix: "건",
  fkArrow: "FK → ",
  badHref: "지원하지 않는 href 형식:",
  noExportAsset: "내보낼 자산이 없습니다:",
  adapterFail: "어댑터 호출 실패:",
  needAdapter: "register()에는 어댑터 객체가 필요합니다",
};

/** 크롬 전체 문구 + 숫자·구두점(카운트/순번/범례 마커) — 문자 중복 제거. */
export const FRAME_GLYPHS = (() => {
  const extra = "0123456789 ,.:;%()[]·—×+-/→←▸▾…";
  const seen = new Set();
  let out = "";
  for (const ch of Object.values(STR).join("") + extra) {
    if (!seen.has(ch)) { seen.add(ch); out += ch; }
  }
  return out;
})();

const KIND_META = {
  "infra": { label: STR.kindInfra, icon: "Server" },
  "data-flow": { label: STR.kindDataFlow, icon: "Webhook" },
  "erd": { label: STR.kindErd, icon: "Database" },
  "agent-topology": { label: STR.kindAgentTopology, icon: "Bot" },
};

/* 크롬 전용 아이콘 (lucide 24px 패스, 레거시 render.mjs와 동일 도형) */
const FRAME_ICONS = {
  Server: '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  Webhook: '<path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/>',
  Database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  Bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  Route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  Maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  RotateCcw: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  Tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  Sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  Moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
  X: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  ZoomIn: '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>',
  KeyRound: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
};

/* =========================================================================
 * 2. 이스케이프 유틸
 * ========================================================================= */

function escHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escAttr(v) {
  return escHtml(v).replace(/\r?\n/g, "&#10;");
}
/** <script> 안에 넣어도 안전한 JSON (</script> 브레이크아웃·U+2028/29 차단). */
function safeJson(v) {
  return JSON.stringify(v === undefined ? null : v)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/* =========================================================================
 * 3. 프레임 CSS — --frame-* 토큰, 라이트 + 다크([data-theme] 정본, prefers 폴백)
 * ========================================================================= */

const LIGHT_VARS =
  "--frame-bg:#ffffff;--frame-fg:#0a0a0a;--frame-card:#ffffff;--frame-card-fg:#0a0a0a;" +
  "--frame-muted:#f4f4f5;--frame-muted-fg:#71717a;--frame-border:#e4e4e7;--frame-ring:#a1a1aa;" +
  "--frame-accent:#4f46e5;--frame-warn-fg:#b45309;--frame-warn-bg:rgba(245,158,11,.1);" +
  "--frame-warn-border:rgba(245,158,11,.5);--frame-fk:#0284c7;--frame-pk:#f59e0b;";

const DARK_VARS =
  "--frame-bg:#0a0a0a;--frame-fg:#fafafa;--frame-card:#171717;--frame-card-fg:#fafafa;" +
  "--frame-muted:#262626;--frame-muted-fg:#a1a1aa;--frame-border:#2a2a2a;--frame-ring:#52525b;" +
  "--frame-accent:#818cf8;--frame-warn-fg:#fbbf24;--frame-warn-bg:rgba(245,158,11,.12);" +
  "--frame-warn-border:rgba(245,158,11,.45);--frame-fk:#38bdf8;--frame-pk:#fbbf24;";

const FRAME_CSS = `/* ---- frame tokens ---- */
:root{${LIGHT_VARS}}
:root[data-theme="dark"]{${DARK_VARS}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${DARK_VARS}}}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font-family:Pretendard,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;background:var(--frame-bg);color:var(--frame-fg);-webkit-font-smoothing:antialiased}
#frame-root{position:fixed;inset:0;overflow:hidden}
.frame-viewport{position:absolute;inset:0;overflow:hidden;background-image:radial-gradient(color-mix(in oklab,var(--frame-border) 72%,transparent) 1px,transparent 1px);background-size:16px 16px}
.frame-icon{display:inline-flex;vertical-align:middle}
.frame-icon svg{display:block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.frame-ui{position:absolute;z-index:30}
.frame-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;border-radius:6px;border:1px solid var(--frame-border);background:var(--frame-card);color:var(--frame-fg);font:inherit;font-size:12px;font-weight:500;cursor:pointer;padding:0 10px;height:28px;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:background .12s,color .12s,border-color .12s}
.frame-btn:hover{background:var(--frame-muted)}
.frame-btn.icon{width:28px;height:28px;padding:0}
.frame-btn.mini{width:28px;height:22px;padding:0;font-size:9px;font-weight:700;letter-spacing:.02em}
.frame-btn.active{border-color:transparent;color:#fff;background:var(--frame-accent)}
.frame-btn.active:hover{background:var(--frame-accent);filter:brightness(1.05)}
.frame-titlebar{left:12px;top:12px;display:flex;align-items:center;gap:8px;max-width:64%;border-radius:8px;border:1px solid var(--frame-border);background:color-mix(in oklab,var(--frame-card) 95%,transparent);padding:5px 10px;box-shadow:0 1px 2px rgba(0,0,0,.05);backdrop-filter:blur(6px)}
.frame-kind-chip{display:inline-flex;align-items:center;gap:4px;flex-shrink:0;border-radius:6px;border:1px solid var(--frame-border);background:var(--frame-muted);padding:1px 7px;font-size:10px;font-weight:600;color:var(--frame-muted-fg)}
.frame-title-text{font-size:12.5px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.frame-flowcol{left:12px;top:52px;display:flex;flex-direction:column;align-items:flex-start;gap:8px;max-width:60%}
.frame-flowsel{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.frame-flowsel .frame-route{color:var(--frame-muted-fg)}
.frame-stepstrip{display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:5px 8px;border-radius:9999px;border:1px solid var(--frame-border);background:color-mix(in oklab,var(--frame-card) 95%,transparent);box-shadow:0 1px 2px rgba(0,0,0,.05);backdrop-filter:blur(6px)}
.frame-stepchip{width:22px;height:22px;border-radius:9999px;border:2px solid var(--frame-bg);cursor:pointer;padding:0;font:inherit;font-size:10px;font-weight:700;color:#fff;background:var(--frame-accent);display:inline-flex;align-items:center;justify-content:center;opacity:.78;transition:opacity .12s,box-shadow .12s,transform .12s}
.frame-stepchip:hover{opacity:1}
.frame-stepchip.active{opacity:1;transform:scale(1.1);box-shadow:0 0 0 3px color-mix(in oklab,var(--frame-accent) 30%,transparent)}
.frame-toolbar{right:12px;top:12px;display:flex;flex-direction:column;gap:4px;transition:right .2s ease}
#frame-root.side-open .frame-toolbar{right:320px}
.frame-extras{display:contents}
.frame-warn{left:12px;top:52px}
.frame-warn .chip{display:inline-block;border:1px solid var(--frame-warn-border);background:var(--frame-warn-bg);color:var(--frame-warn-fg);border-radius:6px;padding:2px 8px;font-size:11px}
.frame-legend{bottom:12px;left:12px;max-width:60%;border-radius:8px;border:1px solid var(--frame-border);background:color-mix(in oklab,var(--frame-card) 95%,transparent);padding:6px 12px;box-shadow:0 1px 3px rgba(0,0,0,.06);backdrop-filter:blur(6px)}
.frame-legend summary{list-style:none;cursor:pointer;user-select:none;font-size:11px;font-weight:600;color:var(--frame-muted-fg)}
.frame-legend summary::-webkit-details-marker{display:none}
.frame-legend summary::before{content:"▸";display:inline-block;margin-right:4px}
.frame-legend[open] summary::before{content:"▾"}
.frame-legend-items{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding-top:6px}
.frame-legend .item{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--frame-muted-fg)}
.frame-legend .sep{width:1px;height:12px;background:var(--frame-border)}
.frame-legend .sw{flex-shrink:0}
.frame-legend .sw.dot{width:8px;height:8px;border-radius:9999px;display:inline-block}
.frame-side{position:absolute;z-index:40;top:0;right:0;bottom:0;width:304px;display:flex;flex-direction:column;border-left:1px solid var(--frame-border);background:color-mix(in oklab,var(--frame-card) 96%,transparent);backdrop-filter:blur(10px);box-shadow:-10px 0 30px rgba(0,0,0,.1);transform:translateX(105%);transition:transform .2s ease}
.frame-side.open{transform:translateX(0)}
.frame-side-head{display:flex;align-items:flex-start;gap:10px;padding:14px;border-bottom:1px solid var(--frame-border)}
.frame-panel-title{font-size:14px;font-weight:600;line-height:1.2}
.frame-panel-sub{font-size:12px;color:var(--frame-muted-fg);margin-top:2px}
.frame-panel-close{margin-left:auto;flex-shrink:0}
.frame-side-body{flex:1;min-height:0;overflow-y:auto;padding:12px 14px 18px;font-size:12px;line-height:1.6;color:var(--frame-muted-fg)}
.frame-side-desc{margin:0 0 4px}
.frame-side-sec{margin:16px 0 6px;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:color-mix(in oklab,var(--frame-muted-fg) 80%,transparent)}
.frame-side-body > .frame-side-sec:first-child{margin-top:2px}
.frame-steplist{list-style:none;margin:0;padding:0}
.frame-steplist li{display:flex;gap:8px;font-size:12px;line-height:1.6;cursor:pointer;border-radius:7px;padding:4px 6px;margin:0 -6px 4px;transition:background 120ms}
.frame-steplist li:hover{background:var(--frame-muted)}
.frame-steplist li.active{background:color-mix(in oklab,var(--frame-accent) 16%,transparent)}
.frame-steplist li.active .frame-stepnum{box-shadow:0 0 0 3px color-mix(in oklab,var(--frame-accent) 30%,transparent)}
.frame-stepnum{flex-shrink:0;width:20px;height:20px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;background:var(--frame-accent);transition:box-shadow 120ms}
.frame-conn{display:flex;align-items:center;gap:7px;padding:5px 8px;margin:0 -8px;border-radius:7px;cursor:pointer;font-size:12px;color:var(--frame-fg)}
.frame-conn:hover{background:var(--frame-muted)}
.frame-conn .dir{flex-shrink:0;width:14px;text-align:center;font-weight:700;color:var(--frame-muted-fg)}
.frame-conn .lbl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.frame-conn .kind{margin-left:auto;flex-shrink:0;padding-left:8px;font-size:10px;color:var(--frame-muted-fg)}
.frame-side-col{display:flex;align-items:center;gap:6px;padding:3px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--frame-fg)}
.frame-side-col .pk-ic{flex-shrink:0;display:inline-flex}
.frame-side-col .t{margin-left:auto;padding-left:8px;font-size:10px;color:color-mix(in oklab,var(--frame-muted-fg) 80%,transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.frame-tags{display:flex;flex-shrink:0;gap:2px}
.frame-tag{border-radius:4px;border:1px solid var(--frame-border);padding:1px 4px;font-size:9px;font-weight:500;line-height:1;color:var(--frame-muted-fg)}
.frame-tag.fk{border-color:color-mix(in oklab,#0ea5e9 40%,transparent);background:color-mix(in oklab,#0ea5e9 10%,transparent);color:var(--frame-fk)}
.frame-href{border-top:1px solid var(--frame-border);padding:8px}
.frame-href a{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:28px;padding:4px 8px;border-radius:6px;font-size:12px;color:var(--frame-fg);text-decoration:none}
.frame-href a:hover{background:var(--frame-muted)}
#dg-tip{position:fixed;z-index:1000;left:0;top:0;pointer-events:none;opacity:0;max-width:260px;padding:6px 9px;border-radius:7px;font-size:11.5px;font-weight:500;line-height:1.45;white-space:pre-line;background:var(--frame-fg);color:var(--frame-bg);box-shadow:0 4px 16px rgba(0,0,0,.22);transition:opacity 120ms}
#dg-tip.show{opacity:1}
/* ---- 440px 위키 엠베드: 컴팩트 툴바(≤44px) ---- */
@media (max-height:460px){
.frame-toolbar{flex-direction:row;gap:4px}
#frame-root.side-open .frame-toolbar{right:316px}
.frame-btn{height:24px}
.frame-btn.icon{width:24px;height:24px}
.frame-btn.mini{width:auto;height:24px;padding:0 6px}
.frame-titlebar{max-width:46%}
.frame-legend{max-width:46%}
}
@media (prefers-reduced-motion:reduce){
.frame-side,.frame-toolbar,.frame-stepchip,.frame-btn,#dg-tip{transition:none}
}`;

/* =========================================================================
 * 4. 프레임 런타임 (브라우저) — 하이라이트 상태 머신·사이드바·셸 프로토콜·내보내기
 *    주의: 이 문자열 안에는 백틱/템플릿 보간/"</script" 를 쓰지 않는다.
 * ========================================================================= */

const FRAME_RUNTIME = String.raw`"use strict";
(function () {
  var P = window.__zzonFramePayload || {};
  var S = window.__zzonFrameStr || {};
  var I = window.__zzonFrameIcons || {};
  var doc = document;
  var rootHtml = doc.documentElement;
  var frameRoot = doc.getElementById("frame-root");
  var viewport = doc.getElementById("frame-viewport");
  var side = doc.getElementById("frame-side");
  var tipEl = doc.getElementById("dg-tip");
  var stripEl = doc.getElementById("frame-stepstrip");

  var nodes = P.nodes || [];
  var edges = P.edges || [];
  var flows = P.flows || [];
  var nodeByPath = {};
  for (var ni = 0; ni < nodes.length; ni++) nodeByPath[nodes[ni].path] = nodes[ni];
  function flowById(id) {
    for (var i = 0; i < flows.length; i++) if (flows[i].id === id) return flows[i];
    return null;
  }

  /* ---- DOM 유틸 ---- */
  function el(tag, cls, text) {
    var d = doc.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.appendChild(doc.createTextNode(String(text)));
    return d;
  }
  function icon(name, size, color) {
    var sp = el("span", "frame-icon");
    sp.setAttribute("aria-hidden", "true");
    sp.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' +
      size + '" height="' + size + '">' + (I[name] || "") + "</svg>";
    if (color) sp.style.color = color;
    return sp;
  }

  /* ---- 툴팁 싱글턴 (#dg-tip, §2) — data-tip 위임 + frame.tooltip(el, text) 유틸 ---- */
  function placeTip(e) {
    var r = tipEl.getBoundingClientRect();
    var x = e.clientX + 14, y = e.clientY + 16;
    if (x + r.width > window.innerWidth - 8) x = e.clientX - 14 - r.width;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - 12 - r.height;
    tipEl.style.left = Math.max(8, x) + "px";
    tipEl.style.top = Math.max(8, y) + "px";
  }
  function hideTip() { tipEl.classList.remove("show"); }
  function tooltip(target, text) {
    if (target && text != null && text !== "") target.setAttribute("data-tip", String(text));
    return target;
  }
  doc.addEventListener("mouseover", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
    if (!t) return;
    tipEl.textContent = t.getAttribute("data-tip") || "";
    tipEl.classList.add("show");
    placeTip(e);
  });
  doc.addEventListener("mousemove", function (e) {
    if (tipEl.classList.contains("show")) placeTip(e);
  });
  doc.addEventListener("mouseout", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
    if (t) hideTip();
  });

  /* ---- 셸 프로토콜 (§4): parent !== window 가드 — zzon:* 3종 외 금지 ---- */
  function postMsg(msg) {
    if (window.parent !== window) window.parent.postMessage(msg, "*");
  }

  /* ---- 테마 (§4, 정본 = seq 의미론): localStorage "zzon-theme" → <html data-theme>,
         부트 시 prefers-color-scheme 폴백, storage 이벤트로 형제 iframe 동기화 ---- */
  function currentTheme() {
    return rootHtml.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }
  function stampTheme(t) {
    rootHtml.setAttribute("data-theme", t === "dark" ? "dark" : "light");
    updateThemeBtn();
  }
  function bootTheme() {
    var t = null;
    try { t = localStorage.getItem("zzon-theme"); } catch (_) {}
    if (t !== "light" && t !== "dark") {
      t = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark" : "light";
    }
    stampTheme(t);
  }
  function toggleTheme() {
    var next = currentTheme() === "dark" ? "light" : "dark";
    try { localStorage.setItem("zzon-theme", next); } catch (_) {}
    stampTheme(next);
  }
  window.addEventListener("storage", function (e) {
    if (e.key === "zzon-theme" && (e.newValue === "light" || e.newValue === "dark")) {
      stampTheme(e.newValue);
    }
  });

  /* ---- 어댑터 + 하이라이트 상태 머신 (§2: 주인은 프레임, 우선순위 hover<select<flow<step) ---- */
  var adapter = null;
  var st = { hovered: null, selected: null, flowId: null, step: null };
  var labelMode = "auto";
  var sideOpen = false;
  function callAdapter(name) {
    if (!adapter || typeof adapter[name] !== "function") return null;
    try { return adapter[name].apply(adapter, Array.prototype.slice.call(arguments, 1)); }
    catch (err) { console.warn("[zzon-frame] " + S.adapterFail + " " + name, err); return null; }
  }
  function syncHighlight() {
    if (st.flowId && st.step != null) {
      callAdapter("highlight", "step", { flowId: st.flowId, step: st.step });
    } else if (st.flowId) {
      callAdapter("highlight", "flow", { flowId: st.flowId });
    } else if (st.selected) {
      callAdapter("highlight", "select", { path: st.selected });
    } else if (st.hovered) {
      callAdapter("highlight", "hover", { path: st.hovered });
    } else {
      callAdapter("highlight", "hover", null); /* target null = 해제 (§2) */
    }
  }

  /* ---- 우측 사이드바: 열림/닫힘 + canvasShift(±152) + zzon:sidebar 통지 ---- */
  function setSideOpen(open) {
    open = !!open;
    if (sideOpen === open) return;
    sideOpen = open;
    side.classList.toggle("open", open);
    frameRoot.classList.toggle("side-open", open);
    callAdapter("canvasShift", open ? -152 : 152);
    postMsg({ type: "zzon:sidebar", open: open });
  }
  function sideHead(title, sub, onClose) {
    var head = el("div", "frame-side-head");
    var txt = el("div");
    txt.appendChild(el("div", "frame-panel-title", title));
    if (sub) txt.appendChild(el("div", "frame-panel-sub", sub));
    head.appendChild(txt);
    var close = el("button", "frame-btn icon frame-panel-close");
    close.type = "button";
    close.setAttribute("aria-label", S.close);
    tooltip(close, S.close);
    close.appendChild(icon("X", 14));
    close.addEventListener("click", onClose);
    head.appendChild(close);
    return head;
  }
  /* 노드 패널 — payload.nodes + edges[].from/to 파생 연결 목록 (§1: 없는 endpoint는 건너뜀) */
  function renderNodeSide(node) {
    side.innerHTML = "";
    var sub = [node.category, node.tech].filter(Boolean).join(" · ");
    side.appendChild(sideHead(node.label || node.path, sub, function () {
      st.selected = null;
      setSideOpen(false);
      syncHighlight();
    }));
    var body = el("div", "frame-side-body");
    if (node.description) body.appendChild(el("p", "frame-side-desc", node.description));
    if (node.table && node.table.columns && node.table.columns.length) {
      body.appendChild(el("div", "frame-side-sec", S.columns + " " + node.table.columns.length));
      node.table.columns.forEach(function (c) {
        var row = el("div", "frame-side-col");
        if (c.pk) {
          var pk = el("span", "pk-ic");
          pk.appendChild(icon("KeyRound", 11, "var(--frame-pk)"));
          row.appendChild(pk);
        }
        row.appendChild(el("span", null, c.name));
        var tags = el("span", "frame-tags");
        if (c.fk) tags.appendChild(el("span", "frame-tag fk", S.tagFk));
        if (c.unique) tags.appendChild(el("span", "frame-tag", S.tagUq));
        if (c.nullable) tags.appendChild(el("span", "frame-tag", S.tagNullable));
        if (tags.childNodes.length) row.appendChild(tags);
        row.appendChild(el("span", "t", c.type || ""));
        if (c.fk && c.fk.table) tooltip(row, S.fkArrow + c.fk.table + "." + c.fk.column);
        body.appendChild(row);
      });
    }
    var rows = [];
    edges.forEach(function (e) {
      if (e.from !== node.path && e.to !== node.path) return;
      var outgoing = e.from === node.path;
      var other = nodeByPath[outgoing ? e.to : e.from];
      if (!other) return;
      rows.push({ edge: e, other: other, outgoing: outgoing });
    });
    if (rows.length) {
      body.appendChild(el("div", "frame-side-sec", S.connections + " " + rows.length));
      rows.forEach(function (r) {
        var row = el("div", "frame-conn");
        row.appendChild(el("span", "dir", r.outgoing ? S.dirOut : S.dirIn));
        row.appendChild(el("span", "lbl", r.other.label || r.other.path));
        row.appendChild(el("span", "kind", r.edge.label || ""));
        row.addEventListener("click", function () { selectNode(r.other.path); });
        body.appendChild(row);
      });
    }
    side.appendChild(body);
    if (node.href) {
      var wrap = el("div", "frame-href");
      var a = el("a");
      a.href = "#";
      a.title = node.href;
      a.appendChild(doc.createTextNode(S.detailPrefix + node.href));
      a.appendChild(icon("ZoomIn", 14));
      a.addEventListener("click", function (ev) { ev.preventDefault(); navigateHref(node.href); });
      wrap.appendChild(a);
      side.appendChild(wrap);
    }
    setSideOpen(true);
  }
  /* 플로우 패널 — 단계 목록 클릭 = 스텝 포커스 */
  function renderFlowSide(flow) {
    side.innerHTML = "";
    var steps = flow.steps || [];
    side.appendChild(sideHead(flow.title || flow.id, steps.length + S.steps, function () {
      setFlow(null);
    }));
    var body = el("div", "frame-side-body");
    if (flow.description) body.appendChild(el("p", "frame-side-desc", flow.description));
    body.appendChild(el("div", "frame-side-sec", S.steps));
    var ol = el("ol", "frame-steplist");
    steps.forEach(function (sp, i) {
      var n = sp.n != null ? sp.n : i + 1;
      var li = el("li");
      li.setAttribute("data-step", String(n));
      li.appendChild(el("span", "frame-stepnum", String(n)));
      li.appendChild(el("span", null, sp.text || ""));
      li.addEventListener("click", function () { setActiveStep(n); });
      ol.appendChild(li);
    });
    body.appendChild(ol);
    side.appendChild(body);
    setSideOpen(true);
  }

  /* ---- 플로우 버튼 / 순번 스트립 / 스텝 포커스 ---- */
  function renderStepStrip(flow) {
    if (!stripEl) return;
    stripEl.innerHTML = "";
    if (!flow) { stripEl.style.display = "none"; return; }
    stripEl.style.display = "";
    (flow.steps || []).forEach(function (sp, i) {
      var n = sp.n != null ? sp.n : i + 1;
      var b = el("button", "frame-stepchip", String(n));
      b.type = "button";
      b.setAttribute("data-step", String(n));
      tooltip(b, n + ". " + (sp.text || ""));
      b.addEventListener("click", function () { setActiveStep(n); });
      stripEl.appendChild(b);
    });
  }
  function updateFlowButtons() {
    var btns = doc.querySelectorAll("[data-flow-id]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].getAttribute("data-flow-id") === st.flowId);
    }
  }
  function updateStepMarks() {
    var target = null;
    var items = doc.querySelectorAll("[data-step]");
    for (var i = 0; i < items.length; i++) {
      var on = Number(items[i].getAttribute("data-step")) === st.step;
      items[i].classList.toggle("active", on);
      if (on && items[i].tagName === "LI") target = items[i];
    }
    if (target && target.scrollIntoView) target.scrollIntoView({ block: "nearest" });
  }
  function setFlow(id) {
    st.selected = null;
    st.flowId = id || null;
    st.step = null;
    hideTip();
    updateFlowButtons();
    var flow = st.flowId ? flowById(st.flowId) : null;
    renderStepStrip(flow);
    if (flow) renderFlowSide(flow);
    else setSideOpen(false);
    updateStepMarks();
    syncHighlight();
  }
  function setActiveStep(n) {
    st.step = st.step === n ? null : n;
    updateStepMarks();
    syncHighlight();
  }
  function selectNode(path) {
    st.flowId = null;
    st.step = null;
    updateFlowButtons();
    renderStepStrip(null);
    st.selected = st.selected === path ? null : path;
    var node = st.selected ? nodeByPath[st.selected] : null;
    if (node) renderNodeSide(node);
    else { st.selected = null; setSideOpen(false); }
    syncHighlight();
  }
  function clearSelection() {
    if (st.flowId) { setFlow(null); return; }
    if (st.selected) {
      st.selected = null;
      setSideOpen(false);
      syncHighlight();
      return;
    }
    setSideOpen(false);
  }

  /* ---- 드릴다운 (§5 단일 규칙) ---- */
  function navigateHref(href) {
    if (!href) return;
    if (/^[a-z][a-z0-9+.-]*:/.test(href)) {
      window.open(href, "_blank", "noopener");
      return;
    }
    var slug = String(href).replace(/\.html$/, "");
    if (/^[a-z0-9_-]+$/.test(slug)) {
      if (window.parent !== window) postMsg({ type: "zzon:navigate", slug: slug });
      else window.location.href = slug + ".html";
      return;
    }
    console.warn("[zzon-frame] " + S.badHref + " " + href);
  }

  /* ---- 내보내기 (§6): adapter.export(kind) 우선 → payload.assets 다운로드 폴백 ---- */
  function downloadBlob(name, blob) {
    var a = doc.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  function downloadAsset(file) {
    var a = doc.createElement("a");
    a.href = file;
    a.download = "";
    doc.body.appendChild(a);
    a.click();
    a.remove();
  }
  function exportKind(kind) {
    var name = (P.id || "diagram") + "." + kind;
    Promise.resolve(callAdapter("export", kind)).then(function (blob) {
      if (blob) { downloadBlob(name, blob); return; }
      var assets = P.assets || {};
      var file = kind === "svg" ? assets.svgFile : assets.pngFile;
      if (file) downloadAsset(file);
      else console.warn("[zzon-frame] " + S.noExportAsset + " " + kind);
    });
  }

  /* ---- 툴바 배선 (fit · reset · 라벨 토글 · SVG · PNG · 테마 + 캔버스 extras 슬롯) ---- */
  var themeBtn = null;
  var labelBtn = null;
  function onAct(act, fn) {
    var b = doc.querySelector('[data-act="' + act + '"]');
    if (b) b.addEventListener("click", fn);
    return b;
  }
  onAct("fit", function () { callAdapter("fit"); });
  onAct("reset", function () { callAdapter("reset"); });
  labelBtn = onAct("labels", function () {
    labelMode = labelMode === "always" ? "auto" : "always";
    if (labelBtn) labelBtn.classList.toggle("active", labelMode === "always");
    callAdapter("setLabelMode", labelMode);
  });
  onAct("export-svg", function () { exportKind("svg"); });
  onAct("export-png", function () { exportKind("png"); });
  themeBtn = onAct("theme", toggleTheme);
  function updateThemeBtn() {
    if (!themeBtn) return;
    themeBtn.innerHTML = "";
    themeBtn.appendChild(icon(currentTheme() === "dark" ? "Sun" : "Moon", 14));
  }

  /* ---- 플로우 버튼 배선 (빌드타임 크롬) ---- */
  (function () {
    var btns = doc.querySelectorAll("[data-flow-id]");
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener("click", function () {
          var id = b.getAttribute("data-flow-id");
          setFlow(st.flowId === id ? null : id);
        });
      })(btns[i]);
    }
  })();

  /* ---- 캔버스 → 프레임 콜백 (§2: 프레임이 어댑터에 주입한다) ---- */
  var callbacks = {
    onNodeSelected: function (path) {
      if (path == null) {
        if (st.selected) { st.selected = null; setSideOpen(false); syncHighlight(); }
        return;
      }
      selectNode(path);
    },
    onNodeActivated: function (path) {
      var node = nodeByPath[path];
      if (node && node.href) navigateHref(node.href);
    },
    onStepClicked: function (flowId, n) {
      if (st.flowId !== flowId) setFlow(flowId);
      setActiveStep(n);
    },
    onHover: function (path) {
      st.hovered = path || null;
      syncHighlight();
    },
  };

  /* ---- register (§2) ---- */
  var booted = false;
  function register(a) {
    if (!a || typeof a !== "object") {
      console.warn("[zzon-frame] " + S.needAdapter);
      return api;
    }
    adapter = a;
    if (a.el && viewport && a.el.parentNode !== viewport) viewport.appendChild(a.el);
    for (var k in callbacks) {
      if (Object.prototype.hasOwnProperty.call(callbacks, k)) a[k] = callbacks[k];
    }
    var extras = callAdapter("toolbarExtras");
    var slot = doc.getElementById("frame-extras");
    if (extras && slot) { slot.innerHTML = ""; slot.appendChild(extras); }
    callAdapter("setLabelMode", labelMode);
    if (!booted) {
      booted = true;
      /* 부트 fit: 레이아웃 안정화 후 (440px 엠베드 포함, §4) */
      if (window.requestAnimationFrame) requestAnimationFrame(function () { callAdapter("fit"); });
      else callAdapter("fit");
      if (doc.fonts && doc.fonts.ready && doc.fonts.ready.then) {
        doc.fonts.ready.then(function () { callAdapter("refresh"); }).catch(function () {});
      }
    }
    return api;
  }

  /* ---- 전역 리스너: 셸 메시지 · Escape · 리사이즈/엠베드 ---- */
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (d && d.type === "zzon:sidebar-close") clearSelection();
  });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && (st.flowId || st.selected || sideOpen)) clearSelection();
  });
  var wasCompact = false;
  function applyEmbedMode() {
    var compact = window.innerHeight <= 460;
    if (compact && !wasCompact) {
      var lg = doc.getElementById("frame-legend");
      if (lg) lg.removeAttribute("open");
    }
    wasCompact = compact;
    frameRoot.classList.toggle("compact", compact);
  }
  window.addEventListener("resize", function () {
    applyEmbedMode();
    callAdapter("refresh");
  });

  /* ---- 부트 ---- */
  bootTheme();
  applyEmbedMode();

  var api = { register: register, tooltip: tooltip, payload: P };
  window.__zzonFrame = api;
})();`;

/* =========================================================================
 * 5. 빌드타임 크롬 조각
 * ========================================================================= */

function iconHtml(name, size) {
  return '<span class="frame-icon" aria-hidden="true">' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + size +
    '" height="' + size + '">' + (FRAME_ICONS[name] || "") + "</svg></span>";
}

function btnIcon(act, iconName, label) {
  return '<button type="button" class="frame-btn icon" data-act="' + escAttr(act) +
    '" aria-label="' + escAttr(label) + '" data-tip="' + escAttr(label) + '">' +
    iconHtml(iconName, 14) + "</button>";
}

function btnMini(act, text, label) {
  return '<button type="button" class="frame-btn mini" data-act="' + escAttr(act) +
    '" aria-label="' + escAttr(label) + '" data-tip="' + escAttr(label) + '">' +
    escHtml(text) + "</button>";
}

function swatchHtml(sw) {
  if (!sw || typeof sw !== "object") return "";
  const color = escAttr(sw.color || "currentColor");
  const dash = sw.dash ? ' stroke-dasharray="' + escAttr(sw.dash) + '"' : "";
  if (sw.type === "line") {
    return '<svg class="sw" width="18" height="6" aria-hidden="true">' +
      '<line x1="0" y1="3" x2="18" y2="3" stroke="' + color + '" stroke-width="1.5"' + dash +
      "/></svg>";
  }
  if (sw.type === "border") {
    return '<svg class="sw" width="16" height="10" aria-hidden="true">' +
      '<rect x="1" y="1" width="14" height="8" rx="2" fill="none" stroke="' + color +
      '" stroke-width="1.2"' + dash + "/></svg>";
  }
  return '<span class="sw dot" style="background:' + color + '"></span>';
}

function countOf(counts, key) {
  const v = counts && typeof counts === "object" ? Number(counts[key]) : NaN;
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function buildAriaLabel(payload) {
  const counts = payload.counts || {};
  let out = (payload.title || "") + " — " +
    STR.nodesLabel + " " + countOf(counts, "nodes") + STR.countUnit + ", " +
    STR.edgesLabel + " " + countOf(counts, "edges") + STR.countUnit;
  const groups = countOf(counts, "groups");
  const flows = countOf(counts, "flows");
  if (groups) out += ", " + STR.groupsLabel + " " + groups + STR.countUnit;
  if (flows) out += ", " + STR.flowsLabel + " " + flows + STR.countUnit;
  return out;
}

function buildTitlebar(payload) {
  const kind = KIND_META[payload.kind] || KIND_META.infra;
  const tip = payload.description ? ' data-tip="' + escAttr(payload.description) + '"' : "";
  return '<div class="frame-ui frame-titlebar" data-frame-ui' + tip + ">" +
    '<span class="frame-kind-chip">' + iconHtml(kind.icon, 11) + escHtml(kind.label) + "</span>" +
    '<span class="frame-title-text">' + escHtml(payload.title || "") + "</span></div>";
}

function buildFlowCol(payload) {
  const flows = Array.isArray(payload.flows) ? payload.flows : [];
  if (!flows.length) return "";
  const btns = flows.map((f) =>
    '<button type="button" class="frame-btn" data-flow-id="' + escAttr(f.id || "") +
    '" data-tip="' + escAttr(f.description || f.title || f.id || "") + '">' +
    escHtml(f.title || f.id || "") + "</button>").join("");
  return '<div class="frame-ui frame-flowcol" data-frame-ui>' +
    '<div class="frame-flowsel"><span class="frame-route">' + iconHtml("Route", 16) + "</span>" +
    btns + "</div>" +
    '<div class="frame-stepstrip" id="frame-stepstrip" style="display:none"></div></div>';
}

function buildWarn(payload) {
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
  if (!warnings.length) return "";
  const hasFlows = Array.isArray(payload.flows) && payload.flows.length > 0;
  let text = String(warnings[0]);
  if (warnings.length > 1) {
    text += STR.warnMorePrefix + (warnings.length - 1) + STR.warnMoreSuffix;
  }
  return '<div class="frame-ui frame-warn" data-frame-ui' +
    (hasFlows ? ' style="top:132px"' : "") + ">" +
    '<span class="chip" data-tip="' + escAttr(warnings.join("\n")) + '">' +
    escHtml(text) + "</span></div>";
}

function buildLegend(payload) {
  const items = Array.isArray(payload.legend) ? payload.legend : [];
  if (!items.length) return "";
  let inner = "";
  let prevGroup = null;
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    if (prevGroup !== null && it.group !== prevGroup) inner += '<span class="sep"></span>';
    prevGroup = it.group;
    inner += '<span class="item">' + swatchHtml(it.swatch) + escHtml(it.label || "") + "</span>";
  }
  return '<details class="frame-ui frame-legend" id="frame-legend" data-frame-ui open>' +
    "<summary>" + escHtml(STR.legend) + "</summary>" +
    '<div class="frame-legend-items">' + inner + "</div></details>";
}

function buildToolbar() {
  return '<div class="frame-ui frame-toolbar" data-frame-ui>' +
    btnIcon("fit", "Maximize", STR.fit) +
    btnIcon("reset", "RotateCcw", STR.reset) +
    btnIcon("labels", "Tag", STR.labelAlways) +
    btnMini("export-svg", STR.svg, STR.exportSvg) +
    btnMini("export-png", STR.png, STR.exportPng) +
    '<span id="frame-extras" class="frame-extras"></span>' +
    btnIcon("theme", "Moon", STR.themeToggle) +
    "</div>";
}

/* =========================================================================
 * 6. buildViewerHtml
 * ========================================================================= */

/**
 * @param {{ payload: object, canvas: { markup: string, css: string, js: string } }} input
 * @returns {string} 자기완결 HTML (같은 입력이면 바이트 단위로 동일)
 */
export function buildViewerHtml({ payload, canvas } = {}) {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("buildViewerHtml: payload 객체(계약 §1)가 필요합니다");
  }
  if (!canvas || typeof canvas !== "object") {
    throw new TypeError("buildViewerHtml: canvas { markup, css, js } 객체가 필요합니다");
  }
  const markup = canvas.markup != null ? String(canvas.markup) : "";
  const canvasCss = canvas.css != null ? String(canvas.css) : "";
  const canvasJs = canvas.js != null ? String(canvas.js) : "";

  const root = [
    '<div id="frame-root" role="img" aria-label="' + escAttr(buildAriaLabel(payload)) + '">',
    '<div class="frame-viewport" id="frame-viewport">' + markup + "</div>",
    buildTitlebar(payload),
    buildFlowCol(payload),
    buildWarn(payload),
    buildLegend(payload),
    '<aside class="frame-ui frame-side" id="frame-side" data-frame-ui></aside>',
    buildToolbar(),
    "</div>",
  ].filter(Boolean).join("\n");

  return [
    "<!doctype html>",
    '<html lang="ko">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<title>" + escHtml(payload.title || payload.id || "") + "</title>",
    "<style>",
    FRAME_CSS,
    canvasCss,
    "</style>",
    "</head>",
    "<body>",
    root,
    '<div id="dg-tip"></div>',
    "<script>",
    "window.__zzonFramePayload = " + safeJson(payload) + ";",
    "window.__zzonFrameStr = " + safeJson(STR) + ";",
    "window.__zzonFrameIcons = " + safeJson(FRAME_ICONS) + ";",
    "</script>",
    "<script>",
    FRAME_RUNTIME,
    "</script>",
    "<script>",
    canvasJs,
    "</script>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
