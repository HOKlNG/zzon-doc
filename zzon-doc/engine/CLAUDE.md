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
- `bun test` — all tests; `bun test tests/invariants.test.ts` etc. for one file
- `bunx tsc --noEmit` — typecheck (strict)

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
- Icons: committed normalized SVGs in src/icons/svg/ keyed like "ec2",
  "vpc.nat-gateway", "group.vpc", "x.karpenter"; aliases in src/icons/aliases.ts.
  Upgrading the AWS package is maintainer-only: scripts/build-icons.ts.

## Conventions

- out/ artifacts are committed; review diffs via *.scene.json (html/svg are
  diff-suppressed in .gitattributes).
- Never modify AWS icon artwork beyond title/desc stripping (license).
- Grafana/GitHub logos must stay user-supplied (trademark) — never fetch/commit.
- Determinism is a feature: no Date.now/randomness in the pipeline; exact-pin
  layout/routing/font deps when bumping.
