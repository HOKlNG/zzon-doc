<p align="center">
  <a href="https://www.youtube.com/@김쫀떡">
    <img src="assets/zzon-ddeok.jpg" width="120" alt="Jjon-ddeok — the 김쫀떡 YouTube channel" />
  </a>
</p>

<h1 align="center">zzon-doc</h1>

<p align="center">
  A Claude Code plugin that analyzes your codebase and produces architecture, state machine, flowchart, dependency, and sequence diagrams — plus a docs wiki.<br />
  Everything ships as a zero-dependency single <code>.html</code> — just open it in a browser.
</p>

<p align="center">
  <a href="https://docs.claude.com/en/docs/claude-code/plugins"><img src="https://img.shields.io/badge/Claude_Code-plugin-d97757" alt="Claude Code Plugin" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-3da639" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/output_dependencies-0-2563eb" alt="Zero-dependency output" />
</p>

<p align="center">
  <a href="./README.md">한국어</a> · <b>English</b>
</p>

## Introduction

**zzon-doc** adds four documentation skills to Claude Code. It reads your source, authors diagram specs and documents, and renders them as **self-contained single `.html` files** — no server, no libraries, no CDN.

| Skill | What it does |
|---|---|
| **zzon-doc** | The main diagram skill. It counts facts in your code to decide **what to draw (13 views) and how dense (3 tiers)**, and only ships diagrams that pass a quality gate. When code changes, it finds the stale diagrams and updates them |
| **zzon-seq** | Traces a feature's code path and draws actor-to-actor request/response over time |
| **terra-form** | Reads Terraform (`*.tf`) and draws cloud infrastructure with official AWS icons |
| **zzon-wiki** | Builds a project documentation wiki, filled by code scanning and interview-style questions |

## Preview

| Unified docs (menu + overview) | Sequence diagram (zzon-seq) |
|---|---|
| ![Unified docs](assets/integrated-doc.png) | ![Sequence diagram](assets/diagram-seq.png) |

Click a flow button and the path lights up with **step badges (①②③)**, a **step strip**, and a **right-side step panel**.

![Flow highlight](assets/diagram-flow.png)

| ERD + detail sidebar (columns & FK links) | Documentation wiki (zzon-wiki) |
|---|---|
| ![ERD](assets/diagram-erd.png) | ![Documentation wiki](assets/wiki-home.png) |

| State machine (UML, self-loops, internal activities) | Flowchart (decisions, exception branches) |
|---|---|
| ![State machine](assets/diagram-state.png) | ![Flowchart](assets/diagram-flowchart.png) |

| Domain model (classes, composition, inheritance) | Module dependencies (extracted from imports, shared modules split out) |
|---|---|
| ![Domain model](assets/diagram-class.png) | ![Module dependencies](assets/diagram-deps.png) |

The same resources can be drawn **twice — a big picture and a detailed view**. The big picture is folded from the detailed model, and double-clicking a folded node drills down into the detail.

| Big picture (folded by account and OU) | Detailed view (every resource) |
|---|---|
| ![Big picture](assets/diagram-overview.png) | ![Detailed view](assets/diagram-detail.png) |

| Azure architecture (official and Kubernetes icons) | On a phone: wiki, information architecture, storyboard, diagram |
|---|---|
| ![Azure](assets/diagram-azure.png) | ![Responsive](assets/responsive.png) |

> All rendered from the bundled samples and examples — zero-dependency single `.html` files opened in a browser (labels are in Korean).

### Coming next — screen and design documents

An extension that adds screen design to "write up the dev docs" is in progress. The pages below are an example built for a fictional shopping app; they are not in the skills yet. The design is in [`proposals/dev-docs-extension.md`](./proposals/dev-docs-extension.md).

| Information architecture (launch branches, route tree, screen thumbnails) | Screen design (wireframe and spec) |
|---|---|
| ![Information architecture](assets/devdocs-ia.png) | ![Screen design](assets/devdocs-screens.png) |

| Storyboard (frames per flow, numbered tap targets) | Design token sheet |
|---|---|
| ![Storyboard](assets/devdocs-storyboard.png) | ![Design tokens](assets/devdocs-tokens.png) |

## Features

- **13 views** — context, container, component, deployment/infra, data flow, ERD, **state machine, flowchart, module dependencies, screen flow, domain model (classes)**, agent topology, and sequence.
- **Objective selection** — the view is chosen from request wording plus facts counted in your code (tables, routes, IaC resources, status enums, screens, modules), and the density tier — **overview (≤9), standard (≤20), reference (≤50)** — from the reader and the medium. Overflow is cut in a fixed order and reported.
- **Quality gate** — beyond overlaps it measures crossings, label occlusion, bends, color count, and flow direction, and checks **notation semantics** such as state reachability and labelled flowchart branches.
- **No silent staleness** — every diagram records hashes of the files it was drawn from; after code changes, "re-scan" tells you exactly which diagrams went stale and why.
- **Machine-extracted dependency graphs** — module graphs are generated from import statements (JS/TS, Python, Go, Java/Kotlin); cycles are drawn in red.
- **Big picture vs. detail** — node count and audience decide whether one diagram is enough or a big picture should accompany it. The big picture is folded from the detailed model and drills down into it.
- **Canvases that avoid overlapping lines** — when lines run on top of each other or labels are hidden, the layout is retried with wider spacing and the cleanest result is kept; clean diagrams keep their original size. A layout guide for authors is included.
- **One design, responsive** — the unified docs, wiki, diagram viewer, and sequence viewer share the same colors, font (Pretendard), and controls. On phones the menu becomes a drawer, details open as a bottom sheet, and you can pinch to zoom.
- **Zero-dependency output** — a self-contained single `.html` with no libraries or CDN.
- **Interactive viewer** — click nodes, highlight flows, step badges, drill-down (⊕ double-click), hover tooltips, pan/zoom, dark mode, and pure-vector SVG/PNG export.
- **Unified docs** — bundles many diagrams into one docs site with a left menu and an overview.
- **Sequence diagrams** — full/simplified toggle, per-step detail with source refs, step-through playback, and alt/opt/loop/par fragments.
- **Terraform infra** — bundles 838 official AWS icons, 636 official Azure icons, 39 Kubernetes icons, and 125 SAP BTP icons. Clouds whose icons may not be redistributed (such as GCP) render as category cards. Nothing extra to download.
- **Docs wiki** — generates a wiki site that tracks progress and open questions; architecture pages embed the diagrams.
- **Scope-aware** — for large projects it surveys the structure first and proposes how many diagrams at which depth.
- **Local-only** — your code is analyzed locally, with zero network requests and zero telemetry.

## Getting Started

### Requirements

- Claude Code (a version with plugin/skill support)
- Node.js 20+ — runs the build scripts
- [bun](https://bun.sh) — runs the diagram engine. **Required for newly authored structure/infra diagrams and terra-form.** Without it, only legacy DiagramSpec JSON rendering, sequence diagrams, and the wiki keep working (automatic fallback)

### Installation

```
/plugin marketplace add HOKlNG/zzon-doc
/plugin install zzon-doc@zzon
```

Set up the diagram engine once:

```bash
cd zzon-doc/engine && bun install
```

## Usage

Call `/zzon-doc:zzon-doc <request>`, or just ask in natural language. (Plugin skills are namespaced as `plugin:skill`.)

**① Whole-project architecture** — surveys the structure first, **proposes what to draw and how many diagrams**, and once you agree, bundles them into a unified view (left menu + overview).

```
/zzon-doc:zzon-doc draw the architecture of this project
```

**② One specific part** — just that part, as a single diagram.

```
/zzon-doc:zzon-doc draw the cloud architecture of this repo
```

**③ Feature sequence diagram** — traces a feature's code path (route → service → queue → worker) into a time-axis sequence.

```
/zzon-doc:zzon-seq draw a sequence diagram of the checkout flow
```

**④ Terraform infra** — reads `*.tf` and draws the cloud infrastructure. AWS and Azure use their official icons, Kubernetes and SAP have their own icon sets, and other clouds render as category cards.

```
/zzon-doc:terra-form ./infra
```

**⑤ State machines, flowcharts, dependencies** — name the view, or let the selection rubric decide.

```
/zzon-doc:zzon-doc draw the order state machine
/zzon-doc:zzon-doc draw the refund policy as a flowchart
/zzon-doc:zzon-doc draw the module dependency graph
```

**⑥ Updating after code changes** — stale diagrams are found from source hashes first, then only the changed files are re-read.

```
/zzon-doc:zzon-doc the code changed a lot — bring the diagrams up to date
```

**⑦ Project documentation wiki** — agree on a tier (lite/standard/full SI) first; whatever is readable from code gets drafted automatically, and the rest is filled through questions. On re-runs it detects missing docs and human edits, and continues from there.

```
/zzon-doc:zzon-wiki build a docs wiki for this project
```

The generated `.html` is interactive: **click nodes, highlight flows, step badges, hover tooltips, pan/zoom, dark mode.**

### Output location

All output (specs, diagrams, wiki state) lands under **`docs/zzon-doc/`** in the target project. If a root-level `zzon-doc/` folder from an earlier version already exists, it keeps being used.

## Direct rendering (optional)

You can also render hand-written specs without the skills.

```bash
# a single .html
node zzon-doc/skills/zzon-doc/scripts/render.mjs <spec.json> [-o out.html]

# many specs -> unified docs (docs/zzon-doc/specs/*.json -> docs/zzon-doc/index.html)
node zzon-doc/skills/zzon-doc/scripts/build-docs.mjs ./docs/zzon-doc --title "My architecture docs"

# which diagrams went stale after code changes (read-only)
node zzon-doc/skills/zzon-doc/scripts/build-docs.mjs ./docs/zzon-doc --status

# code facts, dependency generation, quality gate
node zzon-doc/skills/zzon-doc/scripts/scan.mjs <project>
node zzon-doc/skills/zzon-doc/scripts/scan-deps.mjs <project> --out ./docs/zzon-doc/terra/deps.ts
cd zzon-doc/engine && bun ia check ../../docs/zzon-doc/terra/deps.ts
```

The build scripts use only Node 20+ built-in modules. Structure diagrams are rendered by the built-in engine (bun); without bun it falls back to the legacy renderer **for legacy DiagramSpec JSON only**. Either way the output `.html` is self-contained with zero external requests.

## What's new

- **v0.9.1 — AWS tech-blog writing style, style checks, better initial fit**: Generated documents now follow the style of the AWS technical blogs: polite declarative Korean body text and a fixed outline from overview to related resources. Decision records and ticket numbers stay out of sentences and appear only as named links in a final related-resources section. The quality gate and the wiki status check count tracking codes and dash-joined sentences left in titles, labels, and body text. The first fit keeps the legend and flow buttons off the drawing, the spacing retry no longer stretches a diagram far past its target aspect, ERD headers drop the column count, and the big-picture decision now counts nodes inside grid layouts. Big pictures merge parallel lines and drop shortcut lines to stay within the line budget, and the wiki shows a diagram's big picture right before it. Long top-to-bottom flowcharts open at a readable size from the top, and PNG export no longer cuts labels short.
- **v0.9.0 — main diagram skill, objective selection, five notation views**: zzon-doc is now the main skill for diagram requests. A code-fact scan and a selection rubric decide the view and density tier, and every diagram must pass a quality gate (readability metrics plus notation semantics). New views: **state machine, flowchart, module dependencies, screen flow, domain model**. Each diagram records the files it was drawn from, so stale diagrams are flagged after code changes. Layout improved substantially (author column hints, restored legacy lanes, same-column C-detours, labels that avoid other lines, text-like row wrapping), and the engine no longer hangs on Windows. Every page now shares one design token set and is responsive at 390, 768, and 1440 px. State machines, flowcharts, and module dependencies use the same cards as architecture diagrams, and this release adds the big-picture/detail decision with automatic folding, overlap measurement with spacing retries, Azure, Kubernetes, and SAP icons, and reader-facing writing rules.
- **v0.8.3 — viewer bug fixes, authoring policy**: fixed node clicks not opening the detail sidebar (pointer capture retargeted clicks to the svg root) and flow highlights lingering after deselection. Authoring policy was also tightened — prose goes into the node `description` (right sidebar) instead of onto the canvas, and structure diagrams now include one or two representative flows by default.
- **v0.8.2 — vocabulary policy, sequence catalog slots, flow label quality**: terra-form now covers cloud infrastructure in general (IaC-based). A legacy DiagramSpec can opt into the cloud icon vocabulary with a single `"vocabulary": "aws"` line (mixing is blocked by the validator), and the zzon-wiki catalog gained core-process sequence slots (seq-flows) so sequence diagrams come up automatically at the proposal stage. Dense-flow edge labels (corridor-width adaptive, pill rendering) and step-focus highlighting were improved.
- **v0.8.1 — unified diagram engine**: structure and data diagrams (infra/data-flow/erd/agent-topology) are rendered by a **built-in TS engine** — true auto-layout (ELK), orthogonal routing, and overlap/crossing invariants, while the viewer keeps the existing UX (sidebar, flows, legend, theme). Existing DiagramSpec JSON renders as-is through a built-in converter; the legacy renderer stays available via `ZZON_LEGACY_RENDER=1` or `"renderer": "legacy"` in the spec.

## About the name

`zzon-doc` is named after **Jjon-ddeok** (쫀떡), a cat I love — the one from the YouTube channel [김쫀떡 (Kim Jjon-ddeok)](https://www.youtube.com/@김쫀떡). The cat's name romanizes to *zzon-ddeok*; since this tool is all about **doc**umentation and diagrams, the name became a little pun: *zzon-ddeok → zzon-doc*. 🐱

## License

The project's code is licensed under the [MIT License](./LICENSE) — free to use, modify, and redistribute, **including commercial use**, as long as the copyright and license notice are kept.

Third-party assets bundled in this repository are not covered by the MIT License and keep their own terms: the AWS and Azure Architecture Icons, the Kubernetes and SAP icon sets (Apache-2.0), the Pretendard font (SIL OFL 1.1), CNCF project logos and the Karpenter icon. See [`NOTICE`](./NOTICE) for details.

## Acknowledgments

UI icons are inlined as SVG from [Lucide](https://lucide.dev) (ISC), a fork of [Feather Icons](https://github.com/feathericons/feather) (MIT). The typeface is [Pretendard](https://github.com/orioncactus/pretendard) (SIL OFL 1.1), and cloud icons are the unmodified [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/). See [`NOTICE`](./NOTICE) for full attribution.
