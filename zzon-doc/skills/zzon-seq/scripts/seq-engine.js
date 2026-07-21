/**
 * seq-engine.js — zzon-seq 뷰어 엔진 (순수 JS, 이 파일이 정본)
 *
 * render-seq.mjs가 이 파일을 출력 .html에 인라인한다. 다른 엔진(render.mjs)과 같은 규칙:
 * 라이브러리/CDN 0, 수정해도 되지만 반드시 브라우저 렌더로 재검증한다
 * (샘플 2종 렌더 → 겹침 없음·pageerror 0·간소화/둘러보기/내보내기 동작).
 *
 * 최초 이식: ~/Documents/src/test_sequence_diagram (FlowScope TS, 2026-07-21)를 1회 트랜스파일.
 * render.mjs의 info-hub 전례처럼 이식 후 독립 — 이제 여기가 정본이고 다시 포팅하지 않는다.
 */
(() => {
  // ── measure — canvas measureText 기반 라벨 측정·말줄임·줄바꿈 ──
  var FONT_STACK = `-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
  var FONTS = {
    msgLabel: `500 12.5px ${FONT_STACK}`,
    note: `400 12px ${FONT_STACK}`,
    fragKind: `700 10px ${FONT_STACK}`,
    fragLabel: `400 11px ${FONT_STACK}`,
    actorName: `600 13px ${FONT_STACK}`
  };
  var ctx = null;
  var cache = new Map;
  function context() {
    if (!ctx) {
      const c = document.createElement("canvas");
      ctx = c.getContext("2d");
    }
    return ctx;
  }
  function textWidth(text, font) {
    const key = font + "\x00" + text;
    let w = cache.get(key);
    if (w === undefined) {
      const c = context();
      c.font = font;
      w = c.measureText(text).width;
      cache.set(key, w);
    }
    return w;
  }
  function truncate(text, font, maxW) {
    if (textWidth(text, font) <= maxW)
      return { text, truncated: false };
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (textWidth(text.slice(0, mid) + "…", font) <= maxW)
        lo = mid;
      else
        hi = mid - 1;
    }
    return { text: text.slice(0, lo).trimEnd() + "…", truncated: true };
  }
  function wrap(text, font, maxW, maxLines) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    const push = (s) => {
      if (s)
        lines.push(s);
    };
    for (let word of words) {
      while (textWidth(word, font) > maxW) {
        push(cur);
        cur = "";
        let cut = 1;
        while (cut < word.length && textWidth(word.slice(0, cut + 1), font) <= maxW)
          cut++;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const joined = cur ? cur + " " + word : word;
      if (textWidth(joined, font) <= maxW)
        cur = joined;
      else {
        push(cur);
        cur = word;
      }
    }
    push(cur);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      const last = kept[maxLines - 1];
      kept[maxLines - 1] = truncate(last + "…", font, maxW).text;
      return kept;
    }
    return lines;
  }

  // ── theme — 액터 유형→카테고리 매핑·라벨 ──
  var CATEGORY_OF = {
    user: "client",
    browser: "client",
    mobile: "client",
    frontend: "client",
    server: "app",
    service: "app",
    worker: "app",
    auth: "app",
    database: "data",
    cache: "data",
    storage: "data",
    queue: "messaging",
    email: "messaging",
    scheduler: "messaging",
    external: "edge",
    cloud: "edge",
    container: "edge",
    cdn: "edge",
    gateway: "edge"
  };
  var CATEGORY_LABEL = {
    client: "클라이언트",
    app: "애플리케이션",
    data: "데이터",
    messaging: "메시징",
    edge: "외부·인프라"
  };
  var ACTOR_TYPE_LABEL = {
    user: "User",
    browser: "Browser",
    mobile: "Mobile",
    frontend: "Frontend",
    server: "Server",
    service: "Service",
    worker: "Worker",
    auth: "Auth",
    database: "Database",
    cache: "Cache",
    storage: "Storage",
    queue: "Queue",
    email: "Email",
    scheduler: "Scheduler",
    external: "External",
    cloud: "Cloud",
    container: "Container",
    cdn: "CDN",
    gateway: "Gateway"
  };
  var ARROW_LABEL = {
    sync: "동기 호출 (응답 대기)",
    async: "비동기 (fire-and-forget)",
    reply: "응답 / 반환"
  };

  // ── layout — 행 단위 겹침 방지 레이아웃·활성 바·프래그먼트 기하 ──
  var ROW_MSG = 44;
  var ROW_SELF = 60;
  var SELF_W = 38;
  var SELF_H = 18;
  var MAX_LABEL = 300;
  var MAX_SELF_LABEL = 250;
  var CHIP_R = 9;
  var MARGIN_X = 40;
  var TOP_PAD = 18;
  var BOTTOM_PAD = 30;
  var ACTOR_W_MIN = 112;
  var ACTOR_W_MAX = 190;
  var GAP_MIN = 140;
  var NOTE_MAX_W = 224;
  var FRAG_HDR = 34;
  var FRAG_ELSE = 30;
  var FRAG_BOTTOM = 14;
  var FRAG_TOP_GAP = 10;
  var ACT_W = 7;
  function parseTree(steps) {
    const root = [];
    const stack = [];
    const sink = () => {
      const top = stack[stack.length - 1];
      return top ? top.branches[top.branches.length - 1] : root;
    };
    for (const [i, s] of steps.entries()) {
      switch (s.type) {
        case "message":
          sink().push({ t: "msg", s, i });
          break;
        case "note":
          sink().push({ t: "note", s, i });
          break;
        case "fragment": {
          const node = { t: "frag", s, i, branches: [[]], branchLabels: [s.label] };
          sink().push(node);
          stack.push(node);
          break;
        }
        case "fragment_else": {
          const top = stack[stack.length - 1];
          if (top) {
            top.branches.push([]);
            top.branchLabels.push(s.label);
          }
          break;
        }
        case "fragment_end":
          stack.pop();
          break;
      }
    }
    return root;
  }
  function filterTree(nodes, keepAll) {
    const out = [];
    for (const n of nodes) {
      if (n.t === "msg" || n.t === "note") {
        if (keepAll || n.s.essential)
          out.push(n);
      } else {
        const branches = n.branches.map((b) => filterTree(b, keepAll));
        const nonEmpty = branches.some((b) => b.length > 0);
        if (!nonEmpty)
          continue;
        if (keepAll || n.s.essential) {
          const keptBranches = [];
          const keptLabels = [];
          for (let bi = 0;bi < branches.length; bi++) {
            if (branches[bi].length > 0 || bi === 0) {
              keptBranches.push(branches[bi]);
              keptLabels.push(n.branchLabels[bi]);
            }
          }
          out.push({ ...n, branches: keptBranches, branchLabels: keptLabels });
        } else {
          out.push(...branches.flat());
        }
      }
    }
    return out;
  }
  function layoutFlow(flow, mode) {
    const keepAll = mode === "full";
    const tree = filterTree(parseTree(flow.steps), keepAll);
    const flat = [];
    const collect = (nodes) => {
      for (const n2 of nodes) {
        flat.push(n2);
        if (n2.t === "frag")
          n2.branches.forEach(collect);
      }
    };
    collect(tree);
    const msgs = flat.filter((n2) => n2.t === "msg");
    const notes = flat.filter((n2) => n2.t === "note");
    const usedIds = new Set;
    for (const m of msgs) {
      usedIds.add(m.s.from);
      usedIds.add(m.s.to);
    }
    for (const nt of notes)
      usedIds.add(nt.s.actor);
    const actors = flow.actors.filter((a) => usedIds.has(a.id));
    const idx = new Map(actors.map((a, i) => [a.id, i]));
    const n = actors.length;
    const cardW = actors.map((a) => {
      const nameW = textWidth(a.name, FONTS.actorName);
      const badgeW = textWidth(ACTOR_TYPE_LABEL[a.type], FONTS.note) * 0.9;
      return Math.min(ACTOR_W_MAX, Math.max(ACTOR_W_MIN, 12 + 34 + 10 + Math.max(nameW, badgeW) + 14));
    });
    const gapNeed = [];
    for (let i = 0;i < n - 1; i++) {
      gapNeed.push(Math.max(GAP_MIN, cardW[i] / 2 + cardW[i + 1] / 2 + 28));
    }
    const extentRight = new Array(n).fill(0);
    let leftPad = 0;
    let rightPad = 0;
    const applySpan = (lo, hi, need) => {
      if (hi <= lo)
        return;
      const per = need / (hi - lo);
      for (let g = lo;g < hi; g++)
        gapNeed[g] = Math.max(gapNeed[g], per);
    };
    const selfExtent = (m) => SELF_W + 10 + Math.min(textWidth(m.label, FONTS.msgLabel), MAX_SELF_LABEL) + 12;
    const noteBox = (nt) => {
      const lines = wrap(nt.text, FONTS.note, NOTE_MAX_W - 24, 4);
      const w = Math.min(NOTE_MAX_W, Math.max(...lines.map((l) => textWidth(l, FONTS.note)), 40) + 26);
      return { lines, w, h: lines.length * 15 + 16 };
    };
    const interiorDepth = (node) => {
      let d = 0;
      for (const b of node.branches) {
        for (const c of b)
          if (c.t === "frag")
            d = Math.max(d, 1 + interiorDepth(c));
      }
      return d;
    };
    const fragPad = (node) => 12 + interiorDepth(node) * 10;
    const fragRange = (node) => {
      let lo = Infinity;
      let hi = -Infinity;
      const visit = (nodes) => {
        for (const c of nodes) {
          if (c.t === "msg") {
            lo = Math.min(lo, idx.get(c.s.from), idx.get(c.s.to));
            hi = Math.max(hi, idx.get(c.s.from), idx.get(c.s.to));
          } else if (c.t === "note") {
            lo = Math.min(lo, idx.get(c.s.actor));
            hi = Math.max(hi, idx.get(c.s.actor));
          } else
            c.branches.forEach(visit);
        }
      };
      node.branches.forEach(visit);
      return [lo, hi];
    };
    const fragHeaderW = (node) => {
      const pill = textWidth(node.s.kind.toUpperCase(), FONTS.fragKind) + 18;
      const label = Math.min(textWidth(node.s.label, FONTS.fragLabel), 320);
      return pill + 8 + label + 24;
    };
    const collectConstraints = (nodes) => {
      for (const node of nodes) {
        if (node.t === "msg") {
          const a = idx.get(node.s.from);
          const b = idx.get(node.s.to);
          if (a === b) {
            extentRight[a] = Math.max(extentRight[a], selfExtent(node.s));
          } else {
            const labelW = Math.min(textWidth(node.s.label, FONTS.msgLabel), MAX_LABEL);
            applySpan(Math.min(a, b), Math.max(a, b), labelW + CHIP_R * 2 + 40);
          }
        } else if (node.t === "note") {
          const a = idx.get(node.s.actor);
          extentRight[a] = Math.max(extentRight[a], 14 + noteBox(node.s).w);
        } else {
          const [lo, hi] = fragRange(node);
          if (lo === Infinity)
            continue;
          const pad = fragPad(node);
          if (hi > lo)
            applySpan(lo, hi, fragHeaderW(node) + pad * 2);
          else
            extentRight[lo] = Math.max(extentRight[lo], fragHeaderW(node) - pad);
          if (lo > 0)
            gapNeed[lo - 1] = Math.max(gapNeed[lo - 1], pad + cardW[lo - 1] / 2 + 20);
          else
            leftPad = Math.max(leftPad, pad + 8);
          if (hi < n - 1)
            gapNeed[hi] = Math.max(gapNeed[hi], pad + cardW[hi + 1] / 2 + 20);
          else
            rightPad = Math.max(rightPad, pad + 8);
          node.branches.forEach(collectConstraints);
        }
      }
    };
    collectConstraints(tree);
    for (let i = 0;i < n - 1; i++) {
      gapNeed[i] = Math.max(gapNeed[i], extentRight[i] + 24);
    }
    const xs = [];
    let x = MARGIN_X + leftPad + (cardW[0] ?? ACTOR_W_MIN) / 2;
    for (let i = 0;i < n; i++) {
      xs.push(x);
      if (i < n - 1)
        x += gapNeed[i];
    }
    const width = n === 0 ? 320 : Math.ceil(xs[n - 1] + Math.max((cardW[n - 1] ?? 0) / 2, extentRight[n - 1], rightPad) + MARGIN_X);
    const pMessages = [];
    const pNotes = [];
    const pFragments = [];
    let num = 0;
    let y = TOP_PAD;
    const walkY = (nodes, depth) => {
      for (const node of nodes) {
        if (node.t === "msg") {
          const self = node.s.from === node.s.to;
          const rowH = self ? ROW_SELF : ROW_MSG;
          const arrowY = y + 26;
          num++;
          pMessages.push({
            index: node.i,
            step: node.s,
            num,
            rowTop: y,
            rowH,
            y: arrowY,
            x1: xs[idx.get(node.s.from)],
            x2: xs[idx.get(node.s.to)],
            self,
            selfW: SELF_W,
            label: "",
            truncated: false,
            labelX: 0,
            labelAnchor: "middle",
            chipX: 0
          });
          y += rowH;
        } else if (node.t === "note") {
          const { lines, w, h } = noteBox(node.s);
          pNotes.push({
            index: node.i,
            step: node.s,
            x: xs[idx.get(node.s.actor)] + 14,
            y: y + 4,
            w,
            h,
            lines
          });
          y += h + 12;
        } else {
          const [lo, hi] = fragRange(node);
          if (lo === Infinity)
            continue;
          y += FRAG_TOP_GAP;
          const boxTop = y;
          y += FRAG_HDR;
          const dividers = [];
          node.branches.forEach((branch, bi) => {
            if (bi > 0) {
              dividers.push({ y: y + FRAG_ELSE / 2, label: node.branchLabels[bi] });
              y += FRAG_ELSE;
            }
            walkY(branch, depth + 1);
          });
          y += FRAG_BOTTOM;
          const pad = fragPad(node);
          let minX = xs[lo] - pad;
          let maxX = xs[hi] + pad;
          const expand = (nodes2) => {
            for (const c of nodes2) {
              if (c.t === "msg" && c.s.from === c.s.to) {
                maxX = Math.max(maxX, xs[idx.get(c.s.from)] + selfExtent(c.s) + pad - 8);
              } else if (c.t === "note") {
                maxX = Math.max(maxX, xs[idx.get(c.s.actor)] + 14 + noteBox(c.s).w + pad - 8);
              } else if (c.t === "frag")
                c.branches.forEach(expand);
            }
          };
          node.branches.forEach(expand);
          const headerW = fragHeaderW(node);
          if (maxX - minX < headerW)
            maxX = minX + headerW;
          const labelMax = maxX - minX - (textWidth(node.s.kind.toUpperCase(), FONTS.fragKind) + 18) - 32;
          pFragments.push({
            index: node.i,
            step: node.s,
            x: minX,
            y: boxTop,
            w: maxX - minX,
            h: y - boxTop,
            headerH: FRAG_HDR,
            label: truncate(node.s.label, FONTS.fragLabel, Math.max(60, labelMax)).text,
            dividers,
            depth
          });
        }
      }
    };
    walkY(tree, 0);
    const height = Math.ceil(y + BOTTOM_PAD);
    const raw = [];
    const open = new Map;
    for (const m of pMessages) {
      if (m.self)
        continue;
      if (m.step.arrow === "sync") {
        const r = { actorId: m.step.to, y1: m.y, y2: null };
        raw.push(r);
        const stack = open.get(m.step.to) ?? [];
        stack.push(r);
        open.set(m.step.to, stack);
      } else if (m.step.arrow === "reply") {
        const top = open.get(m.step.from)?.pop();
        if (top)
          top.y2 = m.y;
      }
    }
    for (const r of raw)
      if (r.y2 === null)
        r.y2 = r.y1 + 26;
    const activations = [];
    const byActor = new Map;
    for (const r of raw) {
      const list = byActor.get(r.actorId) ?? [];
      list.push(r);
      byActor.set(r.actorId, list);
    }
    for (const [actorId, list] of byActor) {
      list.sort((a, b) => a.y1 - b.y1);
      const laneEnd = [];
      for (const r of list) {
        let lane = laneEnd.findIndex((end) => end <= r.y1);
        if (lane === -1) {
          lane = laneEnd.length;
          laneEnd.push(0);
        }
        laneEnd[lane] = r.y2;
        activations.push({ actorId, x: xs[idx.get(actorId)] + lane * 4, y1: r.y1, y2: r.y2 });
      }
    }
    const actAt = (actorId, yy) => {
      let lanes = -1;
      for (const a of activations) {
        if (a.actorId === actorId && a.y1 <= yy && yy <= a.y2) {
          lanes = Math.max(lanes, (a.x - xs[idx.get(actorId)]) / 4);
        }
      }
      return lanes < 0 ? 0 : lanes * 4 + ACT_W / 2;
    };
    for (const m of pMessages) {
      if (m.self) {
        const off = actAt(m.step.from, m.y);
        m.x1 = m.x2 = xs[idx.get(m.step.from)] + off;
        m.chipX = xs[idx.get(m.step.from)] - 16;
        m.labelX = m.x1 + SELF_W + 10;
        m.labelAnchor = "start";
        const maxW = Math.min(MAX_SELF_LABEL, width - m.labelX - 12);
        const t = truncate(m.step.label, FONTS.msgLabel, maxW);
        m.label = t.text;
        m.truncated = t.truncated;
      } else {
        const xa = xs[idx.get(m.step.from)];
        const xb = xs[idx.get(m.step.to)];
        const dir = xb > xa ? 1 : -1;
        m.x1 = xa + dir * actAt(m.step.from, m.y);
        m.x2 = xb - dir * actAt(m.step.to, m.y);
        m.chipX = m.x1 + dir * 16;
        m.labelX = m.x1 + dir * 30;
        m.labelAnchor = dir > 0 ? "start" : "end";
        const maxW = Math.min(MAX_LABEL, Math.abs(m.x2 - m.x1) - 30 - 14);
        const t = truncate(m.step.label, FONTS.msgLabel, Math.max(48, maxW));
        m.label = t.text;
        m.truncated = t.truncated;
      }
    }
    const totalMsgs = flow.steps.filter((s) => s.type === "message").length;
    return {
      actors: actors.map((a, i) => ({ actor: a, x: xs[i], cardW: cardW[i] })),
      messages: pMessages,
      notes: pNotes,
      fragments: pFragments,
      activations,
      width,
      height,
      hiddenActors: flow.actors.length - actors.length,
      hiddenSteps: totalMsgs - pMessages.length
    };
  }

  // ── icons — 액터 라인 아이콘 19종 ──
  var ICONS = {
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5.5 19.5c1.2-3.4 3.4-5 6.5-5s5.3 1.6 6.5 5"/>',
    browser: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17M6.2 6.8h.01M8.8 6.8h.01"/>',
    mobile: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/>',
    frontend: '<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M9 20.5h6M12 16.5v4"/>',
    server: '<rect x="4" y="4" width="16" height="7" rx="1.8"/><rect x="4" y="13" width="16" height="7" rx="1.8"/><path d="M7.5 7.5h.01M7.5 16.5h.01"/>',
    service: '<circle cx="12" cy="12" r="3.2"/><path d="M12 5.2V3M12 21v-2.2M18.8 12H21M3 12h2.2M16.8 7.2l1.6-1.6M5.6 18.4l1.6-1.6M16.8 16.8l1.6 1.6M5.6 5.6l1.6 1.6"/>',
    worker: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><rect x="10" y="10" width="4" height="4" rx="0.8"/><path d="M9 3.5v3M15 3.5v3M9 17.5v3M15 17.5v3M3.5 9h3M3.5 15h3M17.5 9h3M17.5 15h3"/>',
    auth: '<path d="M12 3l7 2.8v5.4c0 4.5-3 7.6-7 9.3-4-1.7-7-4.8-7-9.3V5.8z"/><path d="M9.2 12l2 2 3.6-3.8"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7" ry="2.7"/><path d="M5 5.5v13c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7v-13"/><path d="M5 12c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7"/>',
    cache: '<path d="M13 3L5.5 13.5H11L10 21l7.7-10.5H12z"/>',
    storage: '<rect x="3.5" y="4" width="17" height="4.5" rx="1.2"/><path d="M5.5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5"/><path d="M10 12.5h4"/>',
    queue: '<path d="M4 6.5h10M4 12h10M4 17.5h10"/><path d="M17.5 9.5L20.5 12l-3 2.5"/>',
    email: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4.5 7.5l7.5 5.5 7.5-5.5"/>',
    scheduler: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2.2"/>',
    external: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5s-1.3 6.1-3.9 8.5c-2.6-2.4-3.9-5.2-3.9-8.5S9.4 5.9 12 3.5z"/>',
    cloud: '<path d="M7 18.5h10a4 4 0 1 0 0-8 5.5 5.5 0 0 0-10.7 1.6A3.2 3.2 0 0 0 7 18.5z"/>',
    container: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    cdn: '<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M10.9 6.9L6.3 16M13.1 6.9l4.6 9.1M7.2 18h9.6"/>',
    gateway: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M4 12h10m0 0l-3.5-3.5M14 12l-3.5 3.5"/>'
  };
  function iconSvg(type, size, cls = "") {
    return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[type]}</svg>`;
  }

  // ── render — SVG 빌더 + SVG 전용 CSS(화면·내보내기 공용) ──
  var NS = "http://www.w3.org/2000/svg";
  var HEADER_H = 84;
  function el(tag, attrs = {}, cls) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs))
      node.setAttribute(k, String(v));
    if (cls)
      node.setAttribute("class", cls);
    return node;
  }
  function text(x, y, content, cls, anchor = "start") {
    const t = el("text", { x, y, "text-anchor": anchor }, cls);
    t.textContent = content;
    return t;
  }
  var FRAG_TINT = {
    alt: "frag-alt",
    loop: "frag-loop",
    opt: "frag-opt",
    par: "frag-par"
  };
  function filledHead(x, y, dir) {
    return el("path", {
      d: `M ${x} ${y} L ${x - 9 * dir} ${y - 4.5} L ${x - 9 * dir} ${y + 4.5} Z`
    }, "head-fill");
  }
  function openHead(x, y, dir) {
    return el("path", {
      d: `M ${x - 8 * dir} ${y - 4.5} L ${x} ${y} L ${x - 8 * dir} ${y + 4.5}`
    }, "head-open");
  }
  function selfLoopPath(x, y, w) {
    const r = 6;
    return [
      `M ${x + 2} ${y}`,
      `H ${x + w - r}`,
      `Q ${x + w} ${y} ${x + w} ${y + r}`,
      `V ${y + SELF_H - r}`,
      `Q ${x + w} ${y + SELF_H} ${x + w - r} ${y + SELF_H}`,
      `H ${x + 4}`
    ].join(" ");
  }
  function buildSvg(layout) {
    const svg = el("svg", {
      width: layout.width,
      height: layout.height,
      viewBox: `0 0 ${layout.width} ${layout.height}`
    }, "diagram");
    svg.setAttribute("xmlns", NS);
    const gFragBox = el("g", {}, "layer-fragboxes");
    const gLife = el("g", {}, "layer-lifelines");
    const gAct = el("g", {}, "layer-activations");
    const gNote = el("g", {}, "layer-notes");
    const gMsg = el("g", {}, "layer-messages");
    const gFragHead = el("g", {}, "layer-fragheads");
    svg.append(gFragBox, gLife, gAct, gNote, gMsg, gFragHead);
    for (const pa of layout.actors) {
      const g = el("g", { "data-actor": pa.actor.id }, "lifeline-g");
      g.append(el("line", { x1: pa.x, y1: 0, x2: pa.x, y2: layout.height - 12 }, "lifeline"), el("line", { x1: pa.x, y1: 0, x2: pa.x, y2: layout.height - 12 }, "lifeline-hit"));
      gLife.append(g);
    }
    for (const a of layout.activations) {
      const actor = layout.actors.find((p) => p.actor.id === a.actorId);
      gAct.append(el("rect", {
        x: a.x - 3.5,
        y: a.y1,
        width: 7,
        height: Math.max(10, a.y2 - a.y1),
        rx: 3,
        "data-actor": a.actorId
      }, `act cat-${CATEGORY_OF[actor.actor.type]}`));
    }
    for (const f of layout.fragments) {
      const tint = FRAG_TINT[f.step.kind];
      gFragBox.append(el("rect", { x: f.x, y: f.y, width: f.w, height: f.h, rx: 8 }, `frag-fill ${tint}`), el("rect", { x: f.x, y: f.y, width: f.w, height: f.h, rx: 8 }, `frag-border ${tint}`));
      for (const d of f.dividers) {
        gFragHead.append(el("line", { x1: f.x, y1: d.y, x2: f.x + f.w, y2: d.y }, "frag-divider"));
        if (d.label) {
          const guard = truncate(d.label, FONTS.fragLabel, Math.max(48, f.w - 90)).text;
          const chipW = 34 + 6 + textWidth(guard, FONTS.fragLabel) + 10;
          const g2 = el("g", {}, `frag-else ${tint}`);
          g2.append(el("rect", { x: f.x + 12, y: d.y - 9, width: chipW, height: 18, rx: 9 }, "frag-chip-bg"), el("rect", { x: f.x + 12, y: d.y - 9, width: chipW, height: 18, rx: 9 }, "frag-chip-tint"), text(f.x + 20, d.y + 3.5, "ELSE", "frag-kind"), text(f.x + 20 + 34, d.y + 3.5, guard, "frag-guard"));
          gFragHead.append(g2);
        }
      }
      const kindTxt = f.step.kind.toUpperCase();
      const pillW = textWidth(kindTxt, FONTS.fragKind) * 1.08 + 18;
      const labelW = f.label ? textWidth(f.label, FONTS.fragLabel) + 10 : 0;
      const g = el("g", { "data-frag": f.index }, `frag-head ${tint}`);
      g.append(el("rect", { x: f.x + 12, y: f.y - 10, width: pillW + labelW, height: 20, rx: 10 }, "frag-chip-bg"), el("rect", { x: f.x + 12, y: f.y - 10, width: pillW + labelW, height: 20, rx: 10 }, "frag-chip-tint"), text(f.x + 12 + 9, f.y + 3.5, kindTxt, "frag-kind"));
      if (f.label)
        g.append(text(f.x + 12 + pillW + 2, f.y + 3.5, f.label, "frag-guard"));
      gFragHead.append(g);
    }
    for (const n of layout.notes) {
      const g = el("g", { "data-idx": n.index }, "note");
      g.append(el("rect", { x: n.x, y: n.y, width: n.w, height: n.h, rx: 6 }, "note-bg"));
      n.lines.forEach((line, i) => {
        g.append(text(n.x + 13, n.y + 19 + i * 15, line, "note-text"));
      });
      gNote.append(g);
    }
    for (const m of layout.messages) {
      const g = el("g", { "data-idx": m.index, "data-num": m.num }, `msg arrow-${m.step.arrow}`);
      const title = el("title");
      title.textContent = `${m.num}. ${m.step.label}${m.step.description ? " — 클릭하여 상세 보기" : ""}`;
      g.append(title);
      if (m.self) {
        const extent = m.selfW + 10 + textWidth(m.label, FONTS.msgLabel) + 14;
        g.append(el("rect", {
          x: m.x1 - 22,
          y: m.rowTop,
          width: extent + 26,
          height: m.rowH
        }, "hit"));
        g.append(el("path", { d: selfLoopPath(m.x1, m.y, m.selfW) }, "msg-line"));
        g.append(openHead(m.x1 + 4, m.y + SELF_H, -1));
        g.append(chip(m.chipX, m.y, m.num));
        g.append(text(m.labelX, m.y + SELF_H / 2 + 4, m.label, `msg-label${m.step.arrow === "reply" ? " reply-label" : ""}`, "start"));
      } else {
        const lo = Math.min(m.x1, m.x2);
        const hi = Math.max(m.x1, m.x2);
        const dir = m.x2 > m.x1 ? 1 : -1;
        g.append(el("rect", { x: lo - 10, y: m.rowTop, width: hi - lo + 20, height: m.rowH }, "hit"));
        g.append(el("line", { x1: m.x1, y1: m.y, x2: m.x2 - dir * 2, y2: m.y }, "msg-line"));
        g.append(m.step.arrow === "sync" ? filledHead(m.x2, m.y, dir) : openHead(m.x2, m.y, dir));
        g.append(chip(m.chipX, m.y, m.num));
        g.append(text(m.labelX, m.y - 8, m.label, `msg-label${m.step.arrow === "reply" ? " reply-label" : ""}`, m.labelAnchor));
      }
      gMsg.append(g);
    }
    return svg;
  }
  function chip(cx, cy, num) {
    const g = el("g", {}, "chip");
    g.append(el("circle", { cx, cy, r: 9 }, "chip-bg"), el("circle", { cx, cy, r: 9 }, "chip-tint"), text(cx, cy + 3.5, String(num), "chip-num", "middle"));
    return g;
  }
  function buildActorHeader(layout) {
    const wrap2 = document.createElement("div");
    wrap2.className = "actor-layer";
    wrap2.style.width = `${layout.width}px`;
    wrap2.style.height = `${HEADER_H}px`;
    for (const pa of layout.actors) {
      const cat = CATEGORY_OF[pa.actor.type];
      const card = document.createElement("button");
      card.className = `actor-card cat-${cat}`;
      card.dataset.actor = pa.actor.id;
      card.style.left = `${pa.x - pa.cardW / 2}px`;
      card.style.width = `${pa.cardW}px`;
      card.title = pa.actor.name;
      card.innerHTML = `
      <span class="actor-icon">${iconSvg(pa.actor.type, 18)}</span>
      <span class="actor-meta">
        <span class="actor-name">${escapeHtml(pa.actor.name)}</span>
        <span class="actor-badge">${ACTOR_TYPE_LABEL[pa.actor.type]}</span>
      </span>`;
      wrap2.append(card);
    }
    return wrap2;
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function buildCardsSvg(layout, tokens) {
    const g = el("g", {}, "export-cards");
    for (const pa of layout.actors) {
      const cat = CATEGORY_OF[pa.actor.type];
      const main = tokens[`--cat-${cat}`] ?? "#888";
      const x = pa.x - pa.cardW / 2;
      const y = 14;
      const cardH = 56;
      const cg = el("g");
      cg.append(el("rect", {
        x,
        y,
        width: pa.cardW,
        height: cardH,
        rx: 9,
        fill: tokens["--surface"] ?? "#fff",
        stroke: tokens["--border"] ?? "#ddd"
      }));
      cg.append(el("rect", {
        x: x + 11,
        y: y + 14,
        width: 28,
        height: 28,
        rx: 7,
        fill: main,
        "fill-opacity": 0.12
      }));
      const icon = el("svg", { x: x + 16, y: y + 19, width: 18, height: 18, viewBox: "0 0 24 24" });
      const ig = el("g", {
        stroke: main,
        fill: "none",
        "stroke-width": 1.75,
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      });
      ig.innerHTML = ICONS[pa.actor.type];
      icon.append(ig);
      cg.append(icon);
      const name = text(x + 47, y + 25, pa.actor.name, "");
      name.setAttribute("style", `font: ${FONTS.actorName}; fill: ${tokens["--text-1"] ?? "#111"}`);
      const badge = text(x + 47, y + 42, ACTOR_TYPE_LABEL[pa.actor.type].toUpperCase(), "");
      badge.setAttribute("style", `font: 600 9px ${"-apple-system, system-ui, sans-serif"}; letter-spacing: .06em; fill: ${main}`);
      cg.append(name, badge);
      g.append(cg);
    }
    return g;
  }
  var SVG_RULES = `
.diagram { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
.lifeline { stroke: var(--lifeline); stroke-width: 1; }
.lifeline-hit { stroke: transparent; stroke-width: 14; cursor: pointer; }
.lifeline-g.sel .lifeline { stroke: var(--hl); stroke-width: 1.5; }
.act { fill: var(--act-fill); stroke: var(--act-stroke); stroke-width: 1; }
.cat-client { --cat: var(--cat-client); }
.cat-app { --cat: var(--cat-app); }
.cat-data { --cat: var(--cat-data); }
.cat-messaging { --cat: var(--cat-messaging); }
.cat-edge { --cat: var(--cat-edge); }
.act.cat-client, .act.cat-app, .act.cat-data, .act.cat-messaging, .act.cat-edge {
  fill: color-mix(in srgb, var(--cat) 13%, transparent);
  stroke: color-mix(in srgb, var(--cat) 42%, transparent);
}
.hit { fill: transparent; cursor: pointer; }
.msg { transition: opacity .15s ease; }
.msg .msg-line { stroke: var(--arrow); stroke-width: 1.5; fill: none; stroke-linecap: round; }
.msg .head-fill { fill: var(--arrow); }
.msg .head-open { stroke: var(--arrow); stroke-width: 1.5; fill: none; stroke-linecap: round; stroke-linejoin: round; }
.msg.arrow-reply .msg-line { stroke: var(--arrow-reply); stroke-dasharray: 4 3; }
.msg.arrow-reply .head-open { stroke: var(--arrow-reply); }
.msg-label { font-size: 12.5px; font-weight: 500; fill: var(--text-1); paint-order: stroke; stroke: var(--canvas); stroke-width: 3.5px; stroke-linejoin: round; }
.reply-label { fill: var(--text-2); }
.chip-bg { fill: var(--canvas); }
.chip-tint { fill: var(--hl); fill-opacity: .12; }
.chip-num { font-size: 10.5px; font-weight: 600; fill: var(--hl); font-variant-numeric: tabular-nums; }
.msg:hover .msg-line, .msg.selected .msg-line, .msg.current .msg-line { stroke: var(--hl); stroke-width: 2; }
.msg:hover .head-fill, .msg.selected .head-fill, .msg.current .head-fill { fill: var(--hl); }
.msg:hover .head-open, .msg.selected .head-open, .msg.current .head-open { stroke: var(--hl); }
.msg:hover .msg-label, .msg.selected .msg-label, .msg.current .msg-label { fill: var(--hl); }
.msg:hover .hit { fill: color-mix(in srgb, var(--hl) 5%, transparent); }
.msg.selected .hit, .msg.current .hit { fill: color-mix(in srgb, var(--hl) 8%, transparent); }
.msg.selected .chip-tint, .msg.current .chip-tint { fill-opacity: 1; }
.msg.selected .chip-num, .msg.current .chip-num { fill: #fff; }
.note-bg { fill: var(--note-fill); stroke: var(--note-border); stroke-width: 1; }
.note-text { font-size: 12px; fill: var(--note-text); }
.frag-fill { fill: var(--frag); opacity: .04; }
.frag-border { fill: none; stroke: var(--frag-border-c); stroke-width: 1; }
.frag-alt { --frag: var(--cat-edge); }
.frag-loop { --frag: var(--cat-client); }
.frag-opt { --frag: var(--text-2); }
.frag-par { --frag: var(--cat-app); }
.frag-border.frag-alt, .frag-border.frag-loop, .frag-border.frag-opt, .frag-border.frag-par { --frag-border-c: color-mix(in srgb, var(--frag) 32%, var(--border)); }
.frag-divider { stroke: var(--border); stroke-dasharray: 4 3; }
.frag-chip-bg { fill: var(--canvas); }
.frag-chip-tint { fill: var(--frag); fill-opacity: .09; stroke: color-mix(in srgb, var(--frag) 28%, transparent); }
.frag-kind { font-size: 10px; font-weight: 700; letter-spacing: .06em; fill: color-mix(in srgb, var(--frag) 82%, var(--text-1)); }
.frag-guard { font-size: 11px; fill: var(--text-2); }
/* 액터 선택 시: 관련 메시지 외 침강 */
.diagram.sel-actor .msg:not(.touch), .diagram.sel-actor .note { opacity: .22; }
/* 둘러보기(step-through) 모드 */
.diagram.stepmode .msg.future { opacity: .13; }
.diagram.stepmode .note { opacity: .35; }
`;

  // ── types — SeqSpec 런타임 검증 ──
  function validateFlow(flow) {
    const problems = [];
    const ids = new Set(flow.actors.map((a) => a.id));
    if (ids.size !== flow.actors.length)
      problems.push(`중복된 actor id가 있습니다`);
    let depth = 0;
    const used = new Set;
    for (const [i, step] of flow.steps.entries()) {
      const at = `steps[${i}]`;
      switch (step.type) {
        case "message":
          for (const ref of [step.from, step.to]) {
            if (!ids.has(ref))
              problems.push(`${at}: 알 수 없는 actor "${ref}"`);
          }
          used.add(step.from);
          used.add(step.to);
          break;
        case "note":
          if (!ids.has(step.actor))
            problems.push(`${at}: 알 수 없는 actor "${step.actor}"`);
          break;
        case "fragment":
          depth++;
          break;
        case "fragment_else":
          if (depth === 0)
            problems.push(`${at}: fragment 밖의 fragment_else`);
          break;
        case "fragment_end":
          if (depth === 0)
            problems.push(`${at}: 짝이 없는 fragment_end`);
          else
            depth--;
          break;
      }
    }
    if (depth !== 0)
      problems.push(`닫히지 않은 fragment가 ${depth}개 있습니다`);
    for (const a of flow.actors) {
      if (!used.has(a.id))
        problems.push(`actor "${a.id}"가 어떤 메시지에도 등장하지 않습니다`);
    }
    return problems;
  }

  // ── embed — 뷰어 셸(툴바·패널·둘러보기)·zzon 셸 프로토콜·내보내기 ──
  var EMBED_CSS = `
:root[data-theme="light"] {
  --canvas: #ffffff; --surface: #ffffff; --surface-2: #f4f4f5;
  --border: #e4e4e7; --border-2: #ececee; --lifeline: #d4d4d8;
  --text-1: #09090b; --text-2: #71717a;
  --arrow: #52525b; --arrow-reply: #8e8e96;
  --hl: #4F46E5; --hl-wash: #EEF2FF;
  --note-fill: #FFFBEB; --note-border: #FDE68A; --note-text: #78350F;
  --cat-client: #2a78d6; --cat-app: #1baf7a; --cat-data: #eda100;
  --cat-messaging: #008300; --cat-edge: #4a3aa7;
  --badge-mix: black; --badge-pct: 68%;
  --shadow-card: 0 1px 2px rgba(0,0,0,.05);
}
:root[data-theme="dark"] {
  --canvas: #09090b; --surface: #0f0f11; --surface-2: #1c1c1f;
  --border: #27272a; --border-2: #202023; --lifeline: #33363c;
  --text-1: #fafafa; --text-2: #a1a1aa;
  --arrow: #a1a7b0; --arrow-reply: #6b7078;
  --hl: #7B87E0; --hl-wash: #2A2E4A;
  --note-fill: #FBBF2414; --note-border: #FBBF243D; --note-text: #FDE68A;
  --cat-client: #3987e5; --cat-app: #199e70; --cat-data: #c98500;
  --cat-messaging: #008300; --cat-edge: #9085e9;
  --badge-mix: white; --badge-pct: 78%;
  --shadow-card: none;
}
.cat-client { --cat: var(--cat-client); } .cat-app { --cat: var(--cat-app); }
.cat-data { --cat: var(--cat-data); } .cat-messaging { --cat: var(--cat-messaging); }
.cat-edge { --cat: var(--cat-edge); }

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", Roboto, sans-serif;
  color: var(--text-1); background: var(--canvas); font-size: 13px; line-height: 1.45;
  overflow: hidden; -webkit-font-smoothing: antialiased;
}
button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }
code { font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace; }

#seq-app { display: flex; flex-direction: column; height: 100vh; }

/* ── 툴바 (컴팩트 — iframe 440px 높이 고려) ── */
#seq-toolbar {
  flex: none; height: 44px; display: flex; align-items: center; gap: 8px;
  padding: 0 10px; background: var(--surface); border-bottom: 1px solid var(--border-2);
}
#seq-title { min-width: 0; margin-right: auto; }
#seq-title h1 { font-size: 13px; font-weight: 650; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#seq-title p { font-size: 10.5px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.seg { display: flex; background: var(--surface-2); border-radius: 7px; padding: 2px; flex: none; }
.seg button { padding: 2.5px 9px; font-size: 11.5px; border-radius: 5px; color: var(--text-2); }
.seg button.on { background: var(--surface); color: var(--text-1); font-weight: 600; box-shadow: var(--shadow-card); }
.tbtn {
  height: 26px; min-width: 26px; padding: 0 6px; border-radius: 6px; display: inline-flex;
  align-items: center; justify-content: center; gap: 4px; color: var(--text-2); flex: none;
  transition: background .12s, color .12s;
}
.tbtn:hover { background: var(--surface-2); color: var(--text-1); }
.tbtn.txt { font-size: 10.5px; font-weight: 600; }
.tbtn.on { color: var(--hl); background: var(--hl-wash); }
#zoom-val { font-size: 10.5px; color: var(--text-2); min-width: 34px; text-align: center; font-variant-numeric: tabular-nums; flex: none; }
.tb-sep { width: 1px; height: 16px; background: var(--border); flex: none; }
@media (max-width: 640px) { #seq-title p, #zoom-val { display: none; } }

/* ── 캔버스 ── */
#seq-stage { flex: 1; position: relative; min-height: 0; }
#canvas { position: absolute; inset: 0; overflow: auto; transition: right .2s ease; }
#seq-stage.drawer-open #canvas { right: min(320px, 88%); }
#diagram-w { position: relative; width: max-content; min-width: 100%; }
.actor-layer {
  position: sticky; top: 0; z-index: 10;
  background: color-mix(in srgb, var(--canvas) 84%, transparent);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border-2);
}
.actor-card {
  position: absolute; top: 14px; height: 56px; display: flex; gap: 9px; align-items: center;
  padding: 0 11px; background: var(--surface); border: 1px solid var(--border); border-radius: 9px;
  box-shadow: var(--shadow-card); text-align: left; transition: border-color .15s, box-shadow .15s;
}
.actor-card:hover { border-color: color-mix(in srgb, var(--cat) 50%, var(--border)); }
.actor-card.sel { border-color: var(--hl); box-shadow: 0 0 0 3px var(--hl-wash); }
.actor-icon {
  width: 28px; height: 28px; border-radius: 7px; display: grid; place-items: center; flex: none;
  background: color-mix(in srgb, var(--cat) 12%, transparent); color: var(--cat);
}
.actor-meta { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.actor-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.actor-badge {
  align-self: flex-start; font-size: 9px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  padding: 1px 6px; border-radius: 999px;
  background: color-mix(in srgb, var(--cat) 10%, transparent);
  color: color-mix(in oklab, var(--cat) var(--badge-pct), var(--badge-mix));
}
#diagram-svg-holder { line-height: 0; }

/* ── 둘러보기 필 ── */
#step-pill {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); z-index: 20;
  display: flex; align-items: center; gap: 3px; padding: 4px 7px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 999px;
  box-shadow: 0 6px 20px rgba(0,0,0,.14); font-size: 11.5px;
}
#step-pill[hidden] { display: none; }
#step-pill button { border-radius: 999px; height: 24px; min-width: 24px; padding: 0 7px; color: var(--text-2); }
#step-pill button:hover { background: var(--surface-2); color: var(--text-1); }
#step-count { font-variant-numeric: tabular-nums; font-weight: 600; padding: 0 5px; }

/* ── 상세 패널 (오버레이) ── */
#drawer {
  position: absolute; top: 0; right: 0; bottom: 0; width: min(320px, 88%); z-index: 30;
  background: var(--surface); border-left: 1px solid var(--border-2);
  display: flex; flex-direction: column;
  transform: translateX(102%); transition: transform .2s ease;
  box-shadow: -10px 0 28px rgba(0,0,0,.12);
}
#drawer.open { transform: translateX(0); }
@media (prefers-reduced-motion: reduce) { #drawer { transition: none; } }
#drawer-head {
  flex: none; height: 40px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 12px; border-bottom: 1px solid var(--border-2); font-weight: 700; font-size: 12.5px;
}
#drawer-body { flex: 1; overflow-y: auto; padding: 13px 14px; }
.dw-kind {
  display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700;
  letter-spacing: .05em; padding: 2px 8px; border-radius: 999px;
  background: var(--hl-wash); color: var(--hl); margin-bottom: 9px;
}
.dw-title { font-size: 14px; font-weight: 700; letter-spacing: -.01em; margin-bottom: 6px; overflow-wrap: anywhere; }
.dw-desc { color: var(--text-2); font-size: 12px; margin-bottom: 12px; }
.dw-sec { font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-2); margin: 14px 0 7px; }
.dw-actor-row { display: flex; gap: 8px; width: 100%; text-align: left; padding: 6px 7px; border-radius: 7px; align-items: flex-start; }
.dw-actor-row:hover { background: var(--surface-2); }
.dw-actor-row .actor-icon { width: 24px; height: 24px; border-radius: 6px; }
.dw-ar-name { font-size: 12px; font-weight: 600; }
.dw-ar-desc { font-size: 11px; color: var(--text-2); margin-top: 1px; }
.dw-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.dw-nav-count { font-size: 11.5px; color: var(--text-2); font-variant-numeric: tabular-nums; }
.dw-nav button { height: 24px; min-width: 24px; border-radius: 6px; color: var(--text-2); border: 1px solid var(--border); }
.dw-nav button:hover:not(:disabled) { background: var(--surface-2); color: var(--text-1); }
.dw-nav button:disabled { opacity: .35; cursor: default; }
.dw-route { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; flex-wrap: wrap; }
.dw-route-node {
  display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 7px;
  border: 1px solid var(--border); background: var(--canvas); font-size: 11.5px; font-weight: 600;
}
.dw-route-node .ric { color: var(--cat); display: grid; place-items: center; }
.dw-route-arrow { color: var(--text-2); flex: none; }
.dw-pills { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 10px; }
.dw-pill { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; background: var(--surface-2); color: var(--text-2); }
.dw-pill.hl { background: var(--hl-wash); color: var(--hl); }
.dw-label { font-size: 12.5px; font-weight: 700; overflow-wrap: anywhere; margin-bottom: 9px; }
.dw-src { display: block; font-size: 10.5px; padding: 7px 9px; border-radius: 7px; overflow-wrap: anywhere; background: var(--surface-2); color: var(--text-2); margin-top: 10px; }
.dw-src b { color: var(--text-1); font-weight: 600; }
.dw-msg-row { display: flex; gap: 7px; width: 100%; text-align: left; padding: 5px 7px; border-radius: 6px; font-size: 11.5px; align-items: baseline; }
.dw-msg-row:hover { background: var(--surface-2); }
.dw-msg-num { flex: none; font-size: 10px; font-weight: 600; color: var(--hl); font-variant-numeric: tabular-nums; width: 18px; }
.dw-msg-label { overflow-wrap: anywhere; }

::-webkit-scrollbar { width: 9px; height: 9px; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 5px; border: 2px solid transparent; background-clip: padding-box; }
::-webkit-scrollbar-corner { background: transparent; }
`;
  var state = {
    mode: "full",
    sel: null,
    step: -1,
    zoom: 1
  };
  var spec;
  var layout;
  var svgNode;
  var $ = (sel) => document.querySelector(sel);
  var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function boot() {
    const holder = document.getElementById("zzon-seq-spec");
    if (!holder?.textContent) {
      document.body.textContent = "zzon-seq: 스펙(#zzon-seq-spec)을 찾을 수 없다.";
      return;
    }
    spec = JSON.parse(holder.textContent);
    const problems = validateFlow(spec);
    if (problems.length)
      console.warn("[zzon-seq]", problems);
    const style = document.createElement("style");
    style.textContent = EMBED_CSS + SVG_RULES;
    document.head.append(style);
    let theme = null;
    try {
      theme = localStorage.getItem("zzon-theme");
    } catch {}
    if (!theme)
      theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(theme === "dark" ? "dark" : "light", false);
    document.body.innerHTML = `
  <div id="seq-app">
    <div id="seq-toolbar">
      <div id="seq-title">
        <h1>${esc(spec.title)}</h1>
        ${spec.subtitle ? `<p>${esc(spec.subtitle)}</p>` : ""}
      </div>
      <div class="seg" id="mode-seg">
        <button data-mode="full" class="on" title="모든 단계 표시">전체</button>
        <button data-mode="simple" title="핵심 단계만 표시">간소화</button>
      </div>
      <button class="tbtn" id="btn-play" title="둘러보기 — 단계를 하나씩 재생 (←/→)">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>
      </button>
      <span class="tb-sep"></span>
      <button class="tbtn" id="btn-zoom-out" title="축소">−</button>
      <span id="zoom-val">100%</span>
      <button class="tbtn" id="btn-zoom-in" title="확대">+</button>
      <span class="tb-sep"></span>
      <button class="tbtn" id="btn-theme" title="다크/라이트"></button>
      <button class="tbtn txt" id="btn-export-svg" title="SVG로 내보내기">SVG</button>
      <button class="tbtn txt" id="btn-export-png" title="PNG로 내보내기">PNG</button>
      <button class="tbtn" id="btn-drawer" title="상세 패널">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg>
      </button>
    </div>
    <div id="seq-stage">
      <div id="canvas"><div id="diagram-w"></div></div>
      <div id="step-pill" hidden>
        <button id="step-prev" title="이전 단계 (←)">←</button>
        <span id="step-count"></span>
        <button id="step-next" title="다음 단계 (→)">→</button>
        <button id="step-exit">종료</button>
      </div>
      <aside id="drawer">
        <div id="drawer-head"><span>개요</span><button class="tbtn" id="drawer-close">✕</button></div>
        <div id="drawer-body"></div>
      </aside>
    </div>
  </div>`;
    bindToolbar();
    bindKeyboard();
    bindShellProtocol();
    renderFlow();
    // 뷰포트보다 다이어그램이 넓으면 자동 fit-to-width — 임베드(작은 iframe)에서 처음부터 전체 폭이 보이게
    const vw = $("#canvas").clientWidth;
    if (vw > 0 && layout && layout.width > vw) setZoom(vw / layout.width);
  }
  function renderFlow() {
    layout = layoutFlow(spec, state.mode);
    document.querySelectorAll("#mode-seg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === state.mode));
    const holder = $("#diagram-w");
    holder.replaceChildren(buildActorHeader(layout));
    const svgHolder = document.createElement("div");
    svgHolder.id = "diagram-svg-holder";
    svgNode = buildSvg(layout);
    svgHolder.append(svgNode);
    holder.append(svgHolder);
    svgNode.addEventListener("click", (e) => {
      const t = e.target;
      const msg = t.closest(".msg");
      if (msg) {
        onMsgClick(Number(msg.getAttribute("data-idx")));
        return;
      }
      const life = t.closest(".lifeline-g");
      if (life) {
        toggleActor(life.getAttribute("data-actor"));
        return;
      }
      clearSel();
    });
    holder.querySelector(".actor-layer").addEventListener("click", (e) => {
      const card = e.target.closest(".actor-card");
      if (card)
        toggleActor(card.dataset.actor);
    });
    if (state.sel?.kind === "msg" && !layout.messages.some((m) => m.index === state.sel.index))
      state.sel = null;
    if (state.sel?.kind === "actor" && !layout.actors.some((a) => a.actor.id === state.sel.id))
      state.sel = null;
    applySelClasses();
    if (state.step >= 0) {
      if (state.step >= layout.messages.length)
        state.step = Math.max(0, layout.messages.length - 1);
      applyStep(false);
    }
    updateDrawer();
  }
  function onMsgClick(index) {
    if (state.step >= 0) {
      const m = layout.messages.find((mm) => mm.index === index);
      if (m) {
        state.step = m.num - 1;
        applyStep(false);
      }
      return;
    }
    state.sel = state.sel?.kind === "msg" && state.sel.index === index ? null : { kind: "msg", index };
    applySelClasses();
    updateDrawer();
    if (state.sel)
      openDrawer();
  }
  function toggleActor(id) {
    if (state.step >= 0)
      return;
    state.sel = state.sel?.kind === "actor" && state.sel.id === id ? null : { kind: "actor", id };
    applySelClasses();
    updateDrawer();
    if (state.sel)
      openDrawer();
  }
  function clearSel() {
    if (!state.sel)
      return;
    state.sel = null;
    applySelClasses();
    updateDrawer();
  }
  function applySelClasses() {
    const selMsg = state.sel?.kind === "msg" ? state.sel.index : null;
    const selActor = state.sel?.kind === "actor" ? state.sel.id : null;
    svgNode.classList.toggle("sel-actor", selActor !== null);
    svgNode.querySelectorAll(".msg").forEach((g) => {
      const idx = Number(g.getAttribute("data-idx"));
      g.classList.toggle("selected", idx === selMsg);
      if (selActor !== null) {
        const m = layout.messages.find((mm) => mm.index === idx);
        g.classList.toggle("touch", !!m && (m.step.from === selActor || m.step.to === selActor));
      } else
        g.classList.remove("touch");
    });
    svgNode.querySelectorAll(".lifeline-g").forEach((g) => g.classList.toggle("sel", g.getAttribute("data-actor") === selActor));
    document.querySelectorAll(".actor-card").forEach((c) => c.classList.toggle("sel", c.dataset.actor === selActor));
  }
  function enterStep() {
    if (layout.messages.length === 0)
      return;
    state.sel = null;
    applySelClasses();
    state.step = 0;
    applyStep(true);
  }
  function exitStep() {
    state.step = -1;
    $("#btn-play").classList.remove("on");
    $("#step-pill").hidden = true;
    if (svgNode) {
      svgNode.classList.remove("stepmode");
      svgNode.querySelectorAll(".msg").forEach((g) => g.classList.remove("future", "current"));
      updateDrawer();
    }
  }
  function applyStep(scroll) {
    svgNode.classList.add("stepmode");
    $("#step-pill").hidden = false;
    $("#btn-play").classList.add("on");
    let currentEl = null;
    svgNode.querySelectorAll(".msg").forEach((g) => {
      const num = Number(g.getAttribute("data-num"));
      g.classList.toggle("future", num - 1 > state.step);
      const cur = num - 1 === state.step;
      g.classList.toggle("current", cur);
      if (cur)
        currentEl = g;
    });
    $("#step-count").textContent = `${state.step + 1} / ${layout.messages.length}`;
    if (scroll && currentEl)
      currentEl.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    const m = layout.messages.find((mm) => mm.num - 1 === state.step);
    if (m) {
      drawerMsg(m);
      openDrawer();
    }
  }
  function stepMove(delta) {
    if (state.step < 0)
      return;
    const next = state.step + delta;
    if (next < 0 || next >= layout.messages.length)
      return;
    state.step = next;
    applyStep(true);
  }
  function openDrawer() {
    const d = $("#drawer");
    if (!d.classList.contains("open")) {
      d.classList.add("open");
      $("#seq-stage").classList.add("drawer-open"); // 캔버스를 드로어 폭만큼 줄인다 (가림 방지)
      postToShell({ type: "zzon:sidebar", open: true });
    }
  }
  function closeDrawer() {
    const d = $("#drawer");
    if (d.classList.contains("open")) {
      d.classList.remove("open");
      $("#seq-stage").classList.remove("drawer-open");
      postToShell({ type: "zzon:sidebar", open: false });
    }
  }
  function postToShell(msg) {
    try {
      if (window.parent && window.parent !== window)
        window.parent.postMessage(msg, "*");
    } catch {}
  }
  function bindShellProtocol() {
    addEventListener("message", (e) => {
      const d = e.data;
      if (d && d.type === "zzon:sidebar-close") {
        closeDrawer();
        if (state.step >= 0)
          exitStep();
        else
          clearSel();
      }
    });
  }
  function updateDrawer() {
    if (state.step >= 0)
      return;
    if (state.sel?.kind === "msg") {
      const m = layout.messages.find((mm) => mm.index === state.sel.index);
      if (m) {
        drawerMsg(m);
        return;
      }
    }
    if (state.sel?.kind === "actor") {
      const a = layout.actors.find((pa) => pa.actor.id === state.sel.id);
      if (a) {
        drawerActor(a.actor);
        return;
      }
    }
    drawerOverview();
  }
  function drawerOverview() {
    const actorRows = layout.actors.map(({ actor }) => actorRow(actor)).join("");
    $("#drawer-head").firstElementChild.textContent = "개요";
    $("#drawer-body").innerHTML = `
    <span class="dw-kind">시퀀스 다이어그램</span>
    <div class="dw-title">${esc(spec.title)}</div>
    <p class="dw-desc">${esc(spec.description ?? "")}</p>
    <div class="dw-sec">액터 ${layout.actors.length}</div>${actorRows}`;
    bindActorRows();
  }
  function actorRow(actor) {
    const cat = CATEGORY_OF[actor.type];
    return `<button class="dw-actor-row cat-${cat}" data-actor="${esc(actor.id)}">
    <span class="actor-icon">${iconSvg(actor.type, 14)}</span>
    <span>
      <div class="dw-ar-name">${esc(actor.name)}
        <span class="actor-badge">${ACTOR_TYPE_LABEL[actor.type]}</span></div>
      ${actor.description ? `<div class="dw-ar-desc">${esc(actor.description)}</div>` : ""}
    </span></button>`;
  }
  function bindActorRows() {
    document.querySelectorAll(".dw-actor-row").forEach((r) => r.addEventListener("click", () => toggleActor(r.dataset.actor)));
  }
  function drawerMsg(m) {
    const from = spec.actors.find((a) => a.id === m.step.from);
    const to = spec.actors.find((a) => a.id === m.step.to);
    const node = (a) => `<span class="dw-route-node cat-${CATEGORY_OF[a.type]}">
    <span class="ric">${iconSvg(a.type, 12)}</span>${esc(a.name)}</span>`;
    const stepping = state.step >= 0;
    $("#drawer-head").firstElementChild.textContent = stepping ? "둘러보기" : "단계 상세";
    $("#drawer-body").innerHTML = `
    <div class="dw-nav">
      <span class="dw-nav-count">단계 ${m.num} / ${layout.messages.length}</span>
      <span style="display:flex;gap:4px">
        <button id="dw-prev" ${m.num <= 1 ? "disabled" : ""} title="이전 단계 (←)">←</button>
        <button id="dw-next" ${m.num >= layout.messages.length ? "disabled" : ""} title="다음 단계 (→)">→</button>
      </span>
    </div>
    <div class="dw-route">${node(from)}<span class="dw-route-arrow">${m.self ? "↻" : "→"}</span>${m.self ? '<span class="dw-pill">자기 자신</span>' : node(to)}</div>
    <div class="dw-pills">
      <span class="dw-pill">${ARROW_LABEL[m.step.arrow]}</span>
      <span class="dw-pill${m.step.essential ? " hl" : ""}">${m.step.essential ? "핵심 단계" : "상세 단계"}</span>
    </div>
    <div class="dw-label">${esc(m.step.label)}</div>
    ${m.step.description ? `<p class="dw-desc">${esc(m.step.description)}</p>` : ""}
    ${m.step.sourceRef ? `<code class="dw-src"><b>근거 코드</b><br>${esc(m.step.sourceRef)}</code>` : ""}`;
    $("#dw-prev")?.addEventListener("click", () => navMsg(-1, m));
    $("#dw-next")?.addEventListener("click", () => navMsg(1, m));
  }
  function navMsg(delta, from) {
    if (state.step >= 0) {
      stepMove(delta);
      return;
    }
    const target = layout.messages.find((mm) => mm.num === from.num + delta);
    if (!target)
      return;
    state.sel = { kind: "msg", index: target.index };
    applySelClasses();
    drawerMsg(target);
    svgNode.querySelector(`.msg[data-idx="${target.index}"]`)?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }
  function drawerActor(actor) {
    const involved = layout.messages.filter((m) => m.step.from === actor.id || m.step.to === actor.id);
    const rows = involved.map((m) => `<button class="dw-msg-row" data-idx="${m.index}">
      <span class="dw-msg-num">${m.num}</span>
      <span class="dw-msg-label">${esc(m.step.label)}</span></button>`).join("");
    const cat = CATEGORY_OF[actor.type];
    $("#drawer-head").firstElementChild.textContent = "액터 상세";
    $("#drawer-body").innerHTML = `
    <div class="dw-route" style="margin-bottom:7px">
      <span class="dw-route-node cat-${cat}"><span class="ric">${iconSvg(actor.type, 12)}</span>${esc(actor.name)}</span>
      <span class="dw-pill">${ACTOR_TYPE_LABEL[actor.type]}</span>
      <span class="dw-pill">${CATEGORY_LABEL[cat]}</span>
    </div>
    ${actor.description ? `<p class="dw-desc">${esc(actor.description)}</p>` : ""}
    <div class="dw-sec">참여 단계 ${involved.length}</div>${rows}`;
    document.querySelectorAll(".dw-msg-row").forEach((r) => r.addEventListener("click", () => {
      const idx = Number(r.dataset.idx);
      state.sel = { kind: "msg", index: idx };
      applySelClasses();
      updateDrawer();
      svgNode.querySelector(`.msg[data-idx="${idx}"]`)?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }));
  }
  function bindToolbar() {
    document.querySelectorAll("#mode-seg button").forEach((b) => b.addEventListener("click", () => {
      const mode = b.dataset.mode;
      if (mode !== state.mode) {
        state.mode = mode;
        renderFlow();
      }
    }));
    $("#btn-play").addEventListener("click", () => state.step >= 0 ? exitStep() : enterStep());
    $("#step-prev").addEventListener("click", () => stepMove(-1));
    $("#step-next").addEventListener("click", () => stepMove(1));
    $("#step-exit").addEventListener("click", () => exitStep());
    $("#btn-zoom-in").addEventListener("click", () => setZoom(state.zoom + 0.1));
    $("#btn-zoom-out").addEventListener("click", () => setZoom(state.zoom - 0.1));
    $("#btn-theme").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      setTheme(next, true);
    });
    $("#btn-export-svg").addEventListener("click", () => {
      download(`${slugName()}-${state.mode}.svg`, new Blob([exportSvgString()], { type: "image/svg+xml" }));
    });
    $("#btn-export-png").addEventListener("click", exportPng);
    $("#btn-drawer").addEventListener("click", () => {
      const d = $("#drawer");
      d.classList.contains("open") ? closeDrawer() : openDrawer();
    });
    $("#drawer-close").addEventListener("click", closeDrawer);
  }
  function bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT")
        return;
      if (e.key === "Escape") {
        if (state.step >= 0)
          exitStep();
        else if ($("#drawer").classList.contains("open")) {
          closeDrawer();
          clearSel();
        } else
          clearSel();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const delta = e.key === "ArrowRight" ? 1 : -1;
        if (state.step >= 0) {
          e.preventDefault();
          stepMove(delta);
        } else if (state.sel?.kind === "msg") {
          const m = layout.messages.find((mm) => mm.index === state.sel.index);
          if (m) {
            e.preventDefault();
            navMsg(delta, m);
          }
        }
      }
    });
  }
  function setZoom(z) {
    // 하한 0.3: 좁은 임베드에서 fit-to-width가 가능해야 한다 (0.05 단위 내림 — 폭 초과 방지)
    state.zoom = Math.min(1.6, Math.max(0.3, Math.floor(z * 20) / 20));
    $("#diagram-w").style.zoom = String(state.zoom);
    $("#zoom-val").textContent = `${Math.round(state.zoom * 100)}%`;
  }
  function setTheme(theme, persist) {
    document.documentElement.dataset.theme = theme;
    if (persist) {
      try {
        localStorage.setItem("zzon-theme", theme);
      } catch {}
    }
    const btn = document.getElementById("btn-theme");
    if (btn)
      btn.innerHTML = theme === "dark" ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>';
  }
  var TOKEN_NAMES = [
    "--canvas",
    "--surface",
    "--surface-2",
    "--border",
    "--border-2",
    "--lifeline",
    "--text-1",
    "--text-2",
    "--arrow",
    "--arrow-reply",
    "--hl",
    "--hl-wash",
    "--note-fill",
    "--note-border",
    "--note-text",
    "--cat-client",
    "--cat-app",
    "--cat-data",
    "--cat-messaging",
    "--cat-edge"
  ];
  function slugName() {
    return spec.slug ?? "sequence";
  }
  function resolvedTokens() {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const t of TOKEN_NAMES)
      out[t] = cs.getPropertyValue(t).trim();
    return out;
  }
  function exportSvgString() {
    const tokens = resolvedTokens();
    const NS2 = "http://www.w3.org/2000/svg";
    const root = document.createElementNS(NS2, "svg");
    const w = layout.width;
    const h = layout.height + HEADER_H;
    root.setAttribute("xmlns", NS2);
    root.setAttribute("width", String(w));
    root.setAttribute("height", String(h));
    root.setAttribute("viewBox", `0 0 ${w} ${h}`);
    root.setAttribute("class", "diagram");
    const style = document.createElementNS(NS2, "style");
    const vars = TOKEN_NAMES.map((t) => `${t}: ${tokens[t]};`).join(" ");
    style.textContent = `svg { ${vars} } ${SVG_RULES}`;
    root.append(style);
    const bg = document.createElementNS(NS2, "rect");
    bg.setAttribute("width", String(w));
    bg.setAttribute("height", String(h));
    bg.setAttribute("fill", tokens["--canvas"] ?? "#fff");
    root.append(bg);
    root.append(buildCardsSvg(layout, tokens));
    const content = document.createElementNS(NS2, "g");
    content.setAttribute("transform", `translate(0, ${HEADER_H})`);
    for (const child of svgNode.children) {
      if (child.tagName === "style")
        continue;
      content.append(child.cloneNode(true));
    }
    content.querySelectorAll(".msg, .lifeline-g").forEach((g) => g.classList.remove("selected", "current", "future", "touch", "sel"));
    root.append(content);
    return new XMLSerializer().serializeToString(root);
  }
  function exportPng() {
    const svgStr = exportSvgString();
    const url = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml" }));
    const img = new Image;
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = layout.width * scale;
      canvas.height = (layout.height + HEADER_H) * scale;
      const ctx2 = canvas.getContext("2d");
      ctx2.scale(scale, scale);
      ctx2.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob)
          download(`${slugName()}-${state.mode}.png`, blob);
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      console.error("[zzon-seq] PNG 내보내기 실패: SVG 이미지를 로드하지 못했다");
    };
    img.src = url;
  }
  function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  boot();
})();
