/**
 * Inline vanilla-JS (ES2020, zero dependencies) injected by html.ts into the
 * interactive output (DESIGN §8 variant 1):
 *   - pan (drag background) + wheel zoom (cursor-anchored, 0.2x–8x) + dblclick reset
 *   - hover on .node → .hl on it, its incident edges (data-from/data-to match)
 *     and neighbor nodes; .dim on everything else
 *   - click on a node with data-meta → positioned tooltip listing key: value
 *   - layer checkboxes auto-generated from the distinct layer-<name> classes
 *   - location.hash "#<path>" deep link → pulse highlight + scroll into view
 *   - theme toggle flipping data-theme on <html>, default from prefers-color-scheme
 *
 * Kept as a plain string so the renderer stays a pure string pipeline.
 * MUST NOT contain "</script>" or template-literal syntax (it is embedded
 * verbatim inside a template literal and a <script> tag).
 */
export const INTERACTION_JS: string = `(function () {
  "use strict";
  /* ---- theme: default from prefers-color-scheme, toggle via #ia-theme ---- */
  var root = document.documentElement;
  if (!root.hasAttribute("data-theme")) {
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", prefersDark ? "dark" : "light");
  }
  var themeBtn = document.getElementById("ia-theme");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      if (window.__zzonSetTheme) window.__zzonSetTheme(next);
      else root.setAttribute("data-theme", next);
    });
  }

  var svg = document.querySelector("svg.ia-svg");
  if (!svg) return;

  /* ---- pan / zoom (viewBox-based) ---- */
  var vb0 = (svg.getAttribute("viewBox") || "0 0 100 100").split(/\\s+/).map(Number);
  var vb = vb0.slice();
  var MIN_ZOOM = 0.2, MAX_ZOOM = 8;
  function applyVB() { svg.setAttribute("viewBox", vb.join(" ")); }
  function resetView() { vb = vb0.slice(); applyVB(); }

  var pan = null;
  svg.addEventListener("pointerdown", function (ev) {
    if (ev.button !== 0) return;
    if (ev.target instanceof Element && ev.target.closest(".node")) return;
    pan = { x: ev.clientX, y: ev.clientY, vb: vb.slice() };
    if (svg.setPointerCapture) svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener("pointermove", function (ev) {
    if (!pan) return;
    var r = svg.getBoundingClientRect();
    vb[0] = pan.vb[0] - ((ev.clientX - pan.x) / r.width) * pan.vb[2];
    vb[1] = pan.vb[1] - ((ev.clientY - pan.y) / r.height) * pan.vb[3];
    applyVB();
  });
  ["pointerup", "pointercancel"].forEach(function (type) {
    svg.addEventListener(type, function () { pan = null; });
  });
  svg.addEventListener("wheel", function (ev) {
    ev.preventDefault();
    var r = svg.getBoundingClientRect();
    var px = vb[0] + ((ev.clientX - r.left) / r.width) * vb[2];
    var py = vb[1] + ((ev.clientY - r.top) / r.height) * vb[3];
    var factor = Math.pow(1.0015, ev.deltaY);
    var zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vb0[2] / (vb[2] * factor)));
    factor = vb0[2] / zoom / vb[2];
    vb[0] = px - (px - vb[0]) * factor;
    vb[1] = py - (py - vb[1]) * factor;
    vb[2] = vb[2] * factor;
    vb[3] = vb[3] * factor;
    applyVB();
  }, { passive: false });
  svg.addEventListener("dblclick", resetView);
  var resetBtn = document.getElementById("ia-reset");
  if (resetBtn) resetBtn.addEventListener("click", resetView);

  /* ---- hover: highlight node + incident edges + neighbors, dim the rest ---- */
  var nodes = Array.prototype.slice.call(svg.querySelectorAll(".node"));
  var edges = Array.prototype.slice.call(svg.querySelectorAll(".edge"));
  var all = nodes.concat(edges);
  function clearHl() {
    all.forEach(function (el) { el.classList.remove("hl"); el.classList.remove("dim"); });
  }
  nodes.forEach(function (node) {
    node.addEventListener("mouseenter", function () {
      var path = node.getAttribute("data-path");
      var lit = new Set([node]);
      edges.forEach(function (edge) {
        var from = edge.getAttribute("data-from");
        var to = edge.getAttribute("data-to");
        if (from !== path && to !== path) return;
        lit.add(edge);
        var other = from === path ? to : from;
        nodes.forEach(function (n) { if (n.getAttribute("data-path") === other) lit.add(n); });
      });
      all.forEach(function (el) {
        el.classList.toggle("hl", lit.has(el));
        el.classList.toggle("dim", !lit.has(el));
      });
    });
    node.addEventListener("mouseleave", clearHl);
  });

  /* ---- click node with data-meta -> positioned key/value tooltip ---- */
  var tip = document.createElement("div");
  tip.id = "ia-tooltip";
  tip.hidden = true;
  document.body.appendChild(tip);
  document.addEventListener("click", function (ev) {
    var target = ev.target instanceof Element ? ev.target : null;
    var node = target ? target.closest(".node[data-meta]") : null;
    if (!node) { tip.hidden = true; return; }
    var meta;
    try { meta = JSON.parse(node.getAttribute("data-meta")); } catch (err) { return; }
    tip.textContent = "";
    Object.keys(meta).forEach(function (key) {
      var row = document.createElement("div");
      var k = document.createElement("span");
      k.className = "k";
      k.textContent = key;
      row.appendChild(k);
      row.appendChild(document.createTextNode(String(meta[key])));
      tip.appendChild(row);
    });
    tip.style.left = (ev.pageX + 12) + "px";
    tip.style.top = (ev.pageY + 12) + "px";
    tip.hidden = false;
  });

  /* ---- layer toggles, auto-generated from layer-<name> classes ---- */
  var layersBox = document.getElementById("ia-layers");
  if (layersBox) {
    var layerNames = [];
    svg.querySelectorAll("[class]").forEach(function (el) {
      el.classList.forEach(function (cls) {
        if (cls.indexOf("layer-") === 0 && layerNames.indexOf(cls.slice(6)) < 0) {
          layerNames.push(cls.slice(6));
        }
      });
    });
    layerNames.sort();
    layerNames.forEach(function (name) {
      var label = document.createElement("label");
      var box = document.createElement("input");
      box.type = "checkbox";
      box.checked = true;
      box.addEventListener("change", function () {
        svg.querySelectorAll(".layer-" + name).forEach(function (el) {
          el.style.display = box.checked ? "" : "none";
        });
      });
      label.appendChild(box);
      label.appendChild(document.createTextNode(" " + name));
      layersBox.appendChild(label);
    });
  }

  /* ---- "#<path>" deep link: pulse + scroll into view ---- */
  function jumpToHash() {
    var hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) return;
    var el = null;
    svg.querySelectorAll("[data-path]").forEach(function (candidate) {
      if (candidate.getAttribute("data-path") === hash) el = candidate;
    });
    if (!el) return;
    el.classList.add("pulse");
    setTimeout(function () { el.classList.remove("pulse"); }, 2600);
    if (el.scrollIntoView) el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }
  window.addEventListener("hashchange", jumpToHash);
  jumpToHash();
})();`;
