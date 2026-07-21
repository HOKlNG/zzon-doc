<p align="center">
  <a href="https://www.youtube.com/@김쫀떡">
    <img src="assets/zzon-ddeok.jpg" width="120" alt="Jjon-ddeok — the 김쫀떡 YouTube channel" />
  </a>
</p>

# zzon-doc — a Claude Code plugin marketplace

[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-plugin-d97757)](https://docs.claude.com/en/docs/claude-code/plugins) [![License: MIT](https://img.shields.io/badge/License-MIT-3da639)](./LICENSE) ![Zero dependencies](https://img.shields.io/badge/dependencies-0-2563eb)

[한국어](./README.md) · **English**

> A **Claude Code plugin (three skills)** — it analyzes your codebase to draw interactive architecture diagrams (`zzon-doc`), draws time-axis sequence diagrams of key features (`zzon-seq`), and fills in a project documentation wiki through code scanning and interview-style questions (`zzon-wiki`). Everything ships as zero-dependency `.html` — just open it in a browser.

## Preview

| Unified docs (menu + overview) | Sequence diagram (`zzon-seq`) |
|---|---|
| ![Unified docs](assets/integrated-doc.png) | ![Sequence diagram](assets/diagram-seq.png) |

**Flow highlight** — click a flow button and the path lights up with **step badges (①②③)**, a **step strip**, and a **right-side step panel**.

![Flow highlight](assets/diagram-flow.png)

| ERD + detail sidebar (columns & FK links) | Documentation wiki (`zzon-wiki`) |
|---|---|
| ![ERD](assets/diagram-erd.png) | ![Documentation wiki](assets/wiki-home.png) |

> All rendered from the bundled samples/examples — zero-dependency single `.html` files opened in a browser (labels are in Korean).

## Features

- **5 diagram kinds** — infra · data-flow · **sequence** · ERD · agent (`.claude`) topology (with a type catalog: context, multi-region HA, data pipeline, full-depth landscape …)
- **Zero dependencies** — no libraries or CDN; a self-contained single `.html`
- **Interactive** — click nodes · highlight flows · step badges · drill-down (⊕ double-click) · hover tooltips · pan/zoom · dark mode · **SVG/PNG export** (pure vector)
- **Unified docs** — bundle many diagrams into a left menu + overview
- **Sequence diagrams (`zzon-seq`)** — traces code paths into actor lifelines over time: full/simplified toggle · per-step detail with source refs · step-through playback · alt/opt/loop/par fragments · SVG/PNG export
- **Docs wiki (`zzon-wiki`)** — fills project documentation via code scan + questions, tracks progress and open questions as a wiki site; architecture pages embed the diagrams
- **Scope-aware** — for big projects it surveys the structure and proposes how many docs and at which depth first
- **Local-only** — your code is analyzed locally; no network, no telemetry

## Install

```
/plugin marketplace add HOKlNG/zzon-doc
/plugin install zzon-doc@zzon
```

## Usage

Call it with `/zzon-doc:zzon-doc <request>`, or just ask in natural language. (Plugin skills are namespaced, so the command is `/zzon-doc:zzon-doc`; natural language works too.)

**① Whole-project architecture** — it surveys the structure first, **proposes what to draw and how many docs**, and once you agree, produces several diagrams bundled into a unified view (left menu + overview).

```
/zzon-doc:zzon-doc draw the architecture of this project
```

**② One specific part** — just that part, as a single diagram.

```
/zzon-doc:zzon-doc draw the cloud architecture of this repo
```

**③ Project documentation wiki** — agree on a tier (lite/standard/full SI) first; whatever is readable from code gets drafted automatically, and everything else is filled through questions. On re-runs it detects missing docs and human edits, and continues from there.

```
/zzon-doc:zzon-wiki build a docs wiki for this project
```

The generated `.html` is interactive: **click nodes · highlight flows · click step badges · hover tooltips · pan/zoom · dark mode.**

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
