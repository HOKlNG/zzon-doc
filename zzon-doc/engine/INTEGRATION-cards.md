# Integration: category cards + auto legend

New modules (self-contained, no edits to shared files):
`src/render/card.ts`, `src/render/legend.ts`, `examples/msa-sample.ts`, `tests/card.test.ts`.

## 1. Layout (src/layout/sizing.ts + compose.ts)

- When a `NodeEl` has `category` (and no `table`): size it with
  `sizeCard({ label, category, tech, description })` from `src/render/card.ts`
  → `{ width, height }` becomes the node's rect size. It throws on unknown
  categories — surface that as a validation-style error with the node's site.
- On the emitted `SceneNode`: set `role: "card"`, copy `category`, `tech`,
  `description`, `href`; set `label` (text is what card renderers use; they
  compute internal positions themselves) and NO `icon`/`iconRect`.
- Add `CARD_CATEGORY_META[category].icon` (import from card.ts — includes the
  supplemental "external" entry missing from categories.gen.ts) to
  `scene.icons`, and label/tech/description/labelKo strings to `scene.texts`.

## 2. Interactive SVG (src/render/svg.ts)

- In `nodeMarkup` (or the node loop of `renderInteractiveSvg`): when
  `n.category` is set, return `renderCardSvg(n, { interactive: true })`
  instead of the icon-node markup. Emits `class="node node-card"`,
  `data-path`, `data-href`, `data-meta` — existing hover/dim interactions
  keyed on `.node`/`data-path` keep working; interactions.ts may use
  `data-href` for drilldown later.

## 3. Static SVG (src/render/static-svg.ts)

- Same branch in its `nodeMarkup`: `renderCardStatic(n, theme)` — literal
  CATEGORY_COLORS_LIGHT/DARK palette, text as paths, no classes/vars.

## 4. HTML shell (src/render/html.ts)

- Append `cardCssVars("light")` into the `:root{...}` token block and
  `cardCssVars("dark")` into `:root[data-theme="dark"]{...}`, right next to
  `themeVars(...)` (same selector-less `--x:y;` format).
- Card/legend surfaces read `--card`, `--border`, `--muted`,
  `--muted-foreground` with light-theme fallbacks baked in; define dark
  values on `[data-theme="dark"]` (suggested: `--card:#1F2937;
  --border:#334155;--muted:#2B3648;--muted-foreground:#94A3B8;`).
- Append `LEGEND_CSS` (from legend.ts) to the stylesheet and
  `renderLegendHtml(scene)` into the positioned diagram wrapper (the
  element the SVG sits in; legend is `position:absolute; left/bottom:12px`).
  It returns `""` when the scene has nothing to list — safe to always append.
  No JS needed: collapse is a native `<details>`.

## 5. Example

`bun ia render examples/msa-sample.ts` once §1 lands — 6 category-only nodes
(gateway / 2 services / db / cache / external), 2 layers (http, data);
validates clean today (tests/card.test.ts covers it).
