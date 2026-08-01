/**
 * Sidebar data attributes — the canvas-side remnant of the old inline
 * sidebar. The detail sidebar itself (panel markup/CSS/JS, docs-shell
 * postMessage protocol, theme sync) is FRAME chrome now (viewer-frame
 * contract §2/§4): the frame derives node details and connections from the
 * payload, never from DOM scans.
 *
 * The data-* attributes stay on the SVG nodes as a debugging aid and as a
 * stable hook for headless verification — they mirror payload.nodes 1:1.
 */
import type { SceneNode } from "../layout/scene.ts";

/** Local XML/attribute escaper (svg.ts's escaper stays private to svg.ts). */
const escapeXml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/**
 * Extra attributes for a node's <g>: data-label / data-category / data-tech /
 * data-desc / data-href, each emitted only when present, values escaped.
 * Returns either "" or a string with a leading space, ready to concatenate
 * into the open tag right after data-path (svg.ts nodeMarkup).
 */
export function sidebarDataAttrs(n: SceneNode): string {
  const pairs: [name: string, value: string | undefined][] = [
    ["data-label", n.label?.text],
    ["data-category", n.category],
    ["data-tech", n.tech],
    ["data-desc", n.description],
    ["data-href", n.href],
  ];
  return pairs
    .filter((p): p is [string, string] => p[1] !== undefined && p[1] !== "")
    .map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
    .join("");
}
