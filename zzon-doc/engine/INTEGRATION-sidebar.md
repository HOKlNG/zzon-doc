# Wiring: detail sidebar + docs-shell protocol + theme sync

Module: `src/render/sidebar.ts` (self-contained; tests: `tests/sidebar.test.ts`).
Exports: `sidebarDataAttrs(n: SceneNode): string`, `SIDEBAR_HTML`, `SIDEBAR_CSS`, `SIDEBAR_JS`.

## 1. src/render/svg.ts — node data attributes

In `nodeMarkup(n)`, right after the `data-path` attribute (before the
`data-meta` line), append the sidebar attrs to the open tag:

```ts
import { sidebarDataAttrs } from "./sidebar.ts";
// inside nodeMarkup:
let open = `<g class="${cls}" data-path="${escapeXml(n.path)}"`;
open += sidebarDataAttrs(n);            // <— add this line
```

Returns `""` or ` data-label=... data-category=... data-tech=... data-desc=...
data-href=...` (only present fields, pre-escaped — do NOT re-escape).
Interactive variant only; static-svg strips data-* already, leave it alone.

## 2. src/render/html.ts — CSS, markup, script

```ts
import { SIDEBAR_CSS, SIDEBAR_HTML, SIDEBAR_JS } from "./sidebar.ts";
```

- `buildCss(...)`: append `SIDEBAR_CSS` as the last entry of the joined array.
  Its `--panel-top` defaults to 48px = current `#ia-toolbar` height; override
  the var if the toolbar height ever changes.
- Body array: insert `SIDEBAR_HTML` on its own line right after the
  `` `<main>${svg}</main>` `` entry (panel is position:fixed, placement in
  body order is otherwise free).
- Scripts: add `` `<script>${SIDEBAR_JS}</script>` `` next to the existing
  INTERACTION_JS script tag. Order is safe either way (interactions.ts only
  stamps `data-theme` when absent; SIDEBAR_JS always stamps the stored value)
  — put it AFTER INTERACTION_JS for determinism.
- Font subsetting: extend `UI_TEXT` with the sidebar chrome glyphs:
  `"Connections Details: ()×→←"`. Node label/desc/category/tech glyphs must be
  in `scene.texts` (compose already collects label text; whoever wires
  category/tech/description into the scene must also push them into `texts`).

## 3. Behavior contract (for the shell owner)

- iframe -> parent: `{type:"zzon:navigate", slug}` (dblclick node with
  data-href, or the sidebar Details link, when slug matches
  `/^[a-z0-9_-]+$/` after stripping `.html`; full URLs use
  `window.open(_blank)`; unframed slugs go to `slug + ".html"`).
- iframe -> parent: `{type:"zzon:sidebar", open:boolean}` on every
  open/close; parent -> iframe `{type:"zzon:sidebar-close"}` closes it.
- Theme: boots from localStorage `"zzon-theme"` (`"light"|"dark"`, fallback
  prefers-color-scheme) onto `<html data-theme>`; `window.__zzonSetTheme(t)`
  stamps + persists; `storage` events sync sibling iframes. Recommended
  follow-up (owner of interactions.ts): make the `#ia-theme` button call
  `window.__zzonSetTheme(next)` so manual toggles persist too.

## 4. Verify

`bun test tests/sidebar.test.ts` (10 pass) and open any rendered html:
click node -> panel slides in; connections list navigates; Esc closes.
