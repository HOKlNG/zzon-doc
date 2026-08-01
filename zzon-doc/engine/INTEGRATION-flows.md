# Integration: narrative flows (src/render/flows.ts)

Self-contained module; nothing imports it yet. Wire in 4 places:

## 1. Pipeline (src/pipeline.ts) — AFTER routing

```ts
import { resolveFlows } from "./render/flows.ts";
// once scene.edges have points:
resolveFlows(scene, model.flows); // mutates scene.flows + scene.texts
```
Throws `Error` naming flow+step on an unknown/unrouted edge id — surface it
like other validation errors. Must run before renderHtml (texts feed the
font subsetter; badge label glyphs incl. "·" are registered).

## 2. Interactive SVG (src/render/svg.ts, renderInteractiveSvg)

```ts
import { renderFlowBadgesSvg } from "./flows.ts";
```
Append `renderFlowBadgesSvg(scene)` as a top-level `<g>` AFTER the
`<g class="markers">` line (badges are the topmost layer; empty string when
scene.flows is empty, safe to append unconditionally). Badges live inside
the SVG so they pan/zoom with the diagram.

Do NOT add flows to static-svg.ts — badges are hidden-by-default interactive
chrome; static export stays as-is.

## 3. HTML shell (src/render/html.ts, renderHtml)

```ts
import { FLOW_CSS, FLOW_JS, renderFlowUiHtml } from "./flows.ts";
```
- CSS: append `FLOW_CSS` to the buildCss() output (e.g. `css + "\n" + FLOW_CSS`).
- Body: put `renderFlowUiHtml(scene)` INSIDE `<main>` right before the svg
  (html.ts already sets `main{position:relative}`; the UI is absolutely
  positioned top-left over the canvas). Empty string when no flows.
- Script: add `<script>${FLOW_JS}</script>` AFTER the INTERACTION_JS script
  tag. FLOW_JS follows the same embedding rules (no </script>, no
  backticks/${) and reads everything from DOM hooks — no globals.

## 4. Nothing else

- FLOW_JS relies only on attrs already emitted: `.edge[data-edge-id]`
  `[data-from]` `[data-to]`, `.node[data-path]`, plus its own
  `[data-flow]` / `[data-steps]` hooks. Buttons are exclusive; badge/strip
  click focuses a step; Escape or re-click deactivates.
- Flow accent color is `var(--flow, #4f46e5)`: optionally add a `--flow`
  var to themeVars() later; fallback works without it.
- Uses its OWN classes `.flow-dim`/`.flow-fade` (not `.dim`) so the hover
  interactions' clearHl can never clobber flow state.
