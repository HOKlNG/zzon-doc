/**
 * Bottom-up layout composition (DESIGN.md §3 [2]-[4]): sizes every container
 * recursively (grid custom / ELK pack / ELK layered), then places everything
 * into absolute canvas coordinates, emitting the Scene (minus edge geometry —
 * the global router fills scene.edges afterwards).
 */
import type {
  ActorEl,
  BandEl,
  DiagramModel,
  Edge,
  Element,
  GroupEl,
  NodeEl,
  Overlay,
  RailItem,
} from "../model/types.ts";
import type { Rect } from "../model/geometry.ts";
import { rectInflate, rectUnionAll } from "../model/geometry.ts";
import type { Scene, SceneGroup, SceneNode } from "./scene.ts";
import {
  ACTOR_ICON,
  NODE_ICON,
  RAIL_ICON,
  GROUP_LABEL_SIZE,
  LABEL_SIZE,
  SUBLABEL_SIZE,
  groupChrome,
  groupTitleMinWidth,
  makeLabel,
  sizeNode,
  type NodeVisual,
} from "./sizing.ts";
import { layoutGrid, type SizedChild } from "./grid.ts";
import { placeLayered, placePack, type ChildBox, type ChildEdge } from "./elk-adapter.ts";
import { GROUP_STYLES } from "../render/group-styles.ts";
import { sizeTable, makeSceneTable } from "../render/table.ts";
import { sizeCard, CARD_CATEGORY_META } from "../render/card.ts";

const CANVAS_MARGIN = 32;
const ACTOR_GAP = 48;
const BAND_GAP = 56;
const STACK_OFFSET = 5;

interface Laid {
  path: string;
  width: number;
  height: number;
  place: (ox: number, oy: number) => void;
}

export async function layoutDiagram(model: DiagramModel): Promise<Scene> {
  const scene: Scene = {
    id: model.id,
    title: model.title,
    docKind: model.docKind,
    width: 0,
    height: 0,
    groups: [],
    overlays: [],
    edges: [],
    nodes: [],
    markers: [],
    flows: [],
    icons: [],
    texts: [],
  };
  const rectByPath = new Map<string, Rect>();
  const genericOverlays: Overlay[] = [];
  const gridHandled = new Set<string>();

  // ---------------------------------------------------------------- nodes

  function layNode(el: NodeEl | RailItem | ActorEl, role: SceneNode["role"], iconSize: number): Laid {
    const asNode = el as NodeEl;
    if (asNode.table) return layTable(asNode);
    if (asNode.category) return layCard(asNode);
    const visual: NodeVisual = sizeNode(
      { label: el.label, sublabel: asNode.sublabel, badges: asNode.badges },
      iconSize,
    );
    const stack = stackCount(asNode.stack);
    const width = visual.width + (stack ? STACK_OFFSET * stack : 0);
    const height = visual.height + (stack ? STACK_OFFSET * stack : 0);
    return {
      path: el.path,
      width,
      height,
      place: (ox, oy) => {
        const rect = { x: ox, y: oy, width: visual.width, height: visual.height };
        rectByPath.set(el.path, rect);
        const node: SceneNode = {
          kind: "node",
          path: el.path,
          rect,
          icon: el.icon,
          iconRect: el.icon ? shift(visual.iconRect, ox, oy) : undefined,
          category: (el as NodeEl).category,
          tech: (el as NodeEl).tech,
          description: (el as NodeEl).description,
          href: (el as NodeEl).href,
          role,
          stack: stack || undefined,
          meta: asNode.meta,
        };
        if (visual.labelLines && el.label) {
          node.label = makeLabel(el.label, ox + visual.width / 2, oy + (visual.labelY ?? 0), LABEL_SIZE, {
            lines: visual.labelLines,
          });
        }
        if (visual.sublabelLines && asNode.sublabel) {
          node.sublabel = makeLabel(asNode.sublabel, ox + visual.width / 2, oy + (visual.sublabelY ?? 0), SUBLABEL_SIZE, {
            lines: visual.sublabelLines,
          });
        }
        if (visual.badgeRects && asNode.badges) {
          node.badges = asNode.badges.map((icon, i) => ({ icon, rect: shift(visual.badgeRects![i]!, ox, oy) }));
        }
        scene.nodes.push(node);
      },
    };
  }

  function layTable(el: NodeEl): Laid {
    const sized = sizeTable({ label: el.label, table: el.table! });
    return {
      path: el.path,
      width: sized.width,
      height: sized.height,
      place: (ox, oy) => {
        const rect = { x: ox, y: oy, width: sized.width, height: sized.height };
        rectByPath.set(el.path, rect);
        scene.nodes.push({
          kind: "node",
          path: el.path,
          rect,
          role: "table",
          table: makeSceneTable(sized, oy),
          label: el.label ? makeLabel(el.label, ox, oy, 12, { weight: "semibold", align: "start" }) : undefined,
          description: el.description,
          href: el.href,
          meta: el.meta,
        });
      },
    };
  }

  function layCard(el: NodeEl): Laid {
    const sized = sizeCard({
      label: el.label,
      category: el.category!,
      tech: el.tech,
      description: el.description,
    });
    return {
      path: el.path,
      width: sized.width,
      height: sized.height,
      place: (ox, oy) => {
        const rect = { x: ox, y: oy, width: sized.width, height: sized.height };
        rectByPath.set(el.path, rect);
        scene.nodes.push({
          kind: "node",
          path: el.path,
          rect,
          role: "card",
          category: el.category,
          tech: el.tech,
          description: el.description,
          href: el.href,
          label: el.label ? makeLabel(el.label, ox, oy, 12, { weight: "semibold", align: "start" }) : undefined,
          meta: el.meta,
        });
      },
    };
  }

  // ---------------------------------------------------------------- groups

  async function layGroup(el: GroupEl): Promise<Laid> {
    const chrome = groupChrome(el.kind, el.label);
    const overhang = railOverhang(el);

    let contentW: number;
    let contentH: number;
    let placeContent: (cx: number, cy: number) => void;

    if (el.layout === "grid") {
      const gridOverlays = model.overlays.filter((o) =>
        o.members.every((m) => m.startsWith(el.path + "/")),
      );
      for (const o of gridOverlays) gridHandled.add(o.path);
      // size all leaf children of all cells
      const sized = new Map<string, SizedChild>();
      const cellLaids = new Map<string, Laid[]>();
      for (const cell of Object.values(el.grid!.cells)) {
        const laids: Laid[] = [];
        for (const child of cell.children) {
          const laid = child.type === "node" ? layNode(child, "resource", NODE_ICON) : await layGroup(child);
          laids.push(laid);
          sized.set(child.path, { el: child, width: laid.width, height: laid.height });
        }
        cellLaids.set(cell.path, laids);
      }
      const grid = layoutGrid({ group: el, overlays: gridOverlays, sized });
      contentW = grid.width;
      contentH = grid.height;
      placeContent = (cx, cy) => {
        // AZ column boxes (behind cells) + header labels
        el.grid!.columns.forEach((col, i) => {
          if (!col.label) return;
          const rect = {
            x: cx + grid.colX[i]! - 4,
            y: cy,
            width: grid.colW[i]! + 8,
            height: grid.height,
          };
          scene.groups.push({
            kind: "group",
            path: `${el.path}/@col-${col.id}`,
            rect,
            groupKind: "availability-zone",
            label: makeLabel(col.label, rect.x + rect.width / 2, cy + 16, LABEL_SIZE, {
              color: GROUP_STYLES["availability-zone"].labelColor,
            }),
          });
        });
        for (const cell of grid.cells) {
          const rect = shift(cell.rect, cx, cy);
          rectByPath.set(cell.cell.path, rect);
          emitGroupBox(cell.cell, rect, cell.chrome);
          const laids = cellLaids.get(cell.cell.path) ?? [];
          for (const laid of laids) {
            const child = cell.bands.flatMap((b) => b.children).find((c) => c.el.path === laid.path);
            if (!child) continue;
            laid.place(rect.x + cell.chrome.padLeft + child.rect.x, rect.y + cell.chrome.padTop + child.rect.y);
          }
        }
        for (const [overlayPath, rects] of grid.overlayRects) {
          const overlay = model.overlays.find((o) => o.path === overlayPath)!;
          emitOverlay(overlay, rects.map((r) => shift(r, cx, cy)));
        }
      };
    } else {
      const laids: Laid[] = [];
      for (const child of el.children) {
        laids.push(child.type === "node" ? layNode(child, "resource", NODE_ICON) : await layGroup(child));
      }
      const boxes: ChildBox[] = laids.map((l, i) => ({ id: l.path, width: l.width, height: l.height, order: i }));
      const projected = projectEdges(el.children, model.edges);
      const strategy = el.layout === "auto" ? autoStrategy(projected) : el.layout;
      const placed =
        strategy === "layered"
          ? await placeLayered(boxes, projected)
          : await placePack(boxes, model.aspectRatio);
      contentW = placed.width;
      contentH = placed.height;
      placeContent = (cx, cy) => {
        for (const p of placed.children) {
          const laid = laids.find((l) => l.path === p.id)!;
          laid.place(cx + p.rect.x, cy + p.rect.y);
        }
      };
    }

    const innerW = Math.max(contentW, groupTitleMinWidth(el.label));
    const stack = stackCount(el.stack);
    const outerW = innerW + chrome.padLeft + chrome.padRight;
    const outerH = contentH + chrome.padTop + chrome.padBottom;

    return {
      path: el.path,
      width: outerW + overhang.left + overhang.right + (stack ? STACK_OFFSET * stack : 0),
      height: outerH + overhang.top + overhang.bottom + (stack ? STACK_OFFSET * stack : 0),
      place: (ox, oy) => {
        const rect = { x: ox + overhang.left, y: oy + overhang.top, width: outerW, height: outerH };
        rectByPath.set(el.path, rect);
        emitGroupBox(el, rect, chrome);
        placeContent(rect.x + chrome.padLeft, rect.y + chrome.padTop);
        placeRails(el, rect);
      },
    };
  }

  function emitGroupBox(el: GroupEl, rect: Rect, chrome: ReturnType<typeof groupChrome>) {
    const style = GROUP_STYLES[el.kind];
    const group: SceneGroup = {
      kind: "group",
      path: el.path,
      rect,
      groupKind: el.kind,
      stack: stackCount(el.stack) || undefined,
      meta: el.meta,
    };
    if (chrome.badgeRect && style.badge) {
      group.badgeIcon = style.badge;
      group.badgeRect = shift(chrome.badgeRect, rect.x, rect.y);
    }
    if (el.label && chrome.labelPos) {
      const lx = rect.x + (group.badgeIcon ? chrome.labelPos.x : 8);
      group.label = makeLabel(el.label, lx, rect.y + chrome.labelPos.y + 4, GROUP_LABEL_SIZE, {
        align: "start",
        weight: "semibold",
        color: style.labelColor ?? style.stroke,
      });
    }
    scene.groups.push(group);
  }

  function emitOverlay(overlay: Overlay, rects: Rect[]) {
    const kindStyle = overlay.kind ? GROUP_STYLES[overlay.kind] : undefined;
    const first = rects[0]!;
    scene.overlays.push({
      kind: "overlay",
      path: overlay.path,
      rects,
      groupKind: overlay.kind,
      stroke: overlay.style?.stroke ?? kindStyle?.stroke ?? "#7D8998",
      strokeDasharray: overlay.style?.strokeDasharray ?? kindStyle?.strokeDasharray ?? "6 4",
      fill: overlay.style?.fill ?? "none",
      label: overlay.label
        ? makeLabel(overlay.label, first.x + 8, first.y + SUBLABEL_SIZE + 1, SUBLABEL_SIZE + 1, {
            align: "start",
            color: overlay.style?.stroke ?? kindStyle?.stroke ?? "#7D8998",
          })
        : undefined,
    });
    for (const rect of rects) rectByPath.set(overlay.path, rectByPath.get(overlay.path) ?? rect);
  }

  function placeRails(el: GroupEl, rect: Rect) {
    for (const rail of el.rails) {
      const laids = rail.items.map((it) => layNode(it, "rail-item", RAIL_ICON));
      const totalH = laids.reduce((s, l) => s + l.height, 0) + (laids.length - 1) * 24;
      const totalW = laids.reduce((s, l) => s + l.width, 0) + (laids.length - 1) * 24;
      if (rail.side === "W" || rail.side === "E") {
        let y = rect.y + (rect.height - totalH) / 2;
        for (const laid of laids) {
          const x = rail.side === "W" ? rect.x - laid.width / 2 : rect.x + rect.width - laid.width / 2;
          laid.place(x, y);
          y += laid.height + 24;
        }
      } else {
        let x = rect.x + (rect.width - totalW) / 2;
        for (const laid of laids) {
          const y = rail.side === "N" ? rect.y - laid.height / 2 : rect.y + rect.height - laid.height / 2;
          laid.place(x, y);
          x += laid.width + 24;
        }
      }
    }
  }

  // ---------------------------------------------------------------- top level

  const coreLaids: Laid[] = [];
  for (const child of model.children) {
    coreLaids.push(child.type === "node" ? layNode(child, "resource", NODE_ICON) : await layGroup(child));
  }
  const coreBoxes: ChildBox[] = coreLaids.map((l, i) => ({ id: l.path, width: l.width, height: l.height, order: i }));
  const coreEdges = projectEdges(model.children, model.edges);
  const corePlaced =
    autoStrategy(coreEdges) === "layered"
      ? await placeLayered(coreBoxes, coreEdges)
      : await placePack(coreBoxes, model.aspectRatio);

  // actors by side
  const actorLaids = {
    left: model.actors.filter((a) => a.side === "left").map((a) => layNode(a, "actor", ACTOR_ICON)),
    right: model.actors.filter((a) => a.side === "right").map((a) => layNode(a, "actor", ACTOR_ICON)),
    top: model.actors.filter((a) => a.side === "top").map((a) => layNode(a, "actor", ACTOR_ICON)),
    bottom: model.actors.filter((a) => a.side === "bottom").map((a) => layNode(a, "actor", ACTOR_ICON)),
  };
  const bandLaids = new Map<BandEl, Laid[]>();
  for (const band of model.bands) {
    const laids: Laid[] = [];
    for (const child of band.children) {
      laids.push(child.type === "node" ? layNode(child, "resource", NODE_ICON) : await layGroup(child));
    }
    bandLaids.set(band, laids);
  }

  const colW = (laids: Laid[]) => (laids.length ? Math.max(...laids.map((l) => l.width)) : 0);
  const colH = (laids: Laid[]) =>
    laids.length ? laids.reduce((s, l) => s + l.height, 0) + (laids.length - 1) * ACTOR_GAP : 0;
  const rowW = (laids: Laid[]) =>
    laids.length ? laids.reduce((s, l) => s + l.width, 0) + (laids.length - 1) * ACTOR_GAP : 0;
  const rowH = (laids: Laid[]) => (laids.length ? Math.max(...laids.map((l) => l.height)) : 0);

  const leftBand = model.bands.filter((b) => b.position === "left").flatMap((b) => bandLaids.get(b)!);
  const rightBand = model.bands.filter((b) => b.position === "right").flatMap((b) => bandLaids.get(b)!);
  const topBand = model.bands.filter((b) => b.position === "top").flatMap((b) => bandLaids.get(b)!);
  const bottomBand = model.bands.filter((b) => b.position === "bottom").flatMap((b) => bandLaids.get(b)!);

  // horizontal composition: [left band][left actors][core][right actors][right band]
  const cols = [
    { laids: leftBand, w: colW(leftBand) },
    { laids: actorLaids.left, w: colW(actorLaids.left) },
    { laids: [] as Laid[], w: corePlaced.width, core: true },
    { laids: actorLaids.right, w: colW(actorLaids.right) },
    { laids: rightBand, w: colW(rightBand) },
  ].filter((c) => c.w > 0 || c.core);

  const midH = Math.max(
    corePlaced.height,
    colH(actorLaids.left),
    colH(actorLaids.right),
    colH(leftBand),
    colH(rightBand),
  );
  const topH = Math.max(rowH(topBand), rowH(actorLaids.top));
  const bottomH = Math.max(rowH(bottomBand), rowH(actorLaids.bottom));

  const midW = cols.reduce((s, c) => s + c.w, 0) + (cols.length - 1) * BAND_GAP;
  const width = Math.max(midW, rowW(topBand), rowW(bottomBand)) + CANVAS_MARGIN * 2;
  const height =
    CANVAS_MARGIN * 2 +
    midH +
    (topH ? topH + BAND_GAP : 0) +
    (bottomH ? bottomH + BAND_GAP : 0);

  scene.width = width;
  scene.height = height;

  // place top band/actors
  let y = CANVAS_MARGIN;
  if (topH) {
    let x = CANVAS_MARGIN;
    for (const laid of [...topBand, ...actorLaids.top]) {
      laid.place(x, y + (topH - laid.height) / 2);
      x += laid.width + ACTOR_GAP;
    }
    y += topH + BAND_GAP;
  }
  // middle row
  {
    let x = CANVAS_MARGIN + Math.max(0, (width - CANVAS_MARGIN * 2 - midW) / 2);
    for (const c of cols) {
      if (c.core) {
        const coreY = y + (midH - corePlaced.height) / 2;
        for (const p of corePlaced.children) {
          const laid = coreLaids.find((l) => l.path === p.id)!;
          laid.place(x + p.rect.x, coreY + p.rect.y);
        }
      } else {
        let cy = y + (midH - colH(c.laids)) / 2;
        for (const laid of c.laids) {
          laid.place(x + (c.w - laid.width) / 2, cy);
          cy += laid.height + ACTOR_GAP;
        }
      }
      x += c.w + BAND_GAP;
    }
    y += midH;
  }
  // bottom band/actors
  if (bottomH) {
    y += BAND_GAP;
    let x = CANVAS_MARGIN + Math.max(0, (width - CANVAS_MARGIN * 2 - rowW(bottomBand)) / 2);
    for (const laid of [...bottomBand, ...actorLaids.bottom]) {
      laid.place(x, y + (bottomH - laid.height) / 2);
      x += laid.width + ACTOR_GAP;
    }
  }

  // ---------------------------------------------------------------- overlays outside grids (generic fallback)
  for (const overlay of model.overlays) {
    if (gridHandled.has(overlay.path)) continue;
    const rects = overlay.members.map((m) => rectByPath.get(m)).filter((r): r is Rect => !!r);
    if (rects.length === 0) continue;
    emitOverlay(overlay, [rectInflate(rectUnionAll(rects), 10)]);
  }

  // ---------------------------------------------------------------- markers
  for (const marker of model.markers) {
    const rect = rectByPath.get(marker.at);
    if (!rect) continue;
    const anchor = marker.anchor ?? "nw";
    const pt = {
      x: anchor === "ne" || anchor === "se" ? rect.x + rect.width : anchor === "mid" ? rect.x + rect.width / 2 : rect.x,
      y: anchor === "sw" || anchor === "se" ? rect.y + rect.height : anchor === "mid" ? rect.y + rect.height / 2 : rect.y,
    };
    scene.markers.push({
      kind: "marker",
      n: marker.n,
      at: { x: pt.x + (marker.offset?.dx ?? 0), y: pt.y + (marker.offset?.dy ?? 0) },
      note: marker.note,
    });
  }

  // ---------------------------------------------------------------- icon/text collection
  const icons = new Set<string>();
  const texts = new Set<string>();
  for (const n of scene.nodes) {
    if (n.icon) icons.add(String(n.icon));
    if (n.category) {
      const meta = CARD_CATEGORY_META[n.category];
      if (meta) {
        icons.add(String(meta.icon));
        texts.add(meta.labelKo);
      }
      if (n.tech) texts.add(n.tech);
    }
    if (n.description) texts.add(n.description);
    if (n.table) for (const c of n.table.columns) {
      texts.add(c.name);
      if (c.type) texts.add(c.type);
    }
    for (const b of n.badges ?? []) icons.add(String(b.icon));
    if (n.label) texts.add(n.label.text);
    if (n.sublabel) texts.add(n.sublabel.text);
  }
  for (const g of scene.groups) {
    if (g.badgeIcon) icons.add(String(g.badgeIcon));
    if (g.label) texts.add(g.label.text);
    for (const t of g.trackLabels ?? []) texts.add(t.text);
  }
  for (const o of scene.overlays) if (o.label) texts.add(o.label.text);
  for (const m of scene.markers) texts.add(String(m.n));
  scene.icons = [...icons].sort() as Scene["icons"];
  scene.texts = [...texts].sort();

  return scene;
}

// ------------------------------------------------------------------ helpers

const shift = (r: Rect, dx: number, dy: number): Rect => ({
  x: r.x + dx,
  y: r.y + dy,
  width: r.width,
  height: r.height,
});

const stackCount = (s: true | number | undefined): number => (s === true ? 2 : (s ?? 0) > 0 ? Math.min(Number(s), 4) : 0);

function railOverhang(el: GroupEl): { top: number; right: number; bottom: number; left: number } {
  const o = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const rail of el.rails) {
    const sizes = rail.items.map((it) => sizeNode({ label: it.label }, RAIL_ICON));
    const maxW = Math.max(...sizes.map((s) => s.width), 0);
    const maxH = Math.max(...sizes.map((s) => s.height), 0);
    if (rail.side === "W") o.left = Math.max(o.left, maxW / 2 + 6);
    if (rail.side === "E") o.right = Math.max(o.right, maxW / 2 + 6);
    if (rail.side === "N") o.top = Math.max(o.top, maxH / 2 + 6);
    if (rail.side === "S") o.bottom = Math.max(o.bottom, maxH / 2 + 6);
  }
  return o;
}

/**
 * Pick pack vs layered for "auto" containers (DESIGN.md §5.1): a fan-in/out
 * dominated topology (flow depth <= 1 with a hub of degree >= 4) degenerates
 * to a single ELK layer — elk.aspectRatio is a no-op for connected layered
 * graphs — so those pack instead and the global router draws the fan.
 */
function autoStrategy(projected: ChildEdge[]): "pack" | "layered" {
  if (projected.length === 0) return "pack";
  const degree = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const e of projected) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  }
  const maxDegree = Math.max(...degree.values());
  // longest path length (DAG-ish BFS with cycle cap)
  let depth = 0;
  for (const start of degree.keys()) {
    let frontier = [start];
    let d = 0;
    const seen = new Set<string>([start]);
    while (frontier.length && d < 8) {
      const next: string[] = [];
      for (const n of frontier) {
        for (const t of out.get(n) ?? []) {
          if (!seen.has(t)) {
            seen.add(t);
            next.push(t);
          }
        }
      }
      if (next.length) d++;
      frontier = next;
    }
    depth = Math.max(depth, d);
  }
  return depth <= 1 && maxDegree >= 4 ? "pack" : "layered";
}

function projectEdges(children: Element[], edges: Edge[]): ChildEdge[] {
  const owner = (p: string): string | null => {
    for (const c of children) {
      if (p === c.path || p.startsWith(c.path + "/")) return c.path;
    }
    return null;
  };
  const seen = new Set<string>();
  const out: ChildEdge[] = [];
  for (const e of edges) {
    const from = owner(e.from);
    const to = owner(e.to);
    if (!from || !to || from === to) continue;
    const key = `${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from, to });
  }
  return out;
}
