/**
 * The ONLY module allowed to touch libavoid-js. Isolates every binding quirk
 * of the 0.5.0-beta embind surface (all verified under bun):
 *  - load via CJS require + `AvoidLib.load()`, then `AvoidLib.getInstance()`
 *  - the Router must be constructed with the raw integer flag
 *    (`new Avoid.Router(2)` = OrthogonalRouting) — embind cannot convert the
 *    RouterFlag enum object for this constructor
 *  - route points are read via `displayRoute().ps` with `.size()`/`.get(i)`
 *  - ConnDirFlags is NOT exported by the wasm glue → hardcoded ints below
 *  - `Avoid.destroy()` does not exist; embind `.delete()` frees objects
 *  - JunctionRef is NOT exposed by this build — bundling (src/route/bundle.ts)
 *    therefore models junctions as plain point endpoints
 *  - COINCIDENT pins break: two ShapeConnectionPins at the same position on
 *    one shape (even with different class ids) make ConnEnd fall back to the
 *    shape centre, yielding diagonal centre-to-centre routes. Router-chosen
 *    "any" pins are also unstable across Router instances in one process.
 *    → exactly ONE pin per face, and callers always pick the side.
 *
 * Attachment model: every shape gets one ShapeConnectionPin per face midpoint
 * (class id per side, non-exclusive), with visibility restricted to that
 * face's outward direction. Shape endpoints therefore always name a side.
 */
import type { Rect, Point } from "../model/geometry.ts";
import type { Side } from "../model/types.ts";

/** Raw integer for Avoid.RouterFlag.OrthogonalRouting (enum object rejected). */
const ROUTER_FLAG_ORTHOGONAL = 2;
/** Raw integer for Avoid.ConnType.ConnType_Orthogonal. */
const CONNTYPE_ORTHOGONAL = 2;

/** libavoid ConnDirFlags values (y-down canvas: Up = toward negative y). */
const CONN_DIR: Record<Side, number> = { N: 1, S: 2, W: 4, E: 8 };

/** ShapeConnectionPin class ids, one per face. */
const PIN_CLASS: Record<Side, number> = { N: 2, S: 3, E: 4, W: 5 };

const SIDES: readonly Side[] = ["N", "S", "E", "W"];

/** Proportional (0..1) pin offsets per face midpoint. */
const PIN_OFFSET: Record<Side, readonly [number, number]> = {
  N: [0.5, 0],
  S: [0.5, 1],
  W: [0, 0.5],
  E: [1, 0.5],
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/* The embind surface is effectively untyped (the package ships no usable
 * .d.ts for its "node" export), so the raw API is `any` on purpose. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AvoidApi = any;

let loading: Promise<AvoidApi> | null = null;

function loadAvoid(): Promise<AvoidApi> {
  if (!loading) {
    loading = (async () => {
      // CJS require is the verified-working load path under bun.
      const { AvoidLib } = require("libavoid-js") as {
        AvoidLib: { load(): Promise<void>; getInstance(): AvoidApi };
      };
      await AvoidLib.load();
      return AvoidLib.getInstance();
    })();
  }
  return loading;
}

/** Best-effort free of an embind temporary (copied by the C++ ctors). */
function free(obj: { delete?: () => void }): void {
  try {
    obj.delete?.();
  } catch {
    /* leak quietly — wasm heap dies with the process */
  }
}

export type AvoidEndpoint =
  | { kind: "shape"; shapeId: string; side: Side }
  | { kind: "point"; x: number; y: number };

export interface AvoidRouterParams {
  /** clearance kept around registered shapes (the 8px obstacle margin) */
  shapeBufferDistance: number;
  /** separation for nudged parallel segments */
  idealNudgingDistance: number;
}

/**
 * One routing transaction: register shapes, register connectors, route once,
 * dispose. Callers must register in a stable order for determinism.
 */
export class AvoidRouter {
  private shapes = new Map<string, AvoidApi>();
  private conns = new Map<string, AvoidApi>();
  private disposed = false;

  private constructor(
    private readonly avoid: AvoidApi,
    private readonly router: AvoidApi,
  ) {}

  static async create(params: AvoidRouterParams): Promise<AvoidRouter> {
    const avoid = await loadAvoid();
    const router = new avoid.Router(ROUTER_FLAG_ORTHOGONAL);
    // Defaults are unspecified across versions — always set explicitly.
    router.setRoutingParameter(avoid.RoutingParameter.shapeBufferDistance, params.shapeBufferDistance);
    router.setRoutingParameter(avoid.RoutingParameter.idealNudgingDistance, params.idealNudgingDistance);
    return new AvoidRouter(avoid, router);
  }

  /** Register an obstacle rect; also creates its connection pins. */
  addShape(id: string, rect: Rect): void {
    if (this.shapes.has(id)) throw new Error(`AvoidRouter: duplicate shape id "${id}"`);
    const A = this.avoid;
    const tl = new A.Point(rect.x, rect.y);
    const br = new A.Point(rect.x + rect.width, rect.y + rect.height);
    const poly = new A.Rectangle(tl, br);
    const shape = new A.ShapeRef(this.router, poly);
    free(tl);
    free(br);
    free(poly);
    for (const side of SIDES) {
      const [ox, oy] = PIN_OFFSET[side];
      // pins are owned by the shape — never freed directly; non-exclusive so
      // several connectors may share a face midpoint (they converge anyway)
      const pin = new A.ShapeConnectionPin(shape, PIN_CLASS[side], ox, oy, true, 0, CONN_DIR[side]);
      pin.setExclusive(false);
    }
    this.shapes.set(id, shape);
  }

  addConnector(id: string, source: AvoidEndpoint, target: AvoidEndpoint): void {
    if (this.conns.has(id)) throw new Error(`AvoidRouter: duplicate connector id "${id}"`);
    const src = this.connEnd(source);
    const dst = this.connEnd(target);
    const conn = new this.avoid.ConnRef(this.router, src, dst);
    conn.setRoutingType(CONNTYPE_ORTHOGONAL);
    free(src);
    free(dst);
    this.conns.set(id, conn);
  }

  private connEnd(ep: AvoidEndpoint): AvoidApi {
    const A = this.avoid;
    if (ep.kind === "point") {
      const p = new A.Point(ep.x, ep.y);
      const end = new A.ConnEnd(p);
      free(p);
      return end;
    }
    const shape = this.shapes.get(ep.shapeId);
    if (!shape) throw new Error(`AvoidRouter: unknown shape "${ep.shapeId}" for connector endpoint`);
    return new A.ConnEnd(shape, PIN_CLASS[ep.side]);
  }

  /** Process the transaction and extract every route (source → target order). */
  route(): Map<string, Point[]> {
    this.router.processTransaction();
    const out = new Map<string, Point[]>();
    for (const [id, conn] of this.conns) {
      const ps = conn.displayRoute().ps;
      const pts: Point[] = [];
      for (let i = 0; i < ps.size(); i++) {
        const p = ps.get(i);
        pts.push({ x: r2(p.x), y: r2(p.y) });
      }
      out.set(id, pts);
    }
    return out;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      for (const conn of this.conns.values()) this.router.deleteConnector(conn);
      for (const shape of this.shapes.values()) this.router.deleteShape(shape);
      this.router.delete();
    } catch {
      /* best-effort cleanup */
    }
    this.conns.clear();
    this.shapes.clear();
  }
}
