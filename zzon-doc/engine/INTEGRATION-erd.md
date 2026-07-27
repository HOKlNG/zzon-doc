# INTEGRATION — ERD tables + crow's-foot cardinality

Module: `src/render/table.ts` (render + sizing + markers), `src/model/erd.ts`
(validation). Self-contained; wire as follows. Example: `examples/erd-sample.ts`,
tests: `tests/erd.test.ts`.

## 1. pipeline.ts — validation
After `validate(model)` succeeds, run `validateErd(model)` (from
`src/model/erd.ts`) and merge its `ValidationIssue[]` into the reported issues
(errors abort like validate errors). Cheap no-op for non-table diagrams.

## 2. layout (compose.ts + sizing.ts) — sizing & scene assembly
- Where node visuals are sized: when `NodeEl.table` is set, call
  `sizeTable({ label: el.label, table: el.table })` INSTEAD of `sizeNode`;
  use its `width`/`height` as the node rect. No icon/iconRect for table nodes.
- After absolutize, on the SceneNode set:
  `table: makeSceneTable(sized, absRect.y)`, `role: "table"`, and a `label`
  SceneLabel whose `text` is the table title (only `.text` is consumed;
  the renderer positions header text itself from the rect).

## 3. routing (route/router.ts) — column anchors
For edges with `sourceColumn`/`targetColumn`, pin the endpoint's Y to
`tableAnchorY(sceneNode, column)` (E/W side attachment, like the legacy
column-anchored edges; fall back to the default anchor when it returns
undefined). Copy `Edge.sourceCardinality`/`targetCardinality` onto the
SceneEdge (fields already exist in the frozen contract).

## 4. render/svg.ts — interactive variant
- Top of `nodeMarkup`: `if (n.table) return renderTableSvg(n, { interactive: true });`
- In `<defs>`: if any scene edge has a cardinality, append
  `cardinalityMarkerDefs(color)` where `color` is the shared ERD edge color
  (use the first cardinality-bearing edge's `style.color`). Ids are fixed
  (`card-1|card-01|card-n|card-0n|card-1n`) — call once, single color.
- In `edgeMarkup`: `const card = edgeCardinalityAttrs(e);` then use
  `card.markerStart ?? geo.markerStart` / `card.markerEnd ?? geo.markerEnd`
  (cardinality replaces the arrowhead on that end; ERD edges should use
  `arrowhead: "none"`).

## 5. render/static-svg.ts — static variant
- `nodeMarkup`: `if (n.table) return renderTableStatic(n, themeName);`
  (pass the ThemeName through — it currently only receives ThemeTokens).
- Defs: `cardinalityMarkerDefs(color, THEMES[theme].canvas)` — the second arg
  bakes the ring knockout fill as a literal (static output must not contain
  `var(--`). Same `edgeCardinalityAttrs` override in `edgeMarkup`.

## 6. html.ts — optional theme overrides (dark polish)
Interactive colors are CSS vars with light fallbacks baked in; nothing is
required. For dark mode, add to the `[data-theme="dark"]` block:
`--table-head:#1D2739; --table-border:#2E3B50; --table-zebra:rgba(125,137,152,0.12);
--table-accent:#34D399; --table-fk:#38BDF8;`
Rows carry `class="table-row" data-col="<name>"` for future column-level
hover highlighting (interactions.ts can match against edge source/target
columns later; not required for parity).

## 7. Icons
No `scene.icons` entries needed: the table renderer inlines the lucide
`x.lucide-table2` / `x.lucide-key-round` glyphs via `loadIcon` (symbol defs
drop lucide root stroke attrs, so `<use>` is deliberately avoided).
