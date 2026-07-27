/**
 * Grid (AZ x tier) container layout — the matrix pattern no generic engine
 * supports (DESIGN.md §5.1/§5.2).
 *
 * Cells are group containers positioned on shared column/row tracks (track
 * size = max cell requirement, cells stretch to track — aligned grid lines).
 * Overlay members inside a cell are clustered into contiguous BANDS so
 * spanning overlays (Karpenter NodePool / EKS MNG) resolve to clean
 * per-row rects even when interleaved with other overlays' members.
 */
import type { Element, GroupEl, Overlay } from "../model/types.ts";
import type { Rect } from "../model/geometry.ts";
import { rectUnionAll, rectInflate } from "../model/geometry.ts";
import { CELL_GAP, NODE_GAP, groupChrome, groupTitleMinWidth } from "./sizing.ts";

/** a sized child ready to be placed (provided by compose.ts) */
export interface SizedChild {
  el: Element;
  width: number;
  height: number;
}

export interface Band {
  overlayId: string | null;
  children: { el: Element; rect: Rect }[]; // rects relative to CELL CONTENT origin
  rect: Rect; // band bbox relative to cell content origin
}

export interface LaidCell {
  cell: GroupEl;
  col: number;
  row: number;
  bands: Band[];
  contentWidth: number;
  contentHeight: number;
  chrome: ReturnType<typeof groupChrome>;
}

export interface GridResult {
  width: number;
  height: number;
  colX: number[]; // column left edges (content-relative)
  colW: number[];
  rowY: number[];
  rowH: number[];
  headerH: number;
  cells: (LaidCell & { rect: Rect })[]; // rect relative to grid content origin
  /** per overlay: rects (grid-content-relative), one per contiguous run per row */
  overlayRects: Map<string, Rect[]>;
}

const BAND_GAP = 32;
const OVERLAY_PAD = 8;
/** extra top inset inside overlay rects reserved for the inside-top label */
const OVERLAY_LABEL_STRIP = 12;

/** cluster cell children into bands by overlay membership, preserving declaration order */
export function bandsForCell(
  cell: GroupEl,
  overlays: Overlay[],
  sized: Map<string, SizedChild>,
): Band[] {
  const overlayOf = new Map<string, string>();
  for (const o of overlays) for (const m of o.members) overlayOf.set(m, o.path);

  const bands: Band[] = [];
  const bandIndex = new Map<string | null, Band>();
  for (const child of cell.children) {
    const oid = overlayOf.get(child.path) ?? null;
    let band = bandIndex.get(oid);
    if (!band) {
      band = { overlayId: oid, children: [], rect: { x: 0, y: 0, width: 0, height: 0 } };
      bandIndex.set(oid, band);
      bands.push(band);
    }
    const s = sized.get(child.path);
    if (!s) throw new Error(`grid: child ${child.path} was not sized`);
    band.children.push({ el: child, rect: { x: 0, y: 0, width: s.width, height: s.height } });
  }

  // lay out each band as row-wrap (<=3 per row for small counts, 2 columns for 4+)
  let y = 0;
  for (const band of bands) {
    const n = band.children.length;
    const perRow = n <= 3 ? n : 2;
    let x = 0;
    let rowH = 0;
    let bandW = 0;
    let inRow = 0;
    let bandY = y;
    for (const c of band.children) {
      if (inRow === perRow) {
        y += rowH + NODE_GAP;
        x = 0;
        rowH = 0;
        inRow = 0;
      }
      c.rect.x = x;
      c.rect.y = y;
      x += c.rect.width + NODE_GAP;
      bandW = Math.max(bandW, x - NODE_GAP);
      rowH = Math.max(rowH, c.rect.height);
      inRow++;
    }
    y += rowH;
    band.rect = { x: 0, y: bandY, width: bandW, height: y - bandY };
    y += BAND_GAP;
  }
  return bands;
}

export interface GridInput {
  group: GroupEl;
  overlays: Overlay[]; // overlays whose members live inside this grid
  sized: Map<string, SizedChild>; // sizes of all leaf children of all cells
}

export function layoutGrid({ group, overlays, sized }: GridInput): GridResult {
  const grid = group.grid!;
  const nCols = grid.columns.length;
  const nRows = grid.rows.length;

  // ---- lay out every declared cell
  const laid: LaidCell[] = [];
  for (const [key, cell] of Object.entries(grid.cells)) {
    const [colId, rowId] = key.split("/") as [string, string];
    const col = grid.columns.findIndex((c) => c.id === colId);
    const row = grid.rows.findIndex((r) => r.id === rowId);
    const bands = bandsForCell(cell, overlays, sized);
    const chrome = groupChrome(cell.kind, cell.label);
    const contentWidth = Math.max(
      bands.length ? Math.max(...bands.map((b) => b.rect.width)) : 40,
      groupTitleMinWidth(cell.label) - chrome.padLeft - chrome.padRight,
    );
    const last = bands[bands.length - 1];
    const contentHeight = Math.max(last ? last.rect.y + last.rect.height : 24, 24);
    laid.push({ cell, col, row, bands, contentWidth, contentHeight, chrome });
  }

  // ---- track sizing (uniform tracks -> aligned grid lines)
  const colW = Array.from({ length: nCols }, () => 60);
  const rowH = Array.from({ length: nRows }, () => 40);
  for (const c of laid) {
    const outerW = c.contentWidth + c.chrome.padLeft + c.chrome.padRight;
    const outerH = c.contentHeight + c.chrome.padTop + c.chrome.padBottom;
    colW[c.col] = Math.max(colW[c.col]!, outerW);
    rowH[c.row] = Math.max(rowH[c.row]!, outerH);
  }

  const hasHeaders = grid.columns.some((c) => c.label);
  const headerH = hasHeaders ? 26 : 0;

  const colX: number[] = [];
  let x = 0;
  for (let i = 0; i < nCols; i++) {
    colX.push(x);
    x += colW[i]! + CELL_GAP;
  }
  const width = x - CELL_GAP;

  const rowY: number[] = [];
  let y = headerH;
  for (let i = 0; i < nRows; i++) {
    rowY.push(y);
    y += rowH[i]! + CELL_GAP;
  }
  const height = y - CELL_GAP;

  // ---- cell rects (stretch to track)
  const cells = laid.map((c) => ({
    ...c,
    rect: {
      x: colX[c.col]!,
      y: rowY[c.row]!,
      width: colW[c.col]!,
      height: rowH[c.row]!,
    },
  }));

  // ---- overlay rects: per overlay, per row, contiguous column runs
  const overlayRects = new Map<string, Rect[]>();
  for (const overlay of overlays) {
    const memberSet = new Set(overlay.members);
    // collect (col,row, band rect in grid coords) where this overlay has a band
    const hits: { col: number; row: number; rect: Rect }[] = [];
    for (const c of cells) {
      for (const band of c.bands) {
        if (band.overlayId !== overlay.path) continue;
        // only count if the band actually holds members (defensive)
        if (!band.children.some((ch) => memberSet.has(ch.el.path))) continue;
        hits.push({
          col: c.col,
          row: c.row,
          rect: {
            x: c.rect.x + c.chrome.padLeft + band.rect.x,
            y: c.rect.y + c.chrome.padTop + band.rect.y,
            width: Math.max(band.rect.width, c.contentWidth),
            height: band.rect.height,
          },
        });
      }
    }
    // group by row, split into contiguous column runs
    const rects: Rect[] = [];
    const byRow = new Map<number, typeof hits>();
    for (const h of hits) byRow.set(h.row, [...(byRow.get(h.row) ?? []), h]);
    for (const rowHits of byRow.values()) {
      rowHits.sort((a, b) => a.col - b.col);
      let run: typeof hits = [];
      const flush = () => {
        if (run.length) {
          const u = rectInflate(rectUnionAll(run.map((r) => r.rect)), OVERLAY_PAD);
          rects.push({ x: u.x, y: u.y - OVERLAY_LABEL_STRIP, width: u.width, height: u.height + OVERLAY_LABEL_STRIP });
        }
        run = [];
      };
      for (const h of rowHits) {
        if (run.length && h.col !== run[run.length - 1]!.col + 1) flush();
        run.push(h);
      }
      flush();
    }
    if (rects.length) overlayRects.set(overlay.path, rects);
  }

  return { width, height, colX, colW, rowY, rowH, headerH, cells, overlayRects };
}
