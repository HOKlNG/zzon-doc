/**
 * Canvas runtime (viewer-frame contract §2) — inline vanilla-JS (ES2020,
 * zero dependencies) that implements the FULL canvas adapter and registers
 * it with the frame via `window.__zzonFrame.register({...})`.
 *
 * Split from the old INTERACTION_JS: pan/zoom/fit/reset survive here
 * (팬/줌은 캔버스 소유); everything chrome-side died — theme toggle, layer
 * checkboxes, tooltip, sidebar, flow buttons/strips are the FRAME's job.
 * The canvas only:
 *   - owns pan (drag) + wheel zoom (cursor-anchored, 0.2x–8x) + dblclick fit
 *   - reflects highlight commands (hover/select -> .hl/.dim + .sel sonar,
 *     flow/step -> .flow-hl/.flow-dim/.flow-fade + badge layer .active)
 *   - reflects setLabelMode ("auto" hides edge labels below the zoom
 *     threshold, "always" keeps them)
 *   - reports events upward: onNodeSelected / onNodeActivated / onHover /
 *     onStepClicked (badge click cycles its merged steps: "1·4" -> 1 -> 4 ->
 *     null — the cycle MUST be computed here because step merging per edge
 *     is canvas-internal; the frame only sees flow steps)
 *
 * Kept as a plain string so the renderer stays a pure string pipeline.
 * MUST NOT contain "</script>" or template-literal syntax (it is embedded
 * verbatim inside a template literal and a <script> tag).
 */
export const CANVAS_JS: string = `(function () {
  "use strict";
  var svg = document.querySelector("svg.ia-svg");
  if (!svg) return;

  /* ---- pan / zoom (viewBox-based; the canvas owns pan/zoom) ---- */
  var vb0 = (svg.getAttribute("viewBox") || "0 0 100 100").split(/\\s+/).map(Number);
  var vb = vb0.slice();
  var MIN_ZOOM = 0.2, MAX_ZOOM = 8, LABEL_ZOOM = 0.75;
  var labelMode = "auto";
  function zoomLevel() { return vb0[2] / vb[2]; }
  function applyVB() {
    svg.setAttribute("viewBox", vb.join(" "));
    svg.classList.toggle("labels-off", labelMode === "auto" && zoomLevel() < LABEL_ZOOM);
  }
  function fitView() { vb = vb0.slice(); applyVB(); }

  var pan = null, moved = false;
  svg.addEventListener("pointerdown", function (ev) {
    if (ev.button !== 0) return;
    moved = false;
    pan = { x: ev.clientX, y: ev.clientY, vb: vb.slice() };
    if (svg.setPointerCapture) svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener("pointermove", function (ev) {
    if (!pan) return;
    if (Math.abs(ev.clientX - pan.x) + Math.abs(ev.clientY - pan.y) > 3) moved = true;
    if (!moved) return;
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

  /* ---- element indexes ---- */
  var slice = function (list) { return Array.prototype.slice.call(list); };
  var nodes = slice(svg.querySelectorAll(".node[data-path]"));
  var edges = slice(svg.querySelectorAll(".edge[data-edge-id]"));
  var layers = slice(svg.querySelectorAll(".flow-badges[data-flow]"));
  function nodeByPath(path) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-path") === path) return nodes[i];
    }
    return null;
  }
  function badgesOf(flowId) {
    for (var i = 0; i < layers.length; i++) {
      if (layers[i].getAttribute("data-flow") === flowId) {
        return slice(layers[i].querySelectorAll(".flow-badge"));
      }
    }
    return [];
  }
  function stepsOf(badge) {
    return (badge.getAttribute("data-steps") || "").split(" ").map(Number);
  }

  /* ---- highlight state (the FRAME owns priority; we only reflect) ---- */
  var state = { hover: null, select: null, flow: null, step: null };

  function applyHighlight() {
    /* hover/select neighborhood: focused node + incident edges + neighbors */
    var lit = {}, litEdges = {}, focusOn = false;
    [state.select, state.hover].forEach(function (path) {
      if (path === null) return;
      focusOn = true;
      lit[path] = true;
      edges.forEach(function (edge) {
        var from = edge.getAttribute("data-from");
        var to = edge.getAttribute("data-to");
        if (from !== path && to !== path) return;
        litEdges[edge.getAttribute("data-edge-id")] = true;
        lit[from] = true;
        lit[to] = true;
      });
    });
    nodes.forEach(function (node) {
      var p = node.getAttribute("data-path");
      node.classList.toggle("hl", focusOn && !!lit[p]);
      node.classList.toggle("dim", focusOn && !lit[p]);
      node.classList.toggle("sel", state.select !== null && p === state.select);
    });
    edges.forEach(function (edge) {
      var on = !!litEdges[edge.getAttribute("data-edge-id")];
      edge.classList.toggle("hl", focusOn && on);
      edge.classList.toggle("dim", focusOn && !on);
    });

    /* flow/step: badge layer + on-path highlight + step focus fade */
    var flowOn = state.flow !== null;
    svg.classList.toggle("step-focus", flowOn && state.step !== null);
    layers.forEach(function (l) {
      l.classList.toggle("active", l.getAttribute("data-flow") === state.flow);
    });
    var edgeSteps = {};
    badgesOf(state.flow).forEach(function (badge) {
      var steps = stepsOf(badge);
      edgeSteps[badge.getAttribute("data-edge-id")] = steps;
      badge.classList.toggle("on", state.step !== null && steps.indexOf(state.step) !== -1);
    });
    var onNodes = {}, stepNodes = {};
    edges.forEach(function (edge) {
      var steps = edgeSteps[edge.getAttribute("data-edge-id")];
      var inStep = !!steps && state.step !== null && steps.indexOf(state.step) !== -1;
      if (steps) {
        onNodes[edge.getAttribute("data-from")] = true;
        onNodes[edge.getAttribute("data-to")] = true;
        if (inStep) {
          stepNodes[edge.getAttribute("data-from")] = true;
          stepNodes[edge.getAttribute("data-to")] = true;
        }
      }
      edge.classList.toggle("flow-hl", flowOn && !!steps);
      edge.classList.toggle("flow-dim", flowOn && !steps);
      edge.classList.toggle("flow-fade", flowOn && !!steps && state.step !== null && !inStep);
    });
    nodes.forEach(function (node) {
      var p = node.getAttribute("data-path");
      node.classList.toggle("flow-dim", flowOn && !onNodes[p]);
      node.classList.toggle("flow-fade", flowOn && !!onNodes[p] && state.step !== null && !stepNodes[p]);
    });
  }

  /* ---- adapter (frame -> canvas commands) ---- */
  var adapter = {
    el: svg,
    highlight: function (mode, target) {
      if (mode === "hover") {
        state.hover = target && target.path != null ? target.path : null;
      } else if (mode === "select") {
        state.select = target && target.path != null ? target.path : null;
      } else if (mode === "flow") {
        state.flow = target && target.flowId != null ? target.flowId : null;
        state.step = null;
      } else if (mode === "step") {
        if (target && target.flowId != null) {
          state.flow = target.flowId;
          state.step = target.step != null ? target.step : null;
        } else {
          state.step = null;
        }
      }
      applyHighlight();
    },
    setLabelMode: function (mode) {
      labelMode = mode === "always" ? "always" : "auto";
      applyVB();
    },
    fit: function () { fitView(); },
    reset: function () { fitView(); },
    canvasShift: function (px) {
      svg.style.transform = px ? "translateX(" + px + "px)" : "";
    },
    refresh: function () {},
    "export": function () { return null; },
    toolbarExtras: function () { return null; }
  };

  /* ---- canvas -> frame callbacks (the frame hands them over at register;
     look on the register() return value first, then on the adapter object
     in case the frame stamps them there) ---- */
  var handle = null;
  function emit(name, a, b) {
    var fn = (handle && handle[name]) || adapter[name];
    if (typeof fn === "function") fn(a, b);
  }

  svg.addEventListener("click", function (ev) {
    if (moved) return;
    var t = ev.target instanceof Element ? ev.target : null;
    var badge = t ? t.closest(".flow-badge") : null;
    if (badge) {
      var layer = badge.closest(".flow-badges[data-flow]");
      if (!layer) return;
      /* cycle the merged badge's steps: none -> first -> ... -> last -> null */
      var steps = stepsOf(badge);
      var i = steps.indexOf(state.step);
      var next = i === -1 ? steps[0] : (i + 1 < steps.length ? steps[i + 1] : null);
      emit("onStepClicked", layer.getAttribute("data-flow"), next);
      return;
    }
    var node = t ? t.closest(".node[data-path]") : null;
    emit("onNodeSelected", node ? node.getAttribute("data-path") : null);
  });

  svg.addEventListener("dblclick", function (ev) {
    var t = ev.target instanceof Element ? ev.target : null;
    var node = t ? t.closest(".node[data-path]") : null;
    if (node) emit("onNodeActivated", node.getAttribute("data-path"));
    else fitView();
  });

  var hoverPath = null;
  svg.addEventListener("mouseover", function (ev) {
    var t = ev.target instanceof Element ? ev.target : null;
    var node = t ? t.closest(".node[data-path]") : null;
    var p = node ? node.getAttribute("data-path") : null;
    if (p !== hoverPath) { hoverPath = p; emit("onHover", p); }
  });
  svg.addEventListener("mouseleave", function () {
    if (hoverPath !== null) { hoverPath = null; emit("onHover", null); }
  });

  /* ---- register with the frame (retry briefly: script order is not ours) ---- */
  function register() {
    var frame = window.__zzonFrame;
    if (!frame || typeof frame.register !== "function") return false;
    handle = frame.register(adapter) || null;
    return true;
  }
  if (!register()) {
    var tries = 0;
    var timer = setInterval(function () {
      if (register() || ++tries > 50) clearInterval(timer);
    }, 40);
  }
  applyVB();
})();`;
