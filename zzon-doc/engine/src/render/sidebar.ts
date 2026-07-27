/**
 * Detail sidebar + docs-shell protocol + theme sync (viewer parity port of
 * the legacy render.mjs right-hand sidebar, DESIGN §8 variant 1).
 *
 * Self-contained string exports; html.ts/svg.ts wire them in later (see
 * INTEGRATION-sidebar.md). Nothing here imports from the shared render files.
 *
 * Docs-shell protocol (the docs site embeds each diagram in an iframe):
 *   iframe -> parent  { type: "zzon:navigate", slug }   href drilldown
 *   iframe -> parent  { type: "zzon:sidebar", open }    menu mutual exclusion
 *   parent -> iframe  { type: "zzon:sidebar-close" }    parent menu reopened
 *
 * Theme sync: localStorage key "zzon-theme" ("light" | "dark") stamped as
 * data-theme on <html>; prefers-color-scheme is the fallback; "storage"
 * events keep sibling iframes in step. NOTE the legacy diagram renderer
 * forgot to READ the key on boot (bug) — the correct reference is
 * skills/zzon-seq/scripts/seq-engine.js (setTheme + boot).
 */
import type { SceneNode } from "../layout/scene.ts";

/** Local XML/attribute escaper (svg.ts's escaper stays private to svg.ts). */
const escapeXml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/**
 * Extra attributes for a node's <g> so SIDEBAR_JS can populate the panel
 * without a spec blob: data-label / data-category / data-tech / data-desc /
 * data-href, each emitted only when present, values escaped. Returns either
 * "" or a string with a leading space, ready to concatenate into the open
 * tag right after data-path (svg.ts nodeMarkup).
 */
export function sidebarDataAttrs(n: SceneNode): string {
  const pairs: [name: string, value: string | undefined][] = [
    ["data-label", n.label?.text],
    ["data-category", n.category],
    ["data-tech", n.tech],
    ["data-desc", n.description],
    ["data-href", n.href],
  ];
  return pairs
    .filter((p): p is [string, string] => p[1] !== undefined && p[1] !== "")
    .map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
    .join("");
}

/**
 * Sidebar skeleton, appended once to <body> (after <main>). All content
 * containers start empty/hidden; SIDEBAR_JS fills them per selected node.
 */
export const SIDEBAR_HTML: string = [
  `<aside class="dg-sidebar" aria-label="Node details">`,
  `<div class="dg-sidebar-head">`,
  `<div class="dg-sidebar-titles">`,
  `<div class="dg-sidebar-title"></div>`,
  `<div class="dg-sidebar-chips">`,
  `<span class="dg-chip dg-chip-category" hidden></span>`,
  `<span class="dg-chip dg-chip-tech" hidden></span>`,
  `</div>`,
  `</div>`,
  `<button class="dg-sidebar-close" type="button" aria-label="Close">&#215;</button>`,
  `</div>`,
  `<div class="dg-sidebar-body">`,
  `<p class="dg-sidebar-desc" hidden></p>`,
  `<div class="dg-sidebar-conn-sec" hidden>Connections</div>`,
  `<ul class="dg-sidebar-conns"></ul>`,
  `</div>`,
  `<div class="dg-sidebar-foot" hidden>`,
  `<a class="dg-sidebar-href" href="#"></a>`,
  `</div>`,
  `</aside>`,
].join("\n");

/**
 * Sidebar styles. Right panel, 304px (legacy width), slide-in transition.
 * Theme-aware via --panel-* custom properties with light fallbacks inline;
 * dark values come from [data-theme="dark"] (stamped by SIDEBAR_JS) with a
 * prefers-color-scheme guard covering the no-JS case, mirroring html.ts.
 * position:fixed so the off-canvas closed state never creates scrollbars;
 * --panel-top defaults to the 48px #ia-toolbar height.
 */
export const SIDEBAR_CSS: string = [
  `:root{--panel-bg:#FFFFFF;--panel-text:#16191F;--panel-muted:#545B64;` +
    `--panel-border:rgba(125,137,152,.35);--panel-hover:rgba(125,137,152,.14);` +
    `--panel-chip:rgba(125,137,152,.16)}`,
  `:root[data-theme="dark"]{--panel-bg:#161E2D;--panel-text:#D5DBDB;--panel-muted:#879596;` +
    `--panel-border:rgba(125,137,152,.5);--panel-hover:rgba(125,137,152,.24);` +
    `--panel-chip:rgba(125,137,152,.3)}`,
  `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){` +
    `--panel-bg:#161E2D;--panel-text:#D5DBDB;--panel-muted:#879596;` +
    `--panel-border:rgba(125,137,152,.5);--panel-hover:rgba(125,137,152,.24);` +
    `--panel-chip:rgba(125,137,152,.3)}}`,
  `.dg-sidebar{position:fixed;z-index:40;top:var(--panel-top,48px);right:0;bottom:0;width:304px;` +
    `box-sizing:border-box;display:flex;flex-direction:column;` +
    `border-left:1px solid var(--panel-border,rgba(125,137,152,.35));` +
    `background:var(--panel-bg,#FFFFFF);color:var(--panel-text,#16191F);` +
    `box-shadow:-10px 0 30px rgba(0,0,0,.1);` +
    `transform:translateX(105%);visibility:hidden;transition:transform .2s ease,visibility .2s}`,
  `.dg-sidebar.open{transform:translateX(0);visibility:visible}`,
  `.dg-sidebar-head{display:flex;align-items:flex-start;gap:10px;padding:14px;` +
    `border-bottom:1px solid var(--panel-border,rgba(125,137,152,.35))}`,
  `.dg-sidebar-titles{flex:1;min-width:0}`,
  `.dg-sidebar-title{font-size:14px;font-weight:600;line-height:1.25;overflow-wrap:break-word}`,
  `.dg-sidebar-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}`,
  `.dg-chip{font-size:10.5px;font-weight:600;letter-spacing:.02em;padding:1px 7px;` +
    `border-radius:999px;background:var(--panel-chip,rgba(125,137,152,.16));` +
    `color:var(--panel-muted,#545B64)}`,
  `.dg-sidebar-close{flex-shrink:0;width:24px;height:24px;border:0;border-radius:5px;` +
    `background:none;color:var(--panel-muted,#545B64);font:inherit;font-size:15px;` +
    `line-height:1;cursor:pointer}`,
  `.dg-sidebar-close:hover{background:var(--panel-hover,rgba(125,137,152,.14))}`,
  `.dg-sidebar-body{flex:1;min-height:0;overflow-y:auto;padding:12px 14px 18px;` +
    `font-size:12px;line-height:1.6;color:var(--panel-muted,#545B64)}`,
  `.dg-sidebar-desc{margin:0 0 4px}`,
  `.dg-sidebar-conn-sec{margin:16px 0 6px;font-size:10.5px;font-weight:700;` +
    `letter-spacing:.06em;text-transform:uppercase}`,
  `.dg-sidebar-conns{list-style:none;margin:0;padding:0}`,
  `.dg-conn{display:flex;align-items:center;gap:7px;padding:5px 8px;margin:0 -8px;` +
    `border-radius:7px;cursor:pointer;font-size:12px;color:var(--panel-text,#16191F)}`,
  `.dg-conn:hover{background:var(--panel-hover,rgba(125,137,152,.14))}`,
  `.dg-conn .dir{flex-shrink:0;width:14px;text-align:center;font-weight:700;` +
    `color:var(--panel-muted,#545B64)}`,
  `.dg-conn .lbl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
  `.dg-conn .kind{margin-left:auto;flex-shrink:0;padding-left:8px;font-size:10px;` +
    `color:var(--panel-muted,#545B64)}`,
  `.dg-sidebar-foot{border-top:1px solid var(--panel-border,rgba(125,137,152,.35));padding:8px}`,
  `.dg-sidebar-href{display:block;height:28px;line-height:28px;padding:0 8px;border-radius:6px;` +
    `font-size:12px;color:var(--panel-text,#16191F);text-decoration:none;` +
    `white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
  `.dg-sidebar-href:hover{background:var(--panel-hover,rgba(125,137,152,.14))}`,
].join("\n");

/**
 * Inline vanilla-JS (ES2020, zero dependencies), same embedding rules as
 * interactions.ts: kept as a plain string, MUST NOT contain "</" + "script>"
 * or template-literal syntax. Theme boot runs even when the sidebar markup
 * is absent. Safe in either order around INTERACTION_JS: interactions only
 * stamps data-theme when missing, this script always stamps the stored value.
 */
export const SIDEBAR_JS: string = `(function () {
  "use strict";
  var root = document.documentElement;

  /* ---- theme boot: localStorage "zzon-theme" wins, OS preference fallback ---- */
  var theme = null;
  try { theme = localStorage.getItem("zzon-theme"); } catch (err) {}
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  }
  root.dataset.theme = theme;
  window.__zzonSetTheme = function (t) {
    if (t !== "light" && t !== "dark") return;
    root.dataset.theme = t;
    try { localStorage.setItem("zzon-theme", t); } catch (err) {}
  };
  /* other iframes / the shell persisting the key restyle this page live */
  window.addEventListener("storage", function (ev) {
    if (ev.key !== "zzon-theme") return;
    if (ev.newValue === "light" || ev.newValue === "dark") root.dataset.theme = ev.newValue;
  });

  /* ---- drilldown: sibling slug inside the docs shell, full URL otherwise ---- */
  function navigateHref(href) {
    if (!href) return;
    var slug = String(href).replace(/\\.html$/i, "");
    if (/^[a-z0-9_-]+$/.test(slug)) {
      if (window.parent !== window) {
        window.parent.postMessage({ type: "zzon:navigate", slug: slug }, "*");
      } else {
        window.location.href = slug + ".html";
      }
      return;
    }
    window.open(href, "_blank", "noopener");
  }

  var aside = document.querySelector(".dg-sidebar");
  var svg = document.querySelector("svg.ia-svg");
  if (!aside || !svg) return;
  var pick = function (sel) { return aside.querySelector(sel); };
  var titleEl = pick(".dg-sidebar-title");
  var catEl = pick(".dg-chip-category");
  var techEl = pick(".dg-chip-tech");
  var descEl = pick(".dg-sidebar-desc");
  var connSec = pick(".dg-sidebar-conn-sec");
  var connsEl = pick(".dg-sidebar-conns");
  var footEl = pick(".dg-sidebar-foot");
  var hrefEl = pick(".dg-sidebar-href");
  var nodes = Array.prototype.slice.call(svg.querySelectorAll(".node"));
  var edges = Array.prototype.slice.call(svg.querySelectorAll(".edge"));
  var isOpen = false;
  var currentHref = null;

  /* open/close tells the parent shell so its left menu stays mutually exclusive */
  function setOpen(open) {
    if (isOpen === open) return;
    isOpen = open;
    aside.classList.toggle("open", open);
    if (window.parent !== window) {
      window.parent.postMessage({ type: "zzon:sidebar", open: !!open }, "*");
    }
  }

  function nodeByPath(path) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-path") === path) return nodes[i];
    }
    return null;
  }
  function labelOf(node) {
    var label = node.getAttribute("data-label");
    if (label) return label;
    return (node.getAttribute("data-path") || "").split("/").pop();
  }
  function setChip(chip, value) {
    chip.hidden = !value;
    chip.textContent = value || "";
  }

  function select(node) {
    var path = node.getAttribute("data-path");
    titleEl.textContent = labelOf(node);
    setChip(catEl, node.getAttribute("data-category"));
    setChip(techEl, node.getAttribute("data-tech"));
    var desc = node.getAttribute("data-desc");
    descEl.hidden = !desc;
    descEl.textContent = desc || "";

    /* connections: scan edge endpoints (data-from/data-to) for this node's path */
    connsEl.textContent = "";
    var count = 0;
    edges.forEach(function (edge) {
      var from = edge.getAttribute("data-from");
      var to = edge.getAttribute("data-to");
      if (from !== path && to !== path) return;
      var outgoing = from === path;
      var other = nodeByPath(outgoing ? to : from);
      if (!other) return; /* endpoint is a group/rail item — no node entry */
      count++;
      var li = document.createElement("li");
      li.className = "dg-conn";
      var dir = document.createElement("span");
      dir.className = "dir";
      dir.textContent = outgoing ? "\\u2192" : "\\u2190";
      li.appendChild(dir);
      var lbl = document.createElement("span");
      lbl.className = "lbl";
      lbl.textContent = labelOf(other);
      li.appendChild(lbl);
      var edgeText = edge.querySelector("text");
      if (edgeText && edgeText.textContent) {
        var kind = document.createElement("span");
        kind.className = "kind";
        kind.textContent = edgeText.textContent;
        li.appendChild(kind);
      }
      li.addEventListener("click", function () { select(other); });
      connsEl.appendChild(li);
    });
    connSec.textContent = "Connections (" + count + ")";
    connSec.hidden = count === 0;

    currentHref = node.getAttribute("data-href");
    footEl.hidden = !currentHref;
    hrefEl.textContent = "Details: " + (currentHref || "");
    hrefEl.title = currentHref || "";
    setOpen(true);
  }

  nodes.forEach(function (node) {
    node.addEventListener("click", function () { select(node); });
    node.addEventListener("dblclick", function (ev) {
      var href = node.getAttribute("data-href");
      if (!href) return;
      ev.stopPropagation(); /* keep the canvas dblclick view-reset from firing */
      navigateHref(href);
    });
  });
  hrefEl.addEventListener("click", function (ev) {
    ev.preventDefault();
    navigateHref(currentHref);
  });
  pick(".dg-sidebar-close").addEventListener("click", function () { setOpen(false); });

  /* ---- parent shell reopened its menu -> close this sidebar ---- */
  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (d && d.type === "zzon:sidebar-close") setOpen(false);
  });
  window.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") setOpen(false);
  });
})();`;
