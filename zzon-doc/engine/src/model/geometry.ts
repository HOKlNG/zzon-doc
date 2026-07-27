export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

export const rectRight = (r: Rect) => r.x + r.width;
export const rectBottom = (r: Rect) => r.y + r.height;
export const rectCenter = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

export function rectUnion(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(rectRight(a), rectRight(b)) - x,
    height: Math.max(rectBottom(a), rectBottom(b)) - y,
  };
}

export function rectUnionAll(rects: readonly Rect[]): Rect {
  if (rects.length === 0) throw new Error("rectUnionAll: empty input");
  return rects.reduce(rectUnion);
}

export function rectInflate(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, width: r.width + 2 * pad, height: r.height + 2 * pad };
}

export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < rectRight(b) + gap &&
    rectRight(a) > b.x - gap &&
    a.y < rectBottom(b) + gap &&
    rectBottom(a) > b.y - gap
  );
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    rectRight(inner) <= rectRight(outer) &&
    rectBottom(inner) <= rectBottom(outer)
  );
}

export function rectArea(r: Rect): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

/** Intersection of two rects, or null when they share no positive area. */
export function rectIntersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(rectRight(a), rectRight(b));
  const bottom = Math.min(rectBottom(a), rectBottom(b));
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * True when segment a→b has a positive-length portion strictly inside `r`
 * (Liang–Barsky clipping). Touching a border or a single corner does NOT
 * count — callers wanting a safety margin should inflate/deflate the rect.
 */
export function segmentIntersectsRect(a: Point, b: Point, r: Rect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // each pair (p, q) encodes one boundary constraint p*t <= q for P(t) = a + t*d
  const bounds: readonly [number, number][] = [
    [-dx, a.x - r.x],
    [dx, rectRight(r) - a.x],
    [-dy, a.y - r.y],
    [dy, rectBottom(r) - a.y],
  ];
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of bounds) {
    if (p === 0) {
      // parallel to this boundary: outside (or exactly on the border line)
      if (q <= 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return t1 - t0 > 1e-9;
}

/**
 * Area of `clip` covered by the union of `rects` (coordinate-compression
 * sweep over x-slabs with y-interval merging). Exact for axis-aligned rects;
 * O(n² log n), fine for invariant checking.
 */
export function rectCoveredArea(clip: Rect, rects: readonly Rect[]): number {
  const clipped: Rect[] = [];
  for (const r of rects) {
    const i = rectIntersection(clip, r);
    if (i) clipped.push(i);
  }
  if (clipped.length === 0) return 0;
  const xs = [...new Set(clipped.flatMap((r) => [r.x, rectRight(r)]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i]!;
    const x1 = xs[i + 1]!;
    if (x1 <= x0) continue;
    const spans = clipped
      .filter((r) => r.x <= x0 && rectRight(r) >= x1)
      .map((r): [number, number] => [r.y, rectBottom(r)])
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let curStart = Infinity;
    let curEnd = -Infinity;
    for (const [y0, y1] of spans) {
      if (y0 > curEnd) {
        if (curEnd > curStart) covered += curEnd - curStart;
        curStart = y0;
        curEnd = y1;
      } else if (y1 > curEnd) {
        curEnd = y1;
      }
    }
    if (curEnd > curStart) covered += curEnd - curStart;
    area += covered * (x1 - x0);
  }
  return area;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const insets = (top: number, right = top, bottom = top, left = right): Insets => ({
  top,
  right,
  bottom,
  left,
});
