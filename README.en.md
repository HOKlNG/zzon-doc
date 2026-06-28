<p align="center">
  <a href="https://www.youtube.com/@김쫀떡">
    <img src="assets/zzon-ddeok.jpg" width="120" alt="Jjon-ddeok — the 김쫀떡 YouTube channel" />
  </a>
</p>

# zzon-doc — a Claude Code plugin marketplace

[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-plugin-d97757)](https://docs.claude.com/en/docs/claude-code/plugins) [![License: MIT](https://img.shields.io/badge/License-MIT-3da639)](./LICENSE) ![Zero dependencies](https://img.shields.io/badge/dependencies-0-2563eb)

[한국어](./README.md) · **English**

> A **Claude Code plugin (skill)** for Anthropic Claude Code that turns a codebase into interactive architecture diagrams.

A Claude Code plugin suite that reads your code and draws **interactive architecture diagrams**.
This repo is itself a plugin marketplace. Output is a **single, dependency-free `.html`** — open it in any browser, no server, library, or CDN required.

## Preview

| Unified docs (menu + overview) | Flow highlight (step badges + panel) |
|---|---|
| ![Unified docs](assets/integrated-doc.png) | ![Flow highlight](assets/diagram-flow.png) |

![Large ERD](assets/diagram-erd.png)

> The images above are rendered from the bundled samples. Every diagram is interactive HTML — click, hover, pan/zoom. (Diagram labels follow the language you author them in; the samples are in Korean.)

## Plugins

| Plugin | Description |
|---|---|
| [`zzon-doc`](./zzon-doc) | Reads a codebase, authors a DiagramSpec JSON, and renders it to a dependency-free interactive `.html`. Supports infra / data-flow / erd / agent-topology. |

## Install

Add this repo as a marketplace in Claude Code, then install the plugin.

```
/plugin marketplace add <owner>/<repo>     # or a local path
/plugin install zzon-doc@zzon
```

## Usage

Invoke explicitly with `/zzon-doc:zzon-doc <target>`, or just ask in natural language — the `zzon-doc` skill activates either way.
(Plugin skills are namespaced as `plugin:skill`, so the command is `/zzon-doc:zzon-doc`, not `/zzon-doc`.)

```
/zzon-doc:zzon-doc the infrastructure of this repo
/zzon-doc:zzon-doc an ERD from the prisma schema
visualize the .claude agent structure
```

Claude (1) reads the code and authors a DiagramSpec JSON, then (2) runs `render.mjs` to emit a single `.html`.

> For broad requests (e.g. "draw this whole project") it won't dump one giant diagram — it surveys the structure first and agrees with you on **what, at what level, and how many diagrams** before drawing.

### What the .html does

Click a node to highlight neighbors + detail panel · flow path highlight + step panel · **clickable step badges/steps** · **hover tooltips** · pan/zoom · legend · dark/light toggle.

### Many diagrams, one document

Draw several architectures and they accumulate into a **unified document**. Under the default output folder `zzon-doc/` you get specs (`specs/`), per-diagram HTML (`diagrams/`), and a unified `index.html`.
Open that one `index.html` to browse everything via a **left menu + overview home + viewer**.

## Direct rendering (optional)

You can render hand-written specs without the skill.

```bash
# a single .html
node zzon-doc/skills/zzon-doc/scripts/render.mjs <spec.json> [-o out.html]

# many specs -> unified document (zzon-doc/specs/*.json -> zzon-doc/index.html)
node zzon-doc/skills/zzon-doc/scripts/build-docs.mjs ./zzon-doc --title "My architecture docs"
```

Uses only Node 20+ built-in modules. Nothing to install.

## Requirements

- Claude Code (a version with plugin/skill support)
- Node.js 20+ (to run `render.mjs`)

## About the name

`zzon-doc` is named after **Jjon-ddeok** (쫀떡), a cat I love — the one from the YouTube channel [김쫀떡 (Kim Jjon-ddeok)](https://www.youtube.com/@김쫀떡). The cat's name romanizes to *zzon-ddeok*; since this tool is all about **doc**umentation and diagrams, the name became a little pun: *zzon-ddeok → zzon-doc*. 🐱

## License

[MIT License](./LICENSE) — free to use, modify, and redistribute, **including commercial use**, as long as the copyright and license notice are kept.

## Credits

Icons are inlined as SVG from [Lucide](https://lucide.dev) (ISC), a fork of [Feather Icons](https://github.com/feathericons/feather) (MIT). See [`NOTICE`](./NOTICE) for full attribution.
