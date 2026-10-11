# infra-architect (zzon-doc plugin engine)

Diagrams as TypeScript code -> auto-layout -> self-contained interactive HTML.
This is the VENDORED ENGINE of the zzon-doc Claude Code plugin (../skills/* call
it; build-docs.mjs spawns `bun src/cli/index.ts` for renderer:"terra-form" specs).
Beyond AWS infra it now renders: generic category CARD nodes (31 categories,
lucide icons, src/render/card.ts), ERD tables with column-anchored edges +
crow's-foot cardinality (table.ts), narrative flows with step badges (flows.ts),
a node-detail sidebar + zzon shell postMessage protocol + zzon-theme sync
(sidebar.ts), and an auto legend (legend.ts). External diagram sources
(<project>/docs/zzon-doc/terra/*.ts) import "../src/dsl/index.ts" as if in examples/
— pipeline.loadDiagram tmp-copies them into examples/.
Full design rationale (v2, post adversarial review): DESIGN.md. Read it before
changing layout/routing/rendering behavior — §12 records rejected alternatives
with the evidence, do not re-propose them.

## Commands

- `bun ia render <file>.ts` — html + static svg + canonical scene json into out/ (file may live outside the engine)
- `bun ia watch examples/<name>.ts` — dev server :4499, child-process rebuild per change
- `bun ia export examples/<name>.ts --png` — PNG via resvg with vendored fonts
- `bun ia check <file>.ts|.json [--tier overview|standard|reference] [--json]` — collision
  invariants + tier quality gate (src/quality/metrics.ts) + notation semantics; exit 1 on ✗.
  `bun ia render … --gate` writes the same report as `<name>.gate.json` (build-docs reads it)
- `bun ia render <file>.ts --fold [--href <slug>]` — the BIG PICTURE of the same model (src/model/fold.ts):
  same-name aliasing → merge duplicates → drop cross-cutting → fold leaf clusters → absorb leaves →
  zones as nodes, column hints from the lines; writes `<name>-overview.*`, folded nodes drill to `<name>`.
  `bun ia check` prints the zoom decision (zoomPlan: single / optional / required, selection-rubric §3.4)
- `bun ia font-css <text-file> --css <out.css>` — Pretendard @font-face subset for the given text;
  the skill shells (index, wiki, sequence viewer) embed it via engine-cli.mjs `fontFaceCss` so every page shares one face
- `bun test` — all tests; `bun test tests/invariants.test.ts` etc. for one file
- `bunx tsc --noEmit` — typecheck (strict)
- Windows: bun installed via npm is a `bun.cmd` shim — call the real `bun.exe`
  (`%APPDATA%\npm\node_modules\bun\bin`) or let skills/zzon-doc/scripts/engine-cli.mjs resolve it

## Hard-won environment facts (do not rediscover)

- **elkjs under Bun is broken by default** (oven-sh/bun#15737): only load it via
  `src/layout/elk-loader.ts` (elk-api.js + real Web Worker). The bundled entry
  HANGS silently; the default entry throws.
- **libavoid-js quirks** (0.5.0-beta.x embind): router flag must be the raw
  integer (`new Avoid.Router(2)`), route points come from `route.ps.get(i)/.size()`.
  All access goes through `src/route/avoid-adapter.ts`.
- elkjs mutates its input and injects nondeterministic `$H` keys — always
  structuredClone in, extract only geometry out (elk-loader does this).
- Text measurement must use `src/text/metrics.ts` (opentype.js over vendored
  Pretendard OTFs) — never estimate text width; the HTML embeds the same font.
- resvg PNG export: pass `fontBuffers` from metrics, never `loadSystemFonts: true`
  (system font scan takes ~2 min on this machine and breaks determinism).
- elk-loader must pass `fileURLToPath(...)` to `new Worker` — `URL.pathname` is
  "/C:/…" on Windows and ELK then hangs forever with no error.
- ELK `layerChoiceConstraint` / `positionChoiceConstraint` are NO-OPS outside
  interactive mode (probed on elkjs 0.12). Author hints (`hints.layer/order`)
  therefore run a 2nd pass: seed coordinates + INTERACTIVE cycle breaking,
  layering and crossing minimization, `separateConnectedComponents: false`
  (otherwise unconnected same-layer nodes are packed side by side).
- `cycleBreaking: MODEL_ORDER` was tried and rejected: it reverses every edge
  against declaration order even in acyclic graphs (4 corpus regressions).
  Return edges are declared instead (`EdgeOpts.back` → `Edge.layoutReverse`).

## Architecture (pipeline order)

model (src/model, built by src/dsl) -> validate (collect-all errors with DSL
call sites; unique-suffix path resolution rewrites refs to absolute) ->
layout (src/layout/compose.ts: bottom-up sizing; grid.ts for AZ×tier matrices
with overlay band clustering; ELK rectpacking/layered for the rest — ELK is
placement-ONLY) -> routing (src/route: single global libavoid pass over all
node obstacles; groups are NOT obstacles; fan bundling via junctions) ->
render (src/render: interactive HTML variant + static SVG variant with text as
paths). The Scene type in src/layout/scene.ts is the frozen contract between
stages; canonicalScene() is the snapshot/diff artifact.

- "auto" container strategy: pack when no internal edges OR fan-dominated
  (depth<=1 && hub degree>=4 — avoids ELK's aspect-0.1 stripe); layered otherwise.
  Any `hints.layer/order` on a child forces layered (a lane of 4 DBs is a column).
- Direction: declared `direction` (or the docKind default — flowchart/dependency/
  class DOWN, state/screen-flow RIGHT) is honoured as is. Undeclared = RIGHT,
  flipped to DOWN only above overview size (≤9 stays wide). Over-wide RIGHT top
  level wraps text-like into rows (wrapRows: fewest rows inside the aspect
  band); nested groups keep ELK MULTI_EDGE; declared layers are never folded.
- Notation nodes: state, process, decision, terminal and module render as the
  SAME architecture card (card.ts CARD_SHAPES → virtual categories n-state-*, n-process-*,
  n-decision, n-start/n-end, n-module[-shared]); `tone` (wait/done/fail, shared for modules)
  picks accent + icon. The scene node keeps `shape` for routing (decision exits) and semantics.
  Glyph shapes (src/render/shapes.ts) remain for initial/final/choice, screen, class. One geometry pass
  emits role-coloured primitives; interactive = CSS vars + <text>, static =
  literal palette + outlined paths. UML end markers live in svg.ts
  (`sourceMarker`/`targetMarker`: triangle, diamond, diamond-open, open-arrow).
- Router extras: self-loops drawn by hand (top-right corner); same-lane
  C-detour (laneDetourSides); backward row-hop via S/N (backwardSides);
  decision/choice exits on distinct faces (branchExitSides); group/overlay
  TITLES are obstacles (boxes are not). Edge labels avoid every line except runs
  shared with their own edge, scored hard (nodes/labels) vs soft (lines).
- Semantics (src/model/semantics.ts) — state reachability/finals/dead ends,
  flowchart start/decision-label rules, class inheritance cycles — feed the gate.
- Icons: committed normalized SVGs in src/icons/svg/ keyed like "ec2",
  "vpc.nat-gateway", "group.vpc", "x.karpenter"; aliases in src/icons/aliases.ts.
  Upgrading the AWS package is maintainer-only: scripts/build-icons.ts.
  Extra official sets that may be redistributed (NOTICE §6-8): Azure V24 `azure.*` (636),
  Kubernetes community `k8s.*` (39, Apache-2.0), SAP BTP `sap.*` (125, Apache-2.0) — imported by
  scripts/import-icon-packs.ts (metadata stripped, ids prefixed, artwork untouched). Every other
  vendor (GCP, Naver, Datadog, …) has NO bundled icon: draw it as a category card. Never add a
  download-on-demand path for icons, and never recolor vendor icons (dark mode included).

## Conventions

- Canvas colors are COPIES of skills/zzon-doc/scripts/design-tokens.mjs (zinc palette, one accent) —
  theme.ts / adapter.ts / card.ts / shapes.ts / table.ts. tests/design-tokens.test.ts fails on drift;
  change the token file first, never invent a canvas-only palette.
- out/ artifacts are committed; review diffs via *.scene.json (html/svg are
  diff-suppressed in .gitattributes).
- Never modify AWS icon artwork beyond title/desc stripping (license).
- Grafana/GitHub logos must stay user-supplied (trademark) — never fetch/commit.
- Determinism is a feature: no Date.now/randomness in the pipeline; exact-pin
  layout/routing/font deps when bumping.
